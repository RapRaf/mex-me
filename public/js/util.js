/* Utility condivise: DOM, testo sicuro, date, formati, icone. */

export const $ = s => document.querySelector(s);

/** Ogni valore che arriva dal server o dagli utenti è testo: passa sempre di qui prima di finire in HTML. */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const pad = n => String(n).padStart(2, '0');
/** Data locale YYYY-MM-DD. */
export const key = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const today = () => key(new Date());
export const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const dk = d => new Date(d + 'T12:00');
export const days = (a, b) => Math.round((dk(b) - dk(a)) / 864e5) + 1;

export const fD = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });
export const fDL = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
export const fTime = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
export const fDay = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
export const fWdS = new Intl.DateTimeFormat('it-IT', { weekday: 'short' });
export const fMon = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' });
export const sd = v => isDate(v) ? fD.format(new Date(v + 'T12:00')) : '—';
export const ago = iso => {
  const m = (Date.now() - new Date(iso)) / 6e4;
  if (!(m >= 0)) return '—';
  if (m < 1) return 'adesso';
  if (m < 60) return Math.round(m) + ' min fa';
  if (m < 1440) return Math.round(m / 60) + ' h fa';
  const d = Math.round(m / 1440);
  return d === 1 ? 'ieri' : d + ' giorni fa';
};
/** Data breve per i file: ora se oggi, altrimenti giorno e mese. */
export const when = iso => { const d = new Date(iso); if (isNaN(d)) return ''; return key(d) === today() ? 'oggi ' + fTime.format(d) : fD.format(d); };

/* ---------- stati dei task ---------- */
export const S = { todo: 'Da fare', doing: 'In corso', done: 'Fatto' };
export const st = s => S[s] ? s : 'todo';
export const opts = sel => Object.entries(S).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${v}</option>`).join('');

/* ---------- persone ---------- */
export const COLORS = ['#2b6cf6', '#e0115f', '#0f9d8a', '#f08c00', '#7b4fd6', '#c2410c', '#1f8a3b', '#5c6b8a'];
export const ucol = u => COLORS[Math.abs((u && u.c) | 0) % COLORS.length];
export const ini = n => String(n || '?').trim().split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?';
export const av = u => u ? `<span class="av" style="--c:${ucol(u)}">${esc(ini(u.name))}</span>` : '<span class="av">?</span>';

/* ---------- file ---------- */
export const ext = n => { const s = String(n); const i = s.lastIndexOf('.'); return i > 0 ? s.slice(i + 1).toLowerCase() : ''; };
export const fsize = b => b >= 1073741824 ? (b / 1073741824).toFixed(1).replace('.', ',') + ' GB' : b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
export const fileUrl = id => '/files/' + encodeURIComponent(id);
/** Anteprima di un file: immagine, video o estensione. */
export function filePreview(url, ct, name) {
  ct = String(ct || '');
  if (url && /^image\/(png|jpeg|gif|webp|avif|bmp|svg\+xml)$/.test(ct)) return `<img src="${esc(url)}" alt="" loading="lazy">`;
  if (url && ct.startsWith('video/')) return `<video src="${esc(url)}" muted preload="metadata"></video>`;
  return `<span class="fext">${esc(ext(name).toUpperCase().slice(0, 5) || 'FILE')}</span>`;
}

/* ---------- icone (SVG inline, niente emoji) ---------- */
export const CLIP = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 01-7.8-7.8l8.6-8.6a3.7 3.7 0 015.2 5.2l-8.6 8.6a1.8 1.8 0 01-2.6-2.6l7.9-7.9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const UPI = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M12 16V4m0 0l-5 5m5-5l5 5M4 20h16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const CHAT = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M5 4h14a2 2 0 012 2v9a2 2 0 01-2 2h-8l-5 4v-4H5a2 2 0 01-2-2V6a2 2 0 012-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
export const CHECK = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
export const COPY = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" fill="none" stroke="currentColor" stroke-width="2"/></svg>';

/* ---------- DOM ---------- */
/** Altezza automatica per le textarea dove field-sizing non è supportato. */
export function fit(el) { if (!el || CSS.supports('field-sizing', 'content')) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
/** Aggiorna il valore di un campo senza disturbare chi ci sta scrivendo. */
export function setVal(el, v) { if (document.activeElement !== el && !el.dataset.dirty && el.value !== (v ?? '')) el.value = v ?? ''; }
/** Conferma in due tempi: il primo click arma il bottone, il secondo (entro 3 s) conferma. */
export function arm(b, label, restore) {
  if (b.classList.contains('warn')) return true;
  b.classList.add('warn'); b.textContent = label;
  setTimeout(() => { if (b.isConnected) { b.classList.remove('warn'); b.textContent = restore; } }, 3000);
  return false;
}

/* ---------- storage del browser (solo comodità, mai dati condivisi) ---------- */
// L'accesso stesso a localStorage può lanciare (storage bloccato): sempre dentro try.
const store = s => ({
  get(k, def = null) { try { const v = s().getItem(k); return v === null ? def : v; } catch (e) { return def; } },
  set(k, v) { try { s().setItem(k, v); } catch (e) { } },
  del(k) { try { s().removeItem(k); } catch (e) { } },
});
export const ls = store(() => window.localStorage);
export const lsJson = (k, def) => { try { return JSON.parse(ls.get(k)) ?? def; } catch (e) { return def; } };
