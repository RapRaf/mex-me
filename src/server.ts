import fs from 'fs';
import path from 'path';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PORT, HOST, PUBLIC_DIR, DATA_DIR } from './config';
import { httpGuard, socketGuard } from './access';
import { syncProfilesFromIps } from './data';
import { flushAll, startBackups } from './store';
import { setIo, type SocketData } from './hub';
import { filesRouter } from './files';
import { onConnection } from './realtime';
import { migrateFromRedis } from './migrate';
import { log, warn, error } from './log';

const app = express();
const httpServer = createServer(app);

// Nessun timeout: upload di file grossi.
httpServer.requestTimeout = 0;
httpServer.headersTimeout = 0;

const io = new Server<any, any, any, SocketData>(httpServer, {
    allowRequest: socketGuard,
    maxHttpBufferSize: 5e6, // testo degli appunti lungo
});
setIo(io);

app.disable('x-powered-by');
app.use(httpGuard);
app.use(filesRouter);
app.use(express.static(PUBLIC_DIR));

/**
 * Primo avvio dopo la versione su Redis: se gli appunti non sono ancora mai
 * stati salvati in data/clipboard.json, si importano testo e file da Redis.
 * Se Redis non risponde si parte lo stesso (si può rifare con npm run migrate:redis).
 */
async function firstRunMigration() {
    if (fs.existsSync(path.join(DATA_DIR, 'clipboard.json')) || !process.env.REDIS_URL) return;
    try {
        const r = await migrateFromRedis(process.env.REDIS_URL);
        flushAll();
        log(`Appunti importati da Redis: testo di ${r.textLength} caratteri, ${r.migrated} file su ${r.total}`
            + (r.missing.length ? ` (non trovati: ${r.missing.join(', ')})` : ''));
    } catch (e) {
        warn(`Import degli appunti da Redis non riuscito (${(e as Error).message}). Si può rifare a server fermo con: npm run migrate:redis`);
    }
}

async function start() {
    syncProfilesFromIps();
    await firstRunMigration();
    startBackups(DATA_DIR);
    io.on('connection', onConnection);
    httpServer.listen({ port: PORT, host: HOST }, () => {
        log(`Server avviato e in ascolto su ${HOST}:${PORT} · dati in ${DATA_DIR}`);
    });
}
start().catch(e => { error(e); process.exit(1); });

// Salva su disco quanto è ancora in attesa prima di uscire (pm2 manda SIGINT).
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
        log(`${sig}: salvo i dati ed esco`);
        flushAll();
        process.exit(0);
    });
}
process.on('exit', flushAll);
