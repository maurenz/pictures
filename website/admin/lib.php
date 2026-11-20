<?php
/**
 * Foto-Portfolio · Verwaltung · gemeinsame Funktionen
 */

declare(strict_types=1);

const WURZEL      = __DIR__ . '/..';
const SPEICHER    = WURZEL . '/storage';
const DB_DATEI    = SPEICHER . '/db.json';
const LOCK_DATEI  = SPEICHER . '/db.lock';
const EXPORT      = WURZEL . '/data/site.json';
const MEDIEN      = WURZEL . '/media';
const GROESSEN    = [2560, 1600, 800, 400];
const MAX_KANTE   = 2560;
const MONATE      = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

ini_set('display_errors', '0');
error_reporting(E_ALL);

/* ------------------------------------------------------------------ */
/* Antworten                                                           */
/* ------------------------------------------------------------------ */

function antwort(array $daten, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($daten, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fehler(string $text, int $code = 400): never
{
    antwort(['ok' => false, 'fehler' => $text], $code);
}

/* ------------------------------------------------------------------ */
/* Sitzung und Sicherheit                                              */
/* ------------------------------------------------------------------ */

function ist_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');
}

function sitzung_starten(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $pfad = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/admin/index.php')), '/') . '/';
    session_name('portfolio_verwaltung');
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => $pfad,
        'secure'   => ist_https(),
        'httponly' => true,
        'samesite' => 'Strict',
    ]);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_maxlifetime', '28800');
    session_start();
    // Sitzung nach 8 Stunden Inaktivität beenden
    if (!empty($_SESSION['zuletzt']) && time() - (int) $_SESSION['zuletzt'] > 28800) {
        $_SESSION = [];
        session_regenerate_id(true);
    }
    $_SESSION['zuletzt'] = time();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
}

function eingeloggt(): bool
{
    return !empty($_SESSION['angemeldet']);
}

function csrf_pruefen(): void
{
    $token = $_SERVER['HTTP_X_CSRF'] ?? '';
    if (!is_string($token) || !hash_equals((string) ($_SESSION['csrf'] ?? ''), $token)) {
        fehler('Sitzung abgelaufen. Bitte Seite neu laden.', 403);
    }
}

function sicherheits_kopfzeilen(): void
{
    header('X-Robots-Tag: noindex, nofollow');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('X-Frame-Options: DENY');
}

/* ------------------------------------------------------------------ */
/* Datenbank (JSON-Datei)                                              */
/* ------------------------------------------------------------------ */

function db_leer(): array
{
    return [
        'version'        => 1,
        'passwort'       => null,
        'naechstesAlbum' => 1,
        'alben'          => [],
        'einstellungen'  => [
            'ueber'       => '',
            'kontakt'     => '',
            'impressum'   => impressum_vorlage(),
            'datenschutz' => datenschutz_vorlage(),
        ],
    ];
}

function db_lesen(): array
{
    if (!is_file(DB_DATEI)) {
        return db_leer();
    }
    $daten = json_decode((string) file_get_contents(DB_DATEI), true);
    if (!is_array($daten)) {
        fehler('Datenbank beschädigt. Bitte Sicherung aus storage/backup einspielen.', 500);
    }
    return $daten + db_leer();
}

function atomar_schreiben(string $datei, string $inhalt): void
{
    $tmp = $datei . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, $inhalt) === false || !rename($tmp, $datei)) {
        @unlink($tmp);
        fehler('Speichern fehlgeschlagen (Schreibrechte prüfen).', 500);
    }
}

