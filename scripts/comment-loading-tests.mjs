import {extensionContext} from './extension-context.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const reports=[];
for(const browser of ['chrome','edge']){const e=await extensionContext(browser);try{
 await e.settings({enabled:true,transparency:95,spread:100,softness:0,theme:'light'});
 const p=await e.context.newPage();await p.goto('https://www.bilibili.com/video/BV11apP6jEzH/',{waitUntil:'domcontentloaded'});await p.locator('.blg-ambient').waitFor({state:'attached'});await p.waitForTimeout(4000);await p.evaluate(()=>scrollTo(0,1300));const replies=p.locator('bili-comment-replies-renderer').first();await replies.waitFor({state:'attached'});
 await p.waitForFunction(()=>document.querySelector('bili-comments')?.hasAttribute('data-blg-comments'));
 // Guest login walls prevent actual expansion. Recreate only the native loading
 // node in the live component, using its real adopted stylesheet, not a fixture.
 const on=await replies.evaluate(async el=>{const root=el.shadowRoot;const native=[...root.adoptedStyleSheets].flatMap(s=>[...s.cssRules]).find(r=>r.selectorText==='#spinner')?.cssText;
 const mask=document.createElement('div');mask.id='spinner';mask.innerHTML='<span>正在玩命加载…</span>';root.querySelector('#expander-contents').append(mask);
 return await new Promise(ok=>requestAnimationFrame(()=>{const s=getComputedStyle(mask);ok({native,background:s.backgroundColor,display:s.display,pointer:s.pointerEvents});}));});
 assert.match(on.native,/bg1_rgb/);assert.equal(on.background,'rgba(0, 0, 0, 0)');assert.equal(on.display,'flex');assert.equal(on.pointer,'auto');
 await e.settings({enabled:false});await p.waitForFunction(()=>!document.documentElement.hasAttribute('data-blg-glass'));
 const off=await replies.evaluate(el=>{const mask=el.shadowRoot.querySelector('#spinner');const background=getComputedStyle(mask).backgroundColor;mask.remove();return background});assert.notEqual(off,'rgba(0, 0, 0, 0)');
 reports.push({browser,passed:true,on,off,limitation:'Guest login wall prevents actual click expansion; native loading node recreated in real component.'});console.log('PASS '+browser+': live native reply loading mask first frame and disable restore');
}finally{await e.close()}}
await writeFile('artifacts/comment-loading-report.json',JSON.stringify({version:JSON.parse(await readFile('package.json','utf8')).version,runAt:new Date().toISOString(),reports},null,2));
