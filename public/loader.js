/* WASA / Phase 1.1: real game boot diagnostics and Babylon.js procedural scene.
   Startup progress reflects transferred runtime bytes and completed initialization steps.
   This is a development loader, not a playable game. */
(() => {
  'use strict';

  const VERSION = '0.1.2';
  const BABYLON_BYTES = 7179578;
  const $ = (id) => document.getElementById(id);
  const ui = {
    status: $('boot-status'), detail: $('boot-detail'), bytes: $('boot-bytes'),
    percent: $('boot-percent'), fill: $('track-fill'), glow: $('track-glow'),
    progressbar: $('progressbar'), frame: document.querySelector('.hero-frame'),
    frameState: $('frame-state'), panel: document.querySelector('.boot-panel'),
    postboot: $('postboot'), readyDetail: $('ready-detail'),
    error: $('error-panel'), errorMessage: $('error-message'),
    poster: $('world-poster'), canvas: $('scene-canvas'), tip: $('loading-tip')
  };

  const tips = [
    'CHALLENGE. RACE. WATCH.',
    'CAR. MOTORCYCLE. BICYCLE.',
    'THE CHAMPION AWAITS.',
    'LIVE CHALLENGES.',
    'DAMATURU IS YOUR ARENA.'
  ];

  let activeRun = 0;
  let controller = null;
  let engine = null;
  let scene = null;
  let tipInterval = null;
  let renderStart = 0;
  let cars = [];
  let cameraRef = null;
  let renderTick = null;
  let previewMode = false;
  let motionEnabled = true;

  const reducedMotion = () => !motionEnabled || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function setProgress(amount, message, detail, bytes) {
    const percentage = Math.max(0, Math.min(100, Math.floor(amount)));
    ui.fill.style.width = percentage + '%';
    ui.percent.innerHTML = String(percentage).padStart(2, '0') + '<span>%</span>';
    ui.progressbar.setAttribute('aria-valuenow', String(percentage));
    if (message) ui.status.textContent = message;
    if (detail) ui.detail.textContent = detail;
    if (bytes) ui.bytes.textContent = bytes;
  }

  function cleanup() {
    if (controller) controller.abort();
    controller = null;
    if (tipInterval) clearInterval(tipInterval);
    tipInterval = null;
    if (engine) {
      try { engine.stopRenderLoop(); } catch (_) {}
    }
    if (scene) {
      try { scene.dispose(); } catch (_) {}
      scene = null;
    }
    if (engine) {
      try { engine.dispose(); } catch (_) {}
      engine = null;
    }
    cars = [];
    cameraRef = null;
    renderTick = null;
    previewMode = false;
    ui.frame.classList.remove('world-interactive');
    ui.frame.classList.remove('engine-active');
    ui.frameState.textContent = 'SCENE PREVIEW';
  }

  function resetUi() {
    ui.panel.classList.remove('boot-error', 'boot-complete');
    ui.postboot.hidden = true;
    ui.error.hidden = true;
    ui.tip.textContent = tips[0];
    setProgress(0, 'STARTING', 'CHECKING DEVICE', 'BOOT 001');
    let index = 0;
    tipInterval = setInterval(() => {
      index = (index + 1) % tips.length;
      ui.tip.textContent = tips[index];
    }, 5200);
  }

  function assertGpuAvailable() {
    let context = null;
    try {
      const test = document.createElement('canvas');
      context = test.getContext('webgl2') || test.getContext('webgl');
    } catch (_) { context = null; }
    if (!context) throw new Error('WebGL is unavailable. Enable hardware acceleration or use an updated Chrome, Edge, Firefox or Safari browser to view 3D WASA content.');
    return context;
  }

  function ensureActive(run) {
    if (run !== activeRun) throw new Error('Boot operation superseded');
  }

  async function fetchRuntime(run) {
    controller = new AbortController();
    const timer = setTimeout(() => { if (controller) controller.abort(); }, 120000);
    try {
      const response = await fetch('/vendor/babylon.min.js', {
        method: 'GET', cache: 'force-cache', credentials: 'same-origin', signal: controller.signal
      });
      if (!response.ok) throw new Error('The WASA 3D engine could not be downloaded (HTTP ' + response.status + ').');
      let size = 0;
      const parts = [];
      if (response.body && response.body.getReader) {
        const reader = response.body.getReader();
        while (true) {
          const chunk = await reader.read();
          ensureActive(run);
          if (chunk.done) break;
          parts.push(chunk.value);
          size += chunk.value.byteLength;
          const ratio = Math.max(0, Math.min(1, size / BABYLON_BYTES));
          setProgress(12 + ratio * 72, 'LOADING 3D ENGINE',
            'DOWNLOADING RUNTIME',
            (size / 1024 / 1024).toFixed(1) + ' / ' + (BABYLON_BYTES / 1024 / 1024).toFixed(1) + ' MB');
        }
      } else {
        const data = await response.arrayBuffer();
        ensureActive(run);
        parts.push(data);
        size = data.byteLength;
      }
      if (size < BABYLON_BYTES * .8) throw new Error('The downloaded engine file appears incomplete. Please retry.');
      setProgress(84, 'VERIFYING ENGINE', 'CHECKING RUNTIME', 'ENGINE READY');
      await loadScript(new Blob(parts, { type: 'text/javascript' }), run);
      if (!window.BABYLON || !window.BABYLON.Engine) throw new Error('The downloaded 3D engine did not initialize correctly.');
    } finally {
      clearTimeout(timer);
      controller = null;
    }
  }

  function loadScript(blob, run) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const tag = document.createElement('script');
      const timeout = setTimeout(() => finish(false, new Error('3D runtime execution timed out.')), 30000);
      let finished = false;
      function finish(ok, error) {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        if (ok && run === activeRun) resolve();
        else reject(error || new Error('Engine initialization was cancelled.'));
      }
      tag.async = true;
      tag.onload = () => finish(true);
      tag.onerror = () => finish(false, new Error('The 3D runtime was blocked from executing.'));
      tag.src = url;
      document.head.appendChild(tag);
    });
  }

  function makeMaterial(B, name, hex, sceneRef, metal = 0) {
    const material = new B.StandardMaterial(name, sceneRef);
    material.diffuseColor = B.Color3.FromHexString(hex);
    material.specularColor = new B.Color3(metal, metal, metal);
    material.ambientColor = B.Color3.FromHexString(hex).scale(.17);
    return material;
  }

  function create3DPreview() {
    const B = window.BABYLON;
    engine = new B.Engine(ui.canvas, true, { preserveDrawingBuffer: false, stencil: true, powerPreference: 'low-power' });
    engine.setHardwareScalingLevel(window.devicePixelRatio > 1.3 ? Math.min(window.devicePixelRatio, 1.65) : 1);
    scene = new B.Scene(engine);
    scene.clearColor = new B.Color4(.035, .115, .14, 1);
    scene.ambientColor = new B.Color3(.32, .38, .34);
    scene.fogMode = B.Scene.FOGMODE_EXP2;
    scene.fogDensity = .012;
    scene.fogColor = new B.Color3(.07, .18, .20);

    const camera = new B.ArcRotateCamera('cinematic-camera', -Math.PI * .34, 1.15, 33, new B.Vector3(0, 1.35, 0), scene);
    camera.fov = .92;
    camera.lowerRadiusLimit = 11;
    camera.upperRadiusLimit = 48;
    camera.wheelDeltaPercentage = .02;
    cameraRef = camera;
    camera.minZ = .1;
    scene.activeCamera = camera;

    const hemi = new B.HemisphericLight('sky-fill', new B.Vector3(0, 1, 0), scene);
    hemi.intensity = .95;
    hemi.diffuse = new B.Color3(.66, .85, .80);
    hemi.groundColor = new B.Color3(.31, .27, .21);

    const sun = new B.DirectionalLight('sunset', new B.Vector3(-.6, -1, .3), scene);
    sun.position = new B.Vector3(8, 25, -12);
    sun.intensity = 1.2;
    sun.diffuse = new B.Color3(1, .82, .58);

    const mat = {
      ground: makeMaterial(B, 'ground-sand', '#50605A', scene),
      asphalt: makeMaterial(B, 'road-asphalt', '#293E48', scene),
      side: makeMaterial(B, 'bridge-side', '#788981', scene),
      rail: makeMaterial(B, 'bridge-rails', '#C9D1B9', scene),
      line: makeMaterial(B, 'road-markings', '#E9D5A7', scene),
      stone: makeMaterial(B, 'building-stone', '#B89A76', scene),
      cream: makeMaterial(B, 'building-cream', '#D8BF95', scene),
      green: makeMaterial(B, 'building-green', '#578477', scene),
      blue: makeMaterial(B, 'building-blue', '#477481', scene),
      rooftop: makeMaterial(B, 'rooftops', '#37575D', scene),
      wheel: makeMaterial(B, 'wheels', '#18242B', scene),
      gold: makeMaterial(B, 'gold-car', '#F1B66C', scene),
      pale: makeMaterial(B, 'mint-car', '#A8D9C6', scene),
      glass: makeMaterial(B, 'windshield', '#213E4E', scene)
    };

    function box(name, width, height, depth, x, y, z, material, parent) {
      const mesh = B.MeshBuilder.CreateBox(name, {width, height, depth}, scene);
      mesh.position.set(x, y, z);
      mesh.material = material;
      if (parent) mesh.parent = parent;
      return mesh;
    }

    const ground = B.MeshBuilder.CreateGround('damaturu-concept-ground', {width:42, height:42}, scene);
    ground.material = mat.ground;
    ground.position.y = -.09;

    box('north-south-road', 6.1, .10, 40, 0, .01, 0, mat.asphalt);
    for (let z=-18; z < 19; z += 3.5) box('street-centerline', .085, .016, 1.25, 0, .076, z, mat.line);

    // Flyover: this is a procedural prototype inspired by the real landmark,
    // NOT a survey-accurate reconstruction of Damaturu.
    for (let x of [-9, -2.4, 4.2, 10.8]) {
      for (let z of [-1.95, 1.95]) {
        box('flyover-support', .7, 3.2, .65, x, 1.63, z, mat.side);
      }
    }
    box('elevated-deck', 32, .58, 6.5, 0, 3.4, 0, mat.side);
    box('elevated-asphalt', 32, .055, 5.85, 0, 3.725, 0, mat.asphalt);
    for (let x=-15; x <16; x+=2.9) {
      box('flyover-dash', 1.36, .017, .085, x, 3.765, 0, mat.line);
    }
    for (let z of [-3.16, 3.16]) {
      box('safety-rail', 32, .34, .14, 0, 3.99, z, mat.rail);
      box('edge-stripe', 32, .015, .05, 0, 3.765, z * .91, mat.line);
    }
    for (let i=0;i<24;i++) {
      const x = i%6 < 3 ? -17 + (i%6)*4.8 : 6.5 + (i%6-3)*3.9;
      const z = i < 12 ? -13 - (i%3)*2.1 : 9.8 + (i%3)*2.2;
      const yHeight = 1.45 + ((i*7)%5)*.45;
      if (Math.abs(x) < 2.9 && Math.abs(z) < 16) continue;
      const material = [mat.stone, mat.cream, mat.green, mat.blue][i % 4];
      box('city-building-' + i, 2.55, yHeight, 2.0, x, yHeight/2, z, material);
      box('city-roof-' + i, 2.76, .2, 2.2, x, yHeight+.12, z, mat.rooftop);
      for (let j=0;j<2;j++) box('shopfront-' + i + '-' + j, .35, .42, .04, x-.64+j*.87, .5, z-1.03, mat.glass);
    }

    function makeCar(name, colorMaterial, start) {
      const parent = new B.TransformNode(name + '-root', scene);
      box(name + '-body', 1.68, .49, .94, 0, .38, 0, colorMaterial, parent);
      box(name + '-top', 1.0, .35, .80, -.06, .77, 0, mat.glass, parent);
      for (const x of [-.53, .54]) for (const z of [-.50, .50]) {
        const wheel = B.MeshBuilder.CreateCylinder(name + '-wheel', {diameter:.48, height:.17, tessellation:10}, scene);
        wheel.rotation.x = Math.PI/2;
        wheel.position.set(x, .21, z);
        wheel.parent = parent;
        wheel.material = mat.wheel;
      }
      parent.position.set(start, 3.76, .92);
      cars.push({root:parent, offset:start});
    }
    makeCar('gold-car', mat.gold, -6.2);
    makeCar('mint-car', mat.pale, 9.3);

    scene.render(); // Real first-frame render validation before marking boot as complete.
    renderStart = performance.now();
    const animate = () => {
      if (!scene || !engine) return;
      const seconds = (performance.now() - renderStart) / 1000;
      if (!reducedMotion() && !previewMode) {
        camera.alpha = -Math.PI * .34 + Math.sin(seconds * .12) * .13;
        cars.forEach((car, idx) => {
          car.root.position.x = ((seconds*(idx ? 1.5 : 2.4) + car.offset + 16) % 32) - 16;
        });
      }
      scene.render();
    };
    renderTick = animate;
    if (!reducedMotion()) engine.runRenderLoop(animate);
    return {renderer: engine.webGLVersion === 2 ? 'WebGL 2' : 'WebGL', babylon: B.Engine.Version || VERSION};
  }

  async function boot() {
    const run = ++activeRun;
    cleanup();
    resetUi();
    try {
      assertGpuAvailable();
      setProgress(7, 'CHECKING GRAPHICS', 'WEBGL AVAILABLE', 'GPU OK');
      try {
        if (ui.poster && ui.poster.decode) await ui.poster.decode();
      } catch (_) { /* art is a noncritical visual fallback */ }
      ensureActive(run);
      setProgress(12, 'LOADING WORLD', 'DAMATURU SCENE', 'SCENE READY');

      if (!window.BABYLON || !window.BABYLON.Engine) {
        await fetchRuntime(run);
      } else {
        setProgress(84, 'ENGINE CACHED', 'LOCAL RUNTIME', 'CACHE READY');
      }
      ensureActive(run);
      setProgress(89, 'STARTING 3D', 'INITIALIZING RENDERER', '3D START');
      await new Promise((resolve) => requestAnimationFrame(resolve));
      ensureActive(run);
      const report = create3DPreview();
      ensureActive(run);
      setProgress(96, 'RENDERING WORLD', 'FIRST FRAME READY', report.renderer.toUpperCase());
      await new Promise((resolve) => requestAnimationFrame(resolve));
      ensureActive(run);
      ui.frame.classList.add('engine-active');
      ui.frameState.textContent = '3D SCENE READY';
      ui.panel.classList.add('boot-complete');
      setProgress(100, 'READY', '3D PREVIEW LOADED', report.renderer.toUpperCase());
      ui.readyDetail.textContent = '3D SCENE READY';
      ui.postboot.hidden = false;
      document.dispatchEvent(new Event('wasa:boot-ready'));
      if (tipInterval) { clearInterval(tipInterval); tipInterval = null; }
    } catch (error) {
      if (run !== activeRun) return;
      const info = error && error.name === 'AbortError'
        ? 'The engine download timed out or was interrupted. Check your connection and retry.'
        : (error && error.message) || 'An unexpected startup error occurred.';
      ui.panel.classList.add('boot-error');
      ui.frameState.textContent = 'STARTUP FAILED';
      ui.errorMessage.textContent = info;
      ui.error.hidden = false;
      ui.status.textContent = 'STARTUP FAILED';
      ui.detail.textContent = 'CHECK CONNECTION AND RETRY';
      ui.bytes.textContent = 'RETRY';
      if (tipInterval) { clearInterval(tipInterval); tipInterval = null; }
      console.error('[WASA BOOT]', error);
      // The game menu and account screens remain accessible without a working GPU.
      document.dispatchEvent(new Event('wasa:boot-ready'));
    }
  }

  window.addEventListener('resize', () => { if (engine) engine.resize(); }, {passive:true});
  document.addEventListener('visibilitychange', () => {
    if (!engine || !scene || reducedMotion()) return;
    if (document.hidden) engine.stopRenderLoop();
    else {
      // Restarting the render loop after tab visibility changes.
      if (renderTick && !reducedMotion()) engine.runRenderLoop(renderTick);
    }
  });
  window.WasaPreview = {
    available: () => !!(engine && scene && cameraRef),
    enter: () => {
      if (!engine || !cameraRef) return;
      previewMode = true;
      ui.frame.classList.add('world-interactive');
      cameraRef.attachControl(ui.canvas, true);
      engine.resize();
    },
    exit: () => {
      previewMode = false;
      ui.frame.classList.remove('world-interactive');
      if (cameraRef) cameraRef.detachControl(ui.canvas);
    },
    setMotion: (on) => {
      motionEnabled = !!on;
      if (engine && renderTick) {
        engine.stopRenderLoop();
        if (!reducedMotion()) engine.runRenderLoop(renderTick);
        else scene.render();
      }
    },
    setQuality: (tier) => {
      if (!engine) return;
      const pixelRatio = window.devicePixelRatio || 1;
      const scaling = tier === 'low' ? Math.max(1.7, pixelRatio) : tier === 'high' ? 1 : (pixelRatio > 1.3 ? Math.min(pixelRatio, 1.65) : 1);
      engine.setHardwareScalingLevel(scaling);
      engine.resize();
    }
  };
  $('retry-button').addEventListener('click', boot);
  $('reboot-button').addEventListener('click', boot);
  boot();
})();
