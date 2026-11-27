const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-webgl']});});
after(async()=>browser?.close());
const base=process.env.STUDIO_URL||'http://127.0.0.1:8770';
const segment=(id,mode,start,x)=>({id,kind:'segment',name:id,mode,start,coordinates:[[x,35],[x+.2,35.1],[x+.4,35]]});
const queue=()=>({version:1,activeTrip:'first',trips:[
  {id:'second',name:'Second',color:'#bb6842',items:[segment('same','plane','2025-02',-119.2),segment('last','walk','2025-02',-118.8)]},
  {id:'first',name:'First',color:'#2c8068',items:[segment('same','car','2025-01',-120),segment('next','train','2025-01',-119.6)]}
]});
async function setup(view,data){
  const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({data,fallback})=>{localStorage.setItem('wanderlust-studio-v1',JSON.stringify(data));if(fallback)Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined});},{data,fallback:view==='canvas'});
  await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'base',type:'background',paint:{'background-color':'#e7ede6'}}]}}));
  await page.goto(base+'/journey-studio.html');await page.waitForFunction(()=>!document.querySelector('#play-checked-journeys').disabled);
  await page.evaluate(async()=>{const {JourneyPlayback}=await import('/js/journey-playback.mjs'),advance=JourneyPlayback.prototype.advance;JourneyPlayback.prototype.advance=function(...args){window.player=this;return advance.apply(this,args);};document.querySelector('#play-checked-journeys').click();player.pause();player.seek(0);});
  await page.waitForFunction(()=>(player.map.sketch||player.map.ready)&&!player.map.opening&&!player.map.themeLoading);
  await page.evaluate(()=>{window.mapFailures=[];player.map.map?.on('error',e=>mapFailures.push(e.error?.message||String(e)));});
  if(view==='globe'){await page.evaluate(()=>player.map.setView('globe'));await page.waitForFunction(()=>!player.map.map.isMoving());}
  await page.evaluate(()=>{const m=player.map;if(m.map)m.map.jumpTo({zoom:5,pitch:0,bearing:0});else{m.sketch.scale=512*2**5;m.sketch.free=true;}player.follow=true;player.seek(0);});
  return {context,page,errors};
}
async function snapshot(page){
  await page.waitForFunction(()=>!player.map.map||player.map.map.loaded()&&!player.map.cameraFramePending);
  return page.evaluate(async()=>{
    const p=player,m=p.map.map,s=p.map.sketch;
    if(m){const data=await m.getSource('studio-completed').getData();return {completed:data.features.map(f=>[f.properties.tripId,f.properties.id]),base:m.queryRenderedFeatures({layers:['studio-lines','studio-flights']}).length,painted:[...new Set(m.queryRenderedFeatures({layers:['studio-completed-lines','studio-completed-flights']}).map(f=>f.id))].sort((a,b)=>a-b),active:p.routes.length,center:m.getCenter().toArray(),position:p.frame.position};}
    let strokes=0;const stroke=s.ctx.stroke.bind(s.ctx);s.ctx.stroke=(...args)=>{if(Math.abs(s.ctx.lineWidth-3.6)<1e-4)strokes++;return stroke(...args);};s.draw();s.ctx.stroke=stroke;
    return {completed:(s.playbackPathIndices||[]).map(i=>[s.route.lines[i].tripId,s.route.lines[i].id]),painted:strokes,active:p.routes.length};
  });
}
for(const view of ['2d','globe','canvas'])test(`continuous follow hides every route first and reveals only traveled geometry (${view})`,async()=>{
  const {context,page,errors}=await setup(view,queue());try{
    const empty=await snapshot(page);assert.deepEqual(empty.completed,[]);assert.equal(empty.active,0);assert.deepEqual(empty.painted,view==='canvas'?0:[]);if(view!=='canvas')assert.equal(empty.base,0);
    const expected=[['first','same'],['first','next'],['second','same']];
    for(const index of [1,2,3]){
      await page.evaluate(index=>{const s=player.plan.segments[index];player.seek((s.offset+s.duration*.25)/player.plan.total);},index);
      const state=await snapshot(page);assert.deepEqual(state.completed,expected.slice(0,index));assert.equal(state.active,1);
      if(view==='canvas')assert.equal(state.painted,index);else{assert.equal(state.base,0);assert.deepEqual(state.painted,Array.from({length:index},(_,i)=>i));assert.ok(state.center.every((n,i)=>Math.abs(n-state.position[i])<1e-8));}
    }
    await page.evaluate(()=>player.seek(0));const rewind=await snapshot(page);assert.deepEqual(rewind.completed,[]);assert.deepEqual(rewind.painted,view==='canvas'?0:[]);
    await page.evaluate(()=>{const s=player.plan.segments[2];player.seek((s.offset+s.duration*.5)/player.plan.total);document.querySelector('#play-checked-journeys').click();player.pause();});
    const replay=await snapshot(page);assert.deepEqual(replay.completed,[]);assert.equal(replay.active,0);
    await page.evaluate(()=>player.exit());
    if(view!=='canvas'){await page.waitForFunction(()=>player.map.map.loaded());const restored=await page.evaluate(()=>{const m=player.map.map;return {visibility:m.getLayoutProperty('studio-lines','visibility'),ids:[...new Set(m.queryRenderedFeatures({layers:['studio-lines','studio-flights']}).map(f=>f.id))]};});assert.equal(restored.visibility,'visible');assert.equal(restored.ids.length,4);assert.ok(restored.ids.every(id=>typeof id==='string'&&id.includes('same')||typeof id==='string'&&id.includes('next')||typeof id==='string'&&id.includes('last')));}
    assert.deepEqual(await page.evaluate(()=>mapFailures),[]);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

for(const view of ['2d','globe'])test(`camera follow keeps future geometry out of the renderer and reuses simplified completed routes (${view})`,async()=>{
  const items=Array.from({length:300},(_,i)=>({id:'route-'+i,kind:'segment',name:'Route '+i,mode:'car',coordinates:Array.from({length:256},(_,j)=>[-120+(i%20)*2+j/255,30+Math.floor(i/20)*2+Math.sin(j/255*Math.PI*6)*.04])}));
  const data={version:1,activeTrip:'dense',trips:[{id:'dense',name:'Dense routes',color:'#2c8068',items}]};
  const {context,page,errors}=await setup(view,data);try{
    await page.evaluate(()=>{const s=player.plan.segments[240];player.seek((s.offset+s.duration*.25)/player.plan.total);});
    await page.waitForFunction(()=>player.map.map.loaded()&&!player.map.cameraFramePending);
    const result=await page.evaluate(async()=>{
      const p=player,m=p.map.map,source=m.getSource('studio-completed'),before=await source.getData(),original=p.plan.segments.slice(0,240).reduce((n,s)=>n+s.coordinates.length,0);
      const vertices=before.features.reduce((n,f)=>n+f.geometry.coordinates.length,0);let fullUpdates=0,diffs=0,baseUpdates=0;
      const set=source.setData.bind(source),update=source.updateData.bind(source),base=m.getSource('studio-data'),baseSet=base.setData.bind(base);
      source.setData=(...args)=>{fullUpdates++;return set(...args);};source.updateData=(...args)=>{diffs++;return update(...args);};base.setData=(...args)=>{baseUpdates++;return baseSet(...args);};
      const frames=[],onrender=()=>{if(p.state==='playing')frames.push({elapsed:p.frame.elapsed,pixel:p.map.projectCoordinate(p.frame.position)});};m.on('render',onrender);
      p.play();await new Promise(r=>setTimeout(r,800));p.pause();m.off('render',onrender);
      const elapsed=frames.map(f=>f.elapsed),pixels=frames.map(f=>f.pixel).filter(Boolean);
      return {count:before.features.length,vertices,original,fullUpdates,diffs,baseUpdates,frames:frames.length,positions:new Set(elapsed).size,drift:[0,1].map(axis=>Math.max(...pixels.map(p=>p[axis]))-Math.min(...pixels.map(p=>p[axis]))),raw:p.plan.segments[0].coordinates.length,future:before.features.some(f=>f.id>=240)};
    });
    assert.equal(result.count,240);assert.equal(result.future,false);assert.ok(result.vertices<result.original*.25,JSON.stringify(result));assert.equal(result.raw,256);
    assert.equal(result.baseUpdates,0);assert.equal(result.fullUpdates,0);assert.equal(result.diffs,0);assert.ok(result.positions>=10,JSON.stringify(result));assert.ok(result.drift.every(n=>n<.05),JSON.stringify(result));
    console.log('follow workload',view,JSON.stringify(result));assert.deepEqual(await page.evaluate(()=>mapFailures),[]);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

for(const view of ['2d','globe','canvas'])test(`disconnected journey boundaries ease the follow camera without changing zoom (${view})`,async()=>{
  const data=queue();data.trips[0].items[0].coordinates=[[140,35],[141,35]];data.trips[0].items[1].coordinates=[[141,35],[142,35]];
  const {context,page,errors}=await setup(view,data);try{
    const result=await page.evaluate(async()=>{
      const {playbackFrame,playbackCameraPosition}=await import('/js/journey-playback.mjs');const p=player,segment=p.plan.segments[2],previous=p.plan.segments[1].coordinates.at(-1),map=p.map.map;
      const centers=[],zoom=map?.getZoom()||p.map.sketch.scale;
      for(const delta of [0,.01,.1,.3,.6,.9,1]){p.elapsed=segment.offset+delta;p.advance();centers.push(map?map.getCenter().toArray():await import('/js/route-data.mjs').then(m=>m.fromMercator(p.map.sketch.center)));}
      const connected=playbackFrame(p.plan,p.plan.segments[1].offset+.01);
      return {centers,previous,position:p.frame.position,zoom,afterZoom:map?.getZoom()||p.map.sketch.scale,connected:playbackCameraPosition(p.plan,connected),connectedPosition:connected.position};
    });
    const delta=(a,b)=>Math.abs((a-b+540)%360-180);
    assert.ok(delta(result.centers[0][0],result.previous[0])<1e-6);assert.ok(delta(result.centers[1][0],result.previous[0])<.1);
    assert.ok(delta(result.centers.at(-1)[0],result.position[0])<1e-6);assert.equal(result.zoom,result.afterZoom);assert.deepEqual(result.connected,result.connectedPosition);
    for(let i=1;i<result.centers.length;i++)assert.ok(delta(result.centers[i][0],result.centers[i-1][0])<55,JSON.stringify(result.centers));
    await snapshot(page);assert.deepEqual(await page.evaluate(()=>mapFailures),[]);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('segment boundaries upload only additions/removals, including cached empty tiles',async()=>{
  const {context,page,errors}=await setup('2d',queue());try{
    await snapshot(page);
    const result=await page.evaluate(async()=>{
      const p=player,m=p.map.map,source=m.getSource('studio-completed'),set=source.setData.bind(source),update=source.updateData.bind(source);let full=0;const diffs=[];
      source.setData=(...args)=>{full++;return set(...args);};source.updateData=diff=>{diffs.push({add:diff.add?.length||0,remove:diff.remove?.length||0});return update(diff);};
      const wait=async()=>{while(!m.loaded())await new Promise(r=>setTimeout(r,20));};
      // First cache empty tiles away from every route, then append and rewind.
      m.jumpTo({center:[0,0]});await wait();
      for(const index of [1,2,3,0,2]){const s=p.plan.segments[index];p.seek((s.offset+s.duration*.6)/p.plan.total);await wait();}
      return {full,diffs,ids:(await source.getData()).features.map(f=>f.id).sort()};
    });
    assert.equal(result.full,0);assert.deepEqual(result.diffs,[{add:1,remove:0},{add:1,remove:0},{add:1,remove:0},{add:0,remove:3},{add:2,remove:0}]);assert.deepEqual(result.ids,[0,1]);assert.deepEqual(await page.evaluate(()=>mapFailures),[]);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

for(const view of ['2d','globe'])test(`dense continuous playback crosses journey and segment boundaries with incremental uploads (${view})`,async()=>{
  const items=Array.from({length:300},(_,i)=>({id:'route-'+i,kind:'segment',name:'Route '+i,mode:'car',coordinates:Array.from({length:256},(_,j)=>[-120+(i%20)*2+(i>=150?40:0)+j/255,30+Math.floor(i/20)*2+Math.sin(j/255*Math.PI*6)*.04])}));
  const data={version:1,activeTrip:'a',trips:[{id:'a',name:'2024',items:items.slice(0,150)},{id:'b',name:'2025',items:items.slice(150)}]};
  const {context,page,errors}=await setup(view,data);try{
    await page.evaluate(()=>{player.rate=8;const s=player.plan.segments[149];player.seek((s.offset+s.duration-.8)/player.plan.total);});await snapshot(page);
    const result=await page.evaluate(async()=>{
      const p=player,m=p.map.map,source=m.getSource('studio-completed'),set=source.setData.bind(source),update=source.updateData.bind(source);let full=0;const diffs=[],frames=[];
      source.setData=(...a)=>{full++;return set(...a);};source.updateData=diff=>{diffs.push(diff.add?.length||0);return update(diff);};
      const render=()=>frames.push({index:p.frame.index,center:m.getCenter().lng,time:performance.now()});m.on('render',render);p.play();await new Promise(r=>setTimeout(r,1500));p.pause();m.off('render',render);
      return {full,diffs,indices:[...new Set(frames.map(f=>f.index))],frames:frames.length,maxStep:Math.max(...frames.slice(1).map((f,i)=>Math.abs((f.center-frames[i].center+540)%360-180)))};
    });
    assert.equal(result.full,0);assert.ok(result.diffs.length>=2,JSON.stringify(result));assert.ok(result.diffs.every(n=>n===1));assert.ok(result.indices.includes(150)&&result.indices.includes(151),JSON.stringify(result));assert.ok(result.frames>=15);assert.ok(result.maxStep<30,JSON.stringify(result));console.log('dense boundary workload',view,JSON.stringify(result));assert.deepEqual(await page.evaluate(()=>mapFailures),[]);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
