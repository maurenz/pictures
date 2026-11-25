/* Foto-Portfolio · Verwaltung */
import { geoOrthographic, geoPath } from 'd3-geo';
import { feature, merge } from 'topojson-client';
import { exifLesen } from './exif.js';

const MON = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const TYP_NAME = { ort: 'Ort', region: 'Region', land: 'Land' };
const STATUS_NAME = { entwurf: 'Entwurf', link: 'Mit Link', online: 'Online' };
const ZIEL = 4096; // längste Kante beim Hochladen (Server erzeugt daraus Zoom- und Anzeigestufen)

const S = 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICON = {
  links: `<svg width="22" height="22" viewBox="0 0 24 24" ${S}><path d="M15 5l-7 7 7 7"/></svg>`,
  stern: `<svg width="18" height="18" viewBox="0 0 24 24" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/></svg>`,
  griff: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>`,
  zu: `<svg width="16" height="16" viewBox="0 0 24 24" ${S}><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>`,
};

/* ---------- Hilfen ---------- */

function h(tag, attrs = {}, ...kinder) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'icon') el.innerHTML = ICON[v];
    else if (k === 'style') Object.assign(el.style, v);
    else if (k === 'value') el.value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kind of kinder.flat()) if (kind !== null && kind !== undefined && kind !== false) el.append(kind);
  return el;
}
const pad = (n, l) => String(n).padStart(l, '0');
const $app = () => document.getElementById('app');
let CSRF = '';
let STAND = { alben: [], einstellungen: {} };
let ungespeichert = false;
let sofortSpeichern = null;
const nummerText = nr => { const n = STAND.nummern && STAND.nummern[nr]; return n ? pad(n, 2) : '–'; };

class ApiFehler extends Error {
  constructor(text, code) { super(text); this.code = code; }
}

async function api(aktion, { daten, methode, query } = {}) {
  const url = `api.php?aktion=${aktion}${query ? `&${new URLSearchParams(query)}` : ''}`;
  const opt = { method: methode || (daten ? 'POST' : 'GET'), headers: { 'X-CSRF': CSRF }, credentials: 'same-origin', cache: 'no-store' };
  if (daten) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(daten); }
  let r;
  try { r = await fetch(url, opt); } catch { throw new ApiFehler('Keine Verbindung zum Server.', 0); }
  let j = null;
  try { j = await r.json(); } catch { /* leer */ }
  if (!r.ok || !j || !j.ok) {
    if (r.status === 401) { setTimeout(start, 50); }
    throw new ApiFehler((j && j.fehler) || `Fehler ${r.status}`, r.status);
  }
  return j;
}

function hochladenEinmal(nr, blob, exif, kennung, fortschritt) {
  return new Promise((ok, nein) => {
    const fd = new FormData();
    fd.append('nr', nr);
    fd.append('exif', JSON.stringify(exif));
    fd.append('kennung', JSON.stringify(kennung));
    fd.append('bild', blob, 'bild.jpg');
    const x = new XMLHttpRequest();
    x.open('POST', 'api.php?aktion=foto_hochladen');
    x.setRequestHeader('X-CSRF', CSRF);
    x.upload.onprogress = e => { if (e.lengthComputable) fortschritt(e.loaded / e.total); };
    x.onload = () => {
      let j = null;
      try { j = JSON.parse(x.responseText); } catch { /* leer */ }
      if (x.status === 200 && j && j.ok) ok(j.foto);
      else nein(new Error((j && j.fehler) || `Fehler ${x.status}`));
    };
    x.onerror = () => { const f = new Error('Verbindung unterbrochen.'); f.netz = true; nein(f); };
    x.ontimeout = x.onerror;
    x.timeout = 120000;
    x.send(fd);
  });
}

async function hochladen(nr, blob, exif, kennung, fortschritt) {
  try {
    return await hochladenEinmal(nr, blob, exif, kennung, fortschritt);
  } catch (err) {
    if (!err.netz) throw err;
    // bei Verbindungsabbruch einmal automatisch neu versuchen
    await new Promise(r => setTimeout(r, 1500));
    return hochladenEinmal(nr, blob, exif, kennung, fortschritt);
  }
}

/* Kennungen eines Fotos: Prüfsumme der Datei und (falls vorhanden) Aufnahmezeit + Kamera + Größe */
async function kennungen(datei, exif, w, h) {
  const liste = [];
  try {
    if (crypto.subtle) {
      const teil = datei.size > 30 * 1024 * 1024 ? datei.slice(0, 8 * 1024 * 1024) : datei;
      const hash = await crypto.subtle.digest('SHA-256', await teil.arrayBuffer());
      liste.push(`sha:${[...new Uint8Array(hash)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('')}:${datei.size}`);
    }
  } catch { /* ohne Prüfsumme */ }
  if (!liste.length) liste.push(`datei:${datei.name}:${datei.size}:${datei.lastModified}`);
  if (exif.datum) liste.push(`exif:${exif.datum}:${exif.subsek || ''}:${exif.kamera || ''}:${Math.max(w, h)}x${Math.min(w, h)}`);
  return liste;
}

let meldungTimer = null;
function meldung(text, art = 'info') {
  let el = document.querySelector('.meldung');
  if (!el) { el = h('div', { class: 'meldung', role: 'status' }); document.body.append(el); }
  el.textContent = text;
  el.className = `meldung an ${art}`;
  clearTimeout(meldungTimer);
  meldungTimer = setTimeout(() => el.classList.remove('an'), art === 'fehler' ? 6000 : 2600);
}

/* ---------- Bild im Browser verkleinern ---------- */

async function dekodieren(datei) {
  if ('createImageBitmap' in window) {
    try { const b = await createImageBitmap(datei, { imageOrientation: 'from-image' }); return { quelle: b, w: b.width, h: b.height }; } catch { /* weiter */ }
  }
  const url = URL.createObjectURL(datei);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { quelle: img, w: img.naturalWidth, h: img.naturalHeight };
  } catch {
    throw new Error('Dieses Bildformat kann der Browser nicht öffnen. Bitte als JPEG exportieren oder Safari verwenden.');
  } finally { setTimeout(() => URL.revokeObjectURL(url), 10000); }
}

async function verkleinern(datei) {
  const d = await dekodieren(datei);
  const f = Math.min(1, ZIEL / Math.max(d.w, d.h));
  const zw = Math.round(d.w * f), zh = Math.round(d.h * f);
  let quelle = d.quelle, qw = d.w, qh = d.h;
  const leinwaende = [];
  // schrittweise halbieren für saubere Verkleinerung großer Originale
  while (qw / 2 >= zw * 1.5) {
    const c = document.createElement('canvas');
    c.width = Math.round(qw / 2); c.height = Math.round(qh / 2);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(quelle, 0, 0, c.width, c.height);
    leinwaende.push(c);
    quelle = c; qw = c.width; qh = c.height;
  }
  const c = document.createElement('canvas');
  c.width = zw; c.height = zh;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(quelle, 0, 0, zw, zh);
  if (d.quelle.close) d.quelle.close();
  const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.88));
  for (const l of [...leinwaende, c]) { l.width = 0; l.height = 0; }
  if (!blob) throw new Error('Bild konnte nicht umgewandelt werden.');
  return { blob, w: d.w, h: d.h };
}

/* ---------- Karte (Vorschau) ---------- */

let WELT = null;
async function welt() {
  if (WELT) return WELT;
  const t = await (await fetch('../assets/geo/laender.json')).json();
  WELT = merge(t, t.objects.countries.geometries);
  return WELT;
}
function karte(ort) {
  const box = h('div', { class: 'karte' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const pfad = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const punkt = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  punkt.setAttribute('r', '6');
  svg.append(pfad, punkt);
  const info = h('span', { class: 'karte-info zahl', text: `${Math.abs(ort.lat).toFixed(2).replace('.', ',')}° ${ort.lat >= 0 ? 'N' : 'S'} · ${Math.abs(ort.lon).toFixed(2).replace('.', ',')}° ${ort.lon >= 0 ? 'O' : 'W'} · ${TYP_NAME[ort.typ] || 'Ort'}` });
  box.append(svg, info);
  welt().then(land => {
    const w = box.clientWidth || 340, hh = box.clientHeight || 170;
    svg.setAttribute('viewBox', `0 0 ${w} ${hh}`);
    const k = { land: 1.6, region: 5, ort: 9 }[ort.typ] || 9;
    const p = geoOrthographic().rotate([-ort.lon, -ort.lat]).scale(w * k / 2).translate([w / 2, hh / 2]).clipAngle(90).clipExtent([[-5, -5], [w + 5, hh + 5]]);
    pfad.setAttribute('d', geoPath(p)(land) || '');
    punkt.setAttribute('cx', w / 2);
    punkt.setAttribute('cy', hh / 2);
  }).catch(() => { /* ohne Karte */ });
  return box;
}

/* ---------- Ansichten ---------- */

function seite(...inhalt) {
  $app().replaceChildren(...inhalt);
  window.scrollTo(0, 0);
}

function feld(label, eingabe, zusatz) {
  const id = `f${Math.random().toString(36).slice(2, 8)}`;
  eingabe.id = id;
  return h('div', { class: 'feld' }, h('label', { for: id }, label, zusatz ? h('span', { class: 'zusatz', text: zusatz }) : null), eingabe);
}

function knopf(text, onclick, klasse = 'knopf') {
  return h('button', { type: 'button', class: klasse, text, onclick });
}

function einrichtenAnsicht() {
  const code = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
  const pw = h('input', { type: 'password', autocomplete: 'new-password', minlength: '10' });
  const pw2 = h('input', { type: 'password', autocomplete: 'new-password' });
  const los = async e => {
    e.preventDefault();
    if (pw.value !== pw2.value) { meldung('Die Passwörter stimmen nicht überein.', 'fehler'); return; }
    try {
      const r = await api('einrichten', { daten: { code: code.value, passwort: pw.value } });
      CSRF = r.csrf;
      meldung('Verwaltung eingerichtet.');
      location.hash = '#/';
      start();
    } catch (err) { meldung(err.message, 'fehler'); }
  };
  seite(h('form', { class: 'login', onsubmit: los },
    h('p', { class: 'kicker', text: 'Verwaltung' }),
    h('h1', { text: 'Einrichten' }),
    h('p', { class: 'hinweis', text: 'Den Einrichtungscode findest du in der Datei EINRICHTUNGSCODE.txt im heruntergeladenen Paket. Wähle danach ein Passwort mit mindestens 10 Zeichen.' }),
    feld('Einrichtungscode', code),
    feld('Neues Passwort', pw),
    feld('Passwort wiederholen', pw2),
    h('button', { type: 'submit', class: 'knopf voll', text: 'Einrichten' })));
  code.focus();
}

function loginAnsicht() {
  const pw = h('input', { type: 'password', autocomplete: 'current-password' });
  const los = async e => {
    e.preventDefault();
    try {
      const r = await api('anmelden', { daten: { passwort: pw.value } });
      CSRF = r.csrf;
      start();
    } catch (err) { meldung(err.message, 'fehler'); pw.select(); }
  };
  seite(h('form', { class: 'login', onsubmit: los },
    h('p', { class: 'kicker', text: 'Verwaltung' }),
    h('h1', { text: 'Anmelden' }),
    feld('Passwort', pw),
    h('button', { type: 'submit', class: 'knopf voll', text: 'Anmelden' })));
  pw.focus();
}

function navigation(aktiv) {
  return h('nav', { class: 'unten', 'aria-label': 'Verwaltung' },
    h('a', { href: '#/', 'aria-current': aktiv === 'alben' ? 'page' : null, text: 'Alben' }),
    h('a', { href: '#/freigaben', 'aria-current': aktiv === 'freigaben' ? 'page' : null, text: 'Freigaben' }),
    h('a', { href: '#/einstellungen', 'aria-current': aktiv === 'einstellungen' ? 'page' : null, text: 'Einstellungen' }),
    h('a', { href: '../', target: '_blank', rel: 'noopener', text: 'Website ↗' }));
}

async function listeAnsicht() {
  try { const d = await api('daten'); STAND = d; } catch { /* mit vorhandenem Stand */ }
  const pos = new Map((STAND.reihenfolge || []).map((nr, i) => [nr, i]));
  const alben = [...STAND.alben].sort((a, b) => (pos.has(a.nr) && pos.has(b.nr) ? pos.get(b.nr) - pos.get(a.nr) : (b.jahr - a.jahr) || (b.monat - a.monat) || (b.nr - a.nr)));
  const liste = h('div', { class: 'liste' });
  if (!alben.length) liste.append(h('p', { class: 'leer', text: 'Noch keine Alben. Lege das erste an.' }));
  for (const a of alben) {
    liste.append(h('a', { class: 'zeile', href: `#/album/${a.nr}` },
      h('span', { class: 'nr zahl', text: nummerText(a.nr) }),
      h('span', { class: 'mitte' },
        h('span', { class: 'titel', text: a.titel }),
        h('span', { class: 'unter zahl', text: `${MON[a.monat - 1]} ${a.jahr} · ${a.fotos.length} ${a.fotos.length === 1 ? 'Foto' : 'Fotos'}${a.ort ? '' : ' · ohne Ort'}` })),
      h('span', { class: `status ${a.status}`, text: statusText(a) })));
  }
  seite(
    h('header', { class: 'kopf' },
      h('p', { class: 'kicker', text: 'Verwaltung' }),
      h('div', { class: 'kopfzeile' }, h('h1', { text: 'Alben' }), h('a', { class: 'knopf', href: '#/album/neu', text: '+ Neues Album' }))),
    liste,
    navigation('alben'));
}

