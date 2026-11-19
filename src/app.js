/* Foto-Portfolio · öffentliche Website */
import { geoOrthographic, geoPath, geoDistance, geoContains, geoCentroid } from 'd3-geo';
import { feature, merge } from 'topojson-client';
import ISO from './iso.json';

/* ================================================================== */
/* Grundlagen                                                          */
/* ================================================================== */

const MON = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const DESKTOP = matchMedia('(min-width: 960px)');
const RUHIG = matchMedia('(prefers-reduced-motion: reduce)');
const MAUS = matchMedia('(hover: hover) and (pointer: fine)');
const TEMPO = 300; // Zeitstrahl: Pixel pro Sekunde

const S = 'fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const ICON = {
  zeit: `<svg width="22" height="22" viewBox="0 0 24 24" ${S}><circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.4 1.6"/><path d="M4.6 5.6 6.8 3.6"/><path d="M19.4 5.6 17.2 3.6"/><path d="M8 20l-1 1.5"/><path d="M16 20l1 1.5"/></svg>`,
  globus: `<svg width="22" height="22" viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="3.8" ry="8.5"/><path d="M3.8 9h16.4"/><path d="M3.8 15h16.4"/></svg>`,
  bogen: `<svg width="22" height="22" viewBox="0 0 24 24" ${S}><rect x="4" y="3.5" width="4.4" height="6.5" rx=".5"/><rect x="9.8" y="3.5" width="4.4" height="6.5" rx=".5"/><rect x="15.6" y="3.5" width="4.4" height="6.5" rx=".5"/><rect x="4" y="13.5" width="4.4" height="6.5" rx=".5"/><rect x="9.8" y="13.5" width="4.4" height="6.5" rx=".5"/><rect x="15.6" y="13.5" width="4.4" height="6.5" rx=".5"/></svg>`,
  links: `<svg width="22" height="22" viewBox="0 0 24 24" ${S}><path d="M15 5l-7 7 7 7"/></svg>`,
  info: `<svg width="22" height="22" viewBox="0 0 24 24" ${S}><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.6v.1"/></svg>`,
  kontrast: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M5.99 18.01A8.5 8.5 0 0 1 18.01 5.99Z" fill="currentColor" stroke="none"/></svg>`,
  zu: `<svg width="22" height="22" viewBox="0 0 24 24" ${S}><path d="M6 6l12 12"/><path d="M18 6 6 18"/></svg>`,
};
const ANSICHT_NAME = { zeit: 'Zeitstrahl', globus: 'Globus', bogen: 'Kontaktbogen' };

function h(tag, attrs = {}, ...kinder) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'icon') el.innerHTML = ICON[v];
    else if (k === 'style') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kind of kinder.flat()) if (kind !== null && kind !== undefined && kind !== false) el.append(kind);
  return el;
}
const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const pad = (n, l) => String(n).padStart(l, '0');
const komma = (x, d = 2) => Math.abs(x).toFixed(d).replace('.', ',');
const anzahl = (n, ein, mehr) => `${n} ${n === 1 ? ein : mehr}`;
const ruhig = () => RUHIG.matches;
const speicher = {
  lies(k) { try { return localStorage.getItem(k); } catch { return null; } },
  schreib(k, v) { try { localStorage.setItem(k, v); } catch { /* egal */ } },
};

/* ================================================================== */
/* Daten                                                               */
/* ================================================================== */

let DATEN = { alben: [], seiten: {} };
let ALBEN = [];

function datenVorbereiten(roh) {
  const alben = (roh.alben || []).filter(a => a.fotos && a.fotos.length);
  alben.sort((a, b) => (b.jahr - a.jahr) || (b.monat - a.monat) || (b.nr - a.nr));
  for (const a of alben) {
    a.mon = MON[a.monat - 1] || '';
    a.monatLang = MONATE[a.monat - 1] || '';
    a.nrText = a.nummer ? pad(a.nummer, 2) : (a.nummer === null ? '–' : pad(a.nr, 2));
    a.hatOrt = a.ort && Number.isFinite(a.ort.lat) && Number.isFinite(a.ort.lon);
    a.ortKey = a.hatOrt ? `${a.ort.lat.toFixed(2)},${a.ort.lon.toFixed(2)}` : null;
    a.titelfoto = a.fotos.find(f => f.nr === a.titelbild) || a.fotos[0];
  }
  return alben;
}

