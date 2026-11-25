/* Priorità: kanban dei soli task principali, 3 colonne, label, trascinamento. */
import { $, esc, st, opts, sd, key, isDate, av, ls } from './util.js';
import { db, app, idx, desc, isLate, clipBtn, chatBtn } from './state.js';
import { patch, setStatus } from './net.js';
import { openDlg } from './dialog.js';
import { openChat } from './chat.js';
import { openFiles } from './attach.js';

export const PRIO = [['high', 'Priorità massima'], ['med', 'Priorità media'], ['low', 'Priorità bassa']];
/** Label disponibili [id, nome, colore]: per aggiungerne una basta una riga (gli id salvati non vanno cambiati). */
export const LABELS = [['bug', 'Bug', '#c2410c'], ['migliorie', 'Migliorie', '#7b4fd6'], ['adv', 'ADV', '#f08c00']];
const prio = t => PRIO.some(p => p[0] === t.priority) ? t.priority : 'med';
const lab = t => LABELS.some(l => l[0] === t.label) ? t.label : '';
const po = t => typeof t.prioOrder === 'number' ? t.prioOrder : (t.order || 0);
const lopts = sel => '<option value="">Nessuna label</option>' + LABELS.map(([k, l]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${l}</option>`).join('');
const popts = sel => PRIO.map(([k, l]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${l}</option>`).join('');

let pFilter = ls.get('mx-plabel', ''), pChipsHtml = '', dragId = null, pDeferred = false, pForce = false;
let pHtml = '';
/** Forza il prossimo render (es. cambio di vista). */
export const resetPrio = () => { pHtml = ''; };

function prioCols() {
  const roots = (idx.cm[''] || []).filter(t => !pFilter || (pFilter === '__none' ? !lab(t) : lab(t) === pFilter)), out = {};
  const cAt = t => String(t.completedAt || t.updatedAt || '');
  for (const [k] of PRIO) {
    const ts = roots.filter(t => prio(t) === k);
    // Aperti nell'ordine scelto a mano; completati in fondo, dal primo all'ultimo completato.
    out[k] = { open: ts.filter(t => st(t.status) !== 'done').sort((a, b) => po(a) - po(b)), done: ts.filter(t => st(t.status) === 'done').sort((a, b) => cAt(a).localeCompare(cAt(b))) };
  }
  return out;
}

function kbox(t) {
  const s = st(t.status), ds = desc(t.id), dn = ds.filter(x => st(x.status) === 'done').length, u = db.users[t.assigneeId], l = lab(t), L = LABELS.find(x => x[0] === l), late = isLate(t), dis = app.canWrite ? '' : ' disabled';
  const when = s === 'done' ? (t.completedAt ? 'Completato il ' + sd(key(new Date(t.completedAt))) : 'Completato') : isDate(t.endDate) ? `<span class="${late ? 'late' : ''}">Fine ${sd(t.endDate)}${late ? ' · in ritardo' : ''}</span>` : '';
  return `<article class="kbox s-${s}" data-pid="${esc(t.id)}" draggable="${app.canWrite}" tabindex="0" aria-label="${esc(t.title || 'Senza titolo')}" style="--lc:${L ? L[2] : 'var(--line)'}">
    <div class="kt"><span class="ktt">${esc(t.title || 'Senza titolo')}</span>${clipBtn(t.id)}${chatBtn(t.id)}</div>
    <div class="km"><select class="klab${L ? '' : ' none'}" data-plab aria-label="Label"${dis}>${lopts(l)}</select><select class="pill" data-pst aria-label="Stato"${dis}>${opts(s)}</select><select class="kpr" data-ppr aria-label="Priorità"${dis}>${popts(prio(t))}</select></div>
    <div class="kf">${u ? av(u) + esc(u.name) : ''}${u && when ? ' · ' : ''}${when}${ds.length ? `<span class="prog"><i style="--p:${Math.round(dn / ds.length * 100)}%"></i>${dn}/${ds.length}</span>` : ''}</div>
  </article>`;
}

export function renderPrio() {
  if ($('#prio').hidden) return;
  const ae = document.activeElement, board = $('#board'), inB = !!ae && board.contains(ae);
  // Niente ricostruzione durante un trascinamento o mentre un menu del board è aperto.
  if (dragId || (inB && ae.tagName === 'SELECT' && !pForce)) { pDeferred = true; return; }
  pDeferred = false;
  const open = (idx.cm[''] || []).filter(t => st(t.status) !== 'done'), cnt = k => open.filter(t => k === '__none' ? !lab(t) : lab(t) === k).length;
  const F = [['', 'Tutte', open.length, ''], ...LABELS.map(([k, l, c]) => [k, l, cnt(k), c]), ['__none', 'Senza label', cnt('__none'), '']];
  if (!F.some(f => f[0] === pFilter)) pFilter = '';
  const ch = F.map(([k, l, n, c]) => `<button class="chip" data-l="${k}" aria-pressed="${pFilter === k}">${c ? `<i class="ld" style="--lc:${c}"></i>` : ''}${l}<b>${n}</b></button>`).join('');
  if (ch !== pChipsHtml) { pChipsHtml = ch; $('#pChips').innerHTML = ch; }
  const cols = prioCols();
  const html = PRIO.map(([k, l]) => {
    const c = cols[k];
    return `<section class="kcol p-${k}" data-col="${k}" aria-label="${l}"><div class="kh"><h2>${l}</h2><span>${c.open.length} da fare${c.done.length ? ' · ' + c.done.length + (c.done.length === 1 ? ' fatto' : ' fatti') : ''}</span></div>
      <div class="kl">${c.open.map(kbox).join('')}${c.open.length ? '' : `<div class="kempty">${app.canWrite ? 'Trascina qui un task' : 'Nessun task'}</div>`}${c.done.length ? `<div class="kdone">Completati</div>${c.done.map(kbox).join('')}` : ''}</div></section>`;
  }).join('');
  if (html === pHtml) return;
  pHtml = html;
  const fp = inB && ae.closest('[data-pid]') ? ae.closest('[data-pid]').dataset.pid : null, fa = inB ? (['data-plab', 'data-pst', 'data-ppr'].find(a => ae.hasAttribute(a)) || '') : '';
  board.innerHTML = html;
  if (fp) { const b = board.querySelector(`[data-pid="${CSS.escape(fp)}"]`), el = b && (fa ? b.querySelector(`[${fa}]`) : b); if (el) el.focus({ preventScroll: true }); }
}

/** Sposta un task in una colonna, prima di `beforeId` (null = in fondo agli aperti). */
function moveTo(id, col, beforeId) {
  const t = db.tasks[id]; if (!t || !app.canWrite || !PRIO.some(p => p[0] === col)) return;
  const p = { priority: col };
  if (st(t.status) !== 'done') {
    const full = prioCols()[col].open, cur = full.findIndex(x => x.id === id);
    if (prio(t) === col && cur >= 0 && ((full[cur + 1] || {}).id || null) === (beforeId || null)) return;
    const list = full.filter(x => x.id !== id);
    let i = beforeId ? list.findIndex(x => x.id === beforeId) : -1; if (i < 0) i = list.length;
    // Nuovo ordine = media tra i vicini.
    const a = list[i - 1], b = list[i];
    p.prioOrder = a && b ? (po(a) + po(b)) / 2 : a ? po(a) + 1000 : b ? po(b) - 1000 : Date.now();
  } else if (prio(t) === col) return;
  pForce = true; patch(id, p); pForce = false;
}
function dropBefore(col, y) { for (const b of col.querySelectorAll('.kbox:not(.s-done):not(.dragging)')) { const r = b.getBoundingClientRect(); if (y < r.top + r.height / 2) return b; } return null; }
function showMark(col, y) {
  const board = $('#board');
  for (const c of board.querySelectorAll('.kcol.over')) if (c !== col) c.classList.remove('over');
  col.classList.add('over');
  const t = db.tasks[dragId]; let m = board.querySelector('.kmark');
  if (!t || st(t.status) === 'done') { if (m) m.remove(); return; }
  if (!m) { m = document.createElement('div'); m.className = 'kmark'; }
  const kl = col.querySelector('.kl'), ref = dropBefore(col, y) || kl.querySelector('.kempty,.kdone');
  if (ref) { if (m.parentNode !== kl || m.nextSibling !== ref) kl.insertBefore(m, ref); }
  else if (m.parentNode !== kl || m.nextSibling) kl.appendChild(m);
}
function endDrag() {
  if (!dragId) return;
  dragId = null;
  const board = $('#board');
  for (const el of board.querySelectorAll('.kmark')) el.remove();
  for (const el of board.querySelectorAll('.over,.dragging')) el.classList.remove('over', 'dragging');
  if (pDeferred) renderPrio();
}

const board = $('#board');
$('#pChips').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; pFilter = b.dataset.l; ls.set('mx-plabel', pFilter); renderPrio(); };
board.addEventListener('pointerdown', e => { const b = e.target.closest('.kbox'); if (b && app.canWrite) b.draggable = !e.target.closest('select,button'); });
board.addEventListener('dragstart', e => {
  const b = e.target.closest('.kbox');
  if (!b || !app.canWrite || b.draggable === false) { e.preventDefault(); return; }
  dragId = b.dataset.pid; e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', dragId); } catch (x) { }
  requestAnimationFrame(() => b.classList.add('dragging'));
});
board.addEventListener('dragover', e => { if (!dragId) return; const col = e.target.closest('.kcol'); if (!col) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; showMark(col, e.clientY); });
board.addEventListener('dragleave', e => { if (dragId && !board.contains(e.relatedTarget)) { for (const el of board.querySelectorAll('.kmark')) el.remove(); for (const c of board.querySelectorAll('.kcol.over')) c.classList.remove('over'); } });
board.addEventListener('drop', e => {
  if (!dragId) return; const col = e.target.closest('.kcol'); if (!col) return;
  e.preventDefault();
  const id = dragId, b = dropBefore(col, e.clientY);
  endDrag(); moveTo(id, col.dataset.col, b ? b.dataset.pid : null);
});
board.addEventListener('dragend', endDrag);
board.addEventListener('change', e => {
  const b = e.target.closest('[data-pid]'); if (!b) return;
  const id = b.dataset.pid;
  if (e.target.matches('[data-plab]')) { pForce = true; patch(id, { label: e.target.value || null }); pForce = false; }
  else if (e.target.matches('[data-pst]')) { pForce = true; setStatus(id, e.target.value); pForce = false; }
  else if (e.target.matches('[data-ppr]')) moveTo(id, e.target.value, null);
});
board.addEventListener('focusout', () => { if (pDeferred) setTimeout(() => { if (pDeferred) renderPrio(); }, 0); });
board.addEventListener('click', e => {
  if (e.target.closest('select')) return;
  const cb = e.target.closest('[data-chat]'); if (cb) { openChat(cb.dataset.chat); return; }
  const fb = e.target.closest('[data-files]'); if (fb) { openFiles(fb.dataset.files); return; }
  const b = e.target.closest('.kbox'); if (b) openDlg(b.dataset.pid);
});
// Tastiera: Invio apre; Alt+←/→ cambia priorità; Alt+↑/↓ sposta nella colonna.
board.addEventListener('keydown', e => {
  const b = e.target.closest('.kbox'); if (!b || e.target !== b) return;
  const id = b.dataset.pid, t = db.tasks[id]; if (!t) return;
  if (e.key === 'Enter') { e.preventDefault(); openDlg(id); return; }
  if (!e.altKey || !app.canWrite) return;
  const ks = PRIO.map(p => p[0]), i = ks.indexOf(prio(t));
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const j = i + (e.key === 'ArrowLeft' ? -1 : 1); if (j >= 0 && j < ks.length) moveTo(id, ks[j], null); }
  else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && st(t.status) !== 'done') {
    e.preventDefault();
    const l = prioCols()[prio(t)].open, k = l.findIndex(x => x.id === id);
    if (e.key === 'ArrowUp' && k > 0) moveTo(id, prio(t), l[k - 1].id);
    else if (e.key === 'ArrowDown' && k >= 0 && k < l.length - 1) moveTo(id, prio(t), l[k + 2] ? l[k + 2].id : null);
  }
});
