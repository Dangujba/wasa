import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import pg from 'pg';
import {pathToFileURL} from 'node:url';
import {installMultiplayer} from './multiplayer.mjs';
import {createRaceStore} from './race-store.mjs';
import { randomBytes, scrypt as scryptCallback, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export async function createApp({pool, origin = 'https://wasa.kasua.ng', secureCookies = true, logger = {level:'warn'}, resultStore} = {}) {
if (!pool) throw new Error('A configured PostgreSQL pool is required.');
const app = Fastify({ logger, bodyLimit: 16 * 1024, trustProxy: '127.0.0.1' });
const cookieName = secureCookies ? '__Host-wasa_session' : 'wasa_dev_session';
const SESSION_DAYS = 14;
const strongPassword = (p) => typeof p === 'string' && p.length >= 10 && p.length <= 128;
const normalizedEmail = (v) => typeof v === 'string' ? v.trim().toLowerCase() : '';
const emailValid = (s) => s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const usernameValid = (s) => typeof s==='string' && /^[A-Za-z][A-Za-z0-9_]{2,23}$/.test(s);
const nameValid = (s) => typeof s === 'string' && s.trim().length >= 2 && s.trim().length <= 40 && !/[<>]/.test(s);
const hexHash = (token) => createHash('sha256').update(token).digest('hex');
const safeError = (reply, status, message) => reply.code(status).send({ ok:false, error:message });

await app.register(rateLimit, { max: 120, timeWindow: '1 minute', keyGenerator: req => String(req.ip || 'unknown') });
app.addHook('onRequest', async (request, reply) => {
  reply.header('Cache-Control','no-store');
  reply.header('X-Content-Type-Options','nosniff');
  if (['POST','PATCH','PUT','DELETE'].includes(request.method)) {
    if (request.headers.origin !== origin) return safeError(reply, 403, 'Invalid request origin.');
    if (!String(request.headers['content-type'] || '').startsWith('application/json')) return safeError(reply,415,'JSON required.');
  }
});
const authRate = { config:{ rateLimit:{ max:5, timeWindow:'15 minutes' } } };
const sensitiveCookie = (v, maxAge = SESSION_DAYS * 86400) =>
  cookieName+'='+encodeURIComponent(v)+'; Path=/; HttpOnly; '+(secureCookies?'Secure; ':'')+'SameSite=Lax; Max-Age='+maxAge;
function cookieToken(req) {
  const cookies = String(req.headers.cookie || '').split(';');
  const part = cookies.find(v=>v.trim().startsWith(cookieName+'='));
  if(!part) return null;
  try { return decodeURIComponent(part.trim().slice(cookieName.length+1)); } catch {return null;}
}
async function userFromRequest(req) {
  const token = cookieToken(req);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await pool.query(
    'SELECT u.id,u.username,u.email,u.email_verified_at,u.created_at,p.display_name,p.home_city,p.avatar_status,p.player_level,p.xp,p.avatar_config FROM sessions s JOIN users u ON u.id=s.user_id JOIN player_profiles p ON p.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at>now()',
    [hexHash(token)]);
  return result.rows[0] || null;
}
function publicUser(u) {
  return {
    id:u.id, username:u.username, displayName:u.display_name, homeCity:u.home_city,
    avatarStatus:u.avatar_status, level:u.player_level, xp:u.xp,
    email:u.email, emailVerified:!!u.email_verified_at, joinedAt:u.created_at,
    avatarConfig:u.avatar_config || {}
  };
}
async function getPublicUser(id) {
  const result=await pool.query('SELECT u.id,u.username,u.email,u.email_verified_at,u.created_at,p.display_name,p.home_city,p.avatar_status,p.player_level,p.xp,p.avatar_config FROM users u JOIN player_profiles p ON p.user_id=u.id WHERE u.id=$1',[id]);
  return publicUser(result.rows[0]);
}
async function setNewSession(reply, userId) {
  const token = randomBytes(32).toString('hex');
  await pool.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '14 days')", [userId,hexHash(token)]);
  reply.header('Set-Cookie', sensitiveCookie(token));
}
async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
  return 'scrypt:'+salt+':'+derived.toString('hex');
}
async function passwordCheck(password, stored) {
  if (!stored || !stored.startsWith('scrypt:')) return false;
  const split = stored.split(':');
  if(split.length!==3 || !/^[a-f0-9]{32}$/.test(split[1]) || !/^[a-f0-9]{128}$/.test(split[2])) return false;
  const derived = await scrypt(password,split[1],64,{N:16384,r:8,p:1,maxmem:64*1024*1024});
  return timingSafeEqual(Buffer.from(split[2],'hex'),derived);
}
// Keep session storage bounded without touching any other site's database.
async function pruneExpiredSessions() {
  try { await pool.query('DELETE FROM sessions WHERE expires_at<=now()'); }
  catch(error) { app.log.error({error},'WASA session cleanup failed'); }
}
await pruneExpiredSessions();
const cleanupTimer = setInterval(pruneExpiredSessions,6*60*60*1000);
cleanupTimer.unref();
app.addHook('onClose', async () => clearInterval(cleanupTimer));