function bildUrl(album, foto, groesse) {
  const verf = foto.groessen && foto.groessen.length ? foto.groessen : [groesse];
  const g = verf.find(x => x >= groesse) || verf[verf.length - 1];
  return `media/${album.nr}/${pad(foto.nr, 3)}-${g}.${foto.ext || 'webp'}`;
}
function srcset(album, foto) {
  return (foto.groessen || []).map(g => {
    const breite = foto.w >= foto.h ? g : Math.round(g * foto.w / foto.h);
    return `media/${album.nr}/${pad(foto.nr, 3)}-${g}.${foto.ext || 'webp'} ${breite}w`;
  }).join(', ');
}
function koordinaten(ort) {
  if (!ort) return '';
  return `${komma(ort.lat)}° ${ort.lat >= 0 ? 'N' : 'S'}  ${komma(ort.lon)}° ${ort.lon >= 0 ? 'O' : 'W'}`;
}
function exifDatum(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(s || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

/* Punkte für den Globus: Land mit mehreren Orten = ein Landpunkt (Zoom), sonst Ortspunkt */
function punkteBilden(alben) {
  const laender = new Map();
  for (const a of alben) {
    if (!a.hatOrt) continue;
    const lk = a.ort.land || `X${a.nr}`;
    if (!laender.has(lk)) laender.set(lk, { land: lk, name: a.ort.landName || a.ort.name, orte: new Map() });
    const l = laender.get(lk);
    if (!l.orte.has(a.ortKey)) l.orte.set(a.ortKey, { key: `O:${a.ortKey}`, typ: 'ort', name: a.ort.name, lat: a.ort.lat, lon: a.ort.lon, alben: [] });
    l.orte.get(a.ortKey).alben.push(a);
  }
  const welt = [];
  const zoom = new Map();
  for (const l of laender.values()) {
    const orte = [...l.orte.values()];
    zoom.set(l.land, { ...l, orte });
    if (orte.length > 1) {
      const alle = orte.flatMap(o => o.alben);
      const p = { key: `L:${l.land}`, typ: 'land', land: l.land, name: l.name, lat: mittel(orte.map(o => o.lat)), lon: mittelLon(orte.map(o => o.lon)), alben: alle, orte };
      welt.push(p);
      for (const a of alle) a.punkt = p.key;
    } else {
      welt.push(orte[0]);
      for (const a of orte[0].alben) a.punkt = orte[0].key;
    }
  }
  return { welt, zoom };
}
const mittel = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
function mittelLon(xs) {
  const r = Math.PI / 180;
  const x = mittel(xs.map(l => Math.cos(l * r)));
  const y = mittel(xs.map(l => Math.sin(l * r)));
  return Math.atan2(y, x) / r;
}

/* ================================================================== */
/* Globus                                                              */
/* ================================================================== */

/* Sammelt die projizierten Linien und rundet Ecken leicht ab */
class Glaetter {
  constructor(k = 0.3, maxPx = 3.5) { this.k = k; this.maxPx = maxPx; this.ringe = []; this.ring = null; }
  beginPath() {}
  moveTo(x, y) { this.ring = [[x, y]]; this.ring.zu = false; this.ringe.push(this.ring); }
  lineTo(x, y) {
    if (!this.ring) return;
    const l = this.ring[this.ring.length - 1];
    if (Math.abs(l[0] - x) + Math.abs(l[1] - y) < 0.9) return;
    this.ring.push([x, y]);
  }
  closePath() { if (this.ring) this.ring.zu = true; }
  arc() {}
  ergebnis() {
    const k = this.k;
    const f = p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    const max = this.maxPx;
    // Rundung höchstens maxPx Pixel weit in jedes Segment hinein: nur leicht abgerundet, auch im Zoom
    const zu = (a, b, t) => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const u = Math.min(t, max / l);
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    };
    let d = '';
    for (let r of this.ringe) {
      if (r.zu && r.length > 2) {
        const a = r[0], b = r[r.length - 1];
        if (Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01) { const z = r.zu; r = r.slice(0, -1); r.zu = z; }
      }
      const n = r.length;
      if (n < 3) { if (n === 2) d += `M${f(r[0])}L${f(r[1])}`; continue; }
      if (r.zu) {
        d += `M${f(zu(r[0], r[n - 1], k))}`;
        for (let i = 0; i < n; i++) {
          const p = r[i], v = r[(i + 1) % n];
          d += `Q${f(p)} ${f(zu(p, v, k))}L${f(zu(v, p, k))}`;
        }
        d += 'Z';
      } else {
        d += `M${f(r[0])}`;
        for (let i = 1; i < n - 1; i++) d += `L${f(zu(r[i], r[i - 1], k))}Q${f(r[i])} ${f(zu(r[i], r[i + 1], k))}`;
        d += `L${f(r[n - 1])}`;
      }
    }
    this.ringe = [];
    this.ring = null;
    return d;
  }
}

class Globus {
  constructor(punkte, startOrt, aktionen) {
    this.punkte = punkte;
    this.aktionen = aktionen;
    this.rot = startOrt ? [-startOrt.lon, -startOrt.lat * 0.6] : [-15, -30];
    this.skala = 1;
    this.ty = 0;
    this.proj = geoOrthographic().clipAngle(90);
    this.pfad = geoPath(this.proj);
    this.glaetter = new Glaetter(0.3);
    this.glattPfad = geoPath(this.proj, this.glaetter);
    this.pauseBis = 0;
    this.gestartet = false;
    // Zoomstufen: Welt → Gruppe naher Punkte → Land → Gruppe im Land
    this.stufen = [{ typ: 'welt', punkte: punkte.welt, labels: false, land: null }];

    this.el = h('div', { class: 'globus' });
    this.svg = svgEl('svg', { 'aria-hidden': 'true' });
    this.kugel = svgEl('path', { class: 'kugel' });
    this.land = svgEl('path', { class: 'land', pathLength: '1' });
    this.laenderG = svgEl('g', { class: 'laender' });
    this.svg.append(this.kugel, this.land, this.laenderG);
    this.punkteEl = h('div', { class: 'punkte' });
    this.el.append(this.svg, this.punkteEl);
    this.knoepfe = new Map();
    this.punkteZeichnen(punkte.welt, false);

    new ResizeObserver(() => this.render()).observe(this.el);
    this.ziehenEinrichten();
    this.geoLaden();
  }

  get stufe() { return this.stufen[this.stufen.length - 1]; }
  get tiefe() { return this.stufen.length; }

  async geoLaden() {
    try {
      const t = await (await fetch('assets/geo/land.json')).json();
      this.land110 = feature(t, t.objects.land);
      this.render();
    } catch { /* ohne Karte */ }
    try {
      const t = await (await fetch('assets/geo/laender.json')).json();
      this.laender = feature(t, t.objects.countries).features;
      this.land50 = merge(t, t.objects.countries.geometries);
      this.relevanteLaender();
    } catch { /* ohne Länder */ }
  }

  landVon(p, code) {
    if (!this.laender) return null;
    if (code && ISO[code]) {
      const f = this.laender.find(x => x.id === ISO[code]);
      if (f) return f;
    }
    const treffer = this.laender.find(f => geoContains(f, [p.lon, p.lat]));
    if (treffer) return treffer;
    // Ort knapp außerhalb der vereinfachten Küste: Umgebung absuchen
    for (const d of [0.15, 0.3, 0.6]) {
      for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]]) {
        const f = this.laender.find(x => geoContains(x, [p.lon + dx, p.lat + dy]));
        if (f) return f;
      }
    }
    return null;
  }

  /* Konturen der Länder mit Alben: gleichzeitig mit den Kontinenten gezeichnet */
  relevanteLaender() {
    const gesehen = new Set();
    this.laenderPfade = [];
    for (const z of this.punkte.zoom.values()) {
      for (const o of z.orte) {
        const f = this.landVon(o, z.land);
        if (!f || gesehen.has(f)) continue;
        gesehen.add(f);
        if (!z.feature) z.feature = f;
        const p = svgEl('path', this.gezeichnet ? {} : { pathLength: '1' });
        this.laenderG.append(p);
        this.laenderPfade.push({ f, p });
      }
    }
    if (this.gestartet) this.zeichnenSynchron();
    this.render();
  }

  zeichnenSynchron() {
    if (this.gezeichnet) return;
    // gleiche Animation wie die Kontinente, bereits verstrichene Zeit überspringen
    const verstrichen = (performance.now() - this.startZeit) / 1000;
    for (const { p } of this.laenderPfade || []) {
      p.classList.add('zeichnen');
      p.style.animationDelay = `${-verstrichen}s`;
    }
  }

  starten() {
    if (this.gestartet) return;
    this.gestartet = true;
    this.startZeit = performance.now();
    this.land.classList.add('zeichnen');
    this.zeichnenSynchron();
    // Nach dem Zeichnen die Strichmuster entfernen: spart beim Drehen viel Rechenzeit
    setTimeout(() => {
      this.gezeichnet = true;
      for (const p of [this.land, ...(this.laenderPfade || []).map(x => x.p)]) {
        p.classList.remove('zeichnen');
        p.removeAttribute('pathLength');
        p.style.animationDelay = '';
      }
    }, ruhig() ? 0 : 5300);
    this.namenWechseln();
    this.pauseBis = performance.now() + (ruhig() ? 0 : 5000);
    let letzte = performance.now();
    const schleife = jetzt => {
      const dt = Math.min(0.05, (jetzt - letzte) / 1000);
      letzte = jetzt;
      if (this.tiefe === 1 && !this.zieht && !this.anim && !ruhig() && jetzt > this.pauseBis && this.el.offsetParent && !document.hidden) {
        this.rot[0] += dt * 4;
        this.render();
      }
      requestAnimationFrame(schleife);
    };
    requestAnimationFrame(schleife);
  }

  /* Radius der Weltkugel: links und rechts je 1 % Abstand */
  basisR() {
    const w = this.el.clientWidth;
    const hh = this.el.clientHeight || w;
    return Math.min(w * 0.98, hh) / 2 - 6;
  }

  render() {
    const w = this.el.clientWidth;
    const hh = this.el.clientHeight || w;
    if (!w) return;
    const r = this.basisR();
    this.r = r;
    this.proj.rotate(this.rot).scale(r * this.skala).translate([w / 2, hh / 2 + this.ty]);
    this.proj.clipExtent(this.skala > 1.05 ? [[-20, -20], [w + 20, hh + 20]] : null);
    const nah = this.skala > 1.05;
    if (nah !== this.istNah) { this.istNah = nah; this.el.classList.toggle('nah', nah); }
    this.kugel.setAttribute('d', this.pfad({ type: 'Sphere' }) || '');
    this.kugel.style.opacity = this.skala > 1.3 ? 0 : 1;
    const land = this.skala > 1.6 && this.land50 ? this.land50 : this.land110;
    if (land) this.land.setAttribute('d', this.glatt(land));
    if (this.laenderPfade) for (const { f, p } of this.laenderPfade) p.setAttribute('d', this.glatt(f));
    const mitte = [-this.rot[0], -this.rot[1]];
    for (const [p, knopf] of this.knoepfe) {
      const xy = this.proj([p.lon, p.lat]);
      const hinten = geoDistance([p.lon, p.lat], mitte) > Math.PI / 2 - 0.03;
      knopf.classList.toggle('hinten', hinten || !xy);
      if (xy) knopf.style.transform = `translate(${xy[0].toFixed(1)}px, ${xy[1].toFixed(1)}px)`;
    }
  }

  glatt(geo) {
    this.glattPfad(geo);
    return this.glaetter.ergebnis();
  }

  punkteZeichnen(liste, mitLabel) {
    this.punkteEl.replaceChildren();
    this.knoepfe.clear();
    this.punkteEl.classList.toggle('alle-namen', !!mitLabel);
    liste.forEach(p => {
      const knopf = h('button', { class: 'gpunkt', type: 'button', 'aria-label': `${p.name}, ${anzahl(p.alben.length, 'Album', 'Alben')}`, 'data-key': p.key },
        h('span', { class: 'kern' }),
        h('span', { class: 'glabel', text: p.name, 'aria-hidden': 'true' }));
      knopf.addEventListener('click', e => {
        e.stopPropagation();
        if (this.gezogen || this.anim) { e.preventDefault(); return; }
        this.tippen(p);
      });
      if (MAUS.matches) {
        knopf.addEventListener('mouseenter', () => this.aktionen.hover(p));
        knopf.addEventListener('mouseleave', () => this.aktionen.hover(null));
      }
      this.punkteEl.append(knopf);
      this.knoepfe.set(p, knopf);
    });
    this.render();
  }

  /* Weltstufe: einzelne Ortsnamen nacheinander weich einblenden, nur sichtbare Punkte */
  namenWechseln() {
    let index = 0;
    const takt = () => {
      if (this.tiefe === 1 && !ruhig() && this.el.offsetParent && !document.hidden) {
        const cx = this.el.clientWidth / 2, cy = this.el.clientHeight / 2 + this.ty;
        const grenze = (this.r || cx) * this.skala * 0.7;
        const sichtbar = [...this.knoepfe.values()].filter(k => {
          if (k.classList.contains('hinten')) return false;
          const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(k.style.transform);
          return m && Math.hypot(+m[1] - cx, +m[2] - cy) < grenze;
        });
        if (sichtbar.length) {
          const k = sichtbar[index++ % sichtbar.length];
          k.classList.add('zeigt');
          setTimeout(() => k.classList.remove('zeigt'), 2200);
        }
      }
      setTimeout(takt, 2800);
    };
    setTimeout(takt, ruhig() ? 0 : 5200);
  }

  /* Ein Punkt wurde angetippt */
  tippen(p) {
    this.hervorheben(null);
    const nah = this.nachbarn(p);
    if (nah.length) { this.gruppeZeigen([p, ...nah]); return; }
    if (p.alben.length === 1) { this.aktionen.album(p.alben[0]); return; }
    if (p.typ === 'land') { this.landZeigen(p.land); return; }
    this.aktionen.liste(p);
  }

  /* sichtbare Punkte, die auf dem Bildschirm sehr nah an p liegen */
  nachbarn(p, abstand = 30) {
    const a = this.proj([p.lon, p.lat]);
    if (!a) return [];
    const mitte = [-this.rot[0], -this.rot[1]];
    const liste = [];
    for (const q of this.knoepfe.keys()) {
      if (q === p || geoDistance([q.lon, q.lat], mitte) > Math.PI / 2 - 0.03) continue;
      const b = this.proj([q.lon, q.lat]);
      if (b && Math.hypot(a[0] - b[0], a[1] - b[1]) < abstand) liste.push(q);
    }
    return liste;
  }

  gruppeZeigen(gruppe) {
    const s = this.stufe;
    const alben = [...new Set(gruppe.flatMap(g => g.alben))];
    this.stufeHinein({ typ: s.land ? 'land' : 'gruppe', punkte: s.punkte, labels: true, land: s.land, alben }, gruppe, this.skala * 1.6, true);
  }

  landZeigen(code) {
    const z = this.punkte.zoom.get(code);
    if (!z) return false;
    const alben = z.orte.flatMap(o => o.alben);
    // nur die Punkte des Landes, gezoomt auf diese Punkte (nicht auf das ganze Land)
    this.stufeHinein({ typ: 'land', punkte: z.orte, labels: true, land: z, alben }, z.orte, this.skala * 1.4);
    return true;
  }

  /* Zielansicht, in der alle Fokuspunkte gut getrennt Platz finden */
  zielFuer(fokus, mindest = 1.5, nurTrennen = false) {
    const w = this.el.clientWidth || 300;
    const hh = this.el.clientHeight || w;
    const oben = this.aktionen.obenFrei();
    const unten = this.aktionen.untenFrei();
    const lon = mittelLon(fokus.map(g => g.lon)), lat = mittel(fokus.map(g => g.lat));
    let rot = [-lon, -lat];
    const r = this.basisR();
    let test = geoOrthographic().clipAngle(90).rotate(rot).scale(r).translate([w / 2, hh / 2]);
    let xy = fokus.map(g => test([g.lon, g.lat])).filter(Boolean);
    // auf die Mitte des umschließenden Rechtecks zentrieren (nicht auf den Durchschnitt)
    const mitte = test.invert([(Math.min(...xy.map(q => q[0])) + Math.max(...xy.map(q => q[0]))) / 2, (Math.min(...xy.map(q => q[1])) + Math.max(...xy.map(q => q[1]))) / 2]);
    if (mitte && mitte.every(Number.isFinite)) {
      rot = [-mitte[0], -mitte[1]];
      test = geoOrthographic().clipAngle(90).rotate(rot).scale(r).translate([w / 2, hh / 2]);
      xy = fokus.map(g => test([g.lon, g.lat])).filter(Boolean);
    }
    const xs = xy.map(q => q[0]), ys = xy.map(q => q[1]);
    const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    const verfW = w * 0.6, verfH = Math.max(80, (hh - oben - unten) * 0.56);
    let skala = Math.min(verfW / Math.max(bw, 1e-6), verfH / Math.max(bh, 1e-6));
    if (!Number.isFinite(skala)) skala = 8;
    if (nurTrennen && xy.length > 1) {
      // bei nahen Punkten nur so weit zoomen, bis sie gut getrennt sind; die Umgebung bleibt sichtbar
      let dmin = Infinity;
      for (let i = 0; i < xy.length; i++) for (let j = i + 1; j < xy.length; j++) dmin = Math.min(dmin, Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]));
      skala = Math.min(skala, Math.max(mindest, 95 / Math.max(dmin, 1e-6)));
    }
    skala = Math.min(4000, Math.max(mindest, skala));
    return { rot, skala, ty: (oben - unten) / 2 };
  }

  async stufeHinein(stufe, fokus, mindest, nurTrennen = false) {
    if (this.anim) return;
    const alt = this.stufe;
    alt.rot = [...this.rot]; alt.skala = this.skala; alt.ty = this.ty;
    this.stufen.push(stufe);
    this.aktionen.stufe(stufe, this.tiefe);
    this.punkteZeichnen(stufe.punkte, stufe.labels);
    const ziel = this.zielFuer(fokus, mindest, nurTrennen);
    Object.assign(stufe, ziel);
    await this.animieren(ziel.rot, ziel.skala, ziel.ty, 1100);
  }

  /* eine Zoomstufe zurück */
  async zurueck() {
    if (this.tiefe < 2 || this.anim) return false;
    this.stufen.pop();
    const s = this.stufe;
    this.aktionen.stufe(s, this.tiefe);
    this.punkteZeichnen(s.punkte, s.labels);
    if (this.tiefe === 1) {
      await this.animieren([this.rot[0], Math.max(-40, Math.min(40, this.rot[1]))], 1, 0, 1000);
      this.pauseBis = performance.now() + 2500;
    } else {
      await this.animieren(s.rot, s.skala, s.ty, 1000);
    }
    return true;
  }

  async zurWelt(sofort = false) {
    if (this.tiefe < 2) return;
    this.stufen.length = 1;
    const s = this.stufe;
    this.aktionen.stufe(s, 1);
    this.punkteZeichnen(s.punkte, false);
    await this.animieren([this.rot[0], Math.max(-40, Math.min(40, this.rot[1]))], 1, 0, sofort ? 1 : 1000);
  }

  hervorheben(alben) {
    for (const [p, knopf] of this.knoepfe) {
      const an = !!alben && alben.length > 0 && p.alben.some(a => alben.includes(a));
      knopf.classList.toggle('hervor', an);
    }
  }

  ziehenEinrichten() {
    let start = null;
    this.el.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      start = { x: e.clientX, y: e.clientY, rot: [...this.rot], id: e.pointerId, ziel: e.target };
      this.gezogen = false;
    });
    this.el.addEventListener('pointermove', e => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!this.gezogen && Math.hypot(dx, dy) < 6) return;
      if (this.anim) return;
      if (!this.gezogen) {
        this.gezogen = true;
        this.zieht = true;
        this.el.classList.add('zieht');
        try { this.el.setPointerCapture(e.pointerId); } catch { /* egal */ }
      }
      const k = 90 / (this.r || this.el.clientWidth / 2) / this.skala;
      this.rot = [start.rot[0] + dx * k, Math.max(-85, Math.min(85, start.rot[1] - dy * k))];
      this.render();
    });
    const ende = e => {
      if (!start) return;
      const war = start;
      start = null;
      const gezogen = this.gezogen;
      this.zieht = false;
      this.el.classList.remove('zieht');
      this.pauseBis = performance.now() + 3000;
      setTimeout(() => { this.gezogen = false; }, 0);
      // Tipp ins Leere: eine Zoomstufe heraus
      if (e.type === 'pointerup' && !gezogen && !(war.ziel instanceof Element && war.ziel.closest('.gpunkt'))) this.aktionen.leer();
    };
    this.el.addEventListener('pointerup', ende);
    this.el.addEventListener('pointercancel', ende);
  }

  animieren(zielRot, zielSkala, zielTy = 0, dauer = 1200) {
    const vonRot = [...this.rot], vonSkala = this.skala, vonTy = this.ty;
    const dl = ((zielRot[0] - vonRot[0]) % 360 + 540) % 360 - 180;
    const t0 = performance.now();
    if (ruhig()) dauer = 1;
    this.anim = true;
    return new Promise(fertig => {
      const schritt = jetzt => {
        const t = Math.min(1, (jetzt - t0) / dauer);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        this.rot = [vonRot[0] + dl * e, vonRot[1] + (zielRot[1] - vonRot[1]) * e];
        this.skala = vonSkala * Math.pow(zielSkala / vonSkala, e);
        this.ty = vonTy + (zielTy - vonTy) * e;
        this.render();
        if (t < 1) requestAnimationFrame(schritt);
        else { this.anim = false; fertig(); }
      };
      requestAnimationFrame(schritt);
    });
  }

  drehenZu(p) {
    if (this.tiefe > 1 || !p || this.anim) return;
    this.pauseBis = performance.now() + 4000;
    this.animieren([-p.lon, -p.lat * 0.6], 1, 0, 900);
  }
}

