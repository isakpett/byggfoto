// Byggfoto tests. Run from the project folder:  node tests/run.js
// Starts a small local web server, opens the app in an iPhone-sized browser and checks each feature.
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { chromium, devices } = require('playwright');

const ROOT = path.join(__dirname, '..');
const PHOTO = path.join(__dirname, 'fixtures', 'photo.jpg');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };

// Lets a test pretend the server has a newer version.
let versionOverride = null;

function startServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    if (p === '/version.json' && versionOverride) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ version: versionOverride }));
    }
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r(server)));
}

// ---------- Helpers ----------
let browser, base;

async function openApp({ seed = {}, offline = false } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'nb-NO', permissions: ['camera'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // The app must never use Safari's own pop-ups.
  page.on('dialog', d => { errors.push('native dialog: ' + d.message()); d.dismiss(); });
  // Capture what would go to the share sheet.
  await page.addInitScript(() => {
    navigator.canShare = () => true;
    navigator.share = async d => {
      window.__shared = { title: d.title, text: d.text, files: d.files.map(f => ({ name: f.name, size: f.size })) };
      window.__sharedBlobs = d.files;
    };
  });
  await page.goto(base);
  await page.evaluate(seed => {
    localStorage.clear();
    for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v));
  }, seed);
  await page.reload();
  await page.waitForSelector('#btnSend');
  return { ctx, page, errors };
}

async function addPhotos(page, n = 1) {
  const before = await page.locator('.pcard').count();
  await page.setInputFiles('#inLibrary', Array(n).fill(PHOTO));
  await page.waitForFunction(c => document.querySelectorAll('.pcard').length === c, before + n);
}

const card = (page, i) => page.locator('.pcard').nth(i);

async function fillMore(page, i, { text, material, hours } = {}) {
  const c = card(page, i);
  if (await c.locator('.more-btn').count()) await c.locator('.more-btn').click();
  if (text != null) await c.locator('textarea').fill(text);
  if (material != null) await c.locator('.more input').nth(0).fill(material);
  if (hours != null) await c.locator('.more input').nth(1).fill(hours);
}

async function pickWord(page, i, word) {
  const c = card(page, i);
  const chip = c.locator('.chip', { hasText: new RegExp(`^${word}$`) });
  if (!(await chip.count())) await c.locator('.chip.show-all').click();
  await c.locator('.chip', { hasText: new RegExp(`^${word}$`) }).click();
}

// Presses Send and clicks through the app's own boxes until the share sheet would open.
async function send(page) {
  await page.evaluate(() => { window.__shared = null; });
  await page.click('#btnSend');
  for (let k = 0; k < 6; k++) {
    if (await page.evaluate(() => !!window.__shared)) break;
    const alert = page.locator('.alert.show');
    if (await alert.count()) {
      const title = await alert.locator('.msg b').textContent();
      if (/sendt\?/.test(title)) break;
      const go = alert.locator('button', { hasText: /^(Send|Send likevel)$/ });
      if (await go.count()) await go.click();
    }
    await page.waitForTimeout(400);
  }
  const shared = await page.evaluate(() => window.__shared);
  assert.ok(shared, 'share sheet was not opened');
  // Answer "Ble e-posten sendt?" with "keep the job".
  await page.locator('.alert.show button', { hasText: 'Nei, behold jobben' }).click();
  await page.waitForTimeout(300);
  return shared;
}

// ---------- Tests ----------
const tests = [];
const test = (name, fn, opts = {}) => tests.push({ name, fn, opts });

test('starter uten feil, tom jobb', async ({ page }) => {
  assert.equal(await page.locator('.pcard').count(), 0);
  assert.ok(await page.isVisible('#empty'));
  assert.ok(!(await page.isVisible('#btnNewJob')), '«Ny jobb» skal være skjult på tom jobb');
  assert.equal((await page.textContent('#btnSend')).trim(), 'Send til kontoret');
});

