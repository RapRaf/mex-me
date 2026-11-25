/* Appunti: lavagna di testo e file condivisi in tempo reale, con chi è connesso. */
import { $, esc, av, ucol, ini, fsize, when, filePreview, fileUrl, arm, COPY, UPI } from './util.js';
import { socket, sendFile, rid } from './net.js';
import { db, app, banner } from './state.js';

let files = [];
/** Upload in corso (miei e degli altri): tempId -> {name, size, by, mine, loaded, total, speed, abort} */
const ghosts = new Map();
const ta = $('#cbText'), grid = $('#cbFiles'), zone = $('#cbDrop');
let onPresence = () => { };
export const setOnPresence = f => { onPresence = f; };

/* ---------- testo ---------- */
/** Aggiorna il testo senza far saltare il cursore di chi sta scrivendo. */
function setText(t) {
  t = typeof t === 'string' ? t : '';
  const old = ta.value;
  if (old === t) return;
  const focused = document.activeElement === ta, top = ta.scrollTop;
  let s = ta.selectionStart, e = ta.selectionEnd, p = 0;
  while (p < old.length && p < t.length && old[p] === t[p]) p++;
  const diff = t.length - old.length;
  if (s > p) s = Math.max(p, s + diff);
  if (e > p) e = Math.max(p, e + diff);
  ta.value = t;
  if (focused) ta.setSelectionRange(s, e);
  ta.scrollTop = top;
}
ta.addEventListener('input', () => socket.emit('clip:text', ta.value));
socket.on('clip:text', setText);

$('#cbCopy').innerHTML = COPY + 'Copia tutto';
$('#cbCopy').onclick = async e => {
  const b = e.currentTarget;
  let ok = false;
  try { await navigator.clipboard.writeText(ta.value); ok = true; }
  catch (x) { ta.focus(); ta.select(); try { ok = document.execCommand('copy'); } catch (y) { } }
  b.innerHTML = COPY + (ok ? 'Copiato ✓' : 'Non riuscito');
  setTimeout(() => { b.innerHTML = COPY + 'Copia tutto'; }, 1600);
};

/* ---------- file ---------- */
const speedTxt = bps => bps > 0 ? fsize(bps) + '/s' : 'Calcolo…';

function ghostHtml(id, g) {
  const pc = g.total ? Math.round(g.loaded / g.total * 100) : 0;
  return `<div class="fc up" data-ghost="${esc(id)}">
    <div class="fprev"><span class="upp">${pc}%</span><div class="upb"><i style="--p:${pc}%"></i></div></div>
    <div class="fmeta"><span class="fname">${esc(g.name)}</span><span class="fsub" data-t>${fsize(g.loaded)} / ${fsize(g.total || g.size || 0)}</span><span class="fsub speed" data-s>${esc(speedTxt(g.speed))}${g.by ? ' · ' + esc(g.mine ? 'tu' : g.by) : ''}</span></div>
    ${g.mine ? `<div class="fact"><button class="btn" type="button" data-cancel="${esc(id)}" style="flex:1;min-height:38px">Annulla</button></div>` : ''}</div>`;
}
function updateGhost(id) {
  const g = ghosts.get(id), el = grid.querySelector(`[data-ghost="${CSS.escape(id)}"]`);
  if (!g || !el) return;
  const pc = g.total ? Math.round(g.loaded / g.total * 100) : 0;
  el.querySelector('.upp').textContent = pc + '%';
  el.querySelector('.upb i').style.setProperty('--p', pc + '%');
  el.querySelector('[data-t]').textContent = `${fsize(g.loaded)} / ${fsize(g.total || g.size || 0)}`;
  el.querySelector('[data-s]').textContent = speedTxt(g.speed) + (g.by ? ' · ' + (g.mine ? 'tu' : g.by) : '');
}

function fileHtml(f) {
  const url = fileUrl(f.id);
  return `<div class="fc">
    <a class="fprev" href="${esc(url)}" target="_blank" rel="noopener" aria-label="Apri ${esc(f.name)}">${filePreview(url, f.contentType, f.name)}</a>
    <div class="fmeta"><span class="fname">${esc(f.name || 'File')}</span><span class="fsub">${esc(fsize(+f.size || 0))} · ${esc(f.uploaderName || '')}${f.createdAt ? ' · ' + esc(when(f.createdAt)) : ''}</span></div>
    <div class="fact"><a href="${esc(url)}?dl=1" download="${esc(f.name)}">Scarica</a><button class="ib" type="button" data-fdel="${esc(f.id)}" aria-label="Elimina ${esc(f.name)}">×</button></div></div>`;
}

export function renderFiles() {
  const g = [...ghosts.entries()].reverse().map(([id, x]) => ghostHtml(id, x)).join('');
  const f = files.slice().reverse().map(fileHtml).join('');
  grid.innerHTML = g || f ? g + f : `<div class="cbempty"><b>Trascina qui i tuoi file</b><span>oppure usa “Carica”, o incolla un’immagine con Ctrl+V</span></div>`;
  $('#cbCount').textContent = files.length ? `${files.length} file condivis${files.length === 1 ? 'o' : 'i'}` : '';
}

