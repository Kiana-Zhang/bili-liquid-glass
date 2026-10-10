import { chromium } from 'playwright';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startServer } from './server.mjs';

const command=promisify(execFile);
const args=new Map(process.argv.slice(2).map(arg=>arg.replace(/^--/,'').split('=')));
const soakMinutes=Number(args.get('soak-minutes')??30),phaseSeconds=Number(args.get('phase-seconds')??20);
const reportFile=args.get('report-file')??'artifacts/performance-report.json';
if(!path.resolve(reportFile).startsWith(path.resolve('artifacts')+path.sep))throw new Error('Report must stay under artifacts');
if(!Number.isFinite(soakMinutes)||soakMinutes<0||!Number.isFinite(phaseSeconds)||phaseSeconds<5)throw new Error('Invalid measurement duration');
await mkdir('artifacts/media',{recursive:true});
const report={startedAt:new Date().toISOString(),machine:{platform:os.platform(),release:os.release(),cpu:os.cpus()[0]?.model,logicalCores:os.cpus().length,totalMemoryBytes:os.totalmem()},method:'Local VP9 videos encoded with explicit 60 FPS timestamps; native installed browser; production rendering modules; headless; CPU is sum of browser process CPU seconds / wall seconds (100% = one core). GPU counters are Windows process engine utilization where available.',comparisons:[],soaks:[]};
const browserOptions={headless:true};
let saveQueue=Promise.resolve();
report.extensionVersion=JSON.parse(await readFile('package.json','utf8')).version;
report.requestedPhaseSeconds=phaseSeconds;
report.settings={theme:'dark',quality:'balanced',transparency:Number(args.get('transparency')??65),spread:Number(args.get('spread')??35),softness:Number(args.get('softness')??65),projection:'diagonal'};
for(const [key,max]of [['transparency',100],['spread',200],['softness',100]])if(!Number.isFinite(report.settings[key])||report.settings[key]<0||report.settings[key]>max)throw new Error(`Invalid ${key}`);
async function save(){const json=JSON.stringify(report,null,2);saveQueue=saveQueue.then(()=>writeFile(reportFile,json));await saveQueue;}
async function createMedia(browser) {
  const page=await browser.newPage();await page.goto(host.url+'/tests/media.html');
  await page.addScriptTag({path:'node_modules/webm-muxer/build/webm-muxer.js'});
  for(const [label,w,h]of [['1080p60',1920,1080],['4k60',3840,2160]]) {
    const file=`artifacts/media/${label}-encoded.webm`;
    try{await readFile(file);continue;}catch{}
    console.log(`Generating local encoded ${label} test clip`);
    const result=await page.evaluate(async({w,h})=>{
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
      const ctx=canvas.getContext('2d',{alpha:false});
      const draw=i=>{
        const gradient=ctx.createLinearGradient(0,0,w,h);gradient.addColorStop(0,'#15b5a5');gradient.addColorStop(.5,'#313861');gradient.addColorStop(1,'#ad619c');
        ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);ctx.fillStyle='#efb563';ctx.fillRect((i*11)%(w+250)-250,h*.3,w*.12,h*.25);
      };
      const target=new WebMMuxer.ArrayBufferTarget();
      const muxer=new WebMMuxer.Muxer({target,video:{codec:'V_VP9',width:w,height:h,frameRate:60}});
      let encodingError=null,frames=0;
      const encoder=new VideoEncoder({output:(chunk,metadata)=>{muxer.addVideoChunk(chunk,metadata);frames++;},error:error=>encodingError=String(error)});
      encoder.configure({codec:'vp09.00.10.08',width:w,height:h,bitrate:w>2000?12000000:5000000,framerate:60,latencyMode:'realtime',alpha:'discard'});
      const start=performance.now();
      for(let i=0;i<240;i++){
        draw(i);const frame=new VideoFrame(canvas,{timestamp:Math.round(i*1000000/60),duration:Math.round(1000000/60)});
        encoder.encode(frame,{keyFrame:i%120===0});frame.close();
        if(encoder.encodeQueueSize>6)await encoder.flush();
        if(encodingError)throw new Error(encodingError);
      }
      await encoder.flush();encoder.close();muxer.finalize();
      if(frames!==240)throw new Error(`Expected 240 frames, encoded ${frames}`);
      return{bytes:[...new Uint8Array(target.buffer)],elapsedMs:performance.now()-start,frames};
    },{w,h});
    await writeFile(file,new Uint8Array(result.bytes));console.log(`${label}: ${result.bytes.length} bytes, recording ${result.elapsedMs.toFixed(0)} ms`);
  }
  await page.close();
}

