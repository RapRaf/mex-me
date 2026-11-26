# CLAUDE.md: contesto completo di MexMe

Questo file è il punto di partenza per chiunque lavori al progetto, persona o assistente AI (Claude Code lo legge da solo).
Leggilo tutto prima di modificare qualcosa. Per i dettagli rimanda ai file in `docs/`.

**Lingua del progetto: italiano.** Interfaccia, commenti, commit e documentazione sono in italiano.

---

## 1. Che cos'è

**MexMe** è un'app web interna per un piccolo team. Mette insieme due cose:

1. **Appunti:** una lavagna di testo e una zona file condivise in tempo reale. Quello che uno scrive o carica lo vedono subito tutti, compresi l'avanzamento degli upload e chi è connesso.
2. **Diario del team:** un task tracker.
   - Task e sottotask annidati, con stato, date e assegnatario.
   - Allegati e note del team (una chat per ogni task).
   - Una vista **Priorità** a kanban con label.
   - Una vista **Visualizzazione** (calendario e agenda) in sola lettura.

Non c'è login. **La persona viene riconosciuta dall'indirizzo IP:** ogni IP ammesso è legato a un profilo (vedi §5). Chi arriva da un IP non ammesso viene bloccato.

Le funzioni e lo stile del diario vengono da un prototipo dei grafici (la repo "2F_Slack", non inclusa qui). Il codice è stato riscritto e integrato nella clipboard esistente.

## 2. Tecnologie (tutte semplici, niente framework nel browser)

| Parte | Cosa usa |
|---|---|
| Server | **Node.js** (≥ 22) + **TypeScript**, **Express** (HTTP), **Socket.IO** (tempo reale), **multer** (upload) |
| Browser | HTML + CSS + **JavaScript puro a moduli ES**, **nessuna build**: si modifica il file e si ricarica la pagina |
| Dati | **File JSON** sul disco del server (niente database), in `data/` |
| Produzione | Server Linux, **nginx** davanti (HTTPS + filtro IP), **pm2** che tiene acceso il processo |

## 3. Avvio in locale (in breve)

Non servono database né Redis: basta Node.js.

```bash
npm install
cp .env.example .env      # va bene così per lavorare in locale
npm run seed              # (facoltativo) task, note e appunti d'esempio
npm run dev               # avvia il server e lo riavvia a ogni modifica in src/
# apri http://127.0.0.1:3003  → entri come profilo "Sviluppo"
npm run persone           # (in un secondo terminale) persone di prova: :3011 Anna, :3012 Bruno, :3013 Carla
npm test                  # controlla di non aver rotto niente (verifiche automatiche)
```

Guida passo passo per chi parte da zero, esempi di modifiche e problemi comuni: **[docs/GUIDA.md](docs/GUIDA.md)**.

## 4. Struttura del progetto

