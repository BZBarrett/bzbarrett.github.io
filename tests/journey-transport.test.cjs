const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-webgl']});});
after(async()=>browser?.close());
const base=process.env.STUDIO_URL||'http://127.0.0.1:8770';
const modes=['car','train','plane','walk','transit'];
const fixture=()=>({version:1,activeTrip:'a',trips:[{id:'a',name:'Transport stories',color:'#31765c',videoTitle:'A bus ride · 城市漫游',items:modes.map((mode,i)=>({id:mode,name:mode,kind:'segment',mode,coordinates:[[-120+i,35],[-119.9+i,35.1]]}))}],units:'metric',visited:[],updatedAt:1});
async function setup({empty=false,mobile=false}={}){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const data=fixture();if(empty)data.trips[0].items=[];
 await page.addInitScript(data=>{if(!localStorage.getItem('wanderlust-studio-v1'))localStorage.setItem('wanderlust-studio-v1',JSON.stringify(data));Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined});},data);
 await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>!document.querySelector('#studio-fallback').hidden&&document.querySelector('#trip-name').value==='Transport stories');
 await page.evaluate(async()=>{const {JourneyPlayback}=await import('/js/journey-playback.mjs'),advance=JourneyPlayback.prototype.advance;JourneyPlayback.prototype.advance=function(...args){window.player=this;return advance.apply(this,args);};});
 return {context,page,errors};
}
async function player(page){await page.evaluate(()=>{document.querySelector('#play-journey').click();window.player.pause();});}
async function change(page,mode,value){await page.locator('#speed-'+mode).fill(String(value));await page.locator('#speed-'+mode).dispatchEvent('change');}

