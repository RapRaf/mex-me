/* Bug: segnalazione (titolo, descrizione, allegati), revisione e conferma.
   Confermare un bug lo trasforma subito in un task "Da fare" assegnato a chi conferma. */
import { $, esc, st, S, ago, fsize, arm, ext, fileUrl, av, UPI, CHECK } from './util.js';
import { db, app, idx, banner, setSave } from './state.js';
import { ask, writeErr, rid, sendFile, delAttachment } from './net.js';
import { openDlg } from './dialog.js';

const TABS = [['open', 'Da revisionare'], ['confirmed', 'Confermati'], ['rejected', 'Scartati']];
const EMPTY = {
  open: ['Nessun bug da revisionare', 'Quando qualcuno ne segnala uno, compare qui.'],
  confirmed: ['Nessun bug confermato', 'I bug confermati restano qui, collegati al loro task.'],
  rejected: ['Nessun bug scartato', 'Qui finiscono le segnalazioni che non sono bug, e si possono riaprire.'],
};
let bFilter = 'open', bHtml = '', chipsHtml = '', editing = null, upBug = null, sending = false, fresh = null;
/** File scelti per il bug che si sta scrivendo: {file, url} (url = anteprima locale delle immagini). */
let pending = [];

const uname = id => (db.users[id] && db.users[id].name) || 'qualcuno';
const IMG = /^image\/(png|jpeg|gif|webp|avif|bmp)$/;
const extOf = name => esc(ext(name).toUpperCase().slice(0, 4) || 'FILE');

