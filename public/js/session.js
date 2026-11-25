/* "Chi sei?": il profilo vale per la singola scheda. Due schede dello stesso browser
   possono essere due persone diverse; "Esci" in una scheda non tocca le altre.
   Una scheda nuova riprende l'ultimo profilo scelto. */
import { $, esc, av, ss, ls } from './util.js';
import { db, app, ulist, renderAll } from './state.js';
import { socket } from './net.js';
import { presenceList, setOnPresence } from './clipboard.js';

const TAB = 'mx-profile';        // sessionStorage: profilo di questa scheda ('-' = uscito)
const LAST = 'mx-last-profile';  // localStorage: ultimo profilo scelto, per le schede nuove

{
  const v = ss.get(TAB);
  app.profile = v === '-' ? null : (v || ls.get(LAST) || null);
}

let onChange = () => { };
export const setOnSessionChange = f => { onChange = f; };
export const isLogged = () => !!(app.loaded && app.profile && db.users[app.profile] && db.users[app.profile].active !== false);
/** Dati non ancora arrivati ma c'è un profilo da riprendere: non mostrare "Chi sei?" per un attimo. */
export const isBooting = () => !app.loaded && !!app.profile;

function setWrite(v) { if (app.roSaved !== null) app.roSaved = v; else app.canWrite = v; }

/** Dopo ogni aggiornamento dei profili: il profilo della scheda esiste ancora? */
function validate() {
  if (app.profile && !(db.users[app.profile] && db.users[app.profile].active !== false)) {
    app.profile = null; ss.del(TAB);
    socket.emit('session:set', null, () => { });
  } else if (app.profile) ss.set(TAB, app.profile);
  setWrite(isLogged());
  onChange();
}
socket.on('diario:init', validate);
socket.on('diario:upsert', d => { if (d && d.col === 'users') validate(); });
socket.on('diario:remove', d => { if (d && d.col === 'users') validate(); });

export function claim(uid) {
  if (!db.users[uid]) return;
  app.profile = uid; ss.set(TAB, uid); ls.set(LAST, uid); db.seen = {};
  socket.emit('session:set', uid, r => { if (r && r.ok) { db.seen = r.seen || {}; renderAll(); } });
  setWrite(true);
  onChange();
}
export function logout() {
  if (!app.profile) return;
  app.profile = null; ss.set(TAB, '-'); ls.del(LAST); db.seen = {};
  socket.emit('session:set', null, () => { });
  setWrite(false);
  onChange();
}

export function renderLogin() {
  const show = app.loaded && !isLogged();
  $('#who').hidden = !show;
  if (!show) return;
  const online = new Set(presenceList().map(p => p.profileId).filter(Boolean));
  $('#tiles').innerHTML = ulist().map(u => `<button class="tile" type="button" data-u="${esc(u.id)}">${av(u)}<b>${esc(u.name)}</b><small>${online.has(u.id) ? '<span class="on">Online</span>' : 'Entra'}</small></button>`).join('')
    || '<p>Nessun profilo ancora creato.</p>';
}
export function renderUser() {
  const u = isLogged() ? db.users[app.profile] : null, c = $('#uchip');
  c.hidden = !u;
  c.innerHTML = u ? `${av(u)}<b>${esc(u.name)}</b><button id="logout" type="button">Esci</button>` : '';
}

$('#tiles').onclick = e => { const b = e.target.closest('.tile'); if (b) claim(b.dataset.u); };
$('#uchip').onclick = e => { if (e.target.id === 'logout') logout(); };
setOnPresence(renderLogin);
