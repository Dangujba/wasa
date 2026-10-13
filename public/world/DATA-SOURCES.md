# WASA Damaturu World 01, Step 4

Game version: 0.4.2, October 12, 2026.

## Geographic source
Street coordinates and 132 building footprints are exported from OpenStreetMap XML
retrieved on 2026-10-12 using bounding coordinates
(11.9480, 11.7370, 11.9740, 11.7570).
The prototype's center is anchored near the main highway intersection at
approximately 11.74335 N, 11.96270 E. This coordinate is an estimate from
mapped road geometry, NOT a professional geodetic survey.

OSM attribution: (c) OpenStreetMap contributors; map data available under the
Open Database License 1.0. See https://www.openstreetmap.org/copyright

221 mapped street ways are included after clipping to the playable central
region. 132 mapped building footprints are present in the source JSON;
not all are rendered because of proximity, clipping and scene exclusion rules.
The map is incomplete near The Cross.

## Art and accuracy
A 3D Flyover and Underpass model has been placed at the interchange as a
concept of Damaturu's new infrastructure. The shape, heights, lane geometry,
supports and traffic markings are NOT based on as-built engineering drawings
or verified completion photographs.
Surrounding streets follow OSM positions. Rendered building façades and
heights are illustrative. Additional modular game storefronts,
trees, race HQ and stage furniture are clearly provisional, NOT surveyed
real businesses, addresses or landmarks. The WASA Race HQ is fictional.

## Functionality
Third-person local avatar exploration, walking, running, OSM mini-map,
camera control, a landmark checkpoint, keyboard and mobile joystick,
lightweight building collision and settings. Signed-in players see a simplified
representation of their saved avatar appearance.

No multiplayer synchronization, vehicles, racing, online state or city
persisted coordinates are implemented in this phase.

## Next accuracy milestones
- Obtain recent photography and survey/GIS outlines of The Cross and flyover.
- Obtain building footprints for central Damaturu, especially the immediate
  junction where OSM's source coverage is sparse.
- Rebuild the bridge with correct elevation, slopes, barriers, lanes and ramps.
- Add accurate market, stadium, and other named landmarks only after spatial
  coordinates have been validated.
- Replace provisional models with optimized, licensed production GLB assets.

## Authored neighborhood street block

The current art pass adds a bounded illustrative street block aligned with OSM way `559167448`. Buildings, shop names, courtyard layouts, drainage and trees are game art, and are not assertions about actual businesses or surveyed street features. Reference photographs, generated-asset provenance and the foliage prompt are recorded in `public/assets/street-block/ART-SOURCES.md`.
