# Changelog

Le modifiche, dalla più recente. Chi consegna una funzione aggiunge una riga sotto "Non ancora pubblicato"; chi pubblica in produzione sposta quelle righe sotto una nuova data.

## Non ancora pubblicato

- Nuova sezione **Bug** (`#bug`): chiunque segnala un bug con descrizione e allegati (anche screenshot incollati); chi lo conferma lo trasforma subito in un task "Da fare" assegnato a sé, con label Bug e gli allegati del bug. Si può anche scartare e riaprire. Contatore dei bug da revisionare nel menu.

- Chiusura automatica: quando tutti i sottotask sono "Fatto" anche il task padre diventa "Fatto" (e risale l'albero); se un sottotask si riapre il padre torna "In corso". La decide il server.
- Home: nuovi filtri (cerca, persona anche per i colleghi, priorità, label, "In ritardo", "Tutti"), ordinamento (aperti da più/meno tempo, scadenza, priorità, titolo…) e "Azzera filtri". "Solo i miei" diventa la persona "I miei".
- Home: più spazio a titolo e note (fino a 4 righe), date una per riga in una sola colonna, con da quanto è aperto il task.
- Documentazione per chi lavora al progetto (`CLAUDE.md`, `docs/`) e test automatici (`npm test`).
- Ambiente locale completo senza Redis: `npm run seed` (dati d'esempio) e `npm run persone` (più persone di prova sulla stessa macchina).

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
