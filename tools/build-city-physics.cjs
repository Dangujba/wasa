/* Capture collision geometry from the same builders used by the city renderer. */
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const B=require('../public/vendor/babylon.min.js');
const source=fs.readFileSync('public/world/world.js','utf8');
const output=process.argv[2]||'public/world/data/city-physics-v1.json';
const map=JSON.parse(fs.readFileSync('public/world/data/damaturu-region-v3.json','utf8'));
class Canvas {constructor(w,h){this.width=w;this.height=h;}getContext(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},clearRect(){},fillRect(){},fillText(){},strokeRect(){},drawImage(){}};}}
class LocalTexture extends B.Texture {constructor(url,scene){return B.RawTexture.CreateRGBATexture(new Uint8Array([90,120,70,255]),1,1,scene);}}
// Builder arrays live in a VM realm; Babylon tests Array identity when allocating
// normals. Convert here so the CPU capture matches the browser's single realm.
class PhysicsVertexData extends B.VertexData {
 static ComputeNormals(p,i,n,options){const out=[];B.VertexData.ComputeNormals(Array.from(p),Array.from(i),out,options);n.length=out.length;for(let k=0;k<out.length;k++)n[k]=out[k];}
 applyToMesh(mesh,updatable){for(const key of ['positions','normals','uvs','indices'])if(this[key])this[key]=Array.from(this[key]);return super.applyToMesh(mesh,updatable);}
}
global.OffscreenCanvas=Canvas;
const engine=new B.NullEngine(),scene=new B.Scene(engine);
const world={scene,map,mats:{},colliders:[],interactions:[],playerPos:new B.Vector3(-95,0,330),streetsDrawn:0,buildingCount:0};
const context=vm.createContext({B:{...B,Texture:LocalTexture,VertexData:PhysicsVertexData},world,console,OffscreenCanvas:Canvas,
 window:{BABYLON:{...B,Texture:LocalTexture},WasaRendering:{applySurface(){},boxUV(){},normalTexture:()=>B.RawTexture.CreateRGBATexture(new Uint8Array([128,128,255,255]),1,1,scene)}}});
vm.runInContext(fs.readFileSync('public/world/street-block.js','utf8'),context);
const builders=source.slice(source.indexOf('const colors='),source.indexOf('function matchingPlayerOutfit('));
vm.runInContext(builders,context);
context.makeSignTexture=()=>new B.StandardMaterial('physics sign',scene);
try{
 context.indexRoadSurfaces(map);context.worldFloor();context.buildRoadNetwork(map);
 for(let i=0;i<map.buildings.length;i++)context.buildBuilding(map.buildings[i],i);
 context.createFlyover();context.createRaceHub();
 const plan=context.window.WasaStreetBlock.plan(map,world.colliders);
 if(plan)world.streetBlock=context.window.WasaStreetBlock.build(scene,plan,{mat:context.mat,box:context.meshBox,cylinder:context.meshCylinder,colliders:world.colliders});
 context.createStreetDistricts(map);context.createUniversityDistrict(map);
 const triangles=[],bands=[],round=v=>Math.round(v*1e6)/1e6;
 for(const mesh of scene.meshes)if(mesh.metadata?.wasaWalkable){
  const positions=mesh.getVerticesData(B.VertexBuffer.PositionKind),normals=mesh.getVerticesData(B.VertexBuffer.NormalKind),indices=mesh.getIndices(),matrix=mesh.computeWorldMatrix(true);
  if(!positions||!normals||!indices)continue;
  if(mesh.metadata.wasaBandWidth){
   const segments=[];
   for(let k=0;k<positions.length;k+=12)segments.push([(positions[k]+positions[k+3])/2,(positions[k+2]+positions[k+5])/2,(positions[k+6]+positions[k+9])/2,(positions[k+8]+positions[k+11])/2].map(round));
   bands.push({name:mesh.name,width:mesh.metadata.wasaBandWidth,height:round(positions[1]),segments});continue;
  }
  for(let i=0;i<indices.length;i+=3){
   const ids=indices.slice(i,i+3),normal=B.Vector3.Zero();
   for(const id of ids)normal.addInPlace(new B.Vector3(normals[id*3],normals[id*3+1],normals[id*3+2]));
   if(B.Vector3.TransformNormal(normal,matrix).normalize().y<.7)continue;
   const points=ids.map(id=>B.Vector3.TransformCoordinates(new B.Vector3(positions[id*3],positions[id*3+1],positions[id*3+2]),matrix));
   triangles.push([...points.flatMap(p=>[round(p.x),round(p.y),round(p.z)]),mesh.name]);
  }
 }
 const widths={trunk:14,trunk_link:8,primary:10,primary_link:7,secondary:9,secondary_link:7,tertiary:7,tertiary_link:6,unclassified:6.5,residential:5.7,living_street:4.6,service:4,track:3.2,footway:2,pedestrian:3,path:2};
 const roads=[];for(const r of map.roads)if(widths[r.type])for(let i=1;i<r.p.length;i++){const a=r.p[i-1],b=r.p[i];roads.push([...a,b[0]-a[0],b[1]-a[1],widths[r.type]].map(round));}
 const entry=world.streetBlock?.entry||[-95,330];
 const data={version:1,ground:-.08,limits:map.limitsMeters,triangles,bands,colliders:world.colliders.map(c=>Object.fromEntries(Object.entries(c).map(([k,v])=>[k,typeof v==='number'?round(v):v]))),roads,
  spawns:{spawn:{x:entry[0],z:entry[1],reference:0,heading:Math.atan2(-world.streetBlock.dx,-world.streetBlock.dz)},cross:{x:-280,z:.45,reference:.3,heading:-Math.PI/2},ysu:{x:map.verifiedRoute.p.at(-1)[0],z:map.verifiedRoute.p.at(-1)[1],reference:0,heading:0}}};
 data.revision=crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0,16);
 fs.writeFileSync(output,JSON.stringify(data));
 console.log(JSON.stringify({revision:data.revision,triangles:triangles.length,bands:bands.reduce((n,b)=>n+b.segments.length,0),colliders:data.colliders.length,bytes:fs.statSync(output).size}));
}catch(error){console.error(error.stack);process.exitCode=1;}finally{engine.dispose();}
