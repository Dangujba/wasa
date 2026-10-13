import {WebSocketServer, WebSocket} from 'ws';
import {randomUUID, randomBytes} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {isIP} from 'node:net';
import race from '../public/multiplayer/simulation.js';

const ZERO = Object.freeze({x: 0, z: 0, run: false});
const MAX_CONNECTIONS = 192, MAX_ROOMS = 48, MAX_SPECTATORS = 8, RECONNECT_MS = 15000;
export class RaceHub {
  constructor({store, clock = () => performance.now(), log = () => {}}) {
    this.store = store; this.clock = clock; this.log = log;
    this.clients = new Map(); this.rooms = new Map(); this.queue = []; this.tick = 0;
    this.lastStep = clock(); this.persistence = new Set();
  }
  send(client, message) {
    const ws = client?.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (ws.bufferedAmount > 65536) { ws.close(4008, 'Connection too slow'); return; }
    ws.send(JSON.stringify({v: race.VERSION, ...message}));
  }
  error(client, message) { this.send(client, {type: 'error', message}); }
  connect(identity, ws, sessionHash) {
    const prior = this.clients.get(identity.id);
    const client = prior || {identity, roomId: null, role: null, queued: false, disconnectedAt: null};
    if (prior?.ws && prior.ws !== ws) prior.ws.close(4001, 'Opened in another tab');
    client.identity = identity; client.ws = ws; client.sessionHash = sessionHash; client.disconnectedAt = null;
    client.windowAt = this.clock(); client.messages = 0; client.commands = 0;
    this.clients.set(identity.id, client);
    const room = this.rooms.get(client.roomId), player = room?.players.find(p => p.id === identity.id);
    if (player) { player.connected = true; player.disconnectedAt = null; player.inputs = []; player.lastInput = ZERO; player.ack = player.lastReceived; }
    this.send(client, {type: 'welcome', self: identity, course: race.course, tick: this.tick,
      room: room ? this.snapshot(room) : null, queued: client.queued});
    this.broadcast(room);
    return client;
  }
  disconnect(client, ws) {
    if (client.ws !== ws) return;
    client.ws = null; client.disconnectedAt = this.clock(); this.dequeue(client);
    const room = this.rooms.get(client.roomId), p = room?.players.find(p => p.id === client.identity.id);
    if (p) { p.connected = false; p.disconnectedAt = this.clock(); p.inputs = []; p.lastInput = ZERO; p.ready = false; }
    if (client.role === 'spectator') this.leave(client);
    if (room?.phase === 'countdown') this.cancelCountdown(room);
    this.broadcast(room);
  }
  revokeSession(hash) {
    for (const c of this.clients.values()) if (c.sessionHash === hash) { this.leave(c, true); c.ws?.close(4003, 'Session expired'); }
  }
  removeUser(id) {
    const c = this.clients.get(id);
    if (c) { this.leave(c, true); c.ws?.close(4003, 'Account unavailable'); this.clients.delete(id); }
  }
  dequeue(c) { this.queue = this.queue.filter(id => id !== c.identity.id); c.queued = false; }
  newRoom(owner, isPublic) {
    if (this.rooms.size >= MAX_ROOMS) { this.error(owner, 'All arenas are busy. Try again shortly.'); return null; }
    let code;
    do { code = randomBytes(4).toString('hex').toUpperCase(); } while ([...this.rooms.values()].some(r => r.code === code));
    const room = {id: randomUUID(), code, public: isPublic, phase: 'waiting', players: [], spectators: new Set(),
      createdAt: this.clock(), updatedAt: this.clock(), startTick: null, result: null, saved: false, saving: false};
    this.rooms.set(room.id, room); return room;
  }
  addPlayer(c, room) {
    if (!room || room.phase !== 'waiting' || room.players.length >= 2) return this.error(c, 'This room is unavailable or full.');
    const lane = room.players.some(p => p.lane === 0) ? 1 : 0;
    room.players.push({id: c.identity.id, lane, name: c.identity.displayName, avatarConfig: c.identity.avatarConfig,
      state: race.spawn(lane), ready: false, connected: true, checkpoint: 0, ack: 0, lastReceived: 0,
      inputs: [], lastInput: ZERO, inputAt: this.clock(), finishTick: null});
    c.roomId = room.id; c.role = 'player'; this.dequeue(c); room.updatedAt = this.clock();
    this.broadcast(room); this.send(c, {type: 'presence', queued: false});
  }
  leave(c, invalidated = false) {
    this.dequeue(c);
    const room = this.rooms.get(c.roomId);
    if (room) {
      if (c.role === 'player') {
        if (room.phase === 'racing') {
          if (invalidated) this.complete(room, 'abandoned', 'Account or session unavailable');
          else this.complete(room, 'forfeit', 'Player left the race', room.players.find(p => p.id !== c.identity.id && p.connected)?.id);
        }
        if (room.phase === 'countdown') this.cancelCountdown(room);
        room.players = room.players.filter(p => p.id !== c.identity.id);
      } else room.spectators.delete(c.identity.id);
      room.updatedAt = this.clock(); this.broadcast(room);
      if (!room.players.length) {
        for (const id of room.spectators) { const s = this.clients.get(id); if (s) { s.roomId = null; s.role = null; this.send(s, {type: 'left'}); } }
        this.rooms.delete(room.id);
      }
    }
    c.roomId = null; c.role = null; this.send(c, {type: 'left'});
  }
  handle(c, m) {
    const now = this.clock();
    if (now - c.windowAt >= 1000) { c.windowAt = now; c.messages = 0; c.commands = 0; }
    if (++c.messages > 65 || (m?.type !== 'input' && ++c.commands > 12)) { c.ws?.close(4008, 'Too many messages'); return; }
    if (!m || Array.isArray(m) || m.v !== race.VERSION || typeof m.type !== 'string') return this.error(c, 'Unsupported message. Refresh WASA.');
    const room = this.rooms.get(c.roomId), p = room?.players.find(p => p.id === c.identity.id);
    if (m.type === 'input') {
      if (!p || c.role !== 'player' || !race.validInput(m)) return this.error(c, 'Movement input rejected.');
      if (m.seq <= p.lastReceived) return; // Duplicates and old frames cannot move a player twice.
      // Delayed network batches replace old queued frames; they never add simulation time.
      if (p.inputs.length >= 6) p.inputs.shift();
      if (room.phase === 'waiting' && Math.hypot(m.x,m.z) > .05) room.updatedAt = now;
      p.lastReceived = m.seq; p.inputAt = now; p.inputs.push(m); return;
    }
    switch (m.type) {
      case 'ping': this.send(c, {type: 'pong', nonce: typeof m.nonce === 'number' ? m.nonce : 0}); break;
      case 'queue': {
        if (c.roomId || c.queued) return this.error(c, 'Leave your current room or queue first.');
        const other = this.queue.map(id => this.clients.get(id)).find(q => q?.ws?.readyState === WebSocket.OPEN && !q.roomId && q !== c);
        if (other) {
          const next = this.newRoom(c, true);
          if (next) { this.addPlayer(other, next); this.addPlayer(c, next); }
        } else { if (this.queue.length >= 96) return this.error(c, 'The queue is full. Try again later.'); this.queue.push(c.identity.id); c.queued = true; this.send(c, {type: 'presence', queued: true}); }
        break;
      }
      case 'cancel_queue': this.dequeue(c); this.send(c, {type: 'presence', queued: false}); break;
      case 'create': if (c.roomId || c.queued) return this.error(c, 'Leave your current room or queue first.'); this.addPlayer(c, this.newRoom(c, false)); break;
      case 'join': {
        if (c.roomId || c.queued) return this.error(c, 'Leave your current room or queue first.');
        if (typeof m.code !== 'string' || !/^[A-F0-9]{8}$/.test(m.code)) return this.error(c, 'Enter the eight-character room code.');
        this.addPlayer(c, [...this.rooms.values()].find(r => r.code === m.code)); break;
      }
      case 'ready': {
        if (!p || room.phase !== 'waiting' || typeof m.ready !== 'boolean') return this.error(c, 'Ready is unavailable.');
        p.ready = m.ready; room.updatedAt = now;
        if (room.players.length === 2 && room.players.every(q => q.ready && q.connected)) {
          room.phase = 'countdown'; room.startTick = this.tick + race.course.countdownTicks; room.result = null;
          for (const q of room.players) { q.state = race.spawn(q.lane); q.checkpoint = 0; q.finishTick = null; q.inputs = []; q.lastInput = ZERO; q.ack = q.lastReceived; }
        }
        this.broadcast(room); break;
      }
      case 'reset': if (!p || room.phase !== 'waiting') return this.error(c, 'Respawn is available in the lobby.'); p.state = race.spawn(p.lane); p.inputs = []; p.lastInput = ZERO; this.broadcast(room); break;
      case 'rematch':
        if (!p || room.phase !== 'finished' || !room.saved || room.players.length !== 2 || !room.players.every(q => q.connected)) return this.error(c, 'Both players must be connected and the result saved.');
        room.idForResult = randomUUID(); room.phase = 'waiting'; room.result = null; room.saved = false; room.startTick = null; room.updatedAt = now;
        for (const q of room.players) { q.ready = false; q.state = race.spawn(q.lane); q.checkpoint = 0; q.finishTick = null; q.inputs = []; q.lastInput = ZERO; q.ack = q.lastReceived; }
        this.broadcast(room); break;
      case 'spectate': {
        if (c.roomId || c.queued) return this.error(c, 'Leave your room or queue before watching.');
        if (typeof m.id !== 'string') return this.error(c, 'Select a live race.');
        const target = this.rooms.get(m.id);
        if (!target?.public || !['countdown', 'racing', 'finished'].includes(target.phase) || target.spectators.size >= MAX_SPECTATORS) return this.error(c, 'This public race is unavailable.');
        target.spectators.add(c.identity.id); c.roomId = target.id; c.role = 'spectator'; this.broadcast(target); break;
      }
      case 'leave': this.leave(c); break;
      default: this.error(c, 'Unsupported action.');
    }
  }
  cancelCountdown(room) { room.phase = 'waiting'; room.startTick = null; for (const p of room.players) { p.ready = false; p.inputs=[]; p.lastInput=ZERO; p.ack=p.lastReceived; } }
  complete(room, outcome, reason, winner) {
    if (room.phase === 'finished') return;
    if (outcome === 'forfeit' && !winner) outcome = 'abandoned';
    room.phase = 'finished'; room.updatedAt = this.clock(); room.saved = false;
    room.result = {id: room.idForResult || room.id, courseId: race.course.id, courseVersion: race.course.version, outcome, reason,
      players: room.players.map(p => ({id: p.id, lane: p.lane, displayName: p.name,
        placement: outcome === 'abandoned' ? null : outcome === 'draw' || p.id === winner ? 1 : 2,
        elapsedMs: p.finishTick == null ? null : Math.round((p.finishTick - room.startTick) / race.HZ * 1000),
        points: outcome === 'abandoned' ? 0 : outcome === 'draw' ? 1 : p.id === winner ? 3 : 0}))};
    for (const p of room.players) { p.state.vx = p.state.vz = 0; p.inputs = []; p.lastInput = ZERO; }
    this.persist(room); this.broadcast(room);
  }
  persist(room) {
    if (room.saving || room.saved || !room.result) return;
    room.saving = true;
    const promise = this.store.save(room.result).then(() => { room.saved = true; }).catch(() => { this.log('Race persistence failed; retry pending'); })
      .finally(() => { room.saving = false; this.persistence.delete(promise); this.broadcast(room); });
    this.persistence.add(promise);
  }
  snapshot(room) {
    return {id: room.id, public: room.public, code: room.public ? null : room.code, phase: room.phase, courseId: race.course.id,
      courseVersion: race.course.version, tick: this.tick, startTick: room.startTick, saved: room.saved, result: room.result,
      spectators: room.spectators.size, players: room.players.map(p => ({id: p.id, lane: p.lane, displayName: p.name,
        avatarConfig: p.avatarConfig, state: p.state, ready: p.ready, connected: p.connected, checkpoint: p.checkpoint, ack: p.ack}))};
  }
  broadcast(room) {
    if (!room) return;
    const state = this.snapshot(room);
    for (const id of [...room.players.map(p => p.id), ...room.spectators]) {
      const c = this.clients.get(id); this.send(c, {type: 'snapshot', room: state, role: c?.role});
    }
  }
  live() { return [...this.rooms.values()].filter(r => r.public && ['countdown', 'racing'].includes(r.phase))
    .map(r => ({id: r.id, course: race.course.name, phase: r.phase, spectators: r.spectators.size, players: r.players.map(p => p.name)})); }
  advance() {
    this.tick++; const now = this.clock();
    for (const room of this.rooms.values()) {
      if (room.phase === 'countdown' && this.tick >= room.startTick) room.phase = 'racing';
      const finishers = [];
      for (const p of [...room.players]) {
        if (!p.connected && now - p.disconnectedAt >= RECONNECT_MS) {
          const c = this.clients.get(p.id); if (c) this.leave(c);
          continue;
        }
        const input = p.inputs.shift();
        if (input) { p.ack = input.seq; p.lastInput = input; }
        const intent = p.connected && now - p.inputAt <= 250 ? p.lastInput : ZERO;
        if (room.phase === 'racing' || room.phase === 'waiting') {
          const before = p.state; p.state = race.step(before, intent);
          if (room.phase === 'racing') {
            p.checkpoint = race.advanceGate(before, p.state, p.checkpoint);
            if (p.checkpoint === race.course.gates.length) { p.finishTick = this.tick; finishers.push(p.id); }
          }
        }
      }
      if (room.phase === 'racing') {
        if (finishers.length) this.complete(room, finishers.length === 2 ? 'draw' : 'finish', finishers.length === 2 ? 'Same server tick' : 'All checkpoints completed', finishers[0]);
        else if (this.tick - room.startTick >= race.course.timeoutTicks) this.complete(room, 'abandoned', 'Race time limit reached');
      }
      if (room.phase === 'finished' && !room.saved && this.tick % race.HZ === 0) this.persist(room);
      if (now - room.updatedAt > (room.phase === 'finished' ? 5 : 15) * 60000 && room.phase !== 'racing') {
        for (const p of [...room.players]) { const c = this.clients.get(p.id); if (c) this.leave(c); }
      }
      if (this.tick % 3 === 0) this.broadcast(room);
    }
    for (const [id, c] of this.clients) if (!c.ws && !c.roomId && now - c.disconnectedAt >= RECONNECT_MS) this.clients.delete(id);
  }
  pump() {
    const now = this.clock(); let count = 0;
    while (now - this.lastStep >= 1000 / race.HZ && count++ < 5) { this.lastStep += 1000 / race.HZ; this.advance(); }
    if (now - this.lastStep > 500) this.lastStep = now; // Bounded catch-up after a process stall.
  }
  async close() {
    for (const room of this.rooms.values()) if (room.phase === 'racing' || room.phase === 'countdown') this.complete(room, 'abandoned', 'Server restarting');
    for (const c of this.clients.values()) c.ws?.close(1012, 'Server restarting');
    await Promise.allSettled([...this.persistence]);
  }
}