/* ================================================================== */
/* Übersicht: Zeitstrahl, Globus, Kontaktbogen                          */
/* ================================================================== */

const app = {
  ansicht: null,
  ansichtGebaut: {},
  letzteUebersicht: '#/',
};

function zeitstrahlBauen(alben) {
  const el = h('div', { class: 'zeitstrahl' });
  let jahr = null, sektion = null;
  for (const a of alben) {
    if (a.jahr !== jahr) {
      jahr = a.jahr;
      sektion = h('section', { class: 'jahr', 'aria-label': String(jahr) },
        h('span', { class: 'linie', 'aria-hidden': 'true' }),
        h('div', { class: 'jahr-label zahl', text: String(jahr) }));
      el.append(sektion);
    }
    const eintrag = h('a', { class: 'eintrag', href: `#/album/${a.nr}`, 'data-nr': a.nr, 'aria-label': `${a.titel}, ${a.monatLang} ${a.jahr}` },
      h('span'),
      h('span', { class: 'punkt', 'aria-hidden': 'true' }),
      h('span', { class: 'titel', text: a.titel }),
      h('span', { class: 'monat', text: a.mon, 'aria-hidden': 'true' }));
    if (MAUS.matches) {
      eintrag.addEventListener('mouseenter', e => { app.hoverAlbum(a); vorschauZeigen(a, e); });
      eintrag.addEventListener('mousemove', vorschauBewegen);
      eintrag.addEventListener('mouseleave', () => { app.hoverAlbum(null); vorschauVerbergen(); });
    }
    sektion.append(eintrag);
  }
  return el;
}

