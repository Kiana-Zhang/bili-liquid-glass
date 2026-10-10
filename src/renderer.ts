import { boundedSize, exclusionPolygon, type Layout } from './geometry';
import { PRESETS, type Quality, type Settings } from './settings';

const VERTEX = `attribute vec2 aPosition; varying vec2 vUV;
void main(){ vUV = aPosition * .5 + .5; gl_Position = vec4(aPosition,0.,1.); }`;
const BLUR = `precision mediump float; varying vec2 vUV;
uniform sampler2D uImage; uniform vec2 uStep;
void main(){
  vec4 c = texture2D(uImage,vUV)*.19648255;
  c += (texture2D(uImage,vUV+uStep*1.4117647)+texture2D(uImage,vUV-uStep*1.4117647))*.29690696;
  c += (texture2D(uImage,vUV+uStep*3.2941176)+texture2D(uImage,vUV-uStep*3.2941176))*.09447040;
  c += (texture2D(uImage,vUV+uStep*5.1764706)+texture2D(uImage,vUV-uStep*5.1764706))*.01038136;
  gl_FragColor = c;
}`;
const COMPOSE = `precision mediump float; varying vec2 vUV;
uniform sampler2D uImage; uniform sampler2D uPrevious;
uniform float uMix; uniform float uFade; uniform float uDiagonal; uniform float uSoftness;
uniform vec2 uMin; uniform vec2 uMax;
void main(){
  if(uFade<.5){gl_FragColor=texture2D(uImage,vUV);return;}
  vec2 outside = max(max(uMin-vUV,vUV-uMax),vec2(0.));
  vec2 margin = max(mix(uMin,vec2(1.)-uMax,step(uMax,vUV)),vec2(.001));
  float distance = length(outside/margin);
  vec2 q=(vUV-uMin)/max(uMax-uMin,vec2(.001));
  vec2 ray=q-.5;
  vec2 diagonal=.5+ray/max(1.,max(abs(ray.x),abs(ray.y))*2.);
  vec2 uv=mix(clamp(q,vec2(0.),vec2(1.)),diagonal,uDiagonal);
  // Sample a band of the image, not its last row/column. The band widens
  // outwards so moving edge details dissolve into light without long trails.
  uv=mix(uv,vec2(.5),min(1.,distance)*(.08+uSoftness*.10));
  float radius=.004+min(1.,distance)*(.012+uSoftness*.025);
  vec3 color=texture2D(uImage,uv).rgb*.4;
  color+=(texture2D(uImage,uv+vec2(radius,0.)).rgb+texture2D(uImage,uv-vec2(radius,0.)).rgb)*.15;
  color+=(texture2D(uImage,uv+vec2(0.,radius)).rgb+texture2D(uImage,uv-vec2(0.,radius)).rgb)*.15;
  // Dark light blends into the page sooner than bright colors. Ease its
  // falloff while retaining the same zero-alpha outer boundary. Derive the
  // weight continuously from the already blurred color, without CPU readback.
  float darkness=1.-smoothstep(.02,.18,dot(color,vec3(.2126,.7152,.0722)));
  float fadeDistance=mix(distance,distance*distance,darkness);
  float alpha=1.-smoothstep(0.,1.,fadeDistance);
  vec4 c=vec4(color*alpha,alpha);
  gl_FragColor = mix(texture2D(uPrevious,vUV),c,uMix);
}`;
interface GLState {
  gl: WebGLRenderingContext;
  blur: WebGLProgram;
  compose: WebGLProgram;
  buffer: WebGLBuffer;
  source: WebGLTexture;
  textures: WebGLTexture[];
  targets: WebGLFramebuffer[];
  width: number;
  height: number;
  history: number;
  hasFrame: boolean;
  sourceWidth: number;
  sourceHeight: number;
  locations: Map<WebGLProgram, { position: number; uniforms: Record<string, WebGLUniformLocation | null> }>;
}
let anchorSequence = 0;

export class AmbientRenderer {
  readonly host = document.createElement('div');
  canvas = document.createElement('canvas');
  readonly sample = document.createElement('canvas');
  private sampleContext: CanvasRenderingContext2D;
  private readonly originProbe = document.createElement('canvas');
  private readonly filtered = document.createElement('canvas');
  private readonly projected = document.createElement('canvas');
  private originContext: CanvasRenderingContext2D;
  private glState: GLState | null = null;
  private fallback: CanvasRenderingContext2D | null = null;
  private layout: Layout | null = null;
  private settings: Settings;
  private quality: Quality;
  private checkedOrigin = false;
  private lastDraw = 0;
  private disposed = false;
  private fallbackHasFrame = false;
  private visibility = 1;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private anchor: {target: HTMLElement; name: string; value: string; priority: string; applied: string} | null = null;
  mode: 'webgl' | 'canvas' = 'webgl';

