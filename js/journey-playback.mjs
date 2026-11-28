import {DEFAULT_VEHICLE_ICON,resolveVehicleIcon,loadVehicleIcon} from './journey-vehicles.mjs';
import {transportNames as modeNames,normalizeTransportSpeeds,DEFAULT_TRANSPORT_SPEEDS} from './journey-transport.mjs';
import {arrivalCount,routeArrivals} from './journey-arrivals.mjs';
import {validTime} from './journey-kml.mjs';
import {t} from './journey-i18n.mjs';
import {distanceLabel} from './journey-routes.mjs';
import {pathAtScale} from './journey-path-cache.mjs';
import {mercator,fromMercator} from './route-data.mjs';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const el=id=>document.getElementById(id);
export const PLAYBACK_METERS_PER_SECOND=10000;
export const PLAYBACK_RATES=[1,2,4,8,16,32,64,128];
const playbackSpeed=(mode,speeds=DEFAULT_TRANSPORT_SPEEDS)=>PLAYBACK_METERS_PER_SECOND*(speeds[mode]||1);
// A straight Mercator segment is a rhumb line. Measure and parameterize that
// displayed line, so even sparse, long north/south legs move at constant speed.
function playbackDistance(a,b) {
  const start=mercator(a),end=mercator(b),rad=Math.PI/180;
  const latA=fromMercator(start)[1]*rad,latB=fromMercator(end)[1]*rad;
  const dlat=latB-latA,dpsi=(start[1]-end[1])*Math.PI*2;
  const dlon=(end[0]-start[0]-Math.round(end[0]-start[0]))*Math.PI*2;
  const q=Math.abs(dpsi)>1e-12?dlat/dpsi:Math.cos(latA);
  return 6371008.8*Math.hypot(dlat,q*dlon);
}

