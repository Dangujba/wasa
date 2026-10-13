const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const B = require('../public/vendor/babylon.min.js');
const source = fs.readFileSync('public/world/world.js','utf8');

test('joystick and keyboard movement project in the intended screen direction at any camera bearing',()=>{
  const engine = new B.NullEngine();
  const scene = new B.Scene(engine);
  try {
    for(const alpha of [0,Math.PI/2,Math.PI,-Math.PI/2,1.84]) {
      for(const control of [
        {name:'joystick right',touch:{x:1,y:0},axis:'x',sign:1},
        {name:'joystick left',touch:{x:-1,y:0},axis:'x',sign:-1},
        {name:'joystick up',touch:{x:0,y:-1},axis:'y',sign:-1},
        {name:'joystick down',touch:{x:0,y:1},axis:'y',sign:1},
        {name:'keyboard right',key:'ArrowRight',axis:'x',sign:1},
        {name:'keyboard left',key:'ArrowLeft',axis:'x',sign:-1}
      ]) {
        const camera = new B.ArcRotateCamera('test',alpha,1.1,8,new B.Vector3(0,1.7,0),scene);
        const player = new B.TransformNode('test player',scene);
        const world = {
          ready:true,player,camera,keys:new Set(control.key?[control.key]:[]),
          touch:{x:0,y:0,sprint:false,...control.touch},playerPos:B.Vector3.Zero(),
          velocity:B.Vector3.Zero(),avatarRig:{animate(){}},heading:0,walkPhase:0
        };
        const context = vm.createContext({B,world,performance,$:()=>({textContent:''}),
          clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),playerCanGo:()=>true,roadWalkingCourse:()=>null});
        for(const name of ['inputVector','movePlayer']) {
          const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);
          assert.ok(start>=0&&end>start);
          vm.runInContext(source.slice(start,end),context);
        }
        const view=camera.getViewMatrix().multiply(camera.getProjectionMatrix());
        const viewport=new B.Viewport(0,0,512,256);
        const before=B.Vector3.Project(world.playerPos,B.Matrix.Identity(),view,viewport);
        context.movePlayer(.1);
        const after=B.Vector3.Project(world.playerPos,B.Matrix.Identity(),view,viewport);
        const delta=after[control.axis]-before[control.axis];
        assert.ok(delta*control.sign>0,control.name+' has the correct screen direction at '+alpha);
        const other=control.axis==='x'?'y':'x';
        assert.ok(Math.abs(after[other]-before[other])<.01,'Pure input has no unintended sideways/vertical component');
        camera.dispose();player.dispose();
      }
    }
  } finally { engine.dispose(); }
});
