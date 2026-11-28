const {dismissFolderPrompt}=require('./helpers/folder-prompt.cjs');
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-webgl']});});
after(async()=>browser?.close());
const base=process.env.STUDIO_URL||'http://127.0.0.1:8770';
function fixture(count=4,dense=3){
  return {version:1,activeTrip:'motion',trips:[{id:'motion',name:'Motion check',visible:true,color:'#2c8068',items:Array.from({length:count},(_,i)=>({
    id:'route-'+i,name:'Route '+i,kind:'segment',mode:count>4?'car':['car','train','walk','plane'][i],start:'2025-01-01',
    coordinates:Array.from({length:dense},(_,v)=>[-120+(i%20)*2+v/(dense-1),30+Math.floor(i/20)*2+Math.sin(v/(dense-1)*Math.PI*6)*.04])
  }))}],visited:[],units:'imperial',updatedAt:1};
}
async function setup(view='2d',data=fixture()){
  const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({data,fallback})=>{localStorage.setItem('wanderlust-studio-v1',JSON.stringify(data));if(fallback)Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined});},{data,fallback:view==='canvas'});
  await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'base',type:'background',paint:{'background-color':'#e7ede6'}}]}}));
  await page.goto(base+'/journey-studio.html');await dismissFolderPrompt(page);
  await page.waitForFunction(()=>!document.querySelector('#play-journey').disabled);
  await page.evaluate(async()=>{const {JourneyPlayback}=await import('/js/journey-playback.mjs'),advance=JourneyPlayback.prototype.advance;JourneyPlayback.prototype.advance=function(...args){window.__player=this;return advance.apply(this,args);};});
  if(view==='globe'){await page.locator('#open-settings').click();await page.locator('[data-map-view=globe]').click();await page.locator('[data-close=settings-dialog]').last().click();}
  await page.locator('#play-journey').click();await page.locator('#player-toggle').click();
  await page.waitForFunction(()=>window.__player?.state==='paused');
  return {context,page,errors};
}
test('transport speed ratios hold across route lengths; rate changes preserve position',async()=>{
  const {context,page,errors}=await setup();try{
    const result=await page.evaluate(async()=>{
      const {playbackPlan,playbackFrame,PLAYBACK_METERS_PER_SECOND,PLAYBACK_RATES}=await import('/js/journey-playback.mjs');
      const {distance}=await import('/js/journey-routes.mjs');
      const items=['car','train','walk','plane'].map((mode,i)=>({id:mode,kind:'segment',mode,coordinates:[[0,0],[.01*10**i,0]]}));
      items.push({id:'polar',kind:'segment',mode:'plane',coordinates:[[-100,25],[-20,75]]});
      const original=JSON.stringify(items),plan=playbackPlan(items);
      const traveled=plan.segments.map(s=>{const dt=Math.min(.001,s.duration/10);const a=playbackFrame(plan,s.offset+s.duration*.4),b=playbackFrame(plan,s.offset+s.duration*.4+dt);return distance(a.position,b.position)/dt;});
      const before=__player.elapsed;document.querySelector('#player-speed').value='32';document.querySelector('#player-speed').dispatchEvent(new Event('change'));
      return {speed:PLAYBACK_METERS_PER_SECOND,rates:PLAYBACK_RATES,speeds:plan.segments.map(s=>s.length/s.duration),traveled,immutable:JSON.stringify(items)===original,continuous:__player.elapsed===before,rate:__player.rate};
    });
    assert.equal(result.rates.length,8);assert.equal(result.rates[0],1);assert.equal(result.rates.at(-1),128);
    const expected=[1,1.5,.5,3,3].map(factor=>result.speed*factor);
    assert.ok(result.speeds.every((v,i)=>Math.abs(v-expected[i])<1e-8));
    assert.ok(result.traveled.every((v,i)=>Math.abs(v-expected[i])/expected[i]<.00001));
    assert.ok(result.immutable&&result.continuous);assert.equal(result.rate,32);
    assert.match(await page.locator('#player-speed option[value="1"]').textContent(),/mi\/s/);
    await page.locator('#open-settings').click();await page.locator('[data-units=metric]').click();await page.locator('[data-close=settings-dialog]').last().click();
    assert.match(await page.locator('#player-speed option[value="1"]').textContent(),/10 km\/s/);
    await page.evaluate(()=>{const flight=__player.plan.segments.find(s=>s.mode==='plane');__player.seek((flight.offset+flight.duration*.5)/__player.plan.total);});
    assert.match(await page.locator('#player-speed option[value="1"]').textContent(),/30 km\/s/);
    assert.match(await page.locator('#player-speed option[value="32"]').textContent(),/960 km\/s/);
    for(const [mode,speed]of [['train',15],['walk',5]]){
      await page.evaluate(mode=>{const s=__player.plan.segments.find(s=>s.mode===mode);__player.seek((s.offset+s.duration*.5)/__player.plan.total);},mode);
      assert.ok((await page.locator('#player-speed option[value="1"]').textContent()).endsWith(speed+' km/s'));
    }
    await page.evaluate(()=>__player.seek(0));
    assert.match(await page.locator('#player-speed option[value="1"]').textContent(),/10 km\/s/);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('mixed car and plane routes keep arrivals and video in sync at every playback rate',async()=>{
  const data=fixture();data.trips[0].items=[
    {id:'road',name:'Road',kind:'segment',mode:'car',coordinates:[[0,0],[2,0]]},
    {id:'flight',name:'Flight',kind:'segment',mode:'plane',coordinates:[[2,0],[4,0]],endNode:{name:'Landing',coordinates:[4,0],important:true}},
    {id:'midpoint',name:'Midflight',kind:'point',coordinates:[3,0],important:true}
  ];
  const {context,page,errors}=await setup('canvas',data);try{
    const result=await page.evaluate(async()=>{
      const {captureVideoSettings,JourneyVideoRenderer,videoTiming}=await import('/js/journey-video.mjs');
      const p=__player,[road,flight]=p.plan.segments,mid=p.plan.points.find(point=>point.name==='Midflight'),checks=[];
      for(const rate of [1,8,128]){
        p.rate=rate;const snapshot=captureVideoSettings(p.map,p,JSON.parse(localStorage.getItem('wanderlust-studio-v1'))),renderer=new JourneyVideoRenderer(snapshot,'landscape',{resolution:720,fps:24});
        try{
          await renderer.init();
          for(const fraction of [.25,.5,1]){
            const elapsed=flight.offset+flight.duration*fraction;p.seek(elapsed/p.plan.total);
            await renderer.render(elapsed/rate);
            checks.push({rate,fraction,live:p.frame.position,video:renderer.painter.frame.position,livePoints:p.map.playbackPoints.slice(0,p.map.playbackPointCount).map(point=>point.name),videoPoints:renderer.adapter.playbackPoints.slice(0,renderer.adapter.playbackPointCount).map(point=>point.name)});
          }
          const timing=videoTiming(snapshot.plan,rate,24);checks.push({rate,duration:timing.duration,expected:p.plan.total/rate+3});
        }finally{renderer.dispose();}
      }
      return {ratio:road.duration/flight.duration,offset:flight.offset,roadDuration:road.duration,midProgress:(mid.elapsed-flight.offset)/flight.duration,checks};
    });
    assert.ok(Math.abs(result.ratio-3)<1e-9);assert.equal(result.offset,result.roadDuration);assert.ok(Math.abs(result.midProgress-.5)<1e-9);
    for(const check of result.checks){
      if('duration' in check){assert.ok(Math.abs(check.duration-check.expected)<1e-8);continue;}
      assert.ok(check.video.every((v,i)=>Math.abs(v-check.live[i])<1e-8));assert.deepEqual(check.videoPoints,check.livePoints);
      assert.equal(check.livePoints.includes('Midflight'),check.fraction>=.5);assert.equal(check.livePoints.includes('Landing'),check.fraction===1);
    }
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('ground transport uses an always-visible location dot and upright flashing side-view sprites',async()=>{
  const {context,page,errors}=await setup('canvas');try{
    const result=await page.evaluate(async()=>{
      const {playbackIconOpacity}=await import('/js/journey-playback.mjs'),p=__player;
      await Promise.all(Object.values(p.images).map(i=>i.decode()));
      const sprite=p.sprite.bind(p),samples=[];p.sprite=function(mode,point,angle,size){const m=this.ctx.getTransform(),anchor=this.map.projectCoordinate(this.frame.position);samples.push({mode,angle,size,point:[m.e/m.a,m.f/m.d],anchor,alpha:this.ctx.globalAlpha});sprite(mode,point,angle,size);};
      for(let index=0;index<3;index++){const s=p.plan.segments[index];p.seek((s.offset+s.duration*.4)/p.plan.total);p.state='playing';p.draw();}
      const rgba=[...p.ctx.getImageData(Math.round(samples.at(-1).anchor[0]*p.dpr),Math.round(samples.at(-1).anchor[1]*p.dpr),1,1).data];
      p.pause();return {samples,rgba,period:[0,550,1100].map(t=>playbackIconOpacity(t)),reduced:playbackIconOpacity(550,true),aspect:[p.images.car.naturalWidth/p.images.car.naturalHeight,p.images.train.naturalWidth/p.images.train.naturalHeight]};
    });
    assert.deepEqual(result.samples.map(s=>s.mode),['car','train','walk']);assert.deepEqual(result.samples.map(s=>s.size),[38.4,43.2,38.4]);
    for(const s of result.samples){assert.equal(s.angle,0);assert.ok(Math.abs(s.point[1]-(s.anchor[1]-32))<1e-6);assert.ok(s.alpha>=.25&&s.alpha<=1);}
    assert.deepEqual(result.rgba,[44,128,104,255]);assert.deepEqual(result.period,[1,.25,1]);assert.equal(result.reduced,1);assert.ok(result.aspect.every(r=>r>1));
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

for(const view of ['2d','globe','canvas'])test(`late playback keeps a single animated segment and stable projection work across 160 dense routes (${view})`,async()=>{
  const data=fixture(160,512),{context,page,errors}=await setup(view,data);try{
    const result=await page.evaluate(async()=>{
      const p=__player;p.follow=false;p.map.onUserPan?.();
      const measure=index=>{
        const s=p.plan.segments[index];p.seek((s.offset+s.duration*.65)/p.plan.total);p.map.sketch?.draw();
        let calls=0;const project=p.map.projectCoordinate.bind(p.map);p.map.projectCoordinate=(...args)=>{calls++;return project(...args);};
        const start=performance.now();for(let i=0;i<12;i++)p.draw();const milliseconds=(performance.now()-start)/12;p.map.projectCoordinate=project;
        return {calls:calls/12,milliseconds,animated:p.routes.length,cursor:p.map.playbackCursor,paths:p.drawnRoutes.length,completed:p.map.completedRoutes?.count,fallbackCursor:p.map.sketch?.playbackCursor};
      };
      const first=measure(0),last=measure(159);
      p.seek(.1);const rewind=p.map.playbackCursor;p.seek(1);const stopped={routes:p.routes.length,raf:p.raf,hidden:p.map.playbackTripIds};
      return {first,last,rewind,stopped};
    });
    assert.equal(result.first.animated,1);assert.equal(result.last.animated,1);assert.equal(result.last.paths,1);
    assert.ok(result.last.calls<result.first.calls*2+50,JSON.stringify(result));assert.equal(result.last.cursor,159);assert.ok(result.rewind<159);
    if(view==='canvas')assert.equal(result.last.fallbackCursor,159);else assert.equal(result.last.completed,159);
    assert.equal(result.stopped.routes,0);assert.equal(result.stopped.raf,0);assert.deepEqual(result.stopped.hidden,[]);
    console.log(view,JSON.stringify({early:result.first.calls,late:result.last.calls,earlyMs:result.first.milliseconds,lateMs:result.last.milliseconds}));
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

for(const view of ['2d','globe'])test(`dense playback reuses map geometry and only paints changed routes (${view})`,async()=>{
  const {context,page,errors}=await setup(view,fixture(300,256));try{
    await page.waitForFunction(()=>__player.map.map.loaded()&&!__player.map.map.isMoving());
    const result=await page.evaluate(async()=>{
      const p=__player,m=p.map.map,source=m.getSource('studio-data');p.follow=false;
      let uploads=0,filters=0,states=0,renders=0,draws=0;const set=source.setData.bind(source),filter=m.setFilter.bind(m),state=m.setFeatureState.bind(m),draw=p.draw.bind(p);
      source.setData=(...args)=>{uploads++;return set(...args);};m.setFilter=(...args)=>{filters++;return filter(...args);};m.setFeatureState=(...args)=>{states++;return state(...args);};p.draw=()=>{draws++;draw();};m.on('render',()=>renders++);
      // Starting a new playback plan must not re-upload all static journeys.
      p.map.playbackPlan=null;const segment=p.plan.segments[150];p.seek((segment.offset+segment.duration*.5)/p.plan.total);const startUploads=uploads;
      await new Promise(r=>setTimeout(r,300));uploads=filters=states=renders=draws=0;p.play();await new Promise(r=>setTimeout(r,650));p.pause();
      const fixed={uploads,filters,renders,draws};uploads=filters=states=0;
      for(let i=150;i<170;i++){const s=p.plan.segments[i];p.seek((s.offset+s.duration*.5)/p.plan.total);}
      const transitions={uploads,filters,states};
      const completed=async()=>{if(!m.loaded())await new Promise(resolve=>m.once('idle',resolve));return (await m.getSource('studio-completed').getData()).features.map(f=>f.id);};
      const ids=await completed(),reached=[168,169,170].map(id=>!ids.includes(id));p.seek(.1);const rewound=!(await completed()).includes(168);p.exit();const restored=m.getLayoutProperty('studio-lines','visibility')!=='visible';
      return {startUploads,fixed,transitions,reached,rewound,restored};
    });
    assert.equal(result.startUploads,0);assert.equal(result.fixed.uploads,0);assert.equal(result.fixed.filters,0);assert.ok(result.fixed.draws>=10,JSON.stringify(result));assert.ok(result.fixed.renders<result.fixed.draws/3,JSON.stringify(result));
    assert.equal(result.transitions.uploads,0);assert.equal(result.transitions.filters,0);assert.ok(result.transitions.states<=21,JSON.stringify(result));assert.deepEqual(result.reached,[false,true,true]);assert.equal(result.rewound,true);assert.equal(result.restored,false);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

for(const view of ['2d','canvas'])test(`flight paths use 50 percent opacity in maps, animation and video (${view})`,async()=>{
  const {context,page,errors}=await setup(view);try{
    const result=await page.evaluate(async()=>{
      const p=__player,strokes=[],stroke=p.ctx.stroke.bind(p.ctx);p.ctx.stroke=(...args)=>{strokes.push({alpha:p.ctx.globalAlpha,dash:p.ctx.getLineDash()});return stroke(...args);};
      for(const mode of ['plane','car']){const s=p.plan.segments.find(s=>s.mode===mode);p.seek((s.offset+s.duration*.5)/p.plan.total);strokes.length=0;p.drawRoutes();if(mode==='plane')window.flightStrokes=[...strokes];else window.carStrokes=[...strokes];}
      const native=p.map.map?{flight:p.map.map.getPaintProperty('studio-flights','line-opacity'),casing:p.map.map.getPaintProperty('studio-flight-casing','line-opacity'),option:p.map.map.getPaintProperty('studio-flight-options','line-opacity')}:null;
      let fallback=null;if(p.map.sketch){const s=p.map.sketch,stroke=s.ctx.stroke.bind(s.ctx),alphas=[];s.ctx.stroke=(...args)=>{if(s.ctx.getLineDash().length)alphas.push(s.ctx.globalAlpha);return stroke(...args);};p.exit();p.map.fit();s.draw();fallback=alphas;}
      const {captureVideoSettings,JourneyVideoRenderer}=await import('/js/journey-video.mjs'),snapshot=captureVideoSettings(p.map,p,JSON.parse(localStorage.getItem('wanderlust-studio-v1'))),r=new JourneyVideoRenderer(snapshot,'landscape',{resolution:720,fps:24});
      try{await r.init();const s=snapshot.plan.segments.find(s=>s.mode==='plane');await r.render((s.offset+s.duration*.5)/snapshot.rate);const alphas=[],stroke=r.painter.ctx.stroke.bind(r.painter.ctx);r.painter.ctx.stroke=(...args)=>{alphas.push(r.painter.ctx.globalAlpha);return stroke(...args);};r.painter.drawRoutes();return {flight:flightStrokes,car:carStrokes,native,fallback,video:alphas,videoNative:r.native?.getPaintProperty('print-flights-line','line-opacity')};}finally{r.dispose();}
    });
    assert.equal(result.flight.length,1);assert.equal(result.flight[0].alpha,.5);assert.ok(result.flight[0].dash.length);assert.ok(result.car.every(s=>s.alpha===1&&s.dash.length===0));assert.deepEqual(result.video,[.5]);
    if(view==='2d'){assert.deepEqual(result.native,{flight:.5,casing:0,option:.5});assert.equal(result.videoNative,.5);}else assert.ok(result.fallback.length>0&&result.fallback.every(a=>a===.5));assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('dense paths simplify only for display and retain the exact animation endpoint',async()=>{
  const {context,page}=await setup('canvas');try{
    const result=await page.evaluate(async()=>{
      const {playbackPlan,playbackFrame,activePlaybackCoordinates}=await import('/js/journey-playback.mjs');
      const coordinates=Array.from({length:30000},(_,i)=>[179+i/29999*2,30+Math.sin(i/29999*Math.PI*6)*.1]),original=JSON.stringify(coordinates);
      const plan=playbackPlan([{id:'dense',kind:'segment',mode:'car',coordinates}]),frame=playbackFrame(plan,plan.total*.9),display=activePlaybackCoordinates(frame,512*2**5);
      return {count:display.length,head:display.at(-1),position:frame.position,original:coordinates.length,unchanged:JSON.stringify(coordinates)===original};
    });
    assert.ok(result.count<300);assert.deepEqual(result.head,result.position);assert.equal(result.original,30000);assert.ok(result.unchanged);
  }finally{await context.close();}
});
