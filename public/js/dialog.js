/* Dialog del task: campi modificabili, albero dei sottotask, allegati, note. */
import { $, esc, st, opts, isDate, fDL, av, fit, setVal, arm, UPI, CHAT } from './util.js';
import { db, app, idx, desc, uopts, ulist, nAtt, clipBtn, chatBtn, nCom, unread, renderAll, setSave } from './state.js';
import { patch, setStatus, create, removeTree } from './net.js';
import { openChat } from './chat.js';
import { openFiles, pick } from './attach.js';

let addInto = null, dlgKey = '', lastFocus = null, noteTimer = null;
const collapsed = new Set();

/** Apre il dialog del task principale `id`; con `focus` scorre fino al sottotask. `ro` = sola lettura (admin). */
export function openDlg(id, focus, ro) {
  if (!db.tasks[id]) return;
  lastFocus = document.activeElement;
  if (ro && app.roSaved === null) { app.roSaved = app.canWrite; app.canWrite = false; }
  app.curId = id; addInto = id; dlgKey = '';
  if (focus && focus !== id) { let p = db.tasks[focus], g = 0; while (p && p.parentId && g++ < 60) { collapsed.delete(p.parentId); p = db.tasks[p.parentId]; } }
  $('#ov').hidden = false; document.body.style.overflow = 'hidden';
  renderDlg();
  setTimeout(() => {
    const r = focus && focus !== id && document.querySelector(`.tr[data-row="${CSS.escape(focus)}"]`);
    document.querySelectorAll('#dT,#tree .tn').forEach(fit);
    if (r) { r.scrollIntoView({ block: 'center' }); r.classList.add('flash'); setTimeout(() => r.classList.remove('flash'), 1600); r.querySelector('.tn').focus({ preventScroll: true }); }
    else $('#dT').focus();
  }, 30);
}
export function closeDlg() {
  commitNotes();
  app.curId = null; $('#ov').hidden = true;
  if (!app.filesFor && !app.chatFor) document.body.style.overflow = '';
  if (app.roSaved !== null) { app.canWrite = app.roSaved; app.roSaved = null; dlgKey = ''; renderAll(); }
  if (lastFocus && lastFocus.isConnected) lastFocus.focus();
}
/** Forza la ricostruzione dell'albero (es. dopo un cambio di permessi). */
export const resetDlg = () => { dlgKey = ''; };

function treeHtml(id, d) {
  return (idx.cm[id] || []).map(c => {
    const kids = (idx.cm[c.id] || []).length, col = collapsed.has(c.id), dis = app.canWrite ? '' : ' disabled';
    return `<li data-id="${esc(c.id)}"><div class="tr" data-row="${esc(c.id)}">
      <div class="l1">
        <button class="tg" data-tg aria-label="${col ? 'Espandi' : 'Comprimi'}" aria-expanded="${!col}"${kids ? '' : ' disabled'}>${col ? '▸' : '▾'}</button>
        <textarea class="tn" data-k="title" rows="1" maxlength="200" aria-label="Titolo sottotask"${dis}></textarea>
        <select class="pill" data-k="status" aria-label="Stato"${dis}>${opts('todo')}</select>
      </div>
      <div class="l2">
        <span class="who-s"><span class="uav"></span><select class="us" data-k="assigneeId" aria-label="Assegnato a"${dis}>${uopts('')}</select></span>
        <span class="dates"><input type="date" data-k="startDate" aria-label="Inizio"${dis}><span>→</span><input type="date" data-k="endDate" aria-label="Fine"${dis}></span>
        <span class="acts"><span class="cmb"></span><span class="cl"></span><button class="ib" data-up title="Carica file su questo sottotask" aria-label="Carica file"${dis}>${UPI}</button><button class="ib" data-into title="Aggiungi un sottotask qui dentro" aria-label="Aggiungi sottotask dentro"${dis}>＋</button>
        <button class="ib" data-del aria-label="Elimina"${dis}>×</button></span>
      </div>
    </div>${kids && !col && d < 60 ? `<ul>${treeHtml(c.id, d + 1)}</ul>` : ''}</li>`;
  }).join('');
}

