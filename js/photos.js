// Adding photos (shrinking them) and drawing the job and photo cards.
// All files share one scope; they load in the order listed in index.html.

// ---------- Image compression ----------
function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { res(img); URL.revokeObjectURL(url); };
    img.onerror = () => { rej(new Error('Kunne ikke lese bildet')); URL.revokeObjectURL(url); };
    img.src = url;
  });
}
async function compress(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(img, 0, 0, w, h);
  return new Promise(res => c.toBlob(res, 'image/jpeg', JPEG_QUALITY));
}

// Reads when a JPEG photo was taken (EXIF DateTimeOriginal) before shrinking removes it.
// Returns "YYYY-MM-DDTHH:MM" or null.
async function readTakenAt(file) {
  try {
    const v = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (v.getUint16(0) !== 0xFFD8) return null;
    let o = 2;
    while (o + 4 < v.byteLength) {
      const marker = v.getUint16(o), len = v.getUint16(o + 2);
      if (marker === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) {      // "Exif"
        const t = o + 10, le = v.getUint16(t) === 0x4949;
        const u16 = x => v.getUint16(t + x, le), u32 = x => v.getUint32(t + x, le);
        const readAscii = (x, n) => { let s = ''; for (let k = 0; k < n - 1; k++) s += String.fromCharCode(v.getUint8(t + x + k)); return s; };
        const findTag = (ifd, tag) => {
          const n = u16(ifd);
          for (let k = 0; k < n; k++) { const e = ifd + 2 + k * 12; if (u16(e) === tag) return e; }
          return null;
        };
        const ifd0 = u32(4);
        let e = null;
        const exifPtr = findTag(ifd0, 0x8769);
        if (exifPtr) e = findTag(u32(exifPtr + 8), 0x9003);              // DateTimeOriginal
        if (!e) e = findTag(ifd0, 0x0132);                                // DateTime
        if (!e) return null;
        const m = readAscii(u32(e + 8), u32(e + 4)).match(/^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d)/);
        return m && m[1] !== '0000' ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : null;
      }
      if ((marker & 0xFF00) !== 0xFF00) return null;
      o += 2 + len;
    }
  } catch (e) {}
  return null;
}
const nowLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

