/* WASA Avatar Creator, Phase 1 Step 3. Active 3D editor + persistent player avatar. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const outfitNames={
 jamfa:['Jamfa','Traditional inner tunic','J'],
 kaftan:['Kaftan','Everyday northern elegance','K'],
 shadda:['Shadda','Polished embroidered fabric','S'],
 babbar_riga:['Babbar Riga','Flowing grand robe','B'],
 kanuri_robe:['Kanuri Attire','Kanuri-inspired formal robe','N'],
 jallabiya:['Jallabiya','A flowing long garment','J'],
 atamfa:['Atamfa','Patterned dress fabric','A'],
 buba_zani:['Buba & Zani','Two-piece traditional style','Z'],
 abaya:['Abaya','Modest long silhouette','L']
};
const headwearNames={
 none:['No Headwear','Show your hairstyle','×'],
 zanna_bukar:['Zanna Bukar','Traditional woven cap','Z'],
 hula:['Embroidered Hula','Northern embroidered cap','H'],
 dara:['Dara','Structured traditional cap','D'],
 bama:['Bama Cap','Kanuri-inspired headwear','B'],
 rawani:['Rawani','Wrapped turban style','R'],
 gyale:['Gyale','Traditional headscarf','G'],
 hijab:['Hijab','Modest head covering','H'],
 kallabi:['Kallabi','Wrapped headscarf style','K']
};
const footNames={
 sandals:['Leather Sandals','Traditional casual footwear','S'],
 slippers:['Slippers','Everyday comfortable footwear','S'],
 leather:['Leather Shoes','Formal pair','L'],
 sneakers:['Sneakers','Modern sporty style','M']
};
const accessories={
 none:['No Accessories','A clean, classic look','×'],
 beads:['Neck Beads','Decorative beads','B'],
 watch:['Wristwatch','Contemporary accessory','W'],
 henna:['Lalle (Henna)','Decorative hand patterns','L'],
 ring:['Ring','Decorative jewellery','R'],
 belt:['Traditional Belt','Decorative waist detail','B'],
 handbag:['Handbag','Small fashion accessory','H']
};
const skinColors={deep:'#452D25',rich:'#694333',warm:'#8C5D45',amber:'#AA7859',honey:'#CA9872',light:'#E2B18A'};
const outfitColors={ivory:'#E8DDC6',midnight:'#142637',emerald:'#176656',sand:'#AF8866',indigo:'#314C8D',burgundy:'#733347',rose:'#B75E71',cocoa:'#61483C'};
const trimColors={gold:'#EEC982',ivory:'#EEE7D8',silver:'#B9CDCD',emerald:'#82CEAD'};
const hairstyles={close:'CLOSE CUT',short:'SHORT',curls:'CURLY',braids:'BRAIDS',locs:'LOCS'};
const facialHairStyles={none:'NONE',moustache:'STACHE',goatee:'GOATEE',full_beard:'BEARD'};
const outfitsCatalog={outfit:outfitNames,headwear:headwearNames,footwear:footNames,accessory:accessories};
const genderWardrobe={
 masculine:{
  outfit:['jamfa','kaftan','shadda','babbar_riga','kanuri_robe','jallabiya'],
  headwear:['none','zanna_bukar','hula','dara','bama','rawani'],
  hair:['close','short','curls','locs'],facialHair:['none','moustache','goatee','full_beard'],
  accessory:['none','beads','watch','ring','belt']
 },
 feminine:{
  outfit:['atamfa','buba_zani','abaya'],
  headwear:['none','gyale','hijab','kallabi'],
  hair:['short','curls','braids','locs'],
  facialHair:['none'],
  accessory:['none','beads','watch','henna','ring','handbag']
 }
};
const genderDefaults={
 masculine:{outfit:'jamfa',headwear:'none',hair:'short',facialHair:'none',accessory:'none'},
 feminine:{outfit:'abaya',headwear:'hijab',hair:'braids',facialHair:'none',accessory:'none'}
};
function allowed(key,value){
 const values=genderWardrobe[current.body]?.[key];
 return !values||values.includes(value);
}
function genderCatalog(category){
 const all=outfitsCatalog[category];
 const names=genderWardrobe[current.body]?.[category];
 return names?Object.fromEntries(names.map(k=>[k,all[k]])):all;
}
function matchGender(saved){
 const base={...defaults,...saved};
 const gender=base.body==='feminine'?'feminine':'masculine';
 let changed=false;
 for(const [field,allowedValues] of Object.entries(genderWardrobe[gender])){
   if(!allowedValues.includes(base[field])){
     base[field]=genderDefaults[gender][field]||allowedValues[0];
     changed=true;
   }
 }
 return {avatar:base,changed};
}

const defaults={body:'masculine',skin:'rich',hair:'short',facialHair:'none',outfit:'jamfa',headwear:'none',footwear:'leather',outfitColor:'ivory',trimColor:'silver',accessory:'none'};
let current={...defaults};
let initial={...defaults};
let user=null;
let creator=null;
let stageReady=false;
let dirty=false;
let saving=false;
let category='outfit';
function safeText(text){return String(text||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function setNotice(text,kind=''){
 $('save-notice').textContent=text;
 $('save-notice').className='save-notice'+(kind?' '+kind:'');
}
async function api(path,options={}){
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{})},...options});
 const payload=await response.json().catch(()=>({ok:false,error:'Account server is unavailable.'}));
 if(!response.ok||!payload.ok) throw Error(payload.error||'Request failed');
 return payload;
}
function makeOptions(field,mapping,container,style=''){
 const root=$(container);
 root.innerHTML=Object.entries(mapping).map(([k,color])=>
  '<button class="'+(current[field]===k?'active ':'')+(style==='swatches'?'swatch':'')+'" type="button" data-field="'+field+'" data-choice="'+safeText(k)+'" '+(style==='swatches'?'style="--swatch:'+color+'"':'')+' title="'+safeText(k)+'" aria-label="'+safeText(k.replaceAll('_',' '))+'" aria-pressed="'+(current[field]===k)+'">'+(style==='swatches'?'':safeText(color))+'</button>'
 ).join('');
}
function updatePanels(){
 document.querySelectorAll('[data-field="body"]').forEach(b=>{
  const active=current.body===b.dataset.choice;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
 });
 makeOptions('skin',skinColors,'skin-options','swatches');
 makeOptions('outfitColor',outfitColors,'outfitColor-options','swatches');
 makeOptions('trimColor',trimColors,'trimColor-options','swatches');
 makeOptions('hair',Object.fromEntries(genderWardrobe[current.body].hair.map(key=>[key,hairstyles[key]])),'hair-options');
 makeOptions('facialHair',facialHairStyles,'facialHair-options');
 $('facialHair-options').closest('.config-section').hidden=current.body==='feminine';
 const outfit=outfitNames[current.outfit]||outfitNames.kaftan;
 const cap=headwearNames[current.headwear]||headwearNames.none;
 $('selected-outfit').textContent=outfit[0].toUpperCase();
 $('selected-headwear').textContent=cap[0].toUpperCase();
 $('preview-label').textContent=(outfit[0]+' / '+current.outfitColor).toUpperCase();
 updateWardrobe();
 $('save-avatar').textContent=''; // keep DOM-created icon and status controlled together
 const label=document.createElement('span');label.textContent=user?(dirty?'SAVE CHARACTER':'SAVE CHARACTER'):'SIGN IN TO SAVE';
 const arrow=document.createElement('span');arrow.textContent='↗';
 $('save-avatar').append(label,arrow);
}
function updateWardrobe(){
 const catalog=genderCatalog(category);
 const titles={outfit:current.body==='feminine'?"WOMEN'S TRADITIONAL WEAR":"MEN'S TRADITIONAL WEAR",headwear:current.body==='feminine'?"WOMEN'S HEADSCARVES":"MEN'S TRADITIONAL CAPS",footwear:'FOOTWEAR',accessory:'ACCESSORIES'};
 $('wardrobe-heading').textContent=titles[category];
 $('wardrobe-count').textContent=String(Object.keys(catalog).length).padStart(2,'0')+' STYLES';
 $('wardrobe-items').innerHTML=Object.entries(catalog).map(([id,row])=>{
  const active=current[category]===id;
  return '<button type="button" class="wardrobe-item '+(active?'active':'')+'" data-field="'+category+'" data-choice="'+id+'" aria-pressed="'+active+'">'+
  '<span class="item-thumbnail">'+safeText(row[2])+'</span><span class="item-copy"><b>'+safeText(row[0])+'</b><small>'+safeText(row[1])+'</small></span><span class="item-select">'+(active?'✓':'›')+'</span></button>';
 }).join('');
 document.querySelectorAll('.tab').forEach(b=>{const active=b.dataset.category===category;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
}
function setChoice(field,value){
 if(!Object.prototype.hasOwnProperty.call(defaults,field))return;
 if(current[field]===value)return;
 const validOptions={
  body:['masculine','feminine'],skin:Object.keys(skinColors),hair:Object.keys(hairstyles),facialHair:Object.keys(facialHairStyles),
  outfit:Object.keys(outfitNames),headwear:Object.keys(headwearNames),footwear:Object.keys(footNames),
  accessory:Object.keys(accessories),outfitColor:Object.keys(outfitColors),trimColor:Object.keys(trimColors)
 };
 if(!validOptions[field].includes(value))return;
 if(field!=='body'&&!allowed(field,value))return;
 current={...current,[field]:value};
 // Switching character type shows only the matching clothing, headwear and
 // accessory catalog. Save is explicit; account records are never altered here.
 if(field==='body'){
   current={...current,...genderDefaults[value],outfitColor:value==='feminine'?'rose':'ivory',
     trimColor:value==='feminine'?'gold':'silver'};
   category='outfit';
 }
 dirty=true;
 updatePanels();
 if(stageReady && creator) {
   try {creator.make(current);} catch(error){console.error(error);setNotice('Unable to update 3D model. Try reloading.', 'error');}
 }
 setNotice('Unsaved appearance changes');
}
function showPlayer(){
 if(user){
  $('player-name').textContent=user.displayName.toUpperCase();
  $('player-status').textContent='LEVEL '+user.level+'  •  DAMATURU';
  $('account-chip').querySelector('.player-monogram').textContent=user.displayName.charAt(0).toUpperCase();
  setNotice(user.avatarStatus==='created'?'Saved avatar loaded.':'Create your first character.');
 }else{
  $('player-name').textContent='GUEST PREVIEW';
  $('player-status').textContent='Sign in to save';
  $('account-chip').querySelector('.player-monogram').textContent='?';
  setNotice('Preview outfits now. Sign in to save your look.');
 }
}
async function loadAccount(){
 try{
  const me=await api('/api/me');
  user=me.authenticated?me.user:null;
  if(user){
   const avatar=await api('/api/avatar');
   if(avatar.avatar && avatar.created) {
     const match=matchGender(avatar.avatar);
     current=match.avatar;
     initial={...current};
     if(match.changed)dirty=true;
   }else if(user.avatarConfig && Object.keys(user.avatarConfig).length>1){
     const match=matchGender(user.avatarConfig);
     current=match.avatar;
     initial={...current};
     if(match.changed)dirty=true;
   }
  }
 }catch(error){console.warn('[WASA AVATAR] Account load:',error.message);}
 showPlayer();updatePanels();
 if(dirty)setNotice('A previous outfit was adjusted to match the selected character. Save to keep it.');
 if(stageReady && creator)creator.make(current);
}
async function save(){
 if(!user){window.location.href='/?auth=login';return;}
 if(saving)return;
 saving=true;
 $('save-avatar').disabled=true;
 setNotice('Saving avatar to WASA...');
 try{
  const corrected=matchGender(current).avatar;
  const payload=await api('/api/avatar',{method:'PATCH',body:JSON.stringify({avatar:corrected})});
  current={...defaults,...payload.avatar};
  initial={...current};
  user.avatarStatus='created';user.avatarConfig={...current};
  dirty=false;
  updatePanels();
  setNotice('Character saved to your WASA profile.','success');
 }catch(error){setNotice(error.message,'error');}
 finally{$('save-avatar').disabled=false;saving=false;}
}
async function init(){
 document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
  category=btn.dataset.category;updateWardrobe();
 }));
 document.addEventListener('click',e=>{
  const option=e.target.closest('[data-field][data-choice]');
  if(option){setChoice(option.dataset.field,option.dataset.choice);return;}
 });
 document.querySelectorAll('[data-pose]').forEach(button=>button.addEventListener('click',()=>{
   document.querySelectorAll('[data-pose]').forEach(b=>b.classList.toggle('active',b===button));
   creator?.setPose(button.dataset.pose);
 }));
 $('save-avatar').addEventListener('click',save);
 $('reset-avatar').addEventListener('click',()=>{
   current={...defaults,body:current.body,...genderDefaults[current.body]};dirty=true;updatePanels();
   if(creator&&stageReady)creator.make(current);
   setNotice('Default appearance restored. Save to keep it.');
 });
 $('rotate-left').addEventListener('click',()=>creator?.orbit(-Math.PI/6));
 $('rotate-right').addEventListener('click',()=>creator?.orbit(Math.PI/6));
 $('camera-reset').addEventListener('click',()=>creator?.resetCamera());
 updatePanels();
 // Create the 3D studio as early as possible, while account loading is independent.
 const canvas=$('avatar-canvas');
 creator=new window.WasaAvatar3D(canvas,()=>{
   stageReady=true;
   $('viewport-loader').hidden=true;
   creator.make(current);
 },error=>{
   console.warn('[WASA AVATAR] WebGL unavailable',error);
   $('viewport-loader').hidden=true;
   $('preview-fallback').hidden=false;
 });
 await loadAccount();
}
init();
})();
