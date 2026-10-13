/* Walkable surfaces are captured before city batching, independently of draw meshes. */
(() => {
 'use strict';
 const B=window.BABYLON,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 function createSurfaceIndex(cell=16,ground=-.08){
   const grid=new Map();let triangles=0;
   function addTriangle(a,b,c,name='surface'){
     const dx=b.x-a.x,dz=b.z-a.z,ex=c.x-a.x,ez=c.z-a.z,den=dx*ez-ex*dz;
     if(Math.abs(den)<1e-7)return;
     const sx=((b.y-a.y)*ez-(c.y-a.y)*dz)/den,sz=(dx*(c.y-a.y)-ex*(b.y-a.y))/den;
     if(Math.hypot(sx,sz)>1)return;
     const t={a,dx,dz,ex,ez,den,sx,sz,name,normal:new B.Vector3(-sx,1,-sz).normalize()};
     const loX=Math.floor(Math.min(a.x,b.x,c.x)/cell),hiX=Math.floor(Math.max(a.x,b.x,c.x)/cell);
     const loZ=Math.floor(Math.min(a.z,b.z,c.z)/cell),hiZ=Math.floor(Math.max(a.z,b.z,c.z)/cell);
     for(let x=loX;x<=hiX;x++)for(let z=loZ;z<=hiZ;z++){
       const key=x+','+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(t);
     }
     triangles++;
   }
   function addMesh(mesh){
     const p=mesh.getVerticesData(B.VertexBuffer.PositionKind),n=mesh.getVerticesData(B.VertexBuffer.NormalKind),indices=mesh.getIndices();
     if(!p||!n||!indices)return;
     const matrix=mesh.computeWorldMatrix(true);
     for(let i=0;i<indices.length;i+=3){
       const ids=indices.slice(i,i+3),normal=B.Vector3.Zero();
       for(const id of ids)normal.addInPlace(new B.Vector3(n[id*3],n[id*3+1],n[id*3+2]));
       if(B.Vector3.TransformNormal(normal,matrix).normalize().y<.7)continue;
       const points=ids.map(id=>B.Vector3.TransformCoordinates(new B.Vector3(p[id*3],p[id*3+1],p[id*3+2]),matrix));
       addTriangle(...points,mesh.name);
     }
   }
   function sample(x,z,reference=ground,up=.32,down=.42){
     let best=ground<=reference+up&&ground>=reference-down?{height:ground,normal:B.Vector3.Up(),name:'ground'}:null;
     for(const t of grid.get(Math.floor(x/cell)+','+Math.floor(z/cell))||[]){
       const px=x-t.a.x,pz=z-t.a.z,u=(px*t.ez-t.ex*pz)/t.den,v=(t.dx*pz-px*t.dz)/t.den;
       if(u< -1e-5||v< -1e-5||u+v>1.00001)continue;
       const height=t.a.y+px*t.sx+pz*t.sz;
       if(height>reference+up+1e-5||height<reference-down-1e-5)continue;
       if(!best||height>best.height)best={height,normal:t.normal,name:t.name};
     }
     return best;
   }
   return {addMesh,addTriangle,sample,stats:()=>({triangles,cells:grid.size})};
 }
 const {velocityStep,turnStep}=window.WasaMovement;
 window.WasaLocomotion={createSurfaceIndex,velocityStep,turnStep};
})();
