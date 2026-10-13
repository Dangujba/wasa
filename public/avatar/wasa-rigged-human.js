/* WASA Human v3.3: skinned wardrobe with a relaxed stance, shared clips and materials. */
(() => {
 'use strict';
 const B=window.BABYLON,procedural=window.WasaHuman;
 const templates=new WeakMap(),resolvedTemplates=new WeakMap();
 const assets={
   masculine:{file:'wasa-masculine.glb',height:1.81539,studioHeight:4.44,outfits:['jamfa','kaftan','shadda','babbar_riga','kanuri_robe','jallabiya']},
   feminine:{file:'wasa-feminine.glb',height:1.67002,studioHeight:4.30,outfits:['abaya','atamfa','buba_zani']}
 };
 const skins={deep:'#3E261E',rich:'#5C3828',warm:'#7A4D35',amber:'#9E6746',honey:'#BA835C',light:'#D69E74'};
 const fabrics={ivory:'#EDE5D2',midnight:'#152431',emerald:'#125447',sand:'#A8805E',indigo:'#28417A',burgundy:'#652A3C',rose:'#A85265',cocoa:'#543D32'};
 const trims={gold:'#E5BF74',ivory:'#F7EFE0',silver:'#C8D2D1',emerald:'#7ECBA8'};
 const bodyFor=cfg=>cfg.body==='feminine'?'feminine':'masculine';
 const eligible=cfg=>assets[bodyFor(cfg)].outfits.includes(cfg.outfit||(cfg.body==='feminine'?'abaya':'jamfa'));
 const robed=cfg=>['babbar_riga','kanuri_robe','jallabiya','atamfa','buba_zani','abaya'].includes(cfg.outfit);

 function preload(scene,body='masculine'){
   if(!templates.has(scene))templates.set(scene,new Map());
   const pendingForScene=templates.get(scene);
   if(pendingForScene.has(body))return pendingForScene.get(body);
   const assetURL='/avatar/models/'+assets[body].file+'?v=1.2.0';
   const pending=B.SceneLoader.LoadAssetContainerAsync('',assetURL,scene,undefined,'.glb').then(container=>{
     if(scene.isDisposed){container.dispose();return null;}
     if(!resolvedTemplates.has(scene))resolvedTemplates.set(scene,new Map());
     resolvedTemplates.get(scene).set(body,container);
     scene.onDisposeObservable.addOnce(()=>{container.dispose();templates.delete(scene);resolvedTemplates.delete(scene);});
     return container;
   }).catch(error=>{
     pendingForScene.delete(body);
     console.warn('[WASA] '+body+' wardrobe GLB unavailable; using existing character.',error);
     return null;
   });
   pendingForScene.set(body,pending);return pending;
 }

 function selected(name,cfg){
   if(name.startsWith('outfit '))return name.startsWith('outfit '+cfg.outfit+' ');
   if(name.startsWith('hair ')){
     const style='hair '+(cfg.hair||'short');
     return (cfg.headwear||'none')==='none'&&(name===style||name.startsWith(style+' '));
   }
   if(name.startsWith('headwear trim '))return name.startsWith('headwear trim '+cfg.headwear+' ');
   if(name.startsWith('headwear '))return name==='headwear '+cfg.headwear||name.startsWith('headwear '+cfg.headwear+' ');
   if(name.startsWith('facial ')){
     const style=cfg.facialHair||'none';
     return name==='facial '+style || (style==='full_beard'&&name==='facial moustache');
   }
   if(name.startsWith('accessory '))return name==='accessory '+cfg.accessory||name.startsWith('accessory '+cfg.accessory+' ');
   if(name==='footwear bare feet')return ['sandals','slippers'].includes(cfg.footwear);
   if(name.startsWith('footwear '))return name.startsWith('footwear '+(cfg.footwear||'leather')+' ');
   if(name.startsWith('diamond embroidery')||name==='pocket piping')return cfg.outfit!=='jallabiya';
   return true;
 }

 function configure(meshes,cfg){
   const materials=new Set();
   const preferred=cfg.outfit==='atamfa'?'atamfa printed fabric':cfg.outfit==='buba_zani'?'buba printed fabric':null;
   const printMaterial=meshes.map(m=>m.material).find(m=>m?.name===preferred);
   for(const mesh of meshes){
     if(printMaterial&&mesh.material?.name==='jamfa fabric'&&!mesh.name.startsWith('headwear '))mesh.material=printMaterial;
     if(mesh.material)materials.add(mesh.material);
     mesh.receiveShadows=true;mesh.isPickable=false;
     mesh.metadata={...mesh.metadata,wasaShadow:true,wasaCharacter:cfg.outfit+'-glb'};
   }
   for(const material of materials){
     // The container clones materials per actor; embedded textures stay shared.
     const name=material.name.replace(/^Clone of /,'');
     if(name==='skin')material.albedoColor=B.Color3.FromHexString(skins[cfg.skin]||skins.rich);
     if(name==='jamfa fabric'||name==='atamfa printed fabric'||name==='buba printed fabric'){
       const color=cfg.outfit==='jamfa'&&cfg.outfitColor==='ivory'?'#A5BDD9':cfg.outfit==='abaya'&&cfg.outfitColor==='rose'?'#A782AF':fabrics[cfg.outfitColor]||fabrics.ivory;
       material.albedoColor=B.Color3.FromHexString(color);
     }
     if(name==='scarf fabric')material.albedoColor=B.Color3.FromHexString(cfg.headwear==='hijab'?(cfg.outfitColor==='rose'?'#A782AF':fabrics[cfg.outfitColor]||fabrics.ivory):'#BD95AF');
     if(name==='jamfa embroidery'){
       material.albedoColor=B.Color3.FromHexString(trims[cfg.trimColor]||trims.silver);
       material.metallic=['gold','silver'].includes(cfg.trimColor)? .45:0;
       material.roughness=material.metallic?.52:.8;
     }
     if(name==='footwear leather'){
       material.albedoColor=B.Color3.FromHexString(cfg.footwear==='sneakers'?'#D6D8D0':cfg.footwear==='leather'?'#3B2720':'#61432E');
       material.roughness=cfg.footwear==='sneakers'?.85:.62;
     }
     material.environmentIntensity=.65;
   }
   return materials;
 }

 function animator(groups,cfg,secondary){
   // Sample the actual GLB keyframes. Using Animation.evaluate keeps pause and
   // deterministic fixed-step world movement aligned, with no competing engine
   // animation clock. Quaternion blending avoids a snap when movement changes.
   const wanted=robed(cfg)?['idle','robe_walk','robe_run']:['idle','walk','run'];
   const clips=new Map(wanted.map((name,i)=>[['idle','walk','run'][i],groups.find(g=>g.name===name)]));
   if([...clips.values()].some(group=>!group))throw Error('Wardrobe animation clips are incomplete.');
   const tracks=new Map();
   for(const [name,group] of clips){
     group.stop();
     for(const {target,animation} of group.targetedAnimations){
       const key=target.uniqueId+':'+animation.targetProperty;
       if(!tracks.has(key))tracks.set(key,{target,property:animation.targetProperty,clips:{}});
       tracks.get(key).clips[name]={animation,from:group.from,to:group.to};
     }
   }
   let time=0,phase=0,amount=0,running=0;
   const q1=new B.Quaternion(),q2=new B.Quaternion(),v1=new B.Vector3(),v2=new B.Vector3();
   function animate(dt,move=0,run=false,context={}){
     dt=Math.max(0,Math.min(dt||0,.08));time+=dt;
     const desired=Math.min(1,Math.abs(Number(move)||0)),ease=1-Math.exp(-dt*9);
     amount+=(desired-amount)*ease;running+=((run?1:0)-running)*ease;
     const stride=(robed(cfg)?.9:1.3)*(1-running)+(robed(cfg)?1.4:2.1)*running;
     const cadence=Number.isFinite(context.speed)?Math.min(3,context.speed/stride):(1-running)+running/.68;
     phase=(phase+dt*cadence)%1;
     for(const {target,property,clips:track} of tracks.values()){
       const sample=(clip,t)=>clip.animation.evaluate(clip.from+(clip.to-clip.from)*t);
       const idle=sample(track.idle,(time%4)/4),walk=sample(track.walk,phase),sprint=sample(track.run,phase);
       if(property==='rotationQuaternion'){
         B.Quaternion.SlerpToRef(walk,sprint,running,q1);
         B.Quaternion.SlerpToRef(idle,q1,amount,q2);
         if(!target.rotationQuaternion)target.rotationQuaternion=new B.Quaternion();
         target.rotationQuaternion.copyFrom(q2);
       }else if(property==='position'){
         B.Vector3.LerpToRef(walk,sprint,running,v1);B.Vector3.LerpToRef(idle,v1,amount,v2);
         target.position.copyFrom(v2);
       }
     }
     secondary?.apply(dt,context,amount);
   }
   animate(0);
   return {animate,status:()=>({source:'glb',clip:amount<.05?'idle':running>.5?'run':'walk',blend:amount,...secondary?.status()})};
 }

 function create(scene,cfg={},opts={}){
   if(!eligible(cfg))return procedural.create(scene,cfg,opts);
   const body=bodyFor(cfg),spec=assets[body];
   cfg={...cfg,outfit:cfg.outfit||(body==='feminine'?'abaya':'jamfa')};
   const root=new B.TransformNode('human:root',scene);
   const cached=resolvedTemplates.get(scene)?.get(body);
   let actor=cached?null:procedural.create(scene,cfg,opts),disposed=false,materials=null,instance=null,pivot=null;
   if(actor)actor.root.parent=root;
   const result={root,rig:actor?.rig,animate:(...args)=>actor?.animate(...args),
     getProfile:()=>actor?.getProfile()||{body:body==='feminine'?'female':'male',height:spec.studioHeight,source:'loading'},
     dispose:()=>{
       if(disposed)return;disposed=true;
       actor?.dispose();root.dispose(false,false);
     }};
   function instantiate(container){
     if(disposed||!container||scene.isDisposed)return false;
     try{
       instance=container.instantiateModelsToScene(name=>name,true,{doNotInstantiate:true});
       const allMeshes=instance.rootNodes.flatMap(n=>[n,...n.getChildMeshes()]).filter(n=>n instanceof B.Mesh);
       const allMaterials=new Set(allMeshes.map(m=>m.material).filter(Boolean));
       // Delete unused alternatives, reducing live meshes and draw calls.
       for(const mesh of allMeshes)if(!selected(mesh.name,cfg))mesh.dispose(false,false);
       const meshes=allMeshes.filter(m=>!m.isDisposed());
       materials=allMaterials;configure(meshes,cfg);
       pivot=new B.TransformNode('wardrobe studio scale',scene);
       pivot.parent=root;pivot.scaling.setAll(spec.studioHeight/spec.height);
       // Match WASA's existing -Z character forward axis. The GLB loader already
       // performs handedness conversion; this is just the facing convention.
       pivot.rotation.y=Math.PI;
       for(const node of instance.rootNodes)node.parent=pivot;
       const secondary=window.WasaMotion?.create(instance.skeletons[0],root,meshes);
       const motion=animator(instance.animationGroups,cfg,secondary);
       actor?.dispose();
       actor={root:pivot,animate:motion.animate,
         getProfile:()=>({body:body==='feminine'?'female':'male',height:spec.studioHeight,jointCount:42,source:'glb',outfit:cfg.outfit,
           clips:['idle','walk','run'],meshes:meshes.filter(m=>m.getTotalVertices()>0).length,
           vertices:meshes.reduce((sum,m)=>sum+m.getTotalVertices(),0),animation:motion.status()}),
         dispose:()=>{
           for(const group of instance.animationGroups)group.dispose();
           pivot.dispose(false,false);
           for(const skeleton of instance.skeletons)skeleton.dispose();
           for(const material of materials)material.dispose(false,false);
         }};
       result.rig=instance.skeletons[0];
       return true;
     }catch(error){
       if(instance){
         for(const group of instance.animationGroups)group.dispose();
         for(const node of instance.rootNodes)node.dispose(false,false);
         for(const skeleton of instance.skeletons)skeleton.dispose();
         for(const material of materials||[])material.dispose(false,false);
         pivot?.dispose(false,false);
       }
       console.warn('[WASA] Wardrobe instance failed; using existing character.',error);
       if(!actor){actor=procedural.create(scene,cfg,opts);actor.root.parent=root;result.rig=actor.rig;}
       return false;
     }
   }
   // After the first load, wardrobe edits clone synchronously and avoid building
   // a high-detail procedural stand-in only to discard it a moment later.
   result.ready=cached?Promise.resolve(instantiate(cached)):preload(scene,body).then(instantiate);
   return result;
 }
 window.WasaHuman={create,preload,eligible,version:'3.3.0-gait',proceduralVersion:procedural.version};
})();
