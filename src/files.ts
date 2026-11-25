import fs from 'fs';
import path from 'path';
import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { UPLOAD_DIR } from './config';
import { attachments, clipboard, profileOfIp, type ClipFile } from './data';
import { addAttachment, newId, UserError } from './diario';
import { getIo, upsert, whoIs, type SocketData } from './hub';
import { getClientIp } from './access';
import { log, warn } from './log';

// Dipendenze già presenti tramite express (senza tipi pubblicati).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const mime: { lookup(p: string): string | false } = require('mime-types');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const contentDisposition: (name: string, opts?: { type?: string }) => string = require('content-disposition');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const FILE_ID = /^[A-Za-z0-9_-]{6,64}$/;
export const filePath = (id: string) => path.join(UPLOAD_DIR, id);
export const typeOf = (name: string) => mime.lookup(name) || 'application/octet-stream';

/** Elimina un file caricato dal disco (se esiste). */
export function unlinkFile(id: string) {
    if (!FILE_ID.test(id)) return;
    fs.promises.unlink(filePath(id)).catch(() => { });
}

// I file si salvano col solo id (niente nome originale su disco). Nessun limite
// di dimensione o di tipo, come la clipboard di sempre.
const upload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
        filename: (_req, _file, cb) => cb(null, newId()),
    }),
    defParamCharset: 'utf8',
});

// Tipi mostrati direttamente nel browser; tutto il resto si scarica.
const INLINE = /^(image\/(png|jpeg|gif|webp|avif|bmp|svg\+xml)|video\/|audio\/|application\/pdf$|text\/plain$)/;

export const filesRouter = express.Router();

filesRouter.post('/upload', upload.single('file'), (req: Request, res: Response) => {
    const f = req.file;
    if (!f) { res.status(400).json({ ok: false, error: 'Nessun file caricato.' }); return; }
    const body = (req.body || {}) as Record<string, string | undefined>;
    const io = getIo(), ip = getClientIp(req);
    const profile = profileOfIp(ip);
    const meta = { id: f.filename, name: (f.originalname || 'file').slice(0, 200), size: f.size, contentType: typeOf(f.originalname || '') };

    // Allegato di un task
    if (body.taskId) {
        try {
            if (!profile) throw new UserError('no_profile');
            const a = addAttachment(meta, body.taskId, profile);
            upsert('attachments', [a]);
            log(`Allegato caricato: ${meta.name} (${meta.size} B) su ${a.taskId} da ${profile}`);
            res.json({ ok: true, attachment: a });
        } catch (e) {
            unlinkFile(meta.id);
            const code = e instanceof UserError ? e.code : 'error';
            res.status(code === 'not_found' ? 404 : 400).json({ ok: false, error: code });
        }
        return;
    }

    // File degli Appunti
    const file: ClipFile = { ...meta, ...whoIs(profile, ip), createdAt: new Date().toISOString() };
    clipboard.data.files.push(file);
    clipboard.save();
    const tempId = typeof body.tempId === 'string' ? body.tempId.slice(0, 64) : '';
    if (tempId) for (const s of io.sockets.sockets.values()) (s.data as SocketData).uploads?.delete(tempId);
    io.emit('clip:file', { file, tempId });
    log(`File caricato negli appunti: ${meta.name} (${meta.size} B) da ${file.uploaderName}`);
    res.json({ ok: true, file });
});

/** Metadati di un file servito: allegato di un task o file degli Appunti. */
function findMeta(id: string): { name: string; contentType: string } | undefined {
    const a = attachments.get(id);
    if (a) return a;
    return clipboard.data.files.find(f => f.id === id);
}

filesRouter.get('/files/:id', (req: Request, res: Response) => {
    const id = String(req.params.id);
    const meta = FILE_ID.test(id) ? findMeta(id) : undefined;
    if (!meta || !fs.existsSync(filePath(id))) { res.status(404).send('File non trovato.'); return; }
    const type = typeOf(meta.name);
    const inline = req.query.dl === undefined && INLINE.test(type);
    res.setHeader('Content-Type', type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', contentDisposition(meta.name, { type: inline ? 'inline' : 'attachment' }));
    // I file caricati non devono mai poter eseguire script con l'origine del sito.
    // (Il visualizzatore PDF di Chrome non funziona in sandbox: i PDF ne restano fuori.)
    if (type !== 'application/pdf') res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.sendFile(filePath(id));
});

// Upload interrotti (scheda chiusa, rete caduta): multer segnala l'errore qui.
filesRouter.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
    if (!err) return next();
    warn('Upload non riuscito:', (err as Error).message || err, 'da', getClientIp(req));
    if (req.file) unlinkFile(req.file.filename);
    if (!res.headersSent) res.status(400).json({ ok: false, error: 'upload_failed' });
});