async function addBlob(blob, takenAt = null) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  await putBlob(id, blob);
  blobs.set(id, blob);
  job.photos.push({ id, tags: [], text: '', material: '', hours: '', takenAt });
  saveJob();
  return id;
}
function afterAdd() {
  sortComments();
  editingJob = false; renderJobView();
  renderPhotos();
  const last = $('photos').lastElementChild;
  if (last) last.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// fromCamera: the photo was just taken, so "now" is a safe fallback when it has no EXIF time.
async function addFiles(files, fromCamera = false) {
  if (!files.length) return;
  $('busy').classList.remove('hidden');
  try {
    for (const f of files) {
      const takenAt = (await readTakenAt(f)) || (fromCamera ? nowLocal() : null);
      await addBlob(await compress(f), takenAt);
    }
  } catch (e) {
    hud('Feil: ' + e.message);
  }
  $('busy').classList.add('hidden');
  afterAdd();
}

// ---------- Rendering ----------
function urlFor(id) {
  if (!urls.has(id) && blobs.has(id)) urls.set(id, URL.createObjectURL(blobs.get(id)));
  return urls.get(id) || '';
}

function renderPhotos() {
  const wrap = $('photos');
  wrap.innerHTML = '';
  const n = job.photos.length;
  $('empty').classList.toggle('hidden', n > 0);
  $('photoCount').textContent = n ? `(${n})` : '';
  $('btnSend').textContent = n ? `Send ${n} ${n === 1 ? 'bilde' : 'bilder'}` : 'Send til kontoret';

  job.photos.forEach((p, i) => wrap.appendChild(buildCard(p, i, n)));
  schedulePrepare();
  renderSize();
  renderNewJob();
}

function buildCard(p, i, n) {
  const card = el('div', 'pcard');

  const pw = el('div', 'photo-wrap');
  const img = el('img', 'big');
  img.src = urlFor(p.id); img.alt = `Bilde ${i + 1}, trykk for fullskjerm`;
  img.onclick = () => openViewer(p.id);
  // Landscape photos fill the width with no dark bars; portrait ones keep the 16:10 box and show whole.
  img.onload = () => { if (img.naturalWidth >= img.naturalHeight) img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`; };
  const stampEl = el('div', 'stamp');
  pw.append(img, stampEl);
  card.appendChild(pw);

  const body = el('div', 'body');
  card.appendChild(body);

  // Shows the stamp on the photo, like it will look in the email.
  const updateStamp = () => {
    const st = stampText(p);
    stampEl.textContent = st;
    stampEl.classList.toggle('hidden', !st);
  };
  updateStamp();

  const head = el('div', 'head');
  head.appendChild(el('b', '', `Bilde ${i + 1}${p.drawn ? ' · tegnet' : ''}`));
  const menu = el('button', 'icon-btn', '•••');
  menu.style.fontWeight = '700'; menu.style.marginRight = '-10px';
  menu.setAttribute('aria-label', `Valg for bilde ${i + 1}`);
  menu.onclick = () => photoMenu(p, i, n);
  const pen = el('button', 'icon-btn');
  pen.innerHTML = ICON_PEN; pen.setAttribute('aria-label', `Tegn på bilde ${i + 1}`);
  pen.onclick = () => openEditor(p);
  const hb = el('div', 'head-btns');
  hb.append(pen, menu);
  head.appendChild(hb);
  body.appendChild(head);

  const chips = el('div', 'chips');
  const renderChips = () => {
    chips.innerHTML = '';
    const full = order.concat(p.tags.filter(t => !order.includes(t)));
    const showAll = allWords.has(p.id) || full.length <= TOP_WORDS + 2;
    const top = full.slice(0, TOP_WORDS);
    const list = showAll ? full : full.filter(t => top.includes(t) || p.tags.includes(t));
    list.forEach(t => {
      const b = el('button', 'chip' + (p.tags.includes(t) ? ' on' : ''), t);
      b.onclick = () => {
        const k = p.tags.indexOf(t);
        if (k >= 0) p.tags.splice(k, 1);
        else { p.tags.push(t); usage[t] = (usage[t] || 0) + 1; ls.set('usage', usage); }
        b.classList.toggle('on', k < 0);
        saveJob(); updateStamp();
      };
      chips.appendChild(b);
    });
    if (!showAll) {
      const more = el('button', 'chip show-all', `Vis alle ord (${full.length})`);
      more.onclick = () => { allWords.add(p.id); renderChips(); };
      chips.appendChild(more);
    } else if (allWords.has(p.id)) {
      const less = el('button', 'chip show-all', 'Vis færre');
      less.onclick = () => { allWords.delete(p.id); renderChips(); };
      chips.appendChild(less);
    }
  };
  renderChips();
  body.appendChild(chips);

  if (i > 0) {
    const tools = el('div', 'tools');
    const bSame = el('button', 'tool', 'Samme ord som forrige');
    bSame.onclick = () => {
      p.tags = job.photos[i - 1].tags.slice(); saveJob();
      renderChips(); updateStamp();
      hud('Ord kopiert', true);
    };
    tools.appendChild(bSame);
    body.appendChild(tools);
  }

  const hasMore = moreOpen.has(p.id) || p.text.trim() || (p.material || '').trim() || String(p.hours).trim();
  const more = el('div', 'more' + (hasMore ? '' : ' hidden'));

  const rt = el('label', 'cell static stack');
  rt.appendChild(el('span', 'lbl', 'Egen tekst'));
  const ta = el('textarea');
  ta.rows = 2; ta.placeholder = 'F.eks. stue, ca. 12 m²'; ta.value = p.text;
  ta.oninput = () => { p.text = ta.value; saveJob(); updateStamp(); };
  rt.appendChild(ta);

  const rm = el('label', 'cell static');
  rm.appendChild(el('span', 'lbl', 'Materiell'));
  const im = el('input');
  im.placeholder = 'F.eks. 12 gipsplater'; im.value = p.material || '';
  im.oninput = () => { p.material = im.value; saveJob(); updateStamp(); };
  rm.appendChild(im);

  const rh = el('label', 'cell static');
  rh.appendChild(el('span', 'lbl', 'Timer'));
  const ih = el('input');
  ih.inputMode = 'decimal'; ih.placeholder = 'Valgfritt'; ih.value = p.hours;
  const quick = el('div', 'quick-hours');
  const markQuick = () => quick.querySelectorAll('button').forEach(q => q.classList.toggle('on', num(q.textContent) === num(p.hours)));
  ['0,5', '1', '2', '4', '8'].forEach(v => {
    const q = el('button', 'qh', v);
    q.setAttribute('aria-label', `${v} timer`);
    q.onclick = () => { ih.value = p.hours = v; saveJob(); updateStamp(); markQuick(); };
    quick.appendChild(q);
  });
  ih.oninput = () => { p.hours = ih.value; saveJob(); updateStamp(); markQuick(); };
  rh.appendChild(ih);
  markQuick();

  more.append(rt, rm, rh, quick);
  body.appendChild(more);

  if (!hasMore) {
    const bm = el('button', 'more-btn', '＋ Tekst, materiell, timer');
    bm.onclick = () => { moreOpen.add(p.id); more.classList.remove('hidden'); bm.remove(); ta.focus(); };
    body.appendChild(bm);
  }
  return card;
}
const renderNewJob = () => $('newJobBox').classList.toggle('hidden', !hasContent());

async function photoMenu(p, i, n) {
  const actions = [];
  if (i > 0) actions.push({ label: 'Flytt opp', value: 'up' });
  if (i < n - 1) actions.push({ label: 'Flytt ned', value: 'down' });
  if (p.drawn) actions.push({ label: 'Fjern tegning', value: 'undraw' });
  actions.push({ label: 'Slett bilde', value: 'del', destructive: true });
  const v = await ask({ title: `Bilde ${i + 1}`, actions });
  if (v === 'up' || v === 'down') {
    const j = v === 'up' ? i - 1 : i + 1;
    [job.photos[i], job.photos[j]] = [job.photos[j], job.photos[i]];
    saveJob();
    // Only rebuild the two cards that swapped places, so the screen does not jump.
    const wrap = $('photos');
    for (const k of [i, j]) wrap.replaceChild(buildCard(job.photos[k], k, n), wrap.children[k]);
    const c = wrap.children[j]; if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' });
  } else if (v === 'draw') openEditor(p);
  else if (v === 'undraw') removeDrawing(p);
  else if (v === 'del') deletePhoto(p, i);
}

async function deletePhoto(p, i) {
  const v = await ask({ message: `Bilde ${i + 1} slettes fra jobben. Bildet i Bilder-appen blir ikke slettet.`,
    actions: [{ label: 'Slett bilde', value: 'del', destructive: true }] });
  if (v !== 'del') return;
  job.photos.splice(i, 1); saveJob();
  await delBlob(p.id); await delBlob(p.id + '_o'); blobs.delete(p.id); cache.delete(p.id);
  if (urls.has(p.id)) { URL.revokeObjectURL(urls.get(p.id)); urls.delete(p.id); }
  moreOpen.delete(p.id); allWords.delete(p.id);
  renderPhotos();
}

function openViewer(id) {
  $('viewerImg').src = urlFor(id);
  $('viewer').classList.remove('hidden');
}

function renderJobView() {
  const filled = job.address.trim() && job.project.trim();
  const collapsed = filled && !editingJob;
  $('jobSummary').classList.toggle('hidden', !collapsed);
  $('jobEdit').classList.toggle('hidden', !!collapsed);
  $('jobDoneBox').classList.toggle('hidden', !filled);
  if (collapsed) {
    $('sumAddress').textContent = job.address.trim();
    const meta = [`Prosjekt ${job.project.trim()}`, fmtDate(job.date)];
    if (num(job.hours) != null) meta.push(`${fmtNum(num(job.hours))} t`);
    $('sumMeta').textContent = meta.join(' · ');
    $('sumSent').classList.toggle('hidden', !job.sent);
  }
}

function renderJobFields() {
  $('fAddress').value = job.address;
  $('fProject').value = job.project;
  $('fDate').value = job.date || today();
  $('fHours').value = job.hours;
  renderSubject();
  renderRecent();
  renderJobView();
}

let editRecent = false;
function renderRecent() {
  const show = !job.address.trim() && recent.length > 0;
  $('recentBox').classList.toggle('hidden', !show);
  if (!show) return;
  const box = $('recentList');
  box.innerHTML = '';
  $('btnEditRecent').textContent = editRecent ? 'Ferdig' : 'Rediger';
  recent.forEach((r, k) => {
    const two = el('span', 'two');
    two.appendChild(el('b', '', r.address || '(uten adresse)'));
    if (r.project) two.appendChild(el('span', 'sub', `Prosjekt ${r.project}`));
    if (editRecent) {
      const row = el('div', 'cell static');
      const m = el('button', 'minus', '−');
      m.setAttribute('aria-label', `Fjern ${r.address || r.project}`);
      m.onclick = () => {
        recent.splice(k, 1); ls.set('recent', recent);
        if (!recent.length) editRecent = false;
        renderRecent();
      };
      row.append(m, two);
      box.appendChild(row);
      return;
    }
    const b = el('button', 'cell');
    b.appendChild(two);
    b.insertAdjacentHTML('beforeend', ICON_CHEV);
    b.onclick = () => {
      job.address = r.address; job.project = r.project; saveJob();
      editingJob = false;
      renderJobFields(); renderNewJob();
    };
    box.appendChild(b);
  });
}

function addRecent() {
  const a = job.address.trim(), pr = job.project.trim();
  if (!a && !pr) return;
  recent = [{ address: a, project: pr }].concat(recent.filter(r => !(r.address === a && r.project === pr))).slice(0, 10);
  ls.set('recent', recent);
}

function renderOffice() {
  $('btnCopyEmail').classList.toggle('hidden', !office);
  $('fOffice').value = office;
}

function renderCommentList() {
  const box = $('commentList');
  box.innerHTML = '';
  comments.forEach((c, i) => {
    const row = el('div', 'cell static');
    const b = el('button', 'minus', '−');
    b.setAttribute('aria-label', `Fjern ${c}`);
    b.onclick = () => { comments.splice(i, 1); ls.set('comments', comments); renderCommentList(); };
    row.append(b, el('span', 'val', c));
    box.appendChild(row);
  });
  if (!comments.length) box.appendChild(el('div', 'cell static sub', 'Listen er tom'));
}
