// Drawing on a photo.
// All files share one scope; they load in the order listed in index.html.

// ---------- Drawing ----------
let ed = null; // { p, img, strokes, cur }
async function openEditor(p) {
  const img = await loadImage(blobs.get(p.id));
  const c = $('edCanvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  ed = { p, img, strokes: [], cur: null };
  redraw();
  $('editor').classList.remove('hidden');
  document.body.classList.add('locked');
  updateEdButtons();
}
function lineW() { const c = $('edCanvas'); return Math.max(4, Math.round(Math.max(c.width, c.height) * 0.008)); }
function styleCtx(ctx) { ctx.strokeStyle = '#ff2d20'; ctx.lineWidth = lineW(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
function redraw() {
  const c = $('edCanvas'), ctx = c.getContext('2d');
  ctx.drawImage(ed.img, 0, 0);
  styleCtx(ctx);
  ed.strokes.forEach(st => {
    ctx.beginPath(); ctx.moveTo(st[0].x, st[0].y);
    if (st.length === 1) ctx.lineTo(st[0].x + 0.1, st[0].y);
    st.forEach(pt => ctx.lineTo(pt.x, pt.y));
    ctx.stroke();
  });
}
function updateEdButtons() { $('edUndo').disabled = $('edClear').disabled = !ed.strokes.length; }
function closeEditor() {
  $('editor').classList.add('hidden');
  document.body.classList.remove('locked');
  ed = null;
}
function canvasPt(e) {
  const c = $('edCanvas'), r = c.getBoundingClientRect();
  return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height };
}
{
  const c = $('edCanvas');
  c.addEventListener('pointerdown', e => {
    if (!ed) return;
    c.setPointerCapture(e.pointerId);
    ed.cur = [canvasPt(e)]; ed.strokes.push(ed.cur);
    const ctx = c.getContext('2d'); styleCtx(ctx);
    ctx.beginPath(); ctx.moveTo(ed.cur[0].x, ed.cur[0].y); ctx.lineTo(ed.cur[0].x + 0.1, ed.cur[0].y); ctx.stroke();
    updateEdButtons();
  });
  c.addEventListener('pointermove', e => {
    if (!ed || !ed.cur) return;
    const pt = canvasPt(e), prev = ed.cur[ed.cur.length - 1];
    ed.cur.push(pt);
    const ctx = c.getContext('2d'); styleCtx(ctx);
    ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(pt.x, pt.y); ctx.stroke();
  });
  const end = () => { if (ed) ed.cur = null; };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
}
$('edUndo').onclick = () => { ed.strokes.pop(); redraw(); updateEdButtons(); };
$('edClear').onclick = () => { ed.strokes = []; redraw(); updateEdButtons(); };
$('edCancel').onclick = closeEditor;
$('edDone').onclick = async () => {
  const { p, strokes } = ed;
  if (!strokes.length) { closeEditor(); return; }
  redraw();
  const blob = await new Promise(res => $('edCanvas').toBlob(res, 'image/jpeg', 0.85));
  if (!p.drawn) await putBlob(p.id + '_o', blobs.get(p.id));   // keep the clean photo
  await putBlob(p.id, blob);
  setPhotoBlob(p, blob);
  p.drawn = true; p.ver = (p.ver || 0) + 1; saveJob();
  closeEditor();
  renderPhotos();
};
function setPhotoBlob(p, blob) {
  blobs.set(p.id, blob);
  if (urls.has(p.id)) { URL.revokeObjectURL(urls.get(p.id)); urls.delete(p.id); }
}
async function removeDrawing(p) {
  const v = await ask({ message: 'Tegningen fjernes, og bildet blir som det var.',
    actions: [{ label: 'Fjern tegning', value: 1, destructive: true }] });
  if (!v) return;
  const orig = await getBlob(p.id + '_o');
  if (orig) { await putBlob(p.id, orig); await delBlob(p.id + '_o'); setPhotoBlob(p, orig); }
  p.drawn = false; p.ver = (p.ver || 0) + 1; saveJob();
  renderPhotos();
}