function db_schreiben(array $db): void
{
    $json = json_encode($db, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    // tägliche Sicherung, die letzten 14 Tage
    $sicherung = SPEICHER . '/backup';
    if (!is_dir($sicherung)) {
        @mkdir($sicherung, 0755, true);
    }
    $heute = $sicherung . '/db-' . date('Y-m-d') . '.json';
    if (is_file(DB_DATEI) && !is_file($heute)) {
        @copy(DB_DATEI, $heute);
        $alle = glob($sicherung . '/db-*.json') ?: [];
        sort($alle);
        foreach (array_slice($alle, 0, max(0, count($alle) - 14)) as $alt) {
            @unlink($alt);
        }
    }
    atomar_schreiben(DB_DATEI, (string) $json);
    exportieren($db);
}

/** Führt $fn mit exklusiver Sperre aus: lesen, ändern, schreiben. */
function mit_db(callable $fn): mixed
{
    $fh = fopen(LOCK_DATEI, 'c');
    if (!$fh || !flock($fh, LOCK_EX)) {
        fehler('Datenbank ist gesperrt. Bitte erneut versuchen.', 503);
    }
    try {
        $db = db_lesen();
        $ergebnis = $fn($db);
        db_schreiben($db);
        return $ergebnis;
    } finally {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}

function &album_finden(array &$db, int $nr): array
{
    foreach ($db['alben'] as &$a) {
        if ((int) $a['nr'] === $nr) {
            return $a;
        }
    }
    fehler('Album nicht gefunden.', 404);
}

/* ------------------------------------------------------------------ */
/* Export für die öffentliche Website                                  */
/* ------------------------------------------------------------------ */

/** Album im Format der öffentlichen Website */
function album_oeffentlich(array $a): array
{
    return [
        'nr'        => (int) $a['nr'],
        'titel'     => (string) $a['titel'],
        'monat'     => (int) $a['monat'],
        'jahr'      => (int) $a['jahr'],
        'text'      => (string) ($a['text'] ?? ''),
        'ort'       => $a['ort'] ?? null,
        'titelbild' => $a['titelbild'] ?? null,
        'fotos'     => array_map(fn($f) => [
            'nr'       => (int) $f['nr'],
            'w'        => (int) $f['w'],
            'h'        => (int) $f['h'],
            'ext'      => (string) $f['ext'],
            'groessen' => array_values($f['groessen']),
            'exif'     => (object) ($f['exif'] ?? []),
        ], $a['fotos']),
    ];
}

function hat_koord(?array $a): bool
{
    return $a !== null && isset($a['ort']['lat'], $a['ort']['lon']) && is_numeric($a['ort']['lat']) && is_numeric($a['ort']['lon']);
}

/** Entfernung zweier Orte in km */
function km(array $a, array $b): float
{
    $r = M_PI / 180;
    $dLat = ($b['lat'] - $a['lat']) * $r;
    $dLon = ($b['lon'] - $a['lon']) * $r;
    $x = sin($dLat / 2) ** 2 + cos($a['lat'] * $r) * cos($b['lat'] * $r) * sin($dLon / 2) ** 2;
    return 12742 * asin(min(1, sqrt($x)));
}

/** Alben eines Monats in die Folge mit dem kürzesten Weg bringen (wie im Zeitstrahl der Website) */
function beste_folge(array $gruppe, ?array $vor, ?array $nach): array
{
    $mit = array_values(array_filter($gruppe, 'hat_koord'));
    $ohne = array_values(array_filter($gruppe, fn($a) => !hat_koord($a)));
    if (count($mit) < 2) {
        return $gruppe;
    }
    $kosten = function (array $folge) use ($vor, $nach): float {
        $k = 0.0;
        if (hat_koord($vor)) {
            $k += km($vor['ort'], $folge[0]['ort']);
        }
        for ($i = 1; $i < count($folge); $i++) {
            $k += km($folge[$i - 1]['ort'], $folge[$i]['ort']);
        }
        if (hat_koord($nach)) {
            $k += km($folge[count($folge) - 1]['ort'], $nach['ort']);
        }
        return $k;
    };
    $beste = $mit;
    $besteK = $kosten($mit);
    if (count($mit) <= 7) {
        $permutieren = function (array $rest, array $bisher) use (&$permutieren, $kosten, &$beste, &$besteK): void {
            if (!$rest) {
                $k = $kosten($bisher);
                if ($k < $besteK - 1e-6) {
                    $besteK = $k;
                    $beste = $bisher;
                }
                return;
            }
            foreach ($rest as $i => $x) {
                $weiter = $rest;
                unset($weiter[$i]);
                $permutieren(array_values($weiter), [...$bisher, $x]);
            }
        };
        $permutieren($mit, []);
    }
    return [...$beste, ...$ohne];
}

/** Alben aufsteigend nach Zeit, innerhalb eines Monats nach kürzestem Weg */
function zeitlich_ordnen(array $alben): array
{
    $auf = array_values($alben);
    usort($auf, fn($a, $b) => [(int) $a['jahr'], (int) $a['monat'], (int) $a['nr']] <=> [(int) $b['jahr'], (int) $b['monat'], (int) $b['nr']]);
    $aus = [];
    for ($i = 0; $i < count($auf);) {
        $j = $i;
        while ($j < count($auf) && $auf[$j]['jahr'] == $auf[$i]['jahr'] && $auf[$j]['monat'] == $auf[$i]['monat']) {
            $j++;
        }
        $gruppe = array_slice($auf, $i, $j - $i);
        $folge = count($gruppe) > 1 ? beste_folge($gruppe, $aus ? $aus[count($aus) - 1] : null, $auf[$j] ?? null) : $gruppe;
        array_push($aus, ...$folge);
        $i = $j;
    }
    return $aus;
}

/** Albumnummern in zeitlicher Reihenfolge (ältestes = 1), nur veröffentlichte Alben mit Fotos */
function nummern(array $db): array
{
    $liste = zeitlich_ordnen(array_filter($db['alben'], fn($a) => ($a['status'] ?? '') === 'online' && !empty($a['fotos'])));
    $n = [];
    foreach ($liste as $i => $a) {
        $n[(int) $a['nr']] = $i + 1;
    }
    return $n;
}

function exportieren(array $db): void
{
    $alben = [];
    $nummern = nummern($db);
    foreach ($db['alben'] as $a) {
        if (($a['status'] ?? '') !== 'online' || empty($a['fotos'])) {
            continue;
        }
        $alben[] = album_oeffentlich($a) + ['nummer' => $nummern[(int) $a['nr']] ?? null];
    }
    $e = $db['einstellungen'];
    $export = [
        'erzeugt' => date('c'),
        'seiten'  => [
            'ueber'       => (string) ($e['ueber'] ?? ''),
            'kontakt'     => (string) ($e['kontakt'] ?? ''),
            'impressum'   => (string) ($e['impressum'] ?? ''),
            'datenschutz' => (string) ($e['datenschutz'] ?? ''),
        ],
        'alben'   => $alben,
    ];
    if (!is_dir(dirname(EXPORT))) {
        @mkdir(dirname(EXPORT), 0755, true);
    }
    atomar_schreiben(EXPORT, (string) json_encode($export, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

/* ------------------------------------------------------------------ */
/* Eingaben bereinigen                                                 */
/* ------------------------------------------------------------------ */

function text(mixed $wert, int $max): string
{
    $s = is_scalar($wert) ? (string) $wert : '';
    $s = str_replace(["\r\n", "\r"], "\n", $s);
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s) ?? '';
    return trim(mb_substr($s, 0, $max));
}

function ort_bereinigen(mixed $ort): ?array
{
    if (!is_array($ort) || !isset($ort['lat'], $ort['lon'])) {
        return null;
    }
    $lat = (float) $ort['lat'];
    $lon = (float) $ort['lon'];
    if ($lat < -90 || $lat > 90 || $lon < -180 || $lon > 180) {
        return null;
    }
    $typ = in_array($ort['typ'] ?? '', ['ort', 'region', 'land'], true) ? $ort['typ'] : 'ort';
    return [
        'name'     => text($ort['name'] ?? '', 120),
        'anzeige'  => text($ort['anzeige'] ?? '', 300),
        'typ'      => $typ,
        'land'     => strtoupper(preg_replace('/[^A-Za-z]/', '', (string) ($ort['land'] ?? '')) ?? ''),
        'landName' => text($ort['landName'] ?? '', 120),
        'lat'      => round($lat, 5),
        'lon'      => round($lon, 5),
    ] + (isset($ort['regionen']) && is_array($ort['regionen'])
        ? ['regionen' => array_values(array_slice(array_filter(array_map(fn($r) => text(is_string($r) ? $r : '', 120), $ort['regionen'])), 0, 6))]
          + (empty($ort['regionenGeprueft']) ? [] : ['regionenGeprueft' => 1])
        : []);
}

/** Verwaltungsebenen eines Nominatim-Treffers, vom kleinsten zum größten (ohne Land). Wird nur gespeichert, nicht angezeigt. */
function regionen_aus(array $adr): array
{
    $liste = [];
    foreach (['city', 'town', 'municipality', 'county', 'state_district', 'state', 'region'] as $ebene) {
        $n = trim((string) ($adr[$ebene] ?? ''));
        if ($n !== '' && !in_array($n, $liste, true)) {
            $liste[] = $n;
        }
    }
    return $liste;
}

/** Anfrage an Nominatim, höchstens 1 pro Sekunde (Nutzungsregeln von OpenStreetMap) */
function nominatim(string $pfad, array $parameter): mixed
{
    $sperre = SPEICHER . '/ortssuche.txt';
    $fh = fopen($sperre, 'c+');
    if ($fh) {
        flock($fh, LOCK_EX);
        $letzte = (float) stream_get_contents($fh);
        $warten = 1.05 - (microtime(true) - $letzte);
        if ($warten > 0) {
            usleep((int) ($warten * 1e6));
        }
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, (string) microtime(true));
        flock($fh, LOCK_UN);
        fclose($fh);
    }
    $url = 'https://nominatim.openstreetmap.org/' . $pfad . '?' . http_build_query($parameter + ['format' => 'jsonv2', 'addressdetails' => 1, 'accept-language' => 'de']);
    $ua = 'Foto-Portfolio-Verwaltung/1.0 (' . ($_SERVER['HTTP_HOST'] ?? 'privat') . ')';
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10, CURLOPT_USERAGENT => $ua]);
        $roh = curl_exec($ch);
    } else {
        $ctx = stream_context_create(['http' => ['header' => "User-Agent: $ua\r\n", 'timeout' => 10]]);
        $roh = @file_get_contents($url, false, $ctx);
    }
    return json_decode((string) $roh, true);
}

