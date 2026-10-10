import type { PageAdapter, PlayerBinding } from './adapter';
import type { Settings } from './settings';

// A single style sheet per open Bilibili comment root. No per-comment blur.
const COMMENT_CSS = `
:host([data-blg-comments]) { --text1:var(--blg-text); --text2:var(--blg-muted); --text3:var(--blg-muted); --graph_bg_regular:var(--blg-subtle); --bg1:transparent; --bg2:var(--blg-subtle); color:var(--blg-text); }
:host([data-blg-comments]) #app { background:transparent !important; color:var(--blg-text) !important; }
:host([data-blg-comments]) :is(.reply-item,.reply-list,.sub-reply-container,.reply-container,.root-reply-container) { background:transparent !important; }
:host([data-blg-comments]) { --bg3:var(--blg-field); --line_regular:var(--blg-divider); --line_light:var(--blg-divider); --Ga1:var(--blg-border); --graph_weak:var(--blg-border); }
:host(bili-comment-box[data-blg-comments]) #editor { background:var(--blg-field) !important; border-color:var(--blg-border) !important; border-radius:var(--blg-field-radius) !important; }
:host(bili-comment-box[data-blg-comments]) #editor:is(:focus-within,.active) { background:var(--blg-focus) !important; outline:2px solid rgba(64,167,208,.45); outline-offset:1px; }
:host(bili-comment-box[data-blg-comments]) :is(.tool-btn,#pub button) { border-radius:8px; }
:host(bili-comment-thread-renderer[data-blg-comments]) :is(#divider,#separator,.divider,.reply-item) { border-color:var(--blg-divider) !important; }
/* Native reply pagination creates this mask only while fetching. Its background
   uses bg1_rgb, so overriding bg1 alone leaves an opaque white flash. Keep the
   spinner and pointer-blocking mask, but let the existing glass show through. */
:host(bili-comment-replies-renderer[data-blg-comments]) #spinner { background:transparent !important; }
:host([data-blg-comments]) bili-comments-vote-card { display:none !important; }
:host(bili-comments-header-renderer[data-blg-comments]) { display:block; box-sizing:border-box; padding-inline:16px; }
`;
const COMMENT_HOSTS = 'bili-comments, bili-comments-header-renderer, bili-comment-thread-renderer, bili-comment-replies-renderer, bili-comment-box, bili-comment-rich-textarea';
// Information and actions stay flat, retaining Bilibili's original grouping.
const FLAT_REGIONS = '#viewbox_report, #arc_toolbar_report, #v_desc, .video-tag-container, .video-info-container, .video-toolbar-container, .video-desc-container, .media-info, .media-wrapper, .bangumi-info, .media-info-wrp, [class*="mediainfo_mediaInfo__"], .plp-l > .player-left-components > .toolbar, .plp-l > .toolbar';

