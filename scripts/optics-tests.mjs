import {extensionContext} from './extension-context.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const reports=[],version=JSON.parse(await readFile('package.json','utf8')).version;
for(const browser of ['chrome','edge']) {
 const extension=await extensionContext(browser);
 try {
  await extension.settings({enabled:true,transparency:95,spread:100,softness:0,projection:'diagonal',theme:'light',quality:'balanced'});
  const page=await extension.context.newPage();
  await page.goto('https://www.bilibili.com/video/BV19seG6VEnK/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('.bpx-player-video-wrap video')?.readyState>=2,null,{timeout:25000});
  await page.locator('.bpx-player-video-wrap video').evaluate(async v=>{v.muted=true;await v.play()});
  // The target starts with a black fade. Wait for decoded color, not just
  // readyState, so soft/ray snapshots actually exercise a detailed frame.
  await page.waitForFunction(()=>{
   const v=document.querySelector('.bpx-player-video-wrap video');if(v.currentTime<2)return false;
   const c=document.createElement('canvas');c.width=32;c.height=16;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(v,0,0,32,16);
   const rgb=[...ctx.getImageData(0,0,32,16).data].filter((_,i)=>i%4!==3);return Math.max(...rgb)-Math.min(...rgb)>100;
  },null,{polling:500,timeout:15000});
  await page.locator('.bpx-player-video-wrap video').evaluate(v=>v.pause());
  const frame=await page.locator('.bpx-player-video-wrap video').evaluate(v=>{
   const c=document.createElement('canvas');c.width=64;c.height=32;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(v,0,0,64,32);
   const rgb=[...ctx.getImageData(0,0,64,32).data].filter((_,i)=>i%4!==3);return{time:v.currentTime,min:Math.min(...rgb),max:Math.max(...rgb)};
  });assert.ok(frame.max-frame.min>80,'Visual snapshots must contain a decoded nonblank frame');
  const inspect=async()=>{await page.waitForFunction(()=>['.blg-player-button','.bpx-player-ctrl-quality','.bpx-player-video-wrap video','.video-pod .simple-base-item.active'].every(s=>document.querySelector(s)),null,{timeout:15000});return page.evaluate(()=>{
   const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,center:r.y+r.height/2}};
   const button=document.querySelector('.blg-player-button'),native=document.querySelector('.bpx-player-ctrl-quality'),video=document.querySelector('.bpx-player-video-wrap video');
   const row=document.querySelector('.video-pod .simple-base-item.active'),style=getComputedStyle(row);
   const text=el=>{const node=[...el.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());const range=document.createRange();range.selectNodeContents(node??el);const s=getComputedStyle(el);return{...rect(range),size:s.fontSize,family:s.fontFamily,line:s.lineHeight}};
   const up=document.querySelector('.up-info-container'),avatar=up.querySelector('.bili-avatar'),detail=up.querySelector('.up-info--right');
   const header=document.querySelector('.bili-header__bar'),hs=getComputedStyle(header);
   return {button:rect(button),native:rect(native),buttonText:text(button),nativeText:text(native.querySelector('.bpx-player-ctrl-quality-result-name')??native.querySelector('.bpx-player-ctrl-quality-result')),video:rect(video),up:{root:rect(up),avatar:rect(avatar),detail:rect(detail),padding:getComputedStyle(up).padding},header:{corners:[hs.borderTopLeftRadius,hs.borderTopRightRadius,hs.borderBottomLeftRadius,hs.borderBottomRightRadius]},active:{background:style.backgroundColor,shadow:style.boxShadow,weight:getComputedStyle(row.querySelector('.title-txt')).fontWeight,playing:getComputedStyle(row.querySelector('.playing-gif')).display,rect:rect(row)},width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth};
  });};
  for(const width of [1440,3840]) {
   await page.setViewportSize({width,height:1000});
  for(const theme of ['light','dark']) {
   await extension.settings({enabled:false,theme});await page.waitForTimeout(250);const off=await inspect();
   await extension.settings({enabled:true,theme});await page.locator('.bpx-player-video-area').hover();await page.waitForTimeout(250);const on=await inspect();
   assert.ok(Math.abs(on.button.center-on.native.center)<1,JSON.stringify(on));
   assert.equal(on.buttonText.size,on.nativeText.size);assert.equal(on.buttonText.family,on.nativeText.family);assert.equal(on.buttonText.line,on.nativeText.line);
   assert.ok(Math.abs(on.buttonText.center-on.nativeText.center)<=.5,'Text baseline must match the native control');
   assert.ok(Math.abs(on.buttonText.height-on.nativeText.height)<=1,'Text height must match the native control');
   assert.ok(on.video.bottom-on.button.bottom>=8,'Player entry needs bottom breathing room');
   assert.match(on.active.background,/, 0\.16\)$/);assert.equal(on.active.shadow,'none');assert.ok(Number(on.active.weight)>=600);assert.notEqual(on.active.playing,'none');
   assert.equal(on.active.rect.width,off.active.rect.width);assert.equal(on.active.rect.height,off.active.rect.height);assert.equal(on.width,on.scroll);
   assert.equal(on.up.root.width,off.up.root.width);assert.equal(on.up.root.x,off.up.root.x);assert.equal(on.up.padding,'16px');
   assert.ok(on.up.avatar.x-on.up.root.x>=16);assert.ok(on.up.avatar.y-on.up.root.y>=16);
   assert.ok(on.up.root.x+on.up.root.width-on.up.detail.x-on.up.detail.width>=16);
   assert.ok(on.up.detail.y-on.up.root.y>=16);assert.ok(on.up.root.bottom-on.up.detail.bottom>=16);
   assert.ok(on.header.corners.every(v=>v==='0px'),'Header must have four square corners');
   await page.locator('.blg-player-button').click();
   assert.equal(await page.getByText('同时开启氛围光与液态玻璃',{exact:true}).count(),0);
   assert.equal(await page.getByText('让画面里的光，延伸到页面。',{exact:true}).count(),0);
   assert.equal(await page.evaluate(()=>document.querySelector('.blg-ui-host').shadowRoot.querySelector('.status').hidden),true);
   assert.equal(await page.evaluate(()=>document.querySelector('.blg-ui-host').shadowRoot.querySelector('.master small').textContent),'开启会屏蔽部分广告和活动等');
   await page.getByRole('button',{name:'关闭设置',exact:true}).click();
   const visual=[];
   for(const projection of ['straight','diagonal'])for(const softness of [0,65,100]) {
    await extension.settings({projection,softness});await page.waitForTimeout(100);
    await page.mouse.move(1400,950);await page.waitForTimeout(450);
    const file=`artifacts/optics-${browser}-${width}-${theme}-${projection}-${softness}.png`;await page.screenshot({path:file});
    const status=await extension.status();assert.equal(status.diagnostics.mode,'webgl');assert.ok(Math.max(...status.diagnostics.buffer)<=512);visual.push({projection,softness,file,status});
   }
   await page.locator('.bpx-player-video-area').hover();await page.waitForTimeout(100);
   await page.locator('.bpx-player-control-bottom-right').screenshot({path:`artifacts/controls-${browser}-${width}-${theme}.png`});
   reports.push({browser,width,theme,url:page.url(),frame,off,on,visual,authenticated:false,passed:true});console.log(`PASS ${browser} ${width} ${theme}: native text height/baseline, UP insets, square header, active collection without side marker, both projections / softness 0/65/100`);
  }
  }
 }finally{await extension.close()}
}
await writeFile('artifacts/optics-report.json',JSON.stringify({version,runAt:new Date().toISOString(),reports},null,2));
