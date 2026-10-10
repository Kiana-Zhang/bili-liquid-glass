import {extensionContext} from './extension-context.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const reports=[],version=JSON.parse(await readFile('package.json','utf8')).version;
for(const browser of ['chrome','edge']){
 const e=await extensionContext(browser);
 try{
  await e.settings({enabled:true,transparency:95,spread:100,softness:0,theme:'light'});
  const p=await e.context.newPage(),errors=[];p.on('pageerror',error=>errors.push(error.message));
  for(const bv of ['BV13eH46nESy','BV19seG6VEnK','ss47388']){
   await p.goto(`https://www.bilibili.com/${bv.startsWith("BV")?"video":"bangumi/play"}/${bv}/`,{waitUntil:'domcontentloaded'});
   await p.locator('.blg-player-button').waitFor();
   await p.waitForFunction(()=>document.querySelector('.bpx-player-video-wrap video')?.readyState>=2);
   await p.evaluate(()=>document.querySelector('.bpx-player-video-wrap video').pause());
   const modes=[];
   for(const [mode,selector]of [['page',null],['web','.bpx-player-ctrl-web'],['full','.bpx-player-ctrl-full']]){
    await p.locator('.bpx-player-video-area').hover();
    if(selector){await p.locator(selector).click();await p.waitForTimeout(250);}
    await p.locator('.bpx-player-video-area').hover();await p.locator('.blg-player-button').click();
    await p.getByRole('dialog',{name:'沉浸光感设置'}).waitFor();
    const inspect=()=>p.evaluate(()=>{
     const r=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
     const host=document.querySelector('.blg-ui-host'),panel=host.shadowRoot.querySelector('.panel'),button=document.querySelector('.blg-player-button');
     const toolbar=document.querySelector('.bpx-player-control-wrap'),halo=document.querySelector('.blg-ambient');
     return{panel:r(panel),button:r(button),viewport:[document.documentElement.clientWidth,innerHeight],modal:panel.getAttribute('aria-modal'),surface:getComputedStyle(panel).backgroundColor,radius:getComputedStyle(panel).borderRadius,
      toolbarZ:Number(getComputedStyle(toolbar).zIndex),haloZ:Number(getComputedStyle(halo).zIndex),opacity:getComputedStyle(toolbar).opacity,backing:document.querySelectorAll('.blg-readable').length,shadow:getComputedStyle(document.querySelector('.video-title')??document.body).textShadow};
    });
    await p.waitForTimeout(100);let s=await inspect();
    assert.ok(s.panel.x>=7&&s.panel.right<=s.viewport[0]-7&&s.panel.y>=7&&s.panel.bottom<=s.viewport[1]-7,JSON.stringify(s));
    assert.ok(Math.abs(s.panel.bottom+10-s.button.y)<2,'Menu must sit directly above its button, not screen center');
    assert.equal(s.modal,'false');assert.equal(s.radius,'4px');assert.equal(s.backing,0);assert.equal(s.shadow,'none');
    assert.ok(s.toolbarZ>s.haloZ,'Entire native toolbar must composite above the halo');
    await p.getByLabel('柔和度',{exact:true}).fill('35');await p.getByLabel('柔和度',{exact:true}).dispatchEvent('change');
    await e.popup.reload();assert.equal(await e.popup.getByLabel('柔和度',{exact:true}).inputValue(),'35');
    await p.screenshot({path:`artifacts/menu-${browser}-${bv}-${mode}.png`});
    await p.getByLabel('柔和度',{exact:true}).press('Escape');assert.equal(await p.locator('.blg-ui-host').count(),0);
    if(mode==='full')assert.ok(await p.evaluate(()=>!!document.fullscreenElement),'Escape closes menu without exiting fullscreen');
    await p.locator('.bpx-player-video-area').hover();await p.locator('.blg-player-button').click();
    await p.locator('.bpx-player-ctrl-quality').click();assert.equal(await p.locator('.blg-ui-host').count(),0,'Outside click dismisses');
    modes.push({mode,...s});
    if(mode==='full')await p.evaluate(()=>document.exitFullscreen());else if(selector)await p.locator(selector).click({force:true});
    await p.waitForTimeout(200);
   }
   await p.setViewportSize({width:960,height:800});await p.locator('.bpx-player-video-area').hover();await p.locator('.blg-player-button').click();
   await p.waitForTimeout(100);
   const narrow=await p.locator('.blg-ui-host').evaluate(el=>{const r=el.shadowRoot.querySelector('.panel').getBoundingClientRect();return{x:r.x,right:r.right,top:r.top,bottom:r.bottom,width:document.documentElement.clientWidth,height:innerHeight};});
   assert.ok(narrow.x>=7&&narrow.right<=narrow.width-7&&narrow.top>=7&&narrow.bottom<=narrow.height-7,JSON.stringify(narrow));
   await p.getByLabel('沉浸光感',{exact:true}).uncheck();assert.equal(await p.locator('.blg-ui-host').count(),1,'Turning off keeps menu usable');
   await p.getByLabel('沉浸光感',{exact:true}).check();await p.getByLabel('沉浸光感',{exact:true}).press('Escape');
   await p.setViewportSize({width:1440,height:1000});
   await e.settings({softness:0});
   reports.push({browser,bv,modes,narrow,errors,passed:true});console.log(`PASS ${browser} ${bv}: anchored native-style menu, page/web/full, outside/Escape, persistence, narrow clamp, no readability layers`);
  }
  assert.deepEqual(errors,[]);
 }finally{await e.close();}
}
await writeFile('artifacts/menu-report.json',JSON.stringify({version,runAt:new Date().toISOString(),reports},null,2));
