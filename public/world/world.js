/* WASA / World 02, immersive geographic expansion
 * Damaturu real OSM road + building footprints (ODbL).
 * Flyover: illustrative three-level interchange model, not surveyed geometry.
 * Signed-in explorers share the city through authenticated authoritative movement.
 */
(() => {
'use strict';
const B=window.BABYLON;
const $=id=>document.getElementById(id);
const canvas=$('world-canvas');
const boot=$('boot-overlay');
const ui=$('game-ui');
const minimap=$('mini-map');
const minimapContext=minimap.getContext('2d');
const world = {
  map:null,engine:null,scene:null,camera:null,player:null,
  alpha:1.84,
  config:{outfit:'jamfa',outfitColor:'ivory',trimColor:'silver',skin:'rich',headwear:'none',
    hair:'short',facialHair:'none',footwear:'leather',accessory:'none',body:'masculine'},
  name:'WASA EXPLORER',
  playerPos:new B.Vector3(-95,0,330),
  velocity:new B.Vector3(0,0,0),
  heading:Math.PI/2-1.84,turnVelocity:0,walkPhase:0,colliders:[],interactions:[],
  keys:new Set(),touch:{x:0,y:0,sprint:false},clock:performance.now(),
  quality:localStorage.getItem('wasa-quality')||'auto',
  avatarRig:null,
  ready:false,displayedHelp:false,
  missionComplete:false, nearby:null, hasFocus:true,
  streetsDrawn:0,buildingCount:0,roadCount:0,showMap:true,worldSize:8600,cameraResetQueued:false,landmarks:[],districtCount:0
};
const colors={
 sand:'#8A8670',grass:'#4A6050',road:'#4D4B46',trunk:'#45443E',minor:'#5C574D',
 curb:'#9A9C8E',path:'#8A8370',stripe:'#DFD0AF',concrete:'#C8BEAA',
 stone:'#C5A88C',cream:'#DEC5A5',pink:'#B8836C',mint:'#7A9B89',
 roof:'#7A6552',glass:'#3B6168',steel:'#D5C0A0',gold:'#E5B060',wall:'#B09470'
};
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const dist=(x,z,a,b)=>Math.hypot(x-a,z-b);
const rand=(n)=>{const x=Math.sin(n*127.13+23.1)*43758.5453;return x-Math.floor(x);};
const shortName=(s)=>String(s||'').toUpperCase().slice(0,24);
function progress(p,status){
 $('load-status').textContent=status;
 $('boot-fill').style.width=p+'%';
 $('load-percent').textContent=p+'%';
 $('boot-progress').setAttribute('aria-valuenow',String(p));
}
function showError(error){
 console.error('[WASA WORLD]',error);
 progress(0,'WORLD LOADING FAILED');
 $('load-status').textContent=(error?.message||'Startup error').slice(0,130);
 $('boot-retry').hidden=false;
}
function mat(name,color,metal=0,rough=1){
 const key=name;
 if(world.mats[key])return world.mats[key];
 const m=new B.PBRMaterial(name,world.scene);
 m.albedoColor=B.Color3.FromHexString(color);
 m.metallic=Math.min(metal,.35);
 m.roughness=Math.max(rough,.25);
 m.environmentIntensity=.65;
 m.directIntensity=1.1;
 m.ambientColor=m.albedoColor.scale(.12);
 if(/^road-(residential|primary|trunk)$/.test(name))window.WasaRendering.applySurface(m,'asphalt');
 else if(/wall|concrete|facade|plaster|parapet/.test(name))window.WasaRendering.applySurface(m,name==='wall-stone'?'block':'plaster');
 world.mats[key]=m;return m;
}
function meshBox(name,x,y,z,w,h,d,material,parent=null){
 const o=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},world.scene);
 o.position.set(x,y,z);o.material=material;
 o.receiveShadows=true;o.metadata={wasaShadow:true,
   wasaWalkable:['flyover raised road deck','flyover approach ramp','north-south underpass','WASA arena arrival plaza'].includes(name)};
 if(material.albedoTexture)window.WasaRendering.boxUV(o);
 if(parent)o.parent=parent;
 return o;
}
function meshCylinder(name,x,y,z,top,bottom,height,material,parent=null,tess=12){
 const o=B.MeshBuilder.CreateCylinder(name,{diameterTop:top,diameterBottom:bottom,height,tessellation:tess},world.scene);
 o.position.set(x,y,z);o.material=material;
 o.receiveShadows=true;o.metadata={wasaShadow:true};
 if(parent)o.parent=parent;
 return o;
}
function sphere(name,x,y,z,rx,ry,rz,m,parent=null){
 const o=B.MeshBuilder.CreateSphere(name,{diameter:1,segments:12},world.scene);
 o.position.set(x,y,z);o.scaling.set(rx*2,ry*2,rz*2);o.material=m;
 o.receiveShadows=true;o.metadata={wasaShadow:true};
 if(parent)o.parent=parent;
 return o;
}
function lineMesh(name,segments,width,colorMaterial,height=.052){
 // Batch thousands of open-street-map line segments in a SINGLE mesh.
 const positions=[],indices=[],uvs=[],normals=[];
 for(const [x1,z1,x2,z2] of segments){
  const len=Math.hypot(x2-x1,z2-z1);if(len<.2)continue;
  const nx=-(z2-z1)/len*width/2,nz=(x2-x1)/len*width/2;
  const count=positions.length/3;
  positions.push(x1+nx,height,z1+nz,x1-nx,height,z1-nz,x2+nx,height,z2+nz,x2-nx,height,z2-nz);
  uvs.push(0,0,width/3,0,0,len/3,width/3,len/3);
  indices.push(count,count+1,count+2,count+1,count+3,count+2);
 }
 const mesh=new B.Mesh(name,world.scene);
 B.VertexData.ComputeNormals(positions,indices,normals);
 const vertex=new B.VertexData();vertex.positions=positions;vertex.indices=indices;vertex.normals=normals;vertex.uvs=uvs;
 vertex.applyToMesh(mesh);mesh.material=colorMaterial;mesh.isPickable=false;mesh.freezeWorldMatrix();
 mesh.receiveShadows=true;
 mesh.metadata={wasaWalkable:name.startsWith('OSM mapped')||['street pavements','pavement edges'].includes(name),wasaBandWidth:width};
 return mesh;
}
function segmentsForRoad(road){
 let seg=[];
 const v=road.p;
 for(let i=1;i<v.length;i++){
  const a=v[i-1],b=v[i];
  if(!a||!b)continue;
  // Legacy mapped junction geometry conflicts with the recent flyover.
  // Mask a small area around The Cross and replace it with a conceptual interchange.
  const mx=(a[0]+b[0])/2,mz=(a[1]+b[1])/2;
  if(dist(mx,mz,0,0)<58)continue;
  const len=Math.hypot(b[0]-a[0],b[1]-a[1]);
  const steps=Math.max(1,Math.ceil(len/95));
  for(let t=0;t<steps;t++){
    const from=t/steps,to=(t+1)/steps;
    seg.push([a[0]+(b[0]-a[0])*from,a[1]+(b[1]-a[1])*from,
              a[0]+(b[0]-a[0])*to,a[1]+(b[1]-a[1])*to]);
  }
 }
 return seg;
}
// One shared spatial index for OSM street centrelines. In a road-connected
// city, the walkable street surface must take precedence over the loose AABB
// approximations used by decorative building footprints and shopfront modules.
function indexRoadSurfaces(map){
 const widths={trunk:14,trunk_link:8,primary:10,primary_link:7,secondary:9,
  secondary_link:7,tertiary:7,tertiary_link:6,unclassified:6.5,residential:5.7,
  living_street:4.6,service:4,track:3.2,footway:2,pedestrian:3,path:2};
 const cell=80,grid=new Map();
 for(const r of map.roads){
  const width=widths[r.type];
  if(!width)continue;
  for(let i=1;i<r.p.length;i++){
   const a=r.p[i-1],b=r.p[i],dx=b[0]-a[0],dz=b[1]-a[1];
   const l2=dx*dx+dz*dz;if(l2<.1)continue;
   const seg={x:a[0],z:a[1],dx,dz,l2,width,name:r.name||'',kind:r.type,
      id:r.id};
   const pad=width/2+2;
   const loX=Math.floor((Math.min(a[0],b[0])-pad)/cell),
     hiX=Math.floor((Math.max(a[0],b[0])+pad)/cell);
   const loZ=Math.floor((Math.min(a[1],b[1])-pad)/cell),
     hiZ=Math.floor((Math.max(a[1],b[1])+pad)/cell);
   for(let x=loX;x<=hiX;x++)for(let z=loZ;z<=hiZ;z++){
      const key=x+','+z;
      if(!grid.has(key))grid.set(key,[]);
      grid.get(key).push(seg);
   }
  }
 }
 world.roadIndex={grid,cell};
}
function roadAt(x,z){
 const index=world.roadIndex;if(!index)return null;
 const grid=index.grid;
 const cx=Math.floor(x/index.cell),cz=Math.floor(z/index.cell);
 // Search current cell plus neighbours for edges and compound junctions.
 let best=null;
 for(let xx=cx-1;xx<=cx+1;xx++)for(let zz=cz-1;zz<=cz+1;zz++){
  for(const seg of grid.get(xx+','+zz)||[]){
   const t=clamp(((x-seg.x)*seg.dx+(z-seg.z)*seg.dz)/seg.l2,0,1);
   const px=seg.x+t*seg.dx,pz=seg.z+t*seg.dz;
   const gap=Math.hypot(x-px,z-pz);
   const ranking=gap-(seg.width/2)*.02;
   if(!best||ranking<best.ranking)best={...seg,px,pz,distance:gap,ranking};
  }
 }
 return best;
}

