const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
let browser;const base=process.env.STUDIO_URL||'http://127.0.0.1:8770';
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});});
after(async()=>browser?.close());
async function setup(data){
 const context=await browser.newContext({viewport:{width:1360,height:1000},timezoneId:'America/Los_Angeles'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(data=>{Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined});if(data)localStorage.setItem('wanderlust-studio-v1',JSON.stringify(data));},data);
 await page.route('https://tiles.openfreemap.org/**',r=>r.abort());await page.goto(base+'/journey-studio.html');
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent!=='Opening your local notebook…');return {context,page,errors};
}
const items=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')).trips[0].items);
async function saved(page){await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('Saved'));}
async function coords(page,key,value){await page.locator('#'+key+'-query').fill(value);await page.locator('[data-search='+key+']').click();await page.waitForFunction(()=>document.querySelector('#form-status').textContent.startsWith('Selected '));}

test('month and optional-day precision survives KML, KMZ and GeoJSON without invented days',async()=>{
 const {context,page,errors}=await setup();try{
  const result=await page.evaluate(async()=>{
   const {validTime,validateTimes,exportKML}=await import('/js/journey-kml.mjs'),{calendarDate}=await import('/js/journey-dates.mjs'),{journeyFile,importJourneyFile}=await import('/js/journey-files.mjs'),{checkedPlaybackPlan}=await import('/js/journey-playback.mjs');
   const valid=['2026-11','2024-02-29','2026-11-23','2026-11-23T23:30:00-05:00',''];
   const invalid=['2026-00','2026-13','2026-2','2026-02-29','2024-02-30','2026-04-31'];
   const ranges=[['2026-11-23','2026-11'],['2026-11','2026-11-01'],['2026-11','2026-12'],['','2026-11']];
   const reversed=[['2026-12','2026-11'],['2026-11-23','2026-11-22'],['2026-11-23T23:00:00Z','2026-11-23T22:00:00Z']];
   const accepted=ranges.every(([a,b])=>{try{validateTimes(a,b);return true;}catch{return false;}}),rejected=reversed.every(([a,b])=>{try{validateTimes(a,b);return false;}catch{return true;}});
   let missingMonth=false;try{calendarDate('','23');}catch{missingMonth=true;}
   const trip={name:'Calendar trip',items:[{id:'m',name:'Month',kind:'point',coordinates:[-83,35],start:'2026-11'},{id:'d',name:'Day',kind:'point',coordinates:[-82,36],start:'2024-02-29',end:'2024-02'},{id:'legacy',name:'Imported',kind:'point',coordinates:[-80,35],start:'2026-01-01T00:30:00+14:00'}]};
   const outputs=[];for(const format of ['kml','kmz','geojson']){const file=await journeyFile([trip],format,trip.name),result=await importJourneyFile(new File([file],'calendar.'+format));outputs.push({format,times:result.trip.items.map(i=>[i.start||'',i.end||'']),warnings:result.warnings});}
   const route=(id,start)=>({id,name:id,kind:'segment',mode:'car',start,coordinates:[[-83,35],[-82,36]]});const plan=checkedPlaybackPlan([{id:'a',name:'Dated',items:[route('November','2026-11'),route('February','2026-02'),route('November day','2026-11-15')]}]);
   return {valid:valid.every(validTime),invalid:invalid.every(v=>!validTime(v)),accepted,rejected,missingMonth,day:calendarDate('2024-02','9'),month:calendarDate('2026-11'),outputs,kml:exportKML(trip),order:plan.segments.map(i=>i.id)};
  });
  assert.ok(result.valid&&result.invalid&&result.accepted&&result.rejected&&result.missingMonth);assert.equal(result.day,'2024-02-09');assert.equal(result.month,'2026-11');
  assert.match(result.kml,/<when>2026-11<\/when>/);assert.ok(!result.kml.includes('2026-11-01'));assert.deepEqual(result.order,['February','November','November day']);
  for(const o of result.outputs){assert.deepEqual(o.times,[['2026-11',''],['2024-02-29','2024-02'],['2026-01-01T00:30:00+14:00','']]);assert.deepEqual(o.warnings,[]);}
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('create, reload, edit and replace a route using only months or an optional day',async()=>{
 const {context,page,errors}=await setup();try{
  await coords(page,'start','35.96, -83.92');await coords(page,'end','35.59, -82.55');await page.locator('#segment-mode input[value=plane]').check();
  await page.locator('#segment-form details').evaluate(e=>e.open=true);await page.locator('#segment-start').fill('2026-11');await page.locator('#segment-end').fill('2026-12');
  await page.locator('#find-routes').click();await page.getByRole('button',{name:'Add selected segment'}).click();await saved(page);
  assert.equal((await items(page))[0].start,'2026-11');assert.equal((await items(page))[0].end,'2026-12');assert.equal(await page.locator('#segment-start').inputValue(),'11-2026');
  const kml=await page.evaluate(async()=>{const root=await(await navigator.storage.getDirectory()).getDirectoryHandle('.wanderlust'),state=JSON.parse(localStorage.getItem('wanderlust-studio-v1'));return (await(await root.getFileHandle('journey-'+state.trips[0].id+'.kml')).getFile()).text();});assert.match(kml,/<begin>2026-11<\/begin><end>2026-12<\/end>/);
  await page.reload();await page.locator('#route-itinerary button').filter({hasText:'Edit'}).click();assert.equal(await page.locator('#edit-start').inputValue(),'11-2026');assert.equal(await page.locator('#edit-start-day').inputValue(),'');
  await page.locator('#edit-end').fill('2026-10');await page.getByRole('button',{name:'Save changes'}).click();assert.match(await page.locator('#edit-error').textContent(),/end date/);
  await page.locator('#edit-start').fill('2026-02');await page.locator('#edit-start-day').fill('30');await page.getByRole('button',{name:'Save changes'}).click();assert.match(await page.locator('#edit-error').textContent(),/valid year and month/);
  await page.locator('#edit-start').fill('2024-02');await page.locator('#edit-start-day').fill('29');await page.locator('#edit-end').fill('2024-02');await page.getByRole('button',{name:'Save changes'}).click();await saved(page);
  assert.equal((await items(page))[0].start,'2024-02-29');assert.equal((await items(page))[0].end,'2024-02');
  await page.locator('#route-itinerary button').filter({hasText:'Edit'}).click();await page.locator('#replace-route').click();assert.equal(await page.locator('#segment-start').inputValue(),'02-2024');assert.equal(await page.locator('#segment-start-day').inputValue(),'29');assert.equal(await page.locator('#segment-end-day').inputValue(),'');
  await page.locator('#cancel-replace').click();assert.equal(await page.locator('#segment-start-day').inputValue(),'');assert.equal(await page.locator('[type=datetime-local],[type=time]').count(),0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('legacy timestamps are preserved on unrelated edits, with date-only localized controls on mobile',async()=>{
 const stamp='2026-01-01T00:30:00+14:00';const data={version:1,itineraryTab:'places',activeTrip:'legacy',trips:[{id:'legacy',name:'Legacy',items:[{id:'pin',kind:'point',name:'Old place',coordinates:[-83,35],start:stamp}]}],updatedAt:1};
 const {context,page,errors}=await setup(data);try{
  await page.getByRole('button',{name:'Edit Old place',exact:true}).click();assert.equal(await page.locator('#edit-start').inputValue(),'01-2026');assert.equal(await page.locator('#edit-start-day').inputValue(),'1');
  await page.locator('#edit-notes').fill('Only notes changed');await page.getByRole('button',{name:'Save changes'}).click();await saved(page);assert.equal((await items(page))[0].start,stamp);assert.ok(!(await page.locator('#itinerary').textContent()).includes('00:30'));
  await page.getByRole('button',{name:'Edit Old place',exact:true}).click();await page.locator('#edit-start-day').fill('');await page.getByRole('button',{name:'Save changes'}).click();await saved(page);assert.equal((await items(page))[0].start,'2026-01');
  await page.locator('#open-settings').click();await page.locator('[data-language=zh]').click();await page.locator('[data-close=settings-dialog]').last().click();
  await page.setViewportSize({width:390,height:844});await page.locator('#segment-form details').evaluate(e=>e.open=true);await page.locator('#segment-start').fill('2026-11');
  await page.locator('#segment-start').scrollIntoViewIfNeeded();assert.equal(await page.locator('label[for=segment-start]').innerText(),'年月');assert.equal(await page.locator('label[for=segment-start-day]').innerText(),'日（可选）');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/journey-month-input-mobile.png'});assert.deepEqual(errors,[]);
 }finally{await context.close();}
});


test('MM-YYYY dates carry forward between routes and places and remain specific to each journey',async()=>{
 const {context,page,errors}=await setup();try{
  await page.locator('#segment-form details').evaluate(e=>e.open=true);
  await page.locator('#segment-start').fill('11-2026');await page.locator('#segment-start').blur();
  assert.equal(await page.locator('#segment-end').inputValue(),'11-2026');
  await page.locator('#segment-start-day').fill('25');await page.locator('#segment-start-day').blur();
  assert.equal(await page.locator('#segment-end-day').inputValue(),'25');
  await page.locator('#segment-end').fill('12-2026');await page.locator('#segment-end-day').fill('');await page.locator('#segment-end-day').blur();
  await page.locator('#point-tab').click();await page.locator('#point-form details').evaluate(e=>e.open=true);
  assert.equal(await page.locator('#point-start').inputValue(),'11-2026');assert.equal(await page.locator('#point-start-day').inputValue(),'25');assert.equal(await page.locator('#point-end').inputValue(),'12-2026');assert.equal(await page.locator('#point-end-day').inputValue(),'');
  await coords(page,'point','35, -83');await page.locator('#point-form button[type=submit]').click();await saved(page);
  assert.equal((await items(page))[0].start,'2026-11-25');assert.equal((await items(page))[0].end,'2026-12');assert.equal(await page.locator('#point-start').inputValue(),'11-2026');
  const first=await page.evaluate(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')).activeTrip);
  await page.locator('#new-trip').click();assert.equal(await page.locator('#point-start').inputValue(),'');
  await page.locator('#point-start').fill('02-2024');await page.locator('#point-start-day').fill('29');await page.locator('#point-start-day').blur();await saved(page);
  await page.locator('[data-journey-select="'+first+'"]').click();assert.equal(await page.locator('#segment-start').inputValue(),'11-2026');assert.equal(await page.locator('#segment-end').inputValue(),'12-2026');await saved(page);
  await page.reload();await page.waitForFunction(()=>document.querySelector('#segment-start').value==='11-2026');assert.equal(await page.locator('#segment-start-day').inputValue(),'25');
  const normalized=await page.evaluate(async()=>{const {calendarDate}=await import('/js/journey-dates.mjs');const results=['11-2026','02-2024','2026-11'].map(v=>calendarDate(v));let invalid=0;for(const value of ['13-2026','00-2026','02-0000','2026-2','11/2026'])try{calendarDate(value);}catch{invalid++;}return {results,invalid};});assert.deepEqual(normalized,{results:['2026-11','2024-02','2026-11'],invalid:5});assert.deepEqual(errors,[]);
 }finally{await context.close();}
});