export function renderDlg() {
  if (!app.curId) return;
  const t = db.tasks[app.curId]; if (!t) { closeDlg(); return; }
  const curId = app.curId, ds = desc(curId);
  // L'albero si ricostruisce solo se cambia la struttura; i valori si aggiornano sul posto.
  const k = ds.map(x => x.id + '<' + x.parentId).join(',') + '|' + [...collapsed].join(',') + '|' + app.canWrite + '|' + ulist().map(u => u.id + u.name).join(',');
  if (k !== dlgKey) { dlgKey = k; $('#tree').innerHTML = ds.length ? treeHtml(curId, 0) : '<li style="color:var(--mute);font-size:15px;padding:4px 0 10px">Nessun sottotask. Aggiungine uno qui sotto.</li>'; }
  const s = st(t.status); $('#dh').className = 'dh s-' + s;
  setVal($('#dT'), t.title); fit($('#dT'));
  const na = nAtt(curId), n = nCom(curId), u = unread(curId);
  $('#dAtt').innerHTML = (na ? clipBtn(curId).replace('class="clipb"', 'class="clipb" style="margin-left:0;min-height:40px;padding:0 14px"').replace(/<span>(\d+)<\/span>/, '<span>$1 allegat' + (na === 1 ? 'o' : 'i') + '</span>') : '')
    + (app.canWrite ? `<button class="btn" type="button" id="dUp" style="display:inline-flex;gap:6px;align-items:center">${UPI}Carica file</button>` : '')
    + `<button class="btn chatd" type="button" data-chat="${esc(curId)}">${CHAT}${n ? `Note del team · ${n}` : 'Note del team'}${u ? ` <span class="cnew">${u} nuov${u === 1 ? 'a' : 'e'}</span>` : ''}</button>`;
  setVal($('#dN'), t.notes); setVal($('#dA'), isDate(t.startDate) ? t.startDate : ''); setVal($('#dZ'), isDate(t.endDate) ? t.endDate : '');
  const sel = $('#dS'); if (!sel.options.length) sel.innerHTML = opts(s); if (document.activeElement !== sel) sel.value = s;
  const du = $('#dU'); if (document.activeElement !== du) { du.innerHTML = uopts(t.assigneeId); du.value = db.users[t.assigneeId] ? t.assigneeId : ''; } du.disabled = !app.canWrite;
  $('#dZ').classList.toggle('bad', isDate(t.startDate) && isDate(t.endDate) && t.endDate < t.startDate);
  for (const el of document.querySelectorAll('#dT,#dS,#dA,#dZ,#dN,#sT')) el.disabled = !app.canWrite;
  $('#dDel').hidden = !app.canWrite; $('#sAdd').hidden = !app.canWrite;
  for (const x of ds) {
    const r = document.querySelector(`.tr[data-row="${CSS.escape(x.id)}"]`); if (!r) continue;
    const xs = st(x.status);
    r.className = 'tr s-' + xs;
    const ss = r.querySelector('[data-k=status]'); if (document.activeElement !== ss) ss.value = xs;
    const ua = r.querySelector('[data-k=assigneeId]'); if (document.activeElement !== ua) ua.value = db.users[x.assigneeId] ? x.assigneeId : '';
    r.querySelector('.uav').innerHTML = av(db.users[x.assigneeId]);
    r.querySelector('.cl').innerHTML = clipBtn(x.id);
    r.querySelector('.cmb').innerHTML = chatBtn(x.id);
    const tn = r.querySelector('[data-k=title]'); setVal(tn, x.title); fit(tn);
    setVal(r.querySelector('[data-k=startDate]'), isDate(x.startDate) ? x.startDate : '');
    setVal(r.querySelector('[data-k=endDate]'), isDate(x.endDate) ? x.endDate : '');
    r.querySelector('[data-k=endDate]').classList.toggle('bad', isDate(x.startDate) && isDate(x.endDate) && x.endDate < x.startDate);
  }
  const dn = ds.filter(x => st(x.status) === 'done').length, op = ds.length - dn;
  $('#dC').textContent = ds.length ? `${dn} su ${ds.length} fatti${s === 'done' && op ? ` · attenzione: ${op} ancora aperti` : ''}` : '';
  if (!db.tasks[addInto]) addInto = curId;
  const into = $('#into'); into.innerHTML = '';
  if (addInto !== curId) {
    into.append('Dentro: ');
    const b = document.createElement('b'); b.textContent = db.tasks[addInto].title || 'Senza titolo';
    const r = document.createElement('button'); r.type = 'button'; r.id = 'intoReset'; r.textContent = 'annulla';
    into.append(b, r);
  }
  const by = db.users[t.createdBy];
  const bug = t.bugId && db.bugs[t.bugId], rep = bug && db.users[bug.reportedBy];
  $('#dI').textContent = 'Creato il ' + (t.createdAt ? fDL.format(new Date(t.createdAt)) : '—') + (by ? ' da ' + by.name : '')
    + (bug ? ` · da un bug segnalato da ${rep ? rep.name : 'qualcuno'}` : '');
}

