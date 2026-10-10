export type PageKind = 'video' | 'bangumi';
export interface PlayerBinding {
  video: HTMLVideoElement;
  player: HTMLElement;
  controls: HTMLElement | null;
}
export function pageKind(path = location.pathname): PageKind | null {
  if (/^\/video\/[^/]+/.test(path)) return 'video';
  if (/^\/bangumi\/play\/[^/]+/.test(path)) return 'bangumi';
  return null;
}

const COMMON_REGIONS = [
  '.bili-header__bar', '.international-header .mini-header',
  '.bpx-player-sending-area', '.bilibili-player-video-sendbar',
  'bili-comments', '#comment', '.comment-container',
  '.bili-header .v-popover-content', '.bili-header .bili-header-m',
  '.bili-dialog', '.bili-modal', '.bili-popover', '.van-popover', '.v-popover-content',
  '.bpx-player-dm-setting', '.bpx-player-contextmenu', '.bpx-player-setting-panel',
  '.bpx-player-quality-menu', '.bpx-player-speed-menu',
];
const REGIONS: Record<PageKind, string[]> = {
  video: ['#viewbox_report', '#arc_toolbar_report', '#v_desc', '.video-tag-container',
    '.video-info-container', '.video-toolbar-container', '.video-desc-container',
    '.up-info-container', '.video-page-card-small', '.video-sections-content',
    '.video-pod', '.list-box', '.recommend-list-v1', '.right-container-inner', '.right-container'],
  bangumi: ['.media-info', '.mediainfo_mediaInfo__', '.media-wrapper', '.media-title',
    '.plp-l', '.plp-l > div', '.plp-l > section', '.plp-r', '.ep-list-wrapper', '.ep-list', '.episode-list', '.season-list',
    '.review-module', '.toolbar', '.bangumi-info', '.recommend-list', '.media-info-wrp'],
};

export class PageAdapter {
  constructor(readonly kind: PageKind) {}
  findPlayer(): PlayerBinding | null {
    const candidates = [...document.querySelectorAll<HTMLVideoElement>(
      '.bpx-player-video-wrap video, .bilibili-player-video video, #bilibili-player video, #bilibiliPlayer video, #player_module video',
    )];
    let best: PlayerBinding | null = null, area = 0;
    for (const video of candidates) {
      const player = video.closest<HTMLElement>('.bpx-player-container, .bilibili-player, #bilibili-player, #bilibiliPlayer');
      const rect = video.getBoundingClientRect();
      if (!player || !video.isConnected || rect.width < 16 || rect.height < 16) continue;
      const nextArea = rect.width * rect.height;
      if (nextArea > area) {
        best = { video, player, controls: player.querySelector('.bpx-player-control-bottom-right, .bilibili-player-video-btn') };
        area = nextArea;
      }
    }
    return best;
  }
  glassRegions(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>([...COMMON_REGIONS, ...REGIONS[this.kind]].join(','))];
  }
  isMini(player: HTMLElement): boolean {
    if (player.closest('.bpx-state-miniscreen, .bpx-state-mini, .bilibili-player-mode-miniscreen, .mini-player, .mini-player-window, [data-screen="mini"], [data-screen="miniscreen"]')) return true;
    // Current native scroll mini mode uses inline fixed positioning without
    // any mini class. Only query this on layout events, never per video frame.
    if (this.isFullscreen(player) || getComputedStyle(player).position!=='fixed') return false;
    const box=player.getBoundingClientRect();
    return box.width<=Math.min(640,document.documentElement.clientWidth*.65)
      && box.height<=document.documentElement.clientHeight*.65;
  }
  isFullscreen(player: HTMLElement): boolean {
    return !!document.fullscreenElement || !!player.closest(
      '.bpx-state-web, .bpx-state-web-fullscreen, .bilibili-player-mode-webfullscreen, .bilibili-player-mode-fullscreen, [data-screen="web"], [data-screen="full"]',
    );
  }
}
