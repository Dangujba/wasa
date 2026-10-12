# WASA World 02: Expanded Damaturu Geographic Preview

Implementation: 12 October 2026; version 0.9.3.

- Live route: https://wasa.kasua.ng/world/
- Enlarged map square covers +/- 2,400 m of approximate The Cross anchor
  (longitude 11.96270, latitude 11.74335), using an OSM export and clipping.
- Geographic source: OpenStreetMap contributors, under the ODbL 1.0.
  https://www.openstreetmap.org/copyright
- Geographic payload: public/world/data/damaturu-central-v2.json.
- Detailed input OSM: source-maps/damaturu-extended-20261012.osm.
- Generation script: source-maps/build-damaturu-v2.py.
- 1,766 clipped mapped road sections and 924 actual OSM building footprint polygons.
- A total of 270 *procedural, illustrative* storefronts are inserted beside
  mapped roads to address OSM building gaps. These buildings are NOT surveyed,
  and no store name or real address is claimed.
- A conceptual bridge/underpass remains at The Cross. Its geometric dimensions,
  lane alignments and support construction are NOT engineering survey data.
- The road generator fixes earlier downward-facing asphalt geometry.
- Camera now targets the player, follows from behind, permits mouse/touch
  look around, manual reset C and compact icon control.
- Mini-map is hideable (M key/icon) and starts collapsed on narrow screens.
- Entire old large mission panel, wide text buttons, control hint strip and
  full-width copyright/footer strip removed. OpenStreetMap attribution is
  available inside the mini-map and the Help panel.
- Avatar systems, player authentication and other VPS websites unchanged.
- Current scope remains local single-player walking, running, visual exploration,
  simple collisions. Cars, traffic, multiplayer and competition not implemented.
- Speed/radius and scene quality should be verified on real Android handsets.

Rollback snapshot: /var/backups/wasa/world-redesign-20261012-0748
