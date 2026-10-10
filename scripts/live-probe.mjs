import { extensionContext } from './extension-context.mjs';
import { readFile, writeFile } from 'node:fs/promises';

const reports=[];
const runAt=new Date().toISOString(),runId=runAt.replaceAll(/[:.]/g,'-');
for(const browser of ['chrome','edge']) {
  let extension;
  try {
    extension=await extensionContext(browser);
    const page=await extension.context.newPage();
    const targets=[{name:'video',url:'https://www.bilibili.com/video/BV1GJ411x7h7/'}];
    // Discover an actual episode link from the public anime page.
    const discovery=await extension.context.newPage();
    try {
      await discovery.goto('https://www.bilibili.com/anime/',{waitUntil:'domcontentloaded',timeout:30000});
      const episode=await discovery.locator('a[href*="/bangumi/play/"]').evaluateAll(links=>links.map(a=>a.href).find(href=>/\/bangumi\/play\/(ep|ss)\d+/.test(href)));
      if(episode)targets.push({name:'bangumi',url:episode});
      else reports.push({browser,page:'bangumi',verified:false,reason:'Public anime page did not expose an episode link'});
    }catch(error){reports.push({browser,page:'bangumi',verified:false,reason:String(error)});}
    await discovery.close();
    for(const target of targets) {
      try {
        await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:30000});
        await page.waitForSelector('.bpx-player-container, .bilibili-player',{timeout:15000});
        // Muted playback only, in a fresh test profile, without login or site interactions.
        await page.locator('video').first().evaluate(async video=>{video.muted=true;try{await Promise.race([video.play(),new Promise(resolve=>setTimeout(resolve,1000))]);}catch{}});
        let playback='episode';
        if(target.name==='bangumi' && await page.locator('video').first().evaluate(v=>v.readyState<2)) {
          const trailer=page.getByText('预告',{exact:true});
          if(await trailer.count()===1) {
            await trailer.click();playback='public trailer';
            await page.locator('video').first().evaluate(async video=>{video.muted=true;try{await Promise.race([video.play(),new Promise(resolve=>setTimeout(resolve,1000))]);}catch{}});
          }
        }
        await page.waitForTimeout(1500);
        await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.readyState>=2),null,{timeout:8000}).catch(()=>{});
        const dom=await page.evaluate(()=>({
          title:document.title,url:location.href,
          videos:[...document.querySelectorAll('video')].map(v=>({width:v.videoWidth,height:v.videoHeight,readyState:v.readyState,crossOrigin:v.crossOrigin,paused:v.paused,objectFit:getComputedStyle(v).objectFit,ancestry:[...(function*(){let e=v;for(let i=0;e&&i<7;i++,e=e.parentElement)yield{tag:e.tagName,id:e.id,class:e.className};})()]})),
          regions:[...document.querySelectorAll('[data-blg-card]')].map(e=>({tag:e.tagName,id:e.id,class:e.className})),
          theme:document.documentElement.dataset.blgTheme,ambient:!!document.querySelector('.blg-ambient'),button:!!document.querySelector('.blg-player-button'),
          commentRoots:[...document.querySelectorAll('bili-comments')].map(e=>({open:!!e.shadowRoot,styled:e.hasAttribute('data-blg-comments')})),
          controls:[...document.querySelectorAll('.bpx-player-control-bottom-right > *')].map(e=>e.className),
          lightPopups:[...document.querySelectorAll('div')].filter(e=>getComputedStyle(e).backgroundColor==='rgb(255, 255, 255)'&&e.innerText.includes('登录后你可以')).map(e=>({class:e.className,id:e.id})),
        }));
        const status=await extension.status();
        const modes=[];
        if(target.name==='video' && status?.diagnostics?.frames) {
          for(const [name,selector]of [['wide','.bpx-player-ctrl-wide'],['web-fullscreen','.bpx-player-ctrl-web'],['fullscreen','.bpx-player-ctrl-full']]) {
            const control=page.locator(selector);
            await control.waitFor({state:'attached',timeout:1500}).catch(()=>{});
            if(await control.count()!==1){modes.push({name,verified:false,reason:'Control unavailable'});continue;}
            try {
              await page.locator('.bpx-player-video-area').hover({timeout:2500});await control.click({timeout:2500});await page.waitForTimeout(180);
              const details=await page.evaluate(()=>({playerClass:document.querySelector('.bpx-player-container')?.className,fullscreen:!!document.fullscreenElement,ambientCount:document.querySelectorAll('.blg-ambient').length,clip:document.querySelector('.blg-ambient')?.style.clipPath}));
              if(name==='fullscreen')await page.evaluate(()=>document.exitFullscreen());
              else {await page.locator('.bpx-player-video-area').hover({timeout:2500});await control.click({timeout:2500});}
              modes.push({name,verified:details.ambientCount===1&&!!details.clip,details});
              await page.waitForTimeout(100);
            }catch(error){modes.push({name,verified:false,reason:String(error)});}
          }
          await page.locator('video').first().evaluate(v=>v.pause());await page.waitForTimeout(150);
          const paused=await extension.status();modes.push({name:'pause',verified:paused?.diagnostics?.scheduled===false});
          await page.locator('video').first().evaluate(v=>v.play());
          const initial=await extension.status();
          const scroll=await page.evaluate(async()=>{
            const v=document.querySelector('.bpx-player-video-wrap video'),host=document.querySelector('.blg-ambient'),canvas=host?.querySelector('canvas');
            if(!v||!canvas)return null;
            const width=canvas.width,height=canvas.height,bottom=v.getBoundingClientRect().bottom+scrollY,steps=[];
            for(const y of [0,40,80,120,Math.max(0,bottom-80)]) {
              window.scrollTo(0,y);await new Promise(r=>setTimeout(r,90));
              steps.push({width:canvas.width,height:canvas.height,hidden:host.hidden,opacity:Number(host.style.opacity)});
            }
            window.scrollTo(0,0);await new Promise(r=>setTimeout(r,220));
            return{stable:steps.every(s=>s.width===width&&s.height===height&&!s.hidden),steps,horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
          });
          const afterScroll=await extension.status();
          modes.push({name:'playing-scroll',verified:!!scroll?.stable&&afterScroll?.diagnostics?.frames>initial?.diagnostics?.frames,details:scroll});
        }
        const screenshot=`artifacts/live-${browser}-${target.name}-${runId}.png`;
        await page.screenshot({path:screenshot});
        const verified=!!status?.diagnostics?.frames&&status.diagnostics.mode!=='blocked';
        reports.push({browser,page:target.name,playback,verified,dom,status,modes,screenshot});
        console.log(`${browser} ${target.name}: ${verified?'frame reading verified':'not verified'} · ${status?.status?.message??'No player binding'}`);
      }catch(error){reports.push({browser,page:target.name,verified:false,reason:String(error)});console.log(`${browser} ${target.name}: ${error}`);}
    }
  }catch(error){reports.push({browser,verified:false,reason:String(error)});console.log(`${browser}: ${error}`);}
  finally{await extension?.close();}
}
let history=[];try{history=JSON.parse(await readFile('artifacts/live-history.json','utf8'));}catch{}
try{const previous=JSON.parse(await readFile('artifacts/live-report.json','utf8'));if(!history.some(run=>run.runAt===previous.runAt))history.push(previous);}catch{}
const result={runAt,reports};history.push(result);
await writeFile('artifacts/live-history.json',JSON.stringify(history,null,2));
await writeFile('artifacts/live-report.json',JSON.stringify(result,null,2));
