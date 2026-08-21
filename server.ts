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
const io = new Server(httpServer);

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

async function getSharedFiles(): Promise<any[]> {
    const data = await redisClient.get(REDIS_FILES_KEY);
    return data ? JSON.parse(data) : [];
}

async function saveSharedFiles(files: any[]) {
    await redisClient.set(REDIS_FILES_KEY, JSON.stringify(files));
}

// Rotta HTTP
app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('Nessun file caricato.');

    const fileInfo = {
        id: req.file.filename,
        tempId: req.body.tempId, // Catturiamo l'ID temporaneo inviato dal client
        url: `/uploads/${req.file.filename}`,
        name: req.file.originalname,
        size: req.file.size
    };

    const files = await getSharedFiles();
    files.push(fileInfo);
    await saveSharedFiles(files);

    // Diciamo a tutti che il file definitivo è pronto
    io.emit('new_file', fileInfo);

    res.json({ success: true, fileInfo });
});

async function startServer() {
    await redisClient.connect();
    console.log('Connesso a Redis.');

    io.on('connection', async (socket) => {
        const currentText = await redisClient.get(REDIS_TEXT_KEY) || '';
        socket.emit('init_text', currentText);
        socket.emit('init_files', await getSharedFiles());

        socket.on('text_change', async (newText: string) => {
            await redisClient.set(REDIS_TEXT_KEY, newText);
            socket.broadcast.emit('text_update', newText);
        });

        // ----------------------------------------------------
        // NUOVI EVENTI PER IL PROGRESSO IN TEMPO REALE
        // ----------------------------------------------------
        socket.on('upload_started', (data) => {
            // Avvisa gli altri di creare l'icona oscurata
            socket.broadcast.emit('upload_started', data);
        });

        socket.on('upload_progress', (data) => {
            // Inoltra l'aggiornamento di velocità e percentuale agli altri
            socket.broadcast.emit('upload_progress', data);
        });
        // ----------------------------------------------------

        socket.on('delete_file', async (fileId: string) => {
            let files = await getSharedFiles();
            files = files.filter(f => f.id !== fileId);
            await saveSharedFiles(files);

            const filePath = path.join(uploadDir, fileId);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

            io.emit('file_deleted', fileId);
        });
    });

    const PORT = process.env.PORT || 3003;

    httpServer.listen(PORT, () => {
    });
}

startServer().catch(console.error);