function zeitstrahlStarten(el) {
  if (el.classList.contains('laeuft') || !el.offsetParent) return;
  // Die Linie fließt gleichmäßig von oben nach unten. Punkt und Titel erscheinen,
  // kurz nachdem die Linie sie erreicht hat (Linie läuft etwas voraus).
  const VORLAUF = 0.14;
  let pos = 0;
  [...el.querySelectorAll('.jahr')].forEach((s, i) => {
    if (i) pos += 6;
    const start = pos, hoehe = s.offsetHeight;
    const linie = s.querySelector('.linie');
    linie.style.animationDelay = `${(start / TEMPO).toFixed(3)}s`;
    linie.style.animationDuration = `${(hoehe / TEMPO).toFixed(3)}s`;
    s.querySelector('.jahr-label').style.setProperty('--d', `${(start / TEMPO).toFixed(3)}s`);
    for (const e of s.querySelectorAll('.eintrag')) {
      const ankunft = (start + e.offsetTop + e.offsetHeight / 2) / TEMPO;
      e.style.setProperty('--d', `${(ankunft + VORLAUF).toFixed(3)}s`);
    }
    pos += hoehe;
  });
  el.classList.add('laeuft');
}

let vorschauEl = null;
function vorschauZeigen(a, e) {
  if (!vorschauEl) { vorschauEl = h('div', { class: 'vorschau', 'aria-hidden': 'true' }); document.body.append(vorschauEl); }
  vorschauEl.style.backgroundImage = `url("${bildUrl(a, a.fotos[0], 400)}")`;
  vorschauBewegen(e);
  vorschauEl.classList.add('an');
}
function vorschauBewegen(e) {
  if (vorschauEl) vorschauEl.style.transform = `translate(${e.clientX + 28}px, ${e.clientY - 80}px)`;
}
function vorschauVerbergen() { if (vorschauEl) vorschauEl.classList.remove('an'); }

function bogenBauen(alben) {
  const el = h('div', { class: 'bogen' });
  let i = 0;
  for (const a of alben) {
    const raster = h('div', { class: 'bogen-raster' });
    a.fotos.forEach((f, k) => {
      raster.append(h('a', { class: 'bogen-foto', href: `#/album/${a.nr}/${k + 1}`, 'aria-label': `Foto ${a.nrText}/${pad(k + 1, 3)}`, style: { animationDelay: `${Math.min(i++ * 0.025, 1.2)}s` } },
        h('span', { class: 'bild' }, h('img', { src: bildUrl(a, f, 400), alt: '', loading: 'lazy', decoding: 'async', width: f.w, height: f.h })),
        h('span', { class: 'fnr zahl', text: `${a.nrText}/${pad(k + 1, 3)}` })));
    });
    el.append(h('section', { class: 'bogen-album', 'aria-label': a.titel },
      h('div', { class: 'bogen-kopf' },
        h('span', { class: 'nr zahl', text: a.nrText }),
        h('span', { class: 'titel', text: a.titel }),
        h('span', { class: 'datum', text: `${a.mon} ${a.jahr}` })),
      raster));
  }
  return el;
}

function details(alben, mitLaendern) {
  const jahre = alben.map(a => a.jahr);
  const min = Math.min(...jahre), max = Math.max(...jahre);
  const spanne = !jahre.length ? '' : (min === max ? `${min}` : `${min}–${max}`);
  const orte = new Set(alben.map(a => a.ortKey)).size;
  const teile = [anzahl(alben.length, 'Album', 'Alben')];
  if (mitLaendern) teile.push(anzahl(new Set(alben.map(a => a.ort.land || a.nr)).size, 'Land', 'Länder'));
  teile.push(anzahl(orte, 'Ort', 'Orte'));
  if (spanne) teile.push(spanne);
  return teile.join(' · ');
}

function globusAnsichtBauen(alben, punkte) {
  const el = h('div', { class: 'globus-ansicht' });
  const mitOrt = alben.filter(a => a.hatOrt);
  app.globusInfo = h('div', { class: 'globus-info' });
  app.zurueckKnopf = h('button', { class: 'icon-knopf globus-zurueck', type: 'button', 'aria-label': 'Eine Zoomstufe zurück', icon: 'links', hidden: true, onclick: () => app.globus.zurueck() });
  const infoSetzen = (stufe, tiefe) => {
    const liste = stufe.typ === 'welt' ? mitOrt : stufe.alben;
    const kinder = [];
    if (stufe.land) kinder.push(h('h2', { text: stufe.land.name }));
    kinder.push(h('p', { class: 'zahl', text: details(liste, !stufe.land) }));
    app.globusInfo.replaceChildren(...kinder);
    app.globusInfo.classList.toggle('mit-titel', tiefe > 1);
    titelEinpassen(app.globusInfo.querySelector('h2'));
    app.zurueckKnopf.hidden = tiefe < 2;
    zeitstrahlFiltern(DESKTOP.matches && stufe.land ? stufe.alben.map(a => a.nr) : null);
  };
  app.globus = new Globus(punkte, mitOrt[0]?.ort, {
    album: a => { location.hash = `#/album/${a.nr}`; },
    liste: p => blattZeigen(p),
    stufe: (stufe, tiefe) => { blattSchliessen(); infoSetzen(stufe, tiefe); },
    leer: () => { if (app.blatt) blattSchliessen(); else app.globus.zurueck(); },
    obenFrei: () => app.globusInfo.offsetTop + app.globusInfo.offsetHeight - 16,
    untenFrei: () => (app.zurueckKnopf.hidden ? 12 : 72),
    hover: p => {
      app.globus.hervorheben(p ? p.alben : null);
      zeitstrahlHervorheben(p ? p.alben.map(a => a.nr) : [], true);
    },
  });
  infoSetzen(app.globus.stufe, 1);
  el.append(app.globus.el, app.globusInfo, app.zurueckKnopf);
  return el;
}

