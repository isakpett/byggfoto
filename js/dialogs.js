// The app's own dialogs and the small "Kopiert" box, instead of Safari pop-ups.
// All files share one scope; they load in the order listed in index.html.

// ---------- Dialogs (replace Safari pop-ups) ----------
// ask({ title, message, warn, style: 'sheet'|'alert', actions: [{ label, value, destructive, bold }] })
// Resolves with the chosen value, or null when cancelled.
function ask({ title, message, warn, style = 'sheet', actions }) {
  return new Promise(resolve => {
    const host = $('dlg'), dim = $('dlgDim');
    let box;
    const close = v => {
      box.classList.remove('show'); box.classList.add('closing');
      if (!host.querySelector(':scope > :not(.closing)')) dim.classList.remove('show');
      setTimeout(() => {
        box.remove();
        if (!host.children.length) dim.classList.add('hidden');
      }, 250);
      resolve(v);
    };
    const head = el('div', 'msg' + (warn ? ' warn' : ''));
    if (title) head.appendChild(el('b', '', title));
    if (message) head.appendChild(el('span', '', message));

    if (style === 'alert') {
      box = el('div', 'alert');
      box.setAttribute('role', 'alertdialog');
      box.appendChild(head);
      actions.forEach(a => {
        const b = el('button', a.bold ? 'bold' : '', a.label);
        if (a.destructive) b.style.color = 'var(--danger)';
        b.onclick = () => close(a.value);
        box.appendChild(b);
      });
      dim.onclick = null;
    } else {
      box = el('div', 'asheet');
      box.setAttribute('role', 'dialog');
      const inner = el('div');
      const grp = el('div', 'grp');
      if (title || message) grp.appendChild(head);
      actions.forEach((a, i) => {
        const b = el('button', a.destructive ? 'destructive' : '', a.label);
        if (!title && !message && i === 0) b.style.borderTop = '0';
        b.onclick = () => close(a.value);
        grp.appendChild(b);
      });
      const cg = el('div', 'grp cancel');
      const cb = el('button', '', 'Avbryt');
      cb.onclick = () => close(null);
      cg.appendChild(cb);
      inner.append(grp, cg);
      box.appendChild(inner);
      dim.onclick = () => close(null);
    }
    host.appendChild(box);
    dim.classList.remove('hidden');
    requestAnimationFrame(() => requestAnimationFrame(() => { dim.classList.add('show'); box.classList.add('show'); }));
  });
}

let hudTimer;
function hud(msg, ok) {
  const h = $('hud');
  h.innerHTML = (ok ? ICON_CHECK : '');
  h.appendChild(el('span', '', msg));
  h.classList.add('show');
  clearTimeout(hudTimer); hudTimer = setTimeout(() => h.classList.remove('show'), ok ? 1300 : 2600);
}
