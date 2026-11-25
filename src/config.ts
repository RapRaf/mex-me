import path from 'path';
import 'dotenv/config';

// src/ in sviluppo (tsx) e dist/ in produzione stanno entrambe un livello sotto la root.
export const ROOT = path.resolve(__dirname, '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');

export const PORT = Number(process.env.PORT) || 3003;
export const HOST = process.env.HOST || 'localhost';

// Mappa IP -> nome. Vuota = accesso non ristretto.
export const KNOWN_IPS: Record<string, string> = (() => {
    try {
        const v = process.env.KNOWN_IPS ? JSON.parse(process.env.KNOWN_IPS) : {};
        return v && typeof v === 'object' ? v : {};
    } catch (error) {
        console.error('Errore nel parsing di KNOWN_IPS dal file .env:', error);
        return {};
    }
})();

// Profili creati al primo avvio se la collezione users è vuota.
// c = indice del colore persona (vedi COLORS in public/js/util.js).
export const DEFAULT_USERS = [
    { id: 'raffa', name: 'Raffa', c: 0, order: 1 },
    { id: 'giada', name: 'Giada', c: 1, order: 2 },
    { id: 'ludo', name: 'Ludo', c: 4, order: 3 },
    { id: 'pab', name: 'Pab', c: 2, order: 4 },
];
