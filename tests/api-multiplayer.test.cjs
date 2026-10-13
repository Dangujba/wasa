/* Run only against a freshly provisioned, isolated PostgreSQL database. */
const test = require('node:test'), assert = require('node:assert/strict');
const {createRequire} = require('node:module'), {resolve} = require('node:path');
const {randomBytes,randomUUID,createHash} = require('node:crypto');
const requireApi = createRequire(resolve(__dirname,'../api/package.json'));
const pg = requireApi('pg'), {WebSocket} = requireApi('ws');
const database = process.env.WASA_TEST_DATABASE;
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
test('real PostgreSQL accounts, authenticated sockets, race, reconnect, spectator and deletion', {skip:!database,timeout:65000}, async()=>{
  assert.match(database,/^wasa_multiplayer_test_[a-f0-9]{8}$/,'Never run integration tests against the live account database');
  const pool = new pg.Pool({host:process.env.PGHOST||'/var/run/postgresql',user:process.env.PGUSER||'wasa',database});
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM users')).rows[0].n,0,'Test database must be empty');
  const {createApp} = await import('../api/server.mjs');
  const origin='http://127.0.0.1:4174', app=await createApp({pool,origin,secureCookies:false,logger:false});
  await app.listen({host:'127.0.0.1',port:0});const url='ws://127.0.0.1:'+app.server.address().port+'/api/multiplayer/socket';
  const sockets=[];const password=randomBytes(18).toString('hex');
  async function request(method,url,body,cookie) {return app.inject({method,url,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{})},payload:body});}
  async function account(username){const r=await request('POST','/api/register',{username,email:username.toLowerCase()+'@example.invalid',password});assert.equal(r.statusCode,201);return {cookie:r.headers['set-cookie'].split(';')[0],user:r.json().user};}
  async function socket(account){
    const ws=new WebSocket(url,{headers:{origin,Cookie:account.cookie}});sockets.push(ws);ws.messages=[];
    ws.on('message',data=>ws.messages.push(JSON.parse(data.toString())));
    await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});return ws;
  }
  async function until(predicate,ms=5000){const deadline=Date.now()+ms;while(!predicate()){if(Date.now()>deadline)throw Error('Timed out waiting for expected state');await delay(30);}}
  const send=(ws,type,more={})=>ws.send(JSON.stringify({v:1,type,...more}));
  const lastRoom=ws=>ws.messages.filter(m=>m.type==='snapshot').at(-1)?.room;
  try{
    const a=await account('RaceTesterA'),b=await account('RaceTesterB'),s=await account('RaceViewer');
    const avatar=(await request('GET','/api/avatar',null,b.cookie)).json().avatar;
    const outfit={...avatar,body:'feminine',outfit:'abaya',headwear:'hijab',hair:'braids',facialHair:'none',accessory:'none'};
    assert.equal((await request('PATCH','/api/avatar',{avatar:outfit},b.cookie)).statusCode,200);
    for(const headers of [{origin}, {origin:'https://evil.example',Cookie:a.cookie}]){
      const probe=new WebSocket(url,{headers});sockets.push(probe);
      const status=await new Promise(resolve=>{probe.once('unexpected-response',(_,res)=>{res.resume();probe.terminate();resolve(res.statusCode);});probe.once('error',()=>{});});assert.ok([401,403].includes(status));
    }
    const wa=await socket(a);let wb=await socket(b);const viewer=await socket(s);
    send(wa,'queue');send(wb,'queue');await until(()=>lastRoom(wa)?.players.length===2);
    const id=lastRoom(wa).id;assert.equal(lastRoom(wb).id,id);
    assert.equal(lastRoom(wa).players.find(p=>p.id===b.user.id).avatarConfig.outfit,'abaya');
    send(wa,'ready',{ready:true});send(wb,'ready',{ready:true});await until(()=>lastRoom(wa)?.phase==='countdown');
    send(viewer,'spectate',{id});await until(()=>lastRoom(viewer)?.id===id);send(viewer,'input',{seq:1,x:0,z:-1,run:true});await until(()=>viewer.messages.some(m=>m.type==='error'));
    assert.equal(JSON.stringify(lastRoom(viewer)).includes('@example.invalid'),false);
    await until(()=>lastRoom(wa)?.phase==='racing');let sa=0,sb=0;
    let timer=setInterval(()=>{if(wa.readyState===1)send(wa,'input',{seq:++sa,x:0,z:-1,run:true});if(wb.readyState===1)send(wb,'input',{seq:++sb,x:0,z:-1,run:false});},34);
    try{
      await delay(1000);wb.close();await delay(300);wb=await socket(b);await until(()=>wb.messages.some(m=>m.type==='welcome'));
      await until(()=>lastRoom(wa)?.phase==='finished',35000);
    }finally{clearInterval(timer);}
    await until(()=>lastRoom(wa)?.saved);
    const result=lastRoom(wa).result;assert.equal(result.outcome,'finish');assert.equal(result.players.find(p=>p.id===a.user.id).points,3);
    await until(()=>lastRoom(viewer)?.result?.id===result.id&&lastRoom(viewer).saved);
    const mine=(await request('GET','/api/races/mine',null,a.cookie)).json();assert.equal(mine.results.length,1);
    const leaderboard=(await request('GET','/api/races/leaderboard')).json();assert.equal(leaderboard.players[0].points,3);
    const {createRaceStore}=await import('../api/race-store.mjs');await createRaceStore(pool).save(result);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM race_results')).rows[0].n,1);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM race_participants')).rows[0].n,2);
    send(wa,'rematch');await until(()=>lastRoom(wa)?.phase==='waiting');
    for(const ws of [wa,wb,viewer])send(ws,'leave');
    const cityData=require('../public/world/data/city-physics-v1.json');
    for(const ws of [wa,wb,viewer])send(ws,'explore',{revision:cityData.revision});
    const cityState=ws=>ws.messages.filter(m=>m.type==='city_snapshot').at(-1);
    await until(()=>cityState(wa)?.online===3&&cityState(wb)?.online===3);
    const guests=[];
    for(let i=0;i<13;i++){
      const id=randomUUID(),token=randomBytes(32).toString('hex'),name='CityMember'+i;
      await pool.query('INSERT INTO users(id,email,username,username_key,password_hash) VALUES($1,$2,$3,$4,$5)',[id,name.toLowerCase()+'@example.invalid',name,name.toLowerCase(),'test-fixture-login-disabled']);
      await pool.query('INSERT INTO player_profiles(user_id,display_name) VALUES($1,$2)',[id,name]);
      await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[id,createHash('sha256').update(token).digest('hex')]);
      const ws=await socket({cookie:'wasa_dev_session='+token});guests.push(ws);send(ws,'explore',{revision:cityData.revision});
    }
    await until(()=>cityState(wa)?.online===16);assert.ok(cityState(wa).players.length<=24);
    const beforeCity=cityState(wa).self.state.x;let citySeq=cityState(wa).self.ack;
    const cityTimer=setInterval(()=>send(wa,'world_input',{seq:++citySeq,x:1,z:0,run:true}),34);
    try{await until(()=>cityState(wb)?.players.find(p=>p.id===a.user.id)?.state.x>beforeCity+.5);}finally{clearInterval(cityTimer);}
    assert.equal(JSON.stringify(cityState(viewer)).includes('@example.invalid'),false);
    send(wa,'city_travel',{target:'ysu'});await until(()=>cityState(wa)?.self.state.z>6000);
    await until(()=>!cityState(wb).players.some(p=>p.id===a.user.id));
    for(const ws of guests){send(ws,'leave');ws.close();}
    const logout=await request('POST','/api/logout',{},b.cookie);assert.equal(logout.statusCode,200);
    await until(()=>wb.readyState!==1);assert.equal((await request('GET','/api/me',null,b.cookie)).json().authenticated,false);
    const deletion=await request('POST','/api/delete-account',{password},a.cookie);assert.equal(deletion.statusCode,200);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM race_participants WHERE user_id IS NULL')).rows[0].n,1);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM sessions WHERE user_id=$1',[a.user.id])).rows[0].n,0);
    assert.equal((await request('GET','/api/races/leaderboard')).json().players.some(p=>p.displayName==='RaceTesterA'),false);
    await createRaceStore(pool).save({...result,id:randomUUID(),outcome:'abandoned',reason:'Account deleted before save',
      players:result.players.map(p=>({...p,placement:null,elapsedMs:null,points:0}))});
    assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM race_participants WHERE user_id IS NULL')).rows[0].n,2);
    // A new API instance reads the same permanent history without relying on in-memory rooms.
    const restarted=await createApp({pool,origin,secureCookies:false,logger:false});
    assert.equal((await restarted.inject({method:'GET',url:'/api/races/mine',headers:{cookie:b.cookie}})).statusCode,401);
    assert.equal((await restarted.inject('/api/races/leaderboard')).json().players[0].races,1);await restarted.close();
  }finally{for(const ws of sockets)ws.terminate();await app.close();await pool.end();}
});