const wardrobe = Object.freeze({
  body: ['masculine','feminine'],
  skin: ['deep','rich','warm','amber','honey','light'],
  hair: ['close','short','curls','braids','locs'],
  facialHair: ['none','moustache','goatee','full_beard'],
  outfit: ['jamfa','kaftan','shadda','babbar_riga','kanuri_robe','jallabiya','atamfa','buba_zani','abaya'],
  headwear: ['none','zanna_bukar','hula','dara','bama','rawani','gyale','hijab','kallabi'],
  footwear: ['sandals','slippers','leather','sneakers'],
  outfitColor: ['ivory','midnight','emerald','sand','indigo','burgundy','rose','cocoa'],
  trimColor: ['gold','ivory','silver','emerald'],
  accessory: ['none','beads','watch','henna','ring','belt','handbag']
});
const defaultAvatar = {
  body:'masculine', skin:'rich', hair:'short',facialHair:'none',outfit:'kaftan',headwear:'zanna_bukar',
  footwear:'sandals',outfitColor:'ivory',trimColor:'gold',accessory:'none'
};
const wardrobeGender = Object.freeze({
  masculine:{
    outfit:['jamfa','kaftan','shadda','babbar_riga','kanuri_robe','jallabiya'],
    headwear:['none','zanna_bukar','hula','dara','bama','rawani'],
    hair:['close','short','curls','locs'],facialHair:['none','moustache','goatee','full_beard'],
    accessory:['none','beads','watch','ring','belt']
  },
  feminine:{
    outfit:['atamfa','buba_zani','abaya'],
    headwear:['none','gyale','hijab','kallabi'],
    hair:['short','curls','braids','locs'],facialHair:['none'],
    accessory:['none','beads','watch','henna','ring','handbag']
  }
});
const genderDefaults = Object.freeze({
 masculine:{outfit:'jamfa',headwear:'none',hair:'short',facialHair:'none',accessory:'none'},
 feminine:{outfit:'abaya',headwear:'hijab',hair:'braids',facialHair:'none',accessory:'none'}
});
function normalizedAvatar(raw,repairLegacy=false) {
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) return null;
  const result={version:1};
  for(const [key,options] of Object.entries(wardrobe)) {
    const value=raw[key] ?? defaultAvatar[key];
    if(typeof value!=='string'||!options.includes(value))return null;
    result[key]=value;
  }
  if(Object.keys(raw).some(k=>!Object.hasOwn(wardrobe,k)&&k!=='version'))return null;
  const set=wardrobeGender[result.body];
  if(!set)return null;
  for(const [field,options] of Object.entries(set)) {
    if(!options.includes(result[field])) {
      if(!repairLegacy)return null;
      result[field]=genderDefaults[result.body][field];
    }
  }
  return result;
}

