<?php
/**
 * Foto-Portfolio · Verwaltung · Schnittstelle
 */

declare(strict_types=1);

require __DIR__ . '/lib.php';

sicherheits_kopfzeilen();
sitzung_starten();

$aktion  = (string) ($_GET['aktion'] ?? '');
$methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/** JSON-Eingabe lesen */
function eingabe(): array
{
    $roh = file_get_contents('php://input');
    $daten = json_decode((string) $roh, true);
    return is_array($daten) ? $daten : [];
}

/* ------------------------------------------------------------------ */
/* Anmeldung (ohne Login erreichbar)                                   */
/* ------------------------------------------------------------------ */

const VERSUCHE_DATEI = SPEICHER . '/anmeldung.json';

function sperre_pruefen(): void
{
    $daten = is_file(VERSUCHE_DATEI) ? (json_decode((string) file_get_contents(VERSUCHE_DATEI), true) ?: []) : [];
    $ip = hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    $e = $daten[$ip] ?? null;
    if ($e && ($e['bis'] ?? 0) > time()) {
        $min = (int) ceil(($e['bis'] - time()) / 60);
        fehler("Zu viele Fehlversuche. Bitte in $min Minuten erneut versuchen.", 429);
    }
}

function versuch_merken(bool $erfolg): void
{
    $fh = fopen(VERSUCHE_DATEI . '.lock', 'c');
    if ($fh) {
        flock($fh, LOCK_EX);
    }
    $daten = is_file(VERSUCHE_DATEI) ? (json_decode((string) file_get_contents(VERSUCHE_DATEI), true) ?: []) : [];
    $ip = hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    // Alte Einträge entfernen
    foreach ($daten as $k => $e) {
        if (($e['zeit'] ?? 0) < time() - 86400) {
            unset($daten[$k]);
        }
    }
    if ($erfolg) {
        unset($daten[$ip]);
    } else {
        $e = $daten[$ip] ?? ['n' => 0];
        $e['n'] = ($e['n'] ?? 0) + 1;
        $e['zeit'] = time();
        if ($e['n'] >= 5) {
            $e['bis'] = time() + 15 * 60;
            $e['n'] = 0;
        }
        $daten[$ip] = $e;
    }
    file_put_contents(VERSUCHE_DATEI, json_encode($daten));
    if ($fh) {
        flock($fh, LOCK_UN);
        fclose($fh);
    }
}

function passwort_pruefen_regeln(string $pw): void
{
    if (mb_strlen($pw) < 10) {
        fehler('Das Passwort muss mindestens 10 Zeichen lang sein.');
    }
}

function hash_erzeugen(string $pw): string
{
    return password_hash($pw, defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT);
}

if ($aktion === 'status') {
    $db = db_lesen();
    antwort([
        'ok'          => true,
        'eingerichtet' => !empty($db['passwort']),
        'angemeldet'  => eingeloggt(),
        'csrf'        => $_SESSION['csrf'],
        'https'       => ist_https(),
    ]);
}

if ($aktion === 'einrichten' && $methode === 'POST') {
    csrf_pruefen();
    sperre_pruefen();
    $e = eingabe();
    $codeDatei = SPEICHER . '/einrichtung.json';
    $textDatei = SPEICHER . '/einrichtungscode.txt';
    $eingabeCode = strtoupper(trim((string) ($e['code'] ?? '')));
    $gueltig = false;
    if (is_file($codeDatei)) {
        $hash = json_decode((string) file_get_contents($codeDatei), true)['hash'] ?? '';
        $gueltig = $hash !== '' && password_verify($eingabeCode, $hash);
    } elseif (is_file($textDatei)) {
        // Notfall-Zugang: selbst angelegte Textdatei mit mindestens 8 Zeichen
        $text = strtoupper(trim((string) file_get_contents($textDatei)));
        $gueltig = mb_strlen($text) >= 8 && hash_equals($text, $eingabeCode);
    }
    if (!$gueltig) {
        versuch_merken(false);
        fehler('Der Einrichtungscode ist falsch.', 403);
    }
    $pw = (string) ($e['passwort'] ?? '');
    passwort_pruefen_regeln($pw);
    mit_db(function (array &$db) use ($pw) {
        if (!empty($db['passwort'])) {
            fehler('Die Verwaltung ist bereits eingerichtet.', 409);
        }
        $db['passwort'] = hash_erzeugen($pw);
    });
    @unlink($codeDatei);
    @unlink($textDatei);
    versuch_merken(true);
    session_regenerate_id(true);
    $_SESSION['angemeldet'] = true;
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    antwort(['ok' => true, 'csrf' => $_SESSION['csrf']]);
}

