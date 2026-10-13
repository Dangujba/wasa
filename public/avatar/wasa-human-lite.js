/* WASA Human Lite v2.6 | Physically-Based Procedural Character Engine for Babylon.js
   Sahelian aesthetic, anatomically grounded, rigged skeletal hierarchy.
   PBR materials, fabric bump weave, sculpted facial anatomy, natural locomotion gait. */
(() => {
'use strict';
const skins = { deep: '#3E261E', rich: '#5C3828', warm: '#7A4D35', amber: '#9E6746', honey: '#BA835C', light: '#D69E74' };
const fabrics = { ivory: '#EDE5D2', midnight: '#152431', emerald: '#125447', sand: '#A8805E', indigo: '#28417A', burgundy: '#652A3C', rose: '#A85265', cocoa: '#543D32' };
const trims = { gold: '#E5BF74', ivory: '#F7EFE0', silver: '#C8D2D1', emerald: '#7ECBA8' };
const colors = { hair: '#14181B', eyes: '#181E22', pupil: '#0B0D0F', white: '#ECE2D6', lip: '#7D473E', shoe: '#422F26' };
const robes = new Set(['babbar_riga', 'kanuri_robe', 'jallabiya', 'atamfa', 'buba_zani', 'abaya']);

const getClothBump = scene => window.WasaRendering.clothNormal(scene);
function build(scene, cfg = {}, opts = {}) {
  const B = window.BABYLON;
  if (!B || !scene) throw Error('BABYLON scene is required');
  const feminine = cfg.body === 'feminine';
  const detail = opts.detail === 'medium' ? 14 : opts.detail === 'low' ? 10 : 40;
  const should = feminine ? .46 : .58, hips = feminine ? .51 : .41, waist = feminine ? .33 : .385, chest = feminine ? .43 : .535;
  const legGap = feminine ? .245 : .267;
  const skinCol = skins[cfg.skin] || skins.rich;
  const color = cfg.outfit === 'jamfa' && cfg.outfitColor === 'ivory' ? '#A5BDD9' :
    cfg.outfit === 'abaya' && cfg.outfitColor === 'rose' ? '#A782AF' :
    fabrics[cfg.outfitColor] || fabrics.ivory;
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
      m.metallic = 0;
      m.roughness = 0.58; // soft skin sheen
      m.ambientColor = m.albedoColor.scale(0.22); // warm melanin undertone
    } else if (name.includes('lips')) {
      m.metallic = 0;
      m.roughness = 0.45; // subtle moist lip finish
      m.ambientColor = m.albedoColor.scale(0.25);
    } else if (name.includes('embroidery') || name.includes('gold') || name.includes('silver') || name.includes('trim') || name.includes('watch') || name.includes('ring')) {
      m.metallic = ['gold','silver'].includes(cfg.trimColor) ? .65 : 0;
      m.roughness = m.metallic ? .32 : .65;
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
      m.roughness = 0.12; // glossy cornea
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
  if (feminine) motion.scaling.y = .975;

  function node(name, parent = motion, x = 0, y = 0, z = 0) {
    const n = new B.TransformNode('bone:' + name, scene);
    n.parent = parent; n.position.set(x, y, z); return n;
  }
  function sphere(name, parent, x, y, z, sx, sy, sz, material, segments = 20) {
    segments = Math.min(segments, detail);
    const m = B.MeshBuilder.CreateSphere(name, { diameter: 1, segments }, scene);
    m.parent = parent; m.position.set(x, y, z); m.scaling.set(sx * 2, sy * 2, sz * 2); m.material = material;
    m.isPickable = false; return m;
  }
  function tube(name, parent, coords, radius, material) {
    const m = B.MeshBuilder.CreateTube(name, { path: coords.map(p => new B.Vector3(...p)), radius, tessellation: 8, cap: B.Mesh.CAP_ALL }, scene);
    m.parent = parent; m.material = material; m.isPickable = false; return m;
  }
  function cylinder(name, parent, x, y, z, height, top, bottom, material, segments = 24) {
    const m = B.MeshBuilder.CreateCylinder(name, { height, diameterTop: top, diameterBottom: bottom, tessellation: Math.min(segments, detail) }, scene);
    m.parent = parent; m.position.set(x, y, z); m.material = material; m.isPickable = false; return m;
  }
  function box(name, parent, x, y, z, w, h, d, material) {
    const m = B.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.parent = parent; m.position.set(x, y, z); m.material = material; m.isPickable = false; return m;
  }
  function ellipsoidProfiles(name, parent, levels, material, segments = 28) {
    segments=Math.min(segments,detail);
    const points=[],indices=[],uvs=[],normals=[],stride=segments+1;
    for(let j=0;j<levels.length;j++){
      const [y,rx,rz,zOffset=0]=levels[j];
      for(let k=0;k<=segments;k++){
        const a=k*Math.PI*2/segments;
        points.push(Math.cos(a)*rx,y,zOffset+Math.sin(a)*rz);
        uvs.push(k/segments,(y-levels[0][0])/.7);
      }
    }
    for(let j=0;j<levels.length-1;j++)for(let k=0;k<segments;k++){
      const a=j*stride+k,b=a+1,c=a+stride,d=b+stride;
      indices.push(a,b,c,b,d,c);
    }
    for(let k=1;k<segments-1;k++){
      indices.push(0,k+1,k);
      const top=(levels.length-1)*stride;indices.push(top,top+k,top+k+1);
    }
    B.VertexData.ComputeNormals(points,indices,normals);
    for(let j=0;j<levels.length;j++){
      const a=j*stride*3,b=(j*stride+segments)*3;
      const n=new B.Vector3(normals[a]+normals[b],normals[a+1]+normals[b+1],normals[a+2]+normals[b+2]).normalize();
      for(const i of [a,b]){normals[i]=n.x;normals[i+1]=n.y;normals[i+2]=n.z;}
    }
    const data=new B.VertexData();data.positions=points;data.indices=indices;data.normals=normals;data.uvs=uvs;
    const mesh=new B.Mesh(name,scene);data.applyToMesh(mesh);
    mesh.parent=parent;mesh.material=material;mesh.isPickable=false;return mesh;
  }

  // Anatomical body proportions under clothing
  ellipsoidProfiles('anatomical torso', motion, [
    [1.94, hips * .83, .245], [2.08, hips, .275], [2.39, waist, .238],
    [2.69, feminine ? .398 : .465, .285], [2.88, chest, .291],
    [3.07, should * .87, .245], [3.20, should * .91, .23], [3.32, .19, .17]
  ], skin, 36);
  sphere('pelvis', motion, 0, 1.995, 0, hips * .91, .235, .258, skin);
  ellipsoidProfiles('neck', motion, [[3.23, .155, .14], [3.31, .145, .14], [3.54, .127, .12], [3.60, .129, .12]], skin, 24);

  // Clothing
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

  // Intricate Northern Nigerian embroidery (Arewa knot and neck placket)
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
  if (outfit === 'atamfa' || outfit === 'buba_zani') {
    const pattern = mat('woven pattern', cfg.trimColor === 'gold' ? '#D9AE68' : stitchCol, .32, .55);
    for (let k = 0; k < 4; k++) for (const side of [-1, 1]) {
      const y = 1.04 + k * .37, z = -Math.min(hemX * .52, .56);
      tube('atamfa trim ' + k + ' ' + side, motion, [
        [side * .15, y, z], [side * .26, y + .11, z], [side * .36, y, z]
      ], .017, pattern);
    }
  }
  if (outfit === 'shadda' || outfit === 'babbar_riga') {
    for (const side of [-1, 1]) tube('delicate shadda stripe ' + side, motion, [
      [side * .33, 2.94, -.30], [side * .42, 2.56, -.32], [side * .41, 2.21, -.32]
    ], .012, trim);
  }

  // Rigged bones
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

    // Anatomical hand: palm, thumb, knuckles and segmented fingers
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

    // Lower body
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

    // Anatomical shoe: upper, heel, defined sole
    sphere('tailored shoe upper', ankle, 0, -.065, -.135, .165, .105, .275, leather, 24);
    box('tailored shoe sole', ankle, 0, -.155, -.135, .32, .045, .56, soleMat);
    box('tailored shoe heel', ankle, 0, -.145, .045, .30, .065, .18, soleMat);
    if (cfg.footwear === 'sandals' || cfg.footwear === 'slippers') {
      box('sandal band', ankle, 0, -.03, -.38, .38, .055, .13, trim);
    }
    bones.legs.push({ hip, knee, ankle, side });
  }

  // Head and facial silhouette
  const head = node('head', motion, 0, 3.44, 0);
  bones.head = head;
  // One continuous skin surface avoids overlapping skull/jaw/cheek silhouettes.
  ellipsoidProfiles('continuous face',head,[
    [.07,.07,.09,-.10],[.12,.13,.16,-.085],[.20,feminine?.195:.215,.23,-.025],
    [.30,feminine?.255:.275,.26,.01],[.40,.295,.292,.02],[.50,.307,.316,.025],
    [.60,.30,.315,.025],[.70,.273,.29,.04],[.78,.205,.23,.04],
    [.83,.09,.11,.04],[.845,.005,.006,.04]
  ],skin,40);

  for (const side of [-1, 1]) {
    sphere('ear helix ' + side, head, side * .316, .434, .024, .041, .086, .049, skin, 16);
    sphere('ear lobe ' + side, head, side * .312, .365, .021, .032, .045, .036, skin, 14);
    // Anatomical eyes with cornea, iris, pupil
    sphere('eyewhite ' + side, head, side * .127, .489, -.294, .062, .034, .016, white, 20);
    sphere('iris ' + side, head, side * .126, .485, -.310, .028, .030, .014, eyes, 16);
    sphere('pupil ' + side, head, side * .126, .485, -.317, .013, .014, .008, pupilMat, 12);
    sphere('eyelid ' + side, head, side * .128, .522, -.303, .065, .011, .015, skin, 16);
    tube('eyebrow ' + side, head, [
      [side * .047, .603, -.296], [side * .130, .620, -.292], [side * .221, .611, -.254]
    ], .010, dark);
    // Nostril flared wings
    sphere('nostril ' + side, head, side * .045, .292, -.312, .032, .024, .034, skin, 14);
  }

  // Nose bridge, tip and philtrum groove
  sphere('bridge of nose', head, 0, .391, -.296, .044, .115, .062, skin, 24);
  sphere('nose tip', head, 0, .307, -.327, .056, .052, .060, skin, 20);
  sphere('philtrum groove', head, 0, .235, -.272, .022, .045, .018, skin, 14);

  // Cupid's bow contoured lips
  sphere('lower lip fullness', head, 0, .168, -.276, .078, .018, .024, lips, 20);
  for (const side of [-1, 1]) {
    sphere('upper lip arch ' + side, head, side * .032, .196, -.272, .045, .015, .022, lips, 16);
  }
  sphere('upper lip tubercle', head, 0, .193, -.276, .030, .014, .020, lips, 16);

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

  // Hair and headwear
  function hairGeometry() {
    const hairStyle = cfg.hair || 'short';
    sphere('sculpted haircut', head, 0, .746, .068, .316, .131, .291, dark, 32);
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
      sphere('short top hair', head, 0, .777, .04, .284, .102, .272, dark, 28);
    }
  }

  const hat = cfg.headwear || 'none';
  if (hat === 'none') hairGeometry();
  else if (['hijab', 'gyale', 'kallabi'].includes(hat)) {
    const scarf = hat === 'hijab' ? cloth : mat('neutral scarf', feminine ? '#BD95AF' : '#C1AD93', .88, 0);
    const layers = [[-.29, .49, .36, .105], [.12, .412, .342, .115],
      [.39, .369, .310, .106], [.66, .343, .288, .110], [.79, .30, .240, .115]];
    const steps = Math.min(30,detail), positions = [], indices = [], normals = [], uvs=[];
    const angle0 = -.24, angle1 = Math.PI + .24;
    for (const [y, rx, rz, zoff] of layers) {
      for (let i = 0; i <= steps; i++) {
        const angle = angle0 + (angle1 - angle0) * i / steps;
        positions.push(Math.cos(angle) * rx, y, Math.sin(angle) * rz + zoff);
        uvs.push(i/steps,(y+.29)/.7);
      }
    }
    for (let row = 0; row < layers.length - 1; row++) for (let col = 0; col < steps; col++) {
      const a = row * (steps + 1) + col, b = a + (steps + 1);
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
    B.VertexData.ComputeNormals(positions, indices, normals);
    const data = new B.VertexData(); data.positions = positions; data.indices = indices; data.normals = normals;data.uvs=uvs;
    const mesh = new B.Mesh('face-framing hijab and scarf', scene);
    data.applyToMesh(mesh); mesh.parent = head; mesh.material = scarf; mesh.isPickable = false;
    sphere('scarf crown', head, 0, .795, .10, .316, .106, .266, scarf, 24);
    ellipsoidProfiles('scarf over shoulders', motion, [
      [2.98, .51, .31], [3.06, .48, .30], [3.20, .32, .24], [3.31, .19, .17]
    ], scarf, 30);
    tube('scarf face-edge seam', head, [[-.33, .52, -.045], [-.315, .64, -.052],
      [-.22, .785, -.074], [0, .829, -.126], [.22, .785, -.074], [.315, .64, -.052], [.33, .52, -.045]], .016, trim);
  } else if (hat === 'rawani') {
    sphere('turban base', head, 0, .78, .03, .40, .18, .35, cloth);
    for (let n = 0; n < 4; n++) {
      const tor = B.MeshBuilder.CreateTorus('wrapped rawani', { diameter: .80 + n * .006, thickness: .115, tessellation: Math.min(36,detail) }, scene);
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

  // Accessories
  const accessory = cfg.accessory || 'none';
  if (accessory === 'beads') {
    for (let k = 0; k < 17; k++) {
      const a = k * Math.PI * 2 / 17;
      sphere('neck beads', motion, Math.sin(a) * .24, 3.24, Math.cos(a) * .24, .038, .038, .038, trim, 9);
    }
  } else if (accessory === 'belt') {
    ellipsoidProfiles('belt trim', motion, [[2.25, waist + .09, .34], [2.34, waist + .10, .35]], trim, 20);
  } else if (accessory === 'watch') {
    cylinder('wristwatch', bones.arms[1].wrist, 0, -.05, 0, .11, .30, .30, trim, 16);
  } else if (accessory === 'ring') {
    sphere('ring', bones.arms[1].wrist, .09, -.29, -.09, .045, .027, .044, trim);
  } else if (accessory === 'handbag') {
    const bag = mat('bag', '#6E4539', .42, .05);
    const wrist = bones.arms[1].wrist;
    box('handbag', wrist, .24, -.51, 0, .44, .37, .24, bag);
    tube('handbag handle', wrist, [[.10, -.35, 0], [.13, -.18, 0], [.33, -.18, 0], [.39, -.35, 0]], .031, trim);
  } else if (accessory === 'henna') {
    const henna = mat('Lalle henna', '#8F4A2A', .62, .01);
    for (const arm of bones.arms)
      for (let finger = 0; finger < 3; finger++) {
        box('henna on hand', arm.wrist, (finger - 1) * .069, -.18, -.119, .034, .022, .012, henna);
      }
  }

  // Locomotion simulation with pelvic bounce, hip drop, spine twist & breathing
  let gait = 0, smoothed = 0, time = 0;
  function animate(dt, move = 0, run = false) {
    dt = Math.min(Math.max(dt || 0, 0), .08); time += dt;
    const amount = typeof move === 'boolean' ? (move ? 1 : 0) : Math.min(Math.abs(move || 0), 1);
    smoothed += (amount - smoothed) * Math.min(1, dt * 8);
    gait += dt * (run ? 11.8 : 7.4) * (.20 + .80 * smoothed);
    const a = Math.sin(gait) * smoothed, b = Math.cos(gait) * smoothed;

    // Leg locomotion kinematics
    for (const part of bones.legs) {
      part.hip.rotation.x = part.side * a * (run ? .68 : .44);
      part.knee.rotation.x = smoothed * (.12 + Math.max(0, -part.side * a) * (run ? .74 : .48));
      part.ankle.rotation.x = -part.knee.rotation.x * .42;
    }

    // Arm swing with dynamic elbow flex
    for (const arm of bones.arms) {
      arm.shoulder.rotation.x = -arm.side * a * (run ? .46 : .30);
      arm.shoulder.rotation.z = -arm.side * (.10 + Math.max(0, -arm.side * a) * .08);
      arm.elbow.rotation.x = -(run ? .32 : .16) * smoothed - Math.max(0, arm.side * a) * .22 * smoothed;
    }

    // Body dynamics: idle breathing, vertical bounce, lateral hip shift, counter-twist
    const breathing = Math.sin(time * 1.8) * .007;
    motion.position.y = Math.sin(gait * 2) * .036 * smoothed + breathing;
    motion.rotation.z = b * .022 * smoothed; // lateral weight shift
    motion.rotation.y = -a * .018 * smoothed; // torso counter-twist
    motion.rotation.x = smoothed * (run ? .055 : .020);

    // Subtle head stabilization opposite to torso rotation
    head.rotation.y = -motion.rotation.y * .65 + Math.sin(time * .56) * .012 * (1 - smoothed);
    head.rotation.z = -motion.rotation.z * .5;
  }

  // Merge only meshes attached to the same joint/material, preserving articulation.
  const groups=new Map();
  for(const mesh of root.getChildMeshes()){
    mesh.computeWorldMatrix(true);mesh.receiveShadows=true;
    const key=mesh.parent.uniqueId+':'+mesh.material.uniqueId;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mesh);
  }
  for(const batch of groups.values()){
    if(batch.length<2)continue;
    const parent=batch[0].parent,inverse=parent.getWorldMatrix().clone().invert();
    const merged=B.Mesh.MergeMeshes(batch,true,true);
    if(merged){merged.bakeTransformIntoVertices(inverse);merged.parent=parent;merged.isPickable=false;merged.receiveShadows=true;}
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

window.WasaHuman = { create: build, version: '2.6.0-lite' };
})();