  constructor(settings: Settings, private onNotice: (notice: string) => void = () => {}, forceCanvas = false) {
    this.settings = settings; this.quality = settings.quality;
    this.host.className = 'blg-ambient';
    this.host.setAttribute('aria-hidden', 'true');
    // Anchor visibility must not hide a halo whose source is already offscreen.
    this.host.style.cssText = 'position:fixed;position-visibility:always;pointer-events:none;z-index:0;overflow:hidden;contain:strict;isolation:isolate;transition:opacity 160ms ease-out;';
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;';
    this.host.append(this.canvas);
    const context = this.sample.getContext('2d', { alpha: false });
    if (!context) throw new Error('浏览器无法创建视频采样画布');
    this.sampleContext = context;
    this.originProbe.width=this.originProbe.height=1;
    const probe=this.originProbe.getContext('2d',{alpha:false,willReadFrequently:true});
    if (!probe) throw new Error('浏览器无法创建视频安全性检测画布');
    this.originContext=probe;
    if (!forceCanvas) {
      try { this.glState = this.createGL(); } catch { this.glState = null; }
    }
    if (!this.glState) this.activateFallback();
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
  }

  configure(settings: Settings, quality = settings.quality): void {
    if (this.settings.projection !== settings.projection || this.settings.softness !== settings.softness) {
      if (this.glState) this.glState.hasFrame = false;
      this.fallbackHasFrame = false;
    }
    this.settings = settings; this.quality = quality;
    this.applyOpacity();
    if (this.layout) this.resize();
  }
  mount(parent: Element): void {
    if (this.host.parentElement !== parent) parent.append(this.host);
  }
  bindAnchor(video: HTMLVideoElement): void {
    if (this.anchor || !CSS.supports('top','anchor(top)')) return;
    // Bilibili moves the live player into a fixed mini window on scroll. Its
    // docker preserves the main player's place in the document throughout.
    const target=video.closest<HTMLElement>('.bpx-docker-major')??video;
    const value=target.style.getPropertyValue('anchor-name'),priority=target.style.getPropertyPriority('anchor-name');
    const name=`--blg-video-${++anchorSequence}`,applied=value && value!=='none'?`${value}, ${name}`:name;
    target.style.setProperty('anchor-name',applied,priority);
    this.anchor={target,name,value,priority,applied};
  }
  position(layout: Layout): void {
    this.layout = layout;
    this.host.style.zIndex = layout.clipped ? '100' : '0';
    const { x, y, width, height } = layout.outer;
    // Clip presentation to existing document bounds while keeping the full
    // sampling domain. Absolute anchors share the video's scroll
    // container, avoiding fixed-anchor horizontal compensation during scrolling.
    const viewportWidth=document.documentElement.clientWidth;
    const anchor=this.anchor&&!layout.clipped?this.anchor:null;
    const box=anchor?.target.getBoundingClientRect();
    const anchored=!!anchor&&!!box;
    this.host.style.setProperty('position-anchor',anchor?.name??'auto');
    const offsetX=anchored?scrollX:0;
    const nativeHeight=Math.max(document.body.offsetHeight,document.documentElement.clientHeight);
    const visibleHeight=anchored?Math.max(0,Math.min(height,nativeHeight-y-scrollY)):height;
    const clippedOuter={x:-offsetX,y,width:layout.clipped?width:viewportWidth,height:visibleHeight};
    Object.assign(this.host.style, {
      position:anchored?'absolute':'fixed',left:'0px',
      top:anchored?`calc(anchor(${anchor!.name} top) + ${y-box!.y}px)`:`${y}px`,
      width:`${clippedOuter.width}px`,height:`${visibleHeight}px`,
      // Page mode already puts the opaque player above this layer. Cutting an
      // additional hole at fractional video edges creates an antialiased seam.
      // Fullscreen needs the explicit hole because its halo is above the video.
      clipPath:!layout.clipped&&document.documentElement.dataset.blgGlass==='on'
        ?'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%)'
        :exclusionPolygon({...layout,outer:clippedOuter}),
    });
    Object.assign(this.canvas.style,{
      position:'absolute',top:'0px',width:`${width}px`,height:`${height}px`,
      // Paint containment scopes the canvas away from the external anchor.
      // Only the host uses it; horizontal geometry updates on layout events.
      left:`${x+offsetX}px`,
    });
    this.resize();
  }
  show(visible: boolean, weight = 1): void {
    this.visibility = visible ? weight : 0;
    if (visible) {
      if (this.hideTimer !== null) clearTimeout(this.hideTimer);
      this.hideTimer = null;
      if (this.host.hidden) {
        this.host.style.opacity = '0'; this.host.hidden = false;
        // Establish the transparent starting state once when waking up; no
        // layout read is performed during ordinary frame rendering or scrolling.
        void this.host.offsetWidth;
      }
    } else if (this.hideTimer === null && !this.host.hidden) {
      this.hideTimer = setTimeout(()=>{this.hideTimer=null;this.host.hidden=true;},160);
    }
    this.applyOpacity();
  }
  private applyOpacity(): void { this.host.style.opacity = String(this.settings.transparency / 100 * this.visibility); }

