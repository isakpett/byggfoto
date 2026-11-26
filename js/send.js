// Email text, the stamp on photos, size check and sending through the share sheet.
// All files share one scope; they load in the order listed in index.html.

// ---------- Email text ----------
const num = s => { const n = parseFloat(String(s).replace(',', '.')); return isNaN(n) ? null : n; };
const fmtNum = n => String(Math.round(n * 100) / 100).replace('.', ',');
const fmtDate = d => d ? d.split('-').reverse().join('.') : '';
const safe = s => String(s).trim().replace(/[^\wæøåÆØÅ-]+/g, '_').replace(/^_+|_+$/g, '');

function fileName(i) {
  const base = safe(job.project) ? `P${safe(job.project)}` : 'Bilde';
  return `${base}_${String(i + 1).padStart(2, '0')}.jpg`;
}

function subject() {
  const parts = ['Jobbilder'];
  if (job.project) parts.push(`prosjekt ${job.project.trim()}`);
  if (job.address) parts.push(job.address.trim());
  parts.push(fmtDate(job.date));
  return parts.join(' – ');
}

function bodyText() {
  // Outlook turns every line into a paragraph, so: no empty lines, headings, bullets and dividers.
  const DIV = '──────────────';
  const L = [];
  // Outlook uses the first line of the text as the subject, so it must be the full subject.
  L.push(subject());
  L.push(`Adresse: ${job.address.trim() || '–'}`);
  const meta = [`Dato: ${fmtDate(job.date) || '–'}`, `Antall bilder: ${job.photos.length}`];
  const tot = num(job.hours);
  if (tot != null) meta.push(`Timer totalt: ${fmtNum(tot)}`);
  L.push(meta.join(' · '));

  // Summary for the office: hours per type of work and all material.
  // Hours on a photo with several words are split evenly between them.
  let sum = 0, anyTask = false;
  const byWork = new Map(), mats = [];
  job.photos.forEach(p => {
    const h = num(p.hours), mat = (p.material || '').trim();
    if (mat) mats.push(mat);
    if (h == null) return;
    sum += h; anyTask = true;
    const keys = p.tags.length ? p.tags : ['Uten arbeid valgt'];
    keys.forEach(k => byWork.set(k, (byWork.get(k) || 0) + h / keys.length));
  });
  if (anyTask || mats.length) {
    L.push(DIV, 'SAMMENDRAG');
    if (anyTask) {
      L.push(`• Timer på oppgaver: ${fmtNum(sum)}`);
      byWork.forEach((h, k) => L.push(`• ${k}: ${fmtNum(h)} t`));
    }
    if (mats.length) L.push(`• Materiell: ${mats.join(', ')}`);
  }

  job.photos.forEach((p, i) => {
    const h = num(p.hours);
    const mat = (p.material || '').trim();
    if (!p.tags.length && !p.text.trim() && !mat && h == null) return;
    L.push(DIV);
    L.push(`BILDE ${i + 1} (${fileName(i)})`);
    if (p.tags.length) L.push(`• Arbeid: ${p.tags.join(', ')}`);
    if (p.text.trim()) L.push(`• Merknad: ${p.text.trim().replace(/\s*\n+\s*/g, ', ')}`);
    if (mat) L.push(`• Materiell: ${mat}`);
    if (h != null) L.push(`• Timer: ${fmtNum(h)}`);
  });
  return L.join('\n');
}

// ---------- Stamp, size and send ----------
const LIMIT = 20 * 1024 * 1024, WARN = 15 * 1024 * 1024;

function stampText(p) {
  const parts = [];
  const t = p.text.trim().replace(/\s*\n+\s*/g, ', ');
  if (t) parts.push(t);
  const m = (p.material || '').trim();
  if (m) parts.push(m);
  const h = num(p.hours);
  if (h != null) parts.push(`${fmtNum(h)} t`);
  return parts.join(' · ');
}
const keyFor = p => stampText(p) + '|' + (p.ver || 0);
const isReady = p => { const c = cache.get(p.id); return !!c && c.key === keyFor(p); };
const allReady = () => job.photos.every(isReady);

function wrapLines(ctx, text, maxW, maxLines) {
  const words = text.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(last + ' …').width > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = last + ' …';
  }
  return lines;
}

async function stampBlob(blob, text) {
  const img = await loadImage(blob);
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const fs = Math.round(Math.max(w, h) * 0.03), pad = Math.round(fs * 0.7);
  ctx.font = `600 ${fs}px -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif`;
  const lines = wrapLines(ctx, text, w - pad * 2, 3);
  const lh = Math.round(fs * 1.25), bh = lines.length * lh + pad * 2 - (lh - fs);
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(0, h - bh, w, bh);
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'top';
  lines.forEach((l, k) => ctx.fillText(l, pad, h - bh + pad + k * lh));
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.8));
}

