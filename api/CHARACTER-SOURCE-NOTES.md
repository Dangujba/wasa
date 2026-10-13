# WASA character sources

The shared adapter is public/avatar/wasa-rigged-human.js. All six male and three
female outfit choices now use public/avatar/models/wasa-masculine.glb and
wasa-feminine.glb: CC0 MakeHuman-derived anatomical bases, authored garments,
42-joint rigs (including four garment joints), and looping animation clips.

See public/avatar/models/ART-SOURCES.md and both manifests for pinned source
files, hashes, licenses, rebuild instructions, resource budgets and checks.
The obsolete Ready Player Me/Wolf3D repository models are not shipped.

Existing avatar IDs and account APIs are unchanged. Saved appearance settings
continue to select their corresponding outfit. The Lite renderer is an error
fallback. Real-phone performance testing was deferred at the user's request on
13 October 2026. Runtime foot IK and damped head/garment motion are now applied
after baked clips; see public/avatar/wasa-motion.js and REALISM_UPGRADE.md.
Facial animation and physical cloth remain future art refinements; the current
wardrobe is a pre-alpha game-art implementation.
