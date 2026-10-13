const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const B=require('../public/vendor/babylon.min.js');
const originalLoader=B.SceneLoader.LoadAssetContainerAsync;
const bundles=Object.fromEntries(['masculine','feminine'].map(body=>{
  const raw=fs.readFileSync('public/avatar/models/wasa-'+body+'.glb'),jsonLength=raw.readUInt32LE(12);
  return [body,{raw,gltf:JSON.parse(raw.subarray(20,20+jsonLength)),bin:raw.subarray(28+jsonLength),
    manifest:JSON.parse(fs.readFileSync('public/avatar/models/wasa-'+body+'.manifest.json'))}];
}));
const {gltf}=bundles.masculine;

// Load the shipped geometry, rig and clips through Babylon's real glTF loader.
// NullEngine does not decode PNGs; browser QA verifies the embedded material maps.
const runtime={BABYLON:B,TextDecoder,TextEncoder,console,setTimeout,clearTimeout};
runtime.self=runtime;runtime.window=runtime;runtime.global=runtime;
vm.runInNewContext(fs.readFileSync('public/vendor/babylonjs.loaders.min.js','utf8'),runtime,{filename:'Babylon loaders'});
function cpuGLB(body){
  const {gltf,bin}=bundles[body];
  const doc=JSON.parse(JSON.stringify(gltf));
  for(const mat of doc.materials){
    delete mat.normalTexture;delete mat.pbrMetallicRoughness.baseColorTexture;delete mat.pbrMetallicRoughness.metallicRoughnessTexture;
  }
  delete doc.images;delete doc.textures;delete doc.samplers;
  let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const header=Buffer.alloc(20),binHeader=Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);
  header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
  binHeader.writeUInt32LE(bin.length);binHeader.writeUInt32LE(0x004e4942,4);
  return new Uint8Array(Buffer.concat([header,json,binHeader,bin]));
}
function read(index,body='masculine'){
  const {gltf,bin}=bundles[body];
  const a=gltf.accessors[index],v=gltf.bufferViews[a.bufferView],stride={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type];
  const bytes=a.componentType===5126?4:a.componentType===5123?2:1;
  const method=a.componentType===5126?'readFloatLE':a.componentType===5123?'readUInt16LE':'readUInt8';
  return Array.from({length:a.count},(_,i)=>Array.from({length:stride},(_,j)=>bin[method]((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||stride*bytes)+j*bytes)));
}
class Canvas{
  constructor(w,h){this.width=w;this.height=h;}
  getContext(){return {createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage(){},clearRect(){}};}
}
function fixture(){
  global.OffscreenCanvas=Canvas;
  global.window={BABYLON:B,addEventListener(){},removeEventListener(){}};
  for(const file of ['public/rendering/wasa-rendering.js','public/avatar/wasa-human-lite.js','public/avatar/wasa-rigged-human.js'])
    vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});
  const engine=new B.NullEngine(),scene=new B.Scene(engine);
  new B.FreeCamera('test',new B.Vector3(0,2,-5),scene);
  let loads=0;
  B.SceneLoader.LoadAssetContainerAsync=(_root,url,s)=>{loads++;return originalLoader.call(B.SceneLoader,'',cpuGLB(url.includes('feminine')?'feminine':'masculine'),s,undefined,'.glb');};
  return {engine,scene,human:window.WasaHuman,loads:()=>loads,dispose(){B.SceneLoader.LoadAssetContainerAsync=originalLoader;engine.dispose();}};
}
const cfg={body:'masculine',outfit:'jamfa',skin:'rich',outfitColor:'ivory',trimColor:'silver',headwear:'none',hair:'short',facialHair:'none',footwear:'leather',accessory:'none'};

