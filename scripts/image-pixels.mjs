import {unzlibSync} from 'fflate';
// Decode Playwright's 8-bit RGB/RGBA PNG screenshots for painted-output checks.
export function pngPixels(png) {
 let width,height,channels;const parts=[];
 for(let offset=8;offset<png.length;) {
  const size=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8),data=png.subarray(offset+8,offset+8+size);
  if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);channels=data[9]===6?4:3;if(data[8]!==8||![2,6].includes(data[9]))throw new Error('Unsupported test screenshot format');}
  if(type==='IDAT')parts.push(data);offset+=size+12;
 }
 const bytes=unzlibSync(Buffer.concat(parts)),stride=width*channels,pixels=new Uint8Array(stride*height);
 const paeth=(a,b,c)=>{const p=a+b-c,aa=Math.abs(p-a),bb=Math.abs(p-b),cc=Math.abs(p-c);return aa<=bb&&aa<=cc?a:bb<=cc?b:c;};
 for(let y=0;y<height;y++) {
  const filter=bytes[y*(stride+1)];
  for(let x=0;x<stride;x++) {
   const index=y*stride+x,a=x>=channels?pixels[index-channels]:0,b=y?pixels[index-stride]:0,c=y&&x>=channels?pixels[index-stride-channels]:0;
   const predictor=[0,a,b,Math.floor((a+b)/2),paeth(a,b,c)][filter];if(predictor===undefined)throw new Error('Invalid PNG filter');
   pixels[index]=(bytes[y*(stride+1)+1+x]+predictor)&255;
  }
 }
 return{width,height,channels,pixels};
}
export function pixelDifference(a,b) {
 const x=pngPixels(a),y=pngPixels(b);if(x.width!==y.width||x.height!==y.height)throw new Error('Screenshot dimensions differ');
 let sum=0;for(let i=0;i<x.width*x.height;i++)for(let c=0;c<3;c++)sum+=Math.abs(x.pixels[i*x.channels+c]-y.pixels[i*y.channels+c]);
 return sum/(x.width*x.height*3);
}
