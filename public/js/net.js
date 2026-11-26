/* Connessione realtime col server e scritture del diario (ottimistiche, una alla volta per task). */
import { db, app, rebuild, rebuildAtt, rebuildCom, desc, idx, renderAll, banner, setSave } from './state.js';
import { today, isDate, st } from './util.js';

export const socket = window.io();

/** Id generati dal client per mostrare subito ciò che si crea (il server li valida). */
export function rid() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Invia un comando e aspetta la risposta del server. */
export const ask = (event, payload) => new Promise(res => socket.emit(event, payload, r => res(r || { ok: false, error: 'error' })));

export function writeErr(r) {
  const c = r && r.error;
  if (c === 'no_profile') banner('Il tuo indirizzo non è più associato a un profilo: ricarica la pagina.');
  else if (c === 'not_found') banner('Non esiste più: forse qualcuno l’ha appena eliminato.');
  else if (c === 'forbidden') banner(r.message ? r.message.charAt(0).toUpperCase() + r.message.slice(1) + '.' : 'Operazione non permessa.');
  else if (c === 'bad_request') banner('Dati non validi: ricarica la pagina e riprova.');
  else banner('Salvataggio non riuscito: controlla la connessione e riprova.');
  socket.emit('diario:sync');
}

/* ---------- task ---------- */
const pend = {}, busy = {}, inflight = {};

/** Modifica ottimistica: si vede subito, le patch dello stesso task si accodano e si uniscono. */
export function patch(id, p) {
  if (!app.canWrite || !db.tasks[id]) return;
  db.tasks[id] = { ...db.tasks[id], ...p, updatedAt: new Date().toISOString(), updatedBy: app.profile };
  pend[id] = { ...(pend[id] || {}), ...p };
  rebuild(); renderAll();
  if (!busy[id]) flush(id);
}
async function flush(id) {
  busy[id] = true; setSave('Salvataggio…');
  while (pend[id]) {
    const p = pend[id]; delete pend[id]; inflight[id] = p;
    const r = await ask('task:patch', { id, patch: p });
    delete inflight[id];
    if (!r.ok) { delete pend[id]; busy[id] = false; setSave(''); writeErr(r); return; }
  }
  busy[id] = false;
  if (!Object.values(busy).some(Boolean)) setSave('Salvato ✓');
}

/** Cambio stato con gli automatismi: In corso ⇒ inizio; Fatto ⇒ fine, inizio e data di completamento. */
export function setStatus(id, s) {
  const t = db.tasks[id]; if (!t) return;
  const prev = st(t.status);
  s = st(s); const p = { status: s };
  if (s === 'doing' && !isDate(t.startDate)) p.startDate = today();
  if (s === 'done') Object.assign(p, doneFields(t));
  else p.completedAt = null;
  patch(id, p);
  if (app.canWrite && s !== prev) cascadeLocal(id);
}
const doneFields = t => ({ endDate: isDate(t.endDate) ? t.endDate : today(), startDate: isDate(t.startDate) ? t.startDate : today(), completedAt: new Date().toISOString() });

/**
 * Previsione locale della chiusura automatica dei padri (la decide e la salva il server,
 * `cascadeParents` in src/diario.ts): tutti i sottotask fatti ⇒ padre Fatto;
 * un sottotask riaperto sotto un padre fatto ⇒ padre In corso. Non manda nulla al server.
 */
function cascadeLocal(id) {
  let cur = db.tasks[id], changed = false;
  for (let g = 0; g < 60 && cur && cur.parentId && cur.parentId !== cur.id; g++) {
    const p = db.tasks[cur.parentId]; if (!p) break;
    const kids = idx.cm[p.id] || [], allDone = kids.length > 0 && kids.every(x => st(x.status) === 'done'), pd = st(p.status) === 'done';
    let q;
    if (allDone && !pd) q = { status: 'done', ...doneFields(p) };
    else if (!allDone && pd && st(cur.status) !== 'done') q = { status: 'doing', completedAt: null };
    else break;
    cur = db.tasks[p.id] = { ...p, ...q, updatedAt: new Date().toISOString(), updatedBy: app.profile };
    rebuild(); changed = true;
  }
  if (changed) renderAll();
}

export async function create(title, parentId) {
  if (!app.canWrite) return;
  const id = rid(), par = parentId && db.tasks[parentId], now = new Date().toISOString(), me = app.profile;
  db.tasks[id] = {
    id, title, notes: '', status: 'todo', parentId: par ? par.id : null, rootId: par ? (par.rootId || par.id) : id, depth: par ? (par.depth | 0) + 1 : 0,
    startDate: null, endDate: null, order: Date.now(), createdBy: me, assigneeId: me, createdAt: now, updatedAt: now, updatedBy: me, completedAt: null,
  };
  rebuild(); renderAll(); setSave('Salvataggio…');
  const r = await ask('task:create', { id, title, parentId: par ? par.id : null });
  if (r.ok) setSave('Salvato ✓');
  else { delete db.tasks[id]; rebuild(); renderAll(); setSave(''); writeErr(r); }
}

