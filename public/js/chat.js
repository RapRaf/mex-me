/* Note del team: una chat tra colleghi per ogni task e sottotask. */
import { $, esc, key, today, fTime, fDay, av, ucol, fit, arm } from './util.js';
import { db, app, idx, renderAll, setSave } from './state.js';
import { addComment, delComment } from './net.js';

let chatRO = false, cLast = null, cHtml = '';

export function openChat(id, ro) {
  if (!db.tasks[id]) return;
  chatRO = !!ro || app.roSaved !== null;
  cLast = document.activeElement; app.chatFor = id; cHtml = ''; $('#cIn').value = '';
  $('#ov3').hidden = false; document.body.style.overflow = 'hidden';
  renderAll();
  setTimeout(() => { (chatRO || !app.canWrite ? $('#cX') : $('#cIn')).focus(); }, 30);
}
export function closeChat() {
  app.chatFor = null; $('#ov3').hidden = true;
  if (!app.curId && !app.filesFor) document.body.style.overflow = '';
  renderAll();
  if (cLast && cLast.isConnected) cLast.focus();
}

export function renderChat() {
  if (!app.chatFor) return;
  const t = db.tasks[app.chatFor]; if (!t) { closeChat(); return; }
  $('#cT').textContent = t.title || 'Senza titolo';
  const root = t.parentId && db.tasks[t.rootId] && t.rootId !== t.id ? db.tasks[t.rootId] : null;
  $('#cSub').textContent = root ? 'Note del team · in ' + (root.title || 'Senza titolo') : 'Note del team';
  const list = idx.comBy[app.chatFor] || [], mine = app.profile, ro = chatRO || !app.canWrite;
  let day = '', h = '';
  for (const c of list) {
    const d = new Date(c.createdAt), ok = !isNaN(d), dkey = ok ? key(d) : '';
    if (dkey !== day) { day = dkey; h += `<div class="cday">${ok ? (dkey === today() ? 'Oggi' : esc(fDay.format(d))) : '—'}</div>`; }
    const u = db.users[c.authorId], own = !!mine && c.authorId === mine;
    h += `<div class="msg${own ? ' me' : ''}" style="--c:${u ? ucol(u) : '#8a93a6'}">${av(u)}<div class="mb"><div class="mh"><b>${esc(u ? u.name : 'Qualcuno')}</b><span>${ok ? esc(fTime.format(d)) : ''}</span>${own && !ro ? `<button class="mdel" type="button" data-cdel="${esc(c.id)}" aria-label="Elimina nota">×</button>` : ''}</div><div class="mt">${esc(c.text)}</div></div></div>`;
  }
  if (!list.length) h = `<p class="cempty">${ro ? 'Nessuna nota su questo task.' : 'Nessuna nota ancora.<br>Scrivi la prima qui sotto: la vedranno tutti.'}</p>`;
  const log = $('#cLog');
  if (h !== cHtml) {
    // Resta in fondo se lo era già (nuove note), altrimenti non sposta chi sta rileggendo.
    const atEnd = !cHtml || log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    cHtml = h; log.innerHTML = h;
    if (atEnd) log.scrollTop = log.scrollHeight;
  }
  $('#cForm').hidden = ro;
}

async function sendNote() {
  const i = $('#cIn'), v = i.value.trim(), id = app.chatFor;
  if (!v || !db.tasks[id] || !app.canWrite || chatRO) return;
  const b = $('#cSend'); if (b.disabled) return;
  b.disabled = true; setSave('Invio…');
  if (await addComment(id, v)) {
    if (i.value.trim() === v) { i.value = ''; fit(i); }
    setSave('Inviato ✓');
    const log = $('#cLog'); log.scrollTop = log.scrollHeight;
  } else setSave('');
  b.disabled = false;
  if (app.chatFor) i.focus();
}

$('#cForm').addEventListener('submit', e => { e.preventDefault(); sendNote(); });
// Invio invia, Maiusc+Invio va a capo.
$('#cIn').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendNote(); } });
$('#cIn').addEventListener('input', e => fit(e.target));
$('#cX').onclick = closeChat;
$('#ov3').addEventListener('mousedown', e => { if (e.target.id === 'ov3') closeChat(); });
$('#cLog').addEventListener('click', e => { const b = e.target.closest('[data-cdel]'); if (b && arm(b, 'Elimina?', '×')) delComment(b.dataset.cdel); });
