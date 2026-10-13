# WASA — Remaining Work & Development Roadmap

**Project:** WASA — The Challenge City  
**Setting:** Damaturu, Yobe State, Nigeria  
**Repository:** [Dangujba/wasa](https://github.com/Dangujba/wasa) (public; verified via GitHub)  
**Live preview:** [wasa.kasua.ng](https://wasa.kasua.ng/)  
**Prepared:** 13 October 2026  
**Prototype baseline:** `37a2dc1` (World script `v1.7.0`). This revised copy also records the subsequent multiplayer milestone and its test evidence in `MULTIPLAYER.md`.  
**Status:** Desktop multiplayer alpha — the first on-foot race is implemented and verified in an isolated test environment. Production deployment is tracked in `MULTIPLAYER.md`; real-phone testing remains deferred.

> **Purpose:** A practical backlog showing what remains to turn WASA from its current Damaturu exploration prototype into a genuinely playable multiplayer challenge game with live spectators, competitions and rankings. The items below are development requirements, **not claims that they have been completed**. Existing features were assessed from repository code and documentation; live-device testing has not been repeated for this document.

## 1. Product direction and priority

**The game should be built around actual competition, not around a decorative city or an avatar shop.** The minimum convincing version of WASA is:

1. Two people sign in and enter the **same online match**.
2. They can see each other move in the same 3D area.
3. They complete an understandable challenge with a clear start, rules and finish.
4. The server determines the legitimate winner.
5. Other players can **watch the match live**.
6. A result is saved and displayed on a leaderboard.
7. The experience works reasonably on supported desktop and Android devices.

**Recommended first competitive mode:** **1v1 on-foot sprint/checkpoint race in a small, optimized section of Damaturu**. This avoids delaying the entire multiplayer game on vehicle physics. Bicycle/motorcycle/car racing can follow after the shared network, match and ranking systems work.

### Priority labels

| Label | Meaning | Release implication |
|---|---|---|
| **P0** | Required for the first playable multiplayer alpha | Must be done first |
| **P1** | Required before an open/public beta | Complete after the P0 loop works |
| **P2** | Expansion or polishing | Do not block the first competitive release |

## 2. What already exists — do not rebuild unnecessarily

These components are **present according to the current repository**, although any release should re-run testing:

| Area | Current implementation/evidence | Status |
|---|---|---|
| Git hosting | Public GitHub source control, Git history and VPS deployment flow | Implemented |
| Game menu | Startup animation, Play WASA, Character, Challenges, Watch Live and Settings | Implemented UI; competitive menus currently placeholders |
| Player API | Registration, login, logout, `GET /api/me`, profile update/delete and sessions in Fastify/PostgreSQL | Implemented baseline |
| Avatar Studio | Persistent appearance selections and character configuration API | Implemented baseline |
| Character artwork | Two skinned GLBs, masculine/feminine characters; nine outfits, 42-joint rigs and animation clips | Implemented first-pass art |
| Walking | Keyboard/joystick movement, walk/run, camera, smoothing, collisions and elevation-aware surfaces | Implemented; real-phone verification outstanding |
| Geographical world | Mapped Damaturu roads/building footprints, flyover concept, local scenery and YSU corridor | Implemented as illustrative environment, **not surveyed fidelity** |
| Visuals | Materials, texture maps, shadows, graphics presets, lighting and diagnostics | Implemented first realism pass |
| Street detail | Authored neighborhood block with shops, compounds, drains, crossings and roadside details | Implemented first-pass block |
| Testing | Node/Babylon automated tests, model checks and release packaging tools | Present; extend for networking and mobile |

**Source notes:** `README.md`, `REALISM_UPGRADE.md`, `api/AVATAR_STEP3_README.md`, `api/CHARACTER-SOURCE-NOTES.md`, `source-maps/WORLD_03_IMPLEMENTATION.md`, `public/world/index.html`, `public/menu.js`, `api/server.mjs`, `tests/`, and `tools/`.

### Remaining beyond the first multiplayer milestone

Implemented in this milestone: authenticated real-time players, FIFO matchmaking, private invitation rooms, one 160 m versioned sprint arena, server-controlled movement and timing, checkpoint validation, reconnects, rematches, authenticated read-only spectators, PostgreSQL results, and a simple points leaderboard. Larger multiplayer city exploration, vehicle racing, skill-based ranking, seasons, tournament operations and economy remain pending.

The first course is an **illustrative standalone arena**, separate from the geographic exploration map. Expanding races onto mapped streets requires a shared collision/surface export and new route verification.

## 3. P0 — First playable multiplayer alpha

### P0-A. Freeze a stable world and player controller

- [ ] Protect `main` with required checks. Use short-lived `codex/` branches for subsequent changes; a permanent `develop` branch is optional.
- [ ] Tag and document the current known-good prototype build; retain its rollback manifest.
- [x] Pick **one compact arena/street district** for the first online race rather than networking the entire 7 km-plus region.
- [x] Confirm the on-foot course is continuous, reachable and free of visual building/road overlaps, unexpected stops, teleporting, camera drift and collision bypasses.
- [x] Add reproducible start/finish/checkpoint positions in a versioned course data file, not scattered magic coordinates.
- [x] Prevent course routes from crossing unsafe geometry: buildings, bridge piers, inaccessible levels and unwalkable drops.
- [x] Add a **Return to Lobby / Respawn** action if the character becomes stuck.
- [x] Standardize race coordinates, heading, floor height and player state in a shared pure simulation. Exploration and race acceleration/turn helpers are shared; the large exploration map is not networked.

**Acceptance:** A player can walk or sprint the complete chosen course repeatedly in desktop-browser tests without leaving the track or hitting an invisible barrier. Reset always recovers an invalid player position.

### P0-B0. Shared simulation and backend release preparation

- [x] Extract pure acceleration/heading helpers for the exploration client, race prediction and Node server.
- [x] Define protocol version, input sequence numbers, server ticks and course version.
- [x] Run the HTTP/socket/database integration test against an isolated PostgreSQL database before production migration.
- [x] Add backend packaging, additive migration, dependency staging, WebSocket proxy and service restart/health checks.
- [x] Prepare automatic source/dependency/Nginx rollback on installation failure; retain a verified database dump without overwriting concurrent account writes.
- [ ] Exercise a deliberate backend rollback and database restoration in staging. Preparing recovery code does not prove restoration.
- [x] Bound message sizes, input queues, connections, rooms and spectators; enforce roles and invalidate logged-out sessions.
- [ ] Measure an explicit concurrent-user load target and operational alert thresholds.

### P0-B. Real-time multiplayer infrastructure

- [x] Introduce a real-time connection layer, such as WebSockets, in the Node.js backend; keep existing HTTP account endpoints.
- [x] Reuse validated player sessions to authenticate socket connections; do not trust player IDs supplied in client messages.
- [ ] Add presence states: online, in lobby, queued, in match, spectating, disconnected.
- [x] Implement room creation/joining, unique player membership, disconnect handling and reconnection windows.
- [x] Define versioned network messages (`join`, `input`, `snapshot`, `race_start`, `checkpoint`, `finish`, `result`, `leave`, `error`).
- [x] Use **server-authoritative** movement/checkpoint/result validation rather than trusting the browser's finish time or position.
- [x] Add network interpolation/prediction and reconciliation so other players move smoothly despite latency.
- [x] Limit client input rates, movement speeds, teleporting, invalid packets and duplicate requests.
- [x] Scope updates by room/nearby entities; avoid broadcasting every player to everyone.
- [ ] Add connection metrics (RTT/latency, active rooms, tick duration, messages/second, disconnect reasons).

**Acceptance:** Two separate browsers using different real accounts can join a room, see both avatars move, disconnect/reconnect safely and remain synchronized without granting clients control over the official outcome.

### P0-C. Make the first challenge actually playable

- [x] Implement the **1v1 street sprint/checkpoint race** as the initial mode.
- [x] Create a course selection screen showing distance, difficulty, start and finish.
- [x] Add the challenge flow: **Waiting → Ready → Countdown → Racing → Finished / Abandoned**.
- [x] Match exactly two eligible players and show an explicit opponent connection/ready status.
- [x] Spawn both players at validated start markers; use a shared authoritative countdown.
- [x] Define checkpoints, missed-checkpoint policy, false starts, timeouts and finish conditions.
- [x] Add race HUD: opponent, countdown, elapsed time, checkpoint progress and finish banner.
- [x] Handle ties, forfeits, inactivity, late joins, disconnects and canceled matches deterministically.
- [x] Record the official server-side result and show winner/runner-up to both players.
- [x] Add rematch after the result is saved and both players remain connected. Replay recording is future work.
- [x] Use character skins/outfits already selected in the existing Avatar Studio.

**Acceptance:** Two different accounts can complete a fair 1v1 race end-to-end, independently view the same winner and match time, and rematch without reloading the entire website.

### P0-D. First live spectator mode

- [x] Make **Watch Live** display actual public matches instead of the current “No live matches” placeholder.
- [x] Allow a third authenticated viewer to join public matches as a **read-only spectator**. Guest viewing and private-room spectators remain future work.
- [x] Add spectator cameras: follow player 1, follow player 2, elevated overview and finish-line view.
- [x] Show race stage, elapsed time, participants and checkpoint progress to viewers.
- [x] Ensure spectators cannot send movement input, affect race outcomes or access private room information.
- [x] Handle late spectator entry and spectators leaving mid-match.
- [x] Display the result to viewers at the end and close the stream gracefully.

**Acceptance:** Two players race while a third device watches live, switches cameras and sees the same official result without interfering.

### P0-E. Real results and leaderboard

- [x] Add transactional `race_results` and `race_participants` tables. Course data is versioned in source; rankings are derived from saved results, so result retries cannot award twice. Event archives and seasons are future work.
- [x] Save result idempotently using a unique match ID; retries must not award the same result twice.
- [x] Show races, wins, best time and simple points: win 3, draw 1, loss/abandoned 0. Detailed loss statistics and skill rating remain future work.
- [x] Add **Leaderboard**, **My Results** and **Match History** UI.
- [ ] Display top competitors and each player's rank, including when not in the top list.
- [x] Protect rankings from client-side edits, duplicate finish messages and invalid matches.
- [ ] Provide basic admin controls to void corrupted or abusive match results with an audit trail.

**Acceptance:** Completed matches persist through browser refresh and server restart. Both players see identical results and ranking updates; canceled/invalid matches award no points.

### P0-F. Essential multiplayer UI and identity

- [x] Replace the Challenges and Watch Live informational panels with genuine functional screens.
- [x] Show online/offline/connecting/reconnecting clearly; never show a fake live player count.
- [x] Show opponent avatars, display names and lobby state without leaking email or private profile fields.
- [ ] Create readable desktop and mobile HUD layouts; keep touch race controls visible.
- [x] Provide a network failure/retry state and safe return to main menu.
- [x] Present game rules and controls in plain English before the first match.

**Acceptance:** New players can complete Register/Sign in → Character → Match → Watch/Results without manual URLs, debug flags or operator intervention.

## 4. P1 — Public beta readiness

### P1-A. Genuine mobile testing and performance

- [ ] Test on **named entry-level and mid-range Android phones**, not desktop responsive emulation alone (real-phone testing was deferred in the current repository notes).
- [ ] Run a 3-minute real-world route in the street district and during an online match, recording device, browser, graphics mode, median FPS, low-percentile FPS, load time, memory and WebGL errors.
- [ ] Aim for a **sustained 30 FPS on a selected representative phone** and approximately 60 FPS on a selected desktop test machine; validate rather than assume.
- [ ] Optimize draw calls, static batching, instancing, texture memory, LOD, culling, shaders, shadows and GLB loads.
- [ ] Stream city/map chunks instead of loading the entire Damaturu + YSU region up front.
- [ ] Handle hidden tabs, background/foreground transitions, WebGL context loss, battery/thermal throttling and poor mobile data.
- [ ] Test touch joystick, sprint/action buttons, camera gestures and race HUD on actual devices.
- [ ] Measure multiplayer bandwidth and latency on typical Nigerian mobile connections.

**Acceptance:** A documented device test matrix passes gameplay, load, stability and networking criteria. Graphics fallback works rather than freezing on unsupported devices.

### P1-B. Map fidelity, landmarks and roads

- [ ] Get recent permitted photographic references, building-footprint data or on-site survey references for priority locations.
- [ ] Validate **The Cross/flyover geometry**: road alignments, ramp slope, underpass height, pier positions, signage, collision and camera elevation.
- [ ] Audit authored street-block sidewalks, open drains, crossing slabs, trees, walls and entrances for visually/physically consistent walking.
- [ ] Verify coordinates for meaningful places (YSU entrances, markets, government areas, stadiums, prominent roads) before pinning or naming them.
- [ ] Distinguish **OSM-backed geography** from invented illustrative shops, homes and arena structures in game information.
- [ ] Replace repeated placeholder facades with varied, licensed, well-optimized regional architecture.
- [ ] Add stable paths across sidewalks, crossings and local intersections so routes feel like a city, not disconnected art.
- [ ] Correct misaligned road textures, lane markings, road/terrain seams and pavement heights across representative neighborhoods.
- [ ] Rebuild navigation/course definitions whenever a road-data update changes traversal geometry.
- [ ] Include required OpenStreetMap attribution, ODbL compliance and asset provenance in any distribution.

**Acceptance:** The selected play districts are recognizable, collision-safe and supported by documented source data. Unverified landmarks remain explicitly unverified.

### P1-C. Multiplayer scaling and operations

- [ ] Define supported room occupancy and spectator counts using load tests, not guesses.
- [ ] Add bounded server tick scheduling, snapshot compression and network backpressure protections.
- [ ] Validate reconnect behavior after network drop or switching Wi-Fi/mobile data.
- [ ] Add Redis/pub-sub or a comparable shared layer **only if** horizontal game-server scaling is actually required.
- [ ] Log server metrics and structured errors; alert on API outages, socket disconnect spikes and unhealthy match loops.
- [ ] Add daily database backups, verified restoration tests and retention rules.
- [ ] Set database query indexes for match history, rankings and active queues.
- [ ] Enforce sensible room, matchmaking and account rate limits.

**Acceptance:** A documented concurrent-user load target is met; a server restart or temporary connection loss does not corrupt rankings or leave unusable active matches.

### P1-D. Security, fair play and user safety

- [ ] Threat-model real-time messages, race validation, replay attacks and speed/position spoofing.
- [x] Make all match state transitions server-owned; reject impossible movement and duplicate claims.
- [ ] Check access control on all player, admin and spectator operations.
- [ ] Implement username/content reporting and a basic moderation panel before adding public chat.
- [x] Update the privacy notice and verify account deletion: participation is anonymized with `ON DELETE SET NULL`, and deleted profiles disappear from rankings. Backup retention policy remains pending.
- [ ] Add secure password recovery and email verification as account policy requires.
- [x] Protect the API and WebSocket endpoints with origin/host restrictions, transport encryption, authentication and rate limits.
- [ ] Keep server credentials, keys, database records and private logs outside the repository; run secret-scanning in CI.
- [ ] Publish concise game rules, acceptable-use terms and reporting instructions before public registration.

**Acceptance:** Basic penetration/abuse scenarios cannot alter other users' accounts, fake results or expose private data; moderation and deletion requests have operational procedures.

### P1-E. Engineering and deployment quality

- [x] Add automated API integration tests against an isolated PostgreSQL database.
- [ ] Add server networking simulations: out-of-order input, high latency, lost packets, reconnects, duplicate finishes, concurrent joins and invalid messages.
- [ ] Add browser end-to-end tests for two players plus one spectator.
- [x] Keep the existing model, locomotion, world, and street-block tests; do not regress them.
- [x] Add CI for syntax, the existing asset/motion checks and multiplayer tests with isolated PostgreSQL. GitHub execution and required-check enforcement must be verified after push; secret scanning remains pending.
- [ ] Define staging and production environments with separate configuration and databases.
- [x] Add release packaging from a clean tested commit, versioned assets, manifests and backups. A deliberate staging rollback exercise remains pending.
- [x] Add deployment health checks after release; do not restart the live game for changes that only affect documentation.
- [ ] Document a low-risk deployment/rollback and database migration procedure.

**Acceptance:** A release can be traced to its Git SHA, deployed reproducibly and rolled back without losing player accounts or results.

## 5. P2 — Competitive and world expansion

### P2-A. More WASA challenge modes

- [ ] Ranked and casual 1v1 divisions with matchmaking by skill, latency and region.
- [ ] Time-trial challenges and daily/weekly city events.
- [ ] 4-player / 8-player competitive rooms after load testing.
- [ ] Bicycle race mode with handling, stamina and checkpoints.
- [ ] Motorcycle race mode with physical handling and appropriate game rules.
- [ ] Car driving and racing with collisions, camera modes, acceleration/braking and vehicle selection.
- [ ] Tournament brackets, invitations, rounds, finals and automated prize/points awarding (non-monetary initially).
- [ ] Replays or short match highlights generated from saved game-state events.

### P2-B. Living Damaturu

- [ ] More authentic local districts with individually validated roads and priority landmarks.
- [ ] NPC pedestrians, bicycles, motorcycles and cars with safe movement and realistic traffic patterns.
- [ ] More varied shops, transport parks, road signs, street furniture and roadside activity.
- [ ] Better soundscapes: traffic, footsteps, markets, environmental ambience and events; use properly licensed audio.
- [ ] Dynamic weather, dust, daytime/nighttime, heat haze and richer graphics **only after mobile performance budgets pass**.
- [ ] Enterable buildings/marketplaces as optimized interior instances rather than loading all interiors globally.

### P2-C. Avatars, progression and customization

- [ ] Improve facial expressions, emotes, lip sync and interaction animations.
- [ ] Refine cloth physics, cloth-body collision and outfit movement within GPU budgets.
- [ ] Character nameplates, gestures and victory animations with appropriate player controls.
- [ ] Inventory/ownership schema and actual earned cosmetic unlocks; preserve all existing saved outfit IDs.
- [ ] Achievement badges, account levels and seasonal cosmetic rewards.
- [ ] Shops and **Wasa Kudi** economy only when inventory, transactional integrity, fraud checks, moderation and applicable policy are ready. No real-money purchases or withdrawable currency in the early alpha.

### P2-D. Community and platform growth

- [ ] Friends, invitations, private challenge links and recent opponents.
- [ ] Clan/crew competitions and team leaderboards.
- [ ] Live spectator discovery, event schedules and shareable match result cards.
- [ ] Accessibility: captions, text size, color contrast, low-motion mode and remappable controls.
- [ ] Optional Hausa and Kanuri language/localization after strings are externalized and reviewed.
- [ ] Native Android packaging/PWA **after** browser gameplay and real-phone performance are proven.

## 6. Suggested system architecture

```text
Browser / Android web client (Babylon.js)
  |-- Main menu, avatar selection, world render, race HUD, spectator cameras
  |-- HTTPS (account/profile/history) ----> Fastify API ----> PostgreSQL
  |-- WSS (join/input/state/events) ----> Authoritative match server
  |                                           |-- Match and room state
  |                                           |-- Input & collision validation
  |                                           |-- Checkpoints & race timing
  |                                           |-- Spectator snapshots
  |                                           `-- Persist results to PostgreSQL
  `-- Static assets / map chunks / GLBs served via Nginx

Optional later: Redis pub/sub for multiple match-server processes;
observability service; CDN; media processing for match replays.
```

**Design rules:** Keep the actual gameplay server authoritative; don't expose PostgreSQL directly to browsers; reuse the existing session system; use versioned messages and idempotent writes; keep rendering separate from race outcomes.

### Proposed database objects (review before implementing)

| Object | Purpose |
|---|---|
| `courses` | Track versions, named checkpoints, allowed vehicle/player mode |
| `matches` | Room, mode, status, start/end, winner and validation flags |
| `match_players` | Participants, finish times, forfeit status, placement |
| `match_events` | Auditable countdown/checkpoint/finish/void events |
| `rankings` | Derived points or skill rating per mode/season |
| `seasons` | Optional ranked season windows and reset policies |
| `player_inventory` | Future cosmetic ownership; not needed for first alpha |
| `moderation_actions` | Reports, sanctions and admin audit trail |

## 7. Implementation phases and release gates

| Phase | Focus | Deliverable / exit gate |
|---|---|---|
| **Phase 0** | Stabilize codebase and chosen course | Clean Git baseline; reproducible walkable course; test suite passes |
| **Phase 1** | Shared presence | Two players join the same room and see synchronized movement |
| **Phase 2** | True competition | 1v1 sprint race with server-controlled start, checkpoints, winner and rematch |
| **Phase 3** | Spectators and ranks | Third user watches live; match is persisted; leaderboard updates correctly |
| **Phase 4** | Mobile and security hardening | Real Android tests, low-end optimization, abuse tests, recovery and monitoring |
| **Phase 5** | Public beta | Staged release, account policies, reliable matchmaking and clear support process |
| **Phase 6** | Expansion | Bicycles, vehicles, tournaments, extra districts, rewards and shops |

**Do not mark a phase complete solely because its UI exists.** Completion requires test evidence of the actual working behavior.

## 8. Critical test scenarios before first public multiplayer release

- [x] Two players in separate sessions connect with separate accounts; both avatars appear.
- [x] Countdown timing is consistent across clients and spectators.
- [x] Invalid movement/teleports cannot win a race.
- [ ] Leaving, refreshing or losing mobile network does not incorrectly award a win.
- [x] A reconnecting player gets a consistent match state.
- [x] Spectators receive the current match but cannot influence the server.
- [x] Duplicate finish messages create only one official match result.
- [x] Rankings survive server restart and repeated page reload.
- [ ] Map course checks pass at spawn, bends, sidewalks, drains and flyover levels.
- [x] Character selection, skin tone, clothing and headwear persist across lobby and match.
- [ ] Actual Android devices complete a full match without critical input, rendering or WebGL failures.
- [x] Private account information cannot appear in spectator snapshots or leaderboards.
- [ ] The server remains operational and recovers cleanly after an intentional restart.
- [ ] GitHub `main`, deployment manifest, and running production assets resolve to the expected release commit.

## 9. Milestones — scoped separately

1. **Shared simulation and presence — implemented:** one versioned course, authenticated rooms, two rendered avatars, shared movement rules and bounded real-time inputs.
2. **Race and permanent result — implemented:** countdown, ordered checkpoints, finish/draw/forfeit rules, transactionally saved outcomes and rematch.
3. **Spectators and simple rankings — implemented:** authenticated public spectators, four cameras, leaderboard and recent player results.
4. **Desktop alpha release — current gate:** complete source/runtime deployment verification and record the Git SHA. Retain the previous release and account database backup.
5. **Public beta hardening — pending:** load/latency targets, durable operations and restore exercises, admin result voiding, moderation, recovery policies and security review.
6. **Phone acceptance — deferred by user:** test named Android devices when the user resumes this gate. Do not advertise mobile performance before those tests.
7. **Expansion — later:** move races onto verified mapped street routes, add challenges and skill matching, then consider vehicles and tournaments.

### Definition of WASA's first *genuinely playable* release

> **Two real players can challenge each other in Damaturu, complete a fair online race while a third person watches live, and see a server-verified winner and permanent result.**

The core competitive loop is now covered by automated and desktop-browser evidence. Public beta readiness, citywide multiplayer and mobile acceptance remain separate gates.

---

## 10. Files to start with

| Repository location | Why it matters |
|---|---|
| `public/menu.js` | Replace Challenges / Watch Live placeholders |
| `public/world/world.js` | Player, map, checkpoint and world integration |
| `public/shared/movement.js` and `public/multiplayer/simulation.js` | Shared movement, protocol and canonical race geometry |
| `public/multiplayer/` | Matchmaking, lobby, race HUD and spectator client |
| `api/multiplayer.mjs` and `api/race-store.mjs` | Authoritative room loop and atomic persisted results |
| `public/avatar/wasa-rigged-human.js` | Show other participants' selected avatars |
| `api/server.mjs` | HTTP auth and new real-time room endpoints |
| `api/schema.sql` | Existing accounts and initial match/result migrations |
| `tests/` | Extend with multiplayer correctness and regression tests |
| `tools/package-release.py` and `tools/install-release.py` | Safe packaging, source traceability and rollback |
| `REALISM_UPGRADE.md` | Implemented visual work; mobile testing still outstanding |
| `public/world/DATA-SOURCES.md` | Map attribution and accuracy limitations |

This revised repository copy preserves the original document in Downloads. Completed items describe the first desktop course only; unchecked broader requirements remain pending.

**Maintenance rule:** Update this roadmap after each merged milestone. Use `[x]` only for independently verified features. Leave aspirations, placeholders and untested performance claims unchecked.
