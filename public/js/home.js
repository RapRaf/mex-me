/* Home: campo "nuovo task", filtri, tabella dei task con sottotask annidati. */
import { $, esc, st, opts, sd, ago, today, isDate, ls, lsJson } from './util.js';
import { db, app, idx, desc, walk, asg, ulist, isLate, clipBtn, chatBtn } from './state.js';
import { create, setStatus } from './net.js';
import { PRIO, LABELS } from './prio.js';
import { openDlg } from './dialog.js';
import { openChat } from './chat.js';
import { openFiles } from './attach.js';

/* ---------- filtri ---------- */
// Stato e ricerca valgono per la sessione; persona, priorità, label e ordine si ricordano (mx-home).
const SORTS = [
  ['stato', 'Per stato'],
  ['agg', 'Aggiornati di recente'],
  ['vecchi', 'Aperti da più tempo'],
  ['nuovi', 'Aperti da meno tempo'],
  ['scad', 'Scadenza più vicina'],
  ['prio', 'Priorità'],
  ['titolo', 'Titolo A–Z'],
];
const DEF = { u: '', p: '', l: '', o: 'stato' };
const f = { s: 'open', q: '', ...DEF, ...lsJson('mx-home', {}) };
if (!SORTS.some(x => x[0] === f.o)) f.o = DEF.o;
const saveF = () => ls.set('mx-home', JSON.stringify({ u: f.u, p: f.p, l: f.l, o: f.o }));
// Il vecchio interruttore "Solo i miei" diventa il filtro persona "I miei".
if (ls.get('mx-mine') !== null) { if (ls.get('mx-mine') === '1' && !f.u) f.u = '__me'; ls.del('mx-mine'); saveF(); }
const hcol = new Set(lsJson('mx-hcol', []));

const prioOf = t => PRIO.some(p => p[0] === t.priority) ? t.priority : 'med';
const labOf = t => LABELS.some(l => l[0] === t.label) ? t.label : '';
const tree = t => [t, ...desc(t.id)];
const who = () => f.u === '__me' ? app.profile : f.u;

/** Filtri diversi dallo stato: persona (anche su un sottotask), priorità, label, testo. */
function matchOthers(t) {
  if (f.u) {
    const u = who();
    if (f.u === '__none' ? !tree(t).some(x => !db.users[x.assigneeId]) : !tree(t).some(x => x.assigneeId === u)) return false;
  }
  if (f.p && prioOf(t) !== f.p) return false;
  if (f.l && (f.l === '__none' ? !!labOf(t) : labOf(t) !== f.l)) return false;
  if (f.q) { const q = f.q.toLowerCase(); if (!tree(t).some(x => ((x.title || '') + '\n' + (x.notes || '')).toLowerCase().includes(q))) return false; }
  return true;
}
const lateTree = t => tree(t).some(isLate);
const STATUS = {
  open: ['Aperti', t => st(t.status) !== 'done'],
  doing: ['In corso', t => st(t.status) === 'doing'],
  todo: ['Da fare', t => st(t.status) === 'todo'],
  late: ['In ritardo', t => st(t.status) !== 'done' && lateTree(t)],
  done: ['Fatti', t => st(t.status) === 'done'],
  all: ['Tutti', () => true],
};
if (!STATUS[f.s]) f.s = 'open';

const rank = { doing: 0, todo: 1, done: 2 }, prank = { high: 0, med: 1, low: 2 };
const s2 = v => String(v || '');
const po = t => typeof t.prioOrder === 'number' ? t.prioOrder : (t.order || 0);
const CMP = {
  stato: (a, b) => rank[st(a.status)] - rank[st(b.status)] || s2(b.updatedAt).localeCompare(s2(a.updatedAt)),
  agg: (a, b) => s2(b.updatedAt).localeCompare(s2(a.updatedAt)),
  vecchi: (a, b) => s2(a.createdAt).localeCompare(s2(b.createdAt)),
  nuovi: (a, b) => s2(b.createdAt).localeCompare(s2(a.createdAt)),
  // Senza scadenza in fondo.
  scad: (a, b) => (isDate(a.endDate) ? 0 : 1) - (isDate(b.endDate) ? 0 : 1) || s2(a.endDate).localeCompare(s2(b.endDate)) || s2(a.createdAt).localeCompare(s2(b.createdAt)),
  prio: (a, b) => prank[prioOf(a)] - prank[prioOf(b)] || po(a) - po(b),
  titolo: (a, b) => s2(a.title).localeCompare(s2(b.title), 'it', { sensitivity: 'base' }),
};

