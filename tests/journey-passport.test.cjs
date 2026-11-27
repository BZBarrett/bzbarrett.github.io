const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {chromium}=require('playwright');
const base=process.env.STUDIO_URL||'http://127.0.0.1:8770';
let browser;
before(async()=>{browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-webgl']});});
after(async()=>{await browser?.close();});
async function setup(){
  const context=await browser.newContext({viewport:{width:1500,height:1050}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>Object.defineProperty(window,'WebGL2RenderingContext',{value:undefined}));
  await page.goto(base+'/journey-studio.html');
  await page.waitForFunction(()=>document.querySelector('#save-status').textContent!=='Opening your local notebook…');
  return {context,page,errors};
}
async function ready(page,template='passport'){
  await page.waitForFunction(template=>!document.querySelector('#export-poster').disabled&&document.querySelector('#park-poster').dataset.template===template,template);
}
async function cover(page){
  await page.locator('#open-bucket').click();await ready(page,'fieldnotes');
  await page.locator('button[data-template=passport]').click();await ready(page);
}
function jpegSize(bytes){
  for(let offset=2;offset<bytes.length;){if(bytes[offset]!==255){offset++;continue;}
    const marker=bytes[offset+1],length=bytes.readUInt16BE(offset+2);
    if([0xc0,0xc1,0xc2].includes(marker))return [bytes.readUInt16BE(offset+7),bytes.readUInt16BE(offset+5)];
    offset+=length+2;
  }throw Error('JPEG size not found');
}

test('every supplied park icon maps to one park and loads only when the badge template is used',async()=>{
  const {context,page}=await setup();try{
    const requests=[];page.on('request',r=>{if(/park-icons|park-badges/.test(r.url()))requests.push(r.url());});
    await page.locator('#open-bucket').click();await ready(page,'fieldnotes');assert.equal(requests.length,0);
    await page.locator('button[data-template=passport]').click();await ready(page);
    const mapping=await page.evaluate(async()=>{
      const [{parks},{icons}]=await Promise.all(['national-parks','park-icons'].map(file=>fetch('/data/'+file+'.json').then(r=>r.json())));
      return {count:parks.length,ids:parks.map(p=>p.id),icons};
    });
    assert.equal(mapping.count,64);assert.deepEqual(Object.keys(mapping.icons).sort(),mapping.ids.sort());
    assert.equal(new Set(Object.values(mapping.icons).map(i=>i.src)).size,64);
    assert.equal(mapping.icons.hosp.source,'33-hot-springs-v2.png');
    assert.equal(requests.filter(url=>url.includes('park-badges/')).length,64);
    const before=requests.length;await page.locator('#park-checklist input[value=grsm]').check();await ready(page);
    assert.equal(requests.length,before,'decoded artwork is reused after changing visits');
  }finally{await context.close();}
});

test('all badge artwork stays within the poster and grayscale reflects visits in both layouts and mixed mode',async()=>{
  const {context,page}=await setup();try{
    const results=await page.evaluate(async()=>{
      const {renderPoster}=await import('/js/journey-poster.mjs'),{parks}=await fetch('/data/national-parks.json').then(r=>r.json());
      const results=[];
      for(const orientation of ['portrait','landscape'])for(const mode of ['parks','states','mixed']){
        const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d'),draw=ctx.drawImage.bind(ctx),fill=ctx.fillText.bind(ctx),badges=[],labels=[];
        ctx.drawImage=(image,x,y,w,h)=>{badges.push({color:image instanceof HTMLImageElement,x,y,w,h});draw(image,x,y,w,h);};
        ctx.fillText=(value,...args)=>{labels.push(value);fill(value,...args);};
        await renderPoster(canvas,mode==='mixed'?{parks:['acad','grsm'],states:['47','06']}:mode==='states'?['47','06']:['acad','grsm'],'Our wild places',{template:'passport',orientation,mode});
        const pixels=badges.map(b=>[...ctx.getImageData(Math.round(b.x+b.w/2),Math.round(b.y+b.h*.4),1,1).data]);
        results.push({orientation,mode,count:badges.length,colors:badges.map(b=>b.color),gray:pixels.filter((_,i)=>!badges[i].color).every(([r,g,b])=>Math.abs(r-g)<=1&&Math.abs(g-b)<=1),color:pixels.some(([r,g,b],i)=>badges[i].color&&Math.max(r,g,b)-Math.min(r,g,b)>10),within:badges.every(b=>b.x>80&&b.x+b.w<canvas.width-80&&b.y>580&&b.y+b.h<canvas.height-160),states:canvas.getAttribute('aria-label').includes('state'),aria:canvas.getAttribute('aria-label')});
        canvas.width=canvas.height=1;
      }return results;
    });
    for(const r of results){assert.equal(r.count,r.mode==='mixed'?114:r.mode==='states'?50:64);assert.equal(r.colors.filter(Boolean).length,r.mode==='mixed'?4:2);assert.ok(r.gray&&r.color&&r.within,JSON.stringify(r));assert.match(r.aria,r.mode==='states'?/2 of 50/:/2 of 64/);}
  }finally{await context.close();}
});

test('passport selection persists, translates, supports mixed visits and falls back cleanly for other collections',async()=>{
  const {context,page,errors}=await setup();try{
    await cover(page);await page.locator('#park-checklist input[value=grsm]').check();await ready(page);
    await page.locator('#bucket-states').click();await ready(page);assert.equal(await page.locator('button[data-template=passport]').isVisible(),true);
    await page.locator('#park-checklist input[value="47"]').check();await ready(page);
    await page.locator('#bucket-countries').click();await ready(page,'fieldnotes');assert.equal(await page.locator('button[data-template=passport]').isVisible(),false);
    assert.equal(await page.locator('img[src*="world-passport"]').count(),0);
    await page.locator('#bucket-mixed').click();await ready(page);
    assert.equal(await page.locator('#park-checklist input[value=grsm]').isChecked(),true);
    assert.equal(await page.locator('#park-checklist input[value="47"]').isChecked(),true);
    await page.locator('[data-close=bucket-dialog]').click();
    await page.locator('#open-settings').click();await page.locator('[data-language=zh]').click();await page.locator('[data-close=settings-dialog]').last().click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('wanderlust-studio-v1')).posterTemplate==='passport');
    await page.reload();await page.locator('#open-bucket').click();await ready(page);
    assert.match(await page.locator('button[data-template=passport]').textContent(),/公园与州徽章/);
    assert.match(await page.locator('#park-poster').getAttribute('aria-label'),/已探索 1 \/ 64/);
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const thumbnail=await page.locator('button[data-template=passport] img').evaluate(i=>i.complete&&i.naturalWidth>0);assert.ok(thumbnail);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

for(const orientation of ['portrait','landscape'])test(`passport JPEG matches the selected visits and full-resolution ${orientation} layout`,async()=>{
  const {context,page,errors}=await setup();try{
    await cover(page);await page.locator('#park-checklist input[value=grsm]').check();await page.locator('button[data-orientation='+orientation+']').click();await ready(page);
    const spec=await page.locator('#park-poster').evaluate(c=>c._posterRender);
    const waiting=page.waitForEvent('download');await page.locator('#export-poster').click();const file=await waiting,bytes=await fs.readFile(await file.path());
    assert.deepEqual(jpegSize(bytes),orientation==='portrait'?[4800,6000]:[6000,4800]);
    assert.equal(spec.options.template,'passport');assert.equal(spec.options.orientation,orientation);assert.deepEqual(spec.visited,['grsm']);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

test('missing artwork blocks incomplete downloads and can be retried without losing visits',async()=>{
  const {context,page,errors}=await setup();try{
    await page.route('**/park-badges/grsm.webp',r=>r.abort());
    await page.locator('#open-bucket').click();await ready(page,'fieldnotes');
    await page.locator('#park-checklist input[value=grsm]').check();await ready(page,'fieldnotes');
    await page.locator('button[data-template=passport]').click();
    await page.waitForFunction(()=>document.querySelector('#poster-status').textContent.includes('icons could not'));
    assert.equal(await page.locator('#export-poster').isDisabled(),true);
    await page.unroute('**/park-badges/grsm.webp');await page.locator('button[data-template=passport]').click();await ready(page);
    assert.equal(await page.locator('#park-checklist input[value=grsm]').isChecked(),true);assert.deepEqual(errors,[]);
  }finally{await context.close();}
});

 test('state artwork maps all 50 FIPS IDs, loads lazily and retries missing images',async()=>{
  const {context,page,errors}=await setup();try{
    const requests=[];page.on('request',r=>{if(/state-icons|state-badges/.test(r.url()))requests.push(r.url());});
    await page.route('**/state-badges/47.webp',r=>r.abort());
    await page.locator('#open-bucket').click();await ready(page,'fieldnotes');
    await page.locator('#bucket-states').click();await ready(page,'fieldnotes');assert.equal(requests.length,0);
    await page.locator('#park-checklist input[value="47"]').check();
    await page.locator('button[data-template=passport]').click();
    await page.waitForFunction(()=>document.querySelector('#poster-status').textContent.includes('state icons could not'));
    assert.ok(await page.locator('#export-poster').isDisabled());
    await page.unroute('**/state-badges/47.webp');await page.locator('button[data-template=passport]').click();await ready(page);
    const mapping=await page.evaluate(async()=>{const [{icons},geo,{stateChecklist}]=await Promise.all([fetch('/data/state-icons.json').then(r=>r.json()),fetch('/data/us-states.geojson').then(r=>r.json()),import('/js/journey-poster.mjs')]);return {icons,ids:stateChecklist(geo).map(s=>s.id)};});
    assert.deepEqual(Object.keys(mapping.icons).sort(),mapping.ids.sort());assert.equal(mapping.ids.length,50);assert.equal(mapping.icons['47'].source,'42-tennessee.png');
    assert.equal(new Set(Object.values(mapping.icons).map(i=>i.src)).size,50);
    const before=requests.length;await page.locator('#park-checklist input[value="06"]').check();await ready(page);assert.equal(requests.length,before);
    await page.locator('button[data-orientation=landscape]').click();await ready(page);
    const waiting=page.waitForEvent('download');await page.locator('#export-poster').click();const file=await waiting;assert.deepEqual(jpegSize(await fs.readFile(await file.path())),[6000,4800]);
    assert.deepEqual(errors,[]);
  }finally{await context.close();}
 });
