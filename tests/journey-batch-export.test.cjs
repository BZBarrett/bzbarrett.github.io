const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});});
after(async()=>browser?.close());
const base=process.env.STUDIO_URL||'http://127.0.0.1:8770';
const fixture=()=>({version:1,activeTrip:'a',trips:[
 {id:'a',name:'Trip/West',color:'#31765c',videoTitle:'西行 <故事> & 朋友',items:[{id:'r1',kind:'segment',name:'First route',mode:'car',start:'2025-04',startNode:{name:'Start',coordinates:[-120,35]},endNode:{name:'End',coordinates:[-119,36]},coordinates:[[-120,35],[-119,36]],visible:false},{id:'r2',kind:'segment',name:'Second route',mode:'train',startNode:{name:'Start',coordinates:[-119,36]},endNode:{name:'End',coordinates:[-118,36]},coordinates:[[-119,36],[-118,36]]},{id:'p1',kind:'point',name:'First place',coordinates:[-120,35],important:true},{id:'p2',kind:'point',name:'Second place',coordinates:[-119,35]}]},
 {id:'b',name:'Trip:West',color:'#cc6633',videoTitle:'Second story',items:[{id:'p1',kind:'point',name:'Other place',coordinates:[-90,30]}]},
 {id:'c',name:'trip_west',items:[{id:'p1',kind:'point',name:'Third place',coordinates:[-80,30]}]},
 {id:'hidden',name:'Unselected',visible:false,items:[{id:'p1',kind:'point',name:'Do not export',coordinates:[-70,30]}]},
 {id:'empty',name:'Empty',items:[]}
]});
async function setup({data=fixture(),mobile=false,language='en'}={}){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(data=>{if(!localStorage.getItem('wanderlust-studio-v1'))localStorage.setItem('wanderlust-studio-v1',JSON.stringify(data));Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined});},{...data,language});
 await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>document.querySelectorAll('.journey-row').length===5);return {context,page,errors};
}
for(const format of ['kml','kmz','geojson'])test(`batch ZIP downloads only checked journeys as separate ${format} files with unique names and complete metadata`,async()=>{
 const {context,page,errors}=await setup();try{
  const before=await page.evaluate(()=>localStorage.getItem('wanderlust-studio-v1'));
  await page.locator('#export-checked-journeys').click();assert.equal(await page.locator('#batch-export-list li').count(),4);assert.equal(await page.locator('#batch-export-summary').textContent(),'3 journeys · 6 items');assert.ok(await page.locator('#batch-export-empty').isVisible());
  await page.locator('#batch-file-format').selectOption(format);const pending=page.waitForEvent('download');await page.locator('#download-checked-journeys').click();const download=await pending;assert.equal(download.suggestedFilename(),'Checked journeys.zip');
  const bytes=await fs.readFile(await download.path());const result=await page.evaluate(async({bytes,format})=>{
   await import('/js/vendor/jszip-3.10.1.js');const {importJourneyFile}=await import('/js/journey-files.mjs'),zip=await JSZip.loadAsync(Uint8Array.from(bytes)),names=Object.keys(zip.files).filter(n=>!zip.files[n].dir),trips=[];
   for(const name of names){const file=new File([await zip.file(name).async('uint8array')],name);trips.push((await importJourneyFile(file)).trip);}return {names,trips};
  },{bytes:[...bytes],format});
  assert.deepEqual(result.names,['Trip_West.'+format,'Trip_West (2).'+format,'trip_west (3).'+format]);assert.deepEqual(result.trips.map(t=>t.name),['Trip/West','Trip:West','trip_west']);assert.equal(result.trips[0].videoTitle,'西行 <故事> & 朋友');assert.equal(result.trips[0].color,'#31765c');assert.equal(result.trips[0].items.length,4);assert.equal(result.trips[0].items[0].visible,false);assert.equal(result.trips[0].items[0].start,'2025-04');assert.equal(result.trips[0].items[1].mode,'train');assert.equal(result.trips[1].videoTitle,'Second story');assert.equal(await page.evaluate(()=>localStorage.getItem('wanderlust-studio-v1')),before);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('batch combined KML keeps journey folders and selection controls handle none and empty-only',async()=>{
 const {context,page,errors}=await setup();try{
  await page.locator('#journeys-hide-all').click();assert.ok(await page.locator('#export-checked-journeys').isDisabled());await page.locator('[data-journey-visible=empty]').check();await page.locator('#export-checked-journeys').click();assert.ok(await page.locator('#download-checked-journeys').isDisabled());await page.locator('[data-close=batch-export-dialog]').click();
  await page.locator('[data-journey-visible=a]').check();await page.locator('[data-journey-visible=b]').check();await page.locator('#export-checked-journeys').click();await page.locator('#batch-file-layout').selectOption('combined');
  const pending=page.waitForEvent('download');await page.locator('#download-checked-journeys').click();const download=await pending;assert.equal(download.suggestedFilename(),'Checked journeys.kml');const xml=await fs.readFile(await download.path(),'utf8');
  const result=await page.evaluate(xml=>{const doc=new DOMParser().parseFromString(xml,'application/xml');return {folders:[...doc.querySelectorAll('Document > Folder > name')].map(n=>n.textContent),titles:[...doc.querySelectorAll('Data[name=journeyVideoTitle] value')].map(n=>n.textContent),lines:doc.querySelectorAll('LineString').length};},xml);
  assert.deepEqual(result.folders,['Trip/West','Trip:West']);assert.deepEqual(result.titles,['西行 <故事> & 朋友','Second story']);assert.equal(result.lines,2);assert.ok(!xml.includes('Do not export'));assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('invalid journey prevents a partial batch download and explains the failure',async()=>{
 const data=fixture();data.trips[1].items[0].start='bad-date';const {context,page,errors}=await setup({data});let downloads=0;page.on('download',()=>downloads++);try{
  await page.locator('#export-checked-journeys').click();await page.locator('#download-checked-journeys').click();await page.waitForFunction(()=>document.querySelector('#batch-export-status').textContent.startsWith('Could not export'));
  assert.match(await page.locator('#batch-export-status').textContent(),/Trip:West/);assert.equal(downloads,0);assert.ok(await page.locator('#download-checked-journeys').isEnabled());assert.ok(await page.locator('#batch-export-dialog').isVisible());assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
for(const mobile of [false,true])test(`itinerary icons retain edit, locate, reorder and remove behavior (${mobile?'mobile Chinese':'desktop'})`,async()=>{
 const {context,page,errors}=await setup({mobile,language:mobile?'zh':'en'});try{
  assert.equal(await page.locator('#studio-sidebar .journey-colors').count(),0);assert.equal(await page.locator('#settings-dialog .journey-colors').count(),1);
  await page.locator('#open-settings').click();assert.ok(await page.locator('#settings-dialog .journey-colors').isVisible());await page.locator('[data-palette=coast]').click();await page.locator('[data-close=settings-dialog]').last().click();
  const first=page.locator('#route-itinerary li').first();await first.scrollIntoViewIfNeeded();
  const actions=await first.locator('[data-item-action]').evaluateAll(nodes=>nodes.map(n=>({text:n.textContent,label:n.getAttribute('aria-label'),title:n.title,svg:!!n.querySelector('svg'),width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
  assert.equal(actions.length,5);assert.ok(actions.every(a=>!a.text&&a.label&&a.title&&a.svg&&a.width===a.height));assert.ok(await first.locator('[data-item-action=earlier]').isDisabled());
  await first.locator('[data-item-action=edit]').click();await page.locator('#edit-name').fill('Renamed route');await page.locator('#edit-form button[type=submit]').click();
  await page.evaluate(async()=>{const {JourneyMap}=await import('/js/journey-map.mjs'),fit=JourneyMap.prototype.fit;JourneyMap.prototype.fit=function(points,...args){window.located=points;return fit.call(this,points,...args);};});await first.locator('[data-item-action=locate]').click();assert.deepEqual(await page.evaluate(()=>located),[[-120,35],[-119,36]]);
  await first.locator('[data-item-action=later]').click();assert.deepEqual(await page.locator('#route-itinerary li h3').allTextContents(),['Second route','Renamed route']);await page.locator('#route-itinerary li').last().locator('[data-item-action=earlier]').click();assert.deepEqual(await page.locator('#route-itinerary li h3').allTextContents(),['Renamed route','Second route']);
  await page.locator('#places-tab').click();await page.locator('#point-itinerary li').first().locator('[data-item-action=later]').click();assert.deepEqual(await page.locator('#point-itinerary li h3').allTextContents(),['Second place','★ First place']);
  page.once('dialog',d=>d.accept());await page.locator('#point-itinerary li').first().locator('[data-item-action=remove]').click();assert.equal(await page.locator('#point-itinerary li').count(),1);
  if(mobile){await page.locator('#export-checked-journeys').click();assert.equal(await page.locator('#batch-export-title').textContent(),'导出已勾选行程');const overflow=await page.locator('#batch-export-dialog').evaluate(e=>e.scrollWidth>e.clientWidth);assert.equal(overflow,false);await page.screenshot({path:'/tmp/journey-batch-mobile.png'});}
  else {await page.locator('#routes-tab').click();await page.locator('#itinerary-title').scrollIntoViewIfNeeded();await page.locator('.itinerary-section').screenshot({path:'/tmp/journey-itinerary-icons.png'});}
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
