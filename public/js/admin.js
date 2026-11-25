/* Admin (sola lettura): KPI, calendario a griglia (solo aperture e chiusure) e agenda. */
import { $, esc, st, S, sd, key, today, isDate, dk, days, fDay, fWdS, fMon, ucol } from './util.js';
import { db, isLate, asg, ulist, clipBtn, chatBtn } from './state.js';
import { openDlg } from './dialog.js';
import { openChat } from './chat.js';
import { openFiles } from './attach.js';

let aView = 'grid', aMonth = new Date(), aSel = today(), fU = '', fS = '', fL = '', fQ = '', onlyK = false;
aMonth.setDate(1); aMonth.setHours(12, 0, 0, 0);
export const setAdminView = v => { aView = v; };

function amatch(t, noStatus) {
  if (fU && (fU === '__none' ? !!db.users[t.assigneeId] : t.assigneeId !== fU)) return false;
  if (fL === 'root' && t.parentId && db.tasks[t.parentId]) return false;
  if (fQ && !((t.title || '') + ' ' + (t.notes || '')).toLowerCase().includes(fQ.toLowerCase())) return false;
  if (!noStatus && fS) { const s = st(t.status); if (fS === 'open' ? s === 'done' : fS === 'late' ? !isLate(t) : s !== fS) return false; }
  return true;
}
/**
 * Intervallo di un task: inizio = startDate, altrimenti endDate; fine = endDate, altrimenti
 * completamento (se fatto), oggi (se in corso), altrimenti = inizio. Senza date: null.
 */
function span(t) {
  let a = isDate(t.startDate) ? t.startDate : null, b = isDate(t.endDate) ? t.endDate : null; const s = st(t.status);
  if (!a && !b) return null; if (!a) a = b;
  if (!b) { if (s === 'done' && t.completedAt) b = key(new Date(t.completedAt)); else if (s === 'doing') b = today() > a ? today() : a; else b = a; }
  return b < a ? [b, a] : [a, b];
}