test('shipped GLB has bounded geometry, valid skin weights and seamless baked loops',()=>{
  for(const [body,{raw,gltf,manifest}] of Object.entries(bundles)){
  assert.equal(raw.length,raw.readUInt32LE(8));
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),manifest.sha256);
  assert.ok(raw.length<4_000_000,'Each body/wardrobe asset stays below 4 MB');
  assert.equal(gltf.skins[0].joints.length,42);
  assert.deepEqual(gltf.animations.map(a=>a.name),['idle','walk','run','robe_walk','robe_run']);
  for(const mesh of gltf.meshes){
    const p=mesh.primitives[0],positions=read(p.attributes.POSITION,body),indices=read(p.indices,body).flat();
    assert.ok(positions.every(p=>p.every(Number.isFinite)));
    assert.ok(indices.every(i=>i>=0&&i<positions.length));
    const weights=read(p.attributes.WEIGHTS_0,body),joints=read(p.attributes.JOINTS_0,body);
    assert.ok(weights.every(w=>Math.abs(w.reduce((s,v)=>s+v,0)-1)<1e-5));
    assert.ok(joints.flat().every(j=>j>=0&&j<42));
    for(const n of read(p.attributes.NORMAL,body))assert.ok(Math.abs(Math.hypot(...n)-1)<1e-5);
  }
  for(const animation of gltf.animations){
    for(const sampler of animation.samplers){
      const values=read(sampler.output,body);
      assert.ok(values[0].every((v,i)=>Math.abs(v-values.at(-1)[i])<1e-5),animation.name+' loops without a discontinuity');
    }
  }
  }
});

test('GLB instances animate, honour appearance choices and release resources on wardrobe changes',async()=>{
  const f=fixture();
  try{
    let reference;
    const looks=[...bundles.masculine.manifest.outfits.map(outfit=>({...cfg,outfit})),
      ...bundles.feminine.manifest.outfits.map(outfit=>({...cfg,body:'feminine',outfit,headwear:'hijab',hair:'braids'})),
      {...cfg,outfitColor:'emerald',skin:'honey',headwear:'hula',facialHair:'full_beard',accessory:'watch',footwear:'sandals'},cfg];
    for(const options of looks){
      const actor=f.human.create(f.scene,options,{detail:'medium'});
      assert.equal(await actor.ready,true);
      const profile=actor.getProfile(),meshes=actor.root.getChildMeshes().filter(m=>m.getTotalVertices());
      assert.equal(profile.source,'glb');assert.ok(profile.vertices<22000);assert.ok(meshes.length<=40,meshes.map(m=>m.name).join(', '));
      assert.equal(profile.outfit,options.outfit);assert.equal(actor.rig.bones.length,42);
      assert.equal(profile.body,options.body==='feminine'?'female':'male');
      const garments=meshes.filter(m=>m.name.startsWith('outfit '));
      assert.ok(garments.length>0&&garments.every(m=>m.name.startsWith('outfit '+options.outfit+' ')),'Only the selected garment is instantiated');
      assert.equal(meshes.some(m=>m.name.startsWith('headwear hula')),options.headwear==='hula');
      assert.equal(meshes.some(m=>m.name==='footwear bare feet'),options.footwear==='sandals');
      const skin=meshes.find(m=>m.material?.name==='skin').material;
      assert.ok(skin.albedoColor.equals(B.Color3.FromHexString(options.skin==='honey'?'#BA835C':'#5C3828')));
      const node=actor.rig.bones.find(b=>b.name==='upperleg01.L').getTransformNode();
      const before=node.rotationQuaternion.clone();
      for(let i=0;i<12;i++)actor.animate(1/60,1,false);
      assert.ok(Math.abs(B.Quaternion.Dot(before,node.rotationQuaternion))<.999,'Walk bends the skinned leg');
      const previous=node.rotationQuaternion.clone();actor.animate(1/60,1,true);
      assert.ok(Math.abs(B.Quaternion.Dot(previous,node.rotationQuaternion))>.99,'Run transition is continuous');
      for(let i=0;i<35;i++)actor.animate(1/60,1,true);
      assert.equal(actor.getProfile().animation.clip,'run');
      actor.dispose();
      const counts=[f.scene.meshes.length,f.scene.transformNodes.length,f.scene.skeletons.length,f.scene.animationGroups.length,f.scene.materials.length,f.scene.textures.length];
      if(!reference)reference=counts;
      else assert.deepEqual(counts,reference,'Wardrobe changes release meshes, skeletons, animations and materials');
    }
    assert.equal(f.loads(),2,'Male and female templates load once each per scene');
    const fallback=f.human.create(f.scene,{...cfg,outfit:'unknown'},{detail:'medium'});
    assert.equal(fallback.getProfile().body,'male');assert.equal(fallback.ready,undefined);fallback.dispose();
  }finally{f.dispose();}
});

