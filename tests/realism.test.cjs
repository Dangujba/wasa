const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const B = require('../public/vendor/babylon.min.js');

// NullEngine needs a canvas for CPU texture generation, but no GPU for geometry.
class Canvas {
  constructor(width, height) { this.width=width; this.height=height; }
  getContext() { return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage(){},clearRect(){}}; }
}
global.OffscreenCanvas = Canvas;
function fixture() {
  const engine = new B.NullEngine();
  const scene = new B.Scene(engine);
  const context = global;
  context.window={BABYLON:B,addEventListener(){},removeEventListener(){}};
  for(const file of ['public/rendering/wasa-rendering.js','public/avatar/wasa-human-lite.js']) {
    vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
  }
  return {engine,scene,context,rendering:context.window.WasaRendering,human:context.window.WasaHuman};
}
function worldFixture(f) {
  const source=fs.readFileSync('public/world/world.js','utf8');
  Object.assign(f.context,{B,world:{scene:f.scene,mats:{},colliders:[],buildingCount:0},
    colors:{cream:'#DEC5A5',stone:'#C5A88C',wall:'#B09470',pink:'#B8836C',mint:'#7A9B89',roof:'#7A6552'},
    clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),rand:n=>{const v=Math.sin(n*127.13+23.1)*43758.5453;return v-Math.floor(v);},
    roadAt:()=>({distance:10})});
  for(const name of ['mat','meshBox','signedArea','triangulate','buildBuilding','optimizeStaticMeshes']) {
    const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);
    assert.ok(start>=0&&end>start,'Function exists: '+name);
    vm.runInThisContext(source.slice(start,end));
  }
  return f.context;
}
test('building normals, UVs and roofs follow both footprint windings',()=>{
  const f=fixture(),world=worldFixture(f);
  const outline=[[120,70],[140,75],[135,90],[115,85]];
  for(const p of [outline,outline.slice().reverse()]){
    world.buildBuilding({id:'fixture',p,height:6},1);
    const mesh=f.scene.meshes.filter(m=>m.name==='OSM building fixture').at(-1);
    const positions=mesh.getVerticesData(B.VertexBuffer.PositionKind),normals=mesh.getVerticesData(B.VertexBuffer.NormalKind),uvs=mesh.getVerticesData(B.VertexBuffer.UVKind);
    assert.equal(uvs.length,positions.length/3*2);
    for(let i=0;i<positions.length;i+=3){
      const outward=normals[i]*(positions[i]-127.5)+normals[i+2]*(positions[i+2]-80);
      assert.ok(outward>0,'Wall points outward');
      assert.ok(Math.abs(normals[i+1])<.001,'Wall remains vertical');
    }
    const roof=f.scene.meshes.filter(m=>m.name==='footprint roof fixture').at(-1);
    assert.equal(roof.getTotalVertices(),outline.length);
    assert.ok(roof.getVerticesData(B.VertexBuffer.NormalKind).filter((_,i)=>i%3===1).every(y=>y>.99));
    const parapets=f.scene.meshes.filter(m=>m.name==='footprint parapet');
    assert.ok(parapets.every(m=>m.position.y===6.24));
  }
  f.engine.dispose();
});
test('static batching retains shadow casters and receivers',()=>{
  const f=fixture(),world=worldFixture(f);
  const material=new B.StandardMaterial('fixture',f.scene);
  world.meshBox('one',10,2,10,3,4,3,material);
  world.meshBox('two',20,2,10,3,4,3,material);
  world.optimizeStaticMeshes();
  assert.equal(f.scene.meshes.length,1);
  assert.equal(f.scene.meshes[0].metadata.wasaShadow,true);
  assert.equal(f.scene.meshes[0].receiveShadows,true);
  f.engine.dispose();
});
test('world character is cheaper than studio detail and stays articulated',()=>{
  const f=fixture();
  const configs=[{outfit:'kaftan',headwear:'none',trimColor:'ivory'},
    {body:'feminine',outfit:'abaya',headwear:'hijab',trimColor:'gold'},
    {outfit:'babbar_riga',headwear:'rawani',trimColor:'silver'}];
  for(const config of configs){
    let actor=f.human.create(f.scene,config);
    const studio=actor.root.getChildMeshes().reduce((sum,m)=>sum+m.getTotalVertices(),0);
    actor.dispose();
    actor=f.human.create(f.scene,config,{detail:'medium'});
    const meshes=actor.root.getChildMeshes(),vertices=meshes.reduce((sum,m)=>sum+m.getTotalVertices(),0);
    assert.ok(vertices<studio*.8,'World detail reduces geometry: '+JSON.stringify({config,studio,vertices}));
    assert.ok(meshes.length<55,'Meshes are merged by joint');
    for(const mesh of meshes){
      assert.ok(mesh.getVerticesData(B.VertexBuffer.PositionKind).every(Number.isFinite));
      assert.equal(mesh.receiveShadows,true);
    }
    actor.animate(.05,1,true);
    assert.ok(actor.rig.legs.some(part=>Math.abs(part.hip.rotation.x)>.001));
    actor.dispose();assert.equal(f.scene.meshes.length,0,'Wardrobe changes release mesh resources');
    assert.equal(f.scene.materials.length,0,'Wardrobe changes release material resources');
  }
  f.engine.dispose();
});
test('normal textures are shared within a scene and never across scenes',()=>{
  const f=fixture();
  const a=f.rendering.clothNormal(f.scene),b=f.rendering.clothNormal(f.scene);
  assert.equal(a,b);assert.equal(a.gammaSpace,false);
  const other=new B.Scene(f.engine),c=f.rendering.clothNormal(other);
  assert.notEqual(a,c);assert.equal(c.getScene(),other);
  f.engine.dispose();
});
test('auto reduces graphics after sustained low FPS without overriding manual mode',()=>{
  const f=fixture();
  global.document={hidden:false,hasFocus:()=>true};
  window.matchMedia=()=>({matches:false});
  const camera=new B.FreeCamera('test',new B.Vector3(0,3,-5),f.scene);
  const sun=new B.DirectionalLight('test sun',new B.Vector3(-.5,-1,.5),f.scene);
  const center=B.Vector3.Zero();
  const graphics=f.rendering.createQuality(f.scene,camera,sun,'auto');
  graphics.status.ready=true;
  for(let i=0;i<100;i++)graphics.sample(.1,center);
  assert.equal(graphics.status.tier,'low');
  assert.equal(graphics.status.ao,false);assert.equal(graphics.status.bloom,false);
  graphics.setMode('medium',center);
  for(let i=0;i<100;i++)graphics.sample(.1,center);
  assert.equal(graphics.status.tier,'medium');
  graphics.dispose();delete global.document;f.engine.dispose();
});