function buildRoadNetwork(map){
 const trunk=[],main=[],residential=[],path=[],curbs=[],markings=[],sidewalks=[];
 const widthFor={trunk:14,trunk_link:8,primary:10,primary_link:7,secondary:9,tertiary:7,
 unclassified:6.5,residential:5.7,living_street:4.6,service:4,path:2,footway:2,pedestrian:3};
 for(const road of map.roads){
  const w=widthFor[road.type]||5.4;
  const seg=segmentsForRoad(road);
  if(road.type==='trunk'||road.type==='trunk_link')trunk.push(...seg);
  else if(['primary','primary_link','secondary'].includes(road.type))main.push(...seg);
  else if(['path','footway','pedestrian'].includes(road.type))path.push(...seg);
  else residential.push(...seg);
  if(w>=5)for(const [x1,z1,x2,z2] of seg){
   const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz);
   if(len<1)continue;
   const nx=-dz/len*(w/2+.3),nz=dx/len*(w/2+.3);
   curbs.push([x1+nx,z1+nz,x2+nx,z2+nz],[x1-nx,z1-nz,x2-nx,z2-nz]);
   // Walkable pavement bands on mapped road margins; conceptual dimensions.
   if(Math.hypot((x1+x2)/2,(z1+z2)/2)<1250){
     const sx=-dz/len*(w/2+1.55),sz=dx/len*(w/2+1.55);
     sidewalks.push([x1+sx,z1+sz,x2+sx,z2+sz],
                    [x1-sx,z1-sz,x2-sx,z2-sz]);
   }
   if(w>=7 && len>=7 && Math.hypot((x1+x2)/2,(z1+z2)/2)<1450)
      for(let d=1.5;d<len-1.7;d+=10){
     const e=Math.min(d+4,len-.8);
     markings.push([x1+dx*d/len,z1+dz*d/len,x1+dx*e/len,z1+dz*e/len]);
   }
  }
 }
 function getAsphaltTexture(){
  if(world.asphaltTex)return world.asphaltTex;
  try{
    const tex=new B.DynamicTexture('asphalt-grain',{width:256,height:256},world.scene,false);
    const ctx=tex.getContext();
    ctx.fillStyle='#303538';ctx.fillRect(0,0,256,256);
    for(let i=0;i<3500;i++){
      const v=45+Math.floor(rand(i*3.7)*52);
      ctx.fillStyle='rgb('+v+','+v+','+v+')';
      ctx.fillRect(Math.floor(rand(i*1.9)*256),Math.floor(rand(i*4.3)*256),1+Math.floor(rand(i*5.1)*2),1+Math.floor(rand(i*2.7)*2));
    }
    tex.update();tex.uScale=14;tex.vScale=14;
    world.asphaltTex=tex;
    return tex;
  }catch(_){return null;}
 }
 const asph=getAsphaltTexture();
 const resMat=mat('road-residential',colors.minor,0,.88);
 const priMat=mat('road-primary',colors.road,0,.86);
 const trkMat=mat('road-trunk',colors.trunk,0,.84);
 if(asph){resMat.bumpTexture=asph;priMat.bumpTexture=asph;trkMat.bumpTexture=asph;}
 lineMesh('OSM mapped local roads',residential,5.7,resMat,.11);
 lineMesh('OSM mapped primary roads',main,9.8,priMat,.12);
 lineMesh('OSM mapped A3 highway',trunk,13.6,trkMat,.13);
 lineMesh('OSM mapped pedestrian paths',path,2.5,mat('footpaths','#9B967E',0,.92),.13);
 lineMesh('street pavements',sidewalks,1.18,mat('pavements','#81847B',0,.82),.126);
 lineMesh('pavement edges',curbs,.16,mat('curbs','#999589',0,.75),.144);
 lineMesh('street lane marks',markings,.12,mat('road-markings',colors.stripe,0,.60),.17);
 world.streetsDrawn=trunk.length+main.length+residential.length+path.length;
 world.roadCount=map.roads.length;
}
function signedArea(points){
 let area=0;
 for(let i=0;i<points.length;i++){
  const p=points[i],q=points[(i+1)%points.length];area+=p[0]*q[1]-q[0]*p[1];
 }
 return area*.5;
}
function triangulate(points){
 // Ear-clipping triangulator for simple OSM building footprints.
 const n=points.length;
 if(n<3)return [];
 const order=Array.from({length:n},(_,i)=>i);
 if(signedArea(points)<0)order.reverse();
 const result=[];
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 function inside(p,a,b,c){
  const s1=cross(a,b,p),s2=cross(b,c,p),s3=cross(c,a,p);
  return s1>=-1e-6&&s2>=-1e-6&&s3>=-1e-6;
 }
 let guard=0;
 while(order.length>3 && guard++<400){
  let found=false;
  for(let k=0;k<order.length;k++){
   const i0=order[(k+order.length-1)%order.length],i1=order[k],i2=order[(k+1)%order.length];
   const a=points[i0],b=points[i1],c=points[i2];
   if(cross(a,b,c)<.0001)continue;
   let hasPoint=false;
   for(const test of order){
    if(test!==i0&&test!==i1&&test!==i2&&inside(points[test],a,b,c)){hasPoint=true;break;}
   }
   if(hasPoint)continue;
   result.push(i0,i1,i2);
   order.splice(k,1);found=true;break;
  }
  if(!found)break;
 }
 if(order.length===3)result.push(...order);
 // Fallback fan for pathological outlines, keeping other buildings functional.
 if(result.length===0)for(let i=1;i<n-1;i++)result.push(0,i,i+1);
 return result;
}
function buildBuilding(building,idx){
 const original=building.p;
 if(original.length<3)return;
 const p=signedArea(original)<0?original.slice().reverse():original;
 const centerX=p.reduce((s,q)=>s+q[0],0)/p.length,centerZ=p.reduce((s,q)=>s+q[1],0)/p.length;
 if(Math.hypot(centerX,centerZ)<65)return;
 const minX=Math.min(...p.map(q=>q[0])),maxX=Math.max(...p.map(q=>q[0]));
 const minZ=Math.min(...p.map(q=>q[1])),maxZ=Math.max(...p.map(q=>q[1]));
 const width=maxX-minX,depth=maxZ-minZ;
 if(width<1.6||depth<1.6||width*depth>9000)return;
 const h=building.height?clamp(building.height,2.8,22):2.7+Math.floor(rand(idx*3)*3)*2.55;
 const positions=[],indices=[],normals=[],uvs=[],edges=[];
 const offset=rand(idx+71)*8;
 // Separate vertices on each wall preserve sharp corners and meter-scaled UVs.
 for(let i=0;i<p.length;i++){
   const a=p[i],b=p[(i+1)%p.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
   if(len<.05)continue;
   const base=positions.length/3;
   positions.push(a[0],.13,a[1],a[0],h,a[1],b[0],.13,b[1],b[0],h,b[1]);
   indices.push(base,base+2,base+1,base+2,base+3,base+1);
   uvs.push(offset,0,offset,h/3,offset+len/3,0,offset+len/3,h/3);
   edges.push({a,b,len,x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,nx:dz/len,nz:-dx/len,angle:-Math.atan2(dz,dx)});
 }
 B.VertexData.ComputeNormals(positions,indices,normals);
 const vertex=new B.VertexData();
 vertex.positions=positions;vertex.indices=indices;vertex.normals=normals;vertex.uvs=uvs;
 const mesh=new B.Mesh('OSM building '+building.id,world.scene);vertex.applyToMesh(mesh);
 const palette=[mat('wall-cream',colors.cream,0,.86),mat('wall-stone',colors.stone,0,.88),
   mat('wall-tan',colors.wall,0,.87),mat('wall-pink',colors.pink,0,.86),mat('wall-mint',colors.mint,0,.88)];
 mesh.material=palette[Math.floor(rand(idx*3.2)*palette.length)];
 mesh.isPickable=false;mesh.receiveShadows=true;mesh.metadata={wasaShadow:true};mesh.freezeWorldMatrix();
 const roofData=new B.VertexData(),roofPositions=[],roofUVs=[],roofNormals=[];
 for(const point of p){roofPositions.push(point[0],h,point[1]);roofUVs.push(point[0]/3,point[1]/3);}
 const roofIndices=triangulate(p);B.VertexData.ComputeNormals(roofPositions,roofIndices,roofNormals);
 roofData.positions=roofPositions;roofData.indices=roofIndices;roofData.normals=roofNormals;roofData.uvs=roofUVs;
 const roof=new B.Mesh('footprint roof '+building.id,world.scene);roofData.applyToMesh(roof);
 roof.material=mat('roof',colors.roof,0,.87);roof.isPickable=false;roof.receiveShadows=true;
 roof.metadata={wasaShadow:true};roof.freezeWorldMatrix();
 world.colliders.push({minX:minX-1,maxX:maxX+1,minZ:minZ-1,maxZ:maxZ+1});
 if(width<35&&depth<35&&Math.hypot(centerX,centerZ)<800){
   for(const edge of edges){
     const parapet=meshBox('footprint parapet',edge.x,h+.24,edge.z,edge.len,.48,.18,mat('parapet-concrete','#C8BDA5',0,.87));
     parapet.rotation.y=edge.angle;parapet.isPickable=false;
   }
   // Choose the facade nearest a mapped road; fixtures follow its actual direction.
   const front=edges.filter(e=>e.len>5).sort((a,b)=>(roadAt(a.x,a.z)?.distance||999)-(roadAt(b.x,b.z)?.distance||999))[0];
   if(front){
     const count=Math.min(4,Math.floor(front.len/3)),levels=Math.max(1,Math.min(3,Math.floor(h/2.8)));
     const frameMat=mat('window-frame','#49483D',0,.82),glassMat=mat('window','#3D4544',0,.28);
     const fixture=(name,t,y,w,height,d,out,material)=>{
       const x=front.a[0]+(front.b[0]-front.a[0])*t+front.nx*out;
       const z=front.a[1]+(front.b[1]-front.a[1])*t+front.nz*out;
       const box=meshBox(name,x,y,z,w,height,d,material);box.rotation.y=front.angle;box.isPickable=false;return box;
     };
     for(let row=0;row<levels;row++)for(let col=0;col<count;col++){
       const t=(col+1)/(count+1),wy=1.85+row*2.8;
       if(wy+.55>h-.2)continue;
       fixture('window surround',t,wy,1.18,1.03,.14,.06,frameMat);
       fixture('window pane',t,wy,1.00,.85,.03,.15,glassMat);
       fixture('window vertical grille',t,wy,.035,.85,.025,.18,frameMat);
       fixture('window sill',t,wy-.53,1.28,.09,.30,.12,mat('sill','#B8AD95',0,.85));
     }
     fixture('compound entry door',.15,1.12,1.05,1.98,.08,.08,mat('entry-door','#555344',0,.85));
   }
 }
 world.buildingCount++;
}
function worldFloor(){
 const ground=B.MeshBuilder.CreateGround('region ground',{width:19000,height:19000,subdivisions:48},world.scene);
 ground.position.y=-.08;
 const soil=window.WasaRendering.applySurface(mat('warm dusty Damaturu ground','#B0A88A',0,.92),'soil');
 // Eight-meter repeats provide small grit; vertex colors supply broad variation.
 const uv=ground.getVerticesData(B.VertexBuffer.UVKind).map(v=>v*19000/8);
 ground.setVerticesData(B.VertexBuffer.UVKind,uv);
 const positions=ground.getVerticesData(B.VertexBuffer.PositionKind),vertexColors=[];
 for(let i=0;i<positions.length;i+=3){
   const x=positions[i],z=positions[i+2];
   const shade=.93+.055*Math.sin(x/240)*Math.cos(z/310)+.025*Math.sin((x+z)/73);
   vertexColors.push(shade,shade,shade*.97,1);
 }
 ground.setVerticesData(B.VertexBuffer.ColorKind,vertexColors);
 ground.material=soil;ground.isPickable=false;ground.receiveShadows=true;
 const horizon=B.MeshBuilder.CreateGround('distant terrain',{width:28000,height:28000},world.scene);
 horizon.position.y=-.16;horizon.material=mat('distant earth','#B0A88A',0,.95);horizon.isPickable=false;
}

function bridgeY(x){
 const ax=Math.abs(x);
 if(ax>=235)return .45;
 if(ax<=90)return 6.2;
 const t=(235-ax)/(235-90);
 return .45+t*t*(3-2*t)*(6.2-.45);
}
function createFlyover(){
 // NOT surveyed engineering geometry: an illustrative, higher-detail playable
 // depiction of the Damaturu flyover around The Cross.
 const deck=mat('flyover asphalt v3','#303D3E',.07,.94);
 const edge=mat('flyover concrete','#BEB9A9');
 const parapet=mat('flyover barrier concrete','#CEC8B7');
 const steel=mat('bridge metal rails','#597478',.34,.54);
 const concrete=mat('support reinforced concrete','#A5A99E');
 const base=mat('foundation blocks','#8E958B');
 const stripe=mat('road lane white','#D8D6CA');
 const yellow=mat('bridge centerline','#DFBC63');
 const under=mat('underpass dark asphalt','#364446');
 const planter=mat('drain channel','#737D71');
 const bright=mat('median reflective strips','#DAD8AA');
 const bridgeLength=530,n=50;
 // Deck level 6.2m at crest; curved approach gradients. No unrealistic solid concrete slab.
 for(let i=0;i<n;i++){
   const x1=-bridgeLength/2+i*bridgeLength/n,x2=-bridgeLength/2+(i+1)*bridgeLength/n;
   const y1=bridgeY(x1),y2=bridgeY(x2),x=(x1+x2)/2,y=(y1+y2)/2;
   const len=Math.hypot(x2-x1,y2-y1),tilt=Math.atan2(y2-y1,x2-x1);
   const road=meshBox('flyover raised road deck',x,y,.45,len,.35,15.2,deck);road.rotation.z=tilt;
   const girder=meshBox('continuous deck underside',x,y-.35,.45,len,.44,14.5,concrete);girder.rotation.z=tilt;
   road.receiveShadows=true;
   for(const side of [-1,1]){
     const z=side*7.62;
     const barrier=meshBox('cantilever safety parapet',x,y+.51,z,len,.79,.32,parapet);
     barrier.rotation.z=tilt;
     world.colliders.push({minX:x1,maxX:x2,minZ:z-.20,maxZ:z+.20,
       minY:Math.min(y1,y2)+.10,maxY:Math.max(y1,y2)+.92,hard:true,source:'flyover barrier'});
     const handrail=meshBox('flyover blue steel handrail',x,y+1.02,z,len,.14,.16,steel);
     handrail.rotation.z=tilt;
     const reflector=meshBox('outer reflective safety strip',x,y+.08,side*7.13,len,.045,.16,yellow);
     reflector.rotation.z=tilt;
   }
   // Directional lanes, edge markings and alternating dashed centre markings.
   for(const z of [-3.8,3.8]){
     const mark=meshBox('flyover inner road edge',x,y+.215,z,len*.96,.028,.11,stripe);mark.rotation.z=tilt;
   }
   if(i%3!==0){
     const mark=meshBox('flyover center dashed divider',x,y+.221,.45,len*.79,.02,.115,yellow);
     mark.rotation.z=tilt;
   }
   if(i%5===0){
      for(const side of [-1,1]){
       const panel=meshBox('small bridge reflectors',x,y+.56,side*7.85,.14,.20,.05,bright);
       panel.rotation.z=tilt;
      }
   }
 }
 // Short approach wedges join the deck's 0.625 m end surface to street level.
 for(const side of [-1,1]){
   const x1=side<0?-285:265,x2=x1+20,y1=side<0?.13:.625,y2=side<0?.625:.13;
   const tilt=Math.atan2(y2-y1,x2-x1);
   const ramp=meshBox('flyover approach ramp',(x1+x2)/2,(y1+y2)/2-.05/Math.cos(tilt),.45,Math.hypot(20,y2-y1),.10,15.2,deck);
   ramp.rotation.z=tilt;
 }
 // North-south traffic beneath the overpass. Generic traffic lanes.
 const passage=meshBox('north-south underpass',0,.11,0,17.1,.12,320,under);
 passage.receiveShadows=true;
 for(let z=-154;z<=154;z+=12){
    meshBox('underpass broken middle line',0,.182,z,.13,.017,5.2,stripe);
    for(const x of [-7.9,7.9])meshBox('underpass edge line',x,.184,z,.10,.02,11.8,stripe);
 }
 for(const x of [-10.1,10.1]){
   meshBox('underpass drainage channels',x,.10,0,.72,.12,310,planter);
   meshBox('underpass parapet retaining wall',x,.88,0,.44,1.4,148,edge);
   for(let z=-80;z<=80;z+=18)
     meshBox('underpass reflectors',x,1.13,z,.48,.13,4.5,steel);
 }
 // Pier pairs avoid the central crossing; wide abutments and crossbeams connect them.
 for(const x of [-82,-36,36,82]){
   for(const z of [-5.15,5.15]){
     const ground=.14,y=bridgeY(x);
     meshBox('bridge pier pad foundation',x,.30,z,2.5,.5,2.9,base);
     const pillar=meshCylinder('flyover reinforced pillar',x,Math.max(1.9,y/2),z,1.30,1.70,Math.max(3.9,y-.6),concrete,null,16);
     meshBox('concrete capital',x,y-.62,z,2.6,.40,2.8,edge);
     world.colliders.push({minX:x-1.2,maxX:x+1.2,minZ:z-1.35,maxZ:z+1.35,
       minY:0,maxY:y-.3,hard:true,source:'flyover pier'});
   }
   meshBox('cross-girder on pier pair',x,bridgeY(x)-.32,.45,2.1,.65,13.2,concrete);
 }
 for(const x of [-200,-140,-70,70,140,200]){
    const y=bridgeY(x);
    const post=meshCylinder('tall bridge light mast',x,y+4.05,-7.85,.10,.13,7.6,steel);
    meshBox('bridge light overhead arm',x+.53,y+7.82,-7.85,1.1,.13,.12,steel);
    sphere('bridge roadway luminaire',x+.95,y+7.75,-7.85,.21,.09,.16,bright);
 }
 // Turn-off and approach signs are stylized; no authoritative traffic plan claimed.
 const sign=makeSignTexture('DAMATURU','THE CROSS',512,170);
 meshBox('district arrival gantry',4.7,8.95,-9.15,10,.21,.26,concrete);
 meshBox('district overpass sign support',4.7,7.45,-9.1,.15,3,.18,steel);
 meshBox('THE CROSS flyover road sign',4.7,8.20,-9.3,9.1,1.65,.14,sign);
 world.interactions.push({x:-42,z:30,radius:24,name:'THE CROSS FLYOVER',message:'The Cross flyover. This structure is a game-art reconstruction, not an as-built survey.'});
}


function makeSignTexture(heading,subtitle,w=512,h=180){
 const t=new B.DynamicTexture('sign-'+heading,{width:w,height:h},world.scene,false);
 const ctx=t.getContext();
 ctx.fillStyle='#0e333b';ctx.fillRect(0,0,w,h);
 ctx.fillStyle='#d8b875';ctx.fillRect(0,0,10,h);
 ctx.font='bold 56px Arial';ctx.fillStyle='#f8f2d7';ctx.fillText(heading,32,78);
 ctx.font='bold 37px Arial';ctx.fillStyle='#a9e7c7';ctx.fillText(subtitle,32,135);
 t.update();
 const m=new B.StandardMaterial('sign text '+heading,world.scene);
 m.diffuseTexture=t;m.emissiveColor=new B.Color3(.25,.35,.29);m.backFaceCulling=false;
 return m;
}
function createRaceHub(){
 // Previously [-135,105] intersected the mapped primary road.
 // This relocation was checked against all local OSM road segments,
 // paved widths and OSM building footprints on 12 October 2026.
 const x=-160,z=75;
 // Avoid rebuilding the obstruction if the underlying street data changes.
 const clearance=[
   [x,z],[x-13,z-12],[x+13,z-12],[x-13,z+12],[x+13,z+12],
   [x,z-12],[x,z+12],[x-13,z],[x+13,z]
 ].every(([px,pz])=>{
   const road=roadAt(px,pz);
   return !road || road.distance>road.width/2+4;
 });
 if(!clearance){
   console.warn('[WASA WORLD] RACE HQ omitted: roadside site overlaps a mapped road');
   return;
 }
 const grass=mat('plaza','#59786E');
 meshBox('WASA arena arrival plaza',x,.19,z,23,.24,20,grass);
 const base=meshCylinder('WASA arena foundation',x,.42,z,12,13,.65,mat('arena platform','#CDB890'),null,32);
 meshBox('arena sample lobby',x,4.05,z,13,7.2,7.8,mat('arena structure','#285A5A'));
 meshBox('arena canopy',x,7.80,z,15,.35,10,mat('arena roof','#D5B274'));
 const sign=meshBox('arena logo',x,5.85,z-4.05,9,2.6,.13,makeSignTexture('WASA','RACE HQ',512,180));
 const accent=mat('reception window','#9FCECA',.03,.4);
 for (const dx of [-4,-2,0,2,4])meshBox('arena glass',x+dx,2.5,z-4.01,1.4,1.9,.1,accent);
 world.colliders.push({minX:x-7,maxX:x+7,minZ:z-4,maxZ:z+4,
   source:'race_hq',hard:true});
 world.interactions.push({x:x+13,z:z-7,radius:18,name:'WASA RACE HQ',message:'Welcome to WASA Race HQ. Racing, spectator mode and tournaments unlock in later development phases.'});
}
function tree(x,z,idx){
 const trunk=mat('tree trunk','#5A4E3D',0,.88);
 const isNeem=rand(idx*1.7)>.4;
 const isBaobab=!isNeem && rand(idx*2.3)>.7;
 if(isBaobab){
  // Baobab: thick trunk, sparse crown.
  meshCylinder('baobab-trunk',x,3.2,z,.8,2.4,2.5,trunk,null,8);
  meshCylinder('baobab-upper',x,5.8,z,.4,.9,1.2,trunk,null,7);
  const leafMat=mat('baobab-leaves','#5B7B4A',0,.82);
  // Cross-billboard canopy for realistic volume.
  for(let j=0;j<3;j++){
    const angle=j*Math.PI/3;
    const canopy=B.MeshBuilder.CreatePlane('baobab-canopy-'+j,{width:7,height:5},world.scene);
    canopy.position.set(x+Math.sin(angle)*.3,7.5,z+Math.cos(angle)*.3);
    canopy.rotation.y=angle;
    canopy.material=leafMat; canopy.isPickable=false;
  }
 }else{
  // Neem tree: slender trunk, leafy crown.
  const trunkH=isNeem?4.5:3.5;
  meshCylinder('tree-trunk',x,trunkH/2,z,.22,.42,trunkH,trunk,null,8);
  const leafMat=mat('neem-leaves',isNeem?'#3D6B45':'#4A7850',0,.78);
  // Cross-billboard canopy layers for natural shape.
  const crownY=trunkH+1.5, crownR=isNeem?2.2:1.8;
  for(let j=0;j<2;j++){
    const canopy=B.MeshBuilder.CreatePlane('tree-canopy-'+j,{width:crownR*2.2,height:crownR*1.8},world.scene);
    canopy.position.set(x+Math.sin(idx+j)*.3,crownY+j*.4,z+Math.cos(idx+j)*.3);
    canopy.rotation.y=j*Math.PI/2+idx*.3;
    canopy.material=leafMat; canopy.isPickable=false;
  }
  // Top sphere for fullness.
  sphere('leaf-crown',x,crownY+.6,z,crownR*.9,crownR*.7,crownR*.85,leafMat);
 }
}
function grassClump(x,z,seed){
 const grassMat=mat('dry-grass','#9B9860',0,.90);
 for(let i=0;i<3;i++){
   const blade=B.MeshBuilder.CreatePlane('grass-blade',{width:.25+rand(seed+i)*.15,height:.4+rand(seed+i*2)*.3},world.scene);
   blade.position.set(x+rand(seed+i*3)*.6-.3,.25,z+rand(seed+i*4)*.6-.3);
   blade.rotation.y=rand(seed+i*5)*Math.PI;
   blade.rotation.x=-.1-.05*rand(seed+i*6);
   blade.material=grassMat; blade.isPickable=false;
 }
}
function scenery(){
 // Trees are game dressing, not mapped real trees. Do not use them as geographic claims.
 let treeCount=0;
 for(let i=0;i<140;i++){
  const x=(rand(i+21)-.5)*1200,z=(rand(i+307)-.5)*1200;
  if(dist(x,z,0,0)<85||dist(x,z,-135,105)<22)continue;
  if(world.colliders.some(b=>x>b.minX-5&&x<b.maxX+5&&z>b.minZ-5&&z<b.maxZ+5))continue;
  if(treeCount++>55)break;
  tree(x,z,i);
 }
 // Scattered dry grass clumps for Sahel atmosphere.
 for(let i=0;i<200;i++){
  const x=(rand(i*1.37+101)-.5)*900,z=(rand(i*2.51+203)-.5)*900;
  if(dist(x,z,0,0)<70)continue;
  if(world.colliders.some(b=>x>b.minX-2&&x<b.maxX+2&&z>b.minZ-2&&z<b.maxZ+2))continue;
  grassClump(x,z,i*7+333);
 }
}
 function createStreetscape(){
 // These fictional, temporary façades are scenery infill only, NOT OSM building locations.
 // Map file and credits remain explicit about what is verified geographical data.
 const wallMats=[
  mat('shop sandstone','#C9AC80'),
  mat('shop clay','#B68B6D'),
  mat('shop ivory','#D9C8A8'),
  mat('shop pale green','#91A88D'),
  mat('shop silver','#BDBBA1')
 ];
 const shade=mat('awnings','#507E76');
 const awning=mat('awnings gold','#CBA56C');
 const window=mat('shop windows','#3C6770',.2,.35);
 const roadClearance=10;
 let count=0;
 function isFree(x,z,w,d){
  if(dist(x,z,0,0)<65 || dist(x,z,-135,105)<28)return false;
  if(x>-72 && x<86 && z>17 && z<88)return false; // preserve player sightline
  return !world.colliders.some(b=>x+w/2>b.minX-3&&x-w/2<b.maxX+3&&z+d/2>b.minZ-3&&z-d/2<b.maxZ+3);
 }
 function storefront(x,z,index){
  const w=14+Math.floor(rand(index+29)*4)*1.8,d=11+Math.floor(rand(index+39)*4)*1.6;
  if(!isFree(x,z,w,d))return;
  const h=4.2+Math.floor(rand(index+47)*3)*2.1;
  const m=wallMats[index%wallMats.length];
  meshBox('concept town building',x,h/2+.10,z,w,h,d,m);
  meshBox('flat concept roof',x,h+.25,z,w+.45,.35,d+.55,mat('flat rooftops','#977A5F'));
  // Main doorway, awning, and repeating shopfront panels.
  meshBox('shop entrance',x,1.24,z-d/2-.07,2.6,2.35,.13,mat('shop doors','#31565C',.15,.58));
  meshBox('shop front awning',x,2.95,z-d/2-1.12,w*.83,.18,2.2,index%2?shade:awning);
  for(const sx of [-1,1]){
   meshBox('shopfront window',x+sx*w*.28,1.85,z-d/2-.09,1.55,1.3,.08,window);
   meshBox('shopfront trim',x+sx*w*.28,1.12,z-d/2-.17,1.67,.10,.1,awning);
  }
  if(h>6.0){
   for(const sx of [-1,1]){
    meshBox('upper windows',x+sx*w*.26,h-2,z-d/2-.08,1.65,1.26,.07,window);
   }
  }
  world.colliders.push({minX:x-w/2-.5,maxX:x+w/2+.5,minZ:z-d/2-.5,maxZ:z+d/2+.5});
  count++;
 }
 // Along the mapped east/west Kano-Maiduguri corridor, leaving the bridge and clear sightlines free.
 let n=0;
 for(const side of [-1,1]){
  for(const x of [-330,-298,-266,-234,-202,-170,-138,-106,-74,74,106,138,170,202,234,266,298,330]){
   const z=side*(36+rand(n+19)*11);
   storefront(x,z,n++);
  }
 }
 // North/south neighborhoods along the other main road.
 for(const side of [-1,1])for(const z of [-290,-255,-220,-185,-150,-115,-80,85,120,155,190,225,260]){
  storefront(side*(47+rand(n+7)*12),z,n++);
 }
 world.prototypeBuildings=count;
 // A named, fictional transport kiosk points players toward the game arena.
 meshBox('WASA concept bus stand',-67,1.9,104,8,3.7,4.2,mat('bus kiosk','#BFA379'));
 meshBox('WASA kiosk awning',-67,4.0,104,10,.3,5.5,shade);
 world.colliders.push({minX:-71.4,maxX:-62.6,minZ:101.4,maxZ:106.6});
}
/* WASA World 03 district-scape: illustrative modular commercial blocks,
 * mixed-use frontage on secondary roads and gated compounds on local streets.
 * OSM provides street coordinates. Shop and house facades are generated game art.
 */
/* WASA World 03 district-scape: illustrative modular commercial blocks,
 * mixed-use frontage on secondary roads and gated compounds on local streets.
 * OSM provides street coordinates. Shop and house facades are generated game art.
 */
function createStreetDistricts(map){
 const facade=['#D7BC9B','#D2B69B','#E2D3B7','#CDA07F','#ABB6A0','#BCB09C'].map((c,i)=>mat('world03 brick'+i,c));
 const roofing=['#8B7968','#777F75','#A1856A'].map((c,i)=>mat('world03 roof'+i,c));
 const awnings=['#447B76','#986651','#B18A60','#516B8D'].map((c,i)=>mat('world03 canopy'+i,c));
 const white=mat('world03 trims','#E7D7B5');
 const steel=mat('world03 shutters','#546B6E');
 const windows=mat('world03 windows','#496F75',.13,.5);
 const gate=mat('world03 gate','#62625E');
 const fence=mat('world03 compound wall','#BFA988');
 const tank=mat('world03 water tanks','#394A4D',.13,.4);
 const dark=mat('world03 sign ink','#2A3535');
 const signText=['PROVISION','PHARMACY','GSM & TECH','TAILOR','TRADERS','RESTAURANT','MINI MART','BANK SERVICES'];
 const signMats=signText.map(name=>{
   const tex=new B.DynamicTexture('frontage sign '+name,{width:384,height:82},world.scene,false),cx=tex.getContext();
   cx.fillStyle='#274F4F';cx.fillRect(0,0,384,82);cx.fillStyle='#E8D6AC';
   cx.font='bold 34px Arial';cx.textAlign='center';cx.textBaseline='middle';
   cx.fillText(name,192,41);tex.update();
   const m=new B.StandardMaterial('shared sign '+name,world.scene);
   m.diffuseTexture=tex;m.emissiveColor=new B.Color3(.09,.12,.11);m.backFaceCulling=false;
   return m;
 });
 const widths={trunk:14,trunk_link:8,primary:10,primary_link:8,secondary:9,
 tertiary:7,residential:5.8,unclassified:6,service:4.3,living_street:4.4};
 const majors=[],locals=[];
 for(const road of map.roads){
   if(!(road.type in widths))continue;
   const commercial=['trunk','primary','secondary','trunk_link','primary_link'].includes(road.type);
   const mixed=['tertiary','unclassified'].includes(road.type);
   for(const a of road.p.slice(0,-1).map((v,i)=>({v,i}))){
     const from=a.v,to=road.p[a.i+1],dx=to[0]-from[0],dz=to[1]-from[1],len=Math.hypot(dx,dz);
     if(len<8)continue;
     const cx=(from[0]+to[0])/2,cz=(from[1]+to[1])/2;
     // Major historical city and YSU corridor; generated scenery caps protect mobile budgets.
     const inCenter=Math.hypot(cx,cz)<1800;
     const onCampusCorridor=cz>2200&&cz<7500&&Math.abs(cx)<2500;
     if(!inCenter&&!onCampusCorridor)continue;
     const seg={a:from,b:to,len,dx:dx/len,dz:dz/len,w:widths[road.type],type:road.type,mixed,
       radius:Math.hypot(cx,cz),commercial};
     (commercial||mixed?majors:locals).push(seg);
   }
 }
 const collide=world.colliders;
 // Road clearance uses local network, including parallel roads and intersections.
 const cell=95,grid=new Map();
 function registerRoad(r){
  let minX=Math.floor((Math.min(r.a[0],r.b[0])-32)/cell);
  let maxX=Math.floor((Math.max(r.a[0],r.b[0])+32)/cell);
  let minZ=Math.floor((Math.min(r.a[1],r.b[1])-32)/cell);
  let maxZ=Math.floor((Math.max(r.a[1],r.b[1])+32)/cell);
  for(let i=minX;i<=maxX;i++)for(let j=minZ;j<=maxZ;j++){
   const k=i+','+j;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(r);
  }
 }
 for(const r of [...majors,...locals])registerRoad(r);
 function clearance(x,z){
  const cx=Math.floor(x/cell),cz=Math.floor(z/cell);let near=Infinity;
  for(let i=cx-1;i<=cx+1;i++)for(let j=cz-1;j<=cz+1;j++){
   for(const r of grid.get(i+','+j)||[]){
    const dx=r.b[0]-r.a[0],dz=r.b[1]-r.a[1];
    const t=clamp(((x-r.a[0])*dx+(z-r.a[1])*dz)/(dx*dx+dz*dz),0,1);
    near=Math.min(near,Math.hypot(x-r.a[0]-dx*t,z-r.a[1]-dz*t)-r.w/2);
   }
  }
  return near;
 }
 function free(x,z,w,d,radius=0){
   if(Math.hypot(x,z)<86||Math.hypot(x+135,z-105)<39)return false;
   if(Math.abs(x)>3830||z<-2600||z>8250)return false;
   const bound=Math.max(w,d)*.73+1;
   if(clearance(x,z)<Math.min(7,Math.max(3.8,bound*.5)))return false;
   return !collide.some(c=>x+w/2+radius>c.minX&&x-w/2-radius<c.maxX&&
                           z+d/2+radius>c.minZ&&z-d/2-radius<c.maxZ);
 }
 const stats={shopRows:0,shopUnits:0,residential:0,streetlights:0,stations:0,
   rejectedOnRoad:0,repositioned:0};
 // A complete collision check uses each road segment and the ORIENTED
 // building footprint. Checking just the object's centre was allowing
 // long connected shop rows to block crossroads.
 const roadIndex=world.roadIndex;
 world.placementAudit=[];
 function intersectsExpandedRoadBox(x,z,angle,width,depth,extraFront=0,buffer=1.5){
   if(!roadIndex)return false;
   const cos=Math.cos(angle),sin=Math.sin(angle);
   const front=Math.max(0,extraFront);
   const extent=Math.hypot(width/2+2,depth/2+front+2)+18;
   const fromX=Math.floor((x-extent)/roadIndex.cell),
     toX=Math.floor((x+extent)/roadIndex.cell),
     fromZ=Math.floor((z-extent)/roadIndex.cell),
     toZ=Math.floor((z+extent)/roadIndex.cell);
   const seen=new Set();
   for(let gx=fromX;gx<=toX;gx++)for(let gz=fromZ;gz<=toZ;gz++){
     for(const seg of roadIndex.grid.get(gx+','+gz)||[]){
       if(seen.has(seg))continue;seen.add(seg);
       // Transform into the oriented local coordinate space of the facade.
       const dx=seg.x-x,dz=seg.z-z;
       const ax=cos*dx-sin*dz,az=sin*dx+cos*dz;
       const bx=cos*(dx+seg.dx)-sin*(dz+seg.dz),
             bz=sin*(dx+seg.dx)+cos*(dz+seg.dz);
       const padding=seg.width/2+buffer;
       const xmin=-width/2-padding,xmax=width/2+padding;
       const zmin=-depth/2-front-padding,zmax=depth/2+padding;
       // Segment intersects expanded (rotated) rectangle: Liang-Barsky.
       let enter=0,exit=1,possible=true;
       const vx=bx-ax,vz=bz-az;
       for(const [a,b] of [[-vx,ax-xmin],[vx,xmax-ax],[-vz,az-zmin],[vz,zmax-az]]){
         if(Math.abs(a)<1e-9){if(b<0){possible=false;break;}}
         else{
           const t=b/a;
           if(a<0)enter=Math.max(enter,t);
           else exit=Math.min(exit,t);
           if(enter>exit){possible=false;break;}
         }
       }
       if(possible)return true;
     }
   }
   return false;
 }
 function recordPlacement(category,x,z,angle,width,depth,front=0){
   world.placementAudit.push({category,x,z,angle,width,depth,front});
 }

 const rowBudget=205,houseBudget=215;
 function groupAt(name,x,z,angle){
   const g=new B.TransformNode(name,world.scene);g.position.set(x,0,z);g.rotation.y=angle;
   const pieces=[];
   const add=(name,px,py,pz,w,h,d,m)=>{
     const o=meshBox(name,px,py,pz,w,h,d,m,g);pieces.push(o);return o;
   };
   const finish=()=>{
     g.computeWorldMatrix(true);
     // Transform world positions before detaching from parent to preserve orientation.
     for(const mesh of pieces)mesh.setParent(null);
     g.dispose();
   };
   return {add,finish};
 }
 function addColl(x,z,w,d,margin=1){
   collide.push({minX:x-w/2-margin,maxX:x+w/2+margin,minZ:z-d/2-margin,maxZ:z+d/2+margin});
 }
 function shopRow(r,x,z,angle,seed){
   const units=3+Math.floor(rand(seed*1.3)*4),unit=5.1+rand(seed*4.7)*1.0;
   const length=units*unit,depth=10.8+rand(seed*1.71)*3,storeys=rand(seed*7.8)>.72?2:1;
   const h=storeys===2?7.6:3.9;
   const ext=length*.71+depth*.71;
   if(!free(x,z,ext*2,ext*2))return false;
   if(intersectsExpandedRoadBox(x,z,angle,length,depth,1.9)){
      stats.rejectedOnRoad++;return false;
   }
   const {add,finish}=groupAt('connected shop row '+seed,x,z,angle);
   const wall=facade[Math.floor(rand(seed*1.19)*facade.length)];
   const shade=awnings[Math.floor(rand(seed*3.9)*awnings.length)];
   add('connected-commercial-row',0,h/2+.12,0,length,h,depth,wall);
   add('continuous roofline',0,h+.22,0,length+.4,.28,depth+.36,roofing[Math.floor(rand(seed*9.3)*3)]);
   add('long continuous veranda canopy',0,2.9,-depth/2-.76,length+.35,.17,1.7,shade);
   for(let i=0;i<units;i++){
     const sx=-length/2+(i+.5)*unit;
     add('retail rolling shutter',sx,1.44,-depth/2-.073,unit-.54,2.62,.085,steel);
     add('shop header board',sx,3.20,-depth/2-.102,unit-.50,.49,.08,signMats[(seed+i)%signMats.length]);
     if(i<units-1)add('shared shop pillar',sx+unit/2,1.55,-depth/2-.22,.22,2.9,.23,white);
     if(storeys===2){
       add('upper shop window',sx,5.37,-depth/2-.08,unit*.48,1.36,.08,windows);
       add('upper window lintel',sx,6.21,-depth/2-.42,unit*.6,.13,.80,shade);
     }
   }
   if(seed%5===0){
     add('water tank base',length*.23,h+.57,depth*.11,1.8,.29,1.9,white);
     add('roof water tank',length*.23,h+1.14,depth*.11,1.15,.92,1.1,tank);
   }
   finish();addColl(x,z,ext*2,ext*2,.7);
   recordPlacement('shops',x,z,angle,length,depth,1.9);
   stats.shopRows++;stats.shopUnits+=units;
   if(!world.frontageSample)world.frontageSample=[];
   if(world.frontageSample.length<320)world.frontageSample.push({x:Math.round(x),z:Math.round(z),units});
   return true;
 }
 function compound(r,x,z,angle,seed){
   const w=14+Math.floor(rand(seed*3.4)*7),depth=13+Math.floor(rand(seed*4.6)*7);
   const ext=w*.71+depth*.71;
   if(!free(x,z,ext*2,ext*2))return false;
   if(intersectsExpandedRoadBox(x,z,angle,w,depth,1)){
      stats.rejectedOnRoad++;return false;
   }
   const {add,finish}=groupAt('residential gated compound '+seed,x,z,angle);
   const h=3.45+(rand(seed*2.13)>.75?2.85:0);
   add('residential bungalow',0,h/2+.12,1.8,w*.72,h,depth*.65,facade[Math.floor(rand(seed*1.4)*facade.length)]);
   add('residential roof',0,h+.32,1.8,w*.77,.30,depth*.70,roofing[Math.floor(rand(seed*2.17)*3)]);
   for(const side of [-1,1])add('compound wall side',side*w*.49,1.23,0,.25,2.4,depth,fence);
   add('compound rear wall',0,1.23,depth*.48,w,2.4,.27,fence);
   add('compound front boundary left',-w*.355,1.12,-depth*.48,w*.29,2.2,.28,fence);
   add('compound front boundary right',w*.355,1.12,-depth*.48,w*.29,2.2,.28,fence);
   add('compound steel gate',0,1.19,-depth*.49,w*.38,2.32,.20,gate);
   add('front home door',0,1.25,1.8-depth*.325-.1,1.15,2.2,.12,gate);
   for(const side of [-1,1])add('home window',side*w*.19,1.92,1.8-depth*.325-.12,1.30,1.15,.1,windows);
   if(seed%3===0){
    add('courtyard water tank',w*.31,h+.70,2,1.15,1.02,1.0,tank);
   }
   finish();addColl(x,z,ext*2,ext*2,.3);
   recordPlacement('house',x,z,angle,w,depth,1);
   stats.residential++;return true;
 }
 // Two generic, clearly illustrative filling-station forecourts. These are not
 // verified commercial addresses or branded fuel stations.
 const selectedStationRoads=majors.filter(r=>r.commercial&&r.radius>320&&r.radius<1350&&r.len>23);
 for(let i=0;i<selectedStationRoads.length&&stats.stations<2;i+=3){
   const r=selectedStationRoads[i],seed=i*19+89,side=i%2?1:-1;
   const nx=-r.dz,nz=r.dx,off=r.w/2+14;
   const x=(r.a[0]+r.b[0])/2+nx*off*side,z=(r.a[1]+r.b[1])/2+nz*off*side;
   if(!free(x,z,32,31))continue;
   const yaw=Math.atan2(-r.dz,r.dx)+(side<0?Math.PI:0);
   if(intersectsExpandedRoadBox(x,z,yaw,23,20,2)){
     stats.rejectedOnRoad++;continue;
   }
   const {add,finish}=groupAt('unbranded game fuel station',x,z,yaw);
   add('fuel station forecourt',0,.17,0,21,.17,18,facade[1]);
   add('filling station canopy',0,4.45,-3.0,20,.40,10,awnings[0]);
   for(const sx of [-8,8])for(const zz of [-6,0]){
     add('fuel canopy support',sx,2.33,zz,.45,4.4,.45,white);
   }
   add('station convenience shop',0,1.7,6.0,12,3.3,5,facade[2]);
   for(const sx of [-4,4]){
     add('fuel pump housing',sx,1.04,-3,1.3,2.0,.95,steel);
     add('fuel pump face',sx,1.31,-3.52,.75,.65,.055,windows);
   }
   finish();addColl(x,z,36,34,.9);
   recordPlacement('fuel',x,z,yaw,23,20,2);
   stats.stations++;
 }

 // Commercial frontage has rows positioned beside each main road without arbitrary gaps.
 // Iterate deterministically over roadside tiles at approximately 34m intervals.
 majors.sort((a,b)=>a.radius-b.radius);
 for(let i=0;i<majors.length&&stats.shopRows<rowBudget;i++){
  const r=majors[i];
  if(r.radius<2100&&stats.shopRows>=134)continue;
  if(r.len<20)continue;
  const mid=(r.radius>1000?0.45:0.5);
  const dx=r.dx,dz=r.dz,nx=-dz,nz=dx;
  const candidates=Math.min(4,Math.max(1,Math.floor(r.len/33)));
  for(let k=0;k<candidates&&stats.shopRows<rowBudget;k++){
    const t=(k+.5)/candidates;
    for(const side of [-1,1]){
     const seed=i*17+k*3+(side+1)*57;
     if(r.mixed&&rand(seed*3.3)>.40)continue;
     if(stats.shopRows>155&&r.radius>2100&&rand(seed*2.33)>.72)continue;
     const angle=Math.atan2(-dz,dx)+(side<0?Math.PI:0);
     let placed=false;
     for(const extra of [0,4,9,15]){
       const off=r.w/2+9.5+extra;
       const x=r.a[0]+(r.b[0]-r.a[0])*t+nx*off*side;
       const z=r.a[1]+(r.b[1]-r.a[1])*t+nz*off*side;
       if(shopRow(r,x,z,angle,seed)){
         if(extra)stats.repositioned++;
         placed=true;break;
       }
     }
    }
  }
 }
 locals.sort((a,b)=>a.radius-b.radius);
 for(let i=0;i<locals.length&&stats.residential<houseBudget;i++){
  const r=locals[i];if(r.len<18)continue;
  if(r.radius<2100&&stats.residential>=132)continue;
  const segments=Math.min(3,Math.max(1,Math.floor(r.len/32)));
  for(let j=0;j<segments&&stats.residential<houseBudget;j++){
    const t=(j+.52)/segments;
    const side=rand(i*5+j*3)>.5?1:-1,nx=-r.dz,nz=r.dx;
    const angle=Math.atan2(-r.dz,r.dx)+(side<0?Math.PI:0);
    for(const extra of [0,4,9,14]){
      const off=r.w/2+14+extra;
      const x=r.a[0]+(r.b[0]-r.a[0])*t+nx*off*side;
      const z=r.a[1]+(r.b[1]-r.a[1])*t+nz*off*side;
      if(compound(r,x,z,angle,i*31+j)){
        if(extra)stats.repositioned++;
        break;
      }
    }
  }
 }
 // Roadside lampposts and notional petrol stations are visibly generic game scenery.
 const nearMajors=majors.filter(r=>r.radius<1550&&r.len>12);
 for(let i=0;i<nearMajors.length&&stats.streetlights<100;i+=8){
  const r=nearMajors[i],nx=-r.dz,nz=r.dx;
  const x=(r.a[0]+r.b[0])/2+nx*(r.w/2+3.4),z=(r.a[1]+r.b[1])/2+nz*(r.w/2+3.4);
  if(clearance(x,z)<1.4)continue;
  meshCylinder('main road lighting mast',x,3.2,z,.11,.14,6.3,dark);
  meshBox('streetlamp cap',x,6.4,z,1.35,.13,.21,white);
  stats.streetlights++;
 }
 world.districtCount=stats.shopRows+stats.residential;
 world.districtStats=stats;
 console.info('[WASA WORLD03] Urban generator',JSON.stringify(stats));
}


function scenery(){
 // Trees are game dressing, not mapped real trees. Do not use them as geographic claims.
 let count=0;
 for(let i=0;i<90;i++){
  const x=(rand(i+21)-.5)*950,z=(rand(i+307)-.5)*960;
  if(dist(x,z,0,0)<85||dist(x,z,-135,105)<22)continue;
  if(world.colliders.some(b=>x>b.minX-5&&x<b.maxX+5&&z>b.minZ-5&&z<b.maxZ+5))continue;
  if(count++>35)break;
  tree(x,z,i);
 }
}
function optimizeStaticMeshes(){
 const oldCount=world.scene.meshes.length,groups=new Map();
 const meshes=world.scene.meshes.slice();
 for(const mesh of meshes){
   if(!(mesh instanceof B.Mesh)||!mesh.material||mesh.parent||!mesh.getTotalVertices())continue;
   const c=mesh.getBoundingInfo().boundingBox.centerWorld;
   const sector=Math.floor(c.x/210)+','+Math.floor(c.z/210);
   const key=mesh.material.uniqueId+':'+sector+':'+!!mesh.metadata?.wasaShadow+':'+mesh.receiveShadows;
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(mesh);
 }
 let done=0;
 for(const list of groups.values()){
   // Groups are sector-limited to retain meaningful distance culling.
   for(let i=0;i<list.length;i+=70){
     const batch=list.slice(i,i+70);
     if(batch.length<2)continue;
     try {
       const receives=batch.some(m=>m.receiveShadows),casts=batch.some(m=>m.metadata?.wasaShadow);
       const merged=B.Mesh.MergeMeshes(batch,true,true);
       if(merged){merged.isPickable=false;merged.receiveShadows=receives;merged.metadata={wasaShadow:casts};merged.freezeWorldMatrix();done+=batch.length-1;}
     }catch(error){console.warn('[WASA WORLD] Safe mesh batch skipped',error.message);}
   }
 }
 console.info('[WASA WORLD] Static meshes reduced',oldCount,'to',world.scene.meshes.length);
 return done;
}
function prepareSceneryCulling(){
 world.sceneryCulling=[];
 for(const mesh of world.scene.meshes){
   if(!(mesh instanceof B.Mesh)||!mesh.material||!mesh.getTotalVertices()||mesh.parent)continue;
   const bounds=mesh.getBoundingInfo().boundingBox;
   const mx=bounds.maximumWorld.x-bounds.minimumWorld.x;
   const mz=bounds.maximumWorld.z-bounds.minimumWorld.z;
   // Regional ground, road network and campus boundary use massive spans:
   // don't disable them according to one misleading mesh center.
   if(mx>280||mz>280)continue;
   world.sceneryCulling.push({mesh,x:bounds.centerWorld.x,z:bounds.centerWorld.z,
     size:Math.max(mx,mz)*.71});
 }
 world.cullingLast=null;
 console.info('[WASA WORLD] prepared static scenery culling:',world.sceneryCulling.length);
}
function updateSceneryCulling(force=false){
 if(!world.sceneryCulling)return;
 const px=world.playerPos.x,pz=world.playerPos.z;
 const last=world.cullingLast;
 if(!force&&last&&Math.hypot(px-last[0],pz-last[1])<13)return;
 const radius=world.graphics?.distance||740;
 for(const item of world.sceneryCulling){
   const inside=Math.abs(item.x-px)<radius+item.size&&Math.abs(item.z-pz)<radius+item.size;
   if(item.mesh.isEnabled()!==inside)item.mesh.setEnabled(inside);
 }
 world.cullingLast=[px,pz];
}
function createWayfindingBeacon(){
 const B=window.BABYLON;
 const x=-42,z=30;
 const gold=mat('checkpoint-gold','#FFCE75',.12,.35);
 const ring=B.MeshBuilder.CreateTorus('viewpoint arrival ring',{diameter:4.4,thickness:.22,tessellation:36},world.scene);
 ring.position.set(x,.37,z);ring.material=gold;
 const beacon=B.MeshBuilder.CreateCylinder('viewpoint marker',{height:4,diameterTop:.05,diameterBottom:.42,tessellation:18},world.scene);
 beacon.position.set(x,2.3,z);
 const m=new B.StandardMaterial('checkpoint highlight',world.scene);
 m.diffuseColor=new B.Color3(.95,.7,.28);m.emissiveColor=new B.Color3(.38,.30,.12);m.alpha=.55;
 beacon.material=m;
 sphere('checkpoint orb',x,4.15,z,.55,.55,.55,gold);
}
/* WASA mapped landmarks / destination support, version 3.
 * OSM-backed pins are exact map geometries (entrances may differ).
 * User-mentioned but unlocated businesses are directory entries, NOT map pins.
 */
/* Yobe State University district concept assets.
 * Campus polygon is grounded in OSM way 845940671; sample campus buildings
 * below are explicitly NOT surveyed structures and have fictional placement.
 */
/* Yobe State University district concept assets.
 * Campus polygon is grounded in OSM way 845940671; sample campus buildings
 * below are explicitly NOT surveyed structures and have fictional placement.
 */
function createUniversityDistrict(map){
 const shape=map.campusOutline;
 if(!Array.isArray(shape)||shape.length<3)return;
 // Official campus outline from OpenStreetMap; not an architectural survey.
 const boundary=mat('YSU boundary tone','#57746F',.04,.7);
 const outline=[];
 for(let i=1;i<shape.length;i++){
   const a=shape[i-1],b=shape[i];
   const len=Math.hypot(a[0]-b[0],a[1]-b[1]);
   if(len<1||len>1000)continue;
   outline.push([a[0],a[1],b[0],b[1]]);
 }
 lineMesh('OpenStreetMap YSU campus boundary',outline,.9,boundary,.155);
 function within(x,z){
   let inside=false;
   for(let i=0,j=shape.length-1;i<shape.length;j=i++){
      const a=shape[i],b=shape[j];
      if((a[1]>z)!==(b[1]>z) && x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1]+1e-8)+a[0])inside=!inside;
   }
   return inside;
 }
 function nearRoad(x,z){
   let nearest=Infinity;
   for(const r of map.roads){
     for(let i=1;i<r.p.length;i++){
       const a=r.p[i-1],b=r.p[i],cx=(a[0]+b[0])/2,cz=(a[1]+b[1])/2;
       if(Math.hypot(cx-x,cz-z)>220)continue;
       const dx=b[0]-a[0],dz=b[1]-a[1];
       const t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz+1e-8),0,1);
       nearest=Math.min(nearest,Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t));
     }
   }
   return nearest;
 }
 const wall=mat('campus building limestone','#C6B7A4');
 const glass=mat('campus windows','#47757B',.09,.5);
 const trim=mat('campus entry edge','#C6D5CC');
 const roof=mat('campus roof','#7E8E87');
 const green=mat('campus garden','#718B67');
 let erected=0;
 const center=map.campus.p;
 const candidates=[
   [75,-80],[-80,20],[112,48],
   [-135,-185],[115,-210],[-185,180],[165,150],[-260,0],[225,340],
   [-130,355],[110,485],[-240,515],[300,-225],[230,-440],[5,680]
 ];
 for(let i=0;i<candidates.length&&erected<7;i++){
   const [dx,dz]=candidates[i];
   const x=center[0]+dx,z=center[1]+dz;
   if(!within(x,z)||nearRoad(x,z)<40)continue;
   if(world.colliders.some(c=>x+22>c.minX&&x-22<c.maxX&&z+18>c.minZ&&z-18<c.maxZ))continue;
   const storeys=i%3===0?2:1,h=storeys===2?7.2:4.2;
   meshBox('illustrative YSU district academic block',x,h/2+.1,z,36,h,21,wall);
   meshBox('illustrative YSU roof',x,h+.24,z,37,.30,22,roof);
   for(const side of [-1,1])for(let j=0;j<4;j++){
     const xx=x-12+j*7.5;
     meshBox('illustrative campus window',xx,2.1,z+side*10.58,3,1.40,.09,glass);
     if(storeys===2)meshBox('illustrative upper campus window',xx,5.34,z+side*10.58,3,1.3,.09,glass);
   }
   meshBox('academic hall entrance',x,1.26,z-10.72,2.3,2.44,.10,glass);
   meshBox('hall entry cover',x,3,z-12.10,7,.18,3.4,trim);
   world.colliders.push({minX:x-19,maxX:x+19,minZ:z-12,maxZ:z+12});
   erected++;
 }
 world.universityArtBlocks=erected;
 // Concept sign is near the end of the mapped approach street, not a real gate position.
 const route=map.verifiedRoute?.p||[];
 if(route.length){
   const last=route[route.length-1],x=last[0]+15,z=last[1]+17;
   const sign=makeSignTexture('YSU','CAMPUS AREA',512,180);
   meshBox('university-area sign',x,4.8,z,9.8,1.95,.24,sign);
   for(const a of [-4.1,4.1])
     meshCylinder('university district sign support',x+a,2.4,z,.22,.25,4.7,roof);
 }
}


