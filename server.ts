import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import 'dotenv/config';

const app = express();
const httpServer = createServer(app);

httpServer.requestTimeout = 0;
httpServer.headersTimeout = 0;

const io = new Server(httpServer, {
    allowRequest: (req, callback) => {
        const clientIp = getClientIp(req);
        const allowed = isKnownIp(clientIp);
        if (!allowed) {
            console.warn(`${getLogDate()} Connessione socket.io negata per IP non autorizzato: ${clientIp}`);
        }
        // Se allowed è false, engine.io risponde automaticamente con 403.
        callback(null, allowed);
    }
});

let knownIPs: Record<string, string> = {};
try {
    if (process.env.KNOWN_IPS) {
        knownIPs = JSON.parse(process.env.KNOWN_IPS);
    }
} catch (error) {
    console.error("Errore nel parsing di KNOWN_IPS dal file .env:", error);
}

// Proxy fidati: nginx gira sulla stessa macchina e inoltra su loopback.
const TRUSTED_PROXIES = new Set(['127.0.0.1', '::1']);

// Estrae l'IP reale del client. Se la connessione TCP arriva da un proxy
// fidato (nginx), si usa X-Real-IP, che nginx sovrascrive con $remote_addr
// e quindi non è falsificabile dal client. In tutti gli altri casi si usa
// l'IP della connessione TCP e gli header vengono ignorati.
function getClientIp(req: { socket: { remoteAddress?: string }, headers: Record<string, string | string[] | undefined> }): string {
    const socketIp = req.socket.remoteAddress?.replace(/^::ffff:/, '');
    if (socketIp && TRUSTED_PROXIES.has(socketIp)) {
        const realIp = req.headers['x-real-ip'];
        if (typeof realIp === 'string' && realIp.trim()) {
            return realIp.trim().replace(/^::ffff:/, '');
        }
    }
    return socketIp || 'Sconosciuto';
}

function isKnownIp(ip: string): boolean {
    // Se KNOWN_IPS è vuota (o non impostata), l'accesso non è ristretto:
    // consentito a chiunque.
    if (Object.keys(knownIPs).length === 0) return true;
    return Object.prototype.hasOwnProperty.call(knownIPs, ip);
}

// Blocca con 403 tutte le richieste HTTP (statiche, /upload, ecc.) che non
// provengono da un IP presente in KNOWN_IPS.
app.use((req, res, next) => {
    const clientIp = getClientIp(req);
    if (!isKnownIp(clientIp)) {
        console.warn(`${getLogDate()} Accesso HTTP negato per IP non autorizzato: ${clientIp}`);
        res.status(403).send('Forbidden: IP non autorizzato.');
        return;
    }
    next();
});

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + file.originalname;
        cb(null, uniqueName);
    }
});
const upload = multer({ storage });

const redisUrl = process.env.REDIS_URL ?? '';
const redisClient = createClient({ url: redisUrl });
redisClient.on('error', (err) => console.error('Errore Client Redis:', err));

app.use(express.static(path.join(__dirname, 'public')));

const REDIS_TEXT_KEY = 'shared_textarea_content';
const REDIS_FILES_KEY = 'shared_files_list';

const connectedClients = new Map<string, string>();

async function getSharedFiles(): Promise<any[]> {
    const data = await redisClient.get(REDIS_FILES_KEY);
    return data ? JSON.parse(data) : [];
}

async function saveSharedFiles(files: any[]) {
    await redisClient.set(REDIS_FILES_KEY, JSON.stringify(files));
}

app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('Nessun file caricato.');
    const fileInfo = {
        id: req.file.filename,
        tempId: req.body.tempId,
        url: `/uploads/${req.file.filename}`,
        name: req.file.originalname,
        size: req.file.size
    };
    const files = await getSharedFiles();
    files.push(fileInfo);
    await saveSharedFiles(files);
    io.emit('new_file', fileInfo);
    res.json({ success: true, fileInfo });
});

// --- FUNZIONE CORRETTA PER IL NUOVO CLIENT ---
function broadcastActiveClients() {
    // const clientsData = Array.from(connectedClients.entries()).map(([id, ip]) => {
    //     return { id: id, ip: ip };
    // });
    const clientsData = Array.from(io.sockets.sockets.values()).map(socket => {
        const clientIP = getClientIp(socket.request);

        return {
            id: socket.id,
            ip: clientIP,
            // Mappa qui il nome! Se non lo trova, usa l'IP come fallback
            name: knownIPs[clientIP] || clientIP
        };
    });

    io.emit('clients_update', clientsData);
}


async function startServer() {
    await redisClient.connect();

    io.on('connection', async (socket) => {
        // --- GESTIONE IP (Mantenuta per i log del server) ---
        const cleanIp = getClientIp(socket.request);

        connectedClients.set(socket.id, cleanIp);
        broadcastActiveClients();
        console.log(`${getLogDate()} Client connesso: ${socket.id} (IP: ${cleanIp})`);

        // --- GESTIONE DATI INIZIALI ---
        const currentText = await redisClient.get(REDIS_TEXT_KEY) || '';
        socket.emit('init_text', currentText);
        socket.emit('init_files', await getSharedFiles());

        // --- GESTIONE EVENTI ---
        socket.on('text_change', async (newText: string) => {
            await redisClient.set(REDIS_TEXT_KEY, newText);
            socket.broadcast.emit('text_update', newText);
        });

        socket.on('upload_started', (data) => {
            socket.broadcast.emit('upload_started', data);
        });

        socket.on('upload_progress', (data) => {
            socket.broadcast.emit('upload_progress', data);
        });

        socket.on('delete_file', async (fileId: string) => {
            let files = await getSharedFiles();
            files = files.filter(f => f.id !== fileId);
            await saveSharedFiles(files);
            const filePath = path.join(uploadDir, fileId);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            io.emit('file_deleted', fileId);
        });

        socket.on('disconnect', () => {
            console.log(`${getLogDate()} Client disconnesso: ${socket.id}`);
            connectedClients.delete(socket.id);
            broadcastActiveClients();
        });
    });

    const PORT = process.env.PORT || 3003;
    const HOST = process.env.HOST || 'localhost'
    httpServer.listen({ port: PORT, host: HOST }, () => {
        console.log(`${getLogDate()} Server avviato e in ascolto sulla porta ${PORT}`);
    });
}

// Funzione per ottenere la data formattata [DD-MM-YYYY HH:mm:ss]
function getLogDate() {
    const now = new Date();
    const pad = (n: any) => String(n).padStart(2, '0'); // Aggiunge lo zero iniziale

    const d = pad(now.getDate());
    const m = pad(now.getMonth() + 1); // I mesi partono da 0 in JS
    const y = now.getFullYear();
    const H = pad(now.getHours());
    const i = pad(now.getMinutes());
    const s = pad(now.getSeconds());

    return `[${d}-${m}-${y} ${H}:${i}:${s}]`;
}


startServer().catch(console.error);
