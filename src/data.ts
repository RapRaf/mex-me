import path from 'path';
import { DATA_DIR, KNOWN_IPS } from './config';
import { Collection, JsonFile } from './store';
import { log } from './log';

/* Modello dati. Tutti gli id utente (assigneeId, createdBy, authorId…) sono id di `users`. */

export type Status = 'todo' | 'doing' | 'done';

export interface User {
    id: string;
    name: string;
    c: number;          // indice colore persona
    order: number;
    active: boolean;
    createdAt: string;
    auto?: boolean;     // creato da un nome di KNOWN_IPS (si può rimuovere se il nome sparisce)
}

/** Task e sottotask in una sola tabella auto-referenziata. */
export interface Task {
    id: string;
    title: string;
    notes: string;
    status: Status;
    parentId: string | null;   // null = task principale
    rootId: string;            // task principale del ramo (per un principale = il suo id)
    depth: number;             // 0 principale, 1 sottotask, …
    startDate: string | null;  // YYYY-MM-DD (data locale)
    endDate: string | null;
    order: number;             // ordine tra fratelli
    assigneeId: string | null;
    createdBy: string;
    updatedBy: string;
    createdAt: string;
    updatedAt: string;
    completedAt: string | null;
    priority?: 'high' | 'med' | 'low';  // vista Priorità; assente = med
    label?: string | null;              // vista Priorità
    prioOrder?: number;                 // ordine nella colonna; assente = order
    bugId?: string;                     // bug da cui è nato il task (vedi Bug)
}

/**
 * Bug segnalato. Chi lo conferma lo trasforma in un task "Da fare" assegnato a sé
 * (label "bug"); gli allegati del bug passano al task.
 */
export interface Bug {
    id: string;
    title: string;
    text: string;
    status: 'open' | 'confirmed' | 'rejected';   // da revisionare, confermato, scartato
    reportedBy: string;
    createdAt: string;
    updatedAt: string;
    reviewedBy: string | null;    // chi l'ha confermato o scartato
    reviewedAt: string | null;
    taskId: string | null;        // task creato alla conferma
}

/** Nota del team: un messaggio della chat di un task. */
export interface Comment {
    id: string;
    taskId: string;
    rootId: string;
    text: string;
    authorId: string;
    createdAt: string;
}

/** File allegato a un task. L'id coincide con quello del file in data/uploads. */
export interface Attachment {
    id: string;
    taskId: string;     // '' finché è l'allegato di un bug non ancora confermato
    rootId: string;
    bugId?: string;     // allegato caricato su un bug
    name: string;
    contentType: string;
    sizeBytes: number;
    uploadedBy: string;
    createdAt: string;
}

/** File condiviso negli Appunti. L'id coincide con quello del file in data/uploads. */
export interface ClipFile {
    id: string;
    name: string;
    size: number;
    contentType: string;
    uploadedBy: string | null;  // profilo, se chi carica è entrato
    uploaderName: string;       // nome mostrato (profilo o nome dell'IP)
    createdAt: string;
}

export interface Clipboard { text: string; files: ClipFile[] }

const file = (n: string) => path.join(DATA_DIR, n);

export const users = new Collection<User>(file('users.json'));
export const tasks = new Collection<Task>(file('tasks.json'));
export const comments = new Collection<Comment>(file('comments.json'));
export const attachments = new Collection<Attachment>(file('attachments.json'));
export const bugs = new Collection<Bug>(file('bugs.json'));
/** Note lette: {profilo: {taskId: createdAt dell'ultima nota vista}} */
export const seen = new JsonFile<Record<string, Record<string, string>>>(file('seen.json'), () => ({}));
export const clipboard = new JsonFile<Clipboard>(file('clipboard.json'), () => ({ text: '', files: [] }));

/* ---------- profili legati agli IP ---------- */

const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'utente';
let ipProfile = new Map<string, string>();

/** Profilo di chi si collega da un IP (null = IP senza profilo). */
export const profileOfIp = (ip: string): string | null => ipProfile.get(ip) ?? null;

/**
 * I profili vengono dai nomi di KNOWN_IPS: ogni nome è una persona, più IP con
 * lo stesso nome sono la stessa persona (es. PC e telefono). Un nome si lega al
 * profilo con lo stesso id o lo stesso nome; se non c'è, il profilo viene creato.
 * Un profilo creato così e poi sparito da KNOWN_IPS si rimuove, se nessun task o nota lo usa.
 */
export function syncProfilesFromIps() {
    const now = new Date().toISOString(), map = new Map<string, string>(), linked = new Set<string>();
    const all = () => users.all();
    for (const [ip, rawName] of Object.entries(KNOWN_IPS)) {
        const name = String(rawName ?? '').trim();
        if (!name) continue;
        const key = name.toLowerCase();
        let u = all().find(x => x.id === slug(name) || x.name.toLowerCase() === key);
        if (!u) {
            // Colore persona: il primo libero (indice di COLORS in public/js/util.js).
            const used = new Set(all().map(x => x.c));
            let id = slug(name), n = 2;
            while (users.has(id)) id = slug(name) + '-' + n++;
            u = users.set({
                id, name, c: [...Array(8).keys()].find(i => !used.has(i)) ?? all().length % 8,
                order: Math.max(0, ...all().map(x => x.order || 0)) + 1, active: true, createdAt: now, auto: true,
            });
            log(`Creato il profilo ${name} (da KNOWN_IPS)`);
        } else if (u.active === false) {
            u = users.set({ ...u, active: true });
        }
        map.set(ip, u.id);
        linked.add(u.id);
    }
    // Profili creati automaticamente e non più in KNOWN_IPS, mai usati: via.
    // Mai con KNOWN_IPS vuota (accesso libero o .env illeggibile): non si tocca niente.
    if (map.size) {
        const usedIds = new Set<string>();
        for (const t of tasks.all()) for (const k of [t.assigneeId, t.createdBy, t.updatedBy]) if (k) usedIds.add(k);
        for (const c of comments.all()) usedIds.add(c.authorId);
        for (const a of attachments.all()) usedIds.add(a.uploadedBy);
        for (const b of bugs.all()) for (const k of [b.reportedBy, b.reviewedBy]) if (k) usedIds.add(k);
        for (const u of all()) {
            if (u.auto && !linked.has(u.id) && !usedIds.has(u.id)) { users.delete(u.id); log(`Rimosso il profilo ${u.name} (non più in KNOWN_IPS)`); }
        }
    }
    ipProfile = map;
    const unlinked = all().filter(u => !linked.has(u.id)).map(u => u.name);
    if (unlinked.length) log(`Profili senza IP in KNOWN_IPS (restano assegnabili): ${unlinked.join(', ')}`);
}

export const isProfile = (id: unknown): id is string => typeof id === 'string' && !!users.get(id) && users.get(id)!.active !== false;
