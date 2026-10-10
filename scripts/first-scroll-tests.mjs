import {extensionContext} from './extension-context.mjs';
import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const version=JSON.parse(await readFile('package.json','utf8')).version,reports=[];
const server=await startServer();
try{for(const channel of ['chrome','msedge']){
 const b=await chromium.launch({channel,headless:true});try{
  const p=await b.newPage({viewport:{width:1440,height:900}});await p.goto(server.url+'/video/fixture/?test');await p.waitForFunction(()=>window.blgTest&&document.querySelector('video').readyState>=2);
  const result=await p.evaluate(()=>{
   const t=window.blgTest,adapter=new t.PageAdapter('video'),binding=adapter.findPlayer(),root=document.createElement('div');root.id='playerWrap';binding.player.before(root);root.append(binding.player);
   const c=new t.PlaybackController(binding,adapter,()=>{}),settings={version:2,enabled:true,transparency:95,spread:100,softness:0,theme:'light',quality:'balanced',projection:'diagonal'};c.configure(settings);
   const vars=()=>['--blg-video-height','--blg-video-width'].map(s=>root.style.getPropertyValue(s));const initial=vars();
   // Native scroll transition moves/scales the live child; the slot stays put.
   binding.player.style.top='160px';binding.player.style.transform='scale(.7)';
   c.sizer.widthKey='';c.sizer.update(true,adapter);const transient=vars();
   binding.player.style.removeProperty('top');binding.player.style.removeProperty('transform');c.sizer.update(true,adapter);const restored=vars();
   const spacer=document.createElement('div');spacer.style.height='6000px';document.body.append(spacer);scrollTo(0,300);
   // The real first-scroll repro moves a sticky ancestor, not just the child:
   // root.top + scrollY changes while its layout width remains the same.
   root.style.position='relative';root.style.top='639px';c.sizer.update(true,adapter);const sticky=vars();
   const miniStyles=document.createElement('style');miniStyles.textContent='.bpx-player-container[data-screen="mini"]{position:fixed!important;width:360px!important;height:203px!important}.bpx-player-container[data-screen="mini"] :is(.bpx-player-primary-area,.bpx-player-video-area,.bpx-player-video-wrap){height:203px!important}';document.head.append(miniStyles);
   // Native mode must take effect before the next queued layout callback.
   binding.player.dataset.screen='mini';const mini=binding.video.getBoundingClientRect();delete binding.player.dataset.screen;
   miniStyles.remove();root.style.removeProperty('top');c.dispose();spacer.remove();scrollTo(0,0);return{initial,transient,restored,sticky,mini:{width:mini.width,height:mini.height}};
  });assert.deepEqual(result.transient,result.initial);assert.deepEqual(result.restored,result.initial);assert.deepEqual(result.sticky,result.initial);assert.equal(result.mini.width,360);assert.equal(result.mini.height,203);const focus=await p.evaluate(async()=>{
   const t=window.blgTest,store=new t.SettingsStore(t.backend);await store.init();
   const spacer=document.createElement('div');spacer.style.height='6000px';document.body.append(spacer);
   const anchor=document.createElement('button');anchor.textContent='光感';anchor.style.cssText='position:absolute;top:500px;left:600px';document.body.append(anchor);
   let restored=null;const panel=new t.SettingsPanel(store,false,restore=>{restored=restore;panel.dispose();if(restore!==false)anchor.focus();},anchor);
   document.body.append(panel.host);panel.position();panel.focus();scrollTo({top:2200,behavior:'instant'});await new Promise(r=>setTimeout(r,100));
   const out={restored,scroll:scrollY,closed:!panel.host.isConnected};panel.dispose();store.dispose();anchor.remove();spacer.remove();return out;
  });assert.equal(focus.restored,false);assert.equal(focus.closed,true);assert.equal(focus.scroll,2200);
  reports.push({channel,kind:'native transition simulation and automatic menu close',...result,focus,passed:true});console.log(`PASS ${channel}: stable slot budget and untransformed layout width`);
 }finally{await b.close();}
}}finally{await server.close();}
for(const browser of ['chrome','edge']){
 const e=await extensionContext(browser);try{
  await e.settings({enabled:true,transparency:95,spread:100,softness:0});const p=await e.context.newPage();
  await p.setViewportSize({width:1920,height:1000});
  for(const path of ['video/BV11apP6jEzH','video/BV13eH46nESy','bangumi/play/ss47388'])for(let cycle=0;cycle<3;cycle++){
   await p.goto(`https://www.bilibili.com/${path}/`,{waitUntil:'domcontentloaded'});await p.locator('.blg-player-button').waitFor();await p.waitForFunction(()=>document.querySelector('.bpx-player-video-wrap video')?.readyState>=2&&document.querySelector('[data-blg-player-size]'));
   await p.waitForTimeout(300);
   await p.evaluate(()=>{const spacer=document.createElement('div');spacer.style.height='6000px';document.body.append(spacer);window.samples=[];window.collect=true;const tick=()=>{const v=document.querySelector('.bpx-player-video-wrap video'),player=v.closest('.bpx-player-container'),root=v.closest('#playerWrap,#bilibili-player-wrap')??player,r=root.getBoundingClientRect(),b=v.getBoundingClientRect();window.samples.push({scroll:scrollY,height:root.style.getPropertyValue('--blg-video-height'),width:root.style.getPropertyValue('--blg-video-width'),pageTop:r.top+scrollY,screen:player.dataset.screen,video:[b.width,b.height]});if(window.collect)requestAnimationFrame(tick);};tick();});
   await p.mouse.move(350,300);
   if(cycle===1)for(let i=0;i<12;i++){await p.mouse.wheel(0,35);await p.waitForTimeout(40);}
   await p.mouse.wheel(0,1050);await p.waitForTimeout(500);await p.mouse.wheel(0,-1600);await p.waitForTimeout(300);await p.evaluate(()=>window.collect=false);const samples=await p.evaluate(()=>window.samples);
   assert.ok(samples.every(r=>r.height===samples[0].height&&r.width===samples[0].width),JSON.stringify(samples));
   assert.ok(samples.every(r=>r.screen==='mini'||r.screen==='miniscreen'||Math.abs(r.video[0]-samples[0].video[0])<1),JSON.stringify(samples));
   assert.ok(samples.filter(r=>r.screen==='mini'||r.screen==='miniscreen').every(r=>r.video[0]<=640&&r.video[1]<=650),'Native mini must not inherit page dimensions for a transition frame');
   await p.locator('.bpx-player-video-area').hover();await p.locator('.blg-player-button').click();
   assert.equal(await p.locator('.blg-ui-host').count(),1);
   await p.evaluate(()=>{window.scrollTrace=[];window.collect=true;const tick=()=>{window.scrollTrace.push(scrollY);if(window.collect)requestAnimationFrame(tick);};tick();});
   await p.mouse.move(200,400);await p.mouse.wheel(0,800);await p.waitForTimeout(450);await p.mouse.wheel(0,500);await p.waitForTimeout(450);await p.evaluate(()=>window.collect=false);
   const trace=await p.evaluate(()=>window.scrollTrace);assert.ok(trace.every((v,i)=>!i||v>=trace[i-1]-1),JSON.stringify(trace));assert.ok(trace.at(-1)>900);
   const menuCount=await p.locator('.blg-ui-host').count();
   // Native mini-player may keep the menu anchor visible; either menu state
   // is acceptable. The regression is any backwards page movement.
   await p.evaluate(()=>{scrollTo({top:2200,behavior:"instant"});});await p.waitForTimeout(150);const after=await p.evaluate(()=>scrollY);assert.ok(after>=2199,JSON.stringify({browser,path,cycle,after,menuCount,trace}));
   reports.push({browser,path,cycle,scenario:cycle===1?'slow-then-fast':'first-fast',samples,scrollTrace:trace,menuCount,after,passed:true});console.log(`PASS ${browser} ${path} refresh ${cycle+1}: rapid wheel preserves size; open menu scrolls without pullback`);
  }
 }finally{await e.close();}
}
await writeFile('artifacts/first-scroll-report.json',JSON.stringify({version,runAt:new Date().toISOString(),reports},null,2));