function buildLandmarks(map){
 const expected=[
  {name:'Golden Souk',kind:'shopping',verifiedOSM:false,locationStatus:'Exact point not verified'},
  {name:'Eldawoud',kind:'shopping',verifiedOSM:false,locationStatus:'Exact point not verified'},
  {name:'Commercial banks',kind:'bank',verifiedOSM:false,locationStatus:'Bank branches require surveyed pins'},
  {name:'Government ministries',kind:'government',verifiedOSM:false,locationStatus:'Ministry buildings require mapped pins'},
  {name:'Filling stations',kind:'fuel',verifiedOSM:false,locationStatus:'Individual station positions require mapping'}
 ];
 const mapped=[...(map.pois||[])];
 if(map.campus&&!mapped.some(x=>x.id===map.campus.id||x.name===map.campus.name))
   mapped.push(map.campus);
 let landmarks=mapped.filter(p=>p.verifiedOSM&&Array.isArray(p.p));
 if(!landmarks.some(x=>x.name==='Yobe State University')&&map.campus)landmarks.push(map.campus);
 const supported=['hospital','university','college','place_of_worship','company','ngo','school','bank','fuel','pharmacy','market'];
 landmarks=landmarks.filter(x=>x.name && (supported.includes(x.kind)||x.name==='Yobe State University'))
 .filter((p,i,arr)=>arr.findIndex(q=>q.name===p.name)===i);
 const center={id:'the-cross',name:'The Cross Flyover',kind:'interchange',verifiedOSM:false,
    locationStatus:'Approximate interchange concept',p:[0,0]};
 landmarks.unshift(center);
 const palettes={
  university:'#91D7DE',hospital:'#D0E9DB',college:'#91D7DE',
  place_of_worship:'#C6DEC9',interchange:'#EDCE96',
  company:'#EDCC97',ngo:'#CFD9E3',bank:'#EBD39C',fuel:'#DEC38A',market:'#F2D094'
 };
 function labelTexture(title,kind){
  const tex=new B.DynamicTexture('mapped label '+title,{width:512,height:112},world.scene,false),ctx=tex.getContext();
  ctx.fillStyle='#17363BD9';ctx.fillRect(0,0,512,112);
  ctx.fillStyle=palettes[kind]||'#EFD19D';ctx.fillRect(0,0,7,112);
  ctx.fillStyle='#F9F2E5';ctx.textAlign='center';ctx.textBaseline='middle';
  const clipped=title.length>30?title.slice(0,27)+'...':title;
  ctx.font='bold 34px Arial';ctx.fillText(clipped,255,56);tex.update();
  const m=new B.StandardMaterial('label '+title,world.scene);
  m.diffuseTexture=tex;m.emissiveColor=new B.Color3(.27,.32,.27);m.backFaceCulling=false;
  m.disableLighting=true;m.alpha=1;return m;
 }
 world.landmarks=landmarks.map((loc,index)=>{
  const labelMat=labelTexture(loc.name,loc.kind);
  const board=B.MeshBuilder.CreatePlane('grounded landmark '+loc.name,{width:13.5,height:2.95},world.scene);
  board.position.set(loc.p[0],9.2,loc.p[1]);board.billboardMode=B.Mesh.BILLBOARDMODE_ALL;
  board.material=labelMat;board.isPickable=false;board.isVisible=false;
  const marker=meshCylinder('mapped place marker',loc.p[0],2.8,loc.p[1],.16,.34,5.5,
    mat('landmark stem '+index,palettes[loc.kind]||'#EBD2AE'));
  const orb=sphere('mapped place orb '+index,loc.p[0],5.8,loc.p[1],.66,.66,.66,
    mat('landmark crown '+index,palettes[loc.kind]||'#EBD2AE'));
  marker.isVisible=false;orb.isVisible=false;
  return {...loc,board,marker,orb};
 });
 world.landmarkDirectory=expected;
 world.destination=world.landmarks.find(x=>x.name==='The Cross Flyover')||world.landmarks[0];
 world.interactions.push(...world.landmarks.filter(p=>p.name!=='The Cross Flyover')
   .map(p=>({x:p.p[0],z:p.p[1],radius:p.kind==='university'?180:30,name:p.name,
    message:p.kind==='university'?'YSU campus marker from OpenStreetMap. Exact entrance not verified.':
       'Mapped landmark: '+p.name+'. Location from OpenStreetMap.'})));
 const list=document.getElementById('landmark-list');
 if(list){
   list.innerHTML='';
   for(const p of world.landmarks){
     const button=document.createElement('button');button.type='button';button.className='landmark-row';
     const name=document.createElement('strong');name.textContent=p.name;
     const meta=document.createElement('small');
     meta.textContent=p.verifiedOSM?'OSM mapped location':p.locationStatus;
     button.append(name,meta);
     button.addEventListener('click',()=>{setDestination(p);document.getElementById('landmark-panel').hidden=true;});
     list.appendChild(button);
   }
   for(const unplaced of expected){
    const row=document.createElement('div');row.className='landmark-row unplaced';
    const title=document.createElement('strong');title.textContent=unplaced.name;
    const note=document.createElement('small');note.textContent=unplaced.locationStatus;
    row.append(title,note);list.appendChild(row);
   }
 }
}
function setDestination(place){
 if(!place)return;
 world.destination=place;world.missionComplete=false;
 const label=document.querySelector('#mission-objective span:nth-child(2)');
 if(label)label.textContent=place.name==='Yobe State University'?'YSU CAMPUS':
   place.name==='The Cross Flyover'?'THE CROSS':place.name.toUpperCase().slice(0,21);
 if(place.kind==='university'&&world.map.verifiedRoute?.p?.length){
    world.activeRoute=world.map.verifiedRoute.p;
 }else world.activeRoute=null;
 toast('LANDMARK SELECTED: '+place.name);
}
function updateLandmarkVisibility(){
 if(!world.landmarks)return;
 const px=world.playerPos.x,pz=world.playerPos.z;
 for(const p of world.landmarks){
   const range=Math.hypot(p.p[0]-px,p.p[1]-pz);
   const visible=range<260;
   p.board.isVisible=visible;p.marker.isVisible=visible;p.orb.isVisible=visible;
 }
}
function drawLandmarkMapIcons(g,project,w,h){
 if(!world.landmarks)return;
 for(const p of world.landmarks){
   const [x,y]=project(p.p);
   if(x<7||x>w-7||y<7||y>h-7)continue;
   g.fillStyle=p.kind==='university'?'#8CE9F0':p.kind==='interchange'?'#F0CF8B':'#E5E0C5';
   g.strokeStyle='#102C33';g.lineWidth=1.8;
   g.beginPath();g.arc(x,y,p===world.destination?6.6:3.8,0,Math.PI*2);g.fill();g.stroke();
 }
}

