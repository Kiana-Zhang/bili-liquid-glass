import {extensionContext} from './extension-context.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const reports=[],version=JSON.parse(await readFile('package.json','utf8')).version;
for(const browser of ['chrome','edge']) {
  const extension=await extensionContext(browser);
  try {
    const page=await extension.context.newPage();
    await extension.settings({enabled:true,transparency:95,spread:100,softness:0,theme:'light'});
    for(const [kind,url]of [['video','https://www.bilibili.com/video/BV1btan64Ed3/'],['bangumi','https://www.bilibili.com/bangumi/play/ep815752']]) {
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await page.locator('.blg-ambient').waitFor({state:'attached',timeout:20000});
      await page.waitForTimeout(1500);
      if(kind==='video') {
        await page.waitForFunction(()=>document.querySelector('.bpx-player-video-wrap video')?.readyState>=2,null,{timeout:20000});
        await page.locator('.bpx-player-video-wrap video').evaluate(async v=>{v.muted=true;await v.play();});
      }
      for(const [width,height,zoom]of [[3840,1960,1],[3840,1960,1.25],[1440,1000,1.1]]) {
        await page.setViewportSize({width,height});
        if(kind==='video')await page.locator('bili-comments-vote-card').waitFor({state:'attached',timeout:10000});
        const status=await extension.status();
        await extension.popup.evaluate(async({id,zoom})=>chrome.tabs.setZoom(id,zoom),{id:status.tabId,zoom});
        await page.evaluate(()=>scrollTo({left:0,top:0,behavior:'instant'}));
        const inspect=()=>page.evaluate(()=>{
          const root=document.documentElement,video=document.querySelector('.bpx-player-video-wrap video'),host=document.querySelector('.blg-ambient');
          const player=video.closest('.bpx-player-container'),r=player.getBoundingClientRect();
          const promotions=[];const visit=root=>{for(const e of root.querySelectorAll('.video-resource-list,.right-bottom-banner,bili-comments-vote-card,.bili-danmaku-x-vote'))promotions.push({class:e.className,tag:e.tagName,display:getComputedStyle(e).display});for(const e of root.querySelectorAll('*'))if(e.shadowRoot)visit(e.shadowRoot);};visit(document);
          return{inner:innerWidth,client:root.clientWidth,scroll:root.scrollWidth,gutter:innerWidth-root.clientWidth,x:scrollX,overflow:getComputedStyle(root).overflowX,bodyOverflow:getComputedStyle(document.body).overflowX,player:{x:r.x,y:r.y,width:r.width,height:r.height},clip:host?.style.clipPath,
            layers:[player,player.parentElement,document.querySelector('#bilibili-player-wrap'),document.querySelector('#playerWrap')].filter(Boolean).map(e=>{const s=getComputedStyle(e);return{class:e.className,shadow:s.boxShadow,outline:s.outlineStyle};}),
            promotions,
            playback:{ready:video.readyState,paused:video.paused}};
        });
        await extension.settings({enabled:false});await page.waitForTimeout(300);const off=await inspect();
        await extension.settings({enabled:true});await page.waitForTimeout(300);
        if(kind==='video') {
          await page.locator('.bpx-player-video-wrap video').evaluate(async v=>{v.muted=true;await v.play();});
          let state;for(let attempt=0;attempt<40;attempt++){state=await extension.status();if(state?.diagnostics?.frames>=3)break;await page.waitForTimeout(100);}
          assert.ok(state?.diagnostics?.frames>=3);
        }
        const on=await inspect();
        assert.ok(on.gutter>0,'Native vertical scrollbar must be present');
        assert.equal(on.scroll,on.client,'There must be no horizontal overflow');
        assert.equal(on.bodyOverflow,'clip');assert.equal(on.overflow,'clip');
        assert.equal(on.player.width,off.player.width,'Player width must not change');
        assert.ok(on.promotions.every(e=>e.display==='none'));
        if(kind==='video')assert.ok(on.promotions.some(e=>e.tag==='BILI-COMMENTS-VOTE-CARD'));
        assert.ok(on.layers.every(e=>e.shadow==='none'&&e.outline==='none'));
        assert.equal(on.clip.split(',').length,5,'Normal mode must not cut a fractional video-edge hole');
        await page.keyboard.down('Shift');await page.mouse.wheel(0,300);await page.keyboard.up('Shift');await page.waitForTimeout(100);
        assert.equal(await page.evaluate(()=>scrollX),0);
        await page.screenshot({path:`artifacts/desktop-${browser}-${kind}-${width}-${zoom}.png`});
        reports.push({browser,kind,url,width,height,zoom,off,on,status:await extension.status(),authenticated:false,passed:true});
        console.log(`PASS ${browser} ${kind} ${width} zoom ${zoom}: visible native scrollbar, no horizontal scroll, clean player edge, promotions hidden`);
      }
    }
  }finally{await extension.close();}
}
await writeFile('artifacts/desktop-report.json',JSON.stringify({version,runAt:new Date().toISOString(),reports},null,2));
