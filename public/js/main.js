/* Avvio: rendering di tutte le viste, navigazione via hash, scorciatoie da tastiera.
   Con un profilo (dall'IP) si vede il diario; senza, solo gli Appunti. */
import { $ } from './util.js';
import { app, setRenderer, renderAll } from './state.js';
import { markSeen } from './net.js';
import { renderPres } from './clipboard.js';
import { isLogged, isBooting, renderLogin, renderUser, setOnSessionChange } from './session.js';
import { renderParentSelect, renderList } from './home.js';
import { renderDlg, closeDlg } from './dialog.js';
import { renderFiles, closeFiles } from './attach.js';
import { renderChat, closeChat } from './chat.js';
import { renderPrio, resetPrio } from './prio.js';
import { renderAdmin, setAdminView } from './admin.js';
import { renderBugs } from './bugs.js';

setRenderer(() => {
  if (app.chatFor) markSeen(app.chatFor);
  renderLogin(); renderUser(); renderPres();
  if (!isLogged()) return;
  renderParentSelect(); renderList(); renderPrio(); renderBugs(); renderAdmin();
  renderDlg(); renderFiles(); renderChat();
});

const VIEWS = { home: 'Task aperti', prio: 'Priorità', bugs: 'Bug', admin: 'Visualizzazione', clip: 'Appunti' };
let lastView = '';

// Indirizzi della vecchia vista "Admin", ora "Visualizzazione" (segnalibri).
const LEGACY = { '#admin': '#visualizzazione', '#admin-lista': '#visualizzazione-agenda' };

function route() {
  if (LEGACY[location.hash]) history.replaceState(null, '', LEGACY[location.hash]);
  const logged = isLogged(), boot = isBooting(), h = location.hash;
  const view = !logged ? (boot ? '' : 'clip') : h.startsWith('#visualizzazione') ? 'admin' : h === '#priorita' ? 'prio' : h === '#bug' ? 'bugs' : h === '#appunti' ? 'clip' : 'home';
  document.body.classList.toggle('anon', !logged);
  for (const v of Object.keys(VIEWS)) $('#' + v).hidden = v !== view;
  $('#nav').hidden = !logged;
  $('#add').hidden = $('#aH').hidden = !(view === 'home' || view === 'prio');
  const title = !logged ? (boot ? '' : 'Appunti') : VIEWS[view];
  $('#hT').textContent = title;
  document.title = title ? `${title} · MexMe` : 'MexMe';
  setAdminView(h === '#visualizzazione-agenda' ? 'list' : 'grid');
  for (const [id, on] of [['#nHome', view === 'home'], ['#nPrio', view === 'prio'], ['#nBug', view === 'bugs'], ['#nAdmin', view === 'admin'], ['#nClip', view === 'clip']]) {
    if (on) $(id).setAttribute('aria-current', 'page'); else $(id).removeAttribute('aria-current');
  }
  // Cambiare vista chiude i dialog aperti.
  const k = view + '|' + app.profile;
  if (k !== lastView) {
    lastView = k;
    if (app.chatFor) closeChat();
    if (app.curId) closeDlg();
    if (app.filesFor) closeFiles();
  }
  resetPrio();
  renderAll();
}

addEventListener('hashchange', route);
setOnSessionChange(route);
route();

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && app.chatFor) { e.preventDefault(); closeChat(); return; }
  if (e.key === 'Escape' && app.filesFor) { e.preventDefault(); closeFiles(); return; }
  if (e.key === 'Escape' && app.curId) { e.preventDefault(); closeDlg(); return; }
  // "n" porta al campo del nuovo task (Home e Priorità).
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !app.curId && !app.chatFor && !app.filesFor
    && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && !e.target.isContentEditable && !$('#add').hidden) {
    e.preventDefault(); $('#aT').focus();
  }
});