/** Elimina un task con tutti i discendenti, le loro note e i loro allegati. */
export async function removeTree(id) {
  if (!app.canWrite || !db.tasks[id]) return;
  const ids = new Set([id, ...desc(id).map(t => t.id)]);
  for (const i of ids) delete db.tasks[i];
  for (const c of Object.values(db.comments)) if (ids.has(c.taskId)) delete db.comments[c.id];
  for (const a of Object.values(db.attachments)) if (ids.has(a.taskId)) delete db.attachments[a.id];
  rebuild(); rebuildCom(); rebuildAtt(); renderAll(); setSave('Eliminazione…');
  const r = await ask('task:delete', { id });
  if (r.ok) setSave('Eliminato ✓'); else { setSave(''); writeErr(r); }
}

/* ---------- note, allegati, lette ---------- */
export async function addComment(taskId, text) {
  const r = await ask('comment:add', { id: rid(), taskId, text });
  if (!r.ok) writeErr(r);
  return r.ok;
}
export async function delComment(id) {
  if (!app.canWrite) return;
  delete db.comments[id]; rebuildCom(); renderAll();
  const r = await ask('comment:delete', { id });
  if (!r.ok) writeErr(r);
}
export async function delAttachment(id) {
  if (!app.canWrite) return;
  delete db.attachments[id]; rebuildAtt(); renderAll();
  const r = await ask('attachment:delete', { id });
  if (!r.ok) writeErr(r);
}
/** Segna lette le note di un task (per profilo, sincronizzate tra schede e dispositivi). */
export function markSeen(id) {
  const l = idx.comBy[id], last = l && l.length ? String(l[l.length - 1].createdAt) : '';
  if (!last || !app.profile || (db.seen[id] && db.seen[id] >= last)) return;
  db.seen[id] = last;
  socket.emit('seen:set', { taskId: id, at: last }, () => { });
}

/* ---------- upload con avanzamento ---------- */
/**
 * Carica un file su /upload. `fields` va prima del file nel form.
 * Ritorna {promise, abort}; onProgress(loaded, total) durante l'invio.
 */
export function sendFile(file, fields, onProgress) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v != null) fd.append(k, v);
  fd.append('file', file);
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    xhr.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total); };
    xhr.onload = () => {
      let r = null; try { r = JSON.parse(xhr.responseText); } catch (e) { }
      if (xhr.status >= 200 && xhr.status < 300 && r && r.ok) resolve(r);
      else reject(Object.assign(new Error('upload'), { status: xhr.status, code: r && r.error }));
    };
    xhr.onerror = () => reject(Object.assign(new Error('rete'), { status: 0 }));
    xhr.onabort = () => reject(Object.assign(new Error('annullato'), { status: -1 }));
  });
  xhr.open('POST', '/upload', true);
  xhr.send(fd);
  return { promise, abort: () => xhr.abort() };
}

/* ---------- dati dal server ---------- */
const byId = list => { const m = {}; for (const d of list || []) if (d && typeof d === 'object' && typeof d.id === 'string') m[d.id] = d; return m; };
/** Le modifiche non ancora confermate restano sopra ai dati in arrivo (niente sfarfallii). */
const withLocal = t => ({ ...t, ...(inflight[t.id] || {}), ...(pend[t.id] || {}) });

function reindex(col) {
  if (col === 'tasks') rebuild();
  else if (col === 'comments') rebuildCom();
  else if (col === 'attachments') rebuildAtt();
}

socket.on('diario:init', d => {
  app.profile = typeof d.me === 'string' ? d.me : null;  // profilo deciso dal server in base all'IP
  db.users = byId(d.users);
  db.tasks = byId((d.tasks || []).map(withLocal));
  db.comments = byId(d.comments);
  db.attachments = byId(d.attachments);
  app.loaded = true;
  rebuild(); rebuildCom(); rebuildAtt();
});
socket.on('diario:upsert', ({ col, docs }) => {
  if (!db[col] || col === 'seen') return;
  for (const d of docs || []) if (d && typeof d.id === 'string') db[col][d.id] = col === 'tasks' ? withLocal(d) : d;
  reindex(col);
});
socket.on('diario:remove', ({ col, ids }) => {
  if (!db[col] || col === 'seen') return;
  for (const id of ids || []) delete db[col][id];
  reindex(col);
});
socket.on('diario:seen', m => { db.seen = m && typeof m === 'object' ? m : {}; });

socket.on('disconnect', () => banner('Connessione persa: riconnessione in corso…'));
socket.on('connect', () => { if ($note().textContent.startsWith('Connessione persa')) banner(''); });
const $note = () => document.getElementById('note');

// Tutte le modifiche arrivate dal server ridisegnano le viste (dopo gli handler sopra).
for (const ev of ['diario:init', 'diario:upsert', 'diario:remove', 'diario:seen']) socket.on(ev, () => renderAll());