if ($aktion === 'anmelden' && $methode === 'POST') {
    csrf_pruefen();
    sperre_pruefen();
    $e = eingabe();
    $db = db_lesen();
    $pw = (string) ($e['passwort'] ?? '');
    if (empty($db['passwort']) || !password_verify($pw, (string) $db['passwort'])) {
        versuch_merken(false);
        usleep(400000);
        fehler('Das Passwort ist falsch.', 403);
    }
    versuch_merken(true);
    if (password_needs_rehash((string) $db['passwort'], defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT)) {
        mit_db(function (array &$db) use ($pw) { $db['passwort'] = hash_erzeugen($pw); });
    }
    session_regenerate_id(true);
    $_SESSION['angemeldet'] = true;
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    antwort(['ok' => true, 'csrf' => $_SESSION['csrf']]);
}

/* ------------------------------------------------------------------ */
/* Ab hier nur angemeldet                                              */
/* ------------------------------------------------------------------ */

if (!eingeloggt()) {
    fehler('Nicht angemeldet.', 401);
}
if ($methode === 'POST') {
    csrf_pruefen();
}

if ($aktion === 'abmelden' && $methode === 'POST') {
    $_SESSION = [];
    session_regenerate_id(true);
    session_destroy();
    antwort(['ok' => true]);
}

if ($aktion === 'daten') {
    $db = db_lesen();
    antwort([
        'ok'            => true,
        'alben'         => $db['alben'],
        'einstellungen' => $db['einstellungen'],
        'naechstesAlbum' => $db['naechstesAlbum'],
        'nummern'       => (object) nummern($db),
        'freigaben'     => $db['freigaben'] ?? [],
        'reihenfolge'   => array_map(fn($a) => (int) $a['nr'], zeitlich_ordnen($db['alben'])),
        'format'        => bild_format(),
    ]);
}

if ($aktion === 'album_speichern' && $methode === 'POST') {
    $e = eingabe();
    $titel = text($e['titel'] ?? '', 80);
    if ($titel === '') {
        fehler('Bitte einen Titel eingeben.');
    }
    $monat = (int) ($e['monat'] ?? 0);
    $jahr = (int) ($e['jahr'] ?? 0);
    if ($monat < 1 || $monat > 12) {
        fehler('Bitte einen Monat wählen.');
    }
    if ($jahr < 1900 || $jahr > (int) date('Y') + 1) {
        fehler('Bitte ein gültiges Jahr eingeben.');
    }
    $ort = ort_bereinigen($e['ort'] ?? null);
    $status = in_array($e['status'] ?? '', ['online', 'link'], true) ? $e['status'] : 'entwurf';
    $felder = [
        'titel'  => $titel,
        'monat'  => $monat,
        'jahr'   => $jahr,
        'text'   => text($e['text'] ?? '', 1200),
        'ort'    => $ort,
        'status' => $status,
    ];
    $nr = isset($e['nr']) ? (int) $e['nr'] : 0;
    $album = mit_db(function (array &$db) use ($nr, $felder) {
        if ($nr > 0) {
            $a = &album_finden($db, $nr);
            $o = $felder['ort'];
            if ($o !== null && !isset($o['regionen']) && isset($a['ort']['regionen']) && $a['ort']['lat'] == $o['lat'] && $a['ort']['lon'] == $o['lon']) {
                $felder['ort']['regionen'] = $a['ort']['regionen'];
                if (!empty($a['ort']['regionenGeprueft'])) {
                    $felder['ort']['regionenGeprueft'] = 1;
                }
            }
            $a = array_merge($a, $felder, ['geaendert' => date('c')]);
            return $a;
        }
        $neu = array_merge([
            'nr'            => (int) $db['naechstesAlbum'],
            'titelbild'     => null,
            'naechstesFoto' => 1,
            'fotos'         => [],
            'erstellt'      => date('c'),
        ], $felder, ['geaendert' => date('c')]);
        $db['naechstesAlbum'] = (int) $db['naechstesAlbum'] + 1;
        $db['alben'][] = $neu;
        return $neu;
    });
    antwort(['ok' => true, 'album' => $album]);
}

