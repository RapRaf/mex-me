/**
 * Persone finte per provare l'app in locale come se fossero più persone.  npm run persone
 *
 * Per ogni IP finto 10.99.0.N in KNOWN_IPS (nel .env) apre un ingresso su
 * http://127.0.0.1:(3010+N) che inoltra all'app aggiungendo l'header X-Real-IP,
 * esattamente come fa nginx in produzione. L'app quindi vede ogni ingresso come
 * una persona diversa. Ogni porta è un'origine diversa per il browser: finestre
 * separate, dati del browser separati.
 *
 * Solo per sviluppo: ascolta unicamente su 127.0.0.1. Va lanciato in un secondo
 * terminale, con l'app già avviata (npm run dev).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const http = require('http');
const net = require('net');

const APP_PORT = Number(process.env.PORT) || 3003;
let known = {};
try { known = JSON.parse(process.env.KNOWN_IPS || '{}'); } catch (e) { console.error('KNOWN_IPS nel .env non è un JSON valido.'); process.exit(1); }
const people = Object.entries(known).filter(([ip]) => /^10\.99\.0\.\d{1,3}$/.test(ip)).map(([ip, name]) => ({ ip, name, port: 3010 + Number(ip.split('.')[3]) }));
if (!people.length) {
  console.error('Nessun IP finto 10.99.0.N in KNOWN_IPS: copia di nuovo la riga KNOWN_IPS da .env.example nel tuo .env.');
  process.exit(1);
}

/** Header della richiesta originale, con X-Real-IP sostituito. */
function headersWith(req, ip) {
  const out = [];
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    if (req.rawHeaders[i].toLowerCase() !== 'x-real-ip') out.push([req.rawHeaders[i], req.rawHeaders[i + 1]]);
  }
  out.push(['X-Real-IP', ip]);
  return out;
}

for (const p of people) {
  const server = http.createServer((req, res) => {
    const headers = {};
    for (const [k, v] of headersWith(req, p.ip)) headers[k] = headers[k] ? [].concat(headers[k], v) : v;
    const up = http.request({ host: '127.0.0.1', port: APP_PORT, method: req.method, path: req.url, headers }, r => {
      res.writeHead(r.statusCode || 502, r.headers);
      r.pipe(res);
    });
    up.on('error', () => { if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(`L'app non risponde sulla porta ${APP_PORT}: è avviata con npm run dev?`); });
    req.pipe(up);
  });
  // WebSocket (Socket.IO): si inoltra la richiesta di upgrade e poi si collegano i due flussi.
  server.on('upgrade', (req, sock, head) => {
    const up = net.connect(APP_PORT, '127.0.0.1', () => {
      up.write(`${req.method} ${req.url} HTTP/1.1\r\n` + headersWith(req, p.ip).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n\r\n');
      if (head && head.length) up.write(head);
      sock.pipe(up).pipe(sock);
    });
    const close = () => { sock.destroy(); up.destroy(); };
    up.on('error', close); sock.on('error', close);
  });
  server.on('error', e => { console.error(`Porta ${p.port} non disponibile (${e.code}).`); process.exit(1); });
  server.listen(p.port, '127.0.0.1');
}

console.log(`Persone finte (l'app deve essere avviata sulla porta ${APP_PORT}):`);
for (const p of people) console.log(`  http://127.0.0.1:${p.port}  →  ${p.name}  (IP finto ${p.ip})`);
console.log(`  http://127.0.0.1:${APP_PORT}  →  te stesso (${known['127.0.0.1'] || 'IP 127.0.0.1'})`);
console.log('Ctrl+C per fermare.');
