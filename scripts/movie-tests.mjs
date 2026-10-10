import {extensionContext} from './extension-context.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const version=JSON.parse(await readFile('package.json','utf8')).version,reports=[];
for(const browser of ['chrome','edge'])for(const ss of ['ss46068','ss106518','ss40396']){
 const e=await extensionContext(browser);
 try{
  await e.settings({enabled:true,transparency:95,spread:100,softness:0});
   const p=await e.context.newPage();await p.setViewportSize({width:1920,height:1000});
   await p.goto(`https://www.bilibili.com/bangumi/play/${ss}?theme=movie`,{waitUntil:'domcontentloaded'});await p.locator('.blg-player-button').waitFor();
   // Public movie trials may wait for an explicit play request and replace
   // their source while skipping the opening. Do not inspect an empty frame.
   await p.evaluate(()=>{const v=document.querySelector('.bpx-player-video-wrap video');v.muted=true;void v.play().catch(()=>{});});
   await p.waitForTimeout(3000);
   await p.evaluate(()=>{void document.querySelector('.bpx-player-video-wrap video').play().catch(()=>{});});
   try{await p.waitForFunction(()=>{const v=document.querySelector('.bpx-player-video-wrap video');return v?.readyState>=2&&v.videoWidth>0;},{},{timeout:45000});}
   catch(error){const state=await p.evaluate(()=>{const v=document.querySelector('.bpx-player-video-wrap video');return{ready:v.readyState,paused:v.paused,error:v.error?.message,media:[v.videoWidth,v.videoHeight],text:document.querySelector('.bpx-player-container').innerText};});console.log(JSON.stringify({browser,ss,state}));throw error;}
   await p.evaluate(ss=>{const v=document.querySelector('.bpx-player-video-wrap video');v.currentTime=ss==='ss46068'?10:ss==='ss40396'?35:Math.max(50,v.currentTime);},ss);
   await p.waitForFunction(()=>{const v=document.querySelector('.bpx-player-video-wrap video');return v.readyState>=2&&!v.seeking;});
   await p.waitForTimeout(350);await p.evaluate(()=>document.querySelector('.bpx-player-video-wrap video').pause());
   const inspect=()=>p.evaluate(()=>{
    const v=document.querySelector('.bpx-player-video-wrap video'),player=v.closest('.bpx-player-container');
    const rect=n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
    const layers=[];for(let n=v;n&&layers.length<12;n=n.parentElement){const s=getComputedStyle(n);layers.push({class:n.className,border:[s.borderTopWidth,s.borderRightWidth,s.borderBottomWidth,s.borderLeftWidth],shadow:s.boxShadow,outline:s.outlineStyle,box:rect(n)});}
    // Test-only decoder capture; production never reads full video pixels.
    const c=document.createElement('canvas');c.width=v.videoWidth;c.height=v.videoHeight;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(v,0,0,c.width,c.height);const data=ctx.getImageData(0,0,c.width,c.height).data;
    const edge=(axis,index)=>{let sum=0,min=255,max=0,count=axis==='y'?c.width:c.height;for(let i=0;i<count;i++){const k=(axis==='y'?index*c.width+i:i*c.width+index)*4,m=Math.max(data[k],data[k+1],data[k+2]);sum+=m;min=Math.min(min,m);max=Math.max(max,m);}return{min,max,average:sum/count};};
    let hash=2166136261;for(const byte of data)hash=Math.imul(hash^byte,16777619)>>>0;
    return{time:v.currentTime,media:[v.videoWidth,v.videoHeight],video:rect(v),player:rect(player),fit:getComputedStyle(v).objectFit,sourceHash:hash,source:c.toDataURL(),edges:{top:[edge('y',0),edge('y',1)],left:[edge('x',0),edge('x',1)],right:[edge('x',c.width-1),edge('x',c.width-2)]},layers};
   });
   let on=await inspect();await writeFile(`artifacts/movie-decoded-${browser}-${ss}.png`,Buffer.from(on.source.split(',')[1],'base64'));delete on.source;
   await p.screenshot({path:`artifacts/movie-${browser}-${ss}.png`});
   const modes=[{mode:'native-default',state:on}];
   await p.locator('.bpx-player-video-area').hover();await p.locator('.bpx-player-ctrl-wide').click();await p.waitForTimeout(250);
   const alternate=await inspect();delete alternate.source;modes.push({mode:'native-wide-toggle',state:alternate});
   for(const {state}of modes){assert.equal(state.fit,'contain');assert.ok(Math.abs(state.video.width/state.video.height-state.media[0]/state.media[1])<.003,JSON.stringify(state));assert.ok(state.layers.slice(0,7).every(l=>l.border.every(w=>parseFloat(w)===0)&&l.shadow==='none'&&l.outline==='none'),'No CSS player border/shadow');}
   await e.settings({enabled:false});await p.waitForTimeout(200);const off=await inspect();delete off.source;
   await e.settings({enabled:true});await p.waitForTimeout(200);on=await inspect();delete on.source;
   assert.equal(off.sourceHash,on.sourceHash,'Switching the effect must not alter any decoded source pixel');assert.equal(off.time,on.time);
   assert.ok(Math.abs(on.video.width/on.video.height-on.media[0]/on.media[1])<.003);assert.equal(on.fit,'contain');
   reports.push({browser,ss,authenticated:false,modes,off,on,passed:true});await writeFile('artifacts/movie-report.json',JSON.stringify({version,runAt:new Date().toISOString(),reports},null,2));
   console.log(`PASS ${browser} ${ss}: intrinsic aspect, no CSS border, identical complete decoded frame with effect off/on`);
   await p.close();
 }finally{await e.close();}
}
