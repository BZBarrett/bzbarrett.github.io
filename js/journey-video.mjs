import {transportModes,normalizeTransportSpeeds} from './journey-transport.mjs';
import {checkedPlaybackPlan,playbackFrame,playbackCameraPosition,PlaybackPainter,PLAYBACK_RATES,IMPORTANT_LABEL_SECONDS} from './journey-playback.mjs';
import {JourneyMap} from './journey-map.mjs';
import {cameraOf,cleanStyle,routeLayers} from './journey-map-export.mjs';
import {RouteSketch} from './route-sketch.mjs';
import {mercator} from './route-data.mjs';
import {mapCredit} from './journey-basemaps.mjs';
import {downloadFile,safeFilename} from './journey-kml.mjs';
import {t} from './journey-i18n.mjs';

const el=id=>document.getElementById(id);
export const VIDEO_FPS=30;
export const VIDEO_RESOLUTIONS=[720,1080,1440,2160];
export const VIDEO_FRAME_RATES=[24,25,30,50,60];
export function videoOptions({resolution=1080,fps=VIDEO_FPS}={}){
  resolution=Number(resolution);fps=Number(fps);
  if(!VIDEO_RESOLUTIONS.includes(resolution)||!VIDEO_FRAME_RATES.includes(fps))throw new Error('Invalid video quality settings.');
  return {resolution,fps,bitrate:Math.round(8_000_000*(resolution/1080)**2*fps/30)};
}
const encoderLibrary=()=>import('./vendor/mediabunny-1.66.4.mjs');
export function videoSize(orientation,resolution=1080){const {resolution:short}=videoOptions({resolution}),long=short*16/9;return orientation==='portrait'?{width:short,height:long}:{width:long,height:short};}
export function videoTiming(plan,rate,fps=VIDEO_FPS){videoOptions({fps});let tail=0;for(const point of plan.arrivals||plan.points||plan.importantPoints||[])tail=Math.max(tail,IMPORTANT_LABEL_SECONDS-(plan.total-point.elapsed)/rate);const duration=plan.total/rate+tail;return {duration,frames:Math.max(1,Math.ceil(duration*fps))};}
function timeLabel(seconds){const n=Math.ceil(seconds);return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,'0')).join(':');}
function unwrap(coordinates){let previous=coordinates[0][0];return coordinates.map(p=>{previous=p[0]+360*Math.round((previous-p[0])/360);return [previous,p[1]];});}

export function captureVideoSettings(map,playback,workspace){
  const trips=workspace.trips.filter(j=>j.visible!==false).map(j=>({id:j.id,name:j.name,videoTitle:j.videoTitle,color:j.color,items:j.items.filter(i=>i.visible!==false)}));
  const transportSpeeds=normalizeTransportSpeeds(workspace.transportSpeeds),plan=checkedPlaybackPlan(trips,transportSpeeds);
  if(!plan.segments.length)throw new Error('Select at least one journey with a visible route to export.');
  const camera=cameraOf(map);
  if(!camera||map.opening||map.themeLoading||map.map&&!map.ready)throw new Error('Wait for the current map to finish loading, then try again.');
  const size=map.map?.getContainer()||map.sketch.canvas.parentElement;
  return {plan,transportSpeeds,places:[],
    camera:{...camera,width:size.clientWidth,padding:map.map?.getPadding()||{top:0,bottom:0,left:0,right:0},origin:map.sketch?[map.sketch.origin[0]/map.sketch.w,map.sketch.origin[1]/map.sketch.h]:null},
    style:map.map?cleanStyle(map):null,overview:!!map.sketch||!!map.map?.getSource('local-land'),theme:map.theme,view:map.sketch?'2d':map.view,
    parks:structuredClone(map.showNationalParks?map.parks||[]:[]),
    rate:PLAYBACK_RATES.includes(playback.rate)?playback.rate:1,follow:playback.follow,
    language:workspace.language,reducedMotion:playback.reducedMotion?.matches||false};
}

