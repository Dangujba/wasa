from pathlib import Path
import json, math, heapq, collections, xml.etree.ElementTree as ET
base=Path('/var/www/wasa.kasua.ng')
files=[base/'source-maps/damaturu-extended-20261012.osm',base/'source-maps/damaturu-ysu-corridor-20261012.osm']
out=base/'public/world/data/damaturu-region-v3.json'
olat,olon=11.74335,11.96270
factor=111320*math.cos(math.radians(olat))
def xy(ll):return ((ll[1]-olon)*factor,(olat-ll[0])*111320)
nodes={};ways={};pointtags={}
for src in files:
 tree=ET.parse(src).getroot()
 for n in tree.findall('node'):
  nid=n.get('id');nodes[nid]=(float(n.get('lat')),float(n.get('lon')))
  if n.findall('tag'):pointtags[nid]={t.get('k'):t.get('v') for t in n.findall('tag')}
 for w in tree.findall('way'):ways[w.get('id')]=w
print('Merged OSM',len(nodes),'nodes',len(ways),'ways')
minx,maxx,minz,maxz=-3900,3900,-2800,8500
def clip(a,b):
 x,z=a;u,v=b;dx=u-x;dz=v-z;t0,t1=0.,1.
 for p,q in [(-dx,x-minx),(dx,maxx-x),(-dz,z-minz),(dz,maxz-z)]:
  if abs(p)<1e-9:
   if q<0:return None
  else:
   t=q/p
   if p<0:t0=max(t0,t)
   else:t1=min(t1,t)
   if t0>t1:return None
 return (x+t0*dx,z+t0*dz),(x+t1*dx,z+t1*dz)
def poly(points):
 out=[]
 for x,z in points:
  if not out or math.hypot(out[-1][0]-x,out[-1][1]-z)>.5:out.append([round(x,2),round(z,2)])
 return out
roadtypes={'trunk','trunk_link','primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','residential','service','living_street','pedestrian','footway','path','track'}
roads=[];buildings=[];pois=[];campus=None;graph=collections.defaultdict(list)
for n,t in pointtags.items():
 if t.get('name') and any(k in t for k in ['shop','amenity','tourism','leisure','office','government','brand']):
  x,z=xy(nodes[n])
  if minx<x<maxx and minz<z<maxz:pois.append({'id':'node-'+n,'name':t['name'],'kind':t.get('amenity',t.get('shop',t.get('office','poi'))),'p':[round(x,1),round(z,1)],'verifiedOSM':True})
for key,w in ways.items():
 tags={t.get('k'):t.get('v') for t in w.findall('tag')}
 ids=[i.get('ref') for i in w.findall('nd') if i.get('ref') in nodes]
 coords=[xy(nodes[n]) for n in ids]
 if len(coords)<2:continue
 if tags.get('highway') in roadtypes:
  current=[];runs=[]
  for a,b in zip(coords,coords[1:]):
   cut=clip(a,b)
   if not cut:
    if len(current)>1:runs.append(current)
    current=[];continue
   ca,cb=cut
   if not current:current=[ca,cb]
   elif math.hypot(current[-1][0]-ca[0],current[-1][1]-ca[1])<.05:current.append(cb)
   else:
    if len(current)>1:runs.append(current)
    current=[ca,cb]
  if len(current)>1:runs.append(current)
  for i,run in enumerate(runs):
   way=poly(run)
   if len(way)>1:roads.append({'id':key+(('-'+str(i)) if len(runs)>1 else ''),'type':tags['highway'],
    'name':tags.get('name',''),'p':way,'bridge':tags.get('bridge')=='yes','oneway':tags.get('oneway')=='yes'})
  if tags['highway'] not in ('footway','path','pedestrian','track'):
   for a,b in zip(ids,ids[1:]):
    if a not in nodes or b not in nodes:continue
    aa,bb=xy(nodes[a]),xy(nodes[b])
    if not (minx<aa[0]<maxx and minz<aa[1]<maxz and minx<bb[0]<maxx and minz<bb[1]<maxz):continue
    length=math.dist(aa,bb)
    graph[a].append((b,length));graph[b].append((a,length))
 if tags.get('building') and tags['building']!='no':
  if len(coords)<3 or any(not(minx<x<maxx and minz<z<maxz) for x,z in coords):continue
  p=poly(coords)
  if len(p)>2:
   if p[0]==p[-1]:p.pop()
   h=None
   try:
    if tags.get('height'):h=float(tags['height'].split()[0])
    elif tags.get('building:levels'):h=float(tags['building:levels'])*3.1
   except:pass
   buildings.append({'id':key,'p':p,'kind':tags.get('building','yes'),
                      'name':tags.get('name',''),'height':round(h,1) if h else None})
 if tags.get('name') and any(k in tags for k in ('amenity','shop','tourism','office','leisure','government')):
  # A POI based on a mapped polygon; only marker position, not assumed building representation.
  center=[sum(a for a,_ in coords)/len(coords),sum(b for _,b in coords)/len(coords)]
  if minx<center[0]<maxx and minz<center[1]<maxz:pois.append({'id':'way-'+key,'name':tags['name'],'kind':tags.get('amenity',tags.get('shop',tags.get('office','poi'))),
    'p':[round(center[0],1),round(center[1],1)],'verifiedOSM':True})
  if 'yobe state university' in tags.get('name','').lower():
   campus={'id':'ysu','name':'Yobe State University','kind':'university','p':[round(center[0],1),round(center[1],1)],
           'verifiedOSM':True,'geometrySourceWay':key,
           'note':'Campus polygon center, not a surveyed entrance'}