/* Status in der Liste; bei „Mit Link“ auch, in wie vielen Freigaben das Album steckt */
function statusText(a) {
  if (a.status === 'online') return a.fotos.length ? 'Online' : 'Online, ohne Fotos';
  if (a.status === 'link') {
    const n = (STAND.freigaben || []).filter(f => f.aktiv && f.alben.includes(a.nr)).length;
    return n ? `Mit Link · ${n}` : 'Mit Link · noch in keiner Freigabe';
  }
  return 'Entwurf';
}

function albumAnsicht(nr) {
  const vorhanden = nr ? STAND.alben.find(a => a.nr === nr) : null;
  if (nr && !vorhanden) { location.hash = '#/'; return; }
  const jetzt = new Date();
  const a = vorhanden ? structuredClone(vorhanden) : { nr: null, titel: '', ort: null, monat: jetzt.getMonth() + 1, jahr: jetzt.getFullYear(), text: '', status: 'entwurf', fotos: [], titelbild: null };
  ungespeichert = false;
  let timer = null;
  const geaendert = () => {
    ungespeichert = true;
    if (!a.nr) return;
    // bestehendes Album: Änderungen automatisch speichern, sobald die Angaben gültig sind
    clearTimeout(timer);
    const jahrOk = a.jahr >= 1900 && a.jahr <= new Date().getFullYear() + 1;
    if (!a.titel.trim() || !jahrOk) { standEl.textContent = !a.titel.trim() ? 'Titel fehlt' : 'Jahr prüfen'; return; }
    standEl.textContent = 'Speichert …';
    timer = setTimeout(speichern, 700);
  };

  /* Titel */
  const titel = h('input', { type: 'text', maxlength: '80', value: a.titel, oninput: () => { a.titel = titel.value; ueberschrift.textContent = titel.value || 'Neues Album'; geaendert(); } });
  const ueberschrift = h('h1', { text: a.titel || 'Neues Album' });

  /* Ort */
  const ortEingabe = h('input', { type: 'text', autocomplete: 'off', value: a.ort ? a.ort.name : '', placeholder: 'z. B. Kyoto oder Japan', role: 'combobox', 'aria-expanded': 'false', 'aria-autocomplete': 'list' });
  const vorschlaege = h('ul', { class: 'vorschlaege', role: 'listbox', hidden: true });
  const ortAnzeige = h('div', { class: 'ort-anzeige' });
  const ortZeigen = () => {
    ortAnzeige.replaceChildren();
    if (a.ort) {
      ortAnzeige.append(h('p', { class: 'ort-voll', text: a.ort.anzeige || a.ort.name }), karte(a.ort),
        h('button', { type: 'button', class: 'link', text: 'Ort entfernen', onclick: () => { a.ort = null; ortEingabe.value = ''; ortZeigen(); geaendert(); } }));
    }
  };
  let suchTimer = null, suchNr = 0;
  const suchen = async () => {
    const q = ortEingabe.value.trim();
    if (q.length < 2) { vorschlaege.hidden = true; return; }
    const meine = ++suchNr;
    vorschlaege.replaceChildren(h('li', { class: 'laedt', text: 'Suche …' }));
    vorschlaege.hidden = false;
    try {
      const r = await api('ort', { query: { q } });
      if (meine !== suchNr) return;
      vorschlaege.replaceChildren();
      if (!r.treffer.length) vorschlaege.append(h('li', { class: 'laedt', text: 'Kein Treffer' }));
      for (const t of r.treffer) {
        const li = h('li', { role: 'option', tabindex: '0' },
          h('span', { class: 'v-name' }, h('strong', { text: t.name }), t.typ !== 'land' && t.landName ? `, ${t.landName}` : ''),
          h('span', { class: 'v-typ', text: TYP_NAME[t.typ] }));
        const waehlen = () => {
          a.ort = t;
          ortEingabe.value = t.name;
          vorschlaege.hidden = true;
          ortEingabe.setAttribute('aria-expanded', 'false');
          if (!a.titel) { a.titel = t.name; titel.value = t.name; ueberschrift.textContent = t.name; }
          ortZeigen();
          geaendert();
        };
        li.addEventListener('click', waehlen);
        li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); waehlen(); } });
        vorschlaege.append(li);
      }
      ortEingabe.setAttribute('aria-expanded', 'true');
    } catch (err) { vorschlaege.replaceChildren(h('li', { class: 'laedt', text: err.message })); }
  };
  ortEingabe.addEventListener('input', () => { clearTimeout(suchTimer); suchTimer = setTimeout(suchen, 650); });
  ortEingabe.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(suchTimer); suchen(); } });
  ortZeigen();

  /* Datum */
  const monat = h('select', { onchange: () => { a.monat = Number(monat.value); geaendert(); } },
    ...MONATE.map((m, i) => h('option', { value: String(i + 1), text: m, selected: a.monat === i + 1 })));
  const jahr = h('input', { type: 'number', inputmode: 'numeric', min: '1900', max: String(jetzt.getFullYear() + 1), value: String(a.jahr), oninput: () => { a.jahr = Number(jahr.value); geaendert(); } });

  /* Text */
  const text = h('textarea', { rows: '3', maxlength: '1200', placeholder: 'Zwei bis drei Sätze zum Album', oninput: () => { a.text = text.value; geaendert(); } });
  text.value = a.text || '';

  /* Status */
  const statusFeld = h('fieldset', { class: 'segment-feld' }, h('legend', { text: 'Status' }), h('div', { class: 'segment' },
    ...['entwurf', 'link', 'online'].map(s => h('label', { class: a.status === s ? 'an' : '' },
      h('input', { type: 'radio', name: 'status', value: s, checked: a.status === s, onchange: () => {
        a.status = s;
        statusFeld.querySelectorAll('label').forEach(l => l.classList.toggle('an', l.querySelector('input').checked));
        geaendert();
      } }), STATUS_NAME[s]))),
    h('p', { class: 'hinweis', text: 'Mit Link: nur sichtbar für Freigabelinks, die dieses Album enthalten (unter „Freigaben“).' }));

  /* Fotos */
  const raster = h('div', { class: 'raster' });
  const fotoBereich = h('section', { class: 'fotos' });
  const fotosZeichnen = () => {
    raster.replaceChildren();
    a.fotos.forEach((f, k) => raster.append(kachel(f, k)));
    raster.append(uploadKachel());
    fotoKopf.textContent = `Fotos · ${a.fotos.length}`;
  };
  const fotoKopf = h('h2', { class: 'label' });
  const kachel = (f, k) => {
    const istTitel = a.titelbild === f.nr;
    let loeschenBereit = false;
    const loeschen = h('button', { type: 'button', class: 'k-loeschen', 'aria-label': `Foto ${pad(k + 1, 3)} löschen`, icon: 'zu' });
    loeschen.addEventListener('click', async () => {
      if (!loeschenBereit) { loeschenBereit = true; loeschen.classList.add('bereit'); loeschen.textContent = 'Löschen?'; setTimeout(() => { loeschenBereit = false; loeschen.classList.remove('bereit'); loeschen.innerHTML = ICON.zu; }, 3000); return; }
      try {
        const r = await api('foto_loeschen', { daten: { nr: a.nr, foto: f.nr } });
        a.fotos = r.album.fotos; a.titelbild = r.album.titelbild;
        syncStand(r.album);
        fotosZeichnen();
        meldung('Foto gelöscht.');
      } catch (err) { meldung(err.message, 'fehler'); }
    });
    return h('div', { class: 'kachel', 'data-nr': f.nr },
      h('img', { src: `../media/${a.nr}/${pad(f.nr, 3)}-400.${f.ext}`, alt: '', loading: 'lazy', draggable: 'false' }),
      h('span', { class: 'k-nr zahl', text: pad(k + 1, 3) }),
      h('span', { class: 'k-griff', 'aria-hidden': 'true', icon: 'griff' }),
      loeschen);
  };
  const vorhandenAlbum = () => STAND.alben.find(x => x.nr === a.nr) || a;
  const uploadKachel = () => {
    const eingabe = h('input', { type: 'file', accept: 'image/*,.heic,.heif', multiple: true, class: 'unsichtbar' });
    eingabe.addEventListener('change', () => { warteschlange([...eingabe.files]); eingabe.value = ''; });
    return h('label', { class: 'kachel upload' }, eingabe, h('span', { class: 'plus', text: '+' }), h('span', { text: 'Fotos hinzufügen' }));
  };
  let laeuft = false;
  const schlange = [];
  const bekannt = () => new Set(a.fotos.flatMap(f => f.kennung || []));
  const warteschlange = dateien => {
    if (!a.nr) { meldung('Bitte das Album zuerst speichern.', 'fehler'); return; }
    for (const d of dateien) einreihen(d);
    abarbeiten();
  };
  const einreihen = (d, alterPlatz) => {
    const fortschritt = h('span', { class: 'balken' }, h('i'));
    const status = h('span', { class: 'k-status', text: 'Wartet …' });
    const platz = h('div', { class: 'kachel laedt' }, status, fortschritt);
    if (alterPlatz) alterPlatz.replaceWith(platz);
    else raster.insertBefore(platz, raster.lastElementChild);
    schlange.push({ d, platz, status, fortschritt });
  };
  const fehlerKachel = (eintrag, text) => {
    const { d, platz, status } = eintrag;
    status.textContent = text;
    platz.classList.add('fehler');
    platz.append(h('span', { class: 'k-aktionen' },
      h('button', { type: 'button', class: 'k-knopf', text: 'Erneut', onclick: () => { einreihen(d, platz); abarbeiten(); } }),
      h('button', { type: 'button', class: 'k-knopf', text: 'Löschen', onclick: () => platz.remove() })));
  };
  const abarbeiten = async () => {
    if (laeuft) return;
    laeuft = true;
    let fertig = 0, uebersprungen = 0, fehlgeschlagen = 0;
    const inDiesemLauf = new Set();
    while (schlange.length) {
      const eintrag = schlange.shift();
      const { d, platz, status, fortschritt } = eintrag;
      try {
        status.textContent = 'Vorbereiten …';
        const exif = await exifLesen(d);
        status.textContent = 'Verkleinern …';
        const { blob, w, h: hoehe } = await verkleinern(d);
        const kennung = await kennungen(d, exif, w, hoehe);
        const schon = bekannt();
        if (kennung.some(k => schon.has(k) || inDiesemLauf.has(k))) {
          // bereits hochgeladen: still aussortieren
          platz.remove();
          uebersprungen++;
          continue;
        }
        kennung.forEach(k => inDiesemLauf.add(k));
        status.textContent = 'Lädt …';
        const foto = await hochladen(a.nr, blob, exif, kennung, p => { fortschritt.firstChild.style.width = `${Math.round(p * 100)}%`; status.textContent = `Lädt … ${Math.round(p * 100)} %`; });
        a.fotos.push(foto);
        if (!a.titelbild) a.titelbild = foto.nr;
        syncStand({ ...vorhandenAlbum(), fotos: a.fotos, titelbild: a.titelbild, naechstesFoto: foto.nr + 1 });
        platz.replaceWith(kachel(foto, a.fotos.length - 1));
        fotoKopf.textContent = `Fotos · ${a.fotos.length}`;
        vorschauKnopf.disabled = false;
        fertig++;
      } catch (err) {
        fehlgeschlagen++;
        fehlerKachel(eintrag, err.message || 'Fehler beim Hochladen');
      }
    }
    laeuft = false;
    if (fehlgeschlagen) meldung(`${fertig} hochgeladen, ${fehlgeschlagen} fehlgeschlagen. „Erneut“ antippen zum Wiederholen.`, 'fehler');
    else if (fertig || uebersprungen) meldung('Upload abgeschlossen.');
  };
  sortierbar(raster, async ordnung => {
    const vorher = a.fotos.map(f => f.nr).join();
    if (ordnung.join() === vorher) return;
    try {
      const r = await api('reihenfolge', { daten: { nr: a.nr, fotos: ordnung } });
      a.fotos = r.album.fotos;
      syncStand(r.album);
      fotosZeichnen();
      meldung('Reihenfolge gespeichert, Nummern angepasst.');
    } catch (err) { meldung(err.message, 'fehler'); fotosZeichnen(); }
  });
  // Dateien auch per Ziehen ablegen (Desktop)
  fotoBereich.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); fotoBereich.classList.add('ablage'); } });
  fotoBereich.addEventListener('dragleave', () => fotoBereich.classList.remove('ablage'));
  fotoBereich.addEventListener('drop', e => { e.preventDefault(); fotoBereich.classList.remove('ablage'); warteschlange([...e.dataTransfer.files]); });

  fotoBereich.append(
    h('div', { class: 'foto-kopf' }, fotoKopf),
    a.nr ? null : h('p', { class: 'hinweis', text: 'Bilder können nach dem Erstellen hinzugefügt werden.' }),
    raster);
  if (a.nr) fotosZeichnen(); else fotoKopf.textContent = 'Fotos';

  /* Speichern */
  const standEl = h('span', { class: 'album-nr zahl' });
  const standZeigen = () => { standEl.textContent = a.nr ? `Album ${nummerText(a.nr)} · Gespeichert` : 'Neu'; };
  standZeigen();
  const speichern = async () => {
    clearTimeout(timer);
    try {
      const r = await api('album_speichern', { daten: { nr: a.nr, titel: a.titel, ort: a.ort, monat: a.monat, jahr: a.jahr, text: a.text, status: a.status } });
      const neu = !a.nr;
      const warOnline = vorhanden && vorhanden.status === 'online';
      syncStand(r.album);
      ungespeichert = false;
      if (a.ort && !a.ort.regionen) regionenNachtragen();
      if (neu) { meldung('Album erstellt.'); location.hash = `#/album/${r.album.nr}`; return true; }
      try { STAND.nummern = (await api('daten')).nummern; } catch { /* egal */ }
      standZeigen();
      if (r.album.status === 'online' && !warOnline && !r.album.fotos.length) meldung('Hinweis: Ohne Fotos erscheint das Album nicht auf der Website.');
      return true;
    } catch (err) { standEl.textContent = 'Nicht gespeichert'; meldung(err.message, 'fehler'); return false; }
  };
  sofortSpeichern = () => { if (ungespeichert && a.nr) speichern(); };
  const erstellenKnopf = h('button', { type: 'button', class: 'knopf voll', text: 'Erstellen', onclick: speichern });

  /* Vorschau: zeigt das Album wie auf der Website (auch Entwürfe) */
  const vorschauKnopf = h('button', { type: 'button', class: 'knopf voll', text: 'Vorschau', disabled: !a.nr || !a.fotos.length });
  vorschauKnopf.addEventListener('click', async () => {
    if (ungespeichert && !(await speichern())) return;
    // im selben Fenster: der Zurück-Pfeil der Vorschau führt wieder hierher
    location.href = `../#/vorschau/${a.nr}`;
  });

  /* Löschen */
  let loeschBereit = false;
  const loeschKnopf = vorhanden ? h('button', { type: 'button', class: 'link gefahr', text: 'Album löschen' }) : null;
  if (loeschKnopf) loeschKnopf.addEventListener('click', async () => {
    if (!loeschBereit) { loeschBereit = true; loeschKnopf.textContent = `Album ${pad(a.nr, 2)} mit ${a.fotos.length} Fotos endgültig löschen?`; setTimeout(() => { loeschBereit = false; loeschKnopf.textContent = 'Album löschen'; }, 4000); return; }
    try {
      await api('album_loeschen', { daten: { nr: a.nr } });
      STAND.alben = STAND.alben.filter(x => x.nr !== a.nr);
      ungespeichert = false;
      meldung('Album gelöscht.');
      location.hash = '#/';
    } catch (err) { meldung(err.message, 'fehler'); }
  });

  seite(
    h('header', { class: 'kopf schmal' },
      h('a', { class: 'zurueck', href: '#/' }, h('span', { icon: 'links' }), h('span', { text: 'Alben' })),
      standEl),
    h('form', { class: 'formular', onsubmit: e => e.preventDefault() },
      ueberschrift,
      feld('Titel', titel),
      h('div', { class: 'feld ort' }, h('label', { for: 'ortfeld', text: 'Ort' }), ortEingabe, vorschlaege, ortAnzeige),
      h('div', { class: 'zwei' }, feld('Monat', monat), feld('Jahr', jahr)),
      feld('Kurztext', text, 'optional'),
      statusFeld,
      fotoBereich,
      loeschKnopf),
    h('div', { class: 'leiste' }, a.nr ? vorschauKnopf : erstellenKnopf));
  ortEingabe.id = 'ortfeld';
  if (!vorhanden) titel.focus();
}

