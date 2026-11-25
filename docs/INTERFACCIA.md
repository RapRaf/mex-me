# Interfaccia e decisioni di design

Come sono fatte le viste, come si usano e perché sono fatte così. Molte scelte sono richieste esplicite del team: prima di cambiarle, chiedi.

---

## Principi

- **Strumento di tutti i giorni:** aggiungere un task = scrivere e premere Invio. Incollare negli appunti = `Ctrl+V`.
- **Ogni persona ha un colore**, usato ovunque: avatar, calendario, note, connessi.
- **Stato sempre visibile e modificabile** senza aprire il dettaglio.
- **Il dettaglio si apre sopra** come una scheda (dialog), mai su una pagina separata.
- **Visualizzazione = sola lettura.**
- **Tempo reale ovunque:** quello che fa uno lo vedono subito tutti.

## Aspetto ("Lab poster")

| Elemento | Valore |
|---|---|
| Banda in alto | blu oxford `#0b1f4b`, testo bianco |
| Pannelli | bianchi (tema chiaro) / blu notte (tema scuro), bordo sottile, angoli arrotondati 14–18px |
| Magenta `#e0115f` (`--acc`) | oggi, ritardi, azioni distruttive, badge "nuove", bottone principale nella banda |
| Blu `#2b6cf6` (`--doing`) | in corso |
| Grigio (`--todo`) | da fare |
| Verde acqua `#0f9d8a` (`--done`) | fatto |
| Verde `--online` | connessi |
| Font | **Red Hat Display** (titoli) + **Red Hat Text** (testo), da Google Fonts |
| Colori persona | `COLORS` in `util.js`, indice `users.c` |

- **Tema chiaro/scuro:** segue il sistema, grazie a `light-dark()` nelle variabili CSS in cima a `app.css`. Usa sempre le variabili (`--ink`, `--mute`, `--panel`, `--line`, `--field`…), mai colori fissi, così il tema scuro funziona da solo.
- **Icone:** SVG in linea (`CLIP` graffetta, `UPI` carica, `CHAT` fumetto, `COPY`), mai emoji.
- **Testi:** in italiano, etichette con la sola iniziale maiuscola ("Aggiungi task", non "Aggiungi Task").

## Struttura della pagina

- **Banda:**
  - "MexMe", titolo della vista, menu (Home · Priorità · Visualizzazione · Appunti), chip con avatar e nome della persona;
  - in Home e Priorità c'è anche il campo per il nuovo task.
- **Sotto la banda:** la vista attiva.
- **Avvisi** (errori, connessione persa): striscia rosa sotto la banda (`#note`).
- **"Salvato ✓" / "Salvataggio…":** in alto a destra nella barra della vista.

Chi arriva da un IP senza profilo (possibile solo con `KNOWN_IPS` vuota) vede solo gli Appunti, con un avviso.

## Appunti (`#appunti`)

- **Connessi:** pallino verde + "Connessi · N", una chip per persona con il suo colore.
  - La propria è evidenziata con "(tu)".
  - Più schede della stessa persona = "×2".
- **Lavagna** (a sinistra, più larga):
  - textarea condivisa in tempo reale;
  - il cursore di chi scrive non salta quando arrivano modifiche degli altri;
  - bottone "Copia tutto".
- **File** (a destra):
  - griglia di schede con anteprima (immagini, video), nome, dimensione, chi, quando, "Scarica" e × (elimina con conferma in due tempi);
  - più recenti in alto;
  - si carica con "Carica" (anche più file), trascinando sulla pagina, o con `Ctrl+V` di un'immagine (es. screenshot).
- **Upload in corso:** scheda tratteggiata con percentuale, barra, byte caricati, velocità e chi carica, visibile a **tutti**. Chi carica ha "Annulla".
- **Sotto i 900px** lavagna e file vanno uno sotto l'altro.

## Home (`#home`)

- **Campo nuovo task** nella banda + menu dei task aperti:
  - con "＋ Nuovo task" si crea un task principale;
  - con un task scelto si crea un sottotask (la scelta resta, per inserirne diversi di fila);
  - scorciatoia `n`.
- **Filtri:** Aperti (predefinito) / In corso / Da fare / Fatti, con i conteggi; "Solo i miei" (task assegnati a me o con un mio sottotask) viene ricordato.
- **Tabella:**
  - un blocco staccato e arrotondato per ogni task principale, a colori alternati;
  - sotto, i sottotask rientrati con ↳;
  - nelle viste aperte i sottotask fatti sono riassunti in "✓ N sottotask fatti nascosti".
- **Colonne:**
  - Task, con prima riga delle note, graffetta se ci sono allegati e ▾/▸ per comprimere;
  - Note: fumetto con il numero; magenta se ci sono note nuove di altri;
  - Stato: menu modificabile dalla riga;
  - Assegnato;
  - Sottotask: barra fatti/totale;
  - Inizio, Fine ("in ritardo" in magenta);
  - Aggiornato.