test('legge til bilder, ord, tekst, materiell, timer og stempel', async ({ page }) => {
  await page.fill('#fAddress', 'Storgata 1, Oslo');
  await page.fill('#fProject', '1234');
  await addPhotos(page, 2);
  assert.equal((await page.textContent('#btnSend')).trim(), 'Send 2 bilder');
  await pickWord(page, 0, 'Gulv');
  await pickWord(page, 0, 'Gips');
  await fillMore(page, 0, { text: 'Stue', material: '12 gipsplater' });
  await card(page, 0).locator('.qh', { hasText: /^2$/ }).click();
  assert.equal(await card(page, 0).locator('.more input').nth(1).inputValue(), '2');
  assert.equal(await card(page, 0).locator('.stamp').textContent(), 'Stue · 12 gipsplater · 2 t');
  assert.ok(!(await card(page, 1).locator('.stamp').isVisible()), 'bilde uten info skal ikke ha stempel');
  // Saved across reload
  await page.reload(); await page.waitForSelector('.pcard >> nth=1');
  assert.deepEqual(await card(page, 0).locator('.chip.on').allTextContents(), ['Gulv', 'Gips']);
});

test('e-posttekst: emne først, sammendrag og timer delt likt', async ({ page }) => {
  await page.fill('#fAddress', 'Nordlysveien 25b');
  await page.fill('#fProject', '24039');
  await page.fill('#fHours', '7,5');
  await addPhotos(page, 3);
  await pickWord(page, 0, 'Gulv'); await pickWord(page, 0, 'Riving');
  await fillMore(page, 0, { text: 'Stue', material: '2 plater', hours: '2' });
  await pickWord(page, 1, 'Gulv');
  await fillMore(page, 1, { hours: '1' });
  const s = await send(page);
  const date = await page.evaluate(() => new Date().toISOString().slice(0, 10).split('-').reverse().join('.'));
  const subject = `Jobbilder – prosjekt 24039 – Nordlysveien 25b – ${date}`;
  assert.equal(s.title, subject);
  const expected = [
    subject,
    'Adresse: Nordlysveien 25b',
    `Dato: ${date} · Antall bilder: 3 · Timer totalt: 7,5`,
    '──────────────',
    'SAMMENDRAG',
    '• Timer på oppgaver: 3',
    '• Gulv: 2 t',
    '• Riving: 1 t',
    '• Materiell: 2 plater',
    '──────────────',
    'BILDE 1 (P24039_01.jpg)',
    '• Arbeid: Gulv, Riving',
    '• Merknad: Stue',
    '• Materiell: 2 plater',
    '• Timer: 2',
    '──────────────',
    'BILDE 2 (P24039_02.jpg)',
    '• Arbeid: Gulv',
    '• Timer: 1',
  ].join('\n');
  assert.equal(s.text, expected);
  assert.deepEqual(s.files.map(f => f.name), ['P24039_01.jpg', 'P24039_02.jpg', 'P24039_03.jpg']);
  assert.ok(s.files.every(f => f.size > 1000 && f.size < 1500 * 1024), 'bildene skal være krympet');
  // Stamped photo is a different file than the clean one
  assert.notEqual(s.files[0].size, s.files[2].size);
  // Sent badge, history and recent jobs
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.ok(await page.isVisible('#sumSent'), '«Sendt ✓» skal vises');
  const stored = await page.evaluate(() => ({ h: JSON.parse(localStorage.getItem('history')), r: JSON.parse(localStorage.getItem('recent')) }));
  assert.equal(stored.h.length, 1);
  assert.equal(stored.h[0].text, expected);
  assert.deepEqual(stored.r[0], { address: 'Nordlysveien 25b', project: '24039' });
});

test('«Noe mangler»-sjekk før sending', async ({ page }) => {
  await page.fill('#fProject', '77');
  await addPhotos(page, 2);
  await pickWord(page, 0, 'Gulv');
  await page.click('#btnSend');
  await page.waitForSelector('.alert.show');
  const msg = await page.textContent('.alert.show .msg');
  assert.match(msg, /Noe mangler/);
  assert.match(msg, /Adresse mangler/);
  assert.match(msg, /1 bilde mangler arbeid/);
  await page.click('.alert.show >> text=Gå tilbake');
  await page.waitForTimeout(300);
  assert.ok(!(await page.evaluate(() => window.__shared)), 'skal ikke sende etter «Gå tilbake»');
});

