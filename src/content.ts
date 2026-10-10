import { PageAdapter, pageKind } from './adapter';
import { PlaybackController, type PlayerStatus } from './controller';
import { SettingsStore } from './settings';
import { GlassTheme } from './theme';
import { SettingsPanel } from './ui';

class ExtensionApp {
  private store=new SettingsStore();
  private theme=new GlassTheme();
  private adapter: PageAdapter|null=null;
  private controller: PlaybackController|null=null;
  private button: HTMLButtonElement|null=null;
  private buttonResize: ResizeObserver|null=null;
  private panel: SettingsPanel|null=null;
  private observer: MutationObserver;
  private timer: number|undefined;
  private routeTimer: number|undefined;
  private route='';
  private unstore: (()=>void)|undefined;
  private status: PlayerStatus={message:'请打开 Bilibili 普通视频或番剧观看页',state:'idle'};
  private abort=new AbortController();
  private disposed=false;
  private messageEvent: typeof chrome.runtime.onMessage | undefined;
  constructor() {
    this.observer=new MutationObserver(records=>{
      if (records.every(r=>(r.target as Element).closest?.('.blg-ui-host,.blg-ambient'))) return;
      this.queueRefresh();
    });
  }
  async start(): Promise<void> {
    if (!this.ensureContext()) return;
    await this.store.init();
    if (this.disposed) { this.store.dispose(); return; }
    if (!this.ensureContext()) return;
    this.unstore=this.store.subscribe(settings=>{
      if (!this.ensureContext()) return;
      this.theme.configure(settings,this.adapter); this.controller?.configure(settings);
    });
    this.observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('popstate',this.queueRefresh,{signal:this.abort.signal});
    window.addEventListener('hashchange',this.queueRefresh,{signal:this.abort.signal});
    document.addEventListener('fullscreenchange',()=>this.closePanel(false),{signal:this.abort.signal});
    document.addEventListener('visibilitychange',()=>{
      this.setRouteTimer(); if (!document.hidden) this.queueRefresh();
    },{signal:this.abort.signal});
    window.addEventListener('pagehide',event=>{
      if (!(event as PageTransitionEvent).persisted) this.dispose();
    },{signal:this.abort.signal});
    this.messageEvent=chrome.runtime.onMessage;
    this.messageEvent.addListener(this.onMessage);
    this.setRouteTimer(); this.refresh();
  }
  private queueRefresh=():void=>{
    if (this.disposed || this.timer!==undefined) return;
    this.timer=window.setTimeout(()=>{this.timer=undefined;this.refresh();},180);
  };
  private setRouteTimer(): void {
    clearInterval(this.routeTimer); this.routeTimer=undefined;
    if (!this.ensureContext()) return;
    if (!document.hidden) this.routeTimer=window.setInterval(()=>{
      if (!this.ensureContext()) return;
      // Isolated scripts can't observe page-world history.pushState directly.
      if (this.route!==location.pathname) this.queueRefresh();
    },1500);
  }
  private refresh(): void {
    if (!this.ensureContext()) return;
    const kind=pageKind(); this.route=location.pathname;
    if (!kind) {
      this.teardownPlayer(); this.adapter=null; this.theme.clear();
      this.setStatus({message:'请打开 Bilibili 普通视频或番剧观看页',state:'idle'}); return;
    }
    if (this.adapter?.kind!==kind) this.adapter=new PageAdapter(kind);
    const adapter=this.adapter!, binding=adapter.findPlayer();
    this.theme.configure(this.store.value,adapter,binding);
    if (!binding) {
      this.teardownPlayer(); this.setStatus({message:'正在等待 Bilibili 播放器',state:'idle'}); return;
    }
    if (this.controller?.binding.video!==binding.video || this.controller.binding.player!==binding.player) {
      this.teardownPlayer(); this.controller=new PlaybackController(binding,adapter,status=>this.setStatus(status));
      this.controller.configure(this.store.value);
    } else this.controller.refresh(adapter);
    if (binding.controls && (!this.button || this.button.parentElement!==binding.controls)) {
      this.buttonResize?.disconnect();
      this.button?.remove();
      this.button=document.createElement('button'); this.button.className='blg-player-button';
      this.button.textContent='✦ 光感'; this.button.type='button'; this.button.title='沉浸光感设置';
      this.button.setAttribute('aria-label','打开沉浸光感设置');
      this.button.setAttribute('aria-haspopup','dialog');this.button.setAttribute('aria-expanded','false');
      this.button.addEventListener('click',event=>{event.stopPropagation();this.openPanel();});
      binding.controls.prepend(this.button);
      this.buttonResize=new ResizeObserver(()=>this.syncButton());
      this.buttonResize.observe(binding.controls);
    }
    this.syncButton();
  }
  private syncButton():void {
    if(!this.ensureContext()||!this.button)return;
    const native=this.button.parentElement?.querySelector<HTMLElement>('.bpx-player-ctrl-quality-result-name,.bpx-player-ctrl-quality-result,.bpx-player-ctrl-playbackrate-result');
    if(!native)return;
    const style=getComputedStyle(native),line=Number.parseFloat(style.lineHeight);
    if(!Number.isFinite(line))return;
    if(this.button.style.font!==style.font)this.button.style.font=style.font;
    const height=`${line+4}px`;
    if(this.button.style.height!==height)this.button.style.height=height;
  }
  private openPanel(): void {
    if (!this.ensureContext()) return;
    if (this.panel) { this.closePanel(); return; }
    this.panel=new SettingsPanel(this.store,false,restoreFocus=>this.closePanel(restoreFocus),this.button??undefined);
    this.panel.setStatus(this.status.message,this.status.state);
    (this.controller?.binding.player??document.fullscreenElement??document.body).append(this.panel.host);
    this.button?.setAttribute('aria-expanded','true');this.panel.position();this.panel.focus();
  }
  private closePanel(restoreFocus=true): void {
    if(!this.panel)return;
    this.panel.dispose();this.panel=null;this.button?.setAttribute('aria-expanded','false');
    if(restoreFocus)this.button?.focus({preventScroll:true});
  }
  private setStatus(status: PlayerStatus): void {
    this.status=status; this.panel?.setStatus(status.message,status.state);
  }
  private teardownPlayer(): void {
    this.buttonResize?.disconnect();this.buttonResize=null;
    this.controller?.dispose(); this.controller=null; this.button?.remove(); this.button=null; this.closePanel(false);
  }
  private onMessage=(message: unknown,_sender: chrome.runtime.MessageSender,reply: (response: unknown)=>void):boolean=>{
    if (message && typeof message==='object' && (message as {type?:string}).type==='BLG_STATUS') {
      reply({status:this.status,diagnostics:this.controller?.diagnostics()??null});
    }
    return false;
  };
  private ensureContext(): boolean {
    if (this.disposed) return false;
    if (!globalThis.chrome?.runtime?.id) { this.dispose(); return false; }
    return true;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed=true;
    this.observer.disconnect(); clearTimeout(this.timer); clearInterval(this.routeTimer);
    this.abort.abort();
    // Reloaded extensions invalidate the old page's chrome namespace. Keep
    // the original event reference, and never let its cleanup block DOM/GPU release.
    try { this.messageEvent?.removeListener(this.onMessage); } catch { /* Context already invalidated. */ }
    this.messageEvent=undefined;
    this.teardownPlayer(); this.unstore?.(); this.store.dispose(); this.theme.dispose();
  }
}

// Reinjection (including development reloads) replaces the previous lifecycle.
const scope=globalThis as typeof globalThis & { __blgApp?: ExtensionApp };
scope.__blgApp?.dispose();
const app=new ExtensionApp(); scope.__blgApp=app;
void app.start().catch(error=>{
  app.dispose();
  if (globalThis.chrome?.runtime?.id) console.warn('[Bili Liquid Glass] 初始化失败，请刷新页面。',error);
});
