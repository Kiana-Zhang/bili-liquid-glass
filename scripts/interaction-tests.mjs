import {extensionContext} from './extension-context.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const reports=[];
const version=JSON.parse(await readFile('package.json','utf8')).version;
for(const browser of ['chrome','edge']) {
  const extension=await extensionContext(browser);
  try {
    await extension.settings({enabled:true,transparency:95,spread:100,softness:0,theme:'light'});
    const page=await extension.context.newPage(),warnings=[];
    page.on('console',message=>{if(/willReadFrequently/.test(message.text()))warnings.push({text:message.text(),location:message.location()});});
    await page.goto('https://www.bilibili.com/video/BV1DVaZ6hEYT/',{waitUntil:'domcontentloaded'});
    await page.locator('.blg-ambient').waitFor({state:'attached',timeout:15000});
    await page.locator('.right-container .video-page-card-small').first().waitFor({timeout:15000});
    await page.locator('.bpx-player-video-wrap video').evaluate(async v=>{v.muted=true;await Promise.race([v.play().catch(()=>{}),new Promise(r=>setTimeout(r,1000))]);});
    const inspect=()=>page.evaluate(()=>{
      const sidebar=document.querySelector('.right-container'),style=getComputedStyle(sidebar),detail=document.querySelector('.video-info-detail-list, .video-info-detail, .video-info-meta'),root=document.querySelector('.bpx-player-container');
      const placeholder=document.querySelector('#bilibili-player-placeholder'),docker=document.querySelector('.bpx-docker-minor');
      return{card:sidebar.hasAttribute('data-blg-card'),foreground:sidebar.hasAttribute('data-blg-static-layer')||sidebar.hasAttribute('data-blg-auto-layer'),blur:style.backdropFilter,previews:sidebar.querySelectorAll('video').length,detailBackground:detail?getComputedStyle(detail).backgroundColor:null,playerShadow:getComputedStyle(root).boxShadow,placeholderShadow:placeholder?getComputedStyle(placeholder).boxShadow:null,dockerBackground:docker?getComputedStyle(docker).backgroundColor:null,ambientCount:document.querySelectorAll('.blg-ambient').length};
    });
    const before=await inspect();await page.locator('.right-container .video-page-card-small').first().locator('a').first().hover();await page.waitForTimeout(2200);const hover=await inspect();
    assert.ok(before.card&&hover.card&&before.foreground&&hover.foreground);assert.equal(hover.blur,before.blur);assert.equal(hover.ambientCount,1);
    await page.mouse.move(20,400);
    for(const delta of [200,200,-200,-200,300,-300])await page.mouse.wheel(0,delta);
    await page.waitForTimeout(300);const scroll=await inspect();assert.equal(scroll.detailBackground,'rgba(0, 0, 0, 0)');assert.equal(scroll.playerShadow,'none');assert.equal(scroll.placeholderShadow,'none');assert.equal(scroll.dockerBackground,'rgba(0, 0, 0, 0)');
    await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(150);
    await page.screenshot({path:`artifacts/interactions-${browser}.png`});
    const extensionWarnings=warnings.filter(w=>/content\.js|chrome-extension:/.test(w.location.url));assert.equal(extensionWarnings.length,0);
    reports.push({browser,passed:true,before,hover,scroll,warnings});console.log(`PASS ${browser}: user video hover keeps sidebar layers; rapid wheel keeps transparent title and no native glow`);
  } finally {await extension.close();}
}
await writeFile('artifacts/interaction-report.json',JSON.stringify({version,runAt:new Date().toISOString(),reports},null,2));
