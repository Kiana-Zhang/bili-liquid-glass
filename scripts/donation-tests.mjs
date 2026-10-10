import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import jsQR from 'jsqr';
import {startServer} from './server.mjs';
import {extensionContext} from './extension-context.mjs';
import {pngPixels} from './image-pixels.mjs';
const expected=['https://qr.alipay.com/fkx139599r7p33uofsallfa?0&T=58744-10-24 06:29:28','wxp://f2f0T8_Y_uEvBlr6K2MjzP9SSWOlRT48xtqmy-hzNGEzfK4'];
const server=await startServer(),reports=[];
async function decode(page,prefix){
 const results=[];
 for(const [i,key] of ['alipay','wechat'].entries()){
  const png=await page.locator(`[data-payment="${key}"] svg`).screenshot({path:`artifacts/donation-${prefix}-${key}.png`});const im=pngPixels(png),rgba=new Uint8ClampedArray(im.width*im.height*4);
  for(let p=0;p<im.width*im.height;p++){for(let c=0;c<3;c++)rgba[p*4+c]=im.pixels[p*im.channels+c];rgba[p*4+3]=255;}
  const code=jsQR(rgba,im.width,im.height);assert.equal(code?.data,expected[i],`${prefix}/${key}: independent screenshot decode`);results.push({key,pixels:[im.width,im.height],payload:code.data});
 }return results;
}
async function bounds(page){return page.locator('.donation-popover').evaluate(e=>{
 const b=e.getBoundingClientRect(),cards=[...e.querySelectorAll('.payment-card')].map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom}});
 return{x:b.x,top:b.y,right:b.right,bottom:b.bottom,width:document.documentElement.clientWidth,height:innerHeight,squares:[...e.querySelectorAll(".payment-qr")].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}}),cards};});}
