const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const B=require('../public/vendor/babylon.min.js');
const map=require('../public/world/data/damaturu-region-v3.json');
class Canvas {
 constructor(w,h){this.width=w;this.height=h;}
 getContext(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage(){},clearRect(){},fillRect(){},strokeRect(){},fillText(){}};}
}
class LocalTexture extends B.Texture {
 constructor(url,scene){return B.RawTexture.CreateRGBATexture(new Uint8Array([90,120,70,255]),1,1,scene);}
}
global.OffscreenCanvas=Canvas;
global.window={BABYLON:{...B,Texture:LocalTexture},addEventListener(){},removeEventListener(){}};
for(const file of ['public/rendering/wasa-rendering.js','public/world/street-block.js'])vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
const street=window.WasaStreetBlock;
const mappedColliders=map.buildings.map(b=>({minX:Math.min(...b.p.map(p=>p[0]))-1,maxX:Math.max(...b.p.map(p=>p[0]))+1,
 minZ:Math.min(...b.p.map(p=>p[1]))-1,maxZ:Math.max(...b.p.map(p=>p[1]))+1}));
test('street block uses a mapped road without covering footprints or crossing streets',()=>{
 const layout=street.plan(map,mappedColliders);
 assert.ok(layout,'A clear site exists');assert.ok(map.roads.some(r=>r.id===layout.roadId));
 for(const rect of layout.rects){
   const box=street.bounds(layout,rect);
   assert.ok(!mappedColliders.some(c=>box.minX<c.maxX&&box.maxX>c.minX&&box.minZ<c.maxZ&&box.maxZ>c.minZ));
   assert.equal(street.crossesRoad(layout,rect,{p:[[layout.x,layout.z],[layout.x+layout.dx*30,layout.z+layout.dz*30]],width:layout.half*2}),false);
 }
 assert.equal(street.plan({roads:[]},[]),null);
});
test('street geometry stays bounded and leaves road and footway routes open',()=>{
 const engine=new B.NullEngine(),scene=new B.Scene(engine),colliders=[];
 try{
  const materials=new Map();
  const mat=(name,color,metal=0,roughness=1)=>{
    if(materials.has(name))return materials.get(name);
    const m=new B.PBRMaterial(name,scene);m.albedoColor=B.Color3.FromHexString(color);m.metallic=metal;m.roughness=roughness;materials.set(name,m);return m;
  };
  const finish=(m,x,y,z,material,parent)=>{m.position.set(x,y,z);m.material=material;m.parent=parent;m.metadata={wasaShadow:true};m.receiveShadows=true;return m;};
  const box=(name,x,y,z,w,h,d,m,parent)=>finish(B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene),x,y,z,m,parent);
  const cylinder=(name,x,y,z,top,bottom,height,m,parent)=>finish(B.MeshBuilder.CreateCylinder(name,{diameterTop:top,diameterBottom:bottom,height,tessellation:10},scene),x,y,z,m,parent);
  const layout=street.plan(map,mappedColliders),block=street.build(scene,layout,{mat,box,cylinder,colliders});
  assert.equal(block.stats.shops,7);assert.equal(block.stats.compounds,2);assert.equal(block.stats.trees,3);assert.equal(block.stats.drainBridges,8);
  assert.ok(block.stats.vertices<30000,'Street art stays within a small geometry budget');
  assert.equal(colliders.length,4);assert.ok(scene.meshes.every(m=>!m.parent));
  for(const mesh of scene.meshes){
    assert.ok(mesh.getVerticesData(B.VertexBuffer.PositionKind).every(Number.isFinite));
    mesh.computeWorldMatrix(true);
    assert.ok(B.Vector3.Distance(mesh.getBoundingInfo().boundingBox.centerWorld,new B.Vector3(layout.x,0,layout.z))<60);
  }
  for(let x=-28;x<=28;x+=.5)for(const z of [0,layout.half+1.5,-layout.half-1.5]){
    const p=street.point(layout,x,z);
    assert.ok(!colliders.some(c=>p[0]>c.minX-.45&&p[0]<c.maxX+.45&&p[1]>c.minZ-.45&&p[1]<c.maxZ+.45),'Walking route is clear');
  }
 }finally{engine.dispose();}
});
test('foliage asset is a compact RGBA PNG',()=>{
 const data=fs.readFileSync('public/assets/street-block/foliage-cluster-512.png');
 assert.equal(data.readUInt32BE(16),512);assert.equal(data.readUInt32BE(20),342);assert.equal(data[25],6);
 assert.ok(data.length<300000,'Foliage download stays below 300 KB');
});