export function installMultiplayer(app, {authenticate, sessionHash, origin, store}) {
  const hub = new RaceHub({store, log: message => app.log.error(message)});
  const wss = new WebSocketServer({noServer: true, maxPayload: 2048, perMessageDeflate: false});
  const attempts = new Map(); let closing = false;
  app.server.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => {});
    const reject = code => { if (!socket.destroyed) socket.end(`HTTP/1.1 ${code}\r\nConnection: close\r\n\r\n`); };
    if (closing || req.url !== '/api/multiplayer/socket' || req.headers.origin !== origin) return reject('403 Forbidden');
    const now = Date.now(), forwarded = req.headers['x-real-ip'];
    const ip = ['127.0.0.1','::1'].includes(req.socket.remoteAddress) && typeof forwarded === 'string' && isIP(forwarded)
      ? forwarded : req.socket.remoteAddress;
    for (const [key, value] of attempts) if (now - value.at > 60000) attempts.delete(key);
    let attempt = attempts.get(ip);
    if (!attempt) { if (attempts.size >= 1024) return reject('503 Service Unavailable'); attempts.set(ip, attempt = {at: now, count: 0}); }
    if (++attempt.count > 20 || wss.clients.size >= MAX_CONNECTIONS) return reject('429 Too Many Requests');
    socket.setTimeout(5000, () => socket.destroy());
    try {
      const identity = await authenticate(req);
      if (!identity) return reject('401 Unauthorized');
      if (socket.destroyed || closing) return;
      socket.setTimeout(0);
      wss.handleUpgrade(req, socket, head, ws => {
        ws.alive = true; ws.validating = false;
        const c = hub.connect(identity, ws, sessionHash(req));
        ws.on('error', () => {});
        ws.on('pong', () => { ws.alive = true; });
        ws.on('message', (data, binary) => {
          if (c.ws !== ws) return;
          if (binary) return ws.close(1003, 'Text messages required');
          try { hub.handle(c, JSON.parse(data.toString())); } catch { ws.close(1007, 'Invalid message'); }
        });
        ws.on('close', () => hub.disconnect(c, ws));
        ws.request = req;
      });
    } catch { reject('503 Service Unavailable'); }
  });
  const timer = setInterval(() => hub.pump(), 1000 / race.HZ);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false; ws.ping();
      if (!ws.validating) {
        ws.validating = true;
        authenticate(ws.request).then(u => { if (!u) { hub.revokeSession(sessionHash(ws.request)); ws.close(4003, 'Session expired'); } })
          .catch(() => ws.close(1013, 'Account service unavailable')).finally(() => { ws.validating = false; });
      }
    }
  }, 5000);
  timer.unref(); heartbeat.unref();
  app.addHook('preClose', async () => { closing = true; clearInterval(timer); clearInterval(heartbeat); await hub.close(); for (const ws of wss.clients) ws.terminate(); wss.close(); });
  app.get('/api/multiplayer', async () => ({ok: true, version: race.VERSION, course: race.course, online: [...hub.clients.values()].filter(c => c.ws?.readyState === WebSocket.OPEN).length,
    queued: hub.queue.length, live: hub.live(), capacity: {rooms: MAX_ROOMS, spectatorsPerRoom: MAX_SPECTATORS}}));
  app.get('/api/races/leaderboard', async () => ({ok: true, formula: 'Win 3 points · draw 1 · loss 0 · abandoned 0', players: await store.leaderboard()}));
  app.get('/api/races/mine', async (req, reply) => {
    const u = await authenticate(req);
    if (!u) return reply.code(401).send({ok: false, error: 'Sign in to see your results.'});
    return {ok: true, results: await store.history(u.id)};
  });
  return hub;
}
