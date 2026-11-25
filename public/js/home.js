/* Home: campo "nuovo task", filtri, tabella dei task con sottotask annidati. */
import { $, esc, st, opts, sd, ago, today, av, ucol, isDate, ls, lsJson } from './util.js';
import { db, app, idx, desc, walk, asg, mineTree, clipBtn, chatBtn } from './state.js';
import { create, setStatus } from './net.js';
import { openDlg } from './dialog.js';
import { openChat } from './chat.js';
import { openFiles } from './attach.js';

let filter = 'open';
let onlyMine = ls.get('mx-mine') === '1';
const hcol = new Set(lsJson('mx-hcol', []));

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

export function renderList() {
  if ($('#home').hidden) return;
  const roots = idx.cm[''] || [], n = { open: 0, doing: 0, todo: 0, done: 0 };
  for (const t of roots) { const s = st(t.status); n[s]++; if (s !== 'done') n.open++; }
  const F = [['open', 'Aperti'], ['doing', 'In corso'], ['todo', 'Da fare'], ['done', 'Fatti']];
  $('#chips').innerHTML = F.map(([k, l]) => `<button class="chip" data-f="${k}" aria-pressed="${filter === k}">${l}<b>${n[k]}</b></button>`).join('');
  const rank = { doing: 0, todo: 1, done: 2 };
  const pu = db.users[app.profile], mb = $('#mineB');
  mb.hidden = !pu;
  if (pu) { mb.style.setProperty('--c', ucol(pu)); mb.innerHTML = `${av(pu)}Solo i miei`; mb.setAttribute('aria-pressed', onlyMine); }
  const rows = roots.filter(t => (filter === 'open' ? st(t.status) !== 'done' : st(t.status) === filter) && (!onlyMine || !pu || mineTree(t)))
    .sort((a, b) => rank[st(a.status)] - rank[st(b.status)] || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  const tk = today(), list = $('#list');
  list.classList.toggle('gl', !!rows.length);
  if (!rows.length) {
    list.innerHTML = `<div class="empty"><h2>${roots.length ? 'Niente in questa vista' : 'Nessun task ancora'}</h2><p>${roots.length ? (onlyMine ? 'Prova un altro filtro o togli “Solo i miei”.' : 'Prova un altro filtro.') : 'Scrivi il primo task nel campo in alto e premi Invio.'}</p></div>`;
    return;
  }
  const row = (t, d, rootId) => {
    const s = st(t.status), ds = desc(t.id), dn = ds.filter(x => st(x.status) === 'done').length;
    const late = s !== 'done' && isDate(t.endDate) && t.endDate < tk, sub = d ? '' : (t.notes || '').split('\n')[0];
    const kids = (idx.cm[t.id] || []).length;
    return `<tr class="s-${s} ${d ? 'sr' : 'rr'}" style="--d:${d}" data-id="${esc(rootId)}" data-focus="${esc(t.id)}" tabindex="0" aria-label="Apri ${esc(t.title || 'task')}">
      <td class="tc"><span class="tt">${kids ? `<button class="hx" type="button" data-hx="${esc(t.id)}" aria-expanded="${!hcol.has(t.id)}" aria-label="${hcol.has(t.id) ? 'Mostra' : 'Nascondi'} sottotask">${hcol.has(t.id) ? '▸' : '▾'}</button>` : '<span class="hxs"></span>'}${d ? '<span class="arr">↳</span>' : ''}${esc(t.title || 'Senza titolo')}${clipBtn(t.id)}</span>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</td>
      <td class="tm">${chatBtn(t.id)}</td>
      <td class="ts"><select class="pill" data-st="${esc(t.id)}" aria-label="Stato"${app.canWrite ? '' : ' disabled'}>${opts(s)}</select></td>
      <td class="tp">${asg(t.assigneeId)}</td>
      <td class="tp">${ds.length ? `<span class="prog"><i style="--p:${Math.round(dn / ds.length * 100)}%"></i>${dn}/${ds.length} fatti</span>` : (d ? '' : '<span class="prog">—</span>')}</td>
      <td class="td num" data-l="Inizio">${sd(t.startDate)}</td>
      <td class="td num${late ? ' late' : ''}" data-l="Fine">${sd(t.endDate)}${late ? ' · in ritardo' : ''}</td>
      <td class="tu num" style="color:var(--mute)">${t.updatedAt ? ago(t.updatedAt) : '—'}</td></tr>`;
  };
  let body = '';
  rows.forEach((t, gi) => {
    let g = row(t, 0, t.id), hid = 0;
    const sub = (id, d) => {
      if (d > 60 || hcol.has(id)) return;
      for (const c of idx.cm[id] || []) {
        // Nelle viste dei task aperti i sottotask fatti sono riassunti in una riga.
        if (filter !== 'done' && st(c.status) === 'done') { hid += 1 + desc(c.id).length; continue; }
        g += row(c, d, t.id); sub(c.id, d + 1);
      }
    };
    sub(t.id, 1);
    if (hid) g += `<tr class="sr dnr s-done" style="--d:1" data-id="${esc(t.id)}" data-focus="${esc(t.id)}" tabindex="0"><td class="tc" colspan="8">✓ ${hid} sottotask ${hid === 1 ? 'fatto' : 'fatti'} nascost${hid === 1 ? 'o' : 'i'} · apri per vederli</td></tr>`;
    body += (gi ? '<tbody class="gp" aria-hidden="true"><tr><td colspan="8"></td></tr></tbody>' : '') + `<tbody class="g${gi % 2 ? ' alt' : ''}">${g}</tbody>`;
  });
  // Non ricostruire la tabella mentre si sceglie uno stato dal menu di una riga.
  const ae = document.activeElement;
  if (ae && ae.matches('#list select[data-st]')) { deferred = true; return; }
  deferred = false;
  list.innerHTML = `<table><thead><tr><th>Task</th><th>Note</th><th>Stato</th><th>Assegnato</th><th>Sottotask</th><th>Inizio</th><th>Fine</th><th>Aggiornato</th></tr></thead>${body}</table>`;
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
$('#chips').onclick = e => { const b = e.target.closest('.chip'); if (b) { filter = b.dataset.f; renderList(); } };
$('#mineB').onclick = () => { onlyMine = !onlyMine; ls.set('mx-mine', onlyMine ? '1' : '0'); renderList(); };
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
