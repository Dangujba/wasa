const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const B=require('../public/vendor/babylon.min.js');
const runtime={window:{BABYLON:B}};
vm.runInNewContext(fs.readFileSync('public/shared/movement.js','utf8'),runtime);
vm.runInNewContext(fs.readFileSync('public/world/wasa-locomotion.js','utf8'),runtime);
const motion=runtime.window.WasaLocomotion;

test('surface sampling follows slopes and curbs without switching between stacked decks',()=>{
 const engine=new B.NullEngine(),scene=new B.Scene(engine),index=motion.createSurfaceIndex();
 try{
   const street=B.MeshBuilder.CreateBox('street',{width:25,height:.10,depth:8},scene);street.position.y=.07;index.addMesh(street);
   const curb=B.MeshBuilder.CreateBox('curb',{width:12,height:.16,depth:2},scene);curb.position.set(0,.20,3);index.addMesh(curb);
   const deck=B.MeshBuilder.CreateBox('bridge',{width:20,height:.35,depth:6},scene);deck.position.y=6.2;index.addMesh(deck);
   assert.ok(Math.abs(index.sample(0,0,.12).height-.12)<1e-5,'Underpass remains at street level');
   assert.ok(Math.abs(index.sample(0,0,6.375).height-6.375)<1e-5,'Deck remains above the underpass');
   assert.ok(Math.abs(index.sample(0,3,.12).height-.28)<1e-5,'A low curb is reachable');
   assert.equal(index.sample(0,4,6.375),null,'No six-metre drop from the deck');
   const ramp=B.MeshBuilder.CreateBox('slope',{width:20,height:.10,depth:5},scene);ramp.position.set(30,1,0);ramp.rotation.z=.08;index.addMesh(ramp);
   const a=index.sample(28,0,1),b=index.sample(32,0,1);
   assert.ok(b.height>a.height);assert.ok(a.normal.y>.99&&Math.abs(a.normal.x)>.07);
   street.dispose();curb.dispose();deck.dispose();ramp.dispose();
   assert.ok(Math.abs(index.sample(0,0,6.375).height-6.375)<1e-5,'Index survives mesh disposal during batching');
 }finally{engine.dispose();}
});

test('velocity and heading changes are bounded across frame rates, releases and reversals',()=>{
 for(const dt of [1/120,1/60,.065]){
   const velocity=B.Vector3.Zero();let heading=Math.PI-.02,turnVelocity=0;
   for(let i=0;i<Math.ceil(2/dt);i++){
     const old=velocity.clone();motion.velocityStep(velocity,3.1,0,dt);
     assert.ok(B.Vector3.Distance(old,velocity)<=8*dt+1e-7);
     const next=motion.turnStep(heading,turnVelocity,-Math.PI+.02,dt);
     assert.ok(Math.abs(next.heading-heading)<=4.8*dt+1e-7);heading=next.heading;turnVelocity=next.velocity;
   }
   assert.ok(Math.abs(velocity.x-3.1)<1e-6);
   assert.ok(Math.abs(Math.atan2(Math.sin(heading-(-Math.PI+.02)),Math.cos(heading-(-Math.PI+.02))))<.001,'Turn uses the short route around pi');
   for(let i=0;i<Math.ceil(1/dt);i++)motion.velocityStep(velocity,0,0,dt);
   assert.ok(velocity.length()<1e-7,'Release settles to rest');
   velocity.x=3.1;motion.velocityStep(velocity,-3.1,0,dt);assert.ok(velocity.x>0,'Reversal brakes before changing direction');
 }
});

test('the actual flyover ramps connect to the deck and piers only block the lower level',()=>{
 const engine=new B.NullEngine(),scene=new B.Scene(engine),world={scene,colliders:[],interactions:[],mats:{},playerPos:new B.Vector3(0,.17,0),map:{limitsMeters:{minX:-1000,maxX:1000,minZ:-1000,maxZ:1000}}};
 const context=vm.createContext({B,world,window:{WasaRendering:{boxUV(){}}},
   colors:{},mat:()=>new B.PBRMaterial('test',scene),makeSignTexture:()=>new B.StandardMaterial('sign',scene),
   roadAt:()=>null,dist:Math.hypot});
 const source=fs.readFileSync('public/world/world.js','utf8');
 for(const name of ['meshBox','meshCylinder','sphere','bridgeY','createFlyover','playerCanGo']){
   const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);
   vm.runInContext(source.slice(start,end),context);
 }
 try{
   context.createFlyover();const index=motion.createSurfaceIndex();
   for(const mesh of scene.meshes)if(mesh.metadata?.wasaWalkable)index.addMesh(mesh);
   let height=.13;
   for(let x=-284;x<=284;x+=.25){
     const floor=index.sample(x,.45,height);assert.ok(floor,'Connected walking surface at '+x);
     assert.ok(Math.abs(floor.height-height)<.05);height=floor.height;
     assert.equal(context.playerCanGo(x,.45,height),true,'Route clear at '+x);
   }
   assert.ok(Math.abs(index.sample(0,0,.17).height-.17)<1e-5);
   assert.equal(context.playerCanGo(-36,5.15,.17),false,'Pier blocks the underpass');
   assert.equal(context.playerCanGo(-36,5.15,6.375),true,'Pier does not block the upper deck');
   assert.equal(context.playerCanGo(0,7.62,6.375),false,'Barrier keeps the player on the deck');
 }finally{engine.dispose();}
});
