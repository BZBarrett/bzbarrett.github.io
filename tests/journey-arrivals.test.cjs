const {dismissFolderPrompt}=require('./helpers/folder-prompt.cjs');
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-webgl']});});
after(async()=>browser?.close());
const base=process.env.STUDIO_URL||'http://127.0.0.1:8770';
const node=(name,coordinates)=>({name,coordinates,important:true});
const route=(id,a,b,startNode,endNode)=>({id,name:id,kind:'segment',mode:'car',coordinates:[a,b],startNode,endNode});
const fixture=()=>({version:1,activeTrip:'a',updatedAt:1,trips:[
 {id:'a',name:'First journey',items:[route('first',[-120,35],[-119,35],node('Start',[-120,35]),node('Crossroads',[-119,35])),route('second',[-119,35],[-118,35],node('Crossroads',[-119,35]),node('Destination',[-118,35])),{id:'middle',kind:'point',...node('Overlook',[-119.5,35])},{id:'off',kind:'point',...node('Off route',[-100,40])}]},
 {id:'b',name:'Second journey',items:[route('first',[-118,35],[-117,35],node('Next start',[-118,35]),node('Next end',[-117,35]))]}
]});
async function setup(fallback,data=fixture()){
 const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({data,fallback})=>{localStorage.setItem('wanderlust-studio-v1',JSON.stringify(data));if(fallback)Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined});},{data,fallback});
 await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'base',type:'background',paint:{'background-color':'#e7ede6'}}]}}));
 await page.goto(base+'/journey-studio.html');await dismissFolderPrompt(page);await page.waitForFunction(()=>!document.querySelector('#play-journey').disabled);
 await page.evaluate(async()=>{const {JourneyPlayback}=await import('/js/journey-playback.mjs'),advance=JourneyPlayback.prototype.advance;JourneyPlayback.prototype.advance=function(...args){window.player=this;return advance.apply(this,args);};document.querySelector('#play-journey').click();player.pause();player.follow=false;player.map.fit([[-120,35],[-117,35]],{duration:0});});
 await page.waitForFunction(()=>(player.map.sketch||player.map.ready)&&!player.map.opening&&!player.map.themeLoading);return {context,page,errors};
}
async function seek(page,fraction){return page.evaluate(f=>{player.seek(f);player.draw();return player.map.playbackPoints.slice(0,player.map.playbackPointCount).map(p=>p.name);},fraction);}
for(const fallback of [false,true])test(`important points appear on arrival with names, rewind and queued playback (${fallback?'canvas':'WebGL'})`,async()=>{
 const {context,page,errors}=await setup(fallback);try{
  assert.deepEqual(await seek(page,0),[]);
  assert.deepEqual(await seek(page,.2),['Start']);
  assert.deepEqual(await seek(page,.3),['Start','Overlook']);
  assert.deepEqual(await seek(page,.51),['Start','Overlook','Crossroads']);
  assert.deepEqual(await seek(page,.8),['Start','Overlook','Crossroads']);
  assert.deepEqual(await seek(page,1),['Start','Overlook','Crossroads','Destination']);
  assert.deepEqual(await seek(page,.1),['Start']);
  assert.equal(await page.evaluate(()=>player.map.playbackPointTrip),'a');
  if(!fallback){await page.waitForTimeout(250);const counts=await page.evaluate(()=>player.map.map.queryRenderedFeatures({layers:['studio-points','studio-stars']}).filter(f=>f.properties.tripId==='a').length);assert.equal(counts,0,'static important points are suppressed during playback');}
  const events=await page.evaluate(()=>player.plan.importantPoints.map(p=>p.name));assert.equal(events.filter(n=>n==='Crossroads').length,1);assert.ok(!events.includes('Off route'));
  const effect=await page.evaluate(()=>{const p=player,event=p.plan.importantPoints.find(n=>n.name==='Crossroads');p.seek((event.elapsed+.15)/p.plan.total);p.draw();const a=p.ctx.getImageData(0,0,p.canvas.width,p.canvas.height).data;p.reducedMotion={matches:true};p.draw();const b=p.ctx.getImageData(0,0,p.canvas.width,p.canvas.height).data;let changed=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])changed++;return changed;});assert.ok(effect>100,'arrival pulse/pop produces visible pixels and reduced motion removes it');
  await page.evaluate(()=>{player.startScope('checked');player.pause();});assert.deepEqual(await seek(page,.1),['Start']);assert.deepEqual(await page.evaluate(()=>[...new Set(player.map.playbackPoints.map(p=>p.tripId))]),['a','b']);
  assert.deepEqual(await seek(page,1),['Start','Overlook','Crossroads','Destination','Next start','Next end']);
  await page.evaluate(()=>{player.exit();player.draw();});assert.deepEqual(await page.evaluate(()=>({plan:player.map.playbackPoints,points:player.drawnImportantPoints})),{plan:null,points:[]});
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('video arrival frames use the same labels and timing, including a final destination hold',async()=>{
 const {context,page,errors}=await setup(true);try{
  const result=await page.evaluate(async()=>{
   const {captureVideoSettings,JourneyVideoRenderer,videoTiming}=await import('/js/journey-video.mjs');player.rate=4;const data=JSON.parse(localStorage.getItem('wanderlust-studio-v1'));data.trips[1].visible=false;
   const snapshot=captureVideoSettings(player.map,player,data),renderer=new JourneyVideoRenderer(snapshot,'landscape',{resolution:720,fps:24});
   try{await renderer.init();const frames=[];for(const f of [0,.3,.51,1,.1]){await renderer.render(snapshot.plan.total/snapshot.rate*f);frames.push(renderer.adapter.playbackPoints.slice(0,renderer.adapter.playbackPointCount).map(n=>n.name));}
    const timing=videoTiming(snapshot.plan,snapshot.rate,24);await renderer.render(timing.duration);return {frames,tail:timing.duration-snapshot.plan.total/snapshot.rate,places:snapshot.places.length,effects:renderer.painter.activeArrivals.size};
   }finally{renderer.dispose();}
  });
  assert.deepEqual(result.frames,[[],['Start','Overlook'],['Start','Overlook','Crossroads'],['Start','Overlook','Crossroads','Destination'],['Start']]);assert.ok(Math.abs(result.tail-3)<1e-8);assert.equal(result.effects,0);assert.equal(result.places,0);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('arrival plans respect chronological order, hidden routes and the date line without changing route geometry',async()=>{
 const {context,page}=await setup(true);try{
  const result=await page.evaluate(async()=>{
   const {checkedPlaybackPlan,playbackPlan}=await import('/js/journey-playback.mjs');const route=(id,start,a,b)=>({id,name:id,kind:'segment',start,coordinates:[a,b],endNode:{name:id,coordinates:b,important:true}});
   const data=[route('late','2026-12',[10,0],[11,0]),route('early','2026-01',[179,10],[-179,10]),{...route('hidden','2025-01',[20,0],[21,0]),visible:false},{id:'pin',kind:'point',name:'Date line',coordinates:[180,10],important:true}];const before=JSON.stringify(data),plan=checkedPlaybackPlan([{id:'a',name:'Trip',items:data}]);
   return {names:plan.importantPoints.map(p=>p.name),unchanged:before===JSON.stringify(data),empty:playbackPlan([{id:'pin',kind:'point',name:'Pin',coordinates:[0,0],important:true}]).importantPoints};
  });assert.deepEqual(result,{names:['Date line','early','late'],unchanged:true,empty:[]});
 }finally{await context.close();}
});

test('globe arrival labels stay on the visible hemisphere and survive projection changes',async()=>{
 const {context,page,errors}=await setup(false);try{
  const names=await page.evaluate(()=>{player.map.view='globe';player.map.map.setProjection({type:'globe'});player.map.map.jumpTo({center:[-119,35],zoom:2,padding:0});player.seek(.51);player.draw();return player.drawnImportantPoints.map(p=>p.name);});assert.deepEqual(names,['Crossroads']);
  const hidden=await page.evaluate(()=>{player.map.map.jumpTo({center:[61,-35],zoom:2});player.draw();return player.drawnImportantPoints;});assert.deepEqual(hidden,[]);
  const restored=await page.evaluate(()=>{player.map.view='3d';player.map.map.setProjection({type:'mercator'});player.map.map.jumpTo({center:[-119,35],zoom:6,pitch:45});player.draw();return player.drawnImportantPoints.map(p=>p.name);});assert.deepEqual(restored,['Crossroads']);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});


for(const fallback of [false,true])test(`arrival names omit addresses, hold for two seconds and fade while stars remain (${fallback?'canvas':'WebGL'})`,async()=>{
 const data=fixture();data.trips[0].items[0].startNode.name='Knoxville, Knox County, Tennessee, United States';
 const {context,page,errors}=await setup(fallback,data);try{
  const result=await page.evaluate(async()=>{
   const {importantPointName}=await import('/js/journey-playback.mjs');const ctx=player.ctx,fill=ctx.fillText.bind(ctx);let text=[];
   ctx.fillText=function(value,...args){text.push({value,alpha:this.globalAlpha});return fill(value,...args);};
   const frames=[];
   for(const age of [.01,1.99,2,2.25,2.5,2.75,3,3.1]){player.seek(age/player.plan.total);text=[];player.draw();frames.push({age,text:[...text],stars:player.map.playbackPointCount});}
   player.seek(2.5/player.plan.total);text=[];player.draw();const before=text[0].alpha;
   document.querySelector('#player-speed').value='8';document.querySelector('#player-speed').dispatchEvent(new Event('change'));text=[];player.draw();const after=text[0].alpha;
   // Advance real player ticks at the new rate, rather than rescaling an old age.
   player.state='playing';for(let i=0;i<3;i++){player.tick(player.lastTime+200);cancelAnimationFrame(player.raf);}player.pause();text=[];player.draw();const hidden=!text.some(t=>t.value==='Knoxville');
   player.seek(.01/player.plan.total);text=[];player.draw();const replay=text[0];
   const names=['大烟山国家公园，田纳西州，美国','Cades Cove','  Great Smoky Mountains, Tennessee  ','35.59460, -83.84120'].map(importantPointName);
   return {frames,before,after,hidden,replay,names,original:JSON.parse(localStorage.getItem('wanderlust-studio-v1')).trips[0].items[0].startNode.name};
  });
  for(const f of result.frames.filter(f=>f.age<=2)){assert.deepEqual(f.text,[{value:'Knoxville',alpha:1}]);assert.equal(f.stars,1);}
  const fading=result.frames.filter(f=>f.age>2&&f.age<3).map(f=>f.text[0].alpha);assert.ok(fading[0]>fading[1]&&fading[1]>fading[2]&&fading[2]>0);assert.ok(Math.abs(fading[1]-.5)<.001);
  for(const f of result.frames.filter(f=>f.age>=3)){assert.deepEqual(f.text,[]);assert.equal(f.stars,1);}
  assert.equal(result.before,result.after);assert.ok(result.hidden);assert.deepEqual(result.replay,{value:'Knoxville',alpha:1});assert.deepEqual(result.names,['大烟山国家公园','Cades Cove','Great Smoky Mountains','35.59460, -83.84120']);assert.equal(result.original,data.trips[0].items[0].startNode.name);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

test('final labels fade after completion even with reduced motion, and video uses the same fade',async()=>{
 const {context,page,errors}=await setup(true);try{
  const result=await page.evaluate(async()=>{
   const {captureVideoSettings,JourneyVideoRenderer,videoTiming}=await import('/js/journey-video.mjs');player.reducedMotion={matches:true};player.rate=8;
   const data=JSON.parse(localStorage.getItem('wanderlust-studio-v1'));data.trips[1].visible=false;data.trips[0].items[1].endNode.name='Asheville, Buncombe County, North Carolina, United States';
   const snapshot=captureVideoSettings(player.map,player,data),renderer=new JourneyVideoRenderer(snapshot,'landscape',{resolution:720,fps:24});
   try{await renderer.init();const ctx=renderer.painter.ctx,fill=ctx.fillText.bind(ctx);let text=[];ctx.fillText=function(value,...args){text.push({value,alpha:this.globalAlpha});return fill(value,...args);};
    const frames=[];for(const age of [0,2,2.5,3]){text=[];await renderer.render(snapshot.plan.total/snapshot.rate+age);frames.push({text:text.filter(t=>t.value==='Asheville'),stars:renderer.adapter.playbackPointCount});}
    const withoutFinal={...snapshot.plan,arrivals:snapshot.plan.arrivals.filter(p=>p.name!==data.trips[0].items[1].endNode.name),points:snapshot.plan.points.filter(p=>p.name!==data.trips[0].items[1].endNode.name)},timing=videoTiming(withoutFinal,8,24),last=withoutFinal.points.at(-1);
    return {frames,tail:timing.duration-withoutFinal.total/8,expectedTail:Math.max(0,3-(withoutFinal.total-last.elapsed)/8)};
   }finally{renderer.dispose();}
  });
  assert.deepEqual(result.frames.map(f=>f.text),[[{value:'Asheville',alpha:1}],[{value:'Asheville',alpha:1}],[{value:'Asheville',alpha:.5}],[]]);assert.ok(result.frames.every(f=>f.stars===4));assert.ok(Math.abs(result.tail-result.expectedTail)<1e-8);
  await seek(page,1);assert.equal(await page.evaluate(()=>player.drawnImportantPoints.at(-1).labelOpacity),1);
  await page.waitForFunction(()=>player.activeArrivals.size===0&&player.markerRaf===0,{},{timeout:6000});assert.equal(await page.evaluate(()=>player.map.playbackPoints.at(-1).name),'Destination');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

for(const fallback of [false,true])test(`ordinary endpoints and pins are hidden at zero and reveal along the route (${fallback?'canvas':'WebGL'})`,async()=>{
 const data=fixture();for(const i of data.trips[0].items){if(i.startNode)i.startNode.important=false;if(i.endNode&&i.id==='first')i.endNode.important=false;if(i.id==='middle')i.important=false;}
 data.trips[1].items.push({id:'other-pin',kind:'point',name:'Another journey pin',coordinates:[-119.6,35]});
 const {context,page,errors}=await setup(fallback,data);try{
  assert.deepEqual(await seek(page,0),[]);
  assert.equal(await page.evaluate(()=>player.activeArrivals.size),0);
  assert.deepEqual(await seek(page,.3),['Start','Overlook']);
  const kinds=await page.evaluate(()=>player.map.playbackPoints.map(p=>[p.name,p.important]));assert.deepEqual(kinds,[['Start',false],['Overlook',false],['Crossroads',false],['Destination',true]]);
  await page.screenshot({path:'/tmp/journey-progressive-points-'+(fallback?'canvas':'native')+'.png'});
  if(fallback)assert.equal(await page.evaluate(()=>player.map.sketch.playbackPointCount),2);
  else{
   await page.waitForTimeout(250);
   const visible=await page.evaluate(()=>({static:player.map.map.getLayoutProperty('studio-points','visibility'),arrivals:[...new Set(player.map.map.queryRenderedFeatures({layers:['studio-arrival-points']}).map(f=>f.properties.name))].sort()}));assert.equal(visible.static,'none');assert.deepEqual(visible.arrivals,['Overlook','Start']);
   await page.evaluate(async()=>{await player.map.setTheme('dark');});await page.waitForFunction(()=>player.map.map.getSource('studio-arrivals')&&player.map.map.loaded());assert.equal(await page.evaluate(()=>player.map.map.getFilter('studio-arrival-points')[2]),2);assert.equal(await page.evaluate(()=>player.map.map.getLayoutProperty('studio-points','visibility')),'none');
  }
  assert.deepEqual(await seek(page,1),['Start','Overlook','Crossroads','Destination']);assert.deepEqual(await seek(page,.1),['Start']);assert.deepEqual(await seek(page,0),[]);
  await page.evaluate(()=>player.exit());assert.equal(await page.evaluate(()=>player.map.playbackPoints),null);
  if(!fallback)assert.equal(await page.evaluate(()=>player.map.map.getLayoutProperty('studio-points','visibility')),'visible');
  assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

for(const view of ['2d','globe','canvas'])test(`searching and saving fit only the selected route despite distant journeys (${view})`,async()=>{
 const data=fixture();data.trips[1].items.push({id:'remote',kind:'point',name:'Tokyo',coordinates:[139.7,35.6]});
 const {context,page,errors}=await setup(view==='canvas',data);try{
  const options=[[[-120,35],[-119.5,35.1],[-119,35]],[[-120,35],[-119.6,35.6],[-119,35]],[[-120,35],[-119.5,34.8],[-119,35]]];
  await page.route('https://router.project-osrm.org/**',r=>r.fulfill({json:{code:'Ok',waypoints:[{distance:0},{distance:0}],routes:options.map((coordinates,i)=>({distance:100000+i*10000,duration:4000+i*500,geometry:{type:'LineString',coordinates}}))}}));
  await page.locator('#new-trip').click();
  if(view==='globe')await page.evaluate(()=>player.map.setView('globe'));
  for(const [id,value]of [['start','35, -120'],['end','35, -119']]){await page.locator('#'+id+'-query').fill(value);await page.locator('[data-search='+id+']').click();await page.waitForFunction(()=>document.querySelector('#form-status').textContent.startsWith('Selected '));}
  await page.locator('#find-routes').click();await page.getByRole('button',{name:'Add selected segment'}).waitFor();
  const framing=async coordinates=>{
   await page.waitForFunction(()=>!player.map.map?.isMoving());
   return page.evaluate(coordinates=>{const map=player.map,pixels=coordinates.map(p=>map.projectCoordinate(p)),w=map.map?.getContainer().clientWidth||map.sketch.w,h=map.map?.getContainer().clientHeight||map.sketch.h;return {visible:pixels.every(p=>p&&p[0]>=0&&p[0]<=w&&p[1]>=0&&p[1]<=h),span:(Math.max(...pixels.map(p=>p?.[0]??0))-Math.min(...pixels.map(p=>p?.[0]??0)))/w,zoom:map.map?.getZoom()??Math.log2(map.sketch.scale/512)};},coordinates);
  };
  const first=await framing(options[0]);assert.ok(first.visible&&first.span>.2&&first.zoom>5,JSON.stringify(first));
  await page.locator('.route-option').nth(1).click();const alternate=await framing(options[1]);assert.ok(alternate.visible&&alternate.span>.2&&alternate.zoom>5,JSON.stringify(alternate));
  // Saving also refits the chosen route if the camera was moved out to a global view.
  await page.evaluate(()=>{const m=player.map;if(m.map)m.map.jumpTo({center:[0,0],zoom:1});else{m.sketch.scale=512*2;m.sketch.center=[.5,.5];m.sketch.free=true;m.sketch.draw();}});
  await page.getByRole('button',{name:'Add selected segment'}).click();await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('Saved'));
  const saved=await framing(options[1]);assert.ok(saved.visible&&saved.span>.2&&saved.zoom>5,JSON.stringify(saved));assert.equal(await page.locator('#route-itinerary li').count(),1);
  await page.setViewportSize({width:1100,height:900});await page.waitForTimeout(150);const resized=await framing(options[1]);assert.ok((view!=='canvas'||resized.visible)&&resized.span>.2&&resized.zoom>5,JSON.stringify(resized));assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

for(const view of ['2d','globe','canvas'])test(`selecting a journey frames only its scope and empty journeys keep the camera (${view})`,async()=>{
 const data=fixture();data.trips[0].items.push({id:'remote',kind:'point',name:'Tokyo',coordinates:[139.7,35.6]});data.trips[1].items.push({id:'local',kind:'point',name:'Local stop',coordinates:[-117.8,35.2]},{id:'hidden',kind:'point',name:'Hidden outlier',coordinates:[12,48],visible:false});
 data.trips.push({id:'point-only',name:'Single place',items:[{id:'place',kind:'point',name:'Knoxville',coordinates:[-83.92,35.96]}]});
 const {context,page,errors}=await setup(view==='canvas',data);try{
  if(view==='globe'){await page.evaluate(()=>player.map.setView('globe'));await page.waitForFunction(()=>!player.map.map.isMoving());}
  await page.locator('[data-journey-select=b]').click();await page.waitForFunction(()=>!player.map.map?.isMoving());
  const framed=await page.evaluate(()=>{const m=player.map,w=m.map?.getContainer().clientWidth||m.sketch.w,h=m.map?.getContainer().clientHeight||m.sketch.h,points=m.fitCoordinates;return {points,zoom:m.map?.getZoom()??Math.log2(m.sketch.scale/512),visible:points.every(point=>{const p=m.projectCoordinate(point);return p&&p[0]>=0&&p[0]<=w&&p[1]>=0&&p[1]<=h;})};});
  assert.deepEqual(framed.points,[[-118,35],[-117,35],[-117.8,35.2]]);assert.ok(framed.visible&&framed.zoom>5,JSON.stringify(framed));
  await page.locator('#new-trip').click();assert.ok(Math.abs((await page.evaluate(()=>player.map.map?.getZoom()??Math.log2(player.map.sketch.scale/512)))-framed.zoom)<.001);
  await page.locator('[data-journey-select=point-only]').click();await page.waitForFunction(()=>!player.map.map?.isMoving());
  assert.deepEqual(await page.evaluate(()=>player.map.fitCoordinates),[[-83.92,35.96]]);assert.ok((await page.evaluate(()=>player.map.map?.getZoom()??Math.log2(player.map.sketch.scale/512)))>10);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

for(const fallback of [false,true])test(`video hides ordinary places and renders their arrival prefix (${fallback?'canvas':'WebGL'})`,async()=>{
 const data=fixture();data.trips[0].items.find(i=>i.id==='middle').important=false;
 const {context,page,errors}=await setup(fallback,data);try{
  const result=await page.evaluate(async()=>{
   const {captureVideoSettings,JourneyVideoRenderer}=await import('/js/journey-video.mjs'),data=JSON.parse(localStorage.getItem('wanderlust-studio-v1'));data.trips[1].visible=false;const snapshot=captureVideoSettings(player.map,player,data),r=new JourneyVideoRenderer(snapshot,'landscape',{resolution:720,fps:24});
   try{await r.init();const start=r.adapter.playbackPointCount;await r.render(snapshot.plan.total/snapshot.rate*.3);const next=r.adapter.playbackPoints.slice(0,r.adapter.playbackPointCount).map(p=>p.name),native=r.native?[...new Set(r.native.queryRenderedFeatures({layers:['studio-arrival-points']}).map(f=>f.properties.name))].sort():null;return {start,next,native,places:snapshot.places};}finally{r.dispose();}
  });assert.equal(result.start,0);assert.deepEqual(result.next,['Start','Overlook']);assert.deepEqual(result.places,[]);if(!fallback)assert.deepEqual(result.native,['Overlook','Start']);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

for(const view of ['2d','globe','canvas'])test(`thousands of reached points stay in static layers with bounded frame work (${view})`,async()=>{
 const items=[];for(let r=0;r<80;r++){
  const coordinates=Array.from({length:512},(_,i)=>[-120+(r%10)*1.2+i/511,30+Math.floor(r/10)*.5]);
  items.push(route('route-'+r,coordinates[0],coordinates.at(-1),node('Start '+r,coordinates[0]),node('End '+r,coordinates.at(-1))));items.at(-1).coordinates=coordinates;
  for(let i=0;i<32;i++)items.push({id:`pin-${r}-${i}`,kind:'point',name:`Pin ${r} ${i}`,coordinates:coordinates[8+i*16],important:i%4===0});
 }
 const data={version:1,activeTrip:'dense',updatedAt:1,trips:[{id:'dense',name:'Dense route test',items}]};
 const {context,page,errors}=await setup(view==='canvas',data);try{
  const result=await page.evaluate(async view=>{
   const p=player;p.follow=false;if(view==='globe'){p.map.view='globe';p.map.map.setProjection({type:'globe'});p.map.map.jumpTo({center:[-116,32],zoom:3});}
   let uploads=0,filters=0;const source=p.map.map?.getSource('studio-arrivals');if(source){const upload=source.setData.bind(source);source.setData=(...args)=>{uploads++;return upload(...args);};const filter=p.map.map.setFilter.bind(p.map.map);p.map.map.setFilter=(...args)=>{filters++;return filter(...args);};}
   const measure=fraction=>{
    p.seek(fraction);p.draw();p.map.sketch?.draw();let calls=0;const project=p.map.projectCoordinate.bind(p.map);p.map.projectCoordinate=(...args)=>{calls++;return project(...args);};uploads=0;filters=0;
    const started=performance.now();for(let i=0;i<20;i++)p.draw();const ms=(performance.now()-started)/20;p.map.projectCoordinate=project;return {calls:calls/20,ms,uploads,filters,visible:p.map.playbackPointCount,active:p.activeArrivals.size};
   };
   const early=measure(.01),late=measure(.99);p.rate=128;const fast=measure(.99);
   const {routeArrivals}=await import('/js/journey-arrivals.mjs'),{distance}=await import('/js/journey-routes.mjs');let checks=0;const begun=performance.now(),points=routeArrivals(JSON.parse(localStorage.getItem('wanderlust-studio-v1')).trips[0].items,p.plan.segments,(a,b)=>{checks++;return distance(a,b);});return {early,late,fast,checks,matched:points.length,planningMs:performance.now()-begun};
  },view);
  assert.ok(result.late.visible>2600);assert.ok(result.late.calls<result.early.calls+70,JSON.stringify(result));assert.ok(result.fast.active<=64);assert.ok(result.fast.calls<500,JSON.stringify(result));
  for(const frame of [result.early,result.late,result.fast]){assert.equal(frame.uploads,0);assert.equal(frame.filters,0);assert.ok(frame.ms<25,JSON.stringify(result));}
  assert.equal(result.matched,2720);assert.ok(result.checks<50000,JSON.stringify(result));console.log('points performance',view,JSON.stringify(result));assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

for(const fallback of [false,true])test(`main Play Journey starts over with ordinary points hidden after a paused preview (${fallback?'canvas':'WebGL'})`,async()=>{
 const data=fixture();for(const item of data.trips[0].items){item.important=false;if(item.startNode)item.startNode.important=false;if(item.endNode)item.endNode.important=false;}
 const {context,page,errors}=await setup(fallback,data);try{
  await seek(page,.65);assert.ok(await page.evaluate(()=>player.map.playbackPointCount>1));
  const restarted=await page.evaluate(()=>{document.querySelector('#play-journey').click();player.pause();player.draw();player.map.sketch?.draw();return {elapsed:player.elapsed,count:player.map.playbackPointCount,labels:player.drawnImportantPoints.length};});
  assert.deepEqual(restarted,{elapsed:0,count:0,labels:0});
  if(!fallback){await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>player.map.map.queryRenderedFeatures({layers:['studio-points','studio-stars','studio-arrival-points','studio-arrival-stars']}).length),0);}
  await seek(page,.3);const before=await page.evaluate(()=>player.elapsed);await page.evaluate(()=>{document.querySelector('#player-toggle').click();player.pause();});assert.ok((await page.evaluate(()=>player.elapsed))>=before);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});

for(const standalone of [false,true])for(const fallback of [false,true])test(`returning to an important starting place triggers the final name and animation again (${standalone?'saved point':'endpoint'}, ${fallback?'canvas':'WebGL'})`,async()=>{
 const home=[-120,35],away=[-119,35],data={version:1,activeTrip:'loop',updatedAt:1,trips:[{id:'loop',name:'Round trip',items:[route('out',home,away,{...node('Home',home),important:!standalone},node('Away',away)),route('back',away,home,node('Away',away),{...node('Home',home),important:!standalone}),...(standalone?[{id:'home-pin',kind:'point',...node('Home',home)}]:[])]}]};
 const {context,page,errors}=await setup(fallback,data);try{
  const result=await page.evaluate(async()=>{
   player.follow=true;player.rate=32;player.seek(.99);player.play();await new Promise(resolve=>{const check=()=>player.state==='finished'?resolve():requestAnimationFrame(check);check();});player.draw();
   const node=player.drawnImportantPoints.find(p=>p.name==='Home');return {node:node&&{important:node.important,age:node.age,opacity:node.labelOpacity},staticCount:player.map.playbackPointCount};
  });assert.ok(result.node,'the terminal destination must animate even if visited before');assert.equal(result.node.important,true);assert.ok(result.node.age<.5);assert.equal(result.node.opacity,1);assert.equal(result.staticCount,2);assert.deepEqual(errors,[]);
 }finally{await context.close();}
});


for(const fallback of [false,true])test(`round-trip video replays the important endpoint effect and holds the terminal label (${fallback?'canvas':'WebGL'})`,async()=>{
 const home=[-120,35],away=[-119,35],data={version:1,activeTrip:'loop',updatedAt:1,trips:[{id:'loop',name:'Round trip',items:[route('out',home,away,node('Home',home),node('Away',away)),route('back',away,home,node('Away',away),node('Home',home))]}]};
 const {context,page,errors}=await setup(fallback,data);try{
  const result=await page.evaluate(async()=>{
   const {captureVideoSettings,JourneyVideoRenderer,videoTiming}=await import('/js/journey-video.mjs');player.rate=4;player.follow=true;const snapshot=captureVideoSettings(player.map,player,JSON.parse(localStorage.getItem('wanderlust-studio-v1'))),renderer=new JourneyVideoRenderer(snapshot,'landscape',{resolution:720,fps:24});
   try{await renderer.init();const frames=[];for(const after of [0,.2,2,2.5,3]){await renderer.render(snapshot.plan.total/snapshot.rate+after);const labels=renderer.painter.drawnImportantPoints.filter(p=>p.name==='Home').map(p=>({name:p.label,age:p.age,opacity:p.labelOpacity}));frames.push({labels,count:renderer.adapter.playbackPointCount});}
    return {frames,hold:videoTiming(snapshot.plan,snapshot.rate,24).duration-snapshot.plan.total/snapshot.rate,points:snapshot.plan.points.length,arrivals:snapshot.plan.arrivals.map(p=>p.name)};
   }finally{renderer.dispose();}
  });assert.deepEqual(result.arrivals,['Home','Away','Home']);assert.equal(result.points,2);assert.ok(Math.abs(result.hold-3)<1e-8);
  for(const [index,after]of [0,.2,2,2.5].entries()){const labels=result.frames[index].labels;assert.equal(labels.length,1);assert.equal(labels[0].name,'Home');assert.ok(Math.abs(labels[0].age-after)<1e-8);assert.ok(Math.abs(labels[0].opacity-(after<=2?1:.5))<1e-8);}
  assert.deepEqual(result.frames.at(-1).labels,[]);assert.ok(result.frames.every(frame=>frame.count===2));assert.deepEqual(errors,[]);
 }finally{await context.close();}
});


test('a route selected while the globe is loading survives the startup camera update',async()=>{
 const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));let release;const gate=new Promise(resolve=>release=resolve);
 try{
  await page.addInitScript(()=>{localStorage.setItem('wanderlust-studio-v1',JSON.stringify({version:1,activeTrip:'new',mapView:'globe',updatedAt:1,trips:[{id:'new',name:'New trip',items:[]},{id:'remote',name:'Tokyo',items:[{id:'tokyo',name:'Tokyo',kind:'point',coordinates:[139.7,35.6]}]}]}));let library;Object.defineProperty(window,'maplibregl',{configurable:true,get:()=>library,set(value){library=value;const Original=value.Map;value.Map=class extends Original{constructor(options){super(options);window.startupMap=this;}};}});});
  await page.route('https://tiles.openfreemap.org/**',async route=>{await gate;await route.fulfill({json:{version:8,sources:{},layers:[{id:'delayed-base',type:'background',paint:{'background-color':'#e7ede6'}}]}});});
  await page.goto(base+'/journey-studio.html');await dismissFolderPrompt(page);await page.waitForFunction(()=>window.startupMap?.getLayer('studio-lines'));
  for(const [id,value]of [['start','35, -120'],['end','35, -119']]){await page.locator('#'+id+'-query').fill(value);await page.locator('[data-search='+id+']').click();await page.waitForFunction(()=>document.querySelector('#form-status').textContent.startsWith('Selected '));}
  await page.locator('#segment-mode input[value=plane]').check();await page.locator('#find-routes').click();await page.getByRole('button',{name:'Add selected segment'}).waitFor();await page.waitForFunction(()=>!startupMap.isMoving());assert.ok(await page.evaluate(()=>startupMap.getZoom()>5));
  release();await page.waitForFunction(()=>startupMap.getLayer('delayed-base')&&startupMap.loaded()&&!startupMap.isMoving());await page.waitForTimeout(100);
  const camera=await page.evaluate(()=>({center:startupMap.getCenter().toArray(),zoom:startupMap.getZoom()}));assert.ok(camera.zoom>5&&Math.abs(camera.center[0]+119.5)<.1&&Math.abs(camera.center[1]-35)<.1,JSON.stringify(camera));assert.deepEqual(errors,[]);
 }finally{release();await context.close();}
});
