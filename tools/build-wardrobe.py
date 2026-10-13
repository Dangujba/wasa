"""Author WASA's male and female skinned wardrobe GLBs. Requires numpy and Pillow.

Run python tools/build-wardrobe.py. Downloads pinned CC0 MakeHuman data to ignored
tmp/character-source; no MakeHuman program code or Blender installation is used.
The clothing, material maps, props, reduced rig and animation clips are authored
here, so the delivered game asset can be rebuilt and edited.
"""
from pathlib import Path
import argparse
import hashlib
import io
import json
import math
import struct
import subprocess
import sys
import urllib.request

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tmp/character-source'
DEST = ROOT / 'public/avatar/models'
REV = 'a8bc2d54ff0ac92e78ff71431b1023eda42bf482'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--body', choices=['all', 'masculine', 'feminine'], default='all')
args = parser.parse_args()
if args.body == 'all':
    for body in ['masculine', 'feminine']:
        subprocess.run([sys.executable, __file__, '--body', body], check=True)
    sys.exit(0)
FEMALE = args.body == 'feminine'
BODY = args.body
OUTFITS = ['abaya', 'atamfa', 'buba_zani'] if FEMALE else ['jamfa', 'kaftan', 'shadda', 'babbar_riga', 'kanuri_robe', 'jallabiya']
ASSET = 'wasa-'+BODY
FILES = {
    'base.obj': ('makehuman/data/3dobjs/base.obj', '8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c'),
    'default.mhskel': ('makehuman/data/rigs/default.mhskel', '99f179bce0aa850b45d4191a1d0d234c5851f881c057439470ded3bddf729a24'),
    'default_weights.mhw': ('makehuman/data/rigs/default_weights.mhw', '0f3641d651ae3d00ad6b4ccee43142edb109d3bd909d27d9e4139ef1beed8625'),
    'low-poly.obj': ('makehuman/data/eyes/low-poly/low-poly.obj', '783fe1e6331162c876520b4c2bed7a8ca06354ca15497e8ebd68bb1b59f4d3de'),
    'low-poly.mhclo': ('makehuman/data/eyes/low-poly/low-poly.mhclo', '68582e28e9176cba7cfcf35208f671b6201b8d1bc95c32decff61a3160ec34d8'),
    'brown_eye.png': ('makehuman/data/eyes/materials/brown_eye.png', '4659691c7295ad6206c78b003e5fd0e5f91dcd53032fa914a229bb48cabe424b'),
    'LICENSE.ASSETS.md': ('LICENSE.ASSETS.md', 'f6089cba01cb570a24712b41ab8a586ccd3cc5ef53dc266ca50b95c288956d2c'),
}
TARGET = 'african-female-young.target' if FEMALE else 'african-male-young.target'
FILES[TARGET] = ('makehuman/data/targets/macrodetails/'+TARGET,
                 '92d61eeb3c164b421fd5a7c3537ee45e7e1a51de4d49bf312e19c3df2be1d8fc' if FEMALE
                 else '894abc1fbb3d28543a51fef16f89d5d4bdf9aa2e1534413339811a3d47818b7d')
SOURCE.mkdir(parents=True, exist_ok=True)
DEST.mkdir(parents=True, exist_ok=True)
for filename, (path, digest) in FILES.items():
    local = SOURCE / filename
    if not local.exists():
        local.write_bytes(urllib.request.urlopen(
            f'https://raw.githubusercontent.com/makehumancommunity/makehuman/{REV}/{path}', timeout=60).read())
    if hashlib.sha256(local.read_bytes()).hexdigest() != digest:
        raise ValueError('Source hash mismatch: ' + filename)


def read_obj(path):
    positions, uvs, faces = [], [], []
    group = 'body'
    for line in path.read_text().splitlines():
        fields = line.split()
        if not fields:
            continue
        if fields[0] == 'v':
            positions.append(list(map(float, fields[1:4])))
        elif fields[0] == 'vt':
            uvs.append(list(map(float, fields[1:3])))
        elif fields[0] == 'g':
            group = fields[1]
        elif fields[0] == 'f':
            corners = [tuple(int(n)-1 for n in v.split('/')[:2]) for v in fields[1:]]
            for i in range(1, len(corners)-1):
                faces.append((group, [corners[0], corners[i], corners[i+1]]))
    return np.array(positions), np.array(uvs), faces


vertices, body_uv, body_faces = read_obj(SOURCE / 'base.obj')
for line in (SOURCE / TARGET).read_text().splitlines():
    if line and not line.startswith('#'):
        values = line.split()
        vertices[int(values[0])] += np.array(list(map(float, values[1:])))
ground = vertices[:13380, 1].min()
vertices[:, 1] -= ground
vertices *= .1  # MakeHuman decimetres -> glTF metres, +Y up and +Z forward.
NATIVE_HEIGHT = float(vertices[:13380, 1].max())
NATIVE_SCALE = NATIVE_HEIGHT/1.81539
# Author both anatomical bases in one reference-height space; export the real
# female/male dimensions. This preserves the female topology and proportions.
vertices /= NATIVE_SCALE
source_rig = json.loads((SOURCE / 'default.mhskel').read_text())
source_weights = json.loads((SOURCE / 'default_weights.mhw').read_text())['weights']

# Identity joint axes make every bind-space point and authored prop easy to inspect.
# Retain fingers; collapse facial control bones and twist subdivisions for mobile.
parents = {'root': None, 'spine04': 'root', 'spine02': 'spine04',
           'spine01': 'spine02', 'neck01': 'spine01', 'head': 'neck01'}
for side in ['L', 'R']:
    for name, parent in [('upperarm01', 'spine01'), ('lowerarm01', 'upperarm01'),
                         ('wrist', 'lowerarm01'), ('upperleg01', 'root'),
                         ('lowerleg01', 'upperleg01'), ('foot', 'lowerleg01')]:
        parents[name + '.' + side] = parent if parent in parents else parent + '.' + side
    for finger in range(1, 6):
        for segment in [1, 2]:
            name = f'finger{finger}-{segment}.{side}'
            parents[name] = f'wrist.{side}' if segment == 1 else f'finger{finger}-1.{side}'
bone_names = list(parents)
bone_index = {n: i for i, n in enumerate(bone_names)}
heads = {n: vertices[source_rig['joints'][source_rig['bones'][n]['head']]].mean(0) for n in bone_names}
for side, sign in [('L', 1), ('R', -1)]:
    for level, y in [('upper', 1.01), ('lower', .14)]:
        name = 'cloth_'+level+'.'+side
        parents[name] = 'root' if level == 'upper' else 'cloth_upper.'+side
        heads[name] = np.array([sign*.13, y, .045])
bone_names = list(parents)
bone_index = {n: i for i, n in enumerate(bone_names)}


def mapped_bone(name):
    while name not in parents:
        name = source_rig['bones'][name]['parent']
        if name is None:
            return 'root'
    return name


weights = [dict() for _ in vertices]
for name, pairs in source_weights.items():
    bone = mapped_bone(name)
    for index, value in pairs:
        weights[index][bone] = weights[index].get(bone, 0) + value


