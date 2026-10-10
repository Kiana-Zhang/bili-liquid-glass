import {extensionContext} from './extension-context.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const version=JSON.parse(await readFile('package.json','utf8')).version,reports=[];
for(const browser of ['chrome','edge']){
 const e=await extensionContext(browser);
 try{
  await e.settings({enabled:true,transparency:95,spread:100,softness:0,theme:'light'});
  for(const path of ['ep750804','ss47388','ss40396']){
   const p=await e.context.newPage();await p.goto(`https://www.bilibili.com/bangumi/play/${path}`,{waitUntil:'domcontentloaded'});await p.locator('.blg-player-button').waitFor();
   await p.evaluate(()=>{const v=document.querySelector('.bpx-player-video-wrap video');v.muted=true;void v.play().catch(()=>{});});
   await p.waitForFunction(()=>document.querySelector('.bpx-player-video-wrap video')?.readyState>=2);await p.evaluate(()=>document.querySelector('.bpx-player-video-wrap video').pause());
   const inspect=()=>p.evaluate(()=>{
    const v=document.querySelector('.bpx-player-video-wrap video'),player=v.closest('.bpx-player-container'),root=player.closest('#bilibili-player-wrap'),grid=root.closest('.plp-layout'),left=grid.querySelector(':scope>.plp-left-wrap'),toolbar=left.querySelector('.toolbar');
    const box=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
    const controls=[...toolbar.querySelectorAll('[id]')].filter(n=>/like|coin|fav/.test(n.id)).map(n=>{const r=n.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{id:n.id,box:box(n),reachable:!!hit&&(n===hit||n.contains(hit))};});
    return{media:[v.videoWidth,v.videoHeight],video:box(v),player:box(player),root:box(root),toolbar:box(toolbar),leftPadding:getComputedStyle(left).paddingTop,leftRow:getComputedStyle(left).gridRow,rootClass:root.className,columnWidth:left.getBoundingClientRect().width,flow:grid.getAttribute('data-blg-player-flow'),flowHeight:grid.style.getPropertyValue('--blg-player-flow-height'),controls,fit:getComputedStyle(v).objectFit,screen:player.dataset.screen,viewport:[innerWidth,innerHeight],scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth};
   });
   const mode=async()=>{await p.locator('.bpx-player-video-area').hover();await p.locator('.bpx-player-ctrl-wide').click();await p.waitForTimeout(200);};
   const assertFlow=s=>{assert.ok(s.toolbar.y>=s.player.bottom-.5,JSON.stringify(s));assert.equal(s.fit,'contain');assert.ok(Math.abs(s.video.width/s.video.height-s.media[0]/s.media[1])<.003);assert.equal(s.clientWidth,s.scrollWidth);assert.ok(s.controls.length>=2,JSON.stringify(s));const visible=s.controls.filter(c=>c.box.y>=0&&c.box.bottom<=s.viewport[1]);assert.ok(visible.every(c=>c.reachable),JSON.stringify(s));};
   // Movie pages can start with a wide PAGE wrapper while the inner native
   // player still reports data-screen="normal". Read the flow wrapper instead.
   if((await inspect()).rootClass.includes('video_playerWide__'))await mode();
   for(const [width,height]of [[1440,1000],[3840,2160],[3840,1000]]){
    await p.setViewportSize({width,height});await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(350);
    await e.settings({enabled:false});await p.waitForTimeout(150);const off=await inspect();assert.equal(off.flow,null);assert.equal(off.flowHeight,'');
    await e.settings({enabled:true});await p.waitForTimeout(200);const normal=await inspect();assertFlow(normal);assert.equal(normal.columnWidth,off.columnWidth);
    if(normal.leftRow==='player')assert.ok(Math.abs(parseFloat(normal.leftPadding)-normal.root.height)<.5,JSON.stringify(normal));else assert.equal(normal.leftPadding,off.leftPadding);
    await p.evaluate(()=>document.querySelector('.player-left-components>.toolbar').scrollIntoView({block:'center',behavior:'instant'}));await p.waitForTimeout(200);const reachable=await inspect();assert.ok(reachable.controls.every(c=>c.reachable),JSON.stringify(reachable));await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(200);
    await mode();const wide=await inspect();assertFlow(wide);assert.equal(wide.leftPadding,'0px');await mode();const restored=await inspect();assertFlow(restored);
    if(path==='ep750804'){
     await p.evaluate(()=>{const tail=document.createElement('div');tail.id='flow-test-tail';tail.style.height='6000px';document.body.append(tail);});
     await p.mouse.move(300,400);await p.mouse.wheel(0,1200);await p.waitForTimeout(250);const scrolled=await inspect();assert.equal(scrolled.flowHeight,normal.flowHeight);await p.mouse.wheel(0,-1600);await p.waitForTimeout(300);assertFlow(await inspect());
     for(const [name,selector]of [['web','.bpx-player-ctrl-web'],['full','.bpx-player-ctrl-full']]){
      await p.locator('.bpx-player-video-area').hover();await p.locator(selector).click();await p.waitForTimeout(200);
      assert.equal(await p.locator('[data-blg-player-flow]').count(),0,'Fullscreen releases page flow override');
      if(name==='full')await p.evaluate(()=>document.exitFullscreen());else await p.locator(selector).click({force:true});await p.waitForTimeout(200);assertFlow(await inspect());
     }
     await p.screenshot({path:`artifacts/bangumi-flow-${browser}-${width}-${height}.png`});
    }
    reports.push({browser,path,width,height,off,normal,wide,restored,authenticated:false,passed:true});console.log(`PASS ${browser} ${path} ${width}x${height}: toolbar below complete proportional player, native padding restored, normal/wide fit`);
    await writeFile('artifacts/bangumi-flow-report.json',JSON.stringify({version,runAt:new Date().toISOString(),reports},null,2));
   }
   await p.close();
  }
 }finally{await e.close();}
}
