import fs from 'fs';
import * as topo from 'topojson-client';
import * as simp from 'topojson-simplify';
const out = process.argv[2];
const c50 = JSON.parse(fs.readFileSync('node_modules/world-atlas/countries-50m.json'));
// nur Namen behalten
for (const g of c50.objects.countries.geometries) g.properties = { n: g.properties.name };
delete c50.objects.land;
let t = simp.presimplify(c50);
t = simp.simplify(t, simp.quantile(t, 0.85));
t = simp.filter(t, simp.filterWeight(t, simp.quantile(t, 0.02)));
t.arcs = t.arcs.map(a => a.map(p => [p[0], p[1]])); delete t.bbox; t = topo.quantize(t, 1e5); fs.writeFileSync(out + '/laender.json', JSON.stringify(t));
const l110 = JSON.parse(fs.readFileSync('node_modules/world-atlas/land-110m.json'));
fs.writeFileSync(out + '/land.json', JSON.stringify(l110));
console.log(fs.statSync(out + '/laender.json').size, fs.statSync(out + '/land.json').size);
