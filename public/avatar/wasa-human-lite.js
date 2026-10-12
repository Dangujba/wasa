/* WASA Human Lite v2.0 | Original sculpted lightweight procedural character for Babylon.js
   Design inspiration: articulated human skeleton / skinned-model workflow.
   No third-party character meshes are copied. Procedural proportions and pivot rig. */
(() => {
'use strict';
const skins={deep:'#452D25',rich:'#694333',warm:'#8C5D45',amber:'#AA7859',honey:'#CA9872',light:'#E2B18A'};
const fabrics={ivory:'#E8DDC6',midnight:'#182A39',emerald:'#176656',sand:'#AF8866',indigo:'#314C8D',burgundy:'#733347',rose:'#B75E71',cocoa:'#61483C'};
const trims={gold:'#E6C07C',ivory:'#F4ECD9',silver:'#C3CDCC',emerald:'#82CEAD'};
const colors={hair:'#192025',eyes:'#171E23',white:'#E8D9CC',lip:'#8E594F',shoe:'#543E33'};
const robes=new Set(['babbar_riga','kanuri_robe','jallabiya','atamfa','buba_zani','abaya']);
function build(scene,cfg={},opts={}){
 const B=window.BABYLON;
 if(!B||!scene)throw Error('BABYLON scene is required');
 const feminine=cfg.body==='feminine';
 const should=feminine?.46:.58, hips=feminine?.51:.41, waist=feminine?.33:.385, chest=feminine?.43:.535;
 const legGap=feminine?.245:.267;
 const skinCol=skins[cfg.skin]||skins.rich;
 const color=cfg.outfit==='jamfa'&&cfg.outfitColor==='ivory'?'#A5BDD9':
   cfg.outfit==='abaya'&&cfg.outfitColor==='rose'?'#A782AF':
   fabrics[cfg.outfitColor]||fabrics.ivory;
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
 const skin=mat('skin',skinCol,.095),cloth=mat('woven fabric',color,.025),trim=mat('embroidery',stitchCol,.14),
   dark=mat('hair',colors.hair,.03),eyes=mat('eyes',colors.eyes,.10),
   white=mat('sclera',colors.white,.06), lips=mat('lips',colors.lip,.04),
   leather=mat('footwear',cfg.footwear==='sneakers'?'#DADBD3':cfg.footwear==='leather'?'#3F2B25':colors.shoe,.10),
   fabricAlt=mat('fabric accent',cfg.outfitColor==='ivory'?'#D3B998':'#C1B1A0',.03);
 const root=new B.TransformNode('human:root',scene);
 const motion=new B.TransformNode('human:motion',scene);
 motion.parent=root;
 if(feminine)motion.scaling.y=.975;
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
   [1.94,hips*.83,.245],[2.08,hips,.275],[2.39,waist,.238],
   [2.69,feminine?.398:.465,.285],[2.88,chest,.291],
   [3.07,should*.87,.245],[3.20,should*.91,.23],[3.32,.19,.17]
 ],skin,36);
 const pelvis=sphere('pelvis',motion,0,1.995,0,hips*.91,.235,.258,skin);
 // Clavicle and neck.
 const neck=ellipsoidProfiles('neck',motion,[[3.23,.155,.14],[3.31,.145,.14],[3.54,.127,.12],[3.60,.129,.12]],skin,24);
 // Clothing follows curved body, with tailored waist and silhouette instead of block geometry.
 const outfit=cfg.outfit||'kaftan';
 const long=robes.has(outfit);
 const wing=outfit==='babbar_riga';
 const dress=feminine && ['atamfa','buba_zani','abaya'].includes(outfit);
 const hemY=dress?(outfit==='abaya'?.24:.45):long?.56:outfit==='jamfa'?1.26:1.30;
 const hemX=wing?.75:dress?.66:long?.59:.49;
 ellipsoidProfiles('tailored '+outfit,motion,[
   [hemY,hemX,hemX*.67],[hemY+.025,hemX*1.014,hemX*.68],
   [Math.max(1.54,hemY+.38),Math.max(hemX*.87,hips+.06),.31],
   [2.09,hips+.087,.322],[2.42,waist+.092,.298],
   [2.73,chest+.077,.336],[3.02,should*.98+.067,.300],
   [3.15,should*.99+.061,.271],[3.22,should*.75+.05,.239],
   [3.29,.235,.186]
 ],cloth,40);
 // Under-robe curve and embroidered hem.
 if(long||dress)ellipsoidProfiles('decorated robe hem',motion,[
   [hemY+.015,hemX*1.008,hemX*.66],
   [hemY+.056,hemX*1.012,hemX*.668]
 ],trim,28);
 tube('front embroidered placket',motion,[
   [0,3.18,-.23],[0,3.02,-.254],[0,2.83,-.280],[0,2.56,-.281]
 ],.010,trim);
 for(const side of [-1,1]){
   tube('northern embroidery '+side,motion,[
     [side*.08,3.09,-.24],[side*.14,2.98,-.257],
     [side*.10,2.81,-.282],[side*.19,2.72,-.267],
     [side*.13,2.58,-.275]
   ],.007,trim);
 }
 // Collar and V-neck detail.
 tube('embroidered collar',motion,[[-.16,3.28,-.198],[-.12,3.21,-.226],[0,3.19,-.241],[.12,3.21,-.226],[.16,3.28,-.198]],.014,trim);
 // Traditional garment's pocket with stitched trim, as seen on northern kaftans.
 if(['jamfa','kaftan','shadda','kanuri_robe'].includes(outfit)){
   box('chest pocket seam',motion,-.245,2.77,-.283,.137,.012,.016,trim);
   tube('pocket outline',motion,[[-.315,2.83,-.275],[-.315,2.64,-.274],[-.180,2.64,-.274],[-.180,2.83,-.275]],.006,trim);
 }
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
   const shoulder=node('shoulder'+side,motion,side*should*.95,3.14,-.006);
   // Continuous tapered cloth sleeve; elbows are concealed rather than floating oval pieces.
   ellipsoidProfiles('tailored upper sleeve',shoulder,[
     [-.66,.135,.135],[-.54,.160,.157],[-.31,.180,.175],[-.08,.191,.180],[.045,.183,.170]
   ],cloth,28);
   const elbow=node('elbow'+side,shoulder,side*.03,-.66,0);
   ellipsoidProfiles('tailored forearm sleeve',elbow,[
     [-.60,.101,.111],[-.50,.126,.129],[-.31,.143,.145],[-.08,.163,.151],[.045,.147,.141]
   ],cloth,28);
   const wrist=node('wrist'+side,elbow,0,-.595,0);
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
   cylinder('embroidered sleeve cuff',elbow,0,-.565,0,.024,.225,.225,trim,24);
   bones.arms.push({shoulder,elbow,wrist,side});
   const hip=node('hip'+side,motion,side*legGap,1.98,0);
   const trousers=mat('tailored trousers',dress?'#A99B9D':color,.024);
   ellipsoidProfiles('human upper leg',hip,[
     [-.95,.168,.177],[-.73,.185,.181],[-.36,.216,.212],[-.05,.232,.226],[.08,.229,.218]
   ],trousers,28);
   const knee=node('knee'+side,hip,0,-.94,0);
   ellipsoidProfiles('human lower leg',knee,[
     [-.81,.132,.145],[-.67,.147,.154],[-.32,.154,.164],[-.04,.166,.178],[.055,.166,.18]
   ],trousers,28);
   const ankle=node('ankle'+side,knee,0,-.795,0);
   sphere('tailored shoe',ankle,0,-.08,-.145,.17,.117,.275,leather,24);
   if(cfg.footwear==='sandals'||cfg.footwear==='slippers'){
     box('sandal band',ankle,0,-.03,-.38,.38,.055,.13,trim);
   }
   bones.legs.push({hip,knee,ankle,side});
 }
 // Neck -> head joint and sculpted facial silhouette with natural ears, nose, eyelids and lips.
 const head=node('head',motion,0,3.44,0);
 bones.head=head;
 const faceY=.42;
 sphere('sculpted head',head,0,faceY,.015,feminine?.302:.321,.408,.305,skin,36);
 // Jawline and cheek volume make it recognizably human without copied mesh art.
 sphere('jaw contour',head,0,.238,-.018,feminine?.213:.244,.195,.192,skin,26);
 for(const side of [-1,1]){
   sphere('cheek'+side,head,side*.195,.35,-.105,.090,.125,.062,skin,20);
   sphere('ear'+side,head,side*.316,.434,.024,.041,.086,.049,skin,16);
   sphere('eyewhite'+side,head,side*.127,.489,-.294,.062,.034,.016,white,20);
   sphere('iris'+side,head,side*.126,.485,-.310,.026,.030,.014,eyes,16);
   sphere('eyelid'+side,head,side*.128,.522,-.303,.065,.011,.015,skin,16);
   const eyebrow=tube('eyebrow'+side,head,[
     [side*.047,.603,-.296],[side*.130,.620,-.292],[side*.221,.611,-.254]
   ],.010,dark);
 }
 sphere('bridge of nose',head,0,.391,-.296,.044,.115,.062,skin,24);
 sphere('nose tip',head,0,.307,-.327,.056,.052,.060,skin,20);
 sphere('lower lip',head,0,.170,-.276,.077,.013,.020,lips,20);
 sphere('upper lip',head,0,.194,-.274,.080,.012,.021,lips,20);
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
   sphere('sculpted haircut',head,0,.746,.068,.316,.131,.291,dark,32);
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
     sphere('short top hair',head,0,.777,.04,.284,.102,.272,dark,28);
   }
 }
 const hat=cfg.headwear||'none';
 if(hat==='none')hairGeometry();
 else if(['hijab','gyale','kallabi'].includes(hat)){
   const scarf=hat==='hijab'?cloth:mat('neutral scarf',feminine?'#BD95AF':'#C1AD93');
   // Open-front scarf follows the back of the skull and frames both cheeks.
   // Importantly, there is NO solid sphere over the eyes, nose, or mouth.
   const layers=[[-.29,.49,.36,.105],[.12,.412,.342,.115],
     [.39,.369,.310,.106],[.66,.343,.288,.110],[.79,.30,.240,.115]];
   const steps=30,positions=[],indices=[],normals=[];
   const angle0=-.24,angle1=Math.PI+.24;
   for(const [y,rx,rz,zoff] of layers){
     for(let i=0;i<=steps;i++){
       const angle=angle0+(angle1-angle0)*i/steps;
       positions.push(Math.cos(angle)*rx,y,Math.sin(angle)*rz+zoff);
     }
   }
   for(let row=0;row<layers.length-1;row++)for(let col=0;col<steps;col++){
      const a=row*(steps+1)+col,b=a+(steps+1);
      indices.push(a,b,a+1,a+1,b,b+1);
   }
   B.VertexData.ComputeNormals(positions,indices,normals);
   const data=new B.VertexData();data.positions=positions;data.indices=indices;data.normals=normals;
   const mesh=new B.Mesh('face-framing hijab and scarf',scene);
   data.applyToMesh(mesh);mesh.parent=head;mesh.material=scarf;mesh.isPickable=false;
   sphere('scarf crown',head,0,.795,.10,.316,.106,.266,scarf,24);
   // Soft front chest drape, not a block that hides the face.
   ellipsoidProfiles('scarf over shoulders',motion,[
     [2.98,.51,.31],[3.06,.48,.30],[3.20,.32,.24],[3.31,.19,.17]
   ],scarf,30);
   tube('scarf face-edge seam',head,[[-.33,.52,-.045],[-.315,.64,-.052],
     [-.22,.785,-.074],[0,.829,-.126],[.22,.785,-.074],[.315,.64,-.052],[.33,.52,-.045]],.016,trim);
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
   motion.position.y=Math.sin(gait*2)*.028*smoothed+Math.sin(time*1.7)*.006;
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
window.WasaHuman={create:build,version:'2.0.0-lite'};
})();