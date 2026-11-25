# Ambiente di produzione

Come gira davvero MexMe e come si aggiorna. Gli indirizzi, i percorsi e gli IP veri **non** sono in questa repo: li ha il responsabile del progetto, nel `.env` e in `deploy/mexme.conf` sul server.

> Chi sviluppa una funzione **non tocca il server**: consegna il lavoro sul repository locale del team (vedi [GUIDA.md](GUIDA.md) §8). Questa pagina serve a capire l'ambiente e a chi pubblica.

---

## 1. Lo schema

```
 PC / telefono del team                    Server Linux (rete interna)
 ──────────────────────                    ─────────────────────────────────────────────────
   browser ── HTTPS + WebSocket ──▶  nginx  (porta pubblica, certificato TLS)
                                       │  - "allow" solo gli IP del team, gli altri 403
                                       │  - aggiunge X-Real-IP = IP vero del browser
                                       │  - upload senza limite, timeout lunghi
                                       ▼
                                     app Node.js  (solo 127.0.0.1, porta del .env)
                                       │  - gestita da pm2 (processo "MexMe")
                                       │  - KNOWN_IPS: IP → profilo; IP sconosciuto → 403
                                       ▼
                                     data/  (file JSON + file caricati + backup)
```

L'IP vero del browser è un controllo **doppio**:
- nginx (`allow`) blocca chiunque non sia del team prima ancora di arrivare all'app;
- l'app (`KNOWN_IPS`) lo blocca di nuovo e decide il profilo.

Le due liste devono contenere gli stessi IP.

## 2. I pezzi

### L'app (Node.js + pm2)
- Il codice TypeScript viene compilato in `dist/` (`npm run build`); pm2 avvia `dist/server.js` (vedi `ecosystem.config.cjs`) e lo riavvia se si blocca.
  - Log: `logs/out.log`, `logs/error.log`, oppure `pm2 logs MexMe`.
- Ascolta su `HOST=127.0.0.1`: non è raggiungibile direttamente dalla rete, solo tramite nginx.
  - È importante: l'app si fida dell'header `X-Real-IP` solo dalle connessioni da `127.0.0.1`.
- **Un solo processo** (`instances: 1`): i dati sono in memoria e un secondo processo li sovrascriverebbe.

### nginx
Configurazione in `deploy/mexme.conf` sul server (modello in [`deploy/mexme.conf.example`](../deploy/mexme.conf.example)):

| Direttiva | Perché |
|---|---|
| `listen … ssl` + certificati | HTTPS (serve anche al browser per la copia negli appunti) |
| `allow …; deny all;` | solo gli IP del team |
| `proxy_set_header X-Real-IP $remote_addr` | l'app riconosce la persona da qui |
| `Upgrade` / `Connection "upgrade"` | WebSocket per Socket.IO |
| `client_max_body_size 0` | upload di qualunque dimensione (il default di nginx è 1 MB) |
| `proxy_request_buffering off` | gli upload arrivano subito all'app: l'avanzamento è reale |
| `proxy_read_timeout` / `proxy_send_timeout 1h` | upload lunghi e connessioni aperte a lungo |

Applicare una modifica: `./deploy/update-nginx.sh` (copia il file, controlla con `nginx -t` e ricarica nginx).

### Il file `.env` (sul server)

| Variabile | In produzione |
|---|---|
| `HOST` | `127.0.0.1` |
| `PORT` | la porta verso cui inoltra nginx |
| `KNOWN_IPS` | `{"IP":"Nome", …}`: tutti gli IP del team (gli stessi di `allow` in nginx), col nome del profilo |
| `DATA_DIR` | facoltativa; default `./data` nella cartella dell'app |
| `REDIS_URL` | solo per la migrazione dalla vecchia versione; dopo si può togliere |

**Rinominare** un nome in `KNOWN_IPS` lega quell'IP a un altro profilo (o ne crea uno nuovo). Per cambiare il nome mostrato di una persona senza perdere i suoi task si modifica `name` in `data/users.json` (a server fermo) **e** lo stesso nome in `KNOWN_IPS`.

## 3. I dati

Tutto in `data/` (fuori da git):

| File | Contenuto |
|---|---|
| `users.json`, `tasks.json`, `comments.json`, `attachments.json`, `seen.json` | il diario (campi in [DATI.md](DATI.md)) |
| `clipboard.json` | testo e lista dei file degli Appunti |
| `uploads/` | i file caricati (nome = id, senza estensione) |
| `backups/AAAA-MM-GG/` | copia dei JSON fatta una volta al giorno; si tengono gli ultimi 14 giorni |

- I JSON si scrivono in modo **atomico** (prima un file `.tmp`, poi rinominato): un crash non li lascia a metà.
- Allo spegnimento (`pm2 stop/restart`) il server salva quello che è ancora in attesa.
- I backup **non** comprendono `uploads/` (i file possono essere grandi). Se serve, salvare `data/uploads/` a parte.

**Ripristinare un backup**
1. `pm2 stop MexMe`
2. Copia i file `.json` da `data/backups/<giorno>/` in `data/`.
3. `pm2 start MexMe`

**Mai modificare i JSON a server acceso**: il server ha i dati in memoria e li riscriverebbe sopra.

## 4. Aggiornare l'app (lo fa il responsabile)

```bash
cd <cartella dell'app sul server>
git pull
npm install
npm test            # facoltativo: usa una porta e una cartella temporanee, non tocca i dati veri
npm run build
pm2 restart MexMe
pm2 logs MexMe      # controlla "Server avviato" e che non ci siano errori
```

- Se è cambiato `deploy/mexme.conf.example`, riporta le modifiche in `deploy/mexme.conf` e lancia `./deploy/update-nginx.sh`.
- Se `npm run build` fallisce, l'app vecchia continua a girare finché non la riavvii: sistema prima l'errore.

## 5. Storia: la migrazione da Redis

Fino a novembre 2026 la clipboard salvava testo e lista dei file su Redis, e i file in `dist/public/uploads/`.
Al primo avvio della versione nuova il server ha importato tutto da solo (`src/migrate.ts`), perché `data/clipboard.json` non esisteva ancora e `REDIS_URL` era impostata.

- Si può rifare a mano a server fermo: `npm run migrate:redis` (con `-- --force` per sovrascrivere, `-- --from <cartella>` per prendere i file da un'altra cartella).
- Redis non serve più all'app: si può togliere `REDIS_URL` dal `.env`.

## 6. Problemi in produzione

| Sintomo | Dove guardare |
|---|---|
| 403 per una persona del team | Il suo IP è cambiato? Va aggiornato sia in `allow` (nginx) sia in `KNOWN_IPS` (`.env`), poi `update-nginx.sh` e `pm2 restart MexMe`. L'IP visto dall'app è nei log ("Accesso HTTP negato per IP non autorizzato: …") |
| 413 caricando un file | Manca `client_max_body_size 0` nella configurazione nginx attiva |
| 502 Bad Gateway | L'app è ferma o in crash: `pm2 status`, `pm2 logs MexMe` |
| "File dati illeggibile" nei log, l'app non parte | Un JSON in `data/` è rovinato: ripristinalo da `data/backups/` (vedi §3) |
| Tutti entrano come la stessa persona, o nessuno ha un profilo | L'app non ascolta su `127.0.0.1`, oppure nginx non manda `X-Real-IP`: controlla `HOST` nel `.env` e la configurazione nginx |