/** Miniatura di un file: immagine o estensione, nome al passaggio del mouse, × per toglierlo. */
function thumb({ href, img, name, size, del }) {
  const inner = img ? `<img src="${esc(img)}" alt="">` : `<span class="bext">${extOf(name)}</span><span class="bfn">${esc(name)}</span>`;
  return `<span class="bth" title="${esc(name)} (${esc(fsize(size))})">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener" aria-label="Apri ${esc(name)}">${inner}</a>` : inner}${del ? `<button class="bx" type="button" ${del} aria-label="Togli ${esc(name)}">×</button>` : ''}</span>`;
}
const attThumb = (a, canDel) => thumb({ href: fileUrl(a.id), img: IMG.test(String(a.contentType || '')) ? fileUrl(a.id) : '', name: a.name || 'File', size: +a.sizeBytes || 0, del: canDel ? `data-fdel="${esc(a.id)}"` : '' });

function card(b) {
  const mine = b.reportedBy === app.profile, dis = app.canWrite ? '' : ' disabled', t = b.taskId ? db.tasks[b.taskId] : null;
  const files = b.status === 'confirmed' ? (t ? idx.attBy[t.id] || [] : []) : idx.attByBug[b.id] || [];
  const canDel = b.status !== 'confirmed' && app.canWrite;
  let foot;
  if (b.status === 'open') {
    foot = `<footer class="bact">
      <button class="bgo" type="button" data-b="confirm"${dis}>${CHECK}Conferma e prendi in carico</button>
      <button class="btn" type="button" data-b="file"${dis}>${UPI}Allega</button>
      ${mine ? `<button class="btn" type="button" data-b="edit"${dis}>Modifica</button>` : ''}
      <span class="bsp"></span>
      <button class="blink" type="button" data-b="reject"${dis}>Scarta</button>
      ${mine ? `<button class="blink danger" type="button" data-b="del"${dis}>Elimina</button>` : ''}
    </footer>`;
  } else if (b.status === 'confirmed') {
    const s = t ? st(t.status) : '';
    foot = `<div class="bres ok">
      <span class="bstamp">${CHECK}<span>Confermato da <b>${esc(uname(b.reviewedBy))}</b> ${esc(ago(b.reviewedAt))}</span></span>
      ${t ? `<button class="btask s-${s}" type="button" data-b="task" aria-label="Apri il task ${esc(t.title || '')}"><span class="pill sp">${S[s]}</span><span class="btt">${t.title && t.title !== b.title ? esc(t.title) : `<span class="bwho">${av(db.users[t.assigneeId])}${esc(db.users[t.assigneeId] ? db.users[t.assigneeId].name : 'Non assegnato')}</span>`}</span><span class="bopen">Apri il task</span></button>`
        : '<span class="bgone">Il task è stato eliminato.</span>'}
    </div>`;
  } else {
    foot = `<div class="bres no">
      <span class="bstamp"><span>Scartato da <b>${esc(uname(b.reviewedBy))}</b> ${esc(ago(b.reviewedAt))}</span></span>
      <span class="bsp"></span>
      <button class="btn" type="button" data-b="reopen"${dis}>Riapri</button>
      ${mine ? `<button class="blink danger" type="button" data-b="del"${dis}>Elimina</button>` : ''}
    </div>`;
  }
  return `<article class="bug b-${b.status}${editing === b.id ? ' editing' : ''}${fresh === b.id ? ' fresh' : ''}" data-bug="${esc(b.id)}">
    <header class="bh"><h3>${esc(b.title || 'Senza titolo')}</h3>
      <span class="bby">${av(db.users[b.reportedBy])}<span><b>${esc(uname(b.reportedBy))}</b><time datetime="${esc(b.createdAt)}">${esc(ago(b.createdAt))}</time></span></span></header>
    ${b.text ? `<p class="btx">${esc(b.text)}</p>` : ''}
    ${files.length ? `<div class="bthumbs">${files.map(a => attThumb(a, canDel)).join('')}</div>` : ''}
    ${foot}</article>`;
}

/** Badge dei bug da revisionare sulla voce "Bug" del menu (sempre) e la vista (se aperta). */
export function renderBugs() {
  const all = Object.values(db.bugs), nOpen = all.filter(b => b.status === 'open').length, nb = $('#nBugN');
  nb.textContent = nOpen; nb.hidden = !nOpen;
  $('#nBug').setAttribute('aria-label', nOpen ? `Bug, ${nOpen} da revisionare` : 'Bug');
  if ($('#bugs').hidden) return;
  const ch = TABS.map(([k, l]) => `<button class="chip" data-bf="${k}" aria-pressed="${bFilter === k}">${l}<b>${all.filter(b => b.status === k).length}</b></button>`).join('');
  if (ch !== chipsHtml) { chipsHtml = ch; $('#bChips').innerHTML = ch; }
  $('#bHow').hidden = bFilter !== 'open';
  const when = b => String(b.status === 'open' ? b.createdAt : b.reviewedAt || b.updatedAt || '');
  const list = all.filter(b => b.status === bFilter).sort((a, b) => when(b).localeCompare(when(a)));
  const [eh, ep] = EMPTY[bFilter];
  const h = list.length ? list.map(card).join('') : `<div class="bempty">${CHECK}<h2>${eh}</h2><p>${ep}</p></div>`;
  // Si ricostruisce solo se cambia qualcosa (anche i "x min fa"): le anteprime non si ricaricano.
  if (h !== bHtml) { bHtml = h; $('#bList').innerHTML = h; }
  renderForm();
}

/* ---------- modulo: nuovo bug o modifica ---------- */
function renderForm() {
  // Il bug in modifica è stato confermato o eliminato da qualcun altro: il testo scritto resta nel modulo.
  if (editing && (!db.bugs[editing] || db.bugs[editing].status === 'confirmed')) {
    editing = null;
    banner('Il bug che stavi modificando è appena diventato un task (o è stato eliminato): le modifiche non sono state salvate.');
  }
  $('#bNewC').classList.toggle('editing', !!editing);
  $('#bNewH').textContent = editing ? 'Modifica il bug' : 'Segnala un bug';
  $('#bSend').textContent = sending ? 'Invio…' : editing ? 'Salva modifiche' : 'Segnala bug';
  $('#bCancel').hidden = !editing;
  for (const el of ['#bT', '#bD', '#bSend', '#bAtt']) $(el).disabled = !app.canWrite || sending;
  const h = pending.map((p, i) => thumb({ img: p.url, name: p.file.name, size: p.file.size, del: `data-pdel="${i}"` })).join('');
  if ($('#bPend').dataset.h !== h) { $('#bPend').dataset.h = h; $('#bPend').innerHTML = h; }
  $('#bPend').hidden = !pending.length;
}
function addPending(files) {
  for (const file of files) pending.push({ file, url: IMG.test(file.type) ? URL.createObjectURL(file) : '' });
  renderForm();
}
function clearPending() { for (const p of pending) if (p.url) URL.revokeObjectURL(p.url); pending = []; }
function stopEdit() { editing = null; $('#bT').value = ''; $('#bD').value = ''; }

async function submit(e) {
  e.preventDefault();
  if (!app.canWrite || sending) return;
  const title = $('#bT').value.trim(), text = $('#bD').value.trim();
  if (!title) { $('#bT').classList.add('bad'); $('#bT').focus(); return; }
  sending = true; renderForm();
  const wasEdit = !!editing, id = editing || rid();
  const r = wasEdit ? await ask('bug:edit', { id, title, text }) : await ask('bug:create', { id, title, text });
  sending = false;
  if (!r.ok) { renderForm(); writeErr(r); return; }
  const files = pending.map(p => p.file), bugId = wasEdit ? id : r.bug.id;
  clearPending(); stopEdit();
  if (!wasEdit) bFilter = 'open';
  setSave(wasEdit ? 'Modifiche salvate ✓' : 'Bug segnalato ✓');
  renderBugs();
  if (files.length) await uploadTo(bugId, files);
}

/** Carica i file sul bug uno alla volta, con l'avanzamento accanto ai filtri. */
async function uploadTo(bugId, files) {
  let ok = 0; const errs = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i], pre = files.length > 1 ? `Caricamento ${i + 1} di ${files.length}` : `Caricamento di ${f.name}`;
    setSave(pre + '…');
    try { await sendFile(f, { bugId }, (l, tot) => setSave(`${pre} · ${Math.round(l / tot * 100)}%`)).promise; ok++; }
    catch (e) { errs.push(f.name + (e.code === 'not_found' ? ' (il bug non esiste più)' : e.code === 'forbidden' ? ' (il bug è già un task: allegalo al task)' : '')); }
  }
  setSave(ok ? `${ok} file caricat${ok === 1 ? 'o' : 'i'} ✓` : '');
  banner(errs.length ? 'Non caricati: ' + errs.join(', ') + '.' : '');
}

/** Screenshot incollati: un nome leggibile al posto di "image.png". */
const named = files => {
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.');
  return files.map((f, i) => f.name && f.name !== 'image.png' ? f : new File([f], `Screenshot ${stamp}${i ? ' ' + (i + 1) : ''}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }));
};
const pickFiles = bugId => { upBug = bugId; const f = $('#bFileIn'); f.value = ''; f.click(); };

