import fs from 'fs';
import path from 'path';
import { BACKUP_DIR } from './config';
import { log, error } from './log';

const SAVE_DELAY_MS = 250;
const BACKUP_DAYS = 14;
const all: JsonFile<unknown>[] = [];

/**
 * Un file JSON tenuto in memoria e riscritto su disco poco dopo ogni modifica.
 * La scrittura è atomica (file temporaneo + rename): un crash a metà non
 * lascia mai un file troncato. Un solo processo deve scrivere i file
 * (pm2 con instances: 1).
 */
export class JsonFile<T> {
    data: T;
    private timer: NodeJS.Timeout | null = null;
    private writing: Promise<void> = Promise.resolve();
    private dirty = false;

    constructor(readonly file: string, defaults: () => T) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        this.data = this.load(defaults);
        all.push(this as JsonFile<unknown>);
    }

    private load(defaults: () => T): T {
        if (!fs.existsSync(this.file)) return defaults();
        const raw = fs.readFileSync(this.file, 'utf8');
        try {
            return JSON.parse(raw) as T;
        } catch (e) {
            // Non si riparte mai in silenzio da vuoto: il server non si avvia
            // finché il file non viene sistemato o ripristinato da data/backups.
            throw new Error(`File dati illeggibile: ${this.file}. Ripristinalo da ${BACKUP_DIR}. (${(e as Error).message})`);
        }
    }

    /** Segna i dati come modificati: verranno salvati entro SAVE_DELAY_MS. */
    save() {
        this.dirty = true;
        if (this.timer) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            this.writing = this.writing.then(() => this.write()).catch(e => error('Salvataggio fallito', this.file, e));
        }, SAVE_DELAY_MS);
    }

    private async write() {
        if (!this.dirty) return;
        this.dirty = false;
        const tmp = this.file + '.tmp';
        await fs.promises.writeFile(tmp, JSON.stringify(this.data));
        await fs.promises.rename(tmp, this.file);
    }

    /** Scrittura sincrona immediata, per lo spegnimento. */
    flushSync() {
        if (this.timer) { clearTimeout(this.timer); this.timer = null; }
        if (!this.dirty) return;
        this.dirty = false;
        const tmp = this.file + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(this.data));
        fs.renameSync(tmp, this.file);
    }
}

/** Collezione di documenti {id: doc} salvata in un file JSON. */
export class Collection<T extends { id: string }> {
    private f: JsonFile<Record<string, T>>;
    constructor(file: string) { this.f = new JsonFile<Record<string, T>>(file, () => ({})); }
    get(id: string): T | undefined { return Object.prototype.hasOwnProperty.call(this.f.data, id) ? this.f.data[id] : undefined; }
    has(id: string) { return this.get(id) !== undefined; }
    all(): T[] { return Object.values(this.f.data); }
    get size() { return Object.keys(this.f.data).length; }
    set(doc: T) { this.f.data[doc.id] = doc; this.f.save(); return doc; }
    delete(id: string) { if (!this.has(id)) return false; delete this.f.data[id]; this.f.save(); return true; }
}

export function flushAll() {
    for (const f of all) {
        try { f.flushSync(); } catch (e) { error('Salvataggio finale fallito', f.file, e); }
    }
}

/**
 * Copia giornaliera dei file JSON in data/backups/AAAA-MM-GG/ (una volta al
 * giorno, all'avvio e poi ogni 6 ore); tiene gli ultimi BACKUP_DAYS giorni.
 */
export function startBackups(dataDir: string) {
    const run = () => {
        try {
            const day = new Date().toISOString().slice(0, 10);
            const dest = path.join(BACKUP_DIR, day);
            if (!fs.existsSync(dest)) {
                const files = fs.readdirSync(dataDir).filter(n => n.endsWith('.json'));
                if (files.length) {
                    fs.mkdirSync(dest, { recursive: true });
                    for (const n of files) fs.copyFileSync(path.join(dataDir, n), path.join(dest, n));
                    log(`Backup dati in ${dest}`);
                }
            }
            const days = fs.existsSync(BACKUP_DIR) ? fs.readdirSync(BACKUP_DIR).filter(n => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort() : [];
            for (const old of days.slice(0, Math.max(0, days.length - BACKUP_DAYS))) {
                fs.rmSync(path.join(BACKUP_DIR, old), { recursive: true, force: true });
            }
        } catch (e) { error('Backup fallito', e); }
    };
    run();
    setInterval(run, 6 * 3600e3).unref();
}