function exif_bereinigen(mixed $exif): array
{
    $erlaubt = ['kamera', 'objektiv', 'brennweite', 'blende', 'belichtung', 'iso', 'datum'];
    $aus = [];
    if (is_array($exif)) {
        foreach ($erlaubt as $k) {
            if (isset($exif[$k]) && is_scalar($exif[$k])) {
                $v = text($exif[$k], 80);
                if ($v !== '') {
                    $aus[$k] = $v;
                }
            }
        }
    }
    return $aus;
}

/* ------------------------------------------------------------------ */
/* Bilder                                                              */
/* ------------------------------------------------------------------ */

function bild_format(): string
{
    return function_exists('imagewebp') ? 'webp' : 'jpg';
}

function skalieren(GdImage $bild, int $lange): GdImage
{
    $w = imagesx($bild);
    $h = imagesy($bild);
    if (max($w, $h) <= $lange) {
        return $bild;
    }
    if ($w >= $h) {
        $nw = $lange;
        $nh = (int) round($h * $lange / $w);
    } else {
        $nh = $lange;
        $nw = (int) round($w * $lange / $h);
    }
    $neu = imagescale($bild, $nw, $nh, IMG_BICUBIC);
    return $neu instanceof GdImage ? $neu : $bild;
}

/** Erzeugt alle Webgrößen. Gibt [w, h, ext, groessen] zurück. */
function bild_verarbeiten(string $quelle, string $zielOrdner, int $fotoNr): array
{
    @ini_set('memory_limit', '256M');
    @set_time_limit(120);
    $info = @getimagesize($quelle);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) {
        fehler('Datei ist kein unterstütztes Bild.');
    }
    if ($info[0] > 6000 || $info[1] > 6000) {
        fehler('Bild ist zu groß.');
    }
    $bild = match ($info[2]) {
        IMAGETYPE_JPEG => @imagecreatefromjpeg($quelle),
        IMAGETYPE_PNG  => @imagecreatefrompng($quelle),
        IMAGETYPE_WEBP => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($quelle) : false,
        default        => false,
    };
    if (!$bild instanceof GdImage) {
        fehler('Bild konnte nicht gelesen werden.');
    }
    $bild = skalieren($bild, MAX_KANTE);
    $w = imagesx($bild);
    $h = imagesy($bild);
    $lange = max($w, $h);
    $ext = bild_format();
    if (!is_dir($zielOrdner) && !@mkdir($zielOrdner, 0755, true)) {
        fehler('Medienordner kann nicht angelegt werden.', 500);
    }
    $groessen = [];
    $basis = sprintf('%s/%03d', $zielOrdner, $fotoNr);
    foreach (GROESSEN as $g) {
        if ($g > $lange && $g !== GROESSEN[count(GROESSEN) - 1]) {
            continue;
        }
        $v = skalieren($bild, $g);
        $datei = "$basis-$g.$ext";
        $ok = $ext === 'webp' ? imagewebp($v, $datei, $g >= 1600 ? 80 : 78) : imagejpeg($v, $datei, 84);
        if (!$ok) {
            fehler('Bild konnte nicht gespeichert werden.', 500);
        }
        $groessen[] = $g;
    }
    // Falls das Bild kleiner als die kleinste Stufe über ihm ist: eigene Größe als größte Stufe
    if ($lange < GROESSEN[0] && !in_array($lange, $groessen, true) && $lange > 400) {
        $datei = "$basis-$lange.$ext";
        $ok = $ext === 'webp' ? imagewebp($bild, $datei, 80) : imagejpeg($bild, $datei, 84);
        if ($ok) {
            $groessen[] = $lange;
        }
    }
    sort($groessen);
    return [$w, $h, $ext, $groessen];
}

