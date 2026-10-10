import { PageAdapter } from '../src/adapter';
import { PlaybackController } from '../src/controller';
import { AmbientRenderer } from '../src/renderer';
import { SettingsStore, type Settings, type StorageBackend } from '../src/settings';
import { GlassTheme } from '../src/theme';
import { SettingsPanel } from '../src/ui';

const state = { value: undefined as unknown, listeners:new Set<(raw:unknown)=>void>() };
const backend: StorageBackend = {
  read:async()=>state.value,
  write:async settings=>{state.value=settings;for(const listener of state.listeners)listener(settings);},
  listen:listener=>{state.listeners.add(listener);return()=>state.listeners.delete(listener);},
};
const scope=globalThis as typeof globalThis & {blgTest:unknown};
scope.blgTest={ PageAdapter, PlaybackController, AmbientRenderer, SettingsStore, GlassTheme, SettingsPanel, backend, state };

async function preview(): Promise<void> {
  const testMode=new URLSearchParams(location.search).has('test');
  if(testMode) return;
  const store=new SettingsStore(backend);await store.init();
  const adapter=new PageAdapter(location.pathname.startsWith('/bangumi/')?'bangumi':'video');
  const binding=adapter.findPlayer();if(!binding)return;
  const theme=new GlassTheme();
  const panel=new SettingsPanel(store,true);
  document.querySelector('#preview-settings')?.append(panel.host);
  const controller=new PlaybackController(binding,adapter,status=>panel.setStatus(status.message,status.state));
  store.subscribe((settings:Settings)=>{theme.configure(settings,adapter);controller.configure(settings);});
  document.querySelector('#open-settings')?.addEventListener('click',()=>{
    const dialog=new SettingsPanel(store,false,()=>dialog.dispose(),document.querySelector<HTMLElement>('#open-settings')??undefined);
    dialog.setStatus(controller.status.message,controller.status.state);document.body.append(dialog.host);dialog.position();dialog.focus();
  });
}
void preview();