function createGroundStage(map){
 worldFloor();
 buildRoadNetwork(map);
 for(let i=0;i<map.buildings.length;i++)buildBuilding(map.buildings[i],i);
 createFlyover();
 createRaceHub();
 scenery();
}
function matchingPlayerOutfit(config){
 const female=config.body==='feminine';
 const c={...config};
 const outfits=female?['abaya','atamfa','buba_zani']:['jamfa','kaftan','shadda','babbar_riga','kanuri_robe','jallabiya'];
 const hats=female?['none','gyale','hijab','kallabi']:['none','zanna_bukar','hula','dara','bama','rawani'];
 if(!outfits.includes(c.outfit))c.outfit=female?'abaya':'jamfa';
 if(!hats.includes(c.headwear))c.headwear=female?'hijab':'none';
 if(female)c.facialHair='none';
 return c;
}
function buildAvatar(config){
 if(!window.WasaHuman)throw Error('WASA lightweight human engine is unavailable.');
 // Keep the animated body approximately life-sized in world metres.
 const actor=window.WasaHuman.create(world.scene,matchingPlayerOutfit(config),{detail:'medium'});
 const height=actor.getProfile().height;
 actor.root.scaling.setAll((config.body==='feminine'?1.72:1.82)/height);
 actor.root.position.copyFrom(world.playerPos);
 actor.root.rotation.y=world.heading;
 world.player=actor.root;
 world.avatarRig=actor;
 return actor.root;
}

