import { extensionContext } from './extension-context.mjs';
import { readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const reports=[];
for(const browser of ['chrome','edge']) {
  let extension;
  try {
    extension=await extensionContext(browser);
    const {context,popup}=extension;
    await popup.evaluate(async()=>chrome.storage.local.set({'biliLiquidGlass.settings':{version:1,enabled:true,ambient:false,glass:true,brightness:100,glassOpacity:5,spread:100,softness:0,theme:'light',quality:'balanced'}}));
    await context.route('https://www.bilibili.com/**',async route=>{
      const url=new URL(route.request().url());let pathname=url.pathname;
      if(pathname.startsWith('/video/')||pathname.startsWith('/bangumi/play/'))pathname='/tests/fixture.html';
      const file=path.resolve('.'+pathname),root=process.cwd();
      if(!file.startsWith(root+path.sep))return route.abort();
      try {
        const body=await readFile(file);const type=path.extname(file)==='.js'?'application/javascript':path.extname(file)==='.css'?'text/css':'text/html';
        await route.fulfill({status:200,body,contentType:type});
      }catch {await route.fulfill({status:404,body:''});}
    });
    const page=await context.newPage();await page.goto('https://www.bilibili.com/video/fixture/?test');
    await page.waitForSelector('.blg-player-button');await page.waitForTimeout(500);
    assert.equal(await page.locator('.blg-ambient').count(),1);
    const active=await extension.status();assert.ok(active.diagnostics.frames>0);assert.equal(active.diagnostics.mode,'webgl');
    await page.locator('.blg-player-button').click();await page.getByLabel('外观',{exact:true}).selectOption('light');
    assert.equal(await page.getByRole('switch').count(),1);
    assert.equal(await page.getByRole('slider').count(),3);
    assert.equal(await page.getByText('开启会屏蔽部分广告和活动等',{exact:true}).isVisible(),true);
    assert.equal(await page.getByLabel('透明度',{exact:true}).inputValue(),'95');
    assert.equal(await page.getByText('同时开启氛围光与液态玻璃',{exact:true}).count(),0);
    assert.equal(await page.getByText('让画面里的光，延伸到页面。',{exact:true}).count(),0);
    await page.getByLabel('扩散方向',{exact:true}).selectOption('straight');
    await popup.reload();assert.equal(await popup.getByLabel('扩散方向',{exact:true}).inputValue(),'straight');
    await popup.getByLabel('扩散方向',{exact:true}).selectOption('diagonal');
    await page.waitForTimeout(70);assert.equal(await page.getByLabel('扩散方向',{exact:true}).inputValue(),'diagonal');
    const opacity=()=>page.evaluate(()=>({ambient:Number(document.querySelector('.blg-ambient').style.opacity),glass:Number(document.documentElement.style.getPropertyValue('--blg-opacity'))}));
    for(const [value,light,glass]of [[0,0,1],[50,.5,.5],[100,1,0],[95,.95,.05]]) {
      await page.getByLabel('透明度',{exact:true}).fill(String(value));
      await page.getByLabel('透明度',{exact:true}).dispatchEvent('change');await page.waitForTimeout(70);
      const actual=await opacity();assert.ok(Math.abs(actual.ambient-light)<.001);assert.ok(Math.abs(actual.glass-glass)<.001);
    }
    const stored=await popup.evaluate(async()=>(await chrome.storage.local.get('biliLiquidGlass.settings'))['biliLiquidGlass.settings']);
    assert.equal(stored.version,2);assert.equal(stored.transparency,95);assert.equal(stored.theme,'light');assert.equal(stored.projection,'diagonal');
    for(const key of ['ambient','glass','brightness','glassOpacity'])assert.equal(key in stored,false);
    await page.getByLabel('沉浸光感',{exact:true}).uncheck();await page.waitForTimeout(200);
    assert.equal(await page.locator('.blg-ambient').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.dataset.blgGlass),undefined);
    await page.getByLabel('沉浸光感',{exact:true}).check();await page.getByRole('button',{name:'关闭设置'}).click();
    await page.reload();await page.waitForSelector('.blg-ambient');
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.blgTheme),'light');
    await popup.screenshot({path:`artifacts/settings-${browser}.png`});
    const cdp=await context.newCDPSession(page),exceptions=[];await cdp.send('Runtime.enable');
    cdp.on('Runtime.exceptionThrown',event=>exceptions.push(event.exceptionDetails.exception?.description??event.exceptionDetails.text));
    if(browser==='chrome') {
      const manager=await context.newPage();await manager.goto('chrome://extensions/');
      const devMode=manager.locator('extensions-toolbar cr-toggle');await devMode.waitFor();
      if(!await devMode.evaluate(e=>e.checked))await devMode.click();
      await manager.close();
    }
    // Reload the actual installed MV3 extension while its old content script
    // still owns a playing page, then navigate and reinject the fresh context.
    await popup.evaluate(()=>{setTimeout(()=>chrome.runtime.reload(),0);});
    await page.waitForFunction(()=>!document.querySelector('.blg-ambient'),null,{timeout:6000});
    assert.equal(await page.locator('.blg-player-button').count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.blgGlass),undefined);
    // Wait for the reloaded extension to be ready before navigating the tab;
    // an immediate navigation may finish during the unload/load interval.
    const freshPopup=await context.newPage();
    await freshPopup.goto(`chrome-extension://${extension.id}/popup.html`);
    await freshPopup.locator('.blg-ui-host').waitFor();
    await page.reload();await page.waitForSelector('.blg-ambient');await page.waitForSelector('.blg-player-button');
    assert.deepEqual(exceptions,[],'Reload/navigation must not throw in the retired isolated context');await cdp.detach();
    reports.push({browser,installed:true,extensionId:extension.id,checks:['MV3 manifest loads','isolated content script auto-injects and WebGL renders','v1 settings migrate to schema v2','one master switch and three sliders','transparency 0/50/100/95 controls both effects','projection choice persists and synchronizes popup/player settings','routine status and slogan removed; ad notice beneath switch','actual chrome.storage contains no obsolete fields','master switch removes and restores both effects','storage changes propagate across contexts and survive reload','actual runtime.reload retires the old context, cleans page resources and reinjects without uncaught exceptions'],reloadExceptions:exceptions,passed:true});
    console.log(`PASS actual ${browser==='chrome'?'Chrome for Testing':'Edge'} extension installation, rendering and persistence`);
  } catch(error) {
    reports.push({browser,passed:false,error:String(error)});console.error(`${browser}: ${error}`);
    process.exitCode=1;
  } finally {await extension?.close();}
}
await writeFile('artifacts/extension-report.json',JSON.stringify({runAt:new Date().toISOString(),reports},null,2));
