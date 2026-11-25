# MexMe

Appunti condivisi e diario del team, in tempo reale.

- **Appunti** (visibili a tutti, anche senza entrare): una lavagna di testo condivisa e i file caricati, con l'avanzamento degli upload visto da tutti e la lista di chi è connesso.
- **Diario del team** (dopo aver scelto il profilo in "Chi sei?"):
  - **Home**: task e sottotask annidati, stati, date, assegnatari, allegati e note del team (una chat per task).
  - **Priorità**: kanban a 3 colonne con label e trascinamento.
  - **Admin**: calendario e agenda in sola lettura.
  - **Appunti**: la stessa vista della pagina iniziale.

Design e funzioni del diario vengono dalla repo dei grafici *2F_Slack*, riscritta e integrata qui.

## Avvio

```bash
npm install
cp .env.example .env     # imposta KNOWN_IPS (e HOST/PORT)
npm run dev              # sviluppo, con riavvio automatico
npm run build && npm start   # produzione (pm2: ecosystem.config.cjs)
```

| Variabile | Uso |
|---|---|
| `PORT`, `HOST` | Indirizzo di ascolto. Dietro nginx: `HOST=127.0.0.1` |
| `KNOWN_IPS` | `{"ip":"nome"}`: solo questi IP possono accedere (HTTP e Socket.IO). Vuota = tutti |
| `DATA_DIR` | Cartella dei dati, default `./data` |
| `REDIS_URL` | Solo per la migrazione una tantum da Redis |

## Dati

Niente database: tutto sta in file JSON in `data/`, tenuti in memoria e riscritti in modo atomico (file temporaneo + rename) poco dopo ogni modifica. Il realtime passa da Socket.IO. Deve girare **un solo processo** (pm2 `instances: 1`).

```
data/
├── users.json        profili (creati al primo avvio: Raffa, Giada, Ludo, Pab)
├── tasks.json        task e sottotask (una tabella auto-referenziata: parentId, rootId, depth)
├── comments.json     note del team
├── attachments.json  allegati dei task
├── seen.json         note lette, per profilo
├── clipboard.json    testo e file degli Appunti
├── uploads/          i file caricati (nome = id)
└── backups/AAAA-MM-GG/  copia giornaliera dei JSON, ultimi 14 giorni
```

Per ripristinare un backup: fermare il server, copiare i file da `data/backups/<giorno>/` in `data/`, riavviare.

## Profili e accesso

- L'accesso è filtrato per IP (`KNOWN_IPS`, e `allow` in nginx).
- Il profilo scelto in "Chi sei?" vale **per scheda**: due schede possono essere due persone, e "Esci" in una non tocca le altre. Una scheda nuova riprende l'ultimo profilo scelto.
- Non ci sono password. Il server controlla le scritture: le note si eliminano solo dal proprio profilo, e la cancellazione dei task è a cascata.

## File caricati

Non ci sono limiti di tipo o dimensione. I file sono serviti da `/files/<id>` con `nosniff` e una CSP `sandbox`. Immagini, video, audio, PDF e testo semplice si aprono nel browser; tutto il resto si scarica (con `?dl=1` si forza il download). Un file HTML caricato non può quindi eseguire codice sul sito.

## Passaggio dalla versione precedente (Redis)

La migrazione è **automatica**. Al primo avvio, se `data/clipboard.json` non esiste ancora ed è impostato `REDIS_URL`, il server importa da Redis testo e file della clipboard prima di accettare connessioni. I file li prende da `dist/public/uploads`, quindi quella cartella **non va cancellata** prima del primo avvio. Il log riporta l'esito.

```bash
git pull && npm install && npm run build
pm2 restart MexMe            # oppure: pm2 start ecosystem.config.cjs --env production
pm2 logs MexMe               # "Appunti importati da Redis: …"
```

- Redis viene solo letto e i file vengono copiati in `data/uploads`: gli originali restano dove sono.
- Se Redis non risponde, il server parte lo stesso e ci riprova al prossimo avvio.
- Per rifarla a mano (a server fermo) c'è `npm run migrate:redis`:
  - `-- --from <cartella>` prende i file da un'altra cartella;
  - `-- --force` sovrascrive appunti già presenti.
- Dopo la migrazione Redis non serve più: si può togliere `REDIS_URL`.

Nginx: applicare `deploy/mexme.conf` (`deploy/update-nginx.sh`). Contiene `client_max_body_size 0`: senza, nginx rifiuta gli upload sopra 1 MB.

## Struttura

```
src/                 server (TypeScript)
├── server.ts        avvio: Express, Socket.IO, spegnimento pulito
├── config.ts        variabili d'ambiente, percorsi, profili iniziali
├── access.ts        IP reale (dietro nginx) e filtro KNOWN_IPS
├── store.ts         file JSON atomici + backup
├── data.ts          modello dati e collezioni
├── diario.ts        regole del diario: validazione, cascata, note, lette
├── files.ts         /upload e /files/:id
├── hub.ts           broadcast e presenza
├── realtime.ts      eventi Socket.IO
└── scripts/migrate-redis.ts
public/              client (JavaScript senza build, moduli ES)
├── index.html
├── css/app.css      palette "Lab poster", tema chiaro/scuro con light-dark()
└── js/
    ├── main.js      render complessivo, navigazione (#home #priorita #admin #admin-lista #appunti)
    ├── state.js     dati, indici, helper condivisi
    ├── net.js       socket, scritture ottimistiche, upload
    ├── session.js   "Chi sei?", entra/esci per scheda
    ├── clipboard.js Appunti e connessi
    ├── home.js  dialog.js  attach.js  chat.js  prio.js  admin.js
    └── util.js
```

### Convenzioni del client

- **Testo sicuro:** ogni valore che arriva dal server passa da `esc()` prima di finire in HTML, oppure va in `textContent`.
- **Focus:** le viste si ridisegnano senza togliere il focus a chi sta scrivendo (`setVal`, chiavi strutturali). Il kanban non si ricostruisce durante un trascinamento.
- **Scritture ottimistiche:** si vedono subito, e le patch dello stesso task si accodano e si uniscono. Se il server rifiuta una scrittura, il client richiede tutti i dati (`diario:sync`).
- **Liste estendibili:** le label stanno in `LABELS` in `prio.js` (aggiungerne una = una riga) e i colori persona in `COLORS` in `util.js` (indice `users.c`).
- **Storage del browser:** solo comodità, mai dati condivisi: filtri, blocchi compressi, profilo della scheda (`mx-*`).