function waitMap(map,event,signal){
  signal?.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const done=()=>finish(),abort=()=>finish(signal.reason||new DOMException('Cancelled','AbortError'));
    const finish=error=>{clearTimeout(timer);map.off(event,done);signal?.removeEventListener('abort',abort);error?reject(error):resolve();};
    const timer=setTimeout(()=>finish(new Error('The map is still loading. Please try exporting again.')),20000);
    map.once(event,done);signal?.addEventListener('abort',abort,{once:true});if(event!=='load')map.triggerRepaint();
  });
}

// A separate map keeps export scrubbing and encoding away from the live camera.
// Preview and video share logical dimensions, pixel ratio, painter and timestamps.
export class JourneyVideoRenderer {
  constructor(snapshot,orientation='landscape',options={}){
    this.snapshot=snapshot;this.orientation=orientation;this.options=videoOptions(options);Object.assign(this,videoSize(orientation,this.options.resolution));
    // Keep composition and relative label/vehicle sizes identical at every resolution.
    const logical=videoSize(orientation);this.w=logical.width/2;this.h=logical.height/2;this.dpr=this.width/this.w;this.index=-1;
    this.host=document.createElement('div');this.host.dataset.videoMap='true';this.host.setAttribute('aria-hidden','true');
    Object.assign(this.host.style,{position:'fixed',left:'-20000px',top:'0',width:this.w+'px',height:this.h+'px',pointerEvents:'none'});document.body.append(this.host);
    this.canvas=document.createElement('canvas');this.canvas.width=this.width;this.canvas.height=this.height;this.ctx=this.canvas.getContext('2d',{alpha:false});
    const overlay=document.createElement('canvas');overlay.width=this.width;overlay.height=this.height;
    this.adapter=Object.create(JourneyMap.prototype);this.adapter.view=snapshot.view;this.adapter.playbackManualRender=true;
    this.painter=new PlaybackPainter(this.adapter,overlay);this.adapter.theme=snapshot.theme;Object.assign(this.painter,{plan:snapshot.plan,rate:snapshot.rate,w:this.w,h:this.h,dpr:this.dpr,state:'playing',reducedMotion:{matches:snapshot.reducedMotion}});
  }
  async init(signal){
    const s=this.snapshot,c=s.camera,scale=this.h/c.height;
    await Promise.all(transportModes.map(async mode=>{const image=new Image();image.src='images/journey-icons/playback/'+mode+'.svg';await image.decode();this.painter.images[mode]=image;}));signal?.throwIfAborted();
    const lines=s.plan.segments.map((segment,order)=>({points:unwrap(segment.coordinates),color:segment.color,mode:segment.mode,playbackOrder:order}));
    if(s.style){
      this.native=new window.maplibregl.Map({container:this.host,style:structuredClone(s.style),center:c.center,zoom:c.zoom+Math.log2(scale),pitch:c.pitch,bearing:c.bearing,pixelRatio:this.dpr,preserveDrawingBuffer:true,interactive:false,attributionControl:false,maplibreLogo:false,fadeDuration:0});
      this.adapter.map=this.native;await waitMap(this.native,'load',signal);signal?.throwIfAborted();this.adapter.ready=true;
      const features=lines.map(line=>({type:'Feature',properties:{color:line.color,mode:line.mode,order:line.playbackOrder},geometry:{type:'LineString',coordinates:line.points}}));
      features.push(...s.places.map(p=>({type:'Feature',properties:{color:p.color,important:!!p.important,order:-1},geometry:{type:'Point',coordinates:p.coordinates}})));
      routeLayers(this.native,{type:'FeatureCollection',features},s.parks,!!s.parks.length);
      this.native.setProjection({type:s.view==='globe'?'globe':'mercator'});
      this.native.jumpTo({padding:{top:c.padding.top*scale,bottom:c.padding.bottom*scale,left:c.padding.left*this.w/c.width,right:c.padding.right*this.w/c.width}});
      this.layers=this.native.getStyle().layers.filter(l=>l.source==='print-routes'&&l.type==='line').map(l=>({id:l.id,filter:l.filter}));
    }else{
      const response=await fetch('data/atlas-context.geojson',{signal});if(!response.ok)throw new Error('The map could not be loaded. Please try again.');const data=await response.json();signal?.throwIfAborted();
      const canvas=document.createElement('canvas');this.host.append(canvas);
      const sketch=this.sketch=new RouteSketch(canvas,{lines,stops:s.places.map(p=>({point:p.coordinates,color:p.color,name:''})),bounds:c.bounds},()=>({top:0,bottom:0,left:0,right:0}),()=>{},()=>{});
      this.adapter.sketch=sketch;sketch.setContext(data);sketch.theme=s.theme;sketch.center=mercator(c.center);sketch.scale=512*2**c.zoom*scale;sketch.origin=[this.w*(c.origin?.[0]??.5),this.h*(c.origin?.[1]??.5)];sketch.free=true;sketch.dpr=this.dpr;canvas.width=this.width;canvas.height=this.height;
      sketch.parkMarkers=s.parks.map(p=>({point:mercator(p.coordinates)}));sketch.showNationalParks=!!s.parks.length;sketch.playbackTripId='video';
      cancelAnimationFrame(sketch.frame);sketch.frame=0;
    }
    await this.render(0,signal);
  }
  async render(seconds,signal){
    signal?.throwIfAborted();if(this.disposed)throw new DOMException('Cancelled','AbortError');
    const s=this.snapshot,frame=playbackFrame(s.plan,Math.min(s.plan.total,seconds*s.rate)),p=this.painter;
    Object.assign(p,{frame,color:frame.segment.color||'#31765c',routes:frame.progress>0?[{...frame.segment,frame}]:[],renderTimeMs:seconds*1000,markerElapsed:seconds*s.rate});p.updateArrivals();
    if(this.native){
      if(frame.index!==this.index)for(const layer of this.layers)this.native.setFilter(layer.id,['all',layer.filter,['<',['get','order'],frame.index]]);
      if(s.follow)this.native.jumpTo({center:playbackCameraPosition(s.plan,frame,s.rate)});
      await waitMap(this.native,'render',signal);
      // A camera move can request new tiles during render. Wait before encoding,
      // rather than letting network speed change the visible frame or duration.
      if(!this.native.loaded())await waitMap(this.native,'idle',signal);
    }else{
      this.sketch.playbackCursor=frame.index;if(s.follow)this.sketch.center=mercator(playbackCameraPosition(s.plan,frame,s.rate));this.sketch.draw();
    }
    signal?.throwIfAborted();this.index=frame.index;
    p.draw();
    const ctx=this.ctx;ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=s.view==='globe'?'#152d43':'#edf0e8';ctx.fillRect(0,0,this.width,this.height);
    ctx.drawImage(this.native?this.native.getCanvas():this.sketch.canvas,0,0,this.width,this.height);ctx.drawImage(p.canvas,0,0);
    this.caption(frame);return this.canvas;
  }
  caption(frame){
    const ctx=this.ctx,s=this.snapshot;ctx.save();ctx.scale(this.dpr,this.dpr);
    const dark=s.theme==='dark'||s.view==='globe',paper=dark?'#132c3be8':'#fffdf4ed',ink=dark?'#f6f5e9':'#234534';
    const title=frame.segment.tripVideoTitle||frame.segment.tripName||'',subtitle=frame.segment.name||'',max=this.w-64;
    const clipText=(value,width)=>{while(value.length&&ctx.measureText(value).width>width)value=value.slice(0,-1);return value;};
    ctx.fillStyle=paper;ctx.beginPath();ctx.roundRect(20,20,Math.min(max,420),75,12);ctx.fill();
    ctx.fillStyle=frame.segment.color||'#31765c';ctx.fillRect(34,36,4,40);ctx.fillStyle=ink;ctx.font='600 17px Arial, "PingFang SC", sans-serif';ctx.fillText(clipText(title,Math.min(max,420)-52),49,49);
    ctx.font='12px Arial, "PingFang SC", sans-serif';ctx.fillText(clipText(subtitle,Math.min(max,420)-52),49,73);
    const credit=mapCredit(s.theme,s.overview);ctx.font='10px Arial, sans-serif';const width=Math.min(this.w,ctx.measureText(credit).width+22);ctx.fillStyle=paper;ctx.fillRect((this.w-width)/2,this.h-22,width,22);ctx.fillStyle=ink;ctx.textAlign='center';ctx.fillText(credit,this.w/2,this.h-8,this.w-16);ctx.restore();
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.native?.remove();if(this.sketch)cancelAnimationFrame(this.sketch.frame);this.host.remove();this.painter.canvas.width=this.painter.canvas.height=1;this.canvas.width=this.canvas.height=1;}
}

