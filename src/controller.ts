import { t, type MessageKey, type MessageParams } from './i18n';
import { PageAdapter, type PlayerBinding } from './adapter';
import { effectLayout, effectVisibility, fittedVideoRect, type Rect } from './geometry';
import { AmbientRenderer } from './renderer';
import { AdaptiveQuality, FrameGate } from './scheduler';
import { DEFAULTS, PRESETS, type Settings } from './settings';
import { PlayerSizer } from './player-size';

export interface PlayerStatus { message: string; state: 'ok' | 'idle' | 'warning'; key?: MessageKey; params?: MessageParams }
export interface Diagnostics {
  mode: string; frames: number; averageDrawMs: number; quality: string;
  sample: [number, number]; buffer: [number, number]; scheduled: boolean;
}
export class PlaybackController {
  private renderer: AmbientRenderer | null = null;
  private settings: Settings = { ...DEFAULTS };
  private gate = new FrameGate();
  private adaptive = new AdaptiveQuality('balanced');
  private videoRequest: number | null = null;
  private rafRequest: number | null = null;
  private layoutRequest: number | null = null;
  private buffering = false;
  private blocked = false;
  private abort = new AbortController();
  private resize: ResizeObserver;
  private intersection: IntersectionObserver;
  private classes: MutationObserver;
  private frames = 0;
  private totalDrawMs = 0;
  private lastDropCheck = 0;
  private dropped = 0;
  private decoded = 0;
  private lastStatus = '';
  private disposed = false;
  private geometrySignature = '';
  private viewportWeight = 1;
  private mini = false;
  private scrollMini = false;
  private pageVideo: Rect | null = null;
  private sizer: PlayerSizer;
  status: PlayerStatus = { message:t(DEFAULTS.language, 'waitingVideo'),state:'idle',key:'waitingVideo' };

  constructor(readonly binding: PlayerBinding, private adapter: PageAdapter, private onStatus: (status: PlayerStatus) => void) {
    this.sizer=new PlayerSizer(binding);
    const signal = this.abort.signal, video = binding.video;
    const on = (target: EventTarget, event: string, listener: EventListener) => target.addEventListener(event,listener,{signal});
    on(video,'playing',() => { this.buffering=false; this.gate.reset(); this.renderer?.configure(this.settings,this.adaptive.current); this.sync(); });
    on(video,'canplay',() => { this.buffering=false; this.sync(); });
    on(video,'play',() => this.sync());
    on(video,'pause',() => { this.cancelFrames(); this.adaptive.reset(this.settings.quality); this.sync(); });
    on(video,'ended',() => { this.cancelFrames(); this.adaptive.reset(this.settings.quality); this.sync(); });
    on(video,'waiting',() => { this.buffering=true; this.cancelFrames(); this.sync(); });
    on(video,'seeking',() => { this.cancelFrames(); });
    on(video,'seeked',() => { this.buffering=false; this.redraw(); this.sync(); });
    for (const event of ['loadedmetadata','loadeddata','emptied','loadstart']) {
      on(video,event,() => {
        this.blocked=false; this.buffering=false; this.renderer?.resetSource(); this.gate.reset();
        this.adaptive.reset(this.settings.quality); this.renderer?.configure(this.settings);
        this.lastDropCheck=0; this.configure(this.settings);
      });
    }
    on(video,'enterpictureinpicture',() => this.sync());
    on(video,'leavepictureinpicture',() => { this.queueLayout(); this.sync(); });
    on(document,'visibilitychange',() => { this.queueLayout(); this.sync(); });
    on(document,'fullscreenchange',() => { this.queueLayout(); this.sync(); });
    on(window,'resize',() => this.queueLayout());
    on(window,'scroll',() => this.queueLayout());
    on(video,'resize',() => this.queueLayout());
    this.resize = new ResizeObserver(() => this.queueLayout());
    this.resize.observe(video); this.resize.observe(binding.player);
    // Intersection of the video is only a geometry hint. The halo itself can
    // remain visible after the complete video has left the viewport.
    this.intersection = new IntersectionObserver(() => this.queueLayout());
    this.intersection.observe(video);
    this.classes = new MutationObserver(() => this.queueLayout());
    this.classes.observe(binding.player,{attributes:true,attributeFilter:['class','style','data-screen']});
  }