function blattZeigen(p) {
  blattSchliessen();
  const liste = h('div', { class: 'blatt-liste' });
  for (const a of p.alben) {
    liste.append(h('a', { class: 'eintrag', href: `#/album/${a.nr}`, 'aria-label': `${a.titel}, ${a.monatLang} ${a.jahr}` },
      h('span', { class: 'jahrzahl zahl', text: String(a.jahr) }),
      h('span', { class: 'punkt', 'aria-hidden': 'true' }),
      h('span', { class: 'titel', text: a.titel }),
      h('span', { class: 'monat', text: a.mon, 'aria-hidden': 'true' })));
  }
  app.blatt = h('section', { class: 'blatt', 'aria-label': `Alben in ${p.name}` },
    h('button', { class: 'blatt-zu', 'aria-label': 'Schließen', icon: 'zu', onclick: blattSchliessen }),
    h('div', { class: 'blatt-kopf' }, h('h3', { text: p.name }), h('span', { class: 'zahl', text: anzahl(p.alben.length, 'Album', 'Alben') })),
    liste);
  app.globusAnsicht.append(app.blatt);
  app.globus.hervorheben(p.alben);
}
function blattSchliessen() {
  if (app.blatt) {
    const alt = app.blatt;
    app.blatt = null;
    alt.classList.add('raus');
    setTimeout(() => alt.remove(), ruhig() ? 0 : 340);
  }
  if (app.globus) app.globus.hervorheben(null);
}

function titelEinpassen(el) {
  if (!el) return;
  el.style.fontSize = '';
  let groesse = parseFloat(getComputedStyle(el).fontSize) || 44;
  while (el.scrollWidth > el.clientWidth + 1 && groesse > 18) {
    groesse -= 2;
    el.style.fontSize = `${groesse}px`;
  }
}

function zeitstrahlFiltern(nummern) {
  const z = app.zeitstrahl;
  if (!z) return;
  if (nummern && !z.classList.contains('fertig')) z.classList.add('fertig');
  for (const s of z.querySelectorAll('.jahr')) {
    let sichtbar = 0;
    for (const e of s.querySelectorAll('.eintrag')) {
      const an = !nummern || nummern.includes(Number(e.dataset.nr));
      e.classList.toggle('aus', !an);
      if (an) sichtbar++;
    }
    s.classList.toggle('aus', !sichtbar);
  }
}

function zeitstrahlHervorheben(nummern, scrollen) {
  if (!app.zeitstrahl) return;
  let erstes = null;
  for (const e of app.zeitstrahl.querySelectorAll('.eintrag')) {
    const an = nummern.includes(Number(e.dataset.nr));
    e.classList.toggle('hervor', an);
    if (an && !erstes) erstes = e;
  }
  if (scrollen && erstes && DESKTOP.matches) {
    const r = erstes.getBoundingClientRect();
    if (r.top < 120 || r.bottom > innerHeight - 40) erstes.scrollIntoView({ block: 'center', behavior: ruhig() ? 'auto' : 'smooth' });
  }
}

app.hoverAlbum = a => {
  if (!app.globus) return;
  if (!a) { app.globus.hervorheben(null); return; }
  app.globus.hervorheben([a]);
  if (a.hatOrt) {
    const p = app.punkte.welt.find(x => x.key === a.punkt);
    if (p) app.globus.drehenZu(p);
  }
};

/* ---------- Umschalter ---------- */

function umschalterBauen() {
  const keys = DESKTOP.matches ? ['globus', 'bogen'] : ['zeit', 'globus', 'bogen'];
  const knopf = h('span', { class: 'knopf', 'aria-hidden': 'true' }, ...keys.map(k => h('span', { 'data-k': k, icon: k })));
  const el = h('div', { class: 'umschalter', role: 'group', 'aria-label': 'Ansicht wählen' }, knopf,
    ...keys.map(k => h('button', { 'data-k': k, 'aria-label': ANSICHT_NAME[k], 'aria-pressed': 'false', icon: k, onclick: () => { location.hash = `#/${k}`; } })));
  el.keys = keys;
  return el;
}
function umschalterSetzen(ansicht) {
  const el = app.umschalter;
  const k = DESKTOP.matches && ansicht === 'zeit' ? 'globus' : ansicht;
  const i = Math.max(0, el.keys.indexOf(k));
  el.querySelector('.knopf').style.transform = `translateX(${i * 50}px)`;
  el.querySelectorAll('.knopf span').forEach(s => s.classList.toggle('an', s.dataset.k === k));
  el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
}

function ansichtSetzen(neu) {
  if (DESKTOP.matches && neu === 'zeit') neu = 'globus';
  const alt = app.ansicht;
  app.ansicht = neu;
  umschalterSetzen(neu);
  document.documentElement.classList.toggle('fest', neu === 'globus');
  document.documentElement.classList.toggle('ohne-fuss', neu === 'zeit');
  if (neu === 'globus') window.scrollTo(0, 0);
  const reihenfolge = ['zeit', 'globus', 'bogen'];
  const kombi = DESKTOP.matches && neu !== 'bogen';
  app.ansichten.classList.toggle('kombi', kombi);
  for (const el of app.ansichten.children) {
    const k = el.dataset.ansicht;
    const an = kombi ? (k === 'zeit' || k === 'globus') : k === neu;
    const warAn = el.classList.contains('an');
    el.classList.toggle('an', an);
    if (an && !warAn && alt && !kombi) el.classList.toggle('von-links', reihenfolge.indexOf(neu) < reihenfolge.indexOf(alt));
  }
  if (neu === 'bogen' && !app.bogen) {
    app.bogen = bogenBauen(ALBEN);
    app.ansichten.querySelector('[data-ansicht="bogen"]').append(app.bogen);
  }
  requestAnimationFrame(() => {
    if (app.zeitstrahl) zeitstrahlStarten(app.zeitstrahl);
    if (app.globus && app.globus.el.offsetParent) { app.globus.render(); app.globus.starten(); }
    if (app.bogen && app.bogen.offsetParent) app.bogen.classList.add('laeuft');
  });
  if (neu !== 'globus' && app.globus && app.globus.tiefe > 1) app.globus.zurWelt(true);
}

/* ================================================================== */
/* Album                                                               */
/* ================================================================== */

class AlbumAnsicht {
  constructor(album, index, vorschau = false) {
    this.a = album;
    this.vorschau = vorschau;
    this.i = Math.max(0, Math.min(album.fotos.length - 1, index));
    this.dunkel = speicher.lies('dunkel') === '1';
    this.drehung = 0;
    this.diaCache = new Map();
    this.wechsel = null;
    this.bauen();
    this.zeigen(0);
    this.tasten = e => {
      if (e.key === 'ArrowRight') this.gehe(1);
      else if (e.key === 'ArrowLeft') this.gehe(-1);
      else if (e.key === 'Escape') { if (this.infoEl && !this.infoEl.hidden) this.infoUm(false); else albumSchliessen(); }
    };
    document.addEventListener('keydown', this.tasten);
    this.groesse = () => this.layout();
    addEventListener('resize', this.groesse);
  }

