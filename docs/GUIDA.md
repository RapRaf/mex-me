# Guida per chi inizia

Questa guida accompagna passo passo chi non ha mai lavorato al progetto (o a progetti simili): installare, avviare, capire dove mettere le mani, aggiungere una funzione, verificarla e consegnarla.
Il contesto completo è in [CLAUDE.md](../CLAUDE.md): leggilo almeno una volta.

---

## 1. Cosa ti serve

| Cosa | Come verificarlo | Dove trovarlo |
|---|---|---|
| **Node.js 22 o superiore** (meglio 24) | `node --version` | https://nodejs.org (versione "LTS") |
| **git** | `git --version` | https://git-scm.com |
| Un editor | — | consigliato **VS Code** |
| Un browser moderno | — | Chrome, Edge o Firefox |

Su Windows usa il terminale integrato di VS Code o "Git Bash": i comandi di questa guida funzionano uguali.

## 2. Primo avvio

```bash
git clone <indirizzo del repository locale del team>   # te lo dà il responsabile
cd <cartella del progetto>
npm install                 # scarica le librerie (solo la prima volta o se cambia package.json)
cp .env.example .env        # crea la tua configurazione locale (su Windows: copy .env.example .env)
npm run dev                 # avvia il server
```

Apri **http://127.0.0.1:3003**: entri come profilo **"Sviluppo"** e vedi Home, Priorità, Visualizzazione e Appunti.
I dati che crei finiscono in `data/` sul tuo computer: sono solo tuoi, non quelli veri del team.

Per ricominciare da zero basta fermare il server (`Ctrl+C`), cancellare la cartella `data/` e riavviarlo.

### Cosa succede quando modifichi un file

- File in **`src/`** (server): `npm run dev` se ne accorge e riavvia il server da solo. Ricarica la pagina.
- File in **`public/`** (pagina): non c'è niente da compilare, basta **ricaricare la pagina** (`Ctrl+Shift+R` per essere sicuri di non vedere la versione vecchia).

### Strumenti utili nel browser

Premi **F12** per aprire gli strumenti per sviluppatori.
- **Console:** errori JavaScript in rosso (se qualcosa non funziona, guarda qui per prima cosa).
- **Network → WS:** i messaggi Socket.IO che passano tra pagina e server.

## 3. Provare con più persone

Ogni IP è una persona. In locale sei sempre "Sviluppo", ma puoi simulare altre persone in due modi.

**A. Da un altro dispositivo (telefono, altro PC sulla stessa rete)**
1. Nel `.env` metti `HOST=0.0.0.0`, così l'app è raggiungibile dalla rete.
2. Aggiungi l'IP del dispositivo in `KNOWN_IPS`, per esempio `{"127.0.0.1":"Sviluppo","::1":"Sviluppo","192.168.1.50":"Prova"}`.
3. Riavvia (`Ctrl+C`, poi `npm run dev`).
4. Dal dispositivo apri `http://<IP del tuo PC>:3003`.

L'IP che il server vede è scritto nel terminale a ogni connessione ("Client connesso … IP: …"); chi non è in `KNOWN_IPS` riceve 403.

**B. Dallo stesso PC, con un'estensione del browser**
Il server, come fa con nginx in produzione, si fida dell'header `X-Real-IP` quando la richiesta arriva da `127.0.0.1`.
1. Installa un'estensione che aggiunge header alle richieste (es. "ModHeader").
2. Imposta `X-Real-IP: 10.0.0.2`.
3. In `KNOWN_IPS` aggiungi `"10.0.0.2":"Prova"`.

Usa un profilo del browser diverso, così l'altra finestra resta "Sviluppo".

## 4. Dove mettere le mani

| Voglio cambiare… | File |
|---|---|
| Testi, struttura di una vista o di un dialog | `public/index.html` (+ il modulo JS della vista, se il pezzo è generato da codice) |
| Colori, spaziature, aspetto | `public/css/app.css` (usa le variabili in cima al file) |
| La Home (tabella task) | `public/js/home.js` |
| Il dettaglio di un task | `public/js/dialog.js` |
| Priorità / label | `public/js/prio.js` |
| Calendario e agenda | `public/js/admin.js` |
| Appunti | `public/js/clipboard.js` |
| Note del team | `public/js/chat.js` |
| Allegati | `public/js/attach.js` |
| Cosa viene salvato e come si valida | `src/data.ts` (forma dei dati) e `src/diario.ts` (regole) |
| Un nuovo messaggio tra pagina e server | `src/realtime.ts` (server) + `public/js/net.js` (pagina) |
| Upload e download dei file | `src/files.ts` |

Mappa completa dei moduli e dei messaggi: [ARCHITETTURA.md](ARCHITETTURA.md). Campi dei dati: [DATI.md](DATI.md).

## 5. Esempi pratici

### Esempio 1: aggiungere una label nella vista Priorità (facile)

In `public/js/prio.js` c'è:

