/* Kameradaten aus JPEG und HEIC lesen (ohne GPS) */

function suche(bytes, muster, start = 0) {
  outer: for (let i = start; i <= bytes.length - muster.length; i++) {
    for (let j = 0; j < muster.length; j++) if (bytes[i + j] !== muster[j]) continue outer;
    return i;
  }
  return -1;
}

export async function exifLesen(datei) {
  try {
    const buf = await datei.slice(0, 1024 * 1024).arrayBuffer();
    const bytes = new Uint8Array(buf);
    // "Exif\0\0" gefolgt von TIFF-Kopf (JPEG: APP1, HEIC: Exif-Element)
    let p = 0;
    while (true) {
      const i = suche(bytes, [0x45, 0x78, 0x69, 0x66, 0, 0], p);
      if (i < 0) return {};
      const t = i + 6;
      if ((bytes[t] === 0x49 && bytes[t + 1] === 0x49) || (bytes[t] === 0x4D && bytes[t + 1] === 0x4D)) return tiff(new DataView(buf), t);
      p = i + 1;
    }
  } catch {
    return {};
  }
}

function tiff(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = o => v.getUint16(o, le), u32 = o => v.getUint32(o, le);
  const groesse = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const ifd = off => {
    const out = {};
    if (t + off + 2 > v.byteLength) return out;
    const n = u16(t + off);
    for (let i = 0; i < n; i++) {
      const e = t + off + 2 + i * 12;
      if (e + 12 > v.byteLength) break;
      const tag = u16(e), typ = u16(e + 2), anz = u32(e + 4);
      const g = (groesse[typ] || 1) * anz;
      const wo = g <= 4 ? e + 8 : t + u32(e + 8);
      if (wo + g > v.byteLength) continue;
      let w = null;
      if (typ === 2) { w = ''; for (let k = 0; k < anz; k++) { const c = v.getUint8(wo + k); if (!c) break; w += String.fromCharCode(c); } w = w.trim(); }
      else if (typ === 3) w = anz === 2 ? [u16(wo), u16(wo + 2)] : u16(wo);
      else if (typ === 4) w = u32(wo);
      else if (typ === 5 || typ === 10) w = [u32(wo), u32(wo + 4)];
      out[tag] = w;
    }
    return out;
  };
  const i0 = ifd(u32(t + 4));
  const ex = i0[0x8769] ? ifd(i0[0x8769]) : {};
  const bruch = x => (Array.isArray(x) && x[1] ? x[0] / x[1] : null);
  const marke = (i0[0x010F] || '').trim();
  let modell = (i0[0x0110] || '').trim();
  if (marke && modell.toLowerCase().startsWith(marke.toLowerCase().split(' ')[0])) modell = modell;
  else if (marke) modell = `${marke} ${modell}`.trim();
  const zeit = ex[0x829A];
  let belichtung = '';
  if (Array.isArray(zeit) && zeit[0] && zeit[1]) {
    const s = zeit[0] / zeit[1];
    belichtung = s >= 1 ? `${+s.toFixed(1)} s` : `1/${Math.round(zeit[1] / zeit[0])} s`;
  }
  const blende = bruch(ex[0x829D]);
  const brennweite = bruch(ex[0x920A]);
  const iso = Array.isArray(ex[0x8827]) ? ex[0x8827][0] : ex[0x8827];
  return {
    kamera: modell,
    objektiv: (ex[0xA434] || '').trim(),
    brennweite: brennweite ? `${Math.round(brennweite)} mm` : '',
    blende: blende ? `f/${+blende.toFixed(1)}` : '',
    belichtung,
    iso: iso ? String(iso) : '',
    datum: ex[0x9003] || i0[0x0132] || '',
    subsek: ex[0x9291] || '',
  };
}
