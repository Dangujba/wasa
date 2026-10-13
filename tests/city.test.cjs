const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const city=require('../public/shared/city-simulation.js'),data=require('../public/world/data/city-physics-v1.json');
const simulation=city.create(data);
const socket=()=>({readyState:1,bufferedAmount:0,messages:[],send(m){this.messages.push(JSON.parse(m));},close(){this.readyState=3;}});
test('city movement respects the actual flyover levels, kerbs, colliders and speed limit',()=>{
 let state=simulation.spawn('cross');assert.ok(simulation.canGo(state.x,state.z,state.y));
 state={...state,x:-284,z:.45,y:simulation.sample(-284,.45,.13).height};state.groundHeight=state.y;
 for(let i=0;i<2600&&state.x<284;i++)state=simulation.step(state,{x:1,z:0,run:true});
 assert.ok(state.x>283,'Walks across both ramps and the full flyover');
 assert.ok(Math.hypot(state.vx,state.vz)<=6.700001);
 assert.ok(Math.abs(simulation.sample(0,0,.17).height-.17)<1e-5);
 assert.ok(Math.abs(simulation.sample(0,0,6.375).height-6.375)<1e-5);
 assert.equal(simulation.canGo(-36,5.15,.17),false);assert.equal(simulation.canGo(-36,5.15,6.375),true);
 assert.equal(simulation.canGo(0,7.62,6.375),false);
 for(const target of ['spawn','cross','ysu']){const p=simulation.spawn(target);assert.ok(simulation.canGo(p.x,p.z,p.y));}
 assert.equal(city.validInput({v:1,type:'world_input',seq:1,x:0,z:1,run:true,position:{x:500}}),false);
});
test('64 shared explorers have bounded snapshots, server movement, reconnects and session revocation',async()=>{
 const {RaceHub}=await import('../api/multiplayer.mjs');let now=0;const hub=new RaceHub({clock:()=>now,store:{async save(){}}});
 const clients=[];for(let i=0;i<65;i++)clients.push(hub.connect({id:randomUUID(),displayName:'Explorer '+i,avatarConfig:{body:i%2?'feminine':'masculine'}},socket(),'token'+i));
 const action=(c,type,more={})=>hub.handle(c,{v:1,type,...more});
 for(const c of clients)action(c,'explore',{revision:data.revision});
 assert.equal(hub.city.players.size,64);assert.equal(clients[64].city,undefined);
 action(clients[0],'queue');assert.equal(hub.queue.length,0,'A city member cannot also enter matchmaking');
 for(let tick=1;tick<=120;tick++){now+=1000/city.HZ;for(const c of clients.slice(0,64))action(c,'world_input',{seq:tick,x:1,z:0,run:true});hub.advance();}
 for(const c of clients.slice(0,64)){
  const state=c.ws.messages.filter(m=>m.type==='city_snapshot').at(-1);assert.ok(state);assert.equal(state.online,64);assert.ok(state.players.length<=24);assert.equal(JSON.stringify(state).includes('email'),false);assert.equal(c.ws.readyState,1,'30 city inputs/s do not consume the control-action quota');
 }
 const c=clients[0],old=c.ws,before={...hub.city.players.get(c.identity.id).state};hub.disconnect(c,old);const fresh=socket();hub.connect(c.identity,fresh,'token0');action(c,'explore',{revision:data.revision});assert.equal(hub.city.players.get(c.identity.id).state.x,before.x);
 action(c,'city_travel',{target:'ysu'});assert.ok(hub.city.players.get(c.identity.id).state.z>6000);
 hub.revokeSession('token0');assert.equal(hub.city.players.size,63);assert.equal(c.ws.readyState,3);
 action(clients[1],'leave');assert.equal(hub.city.players.size,62);
});
test('city geometry captures building collision and normal floors in the authored street block',()=>{
 const spawn=simulation.spawn();assert.ok(spawn.x>-50&&spawn.x<0&&spawn.z>350&&spawn.z<400);
 const footway=data.triangles.find(t=>String(t[9]).includes('footway'));
 assert.ok(footway);const [x,y,z,bx,by,bz,cx,cy,cz]=footway;
 const sample=simulation.sample((x+bx+cx)/3,(z+bz+cz)/3,(y+by+cy)/3);
 assert.ok(sample&&Math.abs(sample.height-(y+by+cy)/3)<1e-5);
 assert.ok(data.colliders.length>1000,'The city uses the existing map and authored-building obstacles');
 assert.ok(data.bands.reduce((n,g)=>n+g.segments.length,0)>40000,'All mapped road and pavement segments are captured');
 const group=data.bands.find(g=>g.name==='OSM mapped local roads'),band=group.segments.find(([x,z,ex,ez])=>Math.hypot((x+ex)/2,(z+ez)/2)>1500);
 const floor=simulation.sample((band[0]+band[2])/2,(band[1]+band[3])/2,group.height);
 assert.ok(floor.height>=group.height,'Mapped road height matches the rendered top surface');
});
