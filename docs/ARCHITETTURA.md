# Architettura

Come funziona MexMe dentro: il percorso di una richiesta, il tempo reale, i moduli e l'elenco completo dei messaggi tra pagina e server.

---

## 1. Il percorso di una connessione

1. Il browser apre la pagina: `GET /` → `public/index.html`, poi CSS e moduli JS (file statici da `public/`).
   - Ogni richiesta HTTP passa prima da `httpGuard` (`src/access.ts`): un IP non in `KNOWN_IPS` riceve 403.
2. `public/js/net.js` apre la connessione Socket.IO (`window.io()`).
   - Anche qui un IP non ammesso viene rifiutato (`socketGuard`).
3. Alla connessione (`onConnection` in `src/realtime.ts`):
   - `initSocketData` (`src/hub.ts`) ricava l'IP e da lì il profilo (`profileOfIp` in `src/data.ts`);
   - il server manda:
     - `clip:init`: testo e file degli appunti;
     - `diario:init`: `{ me, users, tasks, comments, attachments }`, dove `me` è l'id del profilo o `null`;
     - `diario:seen`: le note già lette da questo profilo;
     - `presence` a tutti: la nuova lista dei connessi.
4. Il browser salva i dati in `db` (`state.js`), costruisce gli indici e ridisegna tutto (`renderAll`).

**Come si ricava l'IP** (`getClientIp`):
- se la connessione TCP arriva da `127.0.0.1` o `::1` (cioè da nginx), si usa l'header `X-Real-IP`;
- altrimenti si usa l'IP della connessione e gli header vengono ignorati, così un client non può fingersi un altro.

## 2. Il ciclo di una modifica (esempio: cambio di stato di un task)

```
 browser A                                    server                                   browser B
 ─────────                                    ──────                                   ─────────
 setStatus(id,'done')  (net.js)
   → patch(): aggiorna db.tasks SUBITO,
     ridisegna (ottimistico),
     mette la patch in coda
   → emit('task:patch', {id, patch}) ───────▶ command('task:patch'):
                                               - c'è un profilo? (sennò no_profile)
                                               - patchTask(): valida ogni campo (FIELDS)
                                               - salva (tasks.json, scrittura ritardata)
                                               - stato cambiato? cascadeParents():
                                                 padri chiusi/riaperti
                                               - upsert('tasks',[t,…padri]) ── diario:upsert ──▶ aggiorna db, ridisegna
   ◀──────────────────────── ack {ok:true} ──  (anche A riceve diario:upsert)
 "Salvato ✓"
```

- **Coda per task** (`pend`/`busy`/`inflight` in `net.js`): per ogni task parte una scrittura alla volta, e le modifiche arrivate nel frattempo si uniscono in una sola.
- **Niente sfarfallii:** i dati in arrivo dal server vengono fusi con le modifiche locali non ancora confermate (`withLocal`).
- **Se il server rifiuta** (`ok: false`):
  - `writeErr()` mostra un avviso in alto;
  - poi manda `diario:sync`, e il server rispedisce `diario:init` con i dati veri.
- **Creazione:** il browser genera l'id del nuovo task (`rid()`) per mostrarlo subito; il server lo accetta se è valido e libero, altrimenti ne crea uno nuovo.

## 3. Upload

- **Appunti** (`clipboard.js`):
  1. il browser manda `clip:upload_started` (gli altri mostrano una scheda "in caricamento");
  2. carica il file con `POST /upload` tramite XHR, che fornisce la percentuale;
  3. durante l'invio manda `clip:upload_progress` circa ogni 250 ms;
  4. a fine upload il server aggiunge il file a `clipboard.json` e manda a tutti `clip:file`;
  5. annullamento o errore → `clip:upload_cancel`; se la scheda si chiude a metà, lo manda il server.
- **Allegati dei task** (`attach.js`): `POST /upload` con il campo `taskId`; il server crea il documento in `attachments` e manda `diario:upsert`.
- **Allegati dei bug** (`bugs.js`): `POST /upload` con il campo `bugId` (dopo aver creato il bug); stesso percorso, con `taskId: ''` finché il bug non è confermato.
- **Chi carica** lo decide il server dall'IP; campi come `profile` mandati dal browser vengono ignorati.
- **Su disco** i file finiscono in `data/uploads/<id>`, senza nome originale né estensione.