def influence(values):
    values = sorted(((n, v) for n, v in values.items() if v > 1e-8), key=lambda p: p[1], reverse=True)[:4] or [('root', 1)]
    total = sum(v for _, v in values)
    return ([bone_index[n] for n, _ in values] + [0]*4)[:4], ([v/total for _, v in values]+[0]*4)[:4]


def torso_weights(point):
    y = point[1]
    levels = [('root', .97), ('spine04', 1.10), ('spine02', 1.28), ('spine01', 1.47)]
    for i in range(len(levels)-1):
        a, b = levels[i:i+2]
        if y <= b[1]:
            t = np.clip((y-a[1])/(b[1]-a[1]), 0, 1)
            return {a[0]: float(1-t), b[0]: float(t)}
    return {'spine01': 1}


def arm_weights(point, side):
    shoulder, elbow, wrist = [heads[n+'.'+side] for n in ['upperarm01', 'lowerarm01', 'wrist']]
    # Blend across the elbow instead of rigidly splitting the sleeve.
    t = np.dot(point-shoulder, wrist-shoulder) / np.dot(wrist-shoulder, wrist-shoulder)
    knee_t = np.linalg.norm(elbow-shoulder) / np.linalg.norm(wrist-shoulder)
    blend = float(np.clip((t-knee_t+.15)/.3, 0, 1))
    return {'upperarm01.'+side: 1-blend, 'lowerarm01.'+side: blend}


gltf = {'asset': {'version': '2.0', 'generator': 'WASA wardrobe authoring pipeline',
                 'copyright': 'MakeHuman core CC0; WASA authored garment, materials and clips'},
        'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': 'WASA '+BODY, 'children': []}],
        'meshes': [], 'materials': [], 'accessors': [], 'bufferViews': [], 'skins': [],
        'textures': [], 'images': [], 'samplers': [{'magFilter': 9729, 'minFilter': 9987,
                                                  'wrapS': 10497, 'wrapT': 10497}], 'animations': []}
binary = bytearray()
AUTHOR_OUTFIT = None