  draw(video: HTMLVideoElement, now: number): void {
    if (this.disposed || !this.layout || video.readyState < 2 || !video.videoWidth) return;
    const [w, h] = boundedSize(video.videoWidth, video.videoHeight, this.mode === 'canvas' ? 128 : PRESETS[this.quality].width);
    if (this.sample.width !== w || this.sample.height !== h) {
      this.sample.width = w; this.sample.height = h; this.checkedOrigin = false;
    }
    this.sampleContext.drawImage(video, 0, 0, w, h);
    // One tiny read per media source checks security restrictions, not every frame.
    if (!this.checkedOrigin) {
      // Keep the frequently-read security probe separate from GPU-bound samples.
      this.originContext.drawImage(this.sample,0,0,1,1);
      this.originContext.getImageData(0, 0, 1, 1);
      this.checkedOrigin = true;
    }
    if (this.glState) this.drawGL(now);
    else if (this.fallback) {
      const ctx = this.fallback;
      const delta = this.lastDraw ? Math.min(1000, now - this.lastDraw) : 1000;
      ctx.globalAlpha = this.fallbackHasFrame ? 1 - Math.exp(-delta / 20) : 1;
      const o=this.layout.outer,v=this.layout.video,cw=this.canvas.width,ch=this.canvas.height;
      if(this.filtered.width!==w||this.filtered.height!==h){this.filtered.width=w;this.filtered.height=h;}
      const filtered=this.filtered.getContext('2d',{alpha:false})!;
      filtered.filter=`blur(${(1.5+this.settings.softness*.045)*w/256}px)`;
      filtered.drawImage(this.sample,0,0);
      filtered.filter='none';
      if(this.projected.width!==cw||this.projected.height!==ch){this.projected.width=cw;this.projected.height=ch;}
      const projected=this.projected.getContext('2d',{alpha:false})!;
      const left=(v.x-o.x)/o.width*cw,right=(v.x+v.width-o.x)/o.width*cw;
      const top=(v.y-o.y)/o.height*ch,bottom=(v.y+v.height-o.y)/o.height*ch;
      if(this.settings.projection==='diagonal') {
        // Nested scaled frames approximate outward rays in the compatibility
        // path. All drawing stays in the bounded 128 px buffer, without reads.
        const vw=right-left,vh=bottom-top,cx=(left+right)/2,cy=(top+bottom)/2;
        const maxScale=Math.max(cx/(vw/2),(cw-cx)/(vw/2),cy/(vh/2),(ch-cy)/(vh/2));
        for(let layer=32;layer>=0;layer--){
          const scale=1+(maxScale-1)*layer/32;
          projected.drawImage(this.filtered,cx-vw*scale/2,cy-vh*scale/2,vw*scale,vh*scale);
        }
      } else {
        const band=Math.max(1,Math.round(w*.025)),vband=Math.max(1,Math.round(h*.025));
        const xs=[[0,band,0,left],[0,w,left,right-left],[w-band,band,right,cw-right]];
        const ys=[[0,vband,0,top],[0,h,top,bottom-top],[h-vband,vband,bottom,ch-bottom]];
        for(const [sx,sw,dx,dw]of xs)for(const [sy,sh,dy,dh]of ys) {
          if(dw>0&&dh>0)projected.drawImage(this.filtered,sx,sy,sw,sh,dx,dy,dw,dh);
        }
      }
      ctx.drawImage(this.projected,0,0);
      this.fallbackHasFrame = true;
    }
    this.lastDraw = now;
  }
  resetSource(): void {
    this.checkedOrigin = false; this.lastDraw = 0; this.fallbackHasFrame = false;
    if (this.glState) this.glState.hasFrame = false;
    // Resetting canvas dimensions removes taint from a previous media source.
    this.sample.width = this.sample.width;
    this.originProbe.width=1;
  }
  dispose(): void {
    this.disposed = true;
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.releaseGL(); this.host.remove();
    if (this.anchor) {
      const {target,value,priority,applied,name}=this.anchor;
      const current=target.style.getPropertyValue('anchor-name');
      if (current===applied) {
        if (value) target.style.setProperty('anchor-name',value,priority);
        else target.style.removeProperty('anchor-name');
      } else target.style.setProperty('anchor-name',current.split(',').filter(token=>token.trim()!==name).join(','));
      this.anchor=null;
    }
    this.canvas.width = this.canvas.height = this.sample.width = this.sample.height = 1;
    this.originProbe.width=this.originProbe.height=1;
    this.filtered.width=this.filtered.height=this.projected.width=this.projected.height=1;
  }
  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.releaseGL(); this.activateFallback();
    this.onNotice('GPU 上下文丢失，已切换为省电 Canvas 渲染');
    this.resize();
  };
  private activateFallback(): void {
    // A canvas cannot switch from WebGL to 2D once a context has been created.
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    const next = document.createElement('canvas');
    next.style.cssText = this.canvas.style.cssText;
    next.style.maskComposite = 'intersect';
    this.canvas.replaceWith(next); this.canvas = next;
    this.fallback = next.getContext('2d', { alpha: true });
    if (!this.fallback) throw new Error('浏览器无法创建氛围光画布');
    this.mode = 'canvas'; this.fallbackHasFrame = false;
  }
  private resize(): void {
    if (!this.layout) return;
    const { width, height } = this.layout.outer;
    const max = this.mode === 'canvas' ? 128 : Math.min(512, PRESETS[this.quality].width * 2);
    const [w, h] = boundedSize(width, height, max);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.fallbackHasFrame = false;
    }
    if (this.glState) {
      const s = this.glState;
      if (s.width !== w || s.height !== h) {
        s.width = w; s.height = h; s.hasFrame = false;
        for (const texture of s.textures.slice(2)) {
          s.gl.bindTexture(s.gl.TEXTURE_2D, texture);
          s.gl.texImage2D(s.gl.TEXTURE_2D, 0, s.gl.RGBA, w, h, 0, s.gl.RGBA, s.gl.UNSIGNED_BYTE, null);
        }
      }
    } else {
      this.canvas.style.filter = 'blur(6px)';
      this.canvas.style.transform = '';
      const v=this.layout.video,o=this.layout.outer;
      const left=(v.x-o.x)/o.width*100,right=(v.x+v.width-o.x)/o.width*100;
      const top=(v.y-o.y)/o.height*100,bottom=(v.y+v.height-o.y)/o.height*100;
      this.canvas.style.maskImage=`linear-gradient(to right,transparent,black ${left}%,black ${right}%,transparent),linear-gradient(to bottom,transparent,black ${top}%,black ${bottom}%,transparent)`;
    }
    this.applyOpacity();
  }
  private createGL(): GLState {
    const gl = this.canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL unavailable');
    const programs: WebGLProgram[] = [], textures: WebGLTexture[] = [], targets: WebGLFramebuffer[] = [];
    let buffer: WebGLBuffer | null = null;
    try {
      const program = (fragment: string): WebGLProgram => {
        const p = gl.createProgram(); if (!p) throw new Error('Program allocation failed');
        programs.push(p);
        for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, fragment]] as const) {
          const shader = gl.createShader(type); if (!shader) throw new Error('Shader allocation failed');
          gl.shaderSource(shader, source); gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(message || 'Shader compile failed');
          }
          gl.attachShader(p, shader); gl.deleteShader(shader);
        }
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'Shader link failed');
        return p;
      };
      const blur = program(BLUR), compose = program(COMPOSE);
      buffer = gl.createBuffer(); if (!buffer) throw new Error('Buffer allocation failed');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      for (let i = 0; i < 5; i++) {
        const texture = gl.createTexture(); if (!texture) throw new Error('Texture allocation failed');
        textures.push(texture); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
        if (i > 0) {
          const target = gl.createFramebuffer(); if (!target) throw new Error('Framebuffer allocation failed');
          targets.push(target); gl.bindFramebuffer(gl.FRAMEBUFFER,target);
          gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete framebuffer');
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
      const locations=new Map<WebGLProgram, { position: number; uniforms: Record<string, WebGLUniformLocation | null> }>();
      for (const p of programs) {
        const uniforms: Record<string,WebGLUniformLocation|null>={};
        for (let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++) {
          const info=gl.getActiveUniform(p,i); if (info) uniforms[info.name]=gl.getUniformLocation(p,info.name);
        }
        locations.set(p,{position:gl.getAttribLocation(p,'aPosition'),uniforms});
      }
      return { gl, blur, compose, buffer, source: textures[0], textures: textures.slice(1), targets, width: 0, height: 0, history: 2, hasFrame: false, sourceWidth:0, sourceHeight:0, locations };
    } catch (error) {
      for (const p of programs) gl.deleteProgram(p);
      for (const t of textures) gl.deleteTexture(t);
      for (const f of targets) gl.deleteFramebuffer(f);
      if (buffer) gl.deleteBuffer(buffer);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      throw error;
    }
  }
  private drawGL(now: number): void {
    const s = this.glState!, gl = s.gl, layout = this.layout!;
    gl.viewport(0,0,s.width,s.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,s.source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    if (s.sourceWidth!==this.sample.width || s.sourceHeight!==this.sample.height) {
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.sample);
      s.sourceWidth=this.sample.width; s.sourceHeight=this.sample.height;
      for (const t of s.textures.slice(0,2)) {
        gl.bindTexture(gl.TEXTURE_2D,t);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,s.sourceWidth,s.sourceHeight,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      }
    } else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,this.sample);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    const use = (p: WebGLProgram) => {
      gl.useProgram(p); gl.bindBuffer(gl.ARRAY_BUFFER,s.buffer);
      const position = s.locations.get(p)!.position;
      gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    };
    const texture = (t: WebGLTexture, unit = 0) => { gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D,t); };
    const uniform = (p: WebGLProgram, name: string) => s.locations.get(p)!.uniforms[name];
    use(s.blur);
    gl.uniform1i(uniform(s.blur,'uImage'),0);
    const o = layout.outer, v = layout.video;
    // Blur at media resolution before projection. Increasing spread must not
    // shrink the effective video texture or turn a sparse kernel into ghosts.
    const radius=1+this.settings.softness*.035;
    gl.viewport(0,0,s.sourceWidth,s.sourceHeight);
    for(let pass=0;pass<6;pass++) {
      // A dense first pair fills the gaps before broader pairs. A single
      // large-step blur would stamp several copies of high-contrast edges.
      const step=(pass<2?1:pass<4?Math.max(1,radius*.5):radius)*s.sourceWidth/256;
      texture(pass===0?s.source:s.textures[(pass-1)%2]);
      gl.uniform2f(uniform(s.blur,'uStep'),pass%2?0:step/s.sourceWidth,pass%2?step/s.sourceHeight:0);
      gl.bindFramebuffer(gl.FRAMEBUFFER,s.targets[pass%2]);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    }
    gl.viewport(0,0,s.width,s.height);
    use(s.compose);
    const next = s.history === 2 ? 3 : 2;
    texture(s.textures[1]); texture(s.textures[s.history],1);
    gl.uniform1i(uniform(s.compose,'uImage'),0); gl.uniform1i(uniform(s.compose,'uPrevious'),1);
    gl.uniform1f(uniform(s.compose,'uDiagonal'),this.settings.projection==='diagonal'?1:0);
    gl.uniform1f(uniform(s.compose,'uSoftness'),this.settings.softness/100);
    gl.uniform2f(uniform(s.compose,'uMin'),(v.x-o.x)/o.width,1-(v.y+v.height-o.y)/o.height);
    gl.uniform2f(uniform(s.compose,'uMax'),(v.x+v.width-o.x)/o.width,1-(v.y-o.y)/o.height);
    const delta = this.lastDraw ? Math.min(1000,now-this.lastDraw) : 1000;
    gl.uniform1f(uniform(s.compose,'uMix'),s.hasFrame ? 1-Math.exp(-delta/20) : 1);
    gl.uniform1f(uniform(s.compose,'uFade'),1);
    gl.bindFramebuffer(gl.FRAMEBUFFER,s.targets[next]); gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    texture(s.textures[next]); gl.uniform1f(uniform(s.compose,'uMix'),1); gl.uniform1f(uniform(s.compose,'uFade'),0);
    gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    s.history = next; s.hasFrame = true;
  }
  private releaseGL(): void {
    const s = this.glState; if (!s) return;
    for (const t of [s.source,...s.textures]) s.gl.deleteTexture(t);
    for (const target of s.targets) s.gl.deleteFramebuffer(target);
    s.gl.deleteBuffer(s.buffer); s.gl.deleteProgram(s.blur); s.gl.deleteProgram(s.compose);
    if (!s.gl.isContextLost()) s.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.glState = null;
  }
}
