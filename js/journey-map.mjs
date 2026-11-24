import {mapThemes,rasterThemes,rasterStyle,updateMapCredit} from './journey-basemaps.mjs';
import {translatedStatus} from './journey-i18n.mjs';
import {RouteSketch} from './route-sketch.mjs';
import {mercator,fromMercator} from './route-data.mjs';
import {installParkLayer} from './journey-parks.mjs';
import {t} from './journey-i18n.mjs';
const collection=features=>({type:'FeatureCollection',features});
function unwrap(points) {let previous=points[0]?.[0]||0;return points.map(p=>{let lon=p[0];while(lon-previous>180)lon-=360;while(lon-previous< -180)lon+=360;previous=lon;return [lon,...p.slice(1)];});}
export class JourneyMap {
  constructor(onPick,onEdit) {this.items=[];this.options=[];this.selected=-1;this.onPick=onPick;this.onEdit=onEdit;this.picking=false;this.map=null;this.sketch=null;this.ready=false;this.units='imperial';this.theme='liberty';this.view='2d';this.themeGeneration=0;this.notice=document.getElementById('map-notice');}
  async open() {
    const host=document.getElementById('studio-map'),canvas=document.getElementById('studio-fallback');
    const context=fetch('data/atlas-context.geojson').then(r=>r.json()).catch(()=>collection([]));
    try {
      await import('./vendor/maplibre-gl-5.12.0.js');
      if(!window.WebGL2RenderingContext)throw new Error('WebGL unavailable');
      const map=this.map=new window.maplibregl.Map({container:host,style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#dce5d8'}}]},center:[-98,38],zoom:3.2,attributionControl:false,maplibreLogo:false,maxPitch:65});
      this.scale=new window.maplibregl.ScaleControl({maxWidth:110,unit:this.units});map.addControl(this.scale,'bottom-right');
      map.on('style.load',()=>{this.baseSky=map.getSky();this.ready=true;this.layers();this.update(this.items,this.options,this.selected);this.applyView(false);});
      map.on('render',()=>this.onFrame?.());map.on('dragstart',()=>this.onUserPan?.());
      map.on('click','studio-parks',event=>{if(this.picking||!event.features?.length)return;const park=this.parks?.find(park=>park.id===event.features[0].properties.id);if(!park)return;const content=document.createElement('div');content.className='park-popup';const name=document.createElement('strong');name.textContent=park.name;const state=document.createElement('span');state.textContent=park.state;const link=document.createElement('a');link.textContent=t('National Park Service');link.href=park.url;link.target='_blank';link.rel='noopener';content.append(name,state,link);this.parkPopup?.remove();this.parkPopup=new window.maplibregl.Popup({offset:14,className:'studio-park-popup'}).setLngLat(event.lngLat).setDOMContent(content).addTo(map);});
      map.on('click',event=>{if(this.view==='globe'){const screen=map.project(event.lngLat);if(!Number.isFinite(screen.x)||Math.hypot(screen.x-event.point.x,screen.y-event.point.y)>5)return;}if(this.picking){this.onPick([((event.lngLat.lng+540)%360)-180,event.lngLat.lat]);return;}if(this.showNationalParks&&map.getLayer('studio-parks')&&map.queryRenderedFeatures(event.point,{layers:['studio-parks']}).length)return;const playback=this.onPlaybackPick?.([event.point.x,event.point.y]);if(playback){this.onEdit(playback.id,playback.tripId);return;}const features=map.queryRenderedFeatures(event.point,{layers:['studio-points','studio-lines','studio-flights'].filter(id=>map.getLayer(id))});if(features[0]?.properties?.id)this.onEdit(features[0].properties.id,features[0].properties.tripId);});
      map.getCanvas().addEventListener('webglcontextlost',()=>this.fallback(context));
      map.on('error',()=>{this.report('Some map tiles are unavailable. Your itinerary is still editable.');});
      this.context=await context;await this.setTheme(this.theme,true);
      new ResizeObserver(()=>this.map?.resize()).observe(host.parentElement);
    }catch{await this.fallback(context);}
  }
  async fallback(context) {
    if(this.sketch)return;
    this.map?.remove();this.map=null;this.scale=null;this.ready=false;
    const canvas=document.getElementById('studio-fallback');canvas.hidden=false;document.getElementById('studio-map').hidden=true;
    this.sketch=new RouteSketch(canvas,{lines:[],stops:[],bounds:[[-125,24],[-66,50]]},()=>({top:105,left:45,right:45,bottom:document.querySelector('.studio-map-panel').classList.contains('has-playback')?210:100}),index=>{if(this.picking)return;const item=this.visibleNodes?.[index];if(item)this.onEdit(item.id,item.tripId);},()=>this.onUserPan?.());
    this.sketch.onDraw=()=>this.onFrame?.();this.sketch.playbackTripId=this.playbackTripId;this.sketch.playbackTripIds=this.playbackTripIds;this.setNationalParks(this.parks||[],!!this.showNationalParks);
    this.sketch.setContext(await context);this.setTheme(this.theme);this.report(this.view!=='2d'?'3D and globe need WebGL. This device uses a 2D overview.':'Map overview · live WebGL map unavailable. Drag to pan and use + / − to zoom.');document.getElementById('studio-map').dataset.view='2d';document.querySelector('.studio-map-panel').classList.remove('globe-view');document.dispatchEvent(new Event('studio-map-fallback'));
    let down;
    canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
    canvas.addEventListener('pointerup',e=>{if(!this.picking||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const rect=canvas.getBoundingClientRect(),s=this.sketch;const point=fromMercator([s.center[0]+(e.clientX-rect.left-s.origin[0])/s.scale,s.center[1]+(e.clientY-rect.top-s.origin[1])/s.scale]);this.onPick([((point[0]+540)%360)-180,Math.max(-90,Math.min(90,point[1]))]);});
    new ResizeObserver(()=>this.sketch.resize()).observe(canvas.parentElement);this.update(this.items,this.options,this.selected);this.fit();
  }
  layers() {
    const map=this.map;if(!map||map.getSource('studio-data'))return;
    map.addSource('studio-data',{type:'geojson',data:collection([])});map.addSource('studio-options',{type:'geojson',data:collection([])});
    map.addLayer({id:'studio-options',type:'line',source:'studio-options',filter:['!=',['get','mode'],'plane'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['case',['get','selected'],'#bf6427','#6c8585'],'line-width':['case',['get','selected'],5,3],'line-opacity':['case',['get','selected'],.95,.45]}});
    map.addLayer({id:'studio-selection',type:'line',source:'studio-data',filter:['all',['==',['geometry-type'],'LineString'],['==',['get','selected'],true]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffb32f','line-width':15,'line-opacity':.65}});
    map.addLayer({id:'studio-casing',type:'line',source:'studio-data',filter:['all',['==',['geometry-type'],'LineString'],['!=',['get','mode'],'plane']],paint:{'line-color':'#fff9eb','line-width':7}});
    map.addLayer({id:'studio-lines',type:'line',source:'studio-data',filter:['all',['==',['geometry-type'],'LineString'],['!=',['get','mode'],'plane']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','color'],'#be6029'],'line-width':3.5}});
    map.addLayer({id:'studio-flight-options',type:'line',source:'studio-options',filter:['==',['get','mode'],'plane'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['case',['get','selected'],'#bf6427','#6c8585'],'line-width':4,'line-dasharray':[3.5,3.5],'line-opacity':['case',['get','selected'],.95,.45]}});
    const flightFilter=['all',['==',['geometry-type'],'LineString'],['==',['get','mode'],'plane']];
    map.addLayer({id:'studio-flight-casing',type:'line',source:'studio-data',filter:flightFilter,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff9eb','line-width':7,'line-dasharray':[2,2]}});
    map.addLayer({id:'studio-flights',type:'line',source:'studio-data',filter:flightFilter,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','color'],'#be6029'],'line-width':3.5,'line-dasharray':[4,4]}});
    map.addLayer({id:'studio-points',type:'circle',source:'studio-data',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':['coalesce',['get','color'],'#244638'],'circle-radius':['case',['get','important'],9,6],'circle-stroke-color':['case',['==',['get','selected'],true],'#ffae20','#fff9e9'],'circle-stroke-width':['case',['==',['get','selected'],true],6,2.5]}});
    const star=new Uint8Array(32*32*4);
    // A local star sprite keeps important nodes distinct even when fonts are offline.
    const icon=document.createElement('canvas');icon.width=icon.height=32;const ctx=icon.getContext('2d');ctx.fillStyle='#fffaf0';ctx.beginPath();for(let i=0;i<10;i++){const angle=-Math.PI/2+i*Math.PI/5,r=i%2?5:11;const x=16+Math.cos(angle)*r,y=16+Math.sin(angle)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();star.set(ctx.getImageData(0,0,32,32).data);map.addImage('studio-star',{width:32,height:32,data:star});
    map.addLayer({id:'studio-stars',type:'symbol',source:'studio-data',filter:['all',['==',['geometry-type'],'Point'],['==',['get','important'],true]],layout:{'icon-image':'studio-star','icon-size':.65,'icon-allow-overlap':true}});
    this.applyPlaybackVisibility();
    installParkLayer(map,this.parks||[],!!this.showNationalParks);
  }
  setNationalParks(parks,visible) {
    this.parks=parks;this.showNationalParks=visible;if(!visible)this.parkPopup?.remove();
    if(this.map&&this.ready)installParkLayer(this.map,parks,visible);
    if(this.sketch){this.sketch.parkMarkers=parks.map(park=>({name:park.name,point:mercator(park.coordinates)}));this.sketch.showNationalParks=visible;this.sketch.drawSoon();}
  }
  setPlaybackJourney(tripId) {
    const ids=Array.isArray(tripId)?tripId:tripId?[tripId]:[];if(JSON.stringify(this.playbackTripIds||[])===JSON.stringify(ids))return;this.playbackTripIds=ids;this.playbackTripId=ids[0]||null;this.applyPlaybackVisibility();
  }
  applyPlaybackVisibility() {
    const map=this.map,hidden=this.playbackTripIds||[];const visibleFilter=['!', ['in',['get','tripId'],['literal',hidden]]];
    const selectedFilter=['all',['==',['geometry-type'],'LineString'],['==',['get','selected'],true]];if(this.playbackTripId)selectedFilter.push(visibleFilter);if(map?.getLayer('studio-selection'))map.setFilter('studio-selection',selectedFilter);
    for(const [ids,plane]of [[['studio-casing','studio-lines'],false],[['studio-flight-casing','studio-flights'],true]]){
      const filter=['all',['==',['geometry-type'],'LineString'],[plane?'==':'!=',['get','mode'],'plane']];
      if(this.playbackTripId)filter.push(visibleFilter);
      for(const id of ids)if(map?.getLayer(id))map.setFilter(id,filter);
    }
    for(const id of ['studio-options','studio-flight-options'])if(map?.getLayer(id))map.setLayoutProperty(id,'visibility',this.playbackTripId?'none':'visible');
    if(this.sketch){this.sketch.playbackTripId=this.playbackTripId;this.sketch.playbackTripIds=this.playbackTripIds;this.sketch.drawSoon();}
  }
  update(items,options=[],selected=-1) {
    this.items=items;this.options=options;this.selected=selected;
    const features=[],nodes=[];
    for(const item of items){
      if(item.kind==='point')nodes.push({id:item.id,name:item.name,coordinates:item.coordinates,important:!!item.important,color:item._color,selected:!!item._selected,tripId:item._tripId});
      else{features.push({type:'Feature',properties:{id:item.id,mode:item.mode,color:item._color,selected:!!item._selected,tripId:item._tripId},geometry:{type:'LineString',coordinates:unwrap(item.coordinates)}});for(const node of [item.startNode,item.endNode])if(node)nodes.push({...node,id:item.id,color:item._color,selected:!!item._selected,tripId:item._tripId});}
    }
    features.push(...nodes.map(n=>({type:'Feature',properties:{id:n.id,name:n.name,important:!!n.important,color:n.color,selected:!!n.selected,tripId:n.tripId},geometry:{type:'Point',coordinates:n.coordinates}})));this.visibleNodes=nodes;
    if(this.map&&this.ready){this.map.getSource('studio-data')?.setData(collection(features));this.map.getSource('studio-options')?.setData(collection(options.map((o,i)=>({type:'Feature',properties:{selected:i===selected,mode:o.mode||'car'},geometry:{type:'LineString',coordinates:unwrap(o.coordinates)}}))));}
    if(this.sketch){const s=this.sketch,lines=[...items.filter(i=>i.kind==='segment'),...options.filter((_,i)=>i===selected).map(option=>({...option,option:true}))].map(i=>({points:unwrap(i.coordinates),color:i._color,selected:!!i._selected,mode:i.mode,tripId:i._tripId,option:i.option}));s.route={lines,stops:nodes.map(n=>({name:(n.important?'★ ':'')+n.name,point:n.coordinates})),bounds:this.bounds()};s.paths=lines.map(l=>l.points.map(mercator));s.stops=s.route.stops.map((n,i)=>({name:n.name,point:mercator(n.point),color:nodes[i].color,selected:nodes[i].selected}));s.area=s.route.bounds.map(mercator);s.selected=-1;s.drawSoon();}
  }
  bounds(points) {
    const coords=points||[...this.items.flatMap(i=>i.kind==='point'?[i.coordinates]:i.coordinates),...this.options.flatMap(o=>o.coordinates)];
    if(!coords.length)return [[-125,24],[-66,50]];
    const first=coords[0][0],flat=coords.map(p=>[p[0]+360*Math.round((first-p[0])/360),p[1]]);let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity;for(const p of flat){w=Math.min(w,p[0]);s=Math.min(s,p[1]);e=Math.max(e,p[0]);n=Math.max(n,p[1]);}if(w===e){w-=.02;e+=.02;}if(s===n){s-=.02;n+=.02;}return [[w,Math.max(-85,s)],[e,Math.min(85,n)]];
  }
  fit(points,{duration=600}={}) {const bounds=this.bounds(points);if(this.map)this.map.fitBounds(bounds,{padding:{top:105,left:55,right:70,bottom:document.querySelector('.studio-map-panel').classList.contains('has-playback')?210:110},maxZoom:13,duration});if(this.sketch){this.sketch.area=bounds.map(mercator);this.sketch.free=false;this.sketch.resize();}}
  zoom(delta) {if(this.map)this.map.zoomTo(this.map.getZoom()+delta);if(this.sketch)this.sketch.zoom(delta);}
  unwrapPlaybackCoordinates(coordinates) {
    const points=unwrap([...coordinates].reverse()).reverse();
    const center=this.map?.getCenter().lng??(this.sketch?.center?fromMercator(this.sketch.center)[0]:0);
    const shift=360*Math.round((center-points.at(-1)[0])/360);
    return points.map(point=>[point[0]+shift,point[1]]);
  }
  projectCoordinate(coordinate,wrap=true) {
    if(this.map){
      const map=this.map,center=map.getCenter().lng,point=[coordinate[0]+(wrap?360*Math.round((center-coordinate[0])/360):0),coordinate[1]];
      const pixel=map.project(point);if(!Number.isFinite(pixel.x)||!Number.isFinite(pixel.y))return null;
      if(this.view==='globe') {const inverse=map.unproject(pixel),lonError=Math.abs(((inverse.lng-coordinate[0]+540)%360)-180);if(lonError>.05||Math.abs(inverse.lat-coordinate[1])>.05)return null;}
      return [pixel.x,pixel.y];
    }
    if(this.sketch?.center){const point=mercator(coordinate);if(wrap)point[0]+=Math.round(this.sketch.center[0]-point[0]);return this.sketch.pixel(point);}
    return null;
  }
  followPlayback(coordinate,immediate=false) {
    // Playback supplies a new center each frame. Repeated easing makes the
    // camera lag, accelerate and catch up. Leave user zoom/rotation animations
    // alone; otherwise apply this frame's center without changing its zoom.
    if(this.map&&(immediate||!this.map.isMoving()))this.map.jumpTo({center:coordinate,padding:{top:100,bottom:210,left:45,right:45}});
    if(this.sketch?.center){const point=mercator(coordinate);point[0]+=Math.round(this.sketch.center[0]-point[0]);this.sketch.center=point;this.sketch.free=true;this.sketch.drawSoon();}
  }
  requestPlaybackFrame() {
    if(this.map)this.map.triggerRepaint();
    else if(this.sketch)this.sketch.drawSoon();
    else this.onFrame?.();
  }
  report(message) {translatedStatus(this.notice,message);}
  async setTheme(theme,force=false) {
    const previous=this.theme;this.theme=mapThemes.includes(theme)?theme:'liberty';
    document.getElementById('studio-map').dataset.theme=this.theme;
    if(this.sketch){updateMapCredit(this.theme,true);this.sketch.theme=this.theme;this.sketch.drawSoon();return true;}
    if(!this.map||(!force&&previous===this.theme))return true;
    const map=this.map,generation=++this.themeGeneration;this.themeRequest?.abort();const request=this.themeRequest=new AbortController();this.report('Loading map theme…');
    try {
      let style=rasterStyle(this.theme);if(!style){const response=await fetch('https://tiles.openfreemap.org/styles/'+this.theme,{signal:AbortSignal.any([request.signal,AbortSignal.timeout(12000)])});if(!response.ok)throw new Error();style=await response.json();}
      if(generation!==this.themeGeneration||this.map!==map)return false;
      this.ready=false;map.setStyle(style,{diff:false});updateMapCredit(this.theme);this.report('');return true;
    }catch{
      if(request.signal.aborted||generation!==this.themeGeneration||this.map!==map)return false;
      if(force){updateMapCredit(this.theme,true);if(this.context&&!map.getSource('local-land')){map.addSource('local-land',{type:'geojson',data:this.context});map.addLayer({id:'local-land',type:'fill',source:'local-land',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':'#e6e8d9','fill-outline-color':'#a9b9a4'}},map.getLayer('studio-lines')?'studio-lines':undefined);}this.report('Offline overview · search and road routing need an internet connection.');}
      else{this.theme=previous;updateMapCredit(previous);document.getElementById('studio-map').dataset.theme=previous;this.report('Map theme unavailable. Keeping the current map.');}
      return false;
    }
  }
  setView(view) {
    const previous=this.view;this.view=['2d','3d','globe'].includes(view)?view:'2d';
    this.applyView();if(this.view==='globe'&&previous!=='globe')this.globeOverview();
  }
  globeOverview(animate=true) {
    if(!this.map)return;
    const host=this.map.getContainer(),latitude=Math.max(-25,Math.min(25,this.map.getCenter().lat));
    const diameter=Math.max(150,Math.min(host.clientWidth-90,host.clientHeight-125));
    const zoom=Math.max(-1,Math.min(2.2,Math.log2(diameter*Math.PI*Math.cos(latitude*Math.PI/180)/512)));
    this.map.easeTo({center:[this.map.getCenter().lng,latitude],zoom,pitch:0,bearing:0,padding:{top:65,bottom:35,left:20,right:20},duration:animate?700:0});
  }
  applyView(animate=true) {
    const map=this.map;
    if(!map){if(this.sketch)this.report(this.view!=='2d'?'3D and globe need WebGL. This device uses a 2D overview.':'Map overview · live WebGL map unavailable. Drag to pan and use + / − to zoom.');return;}
    document.getElementById('studio-map').dataset.view=this.view;
    const globe=this.view==='globe',three=this.view==='3d';document.querySelector('.studio-map-panel').classList.toggle('globe-view',globe);
    if(this.ready){
      const projection=globe?'globe':'mercator';if(map.getProjection()?.type!==projection)map.setProjection({type:projection});
      map.setSky(globe?{'sky-color':'#152d43','horizon-color':'#a5cbdc','atmosphere-blend':.75}:this.baseSky||{});
      const style=map.getStyle();let buildings=style.layers.filter(layer=>layer.type==='fill-extrusion');
      if(three&&!buildings.length){const source=Object.entries(style.sources).find(([,source])=>source.type==='vector');if(source){
        map.addLayer({id:'studio-buildings',type:'fill-extrusion',source:source[0],'source-layer':'building',minzoom:14,paint:{'fill-extrusion-color':this.theme==='dark'?'#667c90':'#b7b6a5','fill-extrusion-height':['coalesce',['get','render_height'],8],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.8}},map.getLayer('studio-casing')?'studio-casing':undefined);buildings=[{id:'studio-buildings'}];
      }}
      for(const layer of buildings)map.setLayoutProperty(layer.id,'visibility',three?'visible':'none');
    }
    if(three||globe){map.dragRotate.enable();map.touchZoomRotate.enableRotation();}else{map.dragRotate.disable();map.touchZoomRotate.disableRotation();}
    map.easeTo({pitch:three?55:0,bearing:three||globe?map.getBearing():0,...(!globe?{padding:0}:{}),duration:animate?550:0});
    if(globe)this.report('');else if(three)this.report(rasterThemes[this.theme]?'3D view · right-drag to tilt / rotate.':'3D view · right-drag to tilt / rotate; zoom in for buildings.');else if(/^(3D view|Globe view)/.test(this.notice.dataset.message||''))this.report('');
  }
  setUnits(units) {this.units=units==='metric'?'metric':'imperial';this.scale?.setUnit(this.units);}
  pick(value) {this.picking=value;if(this.map)this.map.getCanvas().style.cursor=value?'crosshair':'';if(this.sketch)this.sketch.canvas.style.cursor=value?'crosshair':'';}
}
