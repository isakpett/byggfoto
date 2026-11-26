# Byggfoto

Enkel nettside for å ta jobbilder på iPhone, merke dem med ferdige kommentarer, og sende dem til kontoret på e-post.

- Bildene lagres bare på telefonen til de sendes.
- Sending skjer via iPhone-delingsarket (Outlook eller Mail).
- Ingen server, ingen konto, ingen kostnad.

## Filer

| Fil | Innhold |
|---|---|
| `index.html` | Sidens oppbygging |
| `styles.css` | Utseende, lyst og mørkt |
| `js/core.js` | Felles hjelpere, lagring av bilder og appens tilstand |
| `js/dialogs.js` | Appens egne dialoger (i stedet for Safari-popuper) |
| `js/photos.js` | Legge til bilder, jobb- og bildekort |
| `js/send.js` | E-posttekst, stempel, størrelse og sending |
| `js/editor.js` | Tegning på bilder |
| `js/settings.js` | Ny jobb, kopiering og innstillingssidene |
| `js/camera.js` | Kameraet i appen |
| `js/main.js` | Knapper, topplinje, oppstart og oppdateringssjekk (lastes sist) |
| `sw.js` | Gjør at appen virker uten nett |
| `version.json` | Versjonen telefonen sjekker mot |

JS-filene deler ett felles skop og lastes i rekkefølgen i `index.html`.

## Tester

```
node tests/run.js
```

Kjør én test: `node tests/run.js "e-posttekst"`

## Ny versjon

Ved hver endring:
1. Øk `APP_VERSION` i `js/core.js` og `version` i `version.json` til samme verdi.
2. Legger du til en ny fil, legg den også inn i `FILES` i `sw.js` og øk `CACHE`.
3. Kjør testene.

Da får appen på Hjem-skjermen en «Ny versjon klar»-melding.
