import fs from 'fs';
import path from 'path';
import { createClient } from 'redis';
import { ROOT, UPLOAD_DIR } from './config';
import { clipboard, type ClipFile } from './data';
import { newId } from './diario';
import { typeOf } from './files';

/* Migrazione della vecchia clipboard (testo e lista file su Redis, file in
   dist/public/uploads) ai file JSON. Redis viene solo letto; i file vengono
   copiati, gli originali restano dove sono. */

const REDIS_TEXT_KEY = 'shared_textarea_content';
const REDIS_FILES_KEY = 'shared_files_list';
export const OLD_UPLOAD_DIRS = [path.join(ROOT, 'dist', 'public', 'uploads'), path.join(ROOT, 'public', 'uploads')];

interface OldFile { id: string; url?: string; name?: string; size?: number }
export interface MigrationResult { textLength: number; migrated: number; total: number; missing: string[] }

export async function migrateFromRedis(redisUrl: string, dirs = OLD_UPLOAD_DIRS): Promise<MigrationResult> {
    // Niente tentativi infiniti di riconnessione: se Redis non c'è, si fallisce subito.
    const redis = createClient({ url: redisUrl, socket: { connectTimeout: 5000, reconnectStrategy: false } });
    redis.on('error', () => { });
    await redis.connect();
    let text: string, raw: string | null;
    try {
        text = (await redis.get(REDIS_TEXT_KEY)) || '';
        raw = await redis.get(REDIS_FILES_KEY);
    } finally {
        await redis.quit().catch(() => { });
    }

    const old: OldFile[] = raw ? JSON.parse(raw) : [];
    const files: ClipFile[] = [], missing: string[] = [];
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    for (const f of old) {
        const src = dirs.map(d => path.join(d, path.basename(String(f.id)))).find(p => fs.existsSync(p));
        if (!src) { missing.push(f.name || f.id); continue; }
        const id = newId();
        fs.copyFileSync(src, path.join(UPLOAD_DIR, id));
        const name = String(f.name || f.id).slice(0, 200);
        // Il vecchio nome su disco inizia col timestamp di caricamento.
        const ts = Number(String(f.id).split('-')[0]);
        files.push({
            id, name, size: Number(f.size) || fs.statSync(src).size, contentType: typeOf(name),
            uploadedBy: null, uploaderName: 'Clipboard precedente',
            createdAt: new Date(Number.isFinite(ts) && ts > 1e12 ? ts : Date.now()).toISOString(),
        });
    }
    clipboard.data = { text, files };
    clipboard.save();
    return { textLength: text.length, migrated: files.length, total: old.length, missing };
}
