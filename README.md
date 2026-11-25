# MexMe

App web interna del team, in tempo reale:

- **Appunti:** una lavagna di testo e una zona file condivise, con l'avanzamento degli upload visto da tutti e la lista di chi è connesso.
- **Diario del team:**
  - **Home**: task e sottotask, stati, date, assegnatari, allegati, note del team (una chat per task);
  - **Priorità**: kanban con label e trascinamento;
  - **Visualizzazione**: calendario e agenda in sola lettura.

Non c'è login: ogni persona è riconosciuta dall'indirizzo IP (`KNOWN_IPS` nel `.env`), e chi non è nella lista resta fuori.

## Avvio rapido

Serve **Node.js 22 o superiore**.

```bash
npm install
cp .env.example .env     # va bene così in locale
npm run dev              # http://127.0.0.1:3003
npm test                 # verifiche automatiche
```

| Comando | Cosa fa |
|---|---|
| `npm run dev` | avvia in sviluppo e riavvia a ogni modifica del server |
| `npm test` | controlla TypeScript, la sintassi dei moduli del browser e le funzioni principali (su un server di prova) |
| `npm run build` / `npm start` | compila e avvia in produzione (lì lo avvia pm2) |
| `npm run migrate:redis` | import manuale della vecchia clipboard da Redis |

## Documentazione

| File | Per cosa |
|---|---|
| **[CLAUDE.md](CLAUDE.md)** | **Da leggere per primo:** contesto completo, struttura, regole, flusso di lavoro |
| [docs/GUIDA.md](docs/GUIDA.md) | Per chi inizia: installazione, come aggiungere funzioni (con esempi), checklist, problemi comuni |
| [docs/AMBIENTE.md](docs/AMBIENTE.md) | Come gira in produzione: nginx, pm2, `.env`, dati, backup, aggiornamenti |
| [docs/ARCHITETTURA.md](docs/ARCHITETTURA.md) | Come funziona dentro: flussi, moduli, elenco dei messaggi Socket.IO e HTTP |
| [docs/DATI.md](docs/DATI.md) | I file JSON e tutti i campi |
| [docs/INTERFACCIA.md](docs/INTERFACCIA.md) | Viste, interazioni, decisioni di design, palette |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Storia delle modifiche |

## Regole in breve

- Si lavora su un branch e si consegna sul **repository locale del team**, non su GitHub (vedi [CLAUDE.md](CLAUDE.md) §9).
- **Mai dati sensibili nella repo:** IP, password, nomi, indirizzi del server stanno solo in `.env` e `deploy/mexme.conf`, esclusi da git.
- Tutto in italiano.