  bauen() {
    const a = this.a;
    const bruch = () => h('span', { class: 'bruch zahl', 'aria-label': `${a.monatLang} ${a.jahr}` }, h('span', { text: a.mon }), h('i'), h('span', { class: 'j', text: String(a.jahr) }));
    this.nrEl = h('span', { class: 'rolle' });
    this.nrEl2 = h('span', { class: 'rolle' });
    this.kontrast = h('span', { class: 'kontrast-icon', icon: 'kontrast' });
    this.spur = h('div', { class: 'spur' });
    this.randL = h('span', { class: 'rand-links', 'aria-hidden': 'true' });
    this.randR = h('span', { class: 'rand-rechts', 'aria-hidden': 'true' });
    this.buehne = h('div', { class: 'buehne' }, this.spur, this.randL, this.randR,
      h('span', { class: 'tippzone links', 'aria-hidden': 'true' }), h('span', { class: 'tippzone rechts', 'aria-hidden': 'true' }),
      h('button', { class: 'unsichtbar', text: 'Vorheriges Foto', onclick: () => this.gehe(-1) }),
      h('button', { class: 'unsichtbar', text: 'Nächstes Foto', onclick: () => this.gehe(1) }));
    this.striche = h('div', { class: 'striche', role: 'group', 'aria-label': `${a.fotos.length} Fotos` },
      ...a.fotos.map((f, k) => h('button', { class: 'strich', type: 'button', 'aria-label': `Foto ${k + 1} von ${a.fotos.length}`, onclick: () => this.springeZu(k) }, h('i'))));
    this.exifMobil = h('dl', { class: 'exif zahl' });
    this.exifDesk = h('dl', { class: 'exif zahl' });
    this.titelMobil = h('span', { class: 'album-titel', text: a.titel });
    this.titelDesk = h('h1', { text: a.titel });
    const gleich = x => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const ortName = a.ort && a.ort.name && gleich(a.ort.name) !== gleich(a.titel) ? a.ort.name : '';
    this.infoEl = h('section', { class: 'info-blatt', hidden: true, 'aria-label': 'Albuminformationen' },
      h('button', { class: 'blatt-zu', 'aria-label': 'Schließen', icon: 'zu', onclick: () => this.infoUm(false) }),
      h('h2', { text: a.titel }),
      h('p', { class: 'meta zahl', text: `${ortName ? `${ortName} · ` : ''}${a.monatLang} ${a.jahr} · Album ${a.nrText} · ${anzahl(a.fotos.length, 'Foto', 'Fotos')}` }),
      a.text ? h('p', { class: 'kurztext', text: a.text }) : h('div', { style: { height: '14px' } }),
      this.exifMobil);

    this.el = h('div', { class: `album${this.dunkel ? ' dunkel' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': `Album ${a.titel}` },
      h('div', { class: 'album-oben' },
        h('a', { class: 'album-zurueck-oben', href: '#/', onclick: e => { e.preventDefault(); albumSchliessen(); } }, h('span', { icon: 'links' }), h('span', { text: 'Übersicht' })),
        h('div', { class: 'rechts' },
          h('button', { class: 'icon-knopf info-knopf', 'aria-label': 'Albuminformationen', icon: 'info', onclick: () => this.infoUm(true) }),
          h('button', { class: 'icon-knopf', 'aria-label': 'Hell oder dunkel', onclick: () => this.kontrastUm() }, this.kontrast))),
      h('div', { class: 'album-mitte' },
        h('div', { class: 'buehne-spalte' }, this.buehne, this.striche),
        h('aside', { class: 'album-seite' },
          bruch(), this.titelDesk,
          ortName ? h('p', { class: 'album-ort-desk', text: ortName }) : null,
          h('span', { class: 'album-nr zahl' }, `${a.nrText}/`, this.nrEl2),
          a.text ? h('p', { class: 'kurztext', text: a.text }) : null,
          this.exifDesk,
          h('p', { class: 'tasten', text: '← → blättern · Esc schließen' }))),
      h('div', { class: 'album-fuss' },
        h('a', { class: 'icon-knopf zurueck-pfeil', href: '#/', 'aria-label': 'Zurück zur Übersicht', icon: 'links', onclick: e => { e.preventDefault(); albumSchliessen(); } }),
        bruch(), h('span', { class: 'album-titelblock' }, this.titelMobil, ortName ? h('span', { class: 'album-ort', text: ortName }) : null),
        h('span', { class: 'album-nr zahl' }, `${a.nrText}/`, this.nrEl)),
      this.infoEl);
    this.el.querySelector('.album-zurueck-oben span').innerHTML = ICON.links;
    this.wischenEinrichten();
  }

  titelFuerUebergang() { return DESKTOP.matches ? this.titelDesk : this.titelMobil; }

  kontrastUm() {
    this.dunkel = !this.dunkel;
    this.drehung += 225;
    this.kontrast.style.transform = `rotate(${this.drehung}deg)`;
    this.el.classList.toggle('dunkel', this.dunkel);
    speicher.schreib('dunkel', this.dunkel ? '1' : '0');
  }

  infoUm(an) { this.infoEl.hidden = !an; }

  massFuer(foto) {
    const b = this.buehne.getBoundingClientRect();
    const seite = DESKTOP.matches ? 40 : 20;
    const bw = Math.max(50, b.width - 2 * seite), bh = Math.max(50, b.height - (DESKTOP.matches ? 0 : 4));
    const f = Math.min(bw / foto.w, bh / foto.h);
    return { w: Math.round(foto.w * f), h: Math.round(foto.h * f), bw: b.width };
  }

  dia(index) {
    if (this.diaCache.has(index)) return this.diaCache.get(index);
    const foto = this.a.fotos[index];
    const img = h('img', { src: bildUrl(this.a, foto, 1600), srcset: srcset(this.a, foto), sizes: DESKTOP.matches ? '60vw' : '100vw', alt: `${this.a.titel}, Foto ${pad(index + 1, 3)}`, draggable: 'false', decoding: 'async' });
    const d = h('div', { class: 'dia' }, img);
    d.img = img; d.foto = foto;
    this.diaCache.set(index, d);
    return d;
  }

  breite() { return this.buehne.clientWidth || innerWidth; }

  /* Position der Spur in Pixeln setzen (ohne Animation) */
  spurAuf(px) {
    this.spur.style.transition = 'none';
    this.spur.style.transform = `translateX(${px}px)`;
  }

  zeigen(richtung, startPx = 0) {
    const n = this.a.fotos.length;
    this.spurAuf(startPx);
    const dias = [];
    for (const off of [-1, 0, 1]) {
      const j = this.i + off;
      if (j < 0 || j >= n) continue;
      const d = this.dia(j);
      d.style.transform = `translateX(${off * 100}%)`;
      dias.push(d);
    }
    // Zwischenspeicher klein halten
    for (const k of this.diaCache.keys()) if (Math.abs(k - this.i) > 3) this.diaCache.delete(k);
    this.spur.replaceChildren(...dias);
    this.aktuell = dias.find(d => d.foto === this.a.fotos[this.i]);
    this.layout();
    const nrText = pad(this.i + 1, 3);
    for (const el of [this.nrEl, this.nrEl2]) {
      el.replaceChildren(h('span', { class: richtung > 0 ? 'auf' : richtung < 0 ? 'ab' : '', text: nrText }));
    }
    this.striche.querySelectorAll('.strich').forEach((b, k) => { b.classList.toggle('an', k === this.i); if (k === this.i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
    this.exifFuellen();
    if (!this.vorschau) history.replaceState(null, '', `#/album/${this.a.nr}/${this.i + 1}`);
    for (const j of [this.i + 2, this.i - 2]) if (j >= 0 && j < n) { const im = new Image(); im.src = bildUrl(this.a, this.a.fotos[j], 1600); }
  }

  layout() {
    for (const d of this.spur.children) {
      const m = this.massFuer(d.foto);
      d.img.style.width = `${m.w}px`;
      d.img.style.height = `${m.h}px`;
    }
    const m = this.massFuer(this.a.fotos[this.i]);
    for (const r of [this.randL, this.randR]) r.style.height = `${m.h}px`;
    this.striche.style.maxWidth = `${Math.max(m.w, 160)}px`;
    this.randL.style.opacity = this.i > 0 ? 1 : 0;
    this.randR.style.opacity = this.i < this.a.fotos.length - 1 ? 1 : 0;
  }

  exifFuellen() {
    const e = this.a.fotos[this.i].exif || {};
    const zeilen = [
      ['Kamera', e.kamera],
      ['Objektiv', [e.objektiv, e.brennweite].filter(Boolean).join(' · ')],
      ['Belichtung', [e.blende, e.belichtung, e.iso ? `ISO ${e.iso}` : ''].filter(Boolean).join(' · ')],
      ['Aufnahme', exifDatum(e.datum)],
    ].filter(z => z[1]);
    for (const dl of [this.exifMobil, this.exifDesk]) dl.replaceChildren(...zeilen.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]));
  }

