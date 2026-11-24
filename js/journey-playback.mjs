import {validTime} from './journey-kml.mjs';
import {distance} from './journey-routes.mjs';
import {t} from './journey-i18n.mjs';
import {mercator,fromMercator} from './route-data.mjs';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const modeNames={car:'Car',train:'Train',plane:'Plane',walk:'Walk'};
const el=id=>document.getElementById(id);

// Preview time is independent of visit dates. Each segment is its own path;
// independent pins and gaps between segments never create extra travel geometry.
export function playbackPlan(items) {
  let total=0;const segments=[];
  for(const item of items.filter(item=>item.kind==='segment'&&item.visible!==false)) {
    const coordinates=item.coordinates.map(point=>point.slice(0,2)),cumulative=[0];
    for(let i=1;i<coordinates.length;i++)cumulative.push(cumulative[i-1]+distance(coordinates[i-1],coordinates[i]));
    const length=cumulative.at(-1);if(!Number.isFinite(length)||length<.01)continue;
    const mode=Object.hasOwn(modeNames,item.mode)?item.mode:'car';
    const duration=clamp(3+Math.log10(length+1),4,12)*({walk:1.2,car:1,train:1.05,plane:.9}[mode]);
    segments.push({id:item.id,name:item.name,vehicle:item.vehicle||'',mode,coordinates,cumulative,length,duration,offset:total});total+=duration;
  }
  return {segments,total};
}
// Dates affect playback order only; they never modify stored times or item order.
function namedDate(value){
  const name=String(value||'');let match=name.match(/(?:^|[^\d])((?:19|20)\d{2})[-/](0?[1-9]|1[0-2])(?:[-/](0?[1-9]|[12]\d|3[01]))?(?!\d)/);
  if(match){const iso=match[1]+'-'+match[2].padStart(2,'0')+'-'+(match[3]||'1').padStart(2,'0');return validTime(iso)?Date.parse(iso):Infinity;}
  match=name.match(/(?:^|[^\d])(0?[1-9]|1[0-2])[-/]((?:19|20)\d{2})(?!\d)/);if(match)return Date.parse(match[2]+'-'+match[1].padStart(2,'0')+'-01');
  match=name.match(/(?:^|[^\d])((?:19|20)\d{2})(?!\d)/);return match?Date.parse(match[1]+'-01-01'):Infinity;
}
function routeDate(item){
  for(const value of [item.start,item.trackTimes?.[0],item.end])if(value&&validTime(value))return Date.parse(value);
  for(const value of [item.name,...(Array.isArray(item.extra?.sourceFolderPath)?item.extra.sourceFolderPath:[])]){const date=namedDate(value);if(Number.isFinite(date))return date;}
  return Infinity;
}
export function checkedPlaybackPlan(journeys){
  const ordered=journeys.filter(j=>j.visible!==false).map((journey,index)=>{
    const items=journey.items.filter(i=>i.kind==='segment'&&i.visible!==false).map((item,order)=>({item,order,date:routeDate(item)})).sort((a,b)=>(a.date-b.date)||a.order-b.order);
    const date=items.find(i=>Number.isFinite(i.date))?.date??namedDate(journey.name);return {journey,index,date,plan:playbackPlan(items.map(i=>i.item))};
  }).filter(j=>j.plan.segments.length).sort((a,b)=>(a.date-b.date)||a.index-b.index);
  let total=0;const segments=[],queue=[];
  ordered.forEach(({journey,plan},journeyIndex)=>{queue.push({id:journey.id,name:journey.name,color:journey.color,offset:total,duration:plan.total});for(const [index,segment]of plan.segments.entries())segments.push({...segment,offset:segment.offset+total,tripId:journey.id,tripName:journey.name,color:journey.color,journeyIndex,segmentIndex:index,segmentCount:plan.segments.length});total+=plan.total;});
  return {segments,total,journeys:queue};
}

