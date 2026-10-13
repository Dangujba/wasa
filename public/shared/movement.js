/* Shared acceleration and turn rules for exploration, prediction and server races. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WasaMovement=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function velocityStep(velocity, x, z, dt) {
    const dx = x - velocity.x, dz = z - velocity.z, distance = Math.hypot(dx, dz);
    const braking = Math.hypot(x, z) < Math.hypot(velocity.x, velocity.z) || x * velocity.x + z * velocity.z < 0;
    const step = Math.min(distance, (braking ? 11 : 8) * dt);
    if (distance > 1e-7) { velocity.x += dx * step / distance; velocity.z += dz * step / distance; }
    return velocity;
  }
  function turnStep(heading, velocity, wanted, dt) {
    const delta = Math.atan2(Math.sin(wanted - heading), Math.cos(wanted - heading));
    velocity += (clamp(delta * 8, -4.8, 4.8) - velocity) * (1 - Math.exp(-dt * 12));
    const step = velocity * dt;
    return Math.abs(step) > Math.abs(delta) ? {heading: heading + delta, velocity: 0} : {heading: heading + step, velocity};
  }
return {velocityStep,turnStep};
});
