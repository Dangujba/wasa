/* Original street art, informed by Damaturu references. Shop addresses are illustrative. */
(() => {
 'use strict';
 const B=window.BABYLON,random=n=>{const v=Math.sin(n*127.13+23.1)*43758.5453;return v-Math.floor(v);};
 const widths={residential:5.7,unclassified:5.7,tertiary:5.7,living_street:5.7};
 function point(plan,x,z){return [plan.x+plan.dx*x-plan.dz*z,plan.z+plan.dz*x+plan.dx*z];}
 function bounds(plan,rect){
   const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,z])=>point(plan,rect.x+x*rect.w/2,rect.z+z*rect.d/2));
   return {minX:Math.min(...corners.map(p=>p[0])),maxX:Math.max(...corners.map(p=>p[0])),minZ:Math.min(...corners.map(p=>p[1])),maxZ:Math.max(...corners.map(p=>p[1]))};
 }
 function crossesRoad(plan,rect,road){
   const local=p=>{const x=p[0]-plan.x,z=p[1]-plan.z;return [x*plan.dx+z*plan.dz,-x*plan.dz+z*plan.dx];};
   for(let i=1;i<road.p.length;i++){
     const a=local(road.p[i-1]),b=local(road.p[i]),padding=(road.width||5.7)/2+1.2;
     const loX=rect.x-rect.w/2-padding,hiX=rect.x+rect.w/2+padding,loZ=rect.z-rect.d/2-padding,hiZ=rect.z+rect.d/2+padding;
     let enter=0,exit=1,possible=true;
     for(const [p,q] of [[a[0]-b[0],a[0]-loX],[b[0]-a[0],hiX-a[0]],[a[1]-b[1],a[1]-loZ],[b[1]-a[1],hiZ-a[1]]]){
       if(Math.abs(p)<1e-9){if(q<0){possible=false;break;}}
       else{const t=q/p;if(p<0)enter=Math.max(enter,t);else exit=Math.min(exit,t);if(enter>exit){possible=false;break;}}
     }
     if(possible)return true;
   }
   return false;
 }
 function plan(map,colliders=[]){
   const candidates=[];
   const roadWidths={trunk:14,primary:10,secondary:9,tertiary:7,residential:5.7,service:4,path:2,footway:2};
   const nearby=map.roads.filter(r=>r.p.some(p=>Math.hypot(p[0]+95,p[1]-330)<850)).map(r=>({...r,width:roadWidths[r.type]||5.7}));
   for(const road of nearby){
     if(!(road.type in widths))continue;
     for(let i=1;i<road.p.length;i++){
       const a=road.p[i-1],b=road.p[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
       if(length<60)continue;
       const x=(a[0]+b[0])/2,z=(a[1]+b[1])/2,dx=(b[0]-a[0])/length,dz=(b[1]-a[1])/length;
       if(Math.hypot(x+95,z-330)>650||Math.hypot(x,z)<100)continue;
       const half=widths[road.type]/2;
       const rects=[{x:-6,z:half+6.8,w:24,d:6},{x:-9,z:-half-6.8,w:18,d:6},
         {x:18,z:half+10.3,w:18,d:13},{x:15,z:-half-10.3,w:24,d:13}];
       candidates.push({x,z,dx,dz,half,angle:-Math.atan2(dz,dx),roadId:road.id,roadName:road.name||'Mapped neighborhood street',rects,
         score:Math.hypot(x+95,z-330)+Math.abs(dx*dz)*80});
     }
   }
   candidates.sort((a,b)=>a.score-b.score);
   for(const candidate of candidates){
     const blocked=candidate.rects.some(rect=>{
       const box=bounds(candidate,rect);
       return colliders.some(c=>box.minX-1<c.maxX&&box.maxX+1>c.minX&&box.minZ-1<c.maxZ&&box.maxZ+1>c.minZ)||
         nearby.some(road=>crossesRoad(candidate,rect,road));
     });
     if(!blocked){candidate.entry=point(candidate,-24,0);return candidate;}
   }
   return null;
 }
 function build(scene,layout,helpers){
   if(!layout)return null;
   const {mat,box:meshBox,cylinder:meshCylinder,colliders}=helpers;
   const root=new B.TransformNode('WASA authored street block',scene);root.position.set(layout.x,0,layout.z);root.rotation.y=layout.angle;
   const pieces=[],stats={shops:7,compounds:2,trees:0,drainBridges:0,sourceRoad:layout.roadId,illustrative:true};
   const add=(name,x,y,z,w,h,d,m)=>{
     const mesh=meshBox('street block '+name,x,y,z,w,h,d,m,root);
     if(h<=.22&&!/canopy|roof|crossarm/.test(name))mesh.metadata.wasaShadow=false;
     pieces.push(mesh);return mesh;
   };
   const cylinder=(name,x,y,z,top,bottom,height,m)=>{const mesh=meshCylinder('street block '+name,x,y,z,top,bottom,height,m,root,10);pieces.push(mesh);return mesh;};
   const plane=(name,x,y,z,w,h,m,angle=0)=>{
     const mesh=B.MeshBuilder.CreatePlane('street block '+name,{width:w,height:h,sideOrientation:B.Mesh.DOUBLESIDE},scene);
     mesh.position.set(x,y,z);mesh.rotation.y=angle;mesh.parent=root;mesh.material=m;mesh.receiveShadows=true;mesh.isPickable=false;mesh.metadata={wasaShadow:true};pieces.push(mesh);return mesh;
   };
   const concrete=mat('street-block concrete','#B9B09D',0,.9),edge=mat('street-block wall trim','#DEC8A5',0,.86);
   const wallColors=['#BCA78B','#B28464','#B9B6A1','#D7C6A6'].map((c,i)=>mat('street-block plaster '+i,c,0,.89));
   const dark=mat('street-block recess','#242824',0,.98),wood=mat('street-block wood','#796044',0,.88);
   const frames=mat('street-block iron','#474A43',.2,.79),roof=mat('street-block corrugated roof','#9B8B76',.25,.76);
   const asphalt=mat('street-block road patch','#56544C',0,.98),clay=mat('street-block laterite','#AA9676',0,.96);
   const red=mat('street-block block wall','#9D7861',0,.9),blue=mat('street-block shutter','#657D80',.08,.82);
   const shutterTexture=new B.DynamicTexture('street block shutter paint',{width:256,height:256},scene,true);
   const sc=shutterTexture.getContext();sc.fillStyle='#D3D3CA';sc.fillRect(0,0,256,256);
   for(let y=0;y<256;y+=8){sc.fillStyle='#969B98';sc.fillRect(0,y,256,1);sc.fillStyle='#E2E0D7';sc.fillRect(0,y+1,256,1);}
   for(let i=0;i<600;i++){sc.fillStyle=i%3?'#BDB9AA':'#797B71';sc.fillRect(random(i+15)*256,random(i+71)*256,1+random(i+2)*5,1);}
   shutterTexture.update();blue.albedoTexture=shutterTexture;
   const roofHeights=new Float32Array(128*128);
   for(let y=0;y<128;y++)for(let x=0;x<128;x++)roofHeights[y*128+x]=.5+.23*Math.sin(x*Math.PI/4);
   roof.bumpTexture=window.WasaRendering.normalTexture(scene,'corrugated metal normal',128,roofHeights,.85);
   const canvasTexture=(name,width,height,draw)=>{const tex=new B.DynamicTexture(name,{width,height},scene,true);draw(tex.getContext(),width,height);tex.update();return tex;};
   const sign=(title,index)=>{
     const texture=canvasTexture('street block sign '+title,512,128,(c,w,h)=>{
       c.fillStyle=['#354F48','#485B70','#735648','#567160'][index%4];c.fillRect(0,0,w,h);
       c.strokeStyle='#CBBF9F';c.lineWidth=5;c.strokeRect(8,8,w-16,h-16);
       c.fillStyle='#F0E6CE';c.font='bold 37px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(title,w/2,48,w-38);
       c.font='17px Arial';c.fillText('WASA  ·  NEIGHBORHOOD SHOPS',w/2,92);
     });
     const m=new B.StandardMaterial('street sign '+title,scene);m.diffuseTexture=texture;m.specularColor=B.Color3.Black();return m;
   };
   const labels=['PROVISIONS','TAILORING','PHONE REPAIRS','TEA & SNACKS','HOUSEHOLD GOODS','BARBER','FRESH PRODUCE'];
   const shadeMats=['#507269','#A57F5D','#687582'].map((c,i)=>mat('street-block cloth awning '+i,c,0,.96));
   // A bounded section of paved footway, open drain and sandy road verge.
   for(const side of [-1,1]){
     add('sandy verge',0,.008,side*(layout.half+2.25),56,.025,4.5,clay);
     add('paved footway',0,.115,side*(layout.half+2.25),56,.09,2.7,concrete);
     const drainZ=side*(layout.half+.52);
     add('drain shadow bed',0,.04,drainZ,56,.055,.70,dark);
     for(const offset of [-.43,.43])add('drain rim',0,.115,drainZ+offset,56,.21,.12,concrete);
     for(const x of [-19,-7,5,18]){add('drain access bridge',x,.19,drainZ,1.35,.13,1.1,edge);stats.drainBridges++;}
     for(let x=-27;x<=27;x+=3)add('paving joint',x,.164,side*(layout.half+2.25),.018,.005,2.7,dark);
     for(let i=0;i<9;i++){
       const x=-25+i*6.2,z=side*(layout.half+.10+random(i+side)*.06);
       add('worn asphalt edge',x,.124,z,1.1+random(i)*1.4,.018,.18+random(i+4)*.12,asphalt).rotation.y=(random(i+8)-.5)*.3;
     }
   }
   let signIndex=0;
   function shop(x,side,index){
     const width=6,depth=6,center=side*(layout.half+6.8),front=side*(layout.half+3.8),height=index===0?6.7:3.65;
     const paint=wallColors[index%wallColors.length],closed=index%3===1;
     add('shop rear wall',x,height/2+.10,center+side*(depth/2-.12),width,height,.24,paint);
     for(const sx of [-width/2+.10,width/2-.10])add('shop side wall',x+sx,height/2+.10,center,.20,height,depth,paint);
     add('shop front lintel',x,3.14,front,width,1.02,.27,paint);
     for(const sx of [-2.72,2.72])add('shop front pier',x+sx,1.46,front,.34,2.72,.4,edge);
     add('shop floor',x,.14,center,width-.2,.15,depth,concrete);
     if(closed)plane('painted rolling shutter',x,1.45,front-side*.02,5.05,2.52,blue,side>0?0:Math.PI);
     else{
       add('dark retail back wall',x,1.34,center+side*2.72,5.7,2.5,.04,dark);
       add('display counter',x,1.03,front+side*1.20,4.2,.76,.72,wood);
       for(let shelf=0;shelf<3;shelf++){
         add('shop shelf',x,.62+shelf*.55,center+side*1.9,4.6,.09,.45,wood);
         for(let item=0;item<7;item++)add('packaged shop goods',x-1.8+item*.60,.82+shelf*.55,center+side*1.9,.24,.30,.24,wallColors[(item+shelf+index)%4]);
       }
     }
     plane('handpainted shop sign',x,3.15,front-side*.18,5.1,.70,sign(labels[signIndex],signIndex),side>0?0:Math.PI);signIndex++;
     const canopy=add('sloping shade canopy',x,2.84,front-side*.85,5.85,.10,1.9,shadeMats[index%3]);canopy.rotation.x=side*.075;
     for(const sx of [-2.58,2.58])cylinder('veranda support',x+sx,1.42,front-side*1.54,.065,.08,2.70,frames);
     const sheet=add('corrugated shop roof',x,height+.23,center,width+.4,.12,depth+.7,roof);sheet.rotation.x=side*.08;
     add('roof fascia',x,height+.42,front-side*.35,width+.42,.21,.16,edge);
     if(index===0){
       add('upper facade',x,5.10,front,width,2.65,.22,paint);
       for(const sx of [-1.65,1.65]){
         add('upper window recess',x+sx,5.10,front-side*.13,1.25,1.25,.05,dark);
         for(const bx of [-.4,0,.4])add('upper window grille',x+sx+bx,5.10,front-side*.18,.035,1.22,.045,frames);
         add('upper window sill',x+sx,4.44,front-side*.25,1.5,.10,.45,edge);
       }
       add('upper floor band',x,3.95,front-side*.18,width,.16,.35,edge);
     }
     if(index%2===0){
       add('veranda bench seat',x+1.6,.54,front-side*.8,1.8,.10,.42,wood);
       for(const sx of [-.65,.65])add('bench leg',x+1.6+sx,.30,front-side*.8,.12,.45,.31,frames);
     }
     for(let i=0;i<2;i++){
       const tint=mat('street-block sack '+i,i?'#B7A280':'#877A56',0,.97);
       cylinder('grain sack',x-1.65+i*.62,.47,front+side*.4,.46,.56,.72,tint);
     }
   }
   for(let i=0;i<4;i++)shop(-15+i*6,1,i);
   for(let i=0;i<3;i++)shop(-15+i*6,-1,i+4);
   // Two walled courtyards with actual openings around closed metal gates.
   for(const [side,x,width] of [[1,18,18],[-1,15,24]]){
     const front=side*(layout.half+3.8),back=front+side*13,center=(front+back)/2;
     for(const sx of [-width/2,width/2])add('compound side wall',x+sx,1.01,center,.22,1.96,13,red);
     add('compound rear wall',x,1.01,back,width,1.96,.22,red);
     const wing=(width-3.6)/2;
     for(const sx of [-1,1])add('compound front wall',x+sx*(1.8+wing/2),1.01,front,wing,1.96,.25,red);
     for(let sx=-width/2;sx<=width/2;sx+=3)add('wall pilaster',x+sx,1.08,front,.35,2.14,.38,edge);
     plane('corrugated compound gate',x,1.08,front-side*.14,3.55,2.1,blue,side>0?0:Math.PI);
     add('gate center frame',x,1.09,front-side*.17,.08,2.1,.06,frames);
     const homeZ=front+side*8.7;
     add('courtyard home',x,1.70,homeZ,11,3.3,6,wallColors[2]);
     add('home roof',x,3.49,homeZ,11.4,.16,6.4,roof);
     for(const sx of [-5.4,5.4])add('home parapet',x+sx,3.74,homeZ,.18,.48,6.4,edge);
     add('home front parapet',x,3.74,homeZ-side*3.1,11,.48,.18,edge);
     const black=mat('street-block water tank','#333B36',0,.82);
     cylinder('roof water tank',x+3,4.42,homeZ+side*.9,1.05,1.1,1.20,black);
     add('water tank base',x+3,3.72,homeZ+side*.9,1.28,.20,1.28,edge);
     for(const sx of [-3.25,3.25]){
       add('house window',x+sx,1.9,homeZ-side*3.03,1.2,1.1,.09,dark);
       for(const rib of [-.35,0,.35])add('house window bars',x+sx+rib,1.9,homeZ-side*3.1,.035,1.1,.05,frames);
     }
   }
   const foliage=new B.PBRMaterial('street block alpha foliage',scene);
   foliage.albedoTexture=new B.Texture('/assets/street-block/foliage-cluster-512.png',scene,false,false,B.Texture.TRILINEAR_SAMPLINGMODE);
   foliage.albedoTexture.hasAlpha=true;foliage.useAlphaFromAlbedoTexture=true;
   foliage.transparencyMode=B.PBRMaterial.PBRMATERIAL_ALPHATEST;foliage.alphaCutOff=.40;foliage.backFaceCulling=false;
   foliage.metallic=0;foliage.roughness=.95;foliage.albedoColor=new B.Color3(.78,.83,.73);
   function tree(x,z,seed){
     cylinder('shade tree trunk',x,2.05,z,.20,.42,4.1,wood);
     for(let branch=0;branch<5;branch++){
       const angle=branch*Math.PI*2/5+seed,ex=x+Math.cos(angle)*1.35,ez=z+Math.sin(angle)*1.35,ey=4.4+random(seed+branch)*.7;
       const path=[new B.Vector3(x,2.7,z),new B.Vector3(x+Math.cos(angle)*.65,3.55,z+Math.sin(angle)*.65),new B.Vector3(ex,ey,ez)];
       const mesh=B.MeshBuilder.CreateTube('street block tree branch',{path,radius:.07,tessellation:6,cap:B.Mesh.CAP_ALL},scene);
       mesh.parent=root;mesh.material=wood;mesh.isPickable=false;mesh.receiveShadows=true;mesh.metadata={wasaShadow:true};pieces.push(mesh);
       for(let card=0;card<3;card++){
         const leaf=plane('leaf cluster',ex,ey+.22,ez,3.1,2.08,foliage,angle+card*Math.PI/3);
         leaf.rotation.z=(random(seed+branch*5+card)-.5)*.45;leaf.rotation.x=.12;
       }
     }
     stats.trees++;
   }
   tree(24,-layout.half-7.9,11);tree(9,-layout.half-11.4,19);tree(25,layout.half+9.2,27);
   // Concrete utility poles and gently sagging overhead wires.
   for(const x of [-25,1,26]){
     cylinder('utility pole',x,3.75,layout.half+3.5,.16,.23,7.4,concrete);
     add('utility crossarm',x,7.16,layout.half+3.5,.20,.16,1.70,wood);
     for(const z of [-.60,.60])cylinder('pole insulator',x,7.34,layout.half+3.5+z,.12,.12,.24,edge);
   }
   for(const [a,b] of [[-25,1],[1,26]])for(const offset of [-.60,.60]){
     const path=[];for(let i=0;i<=10;i++){const t=i/10;path.push(new B.Vector3(a+(b-a)*t,7.38-.65*Math.sin(t*Math.PI),layout.half+3.5+offset));}
     const wire=B.MeshBuilder.CreateTube('street block power cable',{path,radius:.018,tessellation:4},scene);
     wire.parent=root;wire.material=frames;wire.isPickable=false;pieces.push(wire);
   }
   for(const rect of layout.rects)colliders.push({...bounds(layout,rect),source:'street_block',hard:true});
   // Bake group transforms before city batching. The normal batching path retains shadows.
   root.computeWorldMatrix(true);for(const mesh of pieces)mesh.setParent(null);root.dispose();
   stats.meshesBeforeBatching=pieces.length;stats.vertices=pieces.reduce((sum,m)=>sum+m.getTotalVertices(),0);
   return {...layout,stats};
 }
 window.WasaStreetBlock={plan,build,point,bounds,crossesRoad};
})();
