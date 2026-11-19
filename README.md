# Pictures · Foto-Portfolio

Private Fotowebsite mit Zeitstrahl, Globus und Kontaktbogen sowie einer schlanken Verwaltung (PHP, ohne Datenbank).

## Aufbau

| Pfad | Inhalt |
|---|---|
| `website/` | Alles, was auf den Webspace kommt (fertig gebaut) |
| `website/admin/` | Verwaltung (PHP) |
| `src/` | Quellcode für `website/assets/app.*` und `website/admin/admin.*` |
| `tools/geo.mjs` | Erzeugt die Kartendaten in `website/assets/geo/` |
| `.github/workflows/website.yml` | Lädt `website/` automatisch per FTP hoch |

Die Inhalte (`storage/`, `media/`, `data/`) liegen **nur auf dem Webspace** und sind hier bewusst nicht enthalten. Das automatische Hochladen schließt diese Ordner aus und löscht oder überschreibt sie nie.

## Neu bauen

```
npm ci
./build.sh
```

## Veröffentlichen

Jede Änderung in `website/` auf dem Zweig `main` wird automatisch hochgeladen. Manuell: GitHub → Actions → „Website hochladen“ → „Run workflow“ (mit „Probelauf“ wird nur angezeigt, was sich ändern würde).

Benötigte Geheimnisse (Settings → Secrets and variables → Actions):

| Name | Inhalt |
|---|---|
| `FTP_SERVER` | Hostname des FTP-Servers (keine IP-Adresse) |
| `FTP_BENUTZER` | FTP-Benutzername |
| `FTP_PASSWORT` | FTP-Passwort |
| `FTP_ORDNER` | Zielordner, z. B. `./` oder `/httpdocs/` (mit `/` am Ende) |

Die Verbindung ist immer verschlüsselt (FTPS), das Zertifikat wird geprüft. `FTP_SERVER` muss daher der Hostname sein, auf den das Zertifikat ausgestellt ist, keine IP-Adresse.
