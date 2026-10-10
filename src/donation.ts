import qrcode from 'qrcode-generator';

const DONATION = {
  alipay: 'https://qr.alipay.com/fkx139599r7p33uofsallfa?0&T=58744-10-24 06:29:28',
  wechat: 'wxp://f2f0T8_Y_uEvBlr6K2MjzP9SSWOlRT48xtqmy-hzNGEzfK4',
  kofi: 'https://ko-fi.com/yanami_annna',
} as const;

// PayPal's vector mark, bundled locally; opening the popover never fetches it.
// Source: https://www.paypalobjects.com/paypal-ui/logos/svg/paypal-mark-color.svg
const PAYPAL_MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="PayPal">
  <path fill="#002991" d="M38.914 13.35c0 5.574-5.144 12.15-12.927 12.15H18.49l-.368 2.322L16.373 39H7.056l5.605-36h15.095c5.083 0 9.082 2.833 10.555 6.77a9.687 9.687 0 0 1 .603 3.58z"/>
  <path fill="#60CDFF" d="M44.284 23.7A12.894 12.894 0 0 1 31.53 34.5h-5.206L24.157 48H14.89l1.483-9 1.75-11.178.367-2.322h7.497c7.773 0 12.927-6.576 12.927-12.15 3.825 1.974 6.055 5.963 5.37 10.35z"/>
  <path fill="#008CFF" d="M38.914 13.35C37.31 12.511 35.365 12 33.248 12h-12.64L18.49 25.5h7.497c7.773 0 12.927-6.576 12.927-12.15z"/>
</svg>`;

// Only the supplied ASCII payment payload is encoded. Four white modules form
// the quiet zone; no remote images, center logo, or rounding of QR modules.
function paymentQr(payload: string, label: string): SVGSVGElement {
  const qr = qrcode(0, 'M'); qr.addData(payload, 'Byte'); qr.make();
  const n = qr.getModuleCount(), size = n + 8, ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label);
  const white = document.createElementNS(ns, 'rect');
  white.setAttribute('width', String(size)); white.setAttribute('height', String(size)); white.setAttribute('fill', '#fff');
  const path = document.createElementNS(ns, 'path'); let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (qr.isDark(y, x)) d += `M${x+4} ${y+4}h1v1h-1z`;
  }
  path.setAttribute('d', d); path.setAttribute('fill', '#000'); svg.append(white, path);
  return svg;
}

export class DonationPopover {
  private layer = document.createElement('section');
  private abort = new AbortController();
  private observer: ResizeObserver;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pinned = false;
  private generated = false;
  private popupWidths: {element: HTMLElement; value: string; priority: string}[] = [];
  constructor(private root: ShadowRoot, private trigger: HTMLButtonElement, private popup: boolean) {
    this.layer.className = 'donation-popover'; this.layer.id = 'donation-options'; this.layer.hidden = true;
    this.layer.setAttribute('role', 'dialog'); this.layer.setAttribute('aria-label', '打赏方式');
    this.layer.setAttribute('aria-modal', 'false');
    this.layer.innerHTML = `<div class="donation-heading"><span>感谢你的支持 <span aria-hidden="true">♥</span></span><button type="button" class="donation-close" aria-label="关闭打赏">×</button></div>
      <div class="donation-columns">
        <div class="payment-card alipay"><strong>支付宝</strong><div class="payment-qr" data-payment="alipay"></div><small>支付宝扫一扫</small></div>
        <div class="payment-card wechat"><strong>微信</strong><div class="payment-qr" data-payment="wechat"></div><small>微信扫一扫</small></div>
        <div class="payment-card kofi"><strong>Ko-fi</strong><a class="payment-qr paypal-link" href="${DONATION.kofi}" target="_blank" rel="noopener noreferrer" aria-label="前往打赏">${PAYPAL_MARK}</a><small>点击前往打赏 ↗</small></div>
      </div>`;
    root.append(this.layer);
    const options = {signal:this.abort.signal};
    trigger.addEventListener('pointerenter', () => this.open(), options);
    trigger.addEventListener('pointerleave', () => this.scheduleClose(), options);
    this.layer.addEventListener('pointerenter', () => clearTimeout(this.timer), options);
    this.layer.addEventListener('pointerleave', () => this.scheduleClose(), options);
    trigger.addEventListener('click', () => {
      if (this.pinned) this.close(); else { this.pinned = true; this.open(); }
    }, options);
    trigger.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.pinned = true; this.open(); this.layer.querySelector<HTMLAnchorElement>('a')!.focus({preventScroll:true}); }
    }, options);
    this.layer.querySelector('button')!.addEventListener('click', () => this.close(true), options);
    root.addEventListener('focusout', () => this.scheduleClose(), options);
    document.addEventListener('pointerdown', e => {
      if (!e.composedPath().includes(trigger) && !e.composedPath().includes(this.layer)) this.close();
    }, options);
    window.addEventListener('resize', this.position, options);
    window.addEventListener('scroll', this.position, {...options,capture:true,passive:true});
    this.observer = new ResizeObserver(this.position);
    this.observer.observe(root.querySelector('.panel')!); this.observer.observe(this.layer);
  }
  get isOpen(): boolean { return !this.layer.hidden; }
  private open(): void {
    clearTimeout(this.timer);
    if (this.isOpen) return;
    if (!this.generated) {
      for (const key of ['alipay','wechat'] as const) this.layer.querySelector(`[data-payment="${key}"]`)!.append(paymentQr(DONATION[key], key === 'alipay' ? '支付宝收款二维码' : '微信收款二维码'));
      this.generated = true;
    }
    if (this.popup) {
      this.popupWidths = [document.documentElement,document.body].map(element => ({element,value:element.style.getPropertyValue('width'),priority:element.style.getPropertyPriority('width')}));
      for (const {element} of this.popupWidths) element.style.width = `${Math.min(476,screen.availWidth-16)}px`;
    }
    this.layer.hidden = false; this.trigger.setAttribute('aria-expanded', 'true'); this.position();
  }
  close(restoreFocus = false): void {
    clearTimeout(this.timer); this.pinned = false;
    this.layer.hidden = true; this.trigger.setAttribute('aria-expanded', 'false');
    for (const {element,value,priority} of this.popupWidths) {
      if (value) element.style.setProperty('width',value,priority); else element.style.removeProperty('width');
    }
    this.popupWidths = [];
    if (restoreFocus) this.trigger.focus({preventScroll:true});
  }
  private scheduleClose(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.pinned && !this.layer.matches(':hover') && !this.trigger.matches(':hover') && !this.layer.contains(this.root.activeElement)) this.close();
    }, 200);
  }
  position = (): void => {
    if (!this.isOpen) return;
    const a = this.trigger.getBoundingClientRect();
    const width = this.popup ? document.body.clientWidth : document.documentElement.clientWidth;
    const height = window.innerHeight;
    if (a.bottom < 8 || a.top > height-8) { this.close(); return; }
    this.layer.style.width = `${Math.min(460,width-16)}px`;
    this.layer.style.maxHeight = `${Math.max(80,height-16)}px`;
    const w = this.layer.offsetWidth, h = this.layer.offsetHeight;
    this.layer.style.left = `${Math.max(8,Math.min(width-w-8,a.right-w))}px`;
    this.layer.style.top = `${Math.max(8,Math.min(height-h-8,a.top-h-8>=8 ? a.top-h-8 : a.bottom+8))}px`;
  };
  dispose(): void { this.close(); this.abort.abort(); this.observer.disconnect(); this.layer.remove(); }
}
