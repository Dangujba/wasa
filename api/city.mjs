import {readFileSync} from 'node:fs';
import city from '../public/shared/city-simulation.js';
const data=JSON.parse(readFileSync(new URL('../public/world/data/city-physics-v1.json',import.meta.url)));
const simulation=city.create(data),ZERO={x:0,z:0,run:false};
export const CITY_CAPACITY=64;
export class CityHub {
 constructor({send,clock}){this.send=send;this.clock=clock;this.players=new Map();this.tick=0;}
 join(c,revision){
  if(revision!==simulation.revision){this.send(c,{type:'error',message:'The city has been updated. Reload to join.'});return;}
  if(!this.players.has(c.identity.id)&&this.players.size>=CITY_CAPACITY){this.send(c,{type:'error',message:'The city is full. Try again shortly.'});return;}
  let p=this.players.get(c.identity.id);
  if(!p){const used=new Set([...this.players.values()].map(p=>p.slot));let slot=0;while(used.has(slot))slot++;p={c,slot,state:simulation.spawn('spawn',slot),ack:0,lastReceived:0,inputs:[],lastInput:ZERO,inputAt:0};this.players.set(c.identity.id,p);}
  p.c=c;p.inputs=[];p.lastInput=ZERO;p.ack=p.lastReceived;c.city=true;
  this.send(c,{type:'city_joined',revision:simulation.revision,capacity:CITY_CAPACITY});this.snapshot(p);
 }
 reconnect(c){const p=this.players.get(c.identity.id);if(p){p.c=c;p.inputs=[];p.lastInput=ZERO;p.ack=p.lastReceived;c.city=true;}}
 leave(c){this.players.delete(c.identity.id);c.city=false;}
 input(c,m){const p=this.players.get(c.identity.id);if(!p||!city.validInput(m)){this.send(c,{type:'error',message:'City input rejected.'});return;}if(m.seq<=p.lastReceived)return;if(p.inputs.length>=6)p.inputs.shift();p.inputs.push(m);p.lastReceived=m.seq;p.inputAt=this.clock();}
 travel(c,target){const p=this.players.get(c.identity.id);if(!p||!Object.hasOwn(data.spawns,target)){this.send(c,{type:'error',message:'Choose a city arrival point.'});return;}if(this.clock()-(p.travelAt??-Infinity)<3000){this.send(c,{type:'error',message:'Wait a moment before travelling again.'});return;}p.travelAt=this.clock();p.state=simulation.spawn(target,p.slot);p.inputs=[];p.lastInput=ZERO;p.ack=p.lastReceived;this.snapshot(p,true);}
 count(){return [...this.players.values()].filter(p=>p.c.ws?.readyState===1).length;}
 snapshot(p,travel=false){
  if(!p.c.ws||p.c.ws.readyState!==1)return;
  const nearby=[...this.players.values()].filter(q=>q!==p&&q.c.ws?.readyState===1&&Math.hypot(p.state.x-q.state.x,p.state.z-q.state.z)<=180)
   .sort((a,b)=>Math.hypot(a.state.x-p.state.x,a.state.z-p.state.z)-Math.hypot(b.state.x-p.state.x,b.state.z-p.state.z)).slice(0,24);
  this.send(p.c,{type:'city_snapshot',revision:simulation.revision,tick:this.tick,online:this.count(),travel,
   self:{state:p.state,ack:p.ack},players:nearby.map(q=>({id:q.c.identity.id,displayName:q.c.identity.displayName,avatarConfig:q.c.identity.avatarConfig,state:q.state}))});
 }
 advance(){this.tick++;const now=this.clock();for(const p of this.players.values()){
  if(!p.c.ws&&now-p.c.disconnectedAt>=15000){this.leave(p.c);continue;}
  const m=p.inputs.shift();if(m){p.ack=m.seq;p.lastInput=m;}
  p.state=simulation.step(p.state,p.c.ws?.readyState===1&&now-p.inputAt<=250?p.lastInput:ZERO);
  if(this.tick%3===0)this.snapshot(p);
 }}
}