export function renderAdmin() {
  if ($('#admin').hidden) return;
  const fu = $('#fU');
  if (document.activeElement !== fu) { fu.innerHTML = '<option value="">Tutte le persone</option>' + ulist().map(u => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('') + '<option value="__none">Non assegnati</option>'; fu.value = fU; }
  const base = Object.values(db.tasks).filter(t => amatch(t, true)), cm1 = new Date().toISOString().slice(0, 7);
  const K = [['Aperti', base.filter(t => st(t.status) !== 'done').length, 's-todo'], ['In corso', base.filter(t => st(t.status) === 'doing').length, 's-doing'], ['Da fare', base.filter(t => st(t.status) === 'todo').length, 's-todo'], ['In ritardo', base.filter(isLate).length, 'late'], ['Fatti questo mese', base.filter(t => st(t.status) === 'done' && String(t.completedAt || '').slice(0, 7) === cm1).length, 's-done']];
  $('#kpis').innerHTML = K.map(([l, n, c]) => `<div class="kpi ${c}"><b>${n}</b><span>${l}</span></div>`).join('');
  for (const [id, v] of [['#avG', 'grid'], ['#avL', 'list']]) { if (aView === v) $(id).setAttribute('aria-current', 'page'); else $(id).removeAttribute('aria-current'); }
  renderCal();
}
function calItems() {
  const out = [];
  for (const t of Object.values(db.tasks)) { if (!amatch(t)) continue; const sp = span(t); if (sp) out.push({ t, a: sp[0], b: sp[1] }); }
  out.sort((x, y) => x.a.localeCompare(y.a) || (x.t.order || 0) - (y.t.order || 0));
  return out;
}
function kindOf(it, d) {
  const s = st(it.t.status);
  if (it.ev) return [(it.root ? 'Task ' : 'Sottotask ') + (it.ev === 'open' ? 'aperto' : 'chiuso'), it.ev === 'open' ? 'k-s' : 'k-d'];
  if (it.a === it.b) return s === 'done' ? ['Completato', 'k-d'] : ['Giornata', 'k-s'];
  if (d === it.a) return ['Inizio', 'k-s'];
  if (d === it.b) return s === 'done' ? ['Completato', 'k-d'] : isDate(it.t.endDate) ? ['Scadenza', 'k-e'] : ['Oggi', 'k-s'];
  return [`In corso · giorno ${days(it.a, d)} di ${days(it.a, it.b)}`, ''];
}
function entry(it, d) {
  const t = it.t, u = db.users[t.assigneeId], [k, kc] = kindOf(it, d), root = t.parentId && db.tasks[t.rootId] && t.rootId !== t.id ? db.tasks[t.rootId] : null;
  return `<div class="ag-e s-${st(t.status)}" style="--c:${u ? ucol(u) : '#8a93a6'}" data-id="${esc(root ? root.id : t.id)}" data-focus="${esc(t.id)}" tabindex="0">
    <span class="ag-k ${kc}">${esc(k)}</span><span class="ag-t"><b>${esc(t.title || 'Senza titolo')}</b><small>${root ? 'in ' + esc(root.title || '') + ' · ' : ''}${sd(it.a)}${it.b !== it.a ? ' → ' + sd(it.b) : ''}${isLate(t) ? ' · in ritardo' : ''}</small></span>
    ${asg(t.assigneeId)}<span class="pill sp s-${st(t.status)}">${S[st(t.status)]}</span>${clipBtn(t.id)}${chatBtn(t.id)}</div>`;
}
function renderCal() {
  $('#cMonth').textContent = fMon.format(aMonth); $('#onlyKW').hidden = aView !== 'list';
  const items = calItems(), y = aMonth.getFullYear(), m = aMonth.getMonth(), first = key(new Date(y, m, 1, 12)), last = key(new Date(y, m + 1, 0, 12));
  const nod = Object.values(db.tasks).filter(t => amatch(t) && !span(t) && (aView === 'list' || (t.parentId && db.tasks[t.parentId]))).length;
  $('#cNote').textContent = aView === 'grid' ? '▸ aperto · ✓ chiuso · bordato = task principale' : nod ? `${nod} task senza date non compaiono nel calendario` : '';
  const byDay = d => items.filter(it => it.a <= d && it.b >= d);
  const isRoot = t => !(t.parentId && db.tasks[t.parentId]);
  const dayOf = iso => { const x = new Date(iso); return isNaN(x) ? null : key(x); };
  // Griglia: solo eventi di apertura (inizio o creazione) e chiusura (completamento), mai i giorni "in corso".
  const rootEv = [];
  for (const t of Object.values(db.tasks)) {
    if (!amatch(t)) continue;
    const o = isDate(t.startDate) ? t.startDate : t.createdAt ? dayOf(t.createdAt) : null;
    const c = st(t.status) === 'done' ? (t.completedAt ? dayOf(t.completedAt) : isDate(t.endDate) ? t.endDate : null) : null;
    if (o) rootEv.push({ t, a: o, b: o, ev: 'open', root: isRoot(t) });
    if (c) rootEv.push({ t, a: c, b: c, ev: 'close', root: isRoot(t) });
  }
  rootEv.sort((x, y) => (y.root - x.root) || (x.ev === 'close') - (y.ev === 'close') || (x.t.order || 0) - (y.t.order || 0));
  const byDayGrid = d => rootEv.filter(it => it.a === d);
  if (aView === 'grid') {
    $('#aList').innerHTML = '';
    const start = new Date(y, m, 1, 12); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(y, m + 1, 0, 12); end.setDate(end.getDate() + (7 - ((end.getDay() + 6) % 7) - 1));
    let h = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map(w => `<div class="wd">${w}</div>`).join(''); const tk = today();
    for (const c = new Date(start); c <= end; c.setDate(c.getDate() + 1)) {
      const d = key(c), its = byDayGrid(d), we = c.getDay() % 6 === 0;
      h += `<div class="cell${d < first || d > last ? ' out' : ''}${we ? ' we' : ''}${d === tk ? ' tdy' : ''}${d === aSel ? ' sel' : ''}" data-day="${d}" role="button" tabindex="0" aria-label="${esc(fDay.format(c))}, ${its.length} task"><span class="dn"><span>${c.getDate()}</span></span>
      ${its.slice(0, 4).map(it => { const u = db.users[it.t.assigneeId]; const pre = it.ev === 'open' ? '▸ ' : '✓ ', lab = (it.root ? 'Task ' : 'Sottotask ') + (it.ev === 'open' ? 'aperto: ' : 'chiuso: '); return `<span class="ch cs ce${it.root ? ' rt' : ''}${it.ev === 'close' ? ' cl' : ''}" style="--c:${u ? ucol(u) : '#8a93a6'}" title="${esc(lab + (it.t.title || '') + (u ? ' · ' + u.name : ''))}"><b>${pre}</b>${esc(it.t.title || 'Senza titolo')}</span>`; }).join('')}
      ${its.length > 4 ? `<span class="more">+${its.length - 4} altri</span>` : ''}</div>`;
    }
    $('#aGrid').innerHTML = `<div class="cal">${h}</div>`;
    const evs = byDayGrid(aSel), evIds = new Set(evs.map(it => it.t.id));
    const wip = items.filter(it => !isRoot(it.t) && it.a <= aSel && it.b >= aSel && !evIds.has(it.t.id));
    $('#aDay').innerHTML = `<div class="dayh"><h3>${esc(fDay.format(dk(aSel)))}</h3><span>${evs.length || wip.length ? '' : 'Nessun task in questo giorno'}</span></div>`
      + (evs.length ? `<div class="dayh" style="margin-top:4px"><h3 style="font-size:16px;text-transform:none">Aperti e chiusi</h3><span>${evs.length}</span></div>${evs.map(it => entry(it, aSel)).join('')}` : '')
      + (wip.length ? `<div class="dayh" style="margin-top:18px"><h3 style="font-size:16px;text-transform:none">Sottotask in lavorazione</h3><span>${wip.length}</span></div>${wip.map(it => entry(it, aSel)).join('')}` : '');
  } else {
    $('#aGrid').innerHTML = ''; $('#aDay').innerHTML = '';
    let h = ''; const tk = today();
    for (let i = 1; i <= new Date(y, m + 1, 0).getDate(); i++) {
      const dt = new Date(y, m, i, 12), d = key(dt);
      let its = byDay(d); if (onlyK) its = its.filter(it => d === it.a || d === it.b); if (!its.length) continue;
      h += `<div class="ag-day"><div class="ag-d${d === tk ? ' tdy' : ''}"><b>${i}</b><span>${esc(fWdS.format(dt))}${d === tk ? ' · oggi' : ''}</span></div><div>${its.map(it => entry(it, d)).join('')}</div></div>`;
    }
    $('#aList').innerHTML = h ? `<div class="card" style="padding:4px 18px">${h}</div>` : '<div class="card empty"><h2>Mese libero</h2><p>Nessun task con date in questo mese per i filtri scelti.</p></div>';
  }
}
function shiftCal(k) {
  aMonth = new Date(aMonth.getFullYear(), aMonth.getMonth() + k, 1, 12);
  if (aSel.slice(0, 7) !== key(aMonth).slice(0, 7)) aSel = key(aMonth);
  renderAdmin();
}
$('#cPrev').onclick = () => shiftCal(-1);
$('#cNext').onclick = () => shiftCal(1);
$('#cToday').onclick = () => { aMonth = new Date(); aMonth.setDate(1); aMonth.setHours(12, 0, 0, 0); aSel = today(); renderAdmin(); };
$('#onlyK').onchange = e => { onlyK = e.target.checked; renderAdmin(); };
$('#fU').onchange = e => { fU = e.target.value; renderAdmin(); };
$('#fS').onchange = e => { fS = e.target.value; renderAdmin(); };
$('#fL').onchange = e => { fL = e.target.value; renderAdmin(); };
$('#fQ').oninput = e => { fQ = e.target.value.trim(); renderAdmin(); };
// Da admin tutto si apre in sola lettura.
$('#admin').addEventListener('click', e => {
  const cb = e.target.closest('[data-chat]'); if (cb) { openChat(cb.dataset.chat, true); return; }
  const fb = e.target.closest('[data-files]'); if (fb) { openFiles(fb.dataset.files, true); return; }
  const o = e.target.closest('[data-focus]'); if (o) { openDlg(o.dataset.id, o.dataset.focus, true); return; }
  const c = e.target.closest('[data-day]'); if (c) { aSel = c.dataset.day; renderAdmin(); $('#aDay').scrollIntoView({ block: 'nearest' }); }
});
$('#admin').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const o = e.target.closest('[data-focus]'); if (o && e.target === o) { openDlg(o.dataset.id, o.dataset.focus, true); return; }
  const c = e.target.closest('[data-day]'); if (c && e.target === c) { aSel = c.dataset.day; renderAdmin(); }
});