if ($aktion === 'vorschau') {
    $nr = (int) ($_GET['nr'] ?? 0);
    $db = db_lesen();
    foreach ($db['alben'] as $a) {
        if ((int) $a['nr'] === $nr) {
            antwort(['ok' => true, 'album' => album_oeffentlich($a) + ['nummer' => nummern($db)[(int) $a['nr']] ?? null]]);
        }
    }
    fehler('Album nicht gefunden.', 404);
}

if ($aktion === 'album_loeschen' && $methode === 'POST') {
    $nr = (int) (eingabe()['nr'] ?? 0);
    mit_db(function (array &$db) use ($nr) {
        album_finden($db, $nr);
        $db['alben'] = array_values(array_filter($db['alben'], fn($a) => (int) $a['nr'] !== $nr));
        foreach ($db['freigaben'] as &$f) {
            $f['alben'] = array_values(array_filter($f['alben'] ?? [], fn($x) => (int) $x !== $nr));
        }
        unset($f);
    });
    ordner_loeschen(MEDIEN . '/' . $nr);
    antwort(['ok' => true]);
}

if ($aktion === 'foto_hochladen' && $methode === 'POST') {
    $nr = (int) ($_POST['nr'] ?? 0);
    if (empty($_FILES['bild']) || $_FILES['bild']['error'] !== UPLOAD_ERR_OK) {
        $code = $_FILES['bild']['error'] ?? -1;
        fehler($code === UPLOAD_ERR_INI_SIZE ? 'Datei zu groß für den Server.' : 'Upload fehlgeschlagen.');
    }
    $tmp = $_FILES['bild']['tmp_name'];
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($tmp);
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
        fehler('Nur JPEG, PNG oder WebP erlaubt.');
    }
    $exif = exif_bereinigen(json_decode((string) ($_POST['exif'] ?? '{}'), true));
    // Kennungen zum Erkennen bereits hochgeladener Fotos (Prüfsumme, Aufnahmedaten)
    $kennung = [];
    foreach ((array) json_decode((string) ($_POST['kennung'] ?? '[]'), true) as $k) {
        if (is_string($k) && $k !== '' && strlen($k) <= 200) {
            $kennung[] = $k;
        }
    }
    $kennung = array_slice(array_values(array_unique($kennung)), 0, 4);

    // Nummer reservieren (unter Sperre), Bild außerhalb der Sperre verarbeiten
    $fotoNr = mit_db(function (array &$db) use ($nr) {
        $a = &album_finden($db, $nr);
        $n = (int) ($a['naechstesFoto'] ?? 1);
        $a['naechstesFoto'] = $n + 1;
        return $n;
    });
    [$w, $h, $ext, $groessen] = bild_verarbeiten($tmp, MEDIEN . '/' . $nr, $fotoNr);
    $foto = ['nr' => $fotoNr, 'w' => $w, 'h' => $h, 'ext' => $ext, 'groessen' => $groessen, 'exif' => $exif, 'kennung' => $kennung, 'hochgeladen' => date('c')];
    mit_db(function (array &$db) use ($nr, $foto) {
        $a = &album_finden($db, $nr);
        $a['fotos'][] = $foto;
        if (empty($a['titelbild'])) {
            $a['titelbild'] = $foto['nr'];
        }
        $a['geaendert'] = date('c');
    });
    antwort(['ok' => true, 'foto' => $foto]);
}

/* ---------- Freigabelinks: je Link ein Name und mehrere Alben ---------- */

if ($aktion === 'freigabe_speichern' && $methode === 'POST') {
    $e = eingabe();
    $id = preg_replace('/[^a-f0-9]/', '', (string) ($e['id'] ?? ''));
    $name = text($e['name'] ?? '', 60);
    if ($name === '') {
        fehler('Bitte einen Namen für die Freigabe eingeben.');
    }
    $wahl = array_values(array_unique(array_map('intval', is_array($e['alben'] ?? null) ? $e['alben'] : [])));
    $aktiv = !empty($e['aktiv']);
    $freigabe = mit_db(function (array &$db) use ($id, $name, $wahl, $aktiv) {
        $vorhanden = array_map(fn($a) => (int) $a['nr'], $db['alben']);
        $wahl = array_values(array_filter($wahl, fn($nr) => in_array($nr, $vorhanden, true)));
        $db['freigaben'] = $db['freigaben'] ?? [];
        foreach ($db['freigaben'] as &$f) {
            if ($id !== '' && $f['id'] === $id) {
                $f = array_merge($f, ['name' => $name, 'alben' => $wahl, 'aktiv' => $aktiv, 'geaendert' => date('c')]);
                return $f;
            }
        }
        unset($f);
        $neu = ['id' => bin2hex(random_bytes(6)), 'token' => freigabe_token(), 'name' => $name, 'alben' => $wahl,
            'aktiv' => $aktiv, 'erstellt' => date('c'), 'geaendert' => date('c')];
        $db['freigaben'][] = $neu;
        return $neu;
    });
    antwort(['ok' => true, 'freigabe' => $freigabe]);
}

