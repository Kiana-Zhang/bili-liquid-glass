import { chromium } from 'playwright';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

export async function extensionContext(browser='chrome') {
  const profiles=path.resolve('.test-profiles');await mkdir(profiles,{recursive:true});
  const profile=await mkdtemp(path.join(profiles,browser+'-'));
  const extension=path.resolve('dist',browser);
  let context;
  try {
    // Chrome for Testing retains unpacked command-line loading. Official Chrome
    // no longer accepts this flag; its rendering is tested separately.
    context=await chromium.launchPersistentContext(profile,{
      channel:browser==='edge'?'msedge':'chromium',headless:true,
      viewport:{width:1440,height:1000},colorScheme:'dark',
      ignoreDefaultArgs:['--disable-extensions','--hide-scrollbars'],
      args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],
    });
    const manager=await context.newPage();await manager.goto(browser==='edge'?'edge://extensions/':'chrome://extensions/');
    const item=manager.locator(browser==='edge'?'extension-card':'extensions-item').filter({hasText:'Bili Liquid Glass'});
    await item.waitFor({state:'attached',timeout:10000});
    const id=browser==='edge'?await item.evaluate(e=>e.data?.id??e._data?.id):await item.getAttribute('id');
    if(!id)throw new Error('Unable to discover installed extension ID');
    await manager.close();
    const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.locator('.blg-ui-host').waitFor();
    const settings=async patch=>{
      await popup.evaluate(async patch=>{
        const key='biliLiquidGlass.settings',stored=(await chrome.storage.local.get(key))[key]??{};
        await chrome.storage.local.set({[key]:{...stored,...patch,version:2}});
      },patch);
    };
    const status=async()=>popup.evaluate(async()=>{
      for(const tab of await chrome.tabs.query({})) {
        try {const result=await chrome.tabs.sendMessage(tab.id,{type:'BLG_STATUS'});if(result?.diagnostics)return{tabId:tab.id,...result};}catch{}
      }
      return null;
    });
    return {context,popup,id,settings,status,close:async()=>{
      await context.close();
      if(path.dirname(profile)!==profiles)throw new Error('Invalid test profile cleanup');
      await rm(profile,{recursive:true,force:true,maxRetries:3});
    }};
  } catch(error) {
    await context?.close();
    if(path.dirname(profile)===profiles)await rm(profile,{recursive:true,force:true,maxRetries:3});
    throw error;
  }
}
