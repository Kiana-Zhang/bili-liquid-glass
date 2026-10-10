import { build } from 'esbuild';
import { zipSync, zlibSync } from 'fflate';
import { mkdir, readFile, writeFile, copyFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const version=JSON.parse(await readFile(path.join(root,'package.json'),'utf8')).version;
const manifest=JSON.parse(await readFile(path.join(root,'src','manifest.json'),'utf8'));
if(manifest.version!==version) throw new Error('package.json and manifest.json versions must match');
// Only generated directories under this project can ever be removed.
if (path.dirname(dist)!==root || path.basename(dist)!=='dist') throw new Error('Invalid build output');
await rm(dist,{recursive:true,force:true}); await mkdir(dist,{recursive:true});
const common=path.join(dist,'common'); await mkdir(common,{recursive:true});
await build({entryPoints:[path.join(root,'src/content.ts'),path.join(root,'src/popup.ts')],outdir:common,bundle:true,minify:true,target:'chrome121',format:'iife',loader:{'.css':'text'},legalComments:'none',metafile:true}).then(async result=>{
  await writeFile(path.join(dist,'build-meta.json'),JSON.stringify(result.metafile,null,2));
});
for (const name of ['manifest.json','theme.css','popup.html','popup.css']) await copyFile(path.join(root,'src',name),path.join(common,name));
await copyFile(path.join(root,'LICENSE'),path.join(common,'LICENSE.txt'));
await copyFile(path.join(root,'PRIVACY.md'),path.join(common,'PRIVACY.md'));
await copyFile(path.join(root,'THIRD_PARTY_NOTICES.txt'),path.join(common,'THIRD_PARTY_NOTICES.txt'));

function crc32(bytes) {
  let crc=0xffffffff;
  for (const byte of bytes) {
    crc^=byte;
    for(let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function chunk(name,bytes) {
  const type=Buffer.from(name), output=Buffer.alloc(bytes.length+12);
  output.writeUInt32BE(bytes.length); type.copy(output,4); Buffer.from(bytes).copy(output,8);
  output.writeUInt32BE(crc32(Buffer.concat([type,Buffer.from(bytes)])),bytes.length+8);
  return output;
}
function icon(size) {
  const scanlines=Buffer.alloc((size*4+1)*size);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const nx=(x+.5)/size,ny=(y+.5)/size;
    const round=Math.hypot(Math.max(.18-nx,0,nx-.82),Math.max(.18-ny,0,ny-.82));
    let color=[Math.round(40+76*ny),Math.round(163-44*ny+32*nx),Math.round(190+40*ny),round>.18?0:255];
    const onScreen=nx>.22&&nx<.78&&ny>.30&&ny<.69;
    if(onScreen) {
      const edge=nx<.25||nx>.75||ny<.33||ny>.66;
      color=edge?[239,255,255,255]:[26,58,82,255];
      if(Math.hypot(nx-.5,ny-.49)<.105) color=[105,219,235,255];
    }
    const offset=y*(size*4+1)+1+x*4; color.forEach((c,i)=>scanlines[offset+i]=c);
  }
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlibSync(scanlines)),chunk('IEND',new Uint8Array())]);
}
await mkdir(path.join(common,'icons'));
for(const size of [16,32,48,128]) await writeFile(path.join(common,'icons',`${size}.png`),icon(size));
async function collect(directory,prefix='') {
  const result={};
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const key=prefix+entry.name,full=path.join(directory,entry.name);
    if(entry.isDirectory()) Object.assign(result,await collect(full,key+'/'));
    else result[key]=new Uint8Array(await readFile(full));
  }
  return result;
}
const files=await collect(common);
const summary=[];
for(const browser of ['chrome','edge']) {
  const directory=path.join(dist,browser); await mkdir(directory);
  for(const [name,bytes] of Object.entries(files)) {
    const destination=path.join(directory,name); await mkdir(path.dirname(destination),{recursive:true}); await writeFile(destination,bytes);
  }
  const zip=zipSync(files,{level:9}),name=`bili-liquid-glass-${browser}-${version}.zip`;
  if(zip.length>300*1024) throw new Error(`${browser}: package exceeds 300 KB`);
  await writeFile(path.join(dist,name),zip);
  summary.push({browser,zip:name,zipBytes:zip.length,unpackedBytes:Object.values(files).reduce((total,b)=>total+b.length,0)});
}
await rm(common,{recursive:true});
await mkdir(path.join(root,'artifacts'),{recursive:true});
await writeFile(path.join(root,'artifacts','build-report.json'),JSON.stringify({version,packages:summary},null,2));
for(const row of summary) console.log(`${row.browser}: ${row.zip} · ${(row.zipBytes/1024).toFixed(1)} KB ZIP · ${(row.unpackedBytes/1024).toFixed(1)} KB unpacked`);
// Build the test harness separately; it never enters either extension ZIP.
await build({entryPoints:[path.join(root,'tests/harness.ts')],outfile:path.join(root,'artifacts/harness.js'),bundle:true,target:'chrome121',format:'iife',loader:{'.css':'text'}});
await stat(path.join(dist,'chrome','manifest.json'));