function syncStand(album) {
  const i = STAND.alben.findIndex(x => x.nr === album.nr);
  if (i >= 0) STAND.alben[i] = { ...STAND.alben[i], ...album };
  else STAND.alben.push(album);
}

/* Sortieren per Griff (Maus und Touch) */
function sortierbar(raster, fertig) {
  let zug = null;
  raster.addEventListener('pointerdown', e => {
    const griff = e.target.closest('.k-griff');
    if (!griff) return;
    const k = griff.closest('.kachel');
    e.preventDefault();
    zug = { k, id: e.pointerId };
    k.classList.add('zieht');
    griff.setPointerCapture(e.pointerId);
  });
  raster.addEventListener('pointermove', e => {
    if (!zug || e.pointerId !== zug.id) return;
    zug.k.style.pointerEvents = 'none';
    const unter = document.elementFromPoint(e.clientX, e.clientY);
    zug.k.style.pointerEvents = '';
    const ziel = unter && unter.closest('.kachel:not(.upload):not(.laedt)');
    if (ziel && ziel !== zug.k && ziel.parentNode === raster) {
      const r = ziel.getBoundingClientRect();
      const nach = e.clientX > r.left + r.width / 2;
      raster.insertBefore(zug.k, nach ? ziel.nextSibling : ziel);
    }
    if (e.clientY < 60) window.scrollBy(0, -12);
    else if (e.clientY > innerHeight - 100) window.scrollBy(0, 12);
  });
  const ende = e => {
    if (!zug || e.pointerId !== zug.id) return;
    zug.k.classList.remove('zieht');
    zug = null;
    fertig([...raster.querySelectorAll('.kachel[data-nr]')].map(k => Number(k.dataset.nr)));
  };
  raster.addEventListener('pointerup', ende);
  raster.addEventListener('pointercancel', ende);
}

