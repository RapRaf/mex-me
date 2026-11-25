/**
 * Migrazione manuale della vecchia clipboard da Redis ai file JSON.
 * (Il server la fa già da solo al primo avvio, se data/clipboard.json non esiste.)
 *
 *   npm run migrate:redis                     (file da dist/public/uploads e public/uploads)
 *   npm run migrate:redis -- --from /percorso/uploads
 *   npm run migrate:redis -- --force          (sovrascrive appunti già presenti)
 *
 * Va lanciato a server FERMO (il server riscrive data/clipboard.json).
 */
import path from 'path';
import { clipboard } from '../data';
import { flushAll } from '../store';
import { migrateFromRedis, OLD_UPLOAD_DIRS } from '../migrate';

async function main() {
    const args = process.argv.slice(2);
    const fromIdx = args.indexOf('--from');
    const dirs = fromIdx >= 0 && args[fromIdx + 1] ? [path.resolve(args[fromIdx + 1]!)] : OLD_UPLOAD_DIRS;
    if (!args.includes('--force') && (clipboard.data.text || clipboard.data.files.length)) {
        console.error('data/clipboard.json contiene già degli appunti: niente da fare (usa --force per sovrascrivere).');
        process.exit(1);
    }
    if (!process.env.REDIS_URL) { console.error('REDIS_URL non impostata nel .env'); process.exit(1); }
    const r = await migrateFromRedis(process.env.REDIS_URL, dirs);
    flushAll();
    console.log(`Testo: ${r.textLength} caratteri`);
    console.log(`File migrati: ${r.migrated} di ${r.total} (gli originali restano dove sono)`);
    if (r.missing.length) console.log(`File non trovati in ${dirs.join(' o ')}: ${r.missing.join(', ')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
