const {dismissFolderPrompt}=require('./helpers/folder-prompt.cjs');
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});});
after(async()=>browser?.close());
const base=process.env.STUDIO_URL||'http://127.0.0.1:8770';
const existing={id:'existing',name:'Existing journey',visible:true,color:'#445566',videoTitle:'Keep my title',items:[{id:'old',kind:'point',name:'Keep my place',coordinates:[-98,36]}]};
async function setup({language='en',mobile=false}={}){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(data=>{if(!localStorage.getItem('wanderlust-studio-v1'))localStorage.setItem('wanderlust-studio-v1',JSON.stringify(data));Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined});},{version:1,activeTrip:'existing',language,palette:'single',singleColor:'#445566',trips:[existing],visited:[],updatedAt:1});
 await page.goto(base+'/journey-studio.html');await dismissFolderPrompt(page);await page.waitForFunction(()=>document.querySelector('#save-status').textContent!=='Opening your local notebook…'&&!document.querySelector('#studio-fallback').hidden);
 return {context,page,errors};
}
async function files(page){
 return (await page.evaluate(async()=>{
  const {journeyFile}=await import('/js/journey-files.mjs');
  return Promise.all(['kml','kmz','geojson'].map(async(format,i)=>{
   const trip={id:'source-'+i,name:['Coastal road','Mountain railway','A walk in the park'][i],color:['#aa33cc','#19a8bf','#da782c'][i],videoTitle:['海岸 <故事> & Friends','Railway "memories"','公园漫步'][i],items:[{id:'shared-route',kind:'segment',mode:['car','train','walk'][i],name:'Route '+i,coordinates:[[-120+i,35],[-119.8+i,35.2]],start:'2026-03'},{id:'shared-pin',kind:'point',name:'Independent stop',coordinates:[-120+i,35],important:true,visible:false}]};
   const blob=await journeyFile([trip],format);return {name:'Trip.'+format,mimeType:blob.type,bytes:[...new Uint8Array(await blob.arrayBuffer())],trip};
  }));
 })).map(({bytes,...f})=>({...f,buffer:Buffer.from(bytes)}));
}
const payload=({name,mimeType,buffer})=>({name,mimeType,buffer});
async function finished(page,count){await page.waitForFunction(()=>!document.querySelector('#import-kml').disabled&&!document.querySelector('#import-report').hidden);await page.waitForFunction(count=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')).trips.length===count,count);await page.waitForFunction(()=>/^(Saved|已保存)/.test(document.querySelector('#save-status').textContent));}
const notebook=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')));

test('one mixed-format selection creates independent journeys with colors and video titles intact through reload and export',async()=>{
 const {context,page,errors}=await setup();try{
  const batch=await files(page),pending=page.waitForEvent('filechooser');await page.locator('#import-kml').click();const chooser=await pending;assert.ok(chooser.isMultiple());await chooser.setFiles(batch.map(payload));await finished(page,4);
  assert.equal(await page.locator('#import-status').textContent(),'Imported 3 files as separate journeys.');assert.equal(await page.locator('#trip-name').inputValue(),batch[0].trip.name);assert.equal(await page.locator('#trip-video-title').inputValue(),batch[0].trip.videoTitle);
  let data=await notebook(page);assert.deepEqual(data.trips[0],existing);assert.equal(new Set(data.trips.map(t=>t.id)).size,4);
  for(const [i,trip] of data.trips.slice(1).entries()){const source=batch[i].trip;assert.equal(trip.name,source.name);assert.equal(trip.color,source.color);assert.equal(trip.videoTitle,source.videoTitle);assert.equal(trip.items.length,2);assert.equal(trip.items[0].mode,source.items[0].mode);assert.equal(trip.items[0].start,'2026-03');assert.deepEqual(trip.items[0].coordinates,source.items[0].coordinates);assert.equal(trip.items[1].visible,false);}
  await page.reload();await dismissFolderPrompt(page);await page.waitForFunction(()=>document.querySelectorAll('.journey-row').length===4);data=await notebook(page);
  for(const trip of data.trips.slice(1)){await page.locator(`[data-journey-select="${trip.id}"]`).click();assert.equal(await page.locator('#trip-video-title').inputValue(),trip.videoTitle);}
  const roundtrip=await page.evaluate(async()=>{const {journeyFile,importJourneyFile}=await import('/js/journey-files.mjs'),{checkedPlaybackPlan}=await import('/js/journey-playback.mjs'),trips=JSON.parse(localStorage.getItem('wanderlust-studio-v1')).trips.slice(1),formats=['kml','kmz','geojson'],result=[];
   for(const [i,trip]of trips.entries()){const file=new File([await journeyFile([trip],formats[i])],'again.'+formats[i]);const restored=(await importJourneyFile(file)).trip;result.push({color:restored.color,title:restored.videoTitle});}
   return {result,titles:checkedPlaybackPlan(trips).segments.map(s=>s.tripVideoTitle)};
  });assert.deepEqual(roundtrip.result,batch.map(f=>({color:f.trip.color,title:f.trip.videoTitle})));assert.deepEqual(roundtrip.titles,batch.map(f=>f.trip.videoTitle));assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('bad files are reported by name while other files and per-journey warnings survive',async()=>{
 const {context,page,errors}=await setup({mobile:true});try{
  const batch=await files(page),warning={name:'with-warning.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{name:'A place'},geometry:{type:'Point',coordinates:[-95,35]}},{type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[-95,35],[-94,35],[-95,36],[-95,35]]]}}]}))};
  await page.locator('#kml-file').setInputFiles([{name:'bad<img>.geojson',mimeType:'application/geo+json',buffer:Buffer.from('{broken')},payload(batch[0]),{name:'broken.kmz',mimeType:'application/vnd.google-earth.kmz',buffer:Buffer.from('not a ZIP')},warning]);await finished(page,3);
  assert.match(await page.locator('#import-status').textContent(),/Imported 2 files.*2 file\(s\) could not/);const messages=await page.locator('#import-details li').allTextContents();assert.equal(messages.length,3);assert.ok(messages.some(m=>m.includes('bad<img>.geojson')&&m.includes('not valid GeoJSON')));assert.ok(messages.some(m=>m.includes('broken.kmz')&&m.includes('not a readable KMZ')));assert.ok(messages.some(m=>m.includes('with-warning.geojson')&&m.includes('Polygon')));assert.equal(await page.locator('#import-report img').count(),0);
  const data=await notebook(page);assert.deepEqual(data.trips[0],existing);assert.equal(data.trips[1].name,batch[0].trip.name);assert.ok(data.trips[2].importWarnings.some(w=>w.includes('Polygon')));assert.equal(data.activeTrip,data.trips[1].id);
  await page.locator('#import-report').scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/journey-batch-import-mobile.png'});assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('an entirely invalid batch leaves the notebook and active journey unchanged',async()=>{
 const {context,page,errors}=await setup();try{
  const before=await notebook(page);await page.locator('#kml-file').setInputFiles([{name:'bad.kml',mimeType:'application/xml',buffer:Buffer.from('<kml>')},{name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')}]);
  await page.waitForFunction(()=>document.querySelector('#import-status').textContent.includes('No journeys were imported.'));assert.equal(await page.locator('.journey-row').count(),1);assert.equal(await page.locator('#trip-name').inputValue(),existing.name);assert.deepEqual(await notebook(page),before);assert.equal(await page.locator('#import-details li').count(),2);assert.ok(await page.locator('#import-kml').isEnabled());assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('duplicate filenames and repeated selections create new IDs without renaming titles or overwriting journeys',async()=>{
 const {context,page,errors}=await setup();try{
  const batch=await files(page),same=payload(batch[0]);await page.locator('#kml-file').setInputFiles([same,same]);await finished(page,3);assert.equal(await page.locator('#kml-file').inputValue(),'');await page.locator('#kml-file').setInputFiles(same);await finished(page,4);
  const data=await notebook(page);assert.equal(new Set(data.trips.map(t=>t.id)).size,4);assert.ok(data.trips.slice(1).every(t=>t.name===batch[0].trip.name&&t.color===batch[0].trip.color&&t.videoTitle===batch[0].trip.videoTitle));assert.deepEqual(data.trips[0],existing);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('files without Studio metadata use palette defaults and preserve normal single-file import',async()=>{
 const {context,page,errors}=await setup();try{
  await page.locator('#kml-file').setInputFiles({name:'Old trip.KML',mimeType:'application/xml',buffer:Buffer.from('<kml><Document><Placemark><name>A place</name><Point><coordinates>-100,35</coordinates></Point></Placemark></Document></kml>')});await finished(page,2);
  const data=await notebook(page);assert.equal(data.trips[1].name,'Old trip');assert.equal(data.trips[1].videoTitle,'');assert.equal(data.trips[1].color,'#445566');assert.equal(await page.locator('#trip-video-title').inputValue(),'');assert.equal(await page.locator('#import-status').textContent(),'File imported as a new journey. Your other journeys are preserved.');assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('batch progress translates live and prevents overlapping imports until parsing finishes',async()=>{
 const {context,page,errors}=await setup();try{
  const batch=await files(page);await page.evaluate(()=>{const read=File.prototype.text;File.prototype.text=async function(){if(this.name==='slow.kml')await new Promise(resolve=>window.resumeImport=resolve);return read.call(this);};});
  await page.locator('#kml-file').setInputFiles([payload(batch[2]),{...payload(batch[0]),name:'slow.kml'}]);await page.waitForFunction(()=>window.resumeImport);
  assert.match(await page.locator('#import-status').textContent(),/Importing 2 of 2: slow.kml/);assert.ok(await page.locator('#import-kml').isDisabled());assert.ok(await page.locator('#kml-file').isDisabled());assert.equal(await page.locator('.journey-row').count(),1);
  await page.locator('#open-settings').click();await page.locator('[data-language=zh]').click();await page.locator('[data-close=settings-dialog]').last().click();assert.match(await page.locator('#import-status').textContent(),/正在导入 2\/2：slow.kml/);await page.evaluate(()=>resumeImport());await finished(page,3);
  assert.equal(await page.locator('#import-status').textContent(),'已将 2 个文件导入为独立行程。');assert.ok(await page.locator('#import-kml').isEnabled());assert.ok(await page.locator('#kml-file').isEnabled());assert.match(await page.locator('#import-kml').getAttribute('aria-label'),/一个或多个/);assert.equal(await page.locator('#trip-video-title').inputValue(),batch[2].trip.videoTitle);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('ZIP folders import each supported file once, preserving metadata and continuing past a corrupt entry',async()=>{
 const {context,page,errors}=await setup();try{
  const batch=await files(page),bytes=await page.evaluate(async data=>{await import('/js/vendor/jszip-3.10.1.js');const zip=new JSZip();zip.file('Trips/Coast.KML',Uint8Array.from(data[0]));zip.file('Trips/bad.geojson','{broken');zip.file('Rail/Trip.kmz',Uint8Array.from(data[1]));zip.file('Walking/Trip.GeoJSON',Uint8Array.from(data[2]));zip.file('__MACOSX/._Trip.kml','ignore');zip.file('readme.txt','ignore');return [...await zip.generateAsync({type:'uint8array',compression:'DEFLATE'})];},batch.map(f=>[...f.buffer]));
  assert.match(await page.locator('#kml-file').getAttribute('accept'),/\.zip/);await page.locator('#kml-file').setInputFiles([{name:'Journeys.zip',mimeType:'application/zip',buffer:Buffer.from(bytes)},payload(batch[0])]);await finished(page,5);
  const data=await notebook(page),added=data.trips.slice(1);assert.equal(new Set(data.trips.map(t=>t.id)).size,5);assert.deepEqual(added.map(t=>t.name),[...batch.map(f=>f.trip.name),batch[0].trip.name]);assert.deepEqual(added.slice(0,3).map(t=>({color:t.color,title:t.videoTitle})),batch.map(f=>({color:f.trip.color,title:f.trip.videoTitle})));assert.ok(added.every(t=>t.items.length===2));assert.equal(await page.locator('#import-details li').count(),1);assert.match(await page.locator('#import-details').textContent(),/Journeys.zip \/ Trips\/bad.geojson/);assert.deepEqual(data.trips[0],existing);
  await page.reload();await dismissFolderPrompt(page);await page.waitForFunction(()=>document.querySelectorAll('.journey-row').length===5);assert.deepEqual((await notebook(page)).trips.slice(1).map(t=>t.videoTitle),added.map(t=>t.videoTitle));assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('ZIP validation rejects unreadable, empty, excessive and oversized entries without unbounded extraction',async()=>{
 const {context,page,errors}=await setup();try{
  const messages=await page.evaluate(async()=>{
   const {importJourneyEntries}=await import('/js/journey-files.mjs');await import('/js/vendor/jszip-3.10.1.js');
   const read=async file=>{const out=[];try{for await(const entry of importJourneyEntries(file))if(entry.error)out.push(entry.error);}catch(e){out.push(e.message);}return out.join(' ');};
   const messages=[await read(new File(['not a zip'],'bad.zip'))];
   const empty=new JSZip();empty.file('readme.txt','No journeys');messages.push(await read(new File([await empty.generateAsync({type:'uint8array'})],'empty.zip')));
   const many=new JSZip();for(let i=0;i<1001;i++)many.file('entry-'+i+'.txt','');messages.push(await read(new File([await many.generateAsync({type:'uint8array'})],'many.zip')));
   const huge=new JSZip();huge.file('too-large.kml',' '.repeat(10*1024*1024+1));const bytes=await huge.generateAsync({type:'uint8array',compression:'DEFLATE'}),view=new DataView(bytes.buffer);for(let i=0;i<bytes.length-28;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,1,true);break;}
   messages.push(await read(new File([bytes],'undersized-header.zip')));return messages;
  });
  assert.match(messages[0],/not a readable ZIP/);assert.match(messages[1],/contains no KML/);assert.match(messages[2],/1,000/);assert.match(messages[3],/smaller than 10 MB/);assert.equal(await page.locator('.journey-row').count(),1);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
