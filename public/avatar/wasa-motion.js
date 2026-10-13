/* Additive head/cloth motion and two-bone foot placement on the shipped GLB rig. */
(() => {
 'use strict';
 const B=window.BABYLON,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const position=node=>{node.computeWorldMatrix(true);return node.getAbsolutePosition().clone();};
 function spring(state,target,dt,frequency=9,damping=1){
   for(let remaining=dt;remaining>1e-7;){
     const step=Math.min(remaining,1/120);remaining-=step;
     state.velocity+=(frequency*frequency*(target-state.value)-2*damping*frequency*state.velocity)*step;
     state.value+=state.velocity*step;
   }
   return state.value;
 }
 function rotateToward(node,from,to){
   const inverse=node.parent.getWorldMatrix().clone().invert();
   const a=B.Vector3.TransformNormal(from,inverse).normalize(),b=B.Vector3.TransformNormal(to,inverse).normalize();
   const delta=new B.Quaternion();B.Quaternion.FromUnitVectorsToRef(a,b,delta);
   node.rotationQuaternion=delta.multiply(node.rotationQuaternion||B.Quaternion.Identity()).normalize();
   node.computeWorldMatrix(true);
 }
 function solveLeg(leg,target){
   const hip=position(leg.hip),knee=position(leg.knee),ankle=position(leg.foot);
   const upper=B.Vector3.Distance(hip,knee),lower=B.Vector3.Distance(knee,ankle);
   const direction=target.subtract(hip),distance=clamp(direction.length(),Math.abs(upper-lower)+.002,upper+lower-.001);
   direction.normalize();
   // Retain the baked knee's bend plane; a forward pole stabilizes straight legs.
   let pole=knee.subtract(hip);pole.subtractInPlace(direction.scale(B.Vector3.Dot(pole,direction)));
   if(pole.length()<.025){
     pole=B.Vector3.TransformNormal(new B.Vector3(0,0,1),leg.hip.parent.getWorldMatrix());
     pole.subtractInPlace(direction.scale(B.Vector3.Dot(pole,direction)));
   }
   pole.normalize();
   const along=(upper*upper+distance*distance-lower*lower)/(2*distance),bend=Math.sqrt(Math.max(0,upper*upper-along*along));
   const wantedKnee=hip.add(direction.scale(along)).add(pole.scale(bend));
   rotateToward(leg.hip,knee.subtract(hip),wantedKnee.subtract(hip));
   const actualKnee=position(leg.knee),actualAnkle=position(leg.foot);
   rotateToward(leg.knee,actualAnkle.subtract(actualKnee),target.subtract(actualKnee));
 }
 function orientFoot(leg,up,forward){
   leg.foot.parent.computeWorldMatrix(true);
   const inverse=leg.foot.parent.getWorldMatrix().clone().invert();
   const y=B.Vector3.TransformNormal(up,inverse).normalize(),z=B.Vector3.TransformNormal(forward,inverse);
   z.subtractInPlace(y.scale(B.Vector3.Dot(y,z))).normalize();
   const x=B.Vector3.Cross(y,z).normalize();
   leg.foot.rotationQuaternion=B.Quaternion.RotationQuaternionFromAxis(x,y,z);
   leg.foot.computeWorldMatrix(true);
 }
 function create(skeleton,root,meshes){
   const nodes=new Map(skeleton.bones.map(b=>[b.name,b.getTransformNode()]));
   const head=nodes.get('head'),hips=nodes.get('root'),spine=nodes.get('spine01');
   const legs=['L','R'].map(side=>{
     const bone=skeleton.bones.find(b=>b.name==='foot.'+side);
     const sole=meshes.find(m=>m.name.startsWith('footwear ')&&m.name.includes(' sole '+side));
     const p=sole?.getVerticesData(B.VertexBuffer.PositionKind)||[],low=Math.min(...p.filter((_,i)=>i%3===1));
     const points=[];
     for(let i=0;i<p.length;i+=3)if(p[i+1]<low+.001){
       points.push(B.Vector3.TransformCoordinates(new B.Vector3(p[i],p[i+1],p[i+2]),bone.getAbsoluteInverseBindMatrix()));
     }
     return {side,hip:nodes.get('upperleg01.'+side),knee:nodes.get('lowerleg01.'+side),foot:bone.getTransformNode(),points,anchor:null};
   }).filter(leg=>leg.points.length&&leg.hip&&leg.knee&&leg.foot);
   const states=new Map(),state=name=>{if(!states.has(name))states.set(name,{value:0,velocity:0});return states.get(name);};
   let pelvis=0,contacts=[],previousPosition=null;
   function apply(dt,context={},amount=0){
     if(previousPosition&&B.Vector3.DistanceSquared(previousPosition,root.position)>1){states.clear();for(const leg of legs)leg.anchor=null;}
     previousPosition=root.position.clone();
     const yaw=spring(state('head'),clamp(context.lookYaw||0,-.55,.55),dt,7);
     if(head)head.rotationQuaternion=head.rotationQuaternion.multiply(B.Quaternion.FromEulerAngles(0,yaw,0));
     const inverse=root.computeWorldMatrix(true).clone().invert();
     const acceleration=B.Vector3.TransformNormal(new B.Vector3(context.acceleration?.x||0,0,context.acceleration?.z||0),inverse);
     const lean=spring(state('lean'),clamp(-acceleration.z*.008,-.045,.045),dt,8);
     if(spine)spine.rotationQuaternion=spine.rotationQuaternion.multiply(B.Quaternion.FromEulerAngles(lean,0,clamp((context.turnRate||0)*(context.speed||0)*-.006,-.045,.045)));
     for(const side of ['L','R'])for(const level of ['upper','lower']){
       const node=nodes.get('cloth_'+level+'.'+side);if(!node)continue;
       const gain=level==='lower'?1:.55;
       const pitch=spring(state(level+side+'x'),clamp(-acceleration.z*.020*gain,-.12,.12),dt,level==='lower'?7:9,.8);
       const roll=spring(state(level+side+'z'),clamp((acceleration.x*.016+(context.turnRate||0)*(context.speed||0)*.008)*gain,-.10,.10),dt,8,.8);
       node.rotationQuaternion=node.rotationQuaternion.multiply(B.Quaternion.FromEulerAngles(pitch,0,roll));
     }
     contacts=[];
     if(!context.sampleGround||!legs.length){pelvis=0;for(const leg of legs)leg.anchor=null;return;}
     const plans=legs.map(leg=>{
       const matrix=leg.foot.computeWorldMatrix(true),ankle=position(leg.foot),points=leg.points.map(p=>B.Vector3.TransformCoordinates(p,matrix));
       const bakedLow=Math.min(...points.map(p=>p.y-root.position.y));
       const centre=points.reduce((sum,p)=>sum.addInPlace(p),B.Vector3.Zero()).scale(1/points.length);
       const surface=context.sampleGround(centre.x,centre.z,root.position.y)||{height:root.position.y,normal:B.Vector3.Up()};
       const weight=clamp(1-(bakedLow-.005)/.085,0,1);
       const up=B.Vector3.TransformNormal(B.Vector3.Up(),matrix).normalize();
       const forward=B.Vector3.TransformNormal(new B.Vector3(0,0,1),matrix).normalize();
       const normal=B.Vector3.Lerp(up,surface.normal,weight).normalize();
       let target=ankle.clone();target.y+=surface.height-root.position.y;
       if(weight>.65&&amount>.15){
         if(!leg.anchor||Math.hypot(target.x-leg.anchor.x,target.z-leg.anchor.z)>.24)leg.anchor={x:target.x,z:target.z};
         target.x=leg.anchor.x;target.z=leg.anchor.z;
       }else leg.anchor=null;
       return {leg,target,bakedLow:Math.max(.005,bakedLow),normal,forward,surface};
     });
     const reachDrop=Math.min(0,...plans.map(({leg,target})=>{
       const hip=position(leg.hip),knee=position(leg.knee),ankle=position(leg.foot);
       const reach=B.Vector3.Distance(hip,knee)+B.Vector3.Distance(knee,ankle)-.003;
       const horizontal=Math.hypot(target.x-hip.x,target.z-hip.z);
       return target.y+Math.sqrt(Math.max(0,reach*reach-horizontal*horizontal))-hip.y;
     }));
     const desiredPelvis=clamp(Math.min(reachDrop,...plans.map(p=>p.surface.height-root.position.y)),-.22,0);
     // Rise gently, but keep a planted foot reachable during a rapid turn/stop.
     pelvis=Math.min(spring(state('pelvis'),desiredPelvis,dt,16),Math.max(-.22,reachDrop));
     const shift=B.Vector3.TransformNormal(new B.Vector3(0,pelvis,0),hips.parent.getWorldMatrix().clone().invert());
     hips.position.addInPlace(shift);hips.computeWorldMatrix(true);
     for(const plan of plans){
       const {leg,normal,forward}=plan;
       for(let i=0;i<2;i++){
         solveLeg(leg,plan.target);orientFoot(leg,normal,forward);
         const matrix=leg.foot.getWorldMatrix();let clearance=Infinity;
         for(const p of leg.points){
           const point=B.Vector3.TransformCoordinates(p,matrix),floor=context.sampleGround(point.x,point.z,root.position.y);
           if(floor)clearance=Math.min(clearance,point.y-floor.height);
         }
         if(Number.isFinite(clearance))plan.target.y+=clamp(plan.bakedLow-clearance,-.2,.2);
         if(i===1)contacts.push({side:leg.side,clearance,planted:!!leg.anchor,surface:plan.surface.name});
       }
     }
   }
   return {apply,status:()=>({footIK:contacts.length===2,pelvis,contacts,headYaw:state('head').value})};
 }
 window.WasaMotion={create};
})();