function commitNotes() {
  if (!noteTimer) return;
  clearTimeout(noteTimer); noteTimer = null;
  const el = $('#dN'); delete el.dataset.dirty;
  if (app.curId && db.tasks[app.curId] && (db.tasks[app.curId].notes || '') !== el.value) patch(app.curId, { notes: el.value });
}

/* ---------- eventi ---------- */
$('#dlg').addEventListener('input', e => { if (e.target.matches('#dT,.tn')) fit(e.target); });
$('#dX').onclick = closeDlg;
$('#ov').addEventListener('mousedown', e => { if (e.target.id === 'ov') closeDlg(); });
$('#dT').addEventListener('change', e => { const v = e.target.value.trim(); if (v && app.curId) patch(app.curId, { title: v }); else e.target.value = db.tasks[app.curId]?.title || ''; });
$('#dT').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
$('#dS').addEventListener('change', e => app.curId && setStatus(app.curId, e.target.value));
$('#dU').addEventListener('change', e => app.curId && patch(app.curId, { assigneeId: e.target.value || null }));
$('#dA').addEventListener('change', e => app.curId && patch(app.curId, { startDate: e.target.value || null }));
$('#dZ').addEventListener('change', e => app.curId && patch(app.curId, { endDate: e.target.value || null }));
// Note del task: salvataggio automatico poco dopo che si smette di scrivere.
$('#dN').addEventListener('input', e => { e.target.dataset.dirty = '1'; setSave('…'); clearTimeout(noteTimer); noteTimer = setTimeout(commitNotes, 900); });
$('#dN').addEventListener('blur', commitNotes);
$('#tree').addEventListener('change', e => {
  const r = e.target.closest('.tr'); if (!r) return;
  const id = r.dataset.row, k = e.target.dataset.k;
  if (k === 'status') setStatus(id, e.target.value);
  else if (k === 'title') { const v = e.target.value.trim(); if (v) patch(id, { title: v }); else e.target.value = db.tasks[id]?.title || ''; }
  else if (k === 'startDate' || k === 'endDate') patch(id, { [k]: e.target.value || null });
  else if (k === 'assigneeId') patch(id, { assigneeId: e.target.value || null });
});
$('#tree').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset.k === 'title') { e.preventDefault(); e.target.blur(); } });
$('#tree').addEventListener('click', e => {
  const r = e.target.closest('.tr'); if (!r) return;
  const id = r.dataset.row;
  if (e.target.closest('[data-chat]')) { openChat(id); return; }
  if (e.target.closest('[data-files]')) { openFiles(id); return; }
  if (e.target.closest('[data-up]')) { pick(id); return; }
  if (e.target.closest('[data-tg]')) { collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id); renderDlg(); }
  else if (e.target.closest('[data-into]')) { addInto = id; collapsed.delete(id); renderDlg(); $('#sT').focus(); }
  else if (e.target.closest('[data-del]')) { const b = e.target.closest('[data-del]'), n = desc(id).length; if (arm(b, n ? `Elimina con ${n} sottotask?` : 'Elimina?', '×')) removeTree(id); }
});
$('#into').addEventListener('click', e => { if (e.target.id === 'intoReset') { addInto = app.curId; renderDlg(); $('#sT').focus(); } });
$('#sAdd').addEventListener('submit', e => {
  e.preventDefault();
  const i = $('#sT'), v = i.value.trim(); if (!v || !app.curId) return;
  i.value = ''; create(v, db.tasks[addInto] ? addInto : app.curId); i.focus();
});
$('#dDel').onclick = e => {
  const n = desc(app.curId).length;
  if (arm(e.currentTarget, n ? `Conferma: elimina anche ${n} sottotask` : 'Conferma eliminazione', 'Elimina task')) { const id = app.curId; closeDlg(); removeTree(id); }
};
$('#dAtt').addEventListener('click', e => {
  if (e.target.closest('[data-chat]')) openChat(app.curId);
  else if (e.target.closest('[data-files]')) openFiles(app.curId);
  else if (e.target.closest('#dUp')) pick(app.curId);
});
