import crypto from 'crypto';
import { tasks, comments, attachments, seen, users, type Task, type Comment, type Attachment } from './data';

/* Regole del diario (task, sottotask, note, allegati). Il server è l'autorità:
   valida ogni scrittura, mette autore e orari, elimina a cascata. */

export class UserError extends Error {
    constructor(readonly code: 'bad_request' | 'not_found' | 'forbidden' | 'no_profile', msg?: string) { super(msg || code); }
}

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
export const newId = () => crypto.randomBytes(12).toString('base64url');
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !isNaN(Date.parse(v));
const STATUSES = ['todo', 'doing', 'done'];
const PRIOS = ['high', 'med', 'low'];
const bad = (m: string) => new UserError('bad_request', m);

function freshId(id: unknown, exists: (id: string) => boolean): string {
    return typeof id === 'string' && ID_RE.test(id) && !exists(id) ? id : newId();
}

function title(v: unknown): string {
    const s = typeof v === 'string' ? v.trim().slice(0, 200) : '';
    if (!s) throw bad('titolo mancante');
    return s;
}

/** Campi modificabili di un task e loro validazione. */
const FIELDS: Record<string, (v: unknown) => unknown> = {
    title,
    notes: v => { if (typeof v !== 'string') throw bad('notes'); return v.slice(0, 5000); },
    status: v => { if (!STATUSES.includes(v as string)) throw bad('status'); return v; },
    startDate: v => { if (v !== null && !isDate(v)) throw bad('startDate'); return v; },
    endDate: v => { if (v !== null && !isDate(v)) throw bad('endDate'); return v; },
    completedAt: v => { if (v !== null && !isIso(v)) throw bad('completedAt'); return v; },
    assigneeId: v => { if (v !== null && !(typeof v === 'string' && users.has(v))) throw bad('assigneeId'); return v; },
    priority: v => { if (!PRIOS.includes(v as string)) throw bad('priority'); return v; },
    label: v => { if (v !== null && !(typeof v === 'string' && /^[a-z0-9_-]{1,30}$/.test(v))) throw bad('label'); return v; },
    prioOrder: v => { if (typeof v !== 'number' || !Number.isFinite(v)) throw bad('prioOrder'); return v; },
};

export function createTask(input: { id?: unknown; title?: unknown; parentId?: unknown }, by: string): Task {
    const t = title(input.title);
    let par: Task | undefined;
    if (input.parentId != null) {
        par = typeof input.parentId === 'string' ? tasks.get(input.parentId) : undefined;
        if (!par) throw new UserError('not_found', 'il task padre non esiste più');
    }
    const id = freshId(input.id, i => tasks.has(i));
    const now = new Date().toISOString();
    return tasks.set({
        id, title: t, notes: '', status: 'todo',
        parentId: par ? par.id : null,
        rootId: par ? (par.rootId || par.id) : id,
        depth: par ? (par.depth | 0) + 1 : 0,
        startDate: null, endDate: null, order: Date.now(),
        assigneeId: by, createdBy: by, updatedBy: by,
        createdAt: now, updatedAt: now, completedAt: null,
    });
}

export function patchTask(id: unknown, patch: unknown, by: string): Task {
    const t = typeof id === 'string' ? tasks.get(id) : undefined;
    if (!t) throw new UserError('not_found', 'task inesistente');
    if (!patch || typeof patch !== 'object') throw bad('patch');
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
        const check = FIELDS[k];
        if (!check) throw bad('campo non modificabile: ' + k);
        out[k] = check(v);
    }
    return tasks.set({ ...t, ...out, updatedAt: new Date().toISOString(), updatedBy: by } as Task);
}