// Interpolate in the same space as the map's route lines, including at high
// latitudes. Keep the short world copy when a leg crosses the date line.
function coordinateBetween(a,b,fraction,wrap=true) {
  if(fraction<=0)return [...a];if(fraction>=1)return [...b];
  const start=mercator(a),end=mercator(b);end[0]+=Math.round(start[0]-end[0]);
  const point=fromMercator(start.map((value,i)=>value+(end[i]-value)*fraction));
  if(wrap)point[0]=((point[0]+540)%360)-180;return point;
}
function positionAt(segment,meters) {
  const d=clamp(meters,0,segment.length),c=segment.cumulative;
  if(d>=segment.length)return {position:[...segment.coordinates.at(-1)],vertex:c.length-1};
  let lo=1,hi=c.length-1;
  while(lo<hi){const middle=(lo+hi)>>1;if(c[middle]<=d)lo=middle+1;else hi=middle;}
  const a=segment.coordinates[lo-1],b=segment.coordinates[lo],fraction=(d-c[lo-1])/Math.max(1e-9,c[lo]-c[lo-1]);
  return {position:coordinateBetween(a,b,fraction),vertex:lo};
}
export function playbackFrame(plan,seconds) {
  if(!plan.segments.length)return null;
  const elapsed=clamp(seconds,0,plan.total),index=Math.max(0,plan.segments.findIndex((segment,i)=>elapsed<segment.offset+segment.duration||i===plan.segments.length-1));
  const segment=plan.segments[index],progress=elapsed>=segment.offset+segment.duration?1:clamp((elapsed-segment.offset)/segment.duration,0,1),meters=segment.length*progress;
  const {position,vertex}=positionAt(segment,meters);
  return {segment,index,progress,position,vertex,ahead:coordinateBetween(position,segment.coordinates[vertex],.01),elapsed};
}
// Each line stays independent. The active line ends at the exact icon position;
// seeking backward simply builds a shorter prefix without changing saved routes.
export function playbackRoutes(plan,frame) {
  if(!frame)return [];
  const routes=plan.segments.slice(0,frame.index);
  if(frame.progress>0)routes.push({...frame.segment,coordinates:[...frame.segment.coordinates.slice(0,frame.vertex),frame.position]});
  return routes;
}
export function projectPlaybackPath(coordinates,project) {
  const paths=[];let path=null;
  const append=point=>{if(!point){path=null;return;}if(!path){path=[];paths.push(path);}path.push(point);};
  function visit(a,b,pa,pb,depth=0) {
    const mid=coordinateBetween(a,b,.5,false),pm=project(mid);
    const span=Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]));
    let error=Infinity;
    if(pa&&pb&&pm){const dx=pb[0]-pa[0],dy=pb[1]-pa[1],length=dx*dx+dy*dy;const t=length?clamp(((pm[0]-pa[0])*dx+(pm[1]-pa[1])*dy)/length,0,1):0;error=Math.hypot(pm[0]-pa[0]-dx*t,pm[1]-pa[1]-dy*t);}
    if(depth<16&&(span>2||((pa||pb||pm)&&error>.35))){visit(a,mid,pa,pm,depth+1);visit(mid,b,pm,pb,depth+1);return;}
    if(!pa||!pm)append(null);append(pb);
  }
  if(!coordinates.length)return paths;
  let previous=coordinates[0],pixel=project(previous);append(pixel);
  for(const point of coordinates.slice(1)){const next=project(point);visit(previous,point,pixel,next);previous=point;pixel=next;}
  return paths.filter(path=>path.length>1);
}
// Work backward over the original vertices, stopping at a fixed screen length.
// Subdivision follows curved globe projections; null projections and world seams
// terminate the trail rather than connecting two unrelated visible positions.
export function projectPlaybackTrail(frame,project,{length=128,maxJump=512}={}) {
  const head=project(frame.position);if(!head)return [];
  const points=[head];let traveled=0;
  function append(point) {
    const previous=points.at(-1),distance=Math.hypot(point[0]-previous[0],point[1]-previous[1]);
    if(distance>maxJump)return false;if(distance<1e-6)return true;
    const remaining=length-traveled;
    if(distance>=remaining){points.push(previous.map((v,i)=>v+(point[i]-v)*remaining/distance));return false;}
    points.push(point);traveled+=distance;return true;
  }
  function visit(a,b,pa,depth=0) {
    const pb=project(b),mid=coordinateBetween(a,b,.5),pm=project(mid);
    const gap=pb?Math.hypot(pb[0]-pa[0],pb[1]-pa[1]):Infinity;
    const error=pb&&pm?Math.hypot(pm[0]-(pa[0]+pb[0])/2,pm[1]-(pa[1]+pb[1])/2):Infinity;
    const span=Math.max(Math.abs(((b[0]-a[0]+540)%360)-180),Math.abs(b[1]-a[1]));
    if(depth<16&&(gap>8||error>.35||span>2)){
      if(!visit(a,mid,pa,depth+1))return false;
      return pm?visit(mid,b,pm,depth+1):false;
    }
    return pb&&pm?append(pb):false;
  }
  let coordinate=frame.position;
  for(let i=frame.vertex-1;i>=0;i--){const previous=frame.segment.coordinates[i];if(!visit(coordinate,previous,points.at(-1)))break;coordinate=previous;}
  return points.reverse();
}
function behindPoint(points,pixels) {
  for(let i=points.length-1;i>0;i--){const a=points[i],b=points[i-1];if(!a||!b)return null;const length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length>=pixels&&length>0){const f=pixels/length;return {point:[a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f],angle:Math.atan2(a[1]-b[1],a[0]-b[0])+Math.PI/2};}pixels-=length;}
  return null;
}
export class JourneyPlayback {
  constructor(map) {
    this.map=map;this.canvas=el('journey-animation');this.ctx=this.canvas.getContext('2d');this.host=el('journey-player');
    this.scope='current';this.checkedJourneys=[];this.controlsHidden=false;this.plan={segments:[],total:0};this.routes=[];this.elapsed=0;this.state='idle';this.rate=1;this.follow=true;this.frame=null;this.images={};
    for(const mode of [...Object.keys(modeNames),'carriage']){const image=new Image();image.onload=()=>this.requestDraw();image.src='images/journey-icons/playback/'+mode+'.svg';this.images[mode]=image;}
    map.onFrame=()=>this.draw();map.onUserPan=()=>{this.follow=false;el('player-follow').checked=false;};
    map.onPlaybackPick=point=>this.hitTest(point);
    el('player-toggle').addEventListener('click',()=>this.state==='playing'?this.pause():this.play());
    el('player-exit').addEventListener('click',()=>this.exit());
    el('player-restart').addEventListener('click',()=>{this.seek(0);this.play();});
    el('play-journey').addEventListener('click',()=>{this.startScope('current');this.canvas.parentElement.scrollIntoView({block:'center',behavior:'smooth'});});
    el('play-checked-journeys').addEventListener('click',()=>{this.startScope('checked');this.canvas.parentElement.scrollIntoView({block:'center',behavior:'smooth'});});
    el('player-progress').addEventListener('input',()=>this.seek(Number(el('player-progress').value)/1000));
    el('player-speed').addEventListener('change',()=>{this.rate=Number(el('player-speed').value);});
    el('player-follow').addEventListener('change',()=>{this.follow=el('player-follow').checked;if(this.follow&&this.frame)this.map.followPlayback(this.frame.position,true);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();});
    new ResizeObserver(()=>this.resize()).observe(this.canvas.parentElement);this.resize();
  }
  sync(journey,checkedJourneys=this.checkedJourneys) {
    this.activeJourney=journey;this.checkedJourneys=checkedJourneys;
    const sources=this.scope==='checked'?checkedJourneys.filter(j=>j.visible!==false):[journey];
    const signature=JSON.stringify([this.scope,...sources.map(j=>[j.id,j.name,j.color,...j.items.filter(i=>i.kind==='segment'&&i.visible!==false).map(({id,name,mode,vehicle,coordinates,start,end,trackTimes,extra})=>({id,name,mode,vehicle,coordinates,start,end,firstTrackTime:trackTimes?.[0],folder:extra?.sourceFolderPath}))])]);
    if(signature!==this.signature){this.exit();this.signature=signature;this.plan=this.scope==='checked'?checkedPlaybackPlan(sources):playbackPlan(journey.items);}
    const segment=this.frame?.segment;this.tripId=segment?.tripId||journey.id;this.color=segment?.color||journey.color||'#bc5c28';
    this.updateMapVisibility();this.updateControls();
    const playable=j=>j.items.some(i=>i.kind==='segment'&&i.visible!==false&&i.coordinates.length>1);
    el('play-journey').disabled=!playable(journey);el('play-checked-journeys').disabled=!checkedJourneys.some(j=>j.visible!==false&&playable(j));
    this.canvas.parentElement.classList.toggle('has-playback',this.plan.segments.length>0);this.updateUI();this.requestDraw();
  }
  startScope(scope){if(this.scope!==scope){this.scope=scope;this.signature=null;this.sync(this.activeJourney,this.checkedJourneys);}this.play();}
  updateMapVisibility(){
    if(['idle','finished'].includes(this.state)){this.map.setPlaybackJourney(null);return;}
    if(this.scope==='checked'){const index=this.frame?.segment.journeyIndex||0;this.map.setPlaybackJourney(this.plan.journeys.slice(index).map(j=>j.id));}
    else this.map.setPlaybackJourney(this.tripId);
  }
  setControlsHidden(hidden){this.controlsHidden=hidden;this.updateControls();}
  updateControls(){this.host.hidden=!this.plan.segments.length||this.controlsHidden;el('show-player').hidden=!this.plan.segments.length||!this.controlsHidden;}
  play() {
    if(!this.plan.segments.length||this.state==='playing')return;
    if(this.elapsed>=this.plan.total)this.elapsed=0;
    this.state='playing';this.lastTime=performance.now();this.advance(true);this.updateUI();this.requestDraw();
    cancelAnimationFrame(this.raf);this.raf=requestAnimationFrame(time=>this.tick(time));
  }
  pause() {cancelAnimationFrame(this.raf);this.raf=0;if(this.state==='playing')this.state='paused';this.updateUI();this.requestDraw();}
  releaseOverlay(){this.map.setPlaybackJourney(null);this.routes=[];this.drawnRoutes=[];this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.overlayVisible=false;}
  exit(){cancelAnimationFrame(this.raf);this.raf=0;this.state='idle';this.elapsed=0;this.frame=null;this.releaseOverlay();this.updateUI();}
  finish(){cancelAnimationFrame(this.raf);this.raf=0;this.state='finished';this.releaseOverlay();}
  seek(fraction) {
    this.elapsed=clamp(fraction,0,1)*this.plan.total;this.lastTime=performance.now();
    if(this.elapsed===this.plan.total){cancelAnimationFrame(this.raf);this.state='finished';}
    else if(this.state!=='playing')this.state='paused';
    this.advance(true);if(this.state==='finished')this.finish();this.updateUI();this.requestDraw();
  }
  tick(now) {
    if(this.state!=='playing')return;
    this.elapsed=Math.min(this.plan.total,this.elapsed+Math.min(.2,(now-this.lastTime)/1000)*this.rate);this.lastTime=now;
    this.advance();
    if(this.elapsed>=this.plan.total)this.finish();
    this.updateUI();this.requestDraw();
    if(this.state==='playing')this.raf=requestAnimationFrame(time=>this.tick(time));
  }
  advance(force=false) {
    this.frame=playbackFrame(this.plan,this.elapsed);if(!this.frame)return;
    const segment=this.frame.segment;this.tripId=segment.tripId||this.activeJourney?.id||this.tripId;this.color=segment.color||this.activeJourney?.color||this.color;
    // Completed journeys return to the static renderer. Only the current journey
    // needs a progressively drawn overlay, even in very long playback queues.
    if(this.scope==='checked'){const begin=this.plan.segments.findIndex(s=>s.tripId===segment.tripId);const local={segments:this.plan.segments.slice(begin,this.frame.index+1)};this.routes=playbackRoutes(local,{...this.frame,index:this.frame.index-begin});}else this.routes=playbackRoutes(this.plan,this.frame);
    this.updateMapVisibility();
    if(this.follow)this.map.followPlayback(this.frame.position,force);
  }
  updateUI() {
    el('player-exit').disabled=this.state==='idle';
    const playing=this.state==='playing',label=playing?'Pause journey':this.state==='finished'?'Replay journey':this.state==='paused'?'Resume journey':'Play journey';
    el('player-toggle').setAttribute('aria-label',t(label));el('player-toggle').title=t(label);
    el('player-toggle').querySelector('.player-play-icon').toggleAttribute('hidden',playing);el('player-toggle').querySelector('.player-pause-icon').toggleAttribute('hidden',!playing);
    this.host.dataset.state=this.state;
    const segment=this.frame?.segment||this.plan.segments[0],index=this.frame?.index||0;
    const status=t({idle:'Ready to play',playing:'Playing',paused:'Paused',finished:'Finished'}[this.state]);
    const journeys=this.plan.journeys||[],queue=this.scope==='checked'&&journeys.length>0;el('player-queue').hidden=!queue;el('player-queue').textContent=queue&&segment?t('Journey {index} of {total}',{index:segment.journeyIndex+1,total:journeys.length})+' · '+segment.tripName:'';this.host.dataset.scope=this.scope;this.host.dataset.journeyId=segment?.tripId||this.tripId||'';
    const text=segment?`${status} · ${t('Segment {index} of {total}',{index:queue?segment.segmentIndex+1:index+1,total:queue?segment.segmentCount:this.plan.segments.length})} · ${t(modeNames[segment.mode])}${segment.mode==='car'&&segment.vehicle?' · '+segment.vehicle:''}`:t('Route playback');
    if(el('player-status').textContent!==text)el('player-status').textContent=text;
    el('player-title').textContent=segment?.name||'';this.host.dataset.mode=segment?.mode||'';
    const fraction=this.plan.total?this.elapsed/this.plan.total:0;el('player-progress').value=String(Math.round(fraction*1000));el('player-percent').value=Math.round(fraction*100)+'%';
    el('player-progress').setAttribute('aria-valuetext',Math.round(fraction*100)+'%');
    this.host.style.setProperty('--journey-color',this.color);this.host.dataset.progress=String(fraction);this.host.dataset.segment=String(index);
  }
  resize() {
    const parent=this.canvas.parentElement;this.w=parent.clientWidth;this.h=parent.clientHeight;this.dpr=Math.min(devicePixelRatio||1,2);
    this.canvas.width=Math.round(this.w*this.dpr);this.canvas.height=Math.round(this.h*this.dpr);this.requestDraw();
  }
  // Paint the overlay after the basemap has rendered the same camera state.
  // Drawing here and again on map.render exposed two different poses per frame.
  requestDraw() {this.map.requestPlaybackFrame();}
  sprite(mode,point,angle,size) {
    const ctx=this.ctx,icon=this.images[mode];ctx.save();ctx.translate(...point);ctx.rotate(angle);
    ctx.shadowColor='#17354266';ctx.shadowBlur=5;ctx.shadowOffsetY=2;
    if(icon?.complete&&icon.naturalWidth)ctx.drawImage(icon,-size/2,-size/2,size,size);
    else{ctx.fillStyle=this.color;ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(8,10);ctx.lineTo(-8,10);ctx.closePath();ctx.fill();}
    ctx.restore();
  }
  contrails(points) {
    const ctx=this.ctx;
    // Two narrow engine trails leave the dashed route visible down the middle.
    // Stroke each continuous path once so overlapping round caps cannot form beads.
    for(const side of [-1,1]){
      const trail=[];
      for(let offset=12;offset<=116;offset+=2){const sample=behindPoint(points,offset);if(!sample)break;trail.push([sample.point[0]+Math.cos(sample.angle)*side*13,sample.point[1]+Math.sin(sample.angle)*side*13]);}
      if(trail.length<2)continue;
      const start=trail[0],end=trail.at(-1);if(Math.hypot(end[0]-start[0],end[1]-start[1])<1)continue;
      const gradient=ctx.createLinearGradient(...start,...end);gradient.addColorStop(0,'#f6fcffe6');gradient.addColorStop(1,'#f6fcff00');
      ctx.save();ctx.beginPath();trail.forEach((point,i)=>i?ctx.lineTo(...point):ctx.moveTo(...point));ctx.strokeStyle=gradient;ctx.lineWidth=2.2;ctx.shadowColor='#608da766';ctx.shadowBlur=2;ctx.stroke();ctx.restore();
    }
  }
  drawRoutes() {
    const ctx=this.ctx;this.drawnRoutes=[];ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    for(const route of this.routes||[]){
      const coordinates=this.map.unwrapPlaybackCoordinates(route.coordinates);
      const paths=projectPlaybackPath(coordinates,coordinate=>this.map.projectCoordinate(coordinate,false));
      const path=new Path2D();for(const points of paths)points.forEach((point,i)=>i?path.lineTo(...point):path.moveTo(...point));
      ctx.setLineDash(route.mode==='plane'?[14,14]:[]);
      ctx.strokeStyle=this.map.theme==='dark'?'#10212a':'#fff9eb';ctx.lineWidth=7;ctx.stroke(path);
      ctx.strokeStyle=this.color;ctx.lineWidth=3.5;ctx.stroke(path);
      this.drawnRoutes.push({path,id:route.id,tripId:this.tripId});
    }
    ctx.restore();
  }
  hitTest(point) {
    const ctx=this.ctx;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.setLineDash([]);ctx.lineWidth=12;
    const hit=this.drawnRoutes?.findLast(route=>ctx.isPointInStroke(route.path,...point));ctx.restore();return hit;
  }
  draw() {
    const ctx=this.ctx;if(!ctx)return;if(!this.frame||['idle','finished'].includes(this.state)){if(this.overlayVisible){ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.overlayVisible=false;}this.drawnRoutes=[];return;}this.overlayVisible=true;ctx.setTransform(this.dpr||1,0,0,this.dpr||1,0,0);ctx.clearRect(0,0,this.w||0,this.h||0);
    this.drawnRoutes=[];
    if(!this.frame||this.state==='idle')return;
    this.drawRoutes();
    const frame=this.frame,mode=frame.segment.mode,point=this.map.projectCoordinate(frame.position);if(!point)return;
    const projected=projectPlaybackTrail(frame,coordinate=>this.map.projectCoordinate(coordinate),{maxJump:Math.max(this.w,this.h)/2});
    const ahead=this.map.projectCoordinate(frame.ahead),back=behindPoint(projected,4);
    const angle=ahead&&Math.hypot(ahead[0]-point[0],ahead[1]-point[1])>.1?Math.atan2(ahead[1]-point[1],ahead[0]-point[0])+Math.PI/2:back?.angle||0;
    const phase=frame.elapsed*8;
    ctx.lineCap='round';ctx.lineJoin='round';
    if(mode==='plane')this.contrails(projected);
    if(mode==='train'){
      for(const offset of [76,40]){const carriage=behindPoint(projected,offset);if(carriage)this.sprite('carriage',carriage.point,carriage.angle,36);}
    }
    if(mode==='walk'){
      for(let i=0;i<6;i++){const foot=behindPoint(projected,22+i*12);if(!foot)continue;ctx.save();ctx.translate(...foot.point);ctx.rotate(foot.angle);ctx.fillStyle=this.color;ctx.globalAlpha=.65-i*.09;ctx.beginPath();ctx.ellipse(i%2?4:-4,-1,2.2,3.5,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(i%2?4:-4,4,1.6,0,Math.PI*2);ctx.fill();ctx.restore();}
    }
    if(mode==='car'){
      ctx.save();ctx.translate(...point);ctx.rotate(angle);
      for(const x of [-6,6]){const light=ctx.createRadialGradient(x,-19,0,x,-23,12);light.addColorStop(0,'#fff2ba99');light.addColorStop(1,'#fff2ba00');ctx.fillStyle=light;ctx.beginPath();ctx.ellipse(x,-24,7,13,0,0,Math.PI*2);ctx.fill();}ctx.restore();
    }
    if(mode==='walk'){
      ctx.save();ctx.translate(point[0],point[1]+Math.sin(phase)*1.3);ctx.scale(Math.sin(angle)<0?-1:1,1);this.sprite(mode,[0,0],Math.sin(phase)*.035,48);ctx.restore();
    }else this.sprite(mode,point,angle,mode==='plane'?58:mode==='train'?46:48);
  }
}
