const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
const base=process.env.STUDIO_URL||'http://127.0.0.1:8770';
function jpegSize(bytes){for(let offset=2;offset<bytes.length;){if(bytes[offset]!==255){offset++;continue;}const marker=bytes[offset+1],length=bytes.readUInt16BE(offset+2);if([0xc0,0xc1,0xc2].includes(marker))return [bytes.readUInt16BE(offset+7),bytes.readUInt16BE(offset+5)];offset+=length+2;}throw new Error('JPEG dimensions not found');}
let browser;
before(async()=>{browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});});
after(async()=>{await browser?.close();});
async function setup({offlineMap=true,fallback=false}={}) {
 const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 if(offlineMap) await page.route('https://tiles.openfreemap.org/**',route=>route.abort());
 if(fallback)await page.addInitScript(()=>{Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined});});
 await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>document.querySelector('#save-status').textContent!=='Opening your local notebook…');
 return {context,page,errors};
}
async function units(page,value) {await page.locator('#open-settings').click();await page.locator('button[data-units='+value+']').click();await page.locator('[data-close=settings-dialog]').last().click();}
async function saved(page) {await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('Saved'));}
async function coordinate(page,key,value) {await page.locator('#'+key+'-query').fill(value);await page.locator('[data-search="'+key+'"]').click();await page.waitForFunction(key=>document.querySelector('#form-status').textContent.startsWith('Selected '),key);}
async function point(page,name='Cades Cove') {await page.locator('#point-tab').click();await coordinate(page,'point','35.5946, -83.8412');await page.locator('#point-name').fill(name);await page.locator('#point-important').check();await page.locator('#point-form details').evaluate(e=>e.open=true);await page.locator('#point-start').fill('2026-11');await page.locator('#point-start-day').fill('23');await page.locator('#point-notes').fill('Autumn & mountains <quiet>');await page.getByRole('button',{name:'Add place',exact:true}).click();await saved(page);}
async function routeMock(page) {
 await page.route('https://router.project-osrm.org/**',route=>route.fulfill({json:{code:'Ok',waypoints:[{distance:3},{distance:4}],routes:[0,1,2].map((i)=>({distance:180000+i*15000,duration:8000+i*1000,geometry:{type:'LineString',coordinates:[[-83.9207,35.9606],[-83.4+i*.15,35.75+i*.1],[-82.5515,35.5951]]}}))}}));
}
async function segment(page) {
 await page.locator('#segment-tab').click();await coordinate(page,'start','35.9606, -83.9207');await coordinate(page,'end','35.5951, -82.5515');await page.locator('#start-important').check();await page.locator('#segment-form details').evaluate(e=>e.open=true);await page.locator('#segment-start').fill('2026-11');await page.locator('#segment-start-day').fill('24');await page.locator('#segment-end').fill('2026-11');await page.locator('#segment-end-day').fill('24');await page.locator('#find-routes').click();await page.waitForFunction(()=>document.querySelectorAll('.route-option').length===3);await page.locator('.route-option').nth(1).click();await page.getByRole('button',{name:'Add selected segment'}).click();await saved(page);
}
test('point editing, times, important nodes, auto-save and OPFS KML companions survive reload',async()=>{
 const {context,page,errors}=await setup();try{
 await page.locator('#trip-name').fill('Smokies & Beyond');await point(page);
 assert.equal(await page.locator('#itinerary li').count(),1);
 const data=await page.evaluate(async()=>{const folder=await (await navigator.storage.getDirectory()).getDirectoryHandle('.wanderlust');const file=await folder.getFileHandle('workspace.json');const state=JSON.parse(await(await file.getFile()).text());const kml=await(await(await folder.getFileHandle('journey-'+state.trips[0].id+'.kml')).getFile()).text();return {state,kml};});
 assert.equal(data.state.trips[0].items[0].important,true);assert.match(data.kml,/<begin>2026-11-23<\/begin><end>2026-11-23<\/end>/);assert.match(data.kml,/Autumn &amp; mountains &lt;quiet&gt;/);
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#itinerary li').length===1);assert.equal(await page.locator('#trip-name').inputValue(),'Smokies & Beyond');
 await page.getByRole('button',{name:'Edit Cades Cove',exact:true}).click();await page.locator('#edit-name').fill('Cades Cove overlook');await page.locator('#edit-start').fill('2026-02');await page.locator('#edit-start-day').fill('30');await page.getByRole('button',{name:'Save changes'}).click();assert.match(await page.locator('#edit-error').textContent(),/valid year and month/);
 await page.locator('#edit-start').fill('2026-11');await page.locator('#edit-start-day').fill('23');await page.getByRole('button',{name:'Save changes'}).click();await saved(page);assert.match(await page.locator('#itinerary').textContent(),/Cades Cove overlook/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('three route alternatives, separate collections, export review and KML round trip preserve metadata',async()=>{
 const {context,page,errors}=await setup();try{await routeMock(page);await point(page);await segment(page);assert.equal(await page.locator('#itinerary li').count(),2);
 assert.equal(await page.locator('#route-itinerary li').count(),1);assert.equal(await page.locator('#point-itinerary li').count(),1);
 await page.locator('#itinerary li').first().getByRole('button',{name:/^Edit /}).click();await page.locator('#edit-mode label').filter({has:page.locator('input[value=train]')}).click();await page.locator('#edit-end-important').check();await page.getByRole('button',{name:'Save changes'}).click();
 await page.locator('#review-trip').click();assert.equal(await page.locator('#export-kml').isDisabled(),true);await page.locator('#confirm-journey').check();
 const wait=page.waitForEvent('download');await page.locator('#export-kml').click();const download=await wait;const kml=await fs.readFile(await download.path(),'utf8');assert.match(kml,/<value>train<\/value>/);assert.match(kml,/<TimeSpan>/);
 const parsed=await page.evaluate(async text=>{const {importKML,exportKML}=await import('/js/journey-kml.mjs');const first=importKML(text);const second=importKML(exportKML(first.trip));return {first,second};},kml);
 assert.equal(parsed.first.trip.items.length,2);assert.equal(parsed.second.trip.items.length,2);assert.equal(parsed.first.trip.items[0].startNode.important,true);assert.equal(parsed.first.trip.items[0].endNode.important,true);assert.equal(parsed.first.trip.items[0].mode,'train');assert.equal(parsed.first.trip.items[1].important,true);
 await page.locator('#kml-file').setInputFiles({name:'roundtrip.kml',mimeType:'application/vnd.google-earth.kml+xml',buffer:Buffer.from(kml)});await page.waitForFunction(()=>document.querySelectorAll('.journey-row').length===2);assert.equal(await page.locator('#itinerary li').count(),2);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('Photon result choice and rejected search / route handling',async()=>{
 const {context,page,errors}=await setup();try{
 await page.route('https://photon.komoot.io/**',r=>r.fulfill({json:{features:[{properties:{name:'Knoxville',state:'Tennessee',country:'USA'},geometry:{type:'Point',coordinates:[-83.92,35.96]}},{properties:{name:'Knoxville',state:'Iowa',country:'USA'},geometry:{type:'Point',coordinates:[-93.09,41.32]}}]}}));
 await page.locator('#start-query').fill('Knoxville');await page.locator('[data-search=start]').click();await page.getByRole('option',{name:'Knoxville, Tennessee, USA',exact:true}).click();assert.equal(await page.locator('#start-query').inputValue(),'Knoxville, Tennessee, USA');
 await page.route('https://router.project-osrm.org/**',r=>r.fulfill({status:503,body:'Unavailable'}));await coordinate(page,'end','35.5951, -82.5515');await page.locator('#find-routes').click();await page.waitForFunction(()=>document.querySelector('#form-status').textContent.includes('unavailable'));assert.equal(await page.locator('.route-option').count(),0);assert.equal(await page.locator('#find-routes').isDisabled(),false);
 await page.locator('#start-query').fill('95, -83');await page.locator('[data-search=start]').click();assert.match(await page.locator('#form-status').textContent(),/latitude/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('plane/train sketches are correctly labeled and cross-dateline coordinates remain valid',async()=>{
 const {context,page}=await setup();try{
 const result=await page.evaluate(async()=>{const {findRoutes}=await import('/js/journey-routes.mjs');const s=new AbortController().signal;return {plane:await findRoutes([-118.4,33.94],[139.78,35.55],'plane',s),train:await findRoutes([-73.99,40.75],[-77,38.9],'train',s)};});
 for(const options of [result.plane,result.train]){assert.ok(options.length>=3&&options.length<=5);for(const option of options){assert.equal(option.source,'Planning sketch');assert.ok(option.coordinates.every(c=>c.every(Number.isFinite)&&Math.abs(c[0])<=180&&Math.abs(c[1])<=90));}}
 assert.ok(result.train.every(o=>o.note.includes('does not follow rail tracks')));
 }finally{await context.close();}
});
test('malformed KML, unsupported geometries, namespace imports and XML escaping',async()=>{
 const {context,page}=await setup();try{
 const result=await page.evaluate(async()=>{
  const {importKML,exportKML}=await import('/js/journey-kml.mjs');const failures=[];
  for(const text of ['<bad>', '<!DOCTYPE kml [<!ENTITY data "unsafe">]><kml/>','<kml><Placemark><Point><coordinates>500,91</coordinates></Point></Placemark></kml>']){try{importKML(text);failures.push(false);}catch{failures.push(true);}}
  const fixture='<k:kml xmlns:k="http://www.opengis.net/kml/2.2"><k:Document><k:name>测试 &amp; &lt;script&gt;</k:name><k:Placemark><k:name>&lt;img src=x onerror=alert(1)&gt;</k:name><k:TimeStamp><k:when>2026-11-23</k:when></k:TimeStamp><k:MultiGeometry><k:Point><k:coordinates>-83,35,500</k:coordinates></k:Point><k:LineString><k:coordinates>-83,35,500 -82,36,600</k:coordinates></k:LineString><k:Polygon/></k:MultiGeometry></k:Placemark></k:Document></k:kml>';
  const parsed=importKML(fixture);return {failures,parsed,exported:exportKML(parsed.trip)};
 });assert.ok(result.failures.every(Boolean));assert.equal(result.parsed.trip.items.length,2);assert.match(result.parsed.warnings[0],/Polygon/);assert.deepEqual(result.parsed.trip.items[0].coordinates,[-83,35,500]);assert.match(result.exported,/&lt;img/);
 }finally{await context.close();}
});
test('Bucket List persists all park selections and exports a complete 4800×6000 JPEG',async()=>{
 const {context,page,errors}=await setup();try{
 await page.locator('#open-bucket').click();await page.waitForFunction(()=>!document.querySelector('#export-poster').disabled);assert.equal(await page.locator('#park-checklist input').count(),64);
 await page.locator('#park-checklist input[value=chir]').check();await page.locator('#park-checklist input[value=grsm]').check();await page.locator('#poster-title').fill('Our wild places');await saved(page);
 const waiting=page.waitForEvent('download');await page.locator('#export-poster').click();const download=await waiting,bytes=await fs.readFile(await download.path());assert.equal(bytes[0],255);assert.equal(bytes[1],216);assert.ok(bytes.length>100000);assert.deepEqual(jpegSize(bytes),[4800,6000]);
 const size=await page.evaluate(async()=>{const c=document.querySelector('#park-poster');const blob=await new Promise(r=>c.toBlob(r,'image/jpeg'));const bitmap=await createImageBitmap(blob);return [bitmap.width,bitmap.height];});assert.deepEqual(size,[2400,3000]);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#save-status').textContent!=='Opening your local notebook…');await page.locator('#open-bucket').click();await page.waitForFunction(()=>!document.querySelector('#export-poster').disabled);assert.equal(await page.locator('#park-checklist input[value=chir]').isChecked(),true);assert.equal(await page.locator('#poster-title').inputValue(),'Our wild places');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('hidden-folder connection merges notebooks and restores state with a real directory handle',async()=>{
 const {context,page,errors}=await setup();try{
 await point(page);await page.evaluate(()=>{window.showDirectoryPicker=async()=>{return (await navigator.storage.getDirectory()).getDirectoryHandle('test-selected-folder',{create:true});};});
 await page.locator('#connect-folder').click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('Saved to .wanderlust'));
 const count=await page.evaluate(async()=>{const parent=await(await navigator.storage.getDirectory()).getDirectoryHandle('test-selected-folder'),folder=await parent.getDirectoryHandle('.wanderlust');return JSON.parse(await(await(await folder.getFileHandle('workspace.json')).getFile()).text()).trips[0].items.length;});assert.equal(count,1);assert.equal(await page.locator('#folder-path').textContent(),'test-selected-folder/.wanderlust');
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#itinerary li').length===1);assert.equal(await page.locator('#folder-path').textContent(),'test-selected-folder/.wanderlust');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('mobile and non-WebGL fallback remain usable, including map point picking',async()=>{
 const {context,page,errors}=await setup({fallback:true});try{
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>!document.querySelector('#studio-fallback').hidden);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await units(page,'imperial');await page.locator('#point-tab').click();await page.locator('#pick-point').click();await page.locator('#studio-fallback').click({position:{x:220,y:210}});await page.waitForFunction(()=>document.querySelector('#form-status').textContent.startsWith('Map location selected'));await page.locator('#point-name').fill('Picked on map');await page.getByRole('button',{name:'Add place',exact:true}).click();await saved(page);assert.equal(await page.locator('#itinerary li').count(),1);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('timed gx:Track imports retain per-vertex timestamps and altitudes through export',async()=>{
 const {context,page}=await setup();try{
 const result=await page.evaluate(async()=>{const {importKML,exportKML}=await import('/js/journey-kml.mjs');const text='<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><Placemark><name>Trail recording</name><gx:Track><altitudeMode>absolute</altitudeMode><when>2026-11-23T14:00:00Z</when><when>2026-11-23T15:00:00Z</when><gx:coord>-83 35 500</gx:coord><gx:coord>-82 36 800</gx:coord></gx:Track></Placemark></Document></kml>';const imported=importKML(text);const xml=exportKML(imported.trip);const again=importKML(xml);return {xml,item:again.trip.items[0]};});
 assert.match(result.xml,/<gx:Track>/);assert.equal(result.item.altitudeMode,'absolute');assert.deepEqual(result.item.trackTimes,['2026-11-23T14:00:00Z','2026-11-23T15:00:00Z']);assert.deepEqual(result.item.coordinates,[[-83,35,500],[-82,36,800]]);
 }finally{await context.close();}
});
test('unavailable storage is reported without falsely claiming a successful save',async()=>{
 const context=await browser.newContext(),page=await context.newPage();try{
 await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Full','QuotaExceededError');};navigator.storage.getDirectory=async()=>{throw new DOMException('Denied','SecurityError');};indexedDB.open=()=>{throw new DOMException('Denied','SecurityError');};});
 await page.route('https://tiles.openfreemap.org/**',r=>r.abort());await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>document.querySelector('#save-status').textContent!=='Opening your local notebook…');await page.locator('#trip-name').fill('Unsaved trip');await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('Could not save.'));assert.match(await page.locator('#save-status').textContent(),/Export KML/);
 }finally{await context.close();}
});
test('online basemap replacement restores rendered route lines and important point markers',async()=>{
 const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
 await page.addInitScript(()=>{let library;Object.defineProperty(window,'maplibregl',{configurable:true,get(){return library;},set(value){library=value;const Original=value.Map;value.Map=class extends Original{constructor(options){super(options);window.__testMap=this;}};}});});
 let release;const gate=new Promise(resolve=>release=resolve);
 await page.route('https://tiles.openfreemap.org/**',async route=>{await gate;await route.fulfill({json:{version:8,sources:{},layers:[{id:'online-background',type:'background',paint:{'background-color':'#dce5d8'}}]}});});
 await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>window.__testMap?.getSource('studio-data'));
 const kml='<kml><Document><Placemark><name>Visible route</name><LineString><coordinates>-83.92,35.96 -83.15,35.82 -82.55,35.59</coordinates></LineString></Placemark><Placemark><name>Visible important node</name><styleUrl>#important</styleUrl><Point><coordinates>-83.49,35.61</coordinates></Point></Placemark></Document></kml>';
 await page.locator('#kml-file').setInputFiles({name:'visible.kml',mimeType:'application/xml',buffer:Buffer.from(kml)});await page.waitForFunction(()=>document.querySelectorAll('#itinerary li').length===2);release();
 await page.waitForFunction(()=>{const m=window.__testMap;return m.getLayer('online-background')&&m.getLayer('studio-lines')&&m.queryRenderedFeatures({layers:['studio-lines']}).length>0&&m.queryRenderedFeatures({layers:['studio-points']}).length>0;});
 assert.equal(await page.evaluate(()=>window.__testMap.getSource('studio-data')._data.features.length),4);assert.equal(await page.evaluate(()=>window.__testMap.hasImage('studio-star')),true);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('metric / imperial changes all distance displays and persists without changing KML geometry',async()=>{
 const {context,page,errors}=await setup();try{
 await routeMock(page);await segment(page);
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')).trips[0].items);
 assert.match(await page.locator('#trip-summary').textContent(),/mi/);await units(page,'metric');assert.match(await page.locator('#trip-summary').textContent(),/km/);await units(page,'imperial');await saved(page);
 assert.match(await page.locator('#trip-summary').textContent(),/mi/);assert.match(await page.locator('#route-itinerary').textContent(),/mi/);
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')).trips[0].items);assert.deepEqual(after,before);
 const labels=await page.evaluate(async()=>{const {distanceLabel}=await import('/js/journey-routes.mjs');return [distanceLabel(1609.344,'imperial'),distanceLabel(30.48,'imperial'),distanceLabel(1000,'metric')];});assert.deepEqual(labels,['1 mi','100 ft','1 km']);
 await page.reload();await page.waitForFunction(()=>document.querySelector('[data-units=imperial]').getAttribute('aria-pressed')==='true');assert.match(await page.locator('#trip-summary').textContent(),/mi/);
 await coordinate(page,'start','35.9606, -83.9207');await coordinate(page,'end','35.5951, -82.5515');await page.locator('#find-routes').click();await page.waitForFunction(()=>document.querySelectorAll('.route-option').length===3);assert.match(await page.locator('.route-option').first().textContent(),/mi/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('typing shows debounced suggestions; stale results cannot replace new input; arrows and Enter select',async()=>{
 const {context,page,errors}=await setup();try{
 const requests=[];let releaseOld;const oldGate=new Promise(resolve=>releaseOld=resolve);
 await page.route('https://photon.komoot.io/**',async route=>{const q=new URL(route.request().url()).searchParams.get('q');requests.push(q);if(q==='New')await oldGate;await route.fulfill({json:{features:[{properties:{name:q,state:q==='Boston'?'Massachusetts':'Tennessee',country:'USA'},geometry:{type:'Point',coordinates:[-83.92,35.96]}}]}}).catch(()=>{});});
 await page.locator('#start-query').pressSequentially('Knoxville',{delay:40});await page.getByRole('option',{name:'Knoxville, Tennessee, USA',exact:true}).waitFor();assert.equal(requests.length,1);assert.equal(await page.locator('#start-query').inputValue(),'Knoxville');assert.equal(await page.locator('#start-query').getAttribute('aria-expanded'),'true');
 const oldRequest=page.waitForRequest(r=>r.url().includes('photon.komoot.io')&&new URL(r.url()).searchParams.get('q')==='New');await page.locator('#start-query').fill('New');await oldRequest;
 await page.locator('#start-query').fill('Boston');await page.getByRole('option',{name:'Boston, Massachusetts, USA',exact:true}).waitFor();releaseOld();
 await page.locator('#start-query').press('ArrowDown');assert.equal(await page.locator('#start-query').getAttribute('aria-activedescendant'),'start-suggestion-0');await page.locator('#start-query').press('Enter');assert.equal(await page.locator('#start-query').inputValue(),'Boston, Massachusetts, USA');assert.equal(await page.locator('#start-query').getAttribute('aria-expanded'),'false');
 await page.locator('#end-query').fill('Knoxville');await page.locator('#end-results [role=option]').waitFor();await page.locator('#end-query').press('Escape');assert.equal(await page.locator('#end-query').getAttribute('aria-expanded'),'false');
 await page.locator('#point-tab').click();await page.locator('#point-query').evaluate(input=>{input.focus();input.value='杭州';input.dispatchEvent(new InputEvent('input',{bubbles:true,data:'杭州',isComposing:true}));});await page.waitForTimeout(400);assert.equal(requests.includes('杭州'),false);await page.locator('#point-query').dispatchEvent('compositionend');await page.getByRole('option',{name:'杭州, Tennessee, USA',exact:true}).waitFor();assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('separate point and route lists reorder independently and export both folders without adding route vertices',async()=>{
 const {context,page,errors}=await setup();try{
 const fixture='<kml><Document><name>Separated collections</name><Placemark><name>Pin A</name><Point><coordinates>120,30</coordinates></Point></Placemark><Placemark><name>Route A</name><LineString><coordinates>-84,35 -83,36</coordinates></LineString></Placemark><Placemark><name>Pin B</name><TimeStamp><when>2026-11-23</when></TimeStamp><Point><coordinates>121,31</coordinates></Point></Placemark><Placemark><name>Route B</name><LineString><coordinates>-83,36 -82,37</coordinates></LineString></Placemark></Document></kml>';
 await page.locator('#kml-file').setInputFiles({name:'separated.kml',mimeType:'application/xml',buffer:Buffer.from(fixture)});await page.waitForFunction(()=>document.querySelectorAll('#itinerary li').length===4);
 assert.equal(await page.locator('#route-itinerary li').count(),2);assert.equal(await page.locator('#point-itinerary li').count(),2);
 await page.getByRole('button',{name:'Move Route B earlier',exact:true}).click();assert.deepEqual(await page.locator('#route-itinerary li h3').allTextContents(),['Route B','Route A']);assert.deepEqual(await page.locator('#point-itinerary li h3').allTextContents(),['Pin A','Pin B']);
 await page.locator('#places-tab').click();await page.getByRole('button',{name:'Move Pin B earlier',exact:true}).click();assert.deepEqual(await page.locator('#point-itinerary li h3').allTextContents(),['Pin B','Pin A']);await saved(page);
 const result=await page.evaluate(async()=>{const {exportKML,importKML}=await import('/js/journey-kml.mjs');const state=JSON.parse(localStorage.getItem('wanderlust-studio-v1')),trip=state.trips.find(t=>t.id===state.activeTrip),text=exportKML(trip),xml=new DOMParser().parseFromString(text,'application/xml');return {folders:[...xml.querySelectorAll('Folder > name')].map(n=>n.textContent),lines:[...xml.querySelectorAll('LineString coordinates')].map(n=>n.textContent),points:xml.querySelectorAll('Folder')[1].querySelectorAll('Point').length,again:importKML(text).trip.items};});
 assert.deepEqual(result.folders,['Route segments','Saved places']);assert.deepEqual(result.lines,['-83,36 -82,37','-84,35 -83,36']);assert.equal(result.points,2);assert.equal(result.again.length,4);assert.equal(result.again.find(p=>p.name==='Pin B').start,'2026-11-23');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('states and parks have independent saved selections and titles; all four templates render in both modes',async()=>{
 const {context,page,errors}=await setup();try{
 await page.locator('#open-bucket').click();await page.waitForFunction(()=>!document.querySelector('#export-poster').disabled);await page.locator('#park-checklist input[value=grsm]').check();await page.locator('#poster-title').fill('My national parks');
 await page.locator('#bucket-states').click();assert.equal(await page.locator('#park-checklist input').count(),50);assert.equal(await page.locator('#park-checklist input[value="11"]').count(),0);assert.equal(await page.locator('#park-checklist input:checked').count(),0);
 await page.locator('#park-checklist input[value="47"]').check();await page.locator('#park-checklist input[value="15"]').check();await page.locator('#poster-title').fill('Every state, a new story');
 const hashes=[];
 for(const mode of ['parks','states']){
   await page.locator('#bucket-'+mode).click();
   for(const template of ['fieldnotes','midnight','postcard','atlas']){
     await page.locator('button[data-template="'+template+'"]').click();await page.waitForFunction(({mode,template})=>{const canvas=document.querySelector('#park-poster');return !document.querySelector('#export-poster').disabled&&canvas.dataset.mode===mode&&canvas.dataset.template===template;},{mode,template});
     hashes.push(await page.locator('#park-poster').evaluate(async canvas=>{const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.7));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].join(',');}));
   }
 }
 assert.equal(new Set(hashes).size,8);assert.match(await page.locator('#park-count').textContent(),/2 of 50/);await saved(page);
 const downloading=page.waitForEvent('download');await page.locator('#export-poster').click();const file=await downloading;assert.equal(file.suggestedFilename(),'Every state, a new story.jpg');const bytes=await fs.readFile(await file.path());assert.equal(bytes[0],255);assert.equal(bytes[1],216);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#save-status').textContent!=='Opening your local notebook…');await page.locator('#open-bucket').click();await page.waitForFunction(()=>!document.querySelector('#export-poster').disabled);
 assert.equal(await page.locator('#bucket-states').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#park-checklist input[value="47"]').isChecked(),true);assert.equal(await page.locator('#poster-title').inputValue(),'Every state, a new story');assert.equal(await page.locator('button[data-template=atlas]').getAttribute('aria-pressed'),'true');
 await page.locator('#bucket-parks').click();assert.equal(await page.locator('#park-checklist input[value=grsm]').isChecked(),true);assert.equal(await page.locator('#poster-title').inputValue(),'My national parks');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
test('legacy notebooks restore existing parks and journeys with safe defaults for new preferences',async()=>{
 const context=await browser.newContext(),page=await context.newPage();try{
 await page.addInitScript(()=>{localStorage.setItem('wanderlust-studio-v1',JSON.stringify({version:1,activeTrip:'legacy',trips:[{id:'legacy',name:'Existing trip',items:[{id:'pin',kind:'point',name:'Old place',coordinates:[-83,35],important:true}],updatedAt:1}],visited:['acad'],posterTitle:'My old park print',updatedAt:1}));});await page.route('https://tiles.openfreemap.org/**',r=>r.abort());await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>document.querySelector('#trip-name').value==='Existing trip');assert.equal(await page.locator('[data-units=imperial]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#point-itinerary li').count(),1);assert.equal(await page.locator('#route-itinerary li').count(),0);
 await page.locator('#open-bucket').click();await page.waitForFunction(()=>!document.querySelector('#export-poster').disabled);assert.equal(await page.locator('#park-checklist input[value=acad]').isChecked(),true);assert.equal(await page.locator('#poster-title').inputValue(),'My old park print');await page.locator('#bucket-states').click();assert.equal(await page.locator('#park-checklist input:checked').count(),0);
 }finally{await context.close();}
});

test('settings language toggles translate live UI and persist without rewriting user content',async()=>{
 const {context,page,errors}=await setup();try{
 await point(page,'Night');await routeMock(page);await segment(page);await page.locator('#trip-name').fill('My custom journey');await saved(page);
 await page.locator('#open-settings').click();await page.locator('[data-language=zh]').click();await page.locator('[data-units=imperial]').click();
 assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');assert.equal(await page.locator('#settings-title').textContent(),'设置');assert.equal(await page.locator('[data-units=imperial]').textContent(),'英制 · mi');
 await page.locator('[data-close=settings-dialog]').last().click();assert.equal(await page.locator('.map-heading h1').innerText(),'玩嘚儿了~');assert.equal(await page.locator('#find-routes').innerText(),'查找路线方案');assert.equal(await page.locator('#trip-name').inputValue(),'My custom journey');assert.match(await page.locator('#point-itinerary').innerText(),/Night/);assert.match(await page.locator('#point-itinerary [data-item-action=edit]').getAttribute('aria-label'),/编辑/);
 await page.locator('#segment-tab').click();await page.locator('#segment-mode label').filter({has:page.locator('input[value=walk]')}).click();assert.match(await page.locator('#mode-hint').textContent(),/步行/);
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('已保存'));await page.reload();await page.waitForFunction(()=>document.documentElement.lang==='zh-CN');assert.equal(await page.locator('[data-units=imperial]').getAttribute('aria-pressed'),'true');
 await page.locator('#open-settings').click();await page.locator('[data-language=en]').click();assert.equal(await page.locator('#settings-title').textContent(),'Settings');await page.locator('[data-close=settings-dialog]').last().click();assert.equal(await page.locator('#point-itinerary li h3').innerText(),'★ Night');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('landscape export keeps full resolution while preview supports mouse, drag and keyboard',async()=>{
 const {context,page,errors}=await setup();try{
 await page.locator('#open-bucket').click();await page.waitForFunction(()=>!document.querySelector('#export-poster').disabled);await page.locator('button[data-orientation=landscape]').click();await page.waitForFunction(()=>document.querySelector('#park-poster').dataset.orientation==='landscape');
 const size=()=>page.locator('#park-poster').evaluate(c=>[c.width,c.height]);assert.deepEqual(await size(),[3000,2400]);
 const viewport=page.locator('#poster-viewport');await viewport.scrollIntoViewIfNeeded();const box=await viewport.boundingBox();await page.mouse.move(box.x+box.width*.6,box.y+box.height*.5);await page.mouse.wheel(0,-300);await page.waitForFunction(()=>Number(document.querySelector('#poster-viewport').dataset.zoom)>1.5);
 const before=await page.locator('#park-poster').getAttribute('style');await page.mouse.down();await page.mouse.move(box.x+box.width*.6+65,box.y+box.height*.5+45,{steps:4});await page.mouse.up();assert.notEqual(await page.locator('#park-poster').getAttribute('style'),before);
 await viewport.press('Home');assert.equal(await viewport.getAttribute('data-zoom'),'1');await viewport.dblclick();assert.equal(await viewport.getAttribute('data-zoom'),'1.6');await page.locator('#poster-fit').click();assert.equal(await viewport.getAttribute('data-zoom'),'1');await page.locator('#poster-zoom-in').click();assert.equal(await viewport.getAttribute('data-zoom'),'1.25');
 assert.deepEqual(await size(),[3000,2400]);const downloading=page.waitForEvent('download');await page.locator('#export-poster').click();const download=await downloading,bytes=await fs.readFile(await download.path());assert.equal(bytes[0],255);assert.equal(bytes[1],216);
 assert.deepEqual(jpegSize(bytes),[6000,4800]);await saved(page);
 await page.reload();await page.locator('#open-bucket').click();await page.waitForFunction(()=>document.querySelector('#park-poster').dataset.orientation==='landscape');assert.deepEqual(await size(),[3000,2400]);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('journey palettes, individual colors and all-journey visibility survive reload and KML round trip',async()=>{
 const {context,page,errors}=await setup();try{
 await point(page,'First pin');await page.locator('#new-trip').click();await point(page,'Second pin');await page.locator('#open-settings').click();
 const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')));assert.notEqual(initial.trips[0].color,initial.trips[1].color);
 await page.locator('[data-palette=coast]').click();await page.locator('[data-trip-color]').first().evaluate(input=>{input.value='#e52984';input.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('[data-close=settings-dialog]').last().click();await page.locator('[data-journey-visible]').first().uncheck();await saved(page);
 const exported=await page.evaluate(async()=>{const state=JSON.parse(localStorage.getItem('wanderlust-studio-v1'));const {exportKML,importKML}=await import('/js/journey-kml.mjs');return {state,reimported:importKML(exportKML(state.trips[0])).trip};});assert.equal(exported.state.trips[0].color,'#e52984');assert.equal(exported.state.palette,'coast');assert.equal(exported.state.trips[0].visible,false);assert.equal(exported.state.trips[1].visible,true);assert.equal(exported.reimported.color,'#e52984');
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('[data-trip-color]').length===2);assert.equal(await page.locator('[data-trip-color]').first().inputValue(),'#e52984');assert.equal(await page.locator('[data-journey-visible]').first().isChecked(),false);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('walking radio uses the pedestrian service and preserves walk mode in edits and KML',async()=>{
 const {context,page,errors}=await setup();try{
 let calls=0;await page.route('https://routing.openstreetmap.de/routed-foot/**',route=>{calls++;return route.fulfill({json:{code:'Ok',waypoints:[{distance:1},{distance:3}],routes:[0,1,2].map(i=>({distance:1200+i*350,duration:900+i*300,geometry:{type:'LineString',coordinates:[[-83.926,35.957],[-83.922+i*.001,35.96],[-83.918,35.963]]}}))}});});
 await page.route('https://router.project-osrm.org/**',()=>{throw new Error('Walking must not request a driving route');});
 await page.locator('#segment-mode label').filter({has:page.locator('input[value=walk]')}).click();await coordinate(page,'start','35.957, -83.926');await coordinate(page,'end','35.963, -83.918');await page.locator('#find-routes').click();await page.waitForFunction(()=>document.querySelectorAll('.route-option').length===3);assert.match(await page.locator('.route-option').first().innerText(),/walking route/);assert.equal(calls,1);
 await page.getByRole('button',{name:'Add selected segment'}).click();await saved(page);assert.match(await page.locator('#route-itinerary').innerText(),/Walk/);
 await page.locator('#route-itinerary li').getByRole('button',{name:/^Edit /}).click();assert.equal(await page.locator('#edit-mode input[value=walk]').isChecked(),true);await page.locator('[data-close=edit-dialog]').click();
 const roundtrip=await page.evaluate(async()=>{const {exportKML,importKML}=await import('/js/journey-kml.mjs');const state=JSON.parse(localStorage.getItem('wanderlust-studio-v1'));return importKML(exportKML(state.trips[0])).trip;});assert.equal(roundtrip.items[0].mode,'walk');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('map themes and 2D / 3D retain every colored journey after style replacement',async()=>{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await page.addInitScript(()=>{let library;Object.defineProperty(window,'maplibregl',{configurable:true,get(){return library;},set(value){library=value;const Original=value.Map;value.Map=class extends Original{constructor(options){super(options);window.__testMap=this;}};}});});
 await page.route('https://tiles.openfreemap.org/**',route=>{const theme=route.request().url().split('/').at(-1);return route.fulfill({json:{version:8,sources:{},layers:[{id:'theme-'+theme,type:'background',paint:{'background-color':theme==='dark'?'#112233':'#e0e5df'}}]}});});
 await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>window.__testMap?.getLayer('theme-positron'));await routeMock(page);await segment(page);await page.locator('#new-trip').click();await point(page,'Other journey pin');await saved(page);
 const featureColors=()=>page.evaluate(()=>[...new Set(window.__testMap.getSource('studio-data')._data.features.map(f=>f.properties.color))]);assert.equal((await featureColors()).length,2);
 await page.locator('#open-settings').click();
 for(const theme of ['dark','positron','bright']){await page.locator('#map-theme').selectOption(theme);await page.waitForFunction(theme=>window.__testMap.getLayer('theme-'+theme)&&window.__testMap.getSource('studio-data')?._data.features.length===4,theme);assert.equal((await featureColors()).length,2);}
 await page.locator('[data-map-view="3d"]').click();await page.waitForFunction(()=>window.__testMap.getPitch()>50);await page.locator('#map-theme').selectOption('liberty');await page.waitForFunction(()=>window.__testMap.getLayer('theme-liberty')&&window.__testMap.getPitch()>50&&window.__testMap.getSource('studio-data')?._data.features.length===4);assert.equal((await featureColors()).length,2);
 await page.locator('[data-map-view="2d"]').click();await page.waitForFunction(()=>window.__testMap.getPitch()===0);await page.locator('[data-close=settings-dialog]').last().click();await page.locator('[data-journey-visible]').first().uncheck();await page.waitForFunction(()=>window.__testMap.getSource('studio-data')._data.features.length===1);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('Chinese mobile controls fit at 320px and fallback clearly disables 3D',async()=>{
 const {context,page,errors}=await setup({fallback:true});try{
 await page.setViewportSize({width:320,height:800});await page.waitForFunction(()=>!document.querySelector('#studio-fallback').hidden);await page.locator('#open-settings').click();await page.locator('[data-language=zh]').click();await page.locator('[data-close=settings-dialog]').last().click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.locator('[data-map-view="3d"]').isDisabled(),true);
 await page.locator('#open-bucket').click();await page.waitForFunction(()=>!document.querySelector('#export-poster').disabled);await page.locator('button[data-orientation=landscape]').click();await page.waitForFunction(()=>document.querySelector('#park-poster').width===3000);assert.equal(await page.locator('#bucket-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('globe projection stays editable across theme changes, reload and return to 2D',async()=>{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await page.addInitScript(()=>{let library;Object.defineProperty(window,'maplibregl',{configurable:true,get(){return library;},set(value){library=value;const Original=value.Map;value.Map=class extends Original{constructor(options){super(options);window.__testMap=this;}};}});});
 await page.route('https://tiles.openfreemap.org/**',route=>{const theme=route.request().url().split('/').at(-1);return route.fulfill({json:{version:8,sources:{},layers:[{id:'theme-'+theme,type:'background',paint:{'background-color':'#acced8'}}]}});});
 await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>window.__testMap?.getLayer('theme-positron'));
 const fixture='<kml><Document><name>Globe journey</name><Placemark><name>Continental route</name><LineString><coordinates>-120,35 -110,30 -98,25</coordinates></LineString></Placemark><Placemark><name>Independent pin</name><Point><coordinates>-95,34</coordinates></Point></Placemark></Document></kml>';
 await page.locator('#kml-file').setInputFiles({name:'globe.kml',mimeType:'application/xml',buffer:Buffer.from(fixture)});await page.waitForFunction(()=>document.querySelectorAll('#itinerary li').length===2);
 await page.locator('#open-settings').click();assert.equal(await page.locator('#settings-dialog #map-theme').count(),1);assert.equal(await page.locator('.studio-map-panel #map-theme').count(),0);
 await page.locator('[data-map-view=globe]').click();await page.waitForFunction(()=>window.__testMap.getProjection()?.type==='globe'&&window.__testMap.getZoom()<3);
 await page.locator('#map-theme').selectOption('dark');await page.waitForFunction(()=>window.__testMap.getLayer('theme-dark')&&window.__testMap.getProjection()?.type==='globe'&&window.__testMap.getSource('studio-data')._data.features.length===4);
 await page.locator('[data-close=settings-dialog]').last().click();await page.waitForFunction(()=>window.__testMap.queryRenderedFeatures({layers:['studio-lines']}).length>0);
 await page.locator('#point-tab').click();await page.locator('#pick-point').click();const canvas=page.locator('#studio-map canvas'),box=await canvas.boundingBox();await canvas.click({position:{x:10,y:box.height/2}});assert.equal(await page.locator('#point-query').inputValue(),'');
 await canvas.click({position:{x:box.width/2,y:box.height/2}});await page.waitForFunction(()=>document.querySelector('#point-query').value.includes(','));await page.locator('#point-name').fill('Picked on globe');await page.getByRole('button',{name:'Add place',exact:true}).click();await saved(page);
 await page.reload();await page.waitForFunction(()=>window.__testMap?.getProjection()?.type==='globe'&&window.__testMap.getSource('studio-data')?._data.features.length===5);assert.equal(await page.locator('#point-itinerary li').count(),2);
 await page.locator('#open-settings').click();assert.equal(await page.locator('[data-map-view=globe]').getAttribute('aria-pressed'),'true');await page.locator('[data-map-view="2d"]').click();await page.waitForFunction(()=>window.__testMap.getProjection()?.type==='mercator'&&window.__testMap.getPitch()===0);assert.equal(await page.evaluate(()=>window.__testMap.getSource('studio-data')._data.features.length),5);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('fresh and legacy notebooks default to imperial while an explicit metric preference survives',async()=>{
 const {context,page,errors}=await setup();try{
 assert.equal(await page.locator('[data-units=imperial]').getAttribute('aria-pressed'),'true');
 const migration=await page.evaluate(async()=>{const {normalizeWorkspace}=await import('/js/journey-storage.mjs');const empty=()=>({version:1,trips:[]});return [normalizeWorkspace(empty()).units,normalizeWorkspace({...empty(),units:'metric'}).units,normalizeWorkspace({...empty(),units:'imperial'}).units];});assert.deepEqual(migration,['imperial','metric','imperial']);
 await units(page,'metric');await saved(page);await page.reload();await page.waitForFunction(()=>document.querySelector('[data-units=metric]').getAttribute('aria-pressed')==='true');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

const motionFixture='<kml><Document><name>Mixed transport</name><Placemark><name>Independent pin</name><Point><coordinates>130,35</coordinates></Point></Placemark>'+['car','train','plane','walk'].map((mode,index)=>'<Placemark><name>'+mode+' segment</name><ExtendedData><Data name="mode"><value>'+mode+'</value></Data><Data name="vehicle"><value>Subaru Outback</value></Data></ExtendedData><LineString><coordinates>'+['-84,35 -83.7,35.2 -83.4,35.1 -83,35.4','-83,35.4 -82.7,35.6 -82,35.7','-82,35.7 -65,45 -40,52 -5,52','-5,52 -4.99,52.01 -4.98,52.013'][index]+'</coordinates></LineString></Placemark>').join('')+'</Document></kml>';
async function motion(page){await page.locator('#kml-file').setInputFiles({name:'motion.kml',mimeType:'application/xml',buffer:Buffer.from(motionFixture)});await page.waitForFunction(()=>document.querySelectorAll('#route-itinerary li').length===4);await saved(page);}
async function motionStops(page){return page.evaluate(async()=>{const {playbackPlan}=await import('/js/journey-playback.mjs'),state=JSON.parse(localStorage.getItem('wanderlust-studio-v1')),plan=playbackPlan(state.trips.find(t=>t.id===state.activeTrip).items);return plan.segments.map(s=>Number(((s.offset+s.duration*.65)/plan.total*1000).toFixed(6)));});}

for(const view of ['2d','globe','canvas'])test(`flight follow keeps a stable screen position on rendered frames (${view})`,async()=>{
 const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));try{
 await page.addInitScript(fallback=>{if(fallback)Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined});let library;Object.defineProperty(window,'maplibregl',{configurable:true,get:()=>library,set(value){library=value;const Original=value.Map;value.Map=class extends Original{constructor(options){super(options);window.__testMap=this;}};}});},view==='canvas');
 await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[{id:'test-background',type:'background',paint:{'background-color':'#dfe9df'}}]}}));
 await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>document.querySelector('#save-status').textContent!=='Opening your local notebook…');
 const fixture='<kml><Document><Placemark><name>Flight</name><ExtendedData><Data name="mode"><value>plane</value></Data></ExtendedData><LineString><coordinates>-118,34 -95,42 -75,44 -40,52 -5,52</coordinates></LineString></Placemark></Document></kml>';
 await page.locator('#kml-file').setInputFiles({name:'flight.kml',mimeType:'application/xml',buffer:Buffer.from(fixture)});await page.waitForFunction(()=>document.querySelectorAll('#route-itinerary li').length===1);await saved(page);
 if(view==='globe'){await page.locator('#open-settings').click();await page.locator('[data-map-view=globe]').click();await page.locator('[data-close=settings-dialog]').last().click();}
 if(view!=='canvas'){await page.waitForFunction(()=>window.__testMap&&!window.__testMap.isMoving());await page.evaluate(view=>window.__testMap.jumpTo({zoom:view==='globe'?1.5:5.25}),view);}
 await page.evaluate(async()=>{window.__flightSamples=[];const {JourneyPlayback}=await import('/js/journey-playback.mjs'),sprite=JourneyPlayback.prototype.sprite;JourneyPlayback.prototype.sprite=function(mode,point,angle,size){if(mode==='plane'&&this.state==='playing')window.__flightSamples.push({point,elapsed:this.frame.elapsed});return sprite.call(this,mode,point,angle,size);};});
 await page.locator('#player-progress').fill('100');await page.locator('#player-speed').selectOption('4');await page.locator('#player-toggle').click();await page.waitForFunction(()=>window.__flightSamples.length>=12);await page.locator('#player-toggle').click();
 const samples=await page.evaluate(()=>window.__flightSamples),range=axis=>Math.max(...samples.map(s=>s.point[axis]))-Math.min(...samples.map(s=>s.point[axis]));
 assert.ok(new Set(samples.map(s=>s.elapsed)).size>=8,'the route is advancing, not just repainting a still frame');
 assert.ok(range(0)<.25&&range(1)<.25,`follow position must stay steady: ${range(0)} × ${range(1)} px`);
 if(view==='2d'){
  await page.locator('#player-speed').selectOption('1');await page.locator('#player-toggle').click();await page.locator('#map-plus').click();await page.waitForFunction(()=>Math.abs(window.__testMap.getZoom()-6.25)<.001);
  await page.mouse.move(900,400);await page.mouse.wheel(0,-250);await page.waitForFunction(()=>window.__testMap.getZoom()>6.35);await page.waitForFunction(()=>!window.__testMap.isMoving());
  await page.locator('#player-follow').uncheck();await page.evaluate(()=>window.__flightSamples=[]);await page.waitForFunction(()=>window.__flightSamples.length>=8);
  const free=await page.evaluate(()=>window.__flightSamples);assert.ok(Math.max(...free.map(s=>s.point[0]))-Math.min(...free.map(s=>s.point[0]))>2,'without following the plane moves across the map');await page.locator('#player-toggle').click();
 }
 assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

for(const fallback of [false,true])test(`playback preserves zoom across segment transitions, seeks and replay (${fallback?'canvas':'WebGL'})`,async()=>{
 const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));try{
 if(fallback)await page.addInitScript(()=>Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined}));
 else await page.addInitScript(()=>{let library;Object.defineProperty(window,'maplibregl',{configurable:true,get(){return library;},set(value){library=value;const Original=value.Map;value.Map=class extends Original{constructor(options){super(options);window.__testMap=this;}};}});});
 await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[{id:'test-background',type:'background',paint:{'background-color':'#dfe9df'}}]}}));
 await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>document.querySelector('#save-status').textContent!=='Opening your local notebook…');await motion(page);
 if(fallback){
  await page.waitForFunction(()=>!document.querySelector('#studio-fallback').hidden);
  await page.evaluate(async()=>{const {RouteSketch}=await import('/js/route-sketch.mjs'),zoom=RouteSketch.prototype.zoom;RouteSketch.prototype.zoom=function(...args){window.__testSketch=this;return zoom.apply(this,args);};});
  await page.locator('#map-plus').click();
 }else{await page.waitForFunction(()=>window.__testMap&&!window.__testMap.isMoving());await page.evaluate(()=>window.__testMap.jumpTo({zoom:5.25}));}
 const scale=()=>page.evaluate(fallback=>fallback?window.__testSketch.scale:window.__testMap.getZoom(),fallback);
 let expected=await scale();
 const boundaries=await page.evaluate(async()=>{const {playbackPlan}=await import('/js/journey-playback.mjs'),workspace=JSON.parse(localStorage.getItem('wanderlust-studio-v1')),plan=playbackPlan(workspace.trips.find(trip=>trip.id===workspace.activeTrip).items);return plan.segments.slice(1).map(segment=>Number(((segment.offset-Math.min(.25,segment.duration*.1))/plan.total*1000).toFixed(6)));});
 await page.locator('#player-speed').selectOption('4');
 for(const [index,progress]of boundaries.entries()){
  await page.locator('#player-speed').selectOption(index===boundaries.length-1?'1':'4');
  await page.locator('#player-progress').fill(String(progress));assert.ok(Math.abs(await scale()-expected)<1e-8,'seeking keeps the current zoom');
  await page.locator('#player-toggle').click();await page.waitForFunction(index=>Number(document.querySelector('#journey-player').dataset.segment)===index+1,index);await page.locator('#player-toggle').click();
  assert.ok(Math.abs(await scale()-expected)<1e-8,'automatic segment transition keeps the current zoom');
  if(index===0){await page.locator('#map-plus').click();if(!fallback)await page.waitForFunction(()=>!window.__testMap.isMoving());const changed=await scale();assert.ok(changed>expected);expected=changed;}
 }
 await page.locator('#player-restart').click();await page.waitForFunction(()=>document.querySelector('#journey-player').dataset.state==='playing'&&document.querySelector('#journey-player').dataset.segment==='0');await page.locator('#player-toggle').click();assert.ok(Math.abs(await scale()-expected)<1e-8,'replay retains a zoom chosen during playback');
 assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('playback interpolation crosses the date line without joining disconnected segments or independent pins',async()=>{
 const {context,page}=await setup();try{
 const result=await page.evaluate(async()=>{const {playbackPlan,playbackFrame}=await import('/js/journey-playback.mjs');const items=[{id:'pin',kind:'point',name:'Not a route',coordinates:[0,0]},{id:'fly',kind:'segment',name:'Dateline',mode:'plane',coordinates:[[179,10],[179,10],[-179,10]]},{id:'walk',kind:'segment',name:'Separate trail',mode:'walk',coordinates:[[30,30],[30.01,30.01]]},{id:'zero',kind:'segment',name:'Stationary',mode:'car',coordinates:[[1,1],[1,1]]}];const plan=playbackPlan(items);return {count:plan.segments.length,mid:playbackFrame(plan,plan.segments[0].duration/2).position,boundary:playbackFrame(plan,plan.segments[1].offset).position,end:playbackFrame(plan,plan.total).position,empty:playbackFrame(playbackPlan([items[0],items[3]]),0)};});
 assert.equal(result.count,2);assert.ok(Math.abs(Math.abs(result.mid[0])-180)<.001);assert.deepEqual(result.boundary,[30,30]);assert.deepEqual(result.end,[30.01,30.01]);assert.equal(result.empty,null);
 }finally{await context.close();}
});

test('playback supports pause, seek, all transport effects, speed, replay and immutable stored routes',async()=>{
 const {context,page,errors}=await setup();try{
 await motion(page);const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')).trips);assert.equal(await page.locator('#journey-player').isVisible(),true);
 await page.locator('#player-speed').selectOption('4');await page.locator('#player-toggle').click();await page.waitForFunction(()=>Number(document.querySelector('#journey-player').dataset.progress)>.01);assert.equal(await page.locator('.player-pause-icon').isVisible(),true);await page.locator('#player-toggle').click();assert.equal(await page.locator('#journey-player').getAttribute('data-state'),'paused');
 const paused=await page.locator('#player-progress').inputValue();await page.waitForTimeout(250);assert.equal(await page.locator('#player-progress').inputValue(),paused);
 const stops=await motionStops(page),hashes=[];for(const [index,mode]of ['car','train','plane','walk'].entries()){
 await page.locator('#player-progress').fill(String(stops[index]));assert.equal(await page.locator('#journey-player').getAttribute('data-mode'),mode);
 // The overlay commits with the basemap render, after the seek input event.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 hashes.push(await page.locator('#journey-animation').evaluate(canvas=>canvas.toDataURL()));
 }assert.equal(new Set(hashes).size,4);
 await page.locator('#player-progress').press('End');assert.equal(await page.locator('#journey-player').getAttribute('data-state'),'finished');assert.equal(await page.locator('#player-toggle').getAttribute('aria-label'),'Replay journey');await page.locator('#player-restart').click();await page.waitForFunction(()=>document.querySelector('#journey-player').dataset.state==='playing'&&document.querySelector('#journey-player').dataset.mode==='car');await page.locator('#player-toggle').click();
 const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')).trips);assert.deepEqual(after,before);
 await page.locator('#new-trip').click();assert.equal(await page.locator('#journey-player').isVisible(),false);assert.equal(await page.locator('#play-journey').isDisabled(),true);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('playback trails retain hairpin corners, match map geometry and stop at horizons and world seams',async()=>{
 const {context,page}=await setup();try{
 const result=await page.evaluate(async()=>{
  const {playbackPlan,playbackFrame,projectPlaybackTrail}=await import('/js/journey-playback.mjs');
  const {mercator}=await import('/js/route-data.mjs');
  const planFor=coordinates=>playbackPlan([{id:'route',kind:'segment',mode:'car',coordinates}]);
  const plan=planFor([[0,0],[1,0],[1,.1],[0,.1],[0,.2],[1,.2]]),frame=playbackFrame(plan,plan.total);
  const project=([x,y])=>[x*100,y*100],trail=projectPlaybackTrail(frame,project,{length:1000});
  const length=points=>points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
  const corners=plan.segments[0].coordinates.map(project).map(corner=>trail.some(p=>Math.hypot(p[0]-corner[0],p[1]-corner[1])<1e-6));
  const capped=[100,1000].map(scale=>length(projectPlaybackTrail(frame,([x,y])=>[x*scale,y*scale])));
  const polar=planFor([[-100,25],[-20,75]]),middle=mercator(playbackFrame(polar,polar.total/2).position),ends=polar.segments[0].coordinates.map(mercator);
  const midpointError=Math.abs((middle[0]-ends[0][0])*(ends[1][1]-ends[0][1])-(middle[1]-ends[0][1])*(ends[1][0]-ends[0][0]));
  const straight=planFor([[0,0],[10,0]]),last=playbackFrame(straight,straight.total);
  const horizon=projectPlaybackTrail(last,([x,y])=>x<5?null:[x*20,y]);
  const seam=projectPlaybackTrail(last,([x,y])=>[x*20+(x<5?1000:0),y],{maxJump:100});
  const curved=projectPlaybackTrail(last,([x])=>[100+80*Math.cos(x/10),100+80*Math.sin(x/10)]);
  const curveError=Math.max(...curved.slice(1).map((p,i)=>Math.abs(Math.hypot((p[0]+curved[i][0])/2-100,(p[1]+curved[i][1])/2-100)-80)));
  return {corners,length:length(trail),capped,midpointError,horizon,seam,curveError};
 });
 assert.ok(result.corners.every(Boolean),'every original hairpin corner remains on the trail');assert.ok(Math.abs(result.length-320)<1e-6);
 assert.ok(result.capped.every(length=>Math.abs(length-128)<1e-6));assert.ok(result.midpointError<1e-12);
 assert.ok(result.horizon.length>2&&result.horizon.every(([x])=>x>=100));assert.ok(result.seam.length>2&&result.seam.every(([x])=>x>=100&&x<=200));assert.ok(result.curveError<.4);
 }finally{await context.close();}
});

test('playback artwork loads and effects leave the route centerline clear',async()=>{
 const {context,page}=await setup();try{
 const result=await page.evaluate(async()=>{
  const {JourneyPlayback,playbackPlan,playbackFrame}=await import('/js/journey-playback.mjs');
  const images={};await Promise.all(['car','train','plane','walk','carriage'].map(async mode=>{const image=new Image();image.src='/images/journey-icons/playback/'+mode+'.svg';await image.decode();images[mode]=image;}));
  const canvas=document.createElement('canvas');canvas.width=400;canvas.height=200;const ctx=canvas.getContext('2d');
  const player=Object.assign(Object.create(JourneyPlayback.prototype),{ctx,canvas,images,w:400,h:200,dpr:1,state:'paused',color:'#31765c',map:{projectCoordinate:([x,y])=>[x*20,80-y*20]}});
  const alpha=(x,y,w,h)=>ctx.getImageData(x,y,w,h).data.filter((_,i)=>i%4===3).some(value=>value>0);
  const modes=[];
  for(const mode of ['car','train','plane','walk']){
   const plan=playbackPlan([{id:mode,kind:'segment',mode,coordinates:[[0,0],[10,0]]}]);player.frame=playbackFrame(plan,plan.total);player.draw();
   modes.push({mode,icon:alpha(180,50,40,60),centerline:alpha(90,79,60,3),above:alpha(110,63,50,8),below:alpha(110,89,50,8)});
  }
  return modes;
 });
 assert.ok(result.every(mode=>mode.icon));
 assert.equal(result.find(mode=>mode.mode==='car').centerline,false,'car does not repaint a thick duplicate route');
 const plane=result.find(mode=>mode.mode==='plane');assert.equal(plane.centerline,false,'plane trails do not erase the dashed route');assert.ok(plane.above&&plane.below,'both engine trails are visible');
 }finally{await context.close();}
});

test('playback redraws only traveled geometry and retains completed independent segments when seeking',async()=>{
 const {context,page}=await setup();try{
 const result=await page.evaluate(async()=>{
  const {JourneyPlayback,playbackPlan,playbackFrame,playbackRoutes,projectPlaybackPath}=await import('/js/journey-playback.mjs');
  const original=[{id:'road',kind:'segment',mode:'car',coordinates:[[0,0],[10,0]]},{id:'flight',kind:'segment',mode:'plane',coordinates:[[10,1],[20,1]]},{id:'pin',kind:'point',coordinates:[9,.5]}],before=JSON.stringify(original),plan=playbackPlan(original);
  const canvas=document.createElement('canvas');canvas.width=500;canvas.height=200;const ctx=canvas.getContext('2d');
  const player=Object.assign(Object.create(JourneyPlayback.prototype),{ctx,canvas,images:{},w:500,h:200,dpr:1,state:'paused',color:'#31765c',tripId:'trip',map:{unwrapPlaybackCoordinates:c=>c,projectCoordinate:([x,y])=>[x*20,80-y*20]}});
  const alpha=(x,y)=>ctx.getImageData(x,y,1,1).data[3];
  const at=seconds=>{const frame=playbackFrame(plan,seconds);player.frame=frame;player.routes=playbackRoutes(plan,frame);player.draw();return player.routes;};
  at(0);const start=alpha(50,80);
  const halfway=at(plan.segments[0].duration/2),head=halfway.at(-1).coordinates.at(-1),middle={past:alpha(40,80),future:alpha(160,80)};
  const second=at(plan.segments[1].offset+plan.segments[1].duration*.7),later={past:alpha(40,80),gap:alpha(200,70),future:alpha(390,60),dashes:Array.from({length:80},(_,i)=>alpha(210+i,60)>0)};
  const full=at(plan.total).map(route=>route.coordinates);
  at(plan.segments[0].duration*.2);const rewind=alpha(160,80);
  at(0);const restart=alpha(50,80);
  const paths=projectPlaybackPath([[0,0],[10,0]],([x,y])=>x>4&&x<6?null:[x*20,y]);
  return {start,head,middle,later,full,rewind,restart,ids:second.map(s=>s.id),immutable:before===JSON.stringify(original),horizonGaps:paths.every(path=>!path.some(([x])=>x<80)||!path.some(([x])=>x>120))};
 });
 assert.equal(result.start,0);assert.deepEqual(result.head,[5,0]);assert.ok(result.middle.past>0);assert.equal(result.middle.future,0);
 assert.deepEqual(result.ids,['road','flight']);assert.ok(result.later.past>0);assert.equal(result.later.gap,0);assert.equal(result.later.future,0);assert.ok(result.later.dashes.some(Boolean)&&result.later.dashes.some(value=>!value));
 assert.deepEqual(result.full,[[[0,0],[10,0]],[[10,1],[20,1]]]);assert.equal(result.rewind,0);assert.equal(result.restart,0);assert.ok(result.immutable&&result.horizonGaps);
 }finally{await context.close();}
});

test('car model is editable, retained during route replacement and round-trips in KML and local storage',async()=>{
 const {context,page,errors}=await setup();try{
 await routeMock(page);await page.locator('#segment-vehicle').fill('Outback & <Adventure>');await segment(page);assert.match(await page.locator('#route-itinerary').textContent(),/Outback & <Adventure>/);assert.equal(await page.locator('#segment-vehicle').inputValue(),'Outback & <Adventure>');
 await page.locator('#route-itinerary li').getByRole('button',{name:/^Edit /}).click();await page.locator('#edit-vehicle').fill('Our Subaru');await page.getByRole('button',{name:'Save changes'}).click();await saved(page);
 await page.locator('#route-itinerary li').getByRole('button',{name:/^Edit /}).click();await page.locator('#replace-route').click();assert.equal(await page.locator('#segment-vehicle').inputValue(),'Our Subaru');await page.locator('#cancel-replace').click();
 const roundtrip=await page.evaluate(async()=>{const {exportKML,importKML}=await import('/js/journey-kml.mjs'),state=JSON.parse(localStorage.getItem('wanderlust-studio-v1')),trip=state.trips[0];return importKML(exportKML(trip)).trip.items[0].vehicle;});assert.equal(roundtrip,'Our Subaru');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#route-itinerary').textContent.includes('Our Subaru'));await page.locator('#segment-mode label').filter({has:page.locator('input[value=plane]')}).click();assert.equal(await page.locator('#segment-vehicle-label').isVisible(),false);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('flight dashes and playback survive native style changes and globe projection',async()=>{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await page.addInitScript(()=>{let library;Object.defineProperty(window,'maplibregl',{configurable:true,get(){return library;},set(value){library=value;const Original=value.Map;value.Map=class extends Original{constructor(options){super(options);window.__testMap=this;}};}});});
 await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,sources:{},layers:[{id:'theme-'+route.request().url().split('/').at(-1),type:'background',paint:{'background-color':'#dfe9df'}}]}}));
 await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>window.__testMap?.getLayer('theme-positron'));await motion(page);const stops=await motionStops(page);await page.locator('#player-progress').fill(String(stops[2]));
 const activeTrip=await page.evaluate(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')).activeTrip);
 const lineStates=()=>page.evaluate(async()=>{const m=window.__testMap;if(!m.loaded())await new Promise(resolve=>m.once('idle',resolve));const active=m.getLayoutProperty('studio-lines','visibility')==='none',completed=active?(await m.getSource('studio-completed').getData()).features:[];return m.getSource('studio-data')._data.features.filter(f=>f.geometry.type==='LineString').map(f=>({mode:f.properties.mode,hidden:active&&!completed.some(c=>c.properties.id===f.properties.id&&c.properties.tripId===f.properties.tripId)}));});
 assert.deepEqual(await lineStates(),[{mode:'car',hidden:false},{mode:'train',hidden:false},{mode:'plane',hidden:true},{mode:'walk',hidden:true}]);
 assert.deepEqual(await page.evaluate(()=>window.__testMap.getPaintProperty('studio-flights','line-dasharray')),[4,4]);assert.ok((await page.evaluate(()=>window.__testMap.queryRenderedFeatures({layers:['studio-lines']}).map(f=>f.properties.mode))).every(mode=>mode!=='plane'));
 await page.locator('#player-toggle').click();await page.locator('#open-settings').click();await page.locator('#map-theme').selectOption('dark');await page.waitForFunction(()=>window.__testMap.getLayer('theme-dark')&&window.__testMap.getLayer('studio-flights'));await page.locator('[data-map-view=globe]').click();await page.locator('[data-close=settings-dialog]').last().click();await page.waitForFunction(()=>window.__testMap.getProjection()?.type==='globe');await page.locator('#player-toggle').click();assert.equal(await page.locator('#journey-player').getAttribute('data-state'),'paused');
 assert.ok(await page.locator('#journey-animation').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)));
 assert.deepEqual(await lineStates(),[{mode:'car',hidden:false},{mode:'train',hidden:false},{mode:'plane',hidden:true},{mode:'walk',hidden:true}]);
 await page.locator('#new-trip').click();assert.ok((await lineStates()).every(f=>!f.hidden));assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('non-WebGL playback draws every transport effect and keeps a usable mobile player',async()=>{
 const {context,page,errors}=await setup({fallback:true});try{
 await page.setViewportSize({width:390,height:844});await motion(page);await page.waitForFunction(()=>!document.querySelector('#studio-fallback').hidden);const stops=await motionStops(page);
 for(const index of [0,1,2,3]){await page.locator('#player-progress').fill(String(stops[index]));await page.waitForFunction(()=>{const c=document.querySelector('#journey-animation');return c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);});}
 await page.locator('#player-toggle').click();await page.waitForFunction(()=>document.querySelector('#journey-player').dataset.state==='playing');await page.locator('#player-toggle').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('researched test journeys append once, preserve edits and survive reload',async()=>{
 const {context,page,errors}=await setup();try{
 await point(page,'My own place');await page.locator('#trip-name').fill('Personal trip');await saved(page);
 await page.locator('#open-settings').click();await page.locator('#load-samples').click();await page.waitForFunction(()=>!document.querySelector('#load-samples').disabled&&document.querySelectorAll('.journey-row').length===7);await saved(page);
 const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1'))),samples=data.trips.filter(t=>t.sampleId);
 assert.equal(samples.length,6);assert.equal(data.trips.find(t=>t.name==='Personal trip').items[0].name,'My own place');
 const parks=samples.find(t=>t.sampleId==='parks-2026-olson');assert.equal(parks.items.filter(i=>i.kind==='point').length,64);assert.equal(parks.items.filter(i=>i.kind==='segment').length,52);
 assert.equal(samples.filter(t=>t.sampleId.startsWith('rail-')).length,4);assert.equal(samples.find(t=>t.sampleId==='flight-examples').items.filter(i=>i.mode==='plane').length,3);
 assert.match(await page.locator('#sample-note').textContent(),/driving-time/);assert.ok(await page.locator('#sample-sources a').count()>=5);
 await page.locator('[data-close=settings-dialog]').last().click();await page.locator('#trip-name').fill('My customized park loop');await saved(page);
 await page.locator('#open-settings').click();await page.locator('#load-samples').click();await page.waitForFunction(()=>document.querySelector('#samples-status').textContent==='Test journeys are already loaded.');assert.equal(await page.locator('.journey-row').count(),7);assert.equal(await page.locator('#trip-name').inputValue(),'My customized park loop');
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.journey-row').length===7);assert.equal(await page.locator('#trip-name').inputValue(),'My customized park loop');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('national park overlay toggles all64 markers and survives theme changes and reload',async()=>{
 const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await page.addInitScript(()=>{let library;Object.defineProperty(window,'maplibregl',{configurable:true,get:()=>library,set(value){library=value;const Original=value.Map;value.Map=class extends Original{constructor(options){super(options);window.__testMap=this;}};}});});
 await page.route('https://tiles.openfreemap.org/**',route=>route.fulfill({json:{version:8,name:route.request().url(),sources:{},layers:[{id:'test-background',type:'background',paint:{'background-color':'#dfe9df'}}]}}));
 await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>window.__testMap?.getLayer('studio-parks'));
 assert.equal(await page.locator('#toggle-national-parks').getAttribute('aria-pressed'),'false');await page.locator('#toggle-national-parks').click();await page.waitForFunction(()=>window.__testMap.getSource('studio-parks')._data.features.length===64&&window.__testMap.getLayoutProperty('studio-parks','visibility')==='visible');await saved(page);
 await page.locator('#open-settings').click();await page.locator('#map-theme').selectOption('dark');await page.waitForFunction(()=>window.__testMap.getStyle()?.name?.endsWith('/dark')&&window.__testMap.getSource('studio-parks')?._data.features.length===64);await page.locator('[data-close=settings-dialog]').last().click();
 await page.reload();await page.waitForFunction(()=>window.__testMap?.getStyle()?.name?.endsWith('/dark')&&window.__testMap.getSource('studio-parks')?._data.features.length===64);assert.equal(await page.locator('#toggle-national-parks').getAttribute('aria-pressed'),'true');
 const coordinate=await page.evaluate(()=>{const map=window.__testMap,feature=map.getSource('studio-parks')._data.features.find(f=>f.properties.id==='grsm');map.jumpTo({center:feature.geometry.coordinates,zoom:7});return feature.geometry.coordinates;});await page.waitForTimeout(150);
 const position=await page.evaluate(coordinate=>{const p=window.__testMap.project(coordinate),r=window.__testMap.getCanvas().getBoundingClientRect();return [p.x+r.left,p.y+r.top];},coordinate);await page.mouse.click(...position);await page.waitForFunction(()=>document.querySelector('.park-popup'));assert.match(await page.locator('.park-popup').textContent(),/Great Smoky Mountains/);assert.equal(await page.locator('#edit-dialog').evaluate(d=>d.open),false);
 await page.locator('#toggle-national-parks').click();assert.equal(await page.evaluate(()=>window.__testMap.getLayoutProperty('studio-parks','visibility')),'none');assert.equal(await page.locator('.park-popup').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('combined Bucket List retains both selections and exports both checklists at double resolution',async()=>{
 const {context,page,errors}=await setup();try{
 await page.locator('#open-bucket').click();await page.waitForFunction(()=>!document.querySelector('#export-poster').disabled);await page.locator('#park-checklist input[value=grsm]').check();await page.locator('#bucket-states').click();await page.locator('#park-checklist input[value="47"]').check();await page.locator('#bucket-mixed').click();
 assert.equal(await page.locator('#park-checklist input').count(),114);assert.equal(await page.locator('#park-checklist input:checked').count(),2);assert.equal(await page.locator('.checklist-heading').count(),2);
 await page.locator('#poster-title').fill('Parks and places');await page.locator('[data-orientation=landscape]').click();await page.locator('[data-template=midnight]').click();await page.waitForFunction(()=>!document.querySelector('#export-poster').disabled&&document.querySelector('#park-poster').dataset.mode==='mixed'&&document.querySelector('#park-poster').dataset.orientation==='landscape');
 assert.match(await page.locator('#park-poster').getAttribute('aria-label'),/both complete checklists/);assert.match(await page.locator('#poster-size').textContent(),/6000 × 4800/);
 const waiting=page.waitForEvent('download');await page.locator('#export-poster').click();const file=await waiting;assert.deepEqual(jpegSize(await fs.readFile(await file.path())),[6000,4800]);await saved(page);
 await page.reload();await page.locator('#open-bucket').click();await page.waitForFunction(()=>!document.querySelector('#export-poster').disabled);assert.equal(await page.locator('#bucket-mixed').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#park-checklist input:checked').count(),2);
 await page.locator('#bucket-parks').click();assert.equal(await page.locator('#park-checklist input[value=grsm]').isChecked(),true);await page.locator('#bucket-states').click();assert.equal(await page.locator('#park-checklist input[value="47"]').isChecked(),true);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

for(const fallback of [false,true])test(`map export previews selected journeys and downloads full-resolution images and complete KML (${fallback?'canvas':'WebGL'})`,async()=>{
 const {context,page,errors}=await setup({fallback});try{
 await routeMock(page);await point(page,'A saved viewpoint');await segment(page);await page.locator('#new-trip').click();await point(page,'A second journey');
 const buttons=await page.locator('.header-actions > *').evaluateAll(nodes=>nodes.map(n=>n.id||'back'));assert.ok(buttons.indexOf('open-map-export')===buttons.indexOf('open-settings')-1);
 await page.locator('#open-map-export').click();await page.waitForFunction(()=>!document.querySelector('#download-map-jpg').disabled);assert.deepEqual(await page.locator('#map-print-canvas').evaluate(c=>[c.width,c.height]),[1200,1500]);
 await page.locator('#map-print-title').fill('Our journeys');await page.locator('[data-map-orientation=landscape]').click();await page.locator('[data-map-template=atlas]').click();await page.locator('#map-print-places').uncheck();await page.waitForFunction(()=>!document.querySelector('#download-map-jpg').disabled&&document.querySelector('#map-print-canvas').dataset.orientation==='landscape');
 const waiting=page.waitForEvent('download');await page.locator(fallback?'#download-map-jpg':'#download-map-png').click();const image=await waiting,bytes=await fs.readFile(await image.path());assert.deepEqual(fallback?jpegSize(bytes):[bytes.readUInt32BE(16),bytes.readUInt32BE(20)],[6000,4800]);
 const kmlWaiting=page.waitForEvent('download');await page.locator('#download-map-kml').click();const file=await kmlWaiting,text=await fs.readFile(await file.path(),'utf8');
 const imported=await page.evaluate(async text=>(await import('/js/journey-kml.mjs')).importKML(text).trip.items,text);assert.equal(imported.filter(i=>i.kind==='point').length,2);assert.equal(imported.filter(i=>i.kind==='segment').length,1);
 await page.locator('#map-print-scope').selectOption('active');await page.locator('#map-print-format').selectOption('map');await page.waitForFunction(()=>!document.querySelector('#download-map-jpg').disabled&&document.querySelector('#map-print-canvas').dataset.format==='map');assert.match(await page.locator('#map-print-summary').textContent(),/^1 journeys/);
 await page.locator('[data-close=map-export-dialog]').click();if(fallback){
  // The saved viewpoint is several kilometres from the park's overview marker.
  // Zoom out so the marker is in view before comparing the rendered pixels.
  for(let step=0;step<5;step++)await page.locator('#studio-fallback').press('-');
  await page.waitForTimeout(100);await page.locator('#studio-fallback').evaluate(c=>window.__beforeParks=c.toDataURL());await page.locator('#toggle-national-parks').click();
  await page.waitForFunction(()=>document.querySelector('#studio-fallback').toDataURL()!==window.__beforeParks);
 }
 assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('journey list independently controls visibility, editing and deletion and restores legacy preferences',async()=>{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await page.addInitScript(()=>{let library;Object.defineProperty(window,'maplibregl',{configurable:true,get:()=>library,set(value){library=value;const Original=value.Map;value.Map=class extends Original{constructor(options){super(options);window.__testMap=this;}};}});});
 await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'test-background',type:'background',paint:{'background-color':'#dce5d8'}}]}}));
 await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>window.__testMap?.getLayer('test-background'));await routeMock(page);await segment(page);await page.locator('#trip-name').fill('Road trip');await page.locator('#new-trip').click();await point(page,'Second pin');await page.locator('#trip-name').fill('Mountains');await page.locator('#new-trip').click();await point(page,'Third pin');await page.locator('#trip-name').fill('Coast');await saved(page);
 const rows=page.locator('.journey-row');assert.equal(await rows.count(),3);assert.equal(await page.locator('#trip-select').count(),0);await page.locator('[data-journey-visible]').nth(1).uncheck();await page.waitForFunction(()=>window.__testMap.getSource('studio-data')._data.features.length===4);
 await page.locator('[data-journey-select]').nth(1).click();assert.equal(await page.locator('#trip-name').inputValue(),'Mountains');assert.equal(await page.locator('[data-journey-visible]').nth(1).isChecked(),false);await page.waitForFunction(()=>window.__testMap.getSource('studio-data')._data.features.length===4);
 await page.locator('[data-journey-select]').first().click();await page.locator('#play-journey').click();await page.locator('[data-journey-visible]').first().uncheck();assert.equal(await page.locator('#journey-player').isVisible(),false);await page.waitForFunction(()=>window.__testMap.getSource('studio-data')._data.features.length===1);await saved(page);
 await page.reload();await page.waitForFunction(()=>window.__testMap?.getLayer('test-background')&&window.__testMap.getSource('studio-data')?._data.features.length===1);assert.equal(await page.locator('[data-journey-visible]:checked').count(),1);
 await page.locator('#journeys-hide-all').click();await page.waitForFunction(()=>window.__testMap.getSource('studio-data')._data.features.length===0);
 await page.locator('#open-map-export').click();await page.waitForFunction(()=>document.querySelector('#map-print-status').textContent.startsWith('No journeys'));assert.equal(await page.locator('#download-map-jpg').isDisabled(),true);await page.locator('[data-close=map-export-dialog]').click();
 page.once('dialog',d=>d.dismiss());await page.locator('[data-journey-delete]').last().click();assert.equal(await rows.count(),3);
 page.once('dialog',d=>d.accept());await page.locator('[data-journey-delete]').last().click();assert.equal(await rows.count(),2);assert.equal(await page.locator('#trip-name').inputValue(),'Road trip');
 page.once('dialog',d=>d.accept());await page.locator('[data-journey-delete]').first().click();assert.equal(await page.locator('#trip-name').inputValue(),'Mountains');
 page.once('dialog',d=>d.accept());await page.locator('[data-journey-delete]').first().click();assert.equal(await rows.count(),1);assert.equal(await page.locator('#trip-name').inputValue(),'My next adventure');assert.equal(await page.locator('[data-journey-visible]').isChecked(),true);await saved(page);
 const migrated=await page.evaluate(async()=>{const {normalizeWorkspace}=await import('/js/journey-storage.mjs');return normalizeWorkspace({version:1,activeTrip:'b',showAllJourneys:false,trips:[{id:'a',name:'Old A',items:[]},{id:'b',name:'Old B',items:[]}]});});assert.deepEqual(migrated.trips.map(t=>t.visible),[false,true]);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('single-color palette applies to every journey and keeps individual overrides and file icon actions',async()=>{
 const {context,page,errors}=await setup();try{
 await point(page);await page.locator('#new-trip').click();await point(page,'Second place');await page.locator('#open-settings').click();await page.locator('[data-palette=single]').click();await page.locator('#single-journey-color').evaluate(input=>{input.value='#436ed1';input.dispatchEvent(new Event('input',{bubbles:true}));});await saved(page);
 let state=await page.evaluate(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')));assert.ok(state.trips.every(t=>t.color==='#436ed1'));assert.equal(state.palette,'single');
 await page.locator('[data-trip-color]').last().evaluate(input=>{input.value='#b23e56';input.dispatchEvent(new Event('input',{bubbles:true}));});await saved(page);await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.journey-row').length===2);await page.locator('#open-settings').click();assert.equal(await page.locator('#single-journey-color').inputValue(),'#436ed1');assert.equal(await page.locator('[data-trip-color]').last().inputValue(),'#b23e56');
 await page.locator('[data-close=settings-dialog]').last().click();await page.locator('#new-trip').click();await saved(page);assert.equal(await page.locator('[data-trip-color]').last().inputValue(),'#436ed1');
 const name=await page.locator('#trip-name').boundingBox();for(const id of ['import-kml','review-trip']){assert.equal(await page.locator('.journey-name-row #'+id).count(),1);const box=await page.locator('#'+id).boundingBox();assert.ok(box.x>=name.x+name.width&&Math.abs(box.width-box.height)<1);assert.ok(await page.locator('#'+id).getAttribute('aria-label'));}
 assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

for(const fallback of [false,true])test(`export composition changes map framing, keeps poster inspection separate and exports checked journeys (${fallback?'canvas':'WebGL'})`,async()=>{
 const {context,page,errors}=await setup({fallback});try{
 await routeMock(page);await segment(page);await page.locator('#new-trip').click();await point(page,'Hidden place');await page.locator('[data-journey-visible]').last().uncheck();await saved(page);
 await page.locator('#open-map-export').click();await page.waitForFunction(()=>!document.querySelector('#download-map-jpg').disabled);assert.equal(await page.locator('#map-print-scope').inputValue(),'visible');assert.match(await page.locator('#map-print-summary').textContent(),/^1 journeys/);
 assert.equal(await page.locator('[data-map-template] img').count(),3);assert.ok(await page.locator('[data-map-template] img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0)));
 const hash=()=>page.locator('#map-print-canvas').evaluate(c=>c.toDataURL().slice(-18000));const initial=await hash();
 await page.locator('#map-compose-zoom').fill('1.75');await page.locator('#map-compose-x').fill('20');await page.locator('#map-compose-y').fill('-10');await page.waitForFunction(()=>!document.querySelector('#download-map-jpg').disabled&&JSON.parse(document.querySelector('#map-print-canvas').dataset.composition).x===20);assert.notEqual(await hash(),initial);
 const framing=await page.locator('#map-print-canvas').getAttribute('data-composition');await page.locator('[data-map-interaction=preview]').click();await page.locator('#map-print-zoom-in').click();assert.equal(await page.locator('#map-print-zoom-level').textContent(),'125%');assert.equal(await page.locator('#map-print-canvas').getAttribute('data-composition'),framing);
 await page.locator('[data-map-interaction=compose]').click();await page.locator('#map-print-viewport').press('ArrowRight');await page.waitForFunction(()=>!document.querySelector('#download-map-jpg').disabled&&JSON.parse(document.querySelector('#map-print-canvas').dataset.composition).x===22);
 const box=await page.locator('#map-print-canvas').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2+10,{steps:3});await page.mouse.up();await page.waitForFunction(()=>Number(document.querySelector('#map-compose-x').value)>22);await page.mouse.wheel(0,-120);await page.waitForFunction(()=>Number(document.querySelector('#map-compose-zoom').value)>1.75);await page.waitForFunction(()=>!document.querySelector('#download-map-jpg').disabled);
 await page.locator('[data-map-template=midnight]').click();await page.waitForFunction(()=>!document.querySelector('#download-map-jpg').disabled&&document.querySelector('#map-print-canvas').dataset.template==='midnight');
 const pending=page.waitForEvent('download');await page.locator('#download-map-jpg').click();const file=await pending;assert.deepEqual(jpegSize(await fs.readFile(await file.path())),[4800,6000]);
 const waiting=page.waitForEvent('download');await page.locator('#download-map-kml').click();const kml=await fs.readFile(await(await waiting).path(),'utf8');assert.match(kml,/<LineString>/);assert.ok(!kml.includes('Hidden place'));
 await page.locator('#map-compose-reset').click();await page.waitForFunction(()=>!document.querySelector('#download-map-jpg').disabled&&document.querySelector('#map-print-canvas').dataset.composition==='{"zoom":1,"x":0,"y":0}');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('notebook collapse, hide and pin persist; tabs and hidden playback remain usable',async()=>{
 const {context,page,errors}=await setup({fallback:true});try{
 await motion(page);await point(page,'Tab test pin');assert.equal(await page.locator('#places-panel').isVisible(),true);assert.equal(await page.locator('#routes-panel').isVisible(),false);
 await page.locator('#places-tab').press('ArrowLeft');assert.equal(await page.locator('#routes-tab').getAttribute('aria-selected'),'true');assert.equal(await page.locator('#routes-panel').isVisible(),true);
 assert.equal(await page.locator('#play-journey svg').count(),1);assert.equal(await page.locator('#fit-journey svg').count(),1);
 await page.locator('#sidebar-collapse').click();assert.equal(await page.locator('.sidebar-content').isVisible(),false);assert.ok((await page.locator('#studio-sidebar').boundingBox()).width<60);await page.locator('#sidebar-open').click();
 await page.locator('#sidebar-pin').click();await page.locator('#map-plus').click();assert.equal(await page.locator('.studio-layout').getAttribute('data-sidebar'),'collapsed');await page.locator('#sidebar-open').click();await page.locator('#sidebar-pin').click();await page.locator('#map-plus').click();assert.equal(await page.locator('.studio-layout').getAttribute('data-sidebar'),'open');
 await page.locator('#sidebar-hide').click();assert.equal(await page.locator('#studio-sidebar').isVisible(),false);await saved(page);await page.reload();await page.waitForFunction(()=>document.querySelector('.studio-layout').dataset.sidebar==='hidden');await page.locator('#sidebar-reveal').click();
 await page.locator('#play-journey').click();const progress=Number(await page.locator('#journey-player').getAttribute('data-progress'));await page.locator('#hide-player').click();assert.equal(await page.locator('#journey-player').isVisible(),false);await page.waitForFunction(p=>Number(document.querySelector('#journey-player').dataset.progress)>p+.005,progress);await page.locator('#show-player').click();assert.equal(await page.locator('#journey-player').getAttribute('data-state'),'playing');await page.locator('#player-toggle').click();
 const ui=await page.locator('#journey-player').evaluate(e=>({width:e.offsetWidth,bg:getComputedStyle(e).backgroundColor}));assert.ok(ui.width<=420);assert.match(ui.bg,/rgba\(/);
 await page.setViewportSize({width:390,height:844});await page.locator('#sidebar-collapse').click();assert.equal(await page.locator('#studio-sidebar').isVisible(),false);await page.locator('#sidebar-reveal').click();assert.equal(await page.locator('#studio-sidebar').isVisible(),true);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

async function recordMaps(page){await page.addInitScript(()=>{window.__maps=[];let library;Object.defineProperty(window,'maplibregl',{configurable:true,get:()=>library,set(value){library=value;const Original=value.Map;value.Map=class extends Original{constructor(options){super(options);window.__maps.push(this);}};}});});}

test('satellite, labeled imagery and topographic settings preserve routes, projection and credits',async()=>{
 const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await recordMaps(page);await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'base',type:'background',paint:{'background-color':'#e0e5df'}}]}}));
 const tile=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');let requests=0;
 for(const pattern of ['https://gibs.earthdata.nasa.gov/**','https://basemap.nationalmap.gov/**'])await page.route(pattern,r=>{requests++;return r.fulfill({contentType:'image/png',body:tile});});
 await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>window.__maps[0]?.getLayer('studio-lines'));await motion(page);await page.locator('#toggle-national-parks').click();await page.locator('#open-settings').click();
 for(const theme of ['satellite','hybrid','topo']){await page.locator('#map-theme').selectOption(theme);await page.waitForFunction(theme=>document.querySelector('#studio-map').dataset.theme===theme&&window.__maps[0].getSource('basemap')&&window.__maps[0].getSource('studio-data')?._data.features.length===13,theme);assert.match(await page.locator('.map-credit').textContent(),theme==='topo'?/USGS/:/NASA/);assert.equal(await page.locator('#map-theme-hint').isVisible(),true);assert.equal(await page.evaluate(()=>window.__maps[0].getSource('studio-parks')._data.features.length),64);if(theme==='hybrid')assert.ok(await page.evaluate(()=>window.__maps[0].getLayer('basemap-labels')));}
 await page.locator('[data-map-view=globe]').click();await page.locator('[data-close=settings-dialog]').last().click();await saved(page);await page.reload();await page.waitForFunction(()=>window.__maps[0]?.getSource('basemap')&&window.__maps[0].getProjection()?.type==='globe');assert.equal(await page.locator('#studio-map').getAttribute('data-theme'),'topo');assert.ok(requests>0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

for(const view of ['2d','3d','globe','canvas'])test(`live export reuses its renderer during drag and retains identical framing at full resolution (${view})`,async()=>{
 const fallback=view==='canvas';const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await recordMaps(page);if(fallback)await page.addInitScript(()=>Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined}));
 await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'base',type:'background',paint:{'background-color':'#e0e5df'}}]}}));await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>document.querySelector('#save-status').textContent!=='Opening your local notebook…');await routeMock(page);await segment(page);
 if(view==='3d'||view==='globe'){await page.locator('#open-settings').click();await page.locator('[data-map-view="'+view+'"]').click();await page.locator('[data-close=settings-dialog]').last().click();await page.waitForFunction(()=>!window.__maps[0].isMoving());}
 if(fallback)await page.evaluate(async()=>{const {RouteSketch}=await import('/js/route-sketch.mjs'),draw=RouteSketch.prototype.draw;RouteSketch.prototype.draw=function(){if(this.canvas.closest('[data-print-map]')){window.__printSketch=this;if(this.dpr===2)window.__exportFrame={scale:this.scale,origin:[...this.origin],center:[...this.center],size:[this.w,this.h]};}return draw.call(this);};});
 await page.locator('#open-map-export').click();await page.waitForFunction(()=>!document.querySelector('#download-map-jpg').disabled);await page.locator('#map-print-canvas').evaluate(c=>{window.__initial=c.toDataURL();window.__host=document.querySelector('[data-print-map]');window.__native=window.__maps.at(-1);});
 const frame=await page.locator('#map-print-canvas').evaluate(c=>{const r=c.getBoundingClientRect(),f=c._mapFrame;return {x:r.x+r.width*(f.x+f.w/2),y:r.y+r.height*(f.y+f.h/2)};});
 await page.mouse.move(frame.x,frame.y);await page.mouse.down();await page.mouse.move(frame.x+30,frame.y+15,{steps:8});await page.waitForFunction(()=>JSON.parse(document.querySelector('#map-print-canvas').dataset.composition).x>0&&document.querySelector('#map-print-canvas').toDataURL()!==window.__initial);await page.mouse.up();await page.mouse.wheel(0,-160);await page.waitForFunction(()=>JSON.parse(document.querySelector('#map-print-canvas').dataset.composition).zoom>1.2);
 assert.equal(await page.evaluate(()=>document.querySelector('[data-print-map]')===window.__host),true);if(!fallback)assert.equal(await page.evaluate(()=>window.__maps.length),2);
 const camera=await page.evaluate(fallback=>{if(fallback){const s=window.__printSketch;return {scale:s.scale,origin:[...s.origin],center:[...s.center],size:[s.w,s.h]};}const m=window.__native,snapshot=()=>({center:m.getCenter().toArray(),zoom:m.getZoom(),pitch:m.getPitch(),bearing:m.getBearing(),padding:m.getPadding(),landmark:[m.project([-83.4,35.75]).x,m.project([-83.4,35.75]).y]});const original=m.setPixelRatio;m.setPixelRatio=function(ratio){const result=original.call(this,ratio);if(ratio===2)window.__exportFrame=snapshot();return result;};return snapshot();},fallback);
 const waiting=page.waitForEvent('download');await page.locator('#download-map-png').click();const file=await waiting,bytes=await fs.readFile(await file.path());assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],[4800,6000]);assert.deepEqual(await page.evaluate(()=>window.__exportFrame),camera);assert.equal(await page.evaluate(()=>document.querySelector('[data-print-map]')===window.__host),true);assert.deepEqual(errors,[]);
 await page.locator('[data-close=map-export-dialog]').click();await page.waitForFunction(()=>!document.querySelector('[data-print-map]'));assert.equal(await page.locator('[data-print-map]').count(),0);
 }finally{await context.close();}
});

test('KML, KMZ and GeoJSON round trips retain geometry, dates, modes, metadata and visibility',async()=>{
 const {context,page,errors}=await setup();try{
 const result=await page.evaluate(async()=>{
  const {journeyFile,importJourneyFile,importGeoJSON}=await import('/js/journey-files.mjs');
  const trip={id:'formats',name:'All formats',color:'#a13b7d',items:[{id:'line',kind:'segment',name:'Night train',mode:'train',vehicle:'Sunset Limited',visible:false,coordinates:[[-110,35,1200],[-109,36,1300]],start:'2026-11-23T10:00:00Z',end:'2026-11-23T12:00:00Z',notes:'A & B',startNode:{name:'A',coordinates:[-110,35,1200],important:true},endNode:{name:'B',coordinates:[-109,36,1300],important:false},extra:{ticket:'ABC-123'}},{id:'pin',kind:'point',name:'Lookout',coordinates:[-109.2,35.7,1400],important:true,start:'2026-11-24',notes:'Sunrise'}]};
  const outputs=[];for(const format of ['kml','kmz','geojson']){const blob=await journeyFile([trip],format,trip.name),imported=await importJourneyFile(new File([blob],'sample.'+format));outputs.push({format,size:blob.size,items:imported.trip.items,warnings:imported.warnings});}
  const mixed=importGeoJSON(JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{name:'Two routes',custom:'kept'},geometry:{type:'MultiLineString',coordinates:[[[1,2],[3,4]],[[5,6],[7,8]]]}},{type:'Feature',properties:{name:'Two pins'},geometry:{type:'MultiPoint',coordinates:[[1,2,3],[4,5,6]]}}]}));
  const failures=[];for(const text of ['null','{"type":"FeatureCollection","features":[{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[999,90]}}]}','{"type":"FeatureCollection","features":{},"crs":{"name":"EPSG:3857"}}']){try{importGeoJSON(text);failures.push(false);}catch{failures.push(true);}}
  return {outputs,mixed:mixed.trip.items,failures};
 });
 for(const output of result.outputs){assert.equal(output.items.length,2);const [line,pin]=output.items;assert.equal(line.mode,'train');assert.equal(line.visible,false);assert.equal(line.extra.ticket,'ABC-123');assert.equal(line.startNode.important,true);assert.deepEqual(line.coordinates,[[-110,35,1200],[-109,36,1300]]);assert.equal(line.end,'2026-11-23T12:00:00Z');assert.equal(pin.important,true);assert.equal(pin.start,'2026-11-24');assert.deepEqual(output.warnings,[]);}
 assert.equal(result.mixed.length,4);assert.equal(result.mixed[0].extra.geojsonProperties.custom,'kept');assert.ok(result.failures.every(Boolean));assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('item visibility and multi-selection control highlights and subset exports independently',async()=>{
 const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await recordMaps(page);await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'base',type:'background',paint:{'background-color':'#e0e5df'}}]}}));await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>window.__maps[0]?.getLayer('studio-lines'));await motion(page);
 await page.locator('[data-item-select]').nth(0).check();await page.locator('[data-item-select]').nth(2).check();await page.waitForFunction(()=>window.__maps[0].getSource('studio-data')._data.features.filter(f=>f.geometry.type==='LineString'&&f.properties.selected).length===2);assert.equal(await page.locator('#route-itinerary li.is-selected').count(),2);
 await page.locator('[data-item-visible]').first().click();await page.waitForFunction(()=>window.__maps[0].getSource('studio-data')._data.features.filter(f=>f.geometry.type==='LineString').length===3);assert.equal(await page.locator('#selection-count').textContent(),'2 selected');
 await page.locator('#export-selected').click();assert.equal(await page.locator('#review-list li').count(),2);await page.locator('[name=export-format][value=geojson]').check();await page.locator('#confirm-journey').check();const wait=page.waitForEvent('download');await page.locator('#export-kml').click();const downloaded=await wait,geo=JSON.parse(await fs.readFile(await downloaded.path(),'utf8'));assert.equal(geo.features.length,2);assert.deepEqual(geo.features.map(f=>f.properties.name),['car segment','plane segment']);assert.equal(geo.features[0].properties.journeyStudio.visible,false);
 await saved(page);await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#route-itinerary li').length===4);assert.equal(await page.locator('[data-item-visible]').first().getAttribute('aria-pressed'),'false');await page.locator('.item-export').nth(1).click();assert.equal(await page.locator('#review-list li').count(),1);await page.locator('[name=export-format][value=kmz]').check();await page.locator('#confirm-journey').check();const zipWait=page.waitForEvent('download');await page.locator('#export-kml').click();const zip=await zipWait;const bytes=await fs.readFile(await zip.path());assert.equal(bytes.toString('ascii',0,2),'PK');await page.locator('#kml-file').setInputFiles({name:'one.kmz',mimeType:'application/vnd.google-earth.kmz',buffer:bytes});await page.waitForFunction(()=>document.querySelectorAll('#route-itinerary li').length===1);assert.match(await page.locator('#route-itinerary').textContent(),/train segment/);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

for(const fallback of [false,true])test(`starting point and destination can be picked on the map (${fallback?'canvas':'WebGL'})`,async()=>{
 const {context,page,errors}=await setup({fallback});try{
 await routeMock(page);await page.locator('#pick-start').click();const map=await page.locator(fallback?'#studio-fallback':'#studio-map').boundingBox();await page.mouse.click(map.x+map.width*.45,map.y+map.height*.4);assert.match(await page.locator('#start-query').inputValue(),/^-?[\d.]+, -?[\d.]+$/);assert.equal(await page.locator('#pick-start').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#segment-form').isVisible(),true);
 const start=await page.locator('#start-query').inputValue();await page.locator('#pick-end').click();await page.mouse.click(map.x+map.width*.65,map.y+map.height*.45);assert.match(await page.locator('#end-query').inputValue(),/^-?[\d.]+, -?[\d.]+$/);assert.equal(await page.locator('#start-query').inputValue(),start);await page.locator('#pick-start').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#pick-start').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#point-itinerary li').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

for(const fallback of [false,true])test(`finished and exited playback release route projection work (${fallback?'canvas':'WebGL'})`,async()=>{
 const {context,page,errors}=await setup({fallback});try{
 await page.evaluate(async()=>{const {JourneyPlayback}=await import('/js/journey-playback.mjs'),draw=JourneyPlayback.prototype.drawRoutes,sync=JourneyPlayback.prototype.sync;window.__routeDraws=0;JourneyPlayback.prototype.drawRoutes=function(){window.__routeDraws++;return draw.call(this);};JourneyPlayback.prototype.sync=function(...args){window.__playback=this;return sync.apply(this,args);};});await motion(page);await page.locator('#play-journey').click();await page.waitForFunction(()=>window.__routeDraws>0);await page.locator('#player-progress').fill('1000');await page.waitForFunction(()=>document.querySelector('#journey-player').dataset.state==='finished');
 const finished=await page.evaluate(()=>({draws:window.__routeDraws,routes:window.__playback.routes.length,trip:window.__playback.map.playbackTripId,raf:window.__playback.raf}));assert.equal(finished.routes,0);assert.equal(finished.trip,null);assert.equal(finished.raf,0);await page.locator('#map-plus').click();await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>window.__routeDraws),finished.draws);
 await page.locator('#player-restart').click();await page.waitForFunction(()=>window.__routeDraws>0);await page.locator('#player-exit').click();const stopped=await page.evaluate(()=>({draws:window.__routeDraws,state:window.__playback.state,trip:window.__playback.map.playbackTripId,frame:window.__playback.frame}));assert.equal(stopped.state,'idle');assert.equal(stopped.trip,null);assert.equal(stopped.frame,null);await page.locator('#map-minus').click();await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>window.__routeDraws),stopped.draws);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

for(const fallback of [false,true])test(`inset maps have independent framing, live drag and full-resolution output (${fallback?'canvas':'WebGL'})`,async()=>{
 const {context,page,errors}=await setup({fallback});try{
 await routeMock(page);await segment(page);await page.locator('#open-map-export').click();await page.waitForFunction(()=>!document.querySelector('#download-map-png').disabled);await page.locator('#add-inset').click();await page.waitForFunction(()=>!document.querySelector('#download-map-png').disabled&&JSON.parse(document.querySelector('#map-print-canvas').dataset.insets||'[]').length===1);
 const row=page.locator('.inset-card');await row.locator('select').first().selectOption('hawaii');await page.waitForFunction(()=>JSON.parse(document.querySelector('#map-print-canvas').dataset.insets)[0].lon===-157);await row.locator('[data-field=label]').fill('Hawaii detail');await row.locator('[data-field=zoom]').fill('5.5');await page.waitForFunction(()=>JSON.parse(document.querySelector('#map-print-canvas').dataset.insets)[0].zoom===5.5);
 const main=await page.locator('#map-print-canvas').getAttribute('data-composition'),count=await page.locator('[data-print-map]').count(),frame=await page.locator('#map-print-canvas').evaluate(c=>{const r=c.getBoundingClientRect(),f=c._insetFrames[0];return {x:r.x+r.width*(f.x+f.w*.5),y:r.y+r.height*(f.y+f.h*.6)};});await page.mouse.move(frame.x,frame.y);await page.mouse.down();await page.mouse.move(frame.x+15,frame.y+10,{steps:4});await page.mouse.up();await page.waitForFunction(()=>JSON.parse(document.querySelector('#map-print-canvas').dataset.insets)[0].lon!==-157);await page.mouse.wheel(0,-120);await page.waitForFunction(()=>JSON.parse(document.querySelector('#map-print-canvas').dataset.insets)[0].zoom>5.5);assert.equal(await page.locator('#map-print-canvas').getAttribute('data-composition'),main);assert.equal(await page.locator('[data-print-map]').count(),count);
 const before=await page.locator('#map-print-canvas').getAttribute('data-insets');const downloading=page.waitForEvent('download');await page.locator('#download-map-png').click();const file=await downloading,bytes=await fs.readFile(await file.path());assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],[4800,6000]);assert.equal(await page.locator('#map-print-canvas').getAttribute('data-insets'),before);
 await page.locator('#add-inset').click();await page.waitForFunction(()=>!document.querySelector('#download-map-png').disabled&&document.querySelector('#map-print-canvas')._insetFrames.length===2);await page.locator('.inset-card').first().getByRole('button',{name:'Remove inset'}).click();await page.waitForFunction(()=>!document.querySelector('#download-map-png').disabled&&document.querySelector('#map-print-canvas')._insetFrames.length===1);await page.locator('[data-close=map-export-dialog]').click();await page.waitForFunction(()=>!document.querySelector('[data-print-map]'));assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('KMZ resources are bundled, invalid archives are rejected, and partial exports omit whole-source backups',async()=>{
 const {context,page,errors}=await setup();try{
 const result=await page.evaluate(async()=>{const {importJourneyFile,journeyFile,subsetTrip}=await import('/js/journey-files.mjs');const trip={id:'zip',name:'Zip',items:[{id:'one',name:'One',kind:'point',coordinates:[-100,35],extra:{_sourceArchive:{filename:'private.zip',base64:'UEs='},sourceFolderPath:['Folder']}},{id:'two',name:'Two',kind:'point',coordinates:[-101,36]}]};const subset=subsetTrip(trip,[trip.items[0]]),blob=await journeyFile([subset],'kmz','One');const zip=await JSZip.loadAsync(await blob.arrayBuffer()),xml=await zip.file('doc.kml').async('string');const failures=[];
 for(const file of [new File(['broken'],'broken.kmz'),new File([await new JSZip().file('readme.txt','No routes').generateAsync({type:'uint8array'})],'empty.kmz')]){try{await importJourneyFile(file);failures.push(false);}catch{failures.push(true);}}
 const big=new Uint8Array(await blob.arrayBuffer()),view=new DataView(big.buffer);for(let i=0;i<big.length-28;i++)if(view.getUint32(i,true)===0x02014b50&&new TextDecoder().decode(big.subarray(i+46,i+46+view.getUint16(i+28,true)))==='doc.kml'){view.setUint32(i+24,60*1024*1024,true);break;}let oversize;try{await importJourneyFile(new File([big],'large.kmz'));oversize=false;}catch(e){oversize=/50 MB/.test(e.message);}
 const imported=await importJourneyFile(new File([blob],'one.kmz'));return {resources:Object.keys(zip.files),xml,failures,oversize,sourceKept:!!trip.items[0].extra._sourceArchive,subsetExtra:subset.items[0].extra,importCount:imported.trip.items.length};});
 assert.ok(result.resources.includes('images/place.png'));assert.ok(result.resources.includes('images/important.png'));assert.ok(!result.xml.includes('https://maps.google.com'));assert.ok(!result.xml.includes('private.zip'));assert.ok(!result.xml.includes('<name>Two</name>'));assert.ok(result.failures.every(Boolean));assert.equal(result.oversize,true);assert.equal(result.sourceKept,true);assert.deepEqual(result.subsetExtra,{sourceFolderPath:['Folder']});assert.equal(result.importCount,1);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('checked playback orders journeys and their visible routes by dates without rewriting data',async()=>{
 const {context,page}=await setup();try{const result=await page.evaluate(async()=>{
  const {checkedPlaybackPlan}=await import('/js/journey-playback.mjs');const route=(id,start,extra={})=>({id,name:id,kind:'segment',mode:'car',coordinates:[[-100,35],[-99,36]],start,...extra});
  const trips=[{id:'late',name:'2020 label',items:[route('March','2026-03-01'),route('January','2026-01-01'),route('hidden','2010-01-01',{visible:false})]},{id:'missing-a',name:'Undated A',items:[route('No date A','')]},{id:'hawaii',name:'Hawaii',items:[route('Island drive','',{extra:{sourceFolderPath:['04/2024 RoadTrip Hawaii AAG']}})]},{id:'hidden',visible:false,name:'Hidden',items:[route('Earlier','2000-01-01')]},{id:'denver',name:'2023AAG Denver',items:[route('Mountains','')]},{id:'missing-b',name:'Undated B',items:[route('No date B','')]},{id:'points',name:'Points only',items:[{kind:'point',coordinates:[0,0]}]}];const before=JSON.stringify(trips),plan=checkedPlaybackPlan(trips);return {ids:plan.journeys.map(j=>j.id),segments:plan.segments.map(s=>s.name),offsets:plan.segments.map(s=>s.offset),total:plan.total,unchanged:JSON.stringify(trips)===before};});
 assert.deepEqual(result.ids,['denver','hawaii','late','missing-a','missing-b']);assert.deepEqual(result.segments,['Mountains','Island drive','January','March','No date A','No date B']);assert.ok(result.offsets.every((n,i)=>i===0?n===0:n>result.offsets[i-1]));assert.ok(result.total>result.offsets.at(-1));assert.ok(result.unchanged);
 }finally{await context.close();}
});

const queueFixture=()=>({version:1,activeTrip:'late',trips:[{id:'late',name:'Summer journey',visible:true,color:'#be426b',items:[{id:'same-id',kind:'segment',name:'Flight',mode:'plane',start:'2025-07-02',coordinates:[[-118,34],[-110,40],[-100,42]]}]},{id:'early',name:'Spring journey',visible:true,color:'#2c8068',items:[{id:'second',kind:'segment',name:'Second road',mode:'car',start:'2022-04-03',coordinates:[[-110,38],[-108,39]]},{id:'same-id',kind:'segment',name:'First road',mode:'car',start:'2022-04-02',coordinates:[[-112,36],[-110,38]]}]},{id:'hidden',name:'Hidden journey',visible:false,items:[{id:'hidden-leg',kind:'segment',mode:'car',name:'Hidden',start:'2020-01-01',coordinates:[[-90,32],[-89,33]]}]},{id:'undated',name:'Walk someday',visible:true,color:'#8b6dbc',items:[{id:'walk',kind:'segment',mode:'walk',name:'Walking',coordinates:[[-100,40],[-99.9,40.1]]}]}],visited:[],updatedAt:1});
for(const view of ['2d','globe','canvas'])test(`checked journey playback crosses journeys continuously with stable zoom and releases completed overlays (${view})`,async()=>{
 const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await recordMaps(page);await page.addInitScript(({data,fallback})=>{localStorage.setItem('wanderlust-studio-v1',JSON.stringify(data));if(fallback)Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined});},{data:queueFixture(),fallback:view==='canvas'});await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'base',type:'background',paint:{'background-color':'#e0e5df'}}]}}));await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>document.querySelectorAll('.journey-row').length===4);
 await page.evaluate(async()=>{const {JourneyPlayback}=await import('/js/journey-playback.mjs'),sync=JourneyPlayback.prototype.sync;JourneyPlayback.prototype.sync=function(...args){window.__queue=this;return sync.apply(this,args);};});
 if(view==='globe'){await page.locator('#open-settings').click();await page.locator('[data-map-view=globe]').click();await page.locator('[data-close=settings-dialog]').last().click();}
 if(view!=='canvas'){await page.waitForFunction(()=>window.__maps[0]?.getLayer('studio-lines')&&!window.__maps[0].isMoving());await page.evaluate(v=>window.__maps[0].jumpTo({zoom:v==='globe'?1.5:5.25}),view);}else await page.waitForFunction(()=>!document.querySelector('#studio-fallback').hidden);
 await page.evaluate(()=>{window.__playbackScale=()=>{const m=__queue.map.map;if(!m)return __queue.map.sketch.scale;return m.getZoom()-(m.getProjection()?.type==='globe'?Math.log2(Math.cos(m.getCenter().lat*Math.PI/180)):0);};});
 // Globe compensates its numeric zoom for latitude to keep the planet's on-screen size steady.
 await page.locator('#play-checked-journeys').click();await page.waitForFunction(()=>window.__queue?.frame?.segment.tripId==='early');const zoom=await page.evaluate(()=>__playbackScale());assert.equal(await page.locator('#trip-name').inputValue(),'Summer journey');assert.match(await page.locator('#player-queue').textContent(),/Journey 1 of 3.*Spring journey/);
 const middle=await page.evaluate(()=>{const q=__queue,target=q.plan.journeys[1];q.seek((target.offset-.01)/q.plan.total);cancelAnimationFrame(q.raf);q.lastTime=performance.now()-100;q.tick(performance.now());q.pause();return {trip:q.frame.segment.tripId,remaining:q.map.playbackTripIds,color:q.color,overlay:q.routes.map(r=>r.tripId),queue:q.plan.journeys.map(j=>j.id),zoom:__playbackScale()};});assert.equal(middle.trip,'late');assert.deepEqual(middle.remaining,['late','undated']);assert.equal(middle.color,'#be426b');assert.ok(middle.overlay.every(id=>id==='late'));assert.deepEqual(middle.queue,['early','late','undated']);assert.ok(Math.abs(middle.zoom-zoom)<1e-8,`camera scale changed: ${middle.zoom} vs ${zoom}`);assert.match(await page.locator('#player-queue').textContent(),/Journey 2 of 3.*Summer journey/);
 await page.locator('#player-progress').fill('1000');assert.equal(await page.locator('#journey-player').getAttribute('data-state'),'finished');assert.deepEqual(await page.evaluate(()=>__queue.map.playbackTripIds),[]);assert.equal(await page.evaluate(()=>__queue.routes.length),0);assert.ok(Math.abs(await page.evaluate(()=>__playbackScale())-zoom)<1e-8);
 await page.locator('#player-restart').click();await page.waitForFunction(()=>__queue.frame?.segment.tripId==='early');await page.locator('#player-exit').click();assert.deepEqual(await page.evaluate(()=>__queue.map.playbackTripIds),[]);await page.locator('#play-journey').click();assert.equal(await page.locator('#journey-player').getAttribute('data-scope'),'current');assert.equal(await page.evaluate(()=>__queue.plan.segments.length),1);await page.locator('#journeys-hide-all').click();assert.equal(await page.locator('#play-checked-journeys').isDisabled(),true);assert.equal(await page.locator('#journey-player').isVisible(),false);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('itinerary height stays bounded while list contents scroll and selection controls remain visible',async()=>{
 const {context,page,errors}=await setup({fallback:true});try{
 const marks=Array.from({length:45},(_,i)=>'<Placemark><name>Stop '+i+'</name><Point><coordinates>'+(-100+i*.01)+',35</coordinates></Point></Placemark>').join('');await page.locator('#kml-file').setInputFiles({name:'scroll.kml',mimeType:'application/xml',buffer:Buffer.from('<kml><Document>'+marks+'</Document></kml>')});await page.waitForFunction(()=>document.querySelectorAll('#point-itinerary li').length===45);await page.locator('#places-tab').click();await page.locator('#itinerary-title').scrollIntoViewIfNeeded();
 for(const mobile of [false,true]){if(mobile)await page.setViewportSize({width:390,height:844});await page.locator('#itinerary-title').scrollIntoViewIfNeeded();const before=await page.locator('#itinerary-title').boundingBox();const size=await page.locator('#itinerary').evaluate(e=>({height:e.clientHeight,total:e.scrollHeight,section:e.closest('.itinerary-section').offsetHeight}));assert.ok(size.section<=600&&size.height>100&&size.total>size.height);await page.locator('#itinerary').evaluate(e=>e.scrollTop=e.scrollHeight);const after=await page.locator('#itinerary-title').boundingBox();assert.equal(after.y,before.y);await page.locator('#point-itinerary li').last().locator('[data-item-select]').check();assert.equal(await page.locator('#selection-count').textContent(),'1 selected');assert.ok(await page.locator('#itinerary').evaluate(e=>e.scrollTop>0));await page.locator('#clear-itinerary').click();}
 assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('parks control is icon-only, park popup has a white background, and player opacity is reduced',async()=>{
 const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await recordMaps(page);await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'base',type:'background',paint:{'background-color':'#e0e5df'}}]}}));await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>window.__maps[0]?.getLayer('studio-parks'));assert.equal((await page.locator('#toggle-national-parks').textContent()).trim(),'');assert.equal(await page.locator('#toggle-national-parks svg').count(),1);assert.equal(await page.locator('#toggle-national-parks').getAttribute('aria-label'),'National parks');await page.locator('#toggle-national-parks').click();await page.waitForFunction(()=>window.__maps[0].getSource('studio-parks')._data.features.length===64);
 await page.evaluate(()=>window.__maps[0].jumpTo({center:[-83.5,35.6],zoom:6}));await page.waitForTimeout(250);const xy=await page.evaluate(()=>{const m=__maps[0],park=m.getSource('studio-parks')._data.features.find(p=>p.properties.id==='grsm'),p=m.project(park.geometry.coordinates),r=m.getCanvas().getBoundingClientRect();return [p.x+r.x,p.y+r.y];});await page.mouse.click(...xy);await page.waitForSelector('.park-popup');assert.equal(await page.locator('.studio-park-popup .maplibregl-popup-content').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');await motion(page);const alpha=await page.locator('#journey-player').evaluate(e=>Number(getComputedStyle(e).backgroundColor.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)/)[1]));assert.ok(alpha<=.45&&alpha>.25);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

async function worldBucket(page){await page.locator('#open-bucket').click();await page.locator('#bucket-countries').click();await page.waitForFunction(()=>document.querySelectorAll('#park-checklist input').length===249&&document.querySelector('#park-poster').dataset.mode==='countries'&&!document.querySelector('#export-poster').disabled);}

test('world Bucket List keeps country selections independent, searchable in both languages and persistent',async()=>{
 const {context,page,errors}=await setup({fallback:true});try{
 await page.locator('#open-bucket').click();await page.waitForFunction(()=>!document.querySelector('#export-poster').disabled);await page.locator('#park-checklist input[value=grsm]').check();await page.locator('#bucket-states').click();await page.locator('#park-checklist input[value="47"]').check();await page.locator('#bucket-countries').click();await page.waitForFunction(()=>document.querySelectorAll('#park-checklist input').length===249);assert.equal(await page.locator('#park-checklist input:checked').count(),0);
 for(const id of ['CN','US','VA','TV'])await page.locator('#park-checklist input[value='+id+']').check();await page.locator('#poster-title').fill('Our world memories');await page.locator('#park-filter').fill('图瓦卢');assert.equal(await page.locator('#park-checklist input').count(),1);assert.equal(await page.locator('#park-checklist input').inputValue(),'TV');await page.locator('#park-filter').fill('United States');assert.equal(await page.locator('#park-checklist input[value=US]').isChecked(),true);await page.locator('#park-filter').fill('');await saved(page);
 const data=await page.evaluate(async()=>JSON.parse(await(await(await(await(await navigator.storage.getDirectory()).getDirectoryHandle('.wanderlust')).getFileHandle('workspace.json')).getFile()).text()));assert.deepEqual(data.visitedCountries.sort(),['CN','TV','US','VA']);assert.deepEqual(data.visitedStates,['47']);assert.deepEqual(data.visited,['grsm']);assert.equal(data.countriesPosterTitle,'Our world memories');
 await page.locator('#bucket-mixed').click();assert.equal(await page.locator('#park-checklist input').count(),114);assert.equal(await page.locator('#park-checklist input[data-collection=countries]').count(),0);await page.locator('#bucket-countries').click();await saved(page);await page.reload();await page.waitForFunction(()=>document.querySelector('#save-status').textContent!=='Opening your local notebook…');await page.locator('#open-settings').click();await page.locator('[data-language=zh]').click();await page.locator('[data-close=settings-dialog]').last().click();await page.setViewportSize({width:320,height:800});await page.locator('#open-bucket').click();await page.waitForFunction(()=>document.querySelectorAll('#park-checklist input').length===249&&!document.querySelector('#export-poster').disabled);assert.equal(await page.locator('#bucket-countries').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#park-checklist input:checked').count(),4);assert.equal(await page.locator('#poster-title').inputValue(),'Our world memories');assert.match(await page.locator('#park-checklist label').filter({has:page.locator('input[value=CN]')}).textContent(),/中国/);assert.match(await page.locator('#park-count').textContent(),/4 \/ 249/);assert.equal(await page.locator('#bucket-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
 page.once('dialog',d=>d.dismiss());await page.locator('#parks-clear').click();assert.equal(await page.locator('#park-checklist input:checked').count(),4);page.once('dialog',d=>d.accept());await page.locator('#parks-clear').click();assert.equal(await page.locator('#park-checklist input:checked').count(),0);await page.locator('#parks-all').click();assert.equal(await page.locator('#park-checklist input:checked').count(),249);await page.locator('#bucket-states').click();assert.equal(await page.locator('#park-checklist input[value="47"]').isChecked(),true);await page.locator('#bucket-parks').click();assert.equal(await page.locator('#park-checklist input[value=grsm]').isChecked(),true);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('world posters include every country in all templates and both orientations with colored map geometry',async()=>{
 const {context,page}=await setup({fallback:true});try{
 const results=await page.evaluate(async()=>{
 const {renderPoster}=await import('/js/journey-poster.mjs'),{countryAssets,countryChecklist,worldProjector}=await import('/js/journey-countries.mjs'),[data,geo]=await countryAssets();const results=[];
 const coords=geo.features.filter(f=>f.properties.selectable!==false);if(data.countries.length!==249||new Set(data.countries.map(c=>c.id)).size!==249||!data.countries.every(c=>coords.some(f=>f.id===c.id)&&c.nameZh&&c.coordinates.every(Number.isFinite)))throw Error('Incomplete world data');
 for(const orientation of ['portrait','landscape'])for(const template of ['fieldnotes','midnight','postcard','atlas']){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),fill=ctx.fillText.bind(ctx),names=new Set(countryChecklist(data).map(c=>c.displayName)),draws=[];ctx.fillText=function(value,x,y,...args){if(names.has(value))draws.push({name:value,x,y,width:this.measureText(value).width,color:this.fillStyle,font:this.font});return fill(value,x,y,...args);};
 await renderPoster(canvas,['CN','US','VA','TV'],'World print',{mode:'countries',template,orientation});const box=orientation==='portrait'?{x:155,y:515,w:2090,h:1015}:{x:155,y:505,w:2690,h:850},pixel=worldProjector(box)([103,36]).map(Math.round),china=[...ctx.getImageData(...pixel,1,1).data].slice(0,3);
 const complete=draws.length===249&&new Set(draws.map(d=>d.name)).size===249,within=draws.every(d=>d.x+d.width<canvas.width-145&&d.y<canvas.height-140),colored=draws.find(d=>d.name==='China').color!==draws.find(d=>d.name==='India').color;results.push({template,orientation,complete,within,colored,china,label:canvas.getAttribute('aria-label')});canvas.width=canvas.height=1;
 }
 return results;});assert.equal(results.length,8);const colors={fieldnotes:[70,133,86],midnight:[67,136,111],postcard:[77,137,90],atlas:[228,146,100]};for(const r of results){assert.ok(r.complete&&r.within&&r.colored,JSON.stringify(r));assert.deepEqual(r.china,colors[r.template]);assert.match(r.label,/4 of 249/);}
 }finally{await context.close();}
});

for(const orientation of ['portrait','landscape'])test(`world poster JPEG exports at full resolution and retains the selected collection (${orientation})`,async()=>{
 const {context,page,errors}=await setup({fallback:true});try{
 await worldBucket(page);await page.locator('#park-checklist input[value=US]').check();await page.locator('#park-checklist input[value=SG]').check();await page.locator('button[data-orientation='+orientation+']').click();await page.locator('button[data-template=midnight]').click();await page.waitForFunction(()=>!document.querySelector('#export-poster').disabled);const spec=await page.locator('#park-poster').evaluate(c=>c._posterRender);const downloading=page.waitForEvent('download');await page.locator('#export-poster').click();const download=await downloading,bytes=await fs.readFile(await download.path());assert.deepEqual(jpegSize(bytes),orientation==='portrait'?[4800,6000]:[6000,4800]);assert.equal(spec.options.mode,'countries');assert.equal(spec.options.orientation,orientation);assert.deepEqual(spec.visited.sort(),['SG','US']);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('world asset failures can be retried without affecting US collections or stale previews',async()=>{
 const {context,page,errors}=await setup({fallback:true});try{
 await page.route('**/data/world-countries*',r=>r.abort());await page.locator('#open-bucket').click();await page.waitForFunction(()=>!document.querySelector('#export-poster').disabled);await page.locator('#bucket-countries').click();await page.waitForFunction(()=>document.querySelector('#poster-status').textContent.includes('world map could not'));assert.equal(await page.locator('#export-poster').isDisabled(),true);await page.locator('#bucket-states').click();await page.waitForFunction(()=>!document.querySelector('#export-poster').disabled);assert.equal(await page.locator('#park-checklist input').count(),50);await page.unroute('**/data/world-countries*');await page.locator('#bucket-countries').click();await page.locator('#bucket-parks').click();await page.waitForFunction(()=>document.querySelector('#park-poster').dataset.mode==='parks'&&!document.querySelector('#export-poster').disabled);assert.equal(await page.locator('#park-checklist input').count(),64);await page.locator('#bucket-countries').click();await page.waitForFunction(()=>document.querySelectorAll('#park-checklist input').length===249&&document.querySelector('#park-poster').dataset.mode==='countries'&&!document.querySelector('#export-poster').disabled);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('Minimal is the fresh and legacy default map theme and saved theme choices still restore',async()=>{
 const context=await browser.newContext(),page=await context.newPage();try{
 await recordMaps(page);await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,name:r.request().url(),sources:{},layers:[{id:'minimal-test',type:'background',paint:{'background-color':'#eee'}}]}}));await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>window.__maps[0]?.getLayer('minimal-test'));assert.equal(await page.locator('#map-theme').inputValue(),'positron');assert.ok(await page.evaluate(()=>__maps[0].getStyle().name.endsWith('/positron')));
 const defaults=await page.evaluate(async()=>{const {normalizeWorkspace}=await import('/js/journey-storage.mjs');return [undefined,'obsolete','liberty','dark','satellite'].map(mapTheme=>normalizeWorkspace({version:1,trips:[],mapTheme}).mapTheme);});assert.deepEqual(defaults,['positron','positron','liberty','dark','satellite']);await page.locator('#open-settings').click();await page.locator('#map-theme').selectOption('dark');await saved(page);await page.reload();await page.waitForFunction(()=>window.__maps[0]?.getLayer('minimal-test'));assert.equal(await page.locator('#map-theme').inputValue(),'dark');assert.ok(await page.evaluate(()=>__maps[0].getStyle().name.endsWith('/dark')));
 }finally{await context.close();}
});

test('country visits merge with connected local-folder notebooks and retain the newer world title',async()=>{
 const {context,page}=await setup({fallback:true});try{
 const merged=await page.evaluate(async()=>{const {JourneyStore,normalizeWorkspace}=await import('/js/journey-storage.mjs'),root=await navigator.storage.getDirectory(),parent=await root.getDirectoryHandle('country-sync-test',{create:true}),folder=await parent.getDirectoryHandle('.wanderlust',{create:true}),current=normalizeWorkspace({version:1,trips:[],visited:['grsm'],visitedStates:['47'],visitedCountries:['CN'],updatedAt:100}),disk=normalizeWorkspace({version:1,trips:[],visitedCountries:['US','CN'],bucketMode:'countries',countriesPosterTitle:'Shared world',updatedAt:200});const file=await folder.getFileHandle('workspace.json',{create:true}),writer=await file.createWritable();await writer.write(JSON.stringify(disk));await writer.close();window.showDirectoryPicker=async()=>parent;const store=new JourneyStore(()=>{}),merged=await store.connect(current);await store.flush();return {merged,disk:JSON.parse(await(await file.getFile()).text())};});for(const item of [merged.merged,merged.disk]){assert.deepEqual(item.visitedCountries.sort(),['CN','US']);assert.deepEqual(item.visited,['grsm']);assert.deepEqual(item.visitedStates,['47']);assert.equal(item.countriesPosterTitle,'Shared world');assert.equal(item.bucketMode,'countries');}
 }finally{await context.close();}
});

for(const view of ['2d','globe','canvas'])test(`current location is requested on click, survives style changes and stays out of saved routes (${view})`,async()=>{
 const context=await browser.newContext({viewport:{width:1360,height:1000},geolocation:{longitude:-83.98765,latitude:35.91234,accuracy:45},permissions:['geolocation']}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await recordMaps(page);await page.addInitScript(fallback=>{if(fallback)Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined});window.__locationRequests=0;const locate=navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);navigator.geolocation.getCurrentPosition=(...args)=>{window.__locationRequests++;return locate(...args);};navigator.geolocation.watchPosition=()=>{throw Error('Location tracking should not start');};},view==='canvas');await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'location-test',type:'background',paint:{'background-color':'#edf1ed'}}]}}));await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>document.querySelector('#save-status').textContent!=='Opening your local notebook…');await motion(page);assert.equal(await page.evaluate(()=>__locationRequests),0);
 await page.evaluate(async()=>{const {JourneyMap}=await import('/js/journey-map.mjs'),set=JourneyMap.prototype.setLocation;JourneyMap.prototype.setLocation=function(...args){window.__locationMap=this;return set.apply(this,args);};});if(view==='globe'){await page.locator('#open-settings').click();await page.locator('[data-map-view=globe]').click();await page.locator('[data-close=settings-dialog]').last().click();}
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')).trips);await page.locator('#play-journey').click();await page.locator('#map-locate').click();await page.waitForFunction(()=>document.querySelector('#location-status').textContent.startsWith('Current location'));await page.waitForFunction(()=>!window.__locationMap.map?.isMoving());const found=await page.evaluate(()=>({value:__locationMap.userLocation,geometry:__locationMap.map?.getSource('studio-location')._data,sketch:__locationMap.sketch?.userLocation}));assert.deepEqual(found.value.coordinates,[-83.98765,35.91234]);assert.equal(found.value.accuracy,45);assert.match(await page.locator('#location-status').textContent(),/ft/);assert.equal(await page.locator('#journey-player').getAttribute('data-state'),'paused');assert.equal(await page.locator('#player-follow').isChecked(),false);
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')).trips),before);
 if(view!=='canvas'){assert.equal(found.geometry.features.length,2);assert.deepEqual(found.geometry.features[1].geometry.coordinates,found.value.coordinates);}else assert.deepEqual(found.sketch.coordinates,found.value.coordinates);
 await page.locator('#open-settings').click();await page.locator('#map-theme').selectOption('dark');await page.locator('[data-units=metric]').click();await page.locator('[data-close=settings-dialog]').last().click();await page.waitForFunction(()=>!__locationMap.map||__locationMap.map.getSource('studio-location')?._data.features.length===2);assert.match(await page.locator('#location-status').textContent(),/45 m/);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')).trips.map(({updatedAt,...trip})=>trip)),before.map(({updatedAt,...trip})=>trip));assert.equal(await page.evaluate(()=>localStorage.getItem('wanderlust-studio-v1').includes('83.98765')),false);
 await page.locator('#open-map-export').click();await page.waitForFunction(()=>!document.querySelector('#download-map-png').disabled);if(view!=='canvas')assert.equal(await page.evaluate(()=>Object.keys(__maps.at(-1).getStyle().sources).some(k=>k==='studio-location')),false);await page.locator('[data-close=map-export-dialog]').click();await page.locator('#map-locate').click();await page.waitForFunction(()=>__locationRequests===2&&!document.querySelector('#map-locate').disabled);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('location denial, unavailable and timeout errors are localized and allow another request',async()=>{
 const {context,page,errors}=await setup({fallback:true});try{
 await page.evaluate(()=>{window.__locationErrors=[1,2,3];navigator.geolocation.getCurrentPosition=(ok,fail)=>setTimeout(()=>{const code=__locationErrors.shift();if(code)fail({code});else ok({coords:{longitude:0,latitude:0,accuracy:20},timestamp:Date.now()});},100);});for(const phrase of ['permission was denied','location is unavailable','timed out']){await page.locator('#map-locate').click();await page.waitForFunction(phrase=>document.querySelector('#location-status').textContent.includes(phrase),phrase);assert.equal(await page.locator('#map-locate').isDisabled(),false);}
 await page.locator('#open-settings').click();await page.locator('[data-language=zh]').click();await page.locator('[data-close=settings-dialog]').last().click();assert.match(await page.locator('#location-status').textContent(),/超时/);await page.locator('#map-locate').click();await page.waitForFunction(()=>document.querySelector('#location-status').textContent.startsWith('当前位置'));assert.equal(await page.locator('#map-locate').getAttribute('aria-label'),'显示当前位置');assert.equal(await page.locator('#map-locate').getAttribute('aria-busy'),'false');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('unsupported and insecure location environments show a useful message without requesting location',async()=>{
 for(const insecure of [false,true]){const {context,page}=await setup({fallback:true});try{await page.evaluate(insecure=>{if(insecure)Object.defineProperty(window,'isSecureContext',{value:false});else Object.defineProperty(navigator,'geolocation',{value:undefined});},insecure);await page.locator('#map-locate').click();assert.match(await page.locator('#location-status').textContent(),insecure?/HTTPS or localhost/:/does not support/);assert.equal(await page.locator('#map-locate').isDisabled(),false);}finally{await context.close();}}
});

for(const view of ['2d','globe','canvas'])test(`route list exports beside the map with correct scope and identical preview framing (${view})`,async()=>{
 const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));try{
 await recordMaps(page);const fixture=queueFixture();fixture.trips[1].items.push({id:'hidden-segment',name:'Hidden segment',kind:'segment',visible:false,mode:'car',coordinates:[[-75,35],[-74,36]]});await page.addInitScript(({data,fallback})=>{localStorage.setItem('wanderlust-studio-v1',JSON.stringify(data));if(fallback)Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined});},{data:fixture,fallback:view==='canvas'});await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'route-list-test',type:'background',paint:{'background-color':'#dce7de'}}]}}));await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>document.querySelectorAll('.journey-row').length===4);if(view==='globe'){await page.locator('#open-settings').click();await page.locator('[data-map-view=globe]').click();await page.locator('[data-close=settings-dialog]').last().click();}
 await page.locator('#open-map-export').click();await page.locator('#map-print-route-list').selectOption('right');await page.waitForFunction(()=>!document.querySelector('#download-map-png').disabled&&JSON.parse(document.querySelector('#map-print-canvas').dataset.routeList||'null')?.side==='right');let list=JSON.parse(await page.locator('#map-print-canvas').getAttribute('data-route-list'));assert.equal(list.segments,4);assert.ok(!list.items.some(i=>i.id==='hidden-segment'||i.tripId==='hidden'));const right=await page.locator('#map-print-canvas').evaluate(c=>c._mapFrame);assert.ok(right.x+right.w<.7);
 const initial=await page.locator('#map-print-canvas').getAttribute('data-composition'),poster=await page.locator('#map-print-canvas').boundingBox();await page.mouse.move(poster.x+poster.width*.9,poster.y+poster.height*.5);await page.mouse.down();await page.mouse.move(poster.x+poster.width*.92,poster.y+poster.height*.55,{steps:3});await page.mouse.up();assert.equal(await page.locator('#map-print-canvas').getAttribute('data-composition'),initial);
 await page.locator('#map-print-route-list').selectOption('left');await page.locator('[data-map-orientation=landscape]').click();await page.waitForFunction(()=>!document.querySelector('#download-map-png').disabled&&JSON.parse(document.querySelector('#map-print-canvas').dataset.routeList||'null')?.side==='left');await page.locator('#map-compose-zoom').fill('1.4');await page.locator('#map-compose-x').fill('8');await page.waitForFunction(()=>JSON.parse(document.querySelector('#map-print-canvas').dataset.composition).x===8);const before=await page.locator('#map-print-canvas').evaluate(c=>({frame:c._mapFrame,list:c.dataset.routeList,composition:c.dataset.composition}));assert.ok(before.frame.x>.3);
 await page.evaluate(()=>{const blob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(...args){if(this.width>=4800&&this.dataset.routeList)window.__printed={frame:this._mapFrame,list:this.dataset.routeList,composition:this.dataset.composition};return blob.apply(this,args);};});const downloading=page.waitForEvent('download');await page.locator('#download-map-png').click();const download=await downloading,bytes=await fs.readFile(await download.path());assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],[6000,4800]);assert.deepEqual(await page.evaluate(()=>__printed),before);
 await page.locator('#map-print-scope').selectOption('all');await page.waitForFunction(()=>!document.querySelector('#download-map-png').disabled&&JSON.parse(document.querySelector('#map-print-canvas').dataset.routeList||'null')?.segments===6);await page.locator('#map-print-format').selectOption('map');await page.locator('#map-print-route-list').selectOption('right');await page.waitForFunction(()=>!document.querySelector('#download-map-png').disabled&&document.querySelector('#map-print-canvas').dataset.format==='map');assert.equal(JSON.parse(await page.locator('#map-print-canvas').getAttribute('data-route-list')).segments,6);await page.locator('#map-print-route-list').selectOption('none');await page.waitForFunction(()=>!document.querySelector('#download-map-png').disabled&&document.querySelector('#map-print-canvas').dataset.routeList==='null');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('route list wraps complete names, respects units and dates, fits multiple columns and rejects overflow',async()=>{
 const {context,page}=await setup({fallback:true});try{
 const result=await page.evaluate(async()=>{const {routeListPlan}=await import('/js/journey-route-list.mjs');const items=Array.from({length:36},(_,i)=>({id:String(i),name:'Route '+i+' · 沿途的路线',kind:'segment',mode:'car',vehicle:'Outback',start:'2025-01-01',coordinates:[[-100,35],[-99,36]]})),trip={id:'trip',name:'A very long journey name — 跨越山川和海岸的旅行',items},panel={w:840,h:1820},plan=routeListPlan([trip],{units:'metric',language:'zh',routeList:'right'},panel);let rejected=false;try{routeListPlan([{...trip,items:Array.from({length:2000},(_,i)=>({...items[0],id:String(i)}))}],{},panel);}catch(e){rejected=/Too many routes/.test(e.message);}const empty=routeListPlan([{id:'empty',name:'Places only',items:[{kind:'point'}]}],{},panel);return {count:plan.rows.filter(r=>r.kind==='segment').length,columns:plan.columns,within:plan.rows.every(r=>r.y+r.height<=panel.h-26),meta:plan.rows.find(r=>r.kind==='segment').meta.join(' '),date:plan.rows.find(r=>r.kind==='segment').date.join(' '),rejected,empty:empty.total};});assert.equal(result.count,36);assert.equal(result.columns,2);assert.ok(result.within);assert.match(result.meta,/汽车.*Outback.*km/);assert.match(result.date,/2025-01-01/);assert.ok(result.rejected);assert.equal(result.empty,0);
 }finally{await context.close();}
});
