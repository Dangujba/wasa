# WASA Human Character Preview 0.7.3

Integrated into the actual 3D Babylon.js Avatar Studio and Damaturu World.

## Imported human bases
- https://github.com/hmthanh/3d-human-model
- Male: Thanh.glb, exported as public/avatar/models/repo-male.glb after image WebP conversion.
- Female: TranThiNgocTham.glb, exported as public/avatar/models/repo-female.glb after image WebP conversion.
- Both use 67-joint skeletal hierarchy, but have no baked animation clips.
- This is a **pre-alpha technical prototype**, not a grant of third-party commercial rights.
- The repo package's MIT declaration does NOT necessarily license the Wolf3D/Ready Player Me-style character asset meshes and their textures. Contact the rights holder / source model service before distributing or commercializing a public multiplayer game.

## Current renderer
- public/avatar/wasa-github-human.js: imports actual textured/skinned GLB bodies, then creates prototype Northern garment pieces and drives joints for locomotion.
- public/avatar/avatar-model.js: Babylon.js live model editor camera / idle-walk-run preview.
- public/world/world.js: shared renderer for Damaturu walking avatar.
- Avatar config remains unchanged in PostgreSQL. No account tables changed.
- Outfit geometry is a preliminary approximation, not the final premium Jamfa / Abaya art assets.
- To meet the reference visual bar, commission/author skinned garment GLBs for Jamfa, Shadda, Babbar Riga, Abaya and Hijab, with proper material maps and attachment to the human skeleton; do not substitute rendered 2D images.

## Reversion
Backups are stored at /var/backups/wasa/pre-real-mesh-20261012/.
