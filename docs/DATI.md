# Dati

Tutto sta in file JSON nella cartella `data/` (vedi [AMBIENTE.md](AMBIENTE.md) per backup e ripristino).
Ogni file di collezione è un oggetto `{ "id": documento, … }`; ogni documento ha anche il campo `id`.
I tipi TypeScript sono in `src/data.ts`, le regole e le validazioni in `src/diario.ts` (task, note, allegati) e `src/bugs.ts` (bug).

Tutti gli id di persona (`assigneeId`, `createdBy`, `updatedBy`, `authorId`, `uploadedBy`, `reportedBy`, `reviewedBy`) sono **id di `users`**.

---

## `users.json`: profili

| Campo | Tipo | Note |
|---|---|---|
| `id` | string | Ricavato dal nome (minuscolo, senza accenti né spazi) |
| `name` | string | Nome mostrato; coincide con il nome in `KNOWN_IPS` |
| `c` | number | Indice del colore persona in `COLORS` (`public/js/util.js`): 0 blu, 1 magenta, 2 verde acqua, 3 arancio, 4 viola, 5 ruggine, 6 verde, 7 grigio-blu |
| `order` | number | Ordine nelle liste |
| `active` | boolean | `false` = nascosto |
| `createdAt` | ISO string | |
| `auto` | boolean? | `true` se creato automaticamente da `KNOWN_IPS`; quelli così, se spariscono da `KNOWN_IPS` e non sono mai stati usati, vengono rimossi |

Si creano dai nomi di `KNOWN_IPS` (vedi [CLAUDE.md](../CLAUDE.md) §5). Colore e nome si possono cambiare a mano qui, **a server fermo**.

## `tasks.json`: task e sottotask (una sola tabella)

| Campo | Tipo | Modificabile | Note |
|---|---|---|---|
| `title` | string | sì | 1–200 caratteri |
| `notes` | string | sì | ≤ 5000 caratteri |
| `status` | `todo` \| `doing` \| `done` | sì | Da fare / In corso / Fatto |
| `parentId` | string \| null | no | `null` = task principale. Un `parentId` che punta a un task inesistente fa trattare il task come principale |
| `rootId` | string | no | Task principale del ramo (per un principale = il suo id) |
| `depth` | number | no | 0 principale, 1 sottotask, 2 sotto-sottotask… |
| `startDate` | `YYYY-MM-DD` \| null | sì | Inizio lavorazione (data locale) |
| `endDate` | `YYYY-MM-DD` \| null | sì | Fine / scadenza |
| `completedAt` | ISO \| null | sì | Messo quando lo stato diventa "Fatto", tolto se torna aperto |
| `assigneeId` | string \| null | sì | Deve essere un profilo esistente |
| `priority` | `high` \| `med` \| `low` | sì | Colonna nella vista Priorità; assente = `med` |
| `label` | string \| null | sì | Id di una label di `LABELS` (`prio.js`); minuscolo, max 30 caratteri |
| `prioOrder` | number | sì | Ordine nella colonna di priorità (crescente); assente = `order`. Spostando un box diventa la media tra i vicini |
| `order` | number | no | Ordine tra fratelli (istante di creazione in ms) |
| `createdBy`, `updatedBy` | string | no | Messi dal server |
| `createdAt`, `updatedAt` | ISO | no | Messi dal server |
| `bugId` | string | no | Solo per i task nati dalla conferma di un bug: id del bug in `bugs.json` |

"Modificabile" = accettato da `task:patch`: è l'elenco `FIELDS` in `src/diario.ts`. Un campo nuovo va aggiunto lì, con la sua validazione.

**Regole**
- Stato:
  - → "In corso" con inizio vuoto ⇒ inizio = oggi;
  - → "Fatto" ⇒ fine e inizio = oggi se vuoti, `completedAt` = adesso.
  - Lo calcola il browser (`setStatus` in `net.js`); il server controlla solo che ogni campo sia valido.
