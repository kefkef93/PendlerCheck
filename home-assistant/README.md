# Pendelcheck als Home-Assistant-Karte

`pendelcheck-card.js` ist die Seite `pendelcheck.html` als Lovelace-Custom-Card.

## Einrichtung
1. Datei nach `/config/www/pendelcheck-card.js` kopieren.
2. Einstellungen → Dashboards → Ressourcen: `/local/pendelcheck-card.js?v=1` als *JavaScript-Modul* hinzufügen.
3. Karte einfügen:

```yaml
type: custom:pendelcheck-card
title: Pendelcheck
arrive_by: "07:40"
return_from: "16:40"
refresh_minutes: 10   # 0 = kein Auto-Refresh
# routes:             # optional, Rückfahrt wird automatisch umgedreht
#   - { id: nauen, from: "Nauen, Bahnhof", to: "Berlin Jungfernheide" }
```

Die Karte fragt `v6.vbb.transport.rest` bzw. `v6.db.transport.rest`
direkt aus dem Browser ab (zuerst VBB, sonst DB). Der Verlauf liegt wie bei der Webseite im `localStorage` des jeweiligen Geräts.

## Als Sensoren (Paket)
`packages/pendelcheck.yaml` legt die Pendelstrecken als echte Sensoren an (VBB-Echtzeitdaten,
alle 10 Minuten aktualisiert):

1. In `configuration.yaml` (falls noch nicht vorhanden):
   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```
2. Datei nach `/config/packages/pendelcheck.yaml` kopieren (z. B. mit dem File editor).
3. Einstellungen → System → Neu starten (beim ersten Mal ist ein Neustart nötig).

Pro Strecke und Richtung entstehen:
`sensor.pendelcheck_<hinfahrt|ruckfahrt>_<wustermark|nauen|brandenburg>_verspatung` (min),
`..._zuverlassigkeit` (%), `..._verbindungen` (Text) und `binary_sensor..._zugausfall`,
dazu `sensor.pendelcheck_hinfahrt_empfehlung` / `sensor.pendelcheck_ruckfahrt_empfehlung`.
Hinfahrt = Verbindungen mit Ankunft bis 07:40, Rückfahrt = Abfahrt ab 16:40.