test('disposing an avatar during loading does not resurrect it or leak a cloned rig',async()=>{
  const f=fixture();
  try{
    const actor=f.human.create(f.scene,cfg,{detail:'medium'});actor.dispose();
    assert.equal(await actor.ready,false);
    assert.ok(!f.scene.meshes.some(m=>m.name==='sculpted head and hands'));
    assert.equal(f.scene.skeletons.length,0);
  }finally{f.dispose();}
});

test('baked foot contact keeps the active sole above the floor during walk and run',async()=>{
  const f=fixture();
  try{
    for(const look of [cfg,{...cfg,outfit:'jallabiya'},{...cfg,body:'feminine',outfit:'abaya',headwear:'hijab'}]){
    const body=look.body,scale=bundles[body].manifest.heightMetres/1.81539;
    const actor=f.human.create(f.scene,look,{detail:'medium'});await actor.ready;
    actor.root.scaling.setAll((body==='feminine'?1.72:1.82)/actor.getProfile().height);
    const inverse=read(bundles[body].gltf.skins[0].inverseBindMatrices,body);
    const soles=['L','R'].map(side=>{
      const bone=actor.rig.bones.find(b=>b.name==='foot.'+side),index=actor.rig.bones.indexOf(bone),m=inverse[index];
      const pivot=new B.Vector3(-m[12],-m[13],-m[14]);
      return {node:bone.getTransformNode(),points:Array.from({length:32},(_,i)=>{
        const angle=i/32*Math.PI*2;
        return new B.Vector3(pivot.x+.064*scale*Math.cos(angle),.002*scale,(.096+.143*Math.sin(angle))*scale).subtract(pivot);
      })};
    });
    for(const run of [false,true]){
      for(let i=0;i<120;i++)actor.animate(1/60,1,run);
      for(let i=0;i<64;i++){
        actor.animate(1/60,1,run);
        const low=Math.min(...soles.flatMap(({node,points})=>{
          node.computeWorldMatrix(true);return points.map(p=>B.Vector3.TransformCoordinates(p,node.getWorldMatrix()).y);
        }));
        assert.ok(low>-.002&&low<.010,'Floor contact stays within 10 mm in world metres: '+low);
      }
    }
    actor.dispose();
    }
  }finally{f.dispose();}
});

test('female scarf, hair and accessory choices remain distinct on the skinned base',async()=>{
  const f=fixture();
  try{
    for(const [headwear,accessory] of [['hijab','none'],['gyale','none'],['kallabi','none'],['none','handbag'],['none','henna']]){
      const actor=f.human.create(f.scene,{...cfg,body:'feminine',outfit:'atamfa',hair:'braids',headwear,accessory},{detail:'medium'});
      assert.equal(await actor.ready,true);
      const meshes=actor.root.getChildMeshes();
      if(headwear!=='none')assert.ok(meshes.some(m=>m.name.startsWith('headwear '+headwear+' ')));
      else assert.ok(meshes.some(m=>m.name==='hair braids detail'));
      assert.equal(meshes.some(m=>m.name.startsWith('hair ')),headwear==='none');
      if(accessory!=='none')assert.ok(meshes.some(m=>m.name==='accessory '+accessory||m.name.startsWith('accessory '+accessory+' ')));
      assert.ok(meshes.find(m=>m.name==='tailored yoke and sleeves').material.name==='atamfa printed fabric');
      actor.dispose();
    }
    assert.equal(f.loads(),1);
  }finally{f.dispose();}
});