if ($aktion === 'freigabe_erneuern' && $methode === 'POST') {
    // neuer Schlüssel: der bisherige Link funktioniert nicht mehr
    $id = preg_replace('/[^a-f0-9]/', '', (string) (eingabe()['id'] ?? ''));
    $freigabe = mit_db(function (array &$db) use ($id) {
        foreach ($db['freigaben'] ?? [] as $i => $f) {
            if ($f['id'] === $id) {
                $db['freigaben'][$i]['token'] = freigabe_token();
                $db['freigaben'][$i]['geaendert'] = date('c');
                return $db['freigaben'][$i];
            }
        }
        fehler('Freigabe nicht gefunden.', 404);
    });
    antwort(['ok' => true, 'freigabe' => $freigabe]);
}

if ($aktion === 'freigabe_loeschen' && $methode === 'POST') {
    $id = preg_replace('/[^a-f0-9]/', '', (string) (eingabe()['id'] ?? ''));
    mit_db(function (array &$db) use ($id) {
        $db['freigaben'] = array_values(array_filter($db['freigaben'] ?? [], fn($f) => $f['id'] !== $id));
    });
    antwort(['ok' => true]);
}

if ($aktion === 'foto_loeschen' && $methode === 'POST') {
    $e = eingabe();
    $nr = (int) ($e['nr'] ?? 0);
    $fotoNr = (int) ($e['foto'] ?? 0);
    $album = mit_db(function (array &$db) use ($nr, $fotoNr) {
        $a = &album_finden($db, $nr);
        $a['fotos'] = array_values(array_filter($a['fotos'], fn($f) => (int) $f['nr'] !== $fotoNr));
        if ((int) ($a['titelbild'] ?? 0) === $fotoNr) {
            $a['titelbild'] = $a['fotos'][0]['nr'] ?? null;
        }
        $a['geaendert'] = date('c');
        return $a;
    });
    foto_dateien_loeschen($nr, $fotoNr);
    antwort(['ok' => true, 'album' => $album]);
}

if ($aktion === 'reihenfolge' && $methode === 'POST') {
    $e = eingabe();
    $nr = (int) ($e['nr'] ?? 0);
    $ordnung = array_map('intval', is_array($e['fotos'] ?? null) ? $e['fotos'] : []);
    $album = mit_db(function (array &$db) use ($nr, $ordnung) {
        $a = &album_finden($db, $nr);
        $nachNr = [];
        foreach ($a['fotos'] as $f) {
            $nachNr[(int) $f['nr']] = $f;
        }
        $neu = [];
        foreach ($ordnung as $n) {
            if (isset($nachNr[$n])) {
                $neu[] = $nachNr[$n];
                unset($nachNr[$n]);
            }
        }
        $a['fotos'] = array_merge($neu, array_values($nachNr));
        return $a;
    });
    antwort(['ok' => true, 'album' => $album]);
}

if ($aktion === 'titelbild' && $methode === 'POST') {
    $e = eingabe();
    $nr = (int) ($e['nr'] ?? 0);
    $fotoNr = (int) ($e['foto'] ?? 0);
    mit_db(function (array &$db) use ($nr, $fotoNr) {
        $a = &album_finden($db, $nr);
        foreach ($a['fotos'] as $f) {
            if ((int) $f['nr'] === $fotoNr) {
                $a['titelbild'] = $fotoNr;
                return;
            }
        }
        fehler('Foto nicht gefunden.', 404);
    });
    antwort(['ok' => true]);
}

if ($aktion === 'einstellungen' && $methode === 'POST') {
    $e = eingabe();
    $kontakt = text($e['kontakt'] ?? '', 200);
    if ($kontakt !== '' && !filter_var($kontakt, FILTER_VALIDATE_EMAIL)) {
        fehler('Die Kontaktadresse ist keine gültige E-Mail-Adresse.');
    }
    mit_db(function (array &$db) use ($e, $kontakt) {
        $db['einstellungen'] = [
            'ueber'       => text($e['ueber'] ?? '', 6000),
            'kontakt'     => $kontakt,
            'impressum'   => text($e['impressum'] ?? '', 12000),
            'datenschutz' => text($e['datenschutz'] ?? '', 30000),
        ];
    });
    antwort(['ok' => true]);
}