let preparing = null, prepTimer;
function schedulePrepare() { clearTimeout(prepTimer); prepTimer = setTimeout(prepare, 700); }
function prepare() {
  if (preparing) return preparing.then(() => allReady() ? null : prepare());
  preparing = (async () => {
    for (const p of job.photos.slice()) {
      if (isReady(p) || !blobs.has(p.id)) continue;
      const key = keyFor(p), st = stampText(p);
      let out = blobs.get(p.id);
      // If the stamp fails, send the photo without it rather than not at all.
      if (st) { try { out = (await stampBlob(out, st)) || out; } catch (e) {} }
      cache.set(p.id, { key, blob: out });
    }
  })().catch(e => hud('Feil: ' + e.message)).finally(() => { preparing = null; renderSize(); });
  return preparing;
}

function totalSize() {
  return job.photos.reduce((n, p) => {
    const c = cache.get(p.id);
    return n + (c ? c.blob.size : (blobs.get(p.id) || { size: 0 }).size);
  }, 0);
}
const mb = n => (n / 1024 / 1024).toFixed(1).replace('.', ',');
function renderSize() {
  const info = $('sizeInfo'), n = totalSize();
  info.classList.toggle('hidden', !job.photos.length);
  info.textContent = n > LIMIT
    ? `Størrelse: ca. ${mb(n)} MB – for stort for én e-post (maks 20 MB)`
    : `Størrelse: ca. ${mb(n)} MB av 20 MB`;
  info.classList.toggle('warn', n > WARN && n <= LIMIT);
  info.classList.toggle('over', n > LIMIT);
}

async function send() {
  if (!job.photos.length) {
    ask({ style: 'alert', title: 'Ingen bilder', message: 'Ta minst ett bilde før du sender.', actions: [{ label: 'OK', value: 1, bold: true }] });
    return;
  }
  const missing = [];
  if (!job.address.trim()) missing.push('Adresse mangler');
  if (!job.project.trim()) missing.push('Prosjektnr. mangler');
  const noWords = job.photos.filter(p => !p.tags.length).length;
  if (noWords) missing.push(`${noWords} ${noWords === 1 ? 'bilde mangler' : 'bilder mangler'} arbeid`);
  if (missing.length) {
    const ok = await ask({ style: 'alert', title: 'Noe mangler', message: missing.join('\n') + '\n\nVil du sende likevel?',
      actions: [{ label: 'Send likevel', value: 1 }, { label: 'Gå tilbake', value: null, bold: true }] });
    if (!ok) return;
  }
  // iPhone only opens the share sheet right after a tap. If photos still need their stamp,
  // prepare them first and ask for one more tap.
  if (!allReady()) {
    $('btnSend').textContent = 'Gjør klar …';
    await prepare();
    renderPhotos();
    const ok = await ask({ style: 'alert', title: 'Klar til å sende', message: `${job.photos.length} ${job.photos.length === 1 ? 'bilde' : 'bilder'}, ca. ${mb(totalSize())} MB`,
      actions: [{ label: 'Send', value: 1, bold: true }, { label: 'Avbryt', value: null }] });
    if (!ok) return;
  }
  if (totalSize() > LIMIT) {
    const ok = await ask({ style: 'alert', title: 'For stor e-post',
      message: `Bildene er ca. ${mb(totalSize())} MB. Hotmail tar maks 20 MB, så e-posten kan bli stoppet. Slett noen bilder og send dem i en ny jobb.`,
      actions: [{ label: 'Send likevel', value: 1 }, { label: 'Avbryt', value: null, bold: true }] });
    if (!ok) return;
  }
  share();
}

async function share() {
  const files = job.photos.map((p, i) =>
    new File([cache.get(p.id).blob], fileName(i), { type: 'image/jpeg' }));
  // iPhone Mail ignores the title as subject when files are shared; Outlook uses it.
  const data = { files, title: subject(), text: bodyText() };

  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share(data);
      job.sent = true; ls.set('job', job);
      addRecent();
      sentJobs = [{ at: new Date().toISOString(), address: job.address.trim(), project: job.project.trim(),
        date: job.date, hours: job.hours, count: job.photos.length, text: bodyText() }].concat(sentJobs).slice(0, 100);
      ls.set('history', sentJobs);
      renderJobView();
      const v = await ask({ style: 'alert', title: 'Ble e-posten sendt?',
        message: 'Hvis ja, tømmes jobben så du kan starte en ny.',
        actions: [{ label: 'Ja, start ny jobb', value: 'new', bold: true }, { label: 'Nei, behold jobben', value: null }] });
      if (v === 'new') resetJob();
    } catch (e) {
      if (e.name !== 'AbortError') hud('Deling feilet: ' + e.message);
    }
  } else {
    // Fallback (e.g. desktop browser): open mail with text only.
    hud('Denne nettleseren kan ikke dele bilder. Bruk Safari på iPhone.');
    location.href = `mailto:${encodeURIComponent(office)}?subject=${encodeURIComponent(subject())}&body=${encodeURIComponent(bodyText())}`;
  }
}