```js
export const LABELS = [['bug', 'Bug', '#c2410c'], ['migliorie', 'Migliorie', '#7b4fd6'], ['adv', 'ADV', '#f08c00']];
```

Aggiungi una riga `['grafica', 'Grafica', '#1f8a3b']`. Il formato è `[id, nome mostrato, colore]`; l'id va in minuscolo, senza spazi né accenti.
Il server accetta già qualunque id di questo tipo. **Non cambiare mai l'id delle label esistenti**: è quello salvato nei task.

### Esempio 2: aggiungere un campo ai task, es. "stima in ore" (medio)

Il dato passa da quattro punti: forma, validazione, interfaccia, test.

1. **Forma del dato:** in `src/data.ts`, nell'interfaccia `Task`, aggiungi
   ```ts
   estimate?: number | null;   // stima in ore
   ```
2. **Validazione sul server:** in `src/diario.ts`, nell'oggetto `FIELDS`, aggiungi
   ```ts
   estimate: v => { if (v !== null && !(typeof v === 'number' && v >= 0 && v <= 1000)) throw bad('estimate'); return v; },
   ```
   Senza questa riga il server rifiuta il campo ("campo non modificabile").
3. **Interfaccia:**
   - In `public/index.html`, dentro `<div class="meta3">` del dialog, aggiungi un campo:
     ```html
     <label class="f">Stima (ore)<input class="fi" type="number" min="0" step="0.5" id="dE"></label>
     ```
   - In `public/js/dialog.js`, dentro `renderDlg()`, mostra il valore senza disturbare chi scrive:
     ```js
     setVal($('#dE'), t.estimate ?? '');
     ```
     Aggiungi poi `#dE` alla lista dei campi che si disabilitano in sola lettura (`'#dT,#dS,#dA,#dZ,#dN,#sT'`).
   - Sempre in `dialog.js`, insieme agli altri eventi, salva quando cambia:
     ```js
     $('#dE').addEventListener('change', e => app.curId && patch(app.curId, { estimate: e.target.value === '' ? null : Number(e.target.value) }));
     ```
   - `patch()` (in `net.js`) aggiorna subito la pagina, manda la modifica al server e la fa arrivare a tutti gli altri.
4. **Documentazione e test:**
   - Aggiungi il campo in [DATI.md](DATI.md).
   - In `test/run.cjs` aggiungi un controllo, sul modello di quelli che ci sono (es. una `task:patch` con `estimate: 3` che deve riuscire e una con `estimate: -1` che deve fallire).

I task vecchi non hanno il campo: il codice deve funzionare anche quando manca (`t.estimate ?? ''`). Non servono migrazioni.

### Esempio 3: un nuovo comando dal browser al server (medio)

Sul server, in `src/realtime.ts`, dentro `onConnection`:

```ts
command(s, 'task:duplicate', (by, p) => {
    const t = /* … crea il nuovo task con le funzioni di diario.ts … */;
    upsert('tasks', [t]);          // lo manda a tutti
    return { task: t };            // risposta al mittente
});
```

- `command` controlla da solo che chi scrive abbia un profilo.
- Se qualcosa non va, lancia `new UserError('not_found', '…')` e il browser riceve `{ok: false, error: 'not_found'}`.
- Le regole vere (validazione, cosa creare) mettile in `src/diario.ts`, non in `realtime.ts`.

Nel browser, in `public/js/net.js`:

```js
export async function duplicate(id) {
  const r = await ask('task:duplicate', { id });
  if (!r.ok) writeErr(r);     // mostra l'avviso e riallinea i dati
}
```

Il risultato arriva a tutte le pagine con `diario:upsert`, che aggiorna i dati e ridisegna: non devi aggiornare tu la vista.

### Esempio 4: una nuova vista nel menu (più lavoro)

1. In `public/index.html`:
   - aggiungi `<main class="wrap" id="miavista" hidden>…</main>`;
   - nel `<nav id="nav">` aggiungi `<a href="#miavista" id="nMia">Mia vista</a>`.
2. Crea `public/js/miavista.js` con una funzione `renderMiaVista()`. Deve uscire subito se la vista è nascosta: `if ($('#miavista').hidden) return;`.
3. In `public/js/main.js`:
   - importala e chiamala dentro `setRenderer(…)`;
   - aggiungi `miavista: 'Titolo'` a `VIEWS`;
   - riconosci l'indirizzo in `route()` (dove si calcola `view`);
   - aggiungi `['#nMia', view === 'miavista']` alla lista dei link del menu.
4. Su telefono controlla che il menu stia ancora bene (vedi la checklist).

## 6. Regole d'oro