def view(data, target=None):
    binary.extend(b'\0'*((-len(binary)) % 4))
    item = {'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)}
    if target:
        item['target'] = target
    binary.extend(data)
    gltf['bufferViews'].append(item)
    return len(gltf['bufferViews'])-1


def accessor(data, kind, dtype='<f4', target=None):
    array = np.array(data, dtype=dtype)
    component = {'<f4': 5126, '<u2': 5123, 'u1': 5121}[dtype]
    item = {'bufferView': view(array.tobytes(), target), 'componentType': component,
            'count': len(array), 'type': kind}
    if kind == 'VEC3' or kind == 'SCALAR':
        item['min'] = np.min(array, axis=0).reshape(-1).tolist()
        item['max'] = np.max(array, axis=0).reshape(-1).tolist()
    gltf['accessors'].append(item)
    return len(gltf['accessors'])-1


def texture(array):
    image = Image.fromarray(np.clip(array, 0, 255).astype('uint8'))
    stream = io.BytesIO()
    image.save(stream, format='PNG', optimize=True)
    gltf['images'].append({'bufferView': view(stream.getvalue()), 'mimeType': 'image/png'})
    gltf['textures'].append({'source': len(gltf['images'])-1, 'sampler': 0})
    return len(gltf['textures'])-1


# Original neutral albedo, weave normals and packed roughness. Recolour at runtime.
rng = np.random.default_rng(4313)
y, x = np.mgrid[:256, :256]
thread = np.sin(x*np.pi/4)*np.sin(y*np.pi/4)
height = thread*.6 + np.sin(x*.035)*.12 + rng.normal(0, .045, (256, 256))
gx, gy = np.roll(height, -1, 1)-np.roll(height, 1, 1), np.roll(height, -1, 0)-np.roll(height, 1, 0)
normal = np.dstack((-gx*.25, -gy*.25, np.ones_like(gx)))
normal /= np.linalg.norm(normal, axis=2, keepdims=True)
cloth_normal = texture((normal*.5+.5)*255)
shade = np.clip(234+thread*4+rng.normal(0, .8, (256, 256)), 0, 255)
cloth_color = texture(np.dstack((shade, shade, shade)))
cloth_rm = texture(np.dstack((np.ones_like(shade)*255, 225+thread*4, np.zeros_like(shade))))
pores = rng.normal(0, .08, (128, 128))
px, py = np.roll(pores, -1, 1)-np.roll(pores, 1, 1), np.roll(pores, -1, 0)-np.roll(pores, 1, 0)
skin_normal = texture(np.dstack((-px*.4+0.5, -py*.4+0.5, np.ones_like(px)))*255)
eye_texture = texture(np.array(Image.open(SOURCE/'brown_eye.png').convert('RGB').resize((256, 256))))


def material(name, color, rough=.8, metal=0, fabric=False, skin=False, eye=False):
    pbr = {'baseColorFactor': [*color, 1], 'metallicFactor': metal, 'roughnessFactor': rough}
    item = {'name': name, 'pbrMetallicRoughness': pbr, 'doubleSided': fabric}
    if fabric:
        pbr['baseColorTexture'] = {'index': cloth_color}
        pbr['metallicRoughnessTexture'] = {'index': cloth_rm}
        item['normalTexture'] = {'index': cloth_normal, 'scale': .35}
    if skin:
        item['normalTexture'] = {'index': skin_normal, 'scale': .16}
    if eye:
        pbr['baseColorTexture'] = {'index': eye_texture}
    gltf['materials'].append(item)
    return len(gltf['materials'])-1


skin_mat = material('skin', [.36, .18, .11], .62, skin=True)
cloth_mat = material('jamfa fabric', [.82, .88, .95], .88, fabric=True)
trim_mat = material('jamfa embroidery', [.65, .72, .75], .52, .25)
hair_mat = material('hair', [.025, .021, .018], .97)
shoe_mat = material('footwear leather', [.065, .035, .021], .62)
sole_mat = material('footwear sole', [.025, .025, .025], .92)
sneaker_mat = material('footwear sneaker', [.83, .84, .81], .85)
eye_mat = material('eyes', [1, 1, 1], .22, eye=True)
scarf_mat = material('scarf fabric', [.78, .60, .68], .90, fabric=True) if FEMALE else None
henna_mat = material('henna', [.18, .038, .01], .87) if FEMALE else None
bag_mat = material('handbag leather', [.12, .056, .035], .64) if FEMALE else None


def normals(points, triangles):
    points, triangles = np.array(points), np.array(triangles)
    result = np.zeros_like(points, dtype=float)
    for a, b, c in triangles:
        n = np.cross(points[b]-points[a], points[c]-points[a])
        result[a] += n
        result[b] += n
        result[c] += n
    result /= np.maximum(np.linalg.norm(result, axis=1, keepdims=True), 1e-10)
    return result


mesh_stats = []


def mesh(name, points, triangles, uv, mat, weight_fn, colors=None, extra=None):
    points = np.array(points)
    if not len(points):
        return
    n = normals(points, triangles)
    # Smooth shared positions across OBJ UV islands and closed loft seams.
    welded = {}
    for i, p in enumerate(points):
        welded.setdefault(tuple(np.round(p, 6)), []).append(i)
    for indices in welded.values():
        direction = n[indices].sum(0)
        length = np.linalg.norm(direction)
        n[indices] = direction/length if length > 1e-9 else [0, 1, 0]
    tangent, bitangent = np.zeros_like(points), np.zeros_like(points)
    uv = np.array(uv)
    for a, b, c in triangles:
        e1, e2 = points[b]-points[a], points[c]-points[a]
        d1, d2 = uv[b]-uv[a], uv[c]-uv[a]
        det = d1[0]*d2[1]-d2[0]*d1[1]
        if abs(det) < 1e-10:
            continue
        t, bt = (e1*d2[1]-e2*d1[1])/det, (e2*d1[0]-e1*d2[0])/det
        for i in [a, b, c]:
            tangent[i] += t;bitangent[i] += bt
    tangents = []
    for norm, tan, bitan in zip(n, tangent, bitangent):
        tan -= norm*np.dot(norm, tan)
        if np.linalg.norm(tan) < 1e-10:
            tan = np.cross(norm, [1, 0, 0] if abs(norm[0]) < .9 else [0, 0, 1])
        tan /= np.linalg.norm(tan)
        tangents.append([*tan, -1 if np.dot(np.cross(norm, tan), bitan) < 0 else 1])
    ji, we = zip(*(influence(weight_fn(p, i)) for i, p in enumerate(points)))
    attributes = {'POSITION': accessor(points*NATIVE_SCALE, 'VEC3', target=34962),
                  'NORMAL': accessor(n, 'VEC3', target=34962),
                  'JOINTS_0': accessor(ji, 'VEC4', '<u2', 34962),
                  'WEIGHTS_0': accessor(we, 'VEC4', target=34962)}
    if 'normalTexture' in gltf['materials'][mat] or 'baseColorTexture' in gltf['materials'][mat]['pbrMetallicRoughness']:
        attributes['TEXCOORD_0'] = accessor(uv, 'VEC2', target=34962)
    if 'normalTexture' in gltf['materials'][mat]:
        attributes['TANGENT'] = accessor(tangents, 'VEC4', target=34962)
    if colors is not None:
        attributes['COLOR_0'] = accessor(colors, 'VEC3', target=34962)
    primitive = {'attributes': attributes, 'indices': accessor(np.array(triangles).reshape(-1), 'SCALAR', '<u2', 34963), 'material': mat}
    gltf['meshes'].append({'name': name, 'primitives': [primitive]})
    node = {'name': name, 'mesh': len(gltf['meshes'])-1, 'skin': 0}
    if extra:
        node['extras'] = extra
    node.setdefault('extras', {})['wasa'] = {'body': BODY, 'outfit': AUTHOR_OUTFIT}
    gltf['nodes'].append(node)
    gltf['nodes'][0]['children'].append(len(gltf['nodes'])-1)
    mesh_stats.append({'name': name, 'vertices': len(points), 'triangles': len(triangles)})


def obj_subset(name, source_points, uvs, faces, predicate, mat, alter=None, weight_override=None, color_fn=None, uv_scale=1):
    remap, points, tex, triangles, indices = {}, [], [], [], []
    for group, corners in faces:
        if not predicate(group, [source_points[a] for a, _ in corners]):
            continue
        tri = []
        for a, b in corners:
            key = (a, b)
            if key not in remap:
                remap[key] = len(points)
                point = source_points[a].copy()
                if alter:
                    point = alter(point)
                points.append(point)
                tex.append([uvs[b, 0]*uv_scale, (1-uvs[b, 1])*uv_scale])
                indices.append(a)
            tri.append(remap[key])
        triangles.append(tri)
    colors = [color_fn(p) for p in points] if color_fn else None
    mesh(name, points, triangles, tex, mat,
         lambda p, i: weight_override(p) if weight_override else weights[indices[i]], colors)


def skin_color(p):
    # Fine colour variation in the actual sculpted lips, ears, forehead and palms.
    x, y, z = p
    lip = np.exp(-((x/.027)**4 + ((y-1.625)/.013)**4))*float(z > .142)
    ear = float(abs(x) > .071 and y > 1.64)
    variation = .985 + .025*math.sin(y*53+z*27)
    return np.clip(np.array([variation+lip*.015+ear*.025, variation-lip*.20, variation-lip*.12]), 0, 1)


def visible_skin(group, pts):
    if group != 'body':
        return False
    center = np.mean(pts, axis=0)
    return center[1] > 1.552 or (abs(center[0]) > (.470 if FEMALE else .498) and center[1] > .96)


obj_subset('sculpted head and hands', vertices, body_uv, body_faces, visible_skin, skin_mat, color_fn=skin_color)


def loft(name, rings, mat, weight_fn, segments=48, folds=0, extra=None, caps=False, warp=None):
    # Rings are centre, two perpendicular radius vectors, UV distance.
    pts, uv, tris = [], [], []
    for j, (center, a, b, v) in enumerate(rings):
        for i in range(segments+1):
            t = i/segments*math.tau
            ripple = 1 + folds*(math.cos(t*11+v*2)*.6+math.sin(t*7-v*4)*.4)
            point = np.array(center)+ripple*(np.array(a)*math.cos(t)+np.array(b)*math.sin(t))
            pts.append(warp(point, t, j) if warp else point)
            uv.append([i/segments*8, v*10])
            if j and i:
                c = j*(segments+1)+i
                tris += [[c, c-segments-2, c-1], [c, c-segments-1, c-segments-2]]
    if caps:
        for j, reverse in [(0, True), (len(rings)-1, False)]:
            c = len(pts)
            pts.append(np.array(rings[j][0]));uv.append([.5, .5])
            for i in range(segments):
                a, b = j*(segments+1)+i, j*(segments+1)+i+1
                tris.append([c, a, b] if reverse else [c, b, a])
    mesh(name, pts, tris, uv, mat, lambda p, i: weight_fn(p), extra=extra)


torso_rings = [(.735, .218, .140), (.75, .220, .143), (.80, .214, .142),
               (.88, .205, .143), (.98, .185, .135), (1.06, .174, .122),
               (1.12, .160, .116), (1.15, .158, .114), (1.20, .162, .121)]
if not FEMALE:
    AUTHOR_OUTFIT = 'jamfa'
    loft('outfit jamfa tunic', [([0, y, .045], [rx, 0, 0], [0, 0, rz], y)
                               for y, rx, rz in torso_rings], cloth_mat, torso_weights, folds=.035)
    AUTHOR_OUTFIT = None
    loft('standing collar', [([0, y, .017], [rx, 0, 0], [0, 0, rz], y)
                             for y, rx, rz in [(1.54, .076, .065), (1.569, .072, .061)]], cloth_mat, torso_weights)

# An anatomical, continuous shoulder/arm topology makes the sleeve join bend
# naturally. Remove muscular definition with tailored ease rather than stacking
# rigid cylindrical shoulder pieces. The long tunic below overlaps at the waist.
def shirt_shape(p):
    x, y, z = p
    if abs(x) < .205:
        radial = np.array([x, 0, z-.014]);radial /= max(np.linalg.norm(radial), 1e-9)
        p += radial*.017
        if FEMALE and z > .045 and 1.10 < y < 1.53:
            # A loose garment bridges bust contours; clothing remains opaque.
            radius = np.interp(y, [1.10, 1.20, 1.30, 1.43, 1.53], [.176, .177, .205, .210, .112])
            envelope = np.interp(y, [1.10, 1.20, 1.30, 1.36, 1.43, 1.50, 1.53], [.177, .182, .221, .222, .192, .130, .10])
            front = .04+(envelope-.04)*math.sqrt(max(0, 1-(x/radius)**2))
            blend = float(np.clip((z-.045)/.060, 0, 1))
            p[2] = p[2]*(1-blend)+front*blend
        return p
    side = 'L' if x > 0 else 'R'
    shoulder, elbow, wrist = [heads[n+'.'+side] for n in ['upperarm01', 'lowerarm01', 'wrist']]
    options = []
    for start, end in [(shoulder, elbow), (elbow, wrist)]:
        t = np.clip(np.dot(p-start, end-start)/np.dot(end-start, end-start), 0, 1)
        point = start+(end-start)*t
        options.append((np.linalg.norm(p-point), point))
    _, point = min(options, key=lambda q: q[0])
    direction = p-point
    distance = max(np.linalg.norm(direction), 1e-9)
    t = np.clip(np.dot(point-shoulder, wrist-shoulder)/np.dot(wrist-shoulder, wrist-shoulder), 0, 1)
    radius = .078*(1-t)+.049*t
    return point+direction/distance*max(distance+.006, radius)

obj_subset('tailored yoke and sleeves', vertices, body_uv, body_faces,
           lambda g, p: g == 'body' and 1.11 < np.mean(p, axis=0)[1] < 1.55
           and abs(np.mean(p, axis=0)[0]) < (.472 if FEMALE else .50),
           cloth_mat, alter=shirt_shape, uv_scale=14)


for side in ['L', 'R']:
    hip, knee, ankle = [heads[n+'.'+side] for n in ['upperleg01', 'lowerleg01', 'foot']]
    rings = []
    for y in np.linspace(.095, 1.025, 25):
        axis_x = np.interp(y, [ankle[1], knee[1], hip[1]], [ankle[0], knee[0], hip[0]])
        axis_z = np.interp(y, [ankle[1], knee[1], hip[1]], [ankle[2], knee[2], hip[2]])
        radius = np.interp(y, [.095, .24, .55, .78, 1.025], [.054, .070, .081, .106, .116])
        # Tailored ease, longitudinal creases and a few shallow knee folds.
        radius += .0015*math.sin(y*45)*math.exp(-((y-.55)/.13)**2)
        rings.append(([axis_x, y, axis_z], [radius, 0, 0], [0, 0, radius*1.03], y))
    def leg_weights(p, side=side):
        t = float(np.clip((p[1]-.44)/.22, 0, 1))
        return {'upperleg01.'+side: t, 'lowerleg01.'+side: 1-t}
    loft('jamfa trousers '+side, rings, cloth_mat, leg_weights, segments=40, folds=.023)


def sleeve(side):
    shoulder, elbow, wrist = [heads[n+'.'+side] for n in ['upperarm01', 'lowerarm01', 'wrist']]
    rings = []
    for i in range(17):
        t = i/16
        k = .5
        center = shoulder*(1-t/k)+elbow*(t/k) if t < k else elbow*(1-(t-k)/(1-k))+wrist*((t-k)/(1-k))
        axis = (elbow-shoulder) if t < k else (wrist-elbow)
        axis /= np.linalg.norm(axis)
        a = np.cross(axis, [0, 0, 1]);a /= np.linalg.norm(a)
        b = np.cross(axis, a)
        radius = .086*(1-t)+.049*t
        center -= axis*(.045 if i == 0 else .013)
        rings.append((center, a*radius, b*radius, t*.60))
    loft('embroidered cuff '+side, rings[-2:], trim_mat, lambda p: {'lowerarm01.'+side: 1}, segments=32)


for side in ['L', 'R']:
    sleeve(side)


def ribbon(name, path, width, mat, weight_fn, extra=None):
    pts, uv, tris = [], [], []
    path = np.array(path)
    length = 0
    for i, p in enumerate(path):
        tangent = path[min(i+1, len(path)-1)]-path[max(i-1, 0)]
        across = np.cross(tangent, [0, 0, 1])
        across /= max(np.linalg.norm(across), 1e-9)
        if i:
            length += np.linalg.norm(p-path[i-1])
        pts.extend([p-across*width/2, p+across*width/2])
        uv.extend([[0, length*10], [1, length*10]])
        if i:
            c = 2*i
            tris.extend([[c-2, c+1, c], [c-2, c-1, c+1]])
    mesh(name, pts, tris, uv, mat, lambda p, i: weight_fn(p), extra=extra)


def shirt_front(y, x=0):
    if y > 1.19:
        near = vertices[:13380][(abs(vertices[:13380, 0]-x)<.008)&(abs(vertices[:13380, 1]-y)<.009)]
        if len(near):
            return near[:, 2].max()+.022
    ys = [r[0] for r in torso_rings]
    rx = np.interp(y, ys, [r[1] for r in torso_rings])
    rz = np.interp(y, ys, [r[2] for r in torso_rings])
    t = math.asin(np.clip(x/rx, -1, 1))
    angle = math.pi/2-t
    ripple = 1+.035*(math.cos(angle*11+y*2)*.6+math.sin(angle*7-y*4)*.4)
    return .045+rz*math.cos(t)*ripple+.0035


# Twin placket seams, stitched diamonds and a small chest pocket.
for sign in ([] if FEMALE else [-1, 1]):
    path = [[sign*.012, y, shirt_front(y, sign*.012)] for y in np.linspace(1.27, 1.53, 32)]
    ribbon('placket '+str(sign), path, .004, trim_mat, torso_weights)
    path = []
    for y in np.linspace(1.29, 1.49, 90):
        x = sign*(.025+.012*abs(math.sin((y-1.29)*math.pi/.028)))
        path.append([x, y, shirt_front(y, x)])
    ribbon('diamond embroidery '+str(sign), path, .0028, trim_mat, torso_weights)
if not FEMALE:
    path = [[x, y, shirt_front(y, x)] for x, y in [(.09, 1.39), (.09, 1.30), (.145, 1.30), (.145, 1.39)]]
    ribbon('pocket piping', path, .003, trim_mat, torso_weights)

# Fit supplied low-poly eyes to the shaped MakeHuman eye helper vertices.
_, eye_uv, eye_faces = read_obj(SOURCE/'low-poly.obj')
lines = (SOURCE/'low-poly.mhclo').read_text().split('verts 0', 1)[1].splitlines()
eye_points = vertices[[int(l) for l in lines if l.strip().isdigit()]]
obj_subset('anatomical eyes', eye_points, eye_uv, eye_faces, lambda g, p: True,
           eye_mat, weight_override=lambda p: {'head': 1})


def surface_strip(name, ys, x_fn, mat, extra=None):
    pts, uv, tris = [], [], []
    face = vertices[:13380]
    for j, y in enumerate(ys):
        left, right = x_fn(y)
        for i in range(17):
            x = left+(right-left)*i/16
            candidates = face[(abs(face[:, 1]-y) < .012)&(abs(face[:, 0]-x) < .012)]
            z = candidates[:, 2].max() if len(candidates) else .12
            pts.append([x, y, z+.0015]);uv.append([i/16, j/(len(ys)-1)])
            if i and j:
                c = j*17+i
                tris.extend([[c, c-1, c-18], [c, c-18, c-17]])
    mesh(name, pts, tris, uv, mat, lambda p, i: {'head': 1}, extra=extra)


for sign in [-1, 1]:
    # Brow hugs the forehead rather than floating above the eyeball.
    path = []
    for x in np.linspace(.018, .064, 16):
        y = 1.728+.007*math.sin((x-.018)/.046*math.pi)
        near = vertices[:13380][(abs(vertices[:13380, 0]-sign*x)<.007)&(abs(vertices[:13380, 1]-y)<.008)]
        path.append([sign*x, y, near[:, 2].max()+.0018])
    ribbon('eyebrow '+str(sign), path, .006, hair_mat, lambda p: {'head': 1})

# Scalp subset shares the anatomical skull silhouette, with a slightly irregular
# outline and raised textured crown; hair variants do not expose a bald forehead.
for style, lift in [('close', .0015), ('short', .011), ('curls', .022), ('locs', .014)]+([('braids', .007)] if FEMALE else []):
    def hairline(g, pts):
        if g != 'body':
            return False
        x, y, z = np.mean(pts, axis=0)
        line = 1.754 if z > .07 else 1.698
        return y > line + .008*math.cos(x*38)
    def raise_hair(p, lift=lift):
        axis = p-np.array([0, 1.738, .05]);axis /= max(np.linalg.norm(axis), 1e-9)
        return p+axis*(lift+.002*math.sin(p[0]*240)*math.cos(p[1]*210))
    obj_subset('hair '+style, vertices, body_uv, body_faces, hairline, hair_mat,
               alter=raise_hair, weight_override=lambda p: {'head': 1})

for style in ['curls', 'locs']+(['braids'] if FEMALE else []):
    pts, uv, tris = [], [], []
    if style == 'curls':
        for k in range(14):
            angle = k*2.39996
            r = .070*math.sqrt(k/14)
            center = np.array([math.cos(angle)*r, 1.827-.050*(r/.070)**2, .052+math.sin(angle)*r])
            start = len(pts)
            for j in range(6):
                latitude = .03+j/5*(math.pi-.06)
                for i in range(9):
                    theta = i/8*math.tau
                    pts.append(center+np.array([math.sin(latitude)*math.cos(theta), math.cos(latitude), math.sin(latitude)*math.sin(theta)])*.016)
                    uv.append([i/8, j/5])
                    if i and j:
                        c = start+j*9+i
                        tris.extend([[c, c-10, c-1], [c, c-9, c-10]])
    else:
        for k in range(12):
            angle = k/12*math.tau
            start = len(pts)
            length = .045 if math.sin(angle) > .3 else (.23 if style == 'braids' else .15)
            for j in range(8):
                t = j/7
                center = np.array([.081*math.cos(angle)*(1+t*.08), 1.79-t*length,
                                   .053+.093*math.sin(angle)*(1+t*.08)])
                for i in range(9):
                    theta = i/8*math.tau
                    radius = (.0055 if style=='braids' else .0075)*(1-t*.4)*(1+.10*math.sin(j*3+i))
                    pts.append(center+[radius*math.cos(theta), 0, radius*math.sin(theta)])
                    uv.append([i/8, t])
                    if i and j:
                        c = start+j*9+i
                        tris.extend([[c, c-1, c-10], [c, c-10, c-9]])
    mesh('hair '+style+' detail', pts, tris, uv, hair_mat, lambda p, i: {'head': 1})

if not FEMALE:
    surface_strip('facial moustache', np.linspace(1.643, 1.652, 4), lambda y: (-.033, .033), hair_mat)
    surface_strip('facial goatee', np.linspace(1.589, 1.609, 6), lambda y: (-.018, .018), hair_mat)
    surface_strip('facial full_beard', np.linspace(1.580, 1.618, 10), lambda y: (-.057, .057), hair_mat)

# Optional caps use the same shared materials. Shape is illustrative cultural art.
for cap, rx, rz, height in ([] if FEMALE else [('zanna_bukar', .083, .095, .072), ('hula', .084, .096, .076),
                           ('dara', .086, .097, .079), ('bama', .082, .093, .064), ('rawani', .10, .107, .105)]):
    rings = [([0, 1.747+h, .057], [rx*r, 0, 0], [0, 0, rz*r], h)
             for h, r in [(0, 1), (.006, 1.01), (height*.70, .96), (height, .82), (height+.008, .015)]]
    loft('headwear '+cap, rings, cloth_mat, lambda p: {'head': 1}, segments=40, folds=.008, caps=True)
    for h in [.004, .015, .035]:
        path = [[rx*math.cos(t), 1.747+h, .057+rz*math.sin(t)] for t in np.linspace(0, math.tau, 65)]
        ribbon('headwear trim '+cap+' '+str(h), path, .0025, trim_mat, lambda p: {'head': 1})


obj_subset('footwear bare feet', vertices, body_uv, body_faces,
           lambda g, p: g == 'body' and np.mean(p, axis=0)[1] < .085,
           skin_mat, weight_override=lambda p: {'foot.L' if p[0]>0 else 'foot.R': 1}, color_fn=skin_color)

for side, sign in [('L', 1), ('R', -1)]:
    foot = heads['foot.'+side]
    for kind, material_id, height in [('upper', shoe_mat, .105), ('sole', sole_mat, .023)]:
        # Oval leather last with rounded toe and flat layered sole.
        rings = [([foot[0], y, .096], [rx, 0, 0], [0, 0, rz], y)
                 for y, rx, rz in ([(.024, .063, .142), (.044, .066, .145), (.082, .052, .125),
                                    (.116, .037, .065), (.130, .023, .04)] if kind == 'upper'
                                   else [(.002, .064, .143), (.024, .065, .145)])]
        loft('footwear leather '+kind+' '+side, rings, material_id, lambda p, side=side: {'foot.'+side: 1}, segments=32, caps=True)
    for style in ['sneakers', 'sandals', 'slippers']:
        rings = [([foot[0], y, .096], [rx, 0, 0], [0, 0, rz], y)
                 for y, rx, rz in [(.002, .064, .143), (.025 if style=='sneakers' else .016, .065, .145)]]
        loft('footwear '+style+' sole '+side, rings, sole_mat, lambda p, side=side: {'foot.'+side: 1}, segments=32, caps=True)
        if style == 'sneakers':
            rings = [([foot[0], y, .096], [rx, 0, 0], [0, 0, rz], y)
                     for y, rx, rz in [(.025, .066, .145), (.06, .068, .145), (.105, .052, .12), (.13, .029, .06)]]
            loft('footwear sneakers upper '+side, rings, sneaker_mat, lambda p, side=side: {'foot.'+side: 1}, segments=32, caps=True)
            for z in [.115, .135, .155]:
                ribbon('footwear sneakers lace '+str(z)+' '+side,
                       [[foot[0]-.025, .112, z], [foot[0]+.025, .112, z]], .004, sole_mat,
                       lambda p, side=side: {'foot.'+side: 1})
        else:
            for z in ([.11, .16] if style=='sandals' else [.15]):
                path = [[foot[0]+x, .024+.049*math.sqrt(max(0, 1-(x/.055)**2)), z]
                        for x in np.linspace(-.055, .055, 24)]
                ribbon('footwear '+style+' strap '+str(z)+' '+side, path,
                       .023 if style=='sandals' else .050, shoe_mat, lambda p, side=side: {'foot.'+side: 1})

# Compact jewellery alternatives. All optional pieces are selected by the loader.
for name, center, a, b, weight in [
    ('watch', heads['wrist.L']+np.array([0, .024, -.014]), [.035, 0, 0], [0, .020, .020], 'lowerarm01.L'),
    ('ring', heads['finger3-1.R']+np.array([0, -.008, .012]), [.01, 0, 0], [0, .007, .006], 'finger3-1.R'),
    ('beads', [0, 1.493, .04], [.105, 0, 0], [0, .08, .075], 'spine01'),
    ('belt', [0, 1.06, .016], [.215, 0, 0], [0, 0, .149], 'spine04')]:
    rings = [(np.array(center)+[0, y, 0], a, b, y) for y in [-.006, .006]]
    loft('accessory '+name, rings, trim_mat, lambda p, weight=weight: {weight: 1}, segments=40)


# Distinct garments share one base/rig/texture set. Extras record the wardrobe
# slot; the adapter deletes every unselected outfit before displaying the actor.
def robe_weights(p):
    cloth = float(np.clip((1.21-p[1])/.37, 0, 1))
    lower = float(np.clip((.70-p[1])/.53, 0, 1))
    side = float(np.clip(.5+p[0]/.33, 0, 1))
    result = {n: w*(1-cloth) for n, w in torso_weights(p).items()}
    for letter, strength in [('L', side), ('R', 1-side)]:
        result['cloth_upper.'+letter] = cloth*strength*(1-lower)
        result['cloth_lower.'+letter] = cloth*strength*lower
    return result


def printed_material(name, flower):
    # Original repeating dye artwork. Fabric weave is independent of the larger
    # print, so motif scale does not turn thread normals into visible checkers.
    yy, xx = np.mgrid[:256, :256]
    u, v = (xx%64-32)/32, (yy%64-32)/32
    radial = np.sqrt(u*u+v*v)
    angle = np.arctan2(v, u)
    if flower:
        mask = (radial < .49+.15*np.cos(angle*8))&(radial>.15)
        mask |= ((abs(u)+abs(v)>.85)&(abs(u)+abs(v)<.93))
    else:
        mask = ((abs(u)+abs(v)>.37)&(abs(u)+abs(v)<.48))
        mask |= ((abs(u-v)>.94)&(abs(u-v)<1.08))
    shade = np.where(mask, 100, 238)+rng.normal(0, .6, (256, 256))
    dye = texture(np.dstack((shade, shade, shade)))
    index = material(name, [.7, .35, .5], .94, fabric=True)
    gltf['materials'][index]['pbrMetallicRoughness']['baseColorTexture'] = {
        'index': dye, 'extensions': {'KHR_texture_transform': {'scale': [.35, .25]}}}
    gltf.setdefault('extensionsUsed', []).append('KHR_texture_transform') if 'KHR_texture_transform' not in gltf.get('extensionsUsed', []) else None
    return index


atamfa_mat = printed_material('atamfa printed fabric', True) if FEMALE else None
buba_mat = printed_material('buba printed fabric', False) if FEMALE else None
garment_materials = {'atamfa': atamfa_mat, 'buba_zani': buba_mat}
garment_profiles = {
    'kaftan': [(.46, .25, .16), (.60, .24, .158), (.85, .205, .14), (1.06, .174, .122), (1.20, .162, .121)],
    'shadda': [(.32, .275, .18), (.47, .264, .175), (.85, .211, .143), (1.06, .176, .123), (1.20, .164, .123)],
    'jallabiya': [(.105, .292, .19), (.32, .279, .18), (.64, .251, .164), (.98, .188, .135), (1.20, .162, .121)],
    'kanuri_robe': [(.15, .316, .205), (.36, .299, .194), (.70, .262, .17), (.98, .190, .14), (1.20, .164, .122)],
    'babbar_riga': [(.20, .47, .24), (.40, .44, .225), (.80, .37, .205), (1.10, .29, .188), (1.37, .32, .20), (1.44, .31, .18), (1.50, .22, .13), (1.54, .08, .075)],
    'abaya': [(.08, .32, .218), (.28, .303, .207), (.68, .272, .191), (1.03, .232, .18), (1.20, .180, .143)],
    'atamfa': [(.105, .32, .214), (.40, .29, .198), (.82, .240, .18), (1.03, .218, .162), (1.20, .177, .141)],
    'buba_zani': [(.72, .244, .181), (.80, .24, .180), (1.04, .224, .17), (1.20, .179, .143)],
}
for outfit in OUTFITS:
    if outfit == 'jamfa':
        continue
    AUTHOR_OUTFIT = outfit
    profile = garment_profiles[outfit]
    ys = np.linspace(profile[0][0], profile[-1][0], 32)
    rings = [([0, y, .045], [np.interp(y, [p[0] for p in profile], [p[1] for p in profile]), 0, 0],
              [0, 0, np.interp(y, [p[0] for p in profile], [p[2] for p in profile])], y) for y in ys]
    fabric = garment_materials.get(outfit, cloth_mat)
    weight = robe_weights if outfit not in ['kaftan', 'shadda', 'buba_zani'] else torso_weights
    loft('outfit '+outfit+' garment', rings, fabric, weight, segments=56, folds=.025 if FEMALE else .034)
    # Finely stitched hems and collars, with a restrained plain Jallabiya hem.
    if outfit != 'jallabiya':
        hem = profile[0]
        loft('outfit '+outfit+' hem piping',
             [([0, y, .045], [hem[1]*1.002, 0, 0], [0, 0, hem[2]*1.002], y)
              for y in [hem[0]+.003, hem[0]+.010]], trim_mat, weight, segments=56)
    if outfit == 'buba_zani':
        wrap = [([0, y, .048], [rx, 0, 0], [0, 0, rz], y)
                for y, rx, rz in [(.105, .32, .215), (.25, .31, .21), (.55, .275, .19), (.80, .24, .182), (1.02, .223, .17)]]
        loft('outfit buba_zani wrapped skirt', wrap, buba_mat, robe_weights, segments=56, folds=.026)
        path = []
        for y in np.linspace(.14, .95, 45):
            x = .07+(y-.14)*.10
            rz = np.interp(y, [.105, .55, 1.02], [.215, .19, .17])
            rx = np.interp(y, [.105, .55, 1.02], [.32, .275, .223])
            path.append([x, y, .048+rz*math.sqrt(1-(x/rx)**2)+.004])
        ribbon('outfit buba_zani wrap seam', path, .008, trim_mat, robe_weights)
    if outfit in ['shadda', 'kanuri_robe', 'babbar_riga']:
        top, bottom = (1.45, 1.16) if outfit != 'babbar_riga' else (1.45, .99)
        for sign in [-1, 1]:
            path = []
            for y in np.linspace(bottom, top, 100):
                x = sign*(.047+.010*math.cos((y-bottom)*90))
                if outfit == 'babbar_riga':
                    rx = np.interp(y, [p[0] for p in profile], [p[1] for p in profile])
                    rz = np.interp(y, [p[0] for p in profile], [p[2] for p in profile])
                    z = .045+rz*math.sqrt(max(0, 1-(x/rx)**2))+.006
                else:
                    z = shirt_front(y, x)+.004
                path.append([x, y, z])
            ribbon('outfit '+outfit+' embroidered panel '+str(sign), path, .008 if outfit=='babbar_riga' else .005, trim_mat, torso_weights)
    if outfit == 'babbar_riga':
        for side, sign in [('L', 1), ('R', -1)]:
            shoulder, elbow = heads['upperarm01.'+side], heads['lowerarm01.'+side]
            rings = []
            for t in np.linspace(-.06, 1.15, 16):
                center = shoulder+(elbow-shoulder)*t
                axis = elbow-shoulder;axis = axis/np.linalg.norm(axis)
                across = np.cross(axis, [0, 0, 1]);across /= np.linalg.norm(across)
                radius = .09+max(0, t)*.13
                rings.append((center, across*radius, np.cross(axis, across)*radius*.7, t))
            loft('outfit babbar_riga flowing sleeve '+side, rings, cloth_mat,
                 lambda p, side=side: {'upperarm01.'+side: 1}, segments=32, folds=.06)
    AUTHOR_OUTFIT = None


if FEMALE:
    # Head scarfs have a true face aperture, a closed crown and a separate drape.
    # Hood follows the head; the shoulder layer follows spine/neck weights.
    for scarf in ['hijab', 'gyale']:
        loose = 1.09 if scarf == 'gyale' else 1
        pts, uv, tris = [], [], []
        layers = [(1.578, .102, .119, .20), (1.61, .102, .122, .19),
                  (1.66, .105, .122, .19), (1.72, .101, .118, .22),
                  (1.77, .09, .110, .29), (1.81, .075, .09, .39),
                  (1.834, .045, .062, .49), (1.85, .001, .001, .5)]
        for j, (y, rx, rz, opening) in enumerate(layers):
            lo, hi = math.pi*(1-opening), math.tau+math.pi*opening
            for i in range(49):
                theta = lo+(hi-lo)*i/48
                pts.append([rx*loose*math.cos(theta), y, .047+rz*loose*math.sin(theta)])
                uv.append([i/48*5, y*10])
                if i and j:
                    c = j*49+i
                    tris.extend([[c, c-50, c-1], [c, c-49, c-50]])
        mesh('headwear '+scarf+' hood', pts, tris, uv, scarf_mat, lambda p, i: {'head': 1})
        drape = [(1.22, .246, .190), (1.29, .25, .200), (1.37, .238, .190),
                 (1.45, .186, .110), (1.53, .105, .115), (1.59, .104, .121)]
        if scarf == 'gyale':
            drape = [(1.34, .25, .200), (1.43, .22, .185), (1.53, .11, .125), (1.59, .112, .132)]
        rows = [([0, y, .047], [np.interp(y, [r[0] for r in drape], [r[1] for r in drape]), 0, 0],
                  [0, 0, np.interp(y, [r[0] for r in drape], [r[2] for r in drape])], y)
                 for y in np.linspace(drape[0][0], drape[-1][0], 24)]
        def soften_edge(p, angle, row):
            fade = max(0, 1-row/8)
            p[1] -= .065*max(0, math.sin(angle))*fade
            p[1] += .008*math.sin(angle*5)*fade
            return p
        loft('headwear '+scarf+' drape', rows, scarf_mat, torso_weights, segments=48,
             folds=.013, warp=soften_edge)
    loft('headwear kallabi crown', [([0, y, .047], [rx, 0, 0], [0, 0, rz], y)
                                   for y, rx, rz in [(1.744, .096, .112), (1.775, .10, .114), (1.81, .095, .106), (1.846, .057, .068), (1.863, .001, .001)]],
         scarf_mat, lambda p: {'head': 1}, segments=48, caps=True, folds=.018)
    for h in [1.752, 1.77, 1.792, 1.813]:
        path = [[.101*math.cos(t), h+.009*math.sin(t), .047+.115*math.sin(t)] for t in np.linspace(0, math.tau, 65)]
        ribbon('headwear kallabi wrapped band '+str(h), path, .008, scarf_mat, lambda p: {'head': 1})
    ribbon('headwear kallabi tied tail', [[-.05, 1.80, -.076], [-.063, 1.70, -.10], [-.052, 1.49, -.095]],
           .046, scarf_mat, lambda p: {'head': 1})
    # Handbag is skinned to the hand, so it follows all three baked clips.
    wrist = heads['wrist.R']
    rings = [(wrist+np.array([-.065, y, .015]), [.08, 0, 0], [0, 0, .035], y)
             for y in [-.25, -.23, -.09]]
    loft('accessory handbag body', rings, bag_mat, lambda p: {'wrist.R': 1}, segments=24, caps=True)
    handle = [wrist+np.array([-.065+.060*math.cos(t), -.085+.085*math.sin(t), .055]) for t in np.linspace(0, math.pi, 33)]
    ribbon('accessory handbag handle', handle, .008, bag_mat, lambda p: {'wrist.R': 1})
    # Small stylised Lalle marks on the actual hand surface, retaining skin gaps.
    def henna_surface(g, pts):
        if g != 'body':
            return False
        x, y, z = np.mean(pts, axis=0)
        return abs(x) > .477 and .97 < y < 1.12 and z > .20 and math.sin(x*210)*math.cos(y*190) > .45
    obj_subset('accessory henna', vertices, body_uv, body_faces, henna_surface,
               henna_mat, alter=lambda p: p+np.array([0, 0, .0008]))

# Skeleton nodes are translation-only in bind pose. Inverse bind matrices remove
# each global pivot; all vertices/garments have the same metre-scale bind space.
bone_nodes = {}
for name in bone_names:
    parent = parents[name]
    node = {'name': name, 'translation': ((heads[name]-(heads[parent] if parent else 0))*NATIVE_SCALE).tolist(), 'children': []}
    gltf['nodes'].append(node)
    bone_nodes[name] = len(gltf['nodes'])-1
    (gltf['nodes'][bone_nodes[parent]] if parent else gltf['nodes'][0])['children'].append(bone_nodes[name])
inverse = []
for name in bone_names:
    matrix = np.eye(4);matrix[:3, 3] = -heads[name]*NATIVE_SCALE
    inverse.append(matrix.T.reshape(-1))
gltf['skins'].append({'name': 'WASA '+str(len(bone_names))+'-joint rig', 'joints': [bone_nodes[n] for n in bone_names],
                      'skeleton': bone_nodes['root'], 'inverseBindMatrices': accessor(inverse, 'MAT4')})


def quat(x=0, y=0, z=0):
    cx, sx, cy, sy, cz, sz = math.cos(x/2), math.sin(x/2), math.cos(y/2), math.sin(y/2), math.cos(z/2), math.sin(z/2)
    return [sx*cy*cz+cx*sy*sz, cx*sy*cz-sx*cy*sz, cx*cy*sz+sx*sy*cz, cx*cy*cz-sx*sy*sz]


def joint_matrix(angles, translation):
    x, y, z, w = quat(*angles)
    result = np.eye(4)
    result[:3, :3] = [[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)],
                      [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)],
                      [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]]
    result[:3, 3] = translation
    return result