```
├── CLAUDE.md               ← questo file
├── README.md               ← panoramica breve
├── docs/
│   ├── GUIDA.md            ← per chi inizia: installazione, come aggiungere funzioni, checklist, problemi comuni
│   ├── AMBIENTE.md         ← come gira davvero l'app in produzione (server, nginx, pm2, dati, backup, aggiornamenti)
│   ├── ARCHITETTURA.md     ← come funziona dentro: flussi, moduli, elenco completo dei messaggi Socket.IO e HTTP
│   ├── DATI.md             ← i file JSON e tutti i campi
│   ├── INTERFACCIA.md      ← viste, interazioni, decisioni di design, palette
│   └── CHANGELOG.md        ← storia delle versioni
├── src/                    ← SERVER (TypeScript)
│   ├── server.ts           avvio: Express, Socket.IO, migrazione iniziale, spegnimento pulito
│   ├── config.ts           variabili d'ambiente (.env) e percorsi
│   ├── access.ts           IP reale del client (dietro nginx) e blocco degli IP non ammessi
│   ├── store.ts            salvataggio dei file JSON (atomico) + backup giornalieri
│   ├── data.ts             modello dati, collezioni, profili creati da KNOWN_IPS
│   ├── diario.ts           regole del diario: validazione, creazione, cascata, note, lette
│   ├── files.ts            POST /upload e GET /files/:id
│   ├── hub.ts              riferimento a Socket.IO, broadcast, lista dei connessi
│   ├── realtime.ts         tutti i messaggi Socket.IO (cosa fa il server per ognuno)
│   ├── migrate.ts          import una tantum della vecchia clipboard da Redis
│   └── scripts/
│       ├── seed.ts         dati di prova in locale (npm run seed; rifiuta configurazioni non di sviluppo)
│       └── migrate-redis.ts   la migrazione da Redis lanciata a mano
├── public/                 ← BROWSER (servito così com'è)
│   ├── index.html          tutta la struttura della pagina (viste e dialog)
│   ├── css/app.css         tutto lo stile
│   └── js/                 moduli ES (vedi §7)
├── test/run.cjs            test automatici (npm test)
├── dev/persone.cjs         persone di prova in locale (npm run persone): un ingresso per ogni IP finto 10.99.0.N
├── deploy/
│   ├── mexme.conf.example  modello della configurazione nginx (quella vera NON è in git)
│   └── update-nginx.sh     applica la configurazione nginx sul server
├── ecosystem.config.cjs    configurazione pm2
├── .env.example            modello del .env (quello vero NON è in git)
└── data/                   ← DATI (creata dal server, NON è in git, non va mai committata)
```

## 5. Profili e accesso (importante)

- `KNOWN_IPS` nel `.env` è una mappa `{"IP": "Nome"}`.
  - Solo quegli IP possono aprire il sito (HTTP e Socket.IO); gli altri ricevono **403**.
  - **Il nome è il profilo** di chi si collega da quell'IP: entra subito come quella persona, senza scegliere né cambiare profilo.
  - Più IP con lo stesso nome (es. PC e telefono) sono la stessa persona.
- All'avvio (`syncProfilesFromIps` in `src/data.ts`) ogni nome viene legato al profilo con lo stesso nome o id; se non esiste, il profilo viene creato.
  - Un profilo creato così e poi sparito da `KNOWN_IPS`, mai usato in task o note, viene rimosso.
  - Un profilo senza IP resta assegnabile ai task.
- **Il server decide chi sei, non il browser:** autore di task, note e upload viene dall'IP della connessione. Il browser non può dichiararsi un altro.
- In produzione nginx passa l'IP vero nell'header `X-Real-IP`, e il server lo accetta **solo** se la connessione arriva da `127.0.0.1` (cioè da nginx). Vedi `src/access.ts`.
- `KNOWN_IPS` vuota = accesso libero, ma nessuno ha un profilo: si vedono solo gli Appunti.

## 6. Come funziona il tempo reale (riassunto)

Dettagli ed elenco completo dei messaggi: **[docs/ARCHITETTURA.md](docs/ARCHITETTURA.md)**.

1. Il browser si collega con Socket.IO e riceve subito tutto:
   - `clip:init`: testo e file degli appunti;
   - `diario:init`: `me` (il suo profilo), `users`, `tasks`, `comments`, `attachments`;
   - `presence`: chi è connesso.
2. Per modificare, il browser manda un **comando**, per esempio `task:patch {id, patch}`.
   - Il server lo **valida**, salva su file e manda a tutti `diario:upsert {col, docs}` o `diario:remove {col, ids}`.
   - Al mittente risponde con `{ok: true}` oppure `{ok: false, error}`.
3. Il browser applica le modifiche **subito, in modo ottimistico** (`public/js/net.js`): la pagina non aspetta il server.
   - Se il server rifiuta, il browser chiede di nuovo tutti i dati (`diario:sync`) e mostra un avviso.
