import {extensionContext} from './extension-context.mjs';
import {pixelDifference} from './image-pixels.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const reports=[],version=JSON.parse(await readFile('package.json','utf8')).version;
for(const browser of ['chrome','edge']) {
 const extension=await extensionContext(browser);
 try {
  await extension.settings({enabled:true,transparency:95,spread:100,softness:0,theme:'light',quality:'balanced'});
  const page=await extension.context.newPage();
  for(const [kind,url]of [['video','https://www.bilibili.com/video/BV1btan64Ed3/'],['bangumi','https://www.bilibili.com/bangumi/play/ss47388']]) {
   await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('.blg-ambient').waitFor({state:'attached',timeout:20000});
   await page.waitForFunction(()=>document.querySelector('.bpx-player-video-wrap video')?.readyState>=2,null,{timeout:25000});
   await page.locator('.bpx-player-video-wrap video').evaluate(async v=>{v.muted=true;await v.play();});
   for(const width of [1440,3840]) {
    await page.setViewportSize({width,height:1000});
    // Enough scroll space to move the complete halo offscreen even on pages
    // where Bilibili has not loaded a long comments list yet.
    await page.evaluate(()=>{document.querySelector('#test-tail-space')?.remove();const e=document.createElement('div');e.id='test-tail-space';e.style.height='6000px';document.body.append(e);});
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(700);
    await page.evaluate(()=>scrollTo(0,1300));
    await page.waitForFunction(()=>{const h=document.querySelector('bili-comments')?.shadowRoot?.querySelector('bili-comments-header-renderer');return h&&getComputedStyle(h).paddingLeft==='16px';},null,{timeout:20000});
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(450);
    const insets=await page.evaluate(kind=>{
     const measure=(e,container)=>{if(!e||!container)return null;const r=e.getBoundingClientRect(),b=container.getBoundingClientRect();return{left:r.left-b.left,right:b.right-r.right,top:r.top-b.top,bottom:b.bottom-r.bottom,width:r.width};};
     const q=s=>document.querySelector(s),toolbar=q(kind==='video'?'#arc_toolbar_report':'.player-left-components > .toolbar');
     const reco=q(kind==='video'?'.right-container .recommend-list-v1':'.plp-r [class*="recommend_wrap__"]');
     const first=reco?.querySelector(kind==='video'?'.video-page-card-small':'a');
     const comments=q('bili-comments'),header=comments?.shadowRoot?.querySelector('bili-comments-header-renderer');
     const result={like:measure(q(kind==='video'?'.video-like':'#like_info'),toolbar),recommendation:measure(first,reco),heading:measure(reco?.firstElementChild,reco),comments:header?getComputedStyle(header).paddingLeft:null,
      toolbarSurface:{background:getComputedStyle(toolbar).backgroundColor,blur:getComputedStyle(toolbar).backdropFilter,outline:getComputedStyle(toolbar).outlineStyle},player:q('.bpx-player-video-wrap video').getBoundingClientRect().width,columns:[q('.left-container,.plp-l'),q('.right-container,.plp-r')].map(e=>e.getBoundingClientRect().width),client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth};
     return result;
    },kind);
    assert.equal(insets.comments,'16px');
    // Bangumi keeps its native 8px vertical toolbar spacing; only its
    // horizontal inset is overridden by the theme.
    assert.ok(insets.like.left>=15.9&&insets.like.top>=(kind==='bangumi'?7.9:15.9),JSON.stringify(insets));
    assert.ok(insets.recommendation.left>=15.9&&insets.recommendation.right>=15.9);
    assert.ok(insets.heading.left>=15.9);
    assert.equal(insets.client,insets.scroll);
    assert.equal(await page.locator('.blg-readable').count(),0);
    await extension.settings({theme:'dark'});await page.waitForTimeout(180);
    await page.screenshot({path:`artifacts/insets-dark-${browser}-${kind}-${width}.png`});
    await extension.settings({theme:'light'});await page.waitForTimeout(180);
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(350);
    const start=await page.evaluate(()=>{const v=document.querySelector('.bpx-player-video-wrap video'),h=document.querySelector('.blg-ambient'),b=v.getBoundingClientRect();return{x:b.x,bottom:b.bottom+scrollY,haloBottom:h.getBoundingClientRect().bottom+scrollY,anchorTop:(v.closest('.bpx-docker-major')??v).getBoundingClientRect().top+scrollY,buffer:[h.firstChild.width,h.firstChild.height],width:h.firstChild.style.width,height:h.firstChild.style.height};});
    const samples=[];
    for(const y of [start.bottom-30,start.bottom+30,start.bottom+130,start.haloBottom-60,start.haloBottom+20,start.haloBottom-60,start.bottom+130,start.bottom-30,0]) {
     await page.evaluate(y=>scrollTo(0,y),y);await page.waitForTimeout(450);
     const sample=await page.evaluate(()=>{const h=document.querySelector('.blg-ambient'),v=document.querySelector('.bpx-player-video-wrap video'),b=h.getBoundingClientRect();return{scroll:scrollY,hidden:h.hidden,opacity:Number(h.style.opacity),top:b.top,bottom:b.bottom,anchorTop:(v.closest('.bpx-docker-major')??v).getBoundingClientRect().top+scrollY,buffer:[h.firstChild.width,h.firstChild.height],width:h.firstChild.style.width,height:h.firstChild.style.height,positionVisibility:getComputedStyle(h).getPropertyValue('position-visibility'),mini:getComputedStyle(v.closest('.bpx-player-container')).position==='fixed'};});
     sample.status=await extension.status();samples.push(sample);
    }
    await writeFile(`artifacts/inset-debug-${browser}-${kind}-${width}.json`,JSON.stringify({insets,start,samples},null,2));
    // Bilibili does not activate scroll mini mode on every window size; the
    // 1440px run must exercise it. Larger windows still test the offscreen tail.
    if(width===1440)assert.ok(samples[2].mini,'Native scroll mini mode must actually be exercised');
    for(const i of [0,1,2,3,5,6,7,8]) {
     const s=samples[i];assert.equal(s.hidden,false,`Halo must remain at scroll ${s.scroll}`);assert.ok(s.opacity>0);assert.ok(Math.max(...s.buffer)<=512);assert.ok(Math.abs(s.buffer[0]/s.buffer[1]-start.buffer[0]/start.buffer[1])<.015,'The sampling domain must not change to mini aspect/geometry');assert.ok(Math.abs(parseFloat(s.width)-parseFloat(start.width))<1);assert.ok(Math.abs(parseFloat(s.height)-parseFloat(start.height))<1);assert.equal(s.positionVisibility,'always');
     assert.ok(Math.abs(s.bottom+s.scroll-start.haloBottom)<2,'Main halo must not teleport during the native sticky/mini transition');
    }
    if(samples[2].mini){assert.equal(samples[2].status.diagnostics.scheduled,false,'Mini mode stops sampling');assert.deepEqual(samples[2].buffer,samples[3].buffer,'Frozen mini tail must not resize its buffer');}
    assert.equal(samples[4].hidden,true);assert.equal(samples[4].status.diagnostics.scheduled,false);
    assert.ok(samples[3].opacity<samples[2].opacity&&samples[5].opacity<samples[6].opacity);
    assert.ok(samples[8].status.diagnostics.frames>samples[7].status.diagnostics.frames,'Re-entering resumes live frames');
    // Verify painted pixels, since anchor conditional hiding is invisible to
    // host.hidden, opacity, and even checkVisibility() in Chromium.
    await page.evaluate(y=>scrollTo(0,y),start.bottom+130);await page.waitForTimeout(450);
    const clip={x:Math.max(2,Math.floor(start.x-20)),y:100,width:16,height:100},painted=await page.screenshot({clip});
    await page.locator('.blg-ambient').evaluate(h=>h.style.visibility='hidden');const blank=await page.screenshot({clip});
    await page.locator('.blg-ambient').evaluate(h=>h.style.removeProperty('visibility'));
    const difference=pixelDifference(painted,blank);assert.ok(difference>1,`Offscreen-source halo must actually paint: ${difference}`);
    await page.screenshot({path:`artifacts/tail-${browser}-${kind}-${width}.png`});
    // Paused sources also retain a visible tail on both sides of the threshold.
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(450);await page.locator('.bpx-player-video-wrap video').evaluate(v=>v.pause());
    await page.evaluate(y=>scrollTo(0,y),start.bottom+30);await page.waitForTimeout(350);
    const paused=await extension.status();assert.equal(paused.diagnostics.scheduled,false);assert.equal(await page.locator('.blg-ambient').evaluate(h=>h.hidden),false);
    await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(450);await page.locator('.bpx-player-video-wrap video').evaluate(v=>v.play());
    reports.push({browser,kind,url,width,height:1000,appendedScrollSpace:true,insets,start,samples,paintedPixelDifference:difference,paused,authenticated:false,passed:true});
    console.log(`PASS ${browser} ${kind} ${width}: safe insets; mini=${samples[2].mini}; halo paints offscreen (${difference.toFixed(1)} RGB difference); gradual exit/re-entry`);
   }
  }
 }finally{await extension.close();}
}
await writeFile('artifacts/inset-report.json',JSON.stringify({version,runAt:new Date().toISOString(),reports},null,2));