test('flytte, tegne, fjerne tegning og slette bilde', async ({ page }) => {
  await addPhotos(page, 2);
  await pickWord(page, 1, 'Lekter');
  // Move photo 2 up
  await card(page, 1).locator('[aria-label^="Valg"]').click();
  await page.click('.asheet.show >> text=Flytt opp');
  await page.waitForTimeout(400);
  assert.deepEqual(await card(page, 0).locator('.chip.on').allTextContents(), ['Lekter']);
  // Draw
  await card(page, 0).locator('[aria-label^="Tegn"]').click();
  await page.waitForSelector('#editor:not(.hidden)');
  const box = await page.locator('#edCanvas').boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30); await page.mouse.down();
  for (let k = 0; k < 10; k++) await page.mouse.move(box.x + 30 + k * 15, box.y + 30 + k * 8);
  await page.mouse.up();
  await page.click('#edDone'); await page.waitForTimeout(400);
  assert.match(await card(page, 0).locator('.head b').textContent(), /tegnet/);
  // Remove drawing
  await card(page, 0).locator('[aria-label^="Valg"]').click();
  await page.click('.asheet.show >> text=Fjern tegning');
  await page.waitForTimeout(350);
  await page.click('.asheet.show .destructive'); await page.waitForTimeout(400);
  assert.doesNotMatch(await card(page, 0).locator('.head b').textContent(), /tegnet/);
  // Delete
  await card(page, 0).locator('[aria-label^="Valg"]').click();
  await page.click('.asheet.show >> text=Slett bilde'); await page.waitForTimeout(350);
  await page.click('.asheet.show .destructive'); await page.waitForTimeout(400);
  assert.equal(await page.locator('.pcard').count(), 1);
});

test('samme ord som forrige og kort ordliste', async ({ page }) => {
  await addPhotos(page, 2);
  assert.equal(await card(page, 0).locator('.chip:not(.show-all)').count(), 8);
  await pickWord(page, 0, 'Søppel');
  await card(page, 0).locator('.chip.show-all', { hasText: 'Vis færre' }).click();
  assert.deepEqual(await card(page, 0).locator('.chip.on').allTextContents(), ['Søppel'], 'valgt ord skal vises i kort liste');
  await card(page, 1).locator('.tool', { hasText: 'Samme ord som forrige' }).click();
  await page.waitForTimeout(200);
  assert.deepEqual(await card(page, 1).locator('.chip.on').allTextContents(), ['Søppel']);
});

test('ny jobb advarer når jobben ikke er sendt', async ({ page }) => {
  await page.fill('#fAddress', 'Testveien 1');
  await addPhotos(page, 1);
  await page.click('#btnNewJob'); await page.waitForTimeout(350);
  assert.match(await page.textContent('.asheet.show .msg'), /ikke sendt/);
  await page.click('.asheet.show .destructive'); await page.waitForTimeout(400);
  assert.equal(await page.locator('.pcard').count(), 0);
  assert.equal(await page.inputValue('#fAddress'), '');
});

test('siste jobber: velg og slett', async ({ page }) => {
  assert.ok(await page.isVisible('#recentBox'));
  await page.click('#btnEditRecent');
  await page.locator('#recentList .minus').nth(0).click();
  assert.deepEqual(await page.locator('#recentList .two b').allTextContents(), ['Kirkeveien 22, Bærum']);
  await page.click('#btnEditRecent');
  await page.click('#recentList button.cell');
  assert.equal(await page.inputValue('#fAddress'), 'Kirkeveien 22, Bærum');
  assert.equal(await page.inputValue('#fProject'), '1198');
}, { seed: { recent: [{ address: 'Storgata 1, Oslo', project: '1234' }, { address: 'Kirkeveien 22, Bærum', project: '1198' }] } });

