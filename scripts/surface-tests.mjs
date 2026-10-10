import { extensionContext } from './extension-context.mjs';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const reports=[];
const version=JSON.parse(await readFile('package.json','utf8')).version;
const settings={enabled:true,transparency:95,spread:100,softness:0,quality:'balanced'};
for(const browser of ['chrome','edge']) {
  const extension=await extensionContext(browser);
  try {
    await extension.settings(settings);
    const page=await extension.context.newPage();
    for(const [kind,url]of [['video','https://www.bilibili.com/video/BV1FtaJ6BEsd/'],['bangumi','https://www.bilibili.com/bangumi/play/ep5881948']]) {
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await page.locator('.bpx-player-collapse .bui-collapse-header').waitFor({state:'attached',timeout:15000});
      await page.locator('.bpx-player-dm-wrap-child').waitFor({state:'attached',timeout:10000});
      if(kind==='video') {
        await page.locator('.bpx-player-video-wrap video').evaluate(async video=>{
          video.muted=true;
          await Promise.race([video.play().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,1000))]);
        });
        // Validate a playing frame, rather than a transparent but idle player.
        let status;
        for(let attempt=0;attempt<40;attempt++) {
          status=await extension.status();if(status?.diagnostics?.frames>=3)break;
          await page.waitForTimeout(250);
        }
        assert.ok(status?.diagnostics?.frames>=3,`${browser}: actual video did not render ambient frames`);
      }
      for(const theme of ['light','dark']) {
        const geometry=()=>page.evaluate(()=>['.bili-header__bar','.bpx-player-container','.bpx-player-sending-bar','#viewbox_report','#arc_toolbar_report','#v_desc','.video-tag-container','.plp-r','.right-container'].flatMap(selector=>{const e=document.querySelector(selector);if(!e)return[];const r=e.getBoundingClientRect();return[{selector,x:r.x,y:r.y+scrollY,width:r.width,height:r.height}];}));
        await extension.settings({theme,enabled:false});await page.waitForTimeout(500);const off=await geometry();
        await extension.settings({theme});await page.waitForTimeout(250);
        await extension.settings({enabled:true});await page.waitForTimeout(500);const on=await geometry();
        for(let i=0;i<off.length;i++)for(const key of ['x','y','width','height']) {
          // Sidebar height changes intentionally when promotional modules hide
          // or the requested 16px content inset wraps recommendation titles.
          // Its position/width and the complete player geometry stay stable.
          if(key==='height'&&['.right-container','.plp-r'].includes(off[i].selector))continue;
          else assert.ok(Math.abs(off[i][key]-on[i][key])<=1,`${browser} ${kind}: ${off[i].selector} ${key} shifted on glass toggle`);
        }
        const styles=await page.evaluate(()=>{
          const inspect=(selector,pseudo=null)=>{const e=document.querySelector(selector);if(!e)return null;const s=getComputedStyle(e,pseudo);return{background:s.backgroundColor,image:s.backgroundImage,radius:s.borderRadius,shadow:s.boxShadow,outline:s.outlineStyle};};
          return{root:inspect('.bpx-player-container'),placeholder:inspect('#bilibili-player-placeholder'),placeholderBottom:inspect('#bilibili-player-placeholder-bottom'),placeholderLeft:inspect('#bilibili-player-placeholder-bottom-left'),placeholderRight:inspect('#bilibili-player-placeholder-bottom-right'),bar:inspect('.bpx-player-sending-area'),barDivider:inspect('.bpx-player-sending-area','::before'),input:inspect('.bpx-player-video-inputbar'),dm:inspect('.bui-collapse-header'),dmDocker:inspect('.bpx-docker-minor'),dmBody:inspect('.bpx-player-dm-wrap-child'),episode:inspect('[class*="EpisodeVirtualList_numberItem__"]'),menu:inspect('[class*="SectionTabs_menu__"]'),expand:inspect('[class*="mediainfo_ellipsis__"]')};
        });
        assert.equal(styles.root.shadow,'none');assert.equal(styles.root.radius,'0px');assert.equal(styles.bar.outline,'none');assert.equal(styles.bar.background,'rgba(0, 0, 0, 0)');assert.equal(styles.dm.background,'rgba(0, 0, 0, 0)');assert.equal(styles.dmBody.background,'rgba(0, 0, 0, 0)');
        assert.equal(styles.dmDocker.background,'rgba(0, 0, 0, 0)');assert.equal(styles.barDivider.background,'rgba(0, 0, 0, 0)');
        assert.match(styles.input.background,/, 0\.05\)$/);
        if(kind==='video') {
          assert.equal(styles.placeholder.shadow,'none');
          for(const key of ['placeholderBottom','placeholderLeft','placeholderRight'])assert.equal(styles[key].background,'rgba(0, 0, 0, 0)');
        }
        if(kind==='bangumi') {
          for(const key of ['episode','menu','expand'])assert.match(styles[key].background,/rgba\(/);
          assert.equal(styles.expand.image,'none');
          const expand=page.locator('[class*="mediainfo_ellipsis__"]');await expand.click();await page.getByText('收起',{exact:true}).waitFor({timeout:3000});await page.getByText('收起',{exact:true}).click();
          const tabs=page.locator('[class*="SectionTabs_expand__"]');await tabs.click();await page.locator('[class*="SectionTabs_menu__"]').waitFor({state:'visible',timeout:3000});await page.mouse.move(0,0);await page.locator('[class*="SectionTabs_menu__"]').waitFor({state:'hidden',timeout:3000});
        }
        await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`artifacts/surfaces-${browser}-${kind}-${theme}.png`});
        reports.push({browser,kind,url,theme,settings:{...settings,theme},authenticated:false,passed:true,styles,geometry:{off,on},status:await extension.status()});console.log(`PASS ${browser} ${kind} ${theme}: transparency 95 / spread 100 / softness 0, clear placeholder/docker/pseudo layers and stable layout`);
      }
    }
  } finally {await extension.close();}
}
await writeFile('artifacts/surface-report.json',JSON.stringify({version,runAt:new Date().toISOString(),reports},null,2));
