import { SettingsStore } from './settings';
import { SettingsPanel } from './ui';
import type { PlayerStatus } from './controller';

async function start(): Promise<void> {
  const store=new SettingsStore(); await store.init();
  const panel=new SettingsPanel(store,true); document.body.append(panel.host);
  try {
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.id) throw new Error('No active tab');
    const result=await chrome.tabs.sendMessage(tab.id,{type:'BLG_STATUS'}) as {status:PlayerStatus};
    panel.setStatus(result.status.message,result.status.state);
  } catch { panel.setStatus('请打开 Bilibili 普通视频或番剧观看页','idle'); }
  window.addEventListener('pagehide',()=>{panel.dispose();store.dispose();},{once:true});
}
void start().catch(()=>{document.body.textContent='无法读取设置，请重新打开扩展。';});
