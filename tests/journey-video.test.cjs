const {dismissFolderPrompt}=require('./helpers/folder-prompt.cjs');
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-webgl']});});
after(async()=>browser?.close());
const base=process.env.STUDIO_URL||'http://127.0.0.1:8770';
const fixture=()=>({version:1,activeTrip:'late',units:'imperial',visited:[],updatedAt:1,trips:[
 {id:'late',name:'Summer flight',visible:true,color:'#bb6842',items:[{id:'same',kind:'segment',mode:'plane',name:'Into the sky',endNode:{name:'Sky destination',coordinates:[-119.4,35.3],important:true},start:'2025-07-01',coordinates:[[-119.64,35.2],[-119.4,35.3]]},{id:'pin',kind:'point',name:'Independent place',coordinates:[-119.8,35.3]}]},
 {id:'early',name:'Spring adventures',visible:true,color:'#2c8068',items:['car','train','walk'].map((mode,i)=>({id:i?'leg-'+i:'same',name:mode,kind:'segment',mode,start:'2025-03-0'+(i+1),coordinates:[[-120+i*.12,35+i*.05],[-119.88+i*.12,35.05+i*.05]]})).concat({id:'hidden-leg',kind:'segment',name:'Do not export',mode:'car',visible:false,coordinates:[[30,40],[31,41]]})},
 {id:'hidden',name:'Hidden journey',visible:false,items:[{id:'hide',kind:'segment',mode:'car',name:'Hidden',coordinates:[[20,40],[21,41]]}]}
]});
async function setup({fallback=false,unsupported=false,mobile=false,language='en'}={}){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({data,fallback,unsupported,language})=>{data.language=language;localStorage.setItem('wanderlust-studio-v1',JSON.stringify(data));if(fallback)Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined});if(unsupported)window.VideoEncoder=undefined;
 window.__maps=[];let lib;Object.defineProperty(window,'maplibregl',{configurable:true,get:()=>lib,set(v){lib=v;const Original=v.Map;v.Map=class extends Original{constructor(o){super(o);window.__maps.push(this);}}}});
 },{data:fixture(),fallback,unsupported,language});
 await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'base',type:'background',paint:{'background-color':'#e7ede6'}}]}}));
 await page.goto(base+'/journey-studio.html');await dismissFolderPrompt(page);await page.waitForFunction(()=>!document.querySelector('#play-journey').disabled);
 if(!fallback)await page.waitForFunction(()=>__maps[0]?.getLayer('studio-lines')&&!__maps[0].isMoving());else await page.waitForFunction(()=>!document.querySelector('#studio-fallback').hidden);
 await page.evaluate(async()=>{const {JourneyPlayback}=await import('/js/journey-playback.mjs'),advance=JourneyPlayback.prototype.advance;JourneyPlayback.prototype.advance=function(...args){window.__player=this;return advance.apply(this,args);};document.querySelector('#play-journey').click();window.__player.pause();window.__player.seek(0);});
 await page.locator('#player-speed').selectOption('4');
 return {context,page,errors};
}
async function open(page){await page.locator('#player-video').click();await page.waitForFunction(()=>!document.querySelector('#export-video').disabled);}
async function fileInfo(page){
 await page.waitForFunction(()=>document.querySelector('#video-result').readyState>=2);
 return page.evaluate(async()=>{const v=document.querySelector('#video-result'),blob=await(await fetch(v.src)).blob(),lib=await import('/js/vendor/mediabunny-1.66.4.mjs');const input=new lib.Input({source:new lib.BlobSource(blob),formats:lib.ALL_FORMATS}),track=await input.getPrimaryVideoTrack(),stats=await track.computePacketStats();const info={width:v.videoWidth,height:v.videoHeight,duration:v.duration,codec:await track.getCodec(),stats};input.dispose();
 await new Promise(resolve=>{v.addEventListener('seeked',resolve,{once:true});v.currentTime=Math.max(0,v.duration-1/60);});
 const canvas=document.createElement('canvas');canvas.width=v.videoWidth;canvas.height=v.videoHeight;const ctx=canvas.getContext('2d');ctx.drawImage(v,0,0);const decoded=ctx.getImageData(0,0,canvas.width,canvas.height).data,preview=document.querySelector('#video-preview').getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let sum=0;for(let i=0;i<decoded.length;i+=4)sum+=Math.abs(decoded[i]-preview[i])+Math.abs(decoded[i+1]-preview[i+1])+Math.abs(decoded[i+2]-preview[i+2]);return {...info,error:sum/(decoded.length/4*3)};});
}
for(const orientation of ['landscape','portrait'])test('real H.264 MP4 preserves '+orientation+' framing, selected chronological routes, rate and the live camera',async()=>{
 const {context,page,errors}=await setup();try{
 await page.locator('#player-follow').uncheck();
 const before=await page.evaluate(()=>({center:__maps[0].getCenter().toArray(),zoom:__maps[0].getZoom(),pitch:__maps[0].getPitch(),bearing:__maps[0].getBearing(),data:localStorage.getItem('wanderlust-studio-v1')}));
 await open(page);if(orientation==='portrait'){await page.locator('[data-video-orientation=portrait]').click();await page.waitForFunction(()=>!document.querySelector('#export-video').disabled);}
 assert.deepEqual(await page.locator('#video-journeys li').allTextContents(),['Spring adventures','Summer flight']);assert.match(await page.locator('#video-summary').textContent(),/2 journeys · 4 segments · 4×/);assert.match(await page.locator('#video-view').textContent(),/Minimal.*Fixed camera/);
 const snapshot=await page.evaluate(async()=>{const {captureVideoSettings,videoTiming}=await import('/js/journey-video.mjs'),s=captureVideoSettings(__player.map,__player,JSON.parse(localStorage.getItem('wanderlust-studio-v1'))),exportMap=__maps.at(-1);return {duration:videoTiming(s.plan,s.rate).duration,coords:exportMap.getSource('print-routes')._data.features.map(f=>f.geometry.coordinates),center:exportMap.getCenter().toArray(),zoom:exportMap.getZoom(),expectedZoom:s.camera.zoom+Math.log2(exportMap.getContainer().clientHeight/s.camera.height)};});
 assert.deepEqual(snapshot.center,before.center);assert.ok(Math.abs(snapshot.zoom-snapshot.expectedZoom)<1e-8);assert.equal(snapshot.coords.length,4);assert.ok(!JSON.stringify(snapshot.coords).includes('[30,40]'));
 await page.locator('#video-seek').fill('500');await page.waitForFunction(()=>!document.querySelector('#export-video').disabled);
 const download=page.waitForEvent('download');await page.locator('#export-video').click();const artifact=await download;const path='/tmp/studio-video-'+orientation+'.mp4';await artifact.saveAs(path);
 const bytes=await fs.readFile(path);assert.equal(bytes.toString('ascii',4,8),'ftyp');assert.ok(bytes.includes(Buffer.from('avc1')));assert.ok(bytes.includes(Buffer.from('moov')));
 const info=await fileInfo(page);assert.equal(info.codec,'avc');assert.equal(info.width,orientation==='portrait'?1080:1920);assert.equal(info.height,orientation==='portrait'?1920:1080);assert.ok(Math.abs(info.duration-snapshot.duration)<=1/30+.001);assert.ok(info.error<3,JSON.stringify(info));assert.ok(Math.abs(info.stats.averagePacketRate-30)<.01);console.log(orientation,JSON.stringify(info));
 const tempFiles=await page.evaluate(async()=>{const root=await navigator.storage.getDirectory(),names=[];for await(const name of root.keys())if(name.startsWith('.journey-video-'))names.push(name);return names;});assert.deepEqual(tempFiles,[]);
 assert.equal(await page.locator('[data-video-map]').count(),0);const after=await page.evaluate(()=>({center:__maps[0].getCenter().toArray(),zoom:__maps[0].getZoom(),pitch:__maps[0].getPitch(),bearing:__maps[0].getBearing(),data:localStorage.getItem('wanderlust-studio-v1')}));assert.deepEqual(after,before);
 assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('3D, globe and satellite style snapshots keep current projection, pitch, bearing, zoom scale and follow behavior',async()=>{
 const {context,page,errors}=await setup();try{
 const results=await page.evaluate(async()=>{
  const {captureVideoSettings,JourneyVideoRenderer}=await import('/js/journey-video.mjs'),data=JSON.parse(localStorage.getItem('wanderlust-studio-v1')),live=__player.map,output=[];
  for(const view of ['3d','globe']){
   live.view=view;live.map.setProjection({type:view==='globe'?'globe':'mercator'});live.map.jumpTo({center:[-119.7,35.1],zoom:view==='globe'?1.8:7.5,pitch:view==='3d'?42:0,bearing:27,padding:0});
   const snapshot=captureVideoSettings(live,__player,data);snapshot.style.sources.imagery={type:'raster',tiles:['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVocAAAAASUVORK5CYII='],tileSize:256};snapshot.style.layers.push({id:'satellite-layer',type:'raster',source:'imagery'});snapshot.theme='satellite';
   const r=new JourneyVideoRenderer(snapshot,'landscape');try{await r.init();const initial={pitch:r.native.getPitch(),bearing:r.native.getBearing(),projection:r.native.getProjection()?.type||'mercator',source:r.native.getSource('imagery').type,scale:r.native.getZoom()-(view==='globe'?Math.log2(Math.cos(r.native.getCenter().lat*Math.PI/180)):0)};
    await r.render(snapshot.plan.total/snapshot.rate*.7);const next=r.painter.frame.position,center=r.native.getCenter().toArray(),scale=r.native.getZoom()-(view==='globe'?Math.log2(Math.cos(r.native.getCenter().lat*Math.PI/180)):0);output.push({view,initial,center,next,scale,pitch:snapshot.camera.pitch,bearing:snapshot.camera.bearing});
   }finally{r.dispose();}
  }return output;
 });
 for(const r of results){assert.equal(r.initial.projection,r.view==='globe'?'globe':'mercator');assert.equal(r.initial.source,'raster');assert.equal(r.initial.pitch,r.pitch);assert.equal(r.initial.bearing,r.bearing);assert.ok(Math.abs(r.scale-r.initial.scale)<1e-8);assert.ok(r.center.every((v,i)=>Math.abs(v-r.next[i])<1e-8));}
 assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('cancelling or closing export releases maps and temporary files and allows a fresh export',async()=>{
 const {context,page,errors}=await setup();try{
 let downloads=0;page.on('download',()=>downloads++);await page.locator('#player-speed').selectOption('1');await open(page);await page.locator('#export-video').click();await page.waitForFunction(()=>document.querySelector('#video-progress').value>0);await page.locator('#cancel-video').click();await page.waitForFunction(()=>!document.querySelector('#retry-video').hidden);
 assert.match(await page.locator('#video-status').textContent(),/cancelled/);assert.equal(downloads,0);assert.equal(await page.locator('[data-video-map]').count(),0);
 const files=await page.evaluate(async()=>{const root=await navigator.storage.getDirectory(),names=[];for await(const name of root.keys())names.push(name);return names.filter(n=>n.startsWith('.journey-video-'));});assert.deepEqual(files,[]);
 await page.locator('#retry-video').click();await page.waitForFunction(()=>!document.querySelector('#export-video').disabled);await page.locator('#export-video').click();await page.locator('[data-close=video-dialog]').click();await page.locator('#player-video').click();await page.waitForFunction(()=>!document.querySelector('#export-video').disabled);assert.equal(await page.locator('[data-video-map]').count(),1);assert.equal(await page.locator('#export-video').isVisible(),true);
 await page.locator('[data-close=video-dialog]').click();await page.waitForFunction(()=>!document.querySelector('[data-video-map]'));assert.equal(await page.locator('[data-video-map]').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('unsupported MP4 encoder cannot be re-enabled by preview scrubbing',async()=>{
 const {context,page,errors}=await setup({unsupported:true});try{
 await page.locator('#player-video').click();await page.waitForFunction(()=>document.querySelector('#video-status').textContent.includes('not available'));assert.ok(await page.locator('#export-video').isDisabled());await page.locator('#video-seek').fill('800');await page.waitForTimeout(200);assert.ok(await page.locator('#export-video').isDisabled());await page.locator('[data-close=video-dialog]').click();await page.waitForFunction(()=>!document.querySelector('[data-video-map]'));assert.equal(await page.locator('[data-video-map]').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('fallback map exports real MP4; Chinese portrait dialog fits a mobile screen',async()=>{
 const {context,page,errors}=await setup({fallback:true,mobile:true,language:'zh'});try{
 await open(page);await page.locator('[data-video-orientation=portrait]').click();await page.waitForFunction(()=>!document.querySelector('#export-video').disabled);assert.equal(await page.locator('#video-title').textContent(),'导出动画视频');assert.match(await page.locator('#video-summary').textContent(),/2 个行程.*4 段路线/);assert.ok(await page.locator('#video-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth));
 await page.screenshot({path:'/tmp/studio-video-mobile-zh.png'});const download=page.waitForEvent('download');await page.locator('#export-video').click();await(await download).saveAs('/tmp/studio-video-fallback.mp4');const info=await fileInfo(page);assert.equal(info.width,1080);assert.equal(info.height,1920);assert.equal(info.codec,'avc');assert.ok(info.error<3);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('no selected routes explains the empty state without creating a render map',async()=>{
 const {context,page,errors}=await setup();try{
 await page.locator('#journeys-hide-all').click();await page.locator('#open-map-export').click();await page.locator('#open-video-export').click();assert.match(await page.locator('#video-status').textContent(),/Select at least one journey/);assert.ok(await page.locator('#export-video').isDisabled());assert.equal(await page.locator('[data-video-map]').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('export waits for a pending map theme instead of capturing the startup background',async()=>{
 const {context,page,errors}=await setup();try{
 await page.route('https://tiles.openfreemap.org/styles/dark',async r=>{await new Promise(resolve=>setTimeout(resolve,650));await r.fulfill({json:{version:8,sources:{},layers:[{id:'loaded-night',type:'background',paint:{'background-color':'#132638'}}]}});});
 await page.locator('#open-settings').click();await page.locator('#map-theme').selectOption('dark');await page.locator('[data-close=settings-dialog]').last().click();await page.locator('#player-video').click();await page.waitForFunction(()=>!document.querySelector('#export-video').disabled);
 assert.match(await page.locator('#video-view').textContent(),/Night/);assert.equal(await page.evaluate(()=>__maps.at(-1).getPaintProperty('loaded-night','background-color')),'#132638');assert.equal(await page.evaluate(()=>__player.map.themeLoading),false);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

for(const [resolution,fps,orientation,fallback] of [[720,24,'landscape',false],[1440,60,'portrait',false],[2160,30,'landscape',false],[720,25,'portrait',true],[1080,50,'landscape',true]])test(`quality selection exports ${resolution}p ${fps} fps ${orientation}${fallback?' on fallback':''}`,async()=>{
 const {context,page,errors}=await setup({fallback,language:'zh'});try{
  await page.locator('#player-speed').selectOption('16');await page.locator('#player-follow').uncheck();await open(page);
  const framing=await page.evaluate(()=>{const m=__maps.at(-1);return m?{center:m.getCenter().toArray(),zoom:m.getZoom()}:null;});
  await page.locator('#video-resolution').selectOption(String(resolution));
  await page.locator('#video-fps').selectOption(String(fps));
  await page.locator(`[data-video-orientation=${orientation}]`).click();
  await page.waitForFunction(({resolution,fps,orientation})=>{const c=document.querySelector('#video-preview');return !document.querySelector('#export-video').disabled&&c.width===(orientation==='portrait'?resolution:resolution*16/9)&&document.querySelector('#video-size').textContent.includes(fps+' fps');},{resolution,fps,orientation});
  assert.equal(await page.locator('label[for=video-resolution] span').textContent(),'分辨率');assert.equal(await page.locator('label[for=video-fps] span').textContent(),'帧率');
  if(!fallback){const next=await page.evaluate(()=>({center:__maps.at(-1).getCenter().toArray(),zoom:__maps.at(-1).getZoom()}));assert.deepEqual(next.center,framing.center);if(orientation==='landscape')assert.equal(next.zoom,framing.zoom);}
  const expected=await page.evaluate(async()=>{const {captureVideoSettings}=await import('/js/journey-video.mjs'),s=captureVideoSettings(__player.map,__player,JSON.parse(localStorage.getItem('wanderlust-studio-v1')));return s.plan.total/s.rate+3;});
  await page.screenshot({path:`/tmp/journey-video-${resolution}-${fps}.png`});
  const download=page.waitForEvent('download');await page.locator('#export-video').click();
  assert.ok(await page.locator('#video-resolution').isDisabled());assert.ok(await page.locator('#video-fps').isDisabled());
  const file=await download;assert.ok(file.suggestedFilename().endsWith(`-${resolution}p-${fps}fps.mp4`));
  const info=await fileInfo(page);assert.equal(info.width,orientation==='portrait'?resolution:resolution*16/9);assert.equal(info.height,orientation==='portrait'?resolution*16/9:resolution);
  assert.ok(Math.abs(info.stats.averagePacketRate-fps)<.01,JSON.stringify(info));assert.ok(Math.abs(info.duration-expected)<=1/fps+.001);assert.ok(info.error<3,JSON.stringify(info));
  assert.equal(await page.locator('[data-video-map]').count(),0);assert.deepEqual(errors,[]);console.log('quality',resolution,fps,JSON.stringify(info));
 }finally{await context.close();}
});
