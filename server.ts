import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import path from 'path';
import 'dotenv/config';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// Usa l'URL salvato nel file .env
const redisUrl = process.env.REDIS_URL ?? '';

const redisClient = createClient({
    url: redisUrl
});

redisClient.on('error', (err) => console.error('Errore Client Redis:', err));

// Serviamo i file statici dalla cartella 'public'
app.use(express.static(path.join(__dirname, 'public')));

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

        socket.on('text_change', async (newText: string) => {
            
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
