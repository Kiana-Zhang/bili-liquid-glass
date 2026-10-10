import { startServer } from './server.mjs';
const {url}=await startServer(4173);
console.log(`Local preview: ${url}/video/fixture/`);
console.log('Synthetic video; no external media, account, or network service. Ctrl+C to stop.');
