/* Canonical race geometry and fixed-step movement, shared by Node and browser. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('../shared/movement.js') : root.WasaMovement);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WasaRace = api;
})(typeof window === 'object' ? window : globalThis, function (movement) {
  'use strict';
  const VERSION = 1, HZ = 30, DT = 1 / HZ;
  const course = Object.freeze({
    id: 'damaturu-sprint', version: 1, name: 'Damaturu Sprint', distance: 160,
    description: 'An illustrative sprint arena inspired by Damaturu streets.',
    bounds: Object.freeze({minX: -4, maxX: 4, minZ: -165, maxZ: 8}),
    floor: .13, radius: .45,
    starts: Object.freeze([Object.freeze({x: -1.6, z: 4}), Object.freeze({x: 1.6, z: 4})]),
    gates: Object.freeze([-36, -76, -116, -156]),
    timeoutTicks: 120 * HZ, countdownTicks: 3 * HZ
  });
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const {velocityStep,turnStep} = movement;
  function spawn(lane = 0) {
    return {...course.starts[lane], y: course.floor, vx: 0, vz: 0, heading: 0, turnVelocity: 0};
  }
  function validInput(m) {
    return m && m.v === VERSION && m.type === 'input' && Number.isSafeInteger(m.seq) && m.seq > 0 && m.seq < 2147483647 &&
      typeof m.x === 'number' && Number.isFinite(m.x) && Math.abs(m.x) <= 1 &&
      typeof m.z === 'number' && Number.isFinite(m.z) && Math.abs(m.z) <= 1 && typeof m.run === 'boolean' &&
      Object.keys(m).every(k => ['v', 'type', 'seq', 'x', 'z', 'run'].includes(k));
  }
  function step(state, input, dt = DT) {
    // Only the server's clock determines how often this runs. Inputs contain no pose or time.
    const length = Math.max(1, Math.hypot(input.x, input.z)), speed = input.run ? 6.7 : 3.1;
    const velocity = velocityStep({x: state.vx, z: state.vz}, input.x / length * speed, input.z / length * speed, dt);
    const x = state.x + velocity.x * dt, z = state.z + velocity.z * dt, b = course.bounds, r = course.radius;
    const result = {...state};
    if (x >= b.minX + r && x <= b.maxX - r && z >= b.minZ + r && z <= b.maxZ - r) {
      result.x = x; result.z = z; result.vx = velocity.x; result.vz = velocity.z;
    } else { result.vx = 0; result.vz = 0; }
    result.y = course.floor;
    if (Math.hypot(result.vx, result.vz) > .06) {
      const turn = turnStep(result.heading, result.turnVelocity, Math.atan2(-result.vx, -result.vz), dt);
      result.heading = turn.heading; result.turnVelocity = turn.velocity;
    } else result.turnVelocity *= Math.exp(-dt * 12);
    return result;
  }
  function advanceGate(before, after, checkpoint) {
    const gate = course.gates[checkpoint];
    return gate !== undefined && before.z > gate && after.z <= gate && Math.abs(after.x) <= course.bounds.maxX - course.radius
      ? checkpoint + 1 : checkpoint;
  }
  return {VERSION, HZ, DT, course, spawn, validInput, step, advanceGate, velocityStep, turnStep};
});
