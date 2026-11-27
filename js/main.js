// Buttons and fields, top bar, start-up and update check. Loaded last.
// All files share one scope; they load in the order listed in index.html.

// ---------- Wire up ----------
['address', 'project', 'date', 'hours'].forEach(k => {
  const input = $('f' + k[0].toUpperCase() + k.slice(1));
  input.addEventListener('input', () => {
    job[k] = input.value; saveJob(); renderSubject(); if (topShown) renderTopbar();
    if (k === 'address') renderRecent();
    renderNewJob();
    $('jobDoneBox').classList.toggle('hidden', !(job.address.trim() && job.project.trim()));
  });
});
$('btnCamera').onclick = () => $('inCamera').click();
$('btnBurst').onclick = openCam;
$('btnLibrary').onclick = () => $('inLibrary').click();
$('inCamera').onchange = e => { addFiles([...e.target.files], true); e.target.value = ''; };
$('inLibrary').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
$('btnSend').onclick = send;
$('fRecentSearch').addEventListener('input', renderRecent);
$('btnEditJob').onclick = $('btnEditJobText').onclick = () => { editingJob = true; renderJobView(); $('fAddress').focus(); };
$('btnJobDone').onclick = () => { editingJob = false; document.activeElement.blur(); renderJobView(); };
$('viewer').onclick = () => { $('viewer').classList.add('hidden'); $('viewerImg').src = ''; };
$('btnCopyEmail').onclick = () => copyText(office);
$('btnCopySubject').onclick = () => copyText(subject());
$('btnNewJob').onclick = $('btnNewJobTop').onclick = async () => {
  const unsent = !job.sent && hasContent();
  const v = await ask({
    title: unsent ? 'Denne jobben er ikke sendt' : 'Starte en ny jobb?',
    message: unsent ? 'Bilder og tekst i appen slettes. Bildene i Bilder-appen blir ikke slettet.'
                    : 'Jobben tømmes. Bildene i Bilder-appen blir ikke slettet.',
    warn: unsent,
    actions: [{ label: unsent ? 'Slett jobben likevel' : 'Ny jobb', value: 'new', destructive: true }]
  });
  if (v === 'new') resetJob();
};
$('btnSettings').onclick = () => showSettings(true);
$('btnCloseSettings').onclick = () => showSettings(false);
$('sheetDim').onclick = () => showSettings(false);
$('fOffice').oninput = e => { office = e.target.value.trim(); ls.set('office', office); $('btnCopyEmail').classList.toggle('hidden', !office); };
$('btnAddComment').onclick = () => {
  const v = $('fNewComment').value.trim();
  if (!v) return;
  if (!comments.includes(v)) comments.push(v);
  ls.set('comments', comments);
  $('fNewComment').value = '';
  renderCommentList();
};
$('fNewComment').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnAddComment').click(); });
$('btnResetComments').onclick = async () => {
  const v = await ask({ message: 'Listen settes tilbake til standardordene. Ord du har lagt til selv, blir fjernet.',
    actions: [{ label: 'Tilbakestill', value: 'reset', destructive: true }] });
  if (v !== 'reset') return;
  comments = DEFAULT_COMMENTS.slice(); ls.set('comments', comments); renderCommentList();
};

// ---------- Top bar ----------
function renderTopbar() {
  const t = $('topbarText'), a = job.address.trim(), pr = job.project.trim();
  t.textContent = a || 'Byggfoto';
  if (pr) { const sm = el('small', '', `  ·  ${pr}`); t.appendChild(sm); }
}
let topShown = false;
window.addEventListener('scroll', () => {
  const show = window.scrollY > 70;
  if (show === topShown) return;
  topShown = show;
  if (show) renderTopbar();
  $('topbar').classList.toggle('show', show);
}, { passive: true });
$('topbar').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

// ---------- Start ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------- Updates ----------
// Home screen apps resume instead of reloading, so check for a new version on every open.
$('appVersion').textContent = `Versjon ${APP_VERSION}`;
let lastCheck = 0;
async function checkForUpdate() {
  if (Date.now() - lastCheck < 30000) return;
  lastCheck = Date.now();
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const { version } = await r.json();
    if (version && version !== APP_VERSION) $('updateBar').classList.remove('hidden');
  } catch {} // offline: keep using this version
}
$('updateBar').onclick = async () => {
  $('updateBar').textContent = 'Oppdaterer …';
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg) await reg.update();
  } catch {}
  location.reload();
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
window.addEventListener('pageshow', checkForUpdate);
window.addEventListener('focus', checkForUpdate);
checkForUpdate();
(async () => {
  renderJobFields(); renderOffice();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  try {
    const kept = [];
    for (const p of job.photos) {
      const b = await getBlob(p.id);
      if (b) { blobs.set(p.id, b); kept.push(p); }
    }
    if (kept.length !== job.photos.length) { job.photos = kept; ls.set('job', job); }
  } catch (e) { hud('Kunne ikke laste lagrede bilder'); }
  renderPhotos();
})();