# Recover expected campus
assert campus,'YSU OSM campus not found'
ysu=campus['p']
start=(0,0)
def nearest(point):
 return min(graph,key=lambda key: math.dist(xy(nodes[key]),point))
src=nearest(start);dest=nearest(ysu)
distance={src:0.};previous={};heap=[(0,src)]
while heap:
 cost,k=heapq.heappop(heap)
 if cost!=distance.get(k):continue
 if k==dest:break
 for b,d in graph[k]:
  nc=cost+d
  if nc<distance.get(b,float('inf')):
   distance[b]=nc;previous[b]=k;heapq.heappush(heap,(nc,b))
route=[]
if dest in distance:
 k=dest
 while k!=src:
  route.append(k);k=previous[k]
 route.append(src);route.reverse()
 routePoints=poly([xy(nodes[n]) for n in route])
else:routePoints=[]
print('CAMPUS',campus,'SOURCE',xy(nodes[src]),'DEST',xy(nodes[dest]),'ROUTE',len(route),'lengthKm',round(distance.get(dest,0)/1000,2))
# Snap route to highway/primary? Only actual OSM street graph. Don't invent straight route.
# Limit data size, but retain full mapped geometry. Geo-locations are real.
outdata={'version':3,'name':'WASA Damaturu / Yobe State University corridor',
 'source':'OpenStreetMap contributors','sourceLicense':'ODbL 1.0','sourceDate':'2026-10-12','sourceUrl':'https://www.openstreetmap.org/copyright',
 'origin':{'lat':olat,'lon':olon,'description':'Approximate The Cross anchor'},
 'limitsMeters':{'minX':minx,'maxX':maxx,'minZ':minz,'maxZ':maxz},'extentMeters':8500,
 'roads':roads,'buildings':buildings,'pois':pois,'campus':campus,
 'verifiedRoute':{'name':'Mapped street network toward YSU','from':'The Cross area','to':'YSU campus polygon',
  'distanceMeters':round(distance.get(dest,0)) if routePoints else None,'p':routePoints,'confidence':'OpenStreetMap connected roads; campus center marker not verified entrance'},
 'landmarkPlacements':[],
 'notes':['All OSM source coordinates retain their positions relative to The Cross','YSU campus polygon exists in OSM; Golden Souk and Eldawoud exact locations remain unverified','Commercial storefronts and residential compounds are illustrative city art']}
out.write_text(json.dumps(outdata,separators=(',',':')))
print('EXPORTED',out,out.stat().st_size,'bytes','roads',len(roads),'buildings',len(buildings),'POI',len(pois))
print('Kinds',collections.Counter(x['kind'] for x in pois).most_common(25))
print('Selected POI',[(x['name'],x['kind'],x['p']) for x in pois if any(k in x['name'].lower() for k in ['bank','petrol','station','ministry','secretariat','gold','souk','mosque','market','hospital'])][:50])
