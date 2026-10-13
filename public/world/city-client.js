/* Shared exploration reuses existing sessions and the authoritative city geometry. */
(() => {
 'use strict';const B=window.BABYLON,C=window.WasaCity,$=id=>document.getElementById(id);
 async function create(world,readInput){
  const response=await fetch('/world/data/city-physics-v1.json?v=1',{cache:'no-cache'});if(!response.ok)throw Error('City connection data could not load.');
  const simulation=C.create(await response.json());
  let ws=null,joined=false,handshaken=false,closed=false,retry=0,reconnect=null,seq=0,pending=[],state={x:world.playerPos.x,y:world.playerPos.y,z:world.playerPos.z,vx:0,vz:0,heading:world.heading,turnVelocity:0,groundHeight:world.groundHeight,surface:world.groundSurface},selfId=null;
  const actors=new Map();let latest=[];
  const setStatus=(text)=>{$('city-status').textContent=text;};
  const send=m=>{if(handshaken&&ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({v:1,...m}));};
  const floor=(x,z,y)=>{const p=simulation.sample(x,z,y);return p?{...p,normal:new B.Vector3(p.normal.x,p.normal.y,p.normal.z)}:null;};
  function disposeActor(actor){actor.rig.dispose();actor.label.material.dispose(true,true);actor.label.dispose();}
  function clearActors(){for(const actor of actors.values())disposeActor(actor);actors.clear();}
  function label(name){const tex=new B.DynamicTexture('explorer name',{width:512,height:96},world.scene,false),ctx=tex.getContext();ctx.clearRect(0,0,512,96);ctx.fillStyle='#082b30e8';ctx.fillRect(0,0,512,96);ctx.fillStyle='#eaf1df';ctx.textAlign='center';ctx.font='600 30px Arial';ctx.fillText(name.slice(0,30),256,60);tex.hasAlpha=true;tex.update();const material=new B.StandardMaterial('explorer label',world.scene);material.diffuseTexture=tex;material.emissiveColor=B.Color3.White();material.disableLighting=true;material.backFaceCulling=false;const mesh=B.MeshBuilder.CreatePlane('explorer nameplate',{width:2.2,height:.42},world.scene);mesh.material=material;mesh.billboardMode=B.Mesh.BILLBOARDMODE_ALL;mesh.isPickable=false;return mesh;}
  function syncActors(){
   const visible=latest.slice(0,16),ids=new Set(visible.map(p=>p.id));
   for(const [id,actor]of actors)if(!ids.has(id)){disposeActor(actor);actors.delete(id);}
   for(const p of visible){let actor=actors.get(p.id);if(!actor){const rig=window.WasaHuman.create(world.scene,p.avatarConfig,{detail:'medium'});rig.root.scaling.setAll((p.avatarConfig.body==='feminine'?1.72:1.82)/rig.getProfile().height);rig.root.setEnabled(false);actor={rig,label:label(p.displayName),target:{...p.state},draw:{...p.state}};actors.set(p.id,actor);const captured=actor;rig.ready.then(()=>{if(actors.get(p.id)===captured&&!closed){rig.root.setEnabled(true);world.graphics?.setCandidates(world.scene.meshes.filter(m=>m.metadata?.wasaShadow||m.skeleton));}});}actor.target={...p.state};}
  }
  function connect(){
   if(closed)return;handshaken=false;joined=false;setStatus(retry?'RECONNECTING…':'CONNECTING TO CITY…');
   const socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/api/multiplayer/socket`);ws=socket;
   socket.addEventListener('message',event=>{if(ws!==socket)return;let m;try{m=JSON.parse(event.data);}catch{return;}
    if(m.v!==1)return;
    if(m.type==='welcome'){handshaken=true;selfId=m.self.id;retry=0;if(m.room||m.queued)send({type:'leave'});send({type:'explore',revision:simulation.revision});}
    if(m.type==='city_joined'){joined=true;setStatus('CITY ONLINE');}
    if(m.type==='city_snapshot'){
     if(m.revision!==simulation.revision){setStatus('CITY UPDATED · RELOAD TO JOIN');joined=false;closed=true;socket.close();return;}
     seq=Math.max(seq,m.self.ack);pending=pending.filter(p=>p.seq>m.self.ack);state={...m.self.state};
     if(m.travel){pending=[];world.movementActive=false;world.travelDirection=null;world.roadCourse=null;world.keys.clear();world.touch.x=world.touch.y=0;world.camera.target.set(state.x,state.y+1.7,state.z);world.camera.alpha=Math.PI/2-state.heading;}
     for(const input of pending)state=simulation.step(state,input);
     latest=m.players.filter(p=>p.id!==selfId);syncActors();$('city-online').textContent=m.online+' EXPLORERS';setStatus('CITY ONLINE');
    }
    if(m.type==='error')setStatus(m.message);
    if(m.type==='left'){joined=false;}
   });
   socket.addEventListener('close',event=>{if(ws!==socket)return;handshaken=false;joined=false;$('city-online').textContent='DAMATURU';state.vx=state.vz=0;pending=[];latest=[];clearActors();
    if(closed)return;if([4001,4003].includes(event.code)){closed=true;setStatus(event.code===4001?'OPEN IN ANOTHER TAB · RELOAD TO JOIN':'SESSION ENDED · SIGN IN AGAIN');return;}
    setStatus('RECONNECTING TO CITY…');reconnect=setTimeout(connect,Math.min(5000,500*2**retry++));
   });socket.addEventListener('error',()=>{});
  }
  const timer=setInterval(()=>{
   if(!joined||!handshaken||ws?.readyState!==WebSocket.OPEN)return;
   const input=world.hasFocus&&$('help-modal').hidden?readInput(C.DT):{x:0,z:0,run:false};
   const m={v:1,type:'world_input',seq:++seq,...input};send(m);pending.push(m);if(pending.length>12)pending.shift();state=simulation.step(state,input);
  },1000/C.HZ);
  const ping=setInterval(()=>send({type:'ping',nonce:performance.now()}),5000);
  connect();
  return {get joined(){return joined;},get state(){return state;},floor,
   travel(target){if(joined)send({type:'city_travel',target});},
   render(dt){for(const actor of actors.values()){const t=actor.target,s=actor.draw,ease=1-Math.exp(-Math.min(dt,.1)*12);if(Math.hypot(t.x-s.x,t.z-s.z)>3)Object.assign(s,t);else{for(const k of ['x','y','z','vx','vz'])s[k]+=(t[k]-s[k])*ease;s.heading+=Math.atan2(Math.sin(t.heading-s.heading),Math.cos(t.heading-s.heading))*ease;}actor.rig.root.position.set(s.x,s.y,s.z);actor.rig.root.rotation.y=s.heading;actor.label.position.set(s.x,s.y+2.3,s.z);const speed=Math.hypot(s.vx,s.vz);actor.rig.animate(Math.min(dt,.1),Math.min(1,speed/3.1),speed>4.05,{speed,turnRate:t.turnVelocity,sampleGround:floor});}},
   dispose(){closed=true;clearInterval(timer);clearInterval(ping);clearTimeout(reconnect);send({type:'leave'});ws?.close();clearActors();}
  };
 }
 window.WasaCityClient={create};
})();
