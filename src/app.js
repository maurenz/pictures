/* Foto-Portfolio · öffentliche Website */
import { geoOrthographic, geoPath, geoDistance, geoContains, geoCentroid } from 'd3-geo';
import { feature, merge } from 'topojson-client';
import ISO from './iso.json';
import REGIONEN from './regionen.json';

/* ================================================================== */
/* Grundlagen                                                          */
/* ================================================================== */

const MON = ['JAN', 'FEB', 'MÄR', 'APR', 'MAI', 'JUN', 'JUL', 'AUG', 'SEP', 'OKT', 'NOV', 'DEZ'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const DESKTOP = matchMedia('(min-width: 960px)');
const RUHIG = matchMedia('(prefers-reduced-motion: reduce)');
const MAUS = matchMedia('(hover: hover) and (pointer: fine)');
const TEMPO = 340; // Zeitstrahl: mittlere Pixel pro Sekunde (sanft an- und auslaufend)

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

/* Entfernung zweier Orte in km */
function km(a, b) {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(x)));
}
const hatKoord = a => a && a.ort && Number.isFinite(a.ort.lat) && Number.isFinite(a.ort.lon);

/* Alben im selben Monat so ordnen, dass der Weg zwischen den Orten am kürzesten ist
   (inklusive Übergang zum vorherigen und nächsten Album). Gleiche Logik wie in der Verwaltung. */
function besteFolge(gruppe, vor, nach) {
  const mit = gruppe.filter(hatKoord), ohne = gruppe.filter(a => !hatKoord(a));
  if (mit.length < 2) return gruppe;
  const kosten = folge => {
    let k = 0;
    if (hatKoord(vor)) k += km(vor.ort, folge[0].ort);
    for (let i = 1; i < folge.length; i++) k += km(folge[i - 1].ort, folge[i].ort);
    if (hatKoord(nach)) k += km(folge[folge.length - 1].ort, nach.ort);
    return k;
  };
  let beste = mit, besteK = kosten(mit);
  if (mit.length <= 7) {
    const permutieren = (rest, bisher) => {
      if (!rest.length) { const k = kosten(bisher); if (k < besteK - 1e-6) { besteK = k; beste = bisher; } return; }
      rest.forEach((x, i) => permutieren([...rest.slice(0, i), ...rest.slice(i + 1)], [...bisher, x]));
    };
    permutieren(mit, []);
  }
  return [...beste, ...ohne];
}

function zeitlichOrdnen(alben) {
  const auf = [...alben].sort((a, b) => (a.jahr - b.jahr) || (a.monat - b.monat) || (a.nr - b.nr));
  const aus = [];
  for (let i = 0; i < auf.length;) {
    let j = i;
    while (j < auf.length && auf[j].jahr === auf[i].jahr && auf[j].monat === auf[i].monat) j++;
    const gruppe = auf.slice(i, j);
    aus.push(...(gruppe.length > 1 ? besteFolge(gruppe, aus[aus.length - 1], auf[j]) : gruppe));
    i = j;
  }
  return aus;
}

/* Ort, falls er sich vom Albumnamen unterscheidet */
function ortAnders(a) {
  const gleich = x => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return a.ort && a.ort.name && gleich(a.ort.name) !== gleich(a.titel) ? a.ort.name : '';
}

function titelBlock(a) {
  const ort = ortAnders(a);
  return h('span', { class: 'titel' }, h('span', { class: 'titel-text', text: a.titel }), ort ? h('span', { class: 'titel-ort', text: ort }) : null);
}