- Chiusura automatica del padre (la fa il **server**, `cascadeParents` in `src/diario.ts`, dopo un `task:patch` che cambia lo stato):
  - tutti i sottotask di un task "Fatto" ⇒ il task diventa "Fatto", con le stesse regole qui sopra; risale l'albero (il nonno può chiudersi a sua volta);
  - un sottotask riaperto sotto un task "Fatto" ⇒ il task torna "In corso" e perde `completedAt`;
  - il browser fa la stessa cosa in anticipo (`cascadeLocal` in `net.js`) solo per mostrarla subito: non manda nulla in più.
  - Chiudere a mano un padre con sottotask aperti resta possibile (il dialog avvisa).
- Eliminare un task elimina **tutti i discendenti**, le loro note, i loro allegati (con i file) e le relative note lette.
- Un task nuovo è assegnato a chi lo crea.
- I campi assenti nei task vecchi vanno gestiti nel codice (`?? valore predefinito`): non si fanno migrazioni.

## `comments.json`: note del team

Una nota = un documento.

| Campo | Tipo | Note |
|---|---|---|
| `taskId` | string | Task o sottotask della conversazione |
| `rootId` | string | Task principale del ramo |
| `text` | string | 1–2000 caratteri, testo semplice (mostrato con `esc()` e `white-space: pre-wrap`) |
| `authorId` | string | Profilo di chi l'ha scritta (dall'IP) |
| `createdAt` | ISO | Ordine della chat |

Si elimina solo la propria nota: lo controlla il server.

## `seen.json`: note lette

`{ profilo: { taskId: createdAt dell'ultima nota vista } }`. Le note di altri più recenti di quel valore sono "nuove" (badge magenta). Vale per profilo, quindi su tutti i dispositivi della persona.

## `attachments.json`: allegati dei task

| Campo | Tipo | Note |
|---|---|---|
| `id` | string | Uguale al nome del file in `data/uploads/` |
| `taskId`, `rootId` | string | Task a cui è allegato e suo principale; `''` se è l'allegato di un bug non ancora confermato |
| `bugId` | string? | Bug su cui è stato caricato. Alla conferma del bug `taskId`/`rootId` diventano quelli del nuovo task (il `bugId` resta) |
| `name` | string | Nome originale (max 200) |
| `contentType` | string | Tipo ricavato dall'estensione |
| `sizeBytes` | number | |
| `uploadedBy` | string | Profilo (dall'IP) |
| `createdAt` | ISO | |

## `bugs.json`: bug segnalati

| Campo | Tipo | Note |
|---|---|---|
| `id` | string | |
| `title` | string | Obbligatorio, max 200 |
| `text` | string | Descrizione, max 5000 |
| `status` | `open` \| `confirmed` \| `rejected` | Da revisionare, confermato (è diventato un task), scartato |
| `reportedBy` | string | Chi l'ha segnalato (dall'IP) |
| `reviewedBy`, `reviewedAt` | string \| null, ISO \| null | Chi l'ha confermato o scartato, e quando |
| `taskId` | string \| null | Task creato alla conferma |
| `createdAt`, `updatedAt` | ISO | |

**Regole** (`src/bugs.ts`)
- Chiunque segnala un bug; titolo e descrizione li modifica solo chi l'ha segnalato, finché non è confermato.
- **Conferma** (chiunque, anche chi l'ha segnalato): crea un task principale "Da fare" con titolo = titolo del bug, note = descrizione, label `bug`, `bugId`, **assegnato a chi conferma** (che ne è anche il creatore). Gli allegati del bug passano al task. Un bug già confermato non si conferma di nuovo: con due conferme contemporanee vince la prima.
- **Scarta**: il bug va tra gli scartati; si può riaprire ("da revisionare" di nuovo).
- **Elimina**: solo chi l'ha segnalato e solo se non è confermato; spariscono anche i suoi allegati con i file.
- Gli allegati si caricano su un bug non confermato; dopo la conferma si allegano al task.

## `clipboard.json`: Appunti

```json
{ "text": "…testo della lavagna…", "files": [ ClipFile, … ] }
```

| Campo di `ClipFile` | Note |
|---|---|
| `id` | Nome del file in `data/uploads/` |
| `name`, `size`, `contentType` | Come gli allegati |
| `uploadedBy` | Profilo, o `null` se chi carica non ha profilo |
| `uploaderName` | Nome mostrato (profilo o nome dell'IP) |
| `createdAt` | ISO |