export async function videoEncoderSupported(orientation,options={}){const {resolution,fps,bitrate}=videoOptions(options),lib=await encoderLibrary();return lib.canEncodeVideo('avc',{...videoSize(orientation,resolution),bitrate,frameRate:fps});}

async function outputTarget(lib,estimatedBytes){
  // Stream to a temporary browser-private file so long journeys don't accumulate
  // encoded frames in RAM. Fall back to memory for browsers without OPFS.
  let root,name;
  try{
    root=await navigator.storage.getDirectory();name='.journey-video-'+crypto.randomUUID()+'.mp4';
    const handle=await root.getFileHandle(name,{create:true}),file=await handle.createWritable();
    const target=new lib.StreamTarget(new WritableStream({write:chunk=>file.write({type:'write',position:chunk.position,data:chunk.data}),close:()=>file.close(),abort:()=>file.abort()}),{chunked:true,chunkSize:2**20});
    // Detach the downloadable Blob from the OPFS file before deleting it.
    // A File returned by getFile() becomes unreadable when its entry is removed.
    // Streaming into a browser-managed Blob avoids a whole-file JS ArrayBuffer.
    return {target,file:async signal=>new Response((await handle.getFile()).stream().pipeThrough(new TransformStream(),{signal}),{headers:{'Content-Type':'video/mp4'}}).blob(),cleanup:()=>root.removeEntry(name).catch(()=>{})};
  }catch(error){if(root&&name)await root.removeEntry(name).catch(()=>{});if(estimatedBytes>256*1024**2)throw new Error('This video needs more temporary storage. Free up browser storage or choose a faster playback speed.');}
  const target=new lib.BufferTarget();return {target,file:async()=>new Blob([target.buffer],{type:'video/mp4'}),cleanup:async()=>{target.buffer=null;}};
}

