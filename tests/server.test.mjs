import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { startServer } from '../scripts/server.mjs';

test('malformed URLs return 400 and leave the preview server usable',async()=>{
  const server=await startServer();
  try {
    const bad=await fetch(server.url+'/%E0%A4%A');
    assert.equal(bad.status,400);await bad.text();
    const good=await fetch(server.url+'/video/fixture/?test');
    assert.equal(good.status,200);assert.match(await good.text(),/Bili Liquid Glass/);
    const traversal=await fetch(server.url+'/%2e%2e%2fpackage.json');
    assert.equal(traversal.status,403);await traversal.text();
  } finally {await server.close();}
});

test('an occupied preview port rejects startup instead of emitting an uncaught error',async()=>{
  const server=await startServer();
  try {await assert.rejects(startServer(Number(new URL(server.url).port)),{code:'EADDRINUSE'});}
  finally {await server.close();}
});

test('invalid performance arguments fail before opening a listening server',async()=>{
  const child=spawn(process.execPath,['scripts/performance.mjs','--soak-minutes=-1'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  let error='';child.stderr.setEncoding('utf8');child.stderr.on('data',text=>{error+=text;});
  const timer=setTimeout(()=>child.kill(),5000);
  try {
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
    assert.equal(code,1);assert.match(error,/Invalid measurement duration/);
  } finally {clearTimeout(timer);if(child.exitCode===null)child.kill();}
});