test('default and custom transport ratios determine physical velocity without changing routes',async()=>{
 const {context,page,errors}=await setup();try{
 const result=await page.evaluate(async()=>{const {playbackPlan,playbackFrame}=await import('/js/journey-playback.mjs'),{normalizeTransportSpeeds}=await import('/js/journey-transport.mjs');const items=['car','train','plane','walk','transit'].map(mode=>({kind:'segment',mode,id:mode,coordinates:[[0,0],[1,0]]})),before=JSON.stringify(items),defaultPlan=playbackPlan(items),custom=playbackPlan(items,{car:10,train:2,plane:4.5,walk:.25,transit:.75});return {defaults:defaultPlan.segments.map(s=>s.length/s.duration/10000),custom:custom.segments.map(s=>s.length/s.duration/10000),invalid:normalizeTransportSpeeds({car:20,plane:0,train:Infinity,walk:'2',transit:100}),unchanged:JSON.stringify(items)===before,positions:custom.segments.map(s=>playbackFrame(custom,s.offset+s.duration*.25).position)};});
 assert.deepEqual(result.defaults,[1,1.5,3,.5,1]);assert.deepEqual(result.custom,[1,2,4.5,.25,.75]);assert.deepEqual(result.invalid,{car:1,train:1.5,plane:3,walk:.5,transit:1});assert.ok(result.unchanged);assert.ok(result.positions.every(p=>Math.abs(p[0]-.25)<1e-8));assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('settings update live and video timing together, keep the current position, persist and reset',async()=>{
 const {context,page,errors}=await setup();try{
 await player(page);await page.evaluate(()=>{const s=player.plan.segments.find(s=>s.mode==='plane');player.seek((s.offset+s.duration*.4)/player.plan.total);});const before=await page.evaluate(()=>({position:player.frame.position,items:JSON.stringify(player.activeJourney.items)}));
 await page.locator('#open-settings').click();assert.equal(await page.locator('#speed-plane').inputValue(),'3');await change(page,'plane',4.5);await change(page,'transit',.75);await change(page,'walk',.25);
 const current=await page.evaluate(async()=>{const {captureVideoSettings}=await import('/js/journey-video.mjs'),data=JSON.parse(localStorage.getItem('wanderlust-studio-v1'));return {position:player.frame.position,state:player.state,ratios:player.transportSpeeds,items:JSON.stringify(player.activeJourney.items),duration:player.plan.total};});assert.deepEqual(current.position,before.position);assert.equal(current.state,'paused');assert.equal(current.items,before.items);assert.equal(current.ratios.plane,4.5);
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')).transportSpeeds?.walk===.25);const sync=await page.evaluate(async()=>{const {captureVideoSettings}=await import('/js/journey-video.mjs'),s=captureVideoSettings(player.map,player,JSON.parse(localStorage.getItem('wanderlust-studio-v1')));return {duration:s.plan.total,speeds:s.transportSpeeds};});assert.equal(sync.duration,current.duration);assert.deepEqual(sync.speeds,current.ratios);
 await page.locator('#settings-dialog .transport-speed-settings').screenshot({path:'/tmp/studio-transport-speeds.png'});await page.locator('[data-close=settings-dialog]').last().click();assert.match(await page.locator('#player-speed option[value="1"]').textContent(),/45 km\/s/);
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('Saved'));await page.reload();await page.waitForFunction(()=>!document.querySelector('#studio-fallback').hidden);await page.locator('#open-settings').click();assert.equal(await page.locator('#speed-plane').inputValue(),'4.5');assert.equal(await page.locator('#speed-transit').inputValue(),'0.75');
 await page.locator('#reset-transport-speeds').click();assert.equal(await page.locator('#speed-plane').inputValue(),'3');assert.equal(await page.locator('#speed-walk').inputValue(),'0.5');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')).transportSpeeds?.plane===3);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

for(const mobile of [false,true])test('public transport radio, creation, editing, file round trips and icons work '+(mobile?'on mobile':'on desktop'),async()=>{
 const {context,page,errors}=await setup({empty:true,mobile});try{
 assert.equal(await page.locator('#segment-mode input[type=radio]').count(),5);await page.locator('#segment-mode input[value=transit]').check();assert.match(await page.locator('#mode-hint').textContent(),/public transport.*not verified/);
 await page.locator('#start-query').fill('35, -120');await page.locator('#end-query').fill('35.02, -119.98');await page.locator('#find-routes').click();await page.waitForFunction(()=>document.querySelectorAll('.route-option').length===1);assert.match(await page.locator('.route-option').textContent(),/public transport.*not verified/);await page.locator('#route-options .button').click();await page.waitForFunction(()=>document.querySelectorAll('#route-itinerary li').length===1);assert.match(await page.locator('#route-itinerary').textContent(),/Public/);
 await page.locator('[data-item-action=edit]').click();assert.ok(await page.locator('#edit-mode input[value=transit]').isChecked());await page.locator('#edit-name').fill('City bus');await page.locator('#edit-form button[type=submit]').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')).trips[0].items[0]?.name==='City bus');
 const checks=await page.evaluate(async()=>{const {journeyFile,importJourneyFile}=await import('/js/journey-files.mjs'),{routeListPlan}=await import('/js/journey-route-list.mjs'),trip=JSON.parse(localStorage.getItem('wanderlust-studio-v1')).trips[0],out=[];for(const format of ['kml','kmz','geojson']){const blob=await journeyFile([trip],format),restored=(await importJourneyFile(new File([blob],'Bus.'+format))).trip;out.push({mode:restored.items[0].mode,color:restored.color,title:restored.videoTitle});}const plan=routeListPlan([trip],{language:'zh',units:'metric'},{w:700,h:1500});return {out,label:plan.rows.find(r=>r.kind==='segment').meta.join(' ')};});assert.ok(checks.out.every(r=>r.mode==='transit'&&r.color==='#31765c'&&r.title==='A bus ride · 城市漫游'));assert.match(checks.label,/公共交通/);
 await page.locator('#segment-mode').scrollIntoViewIfNeeded();const assets=await page.locator('#segment-mode img').evaluateAll(async imgs=>{await Promise.all(imgs.map(i=>i.decode()));return imgs.map(i=>({loaded:i.naturalWidth>0,width:i.getBoundingClientRect().width}));});assert.ok(assets.every(a=>a.loaded&&a.width>=24&&a.width<=32));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('#segment-mode').screenshot({path:'/tmp/studio-transport-icons-'+(mobile?'mobile':'desktop')+'.png'});
 await page.locator('#open-settings').click();await page.locator('[data-language=zh]').click();await page.locator('[data-close=settings-dialog]').last().click();assert.match(await page.locator('#segment-mode label').last().textContent(),/公共交通/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('public transport uses its bus artwork and configured timing in a decodable MP4',async()=>{
 const {context,page,errors}=await setup();try{
 await player(page);
 const result=await page.evaluate(async()=>{
  const {captureVideoSettings,JourneyVideoRenderer,encodeJourneyVideo,videoTiming}=await import('/js/journey-video.mjs'),data=JSON.parse(localStorage.getItem('wanderlust-studio-v1'));data.transportSpeeds={car:1,plane:3,train:1.5,walk:.5,transit:2};data.trips[0].items=data.trips[0].items.filter(i=>i.mode==='transit');player.rate=4;const snapshot=captureVideoSettings(player.map,player,data),r=new JourneyVideoRenderer(snapshot,'landscape',{resolution:720,fps:24});let url;
  try{await r.init();const expected=videoTiming(snapshot.plan,4,24),speed=snapshot.plan.segments[0].length/snapshot.plan.segments[0].duration,bus=r.painter.images.transit.naturalWidth;const encoded=await encodeJourneyVideo(r);url=URL.createObjectURL(encoded.file);const video=document.createElement('video');video.src=url;await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});await video.play();video.pause();const result={speed,bus,width:video.videoWidth,height:video.videoHeight,duration:video.duration,expected:expected.frames/24,header:new TextDecoder().decode((await encoded.file.arrayBuffer()).slice(4,8)),mode:r.painter.frame.segment.mode};video.removeAttribute('src');video.load();return result;}finally{r.dispose();if(url)URL.revokeObjectURL(url);}
 });assert.equal(result.speed,20000);assert.ok(result.bus>0);assert.equal(result.mode,'transit');assert.equal(result.header,'ftyp');assert.equal(result.width,1280);assert.equal(result.height,720);assert.ok(Math.abs(result.duration-result.expected)<.001);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
