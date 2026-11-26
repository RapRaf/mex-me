import { bugs, tasks, attachments, users, type Bug, type Task, type Attachment } from './data';
import { createTask, newId, UserError } from './diario';

/* Bug segnalati: chiunque ne segnala uno; chi lo conferma (anche chi l'ha segnalato)
   lo trasforma subito in un task "Da fare" assegnato a sé, con label "bug". */

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
const bad = (m: string) => new UserError('bad_request', m);
const nameOf = (id: string | null) => (id && users.get(id)?.name) || 'qualcuno';

function getBug(id: unknown): Bug {
    const b = typeof id === 'string' ? bugs.get(id) : undefined;
    if (!b) throw new UserError('not_found', 'bug inesistente');
    return b;
}
function title(v: unknown): string {
    const s = typeof v === 'string' ? v.trim().slice(0, 200) : '';
    if (!s) throw bad('titolo mancante');
    return s;
}
const text = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 5000) : '');
const already = (b: Bug) => new UserError('forbidden', b.status === 'confirmed'
    ? `già confermato da ${nameOf(b.reviewedBy)}` : `già scartato da ${nameOf(b.reviewedBy)}`);

export function createBug(input: { id?: unknown; title?: unknown; text?: unknown }, by: string): Bug {
    const id = typeof input.id === 'string' && ID_RE.test(input.id) && !bugs.has(input.id) ? input.id : newId();
    const now = new Date().toISOString();
    return bugs.set({
        id, title: title(input.title), text: text(input.text), status: 'open', reportedBy: by,
        createdAt: now, updatedAt: now, reviewedBy: null, reviewedAt: null, taskId: null,
    });
}

/** Titolo e descrizione: solo chi l'ha segnalato, finché non è confermato. */
export function editBug(id: unknown, input: { title?: unknown; text?: unknown }, by: string): Bug {
    const b = getBug(id);
    if (b.reportedBy !== by) throw new UserError('forbidden', 'può modificarlo solo chi l\'ha segnalato');
    if (b.status === 'confirmed') throw already(b);
    const p: Partial<Bug> = {};
    if (input.title !== undefined) p.title = title(input.title);
    if (input.text !== undefined) p.text = text(input.text);
    return bugs.set({ ...b, ...p, updatedAt: new Date().toISOString() });
}

/**
 * Conferma: crea il task (Da fare, assegnato a chi conferma, label "bug", note = descrizione)
 * e gli passa gli allegati del bug. Due conferme contemporanee: vince la prima.
 */
export function confirmBug(id: unknown, by: string): { bug: Bug; task: Task; moved: Attachment[] } {
    const b = getBug(id);
    if (b.status === 'confirmed') throw already(b);
    const t0 = createTask({ title: b.title }, by);
    const task = tasks.set({ ...t0, notes: b.text, label: 'bug', bugId: b.id });
    const moved = attachments.all().filter(a => a.bugId === b.id)
        .map(a => attachments.set({ ...a, taskId: task.id, rootId: task.id }));
    const now = new Date().toISOString();
    const bug = bugs.set({ ...b, status: 'confirmed', reviewedBy: by, reviewedAt: now, taskId: task.id, updatedAt: now });
    return { bug, task, moved };
}

/** Scarta (non è un bug, doppione…): resta nell'elenco "Scartati" e si può riaprire. */
export function rejectBug(id: unknown, by: string): Bug {
    const b = getBug(id);
    if (b.status !== 'open') throw already(b);
    const now = new Date().toISOString();
    return bugs.set({ ...b, status: 'rejected', reviewedBy: by, reviewedAt: now, updatedAt: now });
}

export function reopenBug(id: unknown): Bug {
    const b = getBug(id);
    if (b.status !== 'rejected') throw new UserError('forbidden', b.status === 'confirmed' ? already(b).message : 'è già da revisionare');
    return bugs.set({ ...b, status: 'open', reviewedBy: null, reviewedAt: null, updatedAt: new Date().toISOString() });
}

/** Elimina un bug non confermato con i suoi allegati: solo chi l'ha segnalato. Ritorna gli allegati tolti. */
export function deleteBug(id: unknown, by: string): string[] {
    const b = getBug(id);
    if (b.reportedBy !== by) throw new UserError('forbidden', 'può eliminarlo solo chi l\'ha segnalato');
    if (b.status === 'confirmed') throw new UserError('forbidden', 'è già diventato un task');
    const rm = attachments.all().filter(a => a.bugId === b.id && !a.taskId).map(a => a.id);
    for (const a of rm) attachments.delete(a);
    bugs.delete(b.id);
    return rm;
}

/** Allegato caricato su un bug (solo se non è ancora confermato: dopo si allega al task). */
export function addBugAttachment(file: { id: string; name: string; contentType: string; size: number }, bugId: string, by: string): Attachment {
    const b = getBug(bugId);
    if (b.status === 'confirmed') throw already(b);
    return attachments.set({
        id: file.id, taskId: '', rootId: '', bugId: b.id, name: file.name.slice(0, 200),
        contentType: file.contentType, sizeBytes: file.size, uploadedBy: by, createdAt: new Date().toISOString(),
    });
}
