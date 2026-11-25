import type { Server, Socket } from 'socket.io';
import { users } from './data';
import { getClientIp, ipName } from './access';

/* Riferimento condiviso a Socket.IO e messaggi in broadcast. */

export interface SocketData {
    ip: string;
    ipName: string;
    profile: string | null;     // profilo scelto in questa scheda ("Chi sei?")
    uploads: Set<string>;       // tempId degli upload Appunti in corso da questa scheda
}
export type AppSocket = Socket<any, any, any, SocketData>;
export type Collections = 'users' | 'tasks' | 'comments' | 'attachments';

let io: Server<any, any, any, SocketData>;
export const setIo = (s: Server<any, any, any, SocketData>) => { io = s; };
export const getIo = () => io;

export function upsert(col: Collections, docs: unknown[]) { if (docs.length) io.emit('diario:upsert', { col, docs }); }
export function remove(col: Collections, ids: string[]) { if (ids.length) io.emit('diario:remove', { col, ids }); }

/** Chi carica, per i file degli Appunti: il profilo se è entrato, altrimenti il nome dell'IP. */
export function whoIs(profile: string | null, ip: string) {
    const u = profile ? users.get(profile) : undefined;
    return { uploadedBy: u ? u.id : null, uploaderName: u ? u.name : ipName(ip) };
}

export function presence() {
    return [...io.sockets.sockets.values()].map(s => {
        const d = s.data as SocketData, u = d.profile ? users.get(d.profile) : undefined;
        return { id: s.id, name: u ? u.name : d.ipName, profileId: u ? u.id : null };
    });
}
export const broadcastPresence = () => io.emit('presence', presence());

export function initSocketData(s: AppSocket) {
    const ip = getClientIp(s.request);
    s.data.ip = ip;
    s.data.ipName = ipName(ip);
    s.data.profile = null;
    s.data.uploads = new Set();
}

/** Schede aperte con un certo profilo (per sincronizzare le note lette). */
export const socketsOf = (profile: string) => [...io.sockets.sockets.values()].filter(s => (s.data as SocketData).profile === profile);