/* ---------- eventi ---------- */
$('#bAtt').innerHTML = UPI + 'Scegli file';
$('#bNew').addEventListener('submit', submit);
$('#bNew').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e); });
$('#bT').addEventListener('input', e => e.target.classList.remove('bad'));
$('#bCancel').onclick = () => { stopEdit(); clearPending(); renderForm(); };
$('#bAtt').onclick = () => pickFiles(null);
$('#bFileIn').onchange = e => {
  const fs = [...e.target.files]; if (!fs.length) return;
  if (upBug) uploadTo(upBug, fs); else addPending(fs);
};
$('#bPend').addEventListener('click', e => {
  const b = e.target.closest('[data-pdel]'); if (!b) return;
  const [p] = pending.splice(+b.dataset.pdel, 1); if (p && p.url) URL.revokeObjectURL(p.url);
  renderForm();
});
$('#bChips').onclick = e => { const b = e.target.closest('[data-bf]'); if (b) { bFilter = b.dataset.bf; renderBugs(); } };

$('#bList').addEventListener('click', async e => {
  const fd = e.target.closest('[data-fdel]');
  if (fd) { if (arm(fd, 'Elimina?', '×')) delAttachment(fd.dataset.fdel); return; }
  const btn = e.target.closest('[data-b]'), c = e.target.closest('[data-bug]'); if (!btn || !c) return;
  const id = c.dataset.bug, b = db.bugs[id], act = btn.dataset.b; if (!b) return;
  if (act === 'task') { if (db.tasks[b.taskId]) openDlg(b.taskId); return; }
  if (act === 'file') { pickFiles(id); return; }
  if (act === 'edit') {
    editing = id; $('#bT').value = b.title || ''; $('#bD').value = b.text || '';
    renderBugs(); $('#bNewC').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); $('#bT').focus({ preventScroll: true });
    return;
  }
  if (act === 'reject' && !arm(btn, 'Conferma: scarta', 'Scarta')) return;
  if (act === 'del' && !arm(btn, 'Conferma eliminazione', 'Elimina')) return;
  const ev = { confirm: 'bug:confirm', reject: 'bug:reject', reopen: 'bug:reopen', del: 'bug:delete' }[act]; if (!ev) return;
  btn.disabled = true;
  const r = await ask(ev, { id });
  if (!r.ok) { btn.disabled = false; writeErr(r); return; }
  if (act === 'del' && editing === id) stopEdit();
  // Dopo la conferma si resta sul bug, ora nei Confermati, per vedere il task appena nato.
  if (act === 'confirm') { fresh = id; bFilter = 'confirmed'; renderBugs(); setTimeout(() => { if (fresh === id) fresh = null; }, 1500); const el = $(`#bList [data-bug="${CSS.escape(id)}"]`); if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  setSave({ confirm: 'Bug confermato: ora è un tuo task da fare ✓', reject: 'Bug scartato', reopen: 'Bug riaperto', del: 'Bug eliminato' }[act]);
});