function datenVorbereiten(roh) {
  const alben = zeitlichOrdnen((roh.alben || []).filter(a => a.fotos && a.fotos.length)).reverse();
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

/* Orte für den Globus (je Land gesammelt) */
function punkteBilden(alben) {
  const laender = new Map();
  alben.forEach((a, i) => { a.rang = i; }); // feste Reihenfolge wie im Zeitstrahl
  for (const a of alben) {
    if (!a.hatOrt) continue;
    const lk = a.ort.land || `X${a.nr}`;
    if (!laender.has(lk)) laender.set(lk, { land: lk, name: a.ort.landName || a.ort.name, orte: new Map() });
    const l = laender.get(lk);
    if (!l.orte.has(a.ortKey)) l.orte.set(a.ortKey, { key: `O:${a.ortKey}`, typ: 'ort', name: a.ort.name, land: lk, landName: l.name, regionen: Array.isArray(a.ort.regionen) ? a.ort.regionen : [], lat: a.ort.lat, lon: a.ort.lon, alben: [] });
    l.orte.get(a.ortKey).alben.push(a);
  }
  const zoom = new Map();
  const orte = [];
  for (const l of laender.values()) {
    const o = [...l.orte.values()];
    zoom.set(l.land, { ...l, orte: o });
    orte.push(...o);
  }
  return { orte, zoom, baum: ortBaum(orte) };
}

/* kleinste Verwaltungsebene (Stadt, Kreis, Bundesland …), in der alle Orte liegen; sonst null */
function gemeinsameRegion(orte) {
  const [erst, ...rest] = orte;
  return erst.regionen.find(r => rest.every(o => o.regionen.includes(r))) || null;
}

/* Nahe Orte schrittweise zusammenfassen. d = Winkelabstand, ab dem ein Knoten in seine Teile zerfällt */
function ortBaum(orte) {
  let k = orte.map(o => Object.assign(o, { d: 0, kinder: null, orte: [o] }));
  let n = 0;
  while (k.length > 1) {
    let best = Infinity, bi = 0, bj = 1;
    for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) {
      const d = geoDistance([k[i].lon, k[i].lat], [k[j].lon, k[j].lat]);
      if (d < best) { best = d; bi = i; bj = j; }
    }
    const a = k[bi], b = k[bj];
    const alle = [...a.orte, ...b.orte];
    const laender = [...new Set(alle.map(o => o.landName))];
    k.splice(bj, 1);
    k[bi] = {
      key: `G:${n++}`, typ: 'gruppe', kinder: [a, b], orte: alle,
      d: Math.max(best, a.d, b.d),
      lat: mittel(alle.map(o => o.lat)), lon: mittelLon(alle.map(o => o.lon)),
      alben: alle.flatMap(o => o.alben).sort((x, y) => x.rang - y.rang),
      name: laender.length === 1 ? (gemeinsameRegion(alle) || laender[0]) : laender.length === 2 ? `${laender[0]}, ${laender[1]}` : `${laender[0]} +${laender.length - 1}`,
    };
  }
  return k[0] || null;
}
/* Flächen in einzelne Polygone mit umschließendem Kreis zerlegen (zum schnellen Aussortieren) */
function teilflaechen(geo, mitStufen = false) {
  const polys = [];
  const add = g => {
    if (!g) return;
    if (g.type === 'FeatureCollection') g.features.forEach(f => add(f.geometry));
    else if (g.type === 'Feature') add(g.geometry);
    else if (g.type === 'GeometryCollection') g.geometries.forEach(add);
    else if (g.type === 'Polygon') polys.push(g.coordinates);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(c => polys.push(c));
  };
  add(geo);
  return polys.map(coords => {
    const c = geoCentroid({ type: 'MultiPoint', coordinates: coords[0] });
    let rad = 0;
    for (const q of coords[0]) rad = Math.max(rad, geoDistance(c, q));
    if (!mitStufen) return { coords, c, rad };
    // ausgedünnte Ringe für schwächere Zoomstufen (Ringe bleiben geschlossen)
    let weg = 0;
    for (let k = 1; k < coords[0].length; k++) weg += geoDistance(coords[0][k - 1], coords[0][k]);
    const stufen = [coords];
    for (let schritt = 2; schritt <= 8; schritt *= 2) {
      stufen.push(coords.map(r => {
        if (r.length <= 4 * schritt) return r;
        const d = r.filter((_, k) => k % schritt === 0);
        d.push(r[r.length - 1]);
        return d;
      }));
    }
    return { coords, c, rad, stufen, abstand: weg / Math.max(1, coords[0].length - 1) };
  });
}
/* Küstenlinien als kurze Linienstücke mit umschließendem Kreis: außerhalb des Bildes entfällt die Rechenarbeit */
function teillinien(geo, n = 40) {
  const stuecke = [];
  for (const { coords } of teilflaechen(geo)) {
    for (const ring of coords) {
      for (let i = 0; i < ring.length - 1; i += n) {
        const st = ring.slice(i, Math.min(ring.length, i + n + 1));
        const c = geoCentroid({ type: 'MultiPoint', coordinates: st });
        let rad = 0, weg = 0;
        for (let k = 0; k < st.length; k++) {
          rad = Math.max(rad, geoDistance(c, st[k]));
          if (k) weg += geoDistance(st[k - 1], st[k]);
        }
        // ausgedünnte Fassungen (jeder 2., 4., 8. Punkt) für Zoomstufen, in denen Punkte unter einem Pixel lägen
        const stufen = [st];
        for (let schritt = 2; schritt <= 8; schritt *= 2) {
          const d = st.filter((_, k) => k % schritt === 0);
          if (d[d.length - 1] !== st[st.length - 1]) d.push(st[st.length - 1]);
          stufen.push(d);
        }
        stuecke.push({ coords: st, stufen, abstand: weg / Math.max(1, st.length - 1), c, rad });
      }
    }
  }
  return stuecke;
}
/* Flächen samt ihren Linienstücken: am Horizont als geschlossene Fläche, sonst als Linien gezeichnet */
function kuestenflaechen(geo, n = 40) {
  return teilflaechen(geo).map(t => ({ ...t, stuecke: teillinien({ type: 'Polygon', coordinates: t.coords }, n) }));
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
    this.aktiv = 0;
    this.gestartet = false;
    this.theta = null;
    this.sicht = '';

    this.el = h('div', { class: 'globus' });
    this.svg = svgEl('svg', { 'aria-hidden': 'true' });
    this.kugel = svgEl('path', { class: 'kugel' });
    this.land = svgEl('path', { class: 'land', pathLength: '1' });
    // schwarzer Abschluss der Kontinente am Horizont: grobe Flächen, nur in einem schmalen Ring um den Kugelrand sichtbar
    const ringId = `horizont-${Math.random().toString(36).slice(2, 8)}`;
    this.horizontRing = svgEl('path', { 'clip-rule': 'evenodd' });
    const clip = svgEl('clipPath', { id: ringId });
    clip.append(this.horizontRing);
    const defs = svgEl('defs');
    defs.append(clip);
    this.horizont = svgEl('path', { class: 'horizont', 'clip-path': `url(#${ringId})` });
    // eigene Projektion mit feiner Unterteilung, damit der Abschluss exakt auf dem Kugelrand liegt
    this.projH = geoOrthographic().clipAngle(90).precision(0.1);
    this.pfadH = geoPath(this.projH);
    // Reihenfolge: graue Flächen, grauer Kugelrand, schwarze Linien (Rand bleibt hinter den Konturen sichtbar)
    this.laenderG = svgEl('g', { class: 'laender' });
    this.grenzenG = svgEl('g', { class: 'grenzen' });
    this.svg.append(defs, this.laenderG, this.kugel, this.grenzenG, this.land, this.horizont);
    this.punkteEl = h('div', { class: 'punkte' });
    this.el.append(this.svg, this.punkteEl);
    this.knoepfe = new Map();

    new ResizeObserver(() => this.planen()).observe(this.el);
    this.ziehenEinrichten();
    this.geoLaden();
  }

  get gezoomt() { return this.skala > 1.001; }

  /* Neu zeichnen im nächsten Bild, höchstens 60-mal pro Sekunde (auch auf 120-Hz-Bildschirmen) */
  planen() {
    this.schmutzig = true;
    if (this.raf) return;
    const tick = t => {
      if (t - (this.zuletztGezeichnet || 0) < 15.5) { this.raf = requestAnimationFrame(tick); return; }
      this.raf = 0;
      this.zuletztGezeichnet = t;
      if (this.schmutzig) { this.schmutzig = false; this.render(); }
    };
    this.raf = requestAnimationFrame(tick);
  }

  /* kurz nach dem Ende einer Bewegung: feine Karte und Infozeile nachziehen */
  beruhigt() {
    clearTimeout(this.ruheTimer);
    this.ruheTimer = setTimeout(() => { this.ruhe = true; this.planen(); }, 180);
    this.ruhe = false;
  }

  async geoLaden() {
    try {
      const t = await (await fetch('assets/geo/land.json')).json();
      this.land110 = kuestenflaechen(feature(t, t.objects.land));
      this.grobFeatures = feature(t, t.objects.countries).features;
      this.grobeLaender = new Map(this.grobFeatures.map(f => [String(f.id), f]));
      if (this.laenderPfade) for (const lp of this.laenderPfade) this.grobSetzen(lp);
      this.regionenBilden();
      this.planen();
    } catch { /* ohne Karte */ }
    try {
      const t = await (await fetch('assets/geo/laender.json')).json();
      this.laender = feature(t, t.objects.countries).features;
      this.land50 = kuestenflaechen(merge(t, t.objects.countries.geometries));
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
        const p = svgEl('path');
        const l = svgEl('path', this.gezeichnet ? {} : { pathLength: '1' });
        this.laenderG.append(p);
        this.grenzenG.append(l);
        const lp = { f, p, l, t: teilflaechen(f, true), lt: teillinien(f) };
        this.grobSetzen(lp);
        this.laenderPfade.push(lp);
      }
    }
    if (this.gestartet) this.zeichnenSynchron();
    this.planen();
  }

  /* Mittelpunkt und Ausdehnung der Regionen und Kontinente (aus den groben Länderflächen) */
  regionenBilden() {
    const groesster = f => {
      let best = null;
      for (const t of teilflaechen(f)) if (!best || t.coords[0].length > best.coords[0].length) best = t;
      return best;
    };
    this.regionen = [];
    for (const r of REGIONEN) {
      const punkte = [];
      for (const id of r.laender) {
        if (id === '643' && r.laender.length > 1) continue; // Russland verzerrt Europa
        const f = this.grobeLaender.get(id);
        const t = f && groesster(f);
        if (t) punkte.push(...t.coords[0]);
      }
      if (punkte.length < 3) continue;
      const c = geoCentroid({ type: 'MultiPoint', coordinates: punkte });
      const d = punkte.map(q => geoDistance(c, q)).sort((a, b) => a - b);
      this.regionen.push({ name: r.name, ebene: r.ebene, laender: new Set(r.laender), c, rad: Math.max(0.05, d[Math.floor(d.length * 0.8)]) });
    }
  }

  /* Region oder Kontinent, der den sichtbaren Ausschnitt größtenteils füllt und mittig liegt */
  regionImBild(orte) {
    if (!this.regionen || !this.gezoomt) return null;
    // nur Regionen, in denen auch sichtbare Orte liegen
    const codes = new Set(orte.map(o => ISO[o.land]).filter(Boolean).map(String));
    const w = this.el.clientWidth, hh = this.el.clientHeight || w;
    const R = this.r * this.skala;
    // mittlerer sichtbarer Winkelradius aus Breite und Höhe des Ausschnitts
    const v = Math.sqrt(Math.asin(Math.min(1, w / 2 / R)) * Math.asin(Math.min(1, hh / 2 / R)));
    const mitte = [-this.rot[0], -this.rot[1]];
    let best = null, wert = Infinity;
    for (const r of this.regionen) {
      if (![...codes].some(c => r.laender.has(c))) continue;
      // die Region füllt den Ausschnitt gut, wenn ihr Radius (80 % der Fläche) etwa 60 % des Sichtradius beträgt
      const verh = r.rad / v / 0.6;
      if (verh < 0.45 || verh > 1.8) continue;
      const ab = geoDistance(mitte, r.c) / Math.max(r.rad, v * 0.6);
      if (ab > 0.6) continue;
      // passende Größe, möglichst mittig; eigene Gruppen (z. B. Skandinavien) leicht bevorzugt
      const g = Math.abs(Math.log(verh)) + ab + ({ gruppe: -0.2, kontinent: 0.05 }[r.ebene] || 0);
      if (g < wert) { wert = g; best = r; }
    }
    return best ? best.name : null;
  }

  grobSetzen(lp) {
    const g = this.grobeLaender && this.grobeLaender.get(String(lp.f.id));
    lp.t110 = g ? teilflaechen(g, true) : lp.t;
    lp.lt110 = g ? teillinien(g) : lp.lt;
  }

  zeichnenSynchron() {
    if (this.gezeichnet) return;
    // gleiche Animation wie die Kontinente, bereits verstrichene Zeit überspringen
    const verstrichen = (performance.now() - this.startZeit) / 1000;
    for (const { l: p } of this.laenderPfade || []) {
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
    // graue Fläche schon, während die Linien die letzten Millimeter ziehen
    setTimeout(() => { this.laenderG.classList.add('gefuellt'); this.horizont.classList.add('an'); }, ruhig() ? 0 : 4200);
    setTimeout(() => {
      this.gezeichnet = true;
      for (const p of [this.land, ...(this.laenderPfade || []).map(x => x.l)]) {
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
      const sichtbar = this.el.offsetParent && !document.hidden;
      if (!this.gezoomt && !this.zieht && !this.anim && !ruhig() && jetzt > this.pauseBis && sichtbar) {
        this.rot[0] += dt * 4;
        if (this.manuell) this.manuellSetzen(false);
        this.planen();
      }
      // 10 Sekunden ohne Eingabe: zurück zur ganzen Kugel, danach dreht sie sich wieder
      if (this.gezoomt && !this.zieht && !this.anim && sichtbar && jetzt - this.aktiv > 10000 && !this.aktionen.blattOffen()) this.zurWelt();
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

  projSetzen() {
    const w = this.el.clientWidth;
    const hh = this.el.clientHeight || w;
    this.r = this.basisR();
    this.proj.rotate(this.rot).scale(this.r * this.skala).translate([w / 2, hh / 2 + this.ty]);
    return [w, hh];
  }

  render() {
    if (!this.el.clientWidth) return;
    const [w, hh] = this.projSetzen();
    this.proj.clipExtent(this.skala > 1.05 ? [[-20, -20], [w + 20, hh + 20]] : null);
    const nah = this.skala > 1.05;
    if (nah !== this.istNah) { this.istNah = nah; this.el.classList.toggle('nah', nah); this.namenSetzen(); }
    // grauer Rand der Kugel, solange er irgendwo im Bild liegt
    const randSichtbar = this.r * this.skala < Math.hypot(w / 2, hh / 2 + Math.abs(this.ty)) + 4;
    this.kugel.setAttribute('d', randSichtbar ? this.pfad({ type: 'Sphere' }) || '' : '');
    // Länder und Küsten immer in derselben, zum Zoom passenden Detailtiefe
    const fein = this.skala > 1.6 && !!this.land50;
    const land = fein ? this.land50 : this.land110;
    // nur Flächen berechnen, die überhaupt im Bild liegen können
    const R = this.r * this.skala, D = Math.hypot(w, hh) / 2 + 24;
    const sicht = D >= R ? Math.PI / 2 : Math.asin(D / R);
    const mitteGeo = [-this.rot[0], -this.rot[1]];
    const minRad = 0.6 / R; // kleiner als etwa ein Pixel: weglassen
    // Detailtiefe passend zum Zoom: so ausdünnen, dass Punkte etwa 2 px auseinanderliegen (feiner sieht man nicht)
    const lod = st => {
      const px = st.abstand * R;
      const stufe = px >= 2 ? 0 : Math.min(3, Math.ceil(Math.log2(2 / Math.max(px, 1e-6))));
      return st.stufen[stufe];
    };
    const nurSichtbar = (teile, typ = 'MultiPolygon') => {
      const c = [];
      for (const t of teile) if (t.rad > minRad && geoDistance(t.c, mitteGeo) - t.rad < sicht + 0.02) c.push(t.stufen ? lod(t) : t.coords);
      return { type: typ, coordinates: c };
    };
    // Küsten nur als sichtbare Linienstücke (schnell, auch bei feiner Karte)
    if (land) {
      const linien = [];
      for (const t of land) {
        if (t.rad <= minRad || geoDistance(t.c, mitteGeo) - t.rad >= sicht + 0.02) continue;
        for (const st of t.stuecke) if (geoDistance(st.c, mitteGeo) - st.rad < sicht + 0.02) linien.push(lod(st));
      }
      this.land.setAttribute('d', this.glatt({ type: 'MultiLineString', coordinates: linien }));
    }
    // Abschluss am Horizont: Landflächen, die über den Rand reichen, schwarz gefüllt –
    // sichtbar nur in einem 0,8 px schmalen Ring genau auf dem Kugelrand (wie eine Linie, aber ohne Küstenstücke)
    const amRand = [];
    if (randSichtbar && this.land110) {
      for (const t of this.land110) {
        const d = geoDistance(t.c, mitteGeo);
        if (d + t.rad > Math.PI / 2 - 0.02 && d - t.rad < Math.PI / 2 + 0.02) amRand.push(t.coords);
      }
      const cx = w / 2, cy = hh / 2 + this.ty, ring = rr => `M${(cx - rr).toFixed(2)},${cy.toFixed(2)}a${rr.toFixed(2)},${rr.toFixed(2)} 0 1,0 ${(2 * rr).toFixed(2)},0a${rr.toFixed(2)},${rr.toFixed(2)} 0 1,0 ${(-2 * rr).toFixed(2)},0Z`;
      this.horizontRing.setAttribute('d', ring(R + 0.4) + ring(Math.max(0, R - 0.4)));
      this.projH.rotate(this.rot).scale(R).translate([cx, cy]);
    }
    this.horizont.setAttribute('d', amRand.length ? this.pfadH({ type: 'MultiPolygon', coordinates: amRand }) || '' : '');
    if (this.laenderPfade) for (const { p, l, t, t110, lt, lt110 } of this.laenderPfade) {
      p.setAttribute('d', this.pfad(nurSichtbar(fein ? t : t110)) || '');
      l.setAttribute('d', this.glatt(nurSichtbar(fein ? lt : lt110, 'MultiLineString')));
    }
    // Orte, die weiter als ABSTAND Pixel auseinanderliegen, getrennt zeigen
    const theta = Globus.ABSTAND / (this.r * this.skala);
    if (theta !== this.theta) { this.theta = theta; this.punkteSetzen(this.schnitt(theta)); }
    const mitte = [-this.rot[0], -this.rot[1]];
    const imBild = [];
    for (const [p, knopf] of this.knoepfe) {
      const xy = this.proj([p.lon, p.lat]);
      const hinten = geoDistance([p.lon, p.lat], mitte) > Math.PI / 2 - 0.03;
      knopf.classList.toggle('hinten', hinten || !xy);
      if (xy) knopf.style.transform = `translate(${xy[0].toFixed(1)}px, ${xy[1].toFixed(1)}px)`;
      if (nah && xy && !hinten && xy[0] > 0 && xy[0] < w && xy[1] > 0 && xy[1] < hh) imBild.push(p);
    }
    if (this.ruhe !== false) this.sichtMelden(nah ? imBild : null);
  }

  /* Knoten des Ortsbaums, die beim Winkelabstand theta getrennt erscheinen */
  schnitt(theta) {
    const liste = [];
    const geh = n => { if (!n.kinder || n.d <= theta) liste.push(n); else n.kinder.forEach(geh); };
    if (this.punkte.baum) geh(this.punkte.baum);
    return liste;
  }

  /* Info oben und Zeitstrahl-Filter: sichtbare Alben, Land falls nur eines im Bild ist */
  sichtMelden(punkte) {
    let info = { gezoomt: false, land: null, alben: null };
    if (punkte) {
      const orte = punkte.flatMap(p => p.orte);
      const laender = new Set(orte.map(o => o.land));
      const alben = orte.flatMap(o => o.alben).sort((x, y) => x.rang - y.rang);
      const land = laender.size === 1 ? this.punkte.zoom.get([...laender][0]) : null;
      info = { gezoomt: true, land, region: land ? null : this.regionImBild(orte), alben };
    }
    const sig = info.gezoomt ? `${info.land ? info.land.land : '-'}|${info.region || ''}|${info.alben.map(a => a.nr).join(',')}` : '';
    if (sig === this.sicht) return;
    this.sicht = sig;
    this.aktionen.sicht(info);
  }

  glatt(geo) {
    this.glattPfad(geo);
    return this.glaetter.ergebnis();
  }

  knopfBauen(p) {
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
    return knopf;
  }

  /* vorhandene Knöpfe behalten, neue weich einblenden, verschwundene entfernen */
  punkteSetzen(liste) {
    const neu = new Map();
    const erstmals = this.knoepfe.size === 0;
    for (const p of liste) {
      let k = this.knoepfe.get(p);
      if (!k) {
        k = this.knopfBauen(p);
        if (!erstmals) k.classList.add('neu');
        this.punkteEl.append(k);
      }
      neu.set(p, k);
    }
    for (const [p, k] of this.knoepfe) if (!neu.has(p)) k.remove();
    this.knoepfe = neu;
    this.hervorheben(this.hervorAlben);
  }

  namenSetzen() {
    const alle = this.manuell || this.skala > 1.05;
    this.punkteEl.classList.toggle('alle-namen', alle);
    if (alle) for (const k of this.knoepfe.values()) k.classList.remove('zeigt');
  }

  /* Von Hand gedreht: alle Punkte gleich mit Namen. Dreht sich der Globus wieder selbst: wechselnde Namen. */
  manuellSetzen(an) {
    this.manuell = an;
    this.namenSetzen();
  }

  /* Weltstufe: einzelne Ortsnamen nacheinander weich einblenden, nur sichtbare Punkte */
  namenWechseln() {
    // je Ort: wann er sichtbar wurde und wann er zuletzt beschriftet war
    const status = new Map();
    let zuletzt = null;
    const takt = () => {
      if (!this.gezoomt && !this.manuell && !ruhig() && this.el.offsetParent && !document.hidden) {
        const jetzt = performance.now();
        const cx = this.el.clientWidth / 2, cy = this.el.clientHeight / 2 + this.ty;
        const grenze = (this.r || cx) * this.skala * 0.85;
        const sichtbar = [];
        for (const k of this.knoepfe.values()) {
          const key = k.dataset.key;
          const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(k.style.transform);
          const drin = !k.classList.contains('hinten') && m && Math.hypot(+m[1] - cx, +m[2] - cy) < grenze;
          let st = status.get(key);
          if (!st) { st = { seit: null, gezeigt: -Infinity }; status.set(key, st); }
          if (!drin) { st.seit = null; continue; }
          if (st.seit === null) st.seit = jetzt;
          sichtbar.push({ k, st, x: +m[1] });
        }
        if (sichtbar.length) {
          // zuerst Orte, die seit dem Erscheinen noch keinen Namen hatten, sonst den am längsten nicht gezeigten;
          // bei Gleichstand den, der beim Drehen als Nächstes aus dem Bild wandert (am weitesten rechts)
          const neu = s => s.st.gezeigt < s.st.seit;
          sichtbar.sort((a, b) => (neu(b) - neu(a)) || (neu(a) ? 0 : a.st.gezeigt - b.st.gezeigt) || (b.x - a.x));
          let wahl = sichtbar[0];
          if (wahl.k === zuletzt && sichtbar.length > 1) wahl = sichtbar[1];
          wahl.st.gezeigt = jetzt;
          zuletzt = wahl.k;
          const k = wahl.k;
          k.classList.add('zeigt');
          setTimeout(() => k.classList.remove('zeigt'), 2200);
        }
      }
      setTimeout(takt, 2800);
    };
    setTimeout(takt, ruhig() ? 0 : 5200);
  }

  /* Ein Punkt wurde angetippt: ein Album öffnen, mehrere als Liste */
  tippen(p) {
    if (p.alben.length === 1) this.aktionen.album(p.alben[0]);
    else this.aktionen.liste(p);
  }

  /* Bildschirmpunkt m (relativ zum Globus) wieder über den Ort geo legen */
  anker(geo, m) {
    for (let n = 0; n < 3; n++) {
      this.projSetzen();
      const p = this.proj(geo);
      if (!p) return;
      const k = 57.2958 / (this.r * this.skala);
      this.rot = [this.rot[0] + (m[0] - p[0]) * k, Math.max(-85, Math.min(85, this.rot[1] - (m[1] - p[1]) * k))];
    }
  }

  /* um den Bildschirmpunkt m auf die Skala s zoomen */
  zoomen(s, m, geo) {
    s = Math.max(1, Math.min(Globus.MAX, s));
    if (!geo) { this.projSetzen(); geo = this.proj.invert(m); }
    this.skala = s;
    if (geo && geo.every(Number.isFinite) && geoDistance(geo, [-this.rot[0], -this.rot[1]]) < Math.PI / 2) this.anker(geo, m);
    this.pauseBis = performance.now() + 3000;
    this.beruhigt();
    this.planen();
  }

  lokal(x, y) {
    const r = this.el.getBoundingClientRect();
    return [x - r.left, y - r.top];
  }

  hervorheben(alben) {
    this.hervorAlben = alben;
    for (const [p, knopf] of this.knoepfe) {
      const an = !!alben && alben.length > 0 && p.alben.some(a => alben.includes(a));
      knopf.classList.toggle('hervor', an);
    }
  }

  ziehenEinrichten() {
    const zeiger = new Map();
    let start = null, pinch = null, warPinch = false;
    const pinchStart = () => {
      const [a, b] = [...zeiger.values()];
      const m = this.lokal((a.x + b.x) / 2, (a.y + b.y) / 2);
      this.projSetzen();
      const geo = this.proj.invert(m);
      pinch = { abstand: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), skala: this.skala, geo: geo && geo.every(Number.isFinite) ? geo : null };
      start = null;
      warPinch = true;
      this.gezogen = true;
      this.zieht = true;
      this.el.classList.add('zieht');
    };
    this.el.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      this.aktiv = performance.now();
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { this.el.setPointerCapture(e.pointerId); } catch { /* egal */ }
      if (zeiger.size === 2 && !this.anim) { pinchStart(); return; }
      if (zeiger.size === 1) {
        warPinch = false;
        start = { x: e.clientX, y: e.clientY, rot: [...this.rot], id: e.pointerId, ziel: e.target };
        this.gezogen = false;
      }
    });
    this.el.addEventListener('pointermove', e => {
      if (!zeiger.has(e.pointerId)) { if (MAUS.matches) this.aktiv = performance.now(); return; }
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.aktiv = performance.now();
      if (pinch) {
        if (zeiger.size < 2 || this.anim) return;
        const [a, b] = [...zeiger.values()];
        const m = this.lokal((a.x + b.x) / 2, (a.y + b.y) / 2);
        this.zoomen(pinch.skala * Math.hypot(a.x - b.x, a.y - b.y) / pinch.abstand, m, pinch.geo);
        return;
      }
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!this.gezogen && Math.hypot(dx, dy) < 6) return;
      if (this.anim) return;
      if (!this.gezogen) {
        this.gezogen = true;
        this.zieht = true;
        this.el.classList.add('zieht');
        if (!this.gezoomt) this.manuellSetzen(true);
      }
      const k = 90 / (this.r || this.el.clientWidth / 2) / this.skala;
      this.rot = [start.rot[0] + dx * k, Math.max(-85, Math.min(85, start.rot[1] - dy * k))];
      this.beruhigt();
      this.planen();
    });
    const ende = e => {
      if (!zeiger.has(e.pointerId)) return;
      zeiger.delete(e.pointerId);
      this.aktiv = performance.now();
      if (pinch) {
        if (zeiger.size >= 2) { pinchStart(); return; }
        pinch = null;
        if (zeiger.size === 1) {
          // mit dem verbliebenen Finger weiterdrehen
          const [[id, z]] = [...zeiger.entries()];
          start = { x: z.x, y: z.y, rot: [...this.rot], id, ziel: null };
          return;
        }
      }
      if (zeiger.size) return;
      const war = start;
      start = null;
      const gezogen = this.gezogen;
      this.zieht = false;
      this.el.classList.remove('zieht');
      this.pauseBis = performance.now() + 3000;
      setTimeout(() => { this.gezogen = false; }, 0);
      // Tipp ins Leere: Liste schließen bzw. etwas herauszoomen
      if (e.type === 'pointerup' && !gezogen && !warPinch && war && !(war.ziel instanceof Element && war.ziel.closest('.gpunkt'))) this.aktionen.leer();
    };
    this.el.addEventListener('pointerup', ende);
    this.el.addEventListener('pointercancel', ende);
    // Mausrad und Trackpad (Zwei-Finger-Zoom meldet sich als Rad mit Strg)
    this.el.addEventListener('wheel', e => {
      e.preventDefault();
      this.aktiv = performance.now();
      if (this.anim) return;
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      const f = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002));
      this.zoomen(this.skala * f, this.lokal(e.clientX, e.clientY));
    }, { passive: false });
  }

  /* Tipp ins Leere: um eine Stufe herauszoomen */
  heraus() {
    if (!this.gezoomt || this.anim) return;
    const s = this.skala / 3.75;
    if (s < 1.2) { this.zurWelt(); return; }
    this.animieren(this.rot, s, 0, 700);
  }

  async zurWelt(sofort = false) {
    if (!this.gezoomt) return;
    await this.animieren([this.rot[0], Math.max(-40, Math.min(40, this.rot[1]))], 1, 0, sofort ? 1 : 1400);
    this.pauseBis = performance.now() + (sofort ? 0 : 1500);
  }

  /* Direktlink auf ein Land: auf dessen Orte zoomen */
  landZeigen(code) {
    const z = this.punkte.zoom.get(code);
    if (!z || this.anim) return false;
    const lon = mittelLon(z.orte.map(o => o.lon)), lat = mittel(z.orte.map(o => o.lat));
    const weite = Math.max(0.02, ...z.orte.map(o => geoDistance([o.lon, o.lat], [lon, lat])));
    const w = this.el.clientWidth || 300;
    const s = Math.max(1.6, Math.min(Globus.MAX, (w * 0.32) / (this.basisR() * Math.sin(Math.min(weite, 1.2)))));
    this.aktiv = performance.now();
    this.animieren([-lon, -lat], s, 0, 1100);
    return true;
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
        this.beruhigt();
        this.planen();
        if (t < 1) requestAnimationFrame(schritt);
        else { this.anim = false; fertig(); }
      };
      requestAnimationFrame(schritt);
    });
  }

  drehenZu(p) {
    if (this.gezoomt || !p || this.anim) return;
    this.pauseBis = performance.now() + 4000;
    this.animieren([-p.lon, -p.lat * 0.6], 1, 0, 900);
  }
}
Globus.ABSTAND = 28; // Pixel, ab denen zwei Orte getrennt erscheinen
Globus.MAX = 400;

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
      titelBlock(a),
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
  // Die Linie fließt in einem Zug von oben nach unten: sanft anlaufend und sanft auslaufend.
  // Punkt und Titel erscheinen, kurz nachdem die Linie sie erreicht hat.
  const VORLAUF = 14; // Pixel, die die Linie dem Eintrag voraus ist, bevor er erscheint
  const teile = [];
  let pos = 0;
  [...el.querySelectorAll('.jahr')].forEach((s, i) => {
    if (i) pos += 6;
    teile.push({ s, start: pos, hoehe: s.offsetHeight, linie: s.querySelector('.linie') });
    pos += s.offsetHeight;
  });
  const gesamt = Math.max(1, pos);
  const dauer = gesamt / TEMPO;                        // Sekunden
  const zeitBei = y => dauer * Math.acos(1 - 2 * Math.min(1, y / gesamt)) / Math.PI; // Umkehrung von (1 − cos πt) / 2
  for (const { s, start } of teile) {
    s.querySelector('.jahr-label').style.setProperty('--d', `${zeitBei(start).toFixed(3)}s`);
    for (const e of s.querySelectorAll('.eintrag')) {
      e.style.setProperty('--d', `${zeitBei(start + e.offsetTop + e.offsetHeight / 2 + VORLAUF).toFixed(3)}s`);
    }
  }
  el.classList.add('laeuft');
  if (ruhig()) { el.classList.add('fertig'); return; }
  const t0 = performance.now();
  const schritt = jetzt => {
    if (el.classList.contains('fertig')) { for (const t of teile) t.linie.style.transform = ''; return; }
    const t = Math.min(1, (jetzt - t0) / 1000 / dauer);
    const y = gesamt * (1 - Math.cos(Math.PI * t)) / 2;
    for (const { start, hoehe, linie } of teile) {
      const anteil = Math.max(0, Math.min(1, (y - start) / Math.max(1, hoehe)));
      linie.style.transform = `scaleY(${anteil.toFixed(4)})`;
    }
    if (t < 1) requestAnimationFrame(schritt);
  };
  requestAnimationFrame(schritt);
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
  app.zurueckKnopf = h('button', { class: 'icon-knopf globus-zurueck', type: 'button', 'aria-label': 'Zur ganzen Weltkugel', icon: 'links', hidden: true, onclick: () => app.globus.zurWelt() });
  // feste Bausteine: Überschrift (Land, Region oder leer) und Kennzahlen
  const titelEl = h('h2', { hidden: true });
  const zahlEl = h('p', { class: 'zahl' });
  app.globusInfo.append(titelEl, zahlEl);
  let titelJetzt = '';
  const infoSetzen = s => {
    const liste = s.alben || mitOrt;
    const titel = (s.land ? s.land.name : s.region) || '';
    const text = details(liste, !s.land);
    if (titel !== titelJetzt) {
      const dauer = titelWechseln(titelEl, titelJetzt, titel);
      titelJetzt = titel;
      if (titel) app.globusInfo.classList.add('mit-titel');
      else setTimeout(() => { if (!titelJetzt) app.globusInfo.classList.remove('mit-titel'); }, dauer);
      textWechseln(zahlEl, text, dauer);
    } else if (zahlEl.textContent !== text) textWechseln(zahlEl, text, 400);
    app.zurueckKnopf.hidden = !s.gezoomt;
    zeitstrahlFiltern(DESKTOP.matches && s.gezoomt ? s.alben.map(a => a.nr) : null);
  };
  app.globus = new Globus(punkte, mitOrt[0]?.ort, {
    album: a => { location.hash = `#/album/${a.nr}`; },
    liste: p => blattZeigen(p),
    sicht: infoSetzen,
    blattOffen: () => !!app.blatt,
    leer: () => { if (app.blatt) blattSchliessen(); else app.globus.heraus(); },
    hover: p => {
      app.globus.hervorheben(p ? p.alben : null);
      zeitstrahlHervorheben(p ? p.alben.map(a => a.nr) : [], true);
    },
  });
  infoSetzen({ gezoomt: false, land: null, alben: null });
  el.append(app.globus.el, app.globusInfo, app.zurueckKnopf);
  return el;
}

