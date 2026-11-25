# MexMe

Appunti condivisi e diario del team, in tempo reale.

- **Appunti**: una lavagna di testo condivisa e i file caricati, con l'avanzamento degli upload visto da tutti e la lista di chi è connesso.
- **Diario del team**, per chi si collega da un IP associato a un profilo:
  - **Home**: task e sottotask annidati, stati, date, assegnatari, allegati e note del team (una chat per task).
  - **Priorità**: kanban a 3 colonne con label e trascinamento.
  - **Visualizzazione**: calendario e agenda in sola lettura.
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
| `KNOWN_IPS` | `{"ip":"Nome"}`: solo questi IP possono accedere (HTTP e Socket.IO), e il nome è il profilo di chi si collega. Vuota = accesso libero, solo Appunti |
| `DATA_DIR` | Cartella dei dati, default `./data` |
| `REDIS_URL` | Solo per la migrazione una tantum da Redis |

## Dati

Niente database: tutto sta in file JSON in `data/`, tenuti in memoria e riscritti in modo atomico (file temporaneo + rename) poco dopo ogni modifica. Il realtime passa da Socket.IO. Deve girare **un solo processo** (pm2 `instances: 1`).

```
data/
├── users.json        profili (creati dai nomi di KNOWN_IPS)
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

- **Il profilo lo decide il server dall'IP**, tramite `KNOWN_IPS`: chi si collega entra subito come la sua persona, senza scegliere né cambiare profilo. Un IP non in `KNOWN_IPS` riceve 403.
- **Ogni nome di `KNOWN_IPS` è un profilo.** Più IP con lo stesso nome (es. PC e telefono) sono la stessa persona. Un nome si lega al profilo con lo stesso nome (o id); se non esiste, il profilo viene creato all'avvio. Aggiungere una persona = una riga nel `.env` + riavvio.
- **Rinominare** in `KNOWN_IPS` un nome usato per creare un profilo, ma mai usato in task o note, fa sparire quel profilo al riavvio. Un profilo senza IP resta comunque assegnabile ai task.
- **Dietro nginx** l'IP arriva in `X-Real-IP`, che l'app accetta solo da `127.0.0.1`: l'app deve ascoltare su `HOST=127.0.0.1`.
- **Il server controlla le scritture:** le note si eliminano solo dal proprio profilo, e la cancellazione dei task è a cascata.

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

Nginx: la configurazione reale (`deploy/mexme.conf`, con IP e percorsi) è esclusa da git. Si crea da `deploy/mexme.conf.example` e si applica con `deploy/update-nginx.sh`. Deve contenere `client_max_body_size 0`: senza, nginx rifiuta gli upload sopra 1 MB.

Nella repo non vanno mai IP, password o altri dati del server: stanno solo in `.env` e `deploy/mexme.conf`.

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
    ├── main.js      render complessivo, navigazione (#home #priorita #visualizzazione #visualizzazione-agenda #appunti)
    ├── state.js     dati, indici, helper condivisi
    ├── net.js       socket, scritture ottimistiche, upload
    ├── session.js   profilo di chi guarda (deciso dal server)
    ├── clipboard.js Appunti e connessi
    ├── home.js  dialog.js  attach.js  chat.js  prio.js  admin.js
    └── util.js
```

### Convenzioni del client

- **Testo sicuro:** ogni valore che arriva dal server passa da `esc()` prima di finire in HTML, oppure va in `textContent`.
- **Focus:** le viste si ridisegnano senza togliere il focus a chi sta scrivendo (`setVal`, chiavi strutturali). Il kanban non si ricostruisce durante un trascinamento.
- **Scritture ottimistiche:** si vedono subito, e le patch dello stesso task si accodano e si uniscono. Se il server rifiuta una scrittura, il client richiede tutti i dati (`diario:sync`).
- **Liste estendibili:** le label stanno in `LABELS` in `prio.js` (aggiungerne una = una riga) e i colori persona in `COLORS` in `util.js` (indice `users.c`).
- **Storage del browser:** solo comodità, mai dati condivisi: filtri e blocchi compressi (`mx-*`).
