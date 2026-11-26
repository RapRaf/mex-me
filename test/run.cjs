/**
 * Test automatici di MexMe:  npm test
 *
 * 1. Controlla la sintassi dei moduli JavaScript del browser (public/js).
 * 2. Avvia un server di prova (porta TEST_PORT, default 3197) con dati in una
 *    cartella temporanea e KNOWN_IPS finti, poi verifica le funzioni principali
 *    parlando col server come farebbe il browser (Socket.IO e HTTP).
 *
 * Non tocca data/ né il .env. Richiede Node 22 o superiore.
 *
 * Per simulare persone diverse dalla stessa macchina si usa l'header X-Real-IP,
 * che il server accetta solo dalle connessioni in arrivo da 127.0.0.1 (come fa nginx).
 */
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.TEST_PORT) || 3197;
const URL = `http://127.0.0.1:${PORT}`;
// IP finti -> profili finti. 127.0.0.1 e ::1 servono alle richieste senza header.
const KNOWN_IPS = { '127.0.0.1': 'Locale', '::1': 'Locale', '10.0.0.1': 'Alfa', '10.0.0.11': 'Alfa', '10.0.0.2': 'Beta', '10.0.0.3': 'Gamma' };

let failed = 0, passed = 0;
const ok = (cond, msg) => { if (cond) { passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ ' + msg); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 1. sintassi dei moduli del browser ---------- */
function checkClient() {
  console.log('\nSintassi di public/js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mexme-js-'));
  const dir = path.join(ROOT, 'public', 'js');
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.js'))) {
    // I file sono moduli ES: copiati come .mjs, node li controlla come tali.
    const dst = path.join(tmp, f.replace(/\.js$/, '.mjs'));
    fs.copyFileSync(path.join(dir, f), dst);
    try { execFileSync(process.execPath, ['--check', dst], { stdio: 'pipe' }); ok(true, f); }
    catch (e) { ok(false, f + '\n' + String(e.stderr || e.message)); }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

/* ---------- client Socket.IO che si presenta con un IP ---------- */
// Il bundle del browser usa il WebSocket globale di Node: lo avvolgiamo per
// aggiungere l'header X-Real-IP preso dal parametro __ip dell'URL.
const NativeWS = globalThis.WebSocket;
globalThis.WebSocket = class extends NativeWS {
  constructor(url, protocols) { const ip = new globalThis.URL(url).searchParams.get('__ip'); super(url, { protocols, headers: ip ? { 'x-real-ip': ip } : {} }); }
};
const io = require(path.join(ROOT, 'node_modules/socket.io/client-dist/socket.io.js'));
const sockets = [];
const mk = ip => { const s = io(URL, { transports: ['websocket'], query: { __ip: ip }, forceNew: true, reconnection: false }); sockets.push(s); return s; };
const ask = (s, ev, p) => new Promise(r => s.emit(ev, p, r));
const wait = (s, ev, ms = 4000) => new Promise((r, j) => { const t = setTimeout(() => j(new Error('nessun evento ' + ev)), ms); s.once(ev, v => { clearTimeout(t); r(v); }); });
const http = (p, opt = {}, ip) => fetch(URL + p, { ...opt, headers: { ...(opt.headers || {}), ...(ip ? { 'x-real-ip': ip } : {}) } });

/* ---------- 2. server ---------- */
async function startServer(dataDir) {
  const bin = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
  const env = { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dataDir, KNOWN_IPS: JSON.stringify(KNOWN_IPS), REDIS_URL: '' };
  const srv = spawn(bin, ['src/server.ts'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  let log = '';
  srv.stdout.on('data', d => { log += d; });
  srv.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 100 && !log.includes('Server avviato'); i++) await sleep(100);
  if (!log.includes('Server avviato')) { srv.kill(); throw new Error('Il server di prova non parte:\n' + log); }
  return srv;
}

async function protocol() {
  console.log('\nAccesso e profili');
  let res = await http('/', {}, '10.9.9.9'); ok(res.status === 403, 'IP non in KNOWN_IPS: 403');
  res = await http('/', {}, '10.0.0.1'); ok(res.status === 200, 'IP in KNOWN_IPS: 200');
  const bad = mk('10.9.9.9');
  ok(await new Promise(r => { bad.once('connect_error', () => r(true)); bad.once('connect', () => r(false)); }), 'socket da IP sconosciuto rifiutato');

  const a = mk('10.0.0.1'), a2 = mk('10.0.0.11'), b = mk('10.0.0.2');
  const [ia, ia2, ib] = await Promise.all([wait(a, 'diario:init'), wait(a2, 'diario:init'), wait(b, 'diario:init')]);
  ok(ia.me === 'alfa' && ia2.me === 'alfa' && ib.me === 'beta', 'profilo deciso dall\'IP (due IP con lo stesso nome = stessa persona)');
  ok(['alfa', 'beta', 'gamma', 'locale'].every(id => ia.users.some(u => u.id === id)), 'profili creati dai nomi di KNOWN_IPS');

  console.log('\nTask');
  const up = wait(b, 'diario:upsert');
  let r = await ask(a, 'task:create', { id: 'testtask01', title: '  Primo task  ' });
  ok(r.ok && r.task.id === 'testtask01' && r.task.title === 'Primo task' && r.task.assigneeId === 'alfa', 'crea un task (titolo ripulito, assegnato a chi lo crea)');
  ok((await up).docs[0].id === 'testtask01', 'gli altri lo ricevono in tempo reale');
  r = await ask(b, 'task:create', { title: 'Sotto', parentId: 'testtask01' }); const sub = r.task;
  ok(r.ok && sub.depth === 1 && sub.rootId === 'testtask01' && sub.createdBy === 'beta', 'crea un sottotask');
  r = await ask(b, 'task:create', { title: 'Sotto sotto', parentId: sub.id }); const sub2 = r.task;
  ok(r.ok && sub2.depth === 2 && sub2.rootId === 'testtask01', 'crea un sotto-sottotask');
  r = await ask(a, 'task:patch', { id: 'testtask01', patch: { status: 'done', completedAt: new Date().toISOString(), endDate: '2026-11-25', priority: 'high', label: 'bug', prioOrder: 12.5 } });
  ok(r.ok, 'modifica valida accettata');
  r = await ask(a, 'task:patch', { id: 'testtask01', patch: { createdBy: 'gamma' } }); ok(!r.ok && r.error === 'bad_request', 'campo non modificabile rifiutato');
  r = await ask(a, 'task:patch', { id: 'testtask01', patch: { startDate: '25/11/2026' } }); ok(!r.ok, 'data in formato sbagliato rifiutata');
  r = await ask(a, 'task:patch', { id: 'testtask01', patch: { assigneeId: 'nessuno' } }); ok(!r.ok, 'assegnatario inesistente rifiutato');
  r = await ask(a, 'task:create', { title: '' }); ok(!r.ok, 'titolo vuoto rifiutato');

  console.log('\nChiusura automatica del padre');
  const getT = async id => { const p = wait(a, 'diario:init'); a.emit('diario:sync'); return (await p).tasks.find(t => t.id === id); };
  r = await ask(a, 'task:create', { title: 'Padre' }); const P = r.task;
  const k1 = (await ask(a, 'task:create', { title: 'Figlio 1', parentId: P.id })).task;
  const k2 = (await ask(a, 'task:create', { title: 'Figlio 2', parentId: P.id })).task;
  const n1 = (await ask(a, 'task:create', { title: 'Nipote', parentId: k2.id })).task;
  await ask(a, 'task:patch', { id: k1.id, patch: { status: 'done' } });
  ok((await getT(P.id)).status === 'todo', 'con un sottotask ancora aperto il padre resta aperto');
  const ups = []; const onUp = d => ups.push(d); b.on('diario:upsert', onUp);
  await ask(a, 'task:patch', { id: n1.id, patch: { status: 'done' } });
  await sleep(150); b.off('diario:upsert', onUp);
  let pp = await getT(P.id), kk = await getT(k2.id);
  ok(kk.status === 'done' && pp.status === 'done', 'ultimo sottotask fatto: si chiudono padre e nonno');
  ok(pp.completedAt && pp.endDate && pp.startDate && pp.updatedBy === 'alfa', 'il padre chiuso ha fine, inizio e data di completamento');
  ok(ups.some(d => d.docs.some(t => t.id === P.id && t.status === 'done')), 'gli altri vedono la chiusura in tempo reale');
  await ask(b, 'task:patch', { id: k1.id, patch: { status: 'doing' } });
  pp = await getT(P.id);
  ok(pp.status === 'doing' && pp.completedAt === null && (await getT(k2.id)).status === 'done', 'sottotask riaperto: il padre torna In corso, il fratello resta fatto');
  await ask(a, 'task:patch', { id: P.id, patch: { status: 'done' } });
  await ask(a, 'task:patch', { id: k1.id, patch: { notes: 'solo una nota' } });
  ok((await getT(P.id)).status === 'done', 'una modifica che non cambia lo stato non riapre il padre');
  await ask(a, 'task:delete', { id: P.id });

  console.log('\nBug');
  r = await ask(b, 'bug:create', { title: '  Il calendario non si apre ', text: 'Su Firefox resta bianco' });
  const bug = r.bug;
  ok(r.ok && bug.title === 'Il calendario non si apre' && bug.status === 'open' && bug.reportedBy === 'beta', 'segnala un bug (chi segnala lo decide l\'IP)');
  ok(!(await ask(b, 'bug:create', { title: ' ' })).ok, 'bug senza titolo rifiutato');
  const bfd = new FormData(); bfd.append('bugId', bug.id); bfd.append('file', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'schermo.png');
  let bj = await (await http('/upload', { method: 'POST', body: bfd }, '10.0.0.2')).json();
  ok(bj.ok && bj.attachment.bugId === bug.id && bj.attachment.taskId === '', 'allegato su un bug');
  r = await ask(a, 'bug:edit', { id: bug.id, title: 'altro' }); ok(!r.ok && r.error === 'forbidden', 'solo chi l\'ha segnalato lo modifica');
  r = await ask(a, 'bug:delete', { id: bug.id }); ok(!r.ok && r.error === 'forbidden', 'solo chi l\'ha segnalato lo elimina');
  r = await ask(a, 'bug:reject', { id: bug.id }); ok(r.ok, 'scarta un bug');
  r = await ask(a, 'bug:reopen', { id: bug.id }); ok(r.ok, 'riapre un bug scartato');
  r = await ask(a, 'bug:confirm', { id: bug.id });
  const bt = r.task;
  ok(r.ok && bt.status === 'todo' && bt.assigneeId === 'alfa' && bt.label === 'bug' && bt.notes === 'Su Firefox resta bianco' && bt.bugId === bug.id && bt.parentId === null, 'conferma = task da fare assegnato a chi conferma, label bug, note = descrizione');
  const snap = await (async () => { const p = wait(a, 'diario:init'); a.emit('diario:sync'); return p; })();
  const sb = snap.bugs.find(x => x.id === bug.id), sa = snap.attachments.find(x => x.id === bj.attachment.id);
  ok(sb.status === 'confirmed' && sb.reviewedBy === 'alfa' && sb.taskId === bt.id, 'il bug resta come confermato, collegato al task');
  ok(sa.taskId === bt.id, 'gli allegati del bug passano al task');
  r = await ask(b, 'bug:confirm', { id: bug.id }); ok(!r.ok && r.error === 'forbidden', 'un bug già confermato non si conferma di nuovo');
  const bfd2 = new FormData(); bfd2.append('bugId', bug.id); bfd2.append('file', new Blob(['x']), 'tardi.txt');
  res = await http('/upload', { method: 'POST', body: bfd2 }, '10.0.0.2'); ok(res.status === 403, 'su un bug confermato non si allega più (si allega al task)');
  r = await ask(b, 'bug:create', { title: 'Mio bug' }); r = await ask(b, 'bug:confirm', { id: r.bug.id });
  ok(r.ok && r.task.assigneeId === 'beta', 'chi segnala può anche confermare il proprio bug');
  r = await ask(b, 'bug:create', { title: 'Da eliminare' }); const del = r.bug;
  const bfd3 = new FormData(); bfd3.append('bugId', del.id); bfd3.append('file', new Blob(['x']), 'x.txt');
  bj = await (await http('/upload', { method: 'POST', body: bfd3 }, '10.0.0.2')).json();
  r = await ask(b, 'bug:delete', { id: del.id }); ok(r.ok, 'chi l\'ha segnalato elimina un bug non confermato');
  res = await http('/files/' + bj.attachment.id, {}, '10.0.0.1'); ok(res.status === 404, 'eliminando il bug spariscono i suoi allegati');
  await ask(a, 'task:delete', { id: bt.id });

  console.log('\nNote del team');
  r = await ask(b, 'comment:add', { taskId: sub2.id, text: 'nota di beta' }); ok(r.ok, 'aggiunge una nota');
  await ask(a, 'comment:add', { taskId: sub.id, text: 'nota di alfa' });
  const all = await (async () => { const p = wait(a, 'diario:init'); a.emit('diario:sync'); return p; })();
  const ca = all.comments.find(c => c.authorId === 'alfa');
  r = await ask(b, 'comment:delete', { id: ca.id }); ok(!r.ok && r.error === 'forbidden', 'non si eliminano le note degli altri');
  r = await ask(a, 'seen:set', { taskId: sub.id, at: ca.createdAt }); ok(r.ok, 'segna le note come lette');

  console.log('\nFile');
  const fd = new FormData(); fd.append('taskId', sub2.id); fd.append('profile', 'gamma');
  fd.append('file', new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), 'àccènti è.html');
  let j = await (await http('/upload', { method: 'POST', body: fd }, '10.0.0.2')).json();
  ok(j.ok && j.attachment.name === 'àccènti è.html', 'allegato con nome con accenti');
  ok(j.ok && j.attachment.uploadedBy === 'beta', 'chi carica lo decide l\'IP, non il client');
  res = await http('/files/' + j.attachment.id, {}, '10.0.0.1');
  ok(res.headers.get('content-disposition').startsWith('attachment') && /sandbox/.test(res.headers.get('content-security-policy') || '') && res.headers.get('x-content-type-options') === 'nosniff', 'un HTML caricato si scarica e non può eseguire codice');
  const fd2 = new FormData(); fd2.append('file', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'foto.png');
  j = await (await http('/upload', { method: 'POST', body: fd2 }, '10.0.0.3')).json();
  ok(j.ok && j.file.uploaderName === 'Gamma', 'file negli appunti col nome di chi carica');
  res = await http('/files/' + j.file.id, {}, '10.0.0.1');
  ok(res.headers.get('content-type') === 'image/png' && res.headers.get('content-disposition').startsWith('inline'), 'le immagini si aprono nel browser');
  res = await http('/files/' + j.file.id + '?dl=1', {}, '10.0.0.1'); ok(res.headers.get('content-disposition').startsWith('attachment'), '?dl=1 forza il download');
  res = await http('/files/..%2Fusers.json', {}, '10.0.0.1'); ok(res.status === 404, 'niente accesso a file fuori da data/uploads');
  const fd3 = new FormData(); fd3.append('taskId', 'inesistente'); fd3.append('file', new Blob(['x']), 'x.txt');
  res = await http('/upload', { method: 'POST', body: fd3 }, '10.0.0.2'); ok(res.status === 404, 'allegato su task inesistente rifiutato');

  console.log('\nEliminazione a cascata');
  const rm = []; b.on('diario:remove', d => rm.push(d));
  r = await ask(a, 'task:delete', { id: 'testtask01' }); ok(r.ok, 'elimina il task');
  await sleep(200);
  const got = Object.fromEntries(rm.map(d => [d.col, d.ids.length]));
  ok(got.tasks === 3 && got.comments === 2 && got.attachments === 1, 'spariscono anche sottotask, note e allegati (' + JSON.stringify(got) + ')');

  console.log('\nAppunti e presenza');
  const t = wait(a, 'clip:text'); b.emit('clip:text', 'ciao a tutti'); ok(await t === 'ciao a tutti', 'testo degli appunti in tempo reale');
  const c = mk('10.0.0.3'); await wait(c, 'clip:init');
  c.emit('clip:upload_started', { tempId: 'tX', name: 'grande.zip', size: 10 });
  ok((await wait(a, 'clip:upload_started')).tempId === 'tX', 'gli altri vedono un upload iniziato');
  const cc = wait(a, 'clip:upload_cancel'); c.disconnect(); ok((await cc).tempId === 'tX', 'upload lasciato a metà: sparisce per tutti');
  const p = await new Promise(r => { a.once('presence', r); mk('10.0.0.3'); });
  ok(p.filter(x => x.profileId === 'alfa').length === 2 && p.some(x => x.profileId === 'gamma'), 'lista dei connessi con i profili');
}

(async () => {
  checkClient();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mexme-data-'));
  let srv;
  try {
    srv = await startServer(dataDir);
    await protocol();
  } catch (e) {
    failed++; console.log('\n✗ Errore: ' + (e && e.stack || e));
  } finally {
    for (const s of sockets) s.close();
    if (srv) srv.kill('SIGTERM');
    await sleep(300);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  console.log(`\n${passed} superati, ${failed} falliti`);
  process.exit(failed ? 1 : 0);
})();