function blattZeigen(p) {
  blattSchliessen();
  const liste = h('div', { class: 'blatt-liste' });
  let jahr = null;
  for (const a of p.alben) {
    // Jahreszahl wie im Zeitstrahl nur beim obersten Album eines Jahres
    const neuesJahr = a.jahr !== jahr;
    jahr = a.jahr;
    liste.append(h('a', { class: 'eintrag', href: `#/album/${a.nr}`, 'aria-label': `${a.titel}, ${a.monatLang} ${a.jahr}` },
      h('span', { class: 'jahrzahl zahl', text: neuesJahr ? String(a.jahr) : '' }),
      h('span', { class: 'punkt', 'aria-hidden': 'true' }),
      titelBlock(a),
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

/* Überschrift wechseln: das alte Wort blendet Buchstabe für Buchstabe von links nach rechts aus,
   das neue folgt direkt dahinter im selben Tempo. Gibt die Gesamtdauer in ms zurück. */
const TITEL_SCHRITT = 35, TITEL_ABSTAND = 140, TITEL_DAUER = 380, TITEL_EASE = 'cubic-bezier(.45, 0, .55, 1)';
function titelWechseln(el, alt, neu) {
  const animiert = !ruhig() && typeof el.animate === 'function';
  if (el.getAnimations) for (const a of el.getAnimations({ subtree: true })) a.cancel();
  const altGroesse = el.hidden ? '' : getComputedStyle(el).fontSize;
  el.setAttribute('aria-label', neu);
  // Größe für das neue Wort bestimmen (passt in eine Zeile)
  el.hidden = false;
  el.textContent = neu;
  if (neu) titelEinpassen(el);
  if (!animiert || (!alt && !neu)) { el.hidden = !neu; return 0; }
  el.replaceChildren();
  const buchstaben = (ziel, wort) => [...wort].map(c => {
    const b = h('span', { class: 'bst', text: c, 'aria-hidden': 'true' });
    ziel.append(b);
    return b;
  });
  let ende = 0;
  if (alt) {
    const altEl = h('span', { class: 'titel-alt', 'aria-hidden': 'true', style: { fontSize: altGroesse } });
    el.append(altEl);
    const bs = buchstaben(altEl, alt);
    bs.forEach((b, k) => b.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-6px)' }],
      { duration: TITEL_DAUER, delay: k * TITEL_SCHRITT, easing: TITEL_EASE, fill: 'forwards' }));
    ende = bs.length * TITEL_SCHRITT + TITEL_DAUER;
  }
  if (neu) {
    const start = alt ? TITEL_ABSTAND : 0;
    const bs = buchstaben(el, neu);
    bs.forEach((b, k) => b.animate([{ opacity: 0, transform: 'translateX(6px)' }, { opacity: 1, transform: 'none' }],
      { duration: TITEL_DAUER, delay: start + k * TITEL_SCHRITT, easing: TITEL_EASE, fill: 'backwards' }));
    ende = Math.max(ende, start + bs.length * TITEL_SCHRITT + TITEL_DAUER);
  } else {
    // ohne neues Wort braucht das alte trotzdem eine Zeile Höhe
    el.append(h('span', { class: 'bst', text: ' ', 'aria-hidden': 'true' }));
  }
  // danach wieder als schlichter Text (saubere Laufweite) bzw. ausblenden
  const stand = neu;
  setTimeout(() => {
    if (el.getAttribute('aria-label') !== stand) return;
    el.textContent = stand;
    el.hidden = !stand;
  }, ende + 20);
  return ende;
}

/* Kennzahlen weich austauschen */
function textWechseln(el, text, dauer) {
  if (ruhig() || typeof el.animate !== 'function' || !el.textContent) { el.textContent = text; return; }
  for (const a of el.getAnimations()) a.cancel();
  el.animate([{ opacity: 1 }, { opacity: 0 }, { opacity: 1 }], { duration: Math.max(400, dauer), easing: TITEL_EASE });
  setTimeout(() => { el.textContent = text; }, Math.max(400, dauer) / 2);
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
    const p = app.punkte.orte.find(o => o.alben.includes(a));
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
  if (neu !== 'globus' && app.globus && app.globus.gezoomt) app.globus.zurWelt(true);
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
    this.automatikEinrichten();
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
    const ortName = ortAnders(a);
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

  /* Nach 10 s ohne Interaktion automatisch weiterblättern, dann alle 5 s, bis zum letzten Bild */
  automatikEinrichten() {
    const neuStarten = () => {
      clearTimeout(this.autoWarten);
      clearInterval(this.autoTakt);
      this.autoTakt = null;
      if (this.i >= this.a.fotos.length - 1) return;
      this.autoWarten = setTimeout(() => {
        this.autoSchritt();
        this.autoTakt = setInterval(() => this.autoSchritt(), 5000);
      }, 10000);
    };
    this.autoNeu = neuStarten;
    for (const t of ['pointerdown', 'pointermove', 'wheel', 'touchstart']) this.el.addEventListener(t, neuStarten, { passive: true });
    document.addEventListener('keydown', neuStarten);
    neuStarten();
  }

  autoSchritt() {
    if (document.hidden || this.zoom || this.wechsel || (this.infoEl && !this.infoEl.hidden)) return;
    if (this.i >= this.a.fotos.length - 1) { clearInterval(this.autoTakt); this.autoTakt = null; return; }
    this.gehe(1);
  }

  entfernen() {
    clearTimeout(this.autoWarten);
    clearInterval(this.autoTakt);
    document.removeEventListener('keydown', this.autoNeu);
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
