(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./movement.js'):root.WasaMovement);if(typeof module==='object'&&module.exports)module.exports=api;else root.WasaCity=api;})(typeof window==='object'?window:globalThis,function(movement){
 'use strict';
 const HZ=30,DT=1/HZ;
 function create(data){
  const surfaces=new Map(),collisions=new Map(),roads=new Map();
  const add=(grid,cell,bounds,item)=>{for(let x=Math.floor(bounds[0]/cell);x<=Math.floor(bounds[2]/cell);x++)for(let z=Math.floor(bounds[1]/cell);z<=Math.floor(bounds[3]/cell);z++){const key=x+','+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(item);}};
  for(const v of data.triangles){
   const [x,y,z,bx,by,bz,cx,cy,cz,name]=v,dx=bx-x,dz=bz-z,ex=cx-x,ez=cz-z,den=dx*ez-ex*dz;
   if(Math.abs(den)<1e-7)continue;
   const sx=((by-y)*ez-(cy-y)*dz)/den,sz=(dx*(cy-y)-ex*(by-y))/den;if(Math.hypot(sx,sz)>1)continue;
   const len=Math.hypot(sx,1,sz),t={x,y,z,dx,dz,ex,ez,den,sx,sz,name,normal:{x:-sx/len,y:1/len,z:-sz/len}};
   add(surfaces,16,[Math.min(x,bx,cx),Math.min(z,bz,cz),Math.max(x,bx,cx),Math.max(z,bz,cz)],t);
  }
  for(const c of data.colliders)add(collisions,64,[c.minX-.45,c.minZ-.45,c.maxX+.45,c.maxZ+.45],c);
  for(const group of data.bands||[])for(const [x,z,ex,ez] of group.segments){const dx=ex-x,dz=ez-z,l2=dx*dx+dz*dz;if(l2<.01)continue;const band={x,z,dx,dz,l2,len:Math.sqrt(l2),width:group.width,height:group.height,name:group.name};add(surfaces,16,[Math.min(x,ex)-group.width/2,Math.min(z,ez)-group.width/2,Math.max(x,ex)+group.width/2,Math.max(z,ez)+group.width/2],band);}
  for(const r of data.roads){const [x,z,dx,dz,width]=r,l2=dx*dx+dz*dz;if(l2<.1)continue;add(roads,64,[Math.min(x,x+dx)-width/2,Math.min(z,z+dz)-width/2,Math.max(x,x+dx)+width/2,Math.max(z,z+dz)+width/2],{x,z,dx,dz,l2,width});}
  function sample(x,z,reference=data.ground,up=.32,down=.42){
   let best=data.ground<=reference+up&&data.ground>=reference-down?{height:data.ground,normal:{x:0,y:1,z:0},name:'ground'}:null;
   for(const t of surfaces.get(Math.floor(x/16)+','+Math.floor(z/16))||[]){const px=x-t.x,pz=z-t.z;let height,normal;if(t.width!==undefined){const u=(px*t.dx+pz*t.dz)/t.l2;if(u< -1e-5||u>1.00001||Math.abs(px*t.dz-pz*t.dx)/t.len>t.width/2+1e-5)continue;height=t.height;normal={x:0,y:1,z:0};}else{const u=(px*t.ez-t.ex*pz)/t.den,v=(t.dx*pz-px*t.dz)/t.den;if(u< -1e-5||v< -1e-5||u+v>1.00001)continue;height=t.y+px*t.sx+pz*t.sz;normal=t.normal;}if(height>reference+up+1e-5||height<reference-down-1e-5)continue;if(!best||height>best.height)best={height,normal,name:t.name};}
   return best;
  }
  function canGo(x,z,height){
   const l=data.limits;if(x<l.minX+12||x>l.maxX-12||z<l.minZ+12||z>l.maxZ-12)return false;
   let street=false;
   for(const r of roads.get(Math.floor(x/64)+','+Math.floor(z/64))||[]){const t=Math.max(0,Math.min(1,((x-r.x)*r.dx+(z-r.z)*r.dz)/r.l2));if(Math.hypot(x-r.x-r.dx*t,z-r.z-r.dz*t)<=Math.max(.95,r.width/2-.35)){street=true;break;}}
   for(const c of collisions.get(Math.floor(x/64)+','+Math.floor(z/64))||[]){if(c.minY!==undefined&&(height>c.maxY||height+1.72<c.minY))continue;if(x>c.minX-.45&&x<c.maxX+.45&&z>c.minZ-.45&&z<c.maxZ+.45&&(!street||c.hard))return false;}
   return true;
  }
  function spawn(target='spawn',slot=0){
   const p=data.spawns[target]||data.spawns.spawn;
   for(let i=0;i<128;i++){const offset=(slot+i)%128,x=p.x+Math.floor(offset/6)*1.25,z=p.z+(offset%6-2.5),floor=sample(x,z,p.reference);if(floor&&canGo(x,z,floor.height))return {x,y:floor.height,z,vx:0,vz:0,heading:p.heading||0,turnVelocity:0,groundHeight:floor.height,surface:floor.name};}
   throw Error('No safe city arrival point.');
  }
  function step(state,input,dt=DT){
   const speed=input.run?6.7:3.1,len=Math.max(1,Math.hypot(input.x,input.z)),v=movement.velocityStep({x:state.vx,z:state.vz},input.x/len*speed,input.z/len*speed,dt);
   const x=state.x+v.x*dt,z=state.z+v.z*dt,floor=sample(x,z,state.groundHeight??state.y),next={...state};
   if(floor&&canGo(x,z,floor.height)){next.x=x;next.z=z;next.groundHeight=floor.height;next.surface=floor.name;next.y+=(floor.height-next.y)*(1-Math.exp(-dt*24));next.vx=v.x;next.vz=v.z;}else next.vx=next.vz=0;
   if(Math.hypot(next.vx,next.vz)>.06){const t=movement.turnStep(next.heading,next.turnVelocity,Math.atan2(-next.vx,-next.vz),dt);next.heading=t.heading;next.turnVelocity=t.velocity;}else next.turnVelocity*=Math.exp(-dt*12);
   return next;
  }
  return {revision:data.revision,version:data.version,sample,canGo,spawn,step};
 }
 function validInput(m){return m&&m.v===1&&m.type==='world_input'&&Number.isSafeInteger(m.seq)&&m.seq>0&&m.seq<2147483647&&Number.isFinite(m.x)&&Math.abs(m.x)<=1&&Number.isFinite(m.z)&&Math.abs(m.z)<=1&&typeof m.run==='boolean'&&Object.keys(m).every(k=>['v','type','seq','x','z','run'].includes(k));}
 return {create,validInput,HZ,DT};
});
