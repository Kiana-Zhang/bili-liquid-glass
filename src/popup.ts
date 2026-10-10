import { t, type Language } from './i18n';
import { SettingsStore } from './settings';
import { SettingsPanel } from './ui';
import type { PlayerStatus } from './controller';

let language: Language = 'zh';

async function start(): Promise<void> {
  const store=new SettingsStore(); await store.init();
  store.subscribe(settings => { language = settings.language; document.documentElement.lang = language; });
  const panel=new SettingsPanel(store,true); document.body.append(panel.host);
  try {
    const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
    if (!tab?.id) throw new Error('No active tab');
    const result=await chrome.tabs.sendMessage(tab.id,{type:'BLG_STATUS'}) as {status:PlayerStatus};
    panel.setStatus(result.status.message,result.status.state,result.status.key,result.status.params);
  } catch { panel.setStatus(t(language,'openPage'),'idle','openPage'); }
  window.addEventListener('pagehide',()=>{panel.dispose();store.dispose();},{once:true});
}
void start().catch(()=>{document.body.textContent=t(language,'readFailed');});