1. **Testo degli utenti → sempre `esc()`** prima di metterlo in HTML. È la regola di sicurezza più importante del progetto.
2. **Il server valida tutto.** Se aggiungi un dato che il browser può modificare, aggiungi la sua validazione in `src/diario.ts`.
3. **Niente dati sensibili nei commit:** IP, password, nomi, indirizzi del server. Se ti servono in locale vanno nel `.env`.
4. **Non togliere il focus a chi scrive:** per aggiornare un campo usa `setVal()`, e non ricostruire l'HTML di un form mentre qualcuno ci scrive.
5. **Tutto in italiano**, etichette con la sola iniziale maiuscola, icone SVG (non emoji).
6. **Prova sempre anche su telefono** (strumenti del browser → icona del telefono, larghezza 390px) e in tema scuro.

## 7. Prima di consegnare: checklist

**Automatico**
- [ ] `npm test` → `0 falliti` (controlla anche che il TypeScript compili)

**A mano** (solo le parti toccate, ma meglio un giro veloce di tutto)
- [ ] Appunti:
  - [ ] il testo scritto in una finestra compare nell'altra;
  - [ ] l'upload mostra la percentuale;
  - [ ] Scarica ed elimina funzionano;
  - [ ] trascinando un file sulla pagina parte l'upload;
  - [ ] `Ctrl+V` di uno screenshot lo carica.
- [ ] Home:
  - [ ] si crea un task dal campo in alto;
  - [ ] si crea un sottotask scegliendo il padre dal menu;
  - [ ] si cambia stato dalla riga;
  - [ ] i filtri e "Solo i miei" funzionano;
  - [ ] ▾/▸ comprime ed espande.
- [ ] Dialog del task:
  - [ ] titolo, stato, assegnato, date e note si salvano;
  - [ ] si aggiunge un sottotask (anche dentro un sottotask con ＋);
  - [ ] l'eliminazione chiede conferma.
- [ ] Allegati: caricamento di più file, graffetta con il numero, anteprima, eliminazione.
- [ ] Note:
  - [ ] Invio invia, Maiusc+Invio va a capo;
  - [ ] il badge magenta compare per le note nuove degli altri;
  - [ ] si eliminano solo le proprie.
- [ ] Priorità:
  - [ ] trascinamento tra colonne e dentro la colonna;
  - [ ] label e filtro label;
  - [ ] i completati stanno in fondo.
- [ ] Visualizzazione:
  - [ ] il calendario mostra solo aperture e chiusure;
  - [ ] l'agenda funziona;
  - [ ] cliccando una voce il dialog si apre in sola lettura.
- [ ] Console del browser (F12) senza errori rossi.
- [ ] Telefono (390px) e tema scuro: niente pezzi tagliati né scroll orizzontale della pagina.

## 8. Consegnare il lavoro

```bash
git checkout -b funzione/stima-ore        # un branch per ogni funzione (prima di iniziare)
# … lavori, provi, npm test …
git status                                 # controlla che non ci siano .env, data/ o file estranei
git add -A
git commit -m "Aggiunge la stima in ore ai task"
git push -u origin funzione/stima-ore     # sul repository locale del team, NON su GitHub
```

- Poi avvisa il responsabile: rivede, sistema se serve e pubblica in produzione.
- Aggiungi una riga in [CHANGELOG.md](CHANGELOG.md) sotto "Non ancora pubblicato" con cosa hai cambiato.
- **Non** fare push su GitHub e **non** toccare il server di produzione.

## 9. Problemi comuni

| Problema | Causa probabile e soluzione |
|---|---|
| `Forbidden: IP non autorizzato` | Il tuo IP non è in `KNOWN_IPS`. In locale controlla che ci siano `"127.0.0.1"` e `"::1"`. Se apri da un altro dispositivo, aggiungi il suo IP (lo trovi nel terminale) e riavvia |
| Vedo solo gli Appunti, senza menu | Sei entrato con un IP senza profilo (`KNOWN_IPS` vuota). Vedi la riga sopra |
| `EADDRINUSE` all'avvio | La porta 3003 è già usata (forse un altro `npm run dev` aperto). Chiudilo o cambia `PORT` nel `.env` |
| `File dati illeggibile: …json` | Un file in `data/` è rovinato (es. modificato a mano). In locale cancella `data/`; sul server si ripristina da `data/backups/` (vedi [AMBIENTE.md](AMBIENTE.md)) |
| La pagina non mostra le mie modifiche | Ricarica forzando: `Ctrl+Shift+R`. Se è codice in `src/`, guarda nel terminale che il server sia ripartito senza errori |
| "Connessione persa: riconnessione in corso…" | Il server si è fermato o riavviato (es. errore nel codice in `src/`): guarda il terminale |
| Una modifica torna indietro da sola con l'avviso "Dati non validi" | Il server ha rifiutato il campo: manca (o è sbagliata) la sua validazione in `FIELDS` di `src/diario.ts` |
| `npm test` fallisce su "Sintassi di public/js" | C'è un errore di scrittura in quel file: il messaggio dice riga e colonna |
| `npm install` avvisa "EBADENGINE" | La tua versione di Node è troppo vecchia: installa la 22 o superiore |
