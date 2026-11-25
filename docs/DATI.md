# Dati

Tutto sta in file JSON nella cartella `data/` (vedi [AMBIENTE.md](AMBIENTE.md) per backup e ripristino).
Ogni file di collezione è un oggetto `{ "id": documento, … }`; ogni documento ha anche il campo `id`.
I tipi TypeScript sono in `src/data.ts`, le regole e le validazioni in `src/diario.ts`.

Tutti gli id di persona (`assigneeId`, `createdBy`, `updatedBy`, `authorId`, `uploadedBy`) sono **id di `users`**.

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

"Modificabile" = accettato da `task:patch`: è l'elenco `FIELDS` in `src/diario.ts`. Un campo nuovo va aggiunto lì, con la sua validazione.

**Regole**
- Stato:
  - → "In corso" con inizio vuoto ⇒ inizio = oggi;
  - → "Fatto" ⇒ fine e inizio = oggi se vuoti, `completedAt` = adesso.
  - Lo calcola il browser (`setStatus` in `net.js`); il server controlla solo che ogni campo sia valido.
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
| `taskId`, `rootId` | string | Task a cui è allegato e suo principale |
| `name` | string | Nome originale (max 200) |
| `contentType` | string | Tipo ricavato dall'estensione |
| `sizeBytes` | number | |
| `uploadedBy` | string | Profilo (dall'IP) |
| `createdAt` | ISO | |

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
