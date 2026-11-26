// The camera inside the app.
// All files share one scope; they load in the order listed in index.html.

// ---------- In-app camera ----------
let camStream = null, camAdded = 0;
async function openCam() {
  camAdded = 0;
  $('camCount').textContent = '0 bilder';
  $('camThumb').classList.add('none');
  $('camErr').classList.add('hidden');
  $('cam').classList.remove('hidden');
  document.body.classList.add('locked');
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no camera api');
    camStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } }
    });
    const v = $('camVideo');
    v.srcObject = camStream;
    await v.play().catch(() => {});
  } catch (e) {
    $('camErr').classList.remove('hidden');
  }
}
function closeCam() {
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  $('camVideo').srcObject = null;
  $('cam').classList.add('hidden');
  document.body.classList.remove('locked');
  if (camAdded) afterAdd();
}
async function snap() {
  const v = $('camVideo');
  if (!camStream || !v.videoWidth) return;
  const f = $('camFlash'); f.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
  const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(v, 0, 0, w, h);
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', JPEG_QUALITY));
  await addBlob(blob, nowLocal());
  camAdded++;
  $('camCount').textContent = `${camAdded} ${camAdded === 1 ? 'bilde' : 'bilder'}`;
  const t = $('camThumb'); t.src = urlFor(job.photos[job.photos.length - 1].id); t.classList.remove('none');
}
$('camShutter').onclick = snap;
$('camDone').onclick = closeCam;
$('camErrClose').onclick = closeCam;
// Backup: the normal iPhone camera. Must open in the same tap.
$('camNative').onclick = $('camErrNative').onclick = () => { $('inCamera').click(); closeCam(); };
