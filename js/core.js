// Shared helpers, photo storage (IndexedDB) and app state.
// All files share one scope; they load in the order listed in index.html.

// Bump this and version.json together on every change, so phones see the update.
const APP_VERSION = '2026.11.26-4';
const DEFAULT_COMMENTS = [
  'Kubbing', 'Underlag', 'Gulv', 'Kjøkken', 'Staving', 'Retting',
  'Isolering', 'Spikerslag', 'Himling', 'Veggplater', 'Gips',
  'Riving', 'Lekter', 'Vindsperre', 'Kledning', 'Dampsperre',
  'Tildekking', 'Dører og vinduer', 'Opprydding', 'Søppel'
];
// The first version had only these. Used to add new defaults to saved lists once.
const FIRST_DEFAULTS = DEFAULT_COMMENTS.slice(0, 11);
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.72;

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const ICON_TRASH = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
const ICON_PEN = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const ICON_CHEV = '<svg class="chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

// ---------- IndexedDB for photo blobs ----------
let dbp;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('byggfoto', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function idb(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const tx = d.transaction('photos', mode);
    const out = fn(tx.objectStore('photos'));
    tx.oncomplete = () => res(out && out.result);
    tx.onerror = () => rej(tx.error);
  });
}
const putBlob = (id, blob) => idb('readwrite', s => s.put(blob, id));
const getBlob = id => idb('readonly', s => s.get(id));
const delBlob = id => idb('readwrite', s => s.delete(id));
const clearBlobs = () => idb('readwrite', s => s.clear());

// ---------- State ----------
const today = () => new Date().toISOString().slice(0, 10);
let job = ls.get('job', null) || newJob();
let comments = ls.get('comments', DEFAULT_COMMENTS.slice());
{
  // Add defaults the user has not seen before. Keep the user's own edits.
  const known = ls.get('knownDefaults', FIRST_DEFAULTS);
  DEFAULT_COMMENTS.forEach(c => { if (!known.includes(c) && !comments.includes(c)) comments.push(c); });
  ls.set('comments', comments);
  ls.set('knownDefaults', DEFAULT_COMMENTS);
}
let office = ls.get('office', '');
let recent = ls.get('recent', []);        // [{address, project}], newest first
let usage = ls.get('usage', {});          // comment -> times tapped
let order = [];                           // comments sorted by use, refreshed at set times
function sortComments() {
  order = comments.slice().sort((a, b) => (usage[b] || 0) - (usage[a] || 0));
}
sortComments();
const blobs = new Map();   // id -> Blob
const urls = new Map();    // id -> object URL
const moreOpen = new Set(); // photo ids where "Mer" was pressed
const allWords = new Set(); // photo ids where "Vis alle ord" was pressed
const TOP_WORDS = 8;
const cache = new Map();    // id -> { key, blob } final photo for the email (with stamp)
let editingJob = false;
let sentJobs = ls.get('history', []);      // sent jobs, newest first, no photos

function newJob() { return { address: '', project: '', date: today(), hours: '', photos: [] }; }
// Any change makes the job "not sent" again.
const saveJob = () => {
  const was = job.sent; job.sent = false; ls.set('job', job); schedulePrepare();
  if (was) $('sumSent').classList.add('hidden');
};
const hasContent = () => job.photos.length || job.address.trim() || job.project.trim() || String(job.hours).trim();
