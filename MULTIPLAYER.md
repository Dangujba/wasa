# WASA multiplayer alpha

The Challenges menu opens `/multiplayer/`. Existing WASA accounts and saved
avatars join a 160 m on-foot race. Find an opponent uses a FIFO queue; Create
Private Room gives an eight-character invitation code. Both players select
Ready. Arrows/WASD move, Shift sprints, and drag rotates the camera. Four ordered
gates lead to the finish. A public race can be watched by authenticated viewers.

This is a compact illustrative arena inspired by Damaturu streets. The larger OSM exploration world now supports shared signed-in exploration. Vehicle modes, skill matchmaking, chat,
tournaments and real-money systems are future work. Phone testing is deferred.

## Gameplay and protocol

`public/shared/movement.js` supplies acceleration/turn rules to exploration and
racing. `public/multiplayer/simulation.js` is the canonical versioned course and
pure movement step, imported by Node and loaded by the browser. The course is
flat at 0.13 m, bounded by physical kerbs, with two start markers and four gates.
Changing geometry requires a course version change and traversal tests.

The Fastify HTTP server owns `/api/multiplayer/socket`. Upgrade requires the
existing session cookie and exact configured Origin. Messages carry `v:1`.
Player identity comes from the session. Sockets cannot submit position, delta
time, checkpoint or winner claims. One account has one active connection;
another tab replaces the old socket and preserves its current room membership.

The server runs at 30 steps/s, sends room snapshots at 10/s, accepts at most 65
messages/s and 12 control actions/s, and caps payloads at 2 KiB. Six queued inputs
are retained; delayed batches replace old frames without adding simulation
time. Repeated/older sequences are ignored. Stale input brakes after 250 ms.
The client predicts with the same rules, replays unacknowledged frames after
snapshots, and smooths displayed corrections and other avatars.

Waiting players can move or respawn. Both Ready signals reset start positions
and trigger a 3-second countdown; countdown movement is ignored. The first
server-validated finish wins; finishes in the same simulation tick draw. A race
times out after 120 seconds. Disconnects hold a slot for 15 seconds, then forfeit
if an opponent remains connected. Logout/account deletion abandons a race.
Graceful server shutdown abandons active races; a crash clears active rooms,
without awarding points. Rematch requires a saved result and two connected
players. Completed rooms expire after 5 minutes; idle lobbies after 15 minutes.

Public spectators are read-only and can follow either lane, the overview or
finish line. Private races are absent from public discovery. Caps of 48 rooms,
192 sockets and 8 spectators/room are defensive limits, **not measured capacity
claims**. Full load/latency acceptance remains pending.

## Persistence and privacy

`api/multiplayer-migration.sql` adds `race_results` and `race_participants`.
Result and both participant rows commit in one transaction. The result UUID is
unique; replaying a persistence call has no effect. Leaderboard points are
derived from rows: win 3, draw 1, loss/abandoned 0. No mutable ranking counter can
be incremented twice. Failed writes retry; the UI distinguishes saving/saved.

Snapshots expose display name, account UUID, selected avatar, movement and race
state. They exclude email, password hashes and session tokens. Results store no
display-name snapshot, email, avatar or input log. Deleting an account removes
profile/sessions and sets historical participation's account link to NULL.
History then labels that participant Deleted player; rankings exclude them.
Admin result voiding and anti-farming measures remain future work.

## Verification

Install dependencies with `npm ci --prefix api`. `node --test tests/*.test.cjs`
runs existing geometry, motion, control and model checks plus six race tests.
The HTTP/socket integration test is skipped unless `WASA_TEST_DATABASE` names a
fresh database matching `wasa_multiplayer_test_` plus eight hexadecimal digits.
It asserts the database is empty before registering disposable accounts.

Initialize that isolated database with `api/schema.sql`,
`api/avatar-migration.sql`, then `api/multiplayer-migration.sql`. Set PGHOST,
PGUSER and any PGPASSWORD through the environment, then run:

```text
WASA_TEST_DATABASE=wasa_multiplayer_test_a1b2c3d4 node --test tests/*.test.cjs
```

Use actual hexadecimal digits in the database suffix. The integration test
covers real account/avatar APIs, rejected upgrades, two sockets racing,
reconnection, a third spectator, persistence retry idempotency, logout,
deletion anonymization and reading rankings in a fresh API instance. GitHub CI
creates its own PostgreSQL service. Browser checks use separate sessions and a
separate test database; no test players/results are added to production.