if ($aktion === 'passwort' && $methode === 'POST') {
    $e = eingabe();
    $alt = (string) ($e['alt'] ?? '');
    $neu = (string) ($e['neu'] ?? '');
    passwort_pruefen_regeln($neu);
    mit_db(function (array &$db) use ($alt, $neu) {
        if (!password_verify($alt, (string) $db['passwort'])) {
            fehler('Das bisherige Passwort ist falsch.', 403);
        }
        $db['passwort'] = hash_erzeugen($neu);
    });
    session_regenerate_id(true);
    antwort(['ok' => true]);
}

if ($aktion === 'ort') {
    $q = text($_GET['q'] ?? '', 100);
    if (mb_strlen($q) < 2) {
        antwort(['ok' => true, 'treffer' => []]);
    }
    $liste = nominatim('search', ['q' => $q, 'limit' => 6]);
    if (!is_array($liste)) {
        fehler('Ortssuche nicht erreichbar.', 502);
    }
    $typen = [
        'country' => 'land',
        'state' => 'region', 'region' => 'region', 'province' => 'region', 'county' => 'region', 'state_district' => 'region',
        'archipelago' => 'region', 'island' => 'region', 'islet' => 'region',
    ];
    $treffer = [];
    foreach ($liste as $t) {
        $art = (string) ($t['addresstype'] ?? $t['type'] ?? '');
        $typ = $typen[$art] ?? 'ort';
        $adr = $t['address'] ?? [];
        $treffer[] = [
            'name'     => (string) ($t['name'] ?? '') ?: explode(',', (string) ($t['display_name'] ?? ''))[0],
            'anzeige'  => (string) ($t['display_name'] ?? ''),
            'typ'      => $typ,
            'land'     => strtoupper((string) ($adr['country_code'] ?? '')),
            'landName' => (string) ($adr['country'] ?? ''),
            'lat'      => round((float) ($t['lat'] ?? 0), 5),
            'lon'      => round((float) ($t['lon'] ?? 0), 5),
            'regionen' => $typ === 'land' ? [] : regionen_aus($adr),
        ];
    }
    antwort(['ok' => true, 'treffer' => $treffer]);
}

/* Fehlende Regionen still nachtragen: je Aufruf ein Ort, die Verwaltung ruft im Hintergrund wiederholt auf.
   Leere Ergebnisse der ersten Fassung werden einmal neu abgefragt. */
if ($aktion === 'regionen_nachtragen' && $methode === 'POST') {
    $fehlt = fn(array $a) => hat_koord($a) && (($a['ort']['typ'] ?? '') !== 'land')
        && (!isset($a['ort']['regionen']) || ($a['ort']['regionen'] === [] && empty($a['ort']['regionenGeprueft'])));
    $offen = fn(array $db) => array_values(array_filter($db['alben'], $fehlt));
    $liste = $offen(db_lesen());
    if (!$liste) {
        antwort(['ok' => true, 'offen' => 0]);
    }
    $ziel = $liste[0];
    $r = nominatim('reverse', ['lat' => $ziel['ort']['lat'], 'lon' => $ziel['ort']['lon'], 'zoom' => 12]);
    if (!is_array($r) || (!isset($r['address']) && ($r['error'] ?? '') !== 'Unable to geocode')) {
        // Dienst nicht erreichbar oder gedrosselt: später erneut versuchen, nichts speichern
        antwort(['ok' => true, 'offen' => count($liste), 'fehler' => true]);
    }
    $regionen = array_slice(regionen_aus($r['address'] ?? []), 0, 6);
    $rest = mit_db(function (array &$db) use ($ziel, $regionen, $fehlt, $offen) {
        foreach ($db['alben'] as &$a) {
            // alle Alben mit genau diesen Koordinaten zugleich versorgen
            if ($fehlt($a) && $a['ort']['lat'] == $ziel['ort']['lat'] && $a['ort']['lon'] == $ziel['ort']['lon']) {
                $a['ort']['regionen'] = $regionen;
                $a['ort']['regionenGeprueft'] = 1;
            }
        }
        unset($a);
        return count($offen($db));
    });
    antwort(['ok' => true, 'offen' => $rest]);
}

fehler('Unbekannte Aktion.', 404);
