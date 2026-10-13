/* Authenticated race client. The server owns movement, checkpoints and results. */
(() => {
 'use strict';
 const $ = id => document.getElementById(id), R = window.WasaRace, B = window.BABYLON;
 const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let self = null, socket = null, room = null, role = null, queued = false, reconnect = null, retry = 0, stopped = false, handshaken = false;
 let seq = 0, pending = [], predicted = null, serverTick = 0, snapshotAt = 0, rtt = 0, lastSound = '', selectedTab = 'live';
 let engine = null, scene = null, camera = null, sun = null, quality = null, viewReady = false, scenePromise = null, enteringArena = false;
 const actors = new Map(), keys = new Set(), touch = {x:0,y:0,run:false};
 let movementBearing = null, latestIntent = {x:0,z:0,run:false}, audio = null;
 const connected = () => handshaken && socket?.readyState === WebSocket.OPEN;
 function notice(text) { $('notice').textContent = text; $('arena-notice').textContent = text; }
 function connection(text, live = false) { $('connection').textContent = text; $('connection').classList.toggle('connected',live); }
 async function api(path) {
   const response = await fetch(path,{credentials:'same-origin',cache:'no-store'}), data = await response.json();
   if (!response.ok || !data.ok) throw Error(data.error || 'WASA is unavailable. Try again.');
   return data;
 }
 function send(message) { if (connected()) socket.send(JSON.stringify({v:R.VERSION,...message})); }
 function sound(kind) {
   if (!audio || audio.state !== 'running') return;
   const oscillator = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
   oscillator.frequency.value = kind === 'go' ? 880 : kind === 'finish' ? 1046 : 440;
   gain.gain.setValueAtTime(.04,now); gain.gain.exponentialRampToValueAtTime(.0001,now+.16);
   oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(); oscillator.stop(now+.17);
 }
 document.addEventListener('pointerdown', () => {
   try { if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch {}
 });
 function clearInput() { keys.clear(); touch.x = touch.y = 0; touch.run = false; movementBearing = null; $('race-thumb').style.transform = ''; latestIntent = {x:0,z:0,run:false}; }
 function updateActions() {
   const enabled = !!self && connected() && !queued;
   for (const id of ['find-match','create-room','join-room']) $(id).disabled = !enabled;
   $('queue-card').hidden = !queued; $('match-actions').hidden = queued || !self;
 }
 function connect() {
   if (!self || stopped) return;
   handshaken=false; connection(retry ? 'RECONNECTING' : 'CONNECTING');
   const ws = new WebSocket(`${location.protocol === 'https:'?'wss:':'ws:'}//${location.host}/api/multiplayer/socket`);
   socket = ws;
   ws.addEventListener('open', () => { retry = 0; });
   ws.addEventListener('message', event => {
     if(socket!==ws)return;
     let m; try { m = JSON.parse(event.data); } catch { return; }
     if (m.v !== R.VERSION) { stopped = true; notice('The game was updated. Refresh this page.'); ws.close(); return; }
     if (m.type === 'welcome') {
       handshaken=true; connection('ONLINE',true); notice(''); self = m.self; queued = m.queued; seq = m.room?.players.find(p => p.id === self.id)?.ack || 0;
       if(m.city)send({type:'leave'});
       pending = []; predicted = null; if (m.room) applySnapshot(m.room, m.room.players.some(p => p.id === self.id)?'player':'spectator');
       else showLobby(); updateActions();
     } else if (m.type === 'snapshot') applySnapshot(m.room,m.role);
     else if (m.type === 'presence') { queued = !!m.queued; updateActions(); }
     else if (m.type === 'left') { room = null; role = null; pending = []; predicted = null; clearInput(); showLobby(); }
     else if (m.type === 'error') notice(m.message);
     else if (m.type === 'pong') { rtt = Math.max(0,Math.round(performance.now()-m.nonce)); connection(`ONLINE · ${rtt}ms`,true); }
   });
   ws.addEventListener('close', async event => {
     if (socket !== ws) return;
     handshaken=false; clearInput(); queued = false; updateActions(); connection('OFFLINE'); renderHUD();
     if (stopped) return;
     if ([4001,4003].includes(event.code)) { stopped = true; notice(event.code===4001?'WASA opened in another tab. Reload here to play.':'Your session ended. Sign in again.'); $('race-phase').textContent='DISCONNECTED'; return; }
     notice('Connection lost. Reconnecting… Your race slot is held for 15 seconds.');
     // An unsuccessful upgrade has no close reason; check the existing account endpoint.
     try { const account = await api('/api/me'); if (!account.authenticated) { stopped=true; self=null; showLobby(); $('signin').hidden=false; notice('Sign in again to reconnect.'); return; } } catch {}
     clearTimeout(reconnect); reconnect = setTimeout(connect,Math.min(5000,500*2**retry++));
   });
   ws.addEventListener('error', () => {});
 }
 function showLobby() {
   room=null;role=null;pending=[];predicted=null;clearInput();
   $('lobby').hidden=false; $('arena').hidden=true; queued=false; updateActions(); refreshListing();
   if (engine) engine.stopRenderLoop();
   for (const actor of actors.values()) { actor.rig.dispose(); actor.label.material.dispose(true,true); actor.label.dispose(); }
   actors.clear(); viewReady=false;
 }
 function material(name, color, kind) {
   const m = new B.PBRMaterial(name,scene); m.albedoColor=B.Color3.FromHexString(color); m.metallic=0; m.roughness=.93;
   if (kind) window.WasaRendering.applySurface(m,kind); return m;
 }
 function box(name,x,y,z,w,h,d,m) {
   const mesh = B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);
   mesh.position.set(x,y,z);mesh.material=m;mesh.receiveShadows=true;mesh.metadata={wasaShadow:/shop|gate|kerb/.test(name)};if(m.albedoTexture)window.WasaRendering.boxUV(mesh);return mesh;
 }
 function sign(name,text,x,z,width=8) {
   const texture = new B.DynamicTexture(name,{width:512,height:128},scene,false), context=texture.getContext();
   context.fillStyle='#143b31';context.fillRect(0,0,512,128);context.font='bold 42px Arial';context.textAlign='center';context.fillStyle='#e7d4a2';context.fillText(text,256,80);texture.update();
   const m=new B.StandardMaterial(name,scene);m.diffuseTexture=texture;m.emissiveColor=new B.Color3(.4,.4,.3);m.backFaceCulling=false;
   const mesh=B.MeshBuilder.CreatePlane(name,{width,height:1.2,sideOrientation:B.Mesh.DOUBLESIDE},scene);mesh.material=m;mesh.position.set(x,4.8,z);mesh.rotation.y=Math.PI;return mesh;
 }
 async function prepareScene() {
   if (scene) return;
   if (!B?.Engine.isSupported()) throw Error('3D graphics are unavailable on this device.');
   engine=new B.Engine($('race-canvas'),true,{stencil:false,powerPreference:'high-performance'});scene=new B.Scene(engine);
   scene.clearColor=new B.Color4(.7,.72,.65,1);scene.fogMode=B.Scene.FOGMODE_EXP2;scene.fogDensity=.003;scene.fogColor=new B.Color3(.7,.72,.65);
   camera=new B.ArcRotateCamera('race camera',Math.PI/2,1.15,8,new B.Vector3(0,1.8,4),scene);camera.lowerRadiusLimit=5;camera.upperRadiusLimit=20;camera.lowerBetaLimit=.45;camera.upperBetaLimit=1.35;camera.wheelPrecision=50;camera.panningSensibility=0;
   camera.attachControl($('race-canvas'),true);camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');camera.minZ=.1;camera.maxZ=600;
   new B.HemisphericLight('sky',new B.Vector3(0,1,0),scene).intensity=.55;
   sun=new B.DirectionalLight('sun',new B.Vector3(-.6,-1,.4),scene);sun.position.set(40,80,-70);sun.intensity=2;
   window.WasaRendering.environment(scene);window.WasaRendering.sky(scene);
   const soil=material('sandy ground','#AA9370','soil'), asphalt=material('race asphalt','#4B514B','asphalt'), curb=material('race kerb','#BAAA8C','plaster'), mint=material('gate green','#89BD96'), gold=material('gate gold','#C8A762'), stripe=material('road paint','#DECBA3');
   box('ground',0,-.2,-76,280,.4,440,soil);
   const c=R.course,b=c.bounds,length=b.maxZ-b.minZ,center=(b.maxZ+b.minZ)/2;
   box('canonical course',0,c.floor-.1,center,8,.2,length,asphalt);
   for (const x of [-4.2,4.2]) { box('kerb',x,.15,center,.4,.3,length,curb);box('footway',x*1.4,.02,center,2.4,.2,length,curb); }
   for (let z=-162;z<8;z+=6) box('lane stripe',0,c.floor+.012,z,.09,.018,2.8,stripe);
   box('start line',0,c.floor+.018,4,8,.025,.3,stripe);
   R.course.gates.forEach((z,i)=>{
     const m=i===3?gold:mint;
     for(const x of [-4.7,4.7]) box('gate post',x,2,z,.2,4,.2,m);
     box('gate beam',0,4,z,9.6,.22,.22,m);box('checkpoint line',0,c.floor+.02,z,8,.025,.24,m);
     sign('gate '+i,i===3?'FINISH':`CHECKPOINT ${i+1}`,0,z,8);
   });
   sign('start sign','WASA · DAMATURU SPRINT',14,3,9);
   const facades=['#CAB28C','#A7B89D','#B39480','#C7BC99'];
   for(let i=0;i<14;i++)for(const side of [-1,1]){
     const z=-i*13+2,h=3.7+(i%3)*.7,x=side*(12+i%2),paint=material('shop '+i+' '+side,facades[(i+(side+1)/2)%4],'plaster');
     box('illustrative shop',x,h/2,z,7,h,9,paint);box('shop canopy',x-side*3.8,2.7,z,2.1,.15,9,gold);
     box('shop door',x-side*3.55,1.1,z, .04,2.2,1.3,asphalt);
   }
   quality=window.WasaRendering.createQuality(scene,camera,sun,localStorage.getItem('wasa-quality')||'auto',{mobile:matchMedia('(pointer:coarse)').matches});
   quality.setCandidates(scene.meshes.filter(m=>m.metadata?.wasaShadow));window.addEventListener('resize',()=>engine.resize(),{passive:true});
   $('race-canvas').addEventListener('webglcontextlost',()=>{clearInput();$('scene-loading').textContent='Graphics interrupted. Refresh to recover.';$('scene-loading').hidden=false;});
 }
 function nameLabel(p) {
   const texture=new B.DynamicTexture('player name',{width:512,height:96},scene,false),ctx=texture.getContext();
   ctx.clearRect(0,0,512,96);ctx.fillStyle='#153d32dd';ctx.fillRect(0,0,512,96);ctx.font='bold 32px Arial';ctx.fillStyle='#ecf4df';ctx.textAlign='center';ctx.fillText(p.displayName.slice(0,30),256,61);texture.update();texture.hasAlpha=true;
   const material=new B.StandardMaterial('name',scene);material.diffuseTexture=texture;material.emissiveColor=B.Color3.White();material.disableLighting=true;material.backFaceCulling=false;
   const label=B.MeshBuilder.CreatePlane('name',{width:2.5,height:.47},scene);label.material=material;label.billboardMode=B.Mesh.BILLBOARDMODE_ALL;label.metadata={nameplate:true};
   return label;
 }
 async function enterArena() {
   $('lobby').hidden=true;$('arena').hidden=false;
   if (enteringArena) return; enteringArena=true;
   if (!viewReady) $('scene-loading').hidden=false;
   if (!scenePromise) scenePromise=prepareScene();
   try {
     await scenePromise;
     if (!room) return;
     for(const p of room.players) if(!actors.has(p.id)){
       const rig=window.WasaHuman.create(scene,p.avatarConfig),profile=rig.getProfile();
       rig.root.scaling.setAll((p.avatarConfig.body==='feminine'?1.72:1.82)/profile.height);
       const label=nameLabel(p),actor={rig,label,target:{...p.state},draw:{...p.state}};actors.set(p.id,actor);
       rig.root.setEnabled(false);await rig.ready;if(!room||actors.get(p.id)!==actor)return;rig.root.setEnabled(true);
     }
     quality.setCandidates(scene.meshes.filter(m=>m.metadata?.wasaShadow||m.skeleton));quality.status.ready=true;
     if (!viewReady) { viewReady=true;engine.resize();camera.alpha=Math.PI/2;camera.beta=1.15;camera.radius=8;engine.runRenderLoop(render);$('race-canvas').focus({preventScroll:true}); }
     $('scene-loading').hidden=true;
   } catch(e){$('scene-loading').textContent=e.message;$('scene-loading').hidden=false;notice(e.message);} finally { enteringArena=false; }
 }
 function applySnapshot(next, nextRole) {
   if (next.courseVersion!==R.course.version || next.courseId!==R.course.id) {stopped=true;notice('This course was updated. Refresh WASA.');socket?.close();return;}
   const entering=!room || room.id!==next.id, oldPhase=room?.phase;
   room=next;role=nextRole;serverTick=next.tick;snapshotAt=performance.now();queued=false;
   const own=room.players.find(p=>p.id===self.id);
   if (own) {
     pending=pending.filter(input=>input.seq>own.ack);seq=Math.max(seq,own.ack);
     predicted={...own.state};
     if (room.phase==='waiting'||room.phase==='racing') for(const input of pending) predicted=R.step(predicted,input);
     else pending=[];
   }
   if (entering || (oldPhase!==next.phase && next.phase!=='racing')) clearInput();
   for(const p of room.players){const actor=actors.get(p.id);if(actor){actor.target={...p.state};if(entering||oldPhase!==next.phase)actor.draw={...p.state};}}
   for(const [id,actor] of actors) if(!room.players.some(p=>p.id===id)){actor.rig.dispose();actor.label.material.dispose(true,true);actor.label.dispose();actors.delete(id);}
   renderHUD();enterArena();updateActions();
 }
 function renderHUD() {
   if (!room) return;
   const own=room.players.find(p=>p.id===self.id), spectating=role==='spectator';
   $('race-phase').textContent={waiting:room.players.length===2?'BOTH PLAYERS: SELECT READY':'WAITING FOR OPPONENT',countdown:'GET READY',racing:spectating?'LIVE RACE':'RACE IN PROGRESS',finished:'RACE COMPLETE'}[room.phase];
   $('invite-code').textContent=room.code?`PRIVATE ROOM · ${room.code}`:spectating?'READ-ONLY SPECTATOR':'PUBLIC MATCH · SPECTATORS WELCOME';
   $('race-score').innerHTML=room.players.map(p=>`<div class="player-score"><strong>${esc(p.displayName)}${p.id===self.id?' · YOU':''}</strong><small>${!p.connected?'RECONNECTING · 15s':room.phase==='waiting'?(p.ready?'READY':'NOT READY'):`${p.checkpoint} / 4 CHECKPOINTS`}</small><div class="progress-track"><span style="width:${Math.round(p.checkpoint/4*100)}%"></span></div></div>`).join('');
   $('player-controls').hidden=spectating;$('spectator-controls').hidden=!spectating;$('touch-controls').hidden=spectating;
   $('ready').hidden=room.phase!=='waiting';$('ready').textContent=own?.ready?'CANCEL READY':'READY TO RACE';$('ready').disabled=!connected()||room.players.length!==2;
   $('respawn').hidden=room.phase!=='waiting';$('result-card').hidden=room.phase!=='finished';
   if(room.result){
     const winner=room.result.players.filter(p=>p.placement===1),mine=room.result.players.find(p=>p.id===self.id);
     $('result-title').textContent=room.result.outcome==='abandoned'?'Race abandoned':room.result.outcome==='draw'?'A draw!':mine?.placement===1?'You won!':`${winner[0]?.displayName||'Opponent'} won`;
     $('result-detail').textContent=room.result.players.map(p=>`${p.displayName}: ${p.elapsedMs==null?(room.result.outcome==='forfeit'?'forfeit':'unfinished'):(p.elapsedMs/1000).toFixed(2)+'s'} · ${p.points} pts`).join(' / ');
     $('result-save').textContent=room.saved?'Result saved · view My Results in the lobby':'Saving official result…';
     $('rematch').hidden=spectating;$('rematch').disabled=!room.saved||room.players.length!==2||!room.players.every(p=>p.connected);
     if(lastSound!==room.result.id){lastSound=room.result.id;sound('finish');}
   }
 }
 function readIntent() {
   const forward=Number(keys.has('ArrowUp')||keys.has('KeyW'))-Number(keys.has('ArrowDown')||keys.has('KeyS'))-touch.y;
   const right=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'))+touch.x;
   if(Math.hypot(forward,right)>.05){if(movementBearing==null)movementBearing=camera?.alpha??Math.PI/2;}else movementBearing=null;
   const alpha=movementBearing??Math.PI/2,fx=-Math.cos(alpha),fz=-Math.sin(alpha),length=Math.max(1,Math.hypot(forward,right));
   return {x:Math.max(-1,Math.min(1,(fx*forward+fz*right)/length)),
     z:Math.max(-1,Math.min(1,(fz*forward-fx*right)/length)),run:keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.run};
 }
 setInterval(()=>{
   if(!connected()||!room||role!=='player')return;
   latestIntent=document.hidden||!viewReady?{x:0,z:0,run:false}:readIntent();
   const m={type:'input',seq:++seq,...latestIntent};send(m);
   if(pending.length<12)pending.push({...m,v:R.VERSION});else pending.shift();
   if(predicted&&(room.phase==='waiting'||room.phase==='racing'))predicted=R.step(predicted,latestIntent);
 },1000/R.HZ);
 function render() {
   if(!room||!viewReady)return;
   const dt=Math.min(engine.getDeltaTime()/1000,.1);
   for(const p of room.players){
     const actor=actors.get(p.id);if(!actor)continue;
     const target=p.id===self.id&&role==='player'&&predicted?predicted:actor.target;
     const ease=1-Math.exp(-dt*(p.id===self.id?22:12));
     if(Math.hypot(target.x-actor.draw.x,target.z-actor.draw.z)>2)actor.draw={...target};
     else {for(const k of ['x','y','z','vx','vz'])actor.draw[k]+=(target[k]-actor.draw[k])*ease;actor.draw.heading+=Math.atan2(Math.sin(target.heading-actor.draw.heading),Math.cos(target.heading-actor.draw.heading))*ease;}
     const s=actor.draw,speed=Math.hypot(s.vx,s.vz);actor.rig.root.position.set(s.x,s.y,s.z);actor.rig.root.rotation.y=s.heading;
     actor.rig.animate(dt,Math.min(1,speed/3.1),speed>4.05,{speed,turnRate:target.turnVelocity,sampleGround:()=>({height:R.course.floor,normal:B.Vector3.Up()})});actor.label.position.set(s.x,s.y+2.35,s.z);
   }
   const follow=$('camera-follow').value, targetId=role==='player'?self.id:room.players.find(p=>String(p.lane)===follow)?.id;
   const target=actors.get(targetId)?.draw;
   if(role==='spectator'&&(follow==='overview'||follow==='finish')){
     camera.alpha=Math.PI/2;camera.beta=follow==='overview'?.45:1.05;camera.radius=follow==='overview'?135:17;camera.upperRadiusLimit=150;
     camera.target.copyFrom(new B.Vector3(0,1,follow==='overview'?-76:-151));
   }else if(target){camera.upperRadiusLimit=20;camera.target.copyFrom(B.Vector3.Lerp(camera.target,new B.Vector3(target.x,target.y+1.5,target.z),1-Math.exp(-dt*8)));}
   const estimatedTick=serverTick+Math.min(R.HZ*.5,(performance.now()-snapshotAt)/1000*R.HZ);
   const count=room.phase==='countdown'?Math.max(1,Math.ceil((room.startTick-estimatedTick)/R.HZ)):null;
   $('countdown').hidden=count==null;
   if(count!=null){$('countdown').textContent=count;const key=room.id+'-'+room.startTick+'-'+count;if(lastSound!==key){lastSound=key;sound('count');}}
   else if(room.phase==='racing'&&lastSound!==room.id+'-go-'+room.startTick){lastSound=room.id+'-go-'+room.startTick;sound('go');}
   $('race-clock').textContent=room.phase==='racing'?Math.max(0,(estimatedTick-room.startTick)/R.HZ).toFixed(2)+'s':room.phase==='finished'?(Math.min(...room.result.players.map(p=>p.elapsedMs??Infinity))/1000||0).toFixed(2).replace('Infinity','—')+'s':'0.00s';
   const anchor=target?new B.Vector3(target.x,target.y,target.z):camera.target;quality.sample(dt,anchor);quality.updateShadows(anchor);scene.render();
 }
 async function refreshListing() {
   try {
     const data=await api('/api/multiplayer');$('online-count').textContent=`${data.online} ONLINE`;
     if(selectedTab==='live')$('listing').innerHTML=data.live.length?data.live.map(m=>`<div class="listing-row"><div><strong>${esc(m.players.join(' vs '))}</strong><small>${esc(m.course)} · ${esc(m.phase)} · ${m.spectators} watching</small></div><button class="secondary" data-watch="${esc(m.id)}" ${!self||!connected()?'disabled':''}>WATCH →</button></div>`).join(''):'<p class="empty">No public race is running. Find an opponent to start one.</p>';
     else if(selectedTab==='leaderboard'){
       const board=await api('/api/races/leaderboard');$('listing').innerHTML=board.players.length?board.players.map(p=>`<div class="listing-row"><span class="rank">${p.rank}</span><div><strong>${esc(p.displayName)}</strong><small>${p.wins} wins · ${p.races} races${p.bestMs==null?'':` · best ${(p.bestMs/1000).toFixed(2)}s`}</small></div><span class="points">${p.points} pts</span></div>`).join(''):'<p class="empty">Finish the first race to appear here. Win: 3 pts · draw: 1 · loss: 0.</p>';
     }else if(!self)$('listing').innerHTML='<p class="empty">Sign in to see your race history.</p>';
     else {const history=await api('/api/races/mine');$('listing').innerHTML=history.results.length?history.results.map(m=>`<div class="listing-row"><div><strong>${esc(m.players.map(p=>p.displayName).join(' vs '))}</strong><small>${esc(m.outcome)} · ${new Date(m.completedAt).toLocaleDateString()} · ${esc(m.players.map(p=>`${p.points} pts`).join(' / '))}</small></div></div>`).join(''):'<p class="empty">Your completed races will appear here.</p>';}
   }catch(e){$('listing').innerHTML=`<p class="empty">${esc(e.message)}</p>`;}
 }
 $('find-match').addEventListener('click',()=>{notice('');send({type:'queue'});});$('create-room').addEventListener('click',()=>{notice('');send({type:'create'});});
 $('join-form').addEventListener('submit',e=>{e.preventDefault();notice('');send({type:'join',code:$('room-code').value.trim().toUpperCase()});});
 $('cancel-queue').addEventListener('click',()=>send({type:'cancel_queue'}));$('leave-room').addEventListener('click',()=>{if(connected())send({type:'leave'});else{room=null;role=null;showLobby();}});
 $('ready').addEventListener('click',()=>send({type:'ready',ready:!room?.players.find(p=>p.id===self.id)?.ready}));$('respawn').addEventListener('click',()=>{clearInput();send({type:'reset'});});$('rematch').addEventListener('click',()=>{clearInput();send({type:'rematch'});});
 for(const name of ['live','leaderboard','history'])$(name==='live'?'live-tab':name+'-tab').addEventListener('click',()=>{selectedTab=name;for(const n of ['live','leaderboard','history'])$(n==='live'?'live-tab':n+'-tab').classList.toggle('active',n===name);refreshListing();});
 $('listing').addEventListener('click',e=>{const button=e.target.closest('[data-watch]');if(button)send({type:'spectate',id:button.dataset.watch});});
 $('camera-follow').addEventListener('change',()=>{camera.radius=8;camera.beta=1.15;camera.alpha=Math.PI/2;});
 window.addEventListener('keydown',e=>{if(e.target.matches('input,select,textarea')||e.ctrlKey||e.altKey||e.metaKey)return;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight'].includes(e.code)&&room&&role==='player'){e.preventDefault();keys.add(e.code);}});
 window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',clearInput);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInput();});
 const joystick=$('race-joystick'),thumb=$('race-thumb');
 const joystickMove=e=>{const b=joystick.getBoundingClientRect(),x=e.clientX-b.left-b.width/2,y=e.clientY-b.top-b.height/2,scale=Math.min(1,36/Math.max(1,Math.hypot(x,y)));touch.x=x*scale/36;touch.y=y*scale/36;thumb.style.transform=`translate(${x*scale}px,${y*scale}px)`;};
 joystick.addEventListener('pointerdown',e=>{e.preventDefault();joystick.setPointerCapture(e.pointerId);joystickMove(e);});joystick.addEventListener('pointermove',e=>{if(joystick.hasPointerCapture(e.pointerId))joystickMove(e);});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(event,()=>{touch.x=touch.y=0;thumb.style.transform='';});
 $('race-sprint').addEventListener('pointerdown',e=>{e.preventDefault();touch.run=true;$('race-sprint').setPointerCapture(e.pointerId);});for(const event of ['pointerup','pointercancel','lostpointercapture'])$('race-sprint').addEventListener(event,()=>{touch.run=false;});
 setInterval(()=>{if(connected())send({type:'ping',nonce:performance.now()});if(!room)refreshListing();},5000);
 window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(reconnect);socket?.close();});
 (async()=>{try{const data=await api('/api/me');self=data.authenticated?data.user:null;$('signin').hidden=!!self;$('match-actions').hidden=!self;
   $('player-name').textContent=self?self.displayName:'JOIN THE CHALLENGE';$('player-initial').textContent=self?self.displayName.slice(0,1).toUpperCase():'W';$('player-detail').textContent=self?'Your saved character is ready.':'Sign in with your WASA account.';
   if(self)connect();else connection('SIGN IN TO PLAY');if(new URLSearchParams(location.search).get('view')==='watch')$('live-tab').click();refreshListing();
 }catch(e){connection('UNAVAILABLE');notice(e.message);}})();
})();
