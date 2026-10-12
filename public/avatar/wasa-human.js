/* WASA Human v1.0 | Original anatomical character builder for Babylon.js
   Design inspiration: articulated human skeleton / skinned-model workflow.
   No third-party character meshes are copied. Procedural proportions and pivot rig. */
(() => {
'use strict';
const skins={deep:'#452D25',rich:'#694333',warm:'#8C5D45',amber:'#AA7859',honey:'#CA9872',light:'#E2B18A'};
const fabrics={ivory:'#E8DDC6',midnight:'#182A39',emerald:'#176656',sand:'#AF8866',indigo:'#314C8D',burgundy:'#733347',rose:'#B75E71',cocoa:'#61483C'};
const trims={gold:'#E6C07C',ivory:'#F4ECD9',silver:'#C3CDCC',emerald:'#82CEAD'};
const colors={hair:'#192025',eyes:'#171E23',white:'#DFD6C7',lip:'#673D38',shoe:'#543E33'};
const robes=new Set(['babbar_riga','kanuri_robe','jallabiya','atamfa','buba_zani','abaya']);
function build(scene,cfg={},opts={}){
 const B=window.BABYLON;
 if(!B||!scene)throw Error('BABYLON scene is required');
 const feminine=cfg.body==='feminine';
 const should=feminine?.54:.72, hips=feminine?.56:.44, waist=feminine?.34:.46, chest=feminine?.51:.62;
 const legGap=feminine?.29:.31;
 const skinCol=skins[cfg.skin]||skins.rich;
 const color=fabrics[cfg.outfitColor]||fabrics.ivory;
 const stitchCol=trims[cfg.trimColor]||trims.gold;
 const mats=new Map();
 function mat(name,hex,shine=.07){
   const k=name+hex+shine;
   if(mats.has(k))return mats.get(k);
   const m=new B.StandardMaterial('human '+name+' '+hex,scene);
   m.diffuseColor=B.Color3.FromHexString(hex);
   m.specularColor=new B.Color3(shine,shine,shine);
   m.ambientColor=m.diffuseColor.scale(.18);
   m.backFaceCulling=false;
   mats.set(k,m);return m;
 }
 const skin=mat('skin',skinCol,.10),cloth=mat('woven fabric',color,.04),trim=mat('embroidery',stitchCol,.16),
   dark=mat('hair',colors.hair,.03),eyes=mat('eyes',colors.eyes,.10),
   white=mat('sclera',colors.white,.06), lips=mat('lips',colors.lip,.04),
   leather=mat('footwear',cfg.footwear==='sneakers'?'#DADBD3':cfg.footwear==='leather'?'#3F2B25':colors.shoe,.10),
   fabricAlt=mat('fabric accent',cfg.outfitColor==='ivory'?'#D3B998':'#C1B1A0',.03);
 const root=new B.TransformNode('human:root',scene);
 const motion=new B.TransformNode('human:motion',scene);
 motion.parent=root;
 if(feminine)motion.scaling.y=.97;
 function node(name,parent=motion,x=0,y=0,z=0){
   const n=new B.TransformNode('bone:'+name,scene);
   n.parent=parent;n.position.set(x,y,z);return n;
 }
 function sphere(name,parent,x,y,z,sx,sy,sz,material,segments=20){
   const m=B.MeshBuilder.CreateSphere(name,{diameter:1,segments},scene);
   m.parent=parent;m.position.set(x,y,z);m.scaling.set(sx*2,sy*2,sz*2);m.material=material;
   m.isPickable=false;return m;
 }
 function tube(name,parent,coords,radius,material){
   const m=B.MeshBuilder.CreateTube(name,{path:coords.map(p=>new B.Vector3(...p)),radius,tessellation:8,cap:B.Mesh.CAP_ALL},scene);
   m.parent=parent;m.material=material;m.isPickable=false;return m;
 }
 function cylinder(name,parent,x,y,z,height,top,bottom,material,segments=24){
   const m=B.MeshBuilder.CreateCylinder(name,{height,diameterTop:top,diameterBottom:bottom,tessellation:segments},scene);
   m.parent=parent;m.position.set(x,y,z);m.material=material;m.isPickable=false;return m;
 }
 function box(name,parent,x,y,z,w,h,d,material){
   const m=B.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);
   m.parent=parent;m.position.set(x,y,z);m.material=material;m.isPickable=false;return m;
 }
 function ellipsoidProfiles(name,parent,levels,material,segments=28){
   // Anatomical loft: measured torso/hip/waist and chest rings, elliptical depth.
   const points=[],indices=[],uvs=[],normals=[];
   for(let j=0;j<levels.length;j++){
     const [y,rx,rz,zOffset=0]=levels[j];
     for(let k=0;k<segments;k++){
       const a=k*Math.PI*2/segments;
       points.push(Math.cos(a)*rx,y,zOffset+Math.sin(a)*rz);
       uvs.push(k/segments,j/(levels.length-1));
     }
   }
   for(let j=0;j<levels.length-1;j++)for(let k=0;k<segments;k++){
     const a=j*segments+k,b=j*segments+(k+1)%segments,c=a+segments,d=b+segments;
     indices.push(a,c,b,b,c,d);
   }
   // Closed geometry
   for(let k=1;k<segments-1;k++){indices.push(0,k,k+1);const top=(levels.length-1)*segments;indices.push(top,top+k+1,top+k);}
   B.VertexData.ComputeNormals(points,indices,normals);
   const data=new B.VertexData();
   data.positions=points;data.indices=indices;data.normals=normals;data.uvs=uvs;
   const m=new B.Mesh(name,scene);data.applyToMesh(m);
   m.parent=parent;m.material=material;m.isPickable=false;
   return m;
 }
 // A visible body under the costume: gender-dependent shoulder, ribcage, waist, hip profiles.
 ellipsoidProfiles('anatomical torso',motion,[
   [1.99,hips*.85,.27],[2.10,hips,.32],[2.40,waist,.29],
   [2.63,feminine?.41:.54,.35],[2.88,chest,.36],
   [3.06,should*.87,.31],[3.20,should*.94,.30],[3.33,.29,.22]
 ],skin);
 const pelvis=sphere('pelvis',motion,0,1.99,0,hips,.27,.33,skin);
 // Clavicle and neck.
 const neck=cylinder('neck',motion,0,3.39,-.006,.27,.30,.31,skin,20);
 // Clothing follows curved body, with tailored waist and silhouette instead of block geometry.
 const outfit=cfg.outfit||'kaftan';
 const long=robes.has(outfit);
 const wing=outfit==='babbar_riga';
 const dress=feminine && ['atamfa','buba_zani','abaya'].includes(outfit);
 const hemY=long ? .59 : outfit==='jamfa'?1.79:1.28;
 const hemX=wing?1.08:dress?.91:long?.74:.62;
 ellipsoidProfiles('tailored '+outfit,motion,[
   [hemY,hemX,hemX*.68],[hemY+.065,hemX*1.01,hemX*.70],
   [Math.max(1.77,hemY+.44),long?Math.max(.59,hips*.98):hips*.91,.34],
   [2.10,hips*.99,.32],[2.43,waist+.065,.32],
   [2.73,chest*.97,.35],[3.02,should*.86,.33],
   [3.20,should*.88,.29],[3.29,.26,.23]
 ],cloth,32);
 // Under-robe curve and embroidered hem.
 if(long)ellipsoidProfiles('decorated robe hem',motion,[
   [hemY+.04,hemX*1.003,hemX*.692],
   [hemY+.13,hemX*1.015,hemX*.705]
 ],trim,28);
 tube('front embroidered placket',motion,[
   [0,3.18,-.31],[0,3.02,-.34],[0,2.72,-.37],[0,2.44,-.35]
 ],.025,trim);
 for(const side of [-1,1]){
   tube('northern embroidery '+side,motion,[
     [side*.10,3.10,-.34],[side*.18,2.98,-.34],
     [side*.15,2.81,-.36],[side*.26,2.72,-.34],
     [side*.17,2.58,-.34]
   ],.014,trim);
 }
 // Collar and V-neck detail.
 tube('embroidered collar',motion,[[-.19,3.26,-.25],[-.13,3.20,-.32],[0,3.17,-.35],[.13,3.20,-.32],[.19,3.26,-.25]],.035,trim);
 if(outfit==='atamfa'||outfit==='buba_zani'){
   const pattern=mat('woven pattern',cfg.trimColor==='gold'?'#D9AE68':stitchCol,.08);
   for(let k=0;k<4;k++)for(const side of [-1,1]){
     const y=1.04+k*.37,z=-Math.min(hemX*.52,.56);
     tube('atamfa trim '+k+' '+side,motion,[
       [side*.15,y,z],[side*.26,y+.11,z],[side*.36,y,z]
     ],.017,pattern);
   }
 }
 if(outfit==='shadda'||outfit==='babbar_riga'){
   for(const side of [-1,1])tube('delicate shadda stripe '+side,motion,[
     [side*.33,2.94,-.30],[side*.42,2.56,-.32],[side*.41,2.21,-.32]
   ],.012,trim);
 }
 const bones={arms:[],legs:[],head:null,torso:motion};
 // Hinged shoulders, elbows and wrists, suitable for dynamic pose and locomotion.
 for(const side of [-1,1]){
   const shoulder=node('shoulder'+side,motion,side*should,3.16,-.02);
   const upper=sphere('upper sleeve',shoulder,side*.02,-.31,0,.195,.375,.205,cloth);
   upper.rotation.z=-side*.045;
   const elbow=node('elbow'+side,shoulder,side*.10,-.64,0);
   sphere('sleeve forearm',elbow,0,-.29,0,.164,.345,.181,cloth);
   const wrist=node('wrist'+side,elbow,0,-.57,0);
   sphere('human palm',wrist,0,-.113,-.015,.105,.157,.080,skin,18);
   sphere('human thumb',wrist,-side*.087,-.08,-.075,.041,.085,.048,skin,12);
   for(let finger=0;finger<4;finger++){
     const x=(finger-1.5)*.045;
     sphere('articulated finger '+side+' '+finger,wrist,x,-.252-(finger===0||finger===3?-.02:.008),-.03,.022,.083,.028,skin,10);
   }
   if(wing){
     // Sleeve-mounted fabric panels swing naturally with the arm.
     ellipsoidProfiles('flowing sleeve '+side,shoulder,[
       [-1.00,.46,.25],[-.62,.50,.30],[-.32,.41,.33],[-.02,.20,.24]
     ],cloth,18).position.x=side*.07;
   }
   cylinder('embroidered sleeve cuff',elbow,0,-.47,0,.045,.34,.37,trim,20);
   bones.arms.push({shoulder,elbow,wrist,side});
   const hip=node('hip'+side,motion,side*legGap,1.97,0);
   sphere('upper leg',hip,0,-.43,.015,.235,.52,.26,mat('trousers',outfit==='jamfa'?color:'#C9BC9F'));
   const knee=node('knee'+side,hip,0,-.92,0);
   sphere('shin',knee,0,-.35,0,.17,.43,.21,mat('lower trousers','#BBAF96'));
   const ankle=node('ankle'+side,knee,0,-.77,0);
   sphere('shoe',ankle,0,-.08,-.17,.20,.13,.38,leather);
   if(cfg.footwear==='sandals'||cfg.footwear==='slippers'){
     box('sandal band',ankle,0,-.03,-.38,.38,.055,.13,trim);
   }
   bones.legs.push({hip,knee,ankle,side});
 }
 // Neck -> head joint and sculpted facial silhouette with natural ears, nose, eyelids and lips.
 const head=node('head',motion,0,3.44,0);
 bones.head=head;
 const faceY=.42;
 sphere('skull',head,0,faceY,.015,feminine?.324:.355,.425,.322,skin,32);
 // Jawline and cheek volume make it recognizably human without copied mesh art.
 sphere('jaw',head,0,.235,-.067,feminine?.260:.295,.217,.259,skin,24);
 for(const side of [-1,1]){
   sphere('cheek'+side,head,side*.205,.34,-.124,.104,.139,.073,skin,18);
   sphere('ear'+side,head,side*.326,.434,.024,.048,.094,.050,skin,16);
   sphere('eyewhite'+side,head,side*.133,.486,-.292,.069,.040,.019,white,18);
   sphere('iris'+side,head,side*.133,.482,-.311,.028,.032,.014,eyes,14);
   sphere('eyelid'+side,head,side*.132,.528,-.301,.074,.012,.015,skin,14);
   const eyebrow=tube('eyebrow'+side,head,[
     [side*.047,.603,-.296],[side*.130,.620,-.292],[side*.221,.611,-.254]
   ],.010,dark);
 }
 sphere('bridge of nose',head,0,.393,-.310,.045,.123,.064,skin,20);
 sphere('nose tip',head,0,.304,-.341,.064,.059,.071,skin,18);
 sphere('lower lip',head,0,.168,-.293,.083,.017,.023,lips,18);
 sphere('upper lip',head,0,.195,-.289,.087,.015,.024,lips,16);
 if(feminine){
   // Very subtle eyelashes; gender difference is principally skeletal proportions.
   for(const side of [-1,1]){
     tube('upper lash '+side,head,[[side*.08,.559,-.320],[side*.14,.571,-.319],[side*.21,.553,-.291]],.010,dark);
   }
 }
 const beard=cfg.facialHair||'none';
 if(beard==='moustache'||beard==='full_beard')
   for(const side of [-1,1])sphere('moustache'+side,head,side*.075,.229,-.331,.103,.036,.025,dark,14);
 if(beard==='goatee'||beard==='full_beard'){
   sphere('chin facial hair',head,0,.105,-.198,beard==='full_beard'?.245:.133,beard==='full_beard'?.139:.095,.185,dark,16);
   if(beard==='full_beard')for(const side of [-1,1])
     sphere('jaw beard'+side,head,side*.215,.223,-.190,.115,.173,.133,dark,14);
 }
 // Hair and headwear attach to head bone, not the body.
 function hairGeometry(){
   const hairStyle=cfg.hair||'short';
   sphere('scalp hair',head,0,.741,.068,.338,.143,.303,dark,24);
   if(hairStyle==='curls'){
     for(let k=0;k<18;k++){
       const a=k*Math.PI*2/18;
       sphere('curl',head,Math.sin(a)*.29,.781+(k%3)*.035,Math.cos(a)*.25,.085,.088,.083,dark,10);
     }
   }else if(hairStyle==='locs'||hairStyle==='braids'){
     for(let k=0;k<12;k++){
       const a=k*Math.PI*2/12;
       const x=Math.sin(a)*.30,z=Math.cos(a)*.265;
       tube('hair strand',head,[[x,.73,z],[x*1.1,.47,z*1.2],[x*1.14,.16,z*1.25]],
         hairStyle==='locs'?.047:.030,dark);
     }
   }else if(hairStyle==='short'){
     sphere('short top hair',head,0,.757,.04,.30,.11,.29,dark,20);
   }
 }
 const hat=cfg.headwear||'none';
 if(hat==='none')hairGeometry();
 else if(['hijab','gyale','kallabi'].includes(hat)){
   const scarf=hat==='hijab'?cloth:mat('neutral scarf',feminine?'#CFA68D':'#D7BC9E');
   sphere('wrapped headscarf',head,0,.69,.100,.40,.27,.36,scarf,24);
   ellipsoidProfiles('draped scarf',head,[
     [-.28,.49,.29],[-.08,.53,.31],[.11,.43,.33],[.38,.36,.31],[.69,.34,.29]
   ],scarf,24);
   tube('scarf face opening',head,[[-.30,.58,-.18],[-.24,.71,-.21],[0,.76,-.25],[.24,.71,-.21],[.30,.58,-.18]],.026,trim);
 }
 else if(hat==='rawani'){
   sphere('turban base',head,0,.78,.03,.40,.18,.35,cloth);
   for(let n=0;n<4;n++){
     const tor=B.MeshBuilder.CreateTorus('wrapped rawani',{diameter:.80+n*.006,thickness:.115,tessellation:36},scene);
     tor.parent=head;tor.position.y=.70+n*.093;tor.rotation.z=n*.08;tor.material=n%2?trim:cloth;
   }
   box('rawani tail',head,.36,.39,.22,.15,.69,.13,cloth).rotation.z=.18;
 }
 else{
   const capRadius=hat==='dara'?.68:hat==='bama'?.69:.63;
   cylinder('Northern Nigerian cap',head,0,.810,.036,.27,capRadius,capRadius*.99,hat==='bama'?trim:cloth,32);
   cylinder('cap base band',head,0,.695,.036,.055,capRadius*1.05,capRadius*1.05,trim,32);
   for(let i=0;i<12;i++){
     const a=i*2*Math.PI/12;
     sphere('cap stitch',head,Math.sin(a)*capRadius*.47,.82,Math.cos(a)*capRadius*.47,.018,.040,.022,trim,8);
   }
 }
 // Accessories attached to rigged joints.
 const accessory=cfg.accessory||'none';
 if(accessory==='beads'){
   for(let k=0;k<17;k++){
     const a=k*Math.PI*2/17;
     sphere('neck beads',motion,Math.sin(a)*.24,3.24,Math.cos(a)*.24,.038,.038,.038,trim,9);
   }
 }else if(accessory==='belt'){
   ellipsoidProfiles('belt trim',motion,[[2.25,waist+.09,.34],[2.34,waist+.10,.35]],trim,20);
 }else if(accessory==='watch'){
   cylinder('wristwatch',bones.arms[1].wrist,0,-.05,0,.11,.30,.30,trim,16);
 }else if(accessory==='ring'){
   sphere('ring',bones.arms[1].wrist,.09,-.29,-.09,.045,.027,.044,trim);
 }else if(accessory==='handbag'){
   const bag=mat('bag','#765145');
   const wrist=bones.arms[1].wrist;
   box('handbag',wrist,.24,-.51,0,.44,.37,.24,bag);
   tube('handbag handle',wrist,[[.10,-.35,0],[.13,-.18,0],[.33,-.18,0],[.39,-.35,0]],.031,trim);
 }else if(accessory==='henna'){
   const henna=mat('Lalle henna','#A05C38');
   for(const arm of bones.arms)
     for(let finger=0;finger<3;finger++){
       box('henna on hand',arm.wrist,(finger-1)*.069,-.18,-.119,.034,.022,.012,henna);
     }
 }
 let gait=0,smoothed=0,time=0;
 function animate(dt,move=0,run=false){
   dt=Math.min(Math.max(dt||0,0),.08);time+=dt;
   const amount=typeof move==='boolean'?(move?1:0):Math.min(Math.abs(move||0),1);
   smoothed+=(amount-smoothed)*Math.min(1,dt*8);
   gait+=dt*(run?11.8:7.4)*(.20+.80*smoothed);
   const a=Math.sin(gait)*smoothed, b=Math.cos(gait)*smoothed;
   for(const part of bones.legs){
     part.hip.rotation.x=part.side*a*(run?.66:.43);
     part.knee.rotation.x=smoothed*(.12+Math.max(0,-part.side*a)*(run?.72:.47));
     part.ankle.rotation.x=-part.knee.rotation.x*.42;
   }
   for(const arm of bones.arms){
     arm.shoulder.rotation.x=-arm.side*a*(run?.43:.29);
     arm.shoulder.rotation.z=-arm.side*.10;
     arm.elbow.rotation.x=-(run?.23:.10)*smoothed;
   }
   motion.position.y=Math.sin(gait*2)*.040*smoothed+Math.sin(time*1.7)*.009;
   motion.rotation.z=b*.012;motion.rotation.x=smoothed*(run?.045:.015);
   head.rotation.y=Math.sin(time*.56)*.013;
 }
 animate(0,0,false);
 return {
   root,rig:bones,animate,
   dispose:()=>{root.dispose(false,false); for(const m of mats.values())m.dispose();},
   getProfile:()=>({body:feminine?'female':'male',shoulderWidth:should*2,hipWidth:hips*2,height:feminine?4.30:4.44,
     jointCount:2+2*bones.arms.length+3*bones.legs.length})
 };
}
window.WasaHuman={create:build,version:'1.0.0'};
})();