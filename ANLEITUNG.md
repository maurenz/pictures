# Foto-Portfolio · Anleitung

## Inhalt dieses Pakets

| Ordner / Datei | Zweck |
|---|---|
| `website/` | **Das ist die Website.** Der Inhalt dieses Ordners kommt auf den Webspace. |
| `EINRICHTUNGSCODE.txt` | Einmaliger Code für die erste Anmeldung. **Nicht hochladen.** |
| `quellcode/` | Lesbarer Quellcode für spätere Änderungen. Wird nicht hochgeladen. |
| `ANLEITUNG.md` | Diese Anleitung |

Im Ordner `website/`:

| Ordner | Inhalt | Bei Updates überschreiben? |
|---|---|---|
| `index.html`, `assets/` | Öffentliche Website (Schrift, Karten, Programmcode) | ja |
| `admin/` | Verwaltung | ja |
| `data/` | `site.json`, wird von der Verwaltung automatisch erzeugt | **nein** |
| `media/` | Deine Fotos in allen Größen | **nein** |
| `storage/` | Interne Daten: Alben, Passwort, Sicherungen. Von außen gesperrt. | **nein** |
| `.htaccess` | Server-Regeln: `noindex`, Schutz, Zwischenspeicher | ja |

---

## Installation bei netcup (einmalig)

### Schritt 1 · HTTPS prüfen