- **Click su una riga** → dialog del task principale; se la riga è un sottotask, il dialog scorre fino a lui e lo evidenzia.
- **Larghezze:**
  - sotto 1100px sparisce "Aggiornato" e la tabella scorre dentro il riquadro (mai la pagina);
  - sotto 600px ogni riga diventa una scheda.

## Dialog del task

- **Intestazione:**
  - bordo del colore dello stato;
  - titolo modificabile, che va a capo;
  - ×.
- **Campi:**
  - Stato, Assegnato a, Inizio, Fine (bordo magenta se la fine è prima dell'inizio);
  - Note, con salvataggio automatico poco dopo che smetti di scrivere.
- **Bottoni:** "N allegati" (se ce ne sono), "Carica file", "Note del team · N" (con "N nuove").
- **Albero dei sottotask**, una scheda su due righe per ogni sottotask:
  1. ▾/▸, titolo completo, stato;
  2. avatar e assegnatario, date inizio → fine, fumetto note, graffetta, carica file, ＋ (sottotask qui dentro), × (elimina, conta i discendenti).
- **In fondo:**
  - "Nuovo sottotask…" (dopo ＋ compare "Dentro: X · annulla");
  - "Creato il … da …";
  - "Elimina task".
- **Conferme:** le eliminazioni usano una conferma in due tempi. Il primo click trasforma il bottone in "Conferma…" (magenta) per 3 secondi.
- **Chiusura:** Esc o click fuori. Su telefono il dialog occupa tutto lo schermo.

## Allegati (dialog separato, sopra il dialog del task)

- Griglia di schede: anteprima, nome, dimensione, chi, quando, "Apri", "Scarica", ×.
- Zona per trascinare i file + "Carica file". L'avanzamento compare accanto a "Salvato".
- Qualsiasi tipo e dimensione di file.

## Note del team (dialog chat, sopra tutto)

- Note raggruppate per giorno ("Oggi", "sabato 21 novembre").
- Le proprie a destra, col proprio colore; quelle degli altri a sinistra, con avatar, nome e ora.
- × solo sulle proprie.
- Campo in fondo: Invio invia, Maiusc+Invio va a capo.
- Aprire la chat segna le note come lette; vale per il profilo, quindi su tutti i suoi dispositivi.
- Dalla Visualizzazione la chat è in sola lettura.

## Priorità (`#priorita`)

- **Kanban dei soli task principali**, in tre colonne:
  - Priorità massima (bordo magenta);
  - Priorità media (arancio), dove sta un task senza priorità;
  - Priorità bassa (grigio).
- **Box:**
  - titolo, graffetta e note;
  - menu **label** (Nessuna / Bug / Migliorie / ADV) e menu stato;
  - assegnatario, fine o "Completato il …", barra dei sottotask;
  - bordo sinistro del colore della label.
- **Ordine:** in alto gli aperti nell'ordine scelto a mano; sotto "Completati", dal primo all'ultimo completato.
- **Trascinamento** tra colonne e dentro la colonna, con una barra colorata che mostra dove cadrà il box.
  - Su telefono e touch (≤ 860px) le colonne vanno una sotto l'altra e nel box compare il menu "Priorità" al posto del trascinamento.
- **Tastiera:** Invio apre; Alt+←/→ cambia priorità; Alt+↑/↓ sposta nella colonna.
- **Filtro label:** chip con i conteggi, ricordato.
- **Label:** si aggiungono in `LABELS` (`prio.js`).

## Visualizzazione (`#visualizzazione`, `#visualizzazione-agenda`)

Sola lettura. Click su qualunque voce → dialog del task in sola lettura.
- **Filtri:** persona (anche "Non assegnati"), stato (anche "In ritardo"), livello (tutti / solo principali), ricerca.
- **KPI:** aperti, in corso, da fare, in ritardo, fatti questo mese.

**Calendario**
- Settimane da lunedì.
- Nelle celle **solo eventi**:
  - ▸ apertura (data di inizio, o di creazione);
  - ✓ chiusura (data di completamento) di task e sottotask.
- **Mai i giorni "in corso"**: richiesta esplicita, per non ripetere lo stesso task su tutte le celle.
- Task principali: etichetta bordata; sottotask: etichetta piena; massimo 4 per cella + "+N altri".
- Click su un giorno: sotto compaiono "Aperti e chiusi" e "Sottotask in lavorazione" (quelli il cui periodo copre quel giorno).
- Su telefono le etichette diventano barrette colorate.

**Agenda**
- Solo i giorni del mese che hanno task.
- Per ogni voce:
  - etichetta (Inizio, Scadenza, Completato, Giornata, "In corso · giorno k di n");
  - titolo, "in <task principale>", date, assegnatario, stato.
- Spunta "Solo inizi e fine".
- Il periodo di un task:
  - inizio = data di inizio, altrimenti la fine;
  - fine = data di fine, altrimenti il completamento (se fatto), oggi (se in corso), o l'inizio;
  - senza date non compare (lo dice una nota in alto).

## Telefono

Ogni vista va provata a 390px di larghezza.
- La pagina non deve mai scorrere in orizzontale (al massimo una tabella dentro il suo riquadro).
- I dialog vanno a schermo intero.
- Il menu in alto si stringe per stare su una riga.
