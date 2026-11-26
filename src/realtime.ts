import { users, tasks, comments, attachments, clipboard, isProfile } from './data';
import {
    createTask, patchTask, cascadeParents, deleteTask, addComment, deleteComment, deleteAttachment,
    setSeen, seenOf, UserError,
} from './diario';
import { upsert, remove, broadcastPresence, initSocketData, socketsOf, getIo, type AppSocket } from './hub';
import { unlinkFile } from './files';
import { log, error } from './log';

type Ack = (r: { ok: boolean; error?: string; message?: string;[k: string]: unknown }) => void;
const ackOf = (a: unknown): Ack => (typeof a === 'function' ? a as Ack : () => { });

/** Esegue un comando del diario: serve un profilo; gli errori tornano nell'ack. */
function command(s: AppSocket, name: string, fn: (profile: string, payload: any) => Record<string, unknown> | void) {
    s.on(name, (payload: unknown, ack: unknown) => {
        const reply = ackOf(ack);
        try {
            const profile = s.data.profile;
            if (!profile || !isProfile(profile)) throw new UserError('no_profile');
            reply({ ok: true, ...(fn(profile, payload) || {}) });
        } catch (e) {
            if (e instanceof UserError) reply({ ok: false, error: e.code, message: e.message });
            else { error(`Errore in ${name}:`, e); reply({ ok: false, error: 'error' }); }
        }
    });
}

const sendDiario = (s: AppSocket) => {
    s.emit('diario:init', { me: s.data.profile, users: users.all(), tasks: tasks.all(), comments: comments.all(), attachments: attachments.all() });
    if (s.data.profile) s.emit('diario:seen', seenOf(s.data.profile));
};

export function onConnection(s: AppSocket) {
    initSocketData(s);   // il profilo viene dall'IP: niente scelta lato client
    log(`Client connesso: ${s.id} (IP: ${s.data.ip} · ${s.data.ipName}${s.data.profile ? ' · ' + s.data.profile : ''})`);

    s.emit('clip:init', clipboard.data);
    sendDiario(s);
    broadcastPresence();

    // Dopo una scrittura rifiutata il client chiede di nuovo tutti i dati.
    s.on('diario:sync', () => sendDiario(s));

    /* ---------- appunti ---------- */
    s.on('clip:text', (text: unknown) => {
        if (typeof text !== 'string') return;
        clipboard.data.text = text;
        clipboard.save();
        s.broadcast.emit('clip:text', text);
    });

    s.on('clip:upload_started', (d: any) => {
        if (!d || typeof d.tempId !== 'string') return;
        const tempId = d.tempId.slice(0, 64);
        s.data.uploads.add(tempId);
        s.broadcast.emit('clip:upload_started', {
            tempId, name: String(d.name ?? '').slice(0, 200), size: Number(d.size) || 0,
            by: s.data.profile ? users.get(s.data.profile)?.name : s.data.ipName,
        });
    });

    s.on('clip:upload_progress', (d: any) => {
        if (!d || typeof d.tempId !== 'string' || !s.data.uploads.has(d.tempId)) return;
        s.broadcast.emit('clip:upload_progress', {
            tempId: d.tempId,
            loaded: Number(d.loaded) || 0, total: Number(d.total) || 0, speed: Number(d.speed) || 0,
        });
    });

    s.on('clip:upload_cancel', (d: any) => {
        if (!d || typeof d.tempId !== 'string' || !s.data.uploads.delete(d.tempId)) return;
        s.broadcast.emit('clip:upload_cancel', { tempId: d.tempId });
    });

    s.on('clip:delete_file', (id: unknown) => {
        const files = clipboard.data.files, i = files.findIndex(f => f.id === id);
        if (i < 0) return;
        const [f] = files.splice(i, 1);
        clipboard.save();
        unlinkFile(f!.id);
        getIo().emit('clip:file_deleted', f!.id);
        log(`File eliminato dagli appunti: ${f!.name} da ${s.data.ipName}`);
    });

    /* ---------- diario ---------- */
    command(s, 'task:create', (by, p) => {
        const t = createTask(p || {}, by);
        upsert('tasks', [t]);
        return { task: t };
    });

    command(s, 'task:patch', (by, p) => {
        const prev = typeof p?.id === 'string' ? tasks.get(p.id)?.status : undefined;
        const t = patchTask(p?.id, p?.patch, by);
        // Cambio di stato di un sottotask: il padre si chiude (o si riapre) da solo.
        upsert('tasks', [t, ...(t.status !== prev ? cascadeParents(t, by) : [])]);
    });

    command(s, 'task:delete', (_by, p) => {
        const rm = deleteTask(p?.id);
        remove('tasks', rm.tasks);
        remove('comments', rm.comments);
        remove('attachments', rm.attachments);
        rm.attachments.forEach(unlinkFile);
        log(`Eliminati ${rm.tasks.length} task (${rm.comments.length} note, ${rm.attachments.length} allegati) da ${s.data.profile}`);
    });

    command(s, 'comment:add', (by, p) => {
        const c = addComment(p || {}, by);
        upsert('comments', [c]);
    });

    command(s, 'comment:delete', (by, p) => {
        remove('comments', [deleteComment(p?.id, by)]);
    });

    command(s, 'attachment:delete', (_by, p) => {
        const id = deleteAttachment(p?.id);
        remove('attachments', [id]);
        unlinkFile(id);
    });

    command(s, 'seen:set', (by, p) => {
        const mine = setSeen(by, p?.taskId, p?.at);
        for (const o of socketsOf(by)) if (o.id !== s.id) o.emit('diario:seen', mine);
    });

    s.on('disconnect', () => {
        log(`Client disconnesso: ${s.id}`);
        // Upload Appunti lasciati a metà: gli altri tolgono la scheda "in caricamento".
        for (const tempId of s.data.uploads) s.broadcast.emit('clip:upload_cancel', { tempId });
        broadcastPresence();
    });
}
