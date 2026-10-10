import {chromium} from 'playwright';
import {startServer} from './server.mjs';
import {pngPixels} from './image-pixels.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=await startServer(),reports=[];
try{for(const channel of ['chrome','msedge']){
 const browser=await chromium.launch({channel,headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1000}});await p.goto(server.url+'/video/fixture/?test');
  await p.waitForFunction(()=>window.blgTest&&document.querySelector('video')?.readyState>=2);
  await p.evaluate(()=>{
   document.querySelector('video').pause();const t=window.blgTest;
   window.toolbarRenderer=new t.AmbientRenderer({version:2,enabled:true,transparency:100,spread:100,softness:0,theme:'light',quality:'balanced',projection:'diagonal'});
   const r=window.toolbarRenderer;r.mount(document.body);r.position({outer:{x:0,y:0,width:1440,height:1000},video:{x:420,y:0,width:600,height:1000},clipped:true});r.draw(document.querySelector('video'),performance.now());r.show(true);
   const bar=document.createElement('div');bar.id='toolbar-probe';bar.className='bpx-player-control-wrap';bar.style.cssText='position:fixed;left:0;right:0;bottom:50px;height:40px;z-index:75';
   for(const x of [100,450,990,1200]){const icon=document.createElement('span');icon.style.cssText=`position:absolute;left:${x}px;top:10px;width:20px;height:20px;background:#b3b3b3`;bar.append(icon);}document.body.append(bar);
  });await p.waitForTimeout(180);
  const bad=pngPixels(await p.screenshot());
  await p.evaluate(()=>document.documentElement.dataset.blgGlass='on');
  const good=pngPixels(await p.screenshot({path:`artifacts/toolbar-compositing-${channel}.png`}));
  const sample=(a,x)=>Array.from(a.pixels.slice(((930)*1440+x)*a.channels,((930)*1440+x)*a.channels+3));
  const wrong=[110,460,1000,1210].map(x=>sample(bad,x)),fixed=[110,460,1000,1210].map(x=>sample(good,x));
  assert.ok(wrong[0].some((v,i)=>Math.abs(v-wrong[1][i])>10),'Reproduce halo tint across video boundary');
  for(const rgb of fixed)for(const v of rgb)assert.ok(Math.abs(v-179)<=1,JSON.stringify({wrong,fixed}));
  await p.evaluate(()=>{document.documentElement.removeAttribute('data-blg-glass');window.toolbarRenderer.dispose();document.querySelector('#toolbar-probe').remove();});
  reports.push({channel,wrong,fixed,passed:true});console.log(`PASS ${channel}: glyph pixels identical across video/black-bar boundary; original z=75 reproduces tint`);
 }finally{await browser.close();}
}}finally{await server.close();}
await writeFile('artifacts/toolbar-report.json',JSON.stringify({version:JSON.parse(await readFile('package.json','utf8')).version,runAt:new Date().toISOString(),reports},null,2));
