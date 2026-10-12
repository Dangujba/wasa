function createStreetDistricts(map){
 // Buildings here are EXPLICITLY illustrative street frontage, not geolocated OSM shops.
 // Road alignment is grounded in actual mapped OSM polylines.
 const roof=mat('corrugated rooftops','#7B7163');
 const facade=[mat('urban ochre','#C7A986'),mat('urban sand','#CEBE9C'),
  mat('urban pale','#D1C2AC'),mat('urban peach','#B98D70'),
  mat('urban cool','#8F9E8A'),mat('urban warm','#B9A68A')];
 const shade=[mat('veranda teal','#356C64'),mat('veranda russet','#A55F4E'),mat('veranda sand','#9B836B')];
 const shutters=mat('shop roller shutters','#53696B',.18,.55);
 const glass=mat('street glass','#4E7776',.10,.36);
 const pillars=mat('street columns','#C6BFA9');
 const fence=mat('compound walls','#B5A58C');
 const light=mat('lamp warmth','#FFE1AA',.14,.18);
 const steel=mat('street fixtures','#6D7874',.16,.52);
 const roads=[];
 const cell=90,lookup=new Map(),put=(seg)=>{
  const minX=Math.floor((Math.min(seg.a[0],seg.b[0])-20)/cell),maxX=Math.floor((Math.max(seg.a[0],seg.b[0])+20)/cell);
  const minZ=Math.floor((Math.min(seg.a[1],seg.b[1])-20)/cell),maxZ=Math.floor((Math.max(seg.a[1],seg.b[1])+20)/cell);
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
    const k=x+','+z;if(!lookup.has(k))lookup.set(k,[]);lookup.get(k).push(seg);
  }
 };
 const widths={trunk:14,trunk_link:8,primary:10,primary_link:8,secondary:9,
   tertiary:7,residential:6,unclassified:6,service:4,living_street:4.5,track:3};
 for(const r of map.roads){
  if(!(r.type in widths))continue;
  for(let i=1;i<r.p.length;i++){
   const a=r.p[i-1],b=r.p[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
   if(len<.8)continue;
   const cx=(a[0]+b[0])/2,cz=(a[1]+b[1])/2;
   if(Math.hypot(cx,cz)>1220)continue;
   const seg={a,b,len,w:widths[r.type],major:['trunk','primary','secondary','tertiary'].includes(r.type),type:r.type};
   roads.push(seg);put(seg);
  }
 }
 function nearestRoadGap(x,z){
   const cx=Math.floor(x/cell),cz=Math.floor(z/cell);
   let near=1e5;
   for(let gx=cx-1;gx<=cx+1;gx++)for(let gz=cz-1;gz<=cz+1;gz++){
    for(const s of lookup.get(gx+','+gz)||[]){
     const dx=s.b[0]-s.a[0],dz=s.b[1]-s.a[1];
     const t=clamp(((x-s.a[0])*dx+(z-s.a[1])*dz)/(dx*dx+dz*dz),0,1);
     near=Math.min(near,Math.hypot(x-s.a[0]-t*dx,z-s.a[1]-t*dz)-s.w/2);
    }
   }
   return near;
 }
 function freeFootprint(x,z,w,d){
   if(Math.abs(x)>1300||Math.abs(z)>1300)return false;
   if(Math.hypot(x,z)<78||Math.hypot(x+24,z-80)<33)return false;
   if(Math.hypot(x+135,z-105)<40)return false;
   return !world.colliders.some(b=>x+w/2>b.minX-2&&x-w/2<b.maxX+2&&z+d/2>b.minZ-2&&z-d/2<b.maxZ+2);
 }
 let count=0,lamps=0,planted=0;
 // Prefer close frontage to guarantee city detail visible around the starting roads.
 roads.sort((a,b)=>Math.hypot((a.a[0]+a.b[0])/2,(a.a[1]+a.b[1])/2)-
                  Math.hypot((b.a[0]+b.b[0])/2,(b.a[1]+b.b[1])/2));
 for(let i=0;i<roads.length;i++){
  const road=roads[i],cx=(road.a[0]+road.b[0])/2,cz=(road.a[1]+road.b[1])/2;
  const radius=Math.hypot(cx,cz);
  if(radius>1100||road.len<12)continue;
  const dx=(road.b[0]-road.a[0])/road.len,dz=(road.b[1]-road.a[1])/road.len;
  const nx=-dz,nz=dx;
  // Limit street props to key corridors rather than creating thousands of draw calls.
  if(road.major&&lamps<110&&road.len>16&&i%5===0){
    const side=rand(i*17.2)>.5?1:-1,off=road.w/2+4;
    const x=cx+nx*off*side,z=cz+nz*off*side;
    if(nearestRoadGap(x,z)>2 && freeFootprint(x,z,.6,.6)){
     const pole=meshCylinder('municipal light pole',x,3.2,z,.13,.20,6.4,steel);
     meshBox('street lamp cross arm',x,6.43,z,1.45,.10,.12,steel).rotation.y=Math.atan2(-dz,dx);
     sphere('soft street lamp',x+.58,6.37,z,.18,.12,.16,light);
     lamps++;
    }
  }
  if(count>=270||road.len<18)continue;
  if(!road.major && radius>850)continue;
  if((i+Math.floor(rand(i)*100))%3!==0 && radius>400)continue;
  for(const side of [-1,1]){
   if(count>=270)break;
   if(rand(i*17.7+side)<.42)continue;
   const w=road.major?14+Math.floor(rand(i*8.9)*5):11+Math.floor(rand(i*2.4)*5);
   const depth=road.major?9+Math.floor(rand(i*12.1)*4):9;
   const off=road.w/2+4+depth/2;
   const x=cx+nx*off*side,z=cz+nz*off*side;
   // Face buildings toward the actual adjacent mapped street.
   if(!freeFootprint(x,z,w+2,depth+2))continue;
   if(nearestRoadGap(x,z)<(depth/2+2.8))continue;
   const height=3.65+Math.floor(rand(i*7.31+side)*3)*2.8;
   const body=facade[Math.floor(rand(i*2.18+side*7)*facade.length)];
   const awning=shade[Math.floor(rand(i*3.71)*shade.length)];
   const yaw=Math.atan2(-dz,dx)+(side<0?Math.PI:0);
   const group=new B.TransformNode('concept aligned OSM frontage '+i,world.scene);
   group.position.set(x,0,z);group.rotation.y=yaw;
   const pieces=[];
   const add=(name,px,py,pz,width,h,deep,m)=>{
     const mesh=meshBox(name,px,py,pz,width,h,deep,m,group);
     pieces.push(mesh);return mesh;
   };
   add('Damaturu-inspired street shop',0,height/2+.12,0,w,height,depth,body);
   add('flat urban roof',0,height+.2,0,w+.55,.34,depth+.55,roof);
   add('storefront entry',0,1.16,-depth/2-.052,1.7,2.20,.095,shutters);
   add('market veranda awning',0,2.7,-depth/2-.8,w*.91,.18,1.8,awning);
   for(const sx of [-1,1]){
     add('street-facing window',sx*w*.31,1.64,-depth/2-.095,1.42,1.3,.09,glass);
     add('shop shutter frame',sx*w*.31,.98,-depth/2-.12,1.58,.08,.1,pillars);
   }
   if(height>5.6){
     for(const sx of [-1,1]){
       add('first storey window',sx*w*.30,height-1.55,-depth/2-.085,1.3,1.0,.07,glass);
       add('window shade',sx*w*.30,height-.95,-depth/2-.40,1.7,.10,.8,awning);
     }
   }
   if(i%4===0)for(const sx of [-1,1])
     add('walled compound side',sx*(w/2+2),.9,0,.3,1.8,depth+3,fence);
   // Bake group rotation/translation into world transform before static merging.
   group.computeWorldMatrix(true);
   for(const mesh of pieces)mesh.setParent(null);
   group.dispose();
   world.colliders.push({minX:x-w/2-1.2,maxX:x+w/2+1.2,
                         minZ:z-depth/2-1.2,maxZ:z+depth/2+1.2});
   count++;
  }
 }
 // Separate roadside trees in lower-density stretches, never presented as actual OSM trees.
 for(let i=0;i<roads.length&&planted<85;i+=5){
   const r=roads[i];if(r.len<16||Math.hypot(r.a[0],r.a[1])>1050)continue;
   const dx=(r.b[0]-r.a[0])/r.len,dz=(r.b[1]-r.a[1])/r.len;
   const x=(r.a[0]+r.b[0])/2-dz*(r.w/2+7);
   const z=(r.a[1]+r.b[1])/2+dx*(r.w/2+7);
   if(nearestRoadGap(x,z)<4||!freeFootprint(x,z,5,5))continue;
   tree(x,z,i);planted++;
 }
 world.districtCount=count;
 console.info('[WASA WORLD] Road-aligned scenery',count,'facades',lamps,'streetlights',planted,'trees');
}
