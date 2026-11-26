/**
 * Dati di prova per lavorare in locale.  npm run seed   (oppure npm run seed -- --force)
 *
 * Crea task, sottotask, priorità, label, note del team e testo degli appunti
 * d'esempio, distribuiti tra i profili di KNOWN_IPS, con date intorno a oggi.
 *
 * Protezioni:
 * - funziona SOLO con una configurazione di sviluppo: tutti gli IP di KNOWN_IPS
 *   devono essere 127.0.0.1, ::1 o finti 10.99.0.N (come in .env.example);
 * - l'app deve essere ferma (tiene i dati in memoria e li riscriverebbe);
 * - se ci sono già dei task non fa nulla; con --force svuota prima diario e appunti.
 */
import net from 'net';
import fs from 'fs';
import { KNOWN_IPS, PORT, UPLOAD_DIR, DATA_DIR } from '../config';
import { users, tasks, comments, attachments, bugs, seen, clipboard, syncProfilesFromIps } from '../data';
import { createTask, patchTask, addComment } from '../diario';
import { createBug, confirmBug, rejectBug } from '../bugs';
import { flushAll } from '../store';

const DEV_IP = /^(127\.0\.0\.1|::1|10\.99\.0\.\d{1,3})$/;

function fail(msg: string): never { console.error(msg); process.exit(1); }

const portInUse = (port: number) => new Promise<boolean>(res => {
    const s = net.connect(port, '127.0.0.1', () => { s.destroy(); res(true); });
    s.on('error', () => res(false));
});

/** Data locale tra `n` giorni (negativo = nel passato), YYYY-MM-DD. */
const day = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ago = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

async function main() {
    const ips = Object.keys(KNOWN_IPS);
    if (!ips.length || !ips.every(ip => DEV_IP.test(ip))) {
        fail('Questo script funziona solo in sviluppo: in KNOWN_IPS ci devono essere solo 127.0.0.1, ::1 e IP finti 10.99.0.N (vedi .env.example).');
    }
    if (await portInUse(PORT)) fail(`L'app è avviata sulla porta ${PORT}: fermala (Ctrl+C) e rilancia npm run seed.`);

    const force = process.argv.includes('--force');
    if (tasks.size && !force) fail(`Ci sono già dei task in ${DATA_DIR}: niente da fare. Per ripartire da zero: npm run seed -- --force`);
    if (force) {
        for (const c of [tasks, comments, attachments, bugs]) for (const d of c.all()) c.delete(d.id);
        seen.data = {}; seen.save();
        for (const f of clipboard.data.files) fs.rmSync(`${UPLOAD_DIR}/${f.id}`, { force: true });
        clipboard.data = { text: '', files: [] }; clipboard.save();
    }

    syncProfilesFromIps();
    const people = users.all().filter(u => u.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0)).map(u => u.id);
    if (!people.length) fail('Nessun profilo: controlla KNOWN_IPS nel .env.');
    const P = (i: number) => people[i % people.length]!;

    const T = (by: number, title: string, parentId: string | null, patch: Record<string, unknown> = {}) => {
        const t = createTask({ title, parentId }, P(by));
        return Object.keys(patch).length ? patchTask(t.id, patch, P(by)) : t;
    };

    const a = T(1, 'Nuova schermata di benvenuto', null, { status: 'doing', startDate: day(-5), endDate: day(3), priority: 'high', label: 'migliorie', notes: 'Bozza approvata, mancano le animazioni e i testi definitivi' });
    T(0, 'Bozza grafica', a.id, { status: 'done', startDate: day(-5), endDate: day(-2), completedAt: ago(2), assigneeId: P(0) });
    const a2 = T(2, 'Animazioni di ingresso', a.id, { status: 'doing', startDate: day(-1), endDate: day(2), assigneeId: P(2) });
    T(3, 'Revisione con il team', a2.id, { endDate: day(4), assigneeId: P(3) });
    T(1, 'Testi definitivi', a.id, { assigneeId: P(1) });

    const b = T(2, 'Crash all\'apertura su alcuni telefoni', null, { endDate: day(-1), priority: 'high', label: 'bug', assigneeId: P(2) });
    T(2, 'Riprodurre il problema', b.id, { status: 'doing', startDate: day(0) });

    const c = T(3, 'Pagina del negozio', null, { status: 'doing', startDate: day(-3), endDate: day(7), priority: 'med', label: 'adv' });
    T(3, 'Mockup', c.id, { status: 'done', startDate: day(-3), endDate: day(0), completedAt: ago(0) });
    T(0, 'Collegamento ai pagamenti', c.id, { assigneeId: P(0) });

    T(0, 'Ottimizzare le immagini', null, { priority: 'low', assigneeId: P(0) });
    T(1, 'Video di presentazione', null, { status: 'done', startDate: day(-12), endDate: day(-6), completedAt: ago(6), priority: 'med', assigneeId: P(1) });
    T(2, 'Aggiornare la documentazione', null, { priority: 'low' });

    addComment({ taskId: a.id, text: 'Ho caricato i riferimenti nella cartella condivisa' }, P(1));
    addComment({ taskId: a.id, text: 'Perfetto, inizio dalle animazioni oggi pomeriggio' }, P(2));
    addComment({ taskId: b.id, text: 'Succede solo con la versione di rilascio' }, P(3));

    createBug({ title: 'Il calendario non mostra i task di oggi', text: 'Apro Visualizzazione → Calendario: la casella di oggi è vuota anche se ho due task che finiscono oggi.\nSuccede su Firefox, su Chrome sembra a posto.' }, P(1));
    createBug({ title: 'Il pulsante Allega non risponde su iPhone', text: 'Nel dialog del task tocco "Carica file" e non succede niente.' }, P(3));
    confirmBug(createBug({ title: 'Le note nuove restano magenta dopo averle lette', text: 'Apro la chat del task, leggo tutto, chiudo: il badge resta acceso finché non ricarico.' }, P(2)).id, P(0));
    rejectBug(createBug({ title: 'Il sito è lento', text: 'Stamattina caricava piano.' }, P(3)).id, P(1));

    clipboard.data.text = 'Appunti di prova\n\nQui si scrive insieme in tempo reale: apri la pagina in due finestre e prova.\n\n- link utili\n- cose da ricordare';
    clipboard.save();

    flushAll();
    console.log(`Dati di prova creati in ${DATA_DIR}: ${tasks.size} task, ${comments.size} note, ${bugs.size} bug, profili: ${people.join(', ')}.`);
    console.log('Ora avvia l\'app: npm run dev');
}

main().catch(e => { console.error(e); process.exit(1); });
