/* WASA Human Engine v2.5 | Physically-Based Procedural Character Engine for Babylon.js
   Design inspiration: articulated human skeleton / skinned-model workflow.
   Procedural proportions, PBR materials, fabric bump weave, sculpted facial anatomy, natural locomotion gait. */
(() => {
'use strict';
const skins = { deep: '#3E261E', rich: '#5C3828', warm: '#7A4D35', amber: '#9E6746', honey: '#BA835C', light: '#D69E74' };
const fabrics = { ivory: '#EDE5D2', midnight: '#152431', emerald: '#125447', sand: '#A8805E', indigo: '#28417A', burgundy: '#652A3C', rose: '#A85265', cocoa: '#543D32' };
const trims = { gold: '#E5BF74', ivory: '#F7EFE0', silver: '#C8D2D1', emerald: '#7ECBA8' };
const colors = { hair: '#14181B', eyes: '#181E22', pupil: '#0B0D0F', white: '#ECE2D6', lip: '#7D473E', shoe: '#422F26' };
const robes = new Set(['babbar_riga', 'kanuri_robe', 'jallabiya', 'atamfa', 'buba_zani', 'abaya']);

let sharedClothBump = null;
function getClothBump(scene) {
  if (sharedClothBump) return sharedClothBump;
  try {
    const B = window.BABYLON;
    const t = new B.DynamicTexture('cloth-weave-full', { width: 128, height: 128 }, scene, false);
    const c = t.getContext();
    c.fillStyle = '#808080'; c.fillRect(0, 0, 128, 128);
    for (let x = 0; x < 128; x += 4) {
      for (let y = 0; y < 128; y += 4) {
        const v = ((x + y) % 8 === 0) ? 146 : 114;
        c.fillStyle = `rgb(${v},${v},${v})`;
        c.fillRect(x, y, 3, 3);
      }
    }
    t.update();
    t.uScale = 14; t.vScale = 14;
    sharedClothBump = t;
    return t;
  } catch (_) { return null; }
}

function build(scene, cfg = {}, opts = {}) {
  const B = window.BABYLON;
  if (!B || !scene) throw Error('BABYLON scene is required');
  const feminine = cfg.body === 'feminine';
  const should = feminine ? .54 : .72, hips = feminine ? .56 : .44, waist = feminine ? .34 : .46, chest = feminine ? .51 : .62;
  const legGap = feminine ? .29 : .31;
  const skinCol = skins[cfg.skin] || skins.rich;
  const color = fabrics[cfg.outfitColor] || fabrics.ivory;
  const stitchCol = trims[cfg.trimColor] || trims.gold;

  const mats = new Map();
  function mat(name, hex, roughness = 0.82, metal = 0.0) {
    const k = name + hex + roughness + metal;
    if (mats.has(k)) return mats.get(k);
    const m = new B.PBRMaterial('human ' + name + ' ' + hex, scene);
    m.albedoColor = B.Color3.FromHexString(hex);
    m.metallic = metal;
    m.roughness = roughness;
    m.environmentIntensity = 0.65;
    m.directIntensity = 1.1;
    m.backFaceCulling = false;

    if (name.includes('skin') || name.includes('jaw') || name.includes('cheek') || name.includes('ear') || name.includes('nose') || name.includes('hand') || name.includes('finger')) {
      m.metallic = 0.01;
      m.roughness = 0.58;
      m.ambientColor = m.albedoColor.scale(0.22);
    } else if (name.includes('lips')) {
      m.metallic = 0.02;
      m.roughness = 0.45;
      m.ambientColor = m.albedoColor.scale(0.25);
    } else if (name.includes('embroidery') || name.includes('gold') || name.includes('silver') || name.includes('trim') || name.includes('watch') || name.includes('ring')) {
      m.metallic = 0.72;
      m.roughness = 0.26;
    } else if (name.includes('fabric') || name.includes('cloth') || name.includes('scarf') || name.includes('trousers') || name.includes('robe')) {
      m.metallic = 0.0;
      m.roughness = 0.88;
      const b = getClothBump(scene);
      if (b) m.bumpTexture = b;
    } else if (name.includes('footwear') || name.includes('leather')) {
      m.metallic = 0.06;
      m.roughness = 0.38;
    } else if (name.includes('eyes') || name.includes('iris') || name.includes('sclera')) {
      m.metallic = 0.0;
      m.roughness = 0.12;
    }
    mats.set(k, m); return m;
  }

  const skin = mat('skin', skinCol, .58, .01);
  const cloth = mat('woven fabric', color, .88, 0);
  const trim = mat('embroidery', stitchCol, .26, .72);
  const dark = mat('hair', colors.hair, .75, 0);
  const eyes = mat('eyes', colors.eyes, .12, 0);
  const pupilMat = mat('pupil', colors.pupil, .08, 0);
  const white = mat('sclera', colors.white, .18, 0);
  const lips = mat('lips', colors.lip, .45, .02);
  const leather = mat('footwear', cfg.footwear === 'sneakers' ? '#D6D8D0' : cfg.footwear === 'leather' ? '#3B2720' : colors.shoe, .38, .06);
  const soleMat = mat('shoe-sole', '#1E1F21', .70, .05);

  const root = new B.TransformNode('human:root', scene);
  const motion = new B.TransformNode('human:motion', scene);
  motion.parent = root;
  if (feminine) motion.scaling.y = .97;

  function node(name, parent = motion, x = 0, y = 0, z = 0) {
    const n = new B.TransformNode('bone:' + name, scene);
    n.parent = parent; n.position.set(x, y, z); return n;
  }
  function sphere(name, parent, x, y, z, sx, sy, sz, material, segments = 24) {
    const m = B.MeshBuilder.CreateSphere(name, { diameter: 1, segments }, scene);
    m.parent = parent; m.position.set(x, y, z); m.scaling.set(sx * 2, sy * 2, sz * 2); m.material = material;
    m.isPickable = false; return m;
  }
  function tube(name, parent, coords, radius, material) {
    const m = B.MeshBuilder.CreateTube(name, { path: coords.map(p => new B.Vector3(...p)), radius, tessellation: 8, cap: B.Mesh.CAP_ALL }, scene);
    m.parent = parent; m.material = material; m.isPickable = false; return m;
  }
  function cylinder(name, parent, x, y, z, height, top, bottom, material, segments = 24) {
    const m = B.MeshBuilder.CreateCylinder(name, { height, diameterTop: top, diameterBottom: bottom, tessellation: segments }, scene);
    m.parent = parent; m.position.set(x, y, z); m.material = material; m.isPickable = false; return m;
  }
  function box(name, parent, x, y, z, w, h, d, material) {
    const m = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.parent = parent; m.position.set(x, y, z); m.material = material; m.isPickable = false; return m;
  }
  function ellipsoidProfiles(name, parent, levels, material, segments = 32) {
    const points = [], indices = [], uvs = [], normals = [];
    for (let j = 0; j < levels.length; j++) {
      const [y, rx, rz, zOffset = 0] = levels[j];
      for (let k = 0; k < segments; k++) {
        const a = k * Math.PI * 2 / segments;
        points.push(Math.cos(a) * rx, y, zOffset + Math.sin(a) * rz);
        uvs.push(k / segments, j / (levels.length - 1));
      }
    }
    for (let j = 0; j < levels.length - 1; j++) for (let k = 0; k < segments; k++) {
      const a = j * segments + k, b = j * segments + (k + 1) % segments, c = a + segments, d = b + segments;
      indices.push(a, c, b, b, c, d);
    }
    for (let k = 1; k < segments - 1; k++) {
      indices.push(0, k, k + 1);
      const top = (levels.length - 1) * segments;
      indices.push(top, top + k + 1, top + k);
    }
    B.VertexData.ComputeNormals(points, indices, normals);
    const data = new B.VertexData();
    data.positions = points; data.indices = indices; data.normals = normals; data.uvs = uvs;
    const m = new B.Mesh(name, scene); data.applyToMesh(m);
    m.parent = parent; m.material = material; m.isPickable = false;
    return m;
  }

  // Torso & clothing
  ellipsoidProfiles('anatomical torso', motion, [
    [1.94, hips * .84, .25], [2.08, hips, .28], [2.39, waist, .24],
    [2.69, feminine ? .40 : .47, .29], [2.88, chest, .30],
    [3.07, should * .88, .25], [3.20, should * .92, .235], [3.32, .195, .175]
  ], skin, 36);
  sphere('pelvis', motion, 0, 1.995, 0, hips * .91, .235, .258, skin);
  ellipsoidProfiles('neck', motion, [[3.23, .155, .14], [3.31, .145, .14], [3.54, .127, .12], [3.60, .129, .12]], skin, 24);

  const outfit = cfg.outfit || 'kaftan';
  const long = robes.has(outfit);
  const wing = outfit === 'babbar_riga';
  const dress = feminine && ['atamfa', 'buba_zani', 'abaya'].includes(outfit);
  const hemY = dress ? (outfit === 'abaya' ? .24 : .45) : long ? .56 : outfit === 'jamfa' ? 1.26 : 1.30;
  const hemX = wing ? .75 : dress ? .66 : long ? .59 : .49;

  ellipsoidProfiles('tailored ' + outfit, motion, [
    [hemY, hemX, hemX * .67], [hemY + .025, hemX * 1.014, hemX * .68],
    [Math.max(1.54, hemY + .38), Math.max(hemX * .87, hips + .06), .31],
    [2.09, hips + .087, .322], [2.42, waist + .092, .298],
    [2.73, chest + .077, .336], [3.02, should * .98 + .067, .300],
    [3.15, should * .99 + .061, .271], [3.22, should * .75 + .05, .239],
    [3.29, .235, .186]
  ], cloth, 40);

  if (long || dress) ellipsoidProfiles('decorated robe hem', motion, [
    [hemY + .015, hemX * 1.008, hemX * .66],
    [hemY + .056, hemX * 1.012, hemX * .668]
  ], trim, 28);

  tube('front embroidered placket', motion, [
    [0, 3.18, -.23], [0, 3.02, -.254], [0, 2.83, -.280], [0, 2.56, -.281]
  ], .011, trim);
  for (const side of [-1, 1]) {
    tube('northern embroidery ' + side, motion, [
      [side * .08, 3.09, -.24], [side * .14, 2.98, -.257],
      [side * .10, 2.81, -.282], [side * .19, 2.72, -.267],
      [side * .13, 2.58, -.275]
    ], .008, trim);
  }
  tube('embroidered collar', motion, [[-.16, 3.28, -.198], [-.12, 3.21, -.226], [0, 3.19, -.241], [.12, 3.21, -.226], [.16, 3.28, -.198]], .015, trim);

  if (['jamfa', 'kaftan', 'shadda', 'kanuri_robe'].includes(outfit)) {
    box('chest pocket seam', motion, -.245, 2.77, -.283, .137, .012, .016, trim);
    tube('pocket outline', motion, [[-.315, 2.83, -.275], [-.315, 2.64, -.274], [-.180, 2.64, -.274], [-.180, 2.83, -.275]], .006, trim);
  }

  // Bones & limbs
  const bones = { arms: [], legs: [], head: null, torso: motion };
  for (const side of [-1, 1]) {
    const shoulder = node('shoulder' + side, motion, side * should * .95, 3.14, -.006);
    ellipsoidProfiles('tailored upper sleeve', shoulder, [
      [-.66, .135, .135], [-.54, .160, .157], [-.31, .180, .175], [-.08, .191, .180], [.045, .183, .170]
    ], cloth, 28);
    const elbow = node('elbow' + side, shoulder, side * .03, -.66, 0);
    ellipsoidProfiles('tailored forearm sleeve', elbow, [
      [-.60, .101, .111], [-.50, .126, .129], [-.31, .143, .145], [-.08, .163, .151], [.045, .147, .141]
    ], cloth, 28);
    const wrist = node('wrist' + side, elbow, 0, -.595, 0);

    // Anatomical hand
    sphere('human palm', wrist, 0, -.113, -.015, .095, .145, .075, skin, 18);
    sphere('human thumb proximal', wrist, -side * .080, -.075, -.065, .038, .072, .042, skin, 12);
    sphere('human thumb tip', wrist, -side * .105, -.135, -.085, .032, .052, .035, skin, 12);
    for (let finger = 0; finger < 4; finger++) {
      const x = (finger - 1.5) * .042;
      const fLen = (finger === 1 || finger === 2) ? .115 : .092;
      sphere('knuckle ' + side + ' ' + finger, wrist, x, -.215, -.025, .022, .036, .025, skin, 12);
      sphere('articulated finger ' + side + ' ' + finger, wrist, x, -.215 - fLen * .55, -.035, .019, fLen * .52, .022, skin, 12);
    }

    if (wing) {
      ellipsoidProfiles('flowing sleeve ' + side, shoulder, [
        [-1.00, .46, .25], [-.62, .50, .30], [-.32, .41, .33], [-.02, .20, .24]
      ], cloth, 18).position.x = side * .07;
    }
    cylinder('embroidered sleeve cuff', elbow, 0, -.565, 0, .024, .225, .225, trim, 24);
    bones.arms.push({ shoulder, elbow, wrist, side });

    const hip = node('hip' + side, motion, side * legGap, 1.98, 0);
    const trousers = mat('tailored trousers', dress ? '#A99B9D' : color, .88, 0);
    ellipsoidProfiles('human upper leg', hip, [
      [-.95, .168, .177], [-.73, .185, .181], [-.36, .216, .212], [-.05, .232, .226], [.08, .229, .218]
    ], trousers, 28);
    const knee = node('knee' + side, hip, 0, -.94, 0);
    ellipsoidProfiles('human lower leg', knee, [
      [-.81, .132, .145], [-.67, .147, .154], [-.32, .154, .164], [-.04, .166, .178], [.055, .166, .18]
    ], trousers, 28);
    const ankle = node('ankle' + side, knee, 0, -.795, 0);

    sphere('tailored shoe upper', ankle, 0, -.065, -.135, .165, .105, .275, leather, 24);
    box('tailored shoe sole', ankle, 0, -.155, -.135, .32, .045, .56, soleMat);
    box('tailored shoe heel', ankle, 0, -.145, .045, .30, .065, .18, soleMat);
    if (cfg.footwear === 'sandals' || cfg.footwear === 'slippers') {
      box('sandal band', ankle, 0, -.03, -.38, .38, .055, .13, trim);
    }
    bones.legs.push({ hip, knee, ankle, side });
  }

  // Head and face
  const head = node('head', motion, 0, 3.44, 0);
  bones.head = head;
  const faceY = .42;
  sphere('sculpted cranium', head, 0, faceY, .015, feminine ? .324 : .355, .425, .322, skin, 36);
  sphere('sculpted jawline', head, 0, .235, -.067, feminine ? .260 : .295, .217, .259, skin, 26);
  sphere('sculpted chin point', head, 0, .145, -.155, feminine ? .102 : .125, .090, .110, skin, 20);

  for (const side of [-1, 1]) {
    sphere('cheek ' + side, head, side * .205, .34, -.124, .104, .139, .073, skin, 20);
    sphere('ear helix ' + side, head, side * .326, .434, .024, .048, .094, .050, skin, 16);
    sphere('ear lobe ' + side, head, side * .320, .365, .021, .034, .048, .038, skin, 14);
    sphere('eyewhite ' + side, head, side * .133, .486, -.292, .069, .040, .019, white, 20);
    sphere('iris ' + side, head, side * .133, .482, -.311, .028, .032, .014, eyes, 16);
    sphere('pupil ' + side, head, side * .133, .482, -.318, .013, .015, .008, pupilMat, 12);
    sphere('eyelid ' + side, head, side * .132, .528, -.301, .074, .012, .015, skin, 16);
    tube('eyebrow ' + side, head, [
      [side * .047, .603, -.296], [side * .130, .620, -.292], [side * .221, .611, -.254]
    ], .010, dark);
    sphere('nostril ' + side, head, side * .048, .290, -.318, .034, .025, .036, skin, 14);
  }

  sphere('bridge of nose', head, 0, .393, -.310, .045, .123, .064, skin, 24);
  sphere('nose tip', head, 0, .304, -.341, .064, .059, .071, skin, 20);
  sphere('philtrum groove', head, 0, .235, -.280, .023, .048, .018, skin, 14);
  sphere('lower lip fullness', head, 0, .168, -.293, .083, .019, .025, lips, 20);
  for (const side of [-1, 1]) {
    sphere('upper lip arch ' + side, head, side * .034, .197, -.288, .048, .016, .024, lips, 16);
  }
  sphere('upper lip tubercle', head, 0, .195, -.291, .032, .015, .022, lips, 16);

  if (feminine) {
    for (const side of [-1, 1]) {
      tube('upper lash ' + side, head, [[side * .08, .559, -.320], [side * .14, .571, -.319], [side * .21, .553, -.291]], .010, dark);
    }
  }

  const beard = cfg.facialHair || 'none';
  if (beard === 'moustache' || beard === 'full_beard')
    for (const side of [-1, 1]) sphere('moustache' + side, head, side * .075, .229, -.331, .103, .036, .025, dark, 14);
  if (beard === 'goatee' || beard === 'full_beard') {
    sphere('chin facial hair', head, 0, .105, -.198, beard === 'full_beard' ? .245 : .133, beard === 'full_beard' ? .139 : .095, .185, dark, 16);
    if (beard === 'full_beard') for (const side of [-1, 1])
      sphere('jaw beard' + side, head, side * .215, .223, -.190, .115, .173, .133, dark, 14);
  }

  function hairGeometry() {
    const hairStyle = cfg.hair || 'short';
    sphere('scalp hair', head, 0, .741, .068, .338, .143, .303, dark, 32);
    if (hairStyle === 'curls') {
      for (let k = 0; k < 18; k++) {
        const a = k * Math.PI * 2 / 18;
        sphere('curl', head, Math.sin(a) * .29, .781 + (k % 3) * .035, Math.cos(a) * .25, .085, .088, .083, dark, 10);
      }
    } else if (hairStyle === 'locs' || hairStyle === 'braids') {
      for (let k = 0; k < 12; k++) {
        const a = k * Math.PI * 2 / 12;
        const x = Math.sin(a) * .30, z = Math.cos(a) * .265;
        tube('hair strand', head, [[x, .73, z], [x * 1.1, .47, z * 1.2], [x * 1.14, .16, z * 1.25]],
          hairStyle === 'locs' ? .047 : .030, dark);
      }
    } else if (hairStyle === 'short') {
      sphere('short top hair', head, 0, .757, .04, .30, .11, .29, dark, 24);
    }
  }

  const hat = cfg.headwear || 'none';
  if (hat === 'none') hairGeometry();
  else if (['hijab', 'gyale', 'kallabi'].includes(hat)) {
    const scarf = hat === 'hijab' ? cloth : mat('neutral scarf', feminine ? '#CFA68D' : '#D7BC9E', .88, 0);
    sphere('wrapped headscarf', head, 0, .69, .100, .40, .27, .36, scarf, 24);
    ellipsoidProfiles('draped scarf', head, [
      [-.28, .49, .29], [-.08, .53, .31], [.11, .43, .33], [.38, .36, .31], [.69, .34, .29]
    ], scarf, 24);
    tube('scarf face opening', head, [[-.30, .58, -.18], [-.24, .71, -.21], [0, .76, -.25], [.24, .71, -.21], [.30, .58, -.18]], .026, trim);
  } else if (hat === 'rawani') {
    sphere('turban base', head, 0, .78, .03, .40, .18, .35, cloth);
    for (let n = 0; n < 4; n++) {
      const tor = B.MeshBuilder.CreateTorus('wrapped rawani', { diameter: .80 + n * .006, thickness: .115, tessellation: 36 }, scene);
      tor.parent = head; tor.position.y = .70 + n * .093; tor.rotation.z = n * .08; tor.material = n % 2 ? trim : cloth;
    }
    box('rawani tail', head, .36, .39, .22, .15, .69, .13, cloth).rotation.z = .18;
  } else {
    const capRadius = hat === 'dara' ? .68 : hat === 'bama' ? .69 : .63;
    cylinder('Northern Nigerian cap', head, 0, .810, .036, .27, capRadius, capRadius * .99, hat === 'bama' ? trim : cloth, 32);
    cylinder('cap base band', head, 0, .695, .036, .055, capRadius * 1.05, capRadius * 1.05, trim, 32);
    for (let i = 0; i < 12; i++) {
      const a = i * 2 * Math.PI / 12;
      sphere('cap stitch', head, Math.sin(a) * capRadius * .47, .82, Math.cos(a) * capRadius * .47, .018, .040, .022, trim, 8);
    }
  }

  // Locomotion simulation
  let gait = 0, smoothed = 0, time = 0;
  function animate(dt, move = 0, run = false) {
    dt = Math.min(Math.max(dt || 0, 0), .08); time += dt;
    const amount = typeof move === 'boolean' ? (move ? 1 : 0) : Math.min(Math.abs(move || 0), 1);
    smoothed += (amount - smoothed) * Math.min(1, dt * 8);
    gait += dt * (run ? 11.8 : 7.4) * (.20 + .80 * smoothed);
    const a = Math.sin(gait) * smoothed, b = Math.cos(gait) * smoothed;

    for (const part of bones.legs) {
      part.hip.rotation.x = part.side * a * (run ? .68 : .44);
      part.knee.rotation.x = smoothed * (.12 + Math.max(0, -part.side * a) * (run ? .74 : .48));
      part.ankle.rotation.x = -part.knee.rotation.x * .42;
    }
    for (const arm of bones.arms) {
      arm.shoulder.rotation.x = -arm.side * a * (run ? .46 : .30);
      arm.shoulder.rotation.z = -arm.side * (.10 + Math.max(0, -arm.side * a) * .08);
      arm.elbow.rotation.x = -(run ? .32 : .16) * smoothed - Math.max(0, arm.side * a) * .22 * smoothed;
    }

    const breathing = Math.sin(time * 1.8) * .007;
    motion.position.y = Math.sin(gait * 2) * .036 * smoothed + breathing;
    motion.rotation.z = b * .022 * smoothed;
    motion.rotation.y = -a * .018 * smoothed;
    motion.rotation.x = smoothed * (run ? .055 : .020);

    head.rotation.y = -motion.rotation.y * .65 + Math.sin(time * .56) * .012 * (1 - smoothed);
    head.rotation.z = -motion.rotation.z * .5;
  }

  animate(0, 0, false);
  return {
    root, rig: bones, animate,
    dispose: () => { root.dispose(false, false); for (const m of mats.values()) m.dispose(); },
    getProfile: () => ({
      body: feminine ? 'female' : 'male', shoulderWidth: should * 2, hipWidth: hips * 2, height: feminine ? 4.30 : 4.44,
      jointCount: 2 + 2 * bones.arms.length + 3 * bones.legs.length
    })
  };
}

window.WasaHuman = { create: build, version: '2.5.0' };
})();