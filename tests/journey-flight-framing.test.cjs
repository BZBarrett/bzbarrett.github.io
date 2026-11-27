const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-webgl']});});
after(async()=>browser?.close());
const base=process.env.STUDIO_URL||'http://127.0.0.1:8770';
const cases=[
  {name:'domestic',start:[-83.92,35.96],end:[-82.55,35.59],option:'Direct planning sketch',width:1.37,minZoom:7},
  {name:'Pacific',start:[139.78,35.55],end:[-122.31,47.45],option:'Direct planning sketch',width:97.91,minZoom:1.8},
  {name:'long connection',start:[-73.778,40.641],end:[103.99,1.364],option:'Plan via Shanghai',width:182.232,minZoom:1},
  {name:'reverse connection',start:[103.99,1.364],end:[-73.778,40.641],option:'Plan via Shanghai',width:182.232,minZoom:1}
];
for(const view of ['2d','globe','canvas'])test(`real flight search, selection and save frame the route (${view})`,async()=>{
  const context=await browser.newContext({viewport:{width:1360,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.addInitScript(fallback=>{
      localStorage.setItem('wanderlust-studio-v1',JSON.stringify({version:1,activeTrip:'flight',trips:[{id:'flight',name:'Flight',items:[]},{id:'remote',name:'Other journey',items:[{id:'far',kind:'point',name:'Remote place',coordinates:[20,-35]}]}]}));
      if(fallback)Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined});
    },view==='canvas');
    await page.route('https://tiles.openfreemap.org/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'flight-test',type:'background',paint:{'background-color':'#e7ede6'}}]}}));
    await page.goto(base+'/journey-studio.html');
    await page.evaluate(async()=>{const {JourneyMap}=await import('/js/journey-map.mjs'),fit=JourneyMap.prototype.fit;JourneyMap.prototype.fit=function(...args){window.flightMap=this;return fit.apply(this,args);};document.querySelector('#map-fit').click();});
    await page.waitForFunction(()=>(flightMap.sketch||flightMap.ready)&&!flightMap.opening&&!flightMap.themeLoading);
    if(view==='globe'){await page.evaluate(()=>flightMap.setView('globe'));await page.waitForFunction(()=>!flightMap.map.isMoving());}
    const frame=async()=>{
      await page.waitForFunction(()=>!flightMap.map?.isMoving());
      return page.evaluate(()=>{
        const m=flightMap,points=m.fitCoordinates,pixels=points.map(p=>m.projectCoordinate(p)),w=m.map?.getContainer().clientWidth||m.sketch.w,h=m.map?.getContainer().clientHeight||m.sketch.h,bounds=m.bounds(points);
        return {width:bounds[1][0]-bounds[0][0],polar:points.some(p=>Math.abs(p[1])>85),zoom:m.map?.getZoom()??Math.log2(m.sketch.scale/512),hidden:pixels.filter(p=>!p||p[0]<-1||p[0]>w+1||p[1]<-1||p[1]>h+1).length,span:(Math.max(...pixels.filter(Boolean).map(p=>p[0]))-Math.min(...pixels.filter(Boolean).map(p=>p[0])))/w,center:m.map?.getCenter().toArray()};
      });
    };
    for(const flight of cases){
      await page.locator('#new-trip').click();
      for(const [key,p]of [['start',flight.start],['end',flight.end]]){
        await page.locator('#'+key+'-query').fill(`${p[1]}, ${p[0]}`);await page.locator('[data-search='+key+']').click();
        await page.waitForFunction(({key,value})=>document.getElementById(key+'-query').value===value,{key,value:`${p[1].toFixed(5)}, ${p[0].toFixed(5)}`});
      }
      await page.locator('#segment-mode input[value=plane]').check();await page.locator('#find-routes').click();
      await page.getByRole('button',{name:'Add selected segment'}).waitFor();
      const searched=await frame();
      // The direct New York–Singapore arc exceeds Mercator's latitude limit.
      // Globe must show it all; the selected Shanghai connection stays below 80°.
      if(view!=='2d'||!searched.polar)assert.equal(searched.hidden,0,JSON.stringify({flight:flight.name,searched}));
      if(flight.name==='domestic')assert.ok(searched.zoom>flight.minZoom);
      await page.locator('.route-option').filter({hasText:flight.option}).click();
      const selected=await frame();
      assert.ok(Math.abs(selected.width-flight.width)<.01,JSON.stringify({flight:flight.name,selected}));
      assert.equal(selected.hidden,0,JSON.stringify({flight:flight.name,selected}));
      assert.ok(selected.span>.2&&selected.zoom>flight.minZoom,JSON.stringify({flight:flight.name,selected}));
      await page.getByRole('button',{name:'Add selected segment'}).click();
      await page.waitForFunction(()=>document.querySelector('#save-status').textContent.startsWith('Saved'));
      const saved=await frame();assert.equal(saved.hidden,0,JSON.stringify({flight:flight.name,saved}));assert.ok(Math.abs(saved.width-flight.width)<.01);assert.ok(saved.span>.2&&saved.zoom>flight.minZoom,JSON.stringify({flight:flight.name,saved}));
    }
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});
