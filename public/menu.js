/* WASA Step 2. Game menu and account UI.
   This is a development menu. It never presents unfinished game modes as playable. */
(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const menu = $('game-menu');
 const bootView = $('boot-view');
 const modal = $('modal-backdrop');
 const worldPreview = $('world-preview');
 const dialogBody = $('dialog-body');
 const dialogTitle = $('dialog-title');
 const dialogKicker = $('dialog-kicker');
 let user = null;
 let panel = null;
 let settings = {motion:true,quality:'auto'};
 try {
   const saved = JSON.parse(localStorage.getItem('wasa-settings-v2') || '{}');
   if (typeof saved.motion === 'boolean') settings.motion=saved.motion;
   if (['auto','low','high'].includes(saved.quality)) settings.quality=saved.quality;
 } catch (_) {}
 const saveSettings = () => {
   try {localStorage.setItem('wasa-settings-v2',JSON.stringify(settings));} catch(_){}
 };
 const esc = input => String(input??'').replace(/[&<>"']/g, ch=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
 }[ch]));
 function applySettings() {
   document.body.classList.toggle('user-reduced-motion',!settings.motion);
   if(window.WasaPreview) {
     window.WasaPreview.setMotion(settings.motion);
     window.WasaPreview.setQuality(settings.quality);
   }
 }
 async function api(path, options={}) {
   const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers:{'Accept':'application/json', ...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
   let data;
   try {data=await response.json();} catch {throw Error('Cannot reach WASA server. Please retry.');}
   if (!response.ok || !data.ok) throw Error(data.error||'Request failed.');
   return data;
 }
 async function refreshUser() {
   try {
     const data=await api('/api/me');
     user=data.authenticated?data.user:null;
   } catch (e) {
     user=null;
     console.warn('[WASA] Account service unavailable',e.message);
   }
   renderAccountStatus();
 }
 function renderAccountStatus() {
   $('player-greeting').textContent=user?'HELLO, '+user.displayName.toUpperCase():'';
   $('account-button').textContent=user?'ACCOUNT':'SIGN IN';
 }
 function showMenu() {
   bootView.hidden=true;
   menu.hidden=false;
   worldPreview.hidden=true;
   document.body.classList.add('menu-active');
   if(window.WasaPreview) window.WasaPreview.exit();
   applySettings();
   if (!user) refreshUser();
   if (new URLSearchParams(window.location.search).get('auth')==='login') {
     history.replaceState({},'',window.location.pathname);
     authView('login');
   }
 }
 document.addEventListener('wasa:boot-ready', () => setTimeout(showMenu,1200),{once:true});
 // In case the engine fired before this event handler was attached:
 if ($('postboot') && !$('postboot').hidden) setTimeout(showMenu,600);
 function openModal(title,kicker,contents,kind) {
   panel=kind;
   dialogTitle.textContent=title;
   dialogKicker.textContent=kicker;
   dialogBody.innerHTML=contents;
   modal.hidden=false;
   document.body.style.overflow='hidden';
   $('modal-close').focus({preventScroll:true});
 }
 function closeModal() {
   modal.hidden=true;
   panel=null;
   document.body.style.overflow='';
 }
 function field(label,type,name,placeholder,attributes='') {
   return '<label class="field-label">'+esc(label)+'<input name="'+esc(name)+'" type="'+esc(type)+'" placeholder="'+esc(placeholder)+'" '+attributes+' required></label>';
 }
 function authView(type='login') {
   const registration=type==='register';
   const title=registration?'CREATE ACCOUNT':'WELCOME BACK';
   const fields=(registration
     ? field('USERNAME','text','username','Choose a username','autocomplete="username" minlength="3" maxlength="24" pattern="[A-Za-z][A-Za-z0-9_]{2,23}"')
       +field('EMAIL','email','email','you@example.com','autocomplete="email" maxlength="254"')
     : field('EMAIL OR USERNAME','text','identifier','Email or username','autocomplete="username" maxlength="254"'))
     +field('PASSWORD','password','password',registration?'Minimum 10 characters':'Your password',registration?'autocomplete="new-password" minlength="10" maxlength="128"':'autocomplete="current-password" minlength="10" maxlength="128"');
   const note=registration
     ? '<p class="account-warning">Development accounts are real. Email verification and password recovery are not yet available. Use a unique password, not one from another website.</p>'
       +'<label class="accept"><input type="checkbox" name="agree" required> I agree to the <a href="/privacy.html" target="_blank" rel="noopener">development privacy notice</a>.</label>'
     : '';
   openModal(title,'WASA PLAYER ACCOUNT',
     '<p class="panel-lead">'+(registration?'Create your player identity for the coming WASA experience.':'Sign in to your persistent WASA player account.')+'</p>'
     +'<form id="auth-form" class="form-grid" data-mode="'+type+'">'+fields+note
     +'<button class="action-button" type="submit">'+(registration?'CREATE ACCOUNT':'SIGN IN')+'</button>'
     +'<p class="form-message" role="status" aria-live="polite"></p></form>'
     +'<div class="inline-links"><span class="muted">'+(registration?'Already a player?':'New to WASA?')+'</span><button type="button" data-action="'+(registration?'login':'register')+'">'+(registration?'SIGN IN':'CREATE ACCOUNT')+' →</button></div>',
     type);
 }
 function profileView() {
   if(!user) {authView();return;}
   openModal('MY CHARACTER','PLAYER PROFILE',
     '<div class="profile-card"><div class="profile-avatar">'+esc(user.displayName.slice(0,1).toUpperCase())+'</div><div><div class="profile-name">'+esc(user.displayName.toUpperCase())+'</div><div class="muted">@'+esc(user.username)+'</div></div></div>'
     +'<div class="profile-details">'
     +'<div class="detail-line"><span>HOME CITY</span><strong>'+esc(user.homeCity)+'</strong></div>'
     +'<div class="detail-line"><span>PLAYER LEVEL</span><strong>'+Number(user.level)+'</strong></div>'
     +'<div class="detail-line"><span>EXPERIENCE</span><strong>'+Number(user.xp)+' XP</strong></div>'
     +'<div class="detail-line"><span>AVATAR</span><strong>NOT YET CREATED</strong></div></div>'
     +'<form id="profile-form" class="form-grid">'+field('DISPLAY NAME','text','displayName',user.displayName,'maxlength="40" minlength="2"')+'<button type="submit" class="action-button">SAVE PLAYER NAME</button><p class="form-message" role="status"></p></form>'
     +'<div class="account-actions"><button type="button" class="action-button" data-action="character">OPEN 3D AVATAR CREATOR</button><button type="button" class="secondary-button" data-action="account">ACCOUNT SETTINGS</button><button class="secondary-button" data-action="challenges" type="button">CHALLENGES</button></div>'
     +'<p class="muted" style="margin-top:26px">Traditional outfits and the full 3D avatar creator are scheduled for Step 3.</p>',
     'character');
   const input=dialogBody.querySelector('input[name=displayName]');
   if(input) input.value=user.displayName;
 }
 function accountView() {
   if(!user) {authView();return;}
   openModal('ACCOUNT','PLAYER ACCOUNT',
     '<div class="profile-card"><div class="profile-avatar">'+esc(user.displayName.slice(0,1).toUpperCase())+'</div><div><div class="profile-name">'+esc(user.displayName.toUpperCase())+'</div><div class="muted">'+esc(user.email)+'</div></div></div>'
     +'<div class="detail-line"><span>EMAIL</span><strong>'+ (user.emailVerified?'VERIFIED':'NOT VERIFIED')+'</strong></div>'
     +'<div class="detail-line"><span>REGION</span><strong>'+esc(user.homeCity)+'</strong></div>'
     +'<p class="muted" style="margin:22px 0">This is a development build. Email verification and account recovery are not active yet.</p>'
     +'<div class="form-grid"><button type="button" data-action="profile" class="action-button">EDIT DISPLAY NAME</button>'
     +'<button type="button" data-action="logout" class="secondary-button">SIGN OUT</button></div>'
     +'<div class="account-actions"><button class="danger-button" type="button" data-action="delete-prompt">DELETE ACCOUNT</button></div><p id="account-message" class="form-message" role="status"></p>',
     'account');
 }
 function challengeView() {
   openModal('CHALLENGES','WASA ARENA',
     '<p class="panel-lead">Challenge real players in Damaturu. Online matchmaking is part of a later build.</p>'
     +'<div class="locked-list">'
     +'<div class="locked-item"><span class="locked-icon">▣</span><div><b>CAR RACING</b><small>1 VS 1, RANKED, REMATCH</small></div><span class="locked-tag">SOON</span></div>'
     +'<div class="locked-item"><span class="locked-icon">◇</span><div><b>MOTORCYCLE RACING</b><small>STREET CIRCUITS AND SPRINTS</small></div><span class="locked-tag">SOON</span></div>'
     +'<div class="locked-item"><span class="locked-icon">◈</span><div><b>BICYCLE RACING</b><small>STAMINA AND SKILL RACES</small></div><span class="locked-tag">SOON</span></div>'
     +'<div class="locked-item"><span class="locked-icon">★</span><div><b>CHALLENGE THE CHAMPION</b><small>DUELS AND LIVE SPECTATORS</small></div><span class="locked-tag">SOON</span></div>'
     +'</div><p class="account-warning" style="margin-top:22px">No live racing server has been deployed yet. This is the confirmed upcoming challenge catalogue.</p>',
     'challenges');
 }
 function watchView() {
   openModal('WATCH LIVE','SPECTATOR HUB',
     '<div class="profile-card"><div class="profile-avatar">◎</div><div><div class="profile-name">NO LIVE MATCHES</div><div class="muted">The spectator network will come online with multiplayer challenges.</div></div></div>'
     +'<p class="panel-lead">Public races will let viewers follow drivers through multiple 3D spectator cameras. This is a planned WASA feature, not a running broadcast.</p>'
     +'<button class="secondary-button" type="button" data-action="challenges">VIEW UPCOMING CHALLENGES</button>',
     'watch');
 }
 function settingsView() {
   openModal('SETTINGS','DISPLAY',
     '<p class="panel-lead">Game display preferences are saved on this device.</p>'
     +'<label class="setting-row"><span><b>BACKGROUND MOTION</b><small>Animated 3D preview</small></span><input id="setting-motion" type="checkbox" '+(settings.motion?'checked':'')+'></label>'
     +'<label class="setting-row"><span><b>RENDER QUALITY</b><small>Adjust preview sharpness</small></span><select id="setting-quality">'
     +['auto','low','high'].map(q=>'<option value="'+q+'" '+(settings.quality===q?'selected':'')+'>'+q.toUpperCase()+'</option>').join('')+'</select></label>'
     +'<p class="muted">Keyboard: Esc closes any panel. Mouse and touch rotate the world in Preview mode.</p>',
     'settings');
 }
 function enterPreview() {
   closeModal();
   if (!window.WasaPreview || !window.WasaPreview.available()) {
     openModal('3D PREVIEW','WORLD 01','<p class="panel-lead">3D preview is not available on this device. The playable city is still in development.</p>','preview-failure');
     return;
   }
   menu.hidden=true;
   worldPreview.hidden=false;
   window.WasaPreview.enter();
 }
 function dispatch(action) {
   if (action==='login'||action==='register') return authView(action);
   if (action==='account') return accountView();
   if (action==='character') {window.location.href='/avatar/';return;}
   if (action==='profile') return profileView();
   if (action==='challenges') return challengeView();
   if (action==='watch') return watchView();
   if (action==='settings') return settingsView();
   if (action==='play') {window.location.href='/world/';return;}
   if (action==='logout') return performLogout();
   if (action==='delete-prompt') return deletePrompt();
 }
 async function performLogout() {
   try { await api('/api/logout',{method:'POST',body:'{}'}); user=null; renderAccountStatus();closeModal(); }
   catch(e){const m=$('account-message');if(m)m.textContent=e.message;}
 }
 function deletePrompt() {
   openModal('DELETE ACCOUNT','CONFIRM ACTION','<p class="account-warning">This permanently deletes your WASA development account and player profile. This cannot be undone.</p>'
     +'<form id="delete-form" class="form-grid">'+field('CONFIRM PASSWORD','password','password','Account password','autocomplete="current-password"')
     +'<button class="danger-button" type="submit">PERMANENTLY DELETE ACCOUNT</button>'
     +'<p class="form-message" role="status"></p></form><div class="inline-links"><button type="button" data-action="account">CANCEL</button></div>','delete');
 }
 function message(form,text,success=false) {
   const element=form.querySelector('.form-message');
   if(element){element.textContent=text;element.classList.toggle('success',success);}
 }
 function busy(form,b) {
   const button=form.querySelector('button[type=submit]');
   if (button){button.disabled=b;button.style.opacity=b?'.6':'1';}
 }
 document.addEventListener('click',(event)=>{
   const item=event.target.closest('[data-nav], [data-action]');
   if(item) dispatch(item.dataset.nav||item.dataset.action);
 });
 $('account-button').addEventListener('click',()=>dispatch(user?'account':'login'));
 $('modal-close').addEventListener('click',closeModal);
 modal.addEventListener('click',e=>{if(e.target===modal)closeModal();});
 $('preview-back').addEventListener('click',showMenu);
 document.addEventListener('keydown',(e)=>{
   if(e.key==='Escape'){if(!modal.hidden)closeModal();else if(!worldPreview.hidden)showMenu();}
 });
 document.addEventListener('change',e=>{
   if(e.target.id==='setting-motion'){settings.motion=e.target.checked;saveSettings();applySettings();}
   if(e.target.id==='setting-quality'){settings.quality=e.target.value;saveSettings();applySettings();}
 });
 document.addEventListener('submit', async (event)=>{
   const form=event.target;
   if (!['auth-form','profile-form','delete-form'].includes(form.id)) return;
   event.preventDefault();
   busy(form,true);
   message(form,'');
   const data=Object.fromEntries(new FormData(form));
   try {
     if (form.id==='auth-form') {
       const registration=form.dataset.mode==='register';
       const result=await api(registration?'/api/register':'/api/login',{
         method:'POST',body:JSON.stringify(registration?
          {username:data.username,email:data.email,password:data.password}:
          {identifier:data.identifier,password:data.password})
       });
       user=result.user;renderAccountStatus();profileView();
     } else if(form.id==='profile-form') {
       const result=await api('/api/profile',{method:'PATCH',body:JSON.stringify({displayName:data.displayName})});
       user=result.user;renderAccountStatus();profileView();
       const m=dialogBody.querySelector('.form-message');if(m){m.textContent='Player name saved.';m.classList.add('success');}
     } else {
       await api('/api/delete-account',{method:'POST',body:JSON.stringify({password:data.password})});
       user=null;renderAccountStatus();closeModal();
     }
   } catch(e) {message(form,e.message);}
   finally {busy(form,false);}
 });
 applySettings();
 // Non-blocking account check; the boot sequence remains driven by the loader.
 refreshUser();
})();
