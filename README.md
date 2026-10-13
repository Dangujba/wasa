# WASA

WASA is an experimental 3D browser game inspired by Damaturu, Yobe State, Nigeria. The long-term vision includes multiplayer competitions, exploration and vehicles. The current implementation is a single-player walking/exploration prototype with accounts and a character studio.

**Live preview:** https://wasa.kasua.ng/

## Project structure

- **public/** â€” Babylon.js game world, Character Studio, loader, menus and bundled browser assets.
- **public/world/data/** â€” derived OpenStreetMap data.
- **api/** â€” Node.js/Fastify API, PostgreSQL schema and player-account functions.
- **source-maps/** â€” OSM extracts, geographical-data generation scripts and development notes.
- **public/rendering/** â€” shared lighting, surface textures and graphics profiles.
- **public/avatar/models/** â€” male/female skinned wardrobe GLBs, provenance and manifests.
- **tools/build-wardrobe.py** â€” reproducible avatar authoring pipeline (NumPy/Pillow).
- **tests/** â€” Babylon NullEngine geometry, avatar and controller checks (`node --test tests/*.test.cjs`).

See [REALISM_UPGRADE.md](REALISM_UPGRADE.md) for the current realism pass, validation requirements and remaining asset work.

## Local development

Requires Node.js, PostgreSQL and a static web server.

1. Run npm ci inside the api directory.
2. Create a separate local PostgreSQL development database using api/schema.sql.
3. Configure the development connection safely and start the Fastify API.
4. Serve the public directory over HTTP(S) and configure reverse-proxy routes as needed.

The current API is configured for a local PostgreSQL socket and the database role used in the development VPS. The server configuration is not a one-command general-purpose deployment.

## Status and limitations

- Map-based Damaturu street network and YSU corridor.
- Illustrative commercial storefronts, homes, flyover, filling stations and university-area scenery.
- Third-person walking, mini-map, camera controls, avatar studio and account API.
- Walkable flyover ramps and curbs, runtime foot placement, smooth acceleration/turns, and damped head/garment motion.
- Multiplayer gameplay, production-quality vehicle racing and architectural fidelity are future work.

The building models and bridge structure are game-art approximations, not surveyed architecture. Businesses without verified location information are not pinned to invented addresses.

## Licensing and attribution

Map extracts and derived geographic data are based on OpenStreetMap contributors and are subject to the Open Database License (ODbL). See https://www.openstreetmap.org/copyright and public/world/DATA-SOURCES.md.

The bundled Babylon.js engine and 8.26.0 loaders are Apache-2.0 software; see
public/vendor/BABYLON-LICENSE.md. The wardrobe GLBs use CC0 MakeHuman core assets
plus WASA-authored garments, materials and clips; see public/avatar/models/ART-SOURCES.md
and MAKEHUMAN-CC0.md for provenance and licensing.

## Security and deployment

Never commit secrets, local .env files, certificates or keys, sessions, private customer data, production databases/backups or installed node_modules. Review the code before public distribution. Deploy via testing and explicit production release steps.

Repository owner: Dangujba.
