// New job, copying text, and the settings sheet with its pages.
// All files share one scope; they load in the order listed in index.html.

// ---------- Misc ----------
async function copyText(text) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    // Older fallback without a Safari pop-up.
    const t = el('textarea'); t.value = text; t.setAttribute('readonly', '');
    t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t);
    t.select(); t.setSelectionRange(0, text.length);
    try { ok = document.execCommand('copy'); } catch {}
    t.remove();
  }
  hud(ok ? 'Kopiert' : 'Kunne ikke kopiere', ok);
}
const renderSubject = () => { $('subjectPreview').textContent = subject(); };

function showSettings(on) {
  const sh = $('settings'), dim = $('sheetDim');
  if (on) {
    renderCommentList(); renderHistory(); renderMenu();
    showPage('setMain');
    sh.classList.remove('hidden'); dim.classList.remove('hidden');
    document.body.classList.add('locked');
    requestAnimationFrame(() => requestAnimationFrame(() => { sh.classList.add('show'); dim.classList.add('show'); }));
  } else {
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    sh.classList.remove('show'); dim.classList.remove('show');
    document.body.classList.remove('locked');
    setTimeout(() => { sh.classList.add('hidden'); dim.classList.add('hidden'); }, 350);
    renderOffice(); sortComments(); renderPhotos();
  }
}

// ---------- History ----------
function renderHistory() {
  const box = $('historyList');
  box.innerHTML = '';
  $('histClearBox').classList.toggle('hidden', !sentJobs.length);
  if (!sentJobs.length) { box.appendChild(el('div', 'cell static sub', 'Ingen sendte jobber ennå')); return; }
  sentJobs.forEach(h => {
    const b = el('button', 'cell');
    const two = el('span', 'two');
    two.appendChild(el('b', '', h.address || '(uten adresse)'));
    const meta = [];
    if (h.project) meta.push(`Prosjekt ${h.project}`);
    meta.push(fmtDate(h.date));
    meta.push(`${h.count} ${h.count === 1 ? 'bilde' : 'bilder'}`);
    if (num(h.hours) != null) meta.push(`${fmtNum(num(h.hours))} t`);
    two.appendChild(el('span', 'sub', meta.join(' · ')));
    b.appendChild(two);
    b.insertAdjacentHTML('beforeend', ICON_CHEV);
    b.onclick = () => {
      openHist = h;
      $('histText').textContent = h.text;
      showPage('histDetail');
    };
    box.appendChild(b);
  });
}

// ---------- Settings pages ----------
const PAGE_TITLES = { setMain: 'Innstillinger', pageOffice: 'Kontorets e-post', pageWords: 'Ferdige kommentarer', pageHistory: 'Historikk', histDetail: 'Sendt jobb' };
function showPage(id) {
  document.querySelectorAll('#settings .spage').forEach(pg => pg.classList.toggle('hidden', pg.id !== id));
  $('setTitle').textContent = PAGE_TITLES[id];
  $(id).scrollTop = 0;
  if (id === 'setMain') renderMenu();
}
function renderMenu() {
  $('menuOffice').textContent = office || 'Ikke satt';
  $('menuWords').textContent = `${comments.length} ord`;
  $('menuHistory').textContent = sentJobs.length ? `${sentJobs.length} ${sentJobs.length === 1 ? 'sendt jobb' : 'sendte jobber'}` : 'Ingen ennå';
}
document.querySelectorAll('#settings [data-page]').forEach(b => b.onclick = () => showPage(b.dataset.page));
document.querySelectorAll('#settings [data-back]').forEach(b => b.onclick = () => showPage(b.dataset.back));
$('histCopy').onclick = () => copyText($('histText').textContent);
let openHist = null;
$('histDelete').onclick = async () => {
  const v = await ask({ message: 'Jobben slettes fra historikken på telefonen. E-posten som er sendt blir ikke påvirket.',
    actions: [{ label: 'Slett fra historikk', value: 1, destructive: true }] });
  if (!v) return;
  sentJobs = sentJobs.filter(h => h !== openHist); ls.set('history', sentJobs);
  openHist = null;
  renderHistory(); showPage('pageHistory');
  hud('Slettet', true);
};
$('histClear').onclick = async () => {
  const v = await ask({ title: 'Slette hele historikken?', message: `${sentJobs.length} ${sentJobs.length === 1 ? 'jobb' : 'jobber'} slettes fra telefonen. E-poster som er sendt blir ikke påvirket.`,
    actions: [{ label: 'Slett hele historikken', value: 1, destructive: true }] });
  if (!v) return;
  sentJobs = []; ls.set('history', sentJobs);
  renderHistory();
  hud('Historikken er slettet', true);
};
$('btnEditRecent').onclick = () => { editRecent = !editRecent; renderRecent(); };

// ---------- New job ----------
async function resetJob() {
  await clearBlobs();
  blobs.clear(); cache.clear();
  urls.forEach(u => URL.revokeObjectURL(u)); urls.clear();
  job = newJob(); saveJob();
  moreOpen.clear(); allWords.clear(); editingJob = false;
  renderJobFields(); renderPhotos();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
