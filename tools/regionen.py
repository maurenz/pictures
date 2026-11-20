"""Erzeugt src/regionen.json: Regionen und Kontinente mit ihren Ländern (ISO-Nummern).
Quelle: npm-Paket world-countries (UN-Regionen). Aufruf: python3 tools/regionen.py <pfad/zu/countries.json>"""
import json, sys
d = json.load(open(sys.argv[1]))
UN = {
  'Northern Europe': 'Nordeuropa', 'Western Europe': 'Westeuropa', 'Central Europe': 'Mitteleuropa',
  'Southern Europe': 'Südeuropa', 'Southeast Europe': 'Südosteuropa', 'Eastern Europe': 'Osteuropa',
  'Western Asia': 'Naher Osten', 'Southern Asia': 'Südasien', 'South-Eastern Asia': 'Südostasien',
  'Eastern Asia': 'Ostasien', 'Central Asia': 'Zentralasien',
  'Northern Africa': 'Nordafrika', 'Western Africa': 'Westafrika', 'Eastern Africa': 'Ostafrika',
  'Middle Africa': 'Zentralafrika', 'Southern Africa': 'Südliches Afrika',
  'Caribbean': 'Karibik', 'Central America': 'Mittelamerika',
  'Australia and New Zealand': 'Australien und Neuseeland', 'Melanesia': 'Melanesien', 'Micronesia': 'Mikronesien', 'Polynesia': 'Polynesien',
}
EIGENE = {
  'Skandinavien': ['NO', 'SE', 'DK', 'FI', 'IS'],
  'Britische Inseln': ['GB', 'IE'],
  'Iberische Halbinsel': ['ES', 'PT'],
  'Benelux': ['BE', 'NL', 'LU'],
  'Baltikum': ['EE', 'LV', 'LT'],
}
def kontinent(c):
    r, s = c['region'], c['subregion']
    if r == 'Americas': return 'Südamerika' if s == 'South America' else 'Nordamerika'
    return {'Europe': 'Europa', 'Asia': 'Asien', 'Africa': 'Afrika', 'Oceania': 'Ozeanien'}.get(r)
nr = {c['cca2']: c['ccn3'] for c in d if c.get('ccn3')}
gruppen = {}
def add(name, ebene, code):
    if code: gruppen.setdefault(name, {'name': name, 'ebene': ebene, 'laender': []})['laender'].append(code)
for c in d:
    if not c.get('ccn3'): continue
    k = kontinent(c)
    if k: add(k, 'kontinent', c['ccn3'])
    if c['subregion'] in UN: add(UN[c['subregion']], 'region', c['ccn3'])
for name, codes in EIGENE.items():
    for cc in codes: add(name, 'gruppe', nr.get(cc))
json.dump(list(gruppen.values()), open('src/regionen.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(gruppen), 'Regionen')
