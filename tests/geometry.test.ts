import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundedSize, effectLayout, effectVisibility, exclusionPolygon, fittedVideoRect } from '../src/geometry.ts';
import { pageKind } from '../src/adapter.ts';
import { AdaptiveQuality, FrameGate } from '../src/scheduler.ts';

test('routes include normal video and episodes, exclude live, home and malformed paths',()=>{
  assert.equal(pageKind('/video/BVtest/'),'video');assert.equal(pageKind('/bangumi/play/ep123'),'bangumi');
  for(const path of ['/','/video/','/bangumi/','/live/123'])assert.equal(pageKind(path),null);
});
test('fullscreen excludes actual content, leaving letterbox margins',()=>{
  const viewport={x:0,y:0,width:1920,height:1080};
  const video=fittedVideoRect(viewport,1440,1080);
  assert.deepEqual(video,{x:240,y:0,width:1440,height:1080});
  const layout=effectLayout(video,viewport,35,true);assert.deepEqual(layout.outer,viewport);
  const clip=exclusionPolygon(layout);assert.match(clip,/240px 0px/);assert.match(clip,/1680px 1080px/);
  assert.deepEqual(fittedVideoRect(viewport,1920,1080),viewport);
});
test('normal halo bounds and portrait buffers stay bounded',()=>{
  const video={x:100,y:100,width:800,height:450},viewport={x:0,y:0,width:1200,height:900};
  const layout=effectLayout(video,viewport,100,false);
  const l=video.x-layout.outer.x,r=layout.outer.x+layout.outer.width-video.x-video.width;
  assert.ok(Math.abs(l/100-r/300)<1e-9);
  const centered=effectLayout({...video,x:200},viewport,100,false);
  assert.equal(200-centered.outer.x,centered.outer.x+centered.outer.width-1000);
  assert.ok(effectLayout(video,viewport,200,false).outer.width>layout.outer.width);
  const shifted=effectLayout({...video,y:-200},viewport,100,false);
  assert.equal(shifted.outer.width,layout.outer.width);assert.equal(shifted.outer.height,layout.outer.height);
  assert.deepEqual(boundedSize(1080,1920,256),[144,256]);assert.deepEqual(boundedSize(3840,2160,512),[512,288]);
});
test('frame gate limits high refresh displays and quality only descends until reset',()=>{
  const gate=new FrameGate();let frames=0;for(let ms=0;ms<1000;ms+=1000/144)if(gate.accept(ms,24))frames++;
  assert.ok(frames<=25&&frames>=23);gate.reset();assert.ok(gate.accept(0,24));
  const adaptive=new AdaptiveQuality('fine');for(let i=0;i<150;i++)adaptive.sample(12);
  assert.equal(adaptive.current,'balanced');for(let i=0;i<120;i++)adaptive.sample(12);assert.equal(adaptive.current,'economy');
  assert.equal(adaptive.downgrade(),false);adaptive.reset();assert.equal(adaptive.current,'fine');
});

test('visibility follows the halo extent after the source video leaves the viewport',()=>{
  const viewport={x:0,y:0,width:1200,height:900};
  const video={x:100,y:-500,width:800,height:450};
  const layout=effectLayout(video,viewport,100,false);
  assert.ok(video.y+video.height<0);
  assert.equal(effectVisibility(layout.outer,viewport),1);
  const remaining=effectLayout({...video,y:-750},viewport,100,false);
  assert.ok(effectVisibility(remaining.outer,viewport)>0);
  assert.ok(effectVisibility(remaining.outer,viewport)<1);
  assert.equal(effectVisibility(effectLayout({...video,y:-900},viewport,100,false).outer,viewport),0);
});