/* ---------- Freigaben: geheime Links zur ganzen Website mit zusätzlichen Alben ---------- */

function freigabeUrl(f) {
  const basis = location.href.replace(/admin\/.*$/, '');
  return `${basis}?f=${f.token}`;
}

async function kopieren(text) {
  try { await navigator.clipboard.writeText(text); meldung('Link kopiert.'); }
  catch { window.prompt('Link kopieren:', text); }
}

async function freigabenAnsicht() {
  try { const d = await api('daten'); STAND = d; } catch { /* mit vorhandenem Stand */ }
  const linkAlben = STAND.alben.filter(a => a.status === 'link').sort((a, b) => (b.jahr - a.jahr) || (b.monat - a.monat));
  const liste = h('div', { class: 'freigaben' });
  const neuZeichnen = () => freigabenAnsicht();

  const speichern = async (f, still = false) => {
    try {
      const r = await api('freigabe_speichern', { daten: { id: f.id, name: f.name, alben: f.alben, aktiv: f.aktiv } });
      Object.assign(f, r.freigabe);
      if (!still) meldung('Freigabe gespeichert.');
      return true;
    } catch (err) { meldung(err.message, 'fehler'); return false; }
  };

  for (const f of STAND.freigaben || []) {
    const karte = h('section', { class: `freigabe${f.aktiv ? '' : ' aus'}` });
    const name = h('input', { type: 'text', maxlength: '60', value: f.name, 'aria-label': 'Name der Freigabe' });
    name.addEventListener('change', async () => { f.name = name.value.trim() || f.name; await speichern(f); });
    const aktiv = h('input', { type: 'checkbox', checked: f.aktiv });
    aktiv.addEventListener('change', async () => {
      f.aktiv = aktiv.checked;
      karte.classList.toggle('aus', !f.aktiv);
      await speichern(f);
    });
    const url = h('input', { type: 'text', readonly: true, value: freigabeUrl(f), 'aria-label': 'Freigabelink', onfocus: e => e.target.select() });
    const auswahl = h('div', { class: 'f-alben' });
    if (!linkAlben.length) auswahl.append(h('p', { class: 'hinweis', text: 'Noch kein Album mit Status „Mit Link“. Den Status stellst du im Album ein.' }));
    for (const a of linkAlben) {
      const box = h('input', { type: 'checkbox', checked: f.alben.includes(a.nr) });
      box.addEventListener('change', async () => {
        f.alben = box.checked ? [...new Set([...f.alben, a.nr])] : f.alben.filter(x => x !== a.nr);
        await speichern(f, true);
        zaehler.textContent = anzahlText(f);
      });
      auswahl.append(h('label', { class: 'f-album' }, box,
        h('span', { class: 'f-titel', text: a.titel }),
        h('span', { class: 'f-datum zahl', text: `${MON[a.monat - 1]} ${a.jahr}` })));
    }
    const anzahlText = x => `${x.alben.length} ${x.alben.length === 1 ? 'zusätzliches Album' : 'zusätzliche Alben'} · alle öffentlichen Alben immer dabei`;
    const zaehler = h('p', { class: 'hinweis', text: anzahlText(f) });
    let loeschenBereit = false;
    const loeschen = h('button', { type: 'button', class: 'link gefahr', text: 'Freigabe löschen' });
    loeschen.addEventListener('click', async () => {
      if (!loeschenBereit) { loeschenBereit = true; loeschen.textContent = 'Wirklich löschen? Der Link funktioniert dann nicht mehr.'; return; }
      try { await api('freigabe_loeschen', { daten: { id: f.id } }); meldung('Freigabe gelöscht.'); neuZeichnen(); } catch (err) { meldung(err.message, 'fehler'); }
    });
    const erneuern = h('button', { type: 'button', class: 'link', text: 'Neuen Link erzeugen' });
    erneuern.addEventListener('click', async () => {
      if (!confirm('Neuen Link erzeugen? Der bisherige Link funktioniert danach nicht mehr.')) return;
      try { const r = await api('freigabe_erneuern', { daten: { id: f.id } }); Object.assign(f, r.freigabe); url.value = freigabeUrl(f); meldung('Neuer Link erzeugt.'); } catch (err) { meldung(err.message, 'fehler'); }
    });
    karte.append(
      h('div', { class: 'f-kopf' }, name, h('label', { class: 'f-aktiv' }, aktiv, h('span', { text: 'aktiv' }))),
      h('div', { class: 'f-link' }, url, knopf('Kopieren', () => kopieren(url.value))),
      h('h3', { class: 'label', text: 'Zusätzliche Alben' }),
      auswahl, zaehler,
      h('div', { class: 'f-aktionen' }, erneuern, loeschen));
    liste.append(karte);
  }
  if (!(STAND.freigaben || []).length) liste.append(h('p', { class: 'leer', text: 'Noch keine Freigaben. Eine Freigabe ist ein geheimer Link zur ganzen Website, der zusätzlich ausgewählte Alben zeigt – zum Beispiel für Familie oder Freunde.' }));

  const neu = async () => {
    const n = (STAND.freigaben || []).length + 1;
    const f = { id: '', name: `Freigabe ${n}`, alben: [], aktiv: true };
    if (await speichern(f, true)) { meldung('Freigabe angelegt.'); neuZeichnen(); }
  };
  seite(
    h('header', { class: 'kopf' },
      h('p', { class: 'kicker', text: 'Verwaltung' }),
      h('div', { class: 'kopfzeile' }, h('h1', { text: 'Freigaben' }), knopf('+ Neuer Link', neu))),
    liste,
    navigation('freigaben'));
}

