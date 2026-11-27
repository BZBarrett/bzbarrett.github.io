import {setPlaybackPoints,applyPlaybackPoints} from './journey-arrival-layer.mjs';
import {locationFeatures} from './journey-location.mjs';
import {mapThemes,rasterThemes,rasterStyle,updateMapCredit} from './journey-basemaps.mjs';
import {translatedStatus} from './journey-i18n.mjs';
import {RouteSketch} from './route-sketch.mjs';
import {globeRouteCamera} from './journey-map-camera.mjs';
import {syncPlaybackRoutes} from './journey-playback-layer.mjs';
import {mercator,fromMercator} from './route-data.mjs';
import {installParkLayer} from './journey-parks.mjs';
import {t} from './journey-i18n.mjs';
const collection=features=>({type:'FeatureCollection',features});
function unwrap(points) {let previous=points[0]?.[0]||0;return points.map(p=>{let lon=p[0];while(lon-previous>180)lon-=360;while(lon-previous< -180)lon+=360;previous=lon;return [lon,...p.slice(1)];});}
export class JourneyMap {
  constructor(onPick,onEdit) {this.items=[];this.options=[];this.selected=-1;this.onPick=onPick;this.onEdit=onEdit;this.picking=false;this.map=null;this.sketch=null;this.ready=false;this.units='imperial';this.theme='positron';this.view='2d';this.themeGeneration=0;this.notice=document.getElementById('map-notice');}
  async open() {
    this.opening=true;
    const host=document.getElementById('studio-map'),canvas=document.getElementById('studio-fallback');
    const context=fetch('data/atlas-context.geojson').then(r=>r.json()).catch(()=>collection([]));
    try {
      await import('./vendor/maplibre-gl-5.12.0.js');
      if(!window.WebGL2RenderingContext)throw new Error('WebGL unavailable');
      const map=this.map=new window.maplibregl.Map({container:host,style:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#dce5d8'}}]},center:[-98,38],zoom:3.2,attributionControl:false,maplibreLogo:false,maxPitch:65});
      this.scale=new window.maplibregl.ScaleControl({maxWidth:110,unit:this.units});map.addControl(this.scale,'bottom-right');
      map.on('style.load',()=>{this.baseSky=map.getSky();this.ready=true;this.layers();this.update(this.items,this.options,this.selected);this.applyView(false);});
      map.on('move',()=>{this.cameraFramePending=true;});
      map.on('zoomend',()=>{if(this.playbackTripId)syncPlaybackRoutes(this);});
      map.on('render',()=>{this.cameraFramePending=false;cancelAnimationFrame(this.overlayFrame);this.overlayFrame=0;this.onFrame?.();});map.on('dragstart',()=>this.onUserPan?.());
      map.on('click','studio-parks',event=>{if(this.picking||!event.features?.length)return;const park=this.parks?.find(park=>park.id===event.features[0].properties.id);if(!park)return;const content=document.createElement('div');content.className='park-popup';const name=document.createElement('strong');name.textContent=park.name;const state=document.createElement('span');state.textContent=park.state;const link=document.createElement('a');link.textContent=t('National Park Service');link.href=park.url;link.target='_blank';link.rel='noopener';content.append(name,state,link);this.parkPopup?.remove();this.parkPopup=new window.maplibregl.Popup({offset:14,className:'studio-park-popup'}).setLngLat(event.lngLat).setDOMContent(content).addTo(map);});
      map.on('click',event=>{if(this.view==='globe'){const screen=map.project(event.lngLat);if(!Number.isFinite(screen.x)||Math.hypot(screen.x-event.point.x,screen.y-event.point.y)>5)return;}if(this.picking){this.onPick([((event.lngLat.lng+540)%360)-180,event.lngLat.lat]);return;}if(this.showNationalParks&&map.getLayer('studio-parks')&&map.queryRenderedFeatures(event.point,{layers:['studio-parks']}).length)return;const playback=this.onPlaybackPick?.([event.point.x,event.point.y]);if(playback){this.onEdit(playback.id,playback.tripId);return;}const features=map.queryRenderedFeatures(event.point,{layers:['studio-arrival-points','studio-points','studio-lines','studio-flights','studio-completed-lines','studio-completed-flights'].filter(id=>map.getLayer(id))});const feature=features.find(feature=>!feature.state?.rewound);if(feature?.properties?.id)this.onEdit(feature.properties.id,feature.properties.tripId);});
      map.getCanvas().addEventListener('webglcontextlost',()=>this.fallback(context));
      map.on('error',()=>{this.report('Some map tiles are unavailable. Your itinerary is still editable.');});
      this.context=await context;await this.setTheme(this.theme,true);
      new ResizeObserver(()=>this.map?.resize()).observe(host.parentElement);
    }catch{await this.fallback(context);}finally{this.opening=false;}
  }
  async fallback(context) {
    if(this.sketch)return;
    cancelAnimationFrame(this.overlayFrame);this.overlayFrame=0;this.cameraFramePending=false;
    this.map?.remove();this.map=null;this.scale=null;this.ready=false;
    const canvas=document.getElementById('studio-fallback');canvas.hidden=false;document.getElementById('studio-map').hidden=true;
    this.sketch=new RouteSketch(canvas,{lines:[],stops:[],bounds:[[-125,24],[-66,50]]},()=>({top:105,left:45,right:45,bottom:document.querySelector('.studio-map-panel').classList.contains('has-playback')?210:100}),index=>{if(this.picking)return;const item=this.visibleNodes?.[index];if(item)this.onEdit(item.id,item.tripId);},()=>this.onUserPan?.());
    this.sketch.onArrivalSelect=node=>{if(!this.picking)this.onEdit(node.id,node.tripId);};applyPlaybackPoints(this);this.sketch.onDraw=()=>this.onFrame?.();this.sketch.playbackTripId=this.playbackTripId;this.sketch.playbackTripIds=this.playbackTripIds;this.sketch.playbackCursor=this.playbackOrder?this.playbackCursor:undefined;this.setNationalParks(this.parks||[],!!this.showNationalParks);
    this.sketch.setContext(await context);this.setTheme(this.theme);this.report(this.view!=='2d'?'3D and globe need WebGL. This device uses a 2D overview.':'Map overview · live WebGL map unavailable. Drag to pan and use + / − to zoom.');document.getElementById('studio-map').dataset.view='2d';document.querySelector('.studio-map-panel').classList.remove('globe-view');document.dispatchEvent(new Event('studio-map-fallback'));
    let down;
    canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
    canvas.addEventListener('pointerup',e=>{if(!this.picking||!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const rect=canvas.getBoundingClientRect(),s=this.sketch;const point=fromMercator([s.center[0]+(e.clientX-rect.left-s.origin[0])/s.scale,s.center[1]+(e.clientY-rect.top-s.origin[1])/s.scale]);this.onPick([((point[0]+540)%360)-180,Math.max(-90,Math.min(90,point[1]))]);});
    new ResizeObserver(()=>this.sketch.resize()).observe(canvas.parentElement);this.update(this.items,this.options,this.selected);this.fit(this.fitCoordinates);this.renderLocation();if(this.userLocation)this.centerLocation();
  }
  layers() {
    const map=this.map;if(!map||map.getSource('studio-data'))return;
    map.addSource('studio-data',{type:'geojson',promoteId:'routeKey',data:collection([])});map.addSource('studio-options',{type:'geojson',data:collection([])});
    map.addLayer({id:'studio-options',type:'line',source:'studio-options',filter:['!=',['get','mode'],'plane'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['case',['get','selected'],'#bf6427','#6c8585'],'line-width':['case',['get','selected'],5,3],'line-opacity':['case',['get','selected'],.95,.45]}});
    map.addLayer({id:'studio-selection',type:'line',source:'studio-data',filter:['all',['==',['geometry-type'],'LineString'],['==',['get','selected'],true]],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#ffb32f','line-width':15,'line-opacity':['case',['==',['get','mode'],'plane'],.5,.65]}});
    map.addLayer({id:'studio-casing',type:'line',source:'studio-data',filter:['all',['==',['geometry-type'],'LineString'],['!=',['get','mode'],'plane']],paint:{'line-color':'#fff9eb','line-width':7,'line-opacity':1}});
    map.addLayer({id:'studio-lines',type:'line',source:'studio-data',filter:['all',['==',['geometry-type'],'LineString'],['!=',['get','mode'],'plane']],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','color'],'#be6029'],'line-width':3.5,'line-opacity':1}});
    map.addLayer({id:'studio-flight-options',type:'line',source:'studio-options',filter:['==',['get','mode'],'plane'],layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['case',['get','selected'],'#bf6427','#6c8585'],'line-width':4,'line-dasharray':[3.5,3.5],'line-opacity':.5}});
    const flightFilter=['all',['==',['geometry-type'],'LineString'],['==',['get','mode'],'plane']];
    map.addLayer({id:'studio-flight-casing',type:'line',source:'studio-data',filter:flightFilter,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff9eb','line-width':7,'line-dasharray':[2,2],'line-opacity':0}});
    map.addLayer({id:'studio-flights',type:'line',source:'studio-data',filter:flightFilter,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['coalesce',['get','color'],'#be6029'],'line-width':3.5,'line-dasharray':[4,4],'line-opacity':.5}});
    map.addLayer({id:'studio-points',type:'circle',source:'studio-data',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':['coalesce',['get','color'],'#244638'],'circle-radius':['case',['get','important'],9,6],'circle-stroke-color':['case',['==',['get','selected'],true],'#ffae20','#fff9e9'],'circle-stroke-width':['case',['==',['get','selected'],true],6,2.5]}});
    const star=new Uint8Array(32*32*4);
    // A local star sprite keeps important nodes distinct even when fonts are offline.
    const icon=document.createElement('canvas');icon.width=icon.height=32;const ctx=icon.getContext('2d');ctx.fillStyle='#fffaf0';ctx.beginPath();for(let i=0;i<10;i++){const angle=-Math.PI/2+i*Math.PI/5,r=i%2?5:11;const x=16+Math.cos(angle)*r,y=16+Math.sin(angle)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();star.set(ctx.getImageData(0,0,32,32).data);map.addImage('studio-star',{width:32,height:32,data:star});
    map.addLayer({id:'studio-stars',type:'symbol',source:'studio-data',filter:['all',['==',['geometry-type'],'Point'],['==',['get','important'],true]],layout:{'icon-image':'studio-star','icon-size':.65,'icon-allow-overlap':true}});
    this.playbackStaticPointsActive=undefined;this.applyPlaybackVisibility();applyPlaybackPoints(this);
    installParkLayer(map,this.parks||[],!!this.showNationalParks);
    this.renderLocation();
  }
  setNationalParks(parks,visible) {
    this.parks=parks;this.showNationalParks=visible;if(!visible)this.parkPopup?.remove();
    if(this.map&&this.ready)installParkLayer(this.map,parks,visible);
    if(this.sketch){this.sketch.parkMarkers=parks.map(park=>({name:park.name,point:mercator(park.coordinates)}));this.sketch.showNationalParks=visible;this.sketch.drawSoon();}
  }
  setLocation(location){this.userLocation=location;this.renderLocation();this.centerLocation();}
  renderLocation(){
    const map=this.map;
    if(map&&this.ready){
      const data=locationFeatures(this.userLocation);
      if(map.getSource('studio-location'))map.getSource('studio-location').setData(data);
      else {map.addSource('studio-location',{type:'geojson',data});map.addLayer({id:'studio-location-accuracy',type:'fill',source:'studio-location',filter:['==',['get','kind'],'accuracy'],paint:{'fill-color':'#2779dc','fill-opacity':.14}});map.addLayer({id:'studio-location-dot',type:'circle',source:'studio-location',filter:['==',['get','kind'],'location'],paint:{'circle-color':'#2779dc','circle-radius':7,'circle-stroke-color':'#fff','circle-stroke-width':3}});}
    }
    if(this.sketch){this.sketch.userLocation=this.userLocation;this.sketch.drawSoon();}
  }
  centerLocation(){
    if(!this.userLocation)return;this.onUserPan?.();
    const {coordinates,accuracy}=this.userLocation,zoom=Math.max(2,Math.min(14.5,Math.log2(156543.03*Math.max(.01,Math.cos(coordinates[1]*Math.PI/180))*Math.min(this.map?.getContainer().clientWidth||this.sketch?.w||600,this.map?.getContainer().clientHeight||this.sketch?.h||600)/Math.max(accuracy*5,500))));
    if(this.map)this.map.easeTo({center:coordinates,zoom,padding:{top:100,bottom:100,left:45,right:45},duration:650});
    if(this.sketch){this.sketch.center=mercator(coordinates);this.sketch.scale=512*2**zoom;this.sketch.free=true;this.sketch.drawSoon();}
  }
  preparePlayback(segments,tripId) {
    if(this.playbackPlan===segments&&this.playbackDefaultTrip===tripId)return;
    this.playbackPlan=segments;this.playbackDefaultTrip=tripId;this.playbackOrder=new Map();
    this.playbackItems=new Map(this.items.map(item=>[JSON.stringify([item._tripId,item.id]),item]));
    segments.forEach((segment,index)=>this.playbackOrder.set(JSON.stringify([segment.tripId||tripId,segment.id]),index));
    // Playback order is metadata. Keep existing route buffers and projected
    // canvas paths instead of rebuilding/uploading every journey on first play.
    if(this.sketch)for(const line of this.sketch.route.lines)line.playbackOrder=this.playbackOrder.get(JSON.stringify([line.tripId,line.id]))??-1;
    this.applyPlaybackVisibility();
  }
  setPlaybackJourney(tripId,cursor=0) {
    const ids=Array.isArray(tripId)?tripId:tripId?[tripId]:[];
    if(JSON.stringify(this.playbackTripIds||[])===JSON.stringify(ids)&&this.playbackCursor===cursor)return;
    this.playbackTripIds=ids;this.playbackTripId=ids[0]||null;this.playbackCursor=cursor;this.applyPlaybackVisibility();
  }
  setPlaybackPoints(...args){setPlaybackPoints.apply(this,args);}
  playbackScale(){return this.sketch?.scale||512*2**(this.map?.getZoom()||0)/(this.view==='globe'?Math.max(.01,Math.cos(this.map.getCenter().lat*Math.PI/180)):1);}
  applyPlaybackVisibility() {
    syncPlaybackRoutes(this);
    if(this.sketch){
      const s=this.sketch;s.playbackTripId=this.playbackTripId;s.playbackTripIds=this.playbackTripIds;s.playbackCursor=this.playbackOrder?this.playbackCursor:undefined;
      if(s.playbackIndexedLines!==s.route.lines||s.playbackIndexedPlan!==this.playbackPlan){
        s.playbackIndexedLines=s.route.lines;s.playbackIndexedPlan=this.playbackPlan;s.playbackPathOrder=[];
        s.route.lines.forEach((line,index)=>{if(!line.option&&line.playbackOrder>=0)s.playbackPathOrder[line.playbackOrder]=index;});
      }
      s.playbackPathIndices=this.playbackTripId?s.playbackPathOrder.slice(0,this.playbackCursor||0).filter(Number.isInteger):null;s.drawSoon();
    }
  }
  update(items,options=[],selected=-1) {
    this.items=items;this.options=options;this.selected=selected;
    const features=[],nodes=[];
    for(const item of items){
      if(item.kind==='point')nodes.push({id:item.id,name:item.name,coordinates:item.coordinates,important:!!item.important,color:item._color,selected:!!item._selected,tripId:item._tripId});
      else{features.push({type:'Feature',id:JSON.stringify([item._tripId,item.id]),properties:{routeKey:JSON.stringify([item._tripId,item.id]),id:item.id,mode:item.mode,color:item._color,selected:!!item._selected,tripId:item._tripId,playbackOrder:this.playbackOrder?.get(JSON.stringify([item._tripId,item.id]))??-1},geometry:{type:'LineString',coordinates:unwrap(item.coordinates)}});for(const node of [item.startNode,item.endNode])if(node)nodes.push({...node,id:item.id,color:item._color,selected:!!item._selected,tripId:item._tripId});}
    }
    features.push(...nodes.map(n=>({type:'Feature',properties:{id:n.id,name:n.name,important:!!n.important,color:n.color,selected:!!n.selected,tripId:n.tripId},geometry:{type:'Point',coordinates:n.coordinates}})));this.visibleNodes=nodes;
    if(this.map&&this.ready)this.map.getSource('studio-data')?.setData(collection(features));
    if(this.sketch){
      const s=this.sketch;
      this.canvasBaseLines=items.filter(i=>i.kind==='segment').map(i=>({id:i.id,points:unwrap(i.coordinates),color:i._color,selected:!!i._selected,mode:i.mode,tripId:i._tripId,playbackOrder:this.playbackOrder?.get(JSON.stringify([i._tripId,i.id]))??-1}));
      this.canvasBasePaths=this.canvasBaseLines.map(line=>line.points.map(mercator));
      s.route={lines:this.canvasBaseLines,stops:nodes.map(n=>({name:(n.important?'★ ':'')+n.name,point:n.coordinates})),bounds:this.bounds()};
      s.stops=s.route.stops.map((n,i)=>({name:n.name,point:mercator(n.point),color:nodes[i].color,selected:nodes[i].selected,important:nodes[i].important,tripId:nodes[i].tripId}));
      s.area=this.bounds(this.fitCoordinates).map(mercator);s.selected=-1;
    }
    this.updateOptions(options,selected);
  }
  // Builder edits affect only the small preview source. Keep saved route
  // buffers, playback plans and projected canvas geometry intact while typing.
  updateOptions(options=[],selected=-1){
    this.options=options;this.selected=selected;
    if(this.map&&this.ready)this.map.getSource('studio-options')?.setData(collection(options.map((o,i)=>({type:'Feature',properties:{selected:i===selected,mode:o.mode||'car'},geometry:{type:'LineString',coordinates:unwrap(o.coordinates)}}))));
    if(this.sketch){
      const lines=options.filter((_,i)=>i===selected).map(option=>({points:unwrap(option.coordinates),mode:option.mode,option:true,playbackOrder:-1}));
      this.sketch.route.lines=[...(this.canvasBaseLines||[]),...lines];
      this.sketch.paths=[...(this.canvasBasePaths||[]),...lines.map(line=>line.points.map(mercator))];
      this.applyPlaybackVisibility();
    }
  }
  bounds(points) {
    const coords=points||[...this.items.flatMap(i=>i.kind==='point'?[i.coordinates]:i.coordinates),...this.options.flatMap(o=>o.coordinates)];
    if(!coords.length)return [[-125,24],[-66,50]];
    // A selected route is continuous. Match the longitude unwrapping used to
    // draw it: wrapping every vertex against the start splits long flights at
    // start +/- 180 degrees and turns a regional extent into a 360-degree box.
    const first=coords[0][0],flat=points?unwrap(coords):coords.map(p=>[p[0]+360*Math.round((first-p[0])/360),p[1]]);let w=Infinity,s=Infinity,e=-Infinity,n=-Infinity;for(const p of flat){w=Math.min(w,p[0]);s=Math.min(s,p[1]);e=Math.max(e,p[0]);n=Math.max(n,p[1]);}if(w===e){w-=.02;e+=.02;}if(s===n){s-=.02;n+=.02;}return [[w,Math.max(-85,s)],[e,Math.min(85,n)]];
  }
  fit(points,{duration=600}={}) {
    this.fitCoordinates=points;const bounds=this.bounds(points);
    if(this.map){
      const padding={top:105,left:55,right:70,bottom:document.querySelector('.studio-map-panel').classList.contains('has-playback')?210:110};
      const longRoute=points?.length>1&&(bounds[1][0]-bounds[0][0]>90||bounds[1][1]-bounds[0][1]>45);
      const camera=this.view==='globe'&&longRoute?globeRouteCamera(this.map,points,padding):null;
      if(camera)this.map.easeTo({...camera,duration});else this.map.fitBounds(bounds,{padding,maxZoom:13,duration});
    }
    if(this.sketch){this.sketch.area=bounds.map(mercator);this.sketch.free=false;this.sketch.resize();}
  }
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
    if(this.map){
      // Camera movement already schedules a map render. With a fixed camera,
      // animate the small overlay without redrawing every static route and tile.
      if(this.cameraFramePending||this.map.isMoving()||this.overlayFrame)return;
      this.overlayFrame=requestAnimationFrame(()=>{this.overlayFrame=0;if(!this.cameraFramePending)this.onFrame?.();});
    }
    else if(!this.sketch?.frame)this.onFrame?.();
  }
  report(message) {translatedStatus(this.notice,message);}
  async setTheme(theme,force=false) {
    const previous=this.theme;this.theme=mapThemes.includes(theme)?theme:'positron';
    document.getElementById('studio-map').dataset.theme=this.theme;
    if(this.sketch){updateMapCredit(this.theme,true);this.sketch.theme=this.theme;this.sketch.drawSoon();return true;}
    if(!this.map||(!force&&previous===this.theme))return true;
    const map=this.map,generation=++this.themeGeneration;this.themeLoading=true;this.themeRequest?.abort();const request=this.themeRequest=new AbortController();this.report('Loading map theme…');
    try {
      let style=rasterStyle(this.theme);if(!style){const response=await fetch('https://tiles.openfreemap.org/styles/'+this.theme,{signal:AbortSignal.any([request.signal,AbortSignal.timeout(12000)])});if(!response.ok)throw new Error();style=await response.json();}
      if(generation!==this.themeGeneration||this.map!==map)return false;
      this.ready=false;map.setStyle(style,{diff:false});updateMapCredit(this.theme);this.report('');return true;
    }catch{
      if(request.signal.aborted||generation!==this.themeGeneration||this.map!==map)return false;
      if(force){updateMapCredit(this.theme,true);if(this.context&&!map.getSource('local-land')){map.addSource('local-land',{type:'geojson',data:this.context});map.addLayer({id:'local-land',type:'fill',source:'local-land',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':'#e6e8d9','fill-outline-color':'#a9b9a4'}},map.getLayer('studio-lines')?'studio-lines':undefined);}this.report('Offline overview · search and road routing need an internet connection.');}
      else{this.theme=previous;updateMapCredit(previous);document.getElementById('studio-map').dataset.theme=previous;this.report('Map theme unavailable. Keeping the current map.');}
      return false;
    }finally{if(generation===this.themeGeneration)this.themeLoading=false;}
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
