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
