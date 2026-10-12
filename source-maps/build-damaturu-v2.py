# WASA mapped geographic expansion v2: coordinates from OpenStreetMap,
# no fabricated road ways or claimed building footprints.
from pathlib import Path
import xml.etree.ElementTree as ET, json, math, collections
base=Path('/var/www/wasa.kasua.ng')
src=base/'source-maps/damaturu-extended-20261012.osm'
target=base/'public/world/data/damaturu-central-v2.json'
r=ET.parse(src).getroot()
olat,olon=11.74335,11.96270
lonfactor=111320*math.cos(math.radians(olat))
nodes={n.get('id'):(float(n.get('lat')),float(n.get('lon'))) for n in r.findall('node')}
def xy(coord):return ((coord[1]-olon)*lonfactor,(olat-coord[0])*111320)
extent=2400
def simplify(points,limit=180):
    out=[]
    for x,z in points:
        if not out or math.hypot(x-out[-1][0],z-out[-1][1])>.55:out.append((x,z))
    if len(out)>limit:
        step=math.ceil(len(out)/limit)
        out=out[::step]+([out[-1]] if out[-1]!=out[::step][-1] else [])
    return [[round(a,2),round(b,2)] for a,b in out]
def intersect(a,b):
    # Liang Barsky clipping, preserving true mapped roads within the playable region.
    x0,z0=a;x1,z1=b
    dx=x1-x0; dz=z1-z0;t0=0;t1=1
    for p,q in [(-dx,x0+extent),(dx,extent-x0),(-dz,z0+extent),(dz,extent-z0)]:
        if abs(p)<1e-9:
            if q<0:return None
        else:
            v=q/p
            if p<0:t0=max(t0,v)
            else:t1=min(t1,v)
            if t0>t1:return None
    return (x0+t0*dx,z0+t0*dz),(x0+t1*dx,z0+t1*dz)
roadtypes={'motorway','motorway_link','trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','residential','service','living_street','pedestrian','footway','path','track'}
roads=[]
buildings=[]
named={}
for node in r.findall('node'):
    t={n.get('k'):n.get('v') for n in node.findall('tag')}
    if 'name' in t and any(k in t for k in ('amenity','shop','tourism','leisure','historic')):
        p=xy(nodes[node.get('id')])
        if max(abs(p[0]),abs(p[1]))<extent: named[t['name']]={'name':t['name'],'kind':t.get('amenity',t.get('shop',t.get('tourism','poi'))),'p':[round(p[0],1),round(p[1],1)]}
for w in r.findall('way'):
    tags={n.get('k'):n.get('v') for n in w.findall('tag')}
    coords=[xy(nodes[ref.get('ref')]) for ref in w.findall('nd') if ref.get('ref') in nodes]
    if len(coords)<2:continue
    if tags.get('highway') in roadtypes:
        # Continuous runs split only when entering/exiting the bounding square.
        current=[]
        parts=[]
        for a,b in zip(coords,coords[1:]):
            clipped=intersect(a,b)
            if not clipped:
                if len(current)>1:parts.append(current)
                current=[]
                continue
            ca,cb=clipped
            if not current:current=[ca,cb]
            elif math.hypot(current[-1][0]-ca[0],current[-1][1]-ca[1])<.02:current.append(cb)
            else:
                if len(current)>1:parts.append(current)
                current=[ca,cb]
        if len(current)>1:parts.append(current)
        for index,poly in enumerate(parts):
            short=simplify(poly)
            if len(short)<2:continue
            roads.append({'id':w.get('id')+('_'+str(index) if len(parts)>1 else ''),'type':tags['highway'],'name':tags.get('name',''),'p':short,
               'oneway':tags.get('oneway')=='yes','bridge':tags.get('bridge')=='yes'})
    if tags.get('building') not in (None,'no') and len(coords)>2:
        if any(abs(x)>extent or abs(z)>extent for x,z in coords):continue
        p=simplify(coords,limit=90)
        if p[0]==p[-1]:p.pop()
        if len(p)<3:continue
        height=None
        try:
            if tags.get('height'):height=float(tags['height'].split()[0])
            elif tags.get('building:levels'):height=3.2*float(tags['building:levels'])
        except:height=None
        buildings.append({'id':w.get('id'),'p':p,'kind':tags.get('building','yes'),'name':tags.get('name',''),'height':round(height,1) if height else None})
    if 'name' in tags and any(k in tags for k in ('amenity','shop','leisure','tourism')):
        center=[sum(a for a,_ in coords)/len(coords),sum(b for _,b in coords)/len(coords)]
        if max(abs(center[0]),abs(center[1]))<extent:
            named[tags['name']]={'name':tags['name'],'kind':tags.get('amenity',tags.get('shop','poi')),'p':[round(center[0],1),round(center[1],1)]}
output={
 'version':2,'name':'Damaturu Connected Districts, northern Nigeria',
 'source':'OpenStreetMap contributors','sourceDate':'2026-10-12',
 'sourceLicense':'Open Database License (ODbL) 1.0',
 'sourceUrl':'https://www.openstreetmap.org/copyright',
 'origin':{'lat':olat,'lon':olon,'description':'Approximate The Cross interchange anchor'},
 'extentMeters':extent,'roads':roads,'buildings':buildings,'pois':list(named.values()),
 'flyover':{'p':[0,0],'geometry':'illustrative; not surveyed','confirmedSurvey':False},
 'notes':['Mapped street lines and building footprints are from OSM; the visual city remains an illustrative game prototype.','Do not treat flyover elevation or invented game stores as surveyed reality.']
}
target.write_text(json.dumps(output,separators=(',',':')))
length=0
segments=0
nearest=[]
for road in roads:
    for a,b in zip(road['p'],road['p'][1:]):
        length+=math.hypot(b[0]-a[0],b[1]-a[1]);segments+=1
        if max(abs((a[0]+b[0])/2),abs((a[1]+b[1])/2))<160:
            nearest.append((math.hypot((a[0]+b[0])/2+25,(a[1]+b[1])/2-70),road['type'],a,b))
print('EXPORTED',str(target),target.stat().st_size,'bytes')
print('WAYS',len(roads),'BUILDINGS',len(buildings),'POIS',len(named),'SEGMENTS',segments,'ROAD_LENGTH_KM',round(length/1000,2))
print('ROAD_TYPES',dict(collections.Counter(x['type'] for x in roads)))
print('NEAR_SPAWN',sorted(nearest)[:8])
