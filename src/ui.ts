import { LANGUAGES, t, translate, type MessageKey, type MessageParams } from './i18n';
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
  private statusMessage = '';
  private statusKey?: MessageKey;
  private statusParams?: MessageParams;
  private saveKey?: 'saved' | 'saveFailed';
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
      <section class="panel" ${popup ? '' : 'role="dialog" aria-modal="false"'} aria-label="沉浸光感设置" data-i18n-aria="settingsLabel">
        <header><h1 data-i18n="settings">光感设置</h1><select class="language" name="language" data-i18n-aria="language" aria-label="语言">${Object.entries(LANGUAGES).map(([value, label]) => '<option value="'+value+'" lang="'+value+'">'+label+'</option>').join('')}</select>${popup ? '' : '<button class="close" type="button" aria-label="关闭设置" data-i18n-aria="closeSettings">×</button>'}</header>
        <div class="status" hidden><span id="status" role="status"></span></div>
        <form>
          <label class="master"><span><strong data-i18n="enabled">沉浸光感</strong><small data-i18n="enabledHint">开启会屏蔽部分广告和活动等</small></span><input aria-label="沉浸光感" data-i18n-aria="enabled" name="enabled" type="checkbox" role="switch"></label>
          <label class="slider"><span><span data-i18n="transparency">透明度</span> <output data-output="transparency"></output></span><input aria-label="透明度" data-i18n-aria="transparency" name="transparency" type="range" min="0" max="100" step="1"></label>
          <label class="slider"><span><span data-i18n="spread">扩散范围</span> <output data-output="spread"></output></span><input aria-label="扩散范围" data-i18n-aria="spread" name="spread" type="range" min="0" max="200" step="1"></label>
          <label class="select-row"><span data-i18n="projection">扩散方向</span><select aria-label="扩散方向" data-i18n-aria="projection" name="projection"><option value="diagonal" data-i18n="diagonal">斜向扩散</option><option value="straight" data-i18n="straight">直向扩散</option></select></label>
          <label class="slider"><span><span data-i18n="softness">柔和度</span> <output data-output="softness"></output></span><input aria-label="柔和度" data-i18n-aria="softness" name="softness" type="range" min="0" max="100" step="1"></label>
          <label class="select-row"><span data-i18n="theme">外观</span><select aria-label="外观" data-i18n-aria="theme" name="theme"><option value="system" data-i18n="system">跟随系统</option><option value="light" data-i18n="light">浅色玻璃</option><option value="dark" data-i18n="dark">深色沉浸</option></select></label>
          <label class="select-row"><span data-i18n="quality">性能档位</span><select aria-label="性能档位" data-i18n-aria="quality" name="quality"><option value="economy" data-i18n="economy" data-fps="12">省电 · 12 FPS</option><option value="balanced" data-i18n="balanced" data-fps="24">均衡 · 24 FPS</option><option value="fine" data-i18n="fine" data-fps="30">细腻 · 30 FPS</option></select></label>
        </form>
        <footer><button id="reset" type="button" data-i18n="reset">恢复默认</button><button id="donate" type="button" aria-expanded="false" aria-controls="donation-options" aria-haspopup="dialog"><span aria-hidden="true">♥</span> <b data-i18n="donate">打赏支持</b></button></footer>
        <span id="saved" class="save-status" role="status" aria-live="polite"></span>
        <p class="privacy"><span aria-hidden="true">◌</span> <span data-i18n="privacy">视频帧在本机处理 · 无上传 · 无遥测</span></p>
      </section>`;
    this.status = this.root.querySelector('#status')!;
    this.live = this.root.querySelector('#saved')!;
    this.donation = new DonationPopover(this.root,this.root.querySelector<HTMLButtonElement>('#donate')!,popup);
    this.root.querySelector('form')!.addEventListener('submit', e => e.preventDefault());
    this.root.addEventListener('change', this.onChange);
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
  setStatus(message: string, state: 'ok' | 'idle' | 'warning' = 'idle', key?: MessageKey, params?: MessageParams): void {
    this.statusMessage = message; this.statusKey = key; this.statusParams = params;
    this.status.textContent = key ? t(this.store.value.language, key, params) : message;
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
      await write; this.saveKey = 'saved'; this.live.classList.remove('error'); this.live.textContent = t(this.store.value.language, this.saveKey);
      clearTimeout(this.savedTimer);
      this.savedTimer = window.setTimeout(() => { this.saveKey = undefined; this.live.textContent = ''; },1800);
    } catch { clearTimeout(this.savedTimer); this.live.classList.add('error'); this.saveKey = 'saveFailed'; this.live.textContent = t(this.store.value.language, this.saveKey); }
  }
  private rangeProgress(input:HTMLInputElement):void {
    input.style.setProperty('--progress',`${Number(input.value)/Number(input.max)*100}%`);
  }
  private render(settings: Settings): void {
    this.host.lang = settings.language;
    translate(this.root, settings.language);
    this.donation.setLanguage(settings.language);
    this.status.textContent = this.statusKey ? t(settings.language, this.statusKey, this.statusParams) : this.statusMessage;
    if (this.saveKey) this.live.textContent = t(settings.language, this.saveKey);
    for (const input of this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select')) {
      const key = input.name as keyof Settings;
      if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(settings[key]);
      else input.value = String(settings[key]);
      input.disabled = key !== 'enabled' && key !== 'language' && !settings.enabled;
      if(input instanceof HTMLInputElement&&input.type==='range')this.rangeProgress(input);
    }
    for (const key of ['transparency','spread','softness'] as const) {
      this.root.querySelector(`[data-output="${key}"]`)!.textContent = `${settings[key]}%`;
    }
  }
}