  configure(settings: Settings): void {
    const changedQuality = this.settings.quality !== settings.quality;
    this.settings = settings;
    if (this.status.key) this.report(this.status.key, this.status.state, this.status.params);
    if (changedQuality) this.adaptive.reset(settings.quality);
    if (settings.enabled) {
      if (!this.renderer && !this.blocked) {
        try { this.renderer = new AmbientRenderer(settings,notice=>this.report(notice,'warning')); this.renderer.bindAnchor(this.binding.video); }
        catch (e) { this.fail(e); }
      }
      this.renderer?.configure(settings,this.adaptive.current);
      this.updateLayout(); this.redraw();
    } else {
      this.cancelFrames(); this.renderer?.dispose(); this.renderer=null;this.sizer.clear();
    }
    this.sync();
  }
  refresh(adapter: PageAdapter): void { this.adapter=adapter; this.queueLayout(); this.sync(); }
  diagnostics(): Diagnostics {
    return {
      mode:this.renderer?.mode ?? (this.blocked?'blocked':'off'), frames:this.frames,
      averageDrawMs:this.frames?this.totalDrawMs/this.frames:0, quality:this.adaptive.current,
      sample:[this.renderer?.sample.width??0,this.renderer?.sample.height??0],
      buffer:[this.renderer?.canvas.width??0,this.renderer?.canvas.height??0],
      scheduled:this.videoRequest!==null || this.rafRequest!==null,
    };
  }
  dispose(): void {
    this.disposed=true; this.cancelFrames();
    if (this.layoutRequest!==null) cancelAnimationFrame(this.layoutRequest);
    this.abort.abort(); this.resize.disconnect(); this.intersection.disconnect(); this.classes.disconnect();
    this.renderer?.dispose(); this.renderer=null;
    this.sizer.clear();
  }
  private visible(): boolean {
    return !document.hidden && this.viewportWeight>0 && !document.pictureInPictureElement && (!this.mini || this.scrollMini);
  }
  private runnable(): boolean {
    const v=this.binding.video;
    return !this.disposed && !!this.renderer && !this.blocked && this.settings.enabled && this.visible() && !this.mini
      && !v.paused && !v.ended && !v.seeking && !this.buffering && v.readyState>=2;
  }
  private sync(): void {
    if (this.disposed) return;
    this.renderer?.show(this.visible() && !this.blocked && this.settings.enabled,this.viewportWeight);
    if (this.runnable()) this.schedule(); else this.cancelFrames();
    if (this.blocked) return;
    if (!this.settings.enabled) this.report('disabled','idle');
    else if (!this.visible()) this.report('sleeping','idle');
    else if (this.mini) this.report('mini','idle');
    else if (this.binding.video.readyState<2) this.report('waitingVideo','idle');
    else if (this.buffering) this.report('buffering','idle');
    else if (this.binding.video.paused || this.binding.video.ended) this.report('paused','idle');
    else this.report('running','ok',{ quality: this.adaptive.current, mode: this.renderer?.mode ?? 'webgl' });
  }
  private schedule(): void {
    if (this.videoRequest!==null || this.rafRequest!==null) return;
    const v=this.binding.video;
    if (typeof v.requestVideoFrameCallback==='function') {
      this.videoRequest=v.requestVideoFrameCallback(now=>{ this.videoRequest=null; this.tick(now); });
    } else this.rafRequest=requestAnimationFrame(now=>{ this.rafRequest=null; this.tick(now); });
  }
  private tick(now: number): void {
    if (!this.runnable()) return;
    const fps=this.renderer?.mode==='canvas'?12:PRESETS[this.adaptive.current].fps;
    if (this.gate.accept(now,fps)) this.draw(now);
    if (this.runnable()) this.schedule();
  }
  private redraw(): void {
    if (this.renderer && !this.blocked && this.visible() && !this.mini && this.binding.video.readyState>=2 && !this.binding.video.seeking) this.draw(performance.now());
  }
  private draw(now: number): void {
    const renderer=this.renderer; if (!renderer) return;
    try {
      const start=performance.now(); renderer.draw(this.binding.video,now);
      const cost=performance.now()-start; this.frames++; this.totalDrawMs+=cost;
      let changed=this.adaptive.sample(cost);
      if (now-this.lastDropCheck>5000) {
        const quality=this.binding.video.getVideoPlaybackQuality?.();
        if (quality && this.lastDropCheck) {
          const total=quality.totalVideoFrames-this.decoded, dropped=quality.droppedVideoFrames-this.dropped;
          if (total>=60 && dropped/total>0.02) changed=this.adaptive.downgrade() || changed;
        }
        this.lastDropCheck=now; this.decoded=quality?.totalVideoFrames??0; this.dropped=quality?.droppedVideoFrames??0;
      }
      if (changed) { renderer.configure(this.settings,this.adaptive.current); this.report('downgraded','ok',{ quality: this.adaptive.current }); }
    } catch (error) { this.fail(error); }
  }
  private fail(error: unknown): void {
    this.blocked=true; this.cancelFrames(); this.renderer?.dispose(); this.renderer=null;
    const security=error instanceof DOMException && error.name==='SecurityError';
    this.report(security?'protectedVideo':'effectFailed','warning');
  }
  private cancelFrames(): void {
    if (this.videoRequest!==null) { this.binding.video.cancelVideoFrameCallback?.(this.videoRequest); this.videoRequest=null; }
    if (this.rafRequest!==null) { cancelAnimationFrame(this.rafRequest); this.rafRequest=null; }
  }
  private queueLayout(): void {
    if (this.disposed || document.hidden || this.layoutRequest!==null) return;
    this.layoutRequest=requestAnimationFrame(()=>{ this.layoutRequest=null; this.updateLayout(); });
  }
  private updateLayout(): void {
    if (!this.renderer) return;
    this.sizer.update(this.settings.enabled,this.adapter);
    const v=this.binding.video, box=v.getBoundingClientRect(), computed=getComputedStyle(v);
    const rect: Rect={x:box.x,y:box.y,width:box.width,height:box.height};
    let video=fittedVideoRect(rect,v.videoWidth,v.videoHeight,computed.objectFit,computed.objectPosition);
    const fullscreen=this.adapter.isFullscreen(this.binding.player);
    const parent=document.fullscreenElement??document.body;
    this.renderer.mount(parent);
    const full=document.fullscreenElement?.getBoundingClientRect();
    const viewport: Rect=full?{x:full.x,y:full.y,width:full.width,height:full.height}:{x:0,y:0,width:document.documentElement.clientWidth,height:document.documentElement.clientHeight};
    const mini=this.adapter.isMini(this.binding.player);
    if (mini && this.pageVideo) {
      const saved={...this.pageVideo,x:this.pageVideo.x-scrollX,y:this.pageVideo.y-scrollY};
      if (!this.mini) this.scrollMini=saved.y+saved.height<=viewport.y || saved.y>=viewport.y+viewport.height;
      // Keep the last main-player frame and its original sampling dimensions.
      // Moving/resizing the source into the mini player must not clear the halo.
      video=saved;
    } else if (!mini) {
      // Preserve the normal page origin before a sticky/mini transition.
      // Bilibili can move the ancestor while still reporting "normal" for a
      // frame. That transient position must not become the frozen halo origin.
      if(!fullscreen) this.pageVideo={...video,
        x:this.pageVideo&&scrollY>0?this.pageVideo.x:video.x+scrollX,
        y:this.pageVideo&&scrollY>0?this.pageVideo.y:video.y+scrollY};
      this.scrollMini=false;
    }
    this.mini=mini;
    const layout=effectLayout(video,viewport,this.settings.spread,fullscreen);
    this.viewportWeight=effectVisibility(layout.outer,viewport);
    const signature=[...Object.values(layout.outer),...Object.values(layout.video),fullscreen].join(',');
    const changed=signature!==this.geometrySignature; this.geometrySignature=signature;
    // Native CSS anchors track scrolling and sticky transitions. On browsers
    // without anchors, scroll/resize events provide the same bounded viewport.
    this.renderer.position(layout);
    this.renderer.show(this.visible() && video.width>0 && video.height>0 && !this.blocked,this.viewportWeight);
    if ((v.paused || this.buffering) && changed) this.redraw();
    // Resume frame requests when scrolling back into the halo, even while the
    // source video is still fully outside the viewport.
    this.sync();
  }
  private report(messageKey: MessageKey,state: PlayerStatus['state'], params?: MessageParams): void {
    const message = t(this.settings.language, messageKey, params);
    const key=`${state}:${message}`; if (key===this.lastStatus) return;
    this.lastStatus=key; this.status={message,state,key:messageKey,params}; this.onStatus(this.status);
  }
}