/* ---------- campo nuovo task ---------- */
export function renderParentSelect() {
  const s = $('#aP'), v = s.value;
  let h = '<option value="">＋ Nuovo task</option>';
  walk('', 0, (t, d) => { if (st(t.status) !== 'done') h += `<option value="${esc(t.id)}">${'   '.repeat(d)}${d ? '↳ ' : ''}${esc(t.title || 'Senza titolo')}</option>`; });
  s.innerHTML = h;
  s.value = [...s.options].some(o => o.value === v) ? v : '';
  updAdd();
  $('#aT').disabled = s.disabled = $('#aB').disabled = !app.canWrite;
}
function updAdd() {
  const v = $('#aP').value;
  $('#aB').textContent = v ? 'Aggiungi sottotask' : 'Aggiungi task';
  $('#aT').placeholder = v ? 'Scrivi il sottotask e premi Invio…' : 'Scrivi un task e premi Invio…';
}

/* ---------- barra dei filtri ---------- */
const optsOf = (list, sel) => list.map(([k, l]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');
$('#hP').innerHTML = optsOf([['', 'Tutte le priorità'], ...PRIO], f.p);
$('#hL').innerHTML = optsOf([['', 'Tutte le label'], ...LABELS.map(([k, l]) => [k, l]), ['__none', 'Senza label']], f.l);
$('#hO').innerHTML = optsOf(SORTS.map(([k, l]) => [k, 'Ordina: ' + l]), f.o);
let uHtml = '';
function renderFilters() {
  const me = db.users[app.profile];
  const people = [['', 'Tutte le persone'], ...(me ? [['__me', `I miei (${me.name})`]] : []), ...ulist().filter(u => u.id !== app.profile).map(u => [u.id, u.name]), ['__none', 'Non assegnati']];
  // Una persona sparita (o il filtro "miei" senza profilo) torna a "Tutte".
  if (!people.some(p => p[0] === f.u)) f.u = '';
  const hu = $('#hU'), h = optsOf(people, f.u);
  if (h !== uHtml && document.activeElement !== hu) { uHtml = h; hu.innerHTML = h; }
  if (document.activeElement !== hu) hu.value = f.u;
  for (const [id, on] of [['#hU', f.u], ['#hP', f.p], ['#hL', f.l], ['#hO', f.o !== DEF.o]]) $(id).classList.toggle('on', !!on);
  $('#hQ').classList.toggle('on', !!f.q);
  $('#hR').hidden = !(f.u || f.p || f.l || f.q || f.o !== DEF.o || f.s !== 'open');
}

/* ---------- tabella ---------- */
/** Date su righe separate: Inizio, Fine (o completamento), poi da quanto esiste e ultimo aggiornamento. */
function datesCell(t, d, late) {
  const L = (k, v, c = '') => `<span class="dl${c}"><i>${k}</i>${v}</span>`;
  let h = '';
  if (isDate(t.startDate)) h += L('Inizio', sd(t.startDate));
  if (isDate(t.endDate)) h += L('Fine', sd(t.endDate) + (late ? ' · in ritardo' : ''), late ? ' late' : '');
  if (!d) {
    h += L(st(t.status) === 'done' ? 'Creato' : 'Aperto', t.createdAt ? esc(ago(t.createdAt)) : '—');
    if (st(t.status) === 'done' && t.completedAt) h += L('Chiuso', esc(ago(t.completedAt)));
    else h += L('Aggiornato', t.updatedAt ? esc(ago(t.updatedAt)) : '—');
  }
  return h || (d ? '' : '<span class="dl none">—</span>');
}

export function renderList() {
  if ($('#home').hidden) return;
  renderFilters();
  const roots = idx.cm[''] || [], base = roots.filter(matchOthers);
  $('#chips').innerHTML = Object.entries(STATUS).map(([k, [l, fn]]) => `<button class="chip${k === 'late' ? ' clate' : ''}" data-f="${k}" aria-pressed="${f.s === k}">${l}<b>${base.filter(fn).length}</b></button>`).join('');
  const rows = base.filter(STATUS[f.s][1]).sort(CMP[f.o]);
  $('#hN').textContent = rows.length === roots.length ? '' : `${rows.length} di ${roots.length} task`;
  const tk = today(), list = $('#list'), hideDone = f.s !== 'done' && f.s !== 'all';
  list.classList.toggle('gl', !!rows.length);
  if (!rows.length) {
    const others = f.u || f.p || f.l || f.q;
    list.innerHTML = `<div class="empty"><h2>${roots.length ? 'Niente in questa vista' : 'Nessun task ancora'}</h2><p>${roots.length ? (others ? 'Prova un altro filtro o premi “Azzera filtri”.' : 'Prova un altro filtro.') : 'Scrivi il primo task nel campo in alto e premi Invio.'}</p></div>`;
    return;
  }
  const row = (t, d, rootId) => {
    const s = st(t.status), ds = desc(t.id), dn = ds.filter(x => st(x.status) === 'done').length;
    const late = s !== 'done' && isDate(t.endDate) && t.endDate < tk, sub = (t.notes || '').trim();
    const kids = (idx.cm[t.id] || []).length;
    return `<tr class="s-${s} ${d ? 'sr' : 'rr'}" style="--d:${d}" data-id="${esc(rootId)}" data-focus="${esc(t.id)}" tabindex="0" aria-label="Apri ${esc(t.title || 'task')}">
      <td class="tc"><span class="tt">${kids ? `<button class="hx" type="button" data-hx="${esc(t.id)}" aria-expanded="${!hcol.has(t.id)}" aria-label="${hcol.has(t.id) ? 'Mostra' : 'Nascondi'} sottotask">${hcol.has(t.id) ? '▸' : '▾'}</button>` : '<span class="hxs"></span>'}${d ? '<span class="arr">↳</span>' : ''}${esc(t.title || 'Senza titolo')}${clipBtn(t.id)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</td>
      <td class="tm">${chatBtn(t.id)}</td>
      <td class="ts"><select class="pill" data-st="${esc(t.id)}" aria-label="Stato"${app.canWrite ? '' : ' disabled'}>${opts(s)}</select></td>
      <td class="tp">${asg(t.assigneeId)}</td>
      <td class="tp">${ds.length ? `<span class="prog"><i style="--p:${Math.round(dn / ds.length * 100)}%"></i>${dn}/${ds.length} fatti</span>` : (d ? '' : '<span class="prog">—</span>')}</td>
      <td class="tdt num">${datesCell(t, d, late)}</td></tr>`;
  };
  let body = '';
  rows.forEach((t, gi) => {
    let g = row(t, 0, t.id), hid = 0;
    const sub = (id, d) => {
      if (d > 60 || hcol.has(id)) return;
      for (const c of idx.cm[id] || []) {
        // Nelle viste dei task aperti i sottotask fatti sono riassunti in una riga.
        if (hideDone && st(c.status) === 'done') { hid += 1 + desc(c.id).length; continue; }
        g += row(c, d, t.id); sub(c.id, d + 1);
      }
    };
    sub(t.id, 1);
    if (hid) g += `<tr class="sr dnr s-done" style="--d:1" data-id="${esc(t.id)}" data-focus="${esc(t.id)}" tabindex="0"><td class="tc" colspan="6">✓ ${hid} sottotask ${hid === 1 ? 'fatto' : 'fatti'} nascost${hid === 1 ? 'o' : 'i'} · apri per vederli</td></tr>`;
    body += (gi ? '<tbody class="gp" aria-hidden="true"><tr><td colspan="6"></td></tr></tbody>' : '') + `<tbody class="g${gi % 2 ? ' alt' : ''}">${g}</tbody>`;
  });
  // Non ricostruire la tabella mentre si sceglie uno stato dal menu di una riga.
  const ae = document.activeElement;
  if (ae && ae.matches('#list select[data-st]')) { deferred = true; return; }
  deferred = false;
  list.innerHTML = `<table><thead><tr><th>Task</th><th>Note</th><th>Stato</th><th>Assegnato</th><th>Sottotask</th><th>Date</th></tr></thead>${body}</table>`;
}
let deferred = false;

/* ---------- eventi ---------- */
$('#aP').onchange = updAdd;
$('#add').addEventListener('submit', e => {
  e.preventDefault();
  const i = $('#aT'), v = i.value.trim();
  if (!v) return;
  i.value = ''; create(v, $('#aP').value || null); i.focus();
});
$('#chips').onclick = e => { const b = e.target.closest('.chip'); if (b) { f.s = b.dataset.f; renderList(); } };
for (const [id, k] of [['#hU', 'u'], ['#hP', 'p'], ['#hL', 'l'], ['#hO', 'o']]) $(id).addEventListener('change', e => { f[k] = e.target.value; saveF(); renderList(); });
$('#hQ').addEventListener('input', e => { f.q = e.target.value.trim(); renderList(); });
$('#hR').onclick = () => {
  Object.assign(f, DEF, { s: 'open', q: '' });
  $('#hQ').value = ''; $('#hP').value = f.p; $('#hL').value = f.l; $('#hO').value = f.o;
  saveF(); renderList();
};
const list = $('#list');
list.addEventListener('change', e => { const s = e.target.closest('[data-st]'); if (s) { s.blur(); setStatus(s.dataset.st, s.value); } });
list.addEventListener('focusout', () => { if (deferred) setTimeout(() => { if (deferred) renderList(); }, 0); });
list.addEventListener('click', e => {
  if (e.target.closest('select')) return;
  const hx = e.target.closest('[data-hx]');
  if (hx) { const id = hx.dataset.hx; hcol.has(id) ? hcol.delete(id) : hcol.add(id); ls.set('mx-hcol', JSON.stringify([...hcol])); renderList(); return; }
  const cb = e.target.closest('[data-chat]'); if (cb) { openChat(cb.dataset.chat); return; }
  const fb = e.target.closest('[data-files]'); if (fb) { openFiles(fb.dataset.files); return; }
  const r = e.target.closest('tr[data-id]'); if (r) openDlg(r.dataset.id, r.dataset.focus);
});
list.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('tr[data-id]')) openDlg(e.target.dataset.id, e.target.dataset.focus); });