export class GlassTheme {
  private marked = new Set<HTMLElement>();
  private foreground = new Set<HTMLElement>();
  private players = new Set<HTMLElement>();
  private shadowStyles = new Map<ShadowRoot, HTMLStyleElement>();
  private shadowObservers = new Map<ShadowRoot, MutationObserver>();
  private commentsQueued = false;
  private commentRevision = 0;
  private media = matchMedia('(prefers-color-scheme: dark)');
  private settings: Settings | null = null;
  constructor() { this.media.addEventListener('change',this.applyPalette); }
  configure(settings: Settings, adapter: PageAdapter | null, binding?: PlayerBinding | null): void {
    this.settings = settings;
    if (!adapter || !settings.enabled) {
      this.clear();
      return;
    }
    const root = document.documentElement;
    root.dataset.blgGlass = 'on';
    root.style.setProperty('--blg-opacity',String((100-settings.transparency)/100));
    this.applyPalette();
    this.refresh(adapter,binding);
  }
  refresh(adapter: PageAdapter, binding = adapter.findPlayer()): void {
    if (!this.settings?.enabled) return;
    const allRegions = adapter.glassRegions();
    this.refreshForeground(adapter,binding,allRegions);
    const regions = allRegions.filter(element=>!element.matches(FLAT_REGIONS));
    const mainVideo=binding?.video;
    const containsPlayer=(element:HTMLElement)=>!!mainVideo && element.contains(mainVideo);
    const set = new Set(regions.filter(element=>!containsPlayer(element)));
    // Mark only the outermost matched card so nested matches don't multiply filters.
    for (const element of regions) {
      // A filter on a player ancestor makes fixed web fullscreen relative to
      // that ancestor. Keep player-containing columns out of blur surfaces.
      if (containsPlayer(element)) {
        delete element.dataset.blgCard; this.marked.delete(element); continue;
      }
      let ancestor=element.parentElement, nested=false;
      while (ancestor) { if (set.has(ancestor)) { nested=true; break; } ancestor=ancestor.parentElement; }
      if (nested) {
        delete element.dataset.blgCard; this.marked.delete(element); continue;
      }
      if (!this.marked.has(element)) {
        element.dataset.blgCard = '';
        this.marked.add(element);
      }
    }
    for (const element of [...this.marked]) {
      if (!element.isConnected || !set.has(element)) { delete element.dataset.blgCard; this.marked.delete(element); }
    }
    this.refreshComments();
  }
  private refreshComments(): void {
    if (!this.settings?.enabled) return;
    const visit = (root: Document | ShadowRoot): void => {
      for (const host of root.querySelectorAll<HTMLElement>(COMMENT_HOSTS)) {
        const shadow=host.shadowRoot; if (!shadow) continue;
        if (!this.shadowStyles.has(shadow)) {
          host.dataset.blgComments='';
          const style=document.createElement('style'); style.textContent=COMMENT_CSS;
          shadow.append(style); this.shadowStyles.set(shadow,style);
          const observer=new MutationObserver(this.queueComments);
          observer.observe(shadow,{childList:true,subtree:true}); this.shadowObservers.set(shadow,observer);
        }
        visit(shadow);
      }
    };
    visit(document);
    for (const [shadow,style] of this.shadowStyles) {
      if (!shadow.host.isConnected) {
        delete (shadow.host as HTMLElement).dataset.blgComments;
        this.shadowObservers.get(shadow)?.disconnect(); this.shadowObservers.delete(shadow);
        style.remove(); this.shadowStyles.delete(shadow);
      }
    }
  }
  private queueComments = (): void => {
    if (this.commentsQueued || !this.settings?.enabled) return;
    this.commentsQueued=true;
    const revision=this.commentRevision;
    // Coalesce callbacks from many comment roots, while still styling new
    // reply roots before the next paint (a timer/RAF can allow a white flash).
    queueMicrotask(()=>{
      if (revision!==this.commentRevision) return;
      this.commentsQueued=false; this.refreshComments();
    });
  };
  private refreshForeground(adapter: PageAdapter, binding: PlayerBinding | null, allRegions: HTMLElement[]): void {
    let playerLayer:HTMLElement|null=null;
    if (binding) playerLayer=binding.player.closest<HTMLElement>('.left-container, .plp-l')
      ??binding.player.closest<HTMLElement>('#playerWrap, #player-wrapper, .player-wrap')??binding.player;
    // Current bangumi columns have an additional native stacking wrapper.
    // Keep the player wrapper above the sidebar wrapper in wide/full modes.
    if(adapter.kind==='bangumi'&&playerLayer)playerLayer=playerLayer.closest<HTMLElement>('.plp-l-wrap')??playerLayer;
    for (const element of [...this.players]) {
      if (element===playerLayer) continue;
      delete element.dataset.blgPlayerLayer; delete element.dataset.blgPlayerStatic; this.players.delete(element);
    }
    if (playerLayer && !this.players.has(playerLayer)) {
      if (getComputedStyle(playerLayer).position==='static') playerLayer.dataset.blgPlayerStatic='';
      playerLayer.dataset.blgPlayerLayer=''; this.players.add(playerLayer);
    }
    const regions=new Set(allRegions);
    if(adapter.kind==='bangumi')for(const wrapper of document.querySelectorAll<HTMLElement>('.plp-r-wrap'))regions.add(wrapper);
    for (const element of regions) {
      if (binding && element.contains(binding.video)) {
        delete element.dataset.blgStaticLayer; delete element.dataset.blgAutoLayer;
        this.foreground.delete(element); continue;
      }
      if (this.foreground.has(element)) continue;
      const computed=getComputedStyle(element);
      if (computed.position==='static') element.dataset.blgStaticLayer='';
      else if (computed.zIndex==='auto'||Number(computed.zIndex)<=1) element.dataset.blgAutoLayer='';
      this.foreground.add(element);
    }
    for (const element of [...this.foreground]) {
      if (!element.isConnected || !regions.has(element)) {
        delete element.dataset.blgStaticLayer; delete element.dataset.blgAutoLayer; this.foreground.delete(element);
      }
    }
  }
  private applyPalette = (): void => {
    if (!this.settings?.enabled || !document.documentElement.dataset.blgGlass) return;
    const palette=this.settings.theme === 'system'
      ? (this.media.matches ? 'dark' : 'light') : this.settings.theme;
    document.documentElement.dataset.blgTheme=palette;
  };
  clear(): void {
    this.commentRevision++; this.commentsQueued=false;
    const root = document.documentElement;
    delete root.dataset.blgGlass; delete root.dataset.blgTheme;
    root.style.removeProperty('--blg-opacity');
    for (const element of this.marked) delete element.dataset.blgCard;
    this.marked.clear();
    for (const observer of this.shadowObservers.values()) observer.disconnect();
    this.shadowObservers.clear();
    for (const [shadow, style] of this.shadowStyles) {
      delete (shadow.host as HTMLElement).dataset.blgComments; style.remove();
    }
    this.shadowStyles.clear();
    for (const element of this.foreground) {
      delete element.dataset.blgStaticLayer; delete element.dataset.blgAutoLayer;
    }
    this.foreground.clear();
    for (const element of this.players) {
      delete element.dataset.blgPlayerLayer; delete element.dataset.blgPlayerStatic;
    }
    this.players.clear();
  }
  dispose(): void { this.clear(); this.media.removeEventListener('change',this.applyPalette); }
}