  /* Läuft noch ein Wechsel? Dann sofort abschließen und die aktuelle Position übernehmen.
     So kann ohne Warten weiter gewischt oder getippt werden. */
  abschliessen() {
    if (!this.wechsel) return null;
    const { timer, j, r } = this.wechsel;
    clearTimeout(timer);
    this.wechsel = null;
    let x = 0;
    try { x = new DOMMatrixReadOnly(getComputedStyle(this.spur).transform).m41; } catch { /* egal */ }
    this.i = j;
    const neu = x + r * this.breite();
    this.zeigen(r, neu);
    return neu;
  }

  /* Wechsel zum Nachbarfoto animieren, ausgehend von der aktuellen Spurposition */
  wechseln(r, dauer) {
    const j = this.i + r;
    this.spur.style.transition = `transform ${dauer}ms cubic-bezier(.2,.8,.2,1)`;
    this.spur.style.transform = `translateX(${-r * this.breite()}px)`;
    this.wechsel = { j, r, timer: setTimeout(() => {
      this.wechsel = null;
      this.i = j;
      this.zeigen(r, 0);
    }, dauer) };
  }

  gehe(r) {
    const basis = this.abschliessen();
    const j = this.i + r;
    if (j < 0 || j >= this.a.fotos.length) {
      if (basis) { this.spur.style.transition = 'transform 300ms cubic-bezier(.2,.8,.2,1)'; this.spur.style.transform = 'translateX(0)'; }
      else this.federn(r);
      return;
    }
    if (basis !== null) this.spurAuf(basis);
    this.wechseln(r, ruhig() ? 1 : 300);
  }

  federn(r) {
    if (!this.aktuell || ruhig()) return;
    this.aktuell.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-r * 9}%)` }, { transform: 'translateX(0)' }],
      { duration: 520, easing: 'cubic-bezier(.3,1.6,.5,1)' });
  }

  /* Zwei-Finger-Zoom wie bei Instagram: zoomt und verschiebt, solange mindestens ein Finger liegt.
     Erst wenn alle Finger losgelassen sind, springt das Bild zurück. */
  zoomStart(zeiger) {
    const img = this.aktuell && this.aktuell.img;
    if (!img) return;
    const [a, b] = [...zeiger.values()];
    const r = img.getBoundingClientRect();
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    img.style.transition = 'none';
    img.style.transformOrigin = `${m.x - r.left}px ${m.y - r.top}px`;
    this.zoom = { img, s: 1, tx: 0, ty: 0 };
    this.zoomBasis(zeiger);
    this.el.classList.add('zoomt');
  }

  zoomBasis(zeiger) {
    const z = this.zoom;
    const pts = [...zeiger.values()];
    const m = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    z.basis = { s: z.s, tx: z.tx, ty: z.ty, m, d: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1 : null };
  }

  zoomBewegen(zeiger) {
    const z = this.zoom, b = z.basis;
    const pts = [...zeiger.values()];
    if (!pts.length) return;
    let m = pts[0];
    if (pts.length > 1 && b.d) {
      m = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const f = b.s * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / b.d;
      z.s = f < 1 ? 1 - (1 - f) * 0.35 : Math.min(f, 5);
    }
    z.tx = b.tx + m.x - b.m.x;
    z.ty = b.ty + m.y - b.m.y;
    z.img.style.transform = `translate(${z.tx}px, ${z.ty}px) scale(${z.s})`;
  }

  zoomEnde() {
    const z = this.zoom;
    this.zoom = null;
    if (!z) return;
    z.img.style.transition = 'transform .32s cubic-bezier(.2,.8,.2,1)';
    z.img.style.transform = '';
    setTimeout(() => { if (!this.zoom) this.el.classList.remove('zoomt'); }, 330);
  }

  wischenEinrichten() {
    let s = null;
    const b = this.buehne;
    const zeiger = new Map();
    b.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.zoom) { this.zoomBasis(zeiger); return; }
      if (zeiger.size === 2) {
        // zweiter Finger: Wischen abbrechen, Zoom beginnen
        if (s && s.zieht) { this.spur.style.transition = 'transform 200ms ease'; this.spur.style.transform = 'translateX(0)'; }
        s = null;
        this.zoomStart(zeiger);
        return;
      }
      if (zeiger.size > 2 || this.zoom) return;
      // laufenden Wechsel sofort übernehmen: das Bild bleibt unter dem Finger
      const basis = this.abschliessen();
      s = { x: e.clientX, y: e.clientY, id: e.pointerId, zieht: false, t: performance.now(), basis: basis || 0, unterbrochen: basis !== null };
      if (basis !== null) this.spurAuf(basis);
    });
    b.addEventListener('pointermove', e => {
      if (zeiger.has(e.pointerId)) zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.zoom) { this.zoomBewegen(zeiger); return; }
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.zieht) {
        if (!s.unterbrochen && (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy))) return;
        if (s.unterbrochen && Math.abs(dx) < 2) return;
        s.zieht = true;
        try { b.setPointerCapture(e.pointerId); } catch { /* egal */ }
      }
      const x = s.basis + dx;
      const amRand = (x > 0 && this.i === 0) || (x < 0 && this.i === this.a.fotos.length - 1);
      this.spurAuf(amRand ? x * 0.3 : x);
    });
    const ende = e => {
      zeiger.delete(e.pointerId);
      if (this.zoom) { if (zeiger.size) this.zoomBasis(zeiger); else this.zoomEnde(); return; }
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x;
      const war = s;
      s = null;
      const x = war.basis + dx;
      if (!war.zieht) {
        if (e.type === 'pointerup' && performance.now() - war.t < 500) {
          const r = b.getBoundingClientRect();
          this.gehe(e.clientX < r.left + r.width / 2 ? -1 : 1);
        }
        else if (war.unterbrochen) {
          this.spur.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1)';
          this.spur.style.transform = 'translateX(0)';
        }
        return;
      }
      const breite = this.breite();
      const tempo = dx / Math.max(1, performance.now() - war.t);
      const r = (Math.abs(tempo) > 0.35 ? -Math.sign(tempo) : -Math.sign(x)) || 1;
      const j = this.i + r;
      const weit = Math.abs(x) > breite * 0.15 || Math.abs(tempo) > 0.35;
      if (weit && j >= 0 && j < this.a.fotos.length && Math.sign(x) !== r) {
        const rest = Math.abs(-r * breite - x) / breite;
        this.wechseln(r, ruhig() ? 1 : Math.round(140 + 180 * rest));
      } else {
        this.spur.style.transition = 'transform 420ms cubic-bezier(.3,1.5,.5,1)';
        this.spur.style.transform = 'translateX(0)';
      }
    };
    b.addEventListener('pointerup', ende);
    b.addEventListener('pointercancel', ende);
  }

  springeZu(k) {
    this.abschliessen();
    if (k === this.i) return;
    const r = Math.sign(k - this.i);
    this.i = k;
    this.zeigen(r);
  }

  geheZuPosition(pos) {
    const j = Math.max(0, Math.min(this.a.fotos.length - 1, pos - 1));
    if (j !== this.i) { this.abschliessen(); this.i = j; this.zeigen(0); }
  }

  entfernen() {
    document.removeEventListener('keydown', this.tasten);
    removeEventListener('resize', this.groesse);
    this.el.remove();
  }
}

function albumOeffnen(nr, fotoNr) {
  const a = ALBEN.find(x => x.nr === nr);
  if (!a) { location.replace('#/'); return; }
  if (app.album && app.album.a === a) { if (fotoNr) app.album.geheZuPosition(fotoNr); return; }
  vorschauVerbergen();
  blattSchliessen();
  const index = fotoNr ? fotoNr - 1 : 0;
  const quelle = document.querySelector(`.eintrag[data-nr="${nr}"] .titel`);
  const oeffnen = () => {
    if (app.album) app.album.entfernen();
    app.album = new AlbumAnsicht(a, index);
    document.body.append(app.album.el);
    document.documentElement.style.overflow = 'hidden';
    app.album.layout();
    if (quelle) { quelle.style.viewTransitionName = ''; app.album.titelFuerUebergang().style.viewTransitionName = 'albumtitel'; }
    document.title = `${a.titel} · ${document.body.dataset.titel}`;
  };
  if (quelle && quelle.offsetParent && document.startViewTransition && !ruhig()) {
    quelle.style.viewTransitionName = 'albumtitel';
    document.startViewTransition(oeffnen);
  } else oeffnen();
}

async function vorschauOeffnen(nr) {
  try {
    const r = await fetch(`admin/api.php?aktion=vorschau&nr=${nr}`, { credentials: 'same-origin', cache: 'no-store' });
    const d = await r.json();
    if (!r.ok || !d.ok) throw new Error(d.fehler || 'Vorschau nicht möglich');
    const [a] = datenVorbereiten({ alben: [d.album] });
    if (!a) throw new Error('Das Album hat noch keine Fotos.');
    if (app.album) app.album.entfernen();
    app.album = new AlbumAnsicht(a, 0, true);
    document.body.append(app.album.el);
    document.documentElement.style.overflow = 'hidden';
    app.album.layout();
    document.title = `Vorschau: ${a.titel} · ${document.body.dataset.titel}`;
  } catch (err) {
    textseiteSchliessen();
    app.textseite = h('div', { class: 'textseite' }, h('div', { class: 'textseite-innen' }, h('h1', { text: 'Vorschau' }), h('p', { class: 'text', text: `${err.message} Bitte in der Verwaltung angemeldet sein.` })));
    document.body.append(app.textseite);
  }
}

function albumSchliessen() {
  if (app.album && app.album.vorschau) { location.href = `admin/#/album/${app.album.a.nr}`; return; }
  location.hash = app.letzteUebersicht || '#/';
}

