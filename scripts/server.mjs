import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webm':'video/webm'};
export async function startServer(port=0) {
  const server=http.createServer(async(req,res)=>{
    let pathname;
    try {pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}
    catch {res.writeHead(400);res.end('Bad request');return;}
    if(pathname==='/'||pathname.startsWith('/video/')||pathname.startsWith('/bangumi/play/')) pathname='/tests/fixture.html';
    const filename=path.resolve(root,'.'+pathname);
    if(!filename.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
    try {const content=await readFile(filename);res.writeHead(200,{'Content-Type':types[path.extname(filename)]??'application/octet-stream','Cache-Control':'no-store'});res.end(content);}
    catch {res.writeHead(404);res.end('Not found');}
  });
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});
  });
  return {server,url:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