// Trascinare file: sul modulo vanno nel bug che si sta scrivendo, su un bug non confermato vengono caricati lì.
const bugsView = () => !$('#bugs').hidden && !app.curId && !app.filesFor && !app.chatFor && app.canWrite;
const hasFiles = e => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
const target = e => e.target.closest('#bNewC') || e.target.closest('.bug.b-open,.bug.b-rejected');
const view = $('#bugs');
const clearOn = () => { for (const x of view.querySelectorAll('.dropon')) x.classList.remove('dropon'); };
view.addEventListener('dragover', e => {
  if (!hasFiles(e) || !bugsView()) return;
  const t = target(e); if (!t) return;
  e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  if (!t.classList.contains('dropon')) { clearOn(); t.classList.add('dropon'); }
});
view.addEventListener('dragleave', e => { if (!view.contains(e.relatedTarget)) clearOn(); });
view.addEventListener('drop', e => {
  clearOn();
  if (!hasFiles(e) || !bugsView()) return;
  const t = target(e); if (!t) return;
  e.preventDefault();
  const fs = [...e.dataTransfer.files]; if (!fs.length) return;
  if (t.id === 'bNewC') addPending(fs); else uploadTo(t.dataset.bug, fs);
});
// Ctrl+V di uno screenshot nella pagina Bug: va tra i file del bug che si sta scrivendo.
document.addEventListener('paste', e => {
  const cd = e.clipboardData;
  if (!cd || !bugsView() || !cd.files.length || [...cd.types].includes('text/plain')) return;
  e.preventDefault();
  addPending(named([...cd.files]));
});