function inside(b){assert.ok(b.x>=7.5&&b.top>=7.5&&b.right<=b.width-7.5&&b.bottom<=b.height-7.5,JSON.stringify(b));assert.ok(b.cards.every(c=>Math.abs(c.y-b.cards[0].y)<1));assert.equal(b.squares.length,3);for(const s of b.squares){assert.ok(Math.abs(s.width-s.height)<1);assert.ok(Math.abs(s.width-b.squares[0].width)<1);assert.ok(Math.abs(s.y-b.squares[0].y)<1)}assert.ok(b.right-b.x<=461);}
try{for(const name of ['chrome','edge']){
 const browser=await chromium.launch({channel:name==='chrome'?'chrome':'msedge',headless:true});
 try{const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),requests=[],checks=[];
 page.on('request',r=>{if(/qr\.alipay\.com|ko-fi\.com|wxp:/.test(r.url()))requests.push(r.url())});
 await page.goto(server.url+'/video/fixture/?test');await page.waitForFunction(()=>window.blgTest);
 const create=async()=>page.evaluate(async()=>{window.dPanel?.dispose();window.dStore?.dispose();const t=window.blgTest;window.dStore=new t.SettingsStore(t.backend);await window.dStore.init();let a=document.querySelector('#donation-anchor');if(!a){a=document.createElement('button');a.id='donation-anchor';a.textContent='光感';a.style.cssText='position:fixed;bottom:20px;right:60px;z-index:1001';document.body.append(a)}window.dPanel=new t.SettingsPanel(window.dStore,false,()=>window.dPanel.dispose(),a);document.body.append(window.dPanel.host);window.dPanel.position();});
 await create();assert.equal(await page.locator('[data-payment] svg').count(),0,'Lazy generation');
 const trigger=page.getByRole('button',{name:'打赏支持',exact:true}),layer=page.getByRole('dialog',{name:'打赏方式'});
 const videoBefore=await page.locator('video').boundingBox();await trigger.hover();await layer.waitFor();await page.waitForTimeout(200);inside(await bounds(page));const normal=await decode(page,`${name}-normal`);
 await page.getByRole('link',{name:'前往打赏'}).hover();await page.waitForTimeout(300);assert.ok(await layer.isVisible(),'Pointer bridge keeps open');await page.mouse.move(5,5);await page.waitForTimeout(250);assert.ok(!await layer.isVisible(),'Unpinned leave closes');
 await trigger.click();await page.mouse.move(5,5);await page.waitForTimeout(250);assert.ok(await layer.isVisible(),'Click pins');assert.deepEqual(await page.locator('video').boundingBox(),videoBefore);
 await trigger.press('Escape');assert.ok(!await layer.isVisible());assert.equal(await trigger.evaluate(e=>e.getRootNode().activeElement===e),true);assert.equal(await page.locator('.blg-ui-host').count(),1);await trigger.press('Escape');assert.equal(await page.locator('.blg-ui-host').count(),0);checks.push('hover bridge / pin / Escape order / no geometry or scroll change');
 await create();await trigger.press('ArrowDown');await layer.waitFor();assert.ok(await page.getByRole('link',{name:'前往打赏'}).evaluate(e=>e.getRootNode().activeElement===e));await page.locator('#reset').click();assert.ok(!await layer.isVisible());await page.waitForTimeout(30);assert.equal(await trigger.textContent(),'♥ 打赏支持');
 await page.evaluate(()=>{window.blgTest.backend.write=async()=>{throw Error('test storage failure')};});await page.locator('#reset').click();await page.locator('#saved.error').waitFor();assert.equal(await trigger.textContent(),'♥ 打赏支持');await page.evaluate(()=>{window.blgTest.backend.write=async value=>{window.blgTest.state.value=value;};});checks.push('save status / visible failure independent of donation');
 await page.getByLabel('沉浸光感',{exact:true}).uncheck();await trigger.click();await layer.waitFor();assert.ok(await layer.isVisible(),'Disabled effect keeps donation usable');assert.equal(requests.length,0,'Hover does not contact payment services');await page.getByRole('button',{name:'关闭打赏',exact:true}).click();
 const sizes=[];for(const width of [390,320,960]){await page.setViewportSize({width,height:800});await create();await trigger.click();await page.waitForTimeout(180);inside(await bounds(page));sizes.push({width,qr:await decode(page,`${name}-${width}`)});await page.getByRole('button',{name:'关闭打赏',exact:true}).click();}
 await page.emulateMedia({reducedMotion:'reduce'});await trigger.hover();assert.equal(await layer.evaluate(e=>getComputedStyle(e).animationName),'none');await page.getByRole('button',{name:'关闭打赏',exact:true}).click();checks.push('three columns / narrow 320,390,960 / reduced motion / effect off');
 await page.setViewportSize({width:1440,height:1000});await create();await trigger.click();await page.waitForTimeout(180);await page.screenshot({path:`artifacts/donation-${name}-panel.png`});
 await context.route('https://ko-fi.com/**',route=>route.fulfill({status:200,body:'test destination, no payment'}));const opened=context.waitForEvent('page');await page.getByRole('link',{name:'前往打赏'}).click();const target=await opened;await target.waitForLoadState();assert.equal(target.url(),'https://ko-fi.com/yanami_annna');assert.equal(await target.evaluate(()=>window.opener===null),true);await target.close();checks.push('explicit Ko-fi click / exact URL / no opener; request intercepted');
 await context.close();
 const retina=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1.25}),rp=await retina.newPage();await rp.goto(server.url+'/video/fixture/?test');await rp.waitForFunction(()=>window.blgTest);await rp.evaluate(async()=>{const s=new window.blgTest.SettingsStore(window.blgTest.backend);await s.init();const panel=new window.blgTest.SettingsPanel(s,false);document.body.append(panel.host);panel.host.style.cssText='position:fixed;top:300px;left:500px';});await rp.getByRole('button',{name:'打赏支持',exact:true}).hover();await rp.waitForTimeout(180);const scaled=await decode(rp,`${name}-125percent`);await retina.close();checks.push('QR screenshot decoding at 1.25 device scale');
 reports.push({browser:name,type:'local production modules',passed:true,checks,normal,sizes,scaled});console.log(`PASS ${name}: donation interactions, layout, QR screenshot roundtrip, no automatic payment requests`);
 }finally{await browser.close()}
 const e=await extensionContext(name);try{
  const p=e.popup;await p.setViewportSize({width:516,height:600});const before=await p.locator('.panel').boundingBox();await p.getByRole('button',{name:'打赏支持',exact:true}).hover();await p.waitForTimeout(180);inside(await bounds(p));assert.deepEqual(await p.locator('.panel').boundingBox(),before);assert.equal(await p.evaluate(()=>document.body.style.width),await p.evaluate(()=>Math.min(476,screen.availWidth-16)+'px'));const qr=await decode(p,`${name}-popup`);await p.screenshot({path:`artifacts/donation-${name}-popup.png`});await p.getByRole('button',{name:'关闭打赏',exact:true}).click();assert.equal(await p.evaluate(()=>document.body.style.width),'');
  const page=await e.context.newPage();await page.goto('https://www.bilibili.com/video/BV19seG6VEnK/',{waitUntil:'domcontentloaded'});await page.locator('.blg-player-button').waitFor();const modes=[];
  for(const [mode,sel]of [['page',null],['web','.bpx-player-ctrl-web'],['full','.bpx-player-ctrl-full']]){
   await page.locator('.bpx-player-video-area').hover();if(sel){await page.locator(sel).click();await page.waitForTimeout(200)}await page.locator('.bpx-player-video-area').hover();await page.locator('.blg-player-button').click();const donor=page.getByRole('button',{name:'打赏支持',exact:true});await donor.click();await page.waitForTimeout(180);const b=await bounds(page);inside(b);await page.screenshot({path:`artifacts/donation-${name}-${mode}.png`});await donor.press('Escape');assert.equal(await page.locator('.blg-ui-host').count(),1);await donor.press('Escape');assert.equal(await page.locator('.blg-ui-host').count(),0);if(mode==='full'){assert.ok(await page.evaluate(()=>!!document.fullscreenElement));await page.evaluate(()=>document.exitFullscreen())}else if(sel)await page.locator(sel).click({force:true});modes.push({mode,b});
  }reports.push({browser:name,type:'installed MV3 popup and guest Bilibili',passed:true,qr,modes});console.log(`PASS ${name}: extension popup expansion/restore and live page/web/fullscreen`);
 }finally{await e.close()}
}}finally{await server.close();await writeFile('artifacts/donation-report.json',JSON.stringify({version:JSON.parse(await readFile('package.json','utf8')).version,runAt:new Date().toISOString(),reports},null,2));}