function foto_dateien_loeschen(int $albumNr, int $fotoNr): void
{
    foreach (glob(sprintf('%s/%d/%03d-*', MEDIEN, $albumNr, $fotoNr)) ?: [] as $f) {
        @unlink($f);
    }
}

function ordner_loeschen(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    foreach (scandir($dir) ?: [] as $f) {
        if ($f === '.' || $f === '..') {
            continue;
        }
        $p = "$dir/$f";
        is_dir($p) ? ordner_loeschen($p) : @unlink($p);
    }
    @rmdir($dir);
}

/* ------------------------------------------------------------------ */
/* Vorlagen                                                            */
/* ------------------------------------------------------------------ */

function impressum_vorlage(): string
{
    return <<<TXT
Angaben gemäß § 5 DDG

[Vorname Nachname]
[Straße Hausnummer]
[PLZ Ort]
Deutschland

Kontakt
E-Mail: [E-Mail-Adresse]

Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
[Vorname Nachname], Anschrift wie oben

Alle Fotografien auf dieser Website sind urheberrechtlich geschützt. Eine Verwendung ist nur mit vorheriger schriftlicher Zustimmung erlaubt.
TXT;
}

function datenschutz_vorlage(): string
{
    return <<<TXT
1. Verantwortlicher

[Vorname Nachname]
[Straße Hausnummer]
[PLZ Ort]
E-Mail: [E-Mail-Adresse]

2. Grundsatz

Diese Website ist ein privates Fotoportfolio. Sie verwendet keine Cookies, keine Analyse- oder Tracking-Werkzeuge und bindet keine Inhalte externer Anbieter ein. Schriften und Kartendaten werden vom eigenen Server geladen.

3. Hosting und Server-Logdateien

Die Website wird bei der netcup GmbH, Daimlerstraße 25, 76185 Karlsruhe, gehostet. Beim Aufruf der Website verarbeitet der Server automatisch Informationen, die Ihr Browser übermittelt (IP-Adresse, Datum und Uhrzeit, aufgerufene Seite, Browsertyp, Betriebssystem, Referrer). Dies ist technisch erforderlich, um die Website auszuliefern und ihre Sicherheit zu gewährleisten. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Die Logdateien werden vom Hoster nach [Anzahl] Tagen gelöscht. Mit dem Hoster besteht ein Vertrag zur Auftragsverarbeitung.

4. Lokale Speicherung im Browser

Wenn Sie in der Albumansicht die dunkle Darstellung wählen, wird diese Einstellung ausschließlich in Ihrem Browser gespeichert (localStorage) und nicht an den Server übertragen. Sie können sie jederzeit über die Browsereinstellungen löschen.

5. Kontakt per E-Mail

Wenn Sie mir eine E-Mail schreiben, verarbeite ich Ihre Angaben ausschließlich zur Bearbeitung Ihrer Anfrage (Art. 6 Abs. 1 lit. b bzw. f DSGVO) und lösche sie, sobald sie nicht mehr erforderlich sind.

6. Ihre Rechte

Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21). Sie können sich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren.

Stand: [Monat Jahr]
TXT;
}
