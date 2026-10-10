import {extensionContext} from './extension-context.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const reports=[],version=JSON.parse(await readFile('package.json','utf8')).version;
for(const browser of ['chrome','edge']) {
  const extension=await extensionContext(browser);
  try {
    const page=await extension.context.newPage();
    await extension.settings({enabled:true,transparency:95,spread:100,softness:0,theme:'light'});
    for(const [kind,url]of [['video','https://www.bilibili.com/video/BV1DVaZ6hEYT/'],['bangumi','https://www.bilibili.com/bangumi/play/ep5881948']]) {
      await page.goto(url,{waitUntil:'domcontentloaded'});await page.locator('.blg-ambient').waitFor({state:'attached',timeout:20000});
      if(kind==='video') {
        await page.waitForFunction(()=>document.querySelector('.bpx-player-video-wrap video')?.readyState>=2,{},{timeout:20000});
        await page.locator('.bpx-player-video-wrap video').evaluate(async v=>{v.muted=true;await Promise.race([v.play().catch(()=>{}),new Promise(r=>setTimeout(r,1000))]);});
      }
      for(const viewport of [{width:1440,height:1000},{width:960,height:800}]) {
        await page.setViewportSize(viewport);await page.evaluate(()=>scrollTo(0,0));
        await extension.settings({enabled:false});await page.waitForTimeout(250);
        const measure=()=>page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,header:[...document.querySelectorAll('.bili-header')].map(e=>e.className).join('|')}));
        let off=await measure();
        await page.keyboard.down('Shift');await page.mouse.wheel(0,300);await page.keyboard.up('Shift');await page.waitForTimeout(80);
        let nativeShiftX=await page.evaluate(()=>scrollX);await page.evaluate(()=>scrollTo(0,0));
        await extension.settings({enabled:true});await page.waitForTimeout(250);
        let on=await measure();
        // Bilibili asynchronously replaces its SSR header with another native
        // header whose minimum width differs. Compare the same DOM generation.
        if(on.header!==off.header) {
          await extension.settings({enabled:false});await page.waitForTimeout(250);off=await measure();
          await page.keyboard.down('Shift');await page.mouse.wheel(0,300);await page.keyboard.up('Shift');await page.waitForTimeout(80);nativeShiftX=await page.evaluate(()=>scrollX);await page.evaluate(()=>scrollTo(0,0));
          await extension.settings({enabled:true});await page.waitForTimeout(250);on=await measure();
        }
        assert.deepEqual(on,off,`${browser} ${kind}: extension changed document width`);
        // Edge can retain the tail of the previous horizontal wheel animation.
        // Compare both phases from the same explicit zero scroll position.
        await page.evaluate(()=>scrollTo({left:0,top:0,behavior:'instant'}));
        await page.waitForFunction(()=>scrollX===0);
        const beforeX=await page.evaluate(()=>scrollX);assert.equal(beforeX,0);
        await page.keyboard.down('Shift');await page.mouse.wheel(0,300);await page.keyboard.up('Shift');await page.waitForTimeout(80);
        const afterX=await page.evaluate(()=>scrollX);assert.equal(afterX,nativeShiftX,`${browser} ${kind}: Shift+wheel differs from native page`);
        await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(80);
        if(kind==='video') {
          await page.locator('.bpx-player-video-wrap video').evaluate(async v=>{v.muted=true;await Promise.race([v.play().catch(()=>{}),new Promise(r=>setTimeout(r,1000))]);});
          let status;
          for(let retry=0;retry<40;retry++){status=await extension.status();if(status?.diagnostics?.frames>=3)break;await page.waitForTimeout(100);}
          assert.ok(status?.diagnostics?.frames>=3,`${browser}: no ambient frames during scroll test`);
          assert.equal(await page.locator('.bpx-player-video-wrap video').evaluate(v=>v.paused),false);
        }
        await page.evaluate(()=>{
          window.scrollSamples=[];window.stopSamples=false;
          // Anchor scroll translations are finalized after RAF callbacks and
          // layout. Read after that render phase, not midway through it.
          const sample=()=>{const v=document.querySelector('.bpx-player-video-wrap video'),h=document.querySelector('.blg-ambient'),c=h?.querySelector('canvas');if(v&&h&&c){const vr=v.getBoundingClientRect(),hr=h.getBoundingClientRect(),cr=c.getBoundingClientRect();window.scrollSamples.push({y:scrollY,offset:vr.top-hr.top,canvasOffset:cr.top-hr.top,canvasLeft:cr.left-vr.left,bounds:[c.width,c.height]});}if(!window.stopSamples)requestAnimationFrame(()=>setTimeout(sample,0));};requestAnimationFrame(()=>setTimeout(sample,0));
        });
        for(const delta of [200,200,-200,-200,400,-400])await page.mouse.wheel(0,delta);
        await page.waitForTimeout(100);
        const samples=await page.evaluate(()=>{window.stopSamples=true;return window.scrollSamples;});
        assert.ok(samples.length>=3);const baseline=samples[0];
        // Allow fade/visibility to change, but the video exclusion and canvas
        // origin must move together on every displayed scroll frame.
        for(const sample of samples){assert.ok(Math.abs(sample.offset-baseline.offset)<1.1,JSON.stringify({browser,kind,baseline,sample}));assert.ok(Math.abs(sample.canvasOffset)<1.1);assert.ok(Math.abs(sample.canvasLeft-baseline.canvasLeft)<1.1);assert.ok(Math.max(...sample.bounds)<=512);}
        await page.mouse.wheel(0,200);await page.waitForTimeout(60);
        await page.screenshot({path:`artifacts/scroll-${browser}-${kind}-${viewport.width}.png`});
        await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(80);
        reports.push({browser,kind,url,viewport,settings:{transparency:95,spread:100,softness:0},off,on,beforeX,afterX,nativeShiftX,samples,passed:true,authenticated:false,status:await extension.status()});
        console.log(`PASS ${browser} ${kind} ${viewport.width}: stable width, Shift+wheel and ${samples.length} scroll frames aligned`);
      }
    }
  }finally{await extension.close();}
}
await writeFile('artifacts/scroll-report.json',JSON.stringify({version,runAt:new Date().toISOString(),reports},null,2));