export async function encodeJourneyVideo(renderer,{signal,onProgress=()=>{}}={}){
  signal?.throwIfAborted();const {fps,bitrate}=renderer.options,lib=await encoderLibrary(),{duration,frames}=videoTiming(renderer.snapshot.plan,renderer.snapshot.rate,fps);
  if(!await videoEncoderSupported(renderer.orientation,renderer.options))throw new Error('MP4 encoding is not available for these settings. Choose a lower resolution or frame rate, or try desktop Chrome or Edge.');
  signal?.throwIfAborted();const storage=await outputTarget(lib,duration*bitrate/8),output=new lib.Output({format:new lib.Mp4OutputFormat({fastStart:false}),target:storage.target});
  const source=new lib.CanvasSource(renderer.canvas,{codec:'avc',bitrate,keyFrameInterval:2});output.addVideoTrack(source,{frameRate:fps});
  output.setMetadataTags({title:renderer.snapshot.plan.journeys.map(j=>j.name).join(' · '),artist:'Wanderlust Journey Studio'});
  const abort=()=>{output.cancel().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try{
    await output.start();
    for(let i=0;i<frames;i++){
      signal?.throwIfAborted();const time=i===frames-1?duration:i/fps;
      await renderer.render(time,signal);await source.add(i/fps,1/fps);signal?.throwIfAborted();
      onProgress((i+1)/frames,renderer.canvas);
      if(i%6===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    await output.finalize();signal?.throwIfAborted();onProgress(1,renderer.canvas,'finalizing');const file=await storage.file(signal);signal?.throwIfAborted();await storage.cleanup();signal?.throwIfAborted();return {file,duration:frames/fps,frames};
  }catch(error){await output.cancel().catch(()=>{});await storage.cleanup();signal?.throwIfAborted();throw error;}
  finally{signal?.removeEventListener('abort',abort);}
}

export function setupVideoExport({map,playback,getWorkspace}){
  const dialog=el('video-dialog'),canvas=el('video-preview'),video=el('video-result');let snapshot,renderer,controller,result,orientation='landscape',resolution=1080,fps=VIDEO_FPS,busy=false,supported=false,previewQueue=Promise.resolve(),request=0,url;
  const status=message=>{el('video-status').textContent=message;};
  const copy=source=>{if(canvas.width!==source.width)canvas.width=source.width;if(canvas.height!==source.height)canvas.height=source.height;canvas.getContext('2d').drawImage(source,0,0);};
  function controls(){
    for(const button of dialog.querySelectorAll('[data-video-orientation]')){button.disabled=busy;button.setAttribute('aria-pressed',String(button.dataset.videoOrientation===orientation));}
    el('video-seek').disabled=busy||!renderer;el('export-video').disabled=busy||!renderer||!supported;el('cancel-video').hidden=!busy;
    for(const id of ['video-resolution','video-fps'])el(id).disabled=busy;
    el('video-resolution').value=String(resolution);el('video-fps').value=String(fps);
    const size=videoSize(orientation,resolution);el('video-size').textContent=`${size.width} × ${size.height} · MP4 · ${fps} fps`;
  }
  function releaseResult(){video.pause();video.removeAttribute('src');video.load();if(url)URL.revokeObjectURL(url);url=null;result=null;video.hidden=true;canvas.hidden=false;el('download-video').hidden=true;}
  function close(){request++;controller?.abort();renderer?.dispose();renderer=null;releaseResult();canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);el('video-progress').value=0;snapshot=null;busy=false;controls();}
  async function prepare(){
    const id=++request;controller?.abort();renderer?.dispose();renderer=null;supported=false;releaseResult();el('export-video').hidden=false;el('retry-video').hidden=true;controls();status(t('Preparing video preview…'));el('video-seek').value=0;el('video-progress').value=0;
    controller=new AbortController();const signal=controller.signal;
    let next;
    try{
      next=new JourneyVideoRenderer(snapshot,orientation,{resolution,fps});await next.init(signal);signal.throwIfAborted();
      if(id!==request){next.dispose();return;}renderer=next;copy(renderer.canvas);
      const canEncode=await videoEncoderSupported(orientation,{resolution,fps});signal.throwIfAborted();supported=canEncode;controls();
      status(supported?t('Preview and video use the same framing.'):t('MP4 encoding is not available for these settings. Choose a lower resolution or frame rate, or try desktop Chrome or Edge.'));
    }catch(error){next?.dispose();if(id===request&&!signal.aborted){renderer=null;controls();el('export-video').hidden=true;el('retry-video').hidden=false;status(t(error.message));}}
  }
  function details(){
    if(!snapshot)return;const timing=videoTiming(snapshot.plan,snapshot.rate),name=document.querySelector(`#map-theme option[value="${snapshot.theme}"]`)?.textContent||snapshot.theme;
    el('video-summary').textContent=t('{count} journeys · {segments} segments · {rate}× · {duration}',{count:snapshot.plan.journeys.length,segments:snapshot.plan.segments.length,rate:snapshot.rate,duration:timeLabel(timing.duration)});
    el('video-view').textContent=[name,snapshot.view==='globe'?t('Globe'):snapshot.view.toUpperCase(),t(snapshot.follow?'Follow on map':'Fixed camera')].join(' · ');
    el('video-journeys').replaceChildren(...snapshot.plan.journeys.map(j=>{const li=document.createElement('li'),dot=document.createElement('span');dot.style.background=j.color||'#31765c';li.append(dot,document.createTextNode(j.name));return li;}));
  }
  async function open(){
    playback.pause();el('map-export-dialog').close();dialog.showModal();close();
    const id=request,until=performance.now()+20000;status(t('Preparing video preview…'));el('video-summary').textContent='';el('video-view').textContent='';el('video-journeys').replaceChildren();
    try{
      while(map.opening||map.themeLoading||map.map&&(!map.ready||map.map.isMoving())){if(id!==request||!dialog.open)return;if(performance.now()>until)throw new Error('Wait for the current map to finish loading, then try again.');await new Promise(resolve=>setTimeout(resolve,50));}
      if(id!==request||!dialog.open)return;snapshot=captureVideoSettings(map,playback,getWorkspace());details();prepare();
    }catch(error){if(id===request&&dialog.open)status(t(error.message));}
  }
  for(const button of document.querySelectorAll('[data-open-video]'))button.addEventListener('click',open);
  for(const button of dialog.querySelectorAll('[data-video-orientation]'))button.addEventListener('click',()=>{if(busy)return;orientation=button.dataset.videoOrientation;if(snapshot)prepare();else controls();});
  for(const id of ['video-resolution','video-fps'])el(id).addEventListener('change',()=>{
    if(busy)return;
    ({resolution,fps}=videoOptions({resolution:el('video-resolution').value,fps:el('video-fps').value}));
    if(snapshot)prepare();else controls();
  });
  el('video-seek').addEventListener('input',()=>{
    if(busy||!renderer)return;const id=++request,target=Number(el('video-seek').value)/1000*videoTiming(snapshot.plan,snapshot.rate).duration,active=renderer,signal=controller.signal;
    el('export-video').disabled=true;
    previewQueue=previewQueue.catch(()=>{}).then(async()=>{if(id!==request||signal.aborted)return;await active.render(target,signal);if(id===request){copy(active.canvas);el('export-video').disabled=!supported;}}).catch(error=>{if(!signal.aborted)status(t(error.message));});
  });
  el('export-video').addEventListener('click',async()=>{
    if(busy||!renderer||!supported)return;busy=true;controls();releaseResult();el('video-seek').value=0;status(t('Rendering video… {percent}%',{percent:0}));const active=renderer,activeController=controller,signal=controller.signal;
    try{
      const completed=await encodeJourneyVideo(active,{signal,onProgress:(fraction,frame,phase)=>{el('video-progress').value=fraction;if(phase==='finalizing')status(t('Preparing your MP4 download…'));else if(Math.round(fraction*100)!==Number(el('video-progress').dataset.percent)){el('video-progress').dataset.percent=Math.round(fraction*100);status(t('Rendering video… {percent}%',{percent:Math.round(fraction*100)}));}copy(frame);}});
      signal.throwIfAborted();result=completed;url=URL.createObjectURL(result.file);video.src=url;video.hidden=false;canvas.hidden=true;el('download-video').hidden=false;status(t('Your MP4 is ready.'));download();
    }catch(error){if(dialog.open&&controller===activeController)status(t(signal.aborted?'Video export cancelled.':error.message));}
    finally{active.dispose();if(renderer===active)renderer=null;if(controller===activeController){busy=false;controls();if(dialog.open){el('export-video').hidden=true;el('retry-video').hidden=false;}}}
  });
  function download(){if(result)downloadFile(result.file,safeFilename(snapshot.plan.journeys.length===1?snapshot.plan.journeys[0].name:'Wanderlust journeys')+'-'+orientation+'-'+resolution+'p-'+fps+'fps.mp4');}
  el('download-video').addEventListener('click',download);
  el('cancel-video').addEventListener('click',()=>controller?.abort());
  el('retry-video').addEventListener('click',()=>{el('export-video').hidden=false;el('retry-video').hidden=true;prepare();});
  dialog.addEventListener('close',()=>{close();el('export-video').hidden=false;el('retry-video').hidden=true;});
  return {refresh(){if(dialog.open)details();}};
}
