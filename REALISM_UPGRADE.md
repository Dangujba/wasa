# WASA realism: first implementation pass

This pass improves the existing procedural city and character. It does not establish surveyed architectural accuracy or replace the character with a production sculpted asset. The bundled engine is Babylon.js 8.26.0.

## Implemented

- Shared daylight environment and ACES tone mapping for the world and Character Studio. The environment is an original procedural LDR approximation with mipmaps and diffuse irradiance; it is not a prefiltered HDR photograph.
- Reusable asphalt, plaster, block and soil textures, with actual tangent-space normal maps and mipmaps. Textures are shared per scene rather than allocated per building or avatar.
- Meter-scaled wall and road UVs. Separate wall vertices preserve sharp corners and outward-facing normals. Roofs and parapets follow building footprints, and windows follow a facade facing a mapped road.
- Eight-meter ground texture repeats plus broad vertex-color variation, replacing the oversized grit pattern.
- Moving local sun-shadow coverage, with shadow behavior retained during static batching. The near-player caster list is rebuilt after batching and includes the animated character.
- Graphics modes that control render resolution, view distance, shadow resolution, SSAO and bloom. Auto starts conservatively, then reduces detail after sustained low frame rates. SSAO and bloom are optional high-mode effects.
- A continuous head silhouette, corrected garment normals and UV seams, nonmetallic skin, fabric normal maps, and separate metallic/nonmetallic embroidery treatment.
- Character meshes merged per animated joint and material. World characters use reduced tessellation; studio characters retain close-up detail. Existing appearance settings and movement joints remain supported.
- Optional diagnostics at `/world/?debug=1`, and `WasaWorldQA.getGraphics()` for resource counts and graphics state.

## Acceptance and verification

Run `node --test tests/realism.test.cjs` and JavaScript syntax checks before shipping. The five checks exercise clockwise/counterclockwise footprints, outward wall/roof normals, shadow-preserving batching, reduced character geometry, articulation, resource disposal, scene-specific texture caches and automatic quality reduction without overriding manual settings.

Browser verification must cover Auto â†’ Low â†’ High â†’ Auto, male/female outfits, scarves and headwear, idle/walk/run, and narrow-screen controls. A viewport simulation checks layout; it does not validate phone GPU performance.

The release target is a sustained 30 FPS on a named representative phone for a three-minute walking route through a populated area, with no WebGL errors or growing resource counts after wardrobe changes. Desktop target: 60 FPS on a named reference machine. Neither is a hardware-independent guarantee. Record browser, device, viewport, quality mode, median FPS and slowest-frame behavior before declaring the device target passed.

## Next milestone

An authored neighborhood street block now occupies a clear section of mapped road way `559167448`, about 95 meters from the previous spawn. It includes seven shop bays, two compounds, verandas, open drain models with eight crossing slabs, paved footways, roof tanks, utility poles/wires and three shade trees. The initial view starts on its clear road approach. The plan is selected before generic district generation, so the existing placement checks keep generic structures away from the authored block.

The architectural reference and generated foliage prompt are documented in `public/assets/street-block/ART-SOURCES.md`. Run `node --test tests/street-block.test.cjs` for site selection, footprint/road clearance, walking-route and resource-budget checks. The foliage texture is below 300 KB and authored geometry stays below 30,000 vertices before batching. Reference-inspired art remains illustrative rather than a surveyed street reconstruction.

Real-phone evaluation of the block is deferred at the user's request. Existing controller regression checks run with `node --test tests/world-controls.test.cjs`.

The full existing wardrobe now uses two skinned GLBs: six masculine outfits and
three feminine outfits. Each body asset stays below 4 MB, with an anatomical
face/hands, distinct garment geometry, fabric maps/prints, 42 joints (including
four garment joints), and blended idle/walk/run plus long-robe gait variants.
Skin/fabric/trim colours, hairstyles, facial hair, caps, scarves, footwear and
accessories remain selectable. Saved configurations and account APIs retain their
existing schema. The procedural renderer is a download-error fallback.

See `public/avatar/models/ART-SOURCES.md` for the CC0 bases, garment/animation
pipeline, limits and reproducible build (`python tools/build-wardrobe.py`).
The bundled Babylon 8.26.0 loader needs no external runtime CDN or decoder.
Both GLBs pass Khronos validation with zero errors/warnings/infos. All 20 checks
run with `node --test tests/*.test.cjs`, including all nine outfits, weights,
loops, articulation, transitions, world-scale floor tolerance, scarf/accessory
selection, loading races and repeated wardrobe resource counts.

Browser verification covers the actual material maps, all outfits, idle/walk/run,
headwear/colour changes and the mapped street walking route. Temporary world QA
selections use `?debug=1&body=feminine&outfit=abaya`; these never write profile data.
The studio keeps its preparation overlay visible until the model/shaders are ready.

The user explicitly deferred real-phone testing on 13 October 2026, allowing the
wardrobe and live deployment to proceed. Responsive checks cover layout only.
The three-minute real-phone route and sustained 30 FPS target remain future
hardware acceptance work. Facial animation and physical cloth remain
later refinements.

## Movement polish

The world now indexes explicitly walkable road, pavement, curb, drain-crossing
and flyover surfaces before static batching. Height selection preserves the
current level at stacked crossings. The flyover has approach ramps, height-aware
pier/barrier collisions, and camera follow at the player's actual elevation.
Steps above 0.32 m and drops above 0.42 m block movement; there is no jumping or
falling controller. Decorative roofs and objects are excluded from this index.

Velocity uses bounded acceleration/braking; heading takes the shortest turn with
a bounded angular speed. Gait cadence and walk/run blends follow actual speed,
including coasting to a stop and blocked movement. The original joystick
direction correction remains covered at five camera bearings.

`public/avatar/wasa-motion.js` adds two-bone leg IK, sole alignment to the support
plane, short stance anchors and a reach-limited pelvis adjustment. Both body rigs
use the same solver. Head look, torso lean and four garment joints respond with
damped springs to camera bearing, acceleration and turns. This is bounded
secondary bone motion, not physical cloth simulation. The shipped GLBs are
unchanged; the solver runs after their blended baked pose.

Tests cover actual sole geometry on slopes/split-height curbs at 60 Hz and 65 ms
steps, continuous flyover access, underpass/deck separation, pier/barrier
collisions, head/cloth settling, and acceleration/turn limits. Browser QA uses
`?debug=1&motion=flyover` or `?debug=1&motion=curb` with optional body/outfit
selections; these previews do not save profile data. A debug overlay reports
surface height and sole clearances. Real-phone testing is still deferred.

The idle/walk/run clips now bring the legs from the base mesh's separated-foot
pose into a relaxed stance beneath the hips. Counter-rotation at the ankles
keeps idle soles level. The stance regression covers all nine outfits with and
without terrain IK, including knee splay and walk/run transitions. Model URLs
are versioned so existing browser caches load the corrected clips.

Releases are packaged from a clean committed tree, with a commit/hash manifest
and a rollback snapshot on the server. GitHub and the live files are verified
against that commit after publication.

Defer dynamic time of day, heat haze, dust effects and additional post-processing until the chosen phone passes the frame-rate target. A new dependency-free engine feature still requires art, tuning and verification effort.
