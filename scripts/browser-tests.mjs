import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { startServer } from './server.mjs';
import { pixelDifference } from './image-pixels.mjs';

const root=process.cwd(),host=await startServer();
const crossOrigin=await startServer();
await mkdir(path.join(root,'artifacts'),{recursive:true});
await mkdir(path.join(root,'artifacts/media'),{recursive:true});
const reports=[];
async function run(name,options) {
  const browser=await chromium.launch({headless:true,ignoreDefaultArgs:['--hide-scrollbars'],...options});
  const context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'dark'});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const checks=[];
  const check=async(label,task)=>{await task();checks.push(label);console.log(`  PASS ${label}`);};
  try {
    console.log(`Testing ${name} ${browser.version()}`);
    await page.goto(host.url+'/video/fixture/?test');
    await page.waitForFunction(()=>document.querySelector('video').readyState>=2 && window.blgTest);
    await check('WebGL video output, alpha fade, buffers, and video exclusion',async()=>{
      const result=await page.evaluate(async()=>{
        const t=window.blgTest,store=new t.SettingsStore(t.backend);await store.init();
        const adapter=new t.PageAdapter('video'),binding=adapter.findPlayer();
        const controller=new t.PlaybackController(binding,adapter,()=>{});controller.configure(store.value);
        window.testController=controller;window.testStore=store;
        await new Promise(r=>setTimeout(r,800));
        controller.renderer.draw(binding.video,performance.now());
        const canvas=document.querySelector('.blg-ambient canvas');
        // readPixels is test-only; production never reads back its WebGL output.
        const gl=canvas.getContext('webgl');const pixel=new Uint8Array(4),center=new Uint8Array(4);
        gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
        gl.readPixels(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,center);
        return {diagnostics:controller.diagnostics(),clip:document.querySelector('.blg-ambient').style.clipPath,edge:[...pixel],center:[...center]};
      });
      assert.equal(result.diagnostics.mode,'webgl');assert.ok(result.diagnostics.frames>=4);
      assert.ok(Math.max(...result.diagnostics.buffer)<=512);assert.ok(Math.max(...result.diagnostics.sample)<=256);
      assert.match(result.clip,/evenodd/);assert.ok(result.edge[3]<30);assert.ok(result.center[3]>150);
    });
    await check('pause freezes frame scheduling and resumes without duplicate loops',async()=>{
      await page.evaluate(()=>document.querySelector('video').pause());
      await page.waitForTimeout(150);const before=await page.evaluate(()=>window.testController.diagnostics());
      await page.waitForTimeout(200);const after=await page.evaluate(()=>window.testController.diagnostics());
      assert.equal(before.frames,after.frames);assert.equal(after.scheduled,false);
      await page.evaluate(()=>document.querySelector('video').play());await page.waitForTimeout(200);
      const resumed=await page.evaluate(()=>window.testController.diagnostics());assert.ok(resumed.frames>after.frames);
    });
    await check('intrinsic video resize changes page aspect without cropping and clears sizing on disable',async()=>{
      await page.evaluate(()=>{document.querySelector('#source').height=400;});
      await page.waitForFunction(()=>{const v=document.querySelector('video'),b=v.getBoundingClientRect();return v.videoHeight===400&&Math.abs(b.height-b.width*400/960)<.1;});
      const result=await page.evaluate(()=>{const p=document.querySelector('.bpx-player-container'),v=document.querySelector('video'),before=v.getBoundingClientRect();window.testController.configure({...window.testStore.value,enabled:false});const native=v.getBoundingClientRect();const clean=!document.querySelector('[data-blg-player-size]')&&!p.style.getPropertyValue('--blg-video-height');window.testController.configure(window.testStore.value);return{clean,beforeHeight:before.height,nativeHeight:native.height};});
      assert.equal(result.clean,true);assert.ok(result.nativeHeight>result.beforeHeight+50);
      await page.evaluate(()=>document.querySelector('#source').height=540);
      await page.waitForFunction(()=>{const v=document.querySelector('video'),b=v.getBoundingClientRect();return v.videoHeight===540&&Math.abs(b.height-b.width*540/960)<.1;});
    });
    await check('height-capped 4:3 and portrait frames shrink proportionally and grow again on viewport resize',async()=>{
      await page.setViewportSize({width:1440,height:800});
      await page.evaluate(()=>document.querySelector('#source').height=720);
      await page.waitForFunction(()=>{const v=document.querySelector('video'),b=v.getBoundingClientRect();return v.videoHeight===720&&Math.abs(b.width/b.height-4/3)<.003&&b.bottom<=innerHeight-15;});
      const small=await page.locator('video').evaluate(v=>({width:v.getBoundingClientRect().width,height:v.getBoundingClientRect().height}));
      await page.setViewportSize({width:1680,height:1200});
      await page.waitForFunction(width=>document.querySelector('video').getBoundingClientRect().width>width+40,small.width);
      await page.evaluate(()=>{document.querySelector('#source').width=540;document.querySelector('#source').height=960;});
      await page.waitForFunction(()=>{const v=document.querySelector('video'),b=v.getBoundingClientRect();return v.videoWidth===540&&v.videoHeight===960&&Math.abs(b.width/b.height-540/960)<.003&&b.bottom<=innerHeight-15;});
      await page.setViewportSize({width:1440,height:1000});
      await page.evaluate(()=>{document.querySelector('#source').width=960;document.querySelector('#source').height=540;});
      await page.waitForFunction(()=>{const v=document.querySelector('video'),b=v.getBoundingClientRect();return v.videoWidth===960&&v.videoHeight===540&&Math.abs(b.width/b.height-16/9)<.003;});
    });
    await check('playing halo remains visible after video exit, fades at its own edge and resumes before video re-entry',async()=>{
      const result=await page.evaluate(async()=>{
        const space=document.createElement('div');space.style.height='3000px';document.body.append(space);
        const video=document.querySelector('video'),host=document.querySelector('.blg-ambient'),canvas=host.querySelector('canvas');
        const width=canvas.width,height=canvas.height,bottom=video.getBoundingClientRect().bottom;
        const haloBottom=host.getBoundingClientRect().bottom;
        const start=window.testController.diagnostics().frames,weights=[];let stable=true,shown=true;
        for(const y of [40,80,120,160,bottom+20,haloBottom-120,haloBottom-60]) {
          window.scrollTo(0,y);await new Promise(r=>setTimeout(r,70));
          stable&&=canvas.width===width&&canvas.height===height;shown&&=!host.hidden;weights.push(Number(host.style.opacity));
        }
        const frames=window.testController.diagnostics().frames-start;
        window.scrollTo(0,haloBottom+20);await new Promise(r=>setTimeout(r,220));
        const asleep=!window.testController.diagnostics().scheduled&&host.hidden;
        window.scrollTo(0,haloBottom-60);await new Promise(r=>setTimeout(r,100));const entering=Number(host.style.opacity);
        const haloOnly=video.getBoundingClientRect().bottom<0&&!host.hidden&&window.testController.diagnostics().scheduled;
        window.scrollTo(0,0);await new Promise(r=>setTimeout(r,220));space.remove();
        return{stable,shown,frames,weights,asleep,entering,haloOnly};
      });
      assert.ok(result.stable);assert.ok(result.shown);assert.ok(result.frames>=4);assert.ok(result.asleep);
      assert.ok(result.weights.at(-1)>0&&result.weights.at(-1)<result.weights.at(-2));assert.ok(result.entering>0&&result.entering<0.65);
      assert.ok(result.haloOnly);
    });
    await check('color cuts track the next sampled frame and corner fade is rounded and symmetric',async()=>{
      const result=await page.evaluate(()=>{
        const t=window.blgTest,r=new t.AmbientRenderer(window.testStore.value),source=document.createElement('canvas');source.width=source.height=64;
        Object.assign(source,{readyState:4,videoWidth:64,videoHeight:64});const ctx=source.getContext('2d');
        r.mount(document.body);r.configure(window.testStore.value);r.position({outer:{x:0,y:0,width:800,height:600},video:{x:100,y:100,width:600,height:400},clipped:false});
        ctx.fillStyle='blue';ctx.fillRect(0,0,64,64);r.draw(source,1000);
        ctx.fillStyle='red';ctx.fillRect(0,0,64,64);r.draw(source,1050);
        const gl=r.canvas.getContext('webgl'),read=(x,y)=>{const p=new Uint8Array(4);gl.readPixels(Math.floor(x*r.canvas.width),Math.floor(y*r.canvas.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return[...p];};
        const result={center:read(.5,.5),left:read(.0625,.5),right:read(.9375,.5),corner:read(.0625,.08333)};r.dispose();return result;
      });
      assert.ok(result.center[0]>230&&result.center[2]<25);
      assert.ok(Math.abs(result.left[3]-result.right[3])<8);assert.ok(result.corner[3]>5&&result.corner[3]<result.left[3]-30);
    });
    await check('unequal side margins fade at equal fractions of available screen space',async()=>{
      const result=await page.evaluate(()=>{
        const t=window.blgTest,r=new t.AmbientRenderer({...window.testStore.value,softness:0}),source=document.createElement('canvas');source.width=96;source.height=64;
        Object.defineProperties(source,{readyState:{value:4},videoWidth:{value:96},videoHeight:{value:64}});
        const ctx=source.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,96,64);
        const layout={outer:{x:-86.75,y:-273.5,width:1547,height:1197},video:{x:100,y:100,width:800,height:450},clipped:false};
        r.position(layout);r.draw(source,1000);const gl=r.canvas.getContext('webgl'),read=uv=>{const p=new Uint8Array(4);gl.readPixels(Math.floor(uv*r.canvas.width),Math.floor(r.canvas.height/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return[...p];};
        const left=read((100+86.75)/1547/2),right=read(((900+86.75)/1547+1)/2);r.dispose();return{left,right};
      });
      assert.ok(result.left[3]>90&&result.left[3]<165);assert.ok(Math.abs(result.left[3]-result.right[3])<8);
    });
    await check('dark colors retain more opacity in the outer halo with the same range and continuous fade',async()=>{
      const results=await page.evaluate(()=>{
        const source=document.createElement('canvas');source.width=96;source.height=64;
        Object.assign(source,{readyState:4,videoWidth:96,videoHeight:64});const ctx=source.getContext('2d');
        return ['straight','diagonal'].map(projection=>{
          const r=new window.blgTest.AmbientRenderer({...window.testStore.value,projection,softness:0});
          r.position({outer:{x:0,y:0,width:1000,height:600},video:{x:250,y:100,width:500,height:400},clipped:false});
          const colors={};let time=1000;
          for(const color of ['black','#101018','red','white']) {
            ctx.fillStyle=color;ctx.fillRect(0,0,96,64);r.draw(source,time+=1000);
            const gl=r.canvas.getContext('webgl'),profile=[];
            for(let i=0;i<=20;i++) {
              const p=new Uint8Array(4),x=Math.max(0,Math.floor(.25*(1-i/20)*r.canvas.width));
              gl.readPixels(x,Math.floor(r.canvas.height/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);profile.push([...p]);
            }
            colors[color]=profile;
          }
          r.dispose();return{projection,colors};
        });
      });
      for(const {colors} of results) {
        for(const profile of Object.values(colors)) {
          assert.ok(profile[0][3]>250);assert.ok(profile.at(-1)[3]<=1,'Every color must vanish at the same outer edge');
          for(let i=1;i<profile.length;i++) {
            assert.ok(profile[i][3]<=profile[i-1][3]+1,'Falloff must remain monotonic');
            assert.ok(profile[i-1][3]-profile[i][3]<40,'No opacity steps in the dark tail');
          }
        }
        for(const i of [10,14,16,18]) {
          assert.ok(colors.black[i][3]>colors.red[i][3]*1.4,'Black tail must remain more visible');
          assert.ok(colors['#101018'][i][3]>colors.red[i][3]);
          assert.ok(Math.abs(colors.red[i][3]-colors.white[i][3])<=1,'Bright falloff stays unchanged');
          assert.equal(colors.black[i][0],0,'Black must remain black');
        }
      }
      await writeFile('artifacts/dark-falloff-'+name.toLowerCase()+'.json',JSON.stringify(results,null,2));
    });
    await check('moving edge stripes are spatially damped at every softness and projection without delayed color cuts',async()=>{
      const results=await page.evaluate(()=>{
        const source=document.createElement('canvas');source.width=256;source.height=144;
        Object.assign(source,{readyState:4,videoWidth:256,videoHeight:144});const ctx=source.getContext('2d');
        const results=[];
        for(const projection of ['straight','diagonal'])for(const softness of [0,50,100]) {
          const r=new window.blgTest.AmbientRenderer({...window.testStore.value,projection,softness});
          r.position({outer:{x:0,y:0,width:1200,height:800},video:{x:200,y:180,width:800,height:440},clipped:false});
          const phases=[];
          for(let phase=0;phase<2;phase++) {
            ctx.fillStyle='#808080';ctx.fillRect(0,0,256,144);
            for(let x=0;x<256;x+=4){ctx.fillStyle=(x/4+phase)%2?'white':'black';ctx.fillRect(x,0,4,12);ctx.fillRect(x,132,4,12);}
            r.draw(source,1000+phase*50);
            const gl=r.canvas.getContext('webgl'),pixels=[];
            for(const u of [.3,.4,.5,.6,.7]){
              const p=new Uint8Array(4);gl.readPixels(Math.floor(u*r.canvas.width),Math.floor(.88*r.canvas.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);
              pixels.push(p[0]*255/Math.max(1,p[3]));
            }
            phases.push(pixels);
          }
          const change=Math.max(...phases[0].map((v,i)=>Math.abs(v-phases[1][i])));
          results.push({projection,softness,change});r.dispose();
        }
        return results;
      });
      for(const r of results)assert.ok(r.change<35,JSON.stringify(r));
      await writeFile('artifacts/motion-filter-'+name.toLowerCase()+'.json',JSON.stringify(results,null,2));
    });
    await check('large softness produces one continuous light lobe instead of repeated sharp edge copies',async()=>{
      const profile=await page.evaluate(()=>{
        const source=document.createElement('canvas');source.width=256;source.height=144;
        Object.assign(source,{readyState:4,videoWidth:256,videoHeight:144});const ctx=source.getContext('2d');
        ctx.fillStyle='black';ctx.fillRect(0,0,256,144);ctx.fillStyle='white';ctx.fillRect(126,0,4,144);
        const r=new window.blgTest.AmbientRenderer({...window.testStore.value,projection:'straight',softness:100});
        r.position({outer:{x:0,y:0,width:1200,height:800},video:{x:200,y:180,width:800,height:440},clipped:false});r.draw(source,1000);
        const gl=r.canvas.getContext('webgl'),profile=[];
        for(let x=70;x<=186;x++){
          const p=new Uint8Array(4);gl.readPixels(Math.floor((200+x/256*800)/1200*r.canvas.width),Math.floor(.5*r.canvas.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);profile.push(p[0]);
        }
        r.dispose();return profile;
      });
      const peak=Math.max(...profile),mid=profile.indexOf(peak);
      assert.ok(peak>15&&peak<90);
      for(let i=1;i<mid;i++)assert.ok(profile[i]>=profile[i-1]-2,'Blur lobe must rise continuously');
      for(let i=mid+1;i<profile.length;i++)assert.ok(profile[i]<=profile[i-1]+2,'Blur lobe must fall continuously');
    });
    await check('diagonal projection fans edge colors out along rays and differs from straight extension',async()=>{
      const colors=await page.evaluate(()=>{
        const source=document.createElement('canvas');source.width=256;source.height=144;
        Object.assign(source,{readyState:4,videoWidth:256,videoHeight:144});const ctx=source.getContext('2d');
        ctx.fillStyle='red';ctx.fillRect(0,0,100,144);ctx.fillStyle='blue';ctx.fillRect(100,0,156,144);
        return ['straight','diagonal'].map(projection=>{
          const r=new window.blgTest.AmbientRenderer({...window.testStore.value,projection,softness:0});r.position({outer:{x:0,y:0,width:1200,height:800},video:{x:200,y:180,width:800,height:440},clipped:false});r.draw(source,1000);
          const gl=r.canvas.getContext('webgl'),p=new Uint8Array(4);gl.readPixels(Math.floor(.4*r.canvas.width),Math.floor(.9*r.canvas.height),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);r.dispose();return [...p];
        });
      });
      assert.ok(colors[0][0]>colors[0][2]+30,JSON.stringify(colors));
      assert.ok(colors[1][2]>colors[1][0]+30,JSON.stringify(colors));
    });
    await check('mini player suspends rendering and returns to normal',async()=>{
      await page.evaluate(()=>document.querySelector('.bpx-player-container').classList.add('bpx-state-miniscreen'));
      await page.waitForTimeout(200);const paused=await page.evaluate(()=>window.testController.diagnostics());
      assert.equal(paused.scheduled,false);assert.ok(await page.locator('.blg-ambient').isHidden());
      await page.evaluate(()=>document.querySelector('.bpx-player-container').classList.remove('bpx-state-miniscreen'));
      await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>window.testController.diagnostics().scheduled),true);
    });
    await check('native fixed mini mode freezes the original halo, paints past the offscreen anchor and wakes before the video',async()=>{
      const start=await page.evaluate(async()=>{
        window.testController.dispose();const player=document.querySelector('.bpx-player-container');
        const slot=document.createElement('div');slot.className='bpx-docker-major';slot.id='test-main-slot';slot.style.height=`${player.getBoundingClientRect().height}px`;
        player.before(slot);slot.append(player);const space=document.createElement('div');space.id='mini-scroll-space';space.style.height='3000px';document.body.append(space);
        const t=window.blgTest,adapter=new t.PageAdapter('video'),controller=new t.PlaybackController(adapter.findPlayer(),adapter,()=>{});
        window.testController=controller;controller.configure({...window.testStore.value,transparency:95,spread:100,softness:0});
        await new Promise(r=>setTimeout(r,200));const h=controller.renderer.host;
        return{videoBottom:document.querySelector('video').getBoundingClientRect().bottom,haloBottom:h.getBoundingClientRect().bottom,buffer:[h.firstChild.width,h.firstChild.height]};
      });
      await page.evaluate(y=>scrollTo(0,y),start.videoBottom+80);await page.waitForTimeout(100);
      await page.locator('.bpx-player-container').evaluate(p=>p.style.cssText+='position:fixed;right:20px;bottom:20px;width:320px;height:180px;');await page.waitForTimeout(220);
      const frozen=await page.evaluate(()=>{const c=window.testController,h=c.renderer.host;return{status:c.diagnostics(),bottom:h.getBoundingClientRect().bottom+scrollY,buffer:[h.firstChild.width,h.firstChild.height],hidden:h.hidden,positionVisibility:getComputedStyle(h).getPropertyValue('position-visibility')};});
      assert.equal(frozen.status.scheduled,false);assert.equal(frozen.hidden,false);assert.equal(frozen.positionVisibility,'always');assert.deepEqual(frozen.buffer,start.buffer);assert.ok(Math.abs(frozen.bottom-start.haloBottom)<1);
      const clip={x:2,y:80,width:16,height:100},painted=await page.screenshot({clip});
      await page.locator('.blg-ambient').evaluate(h=>h.style.visibility='hidden');const blank=await page.screenshot({clip});
      await page.locator('.blg-ambient').evaluate(h=>h.style.removeProperty('visibility'));assert.ok(pixelDifference(painted,blank)>1,'A retained halo must paint after the entire anchor scrolls offscreen');
      await page.evaluate(y=>scrollTo(0,y),start.haloBottom+20);await page.waitForTimeout(220);assert.equal(await page.locator('.blg-ambient').evaluate(h=>h.hidden),true);
      await page.evaluate(y=>scrollTo(0,y),start.haloBottom-60);await page.waitForTimeout(220);
      assert.equal(await page.locator('.blg-ambient').evaluate(h=>h.hidden),false);assert.equal(await page.evaluate(()=>window.testController.diagnostics().scheduled),false);
      await page.evaluate(async()=>{const c=window.testController,slot=document.querySelector('#test-main-slot'),p=slot.firstChild;c.dispose();p.style.removeProperty('position');p.style.removeProperty('right');p.style.removeProperty('bottom');p.style.removeProperty('width');p.style.removeProperty('height');slot.before(p);slot.remove();document.querySelector('#mini-scroll-space').remove();scrollTo(0,0);const t=window.blgTest,a=new t.PageAdapter('video');window.testController=new t.PlaybackController(a.findPlayer(),a,()=>{});window.testController.configure(window.testStore.value);await new Promise(r=>setTimeout(r,150));});
      assert.equal(await page.evaluate(()=>window.testController.diagnostics().scheduled),true);
    });
    await check('fully offscreen halo suspends scheduling and visible halo resumes',async()=>{
      await page.evaluate(()=>{const space=document.createElement('div');space.id='scroll-space';space.style.height='3000px';document.body.append(space);window.scrollTo(0,1500);});
      await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>window.testController.diagnostics().scheduled),false);
      await page.evaluate(()=>{window.scrollTo(0,0);document.querySelector('#scroll-space').remove();});
      await page.waitForTimeout(180);assert.equal(await page.evaluate(()=>window.testController.diagnostics().scheduled),true);
    });
    await check('visibility changes stop all frame requests until the page becomes visible',async()=>{
      await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
      assert.equal(await page.evaluate(()=>window.testController.diagnostics().scheduled),false);
      await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});
      await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.testController.diagnostics().scheduled),true);
    });
    await check('web fullscreen and native fullscreen preserve central video exclusion',async()=>{
      await page.locator('#webfull').click();await page.waitForTimeout(200);
      const web=await page.evaluate(()=>({width:document.querySelector('.blg-ambient').getBoundingClientRect().width,viewport:document.documentElement.clientWidth,clip:document.querySelector('.blg-ambient').style.clipPath}));
      assert.equal(web.width,web.viewport);assert.match(web.clip,/evenodd/);
      await page.locator('#webfull').click();await page.locator('#full').click();await page.waitForTimeout(200);
      assert.equal(await page.evaluate(()=>document.querySelector('.blg-ambient').parentElement===document.fullscreenElement),true);
      await page.evaluate(()=>document.exitFullscreen());await page.waitForTimeout(150);
      assert.equal(await page.evaluate(()=>document.querySelector('.blg-ambient').parentElement===document.body),true);
    });
    await check('theme applies once per outer region, follows system, and clears shadow styles',async()=>{
      const result=await page.evaluate(()=>{
        const t=window.blgTest,theme=new t.GlassTheme(),host=document.createElement('bili-comments');
        const shadow=host.attachShadow({mode:'open'});shadow.innerHTML='<div id="app">评论</div>';document.body.append(host);
        theme.configure(window.testStore.value,new t.PageAdapter('video'));
        const applied={theme:document.documentElement.dataset.blgTheme,shadow:!!shadow.querySelector('style'),nested:!!document.querySelector('[data-blg-card] [data-blg-card]')};
        theme.clear();const cleared={root:document.documentElement.dataset.blgGlass,marked:document.querySelectorAll('[data-blg-card]').length,shadow:shadow.querySelectorAll('style').length};
        theme.dispose();host.remove();return{applied,cleared};
      });
      assert.equal(result.applied.theme,'dark');assert.equal(result.applied.shadow,true);assert.equal(result.applied.nested,false);
      assert.equal(result.cleared.root,undefined);assert.equal(result.cleared.marked,0);assert.equal(result.cleared.shadow,0);
    });
    await check('theme shares one player/region snapshot and coalesces comment roots before paint',async()=>{
      const result=await page.evaluate(async()=>{
        const t=window.blgTest,theme=new t.GlassTheme(),adapter=new t.PageAdapter('video');
        let playerReads=0,regionReads=0;
        const find=adapter.findPlayer.bind(adapter),regions=adapter.glassRegions.bind(adapter);
        adapter.findPlayer=()=>{playerReads++;return find();};
        adapter.glassRegions=()=>{regionReads++;return regions();};
        const host=document.createElement('bili-comments'),root=host.attachShadow({mode:'open'}),roots=[];
        for(let i=0;i<12;i++){
          const thread=document.createElement('bili-comment-thread-renderer'),shadow=thread.attachShadow({mode:'open'});
          shadow.innerHTML='<div>评论</div>';root.append(thread);roots.push(shadow);
        }
        document.body.append(host);theme.configure(window.testStore.value,adapter);
        await new Promise(ok=>requestAnimationFrame(ok));
        let scans=0;const refresh=theme.refreshComments.bind(theme);
        theme.refreshComments=()=>{scans++;refresh();};
        for(const shadow of roots)shadow.append(document.createElement('span'));
        await new Promise(ok=>requestAnimationFrame(ok));
        const coalesced=scans;
        const box=document.createElement('bili-comment-box');box.attachShadow({mode:'open'});roots[0].append(box);
        await new Promise(ok=>requestAnimationFrame(ok));
        const styled=box.hasAttribute('data-blg-comments')&&box.shadowRoot.querySelectorAll('style').length===1;
        roots[0].append(document.createElement('span'));await Promise.resolve();theme.clear();
        await new Promise(ok=>requestAnimationFrame(ok));
        const clean=[root,...roots,box.shadowRoot].every(shadow=>shadow.querySelectorAll('style').length===0);
        theme.dispose();host.remove();return{playerReads,regionReads,coalesced,styled,clean};
      });
      assert.equal(result.playerReads,1);assert.equal(result.regionReads,1);assert.equal(result.coalesced,1);
      assert.equal(result.styled,true);assert.equal(result.clean,true);
    });
    await check('readability optimizations removed at every transparency in both themes',async()=>{
      for(const theme of ['light','dark'])for(const transparency of [60,95,100]) {
        const state=await page.evaluate(({theme,transparency})=>{
          const t=window.blgTest,glass=new t.GlassTheme();glass.configure({...window.testStore.value,theme,transparency},new t.PageAdapter('video'));
          const shadow=getComputedStyle(document.querySelector('#viewbox_report')).textShadow;
          const result={shadow,backing:document.querySelectorAll('.blg-readable').length,protection:document.documentElement.style.getPropertyValue('--blg-text-protection')};glass.dispose();return result;
        },{theme,transparency});
        assert.equal(state.shadow,'none');assert.equal(state.backing,0);assert.equal(state.protection,'');
      }
    });
    await check('promotional images and votes hide only while enabled; native scrollbars and fractional player edges stay safe',async()=>{
      const result=await page.evaluate(()=>{
        const t=window.blgTest,theme=new t.GlassTheme(),adapter=new t.PageAdapter('video');
        const resource=document.createElement('div');resource.className='video-resource-list';
        resource.innerHTML='<div class="activity-m-v1"><img alt="活动" style="width:100%;height:40px"></div><div class="video-vote" style="height:60px">投票</div>';
        document.querySelector('.left-container').append(resource);
        const comments=document.createElement('bili-comments'),shadow=comments.attachShadow({mode:'open'});
        const poll=document.createElement('bili-comments-vote-card');poll.textContent='评论前的投票';shadow.append(poll);document.body.append(comments);
        const overlay=document.createElement('div');overlay.className='bili-danmaku-x-vote';overlay.textContent='播放器内投票';document.querySelector('.bpx-player-video-area').append(overlay);
        const overflow=document.createElement('div');overflow.style.cssText='width:100vw;height:1px';document.body.append(overflow);
        theme.configure(window.testStore.value,adapter);
        window.testController.updateLayout();
        scrollTo({left:100000,top:0,behavior:'instant'});
        const on={display:getComputedStyle(resource).display,poll:getComputedStyle(poll).display,overlay:getComputedStyle(overlay).display,overflow:getComputedStyle(document.documentElement).overflowX,x:scrollX,clip:window.testController.renderer.host.style.clipPath,layer:getComputedStyle(document.querySelector('.left-container')).zIndex,gutter:innerWidth-document.documentElement.clientWidth};
        theme.configure({...window.testStore.value,enabled:false},adapter);
        const off={display:getComputedStyle(resource).display,poll:getComputedStyle(poll).display,overlay:getComputedStyle(overlay).display,overflow:getComputedStyle(document.documentElement).overflowX};
        resource.remove();overflow.remove();comments.remove();overlay.remove();scrollTo(0,0);theme.dispose();window.testController.updateLayout();return{on,off};
      });
      assert.equal(result.on.display,'none');assert.equal(result.on.overflow,'clip');assert.equal(result.on.x,0);assert.ok(result.on.gutter>0);
      assert.equal(result.on.clip,'polygon(evenodd, 0px 0px, 100% 0px, 100% 100%, 0px 100%)');assert.equal(result.on.layer,'3');
      assert.notEqual(result.off.display,'none');assert.notEqual(result.off.overflow,'clip');
      for(const key of ['poll','overlay']){assert.equal(result.on[key],'none');assert.notEqual(result.off[key],'none');}
    });
    await check('player columns do not acquire fullscreen-breaking filters, and player stays above sidebar cards',async()=>{
      const result=await page.evaluate(()=>{
        const t=window.blgTest,theme=new t.GlassTheme();const left=document.querySelector('.left-container');
        const siteStyle=document.createElement('style');siteStyle.textContent='.video-container-v1 .left-container.plp-l { position:sticky; z-index:1; }';document.head.append(siteStyle);
        left.classList.add('plp-l');theme.configure(window.testStore.value,new t.PageAdapter('bangumi'));
        const container=document.querySelector('.bpx-player-container');
        const noFilter=getComputedStyle(left).backdropFilter==='none';
        const childGlass=!!document.querySelector('#viewbox_report').hasAttribute('data-blg-card');
        const playerZ=Number(getComputedStyle(container.closest('.left-container')??container).zIndex);
        container.classList.add('bpx-state-web');const fullscreenZ=Number(getComputedStyle(left).zIndex);container.classList.remove('bpx-state-web');
        theme.dispose();left.classList.remove('plp-l');siteStyle.remove();return{noFilter,childGlass,playerZ,fullscreenZ};
      });
      assert.ok(result.noFilter);assert.equal(result.childGlass,false);assert.ok(result.playerZ>=2);assert.ok(result.fullscreenZ>=100000);
    });
    await check('glass fields and lazy nested comment inputs inherit translucent surfaces and clean up',async()=>{
      const result=await page.evaluate(async()=>{
        const t=window.blgTest,theme=new t.GlassTheme(),host=document.createElement('bili-comments'),shadow=host.attachShadow({mode:'open'});
        const search=document.createElement('form');search.id='nav-searchform';search.innerHTML='<input class="nav-search-input">';document.querySelector('.bili-header__bar').append(search);
        const send=document.createElement('div');send.className='bpx-player-sending-area';send.innerHTML='<div class="bpx-player-sending-bar" style="background:white">100人在看</div>';document.body.append(send);document.body.append(host);
        theme.configure({...window.testStore.value,theme:'light'},new t.PageAdapter('video'));
        const box=document.createElement('bili-comment-box'),boxRoot=box.attachShadow({mode:'open'});boxRoot.innerHTML='<div id="editor" style="background:white;border:1px solid white"><input aria-label="测试评论"></div>';shadow.append(box);
        await new Promise(r=>setTimeout(r,250));
        const editor=boxRoot.querySelector('#editor'),field=getComputedStyle(editor),blur=getComputedStyle(editor).backdropFilter;
        const before={field:field.backgroundColor,radius:field.borderRadius,search:getComputedStyle(search).backgroundColor,bar:getComputedStyle(send.firstChild).backgroundColor,styles:boxRoot.querySelectorAll('style').length,padding:getComputedStyle(host).paddingLeft,blur};
        editor.querySelector('input').focus();const focused=getComputedStyle(editor).outlineStyle;
        theme.clear();const cleared={styles:boxRoot.querySelectorAll('style').length,bg:getComputedStyle(editor).backgroundColor,marked:box.hasAttribute('data-blg-comments')};
        theme.dispose();host.remove();search.remove();send.remove();return{before,focused,cleared};
      });
      assert.match(result.before.field,/rgba\(/);assert.match(result.before.search,/rgba\(/);assert.equal(result.before.radius,'10px');assert.equal(result.before.bar,'rgba(0, 0, 0, 0)');assert.equal(result.before.styles,1);assert.equal(result.before.padding,'0px');assert.equal(result.before.blur,'none');assert.equal(result.focused,'solid');assert.equal(result.cleared.styles,0);assert.equal(result.cleared.bg,'rgb(255, 255, 255)');assert.equal(result.cleared.marked,false);
    });
    await check('reply loading masks stay transparent on first paint and pagination, restoring native on disable',async()=>{
      const result=await page.evaluate(async()=>{
        const theme=new window.blgTest.GlassTheme(),host=document.createElement('bili-comments'),root=host.attachShadow({mode:'open'});document.body.append(host);
        theme.configure({...window.testStore.value,transparency:95,theme:'light'},new window.blgTest.PageAdapter('video'));
        const replies=document.createElement('bili-comment-replies-renderer'),shadow=replies.attachShadow({mode:'open'});
        const native=new CSSStyleSheet();native.replaceSync('#expander-contents{position:relative}#spinner{position:absolute;inset:0;background:rgba(var(--bg1_rgb),.85);display:flex;align-items:center;justify-content:center}');shadow.adoptedStyleSheets=[native];
        replies.style.setProperty('--bg1_rgb','255,255,255');shadow.innerHTML='<div id="expander-contents"><div>existing reply</div></div>';root.append(replies);
        await new Promise(ok=>requestAnimationFrame(ok));
        const discovered=replies.hasAttribute('data-blg-comments');
        const frames=[];
        for(const palette of ['light','dark']){
          theme.configure({...window.testStore.value,transparency:95,theme:palette},new window.blgTest.PageAdapter('video'));
          for(let i=0;i<2;i++){
            const mask=document.createElement('div');mask.id='spinner';mask.innerHTML='<span>正在玩命加载…</span>';shadow.querySelector('#expander-contents').append(mask);
            frames.push(await new Promise(ok=>requestAnimationFrame(()=>{const st=getComputedStyle(mask);ok({background:st.backgroundColor,display:st.display,pointer:st.pointerEvents,text:mask.textContent,position:st.position});})));
            mask.remove();
          }
        }
        const mask=document.createElement('div');mask.id='spinner';shadow.querySelector('#expander-contents').append(mask);theme.clear();const off=getComputedStyle(mask).backgroundColor;
        const clean=!replies.hasAttribute('data-blg-comments')&&shadow.querySelectorAll('style').length===0;theme.dispose();host.remove();return{frames,off,clean,discovered};
      });
      for(const frame of result.frames){assert.equal(frame.background,'rgba(0, 0, 0, 0)');assert.equal(frame.display,'flex');assert.equal(frame.pointer,'auto');assert.equal(frame.position,'absolute');assert.equal(frame.text,'正在玩命加载…');}
      assert.equal(result.off,'rgba(255, 255, 255, 0.85)');assert.ok(result.clean);assert.ok(result.discovered);
    });
    await check('native player glow is removed, fullscreen corners reset, and episode/expand surfaces are translucent',async()=>{
      const result=await page.evaluate(()=>{
        const theme=new window.blgTest.GlassTheme();theme.configure(window.testStore.value,new window.blgTest.PageAdapter('video'));
        const root=document.querySelector('.bpx-player-container'),area=document.querySelector('.bpx-player-video-area')??document.createElement('div');
        if(!area.isConnected){area.className='bpx-player-video-area';root.append(area);}
        const native=document.createElement('style');native.textContent='.bpx-player-container {box-shadow:0 0 8px white} .test-surfaces * {background:white}';document.head.append(native);
        const section=document.createElement('div');section.className='plp-r test-surfaces';section.innerHTML='<div class="bpx-player-collapse"><div class="bui-collapse-header">弹幕列表</div><div class="bui-collapse-body"><div class="bpx-player-dm-wrap-child">列表</div></div></div><a class="EpisodeVirtualList_numberItem__test">2</a><a class="EpisodeVirtualList_numberItem__test EpisodeVirtualList_activeItem__test">1</a><div class="SectionTabs_menu__test">季度</div><button class="mediainfo_ellipsis__test">展开</button>';document.body.append(section);
        const bg=s=>getComputedStyle(section.querySelector(s)).backgroundColor;
        const result={shadow:getComputedStyle(root).boxShadow,radius:getComputedStyle(root).borderRadius,header:bg('.bui-collapse-header'),body:bg('.bui-collapse-body'),child:bg('.bpx-player-dm-wrap-child'),episode:bg('a'),active:bg('a+a'),menu:bg('[class*="menu"]'),expand:bg('button'),gradient:getComputedStyle(section.querySelector('button')).backgroundImage};
        root.classList.add('bpx-state-web');result.fullRadius=getComputedStyle(root).borderRadius;result.areaRadius=getComputedStyle(area).borderRadius;root.classList.remove('bpx-state-web');
        theme.clear();result.restored=getComputedStyle(root).boxShadow;theme.dispose();section.remove();native.remove();if(!area.querySelector('video'))area.remove();return result;
      });
      assert.equal(result.shadow,'none');assert.equal(result.radius,'0px');assert.equal(result.fullRadius,'0px');assert.equal(result.areaRadius,'0px');assert.match(result.restored,/255, 255, 255/);
      assert.equal(result.body,'rgba(0, 0, 0, 0)');assert.equal(result.child,'rgba(0, 0, 0, 0)');for(const key of ['header','episode','active','menu','expand'])assert.match(result[key],/rgba\(/);assert.notEqual(result.active,result.episode);assert.equal(result.gradient,'none');
    });
    await check('glass toggles preserve main geometry and column widths, allowing UP inset reflow, and restore native layout',async()=>{
      const result=await page.evaluate(()=>{
        const t=window.blgTest,theme=new t.GlassTheme(),adapter=new t.PageAdapter('video');
        const snapshot=()=>[...document.querySelectorAll('#viewbox_report,.bpx-player-container,#arc_toolbar_report,#v_desc,.right-container,#comment')].map(e=>{const r=e.getBoundingClientRect();return[e.className,r.x,r.y,r.width,r.height]});
        const before=snapshot();theme.configure(window.testStore.value,adapter);const after=snapshot();
        const cards=document.querySelectorAll('#viewbox_report[data-blg-card],#arc_toolbar_report[data-blg-card],#v_desc[data-blg-card]');
        const player=document.createElement('div');player.id='bilibili-player';player.innerHTML='<div class="bpx-player-sending-area"><div class="bpx-player-sending-bar">发送</div></div>';
        const dm=document.createElement('div');dm.id='danmukuBox';dm.innerHTML='<div class="bpx-player-collapse"><div class="bui-collapse-header">弹幕列表</div><div class="bui-collapse-body">内容</div></div>';
        document.body.append(player,dm);const late=document.createElement('style');late.textContent='#bilibili-player .bpx-player-sending-bar, #danmukuBox .bui-collapse-header, #danmukuBox .bui-collapse-body { background:white !important; }';document.head.append(late);
        const backgrounds=[player.querySelector('.bpx-player-sending-bar'),...dm.querySelectorAll('.bui-collapse-header,.bui-collapse-body')].map(e=>getComputedStyle(e).backgroundColor);
        theme.configure({...window.testStore.value,enabled:false},adapter);const restored=snapshot();theme.dispose();late.remove();player.remove();dm.remove();
        return{before,after,restored,cards:cards.length,backgrounds};
      });
      const geometry=rows=>rows.map(r=>r[0]==='right-container'?[r[0],r[1],r[3]]:r);
      assert.equal(result.after.find(r=>r[0]==='right-container')[2]-result.before.find(r=>r[0]==='right-container')[2],16);
      assert.deepEqual(geometry(result.after),geometry(result.before));assert.deepEqual(result.restored,result.before);assert.equal(result.cards,0);assert.deepEqual(result.backgrounds,Array(3).fill('rgba(0, 0, 0, 0)'));
    });
    await check('transparency 95 / spread 100 / softness 0 clears underlying placeholder and auxiliary docker, preserving native layout and switch-off restoration',async()=>{
      const result=await page.evaluate(()=>{
        const t=window.blgTest,theme=new t.GlassTheme(),adapter=new t.PageAdapter('video');
        const section=document.createElement('section');section.innerHTML='<div id="bilibili-player-placeholder"><div id="bilibili-player-placeholder-top"></div><div id="bilibili-player-placeholder-bottom"><div id="bilibili-player-placeholder-bottom-left"></div><div id="bilibili-player-placeholder-bottom-right"></div></div></div><div class="bpx-player-sending-area"><div class="bpx-player-sending-bar"><div class="bpx-player-video-inputbar">发弹幕</div></div></div><div id="danmukuBox"><div class="danmaku-wrap"><div class="bpx-docker bpx-docker-minor"><div class="bpx-player-collapse"><div class="bui-collapse-header">弹幕列表</div></div></div></div></div>';
        document.body.append(section);
        const native=document.createElement('style');native.textContent='#bilibili-player-placeholder{box-shadow:0 0 8px #f1f2f3} #bilibili-player-placeholder-top{height:30px;background:black} #bilibili-player-placeholder-bottom{height:46px;background:white} #bilibili-player-placeholder-bottom-left,#bilibili-player-placeholder-bottom-right{background:#f4f4f4} #danmukuBox .bpx-docker-minor{height:44px;background:white} .bpx-player-sending-area::before{content:"";display:block;height:1px;background:#f4f4f4}';document.head.append(native);
        const snapshot=()=>[...section.querySelectorAll('*')].map(e=>{const r=e.getBoundingClientRect();return[r.x,r.y,r.width,r.height];});
        const inspect=()=>({shadow:getComputedStyle(section.firstChild).boxShadow,bg:['#bilibili-player-placeholder-bottom','#bilibili-player-placeholder-bottom-left','#bilibili-player-placeholder-bottom-right','.bpx-docker-minor'].map(s=>getComputedStyle(section.querySelector(s)).backgroundColor),divider:getComputedStyle(section.querySelector('.bpx-player-sending-area'),'::before').backgroundColor,input:getComputedStyle(section.querySelector('.bpx-player-video-inputbar')).backgroundColor,top:getComputedStyle(section.querySelector('#bilibili-player-placeholder-top')).backgroundColor});
        const geometry=snapshot(),nativeStyles=inspect();const palette=[];
        for(const color of ['light','dark']){theme.configure({...window.testStore.value,enabled:true,transparency:95,spread:100,softness:0,theme:color},adapter);palette.push({style:inspect(),geometry:snapshot()});}
        theme.clear();const restored=inspect(),restoredGeometry=snapshot();theme.dispose();section.remove();native.remove();return{geometry,nativeStyles,palette,restored,restoredGeometry};
      });
      for(const row of result.palette){assert.equal(row.style.shadow,'none');assert.deepEqual(row.style.bg,Array(4).fill('rgba(0, 0, 0, 0)'));assert.equal(row.style.divider,'rgba(0, 0, 0, 0)');assert.match(row.style.input,/, 0\.05\)$/);assert.equal(row.style.top,'rgb(0, 0, 0)');assert.deepEqual(row.geometry,result.geometry);}
      assert.deepEqual(result.restored,result.nativeStyles);assert.deepEqual(result.restoredGeometry,result.geometry);
    });
    await check('preview video hover retains sidebar layers; normal scrolling is compositor anchored; readback uses dedicated probe',async()=>{
      const result=await page.evaluate(async()=>{
        const t=window.blgTest,theme=new t.GlassTheme(),adapter=new t.PageAdapter('video');theme.configure(window.testStore.value,adapter);
        const sidebar=document.querySelector('.right-container'),before={card:sidebar.hasAttribute('data-blg-card'),layer:sidebar.hasAttribute('data-blg-static-layer')||sidebar.hasAttribute('data-blg-auto-layer')};
        const preview=document.createElement('video');sidebar.append(preview);theme.refresh(adapter);
        const after={card:sidebar.hasAttribute('data-blg-card'),layer:sidebar.hasAttribute('data-blg-static-layer')||sidebar.hasAttribute('data-blg-auto-layer')};
        const renderer=window.testController.renderer;renderer.resetSource();renderer.draw(document.querySelector('video'),1000);renderer.resetSource();renderer.draw(document.querySelector('video'),1050);
        const probe=renderer.originContext.getContextAttributes().willReadFrequently,sample=renderer.sampleContext.getContextAttributes().willReadFrequently;
        window.scrollTo(0,0);window.testController.updateLayout();
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const v=document.querySelector('.bpx-player-video-wrap video'),halo=document.querySelector('.blg-ambient'),relative=v.getBoundingClientRect().top-halo.getBoundingClientRect().top;
        const queue=window.testController.queueLayout;window.testController.queueLayout=()=>{};
        const spacer=document.createElement('div');spacer.style.height='3000px';document.body.append(spacer);window.scrollTo(0,80);
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const scrolled=v.getBoundingClientRect().top-halo.getBoundingClientRect().top,position=halo.style.position;
        window.testController.queueLayout=queue;window.scrollTo(0,0);spacer.remove();preview.remove();theme.dispose();return{before,after,probe,sample,relative,scrolled,position};
      });
      assert.deepEqual(result.after,result.before);assert.ok(result.before.card&&result.before.layer);assert.equal(result.probe,true);assert.equal(result.sample,false);assert.equal(result.position,'absolute');assert.ok(Math.abs(result.relative-result.scrolled)<1,JSON.stringify(result));
    });
    await check('native anchors follow sticky players without JS repositioning; halo cannot widen the page and releases anchor styles',async()=>{
      const result=await page.evaluate(async()=>{
        const t=window.blgTest,v=document.querySelector('.bpx-player-video-wrap video'),player=document.querySelector('.bpx-player-container');
        const original=player.getAttribute('style'),prior=v.style.getPropertyValue('anchor-name');
        player.style.position='sticky';player.style.top='20px';
        const space=document.createElement('div');space.style.height='3000px';document.body.append(space);window.scrollTo(0,0);
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const width=document.documentElement.scrollWidth,r=new t.AmbientRenderer(window.testStore.value);r.bindAnchor(v);r.mount(document.body);
        const box=v.getBoundingClientRect(),pad=box.height*.83;
        r.position({outer:{x:box.x-pad,y:box.y-pad,width:box.width+2*pad,height:box.height+2*pad},video:{x:box.x,y:box.y,width:box.width,height:box.height},clipped:false});
        const offsets=[];let canvasAligned=true;
        for(const y of [0,80,180,350,700,40]){window.scrollTo(0,y);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));offsets.push(v.getBoundingClientRect().top-r.host.getBoundingClientRect().top);canvasAligned&&=Math.abs(r.canvas.getBoundingClientRect().top-r.host.getBoundingClientRect().top)<1;}
        const after=document.documentElement.scrollWidth;r.dispose();const restored=v.style.getPropertyValue('anchor-name')===prior;
        window.scrollTo(0,0);space.remove();if(original===null)player.removeAttribute('style');else player.setAttribute('style',original);
        return{width,after,pad,offsets,canvasAligned,restored};
      });
      assert.equal(result.after,result.width);assert.ok(result.canvasAligned);assert.ok(result.restored);
      for(const offset of result.offsets)assert.ok(Math.abs(offset-result.pad)<1,JSON.stringify(result));
    });
    await check('shared settings UI has one immersion switch and transparency; changes persist and keyboard close works',async()=>{
      await page.evaluate(()=>{
        const t=window.blgTest;window.testPanel=new t.SettingsPanel(window.testStore,false,()=>window.testPanel.dispose(),document.querySelector("#open-settings"));
        document.body.append(window.testPanel.host);window.testPanel.position();window.testPanel.focus();
      });
      await page.getByLabel('外观',{exact:true}).selectOption('light');
      assert.equal(await page.getByRole('switch').count(),1);assert.equal(await page.getByRole('slider').count(),3);
      await page.getByLabel('扩散方向',{exact:true}).selectOption('straight');
      assert.equal(await page.evaluate(()=>window.testStore.value.projection),'straight');
      assert.equal(await page.getByText('让画面里的光，延伸到页面。',{exact:true}).count(),0);
      assert.equal(await page.getByText('同时开启氛围光与液态玻璃',{exact:true}).count(),0);
      assert.equal(await page.evaluate(()=>window.testPanel.root.querySelector('.master small').textContent),'开启会屏蔽部分广告和活动等');
      await page.evaluate(()=>window.testPanel.setStatus('已暂停 · 保留当前光效','idle'));
      assert.equal(await page.evaluate(()=>window.testPanel.root.querySelector('.status').hidden),true);
      await page.evaluate(()=>window.testPanel.setStatus('此视频限制画面读取','warning'));
      assert.equal(await page.getByText('此视频限制画面读取',{exact:true}).isVisible(),true);
      await page.getByLabel('沉浸光感',{exact:true}).uncheck();
      assert.equal(await page.evaluate(()=>window.testStore.value.theme),'light');
      assert.equal(await page.evaluate(()=>window.testStore.value.enabled),false);
      await page.getByLabel('沉浸光感',{exact:true}).press('Escape');assert.equal(await page.locator('.blg-ui-host').count(),0);
      await page.evaluate(()=>window.testStore.reset());
    });
    await check('Canvas fallback draws video, keeps low-resolution bounds, and releases resources',async()=>{
      const result=await page.evaluate(()=>{
        const t=window.blgTest,renderer=new t.AmbientRenderer(window.testStore.value,()=>{},true);
        renderer.mount(document.body);renderer.position({outer:{x:0,y:0,width:800,height:600},video:{x:100,y:100,width:600,height:400},clipped:false});
        renderer.configure(window.testStore.value);renderer.draw(document.querySelector('video'),performance.now());
        const pixel=renderer.canvas.getContext('2d').getImageData(64,40,1,1).data;
        const result={mode:renderer.mode,width:renderer.canvas.width,pixel:[...pixel]};renderer.dispose();return result;
      });
      assert.equal(result.mode,'canvas');assert.ok(result.width<=128);assert.ok(result.pixel[3]>0);
    });
    await check('GPU loss downgrades to Canvas instead of entering a restore loop',async()=>{
      const result=await page.evaluate(async()=>{
        const t=window.blgTest,renderer=new t.AmbientRenderer(window.testStore.value);
        renderer.mount(document.body);renderer.position({outer:{x:-120,y:0,width:1900,height:600},video:{x:100,y:100,width:600,height:400},clipped:false});
        const geometry=()=>{const s=renderer.canvas.style;return{left:s.left,top:s.top,width:s.width,height:s.height,position:s.position};};
        const before=geometry();
        const extension=renderer.canvas.getContext('webgl').getExtension('WEBGL_lose_context');
        if(!extension){renderer.dispose();return 'unsupported';}
        extension.loseContext();await new Promise(r=>setTimeout(r,100));const result={mode:renderer.mode,before,after:geometry()};renderer.dispose();return result;
      });
      assert.equal(result.mode,'canvas');assert.deepEqual(result.after,result.before);
    });
    await check('Canvas fallback also switches projection and releases its intermediate buffers',async()=>{
      const result=await page.evaluate(()=>{
        const source=document.createElement('canvas');source.width=256;source.height=144;Object.assign(source,{readyState:4,videoWidth:256,videoHeight:144});
        const ctx=source.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,100,144);ctx.fillStyle='blue';ctx.fillRect(100,0,156,144);
        const r=new window.blgTest.AmbientRenderer({...window.testStore.value,projection:'straight',softness:0},()=>{},true);
        r.position({outer:{x:0,y:0,width:1200,height:800},video:{x:200,y:180,width:800,height:440},clipped:false});
        const colors=[];
        for(const projection of ['straight','diagonal']) {
          r.configure({...window.testStore.value,projection,softness:0});r.draw(source,1000);
          colors.push([...r.canvas.getContext('2d').getImageData(Math.floor(.4*r.canvas.width),Math.floor(.1*r.canvas.height),1,1).data]);
        }
        const size=[r.filtered.width,r.filtered.height,r.projected.width,r.projected.height];r.dispose();
        return{colors,size,disposed:[r.filtered.width,r.filtered.height,r.projected.width,r.projected.height]};
      });
      assert.ok(result.colors[0][0]>result.colors[0][2]+30,JSON.stringify(result));assert.ok(result.colors[1][2]>result.colors[1][0]+30,JSON.stringify(result));
      assert.ok(Math.max(...result.size)<=128);assert.deepEqual(result.disposed,[1,1,1,1]);
    });
    await check('disable disposes renderers, re-enable recreates one, disposal cancels scheduling',async()=>{
      const result=await page.evaluate(()=>{
        const c=window.testController,s=window.testStore.value;
        c.configure({...s,enabled:false});const off={count:document.querySelectorAll('.blg-ambient').length,scheduled:c.diagnostics().scheduled};
        c.configure(s);c.configure(s);const on=document.querySelectorAll('.blg-ambient').length;
        c.dispose();window.testStore.dispose();return{off,on,final:document.querySelectorAll('.blg-ambient').length,scheduled:c.diagnostics().scheduled};
      });
      assert.deepEqual(result.off,{count:0,scheduled:false});assert.equal(result.on,1);assert.equal(result.final,0);assert.equal(result.scheduled,false);
    });
    await check('cross-origin media restriction stops dynamic rendering and preserves the glass theme',async()=>{
      const bytes=await page.evaluate(async()=>{
        const c=document.createElement('canvas');c.width=64;c.height=64;c.getContext('2d').fillRect(0,0,64,64);
        const stream=c.captureStream(12),chunks=[];const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
        recorder.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>recorder.onstop=resolve);
        recorder.start();let color=0;
        const timer=setInterval(()=>{const ctx=c.getContext('2d');ctx.fillStyle=`rgb(${++color*20},50,90)`;ctx.fillRect(0,0,64,64);},40);
        await new Promise(r=>setTimeout(r,500));clearInterval(timer);recorder.stop();await done;stream.getTracks().forEach(track=>track.stop());
        return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
      });
      await writeFile(path.join(root,'artifacts/media/cross-origin.webm'),new Uint8Array(bytes));
      const result=await page.evaluate(async source=>{
        const old=document.querySelector('video'),v=document.createElement('video');v.muted=true;v.loop=true;v.src=source;old.replaceWith(v);await v.play();
        await new Promise(resolve=>v.requestVideoFrameCallback(resolve));
        const t=window.blgTest,store=new t.SettingsStore(t.backend);await store.init();
        const adapter=new t.PageAdapter('video'),theme=new t.GlassTheme();theme.configure(store.value,adapter);
        const controller=new t.PlaybackController(adapter.findPlayer(),adapter,()=>{});controller.configure(store.value);
        const result={mode:controller.diagnostics().mode,status:controller.status,glass:document.documentElement.dataset.blgGlass,scheduled:controller.diagnostics().scheduled,ready:v.readyState,hidden:document.hidden,size:[v.videoWidth,v.videoHeight],rect:[v.getBoundingClientRect().width,v.getBoundingClientRect().height]};
        const sameOrigin=new URL(v.src);sameOrigin.host=location.host;v.src=sameOrigin.href;
        await v.play();await new Promise(resolve=>v.requestVideoFrameCallback(resolve));await new Promise(resolve=>setTimeout(resolve,100));
        result.recovery=controller.diagnostics();
        controller.dispose();theme.dispose();store.dispose();return result;
      },crossOrigin.url+'/artifacts/media/cross-origin.webm');
      assert.equal(result.mode,'blocked',JSON.stringify(result));assert.equal(result.scheduled,false);assert.equal(result.glass,'on');assert.equal(result.status.state,'warning');assert.match(result.status.message,/限制画面读取/);
      assert.equal(result.recovery.mode,'webgl');assert.ok(result.recovery.frames>0);
    });
    await check('complete content lifecycle: reinjection, source replacement, SPA navigation, and storage',async()=>{
      const content=await readFile(path.join(root,'dist/chrome/content.js'),'utf8');
      await page.addInitScript(()=>{
        const listeners=new Set(),messages=new Set();let stored={};
        window.chrome={storage:{local:{get:async()=>stored,set:async value=>{const changes={};for(const[key,next]of Object.entries(value))changes[key]={newValue:next,oldValue:stored[key]};stored={...stored,...value};for(const fn of listeners)fn(changes,'local');}},onChanged:{addListener:fn=>listeners.add(fn),removeListener:fn=>listeners.delete(fn)}},runtime:{id:'test-extension',onMessage:{addListener:fn=>messages.add(fn),removeListener:fn=>messages.delete(fn)}}};
        window.testChrome={listeners,messages,status:()=>{let status;for(const fn of messages)fn({type:'BLG_STATUS'},{},r=>status=r);return status;}};
      });
      await page.reload();await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
      await page.addScriptTag({content:content+'\n'+content});await page.waitForTimeout(300);await page.addScriptTag({content});await page.waitForTimeout(300);
      const initial=await page.evaluate(()=>({ambient:document.querySelectorAll('.blg-ambient').length,button:document.querySelectorAll('.blg-player-button').length,listeners:window.testChrome.listeners.size,messages:window.testChrome.messages.size,status:window.testChrome.status()}));
      assert.equal(initial.ambient,1);assert.equal(initial.button,1);assert.equal(initial.listeners,1);assert.equal(initial.messages,1);assert.ok(initial.status.diagnostics.frames>0);
      await page.evaluate(()=>document.querySelector('video').pause());await page.waitForTimeout(200);
      const frozen=await page.evaluate(()=>window.testChrome.status().diagnostics.frames);
      await page.evaluate(()=>document.querySelector('.video-title').textContent='页面内容更新，暂停的光效仍保持不变');await page.waitForTimeout(400);
      assert.equal(await page.evaluate(()=>window.testChrome.status().diagnostics.frames),frozen);
      await page.evaluate(()=>document.querySelector('video').play());
      await page.evaluate(()=>{
        const old=document.querySelector('video'),next=old.cloneNode();next.srcObject=old.srcObject;old.replaceWith(next);next.play();
      });await page.waitForTimeout(350);assert.equal(await page.locator('.blg-ambient').count(),1);
      await page.evaluate(()=>history.pushState(null,'','/bangumi/play/epfixture'));await page.waitForTimeout(1700);
      assert.equal(await page.locator('.blg-ambient').count(),1);
      await page.evaluate(()=>chrome.storage.local.set({'biliLiquidGlass.settings':{version:1,enabled:false}}));await page.waitForTimeout(200);
      assert.equal(await page.locator('.blg-ambient').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.dataset.blgGlass),undefined);
      await page.evaluate(()=>history.pushState(null,'','/'));await page.waitForTimeout(1700);
      assert.equal(await page.locator('.blg-player-button').count(),0);assert.equal(await page.locator('.blg-ambient').count(),0);
      await page.evaluate(()=>window.__blgApp.dispose());
      assert.equal(await page.evaluate(()=>window.testChrome.listeners.size),0);assert.equal(await page.evaluate(()=>window.testChrome.messages.size),0);
    });
    await check('invalidated extension contexts clean up on pagehide and the route timer without API errors',async()=>{
      const content=await readFile(path.join(root,'dist/chrome/content.js'),'utf8');
      for(const trigger of ['pagehide','timer']) {
        await page.goto(host.url+'/video/fixture/?test');await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
        await page.addScriptTag({content});await page.waitForSelector('.blg-ambient');
        await page.evaluate(trigger=>{
          window.retiredCanvas=document.querySelector('.blg-ambient canvas');
          chrome.runtime.onMessage.removeListener=()=>{throw new Error('Extension context invalidated.');};
          chrome.storage.onChanged.removeListener=()=>{throw new Error('Extension context invalidated.');};
          if(trigger==='pagehide') {
            window.chrome={};window.dispatchEvent(new PageTransitionEvent('pagehide'));
          } else chrome.runtime.id=undefined;
        },trigger);
        await page.waitForFunction(()=>!document.querySelector('.blg-ambient'),null,{timeout:3000});
        const released=await page.evaluate(()=>({size:[window.retiredCanvas.width,window.retiredCanvas.height],button:!!document.querySelector('.blg-player-button'),glass:document.documentElement.dataset.blgGlass}));
        assert.deepEqual(released.size,[1,1]);assert.equal(released.button,false);assert.equal(released.glass,undefined);
        await page.addScriptTag({content});await page.waitForTimeout(100);
        assert.equal(await page.locator('.blg-ambient').count(),0,'An invalid context must not reinitialize');
      }
    });
    await check('context loss while storage initialization is pending cancels startup and releases the listener',async()=>{
      const content=await readFile(path.join(root,'dist/chrome/content.js'),'utf8');
      await page.goto(host.url+'/video/fixture/?test');await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
      await page.evaluate(()=>{chrome.storage.local.get=()=>new Promise(resolve=>{window.resolveRetiredStore=resolve;});});
      await page.addScriptTag({content});await page.waitForFunction(()=>!!window.resolveRetiredStore);
      await page.evaluate(()=>{window.chrome={};window.resolveRetiredStore({});});await page.waitForTimeout(100);
      assert.equal(await page.locator('.blg-ambient').count(),0);assert.equal(await page.evaluate(()=>window.testChrome.listeners.size),0);
    });
    await check('narrow viewport and reduced motion keep UI usable',async()=>{
      await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
      await page.goto(host.url+'/video/fixture/');await page.waitForFunction(()=>document.querySelector('video').readyState>=2);
      await page.locator('#open-settings').click();
      const box=await page.getByRole('dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);
      await page.getByRole('button',{name:'关闭设置',exact:true}).click();
    });
    assert.deepEqual(errors,[]);
    await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({colorScheme:'dark',reducedMotion:'no-preference'});
    await page.goto(host.url+'/video/fixture/');await page.waitForTimeout(800);
    await page.screenshot({path:path.join(root,'artifacts',`preview-${name.toLowerCase().replaceAll(' ','-')}.png`)});
    reports.push({browser:name,version:browser.version(),type:'production modules + production content bundle on local synthetic fixtures',checks,passed:true});
  } catch(error) {
    await page.screenshot({path:path.join(root,'artifacts',`failure-${name.toLowerCase().replaceAll(' ','-')}.png`)}).catch(()=>{});
    reports.push({browser:name,version:browser.version(),checks,passed:false,error:String(error)});throw error;
  } finally {await browser.close();}
}
try {
  await run('Chrome',{channel:'chrome'});
  await run('Edge',{channel:'msedge'});
} finally {
  await writeFile(path.join(root,'artifacts/browser-report.json'),JSON.stringify({runAt:new Date().toISOString(),reports},null,2));await host.close();await crossOrigin.close();
}