function einstellungenAnsicht() {
  const e = { ...STAND.einstellungen };
  const ueber = h('textarea', { rows: '6', oninput: () => { e.ueber = ueber.value; } });
  ueber.value = e.ueber || '';
  const kontakt = h('input', { type: 'email', value: e.kontakt || '', oninput: () => { e.kontakt = kontakt.value; } });
  const impressum = h('textarea', { rows: '12', oninput: () => { e.impressum = impressum.value; } });
  impressum.value = e.impressum || '';
  const datenschutz = h('textarea', { rows: '16', oninput: () => { e.datenschutz = datenschutz.value; } });
  datenschutz.value = e.datenschutz || '';
  const speichern = async () => {
    try { await api('einstellungen', { daten: e }); STAND.einstellungen = e; meldung('Einstellungen gespeichert.'); } catch (err) { meldung(err.message, 'fehler'); }
  };
  const alt = h('input', { type: 'password', autocomplete: 'current-password' });
  const neu = h('input', { type: 'password', autocomplete: 'new-password' });
  const neu2 = h('input', { type: 'password', autocomplete: 'new-password' });
  const pwAendern = async () => {
    if (neu.value !== neu2.value) { meldung('Die neuen Passwörter stimmen nicht überein.', 'fehler'); return; }
    try { await api('passwort', { daten: { alt: alt.value, neu: neu.value } }); alt.value = neu.value = neu2.value = ''; meldung('Passwort geändert.'); } catch (err) { meldung(err.message, 'fehler'); }
  };
  const abmelden = async () => { try { await api('abmelden', { daten: {} }); } catch { /* egal */ } start(); };
  seite(
    h('header', { class: 'kopf' }, h('p', { class: 'kicker', text: 'Verwaltung' }), h('h1', { text: 'Einstellungen' })),
    h('form', { class: 'formular', onsubmit: ev => ev.preventDefault() },
      feld('Über mich', ueber),
      feld('Kontakt-E-Mail', kontakt, 'optional, erscheint auf „Über mich“'),
      feld('Impressum', impressum),
      feld('Datenschutzerklärung', datenschutz),
      h('p', { class: 'hinweis', text: 'Platzhalter in eckigen Klammern [ ] bitte ersetzen. Die Vorlagen sind keine Rechtsberatung.' }),
      knopf('Texte speichern', speichern, 'knopf voll'),
      h('h2', { class: 'label abstand', text: 'Passwort ändern' }),
      feld('Bisheriges Passwort', alt),
      feld('Neues Passwort', neu, 'mindestens 10 Zeichen'),
      feld('Neues Passwort wiederholen', neu2),
      knopf('Passwort ändern', pwAendern),
      h('h2', { class: 'label abstand', text: 'Sitzung' }),
      knopf('Abmelden', abmelden)),
    navigation('einstellungen'));
}

