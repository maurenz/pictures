# Hinweise für KI-Agenten (und Menschen), die dieses Projekt warten

Stand: November 2026. Lies diese Datei zuerst, bevor du etwas änderst. Sie beschreibt die Ecksteine, die Grenzen und
die Wartung. Details zur Bedienung stehen in `ANLEITUNG.md`, zum Hochladen in `README.md`.

## Was das Projekt ist

Ein privates Foto-Portfolio („Pictures“) einer einzelnen Person. Deutsch, mobile first, schwarz auf viel Weiß,
Schrift Urbanist (nur serifenlos), Akzentfarbe Orange (#ff6a13). Kein SEO, `noindex` überall. Ansichten: Globus
(Startansicht), Zeitstrahl, Kontaktbogen, Albumansicht; dazu eine Verwaltung unter `/admin/`.

## Ecksteine der Architektur (nicht leichtfertig ändern)

1. **Öffentliche Seite ist statisch.** `website/index.html` + `assets/app.js` + `assets/app.css` lesen nur
   `data/site.json` (bzw. bei Freigabelinks `data/f/<schlüssel>.json`) und die Bilder aus `media/`. Kein PHP im
   öffentlichen Teil. Das hält die Angriffsfläche klein und die Seite schnell.
2. **Verwaltung = PHP ohne Datenbank.** `website/admin/api.php` + `lib.php`. Daten liegen in `storage/db.json`
   (Dateisperre `flock`, atomares Schreiben, 14 Tagessicherungen in `storage/backup/`). Jede Änderung exportiert
   `data/site.json` und die Freigabe-Dateien neu (`exportieren()` in `lib.php`). SQLite war angedacht, ist aber
   bewusst noch nicht umgesetzt.
3. **Inhalte liegen nur auf dem Server.** `storage/`, `media/`, `data/` sind nicht im Repository. Der Workflow
   `.github/workflows/website.yml` lädt nur Programmdateien hoch (lftp über FTPS, ohne `--delete`, mit Ausschlüssen)
   und bricht ab, wenn diese Ordner im Repository auftauchen. **Niemals** diese Ordner hochladen, überschreiben oder
   löschen.
4. **Bilder:** Der Browser verkleinert vor dem Upload auf 4096 px (längste Kante). Der Server kodiert jedes Bild mit
   GD neu (entfernt dabei sicher alle Metadaten inkl. GPS) und erzeugt `NNN-<größe>.webp` in den Stufen
   4096 (nur Zoom), 2560, 1600, 800, 400. Die Website nutzt bis 2560 per `srcset`; 4096 wird erst beim Zoomen
   geladen (`zoomBildLaden`). Ältere Fotos haben keine 4096-Stufe – das ist in Ordnung.
5. **Sichtbarkeit pro Album:** `entwurf` (nirgends), `link` (nur über Freigaben), `online` (öffentlich).
   Freigaben (`db.freigaben[]`: `id`, `token`, `name`, `alben[]`, `aktiv`) sind geheime Links `/?f=<token>` zur
   ganzen Website plus den gewählten `link`-Alben. Der Schlüssel hat 128 Bit; die Website merkt ihn im
   `localStorage`. Erneuern/Deaktivieren/Löschen entfernt die Datei `data/f/<token>.json` → alter Link liefert 404.
   Bilddateien selbst sind nicht geschützt (wer die Adresse kennt, kann sie laden) – das ist so gewollt.
6. **Albumnummern** sind chronologisch (ältestes = 01) über die jeweils sichtbare Menge; Fotonummern folgen der
   Reihenfolge im Album. Nummern auf dem Server werden nie wiederverwendet (`naechstesAlbum`, `naechstesFoto`).
7. **Zeitliche Ordnung** im selben Monat: kürzeste Reiseroute (`beste_folge` in PHP und `besteFolge` in JS –
   beide gleich halten).

## Sicherheit (Stand und offene Punkte)

- Login: ein Passwort (Argon2id), Einrichtung nur mit Einrichtungscode, CSRF-Token im Header `X-CSRF`,
  Sitzungs-Cookie `HttpOnly`, `Secure`, `SameSite=Strict`, Sperre nach 5 Fehlversuchen für 15 Minuten.
- Kopfzeilen und CSP in `website/.htaccess`. Keine externen Quellen auf der öffentlichen Seite (Schrift lokal).
- **Offen:** `storage/.htaccess` (alles sperren) und `media/.htaccess` (kein PHP ausführen) liegen nur auf dem
  Server aus dem ersten manuellen Upload. Wird `storage/` neu angelegt, fehlt der Schutz → `db.json` wäre abrufbar.
  Empfehlung: Sperrregel für `storage/` zusätzlich in die Haupt-`.htaccess` und fehlende Schutzdateien per PHP
  anlegen. Weitere Ideen: zweiter Faktor (TOTP) für die Verwaltung, HSTS.
- TLS-Zertifikatsprüfung beim Hochladen niemals abschalten. Secrets: `FTP_SERVER` (Hostname, z. B.
  `a2eeb.netcup.net`), `FTP_BENUTZER`, `FTP_PASSWORT`, `FTP_ORDNER` (`./`). Nie Zugangsdaten ins Repository.

## Bauen, testen, veröffentlichen

- `npm ci` und `./build.sh` → schreibt `website/assets/app.*` und `website/admin/admin.*` (esbuild, ES2020).
  Quellen in `src/`. Nie die gebauten Dateien direkt bearbeiten.
- Cache: `index.html` verweist auf `?v=dev`; der Workflow ersetzt das durch den Commit-Hash.
- Push auf `main` = sofort live. Vorher lokal prüfen, z. B. PHP-Testserver:
  `php -d upload_max_filesize=64M -d post_max_size=64M -S 127.0.0.1:8400 -t <kopie von website/>` mit einem leeren
  `storage/` und einer Datei `storage/einrichtungscode.txt` (mindestens 8 Zeichen) für die Einrichtung.
  Browser-Tests mit Playwright (mobil 390×844 mit Touch, Desktop 1440×900).
- Kartendaten: `node tools/geo.mjs website/assets/geo` (aus `world-atlas`). Regionen/Kontinente:
  `python3 tools/regionen.py <countries.json aus npm-Paket world-countries>` → `src/regionen.json`.

## Wichtige Eigenheiten (sonst gibt es Rückschritte)

- Globus: d3-geo orthographisch in SVG. Zeichnen höchstens 60-mal pro Sekunde (`planen()`), nur sichtbare
  Flächen/Linienstücke, Detailtiefe je nach Zoom (`lod`). Küsten sind Linien; der schwarze Abschluss am Horizont
  ist eine gefüllte Fläche in einem 0,8-px-Ring. Orte werden je nach Zoom zu Gruppen zusammengefasst
  (`ortBaum`, Name: Land, wenn alle Orte des Landes darin liegen, sonst kleinste gemeinsame Region aus
  `ort.regionen`). Nach 10 s ohne Eingabe zurück zur Weltansicht.
- Zeiger auf dem Globus erst beim Ziehen/Zoomen festhalten (`setPointerCapture`), sonst kommen Mausklicks nicht
  bei den Punkten an.
- Album-Zoom nur per Fingern (kein Desktop-Zoom), hält solange ein Finger liegt, springt beim Loslassen zurück.
  Keine `gesture*`-Handler im Album – sie stören das Halten auf iOS.
- iOS als App vom Home-Bildschirm: kein `apple-mobile-web-app-status-bar-style` setzen (sonst bleibt die
  Statusleiste im Dunkelmodus weiß). Dadurch zählt iOS die Statusleiste in `100vh`/`100svh` mit → feste Seiten mit
  `position: fixed; inset: 0` statt vh-Höhen.
- Titel der Globus-Infozeile bestehen dauerhaft aus Einzelbuchstaben (gleiche Laufweite vor/nach der Animation).
- Alte Browser berücksichtigen: keine sehr neue CSS-Syntax ohne Rückfall (z. B. `rgba()` statt `rgb(… / …)`).

## Wartung

- PHP: läuft mit 8.3–8.5. Bei Updates `php -l` auf `website/admin/*.php` und einen Upload testen (GD mit WebP).
- Abhängigkeiten gering halten. `npm audit` gelegentlich; nur Build-Werkzeuge, nichts wird zur Laufzeit geladen.
- Sicherung: der Hoster sichert täglich. `storage/backup/` enthält nur `db.json`-Stände, keine Bilder.
- Ortssuche nutzt Nominatim (OpenStreetMap) über `api.php?aktion=ort`, höchstens 1 Anfrage/s.
- Stil der Benutzeroberfläche: sachlich, deutsch, keine Emojis. Änderungen am Aussehen vorher mit der
  Eigentümerin bzw. dem Eigentümer abstimmen und Entwürfe zeigen.
