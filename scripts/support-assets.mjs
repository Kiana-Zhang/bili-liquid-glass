import qrcode from 'qrcode-generator';
import { zlibSync } from 'fflate';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { DONATION } from '../src/support.ts';

const directory = fileURLToPath(new URL('../assets/support/', import.meta.url));
await mkdir(directory, { recursive: true });
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name, bytes) {
  const type = Buffer.from(name), output = Buffer.alloc(bytes.length + 12);
  output.writeUInt32BE(bytes.length); type.copy(output, 4); Buffer.from(bytes).copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([type, Buffer.from(bytes)])), bytes.length + 8);
  return output;
}
for (const key of ['alipay', 'wechat']) {
  const qr = qrcode(0, 'M'); qr.addData(DONATION[key], 'Byte'); qr.make();
  const modules = qr.getModuleCount(), scale = 6, size = (modules + 8) * scale;
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const row = Math.floor(y / scale) - 4, column = Math.floor(x / scale) - 4;
    const dark = row >= 0 && column >= 0 && row < modules && column < modules && qr.isDark(row, column);
    const offset = y * (size * 4 + 1) + 1 + x * 4;
    pixels.fill(dark ? 0 : 255, offset, offset + 3); pixels[offset + 3] = 255;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlibSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
  await writeFile(`${directory}/${key}.png`, png);
  console.log(`Generated ${key}.png from the extension's payment payload`);
}