function albumEntfernen() {
  if (!app.album) return;
  const alt = app.album;
  app.album = null;
  const ziel = document.querySelector(`.eintrag[data-nr="${alt.a.nr}"] .titel`);
  const weg = () => {
    alt.entfernen();
    document.documentElement.style.overflow = '';
    if (ziel) ziel.style.viewTransitionName = 'albumtitel';
    document.title = document.body.dataset.titel;
  };
  if (ziel && document.startViewTransition && !ruhig()) {
    alt.titelFuerUebergang().style.viewTransitionName = 'albumtitel';
    const t = document.startViewTransition(weg);
    t.finished.finally(() => { ziel.style.viewTransitionName = ''; });
  } else weg();
}

/* ================================================================== */
/* Textseiten                                                          */
/* ================================================================== */

const TEXTSEITEN = {
  ueber: 'Über mich',
  impressum: 'Impressum',
  datenschutz: 'Datenschutz',
};

function textseiteZeigen(key) {
  textseiteSchliessen();
  const s = DATEN.seiten || {};
  const text = h('div', { class: 'text', text: s[key] || '' });
  const innen = h('div', { class: 'textseite-innen' },
    h('a', { class: 'zurueck', href: app.letzteUebersicht || '#/' }, h('span', { icon: 'links' }), h('span', { text: 'Zurück' })),
    h('h1', { text: TEXTSEITEN[key] }), text);
  if (key === 'ueber' && s.kontakt) {
    innen.append(h('p', { class: 'text', style: { marginTop: '28px' } }, 'Kontakt: ', h('a', { href: `mailto:${s.kontakt}`, text: s.kontakt })));
  }
  innen.querySelector('.zurueck span').innerHTML = ICON.links;
  app.textseite = h('div', { class: 'textseite', role: 'dialog', 'aria-label': TEXTSEITEN[key] }, innen);
  document.body.append(app.textseite);
  document.documentElement.style.overflow = 'hidden';
  document.title = `${TEXTSEITEN[key]} · ${document.body.dataset.titel}`;
}
function textseiteSchliessen() {
  if (!app.textseite) return;
  app.textseite.remove();
  app.textseite = null;
  document.documentElement.style.overflow = '';
  document.title = document.body.dataset.titel;
}

/* ================================================================== */
/* Routing                                                             */
/* ================================================================== */

async function route() {
  const teile = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const [a, b, c] = teile;

  if (a === 'vorschau' && b) {
    textseiteSchliessen();
    vorschauOeffnen(Number(b));
    return;
  }
  if (a === 'album' && b) {
    textseiteSchliessen();
    albumOeffnen(Number(b), c ? Number(c) : null);
    return;
  }
  albumEntfernen();

  if (TEXTSEITEN[a]) { textseiteZeigen(a); return; }
  textseiteSchliessen();

  if (!ALBEN.length) return;
  app.letzteUebersicht = location.hash || '#/';
  if (a === 'globus') {
    ansichtSetzen('globus');
    if (b) {
      // Direktlink auf ein Land: als Zoomstufe öffnen
      location.replace('#/globus');
      await app.globus.zurWelt(true);
      requestAnimationFrame(() => app.globus.landZeigen(b.toUpperCase()));
    }
    return;
  }
  if (a === 'zeit' || a === 'bogen') { ansichtSetzen(a); return; }
  ansichtSetzen(app.ansicht || 'globus');
}

/* ================================================================== */
/* Start                                                               */
/* ================================================================== */

function gestenSperren() {
  // Seitenzoom verhindern (iOS-Gesten, zwei Finger, Strg+Mausrad, Strg+Plus/Minus)
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, e => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault(); });
  // Zurückwischen vom Bildschirmrand (Safari) so weit wie möglich abfangen
  document.addEventListener('touchstart', e => {
    const t = e.touches[0];
    if (!t || e.touches.length > 1) return;
    const amRand = t.clientX < 16 || t.clientX > innerWidth - 16;
    if (amRand && !(e.target instanceof Element && e.target.closest('a, button, input, textarea, select'))) e.preventDefault();
  }, { passive: false });
}

async function start() {
  gestenSperren();
  // Beim Laden immer mit dem Globus beginnen (Direktlinks auf Alben und Textseiten bleiben erhalten)
  const ziel = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (!['album', 'vorschau', 'ueber', 'impressum', 'datenschutz'].includes(ziel) && location.hash && location.hash !== '#/') history.replaceState(null, '', '#/');
  try {
    const r = await fetch('data/site.json', { cache: 'no-cache' });
    if (r.ok) DATEN = await r.json();
  } catch { /* leer */ }
  ALBEN = datenVorbereiten(DATEN);
  app.punkte = punkteBilden(ALBEN);
  document.body.dataset.titel = document.title;

  const neuestes = ALBEN.find(x => x.hatOrt);
  const koord = document.querySelector('.koord');
  if (neuestes) { koord.textContent = koordinaten(neuestes.ort); koord.setAttribute('aria-label', `Koordinaten des neuesten Albums: ${neuestes.ort.name}`); }
  else koord.textContent = '';

  const kopf = document.querySelector('.kopf');
  const haupt = document.querySelector('#haupt');

  if (!ALBEN.length) {
    haupt.append(h('p', { class: 'leer', text: 'Noch keine Alben veröffentlicht.' }));
  } else {
    app.umschalter = umschalterBauen();
    kopf.querySelector('.marke').after(app.umschalter);
    app.zeitstrahl = zeitstrahlBauen(ALBEN);
    app.globusAnsicht = globusAnsichtBauen(ALBEN, app.punkte);
    app.ansichten = h('div', { class: 'ansichten' },
      h('div', { class: 'ansicht', 'data-ansicht': 'zeit' }, app.zeitstrahl),
      h('div', { class: 'ansicht', 'data-ansicht': 'globus' }, app.globusAnsicht),
      h('div', { class: 'ansicht', 'data-ansicht': 'bogen' }));
    haupt.append(app.ansichten);
    DESKTOP.addEventListener('change', () => {
      const neu = umschalterBauen();
      app.umschalter.replaceWith(neu);
      app.umschalter = neu;
      ansichtSetzen(app.ansicht === 'zeit' && DESKTOP.matches ? 'globus' : (app.ansicht || 'globus'));
    });
  }
  addEventListener('hashchange', route);
  await route();
}

start();