def contact_offset(pose):
    matrices = {}
    for name in bone_names:
        parent = parents[name]
        local = joint_matrix(pose[name], heads[name]-(heads[parent] if parent else 0))
        matrices[name] = matrices[parent]@local if parent else local
    low = []
    for side in ['L', 'R']:
        # Contact is baked from the actual oval sole, without runtime IK.
        pivot = heads['foot.'+side]
        for angle in np.linspace(0, math.tau, 32, endpoint=False):
            sole = np.array([pivot[0]+.064*math.cos(angle), .002, .096+.143*math.sin(angle)])
            transformed = matrices['foot.'+side]@np.append(sole-pivot, 1)
            low.append(transformed[1])
    # A 3 mm interpolation margin prevents the 30 Hz baked keys from pushing a
    # curved sole through the floor between samples.
    return .005-min(low)


# Looping in-place clips at 30 Hz. Idle has breathing and small weight shifts;
# walk/run use contact/lift phases and opposite arm swing. They blend at runtime.
# No claim of mocap, cloth simulation or foot IK is made.
for clip, duration in [('idle', 4.0), ('walk', 1.0), ('run', .68), ('robe_walk', 1.0), ('robe_run', .68)]:
    frames = int(round(duration*30))
    times = np.linspace(0, duration, frames+1)
    animation = {'name': clip, 'samplers': [], 'channels': []}
    channels = {n: [] for n in bone_names}
    positions = []
    for time in times:
        phase = time/duration*math.tau
        walking, running = clip in ['walk', 'robe_walk'], clip in ['run', 'robe_run']
        robed = clip.startswith('robe_')
        moving = walking or running
        a = math.sin(phase)
        pose = {n: [0, 0, 0] for n in bone_names}
        pose['root'] = [(.035 if running else .009) if moving else 0, 0, math.cos(phase)*(.018 if moving else .006)]
        pose['spine01'] = [(.065 if running else .008) if moving else .006*math.sin(phase),
                           -a*(.045 if moving else .008), 0]
        pose['head'] = [-.015 if moving else math.sin(phase)*.012, a*(.025 if moving else .008), -.008*math.cos(phase)]
        for side, sign in [('L', 1), ('R', -1)]:
            swing = sign*a
            leg = ('upperleg01.'+side)
            knee = ('lowerleg01.'+side)
            stride = (.40 if running else .24) if robed else (.65 if running else .34)
            knee_bend = (.68 if running else .40) if robed else (.95 if running else .56)
            pose[leg] = [swing*stride if moving else 0, 0, sign*.035]
            pose[knee] = [max(0, swing)*knee_bend if moving else .015, 0, 0]
            pose['foot.'+side] = [-pose[leg][0]-pose[knee][0]*.65 if moving else -.015, 0, 0]
            # Base arms are angled out. Lower them to a relaxed position while
            # retaining a small elbow bend instead of a rigid T/A pose.
            pose['upperarm01.'+side] = [-swing*(.45 if running else .28) if moving else math.sin(phase)*.008,
                                       sign*.10, -sign*.64]
            pose['lowerarm01.'+side] = [(-.60 if running else .025) if moving else .025, -sign*.30, 0]
            for finger in range(1, 6):
                pose[f'finger{finger}-1.{side}'] = [.18 if finger == 1 else .28, 0, 0]
                pose[f'finger{finger}-2.{side}'] = [.24 if finger == 1 else .35, 0, 0]
            pose['cloth_upper.'+side] = [pose[leg][0]*.38, -swing*.018 if moving else 0, sign*.01]
            pose['cloth_lower.'+side] = [pose[leg][0]*.20, 0, math.sin(phase+sign*.3)*.012]
        offset = contact_offset(pose)+(math.sin(phase)*.0015 if not moving else 0)
        positions.append(((heads['root']+np.array([0, offset, 0]))*NATIVE_SCALE).tolist())
        for name in bone_names:
            channels[name].append(quat(*pose[name]))
    input_accessor = accessor(times, 'SCALAR')
    for name, values in channels.items():
        output = accessor(values, 'VEC4')
        animation['samplers'].append({'input': input_accessor, 'output': output, 'interpolation': 'LINEAR'})
        animation['channels'].append({'sampler': len(animation['samplers'])-1, 'target': {'node': bone_nodes[name], 'path': 'rotation'}})
    animation['samplers'].append({'input': input_accessor, 'output': accessor(positions, 'VEC3'), 'interpolation': 'LINEAR'})
    animation['channels'].append({'sampler': len(animation['samplers'])-1, 'target': {'node': bone_nodes['root'], 'path': 'translation'}})
    gltf['animations'].append(animation)