async function memoryAndGpu(processes) {
  if(os.platform()!=='win32')return{available:false};
  const ids=processes.map(p=>Number(p.id)).filter(Number.isInteger);
  if(!ids.length)return{available:false};
  // Numeric process IDs only; no user strings enter PowerShell source.
  const script=`$taskIds=@(${ids.join(',')}); $taskProcesses=Get-Process -Id $taskIds -ErrorAction SilentlyContinue; $taskGpu=Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^pid_(\\d+)_' -and $taskIds -contains [int]$Matches[1] }; [PSCustomObject]@{workingSetBytes=($taskProcesses | Measure-Object WorkingSet64 -Sum).Sum;privateBytes=($taskProcesses | Measure-Object PrivateMemorySize64 -Sum).Sum;gpuEnginePercentSum=($taskGpu | Measure-Object UtilizationPercentage -Sum).Sum;gpuCounterCount=@($taskGpu).Count} | ConvertTo-Json -Compress`;
  try{const{stdout}=await command('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:10000});return{available:true,...JSON.parse(stdout.trim())};}
  catch(error){return{available:false,reason:error.message};}
}

async function metrics(page,session,system,collect=false) {
  if(collect)await session.send('HeapProfiler.collectGarbage');
  const [performance,processes,video]=await Promise.all([
    session.send('Performance.getMetrics'),system.send('SystemInfo.getProcessInfo'),
    page.evaluate(()=>{const v=document.querySelector('video'),q=v.getVideoPlaybackQuality();return{width:v.videoWidth,height:v.videoHeight,totalFrames:q.totalVideoFrames,droppedFrames:q.droppedVideoFrames,diagnostics:window.perfController?.diagnostics()??null,ambientCount:document.querySelectorAll('.blg-ambient').length};}),
  ]);
  const map=Object.fromEntries(performance.metrics.map(m=>[m.name,m.value]));
  return{at:Date.now(),cpuTime:processes.processInfo.reduce((total,p)=>total+p.cpuTime,0),processes:processes.processInfo,jsHeapBytes:map.JSHeapUsedSize,nodes:map.Nodes,listeners:map.JSEventListeners,video,...await memoryAndGpu(processes.processInfo)};
}
async function prepare(page,label,enabled=true) {
  await page.goto(host.url+'/video/fixture/?test');
  await page.evaluate(async({label,enabled,configuration})=>{
    window.fixtureMedia.stop();window.fixtureMedia=null;document.querySelector('#pause').onclick=null;
    const v=document.querySelector('video');v.srcObject=null;v.src=`/artifacts/media/${label}-encoded.webm`;v.loop=true;v.muted=true;await v.play();
    const t=window.blgTest,store=new t.SettingsStore(t.backend);await store.init();await store.reset();
    window.perfStore=store;window.perfTheme=new t.GlassTheme();
    const adapter=new t.PageAdapter('video'),binding=adapter.findPlayer();
    const c=new t.PlaybackController(binding,adapter,()=>{});window.perfController=c;
    await store.update(configuration);
    const settings={...store.value,enabled};window.perfTheme.configure(settings,adapter);c.configure(settings);
  },{label,enabled,configuration:report.settings});
  await page.waitForTimeout(2000);
}

async function comparisons(browser,name) {
  const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'dark'});
  const session=await page.context().newCDPSession(page);await session.send('Performance.enable');
  const system=await browser.newBrowserCDPSession();const info=await system.send('SystemInfo.getInfo');
  for(const label of ['1080p60','4k60']) {
    const phases=[];
    for(const enabled of [false,true]) {
      await prepare(page,label,enabled);const before=await metrics(page,session,system,true);
      await page.waitForTimeout(phaseSeconds*1000);const after=await metrics(page,session,system,true);
      const wallSeconds=(after.at-before.at)/1000,total=after.video.totalFrames-before.video.totalFrames,dropped=after.video.droppedFrames-before.video.droppedFrames;
      phases.push({enabled,wallSeconds,renderedFps:total/wallSeconds,totalFrames:total,droppedFrames:dropped,dropPercent:total?dropped/total*100:0,cpuPercentOneCore:(after.cpuTime-before.cpuTime)/wallSeconds*100,jsHeapBytes:after.jsHeapBytes,workingSetBytes:after.workingSetBytes,privateBytes:after.privateBytes,gpuEnginePercentSum:after.gpuEnginePercentSum,gpuCounterCount:after.gpuCounterCount,diagnostics:after.video.diagnostics});
      console.log(`${name} ${label} ${enabled?'ON':'OFF'}: ${phases.at(-1).dropPercent.toFixed(3)}% dropped, CPU ${phases.at(-1).cpuPercentOneCore.toFixed(1)}% of one core`);
      await save();
    }
    report.comparisons.push({browser:name,version:browser.version(),clip:label,gpu:info.gpu,phases,dropIncreasePercentagePoints:phases[1].dropPercent-phases[0].dropPercent,targetMet:phases.every(p=>p.renderedFps>=55)&&phases[1].dropPercent-phases[0].dropPercent<=1});await save();
  }
  await page.close();
}

