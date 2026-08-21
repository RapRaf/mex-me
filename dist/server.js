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
require("dotenv/config");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer);
// Usa l'URL salvato nel file .env
const redisUrl = process.env.REDIS_URL ?? '';
const redisClient = (0, redis_1.createClient)({
    url: redisUrl
});
redisClient.on('error', (err) => console.error('Errore Client Redis:', err));
// Serviamo i file statici dalla cartella 'public'
app.use(express_1.default.static(path_1.default.join(__dirname, 'public')));
// Chiave in cui salveremo il testo su Redis
const REDIS_KEY = 'shared_textarea_content';
async function startServer() {
    // Connettiamoci a Redis prima di avviare il server
    await redisClient.connect();
    console.log('Connesso a Redis con successo.');
    io.on('connection', async (socket) => {
        console.log(`Nuovo client connesso: ${socket.id}`);
        // 1. All'avvio del client, recuperiamo il testo da Redis e glielo inviamo
        const currentText = await redisClient.get(REDIS_KEY) || '';
        socket.emit('init_text', currentText);
        socket.on('text_change', async (newText) => {
            await redisClient.set(REDIS_KEY, newText);
            socket.broadcast.emit('text_update', newText);
        });
        socket.on('disconnect', () => {
            console.log(`Client disconnesso: ${socket.id}`);
        });
    });
    const PORT = process.env.PORT || 3000;
    httpServer.listen(PORT, () => {
        console.log(`Server in ascolto sulla porta ${PORT}`);
        console.log(`Visita http://localhost:${PORT} nel tuo browser.`);
    });
}
startServer().catch(console.error);