socket.on('clip:init', d => {
  setText(d && d.text);
  files = Array.isArray(d && d.files) ? d.files : [];
  for (const [id, g] of ghosts) if (!g.mine) ghosts.delete(id);
  renderFiles();
});
socket.on('clip:file', ({ file, tempId }) => {
  if (tempId) ghosts.delete(tempId);
  if (file && !files.some(f => f.id === file.id)) files.push(file);
  renderFiles();
});
socket.on('clip:file_deleted', id => { files = files.filter(f => f.id !== id); renderFiles(); });
socket.on('clip:upload_started', d => { ghosts.set(d.tempId, { name: d.name, size: d.size, by: d.by, mine: false, loaded: 0, total: d.size, speed: 0 }); renderFiles(); });
socket.on('clip:upload_progress', d => {
  const g = ghosts.get(d.tempId); if (!g) return;
  Object.assign(g, { loaded: d.loaded, total: d.total, speed: d.speed });
  updateGhost(d.tempId);
});
socket.on('clip:upload_cancel', d => { if (ghosts.delete(d.tempId)) renderFiles(); });

/** Carica un file negli Appunti mostrando avanzamento e velocità, anche agli altri. */
function uploadOne(file) {
  const tempId = 't' + rid(), me = app.profile && db.users[app.profile];
  const g = { name: file.name, size: file.size, by: me ? me.name : '', mine: true, loaded: 0, total: file.size, speed: 0 };
  ghosts.set(tempId, g); renderFiles();
  socket.emit('clip:upload_started', { tempId, name: file.name, size: file.size });
  let lastT = Date.now(), lastB = 0, lastEmit = 0;
  const up = sendFile(file, { tempId }, (loaded, total) => {
    const now = Date.now(), dt = (now - lastT) / 1000;
    if (dt > 0.5) { g.speed = (loaded - lastB) / dt; lastB = loaded; lastT = now; }
    g.loaded = loaded; g.total = total; updateGhost(tempId);
    if (now - lastEmit > 250 || loaded === total) { lastEmit = now; socket.emit('clip:upload_progress', { tempId, loaded, total, speed: g.speed }); }
  });
  g.abort = up.abort;
  up.promise.catch(e => {
    ghosts.delete(tempId); renderFiles();
    socket.emit('clip:upload_cancel', { tempId });
    if (e.status !== -1) banner(`Caricamento di “${file.name}” non riuscito${e.status === 413 ? ': il file è troppo grande per il server' : ''}.`);
  });
}
export function uploadClip(list) { for (const f of list) uploadOne(f); }

$('#cbUp').innerHTML = UPI + 'Carica';
$('#cbUp').onclick = () => { const i = $('#cbIn'); i.value = ''; i.click(); };
$('#cbIn').onchange = e => { const fs = [...e.target.files]; if (fs.length) uploadClip(fs); };
grid.addEventListener('click', e => {
  const c = e.target.closest('[data-cancel]');
  if (c) { const g = ghosts.get(c.dataset.cancel); if (g && g.abort) g.abort(); return; }
  const d = e.target.closest('[data-fdel]');
  if (d && arm(d, 'Elimina?', '×')) socket.emit('clip:delete_file', d.dataset.fdel);
});

/* ---------- trascinamento e incolla ---------- */
const hasFiles = e => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
const clipVisible = () => !$('#clip').hidden && !app.curId && !app.filesFor && !app.chatFor;
let depth = 0;
zone.addEventListener('dragenter', e => { if (!hasFiles(e)) return; depth++; zone.classList.add('on'); });
zone.addEventListener('dragleave', e => { if (!hasFiles(e)) return; if (--depth <= 0) { depth = 0; zone.classList.remove('on'); } });
zone.addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
zone.addEventListener('drop', e => {
  if (!hasFiles(e)) return;
  e.preventDefault(); depth = 0; zone.classList.remove('on');
  const fs = [...e.dataTransfer.files]; if (fs.length) uploadClip(fs);
});
// Un file lasciato fuori da una zona di caricamento non deve aprirsi nel browser;
// negli Appunti va comunque tra i file condivisi.
document.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
document.addEventListener('drop', e => {
  if (!hasFiles(e) || e.defaultPrevented) return;
  e.preventDefault();
  const fs = [...e.dataTransfer.files];
  if (fs.length && clipVisible()) uploadClip(fs);
});
// Ctrl+V di un'immagine (es. uno screenshot) negli Appunti la carica come file.
document.addEventListener('paste', e => {
  const cd = e.clipboardData;
  if (!cd || !clipVisible() || !cd.files.length || [...cd.types].includes('text/plain')) return;
  e.preventDefault();
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.');
  uploadClip([...cd.files].map((f, i) => f.name && f.name !== 'image.png' ? f : new File([f], `Incollato ${stamp}${i ? ' ' + (i + 1) : ''}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type })));
});

/* ---------- connessi ---------- */
let presence = [];
export const presenceList = () => presence;
export function renderPres() {
  // Una voce per persona (o IP): più schede aperte = "×2".
  const groups = new Map();
  for (const p of presence) {
    const k = p.profileId ? 'u:' + p.profileId : 'n:' + p.name;
    const g = groups.get(k) || { ...p, n: 0, me: false };
    g.n++; if (p.id === socket.id) g.me = true;
    groups.set(k, g);
  }
  const list = [...groups.values()].sort((a, b) => (b.me - a.me) || String(a.name).localeCompare(String(b.name)));
  $('#pres').innerHTML = `<span class="plabel">Connessi · ${list.length}</span>` + list.map(g => {
    const u = g.profileId && db.users[g.profileId];
    return `<span class="pchip${g.me ? ' me' : ''}"${u ? ` style="--c:${ucol(u)}"` : ''}>${u ? av(u) : `<span class="av">${esc(ini(g.name))}</span>`}${esc(g.name)}${g.me ? ' <small>(tu)</small>' : ''}${g.n > 1 ? ` <small>×${g.n}</small>` : ''}</span>`;
  }).join('');
}
socket.on('presence', list => { presence = Array.isArray(list) ? list : []; renderPres(); onPresence(); });

renderFiles();