app.get('/api/avatar/catalog', async()=>({
  ok:true,options:wardrobe,genderOptions:wardrobeGender,defaults:defaultAvatar,genderDefaults,
  mode:'prealpha_free_trial', purchasesEnabled:false
}));
app.get('/api/avatar',async(req,reply)=>{
  const u=await userFromRequest(req);
  if(!u)return safeError(reply,401,'Sign in to load your WASA avatar.');
  return {ok:true, avatar:normalizedAvatar(u.avatar_config,true)||{...defaultAvatar,version:1},
    created:u.avatar_status==='created', player:publicUser(u)};
});
app.patch('/api/avatar',{config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async(req,reply)=>{
  const u=await userFromRequest(req);
  if(!u)return safeError(reply,401,'Sign in to save your avatar.');
  const config=normalizedAvatar(req.body?.avatar);
  if(!config)return safeError(reply,400,'Invalid avatar appearance selection.');
  const result=await pool.query(
    'UPDATE player_profiles SET avatar_config=$1::jsonb,avatar_status=$2,updated_at=now() WHERE user_id=$3 RETURNING avatar_config',
    [JSON.stringify(config),'created',u.id]
  );
  return {ok:true,avatar:result.rows[0].avatar_config,created:true};
});

const multiplayer = installMultiplayer(app, {origin, store: resultStore || createRaceStore(pool),
  sessionHash: req => { const token = cookieToken(req); return token ? hexHash(token) : null; },
  authenticate: async req => { const u = await userFromRequest(req); return u ? {id:u.id, displayName:u.display_name, avatarConfig:normalizedAvatar(u.avatar_config,true)||{...defaultAvatar,version:1}} : null; }
});
app.get('/api/health',async()=>({ok:true,service:'wasa-api',stage:'multiplayer-alpha',protocol:1}));
app.get('/api/me', async(req)=>{
  const user=await userFromRequest(req);
  return {ok:true,authenticated:!!user,user:user?publicUser(user):null};
});
app.post('/api/register',authRate,async(req,reply)=>{
  const {username,email,password} = req.body || {};
  const e=normalizedEmail(email);
  if (!usernameValid(username)) return safeError(reply,400,'Username must have 3 to 24 letters, numbers or underscores and begin with a letter.');
  if (!emailValid(e)) return safeError(reply,400,'Enter a valid email address.');
  if (!strongPassword(password)) return safeError(reply,400,'Use a password with 10 to 128 characters.');
  const key=username.toLowerCase();
  const hash=await passwordHash(password);
  const client=await pool.connect();
  let userId;
  try {
    await client.query('BEGIN');
    const result=await client.query('INSERT INTO users(username,username_key,email,password_hash) VALUES($1,$2,$3,$4) RETURNING id',[username,key,e,hash]);
    userId=result.rows[0].id;
    await client.query('INSERT INTO player_profiles(user_id,display_name) VALUES($1,$2)',[userId,username]);
    await client.query('COMMIT');
  } catch(error) {
    await client.query('ROLLBACK');
    if(error.code==='23505') return safeError(reply,409,'This username or email is already registered.');
    throw error;
  } finally {client.release();}
  await setNewSession(reply,userId);
  return reply.code(201).send({ok:true,authenticated:true,user:await getPublicUser(userId)});
});
app.post('/api/login',authRate,async(req,reply)=>{
  const {identifier,password}=req.body || {};
  if(typeof identifier !== 'string' || identifier.trim().length>254 || !strongPassword(password)) return safeError(reply,401,'Incorrect login details.');
  const q=identifier.trim().toLowerCase();
  const lookup=await pool.query('SELECT id,password_hash FROM users WHERE email=$1 OR username_key=$1 LIMIT 1',[q]);
  const fallback = 'scrypt:0123456789abcdef0123456789abcdef:'+('0'.repeat(128));
  const target=lookup.rows[0] || null;
  const valid=await passwordCheck(password,target?.password_hash||fallback);
  if(!target || !valid) return safeError(reply,401,'Incorrect login details.');
  await setNewSession(reply,target.id);
  return {ok:true,authenticated:true,user:await getPublicUser(target.id)};
});
app.post('/api/logout',async(req,reply)=>{
  const token=cookieToken(req);
  if (token) { await pool.query('DELETE FROM sessions WHERE token_hash=$1',[hexHash(token)]); multiplayer.revokeSession(hexHash(token)); }
  reply.header('Set-Cookie',sensitiveCookie('',0));
  return {ok:true,authenticated:false};
});
app.patch('/api/profile', {config:{ rateLimit:{max:12,timeWindow:'1 minute'} }},async(req,reply)=>{
  const user=await userFromRequest(req);
  if(!user) return safeError(reply,401,'Sign in to edit your profile.');
  const {displayName}=req.body || {};
  if(!nameValid(displayName)) return safeError(reply,400,'Display name must contain 2 to 40 characters.');
  const trimmed=displayName.trim();
  await pool.query('UPDATE player_profiles SET display_name=$1,updated_at=now() WHERE user_id=$2',[trimmed,user.id]);
  return {ok:true,user:{...publicUser(user),displayName:trimmed}};
});
app.post('/api/delete-account',authRate,async(req,reply)=>{
  const user=await userFromRequest(req);
  if(!user)return safeError(reply,401,'Sign in first.');
  const {password}=req.body||{};
  if(!strongPassword(password))return safeError(reply,400,'Password required to delete your account.');
  const result=await pool.query('SELECT password_hash FROM users WHERE id=$1',[user.id]);
  if(!result.rows[0] || !(await passwordCheck(password,result.rows[0].password_hash)))return safeError(reply,403,'Incorrect password.');
  multiplayer.removeUser(user.id);
  await pool.query('DELETE FROM users WHERE id=$1',[user.id]);
  reply.header('Set-Cookie',sensitiveCookie('',0));
  return {ok:true,deleted:true};
});
app.setErrorHandler((error,request,reply)=>{
  if(error.statusCode===429) return safeError(reply,429,'Too many requests. Please try again later.');
  if(error.statusCode && error.statusCode<500) return safeError(reply,error.statusCode,error.message);
  request.log.error(error);
  return safeError(reply,500,'An unexpected server error occurred.');
});
await app.ready();
return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origin = process.env.WASA_ORIGIN || 'https://wasa.kasua.ng';
  const localDevelopment = process.env.WASA_LOCAL_DEVELOPMENT === '1';
  if (localDevelopment && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Development mode requires a loopback origin.');
  if (!localDevelopment && !origin.startsWith('https://')) throw new Error('Production requires HTTPS.');
  const pool = new pg.Pool({host: process.env.PGHOST || '/var/run/postgresql', user: process.env.PGUSER || 'wasa',
    database: process.env.PGDATABASE || 'wasa_dev', max: 8, idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000, query_timeout: 5000});
  const app = await createApp({pool, origin, secureCookies: !localDevelopment});
  let closing = false;
  const close = async () => { if (closing) return; closing = true; await app.close(); await pool.end(); };
  process.once('SIGINT', () => close().catch(() => {process.exitCode=1;}));
  process.once('SIGTERM', () => close().catch(() => {process.exitCode=1;}));
  await app.listen({host:'127.0.0.1',port:Number(process.env.WASA_PORT || 3200)});
}
