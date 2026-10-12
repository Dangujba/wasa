# WASA World 03: Damaturu Urban Frontage, Flyover & YSU Corridor

Deployed: 12 October 2026. Live world version 1.0.4
https://wasa.kasua.ng/world/

## Map
- OpenStreetMap sources: source-maps/damaturu-extended-20261012.osm and source-maps/damaturu-ysu-corridor-20261012.osm.
- New bundled geodata: public/world/data/damaturu-region-v3.json.
- Generator: source-maps/build-world-v3.py.
- 2,304 mapped street sections; 1,042 OSM building outlines.
- Mapped street-graph route from The Cross area to a road near the YSU campus polygon: approximately 6,992 m. This is not driving time, routing advice or a surveyed public entrance.
- YSU campus OSM boundary way 845940671 included in map data.
- License and attribution: OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright

## World improvements
- 205 connected, generic commercial street-frontage blocks with 859 shop modules. These locations and facades are game art, NOT a mapped inventory of actual businesses.
- 215 gated residential compounds along minor roads, plus generic filling stations and streetlights.
- More detailed concept Damaturu Flyover and underpass: approach ramp, barriers, beams, pillars, lane markings, reflectors and lamp posts. Not an as-built engineering model.
- Map-derived university-area label and 5 illustrative institutional buildings. Their exact placement, architecture and entry are illustrative.
- Landmark directory shows OSM-backed places on the game map; GOLDEN SOUK, ELDAWOUD, banks, ministries and fuel stations that lack exact verified points appear unpinned, explicitly marked as awaiting verification.
- "Preview YSU Campus Area" temporarily jumps to an unobstructed location near the end of the OSM-connected route. This is a development convenience, not navigation gameplay.
- Existing avatar and accounts unchanged. Still a single-player pre-alpha exploration scene.

## Test and rollback
- Tested in headless Chromium desktop and mobile with gameplay WebGL rendering, landmark selection, YSU preview, and movement. Browser page errors: none; no GLB character downloads.
- Software-rendered test load ~15-26 seconds; optimize further for low-end Android before production release.
- Rollback snapshot: /var/backups/wasa/world03-20261012-1905/world.
