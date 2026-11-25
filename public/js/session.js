/* Profilo di chi guarda: lo decide il server dall'IP (KNOWN_IPS), non si sceglie
   e non si cambia. Un IP senza profilo (possibile solo con accesso non ristretto)
   vede soltanto gli Appunti. */
import { $, esc, av } from './util.js';
import { db, app } from './state.js';
import { socket } from './net.js';

let onChange = () => { };
export const setOnSessionChange = f => { onChange = f; };
export const isLogged = () => !!(app.loaded && app.profile && db.users[app.profile] && db.users[app.profile].active !== false);
/** Dati non ancora arrivati: non si sa ancora chi è. */
export const isBooting = () => !app.loaded;

function sync() {
  const w = isLogged();
  if (app.roSaved !== null) app.roSaved = w; else app.canWrite = w;
  onChange();
}
socket.on('diario:init', sync);
socket.on('diario:upsert', d => { if (d && d.col === 'users') sync(); });
socket.on('diario:remove', d => { if (d && d.col === 'users') sync(); });

export function renderLogin() { $('#who').hidden = !(app.loaded && !isLogged()); }
export function renderUser() {
  const u = isLogged() ? db.users[app.profile] : null, c = $('#uchip');
  c.hidden = !u;
  c.innerHTML = u ? `${av(u)}<b>${esc(u.name)}</b>` : '';
}
