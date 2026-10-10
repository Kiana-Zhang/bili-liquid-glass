import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, SETTINGS_KEY, SettingsStore, normalizeSettings, type Settings, type StorageBackend } from '../src/settings.ts';

test('malformed and future settings are safe, defaults are immutable',()=>{
  assert.deepEqual(normalizeSettings(null),DEFAULTS);
  assert.deepEqual(normalizeSettings({version:3,enabled:false}),DEFAULTS);
  assert.deepEqual(normalizeSettings({enabled:'false',transparency:Infinity,quality:'ultra'}),DEFAULTS);
  assert.equal(normalizeSettings({transparency:-10,spread:1000}).transparency,0);
  assert.equal(normalizeSettings({transparency:-10,spread:1000}).spread,200);
  assert.equal(normalizeSettings({version:2,spread:175,softness:175,transparency:175}).spread,175);
  assert.equal(normalizeSettings({spread:-1}).spread,0);
  assert.equal(normalizeSettings({projection:'straight'}).projection,'straight');
  assert.equal(normalizeSettings({version:2}).projection,'diagonal');
  assert.equal(normalizeSettings({projection:'unexpected'}).projection,DEFAULTS.projection);
  assert.deepEqual(normalizeSettings({theme:['dark'],quality:['fine'],projection:['straight']}),DEFAULTS);
  assert.deepEqual(normalizeSettings({theme:{toString:()=> 'dark'},quality:{toString:()=> 'fine'},projection:{toString:()=> 'straight'}}),DEFAULTS);
  assert.equal(SETTINGS_KEY,'biliLiquidGlass.settings');
});

test('settings persist in order, external updates propagate, unsubscribe releases listener',async()=>{
  let stored:unknown,external:((raw:unknown)=>void)|undefined;
  let unlistened=false;
  const writes:Settings[]=[];
  const backend:StorageBackend={read:async()=>stored,write:async value=>{await new Promise(resolve=>setTimeout(resolve,3));writes.push(value);stored=value;external?.(value);},listen:listener=>{external=listener;return()=>{external=undefined;unlistened=true;};}};
  const store=new SettingsStore(backend);await store.init();
  const seen:Settings[]=[];const unsubscribe=store.subscribe(value=>seen.push(value));
  await Promise.all([store.update({transparency:22}),store.update({enabled:false}),store.update({theme:'dark'})]);
  assert.equal(writes.length,3);assert.equal(store.value.transparency,22);assert.equal(store.value.enabled,false);assert.equal(store.value.theme,'dark');
  const reloaded=new SettingsStore({...backend,listen:()=>()=>{}});await reloaded.init();assert.deepEqual(reloaded.value,store.value);
  external?.({...DEFAULTS,quality:'fine'});assert.equal(store.value.quality,'fine');
  unsubscribe();const count=seen.length;await store.reset();assert.equal(seen.length,count);
  store.dispose();assert.ok(unlistened);reloaded.dispose();
});

test('an earlier queued failure does not block later writes',async()=>{
  let attempts=0;
  const backend:StorageBackend={read:async()=>undefined,write:async()=>{if(++attempts===1)throw new Error('disk');},listen:()=>()=>{}};
  const store=new SettingsStore(backend);await store.init();
  const first=store.update({transparency:10}),second=store.update({transparency:80});
  await assert.rejects(first);await second;assert.equal(store.value.transparency,80);store.dispose();
});

test('v1 migrates opacity in reverse, removes independent controls, and persists v2',async()=>{
  const old={version:1,enabled:true,ambient:false,glass:true,brightness:100,glassOpacity:5,spread:100,softness:0,theme:'dark',quality:'fine'};
  const value=normalizeSettings(old);
  assert.deepEqual(value,{version:2,enabled:true,transparency:95,spread:100,softness:0,projection:'diagonal',theme:'dark',quality:'fine'});
  assert.equal(normalizeSettings({...old,enabled:false}).enabled,false);
  assert.equal(normalizeSettings({...old,ambient:false,glass:false}).enabled,false);
  assert.equal(normalizeSettings({...old,glassOpacity:0}).transparency,100);
  assert.equal(normalizeSettings({...old,glassOpacity:100}).transparency,0);
  let stored:unknown=old;
  const store=new SettingsStore({read:async()=>stored,write:async settings=>{stored=settings;},listen:()=>()=>{}});
  await store.init();assert.deepEqual(stored,value);store.dispose();
});

test('an external change after a local commit is reconciled when the write settles',async()=>{
  let stored:unknown,external:((raw:unknown)=>void)|undefined;
  let finishWrite!:()=>void;
  const backend:StorageBackend={
    read:async()=>stored,
    write:async value=>{stored=value;external?.(value);await new Promise<void>(resolve=>{finishWrite=resolve;});},
    listen:listener=>{external=listener;return()=>{external=undefined;};},
  };
  const store=new SettingsStore(backend);await store.init();
  const write=store.update({transparency:22});
  await new Promise(resolve=>setImmediate(resolve));
  stored={...DEFAULTS,theme:'dark',transparency:80};external?.(stored);
  finishWrite();await write;
  assert.deepEqual(store.value,stored);store.dispose();
});

test('a local commit after an external change keeps the actual final stored value',async()=>{
  let stored:unknown,external:((raw:unknown)=>void)|undefined;
  let commit!:()=>void;
  const backend:StorageBackend={
    read:async()=>stored,
    write:value=>new Promise<void>(resolve=>{commit=()=>{stored=value;resolve();};}),
    listen:listener=>{external=listener;return()=>{external=undefined;};},
  };
  const store=new SettingsStore(backend);await store.init();
  const write=store.update({transparency:22});
  await new Promise(resolve=>setImmediate(resolve));
  stored={...DEFAULTS,transparency:80};external?.(stored);
  commit();await write;
  assert.equal(store.value.transparency,22);assert.deepEqual(store.value,stored);store.dispose();
});

test('disposal during initialization prevents late migration writes',async()=>{
  let finishRead!:(raw:unknown)=>void,writes=0,listening=false;
  const store=new SettingsStore({
    read:()=>new Promise(resolve=>{finishRead=resolve;}),
    write:async()=>{writes++;},
    listen:()=>{listening=true;return()=>{listening=false;};},
  });
  const initialized=store.init();store.dispose();finishRead({version:1,glassOpacity:5});await initialized;
  assert.equal(writes,0);assert.equal(listening,false);assert.deepEqual(store.value,DEFAULTS);
});

test('a late reconciliation read cannot overwrite a newer local update',async()=>{
  let stored:unknown,external:((raw:unknown)=>void)|undefined,reads=0,writes=0;
  let finishWrite!:()=>void,finishRead!:(raw:unknown)=>void;
  const store=new SettingsStore({
    read:()=>++reads===2?new Promise(resolve=>{finishRead=resolve;}):Promise.resolve(stored),
    write:async value=>{
      stored=value;
      if(++writes===1){external?.(value);await new Promise<void>(resolve=>{finishWrite=resolve;});}
    },
    listen:listener=>{external=listener;return()=>{external=undefined;};},
  });
  await store.init();const first=store.update({transparency:22});
  await new Promise(resolve=>setImmediate(resolve));
  const older={...DEFAULTS,transparency:80};stored=older;external?.(stored);finishWrite();
  await new Promise(resolve=>setImmediate(resolve));
  await store.update({transparency:99});finishRead(older);await first;
  assert.equal(store.value.transparency,99);assert.deepEqual(store.value,stored);store.dispose();
});
