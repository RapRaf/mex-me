"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const redis_1 = require("redis");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
require("dotenv/config");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer);
const uploadDir = path_1.default.join(__dirname, 'public', 'uploads');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + '-' + file.originalname;
        cb(null, uniqueName);
    }
});
const upload = (0, multer_1.default)({ storage });
const redisUrl = process.env.REDIS_URL ?? '';
const redisClient = (0, redis_1.createClient)({ url: redisUrl });
redisClient.on('error', (err) => console.error('Errore Client Redis:', err));
app.use(express_1.default.static(path_1.default.join(__dirname, 'public')));
const REDIS_TEXT_KEY = 'shared_textarea_content';
const REDIS_FILES_KEY = 'shared_files_list';
async function getSharedFiles() {
    const data = await redisClient.get(REDIS_FILES_KEY);
    return data ? JSON.parse(data) : [];
}
async function saveSharedFiles(files) {
    await redisClient.set(REDIS_FILES_KEY, JSON.stringify(files));
}
// Rotta HTTP
app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file)
        return res.status(400).send('Nessun file caricato.');
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
        socket.on('text_change', async (newText) => {
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
        socket.on('delete_file', async (fileId) => {
            let files = await getSharedFiles();
            files = files.filter(f => f.id !== fileId);
            await saveSharedFiles(files);
            const filePath = path_1.default.join(uploadDir, fileId);
            if (fs_1.default.existsSync(filePath))
                fs_1.default.unlinkSync(filePath);
            io.emit('file_deleted', fileId);
        });
    });
    const PORT = process.env.PORT || 3003;
    httpServer.listen(PORT, () => {
    });
}
startServer().catch(console.error);
