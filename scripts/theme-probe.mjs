import { extensionContext } from './extension-context.mjs';
import { writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const reports=[];
for (const browser of ['chrome','edge']) {
  const extension=await extensionContext(browser);
  try {
    const page=await extension.context.newPage();
    await page.goto('https://www.bilibili.com/video/BV1GJ411x7h7/',{waitUntil:'domcontentloaded'});
    await page.locator('bili-comments').scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector('bili-comments')?.shadowRoot?.querySelector('bili-comment-box')?.shadowRoot?.querySelector('#editor'),null,{timeout:15000});
    for (const theme of ['light','dark']) {
      await extension.settings({theme});await page.waitForTimeout(450);
      const fields=await page.evaluate(()=>{
        const comments=document.querySelector('bili-comments'),box=comments.shadowRoot.querySelector('bili-comment-box'),editor=box.shadowRoot.querySelector('#editor');
        const inspect=e=>{const s=getComputedStyle(e);return{background:s.backgroundColor,border:s.borderColor,radius:s.borderRadius,padding:s.padding,blur:s.backdropFilter};};
        return{opaqueSending:[...document.querySelectorAll('.bpx-player-sending-bar *')].filter(e=>/^rgb\(/.test(getComputedStyle(e).backgroundColor)).map(e=>({class:e.className,background:getComputedStyle(e).backgroundColor})),search:inspect(document.querySelector('#nav-searchform')),bar:inspect(document.querySelector('.bpx-player-sending-bar')),editor:inspect(editor),comments:inspect(comments),styled:box.hasAttribute('data-blg-comments')};
      });
      assert.match(fields.search.background,/rgba\(/);assert.match(fields.editor.background,/rgba\(/);
      assert.equal(fields.bar.background,'rgba(0, 0, 0, 0)');assert.equal(fields.editor.radius,'10px');assert.equal(fields.editor.blur,'none');assert.ok(fields.styled);
      assert.ok(!fields.opaqueSending.some(e=>e.class.includes('bpx-player-video-inputbar')||e.class.includes('bpx-player-video-preview-emoji-wrap')));
      await page.screenshot({path:`artifacts/theme-${browser}-${theme}-comments.png`});
      await page.evaluate(()=>window.scrollTo(0,0));await page.waitForTimeout(200);
      await page.screenshot({path:`artifacts/theme-${browser}-${theme}-video.png`});
      await page.locator('bili-comments').scrollIntoViewIfNeeded();
      reports.push({browser,theme,passed:true,fields});console.log(`PASS ${browser} ${theme}: live translucent search, sending bar and nested comment editor`);
    }
  } finally { await extension.close(); }
}
await writeFile('artifacts/theme-report.json',JSON.stringify({runAt:new Date().toISOString(),reports},null,2));