Desktop browser verification: menu sign-in, matchmaking, two saved avatars,
full-course sprint, shared saved result on both clients and a spectator,
spectator finish camera, private-room invitation and second-player movement.
No warning/error appeared during the completed race. Physical-phone and named
hardware performance tests have not run.

## Configuration and release

Production defaults stay at `https://wasa.kasua.ng`, local PostgreSQL socket,
user `wasa`, database `wasa_dev`, and loopback API port 3200. Configure overrides
with `WASA_ORIGIN`, `WASA_PORT` and PG environment variables outside Git.
Production cookies remain `__Host-wasa_session`, Secure, HttpOnly, SameSite=Lax.
For isolated loopback development only, `WASA_LOCAL_DEVELOPMENT=1` permits an
HTTP loopback origin and separate `wasa_dev_session` cookie.

`tools/package-multiplayer-release.py DEPLOYED_BASE_SHA` packages a clean tested commit and checks the exact deployed baseline. It includes locked API dependencies and the additive race migration for subsequent backend releases. `tools/install-multiplayer-release.py` verifies SHA/path/
baseline file drift, backs up source, dependencies, Nginx and a verified account
database dump, stages locked dependencies, stops the existing API, applies the
additive migration, installs source, configures the exact WebSocket proxy and
starts/health-checks the API before reloading Nginx. Existing HTTP endpoints and
authentication remain on the same service. Never expose PostgreSQL publicly.

Installation failure restores source, dependencies and Nginx, then starts the
previous API. Compatible additive race tables remain. It does not overwrite
accounts with an old dump. A deliberate rollback/restore exercise in staging
is still pending. After installation, verify the public HTTPS API, static file
hashes and rejected unauthenticated WSS handshake, then advance the server Git
index only after every changed file matches the tested commit. Keep deployment
backups under `/var/backups/wasa`, outside the public directory.

## Next release gates

Required checks/branch protection, staged recovery drills, concurrent-user and
poor-network load targets, moderation/account recovery policies, operational
alerts, admin result voiding, and actual Android tests when resumed. Follow
`WASA_REMAINING_WORK_ROADMAP.md` for expansion after those gates.


## Shared city and original interface

The Play WASA / Explore Damaturu route now joins signed-in accounts to one shared
city. Guests retain a clearly labelled solo preview. The existing square menu
and Avatar Studio controls, Barlow Condensed headings, DM Sans text, mint/gold
accents and blue-green panels also define the multiplayer interface. Ordinary
buttons, inputs, cards and world panels have square corners; joystick rings
remain circular movement controls.

`tools/build-city-physics.cjs` captures actual walkable triangles and collision
boxes from the same map, flyover, authored street and district builders used by
the renderer. `public/world/data/city-physics-v1.json` holds the revisioned data.
`public/shared/city-simulation.js` implements spatial surface/collision indexes
and bounded movement shared by the server and city client. CI rebuilds the data
and detects an uncommitted geometry change. Rerun the generator after changing
city geometry. The current export has 47,188 flat road/pavement bands, 154 elevated/detail surface triangles and 1,581 colliders. Flat bands are stored compactly instead of repeating their triangles.

The existing authenticated socket also accepts explore, world_input and
city_travel. City membership excludes race-room/queue membership. Logging out
or deleting an account closes the city session. Reconnecting within 15 seconds
retains the exploration position. Travel accepts only three server-selected
safe arrival points: street-block arrival, The Cross approach, and YSU approach.
Raw positions, elapsed time and arbitrary teleport targets are rejected.

The city has a defensive 64-connection cap. At 10 snapshots/s, each member sees
up to 24 nearby peers within 180 m. The browser renders the closest 16 with their
saved appearance, interpolated movement, elevation-aware feet and nameplates.
Snapshot membership disappears on disconnect and returns on reconnect. Counts
report connected explorers only. These caps are not claims of measured phone
or public-beta capacity. Automated tests exercise 64 simulated explorers and
16 authenticated real sockets on an isolated PostgreSQL database, including
movement, travel, interest filtering, reconnection and session revocation.

The city adds no database migration or permanent location history. Game-world
positions and selected appearance are visible to nearby players. They contain
no emails, password hashes or session tokens. Race behavior and stored results
remain independently tested. Phone testing remains deferred; public load,
long-duration stability and deliberate restoration exercises remain pending.