4. Gli upload passano da HTTP (`POST /upload`) per avere l'avanzamento. I file si scaricano da `GET /files/:id`.

## 7. Il codice del browser (`public/js/`)

| Modulo | Compito |
|---|---|
| `main.js` | Avvio: registra la funzione che ridisegna tutto, navigazione via `#hash`, scorciatoie da tastiera |
| `state.js` | Dati ricevuti (`db`), stato dell'interfaccia (`app`), indici (`idx`), helper condivisi (avatar, badge…), `renderAll()` |
| `net.js` | Socket.IO, comandi verso il server, scritture ottimistiche dei task, upload con avanzamento |
| `session.js` | Profilo di chi guarda (lo manda il server), chip utente in alto |
| `clipboard.js` | Vista Appunti: lavagna, file, upload, trascina/incolla, connessi |
| `home.js` | Home: campo nuovo task, filtri, tabella con sottotask |
| `dialog.js` | Dialog di dettaglio del task e albero dei sottotask |
| `attach.js` | Dialog allegati e caricamento allegati |
| `chat.js` | Dialog note del team |
| `prio.js` | Vista Priorità (kanban), label (`LABELS`), trascinamento |
| `admin.js` | Vista Visualizzazione: calendario e agenda (il file si chiama ancora admin) |
| `util.js` | Funzioni di base: `$`, `esc`, date, formati, colori persona (`COLORS`), icone SVG, `localStorage` |

Viste (indirizzo nella barra):

| Indirizzo | Vista |
|---|---|
| `#home` | Home |
| `#priorita` | Priorità |
| `#visualizzazione` | Calendario |
| `#visualizzazione-agenda` | Agenda |
| `#appunti` | Appunti |

I vecchi `#admin` e `#admin-lista` vengono reindirizzati.

## 8. Regole del codice (da rispettare sempre)

**Sicurezza**
- Ogni testo che arriva dal server o dagli utenti passa da **`esc()`** prima di finire in una stringa HTML, oppure va in `textContent`. Mai `innerHTML` con testo non "escapato".
- Il server valida tutto ciò che riceve (`src/diario.ts`, oggetto `FIELDS`): un campo nuovo modificabile va aggiunto lì, con la sua validazione.
- I file caricati si servono solo da `/files/:id`, con gli header di sicurezza già impostati in `src/files.ts`.
- **Mai dati sensibili nella repo:** IP, password, nomi reali, percorsi del server. Stanno solo in `.env` e `deploy/mexme.conf`, che sono esclusi da git.

**Dati**
- Si legge e si scrive solo tramite le collezioni di `src/data.ts`; mai a mano nei file di `data/`.
- Le date di calendario sono stringhe `YYYY-MM-DD` in ora locale; gli istanti (`createdAt`, `updatedAt`, `completedAt`) sono ISO in UTC.
- Automatismi di stato, nel browser (`setStatus` in `net.js`):
  - "In corso" imposta l'inizio, se vuoto;
  - "Fatto" imposta fine e inizio, se vuoti, e `completedAt`.
- Chiusura automatica dei padri, sul server (`cascadeParents` in `src/diario.ts`, previsione in `cascadeLocal` di `net.js`): tutti i sottotask fatti ⇒ padre "Fatto"; un sottotask riaperto ⇒ padre fatto torna "In corso".

**Interfaccia**
- `renderAll()` ridisegna tutte le viste ed è **sincrona**: alcune viste ci contano (vedi `pForce` in `prio.js`).
- Non togliere il focus a chi scrive:
  - i valori dei campi si aggiornano con `setVal()`, che salta il campo attivo;
  - strutture come l'albero dei sottotask o il kanban si ricostruiscono solo se cambiano davvero.