function findSafeSpawn(){
 const block=world.streetBlock;
 if(block&&playerCanGo(...block.entry)){
   world.playerPos.set(block.entry[0],0,block.entry[1]);
   world.camera.alpha=Math.atan2(-block.dz,-block.dx);
   world.heading=Math.PI/2-world.camera.alpha;
   world.camera.target.set(block.entry[0],1.7,block.entry[1]);
   return;
 }
 // Start on a real mapped road with unobstructed forward AND backward travel,
 // rather than an arbitrary free point in front of a solid shop wall.
 const ideal=[-95,330],candidates=[];
 const clear=(x,z,dx,dz)=>{
   return [0,3,7,13].every(dist=>playerCanGo(x+dx*dist,z+dz*dist));
 };
 const roads=world.map?.roads||[];
 for(const road of roads){
   if(!['trunk','primary','secondary','tertiary','residential','unclassified'].includes(road.type))continue;
   for(let i=1;i<road.p.length;i++){
     const a=road.p[i-1],b=road.p[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
     if(len<7)continue;
     const cx=(a[0]+b[0])/2,cz=(a[1]+b[1])/2;
     if(Math.hypot(cx-ideal[0],cz-ideal[1])>260)continue;
     const ux=dx/len,uz=dz/len;
     const towardCenter=(0-cx)*ux+(0-cz)*uz;
     const directions=towardCenter>=0?[[ux,uz],[-ux,-uz]]:[[-ux,-uz],[ux,uz]];
     for(const frac of [.25,.5,.75])for(const lateral of [0,-1.0,1.0]){
       const x=a[0]+dx*frac-uz*lateral,z=a[1]+dz*frac+ux*lateral;
       if(!playerCanGo(x,z))continue;
       for(let d=0;d<directions.length;d++){
         const [fx,fz]=directions[d];
         if(!clear(x,z,fx,fz)||!clear(x,z,-fx,-fz))continue;
         const near=Math.hypot(x-ideal[0],z-ideal[1]);
         candidates.push({x,z,fx,fz,score:near+(d===0?0:90)+
          (road.type==='primary'?0:road.type==='trunk'?10:road.type==='secondary'?65:130)});
       }
     }
   }
 }
 const winner=candidates.sort((a,b)=>a.score-b.score)[0];
 if(winner){
   const street=roadAt(winner.x,winner.z);
   let ux=winner.fx,uz=winner.fz,x=winner.x,z=winner.z;
   if(street && street.distance<street.width/2+1.7){
     const length=Math.hypot(street.dx,street.dz);
     if(length>0){
       const dx=street.dx/length,dz=street.dz/length;
       const sign=dx*ux+dz*uz<0?-1:1;
       ux=dx*sign;uz=dz*sign;
       // Snap BOTH the player position and its heading to this street.
       x=street.px;z=street.pz;
     }
   }
   world.playerPos.set(x,0,z);
   world.camera.alpha=Math.atan2(-uz,-ux);
   world.heading=Math.PI/2-world.camera.alpha;
   world.camera.target.copyFrom(new B.Vector3(x,1.7,z));
   console.info('[WASA WORLD] mapped primary road heading',x.toFixed(1),z.toFixed(1),ux.toFixed(3),uz.toFixed(3));
 }else{
   const fallback=[[-95,330],[-98,335],[-123,423],[-24,80]];
   const selected=fallback.find(v=>playerCanGo(...v))||fallback[0];
   world.playerPos.set(selected[0],0,selected[1]);
 }
}

function setupScene(){
 world.mats={};
 const sc=new B.Scene(world.engine);world.scene=sc;
 sc.clearColor=new B.Color4(.76,.75,.68,1);
 sc.ambientColor=new B.Color3(.08,.08,.07);
 sc.fogMode=B.Scene.FOGMODE_EXP2;
 sc.fogColor=new B.Color3(.76,.75,.68);
 sc.fogDensity=.00025;
 window.WasaRendering.environment(sc);
 window.WasaRendering.sky(sc);
 const hemi=new B.HemisphericLight('sky illumination',new B.Vector3(0,1,0),sc);
 hemi.intensity=.28;hemi.diffuse=new B.Color3(.93,.96,1);hemi.groundColor=new B.Color3(.40,.35,.27);
 const sun=new B.DirectionalLight('Yobe warm sunlight',new B.Vector3(-.55,-1,.4).normalize(),sc);
 sun.intensity=2.2;sun.diffuse=new B.Color3(1,.94,.83);world.sun=sun;

 const camera=new B.ArcRotateCamera('third person',1.84,1.16,8.0,
   new B.Vector3(world.playerPos.x,1.65,world.playerPos.z),sc);
 camera.minZ=.09;camera.maxZ=14000;camera.lowerRadiusLimit=4.2;camera.upperRadiusLimit=12;camera.fov=1.05;
 camera.lowerBetaLimit=.87;camera.upperBetaLimit=1.33;camera.wheelDeltaPercentage=.018;
 camera.panningSensibility=0;camera.inertia=.51;camera.angularSensibilityX=2300;camera.angularSensibilityY=4500;
 camera.attachControl(canvas,true);
 canvas.addEventListener('pointerdown',()=>{world.manualLookUntil=performance.now()+6000;});
 canvas.addEventListener('pointermove',e=>{if(e.buttons&1)world.manualLookUntil=performance.now()+6000;});
 // Babylon ArcRotateCamera has its OWN default arrow-key camera rotation.
 // This previously competed with WASA's ArrowUp/Down movement and arrow steering.
 // Remove only the keyboard camera input; keep mouse drag, touch drag and wheel.
 if(camera.inputs.attached.keyboard){
   camera.inputs.remove(camera.inputs.attached.keyboard);
 }
 camera.inertialAlphaOffset=0;
 camera.inertialBetaOffset=0;
 world.camera=camera;
 world.graphics=window.WasaRendering.createQuality(sc,camera,world.sun,world.quality);

 if(camera.inputs.attached.pointers) camera.inputs.attached.pointers.buttons=[0];
}
async function fetchMap(){
 const response=await fetch('/world/data/damaturu-region-v3.json?v=3',{cache:'force-cache'});
 if(!response.ok)throw Error('Map data failed to load (HTTP '+response.status+').');
 let data;
 if(response.body && response.body.getReader){
  const reader=response.body.getReader(),parts=[];let read=0;
  const expected=Number(response.headers.get('content-length'))||651000;
  while(true){
   const chunk=await reader.read();
   if(chunk.done)break;
   parts.push(chunk.value);read+=chunk.value.length;
   progress(Math.round(12+Math.min(1,read/expected)*21),'FETCHING MAPPED STREETS');
  }
  const buffer=new Uint8Array(read);let off=0;
  for(const part of parts){buffer.set(part,off);off+=part.length;}
  data=JSON.parse(new TextDecoder().decode(buffer));
 }else data=await response.json();
 if(!Array.isArray(data.roads)||!Array.isArray(data.buildings)||data.roads.length<30)
  throw Error('Damaturu map data was incomplete.');
 return data;
}
function roadAligned(x,z,ux,uz,preferredName=''){
 const index=world.roadIndex;
 if(!index)return null;
 const cx=Math.floor(x/index.cell),cz=Math.floor(z/index.cell);
 let best=null,rank=Infinity,seen=new Set();
 for(let i=cx-1;i<=cx+1;i++)for(let j=cz-1;j<=cz+1;j++){
  for(const seg of index.grid.get(i+','+j)||[]){
   if(seen.has(seg))continue;seen.add(seg);
   const t=clamp(((x-seg.x)*seg.dx+(z-seg.z)*seg.dz)/seg.l2,0,1);
   const px=seg.x+t*seg.dx,pz=seg.z+t*seg.dz;
   const gap=Math.hypot(x-px,z-pz);
   if(gap>9)continue;
   const length=Math.sqrt(seg.l2);
   const dd=(seg.dx*ux+seg.dz*uz)/length;
   const agreement=Math.abs(dd);
   if(agreement<.32)continue;
   const score=gap+(1-agreement)*6+(seg.name===preferredName&&preferredName?-1.7:0);
   if(score<rank){rank=score;
     const sign=dd<0?-1:1;
     best={x:sign*seg.dx/length,z:sign*seg.dz/length,px,pz,gap,
       name:seg.name||'',type:seg.kind,width:seg.width,agree:agreement};}
  }
 }
 return best;
}
function roadWalkingCourse(x,z,ux,uz){
 const prior=world.roadCourse||null;
 const nearest=roadAligned(x,z,ux,uz,prior?.name||'');
 if(!nearest || nearest.gap>nearest.width/2+1.65)return null;
 let next=roadAligned(x+nearest.x*5,z+nearest.z*5,nearest.x,nearest.z,nearest.name);
 if(next && next.name!==nearest.name && next.agree<.80)next=null;
 const chosen=next&&next.gap<next.width/2+2.5?next:nearest;
 world.roadCourse={name:chosen.name};
 return {x:chosen.x,z:chosen.z,
    crossX:nearest.px-x,crossZ:nearest.pz-z,road:chosen.name};
}

function playerCanGo(x,z,height=world.playerPos.y){
 const lim=world.map.limitsMeters;
 if(lim && (x<lim.minX+12||x>lim.maxX-12||z<lim.minZ+12||z>lim.maxZ-12))return false;
 if(!lim && (Math.abs(x)>world.worldSize-20||Math.abs(z)>world.worldSize-20))return false;
 const surface=roadAt(x,z);
 const onStreet=surface&&surface.distance<=Math.max(.95,surface.width/2-.35);
 for(const b of world.colliders){
  if(b.minY!==undefined&&(height>b.maxY||height+1.72<b.minY))continue;
  if(x>b.minX-.45&&x<b.maxX+.45&&z>b.minZ-.45&&z<b.maxZ+.45){
   if(onStreet&&!b.hard)continue; // road beats conservative facade AABBs
   return false;
  }
 }
 return true;
}
function placePlayer(x,z,reference=0){
 const floor=world.surfaces?.sample(x,z,reference);
 world.playerPos.set(x,floor?.height??-.08,z);
 world.groundHeight=world.playerPos.y;world.groundSurface=floor?.name||'ground';
 world.velocity.set(0,0,0);world.turnVelocity=0;
 world.movementActive=false;world.travelDirection=null;world.roadCourse=null;
 world.player?.position.copyFrom(world.playerPos);
}
function inputVector(){
 const k=world.keys;
 const forward=Number(k.has('KeyW')||k.has('ArrowUp')||k.has('PageUp'))-
               Number(k.has('KeyS')||k.has('ArrowDown')||k.has('PageDown'));
 const right=Number(k.has('KeyD')||k.has('ArrowRight'))-
             Number(k.has('KeyA')||k.has('ArrowLeft'));
 let z=forward-world.touch.y,x=right+world.touch.x;
 const length=Math.hypot(x,z);
 if(length>1){x/=length;z/=length;}
 return {forward:z,right:x};
}
function movementIntent(dt){
 const input=inputVector();
 const moving=Math.hypot(input.forward,input.right)>.08;
 const sprint=world.keys.has('ShiftLeft')||world.keys.has('ShiftRight')||world.touch.sprint;
 const speed=sprint?6.7:3.1;
 // IMPORTANT: Capture movement bearing only when a movement starts.
 // Dragging the mouse to look at buildings must NOT steer the character,
 // and neither should ArcRotateCamera inertia or camera recentering.
 if(moving&&!world.movementActive){
   world.movementAlpha=world.camera.alpha;
   world.movementActive=true;
   world.travelDirection=null;
   world.roadCourse=null;
 }
 if(!moving){
   world.movementActive=false;
   world.travelDirection=null;
   world.roadCourse=null;
 }
 const alpha=world.movementActive?world.movementAlpha:world.camera.alpha;
 let fx=-Math.cos(alpha),fz=-Math.sin(alpha);
 let guidance=null;
 if(moving && !world.groundSurface?.startsWith('flyover') && Math.abs(input.forward)>.7 && Math.abs(input.right)<.12){
   const sign=Math.sign(input.forward);
   const desired=world.travelDirection||{x:fx*sign,z:fz*sign};
   guidance=roadWalkingCourse(world.playerPos.x,world.playerPos.z,desired.x,desired.z);
   if(guidance){
     const rate=Math.min(1,dt*9);
     let dx=desired.x+(guidance.x-desired.x)*rate;
     let dz=desired.z+(guidance.z-desired.z)*rate;
     const len=Math.hypot(dx,dz);
     if(len>.01){dx/=len;dz/=len;}
     world.travelDirection={x:dx,z:dz};
     fx=dx*sign;fz=dz*sign;
     if(performance.now()>(world.manualLookUntil||0)){
        const expected=Math.atan2(-dz,-dx);
        const delta=Math.atan2(Math.sin(expected-world.camera.alpha),
             Math.cos(expected-world.camera.alpha));
        world.camera.alpha+=delta*Math.min(1,dt*2.3);
     }
   }else{
      world.travelDirection=null;
      world.roadCourse=null;
   }
 }else{
    world.travelDirection=null;
    world.roadCourse=null;
 }
 // Babylon's left-handed camera uses up × forward for screen-right.
 const rightX=fz,rightZ=-fx;
 let intendedX=(fx*input.forward+rightX*input.right)*speed;
 let intendedZ=(fz*input.forward+rightZ*input.right)*speed;
 if(guidance){
   // Keep feet close to the mapped carriageway, without a sudden sideways
   // teleport or drift. The correction is limited to 0.9 m/s.
   intendedX+=clamp(guidance.crossX*.9,-.9,.9);
   intendedZ+=clamp(guidance.crossZ*.9,-.9,.9);
 }
 return {intendedX,intendedZ,sprint,moving};
}
function cityInput(dt){
 const input=movementIntent(dt),speed=input.sprint?6.7:3.1;
 const len=Math.max(speed,Math.hypot(input.intendedX,input.intendedZ));
 return {x:Math.max(-1,Math.min(1,input.intendedX/len)),z:Math.max(-1,Math.min(1,input.intendedZ/len)),run:input.sprint};
}
function movePlayer(dt){
 if(!world.ready||!world.player)return;
 const {intendedX,intendedZ,sprint,moving}=world.network?{intendedX:0,intendedZ:0,sprint:false,moving:Math.hypot(world.network.state.vx,world.network.state.vz)>.08}:movementIntent(dt);
 const beforeVelocity=world.velocity.clone();
 if(world.network){
  const p=world.network.state;world.playerPos.set(p.x,p.y,p.z);world.velocity.set(p.vx,0,p.vz);world.heading=p.heading;world.turnVelocity=p.turnVelocity;world.groundHeight=p.groundHeight;world.groundSurface=p.surface;
 }else{
 window.WasaLocomotion.velocityStep(world.velocity,intendedX,intendedZ,dt);
 const nextX=world.playerPos.x+world.velocity.x*dt;
 const nextZ=world.playerPos.z+world.velocity.z*dt;
 // Use a single predicted position. Previous independent X/Z collision
 // resolution caused a character to slide sideways when a wall blocked
 // one axis, making an otherwise straight walk appear to change direction.
 const floor=world.surfaces?.sample(nextX,nextZ,world.groundHeight??world.playerPos.y);
 if((!world.surfaces||floor)&&playerCanGo(nextX,nextZ,floor?.height)){
    world.playerPos.x=nextX;
    world.playerPos.z=nextZ;
    if(floor){world.groundHeight=floor.height;world.groundSurface=floor.name;
      world.playerPos.y+=(floor.height-world.playerPos.y)*(1-Math.exp(-dt*24));}
 }else{
    world.velocity.x=0;world.velocity.z=0;
 }
 }
 world.player.position.copyFrom(world.playerPos);world.player.rotation.y=world.heading;
 const metresPerSecond=Math.hypot(world.velocity.x,world.velocity.z);
 if(!world.network&&metresPerSecond>.06){
   const wanted=Math.atan2(-world.velocity.x,-world.velocity.z);
   const turn=window.WasaLocomotion.turnStep(world.heading,world.turnVelocity||0,wanted,dt);
   world.heading=turn.heading;world.turnVelocity=turn.velocity;
   world.player.rotation.y=world.heading;
   world.walkPhase+=dt*(sprint?12:8);
 }else if(!world.network){world.walkPhase+=dt*2.5;world.turnVelocity=(world.turnVelocity||0)*Math.exp(-dt*12);}
 const look=Math.PI/2-world.camera.alpha-world.heading;
 world.avatarRig.animate(dt,clamp(metresPerSecond/3.1,0,1),metresPerSecond>4.05,{
   speed:metresPerSecond,turnRate:world.turnVelocity,
   acceleration:{x:(world.velocity.x-beforeVelocity.x)/dt,z:(world.velocity.z-beforeVelocity.z)/dt},
   lookYaw:clamp(Math.atan2(Math.sin(look),Math.cos(look)),-.55,.55)*(moving?.35:.8),
   sampleGround:world.network?world.network.floor:world.surfaces?world.surfaces.sample:undefined});
 const target=new B.Vector3(world.playerPos.x,world.playerPos.y+1.7,world.playerPos.z);
 // Mutate the target vector rather than replacing the ArcRotateCamera target.
 // Replacing it recalculated beta/radius as the player walked, causing unwanted
 // angle and zoom drift instead of a stable follow-camera.
 world.camera.target.copyFrom(B.Vector3.Lerp(world.camera.target,target,clamp(dt*8,0,1)));
 const actualSpeed=Math.hypot(world.velocity.x,world.velocity.z)*3.6;
 $('speed-display').textContent=actualSpeed.toFixed(1);
 $('walk-mode').textContent=metresPerSecond>.08?metresPerSecond>4.05?'RUNNING':'WALKING':'IDLE';
}

function getPlayerLatLon(){
 const origin=world.map.origin;
 return {
   lat:origin.lat-world.playerPos.z/111320,
   lon:origin.lon+world.playerPos.x/(111320*Math.cos(origin.lat*Math.PI/180))
 };
}
function updateUI(){
 if(!world.ready)return;
 const gps=getPlayerLatLon();
 $('coord-text').textContent=gps.lat.toFixed(5)+'° N';
 const facing=world.camera.alpha;
 const degrees=((Math.round(Math.atan2(-Math.cos(facing),Math.sin(facing))*180/Math.PI)%360)+360)%360;
 const dirs=['N','NE','E','SE','S','SW','W','NW'];
 $('compass-degrees').textContent=degrees+'°';
 $('compass-direction').textContent=dirs[Math.round(degrees/45)%8];
 const target=world.destination?.p||[-42,30];
 const checkpoint={x:target[0],z:target[1]};
 const m=dist(world.playerPos.x,world.playerPos.z,checkpoint.x,checkpoint.z);
 $('objective-range').textContent=world.missionComplete?'DONE':Math.round(m)+'m';
 if(!world.missionComplete&&m<(world.destination?.kind==='university'?190:25)){
  world.missionComplete=true;
  $('mission-objective').querySelector('span:nth-child(2)').textContent='DISCOVERED';
  $('zone-hint').textContent='EXPLORE THE STREETS OF DAMATURU';
  toast('LANDMARK REACHED: '+(world.destination?.name||'THE CROSS'));
 }
 world.nearby=world.interactions.find(p=>dist(world.playerPos.x,world.playerPos.z,p.x,p.z)<p.radius);
 $('interaction-prompt').hidden=!world.nearby;
 if(world.nearby) $('interaction-text').textContent=world.nearby.name;
 updateSceneryCulling();
 if(world.graphics){
   world.graphics.updateShadows(world.playerPos,true);
   const label=world.quality==='auto'?'AUTO':world.quality.toUpperCase();
   $('graphics-label').textContent=label;
   $('graphics-button').title='Graphics: '+world.graphics.status.tier+' (click to change)';
   if(new URLSearchParams(location.search).has('debug')){
     let panel=$('render-stats');
     if(!panel){panel=document.createElement('output');panel.id='render-stats';panel.style.cssText='position:absolute;bottom:10px;left:12px;z-index:20;padding:6px;background:#102629e8;color:#fff;font:11px monospace;pointer-events:none';document.body.append(panel);}
     const g=world.graphics.status;
     const avatar=world.avatarRig.getProfile();
     const contact=avatar.animation?.contacts||[];
     panel.textContent=g.tier+' | '+g.fps+' FPS | shadows '+g.shadowCasters+' @ '+g.shadowSize+' | AO '+g.ao+' | bloom '+g.bloom+' | avatar '+(avatar.source||'procedural')+
       ' | height '+world.playerPos.y.toFixed(2)+'m | '+(world.groundSurface||'ground')+(contact.length?' | feet '+contact.map(c=>Math.round(c.clearance*1000)).join('/')+'mm':'');
   }
 }
 updateLandmarkVisibility();
 if(minimapContext&&world.showMap)drawMiniMap();
}
function drawMiniMap(){
 const g=minimapContext;
 const w=minimap.width,h=minimap.height;
 g.clearRect(0,0,w,h);
 g.fillStyle='#12373A';g.fillRect(0,0,w,h);
 const scale=.55,centerX=w/2,centerY=h/2;
 // North stays up, coordinate z increases toward the south.
 const project=p=>[(p[0]-world.playerPos.x)*scale+centerX,(p[1]-world.playerPos.z)*scale+centerY];
 const drawRoads=(width,colour,types)=>{
   g.strokeStyle=colour;g.lineWidth=width;g.lineCap='round';
   for(const road of world.map.roads){
     if(!types.includes(road.type))continue;
     const pts=road.p;if(pts.length<2)continue;
     g.beginPath();let drew=false;
     for(const p of pts){const [x,y]=project(p);if(x<-20||y<-20||x>w+20||y>h+20){drew=false;continue;}
       if(!drew){g.moveTo(x,y);drew=true;}else g.lineTo(x,y);
     }
     g.stroke();
   }
 };
 drawRoads(5,'#547174',['residential','tertiary','unclassified','service','living_street']);
 drawRoads(8,'#A6B6A2',['trunk','trunk_link','primary','secondary']);
 const bridge=project([0,0]);
 if(bridge[0]>=0&&bridge[0]<=w&&bridge[1]>=0&&bridge[1]<=h){
  g.fillStyle='#EFC88E';g.beginPath();g.arc(...bridge,4,0,Math.PI*2);g.fill();
 }
 const goal=project(world.destination?.p||[-42,30]);
 if(goal[0]>=0&&goal[0]<=w&&goal[1]>=0&&goal[1]<=h){
  g.strokeStyle='#FFC878';g.lineWidth=2;g.beginPath();g.arc(...goal,6,0,Math.PI*2);g.stroke();
 }
 // Draw local portion of the mapped connected route to YSU when selected.
 if(world.activeRoute?.length){
   g.lineWidth=2.3;g.strokeStyle='#D7B777';g.setLineDash([4,3]);g.beginPath();
   let drew=false;
   for(const point of world.activeRoute){
     const [x,y]=project(point);
     if(x<-12||y<-12||x>w+12||y>h+12){drew=false;continue;}
     if(!drew){g.moveTo(x,y);drew=true;}else g.lineTo(x,y);
   }
   g.stroke();g.setLineDash([]);
 }
 drawLandmarkMapIcons(g,project,w,h);
 g.fillStyle='#A5F7D2';g.strokeStyle='#08252B';g.lineWidth=2;
 g.beginPath();g.arc(centerX,centerY,7,0,Math.PI*2);g.fill();g.stroke();
 // A north arrow makes the map orientation explicit.
 g.fillStyle='#d8c29b';g.font='bold 12px Arial';g.fillText('N',w-17,18);
}
let toastTimer=0;
function toast(text){
 $('toast').textContent=text;$('toast').hidden=false;
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);
}
function interact(){
 if(world.nearby)toast(world.nearby.message);
 else toast('MOVE NEAR A LANDMARK TO INTERACT.');
}
function resetCamera(){
 if(!world.camera)return;
 // Preserve movement heading while bringing the camera to the human-scale chase angle.
 world.camera.alpha=Math.PI/2-world.heading;
 world.camera.beta=1.16;world.camera.radius=8.0;
 world.camera.target.copyFrom(new B.Vector3(world.playerPos.x,world.playerPos.y+1.7,world.playerPos.z));
}
function setMapVisible(visible){
 world.showMap=!!visible;
 $('mini-map-panel').classList.toggle('collapsed',!world.showMap);
 $('map-button').setAttribute('aria-pressed',String(world.showMap));
}
function advanceInputSimulation(now=performance.now()){
 if(!world.simulationAt){world.simulationAt=now;return;}
 if(now<world.simulationAt){world.simulationAt=now;return;}
 // Browser/GPU frames can stall for multiple seconds on low-end devices.
 // Preserve the wall-clock time the user held the key instead of silently
 // dropping movement after 0.95s, as the previous implementation did.
 let elapsed=Math.min(4.5,(now-world.simulationAt)/1000);
 world.simulationAt=now;
 if(!world.ready||!world.hasFocus||!$('help-modal').hidden)return;
 // Independent from GPU presentation rate: don't lose short key presses
 // when a WebGL draw takes longer than the key press itself.
 while(elapsed>.0001){
   const dt=Math.min(.065,elapsed);
   movePlayer(dt);
   elapsed-=dt;
 }
}
function setupControls(){
 const excluded=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Space']);
 window.addEventListener('keydown',event=>{
   if(event.target?.matches('input,textarea,select,[contenteditable="true"]'))return;
   if(event.ctrlKey||event.altKey||event.metaKey)return; // preserve browser shortcuts
   if(excluded.has(event.code)||['KeyW','KeyA','KeyS','KeyD','KeyC','KeyE','KeyF','KeyM'].includes(event.code))event.preventDefault();
   advanceInputSimulation();
   // When a dialog is open, keys must not secretly move the character.
   if(!$('help-modal').hidden){
     if(event.code==='Escape')closeHelp();
     return;
   }
   world.keys.add(event.code);
   if(event.code==='KeyF'||event.code==='KeyE')interact();
   if(event.code==='KeyC'){resetCamera();event.preventDefault();}
   if(event.code==='KeyM')setMapVisible(!world.showMap);
   if(event.code==='Escape'&&!$('landmark-panel').hidden){
     $('landmark-panel').hidden=true;$('landmark-button').setAttribute('aria-expanded','false');
   }
 });
 window.addEventListener('keyup',e=>{
   advanceInputSimulation();
   world.keys.delete(e.code);
 });
 window.addEventListener('blur',()=>{world.keys.clear();world.touch.x=0;world.touch.y=0;world.touch.sprint=false;world.movementActive=false;world.travelDirection=null;world.roadCourse=null;world.simulationAt=performance.now();});
 document.addEventListener('visibilitychange',()=>{
   world.hasFocus=!document.hidden;
   world.simulationAt=performance.now();
   if(!world.hasFocus){world.keys.clear();world.movementActive=false;world.travelDirection=null;world.roadCourse=null;}
 });
 $('map-button').addEventListener('click',()=>setMapVisible(!world.showMap));
 const landmarkBtn=$('landmark-button'),landmarkPanel=$('landmark-panel');
 landmarkBtn.addEventListener('click',()=>{
    landmarkPanel.hidden=!landmarkPanel.hidden;
    landmarkBtn.setAttribute('aria-expanded',String(!landmarkPanel.hidden));
 });
 $('close-landmarks').addEventListener('click',()=>{
    landmarkPanel.hidden=true;landmarkBtn.setAttribute('aria-expanded','false');
 });
 $('preview-ysu').addEventListener('click',()=>{
    if(world.network){const dest=world.landmarks.find(p=>p.kind==='university');if(dest)setDestination(dest);world.network.travel('ysu');landmarkPanel.hidden=true;return;}
    const campus=world.map.campus;
    if(!campus)return;
    const route=world.map.verifiedRoute?.p||[];
    const anchor=route.length?route[route.length-1]:campus.p;
    // The last connected OSM route node is walkable. Prefer it instead of
    // offsetting 8m into an unverified nearby compound.
    let spot=playerCanGo(anchor[0],anchor[1])&&dist(anchor[0],anchor[1],campus.p[0],campus.p[1])>30?
      [anchor[0],anchor[1]]:null;
    for(let r=2;r<=95&&!spot;r+=4)for(let theta=0;theta<32;theta++){
      const a=theta/32*Math.PI*2,x=anchor[0]+r*Math.sin(a),z=anchor[1]+r*Math.cos(a);
      if(playerCanGo(x,z)&&dist(x,z,campus.p[0],campus.p[1])>30){spot=[x,z];break;}
    }
    if(!spot){toast('YSU preview point is obstructed; campus still mapped.');return;}
    placePlayer(spot[0],spot[1]);
    updateSceneryCulling(true);
    const dest=world.landmarks.find(x=>x.kind==='university');
    if(dest)setDestination(dest);
    world.camera.target.set(spot[0],world.playerPos.y+1.7,spot[1]);
    // Prefer looking toward campus, but choose a collision-free forward heading.
    // Some OSM footprints extend close to the mapped YSU approach street.
    const dx=campus.p[0]-spot[0],dz=campus.p[1]-spot[1];
    const desired=Math.atan2(-dz,-dx);
    const offsets=[0,.27,-.27,.54,-.54,.92,-.92,1.55,-1.55,2.25,-2.25,Math.PI];
    let heading=desired;
    for(const shift of offsets){
      const a=desired+shift;
      const nx=spot[0]-Math.cos(a),nz=spot[1]-Math.sin(a);
      if(playerCanGo(spot[0]-Math.cos(a)*3,spot[1]-Math.sin(a)*3)&&
         playerCanGo(spot[0]-Math.cos(a)*8,spot[1]-Math.sin(a)*8)){
         heading=a;break;
      }
    }
    world.camera.alpha=heading;
    world.camera.beta=1.13;
    world.camera.radius=9.0;
    world.heading=Math.PI/2-world.camera.alpha;
    landmarkPanel.hidden=true;landmarkBtn.setAttribute('aria-expanded','false');
    canvas.focus({preventScroll:true});
    toast('YSU APPROACH ROAD · MAPPED CAMPUS AREA');
 });
 $('city-respawn').addEventListener('click',()=>{if(world.network)world.network.travel('spawn');else{findSafeSpawn();placePlayer(world.playerPos.x,world.playerPos.z);}});
 $('camera-button').addEventListener('click',resetCamera);
 setMapVisible(window.matchMedia('(min-width:780px)').matches);
 $('help-button').addEventListener('click',openHelp);
 $('close-help').addEventListener('click',closeHelp);
 $('help-close-primary').addEventListener('click',closeHelp);
 $('help-modal').addEventListener('click',e=>{if(e.target===$('help-modal'))closeHelp();});
 $('graphics-button').addEventListener('click',()=>{
   const qualityOptions=['auto','low','high'];
   world.quality=qualityOptions[(qualityOptions.indexOf(world.quality)+1)%3];
   $('graphics-label').textContent=world.quality.toUpperCase();
   try{localStorage.setItem('wasa-quality',world.quality);}catch(_){}
   world.graphics?.setMode(world.quality,world.playerPos);
   updateSceneryCulling(true);
   updateUI();
 });
 $('action-button').addEventListener('click',interact);
 const sprint=$('sprint-button');
 const up=()=>{world.touch.sprint=false;sprint.classList.remove('pressed');};
 sprint.addEventListener('pointerdown',e=>{e.preventDefault();world.touch.sprint=true;sprint.classList.add('pressed');sprint.setPointerCapture(e.pointerId);});
 sprint.addEventListener('pointerup',up);sprint.addEventListener('pointercancel',up);
 const joystick=$('joystick'),thumb=$('joystick-thumb');
 const jpos=(e)=>{
   const r=joystick.getBoundingClientRect();
   const dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
   const lim=48,scale=Math.min(1,lim/Math.max(1,Math.hypot(dx,dy)));
   world.touch.x=dx*scale/lim;world.touch.y=dy*scale/lim;
   thumb.style.transform='translate('+dx*scale+'px,'+dy*scale+'px)';
 };
 const jreset=()=>{world.touch.x=0;world.touch.y=0;thumb.style.transform='translate(0,0)';};
 joystick.addEventListener('pointerdown',e=>{e.preventDefault();joystick.setPointerCapture(e.pointerId);jpos(e);});
 joystick.addEventListener('pointermove',e=>{if(joystick.hasPointerCapture(e.pointerId)){e.preventDefault();jpos(e);}});
 joystick.addEventListener('pointerup',jreset);joystick.addEventListener('pointercancel',jreset);
 $('boot-retry').addEventListener('click',()=>location.reload());
}
function openHelp(){ $('help-modal').hidden=false;world.keys.clear();world.movementActive=false;world.travelDirection=null;world.roadCourse=null;world.simulationAt=performance.now(); }
function closeHelp(){ $('help-modal').hidden=true;canvas.focus({preventScroll:true}); }
async function loadPlayerProfile(){
 try{
   const r=await fetch('/api/me',{credentials:'same-origin',cache:'no-store'});
   const p=await r.json();
   if(p.authenticated && p.user){
     world.account=p.user;
     world.name=p.user.displayName||p.user.username||world.name;
     const config=p.user.avatarConfig||{};
     if(Object.keys(config).length)world.config={...world.config,...config};
     const avatarResponse=await fetch('/api/avatar',{credentials:'same-origin',cache:'no-store'});const saved=await avatarResponse.json();if(saved.ok&&saved.avatar)world.config={...world.config,...saved.avatar};
   }
 }catch(error){console.warn('[WASA WORLD] Guest mode',error.message);}
 // Temporary visual QA selections; account appearance records remain untouched.
 const preview=new URLSearchParams(location.search),body=preview.get('body');
 if(preview.has('debug')&&['masculine','feminine'].includes(body)){
   world.config=matchingPlayerOutfit({...world.config,body,
     outfit:preview.get('outfit')||(body==='feminine'?'abaya':'jamfa'),
     headwear:body==='feminine'?'hijab':'none',facialHair:'none',hair:body==='feminine'?'braids':'short'});
 }
 $('player-name').textContent=shortName(world.name);
 $('player-icon').textContent=world.name.slice(0,1).toUpperCase()||'W';
}
async function start(){
 try{
   if(!B||!B.Engine.isSupported())throw Error('A browser with WebGL support is required for this 3D world.');
   progress(8,'PREPARING GRAPHICS');
   world.engine=new B.Engine(canvas,true,{powerPreference:'high-performance',stencil:false});
   setupScene();
   progress(12,'LOADING DAMATURU MAP');
   // Parallelize player session read and map loading.
   const [map]=await Promise.all([fetchMap(),loadPlayerProfile()]);
   world.map=map;
   indexRoadSurfaces(map);
   progress(42,'BUILDING REAL STREETS');
   worldFloor();
   buildRoadNetwork(map);
   await new Promise(resolve=>requestAnimationFrame(resolve));
   progress(68,'GENERATING MAPPED BUILDINGS');
   for(let i=0;i<map.buildings.length;i++)buildBuilding(map.buildings[i],i);
   await new Promise(resolve=>requestAnimationFrame(resolve));
   progress(82,'BUILDING SHOPFRONTS AND NEIGHBORHOODS');
   createFlyover();createRaceHub();
   const blockPlan=window.WasaStreetBlock.plan(map,world.colliders);
   if(blockPlan)world.streetBlock=window.WasaStreetBlock.build(world.scene,blockPlan,{mat,box:meshBox,cylinder:meshCylinder,colliders:world.colliders});
   else console.warn('[WASA] Street block skipped: updated map has no clear site.');
   createStreetDistricts(map);createUniversityDistrict(map);createWayfindingBeacon();
   progress(89,'OPTIMIZING CITY GEOMETRY');
   world.surfaces=window.WasaLocomotion.createSurfaceIndex();
   for(const mesh of world.scene.meshes)if(mesh.metadata?.wasaWalkable)world.surfaces.addMesh(mesh);
   optimizeStaticMeshes();
   prepareSceneryCulling();
   buildLandmarks(map);
   findSafeSpawn();
   const motionPreview=new URLSearchParams(location.search);
   if(motionPreview.has('debug')&&motionPreview.get('motion')==='flyover'){
     world.playerPos.set(-280,.26,.45);world.camera.alpha=Math.PI;world.heading=-Math.PI/2;
   }else if(motionPreview.has('debug')&&motionPreview.get('motion')==='curb'&&world.streetBlock){
     const block=world.streetBlock,p=window.WasaStreetBlock.point(block,-19,block.half-.30);
     world.playerPos.set(p[0],.13,p[1]);world.camera.alpha=Math.atan2(-block.dx,block.dz);world.heading=Math.PI/2-world.camera.alpha;
   }
   const spawnFloor=world.surfaces.sample(world.playerPos.x,world.playerPos.z,world.playerPos.y);
   world.playerPos.y=world.groundHeight=spawnFloor?.height??-.08;world.groundSurface=spawnFloor?.name||'ground';
   world.camera.target.copyFrom(new B.Vector3(world.playerPos.x,world.playerPos.y+1.7,world.playerPos.z));
   updateSceneryCulling(true);
   buildAvatar(world.config);
   await world.avatarRig.ready;
   const avatarMeshes=new Set(world.player.getChildMeshes());
   world.graphics.setCandidates(world.scene.meshes.filter(m=>m.metadata?.wasaShadow||avatarMeshes.has(m)));
   world.graphics.updateShadows(world.playerPos,true);
   progress(95,'INITIALIZING MOVEMENT');
   setupControls();
   if(world.account){try{world.network=await window.WasaCityClient.create(world,cityInput);}catch(error){$('city-status').textContent='OFFLINE PREVIEW · '+error.message;}}else{$('city-status').textContent='SOLO PREVIEW';$('city-signin').hidden=false;}
   window.addEventListener('pagehide',()=>world.network?.dispose(),{once:true});
   world.scene.render();
   world.engine.runRenderLoop(()=>{
     advanceInputSimulation();
     world.network?.render(Math.min(world.engine.getDeltaTime()/1000,.1));
     world.graphics.sample(Math.min(world.engine.getDeltaTime()/1000,.25),world.playerPos);
     world.scene.render();
   });
   window.addEventListener('resize',()=>world.engine?.resize(),{passive:true});
   world.ready=true;world.graphics.status.ready=true;
   world.simulationAt=performance.now();
   $('graphics-label').textContent=world.quality.toUpperCase();
   progress(100,'WORLD READY');
   updateUI();setInterval(updateUI,200);
   setTimeout(()=>{boot.hidden=true;ui.hidden=false;canvas.focus({preventScroll:true});},550);
   // Keep world geometry and source provenance inspectable for QA.
   window.WasaWorldQA={
     getSource:()=>({source:map.source,roadWays:map.roads.length,footprints:map.buildings.length,origin:map.origin,extentMeters:map.extentMeters,renderedBuildings:world.buildingCount,conceptBuildings:world.districtCount,campus:map.campus}),
     getPlayer:()=>({x:world.playerPos.x,y:world.playerPos.y,z:world.playerPos.z,surface:world.groundSurface,latlon:getPlayerLatLon()}),
     teleportTest:(x,z)=>{const height=world.surfaces.sample(x,z,0)?.height;if(height===undefined||!playerCanGo(x,z,height))return false;placePlayer(x,z);updateSceneryCulling(true);return true;},
     getMeshCount:()=>world.scene.meshes.length,
     getAvatar:()=>world.avatarRig.getProfile(),
     getStreetBlock:()=>world.streetBlock?({...world.streetBlock.stats,roadName:world.streetBlock.roadName,
       entry:world.streetBlock.entry,origin:[world.streetBlock.x,world.streetBlock.z]}):null,
     getGraphics:()=>({...world.graphics.status,meshes:world.scene.meshes.length,
       textureCount:world.scene.textures.length,avatarMeshes:world.player.getChildMeshes().length,
       avatarVertices:world.player.getChildMeshes().reduce((s,m)=>s+m.getTotalVertices(),0)}),
     getLandmarks:()=>world.landmarks.map(x=>({name:x.name,kind:x.kind,p:x.p,verifiedOSM:x.verifiedOSM})),
     getRoute:()=>({meters:map.verifiedRoute?.distanceMeters,points:map.verifiedRoute?.p?.length,ysu:map.campus?.p}),
     getDistrict:()=>({...world.districtStats,universityConceptBlocks:world.universityArtBlocks}),
     getPlacementReport:()=>({accepted:world.placementAudit?.length||0,
       results:world.placementAudit?.slice(0,600).map(o=>({
          category:o.category,x:o.x,z:o.z,angle:o.angle,width:o.width,depth:o.depth,front:o.front
       }))||[]}),

     getCamera:()=>({alpha:world.camera.alpha,beta:world.camera.beta,radius:world.camera.radius,target:world.camera.target.asArray()}),
     getSpawnStatus:()=>({x:world.playerPos.x,z:world.playerPos.z,
      road:roadAt(world.playerPos.x,world.playerPos.z)?.name,
      clearance:[],
      radius:world.sceneryCulling?.length||0,active:world.sceneryCulling?.filter(x=>x.mesh.isEnabled()).length||0}),
     getDirection:()=>({forward:[-Math.cos(world.camera.alpha),-Math.sin(world.camera.alpha)],
       travel:world.travelDirection?{...world.travelDirection}:null,roadCourse:world.roadCourse?{...world.roadCourse}:null,
       right:[-Math.sin(world.camera.alpha),Math.cos(world.camera.alpha)],heading:world.heading,
       movementAlpha:world.movementActive?world.movementAlpha:null,
       mode:'arrows/WASD move; PageUp/PageDown forward/back; camera free-look does not steer until next movement'}),
     debugMotion:()=>({keys:[...world.keys],focus:world.hasFocus,ready:world.ready,help:$('help-modal').hidden,velocity:world.velocity.asArray(),sprint:world.touch.sprint}),
     getRoadAt:(x,z,dx=0,dz=-1)=>{
       const point=roadAt(x,z),guide=roadAligned(x,z,dx,dz);
       return {road:point?{name:point.name,distance:point.distance,
          width:point.width,tangent:[point.dx,point.dz]}:null,
          guide,passable:playerCanGo(x,z)};
     },
     getCollisionProbe:(x,z)=>{
       const overlaps=world.colliders.map((box,index)=>({index,...box}))
          .filter(b=>x>b.minX-.45&&x<b.maxX+.45&&z>b.minZ-.45&&z<b.maxZ+.45).slice(0,10);
       const road=roadAt(x,z);
       return {x,z,canGo:playerCanGo(x,z),road:road?{
         name:road.name,kind:road.kind,distance:road.distance,width:road.width,
         center:[road.px,road.pz],direction:[road.dx,road.dz]}:null,overlaps};
     },
     testPosition:(x,z)=>playerCanGo(x,z)
   };
 }catch(error){showError(error);}
}
start();
})();