/** Data di oggi in ora locale (YYYY-MM-DD). */
function localDay(): string {
    const d = new Date(), p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Stato dei padri dopo che `t` ha cambiato stato, risalendo l'albero:
 * - tutti i sottotask fatti ⇒ il padre diventa Fatto (con fine, inizio e completedAt come a mano);
 * - un sottotask riaperto sotto un padre fatto ⇒ il padre torna In corso.
 * Ritorna i padri modificati (da mandare a tutti). Stessa regola, come previsione, in public/js/net.js.
 */
export function cascadeParents(t: Task, by: string): Task[] {
    const out: Task[] = [];
    let cur = t;
    for (let g = 0; g < 60 && cur.parentId && cur.parentId !== cur.id; g++) {
        const p = tasks.get(cur.parentId);
        if (!p) break;
        const kids = tasks.all().filter(x => x.parentId === p.id && x.id !== p.id);
        const allDone = kids.length > 0 && kids.every(x => x.status === 'done');
        const now = new Date().toISOString(), day = localDay();
        let patch: Partial<Task>;
        if (allDone && p.status !== 'done') {
            patch = { status: 'done', endDate: p.endDate || day, startDate: p.startDate || day, completedAt: now };
        } else if (!allDone && p.status === 'done' && cur.status !== 'done') {
            patch = { status: 'doing', completedAt: null };
        } else break;
        cur = tasks.set({ ...p, ...patch, updatedAt: now, updatedBy: by });
        out.push(cur);
    }
    return out;
}

/** Figli diretti per id del padre (un parentId che punta a un task inesistente = principale). */
function childrenMap(): Map<string, Task[]> {
    const m = new Map<string, Task[]>();
    for (const t of tasks.all()) {
        const p = t.parentId && t.parentId !== t.id && tasks.has(t.parentId) ? t.parentId : '';
        if (!m.has(p)) m.set(p, []);
        m.get(p)!.push(t);
    }
    return m;
}

export interface Removed { tasks: string[]; comments: string[]; attachments: string[] }

/** Elimina un task con tutti i discendenti, le loro note e i loro allegati. */
export function deleteTask(id: unknown): Removed {
    const t = typeof id === 'string' ? tasks.get(id) : undefined;
    if (!t) throw new UserError('not_found', 'task inesistente');
    const cm = childrenMap(), ids = new Set<string>([t.id]);
    const walk = (pid: string, d: number) => { if (d > 60) return; for (const c of cm.get(pid) || []) { ids.add(c.id); walk(c.id, d + 1); } };
    walk(t.id, 0);
    const rm: Removed = { tasks: [...ids], comments: [], attachments: [] };
    for (const c of comments.all()) if (ids.has(c.taskId)) { comments.delete(c.id); rm.comments.push(c.id); }
    for (const a of attachments.all()) if (ids.has(a.taskId)) { attachments.delete(a.id); rm.attachments.push(a.id); }
    for (const i of ids) tasks.delete(i);
    for (const m of Object.values(seen.data)) for (const i of ids) delete m[i];
    seen.save();
    return rm;
}

export function addComment(input: { id?: unknown; taskId?: unknown; text?: unknown }, by: string): Comment {
    const t = typeof input.taskId === 'string' ? tasks.get(input.taskId) : undefined;
    if (!t) throw new UserError('not_found', 'task inesistente');
    const text = typeof input.text === 'string' ? input.text.trim().slice(0, 2000) : '';
    if (!text) throw bad('nota vuota');
    return comments.set({
        id: freshId(input.id, i => comments.has(i)),
        taskId: t.id, rootId: t.rootId || t.id, text, authorId: by, createdAt: new Date().toISOString(),
    });
}

/** Si elimina solo la propria nota. */
export function deleteComment(id: unknown, by: string): string {
    const c = typeof id === 'string' ? comments.get(id) : undefined;
    if (!c) throw new UserError('not_found', 'nota inesistente');
    if (c.authorId !== by) throw new UserError('forbidden', 'puoi eliminare solo le tue note');
    comments.delete(c.id);
    return c.id;
}

export function addAttachment(file: { id: string; name: string; contentType: string; size: number }, taskId: string, by: string): Attachment {
    const t = tasks.get(taskId);
    if (!t) throw new UserError('not_found', 'task inesistente');
    return attachments.set({
        id: file.id, taskId: t.id, rootId: t.rootId || t.id, name: file.name.slice(0, 200),
        contentType: file.contentType, sizeBytes: file.size, uploadedBy: by, createdAt: new Date().toISOString(),
    });
}

export function deleteAttachment(id: unknown): string {
    const a = typeof id === 'string' ? attachments.get(id) : undefined;
    if (!a) throw new UserError('not_found', 'allegato inesistente');
    attachments.delete(a.id);
    return a.id;
}

/** Segna come lette le note di un task fino a `at` (createdAt dell'ultima nota vista). */
export function setSeen(profile: string, taskId: unknown, at: unknown): Record<string, string> {
    if (typeof taskId !== 'string' || !tasks.has(taskId) || !isIso(at)) throw bad('seen');
    const all = seen.data, mine = all[profile] || (all[profile] = {});
    if (!mine[taskId] || mine[taskId] < at) { mine[taskId] = at; seen.save(); }
    return mine;
}

export const seenOf = (profile: string) => seen.data[profile] || {};