/* ---------- Routing ---------- */

let letzterHash = location.hash;
function route() {
  const [a, b] = location.hash.replace(/^#\/?/, '').split('/');
  if (a === 'album') albumAnsicht(b === 'neu' ? null : Number(b));
  else if (a === 'einstellungen') einstellungenAnsicht();
  else if (a === 'freigaben') freigabenAnsicht();
  else listeAnsicht();
  letzterHash = location.hash;
}
addEventListener('hashchange', () => {
  // bestehende Alben werden automatisch gespeichert: ausstehende Änderung sofort sichern
  if (ungespeichert && sofortSpeichern && !location.hash.startsWith('#/album/neu') && /^#\/album\/\d+/.test(letzterHash || '')) { sofortSpeichern(); ungespeichert = false; }
  if (ungespeichert && !confirm('Es gibt ungespeicherte Änderungen. Trotzdem verlassen?')) {
    history.replaceState(null, '', letzterHash || '#/');
    return;
  }
  ungespeichert = false;
  route();
});
addEventListener('beforeunload', e => { if (ungespeichert) { if (sofortSpeichern && /^#\/album\/\d+/.test(location.hash)) { sofortSpeichern(); return; } e.preventDefault(); e.returnValue = ''; } });

/* Regionen (übergeordnete Verwaltungsebenen) fehlender Orte still im Hintergrund nachtragen */
let regionenLaeuft = false;
async function regionenNachtragen() {
  if (regionenLaeuft) return;
  regionenLaeuft = true;
  try {
    for (let i = 0; i < 300; i++) {
      const r = await api('regionen_nachtragen', { daten: {} });
      if (!r.offen || r.fehler) break;
    }
  } catch { /* beim nächsten Laden erneut */ }
  regionenLaeuft = false;
}

async function start() {
  try {
    const s = await api('status');
    CSRF = s.csrf;
    if (!s.eingerichtet) { einrichtenAnsicht(); return; }
    if (!s.angemeldet) { loginAnsicht(); return; }
    const d = await api('daten');
    STAND = d;
    if (!s.https) meldung('Achtung: Die Verbindung ist nicht verschlüsselt (kein HTTPS).', 'fehler');
    route();
    setTimeout(regionenNachtragen, 1500);
  } catch (err) {
    seite(h('div', { class: 'login' }, h('h1', { text: 'Fehler' }), h('p', { text: err.message })));
  }
}

start();
