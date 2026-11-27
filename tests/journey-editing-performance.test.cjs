const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-webgl']});});
after(async()=>browser?.close());
const base=process.env.STUDIO_URL||'http://127.0.0.1:8770';
const fixture=(count=3)=>({version:1,activeTrip:'a',trips:[{id:'a',name:'Original journey',color:'#31765c',items:Array.from({length:count},(_,i)=>({id:'leg-'+i,name:'Leg '+i,kind:'segment',mode:'plane',coordinates:Array.from({length:256},(_,j)=>[-120+(i%20)+j/255,35+Math.floor(i/20)+Math.sin(j/255*Math.PI)*.02])}))},{id:'b',name:'Other journey',items:[]}]});
async function setup(fallback,data){
 const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({fallback,data})=>{if(!localStorage.getItem('wanderlust-studio-v1'))localStorage.setItem('wanderlust-studio-v1',JSON.stringify(data));if(fallback)Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined});},{fallback,data});
 await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'base',type:'background',paint:{'background-color':'#e7ede6'}}]}}));
 await page.goto(base+'/journey-studio.html');await capture(page);return {context,page,errors};
}
async function capture(page){
 await page.waitForFunction(()=>!document.querySelector('#play-journey').disabled);
 await page.evaluate(async()=>{const {JourneyPlayback}=await import('/js/journey-playback.mjs'),advance=JourneyPlayback.prototype.advance;JourneyPlayback.prototype.advance=function(...args){window.player=this;return advance.apply(this,args);};document.querySelector('#play-journey').click();player.exit();});
 await page.waitForFunction(()=>(player.map.sketch||player.map.ready)&&!player.map.opening&&!player.map.themeLoading);
}
for(const fallback of [false,true])test(`typing, geocoding and route previews reuse saved geometry (${fallback?'canvas':'WebGL'})`,async()=>{
 const {context,page,errors}=await setup(fallback,fixture(300));try{
  await page.locator('#segment-tab').click();
  await page.route('https://photon.komoot.io/**',r=>r.fulfill({json:{features:[{properties:{name:'Knoxville',state:'Tennessee',country:'USA'},geometry:{type:'Point',coordinates:[-83.92,35.96]}}]}}));
  await page.evaluate(()=>{window.work={full:0,sync:0,previews:0,baseUploads:0};const m=player.map,update=m.update.bind(m),options=m.updateOptions.bind(m),sync=player.sync.bind(player);m.update=(...a)=>{work.full++;return update(...a);};m.updateOptions=(...a)=>{work.previews++;return options(...a);};player.sync=(...a)=>{work.sync++;return sync(...a);};const source=m.map?.getSource('studio-data');if(source){const set=source.setData.bind(source);source.setData=(...a)=>{work.baseUploads++;return set(...a);};}window.savedPath=m.sketch?.paths[0];});
  await page.locator('#start-query').pressSequentially('Knoxville',{delay:20});await page.getByRole('option',{name:'Knoxville, Tennessee, USA',exact:true}).click();
  await page.locator('#end-query').fill('36, -82');await page.locator('[data-search=end]').click();
  await page.locator('#segment-mode input[value=plane]').check();await page.locator('#find-routes').click();await page.locator('.route-option').first().waitFor();
  assert.equal(await page.locator('.route-option').count(),1);
  await page.locator('#start-query').fill('Boston');await page.locator('#start-query').pressSequentially(' downtown',{delay:20});
  const result=await page.evaluate(()=>({...work,reused:!player.map.sketch||savedPath===player.map.sketch.paths[0]}));
  assert.equal(result.full,0);assert.equal(result.sync,0);assert.equal(result.baseUploads,0);assert.equal(result.previews,2);assert.equal(result.reused,true);console.log('300-route builder',JSON.stringify(result));assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('video title survives editing, reload and KML, and is painted in the exported frame',async()=>{
 const {context,page,errors}=await setup(true,fixture());try{
  const title='春日 <旅途> & "朋友"';
  await page.locator('#trip-video-title').fill(title);await page.waitForFunction(title=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')).trips[0].videoTitle===title,title);
  await page.locator('[data-journey-select=b]').click();assert.equal(await page.locator('#trip-video-title').inputValue(),'');await page.locator('#trip-video-title').fill('Other video');
  await page.locator('[data-journey-select=a]').click();assert.equal(await page.locator('#trip-video-title').inputValue(),title);
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('Saved'));await page.reload();await capture(page);assert.equal(await page.locator('#trip-video-title').inputValue(),title);
  const result=await page.evaluate(async()=>{
   const {exportKML,importKML,exportJourneysKML}=await import('/js/journey-kml.mjs'),{captureVideoSettings,JourneyVideoRenderer}=await import('/js/journey-video.mjs'),{subsetTrip}=await import('/js/journey-files.mjs');
   const data=JSON.parse(localStorage.getItem('wanderlust-studio-v1')),trip=data.trips[0],xml=exportKML(subsetTrip(trip,[trip.items[0]])),again=importKML(xml).trip;
   const collection=exportJourneysKML([{...trip,items:[trip.items[0]]},{...trip,id:'other',videoTitle:'Second caption'}]);
   const titles=[...new DOMParser().parseFromString(collection,'application/xml').querySelectorAll('Data[name="journeyVideoTitle"] value')].map(n=>n.textContent);
   player.follow=true;const snapshot=captureVideoSettings(player.map,player,data),renderer=new JourneyVideoRenderer(snapshot,'landscape',{resolution:720});let painted=[],sizes=[];
   try{await renderer.init();const text=renderer.ctx.fillText.bind(renderer.ctx),sprite=renderer.painter.sprite.bind(renderer.painter);renderer.ctx.fillText=(value,...args)=>{painted.push(value);return text(value,...args);};renderer.painter.sprite=(mode,point,angle,size)=>{sizes.push(size);return sprite(mode,point,angle,size);};await renderer.render(snapshot.plan.segments[0].duration*.5);}
   finally{renderer.dispose();}
   data.trips[0].videoTitle='   ';const fallback=captureVideoSettings(player.map,player,data).plan.segments[0].tripVideoTitle;
   return {title:again.videoTitle,name:again.name,items:again.items.length,titles,painted,sizes,fallback};
  });
  assert.equal(result.title,title);assert.equal(result.name,'Original journey');assert.equal(result.items,1);assert.deepEqual(result.titles,[title,'Second caption']);assert.ok(result.painted.includes(title));assert.ok(!result.painted.includes('Original journey'));assert.ok(result.sizes.length);assert.ok(result.sizes.every(n=>Math.abs(n-40.6)<1e-8));assert.equal(result.fallback,'Original journey');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