1. Im netcup **Webhosting Control Panel** (Plesk) die Domain öffnen.
2. Unter **SSL/TLS-Zertifikate** ein Zertifikat aktivieren (z. B. das kostenlose Let's Encrypt), falls noch keins aktiv ist.
3. Optional die Option **„Dauerhafte, SEO-sichere 301-Weiterleitung von HTTP zu HTTPS“** einschalten.

Ohne HTTPS würde das Passwort der Verwaltung unverschlüsselt übertragen. Die Verwaltung zeigt dann einen Warnhinweis.

### Schritt 2 · Alte Testdatei entfernen

Falls `technik-test.php` und der Ordner `_technik-test` noch auf dem Webspace liegen: beide löschen.

### Schritt 3 · Dateien hochladen

**Variante A: Dateimanager im Control Panel (am einfachsten)**

1. Im Control Panel **Dateien** öffnen und in den Ordner der Domain wechseln (meist `httpdocs`).
2. Vorhandene Platzhalterdateien (z. B. `index.html` von netcup) löschen.
3. Den Ordner `website/` auf deinem Rechner als ZIP packen. Wichtig: Gepackt wird der **Inhalt** des Ordners, nicht der Ordner selbst.
4. Die ZIP-Datei hochladen, mit Rechtsklick **Extrahieren** wählen und die ZIP danach löschen.
5. Prüfen, dass `index.html`, `.htaccess`, `admin/`, `assets/` usw. direkt in `httpdocs` liegen und nicht in einem Unterordner.

**Variante B: FTP-Programm (z. B. FileZilla)**

1. Mit den FTP-Zugangsdaten aus dem Control Panel verbinden.
2. Im FTP-Programm **versteckte Dateien anzeigen** einschalten. Sonst fehlt die Datei `.htaccess`.
3. Den **Inhalt** von `website/` in den Ordner der Domain (`httpdocs`) hochladen.

### Schritt 4 · Verwaltung einrichten

1. `https://deine-domain.de/admin/` aufrufen.
2. Den Code aus `EINRICHTUNGSCODE.txt` eingeben. Groß- und Kleinschreibung spielt keine Rolle.
3. Ein Passwort mit mindestens 10 Zeichen wählen und wiederholen.
4. Nach **Einrichten** ist der Code verbraucht und wird gelöscht.

### Schritt 5 · Impressum und Datenschutz ausfüllen

Unter **Einstellungen** sind Vorlagen für Impressum und Datenschutzerklärung vorbereitet:

- Alle Platzhalter in eckigen Klammern `[ ]` ersetzen.
- In der Datenschutzerklärung die Speicherdauer der Server-Logdateien eintragen. Sie steht in deinem netcup-Vertrag oder im Control Panel.
- Die Angaben zum Hoster prüfen: Name und Anschrift von netcup, sowie ob ein Vertrag zur Auftragsverarbeitung (AV-Vertrag) besteht. Den AV-Vertrag kannst du im netcup Customer Control Panel abschließen.
- Optional „Über mich“ und eine Kontakt-E-Mail eintragen.
- **Texte speichern** klicken.

Die Vorlagen sind keine Rechtsberatung.

---

## Bedienung der Verwaltung

**Neues Album**

1. **Alben** → **+ Neues Album**.
2. Titel eingeben.
3. **Ort:** z. B. „Kyoto“ oder „Japan“ eintippen und einen Vorschlag wählen. Die Karte zeigt zur Kontrolle die Position.
4. Monat und Jahr wählen, optional einen Kurztext schreiben.
5. **Speichern**. Erst danach lassen sich Fotos hinzufügen.

**Fotos hinzufügen**

- Auf **+ Fotos hinzufügen** tippen. Am Rechner kannst du die Dateien auch einfach auf den Fotobereich ziehen.
- Jedes Foto wird im Browser auf 2560 px verkleinert. GPS-Daten werden entfernt, Kameradaten bleiben erhalten.
- Originale werden nie gespeichert. Pro Foto belegt der Webspace etwa 1 bis 2 MB.
- iPhone-Fotos (HEIC) funktionieren am iPhone mit Safari direkt. In Chrome am Rechner kann HEIC fehlschlagen, dann vorher als JPEG exportieren.

**Ordnen**

- **Griff** (Punkte oben rechts an einer Kachel) ziehen, um die Reihenfolge zu ändern. Die Reihenfolge wird sofort gespeichert.
- **Stern** antippen, um das Titelbild festzulegen. Es erscheint am Desktop als Vorschau im Zeitstrahl.

**Löschen**

- Ein Foto löschst du mit dem **×** auf der Kachel und einem zweiten Antippen zur Bestätigung.

**Veröffentlichen**

- **Status: Online** setzen und **Speichern**. Nur Alben, die online sind und mindestens ein Foto haben, erscheinen auf der Website.

**Nummern**

- Alben und Fotos werden automatisch fortlaufend nummeriert.
- Die Nummern ändern sich nie und werden auch nach dem Löschen nicht neu vergeben. Ein Foto heißt dauerhaft z. B. `12/003`.

**Direktlinks**

- Jedes Foto hat eine eigene Adresse, z. B. `https://deine-domain.de/#/album/12/3`.

---

## Freigabelinks

Jedes Album hat einen Status: **Entwurf** (nirgends sichtbar), **Mit Link** (nur für Freigaben) oder **Online** (für alle).

Unter **Freigaben** legst du beliebig viele geheime Links an, zum Beispiel „Familie“ oder „Freunde“. Jeder Link zeigt die ganze Website mit allen öffentlichen Alben und zusätzlich den Alben, die du dort ankreuzt (nur Alben mit Status „Mit Link“). Wer den Link einmal geöffnet hat, sieht die freigegebenen Alben auch beim nächsten Besuch.

- **Kopieren:** Link in die Zwischenablage, dann per Nachricht verschicken.
- **aktiv:** Haken entfernen schaltet den Link vorübergehend ab.
- **Neuen Link erzeugen:** Der bisherige Link funktioniert danach nicht mehr (zum Beispiel, wenn er weitergegeben wurde).
- **Freigabe löschen:** Link und Auswahl werden entfernt.

Die Bilddateien selbst sind nicht verschlüsselt: Wer eine genaue Bildadresse kennt, kann ein Bild laden. Die Freigaben verhindern, dass Alben auf der Website auftauchen.

## Sicherung

- Die Verwaltung legt täglich automatisch eine Sicherung der Albumdaten in `storage/backup/` an und behält die letzten 14 Tage.
- Für eine vollständige Sicherung gelegentlich per FTP die Ordner `storage/`, `media/` und `data/` herunterladen.
- **Wiederherstellen:** Die drei Ordner wieder hochladen.

## Passwort vergessen

1. Per FTP die Datei `storage/db.json` herunterladen und mit einem Texteditor öffnen.
2. Die Zeile `"passwort": "…"` ändern in `"passwort": null` und die Datei wieder hochladen.
3. Eine neue Textdatei `storage/einrichtungscode.txt` anlegen. Ihr Inhalt ist ein selbst gewählter Code mit mindestens 8 Zeichen.
4. `/admin/` aufrufen, den Code eingeben und ein neues Passwort setzen. Die Textdatei wird danach automatisch gelöscht.

## Updates einspielen

Nur `index.html`, `.htaccess`, `assets/` und `admin/` ersetzen. **`storage/`, `media/` und `data/` nie überschreiben**, dort liegen deine Inhalte.

---

## Technik in Kürze

- **Öffentliche Website:** reines HTML, CSS und JavaScript.
  - Sie liest `data/site.json`.
  - Sie setzt keine Cookies und verwendet kein Tracking.
  - Schrift (Urbanist, SIL Open Font License) und Kartendaten (Natural Earth, gemeinfrei) liegen auf dem eigenen Server.
- **Suchmaschinen:** `noindex` steht im HTML und im Server-Header. Es gibt keine Sitemap. Die Seite ist nur über die Domain direkt erreichbar.
- **Verwaltung:**
  - PHP ab Version 8.1 (getestet mit 8.3, gebaut für 8.5), ohne MySQL. Die Daten liegen in `storage/db.json`.
  - Login mit Argon2id-Passwort-Hash, Schutz gegen gefälschte Anfragen (CSRF) und eine Sperre von 15 Minuten nach 5 Fehlversuchen.
- **Ortssuche:**
  - Sie nutzt OpenStreetMap (Nominatim) und läuft nur in der Verwaltung über den eigenen Server.
  - Besucher der Website haben keinen Kontakt zu OpenStreetMap.
  - Gemäß den Nutzungsregeln wird höchstens eine Anfrage pro Sekunde gestellt.
- **Bilder:**
  - Größen 2560, 1600, 800 und 400 px als WebP. Ist WebP nicht verfügbar, wird JPEG verwendet.
  - Die Website lädt je nach Bildschirm automatisch die passende Größe.

## Änderungen am Code (optional)

Im Ordner `quellcode/` liegt der lesbare Code. Zum Neubauen wird Node.js benötigt:

```
cd quellcode
npm install
./build.sh
```

Danach liegen die fertigen Dateien in `quellcode/dist/`. Hochgeladen werden davon `assets/app.js`, `assets/app.css`, `admin/admin.js` und `admin/admin.css`.