## 4. Moduli del server (`src/`)

| File | Responsabilità |
|---|---|
| `server.ts` | Crea Express e Socket.IO; ordine di avvio: profili da `KNOWN_IPS` → migrazione Redis (solo al primo avvio) → backup → ascolto. Al `SIGINT`/`SIGTERM` salva tutto ed esce |
| `config.ts` | Legge il `.env`: `PORT`, `HOST`, `KNOWN_IPS`, `DATA_DIR`; percorsi di `public/`, `data/`, `uploads/`, `backups/` |
| `access.ts` | `getClientIp`, `isKnownIp`, `ipName`, i due filtri `httpGuard` (Express) e `socketGuard` (Socket.IO) |
| `store.ts` | `JsonFile` (un file JSON in memoria, salvato 250 ms dopo l'ultima modifica, in modo atomico), `Collection` (`{id: doc}` con `get/has/all/set/delete`), `flushAll`, `startBackups` |
| `data.ts` | Tipi (`User`, `Task`, `Comment`, `Attachment`, `Bug`, `ClipFile`), le collezioni, `syncProfilesFromIps`, `profileOfIp`, `isProfile` |
| `diario.ts` | Le regole: `createTask`, `patchTask` (+ `FIELDS` = campi modificabili e loro validazione), `deleteTask` (a cascata), `addComment`, `deleteComment` (solo le proprie), `addAttachment`, `deleteAttachment`, `setSeen`. `UserError` per gli errori da mostrare |
| `bugs.ts` | Le regole dei bug: `createBug`, `editBug`, `confirmBug` (crea il task e gli passa gli allegati), `rejectBug`, `reopenBug`, `deleteBug`, `addBugAttachment` |
| `files.ts` | `POST /upload` (multer, nomi UTF-8, nessun limite), `GET /files/:id` con header di sicurezza |
| `hub.ts` | Riferimento a `io`, `upsert`/`remove` (broadcast del diario), `presence`, dati del socket (`ip`, `ipName`, `profile`, `uploads`) |
| `realtime.ts` | Tutti i messaggi Socket.IO; `command()` per i comandi del diario (controllo profilo + errori + ack) |
| `migrate.ts` | Import della vecchia clipboard da Redis |

## 5. Moduli del browser (`public/js/`)

Sono moduli ES caricati da `<script type="module" src="/js/main.js">`; la libreria Socket.IO arriva da `/socket.io/socket.io.min.js` (la serve il server).

- **`main.js`** importa tutti gli altri; ordine di caricamento: util → state → net → clipboard → session → viste.
- **`state.js`** contiene:
  - `db`: copia dei dati;
  - `app`: profilo, `canWrite`, dialog aperti;
  - `idx`: `cm` = figli per padre (`''` = task principali), `attBy`, `comBy`, `attByBug` (allegati dei bug non ancora confermati);
  - `renderAll()`, che chiama la funzione registrata da `main.js`.
- **Ogni vista** ha una funzione `renderX()` che esce subito se la vista è nascosta.
- **`renderAll()`** viene chiamata dopo ogni messaggio dal server e dopo ogni modifica locale.
- **Sola lettura** (Visualizzazione): `openDlg(id, focus, true)` salva `app.canWrite` in `app.roSaved`, lo mette a `false` e lo ripristina alla chiusura. Chat e allegati aperti da lì restano in sola lettura.
- **Overlay e Esc:**
  - il dialog task `#ov` (z 10) sta sotto gli allegati `#ov2` (z 15), che stanno sotto le note `#ov3` (z 16);
  - Esc chiude prima le note, poi gli allegati, poi il dialog;
  - cambiare vista chiude tutto.

## 6. Elenco dei messaggi

### Dal server al browser

| Evento | Dati | Quando |
|---|---|---|
| `clip:init` | `{ text, files: ClipFile[] }` | alla connessione |
| `clip:text` | `string` | qualcun altro ha cambiato il testo |
| `clip:file` | `{ file: ClipFile, tempId }` | upload negli appunti completato |
| `clip:file_deleted` | `id` | file degli appunti eliminato |
| `clip:upload_started` | `{ tempId, name, size, by }` | qualcuno ha iniziato un upload |
| `clip:upload_progress` | `{ tempId, loaded, total, speed }` | avanzamento (byte, byte/s) |
| `clip:upload_cancel` | `{ tempId }` | upload annullato, fallito o scheda chiusa |
| `diario:init` | `{ me, users, tasks, comments, attachments, bugs }` | alla connessione e dopo `diario:sync` |
| `diario:upsert` | `{ col, docs }` | documenti creati o modificati (`col` = `users`/`tasks`/`comments`/`attachments`/`bugs`) |
| `diario:remove` | `{ col, ids }` | documenti eliminati |
| `diario:seen` | `{ taskId: createdAt }` | note lette del proprio profilo (anche da un'altra scheda) |
| `presence` | `[{ id, name, profileId }]` | qualcuno si è connesso o disconnesso |

### Dal browser al server

Tutti i comandi `task:*`, `comment:*`, `attachment:*`, `seen:*` richiedono un profilo e rispondono con un ack `{ ok: true, … }` oppure `{ ok: false, error, message }`.
Valori di `error`:
- `no_profile`: IP senza profilo;
- `not_found`: l'elemento non esiste;
- `forbidden`: operazione non permessa;
- `bad_request`: dati non validi;
- `error`: errore interno, finisce nei log.

| Evento | Dati | Effetto |
|---|---|---|
| `clip:text` | `string` | salva il testo e lo manda agli altri |
| `clip:upload_started` | `{ tempId, name, size }` | avvisa gli altri |
| `clip:upload_progress` | `{ tempId, loaded, total, speed }` | inoltra l'avanzamento |
| `clip:upload_cancel` | `{ tempId }` | avvisa gli altri |
| `clip:delete_file` | `id` | elimina il file (chiunque può farlo) |
| `diario:sync` | — | rispedisce `diario:init` |
| `task:create` | `{ id?, title, parentId? }` | crea un task o sottotask; ack `{ ok, task }`. Assegnato a chi lo crea |
| `task:patch` | `{ id, patch }` | modifica i campi in `FIELDS` (vedi [DATI.md](DATI.md)). Se cambia lo stato, chiude o riapre i padri (`cascadeParents`) e manda anche loro nello stesso `diario:upsert` |
| `task:delete` | `{ id }` | elimina il task, i discendenti, le loro note e i loro allegati (file compresi) |
| `bug:create` | `{ id?, title, text }` | segnala un bug; ack `{ ok, bug }` |
| `bug:edit` | `{ id, title?, text? }` | modifica un bug (solo chi l'ha segnalato, se non confermato) |
| `bug:confirm` | `{ id }` | crea il task assegnato a chi conferma, gli passa gli allegati, segna il bug confermato; ack `{ ok, task }`. Manda `diario:upsert` di `tasks`, `attachments` e `bugs` |
| `bug:reject` / `bug:reopen` | `{ id }` | scarta un bug da revisionare / riapre uno scartato |
| `bug:delete` | `{ id }` | elimina un bug non confermato e i suoi allegati (solo chi l'ha segnalato) |
| `comment:add` | `{ id?, taskId, text }` | aggiunge una nota (max 2000 caratteri) |
| `comment:delete` | `{ id }` | elimina una nota, solo se è propria |
| `attachment:delete` | `{ id }` | elimina un allegato e il suo file |
| `seen:set` | `{ taskId, at }` | segna lette le note fino a `at` |

### HTTP

| Richiesta | Uso |
|---|---|
| `GET /` e file in `public/` | la pagina |
| `POST /upload` | form multipart: `file` (obbligatorio), `tempId` (appunti), `taskId` (allegato di un task) o `bugId` (allegato di un bug). Risposta `{ ok, file }` o `{ ok, attachment }`; errori 400/403 (bug già confermato)/404 |
| `GET /files/:id` | scarica o mostra un file |

Dettagli di `GET /files/:id`:
- immagini, video, audio, PDF e testo semplice si aprono nel browser (`inline`), tutto il resto si scarica; con `?dl=1` si scarica sempre;
- header sempre presenti: `X-Content-Type-Options: nosniff` e CSP `sandbox` (tranne i PDF), così un file caricato non può eseguire codice.
