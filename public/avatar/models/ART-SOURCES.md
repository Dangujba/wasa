# WASA rigged wardrobe

The shared adapter uses two self-contained assets: `wasa-masculine.glb` and
`wasa-feminine.glb`. All nine existing outfit IDs now use skinned geometry:
Jamfa, Kaftan, Shadda, Babbar Riga, Kanuri Attire, Jallabiya, Abaya, Atamfa,
and Buba & Zani. Male/female bases, headwear, hairstyles, facial hair, footwear,
colours and accessories preserve the existing appearance schema. A procedural
fallback remains available for a failed download; it is not the normal wardrobe.

## Provenance

Anatomical topology, adult male/female shape targets, skin weights, joint
landmarks, and low-poly eyes/eye texture come from the official
[MakeHuman repository](https://github.com/makehumancommunity/makehuman) at commit
`a8bc2d54ff0ac92e78ff71431b1023eda42bf482`. Core graphical assets are CC0. The
software has a separate license and is not included. See the pinned
[asset license](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.ASSETS.md),
`MAKEHUMAN-CC0.md`, and each asset's manifest for exact paths and source hashes.

Garment profiles, yokes/sleeves derived from the base topology, collars,
embroidery, floral/diamond textile prints, neutral weave/roughness maps,
hairstyles, caps/scarves, shoes, jewellery, henna and handbag are authored in the
WASA build script. The reduced rig, garment bones and animation clips are also
authored there. Cultural shapes are illustrative game art. No Ready Player Me,
Wolf3D, uncertain repository models, photographic skin scans, or paid animation
packs are bundled.

## Rebuild and runtime

Run `python tools/build-wardrobe.py` with NumPy and Pillow available. Use
`--body masculine` or `--body feminine` to rebuild one asset. The script downloads
hash-verified CC0 data into ignored `tmp/character-source`. No Blender or
MakeHuman application install is needed. Source body files are not served.

Each body asset stays below 4 MB (approximately 3.45 MB male / 3.16 MB female).
It contains one anatomical base, all applicable garment alternatives, embedded
PNG maps, a 42-joint rig, and five looping clips. Four of the joints control
lower garment movement. Unselected garment, hair, cap and accessory meshes are
deleted from the displayed instance. Tested looks stay below 22,000 live vertices
and 40 visible meshes. Templates/maps load once per body per scene; actor colours
use cloned materials while textures remain shared. Repeated wardrobe changes
and scene disposal release the appropriate resources.

The male body is 1.81539 m and the female body 1.67002 m in glTF coordinates
(+Y up, +Z forward). The adapter converts facing to WASA's -Z convention and
preserves studio scale. The world uses 1.82 m / 1.72 m body height; headwear adds
to that height. The studio waits for scene/model preparation before uncovering
the preview, including when changing body types.

## Animation and verification

`idle`, `walk`, and `run` are authored in-place clips at 30 Hz. `robe_walk` and
`robe_run` add shorter strides for long garments. The adapter presents the same
idle/walk/run controls for every outfit and blends positions/quaternions between
clips. Idle includes breathing and weight shifts; movement includes opposing
arm/leg swing, knee flexion, relaxed fingers and damped garment motion. Floor
contact is baked from the shoe soles. `public/avatar/wasa-motion.js` adds runtime
two-bone foot placement, support-plane sole alignment and bounded stance/pelvis
corrections in the world. Head and garment joints add damped motion driven by
look bearing, acceleration and turns. These are authored clips and secondary
bone motion, not motion capture or physical cloth simulation. Facial animation
remains a future refinement.

Both assets pass Khronos glTF Validator with zero errors, warnings and infos.
Run `node --test tests/*.test.cjs` for the 19 checks covering all nine outfits,
geometry, normalized skin weights, continuous loops, articulation, transitions,
world-scale floor tolerance, scarves/hair/accessories, texture/material selection,
loading/disposal races, resource counts, city geometry and controller directions,
slope/curb sole contact, flyover access, acceleration/turn limits and motion settling.
CPU imports omit image decoding; browser checks cover actual maps and shaders.
For temporary world visual QA use `?debug=1&body=feminine&outfit=abaya` (or a valid
male outfit). These query selections do not write account appearance records.

Real-phone performance testing was explicitly deferred by the user on 13 October
2026. Earlier 390 x 844 responsive checks establish layout only. The sustained
30 FPS three-minute route remains a future hardware acceptance test; this release
makes no phone-performance guarantee.
