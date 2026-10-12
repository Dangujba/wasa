# WASA

WASA is an experimental 3D browser game inspired by Damaturu, Yobe State, Nigeria. The long-term vision includes multiplayer competitions, exploration and vehicles. The current implementation is a single-player walking/exploration prototype with accounts and a character studio.

**Live preview:** https://wasa.kasua.ng/

## Project structure

- **public/** — Babylon.js game world, Character Studio, loader, menus and bundled browser assets.
- **public/world/data/** — derived OpenStreetMap data.
- **api/** — Node.js/Fastify API, PostgreSQL schema and player-account functions.
- **source-maps/** — OSM extracts, geographical-data generation scripts and development notes.

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
- Multiplayer gameplay, production-quality vehicle racing and architectural fidelity are future work.

The building models and bridge structure are game-art approximations, not surveyed architecture. Businesses without verified location information are not pinned to invented addresses.

## Licensing and attribution

Map extracts and derived geographic data are based on OpenStreetMap contributors and are subject to the Open Database License (ODbL). See https://www.openstreetmap.org/copyright and public/world/DATA-SOURCES.md.

The bundled Babylon.js engine is third-party software. See public/vendor/BABYLON-LICENSE.md. Review additional content licenses before distributing a public build.

## Security and deployment

Never commit secrets, local .env files, certificates or keys, sessions, private customer data, production databases/backups or installed node_modules. Review the code before public distribution. Deploy via testing and explicit production release steps.

Repository owner: Dangujba.