gltf['buffers'] = [{'byteLength': len(binary)}]
# Skinned mesh nodes are glTF scene roots. Both mesh and joint roots are later
# parented to the same Babylon actor transform, so placement affects both.
gltf['scenes'][0]['nodes'] = [i-1 for i in gltf['nodes'][0]['children']]
gltf['nodes'] = gltf['nodes'][1:]
for node in gltf['nodes']:
    if 'children' in node and not node['children']:
        del node['children']
    elif 'children' in node:
        node['children'] = [i-1 for i in node['children']]
for skin in gltf['skins']:
    skin['joints'] = [i-1 for i in skin['joints']]
    skin['skeleton'] -= 1
for animation in gltf['animations']:
    for channel in animation['channels']:
        channel['target']['node'] -= 1
document = json.dumps(gltf, separators=(',', ':')).encode()
document += b' '*((-len(document)) % 4)
binary.extend(b'\0'*((-len(binary)) % 4))
glb = struct.pack('<III', 0x46546c67, 2, 12+8+len(document)+8+len(binary))
glb += struct.pack('<II', len(document), 0x4e4f534a)+document
glb += struct.pack('<II', len(binary), 0x004e4942)+binary
(DEST/(ASSET+'.glb')).write_bytes(glb)
(DEST/'MAKEHUMAN-CC0.md').write_bytes((SOURCE/'LICENSE.ASSETS.md').read_bytes())
manifest = {'file': ASSET+'.glb', 'body': BODY, 'outfits': OUTFITS, 'sha256': hashlib.sha256(glb).hexdigest(),
            'bytes': len(glb), 'heightMetres': NATIVE_HEIGHT,
            'jointCount': len(bone_names), 'clips': ['idle', 'walk', 'run', 'robe_walk', 'robe_run'], 'meshStats': mesh_stats,
            'sourceRepository': 'https://github.com/makehumancommunity/makehuman', 'sourceRevision': REV,
            'sources': [{'path': path, 'sha256': digest} for path, digest in FILES.values()]}
(DEST/(ASSET+'.manifest.json')).write_text(json.dumps(manifest, indent=2)+'\n')
print(json.dumps({'body': BODY, 'bytes': len(glb), 'joints': len(bone_names), 'vertices': sum(m['vertices'] for m in mesh_stats),
                  'triangles': sum(m['triangles'] for m in mesh_stats), 'meshes': len(mesh_stats)}, indent=2))
