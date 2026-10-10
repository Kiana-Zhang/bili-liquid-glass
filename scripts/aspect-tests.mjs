import {extensionContext} from './extension-context.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const reports=[],version=JSON.parse(await readFile('package.json','utf8')).version;
for(const browser of ['chrome','edge']) {
 const extension=await extensionContext(browser);
 try {
  await extension.settings({enabled:true,transparency:95,spread:200,softness:0,theme:'light',quality:'balanced'});
  assert.equal(await extension.popup.getByLabel('扩散范围',{exact:true}).getAttribute('max'),'200');
  assert.equal(await extension.popup.getByLabel('扩散范围',{exact:true}).inputValue(),'200');
  await extension.popup.reload();assert.equal(await extension.popup.getByLabel('扩散范围',{exact:true}).inputValue(),'200');
  const page=await extension.context.newPage();
  for(const [kind,url]of [['ultrawide','https://www.bilibili.com/video/BV19seG6VEnK/'],['video','https://www.bilibili.com/video/BV1btan64Ed3/'],['bangumi','https://www.bilibili.com/bangumi/play/ss47388']]) {
   await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('.blg-ambient').waitFor({state:'attached'});
   await page.waitForFunction(()=>document.querySelector('.bpx-player-video-wrap video')?.readyState>=2,null,{timeout:25000});
   await page.locator('.bpx-player-video-wrap video').evaluate(async v=>{v.muted=true;await v.play();});
   const inspect=()=>page.evaluate(()=>{const v=document.querySelector('.bpx-player-video-wrap video'),h=document.querySelector('.blg-ambient'),r=v.getBoundingClientRect(),canvas=h?.firstChild,b=canvas?.getBoundingClientRect(),player=v.closest('.bpx-player-container'),p=player.getBoundingClientRect();return{intrinsic:[v.videoWidth,v.videoHeight],video:{x:r.x,y:r.y,width:r.width,height:r.height},player:{width:p.width,height:p.height,class:player.className,screen:player.getAttribute('data-screen'),position:getComputedStyle(player).position,fullscreen:!!document.fullscreenElement},bar:document.querySelector('.bpx-player-sending-area')?.getBoundingClientRect().height??0,domain:b?{x:b.x,width:b.width,height:b.height}:null,buffer:canvas?[canvas.width,canvas.height]:null,width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,sizing:document.querySelectorAll('[data-blg-player-size]').length};});
   const aspect=s=>{
    const cap=Math.max(120,1000-Math.min(Math.max(0,s.video.y),400)-s.bar-16);
    assert.ok(Math.abs(s.video.height-Math.min(s.video.width*s.intrinsic[1]/s.intrinsic[0],cap))<1,'Player follows media dimensions within the initial viewport height cap');
   };
   for(const width of [1440,3840]) {
    await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(400);
    await extension.settings({enabled:false});await page.waitForTimeout(300);const off=await inspect();assert.equal(off.sizing,0);
    const samples=[];
    for(const spread of [100,200]) {
     await extension.settings({enabled:true,spread});await page.waitForTimeout(500);const on=await inspect();aspect(on);
     assert.ok(on.player.width<=off.player.width+1);assert.ok(Math.abs(on.video.width/on.video.height-on.intrinsic[0]/on.intrinsic[1])<.003);assert.equal(on.width,on.scroll);assert.ok(Math.max(...on.buffer)<=512);
     assert.ok(Math.abs(on.player.height-on.video.height-on.bar)<1);
     const leftGap=on.video.x,rightGap=on.width-on.video.x-on.video.width;
     const left=on.video.x-on.domain.x,right=on.domain.x+on.domain.width-on.video.x-on.video.width;
     assert.ok(Math.abs(left/leftGap-right/rightGap)<.003,'Both side edges must be approached at equal progress');
     samples.push({spread,...on,leftProgress:left/leftGap,rightProgress:right/rightGap,status:await extension.status()});
    }
    assert.ok(samples[1].domain.width>samples[0].domain.width);
    if(kind==='ultrawide')assert.ok(off.video.height-samples[1].video.height>50);
    await page.screenshot({path:`artifacts/aspect-${browser}-${kind}-${width}-200.png`});
    const modes=[];
    if((kind==='ultrawide'||kind==='bangumi')&&width===1440) {
     for(const [name,selector]of [['wide','.bpx-player-ctrl-wide'],['web-fullscreen','.bpx-player-ctrl-web'],['fullscreen','.bpx-player-ctrl-full']]) {
      await page.locator('.bpx-player-video-area').hover();await page.waitForTimeout(150);
      await page.locator(selector).click();await page.waitForTimeout(450);const active=await inspect();
      console.log(name,JSON.stringify(active.player),'sizing',active.sizing);
      if(name==='wide')aspect(active);else assert.equal(active.sizing,0,'Fullscreen must restore native sizing');
      if(name==='fullscreen')await page.evaluate(()=>document.exitFullscreen());else await page.locator(selector).click({force:true});
      await page.waitForTimeout(450);const restored=await inspect();aspect(restored);modes.push({name,active,restored});
     }
    }
    reports.push({browser,kind,url,width,height:1000,off,samples,modes,authenticated:false,passed:true});console.log(`PASS ${browser} ${kind} ${width}: intrinsic aspect, balanced side expansion 100/200, proportional fit, bounded buffer${modes.length?', wide/web/fullscreen restoration':''}`);
   }
  }
 }finally{await extension.close();}
}
await writeFile('artifacts/aspect-report.json',JSON.stringify({version,runAt:new Date().toISOString(),reports},null,2));
