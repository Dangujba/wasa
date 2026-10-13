/* WASA Human Studio renderer v0.5.0
   Shares the original WASA Human articulated-character system with the 3D city. */
(() => {
 'use strict';
 class WasaAvatar3D{
  constructor(canvas,onReady,onError){
   this.canvas=canvas;this.B=window.BABYLON;this.scene=null;this.engine=null;
   this.camera=null;this.actor=null;this.current=null;this.enabled=true;this.loaded=false;
   this.time=performance.now();this.resources=new Map();this.pose='idle';
   try {
    if(!this.B||!this.B.Engine.isSupported()||!window.WasaHuman)throw Error('The 3D engine or human model is unavailable.');
    this.engine=new this.B.Engine(canvas,true,{stencil:true,powerPreference:'high-performance'});
    this.engine.setHardwareScalingLevel(Math.min(window.devicePixelRatio||1,1.6));
    this.setup();
    this.engine.runRenderLoop(()=>{
      if(!this.scene)return;
      const now=performance.now(),dt=Math.min((now-this.time)/1000,.05);this.time=now;
      if(this.actor&&this.enabled)this.actor.animate(dt,this.pose==='idle'?0:1,this.pose==='run');
      this.graphics?.sample(dt,this.camera.target);
      this.scene.render();
    });
    window.addEventListener('resize',()=>this.engine?.resize(),{passive:true});
    this.loaded=true;
    requestAnimationFrame(()=>onReady?.());
   }catch(error){onError?.(error);}
  }
  material(key,hex,shine=.1){
   if(this.resources.has(key))return this.resources.get(key);
   const m=new this.B.StandardMaterial(key,this.scene);
   m.diffuseColor=this.B.Color3.FromHexString(hex);
   m.ambientColor=m.diffuseColor.scale(.2);
   m.specularColor=new this.B.Color3(shine,shine,shine);
   this.resources.set(key,m);return m;
  }
  setup(){
   const B=this.B,sc=new B.Scene(this.engine);this.scene=sc;
   sc.clearColor=new B.Color4(.42,.55,.57,1);
   sc.ambientColor=new B.Color3(.23,.27,.26);
   sc.fogMode=B.Scene.FOGMODE_EXP2;sc.fogDensity=.007;sc.fogColor=new B.Color3(.39,.50,.51);
   window.WasaRendering.environment(sc);
   const hemi=new B.HemisphericLight('studio softbox',new B.Vector3(0,1,0),sc);
   hemi.intensity=.28;hemi.diffuse=new B.Color3(.93,.96,1);
   const key=new B.DirectionalLight('warm directional',new B.Vector3(-.5,-1,.45),sc);
   key.intensity=2.2;key.diffuse=new B.Color3(1,.94,.83);
   const rim=new B.PointLight('soft edge',new B.Vector3(-3.0,4.5,3),sc);
   rim.intensity=.42;rim.diffuse=new B.Color3(.75,.88,.86);rim.range=16;
   const camera=new B.ArcRotateCamera('human studio camera',-Math.PI/2,1.36,7.25,new B.Vector3(0,2.35,0),sc);
   camera.lowerRadiusLimit=5.0;camera.upperRadiusLimit=10.2;
   camera.lowerBetaLimit=.66;camera.upperBetaLimit=1.72;
   camera.wheelDeltaPercentage=.023;camera.panningSensibility=0;
   camera.inertia=.65;camera.minZ=.05;camera.attachControl(this.canvas,true);
   if(camera.inputs.attached.pointers)camera.inputs.attached.pointers.buttons=[0];
   this.camera=camera;
   this.graphics=window.WasaRendering.createQuality(sc,camera,key,'auto',{shadowRadius:8});
   const base=B.MeshBuilder.CreateCylinder('studio exhibition plinth',{diameter:4.55,height:.27,tessellation:64},sc);
   base.position.y=-.015;base.material=this.material('plinth','#386268',.16);
   const floor=B.MeshBuilder.CreateGround('studio floor',{width:70,height:70},sc);
   floor.position.y=-.16;floor.material=this.material('ground','#748F87');floor.receiveShadows=true;
   base.receiveShadows=true;
   for(const rad of [2.06,1.83]){
    const tor=B.MeshBuilder.CreateTorus('lit floor detail',{diameter:rad*2,thickness:rad===2.06?.029:.016,tessellation:72},sc);
    tor.position.y=.142;tor.material=this.material(rad===2.06?'outer ring':'inner ring',rad===2.06?'#D5B37A':'#75AE9F',.20);
   }
  }
  make(cfg){
   if(!this.scene)return;
   if(!window.WasaHuman)throw Error('Human builder is unavailable.');
   if(this.actor){this.actor.dispose();this.actor=null;}
   this.current={...cfg};
   this.actor=window.WasaHuman.create(this.scene,cfg);
   this.actor.root.position.y=.12;
   const actor=this.actor;
   const loader=document.getElementById('viewport-loader');
   if(actor.ready&&loader)loader.hidden=false;
   const refresh=()=>{
     if(this.actor!==actor)return;
     this.canvas.dataset.avatarSource=actor.getProfile().source||'procedural';
     this.graphics.setCandidates(actor.root.getChildMeshes());
     this.graphics.updateShadows(this.camera.target,true);
   };
   refresh();
   if(actor.ready)actor.ready.then(()=>this.scene.whenReadyAsync()).then(()=>{
     if(this.actor!==actor)return;
     refresh();if(loader)loader.hidden=true;
   }).catch(error=>{
     if(this.actor!==actor)return;
     console.warn('[WASA] Character preparation failed',error);
     if(loader)loader.hidden=true;
   });
   else if(loader)loader.hidden=true;
   this.graphics.status.ready=true;
   this.graphics.updateShadows(this.camera.target,true);
   this.scene.render();
   return this.actor;
  }
  resetCamera(){
   if(!this.camera)return;
   this.camera.alpha=-Math.PI/2;this.camera.beta=1.36;this.camera.radius=7.25;
   this.camera.setTarget(new this.B.Vector3(0,2.35,0));
  }
  orbit(d){if(this.camera)this.camera.alpha+=d;}
  setPose(mode){if(['idle','walk','run'].includes(mode))this.pose=mode;}
 }
 window.WasaAvatar3D=WasaAvatar3D;
})();
