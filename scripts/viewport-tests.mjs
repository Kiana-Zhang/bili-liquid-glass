import {extensionContext} from './extension-context.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const reports=[],version=JSON.parse(await readFile('package.json','utf8')).version;
for(const browser of ['chrome','edge']) {
  const e=await extensionContext(browser);
  try {
    await e.settings({enabled:true,transparency:95,spread:100,softness:0,theme:'light'});
    const p=await e.context.newPage();
    for(const bv of ['BV13eH46nESy','BV14Zad6XEV8']) {
      await p.goto(`https://www.bilibili.com/video/${bv}/`,{waitUntil:'domcontentloaded'});
      await p.waitForFunction(()=>document.querySelector('.bpx-player-video-wrap video')?.readyState>=2);
      await p.locator('.blg-player-button').waitFor();
      const inspect=()=>p.evaluate(()=>{
        const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}};
        const v=document.querySelector('.bpx-player-video-wrap video'),pl=v.closest('.bpx-player-container');
        const b=document.querySelector('.blg-player-button'),n=document.querySelector('.bpx-player-ctrl-quality-result-name');
        const text=el=>{if(!el)return null;const range=document.createRange();range.selectNodeContents(el);const s=getComputedStyle(el);return{...rect(range),size:s.fontSize,line:s.lineHeight,family:s.fontFamily}};
        const layer=document.querySelector('.blg-readable');
        return{video:rect(v),player:rect(pl),column:rect(document.querySelector('.left-container')),media:[v.videoWidth,v.videoHeight],fit:getComputedStyle(v).objectFit,
          bar:document.querySelector('.bpx-player-sending-area')?.getBoundingClientRect().height??0,
          sidebar:rect(document.querySelector('.right-container')),header:rect(document.querySelector('.bili-header__bar')),
          button:text(b),native:text(n),height:innerHeight,width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,
          protection:document.documentElement.style.getPropertyValue('--blg-text-protection'),shadow:getComputedStyle(document.querySelector('.up-info-container')).textShadow,
          backing:layer?{count:layer.querySelectorAll('rect:not([display="none"])').length,opacity:Number(layer.querySelector('g').getAttribute('opacity')),bounds:rect(layer)}:null};
      });
      const assertFit=s=>{
        assert.ok(s.player.bottom<=s.height-15,JSON.stringify(s));
        assert.ok(Math.abs(s.video.width/s.video.height-s.media[0]/s.media[1])<.003,'Frame must match the media ratio, with no added black side bars');
        assert.ok(Math.abs(s.player.width-s.video.width)<1);
        assert.ok(Math.abs(s.player.height-s.video.height-s.bar)<1);assert.equal(s.fit,'contain');
        assert.equal(s.width,s.scrollWidth);
      };
      for(const [width,height]of [[1440,900],[3840,1200],[1440,900]]) {
        await p.setViewportSize({width,height});await p.evaluate(()=>scrollTo(0,0));await p.waitForTimeout(500);
        await e.settings({enabled:false});await p.waitForTimeout(200);const off=await inspect();
        await e.settings({enabled:true});await p.waitForTimeout(300);const on=await inspect();assertFit(on);
        assert.equal(on.column.width,off.column.width);assert.equal(on.column.x,off.column.x);
        assert.ok(Math.abs(on.video.x+on.video.width/2-off.player.x-off.player.width/2)<1,'Center inside the native slot');
        assert.ok(on.sidebar.y-on.header.bottom>=16);
        const fixedHeight=on.player.height;await p.evaluate(()=>scrollTo(0,40));await p.waitForTimeout(150);
        assert.ok(Math.abs((await inspect()).player.height-fixedHeight)<1,'Scrolling must not resize');await p.evaluate(()=>scrollTo(0,0));
        const modes=[];
        for(const [mode,selector]of [['wide','.bpx-player-ctrl-wide'],['web','.bpx-player-ctrl-web'],['full','.bpx-player-ctrl-full']]) {
          await p.locator('.bpx-player-video-area').hover();await p.locator(selector).click();await p.waitForTimeout(350);
          await p.locator('.bpx-player-video-area').hover();await p.waitForTimeout(100);const state=await inspect();
          if(mode==='wide')assertFit(state);
          if(state.native){assert.equal(state.button.size,state.native.size);assert.equal(state.button.line,state.native.line);assert.ok(Math.abs(state.button.y+state.button.height/2-state.native.y-state.native.height/2)<=.6,JSON.stringify(state));}
          modes.push({mode,state});
          if(mode==='full')await p.screenshot({path:`artifacts/viewport-controls-${browser}-${bv}-${width}.png`});
          if(mode==='full')await p.evaluate(()=>document.exitFullscreen());else await p.locator(selector).click({force:true});
          await p.waitForTimeout(250);assertFit(await inspect());
        }
        const palettes=[];
        for(const theme of ['light','dark'])for(const transparency of [60,95,100]) {
          await e.settings({theme,transparency});await p.waitForTimeout(180);const s=await inspect();
          assert.equal(s.protection,'');assert.equal(s.shadow,'none');
          assert.equal(s.backing,null);
          palettes.push({theme,transparency,backing:s.backing,shadow:s.shadow});
        }
        await e.settings({theme:'light',transparency:95});await p.waitForTimeout(150);
        await p.screenshot({path:`artifacts/viewport-${browser}-${bv}-${width}.png`});
        await e.settings({enabled:false});await p.waitForTimeout(150);
        const restored=await inspect();assert.equal(restored.protection,'');assert.equal(restored.backing,null);
        assert.equal(restored.player.width,off.player.width);
        await e.settings({enabled:true});await p.waitForTimeout(150);
        reports.push({browser,bv,width,height,on,off,modes,palettes,restored,authenticated:false,passed:true});
        console.log(`PASS ${browser} ${bv} ${width}: proportional fit, native slot preserved, resize/mode restore, original text without readability layers`);
      }
    }
  }finally{await e.close();}
}
await writeFile('artifacts/viewport-report.json',JSON.stringify({version,runAt:new Date().toISOString(),reports},null,2));
