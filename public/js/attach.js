/* Allegati dei task: dialog separato, caricamento multiplo con avanzamento, eliminazione. */
import { $, esc, fsize, fD, arm, filePreview, fileUrl } from './util.js';
import { db, app, idx, banner, setSave } from './state.js';
import { sendFile, delAttachment } from './net.js';

let fLast = null, filesRO = false, upTarget = null;

export function openFiles(id, ro) {
  if (!db.tasks[id]) return;
  filesRO = !!ro || app.roSaved !== null;
  fLast = document.activeElement; app.filesFor = id;
  $('#ov2').hidden = false; document.body.style.overflow = 'hidden';
  renderFiles();
  setTimeout(() => $('#fX').focus(), 30);
}
export function closeFiles() {
  app.filesFor = null; $('#ov2').hidden = true;
  if (!app.curId && !app.chatFor) document.body.style.overflow = '';
  if (fLast && fLast.isConnected) fLast.focus();
}

let fHtml = '';
export function renderFiles() {
  if (!app.filesFor) return;
  const t = db.tasks[app.filesFor]; if (!t) { closeFiles(); return; }
  $('#fT').textContent = t.title || 'Senza titolo';
  const list = idx.attBy[app.filesFor] || [], rw = app.canWrite && !filesRO;
  const h = list.length ? list.map(a => {
    const url = fileUrl(a.id), u = db.users[a.uploadedBy];
    return `<div class="fc"><a class="fprev" href="${esc(url)}" target="_blank" rel="noopener" aria-label="Apri ${esc(a.name)}">${filePreview(url, a.contentType, a.name)}</a>
      <div class="fmeta"><span class="fname">${esc(a.name || 'File')}</span><span class="fsub">${esc(fsize(+a.sizeBytes || 0))} · ${u ? esc(u.name) + ' · ' : ''}${a.createdAt ? esc(fD.format(new Date(a.createdAt))) : ''}</span></div>
      <div class="fact"><a href="${esc(url)}" target="_blank" rel="noopener">Apri</a><a class="alt" href="${esc(url)}?dl=1" download="${esc(a.name)}">Scarica</a>${rw ? `<button class="ib" data-fdel="${esc(a.id)}" aria-label="Elimina ${esc(a.name)}">×</button>` : ''}</div></div>`;
  }).join('') : '<p style="color:var(--mute);margin:0">Nessun allegato su questo task.</p>';
  // Non ricostruire (e ricaricare le anteprime) se non è cambiato niente.
  if (h !== fHtml) { fHtml = h; $('#fGrid').innerHTML = h; }
  $('#drop').hidden = !rw;
}

/** Apre la scelta dei file da allegare al task `id`. */
export function pick(id) {
  if (!app.canWrite) return;
  upTarget = id;
  const f = $('#fileIn'); f.value = ''; f.click();
}

/** Carica i file uno alla volta mostrando l'avanzamento accanto a "Salvato". */
export async function upload(taskId, files) {
  if (!db.tasks[taskId] || !app.canWrite) return;
  let ok = 0; const errs = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i], pre = files.length > 1 ? `Caricamento ${i + 1} di ${files.length}` : `Caricamento di ${f.name}`;
    setSave(pre + '…');
    try {
      await sendFile(f, { taskId, profile: app.profile }, (l, tot) => setSave(`${pre} · ${Math.round(l / tot * 100)}%`)).promise;
      ok++;
    } catch (e) {
      errs.push(f.name + (e.status === 413 ? ' (troppo grande per il server)' : e.code === 'not_found' ? ' (il task non esiste più)' : ''));
    }
  }
  setSave(ok ? `${ok} file caricat${ok === 1 ? 'o' : 'i'} ✓` : '');
  banner(errs.length ? 'Non caricati: ' + errs.join(', ') + '.' : '');
}

$('#fileIn').onchange = e => { const fs = [...e.target.files]; if (fs.length && upTarget) upload(upTarget, fs); };
$('#fX').onclick = closeFiles;
$('#ov2').addEventListener('mousedown', e => { if (e.target.id === 'ov2') closeFiles(); });
$('#fUp').onclick = () => pick(app.filesFor);
$('#fGrid').addEventListener('click', e => { const b = e.target.closest('[data-fdel]'); if (b && arm(b, 'Elimina?', '×')) delAttachment(b.dataset.fdel); });
const dz = $('#drop');
dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('on'); });
dz.addEventListener('dragleave', () => dz.classList.remove('on'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('on');
  const fs = [...(e.dataTransfer?.files || [])];
  if (fs.length && app.filesFor) upload(app.filesFor, fs);
});