test('innstillinger: sider, ord og historikk', async ({ page }) => {
  await page.click('#btnSettings'); await page.waitForTimeout(450);
  assert.equal(await page.textContent('#setTitle'), 'Innstillinger');
  assert.match(await page.textContent('#menuOffice'), /eirik@firma\.no/);
  assert.match(await page.textContent('#appVersion'), /^Versjon /);
  // Words
  await page.click('[data-page="pageWords"]');
  await page.fill('#fNewComment', 'Taklist'); await page.click('#btnAddComment');
  assert.ok((await page.locator('#commentList .val').allTextContents()).includes('Taklist'));
  await page.click('#pageWords [data-back]');
  assert.equal(await page.textContent('#menuWords'), '21 ord');
  // History: open one, delete it, then clear the rest
  await page.click('[data-page="pageHistory"]');
  await page.locator('#historyList .cell').nth(0).click();
  assert.equal(await page.textContent('#histText'), 'Tekst A');
  await page.click('#histDelete'); await page.waitForTimeout(350);
  await page.click('.asheet.show .destructive'); await page.waitForTimeout(450);
  assert.equal(await page.textContent('#setTitle'), 'Historikk');
  assert.equal(await page.locator('#historyList .cell').count(), 1);
  await page.click('#histClear'); await page.waitForTimeout(350);
  await page.click('.asheet.show .destructive'); await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() => localStorage.getItem('history')), '[]');
}, { seed: {
  office: 'eirik@firma.no',
  history: [
    { at: '2026-11-26T08:00:00Z', address: 'A-veien 1', project: '1', date: '2026-11-26', hours: '', count: 1, text: 'Tekst A' },
    { at: '2026-11-25T08:00:00Z', address: 'B-veien 2', project: '2', date: '2026-11-25', hours: '', count: 2, text: 'Tekst B' },
  ],
} });

test('kamera i appen', async ({ page }) => {
  await page.click('#btnCamera');
  await page.waitForFunction(() => document.getElementById('camVideo').videoWidth > 0, null, { timeout: 10000 });
  await page.click('#camShutter'); await page.waitForTimeout(300);
  await page.click('#camShutter'); await page.waitForTimeout(300);
  assert.equal(await page.textContent('#camCount'), '2 bilder');
  await page.click('#camDone'); await page.waitForTimeout(400);
  assert.equal(await page.locator('.pcard').count(), 2);
});

test('topplinje vises ved scrolling', async ({ page }) => {
  await page.fill('#fAddress', 'Storgata 1, Oslo');
  await page.fill('#fProject', '1234');
  await addPhotos(page, 2);
  await page.evaluate(() => window.scrollTo(0, 1500)); await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => document.getElementById('topbar').classList.contains('show')));
  assert.equal(await page.textContent('#topbar'), 'Storgata 1, Oslo  ·  1234');
});

test('oppdaterings-stripe og bruk uten nett', async ({ page, ctx }) => {
  assert.ok(!(await page.isVisible('#updateBar')));
  versionOverride = 'test-ny-versjon';
  await page.reload(); await page.waitForTimeout(800);
  assert.ok(await page.isVisible('#updateBar'), 'stripen skal vises når serveren har ny versjon');
  versionOverride = null;
  await page.click('#updateBar'); await page.waitForTimeout(1000);
  assert.ok(!(await page.isVisible('#updateBar')));
  // Offline
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.waitForTimeout(500);
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector('#btnSend');
  assert.equal(await page.title(), 'Byggfoto');
  // The scripts and styles must also work offline, not just the page
  assert.match(await page.textContent('#appVersion'), /^Versjon /);
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.bar')).position), 'fixed');
  await addPhotos(page, 1);
  await ctx.setOffline(false);
});

// ---------- Runner ----------
(async () => {
  const server = await startServer();
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const only = process.argv[2];
  let failed = 0;
  for (const t of tests) {
    if (only && !t.name.includes(only)) continue;
    const { ctx, page, errors } = await openApp(t.opts);
    try {
      await t.fn({ page, ctx });
      assert.deepEqual(errors, [], 'feil i appen');
      console.log(`  ✓ ${t.name}`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${t.name}\n      ${String(e.message).split('\n').join('\n      ')}`);
    } finally {
      versionOverride = null;
      await ctx.close();
    }
  }
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} test(er) feilet` : '\nAlle tester bestått');
  process.exit(failed ? 1 : 0);
})();