- `localStorage` serve solo per comodità di chi guarda (filtri, blocchi compressi), con chiavi `mx-*` e tramite l'helper `ls`. Mai per dati condivisi.
- Testi dell'interfaccia in italiano, etichette con la sola iniziale maiuscola, **niente emoji come icone**: le icone sono SVG in `util.js`.
- Colori e stile: usa le variabili CSS in cima a `app.css` (`--ink`, `--panel`, `--acc`…). Tema chiaro e scuro automatici con `light-dark()`. Dettagli in [docs/INTERFACCIA.md](docs/INTERFACCIA.md).
- Liste estendibili:
  - label in `LABELS` (`prio.js`): aggiungerne una = una riga;
  - colori persona in `COLORS` (`util.js`).

**Server**
- Un comando del diario si aggiunge in `src/realtime.ts` con `command(s, 'nome', (profilo, dati) => …)`: controlla già che ci sia un profilo e gestisce gli errori.
- Gli errori "dell'utente" si lanciano con `new UserError('bad_request' | 'not_found' | 'forbidden' | 'no_profile', 'messaggio')`.
- Deve girare **un solo processo** (i file JSON stanno in memoria): mai `instances` > 1 in pm2.

## 9. Flusso di lavoro con git

- **Mai lavorare direttamente su `main`.** Crea un branch per ogni funzione: `git checkout -b funzione/nome-breve`.
- Commit piccoli, con il messaggio in italiano che dice cosa cambia (es. "Aggiunge la stima in ore ai task").
- Prima di ogni push: `npm test` deve dare **0 falliti**, più la prova a mano della checklist in [docs/GUIDA.md](docs/GUIDA.md), anche con più persone (`npm run persone`).
- **Si pusha sul repository locale del team** (quello da cui hai clonato), **non su GitHub**. GitHub e il server di produzione li gestisce il responsabile del progetto, che rivede e integra.
- Mai committare `.env`, `data/`, `deploy/mexme.conf`, `node_modules/`, `dist/`: sono già in `.gitignore`.
- Aggiorna la documentazione se cambi il comportamento:
  - nuove viste o interazioni → `docs/INTERFACCIA.md`;
  - nuovi campi → `docs/DATI.md`;
  - nuovi messaggi → `docs/ARCHITETTURA.md`;
  - una riga in `docs/CHANGELOG.md` sotto "Non ancora pubblicato".

## 10. Ambiente di produzione (riassunto)

Dettagli: **[docs/AMBIENTE.md](docs/AMBIENTE.md)**.

- L'app gira su un server Linux della rete interna, gestita da **pm2** (`ecosystem.config.cjs`, nome processo `MexMe`), e ascolta solo in locale (`HOST=127.0.0.1`).
- **nginx** fa da ingresso: HTTPS, lista degli IP ammessi (`allow`), inoltro all'app con `X-Real-IP` e supporto WebSocket. Upload senza limite di dimensione.
- I dati stanno in `data/` sul server, con backup giornalieri in `data/backups/` (ultimi 14 giorni).
- Aggiornamento: `git pull && npm install && npm run build && pm2 restart MexMe` (lo fa il responsabile).

## 11. Limiti noti

- Niente password: chi controlla un IP ammesso è quella persona. Va bene per una rete interna fidata, non per Internet.
- Un solo processo, dati in memoria: adatto a un team piccolo (fino a qualche migliaio di task).
- Il trascinamento nel kanban non funziona col dito: su telefono e touch compare il menu "Priorità" nel box.
- I file caricati non hanno limiti di dimensione; occhio allo spazio disco del server.
- Se un IP cambia (DHCP, rete diversa) va aggiornato `KNOWN_IPS` (e `allow` in nginx).

## 12. Idee per il futuro (non ancora fatte)

- Gestione dei profili dall'interfaccia (colore, nome); oggi si fa da `KNOWN_IPS` e `data/users.json`.
- Più label per task e gestione delle label dall'interfaccia.
- Priorità e label anche nel dialog del task e in Home.
- Modifica di una nota già inviata, menzioni (@nome).
- Ricerca nel testo degli appunti, cronologia delle versioni della lavagna.