async function soak(browser,name) {
  const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'dark'});
  const session=await page.context().newCDPSession(page);await session.send('Performance.enable');
  const system=await browser.newBrowserCDPSession();await prepare(page,'1080p60',true);
  const result={browser:name,version:browser.version(),requestedMinutes:soakMinutes,startedAt:new Date().toISOString(),samples:[],replacementChecks:[]};report.soaks.push(result);
  const start=Date.now(),deadline=start+soakMinutes*60000;let nextReplacement=start+300000;
  result.samples.push(await metrics(page,session,system,true));await save();
  while(Date.now()<deadline) {
    await page.waitForTimeout(Math.min(30000,deadline-Date.now()));
    if(Date.now()>=nextReplacement) {
      const replacement=await page.evaluate(async()=>{
        const t=window.blgTest,old=document.querySelector('video'),next=old.cloneNode();window.perfController.dispose();old.replaceWith(next);await next.play();
        const adapter=new t.PageAdapter('video');window.perfController=new t.PlaybackController(adapter.findPlayer(),adapter,()=>{});window.perfController.configure(window.perfStore.value);
        return{ambientCount:document.querySelectorAll('.blg-ambient').length};
      });result.replacementChecks.push({at:Date.now(),...replacement});nextReplacement+=300000;
    }
    result.samples.push(await metrics(page,session,system,true));await save();
    const last=result.samples.at(-1);console.log(`SOAK ${name}: ${((Date.now()-start)/60000).toFixed(1)} min · heap ${(last.jsHeapBytes/1048576).toFixed(2)} MB · nodes ${last.nodes} · renderers ${last.video.ambientCount}`);
  }
  result.elapsedMinutes=(Date.now()-start)/60000;
  const first=result.samples[0],last=result.samples.at(-1);
  result.heapGrowthBytes=last.jsHeapBytes-first.jsHeapBytes;result.nodeGrowth=last.nodes-first.nodes;result.completedAt=new Date().toISOString();await save();await page.close();
}

const host=await startServer();
let chrome,edge;
try {
  chrome=await chromium.launch({...browserOptions,channel:'chrome'});await createMedia(chrome);await comparisons(chrome,'Chrome');
  edge=await chromium.launch({...browserOptions,channel:'msedge'});await comparisons(edge,'Edge');
  console.log(`Starting ${soakMinutes}-minute simultaneous longevity tests; comparison measurements above were sequential.`);
  await Promise.all([soak(chrome,'Chrome'),soak(edge,'Edge')]);
  report.completedAt=new Date().toISOString();await save();
}catch(error){report.error=String(error);await save();throw error;}
finally{await chrome?.close();await edge?.close();await host.close();}
