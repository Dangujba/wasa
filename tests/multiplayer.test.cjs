const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../public/multiplayer/simulation.js');
const {randomUUID} = require('node:crypto');
const importHub = import('../api/multiplayer.mjs');
const fs = require('node:fs'), vm = require('node:vm');
function ws() { return {readyState:1,bufferedAmount:0,messages:[],send(m){this.messages.push(JSON.parse(m));},close(){this.readyState=3;}}; }
async function setup() {
  const {RaceHub} = await importHub; let now=0;const saved=new Map();
  const hub=new RaceHub({clock:()=>now,store:{async save(r){if(!saved.has(r.id))saved.set(r.id,structuredClone(r));}}});
  const a=hub.connect({id:randomUUID(),displayName:'A',avatarConfig:{body:'masculine'}},ws(),'sessionA');
  const b=hub.connect({id:randomUUID(),displayName:'B',avatarConfig:{body:'feminine'}},ws(),'sessionB');
  const s=hub.connect({id:randomUUID(),displayName:'Viewer',avatarConfig:{}},ws(),'viewer');
  const tick=()=>{now+=1000/R.HZ;hub.advance();};
  const action=(c,type,more={})=>hub.handle(c,{v:R.VERSION,type,...more});
  return {hub,a,b,s,saved,tick,action,clock:()=>now};
}
test('shared course is continuous, bounded, and uses server-controlled movement speed',()=>{
  let state=R.spawn();const intent={x:0,z:-1,run:true};let cp=0;
  for(let i=0;i<900 && cp<4;i++){const before=state;state=R.step(state,intent);cp=R.advanceGate(before,state,cp);assert.ok(Math.hypot(state.vx,state.vz)<=6.7000001);assert.equal(state.y,R.course.floor);}
  assert.equal(cp,4);assert.ok(state.z>=R.course.bounds.minZ+R.course.radius);
  for(let i=0;i<900;i++)state=R.step(state,{x:1,z:0,run:true});
  assert.ok(state.x<=R.course.bounds.maxX-R.course.radius);
  assert.equal(R.validInput({v:1,type:'input',seq:1,x:0,z:-1,run:true,position:{z:-156}}),false);
  assert.equal(R.validInput({v:1,type:'input',seq:1,x:NaN,z:0,run:true}),false);
  const source=fs.readFileSync('public/multiplayer/multiplayer.js','utf8');
  const start=source.indexOf(' function readIntent()'),end=source.indexOf('\n setInterval',start);
  for(let degrees=0;degrees<360;degrees++) for(const chord of [['ArrowUp'],['ArrowRight'],['ArrowUp','ArrowRight'],['ArrowDown','ArrowLeft']]){
    const context={keys:new Set(chord),touch:{x:0,y:0,run:false},camera:{alpha:degrees*Math.PI/180},movementBearing:null};
    vm.runInNewContext(source.slice(start,end)+'\nthis.intent=readIntent();',context);
    assert.ok(R.validInput({v:1,type:'input',seq:1,...context.intent}),'Camera-relative input remains valid at '+degrees+' degrees');
    assert.ok(Math.hypot(context.intent.x,context.intent.z)<=1+1e-12,'Diagonal input has no speed boost');
  }
});
test('matchmaking, spectator ACL, authoritative race, single saved result and rematch',async()=>{
  const {hub,a,b,s,saved,tick,action}=await setup();
  action(a,'queue');action(a,'queue');assert.equal(hub.queue.length,1);action(b,'queue');
  const room=hub.rooms.get(a.roomId);assert.equal(a.roomId,b.roomId);assert.equal(room.players.length,2);
  action(a,'ready',{ready:true});action(b,'ready',{ready:true});assert.equal(room.phase,'countdown');
  action(s,'spectate',{id:room.id});assert.equal(s.role,'spectator');
  action(s,'input',{seq:1,x:0,z:-1,run:true});assert.equal(room.players.length,2);assert.equal(s.ws.messages.at(-1).type,'error');
  for(let i=0;i<90;i++)tick();assert.equal(room.phase,'racing');
  for(let i=1;i<900&&room.phase==='racing';i++){action(a,'input',{seq:i,x:0,z:-1,run:true});action(b,'input',{seq:i,x:0,z:-1,run:false});tick();}
  assert.equal(room.phase,'finished');assert.equal(room.result.players.find(p=>p.id===a.identity.id).placement,1);
  assert.equal(room.result.outcome,'finish');assert.ok(room.result.players[0].elapsedMs>=23000);
  await Promise.all(hub.persistence);assert.equal(saved.size,1);assert.equal(room.saved,true);
  action(a,'finish',{elapsedMs:1});assert.equal(saved.size,1);
  const snap=hub.snapshot(room);assert.equal(JSON.stringify(snap).includes('email'),false);
  action(a,'rematch');assert.equal(room.phase,'waiting');assert.equal(room.players[0].checkpoint,0);assert.equal(room.players[0].state.z,4);
});
test('duplicate input, queue flooding and fabricated finish cannot speed up or win',async()=>{
  const {hub,a,b,tick,action}=await setup();action(a,'create');const room=hub.rooms.get(a.roomId);action(b,'join',{code:room.code});
  action(a,'input',{seq:1,x:0,z:-1,run:true});for(let i=0;i<40;i++)action(a,'input',{seq:1,x:0,z:-1,run:true});
  assert.equal(room.players[0].inputs.length,1);const before=room.players[0].state.z;tick();assert.ok(before-room.players[0].state.z<.01);
  action(a,'input',{seq:2,x:0,z:-1,run:true,dt:100});assert.equal(room.players[0].inputs.length,0);
  action(a,'finish',{elapsedMs:1});assert.equal(room.result,null);
  for(let i=3;i<18;i++)action(a,'input',{seq:i,x:0,z:-1,run:true});assert.equal(room.players[0].inputs.length,6);
  action(a,'input',{seq:400,x:0,z:-1,run:true});
  const position=room.players[0].state.z;tick();
  assert.ok(position-room.players[0].state.z<.02,'Delayed batches still grant only one bounded simulation step');
  assert.equal(room.players[0].lastReceived,400,'Sequence gaps do not permanently lock out movement');
});
test('private races stay private; disconnect/reconnect preserves slot and revocation cancels safely',async()=>{
  const {hub,a,b,s,tick,action}=await setup();action(a,'create');const room=hub.rooms.get(a.roomId);action(b,'join',{code:room.code});
  action(a,'ready',{ready:true});action(b,'ready',{ready:true});action(s,'spectate',{id:room.id});assert.equal(s.roomId,null);assert.equal(hub.live().length,0);
  const old=a.ws;hub.disconnect(a,old);assert.equal(room.phase,'waiting');
  const replacement=ws();hub.connect(a.identity,replacement,'sessionA');hub.disconnect(a,old);assert.equal(a.ws,replacement);assert.equal(room.players[0].connected,true);
  action(a,'ready',{ready:true});action(b,'ready',{ready:true});for(let i=0;i<90;i++)tick();
  hub.revokeSession('sessionA');assert.equal(room.result.outcome,'abandoned');await Promise.all(hub.persistence);
});
test('disconnect timeout awards a forfeit once, with a bounded reconnect window',async()=>{
  const {hub,a,b,tick,action,saved}=await setup();action(a,'queue');action(b,'queue');const room=hub.rooms.get(a.roomId);
  action(a,'ready',{ready:true});action(b,'ready',{ready:true});for(let i=0;i<90;i++)tick();hub.disconnect(a,a.ws);
  for(let i=0;i<449;i++)tick();assert.equal(room.phase,'racing');for(let i=0;i<3;i++)tick();
  assert.equal(room.result.outcome,'forfeit');assert.equal(room.result.players.find(p=>p.id===b.identity.id).points,3);
  await Promise.all(hub.persistence);assert.equal(saved.size,1);
});
test('same-tick finishes draw and persistence failures retry without duplicate points',async()=>{
  const {hub,a,b,tick,action,saved}=await setup();let failures=1;const real=hub.store.save;hub.store.save=async r=>{if(failures-->0)throw Error('temporary');return real(r);};
  action(a,'queue');action(b,'queue');const room=hub.rooms.get(a.roomId);action(a,'ready',{ready:true});action(b,'ready',{ready:true});for(let i=0;i<90;i++)tick();
  for(let i=1;i<900&&room.phase==='racing';i++){action(a,'input',{seq:i,x:0,z:-1,run:true});action(b,'input',{seq:i,x:0,z:-1,run:true});tick();}
  assert.equal(room.result.outcome,'draw');assert.ok(room.result.players.every(p=>p.points===1));await Promise.all(hub.persistence);assert.equal(room.saved,false);
  for(let i=0;i<30;i++)tick();await Promise.all(hub.persistence);assert.equal(room.saved,true);assert.equal(saved.size,1);
});
