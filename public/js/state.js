/* Stato condiviso del client: dati ricevuti dal server, indici derivati e helper di rendering. */
import { $, esc, st, av, isDate, today, CLIP, CHAT } from './util.js';

/** Copia locale dei dati del server (aggiornata in tempo reale). */
export const db = { users: {}, tasks: {}, comments: {}, attachments: {}, seen: {} };

/** Stato dell'interfaccia di questa scheda. */
export const app = {
  profile: null,     // profilo scelto in questa scheda
  canWrite: false,   // false = sola lettura (fuori dal diario o vista admin)
  roSaved: null,     // canWrite salvato mentre un dialog è aperto in sola lettura
  curId: null,       // task aperto nel dialog
  filesFor: null,    // task del dialog allegati
  chatFor: null,     // task del dialog note
  loaded: false,     // dati del diario ricevuti
};

/** Indici: figli per padre ('' = principali), allegati e note per task. */
export const idx = { cm: {}, attBy: {}, comBy: {} };

export function rebuild() {
  const cm = {};
  for (const t of Object.values(db.tasks)) {
    const p = t.parentId && db.tasks[t.parentId] && t.parentId !== t.id ? t.parentId : '';
    (cm[p] || (cm[p] = [])).push(t);
  }
  for (const k in cm) cm[k].sort((a, b) => (a.order || 0) - (b.order || 0));
  idx.cm = cm;
}
const byTask = list => {
  const m = {};
  for (const x of list) if (typeof x.taskId === 'string') (m[x.taskId] || (m[x.taskId] = [])).push(x);
  for (const k in m) m[k].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return m;
};
export const rebuildAtt = () => { idx.attBy = byTask(Object.values(db.attachments)); };
export const rebuildCom = () => { idx.comBy = byTask(Object.values(db.comments).filter(c => typeof c.text === 'string')); };

export function desc(id, out = [], d = 0) { if (d > 60) return out; for (const c of idx.cm[id] || []) { out.push(c); desc(c.id, out, d + 1); } return out; }
export function walk(id, d, fn) { if (d > 60) return; for (const c of idx.cm[id] || []) { fn(c, d); walk(c.id, d + 1, fn); } }

/* ---------- persone ---------- */
export const ulist = () => Object.values(db.users).filter(u => u.active !== false && typeof u.name === 'string').sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name));
export const uname = id => db.users[id] ? db.users[id].name : '';
export const asg = id => { const u = db.users[id]; return u ? `<span class="asg">${av(u)}${esc(u.name)}</span>` : '<span class="asg none">Non assegnato</span>'; };
export const uopts = sel => '<option value="">Non assegnato</option>' + ulist().map(u => `<option value="${esc(u.id)}"${u.id === sel ? ' selected' : ''}>${esc(u.name)}</option>`).join('');
export const mineTree = t => t.assigneeId === app.profile || desc(t.id).some(x => x.assigneeId === app.profile);
export const isLate = t => st(t.status) !== 'done' && isDate(t.endDate) && t.endDate < today();

/* ---------- allegati e note: icone con contatore ---------- */
export const nAtt = id => (idx.attBy[id] || []).length;
export const clipBtn = id => { const n = nAtt(id); return n ? `<button class="clipb" type="button" data-files="${esc(id)}" aria-label="Vedi ${n} allegati">${CLIP}<span>${n}</span></button>` : ''; };
export const nCom = id => (idx.comBy[id] || []).length;
export const unread = id => { const s = db.seen[id] || ''; return (idx.comBy[id] || []).filter(c => String(c.createdAt) > s && c.authorId !== app.profile).length; };
export function chatBtn(id) {
  const n = nCom(id), u = unread(id);
  return `<button class="chatb${n ? ' has' : ''}${u ? ' new' : ''}" type="button" data-chat="${esc(id)}" title="${n ? `${n} not${n === 1 ? 'a' : 'e'}${u ? `, ${u} nuov${u === 1 ? 'a' : 'e'}` : ''}` : 'Scrivi una nota'}" aria-label="${n ? `Note: ${n}${u ? `, ${u} nuove` : ''}` : 'Scrivi una nota'}">${CHAT}${n ? `<span class="cbadge">${n}</span>` : ''}</button>`;
}

/* ---------- render ---------- */
let renderer = () => { };
export const setRenderer = f => { renderer = f; };
/** Ridisegna tutte le viste (sincrono: alcune viste contano su questo). */
export const renderAll = () => renderer();

/* ---------- messaggi ---------- */
export function banner(t) { const n = $('#note'); n.textContent = t; n.hidden = !t; }
export function setSave(t) { $('#save').textContent = t; $('#pSave').textContent = t; }
