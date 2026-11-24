import {setupInsets,insetBox} from './journey-insets.mjs';
import {downloadJourneys,subsetTrip} from './journey-files.mjs';
import {mapCredit} from './journey-basemaps.mjs';
import {PosterPreview} from './journey-preview.mjs';
import {MapComposition} from './journey-composition.mjs';
import {parkAssets,posterLayout,EXPORT_SCALE} from './journey-poster.mjs';
import {installParkLayer} from './journey-parks.mjs';
import {RouteSketch} from './route-sketch.mjs';
import {mercator,fromMercator} from './route-data.mjs';
import {exportKML,downloadFile,safeFilename,escapeXML,exportJourneysKML} from './journey-kml.mjs';
import {t} from './journey-i18n.mjs';

const el=id=>document.getElementById(id),collection=features=>({type:'FeatureCollection',features});
const skins={fieldnotes:{paper:'#f4f0e3',ink:'#234534',muted:'#69735c',accent:'#b66e39'},midnight:{paper:'#142638',ink:'#f0f3e9',muted:'#a8c1c7',accent:'#e6b86b'},atlas:{paper:'#f7f7f3',ink:'#243942',muted:'#67797b',accent:'#d16a36'}};
function unwrap(points){let previous=points[0]?.[0]||0;return points.map(point=>{const lon=point[0]+360*Math.round((previous-point[0])/360);previous=lon;return [lon,point[1]];});}
function selectedItems(trips){return trips.flatMap(trip=>trip.items.map(item=>({...item,_color:trip.color||'#31765c'})));}
function featuresFor(trips,places) {
  return collection(selectedItems(trips).filter(item=>item.kind==='segment'||places).map(item=>({type:'Feature',properties:{name:item.name,color:item._color,mode:item.mode,important:!!item.important},geometry:{type:item.kind==='point'?'Point':'LineString',coordinates:item.kind==='point'?item.coordinates:unwrap(item.coordinates)}})));
}
function boundsFor(items) {
  const points=items.flatMap(item=>item.kind==='point'?[item.coordinates]:item.coordinates);if(!points.length)return [[-125,24],[-66,50]];
  const anchor=points[0][0];let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
  for(const point of points){const lon=point[0]+360*Math.round((anchor-point[0])/360);west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,point[1]);north=Math.max(north,point[1]);}
  return [[west-.03,Math.max(-85,south-.03)],[east+.03,Math.min(85,north+.03)]];
}
function cameraOf(map){
  if(map.map)return {center:map.map.getCenter().toArray(),zoom:map.map.getZoom(),bearing:map.map.getBearing(),pitch:map.map.getPitch(),bounds:map.map.getBounds().toArray(),height:map.map.getContainer().clientHeight};
  const s=map.sketch;if(!s?.center)return null;
  return {center:fromMercator(s.center),zoom:Math.log2(s.scale/512),bearing:0,pitch:0,height:s.h,bounds:[fromMercator([s.center[0]-s.origin[0]/s.scale,s.center[1]+(s.h-s.origin[1])/s.scale]),fromMercator([s.center[0]+(s.w-s.origin[0])/s.scale,s.center[1]-s.origin[1]/s.scale])]};
}
function cleanStyle(map) {
  const style=structuredClone(map.map.getStyle());
  style.layers=style.layers.filter(layer=>!layer.id.startsWith('studio-')||layer.id==='studio-buildings');
  for(const source of Object.keys(style.sources))if(source.startsWith('studio-'))delete style.sources[source];return style;
}
function routeLayers(map,data,parks,showParks) {
  map.addSource('print-routes',{type:'geojson',data});
  for(const plane of [false,true]){
    const filter=['all',['==',['geometry-type'],'LineString'],[plane?'==':'!=',['get','mode'],'plane']];
    for(const casing of [true,false])map.addLayer({id:`print-${plane?'flights':'roads'}-${casing?'casing':'line'}`,type:'line',source:'print-routes',filter,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':casing?'#fff9eb':['get','color'],'line-width':casing?8:4,...(plane?{'line-dasharray':casing?[2,2]:[4,4]}:{})}});
  }
  map.addLayer({id:'print-places',type:'circle',source:'print-routes',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':['get','color'],'circle-radius':['case',['get','important'],6,4],'circle-stroke-color':'#fffdf3','circle-stroke-width':2}});
  if(showParks)installParkLayer(map,parks,true,{source:'print-parks',layer:'print-parks',size:.65});
}
function text(ctx,value,x,y,size,color,{align='left',font='Arial',maxWidth}={}) {
  ctx.fillStyle=color;ctx.textAlign=align;ctx.font=`${size}px ${font}, "PingFang SC", sans-serif`;
  if(maxWidth)while(ctx.measureText(value).width>maxWidth&&size>17){size-=2;ctx.font=`${size}px ${font}, "PingFang SC", sans-serif`;}
  ctx.fillText(value,x,y);
}
function printGeometry(trips,options) {
  const layout=posterLayout(options.orientation),W=layout.width,H=layout.height,poster=options.format!=='map';
  const legendHeight=poster?Math.max(210,Math.ceil(trips.length/(layout.landscape?3:2))*62+100):0;
  return {layout,W,H,box:poster?{x:100,y:400,w:W-200,h:Math.max(600,H-520-legendHeight)}:{x:0,y:0,w:W,h:H-62}};
}
function paintMapPoster(canvas,trips,bitmap,{map,title='A journey to remember',orientation='portrait',format='poster',template='fieldnotes',language='en',pixelRatio=.5,composition={zoom:1,x:0,y:0},insetImages=[]},overview) {
  const layout=posterLayout(orientation),W=layout.width,H=layout.height,skin=skins[template]||skins.fieldnotes,poster=format==='poster',zh=language==='zh';
  const rows=Math.ceil(trips.length/(layout.landscape?3:2)),legendHeight=poster?Math.max(210,rows*62+100):0;
  const box=poster?{x:100,y:400,w:W-200,h:Math.max(600,H-520-legendHeight)}:{x:0,y:0,w:W,h:H-62};
    if(canvas.width!==W*pixelRatio)canvas.width=W*pixelRatio;if(canvas.height!==H*pixelRatio)canvas.height=H*pixelRatio;const ctx=canvas.getContext('2d');ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);ctx.fillStyle=skin.paper;ctx.fillRect(0,0,W,H);
    if(poster){
      ctx.strokeStyle=skin.muted+'66';ctx.lineWidth=2;ctx.strokeRect(40,40,W-80,H-80);
      text(ctx,zh?'玩嘚儿了~  /  沿途的故事':'W A N D E R L U S T   /   THE JOURNEY COLLECTION',W/2,135,25,skin.accent,{align:'center'});
      text(ctx,String(title).slice(0,80),W/2,260,88,skin.ink,{align:'center',font:template==='atlas'?'Arial':'Georgia',maxWidth:W-230});
      const items=selectedItems(trips),segments=items.filter(i=>i.kind==='segment').length,pins=items.length-segments;
      text(ctx,zh?`${trips.length} 个行程 · ${segments} 段路线 · ${pins} 个地点`:`${trips.length} journeys · ${segments} route segments · ${pins} saved places`,W/2,332,26,skin.muted,{align:'center'});
    }
    ctx.drawImage(bitmap,box.x,box.y,box.w,box.h);
    canvas._insetFrames=[];
    for(const inset of insetImages){const f=insetBox(box,inset.spec);ctx.save();ctx.shadowColor='#102b2755';ctx.shadowBlur=18;ctx.fillStyle=skin.paper;ctx.fillRect(f.x-6,f.y-6,f.w+12,f.h+12);ctx.shadowBlur=0;ctx.drawImage(inset.bitmap,f.x,f.y,f.w,f.h);ctx.strokeStyle=skin.ink;ctx.lineWidth=3;ctx.strokeRect(f.x,f.y,f.w,f.h);ctx.fillStyle=skin.paper+'ee';ctx.fillRect(f.x,f.y,f.w,48);text(ctx,inset.spec.label,f.x+16,f.y+33,25,skin.ink,{maxWidth:f.w-32});ctx.restore();canvas._insetFrames.push({id:inset.spec.id,x:f.x/W,y:f.y/H,w:f.w/W,h:f.h/H});}
    canvas.dataset.insets=JSON.stringify(insetImages.map(i=>i.spec));
    if(poster){
      ctx.strokeStyle=skin.muted+'66';ctx.lineWidth=2;ctx.strokeRect(box.x,box.y,box.w,box.h);
      const columns=layout.landscape?3:2,colWidth=(W-220)/columns,top=box.y+box.h+75;
      trips.forEach((trip,index)=>{const x=110+(index%columns)*colWidth,y=top+Math.floor(index/columns)*62;ctx.strokeStyle=trip.color||'#31765c';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(x,y-8);ctx.lineTo(x+44,y-8);ctx.stroke();text(ctx,trip.name,x+58,y,25,skin.ink,{maxWidth:colWidth-80});});
      text(ctx,zh?'每一条路线，都是一个故事。':'Every route holds a story.',W/2,H-115,27,skin.accent,{font:'Georgia',align:'center'});
    }
    const credit=mapCredit(map.theme,overview);
    text(ctx,credit,W/2,H-(poster?68:22),poster?18:22,skin.muted,{align:'center',maxWidth:W-150});
    canvas.setAttribute('aria-label',zh?'按当前缩放和位置构图的行程地图':'Journey map with the current scale and position');canvas.dataset.overview=String(overview);canvas.dataset.template=template;canvas.dataset.format=format;canvas.dataset.orientation=orientation;canvas._mapFrame={x:box.x/W,y:box.y/H,w:box.w/W,h:box.h/H};canvas.dataset.composition=JSON.stringify(composition);return {overview,width:canvas.width,height:canvas.height};
 }

let localContext;
// Keep logical dimensions and camera fixed across preview and download.
// Only the backing-store pixel ratio changes for a full-resolution image.
class MapPrintRenderer {
  constructor(trips,options,onFrame=()=>{}) {
    this.trips=trips;this.options={...options};this.onFrame=onFrame;this.ratio=.5;this.value={...options.composition};this.main=options.map;this.camera=cameraOf(this.main);this.geometry=options.insetGeometry||printGeometry(trips,options);this.insets=[];
    this.host=document.createElement('div');this.host.dataset.printMap='true';const {box}=this.geometry;Object.assign(this.host.style,{position:'fixed',left:'-30000px',top:'0',width:box.w+'px',height:box.h+'px',pointerEvents:'none'});this.host.setAttribute('aria-hidden','true');document.body.append(this.host);
  }
  async init(signal){await this.initMap(signal);if(this.disposed)return;for(const spec of this.options.insets||[]){const f=insetBox(this.geometry.box,spec),child=new MapPrintRenderer(this.trips,{...this.options,insets:[],inset:spec,insetGeometry:{box:{x:0,y:0,w:f.w,h:f.h}},composition:{zoom:1,x:0,y:0}},()=>this.emit());const inset={spec:{...spec},renderer:child};this.insets.push(inset);await child.initMap(signal);}this.emit();}
  async initMap(signal) {
    const [parks]=await parkAssets();signal?.throwIfAborted();
    if(this.main.map&&window.WebGL2RenderingContext) {
      try {
        const camera=this.camera;
        this.native=new window.maplibregl.Map({container:this.host,style:cleanStyle(this.main),center:camera.center,zoom:camera.zoom,bearing:camera.bearing,pitch:camera.pitch,pixelRatio:this.ratio,preserveDrawingBuffer:true,interactive:false,attributionControl:false,maplibreLogo:false,fadeDuration:0,maxCanvasSize:[8192,8192]});
        await this.wait('load',signal);signal?.throwIfAborted();
        routeLayers(this.native,featuresFor(this.trips,this.options.places),parks.parks,this.options.showParks);this.native.setProjection({type:!this.options.inset&&this.main.view==='globe'?'globe':'mercator'});
        const {box}=this.geometry,bounds=this.options.extent==='current'?camera.bounds:boundsFor(selectedItems(this.trips).filter(item=>item.kind==='segment'||this.options.places));
        if(this.options.inset){const i=this.options.inset;this.native.jumpTo({center:[i.lon,i.lat],zoom:i.zoom,bearing:0,pitch:0,padding:0});}else if(this.main.view==='globe') {
          const center=this.options.extent==='current'?camera.center:[(bounds[0][0]+bounds[1][0])/2,Math.max(-25,Math.min(25,(bounds[0][1]+bounds[1][1])/2))];
          const zoom=this.options.extent==='current'?camera.zoom+Math.log2(box.h/camera.height):Math.log2(Math.min(box.w,box.h)*.9*Math.PI*Math.cos(center[1]*Math.PI/180)/512);
          this.native.jumpTo({center,zoom,pitch:0,padding:0});
        }else this.native.fitBounds(bounds,{padding:75,duration:0,maxZoom:14,pitch:camera.pitch,bearing:camera.bearing});
        this.base={center:this.native.getCenter().toArray(),zoom:this.native.getZoom(),pitch:this.native.getPitch(),bearing:this.native.getBearing()};this.apply();
        await this.wait('idle',signal);signal?.throwIfAborted();this.native.on('render',()=>this.emit());this.emit();return;
      }catch(error){signal?.throwIfAborted();this.native?.remove();this.native=null;this.host.replaceChildren();}
    }
    this.overview=true;
    const data=await(localContext ||= fetch('data/atlas-context.geojson').then(r=>{if(!r.ok)throw new Error('The map could not be loaded. Please try again.');return r.json();}).catch(error=>{localContext=null;throw error;}));signal?.throwIfAborted();
    const canvas=document.createElement('canvas');this.host.append(canvas);const items=selectedItems(this.trips),o=this.options;
    const route={lines:items.filter(i=>i.kind==='segment').map(i=>({points:unwrap(i.coordinates),color:i._color,mode:i.mode})),stops:o.places?items.filter(i=>i.kind==='point').map(i=>({name:'',point:i.coordinates,color:i._color})):[],bounds:o.extent==='current'&&this.camera?this.camera.bounds:boundsFor(items.filter(i=>i.kind==='segment'||o.places))};
    this.sketch=new RouteSketch(canvas,route,()=>({top:75,bottom:75,left:75,right:75}),()=>{},()=>{});this.sketch.theme=this.main.theme;this.sketch.setContext(data);this.sketch.parkMarkers=parks.parks.map(park=>({point:mercator(park.coordinates)}));this.sketch.showNationalParks=o.showParks;
    if(o.inset){this.sketch.center=mercator([o.inset.lon,o.inset.lat]);this.sketch.scale=512*2**o.inset.zoom;this.sketch.origin=[this.sketch.w/2,this.sketch.h/2];}
    this.base={scale:this.sketch.scale,origin:[...this.sketch.origin]};cancelAnimationFrame(this.sketch.frame);this.sketch.frame=0;this.setRatio(.5);this.apply();this.emit();
  }
  wait(event,signal) {
    signal?.throwIfAborted();const map=this.native;
    return new Promise((resolve,reject)=>{
      const finish=error=>{clearTimeout(timer);map.off(event,done);signal?.removeEventListener('abort',abort);error?reject(error):resolve();},done=()=>finish(),abort=()=>finish(signal.reason||new DOMException('Cancelled','AbortError'));
      const timer=setTimeout(()=>finish(new Error('The map is still loading. Please try exporting again.')),14000);map.once(event,done);signal?.addEventListener('abort',abort,{once:true});if(event==='idle')map.triggerRepaint();
    });
  }
  setInset(spec){const entry=this.insets.find(i=>i.spec.id===spec.id);if(!entry)return;entry.spec={...spec};const child=entry.renderer;child.options.inset={...spec};if(child.native)child.base={center:[spec.lon,spec.lat],zoom:spec.zoom,pitch:0,bearing:0};else if(child.sketch){child.sketch.center=mercator([spec.lon,spec.lat]);child.base.scale=512*2**spec.zoom;}child.setComposition({zoom:1,x:0,y:0});this.emit();}
  panInset(id,dx,dy){const child=this.insets.find(i=>i.spec.id===id)?.renderer;if(!child)return;const {box}=child.geometry;let center;if(child.native){const c=child.native.unproject([box.w/2-dx*box.w,box.h/2-dy*box.h]);center=[c.lng,c.lat];}else{const s=child.sketch;center=fromMercator([s.center[0]-dx*box.w/s.scale,s.center[1]+dy*box.h/s.scale]);}return {lon:((center[0]+540)%360)-180,lat:center[1]};}
  setComposition(value){this.value={...value};if(this.frame||this.disposed)return;this.frame=requestAnimationFrame(()=>{this.frame=0;this.apply();if(this.sketch)this.emit();});}
  flush(){cancelAnimationFrame(this.frame);this.frame=0;this.apply();}
  apply(){
    if(this.disposed||!this.base)return;const {zoom,x,y}=this.value,{box}=this.geometry,dx=box.w*x/100,dy=box.h*y/100;
    if(this.native)this.native.jumpTo({...this.base,zoom:this.base.zoom+Math.log2(zoom),padding:{left:Math.max(0,2*dx),right:Math.max(0,-2*dx),top:Math.max(0,2*dy),bottom:Math.max(0,-2*dy)}});
    else if(this.sketch){this.sketch.scale=this.base.scale*zoom;this.sketch.origin=[this.base.origin[0]+dx,this.base.origin[1]+dy];this.sketch.draw();}
    this.appliedValue={...this.value};
  }
  setRatio(ratio){this.ratio=ratio;if(this.native)this.native.setPixelRatio(ratio);else if(this.sketch){const s=this.sketch;s.dpr=ratio;s.canvas.width=Math.round(s.w*ratio);s.canvas.height=Math.round(s.h*ratio);s.draw();}}
  emit(){if(!this.disposed&&!this.exporting)this.onFrame(this);}
  paint(canvas,ratio=.5){paintMapPoster(canvas,this.trips,this.native?this.native.getCanvas():this.sketch.canvas,{...this.options,pixelRatio:ratio,composition:this.appliedValue||this.value,insetImages:this.insets.filter(i=>i.renderer.native||i.renderer.sketch).map(i=>({spec:i.spec,bitmap:i.renderer.native?i.renderer.native.getCanvas():i.renderer.sketch.canvas}))},!!this.overview);}
  async export(canvas,ratio,signal){
    this.exporting=true;this.flush();for(const i of this.insets){i.renderer.exporting=true;i.renderer.flush();}
    try{signal?.throwIfAborted();await Promise.all([this,...this.insets.map(i=>i.renderer)].map(async r=>{r.setRatio(ratio);if(r.native)await r.wait('idle',signal);}));signal?.throwIfAborted();this.paint(canvas,ratio);}
    finally{this.exporting=false;if(!this.disposed){this.setRatio(.5);for(const i of this.insets){i.renderer.exporting=false;i.renderer.setRatio(.5);}if(this.sketch)this.emit();}}
  }
  dispose(){this.disposed=true;for(const i of this.insets)i.renderer.dispose();cancelAnimationFrame(this.frame);if(this.sketch){cancelAnimationFrame(this.sketch.frame);this.sketch.canvas.width=this.sketch.canvas.height=1;}this.native?.remove();this.host.remove();}
}
export async function renderJourneyMap(canvas,trips,options={}) {
  const settings={format:'poster',orientation:'portrait',places:true,composition:{zoom:1,x:0,y:0},...options},renderer=new MapPrintRenderer(trips,settings);
  try{await renderer.init(options.signal);await renderer.export(canvas,options.pixelRatio||1,options.signal);return {overview:!!renderer.overview,width:canvas.width,height:canvas.height};}finally{renderer.dispose();}
}
export {exportJourneysKML} from './journey-kml.mjs';

export function setupMapExport({map,playback,getWorkspace,getTrip}) {
  let orientation='portrait',template='fieldnotes',generation=0,request,timer,exporting=false,renderer;
  const composition=new MapComposition(el('map-print-viewport'),el('map-print-canvas'),()=>{if(renderer&&!exporting)renderer.setComposition(composition.value);});
  const preview=new PosterPreview(el('map-print-viewport'),el('map-print-canvas'),el('map-print-zoom-level'),{enabled:()=>composition.mode==='preview'});
  const selectedTrips=()=>el('map-print-scope').value==='all'?getWorkspace().trips:el('map-print-scope').value==='visible'?getWorkspace().trips.filter(trip=>trip.visible!==false):[getTrip()];
  const trips=()=>selectedTrips().map(trip=>subsetTrip(trip,el('map-print-scope').value==='visible'?trip.items.filter(i=>i.visible!==false):trip.items));
  const insets=setupInsets({getCamera:()=>cameraOf(map)||{center:[-98,38],zoom:3},onChange:spec=>renderer?.setInset(spec),onStructure:()=>queue()});insets.bindPreview(el('map-print-viewport'),el('map-print-canvas'),()=>renderer);
  const options=()=>({map,insets:structuredClone(insets.specs),title:el('map-print-title').value,orientation,format:el('map-print-format').value,template,extent:el('map-print-extent').value,places:el('map-print-places').checked,showParks:el('map-print-parks').checked,language:getWorkspace().language,composition:{...composition.value}});
  const busy=value=>{for(const id of ['download-map-jpg','download-map-png','download-map-kml'])el(id).disabled=value||!trips().length;};
  function refresh(){const size=orientation==='portrait'?'4800 × 6000':'6000 × 4800';el('map-print-size').textContent=size+' JPG / PNG';el('map-print-summary').textContent=t('{count} journeys selected. KML includes routes and saved places.',{count:trips().length});composition.refresh();}
  async function paint(){
    if(!el('map-export-dialog').open||exporting)return;const token=++generation;request?.abort();request=new AbortController();busy(true);refresh();
    if(!trips().length){el('map-print-status').textContent=t('No journeys are checked. Choose another export selection or check a journey on the map.');el('map-print-canvas').getContext('2d').clearRect(0,0,el('map-print-canvas').width,el('map-print-canvas').height);return;}
    el('map-print-status').textContent=t('Preparing your map print…');
    try{
      const settings=options();renderer?.dispose();const next=new MapPrintRenderer(structuredClone(trips()),settings,r=>{if(token!==generation||!el('map-export-dialog').open)return;r.paint(el('map-print-canvas'));preview.paint();});renderer=next;
      await next.init(request.signal);if(token!==generation)return;next.setComposition(composition.value);el('map-print-status').textContent=t(next.overview?'The detailed map is unavailable. A local overview is shown.':'');busy(false);
    }catch(error){if(token===generation&&error.name!=='AbortError'){el('map-print-status').textContent=t(error.message);busy(true);}}
  }
  function queue(){clearTimeout(timer);request?.abort();generation++;renderer?.dispose();renderer=null;busy(true);timer=setTimeout(paint,120);}

  el('open-map-export').addEventListener('click',()=>{playback.pause();el('map-print-title').value=getTrip().name;el('map-print-parks').checked=getWorkspace().showNationalParks;el('map-print-scope').value='visible';insets.refresh();el('map-export-dialog').showModal();paint().then(()=>preview.fit());});
  el('map-export-dialog').addEventListener('close',()=>{clearTimeout(timer);request?.abort();generation++;renderer?.dispose();renderer=null;});
  for(const id of ['map-print-title','map-print-scope','map-print-extent','map-print-format','map-print-places','map-print-parks'])el(id).addEventListener(id==='map-print-title'?'input':'change',queue);
  for(const button of document.querySelectorAll('[data-map-template]'))button.addEventListener('click',()=>{template=button.dataset.mapTemplate;for(const b of document.querySelectorAll('[data-map-template]'))b.setAttribute('aria-pressed',String(b===button));queue();});
  for(const button of document.querySelectorAll('[data-map-orientation]'))button.addEventListener('click',()=>{orientation=button.dataset.mapOrientation;for(const b of document.querySelectorAll('[data-map-orientation]'))b.setAttribute('aria-pressed',String(b===button));preview.fit();queue();});
  for(const button of document.querySelectorAll('[data-map-interaction]'))button.addEventListener('click',()=>{composition.setMode(button.dataset.mapInteraction);preview.fit();});
  el('map-print-zoom-in').addEventListener('click',()=>preview.scale(1.25));el('map-print-zoom-out').addEventListener('click',()=>preview.scale(.8));el('map-print-fit').addEventListener('click',()=>preview.fit());
  for(const format of ['jpg','png'])el('download-map-'+format).addEventListener('click',async()=>{
    if(exporting||!trips().length||!renderer)return;exporting=true;composition.locked=true;insets.setLocked(true);clearTimeout(timer);request?.abort();request=new AbortController();const controller=request,activeRenderer=renderer,settings=options();activeRenderer.value={...composition.value};busy(true);el('map-print-status').textContent=t('Rendering full-resolution image…');
    const print=document.createElement('canvas');
    try{await activeRenderer.export(print,EXPORT_SCALE,controller.signal);const result={overview:activeRenderer.overview};const blob=await new Promise(resolve=>print.toBlob(resolve,format==='jpg'?'image/jpeg':'image/png',.96));controller.signal.throwIfAborted();if(!blob)throw new Error('The map could not be exported. Please try again.');downloadFile(blob,safeFilename(settings.title||'journey-map')+'.'+format);el('map-print-status').textContent=t(result.overview?'The detailed map is unavailable. A local overview is shown.':'');}catch(error){if(error.name!=='AbortError')el('map-print-status').textContent=t(error.message);}finally{print.width=print.height=1;exporting=false;composition.locked=false;insets.setLocked(false);if(controller.signal.aborted&&el('map-export-dialog').open){clearTimeout(timer);paint();}else busy(false);}
  });
  el('map-file-format').addEventListener('change',()=>el('download-map-kml').textContent=t('Export '+(el('map-file-format').value==='geojson'?'GeoJSON':el('map-file-format').value.toUpperCase())));
  el('download-map-kml').addEventListener('click',async()=>{try{el('download-map-kml').disabled=true;await downloadJourneys(structuredClone(trips()),el('map-file-format').value,el('map-print-title').value);}catch(error){el('map-print-status').textContent=t(error.message);}finally{el('download-map-kml').disabled=!trips().length;}});
  return {refresh:()=>{if(el('map-export-dialog').open)queue();}};
}
