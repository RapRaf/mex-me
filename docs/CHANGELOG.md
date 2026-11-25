# Changelog

Le modifiche, dalla più recente. Chi consegna una funzione aggiunge una riga sotto "Non ancora pubblicato"; chi pubblica in produzione sposta quelle righe sotto una nuova data.

## Non ancora pubblicato

- Documentazione per chi lavora al progetto (`CLAUDE.md`, `docs/`) e test automatici (`npm test`).

## 25/11/2026: profilo dall'IP, Visualizzazione

- Il profilo lo decide il server dall'IP (`KNOWN_IPS`): niente più "Chi sei?" né "Esci". I profili nascono dai nomi di `KNOWN_IPS`.
- "Admin" diventa "Visualizzazione" (`#visualizzazione`); i vecchi indirizzi `#admin` funzionano ancora.
- La configurazione nginx reale esce dalla repo (resta `deploy/mexme.conf.example`).
- nginx: upload senza limite di dimensione e timeout lunghi.

## 25/11/2026: diario del team integrato

- La clipboard e il "Diario del team" (prototipo dei grafici) diventano un'unica app con lo stile "Lab poster":
  - Appunti;
  - Home con task e sottotask, note del team, allegati;
  - Priorità (kanban con label);
  - calendario e agenda in sola lettura.
- I dati passano da Redis a file JSON in `data/`, con scrittura atomica e backup giornalieri; testo e file della vecchia clipboard vengono importati da soli al primo avvio.
- Server riorganizzato in `src/`; il server valida ogni scrittura.
- Sicurezza:
  - i file caricati non possono eseguire codice sul sito;
  - i nomi dei file vengono "escapati" nell'HTML;
  - i nomi con accenti si salvano correttamente.
- Appunti:
  - upload di più file insieme, annullabili;
  - avanzamento visibile a tutti;
  - `Ctrl+V` di uno screenshot;
  - "Copia tutto".

## Prima di novembre 2026: clipboard "MexMe"

- Testo e file condivisi in tempo reale (Socket.IO + Redis), lista degli utenti connessi con i nomi da `KNOWN_IPS`.
- Accesso limitato agli IP di `KNOWN_IPS`.
- Dietro nginx con HTTPS.
