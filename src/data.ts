import path from 'path';
import { DATA_DIR, DEFAULT_USERS } from './config';
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
    taskId: string;
    rootId: string;
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
/** Note lette: {profilo: {taskId: createdAt dell'ultima nota vista}} */
export const seen = new JsonFile<Record<string, Record<string, string>>>(file('seen.json'), () => ({}));
export const clipboard = new JsonFile<Clipboard>(file('clipboard.json'), () => ({ text: '', files: [] }));

export function ensureDefaultUsers() {
    if (users.size) return;
    const now = new Date().toISOString();
    for (const u of DEFAULT_USERS) users.set({ ...u, active: true, createdAt: now });
    log(`Creati i profili: ${DEFAULT_USERS.map(u => u.name).join(', ')}`);
}

export const isProfile = (id: unknown): id is string => typeof id === 'string' && !!users.get(id) && users.get(id)!.active !== false;