// Preview time is independent of visit dates. Each segment is its own path;
// independent pins and gaps between segments never create extra travel geometry.
export function playbackPlan(items,speedSettings) {
  const speeds=normalizeTransportSpeeds(speedSettings);let total=0;const segments=[];
  for(const item of items.filter(item=>item.kind==='segment'&&item.visible!==false)) {
    const coordinates=item.coordinates.map(point=>point.slice(0,2)),cumulative=[0];
    for(let i=1;i<coordinates.length;i++)cumulative.push(cumulative[i-1]+playbackDistance(coordinates[i-1],coordinates[i]));
    const length=cumulative.at(-1);if(!Number.isFinite(length)||length<.01)continue;
    const mode=Object.hasOwn(modeNames,item.mode)?item.mode:'car';
    const duration=length/playbackSpeed(mode,speeds);
    segments.push({id:item.id,name:item.name,vehicle:item.vehicle||'',vehicleIcon:mode==='car'?resolveVehicleIcon(item.vehicle).filename:null,mode,coordinates,cumulative,length,duration,offset:total});total+=duration;
  }
  const arrivals=routeArrivals(items,segments,playbackDistance),unique=new Map();
  for(const arrival of arrivals){const old=unique.get(arrival.key);if(!old)unique.set(arrival.key,{...arrival});else if(arrival.important)old.important=true;}
  const points=[...unique.values()];return {segments,total,points,arrivals,importantPoints:points.filter(point=>point.important)};
}
export const IMPORTANT_ARRIVAL_SECONDS=1.6;
// Every reached point stays in the map layer; bound transient callouts during dense, fast playback.
const MAX_ARRIVAL_CALLOUTS=64;
export const IMPORTANT_LABEL_HOLD_SECONDS=2;
export const IMPORTANT_LABEL_FADE_SECONDS=1;
export const IMPORTANT_LABEL_SECONDS=IMPORTANT_LABEL_HOLD_SECONDS+IMPORTANT_LABEL_FADE_SECONDS;
export function importantPointName(name){
  const value=String(name||'').trim();
  // Coordinate-only pins have no place name; retain both coordinates.
  if(/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(value))return value;
  return value.split(/[,，]/)[0].trim();
}
export function importantLabelOpacity(age){
  const fade=clamp((age-IMPORTANT_LABEL_HOLD_SECONDS)/IMPORTANT_LABEL_FADE_SECONDS,0,1);
  return 1-fade*fade*(3-2*fade);
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
export function checkedPlaybackPlan(journeys,speedSettings){
  const ordered=journeys.filter(j=>j.visible!==false).map((journey,index)=>{
    const items=journey.items.filter(i=>i.kind==='segment'&&i.visible!==false).map((item,order)=>({item,order,date:routeDate(item)})).sort((a,b)=>(a.date-b.date)||a.order-b.order);
    const date=items.find(i=>Number.isFinite(i.date))?.date??namedDate(journey.name);return {journey,index,date,plan:playbackPlan([...items.map(i=>i.item),...journey.items.filter(i=>i.kind==='point')],speedSettings)};
  }).filter(j=>j.plan.segments.length).sort((a,b)=>(a.date-b.date)||a.index-b.index);
  let total=0;const segments=[],queue=[],points=[],arrivals=[];
  ordered.forEach(({journey,plan},journeyIndex)=>{arrivals.push(...plan.arrivals.map(point=>({...point,elapsed:point.elapsed+total,tripId:journey.id,color:journey.color})));points.push(...plan.points.map(point=>({...point,elapsed:point.elapsed+total,tripId:journey.id,color:journey.color})));queue.push({id:journey.id,name:journey.name,color:journey.color,offset:total,duration:plan.total});for(const [index,segment]of plan.segments.entries())segments.push({...segment,offset:segment.offset+total,tripId:journey.id,tripName:journey.name,tripVideoTitle:journey.videoTitle?.trim()||journey.name,color:journey.color,journeyIndex,segmentIndex:index,segmentCount:plan.segments.length});total+=plan.total;});
  return {segments,total,journeys:queue,points,arrivals,importantPoints:points.filter(point=>point.important)};
}

// Interpolate in the same space as the map's route lines, including at high
// latitudes. Keep the short world copy when a leg crosses the date line.
function coordinateBetween(a,b,fraction,wrap=true) {
  if(fraction<=0)return [...a];if(fraction>=1)return [...b];
  const start=mercator(a),end=mercator(b);end[0]+=Math.round(start[0]-end[0]);
  const point=fromMercator(start.map((value,i)=>value+(end[i]-value)*fraction));
  if(wrap)point[0]=((point[0]+540)%360)-180;return point;
}
// Camera motion bridges disconnected legs without adding a route or changing
// travel time. Preview and export use the same deterministic transition.
export function playbackCameraPosition(plan,frame,rate=1){
  if(!frame?.index)return frame?.position;
  const previous=plan.segments[frame.index-1].coordinates.at(-1),start=frame.segment.coordinates[0];
  if(playbackDistance(previous,start)<10)return frame.position;
  const duration=Math.min(.9*rate,frame.segment.duration*.5);
  const progress=clamp((frame.elapsed-frame.segment.offset)/duration,0,1);
  return coordinateBetween(previous,frame.position,progress*progress*(3-2*progress));
}
function positionAt(segment,meters) {
  const d=clamp(meters,0,segment.length),c=segment.cumulative;
  if(d>=segment.length)return {position:[...segment.coordinates.at(-1)],vertex:c.length-1};
  let lo=1,hi=c.length-1;
  while(lo<hi){const middle=(lo+hi)>>1;if(c[middle]<=d)lo=middle+1;else hi=middle;}
  const a=segment.coordinates[lo-1],b=segment.coordinates[lo],fraction=(d-c[lo-1])/Math.max(1e-9,c[lo]-c[lo-1]);
  const start=mercator(a),end=mercator(b),latA=fromMercator(start)[1],latB=fromMercator(end)[1];
  const along=Math.abs(end[1]-start[1])>1e-12?(mercator([0,latA+(latB-latA)*fraction])[1]-start[1])/(end[1]-start[1]):fraction;
  return {position:coordinateBetween(a,b,along),vertex:lo};
}
export function playbackFrame(plan,seconds) {
  if(!plan.segments.length)return null;
  const elapsed=clamp(seconds,0,plan.total);let lo=0,hi=plan.segments.length-1;
  while(lo<hi){const mid=(lo+hi)>>1,segment=plan.segments[mid];if(elapsed>=segment.offset+segment.duration)lo=mid+1;else hi=mid;}const index=lo;
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
const preparedPaths=new WeakMap();
export function activePlaybackCoordinates(frame,scale) {
  const segment=frame.segment;
  let points=preparedPaths.get(segment);
  if(!points){let previous;points=segment.coordinates.map(coordinate=>{const p=mercator(coordinate);if(previous!==undefined)p[0]+=Math.round(previous-p[0]);previous=p[0];return p;});preparedPaths.set(segment,points);}
  const {indices}=pathAtScale(points,scale);
  let lo=0,hi=indices.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(indices[mid]<frame.vertex)lo=mid+1;else hi=mid;}
  const coordinates=indices.slice(0,lo).map(index=>[points[index][0]*360-180,segment.coordinates[index][1]]);
  // Retain the last original corner, so the line ends exactly at the position dot.
  if(frame.vertex>0&&indices[lo-1]!==frame.vertex-1)coordinates.push([...segment.coordinates[frame.vertex-1]]);
  coordinates.push(frame.position);return coordinates;
}
export function playbackIconOpacity(now,reducedMotion=false) {
  return reducedMotion?1:.25+.75*(1+Math.cos(now/1100*Math.PI*2))/2;
}
// Shared painter: live playback and MP4 frames use exactly the same artwork and paths.
export class PlaybackPainter {
  constructor(map,canvas){this.map=map;this.canvas=canvas;this.ctx=canvas.getContext('2d');this.images={};this.routes=[];this.state='paused';this.color='#31765c';}
  prepareVehicles(segments) {
    if(this.vehiclePlan===segments)return this.vehicleLoading;
    this.vehiclePlan=segments;this.vehicleImages??={};
    const names=new Set([DEFAULT_VEHICLE_ICON,...segments.filter(s=>s.mode==='car').map(s=>s.vehicleIcon||resolveVehicleIcon(s.vehicle).filename)]);
    return this.vehicleLoading=Promise.all([...names].map(async filename=>{const image=await loadVehicleIcon(filename);this.vehicleImages[filename]=image;if(filename===DEFAULT_VEHICLE_ICON)this.images.car=image;this.requestDraw?.();}));
  }
  sprite(mode,point,angle,size) {
    const ctx=this.ctx,icon=mode==='car'?(this.vehicleImages?.[this.frame?.segment.vehicleIcon]||this.images.car):this.images[mode];ctx.save();ctx.translate(...point);ctx.rotate(angle);if(mode==='car')ctx.scale(-1,1);
    ctx.shadowColor='#17354266';ctx.shadowBlur=5;ctx.shadowOffsetY=2;
    if(icon?.complete&&icon.naturalWidth){const height=size*icon.naturalHeight/icon.naturalWidth;ctx.drawImage(icon,-size/2,-height/2,size,height);}
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
      const coordinates=this.map.unwrapPlaybackCoordinates(route.frame?activePlaybackCoordinates(route.frame,this.map.playbackScale?.()||512):route.coordinates);
      const paths=projectPlaybackPath(coordinates,coordinate=>this.map.projectCoordinate(coordinate,false));
      const path=new Path2D();for(const points of paths)points.forEach((point,i)=>i?path.lineTo(...point):path.moveTo(...point));
      ctx.setLineDash(route.mode==='plane'?[14,14]:[]);
      ctx.globalAlpha=route.mode==='plane'?.5:1;
      if(route.mode!=='plane'){ctx.strokeStyle=this.map.theme==='dark'?'#10212a':'#fff9eb';ctx.lineWidth=7;ctx.stroke(path);}
      ctx.strokeStyle=route.color||this.color;ctx.lineWidth=3.5;ctx.stroke(path);
      this.drawnRoutes.push({path,id:route.id,tripId:this.tripId});
    }
    ctx.restore();
  }
  importantAge(node){
    const arrived=this.arrivalTimes?.get(node);
    return arrived===undefined?Math.max(0,((this.markerElapsed??this.frame.elapsed)-node.elapsed)/(this.rate||1)):Math.max(0,(this.markerClock??this.animationSeconds)-arrived);
  }
  updateArrivals(){
    const visiblePoints=this.plan?.points||this.plan?.importantPoints||[],points=this.plan?.arrivals||visiblePoints,elapsed=this.markerElapsed??this.frame.elapsed,count=arrivalCount(points,elapsed);
    if(this.arrivalPlan!==points||this.resetArrivals||elapsed<this.arrivalElapsed){
      this.arrivalTimes=new Map();this.activeArrivals=new Set();this.arrivalCursor=arrivalCount(points,elapsed-IMPORTANT_LABEL_SECONDS*(this.rate||1));this.arrivalPlan=points;this.resetArrivals=false;
    }
    for(let i=Math.max(this.arrivalCursor,count-MAX_ARRIVAL_CALLOUTS);i<count;i++){
      const node=points[i];
      // A revisit restarts this place's callout instead of painting two labels on top.
      for(const previous of this.activeArrivals)if(node.key&&previous.key===node.key&&previous.tripId===node.tripId){this.activeArrivals.delete(previous);this.arrivalTimes.delete(previous);}
      this.activeArrivals.add(node);
      if(this.activeArrivals.size>MAX_ARRIVAL_CALLOUTS){const oldest=this.activeArrivals.values().next().value;this.activeArrivals.delete(oldest);this.arrivalTimes.delete(oldest);}
      if(Number.isFinite(this.animationSeconds))this.arrivalTimes.set(node,this.animationSeconds-(this.frame.elapsed-node.elapsed)/(this.rate||1));
    }
    for(const node of this.activeArrivals)if(this.importantAge(node)>=IMPORTANT_LABEL_SECONDS){this.activeArrivals.delete(node);this.arrivalTimes.delete(node);}
    this.arrivalCursor=count;this.arrivalElapsed=elapsed;
    this.map.setPlaybackPoints?.(visiblePoints,arrivalCount(visiblePoints,elapsed),this.activeJourney?.id||this.tripId,this.activeJourney?.color||this.color);
  }
  drawImportantPoints(){
    const ctx=this.ctx;
    this.drawnImportantPoints=[];
    for(const node of this.activeArrivals||[]){
      const point=this.map.projectCoordinate(node.coordinates);if(!point)continue;
      const [x,y]=point;if(x< -40||y< -40||x>this.w+40||y>this.h+40)continue;
      const age=this.importantAge(node),motion=!this.reducedMotion?.matches,label=importantPointName(node.name),labelOpacity=importantLabelOpacity(age);
      const phase=clamp(age/IMPORTANT_ARRIVAL_SECONDS,0,1),pop=motion?1+.35*Math.sin(Math.min(1,age/.45)*Math.PI):1;
      const color=node.color||this.color,dark=this.map.theme==='dark',important=node.important!==false;
      ctx.save();ctx.setLineDash([]);
      if(motion&&phase<1){
        ctx.globalAlpha=(1-phase)*.75;ctx.strokeStyle=color;ctx.lineWidth=3*(1-phase)+1;
        ctx.beginPath();ctx.arc(x,y,12+34*phase,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
      }
      ctx.save();ctx.translate(x,y);ctx.scale(pop,pop);ctx.beginPath();ctx.arc(0,0,important?9:6,0,Math.PI*2);
      ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#fff9e9';ctx.lineWidth=2.5;ctx.stroke();
      if(important){ctx.beginPath();for(let i=0;i<10;i++){const angle=-Math.PI/2+i*Math.PI/5,r=i%2?3.1:7;const px=Math.cos(angle)*r,py=Math.sin(angle)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fillStyle='#fff9e9';ctx.fill();}ctx.restore();
      if(label&&labelOpacity>0){
        ctx.globalAlpha=labelOpacity;ctx.font='600 13px system-ui, sans-serif';
        const max=Math.max(60,Math.min(270,this.w-40));this.labelLayouts??=new WeakMap();let layout=this.labelLayouts.get(node);
        if(!layout||layout.max!==max){const words=Array.from(label);let text=label;while(words.length&&ctx.measureText(text).width>max-20){words.pop();text=words.join('')+'…';}layout={max,text,width:ctx.measureText(text).width+20};this.labelLayouts.set(node,layout);}
        const {text,width}=layout,left=clamp(x-width/2,8,this.w-width-8),top=y+19;
        ctx.shadowColor='#102b3426';ctx.shadowBlur=8;ctx.shadowOffsetY=2;
        ctx.beginPath();ctx.roundRect(left,top,width,28,8);ctx.fillStyle=dark?'#18392f':'#fffdf4';ctx.fill();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
        ctx.fillStyle=dark?'#fff9e9':'#234738';ctx.textBaseline='middle';ctx.fillText(text,left+10,top+14);
      }
      ctx.restore();this.drawnImportantPoints.push({...node,point,age,label,labelOpacity});
    }
  }
  hitTest(point) {
    const ctx=this.ctx;ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.setLineDash([]);ctx.lineWidth=12;
    const hit=this.drawnImportantPoints?.findLast(node=>Math.hypot(node.point[0]-point[0],node.point[1]-point[1])<16)||this.drawnRoutes?.findLast(route=>ctx.isPointInStroke(route.path,...point));ctx.restore();return hit;
  }
  draw() {
    const ctx=this.ctx;if(!ctx)return;if(!this.frame||this.state==='idle'){if(this.overlayVisible){ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.overlayVisible=false;}this.drawnRoutes=[];this.drawnImportantPoints=[];return;}this.overlayVisible=true;ctx.setTransform(this.dpr||1,0,0,this.dpr||1,0,0);ctx.clearRect(0,0,this.w||0,this.h||0);
    this.drawnRoutes=[];
    if(!this.frame||this.state==='idle')return;
    this.updateArrivals();
    if(this.state==='finished'){this.drawImportantPoints();return;}
    this.drawRoutes();
    const frame=this.frame,mode=frame.segment.mode,point=this.map.projectCoordinate(frame.position);if(!point){this.drawImportantPoints();return;}
    ctx.lineCap='round';ctx.lineJoin='round';
    if(mode==='plane'){
      const projected=projectPlaybackTrail(frame,coordinate=>this.map.projectCoordinate(coordinate),{maxJump:Math.max(this.w,this.h)/2});
      const ahead=this.map.projectCoordinate(frame.ahead),back=behindPoint(projected,4);
      const angle=ahead&&Math.hypot(ahead[0]-point[0],ahead[1]-point[1])>.1?Math.atan2(ahead[1]-point[1],ahead[0]-point[0])+Math.PI/2:back?.angle||0;
      this.contrails(projected);this.sprite(mode,point,angle,58*.7);this.drawImportantPoints();return;
    }
    // A fixed point anchors the exact location. Side-view artwork stays upright
    // above it; only the artwork fades, at a wall-clock frequency independent of speed.
    const ahead=this.map.projectCoordinate(frame.ahead),previous=this.map.projectCoordinate(frame.segment.coordinates[Math.max(0,frame.vertex-1)]);
    const dx=ahead&&Math.abs(ahead[0]-point[0])>.1?ahead[0]-point[0]:previous?point[0]-previous[0]:0;
    if(Math.abs(dx)>.1)this.facing=dx<0?-1:1;
    ctx.save();
    ctx.beginPath();ctx.arc(...point,13,0,Math.PI*2);ctx.fillStyle=this.color+'35';ctx.fill();
    ctx.shadowColor=this.color;ctx.shadowBlur=9;ctx.beginPath();ctx.arc(...point,6.5,0,Math.PI*2);ctx.fillStyle=this.color;ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#fffdf4';ctx.lineWidth=2.5;ctx.stroke();
    ctx.beginPath();ctx.moveTo(point[0],point[1]-10);ctx.lineTo(point[0],point[1]-19);ctx.strokeStyle=this.color;ctx.lineWidth=2;ctx.stroke();
    ctx.translate(point[0],point[1]-32);ctx.scale(this.facing||1,1);
    ctx.globalAlpha=this.state==='playing'?playbackIconOpacity(this.renderTimeMs??performance.now(),this.reducedMotion?.matches):1;
    this.sprite(mode,[0,0],0,mode==='train'?43.2:38.4);ctx.restore();this.drawImportantPoints();
  }
}

export class JourneyPlayback extends PlaybackPainter {
  constructor(map) {
    super(map,el('journey-animation'));this.host=el('journey-player');
    this.scope='current';this.checkedJourneys=[];this.controlsHidden=false;this.plan={segments:[],total:0};this.routes=[];this.elapsed=0;this.state='idle';this.rate=1;this.follow=true;this.frame=null;this.images={};this.animationSeconds=0;this.arrivalTimes=new Map();
    this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
    el('player-speed').replaceChildren(...PLAYBACK_RATES.map(rate=>{const option=document.createElement('option');option.value=rate;option.textContent=rate+'×';option.selected=rate===this.rate;return option;}));
    for(const mode of Object.keys(modeNames).filter(mode=>mode!=='car')){const image=new Image();image.onload=()=>this.requestDraw();image.src='images/journey-icons/playback/'+mode+'.svg';this.images[mode]=image;}
    map.onFrame=()=>this.draw();map.onUserPan=()=>{this.follow=false;el('player-follow').checked=false;};
    map.onPlaybackPick=point=>this.hitTest(point);
    el('player-toggle').addEventListener('click',()=>this.state==='playing'?this.pause():this.play());
    el('player-exit').addEventListener('click',()=>this.exit());
    el('player-restart').addEventListener('click',()=>{this.seek(0);this.play();});
    el('play-journey').addEventListener('click',()=>{this.startScope('current');this.canvas.parentElement.scrollIntoView({block:'center',behavior:'smooth'});});
    el('play-checked-journeys').addEventListener('click',()=>{this.startScope('checked');this.canvas.parentElement.scrollIntoView({block:'center',behavior:'smooth'});});
    el('player-progress').addEventListener('input',()=>this.seek(Number(el('player-progress').value)/1000));
    el('player-speed').addEventListener('change',()=>{this.rate=Number(el('player-speed').value);this.lastTime=performance.now();this.updateUI();});
    el('player-follow').addEventListener('change',()=>{this.follow=el('player-follow').checked;if(this.follow&&this.frame)this.map.followPlayback(playbackCameraPosition(this.plan,this.frame,this.rate),true);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();});
    new ResizeObserver(()=>this.resize()).observe(this.canvas.parentElement);this.resize();
  }
  sync(journey,checkedJourneys=this.checkedJourneys,speedSettings=this.transportSpeeds) {
    const speeds=normalizeTransportSpeeds(speedSettings),speedChanged=JSON.stringify(speeds)!==JSON.stringify(this.transportSpeeds);
    this.activeJourney=journey;this.checkedJourneys=checkedJourneys;
    const sources=this.scope==='checked'?checkedJourneys.filter(j=>j.visible!==false):[journey];
    const signature=JSON.stringify([this.scope,...sources.map(j=>[j.id,j.name,j.color,...j.items.filter(i=>i.visible!==false).map(({id,kind,name,mode,vehicle,coordinates,startNode,endNode,important,start,end,trackTimes,extra})=>({id,kind,name,mode,vehicle,coordinates,startNode,endNode,important,start,end,firstTrackTime:trackTimes?.[0],folder:extra?.sourceFolderPath}))])]);
    const rebuild=()=>this.scope==='checked'?checkedPlaybackPlan(sources,speeds):playbackPlan(journey.items,speeds);
    if(signature!==this.signature){this.exit();this.signature=signature;this.transportSpeeds=speeds;this.plan=rebuild();this.prepareVehicles(this.plan.segments).catch(()=>{});}
    else if(speedChanged){
      const frame=this.frame;this.transportSpeeds=speeds;this.plan=rebuild();
      const segment=frame&&this.plan.segments[frame.index];
      this.elapsed=this.state==='finished'?this.plan.total:segment?segment.offset+segment.duration*frame.progress:0;
      this.lastTime=performance.now();if(frame&&!['idle','finished'].includes(this.state))this.advance(true);
    }
    const segment=this.frame?.segment;this.tripId=segment?.tripId||journey.id;this.color=segment?.color||journey.color||'#bc5c28';
    this.updateMapVisibility();this.updateControls();
    const playable=j=>j.items.some(i=>i.kind==='segment'&&i.visible!==false&&i.coordinates.length>1);
    el('play-journey').disabled=!playable(journey);el('play-checked-journeys').disabled=!checkedJourneys.some(j=>j.visible!==false&&playable(j));
    this.canvas.parentElement.classList.toggle('has-playback',this.plan.segments.length>0);this.updateUI();this.requestDraw();
  }
  startScope(scope){if(this.scope!==scope){this.scope=scope;this.signature=null;this.sync(this.activeJourney,this.checkedJourneys);}this.seek(0);this.play();}
  updateMapVisibility(){
    if(['idle','finished'].includes(this.state)){this.map.setPlaybackJourney(null);this.visibilityIndex=null;return;}
    const index=this.frame?.index||0;
    if(this.visibilityIndex===index&&this.visibilityPlan===this.plan)return;
    this.visibilityIndex=index;this.visibilityPlan=this.plan;
    if(this.scope==='checked'){const journeyIndex=this.frame?.segment.journeyIndex||0;this.map.setPlaybackJourney(this.plan.journeys.slice(journeyIndex).map(j=>j.id),index);}
    else this.map.setPlaybackJourney(this.tripId,index);
  }
  setControlsHidden(hidden){this.controlsHidden=hidden;this.updateControls();}
  updateControls(){this.host.hidden=!this.plan.segments.length||this.controlsHidden;el('show-player').hidden=!this.plan.segments.length||!this.controlsHidden;}
  resetArrivalClock(){this.animationSeconds=this.elapsed/this.rate;this.arrivalTimes=new Map();this.markerClock=undefined;this.resetArrivals=true;}
  play() {
    if(!this.plan.segments.length||this.state==='playing')return;
    if(this.elapsed>=this.plan.total){this.elapsed=0;this.resetArrivalClock();}
    cancelAnimationFrame(this.markerRaf);this.markerElapsed=undefined;this.markerClock=undefined;this.state='playing';this.lastTime=performance.now();this.advance(true);this.updateUI();this.requestDraw();
    cancelAnimationFrame(this.raf);this.raf=requestAnimationFrame(time=>this.tick(time));
  }
  pause() {cancelAnimationFrame(this.raf);this.raf=0;if(this.state==='playing')this.state='paused';this.updateUI();this.requestDraw();}
  releaseOverlay(clearPoints=true){cancelAnimationFrame(this.markerRaf);this.markerElapsed=undefined;this.markerClock=undefined;this.drawnImportantPoints=[];if(clearPoints)this.map.setPlaybackPoints(null);this.visibilityIndex=null;this.map.setPlaybackJourney(null);this.routes=[];this.drawnRoutes=[];this.ctx.clearRect(0,0,this.canvas.width,this.canvas.height);this.overlayVisible=false;}
  exit(){cancelAnimationFrame(this.raf);this.raf=0;this.state='idle';this.elapsed=0;this.resetArrivalClock();this.frame=null;this.releaseOverlay();this.updateUI();}
  finish(){
    cancelAnimationFrame(this.raf);this.raf=0;this.state='finished';this.releaseOverlay(false);this.updateArrivals();this.updateMapVisibility();
    // Continue the label clock after the route ends, including reduced-motion mode.
    const started=performance.now();let remaining=0;
    for(const point of this.activeArrivals||[])remaining=Math.max(remaining,IMPORTANT_LABEL_SECONDS-this.importantAge(point));
    const paint=now=>{this.markerClock=this.animationSeconds+(now-started)/1000;this.requestDraw();if(now-started<remaining*1000)this.markerRaf=requestAnimationFrame(paint);else this.markerRaf=0;};
    if(remaining>0)this.markerRaf=requestAnimationFrame(paint);
  }
  seek(fraction) {
    cancelAnimationFrame(this.markerRaf);this.markerElapsed=undefined;
    this.elapsed=clamp(fraction,0,1)*this.plan.total;this.resetArrivalClock();this.lastTime=performance.now();
    if(this.elapsed===this.plan.total){cancelAnimationFrame(this.raf);this.state='finished';}
    else if(this.state!=='playing')this.state='paused';
    this.advance(true);if(this.state==='finished')this.finish();this.updateUI();this.requestDraw();
  }
  tick(now) {
    if(this.state!=='playing')return;
    const previous=this.elapsed;
    this.elapsed=Math.min(this.plan.total,this.elapsed+Math.min(.2,(now-this.lastTime)/1000)*this.rate);this.lastTime=now;
    this.animationSeconds+=(this.elapsed-previous)/this.rate;
    this.advance();
    if(this.elapsed>=this.plan.total)this.finish();
    this.updateUI(false);this.requestDraw();
    if(this.state==='playing')this.raf=requestAnimationFrame(time=>this.tick(time));
  }
  advance(force=false) {
    this.frame=playbackFrame(this.plan,this.elapsed);if(!this.frame)return;
    this.updateArrivals();
    const segment=this.frame.segment;this.tripId=segment.tripId||this.activeJourney?.id||this.tripId;this.color=segment.color||this.activeJourney?.color||this.color;
    // The basemap keeps completed segments. Only the current segment is animated.
    this.map.preparePlayback?.(this.plan.segments,this.activeJourney?.id||this.tripId);
    this.routes=this.frame.progress>0?[{...segment,frame:this.frame}]:[];
    this.updateMapVisibility();
    if(this.follow)this.map.followPlayback(playbackCameraPosition(this.plan,this.frame,this.rate),force);
  }
  updateUI(force=true) {
    const now=performance.now();if(!force&&now-(this.uiTime||0)<100&&this.uiIndex===this.frame?.index&&this.uiState===this.state)return;this.uiTime=now;this.uiIndex=this.frame?.index;this.uiState=this.state;
    const segment=this.frame?.segment||this.plan.segments[0],index=this.frame?.index||0;
    const units=this.map.units||'imperial',speed=playbackSpeed(segment?.mode,this.transportSpeeds);if(this.speedUnits!==units||this.speedMetersPerSecond!==speed){this.speedUnits=units;this.speedMetersPerSecond=speed;for(const option of el('player-speed').options)option.textContent=option.value+'× · '+distanceLabel(speed*Number(option.value),units)+'/s';}
    el('player-exit').disabled=this.state==='idle';
    const playing=this.state==='playing',label=playing?'Pause journey':this.state==='finished'?'Replay journey':this.state==='paused'?'Resume journey':'Play journey';
    el('player-toggle').setAttribute('aria-label',t(label));el('player-toggle').title=t(label);
    el('player-toggle').querySelector('.player-play-icon').toggleAttribute('hidden',playing);el('player-toggle').querySelector('.player-pause-icon').toggleAttribute('hidden',!playing);
    this.host.dataset.state=this.state;
    const status=t({idle:'Ready to play',playing:'Playing',paused:'Paused',finished:'Finished'}[this.state]);
    const journeys=this.plan.journeys||[],queue=this.scope==='checked'&&journeys.length>0;el('player-queue').hidden=!queue;el('player-queue').textContent=queue&&segment?t('Journey {index} of {total}',{index:segment.journeyIndex+1,total:journeys.length})+' · '+segment.tripName:'';this.host.dataset.scope=this.scope;this.host.dataset.journeyId=segment?.tripId||this.tripId||'';
    const text=segment?`${status} · ${t('Segment {index} of {total}',{index:queue?segment.segmentIndex+1:index+1,total:queue?segment.segmentCount:this.plan.segments.length})} · ${t(modeNames[segment.mode])}${segment.mode==='car'&&segment.vehicle?' · '+segment.vehicle:''}`:t('Route playback');
    if(el('player-status').textContent!==text)el('player-status').textContent=text;
    el('player-title').textContent=segment?.name||'';this.host.dataset.mode=segment?.mode||'';
    const fraction=this.plan.total?this.elapsed/this.plan.total:0;el('player-progress').value=String(Math.round(fraction*1e9)/1e6);el('player-percent').value=Math.round(fraction*100)+'%';
    el('player-progress').setAttribute('aria-valuetext',Math.round(fraction*100)+'%');
    this.host.style.setProperty('--journey-color',this.color);this.host.dataset.progress=String(fraction);this.host.dataset.segment=String(index);
  }
  resize() {
    const parent=this.canvas.parentElement;this.w=parent.clientWidth;this.h=parent.clientHeight;this.dpr=Math.min(devicePixelRatio||1,2);
    const width=Math.round(this.w*this.dpr),height=Math.round(this.h*this.dpr);if(this.canvas.width!==width)this.canvas.width=width;if(this.canvas.height!==height)this.canvas.height=height;this.requestDraw();
  }
  // Paint the overlay after the basemap has rendered the same camera state.
  // Drawing here and again on map.render exposed two different poses per frame.
  requestDraw() {this.map.requestPlaybackFrame();}
}
