import {PageAdapter,type PlayerBinding} from './adapter';

/** Resize the existing frame; never crop or replace the media element. */
export class PlayerSizer {
  private root: HTMLElement;
  private marked=new Map<HTMLElement,Map<string,{value:string;priority:string}>>();
  private widthKey='';
  private nativeWidth=0;
  private pageTop: number|null=null;
  private flow: {target:HTMLElement;value:string;priority:string}|null=null;
  constructor(private binding:PlayerBinding) {
    this.root=binding.player.closest<HTMLElement>('#playerWrap,#bilibili-player-wrap')??binding.player;
  }
  update(enabled:boolean,adapter:PageAdapter): void {
    const {video,player}=this.binding;
    if (!enabled || !video.videoWidth || !video.videoHeight || adapter.isFullscreen(player)) { this.clear();return; }
    // A native fixed mini window can arrive before its mode attribute. Remove
    // our width constraint while identifying it, otherwise it looks full-size.
    const fitted=this.root.hasAttribute('data-blg-fit-width');
    if(fitted&&getComputedStyle(player).position==='fixed')this.root.removeAttribute('data-blg-fit-width');
    const mini=adapter.isMini(player);
    if(fitted)this.root.dataset.blgFitWidth='';
    if (mini) {
      if (this.root===player) { this.clear();return; }
      // Keep the main slot's size while native controls move into a fixed window.
      return;
    }
    // Measure the native slot only on layout/mode changes. Reading our fitted
    // width on every update would prevent a capped player from growing again.
    const wide=!!player.closest('[data-screen="wide"],.bpx-state-wide,.bilibili-player-mode-widescreen');
    const key=[window.innerWidth,window.innerHeight,this.root.parentElement?.clientWidth,wide].join(':');
    if(key!==this.widthKey) {
      const fitted=this.root.hasAttribute('data-blg-fit-width');
      this.root.removeAttribute('data-blg-fit-width');
      // Layout width excludes native transition transforms. A scroll-time
      // animation must not become the input for our next permanent size.
      this.nativeWidth=player.offsetWidth;
      if(fitted)this.root.dataset.blgFitWidth='';
      this.widthKey=key;
    }
    // Native wide mode can extend beyond the retained page slot.
    const width=this.nativeWidth;
    if (width<16) return;
    const bar=player.querySelector<HTMLElement>('.bpx-player-sending-area,.bilibili-player-video-sendbar')?.getBoundingClientRect().height??0;
    // The first native scroll can also move the SLOT's sticky ancestor. Even
    // rect.top + scrollY then changes (172 -> 811 in a real first-wheel trace).
    // Capture the normal page origin and only refresh it at the top of the page;
    // never feed scroll-time sticky geometry back into the fitted dimensions.
    if(this.pageTop===null||window.scrollY<1) this.pageTop=Math.max(0,this.root.getBoundingClientRect().top+window.scrollY);
    const top=this.pageTop;
    const available=Math.max(120,window.innerHeight-Math.min(top,window.innerHeight*.4)-bar-16);
    const height=Math.min(width*video.videoHeight/video.videoWidth,available);
    const fittedWidth=height*video.videoWidth/video.videoHeight;
    // Bangumi normal mode overlays player and left column in one grid area.
    // The left column's native padding still assumes 16:9. Reserve the actual
    // fitted frame plus send bar so 4:3 media cannot cover the toolbar below.
    const layout=this.root.closest<HTMLElement>('.plp-layout');
    const left=layout?.querySelector<HTMLElement>(':scope > .plp-left-wrap');
    if(layout&&left) {
      if(this.flow?.target!==layout) {
        this.clearFlow();
        this.flow={target:layout,value:layout.style.getPropertyValue('--blg-player-flow-height'),priority:layout.style.getPropertyPriority('--blg-player-flow-height')};
      }
      layout.dataset.blgPlayerFlow=getComputedStyle(left).gridRow==='player'?'overlay':'stacked';
      const value=`${(height+bar).toFixed(3)}px`;
      if(layout.style.getPropertyValue('--blg-player-flow-height')!==value)layout.style.setProperty('--blg-player-flow-height',value);
    }
    const targets=[this.root];
    const placeholder=this.root.querySelector<HTMLElement>('#bilibili-player-placeholder');if(placeholder)targets.push(placeholder);
    for(const target of targets) {
      if(!this.marked.has(target)) {
        const previous=new Map<string,{value:string;priority:string}>();
        for(const name of ['--blg-video-height','--blg-send-height','--blg-video-width','--blg-player-inset'])previous.set(name,{value:target.style.getPropertyValue(name),priority:target.style.getPropertyPriority(name)});
        this.marked.set(target,previous);target.dataset.blgPlayerSize='';
      }
      for(const [name,value]of [['--blg-video-height',`${height.toFixed(3)}px`],['--blg-send-height',`${bar.toFixed(3)}px`],['--blg-video-width',`${fittedWidth.toFixed(3)}px`],['--blg-player-inset',`${((width-fittedWidth)/2).toFixed(3)}px`]]) {
        if(target.style.getPropertyValue(name)!==value)target.style.setProperty(name,value);
      }
    }
    this.root.dataset.blgFitWidth='';
    if(this.root===player)this.root.dataset.blgSizeDirect='';
  }
  clear():void {
    this.clearFlow();
    for(const [target,previous]of this.marked) {
      delete target.dataset.blgPlayerSize;
      delete target.dataset.blgFitWidth;delete target.dataset.blgSizeDirect;
      for(const [name,{value,priority}]of previous) {
        if(value)target.style.setProperty(name,value,priority);else target.style.removeProperty(name);
      }
    }
    this.marked.clear();
    this.widthKey='';this.nativeWidth=0;
  }
  private clearFlow():void {
    if(!this.flow)return;
    const {target,value,priority}=this.flow;
    delete target.dataset.blgPlayerFlow;
    if(value)target.style.setProperty('--blg-player-flow-height',value,priority);else target.style.removeProperty('--blg-player-flow-height');
    this.flow=null;
  }
}
