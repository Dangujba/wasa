/* Shared WASA lighting, surface textures and bounded graphics profiles. */
(() => {
  'use strict';
  const B = window.BABYLON;
  const caches = new WeakMap();
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const noise = n => { const v = Math.sin(n * 127.13 + 23.1) * 43758.5453; return v - Math.floor(v); };
  const profiles = {
    low: { scale: 1.6, shadowSize: 512, shadowRadius: 65, distance: 570, ao: false, bloom: false },
    medium: { scale: 1.15, shadowSize: 1024, shadowRadius: 110, distance: 740, ao: false, bloom: false },
    high: { scale: 1, shadowSize: 2048, shadowRadius: 160, distance: 1050, ao: true, bloom: true }
  };
  function cacheFor(scene) {
    if (!caches.has(scene)) caches.set(scene, new Map());
    return caches.get(scene);
  }
  function normalTexture(scene, name, size, heights, strength = 1) {
    const texture = new B.DynamicTexture(name, { width: size, height: size }, scene, true, B.Texture.TRILINEAR_SAMPLINGMODE);
    const context = texture.getContext(), pixels = context.createImageData(size, size);
    const height = (x, y) => heights[((y + size) % size) * size + (x + size) % size];
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (height(x - 1, y) - height(x + 1, y)) * strength;
      const dy = (height(x, y - 1) - height(x, y + 1)) * strength;
      const length = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
      pixels.data[i] = Math.round((dx / length * .5 + .5) * 255);
      pixels.data[i + 1] = Math.round((dy / length * .5 + .5) * 255);
      pixels.data[i + 2] = Math.round((1 / length * .5 + .5) * 255);
      pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    texture.update(); texture.gammaSpace = false;
    texture.wrapU = texture.wrapV = B.Texture.WRAP_ADDRESSMODE;
    return texture;
  }
  function surface(scene, kind) {
    const cache = cacheFor(scene), key = 'surface:' + kind;
    if (cache.has(key)) return cache.get(key);
    const size = 256, heights = new Float32Array(size * size);
    const albedo = new B.DynamicTexture('surface ' + kind, {width: size, height: size}, scene, true, B.Texture.TRILINEAR_SAMPLINGMODE);
    const ctx = albedo.getContext(), pixels = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x, grit = noise(i + 41);
      const weather = Math.sin(x * Math.PI * 4 / size) * Math.cos(y * Math.PI * 2 / size);
      const mortar = kind === 'block' && (y % 32 < 2 || (x + Math.floor(y / 32) % 2 * 32) % 64 < 2);
      const value = kind === 'asphalt' ? 185 + grit * 44 : kind === 'soil' ? 206 + grit * 35 + weather * 10 : 230 + grit * 18 + weather * 6 - (mortar ? 25 : 0);
      const v = clamp(Math.round(value), 0, 255), offset = i * 4;
      pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = v;
      pixels.data[offset + 3] = 255;
      heights[i] = mortar ? .1 : .5 + (grit - .5) * (kind === 'asphalt' ? .3 : .12);
    }
    ctx.putImageData(pixels, 0, 0); albedo.update();
    albedo.wrapU = albedo.wrapV = B.Texture.WRAP_ADDRESSMODE;
    const normal = normalTexture(scene, kind + ' normal', size, heights, .7);
    const result = {albedo, normal}; cache.set(key, result); return result;
  }
  function clothNormal(scene) {
    const cache = cacheFor(scene);
    if (cache.has('cloth')) return cache.get('cloth');
    const size = 128, heights = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      heights[y * size + x] = .5 + .12 * Math.sin(x * Math.PI / 2) * Math.cos(y * Math.PI / 2);
    }
    const texture = normalTexture(scene, 'cloth weave normal', size, heights, .4);
    texture.uScale = texture.vScale = 8;
    cache.set('cloth', texture); return texture;
  }
  function applySurface(material, kind) {
    const maps = surface(material.getScene(), kind);
    material.albedoTexture = maps.albedo; material.bumpTexture = maps.normal;
    material.metallic = 0; material.roughness = kind === 'asphalt' ? .93 : .87;
    return material;
  }
  function boxUV(mesh, meters = 3) {
    const p = mesh.getVerticesData(B.VertexBuffer.PositionKind), n = mesh.getVerticesData(B.VertexBuffer.NormalKind), uvs = [];
    for (let i = 0; i < p.length; i += 3) {
      const horizontal = Math.abs(n[i + 1]) > .5;
      uvs.push((horizontal || Math.abs(n[i + 2]) > .5 ? p[i] : p[i + 2]) / meters,
        (horizontal ? p[i + 2] : p[i + 1]) / meters);
    }
    mesh.setVerticesData(B.VertexBuffer.UVKind, uvs);
  }
  function environment(scene) {
    const size = 32, data = [], names = ['right','left','up','down','front','back'];
    for (let face = 0; face < 6; face++) {
      const pixels = new Uint8Array(size * size * 4);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
        // Each face samples the same direction-dependent sky, including top/bottom.
        const directionY = (face === 2 ? 1 : face === 3 ? -1 : -v) / Math.hypot(u, v, 1);
        const t = clamp(directionY, 0, 1), i = (y * size + x) * 4;
        const rgb = directionY < 0 ? [128,116,94] : [194 - t * 91, 191 - t * 51, 174 + t * 13];
        for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(rgb[c]);
        pixels[i + 3] = 255;
      }
      data.push(pixels);
    }
    const texture = new B.RawCubeTexture(scene, data, size, B.Constants.TEXTUREFORMAT_RGBA, B.Constants.TEXTURETYPE_UNSIGNED_BYTE, true, false, B.Texture.TRILINEAR_SAMPLINGMODE);
    texture.name = 'WASA procedural daylight'; texture.gammaSpace = true;
    const cube = {size, format: B.Constants.TEXTUREFORMAT_RGBA, type: B.Constants.TEXTURETYPE_UNSIGNED_BYTE, gammaSpace: true};
    names.forEach((name, i) => { cube[name] = data[i]; });
    texture.sphericalPolynomial = B.CubeMapToSphericalPolynomialTools.ConvertCubeMapToSphericalPolynomial(cube);
    scene.environmentTexture = texture;
    // This is an LDR approximation with mipmaps, not a prefiltered HDR asset.
    scene.environmentIntensity = .65;
    scene.imageProcessingConfiguration.toneMappingEnabled = true;
    scene.imageProcessingConfiguration.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.exposure = 1.08;
    scene.imageProcessingConfiguration.contrast = 1.02;
    return texture;
  }
  function sky(scene) {
    B.Effect.ShadersStore.wasaSkyVertexShader = 'precision highp float; attribute vec3 position; uniform mat4 worldViewProjection; varying vec3 direction; void main(){direction=position;gl_Position=worldViewProjection*vec4(position,1.0);}';
    B.Effect.ShadersStore.wasaSkyFragmentShader = 'precision highp float; varying vec3 direction; void main(){float y=normalize(direction).y;float t=pow(max(y,0.0),0.65);vec3 color=mix(vec3(0.76,0.75,0.68),vec3(0.40,0.55,0.73),t);if(y<0.0)color=mix(color,vec3(0.50,0.45,0.36),min(-y*3.0,1.0));gl_FragColor=vec4(color,1.0);}';
    const material = new B.ShaderMaterial('dusty daylight sky', scene, {vertex:'wasaSky',fragment:'wasaSky'}, {attributes:['position'],uniforms:['worldViewProjection']});
    material.backFaceCulling = false;
    const mesh = B.MeshBuilder.CreateBox('daylight sky', {size:24000}, scene);
    mesh.material = material; mesh.isPickable = false; mesh.infiniteDistance = true;
    return mesh;
  }
  function initialTier(mode, mobile) { return mode === 'auto' ? (mobile ? 'low' : 'medium') : (profiles[mode] ? mode : 'medium'); }
  function createQuality(scene, camera, sun, mode = 'auto', options = {}) {
    const engine = scene.getEngine();
    const mobile = window.matchMedia('(pointer:coarse)').matches || (navigator.deviceMemory && navigator.deviceMemory <= 4);
    let tier = initialTier(mode, mobile), shadow = null, ao = null, bloom = null, candidates = [], lastCenter = null;
    let sampleMs = 0, sampleFrames = 0, warmup = 0, poorWindows = 0;
    const status = {mode, tier, fps: 0, shadowCasters: 0, drawCalls: 0, ready: false};
    function rebuild() {
      if (shadow) shadow.dispose(); if (ao) ao.dispose(); if (bloom) bloom.dispose();
      shadow = ao = bloom = null; lastCenter = null;
      const p = profiles[tier];
      const radius = options.shadowRadius || p.shadowRadius;
      engine.setHardwareScalingLevel(Math.max(p.scale, (window.devicePixelRatio || 1) / (tier === 'high' ? 1.5 : 1)));
      engine.resize();
      if (sun) {
        shadow = new B.ShadowGenerator(p.shadowSize, sun);
        shadow.usePercentageCloserFiltering = engine.webGLVersion > 1;
        shadow.filteringQuality = B.ShadowGenerator.QUALITY_LOW;
        shadow.bias = .00025;
        shadow.normalBias = Math.max(.025, radius * 2 / p.shadowSize * .5);
        shadow.setDarkness(.22);
        sun.autoUpdateExtends = false;
        sun.shadowMinZ = 1; sun.shadowMaxZ = radius * 3;
        sun.orthoLeft = sun.orthoBottom = -radius;
        sun.orthoRight = sun.orthoTop = radius;
      }
      if (p.ao && engine.webGLVersion > 1 && B.SSAO2RenderingPipeline.IsSupported) {
        ao = new B.SSAO2RenderingPipeline('wasa-ao', scene, {ssaoRatio: .5, blurRatio: .5}, [camera], true);
        ao.radius = .65; ao.totalStrength = .65; ao.samples = 8; ao.maxZ = 120;
      }
      if (p.bloom) {
        bloom = new B.DefaultRenderingPipeline('wasa-bloom', true, scene, [camera]);
        bloom.imageProcessingEnabled = false; // Keep one tone-mapping stage on every tier.
        bloom.bloomEnabled = true; bloom.bloomThreshold = 1.2; bloom.bloomWeight = .08; bloom.bloomScale = .25;
      }
      status.tier = tier; status.shadowCasters = 0;
      status.ao = !!ao; status.bloom = !!bloom; status.shadowSize = p.shadowSize;
      sampleMs = sampleFrames = warmup = poorWindows = 0;
    }
    function updateShadows(center, force = false) {
      if (!shadow || !center) return;
      if (!force && lastCenter && B.Vector3.DistanceSquared(center, lastCenter) < 25) return;
      const radius = options.shadowRadius || profiles[tier].shadowRadius;
      sun.position.copyFrom(center).subtractInPlace(sun.direction.scale(radius * 2));
      shadow.getShadowMap().renderList = candidates.filter(mesh => {
        if (mesh.isDisposed() || !mesh.isEnabled()) return false;
        if (mesh.parent) mesh.computeWorldMatrix(true);
        const box = mesh.getBoundingInfo().boundingBox;
        return box.maximumWorld.x >= center.x - radius && box.minimumWorld.x <= center.x + radius &&
          box.maximumWorld.z >= center.z - radius && box.minimumWorld.z <= center.z + radius;
      });
      status.shadowCasters = shadow.getShadowMap().renderList.length;
      lastCenter = center.clone();
    }
    function sample(dt, center) {
      updateShadows(center);
      if (!status.ready || document.hidden || !document.hasFocus()) return;
      warmup += dt;
      if (warmup < 4) return;
      sampleMs += dt * 1000; sampleFrames++;
      if (sampleMs < 2000) return;
      status.fps = Math.round(sampleFrames * 1000 / sampleMs);
      status.drawCalls = engine._drawCalls?.current || 0;
      poorWindows = status.fps < 28 ? poorWindows + 1 : 0;
      sampleMs = sampleFrames = 0;
      if (status.mode === 'auto' && poorWindows >= 2 && tier !== 'low') {
        tier = tier === 'high' ? 'medium' : 'low'; rebuild(); updateShadows(center, true);
      }
    }
    rebuild();
    return {
      status, sample, updateShadows,
      get distance() { return profiles[tier].distance; },
      setCandidates(meshes) { candidates = meshes; lastCenter = null; },
      setMode(next, center) {
        status.mode = next; tier = initialTier(next, mobile); rebuild(); updateShadows(center, true);
      },
      dispose() { if (shadow) shadow.dispose(); if (ao) ao.dispose(); if (bloom) bloom.dispose(); }
    };
  }
  window.WasaRendering = {normalTexture, surface, clothNormal, applySurface, boxUV, environment, sky, createQuality, initialTier};
})();
