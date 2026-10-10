import uiCss from './ui.css';
import { DonationPopover } from './donation';
import { type Settings, type SettingsStore } from './settings';

export class SettingsPanel {
  readonly host = document.createElement('div');
  readonly root: ShadowRoot;
  private unsubscribe: () => void;
  private savedTimer: number | undefined;
  private status: HTMLElement;
  private live: HTMLElement;
  private onClose: ((restoreFocus?:boolean) => void) | undefined;
  private abort=new AbortController();
  private resize:ResizeObserver|null=null;
  private donation: DonationPopover;
  constructor(private store: SettingsStore, popup = false, onClose?: (restoreFocus?:boolean) => void, private anchor?:HTMLElement) {
    this.onClose = onClose;
    this.host.className = 'blg-ui-host';
    this.host.dataset.popup = String(popup);
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.innerHTML = `<style>${uiCss}</style>
      <section class="panel" ${popup ? '' : 'role="dialog" aria-modal="false"'} aria-label="沉浸光感设置">
        <header><h1>光感设置</h1>${popup ? '' : '<button class="close" type="button" aria-label="关闭设置">×</button>'}</header>
        <div class="status" hidden><span id="status" role="status"></span></div>
        <form>
          <label class="master"><span><strong>沉浸光感</strong><small>开启会屏蔽部分广告和活动等</small></span><input aria-label="沉浸光感" name="enabled" type="checkbox" role="switch"></label>
          <label class="slider"><span>透明度 <output data-output="transparency"></output></span><input aria-label="透明度" name="transparency" type="range" min="0" max="100" step="1"></label>
          <label class="slider"><span>扩散范围 <output data-output="spread"></output></span><input aria-label="扩散范围" name="spread" type="range" min="0" max="200" step="1"></label>
          <label class="select-row"><span>扩散方向</span><select aria-label="扩散方向" name="projection"><option value="diagonal">斜向扩散</option><option value="straight">直向扩散</option></select></label>
          <label class="slider"><span>柔和度 <output data-output="softness"></output></span><input aria-label="柔和度" name="softness" type="range" min="0" max="100" step="1"></label>
          <label class="select-row"><span>外观</span><select aria-label="外观" name="theme"><option value="system">跟随系统</option><option value="light">浅色玻璃</option><option value="dark">深色沉浸</option></select></label>
          <label class="select-row"><span>性能档位</span><select aria-label="性能档位" name="quality"><option value="economy">省电 · 12 FPS</option><option value="balanced">均衡 · 24 FPS</option><option value="fine">细腻 · 30 FPS</option></select></label>
        </form>
        <footer><button id="reset" type="button">恢复默认</button><button id="donate" type="button" aria-expanded="false" aria-controls="donation-options" aria-haspopup="dialog"><span aria-hidden="true">♥</span> 打赏支持</button></footer>
        <span id="saved" class="save-status" role="status" aria-live="polite"></span>
        <p class="privacy"><span aria-hidden="true">◌</span> 视频帧在本机处理 · 无上传 · 无遥测</p>
      </section>`;
    this.status = this.root.querySelector('#status')!;
    this.live = this.root.querySelector('#saved')!;
    this.donation = new DonationPopover(this.root,this.root.querySelector<HTMLButtonElement>('#donate')!,popup);
    this.root.querySelector('form')!.addEventListener('submit', e => e.preventDefault());
    this.root.querySelector('form')!.addEventListener('change', this.onChange);
    this.root.querySelector('form')!.addEventListener('input', e => {
      const input = e.target as HTMLInputElement;
      if (input.type === 'range') {
        const output = this.root.querySelector(`[data-output="${input.name}"]`);
        if (output) output.textContent = `${input.value}%`;
        this.rangeProgress(input);
      }
    });
    this.root.querySelector('#reset')!.addEventListener('click', () => { void this.persist(this.store.reset()); });
    this.root.querySelector('.close')?.addEventListener('click', () => this.onClose?.());
    this.root.addEventListener('keydown', this.onKeydown);
    this.unsubscribe = store.subscribe(settings => this.render(settings));
    if(!popup) {
      const options={signal:this.abort.signal};
      window.addEventListener('resize',this.position,options);
      window.addEventListener('scroll',this.position,{...options,capture:true,passive:true});
      document.addEventListener('pointerdown',event=>{
        if(!event.composedPath().includes(this.host)&&!event.composedPath().includes(this.anchor!))this.onClose?.(false);
      },options);
      this.resize=new ResizeObserver(this.position);
      this.resize.observe(this.root.querySelector('.panel')!);if(anchor)this.resize.observe(anchor);
    }
  }
  setStatus(message: string, state: 'ok' | 'idle' | 'warning' = 'idle'): void {
    this.status.textContent = message;
    // Keep actionable failures; routine playback/pause descriptions add noise.
    (this.root.querySelector('.status') as HTMLElement).hidden = state !== 'warning';
  }
  focus(): void { this.root.querySelector<HTMLInputElement>('input')?.focus({preventScroll:true}); }
  position=():void=>{
    if(!this.anchor||!this.host.isConnected)return;
    const a=this.anchor.getBoundingClientRect(),panel=this.root.querySelector<HTMLElement>('.panel')!;
    const vw=document.documentElement.clientWidth,vh=window.innerHeight,gap=10;
    if(a.bottom<0||a.top>vh||!this.anchor.isConnected){this.onClose?.(false);return;}
    const above=a.top-gap-8,below=vh-a.bottom-gap-8;
    const up=above>=Math.min(380,below);
    panel.style.maxHeight=`${Math.max(80,up?above:below)}px`;
    const p=panel.getBoundingClientRect();
    this.host.style.left=`${Math.max(8,Math.min(vw-p.width-8,a.x+a.width/2-p.width/2))}px`;
    this.host.style.top=`${Math.max(8,up?a.top-gap-p.height:a.bottom+gap)}px`;
    this.donation.position();
  };
  dispose(): void {
    clearTimeout(this.savedTimer); this.unsubscribe();
    this.donation.dispose();
    this.abort.abort();this.resize?.disconnect();
    this.host.remove();
  }
  private onKeydown = (event: Event): void => {
    const e = event as KeyboardEvent;
    if (e.key === 'Escape') { e.preventDefault();e.stopPropagation();if(this.donation.isOpen)this.donation.close(true);else this.onClose?.(); }
  };
  private onChange = (event: Event): void => {
    const input = event.target as HTMLInputElement | HTMLSelectElement;
    if (!input.name) return;
    const value = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked
      : input instanceof HTMLInputElement && input.type === 'range' ? Number(input.value) : input.value;
    void this.persist(this.store.update({ [input.name]: value }));
  };
  private async persist(write: Promise<void>): Promise<void> {
    try {
      await write; this.live.classList.remove('error'); this.live.textContent = '已保存';
      clearTimeout(this.savedTimer);
      this.savedTimer = window.setTimeout(() => { this.live.textContent = ''; },1800);
    } catch { clearTimeout(this.savedTimer); this.live.classList.add('error'); this.live.textContent = '保存失败，请重新打开设置'; }
  }
  private rangeProgress(input:HTMLInputElement):void {
    input.style.setProperty('--progress',`${Number(input.value)/Number(input.max)*100}%`);
  }
  private render(settings: Settings): void {
    for (const input of this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select')) {
      const key = input.name as keyof Settings;
      if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(settings[key]);
      else input.value = String(settings[key]);
      input.disabled = key !== 'enabled' && !settings.enabled;
      if(input instanceof HTMLInputElement&&input.type==='range')this.rangeProgress(input);
    }
    for (const key of ['transparency','spread','softness'] as const) {
      this.root.querySelector(`[data-output="${key}"]`)!.textContent = `${settings[key]}%`;
    }
  }
}
