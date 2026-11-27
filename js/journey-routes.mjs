const rad = Math.PI / 180;
export function distance(a,b) {
  const dlat=(b[1]-a[1])*rad,dlon=(b[0]-a[0])*rad;
  return 6371008.8 * 2 * Math.asin(Math.min(1,Math.sqrt(Math.sin(dlat/2)**2 + Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dlon/2)**2)));
}
export const routeDistance = points => points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0);
export function distanceLabel(meters, units = 'metric') {
  if (units === 'imperial') {
    const miles = meters / 1609.344;
    return miles < .1 ? `${Math.round(meters / .3048).toLocaleString()} ft` : `${miles.toLocaleString(undefined,{maximumFractionDigits:1})} mi`;
  }
  return meters < 1000 ? `${Math.round(meters).toLocaleString()} m` : `${(meters/1000).toLocaleString(undefined,{maximumFractionDigits:1})} km`;
}
export function parseLatLon(query) {
  const pair = query.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!pair) return null;
  const lat=Number(pair[1]),lon=Number(pair[2]);
  if (Math.abs(lat)>90 || Math.abs(lon)>180) throw new Error('Coordinates must be latitude (−90 to 90), longitude (−180 to 180).');
  return {name:`${lat.toFixed(5)}, ${lon.toFixed(5)}`,coordinates:[lon,lat]};
}
let lastSearch=0, geocodeQueue=Promise.resolve();
const cache=new Map();
export function geocode(query,signal) {
  const coordinate=parseLatLon(query); if (coordinate) return Promise.resolve([coordinate]);
  const q=query.trim(); if (q.length<2) throw new Error('Enter at least two characters or a latitude, longitude pair.');
  if (cache.has(q)) return Promise.resolve(cache.get(q));
  // Photon supports search-as-you-type. Debounce in the UI; serialize and cache here.
  const task=geocodeQueue.catch(()=>{}).then(async()=>{
    signal?.throwIfAborted();
    await new Promise((resolve,reject)=>{
      const cancel=()=>{clearTimeout(timer);reject(signal.reason);};
      const timer=setTimeout(()=>{signal?.removeEventListener('abort',cancel);resolve();},Math.max(0,1100-(Date.now()-lastSearch)));
      signal?.addEventListener('abort',cancel,{once:true});
    });
    signal?.throwIfAborted(); lastSearch=Date.now();
    const url='https://photon.komoot.io/api/?limit=5&q='+encodeURIComponent(q);
    const response=await fetch(url,{signal:signal ? AbortSignal.any([signal,AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error('Place search is temporarily unavailable. Try coordinates or choose a point on the map.');
    const data=await response.json();
    const result=(data.features||[]).filter(f=>f.geometry?.type==='Point').map(f=>{
      const p=f.properties,address=[p.housenumber,p.street].filter(Boolean).join(' ');
      return {name:[...new Set([p.name,address,p.city,p.state,p.country].filter(Boolean))].join(', '),coordinates:f.geometry.coordinates.slice(0,2)};
    });
    cache.set(q,result); return result;
  }); geocodeQueue=task; return task;
}
function greatCircle(a,b) {
  const d=distance(a,b)/6371008.8;
  if(d<1e-8) return [a,b];
  // Antipodal routes have no unique shortest arc; an equatorial waypoint resolves it.
  if(Math.abs(Math.PI-d)<1e-5) { const mid=[a[0]+90>180?a[0]-270:a[0]+90,0]; return [...greatCircle(a,mid),...greatCircle(mid,b).slice(1)]; }
  const count=Math.max(16,Math.min(180,Math.ceil(d*100))),result=[];
  for(let i=0;i<=count;i++) { const f=i/count,A=Math.sin((1-f)*d)/Math.sin(d),B=Math.sin(f*d)/Math.sin(d);
    const x=A*Math.cos(a[1]*rad)*Math.cos(a[0]*rad)+B*Math.cos(b[1]*rad)*Math.cos(b[0]*rad),y=A*Math.cos(a[1]*rad)*Math.sin(a[0]*rad)+B*Math.cos(b[1]*rad)*Math.sin(b[0]*rad),z=A*Math.sin(a[1]*rad)+B*Math.sin(b[1]*rad);
    result.push([Math.atan2(y,x)/rad,Math.atan2(z,Math.hypot(x,y))/rad]); }
  result[0]=a;result[result.length-1]=b;return result;
}
const hubs=[['Atlanta',-84.428,33.641],['Chicago',-87.907,41.974],['Denver',-104.673,39.856],['Dallas',-97.04,32.899],['New York',-73.778,40.641],['Los Angeles',-118.409,33.942],['Seattle',-122.309,47.449],['Miami',-80.287,25.795],['San Francisco',-122.379,37.621],['London',-.454,51.47],['Paris',2.55,49.01],['Frankfurt',8.57,50.037],['Amsterdam',4.764,52.31],['Istanbul',28.752,41.275],['Dubai',55.364,25.253],['Doha',51.608,25.273],['Singapore',103.99,1.364],['Tokyo',139.78,35.55],['Seoul',126.45,37.46],['Beijing',116.604,40.079],['Shanghai',121.805,31.144],['Hong Kong',113.918,22.308],['Sydney',151.177,-33.939],['Auckland',174.785,-37.008],['Honolulu',-157.922,21.319],['Toronto',-79.624,43.677],['Mexico City',-99.072,19.436],['São Paulo',-46.473,-23.435],['Johannesburg',28.246,-26.136]];
const railHubs=[['Chicago',-87.64,41.878],['Washington, DC',-77.006,38.897],['New York',-73.994,40.75],['Philadelphia',-75.182,39.956],['Baltimore',-76.616,39.307],['Wilmington',-75.552,39.737],['New Haven',-72.925,41.298],['Albany',-73.741,42.641],['Harrisburg',-76.878,40.263],['Pittsburgh',-79.99,40.444],['Richmond',-77.429,37.534],['Raleigh',-78.647,35.777],['Charlotte',-80.823,35.242],['Boston',-71.055,42.352],['Los Angeles',-118.236,34.056],['Seattle',-122.329,47.599],['Denver',-105,39.753],['Portland',-122.676,45.529],['New Orleans',-90.078,29.946],['San Francisco Bay Area',-122.291,37.841],['Sacramento',-121.5,38.585],['London',-.126,51.53],['Paris',2.355,48.881],['Berlin',13.369,52.526],['Frankfurt',8.663,50.107],['Madrid',-3.689,40.406],['Rome',12.502,41.901],['Vienna',16.377,48.185],['Tokyo',139.767,35.681],['Osaka',135.5,34.734],['Kyoto',135.758,34.985],['Beijing',116.379,39.865],['Shanghai',121.327,31.194],['Wuhan',114.424,30.609],['Guangzhou',113.27,22.989]];
function plannedOptions(a,b,mode) {
  if(mode==='transit'){const coordinates=greatCircle(a,b);return [{label:'Direct planning sketch',coordinates,distance:routeDistance(coordinates),source:'Planning sketch',note:'Geographic sketch; public transport routes and schedules are not verified. Import a route file for exact geometry.'}];}
  const direct=distance(a,b),via=(mode==='plane'?hubs:railHubs).map(([name,lon,lat])=>({name,coordinates:[lon,lat]})).filter(h=>distance(a,h.coordinates)>30000&&distance(b,h.coordinates)>30000).map(h=>({...h,total:distance(a,h.coordinates)+distance(h.coordinates,b)})).sort((x,y)=>x.total-y.total).filter(h=>h.total<direct*2.2+150000).slice(0,4);
  const make=(label,waypoints)=>{const points=waypoints.flatMap((p,i)=>i?greatCircle(waypoints[i-1],p).slice(i===1?0:1):[]);return {label,coordinates:points,distance:routeDistance(points),source:'Planning sketch',note:mode==='plane'?'Great-circle sketch; flight availability and connections are not verified.':'Geographic sketch; does not follow rail tracks. Verify service or import an actual rail KML.'};};
  return [make('Direct planning sketch',[a,b]),...via.map(h=>make('Plan via '+h.name,[a,h.coordinates,b]))];
}
let walkingQueue=Promise.resolve(),lastWalkingRequest=0;
function walkingFetch(url,signal) {
  const request=walkingQueue.catch(()=>{}).then(async()=>{
    signal.throwIfAborted();
    await new Promise((resolve,reject)=>{const cancel=()=>{clearTimeout(timer);reject(signal.reason);};const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},Math.max(0,1100-(Date.now()-lastWalkingRequest)));signal.addEventListener('abort',cancel,{once:true});});
    signal.throwIfAborted();lastWalkingRequest=Date.now();return fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(18000)])});
  });walkingQueue=request;return request;
}
async function roadRequest(points,signal,alternatives=true,mode='car') {
  const walk=mode==='walk',base=walk?'https://routing.openstreetmap.de/routed-foot/route/v1/driving/':'https://router.project-osrm.org/route/v1/driving/';
  const url=base+points.map(p=>p.join(',')).join(';')+'?overview=full&geometries=geojson&steps=false&alternatives='+(alternatives?'true':'false');
  const response=walk?await walkingFetch(url,signal):await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(18000)])});
  if(!response.ok) throw new Error(walk?'Walking routing is unavailable. Try again, or import a walking KML.':'Road routing is unavailable. Try again, or import an existing route KML.');
  const data=await response.json();if(data.code!=='Ok')throw new Error(walk?'No walking route was found between these places.':'No drivable route was found between these places.');
  if(data.waypoints?.some(p=>p.distance>(walk?1000:10000)))throw new Error(walk?'A place is too far from the walking network. Choose a nearby trail or sidewalk.':'A place is too far from the road network. Choose a nearby road access point.');
  return data.routes;
}
export async function findRoutes(a,b,mode,signal,onProgress=()=>{}) {
  if(distance(a,b)<10) throw new Error('Choose two different places, at least 10 metres apart.');
  if(!['car','walk'].includes(mode))return plannedOptions(a,b,mode);
  const walk=mode==='walk',raw=await roadRequest([a,b],signal,true,mode),options=[];
  function add(route,label) {
    const coordinates=route.geometry.coordinates;
    if(options.some(o=>Math.abs(o.distance-route.distance)<Math.max(walk?15:80,route.distance*.003)&&Math.abs(o.duration-route.duration)<60))return;
    options.push({label,coordinates,distance:route.distance,duration:route.duration,source:walk?'FOSSGIS / OpenStreetMap':'OSRM / OpenStreetMap',note:walk?'Pedestrian-network route. Check trail access, closures and conditions before walking.':'Road-network route. Traffic, road closures and travel conditions are not live.'});
  }
  raw.forEach((r,i)=>add(r,i?(walk?'Alternative walking route ':'Alternative road route ')+i:walk?'Recommended walking route':'Recommended road route'));
  if(options.length<3) {
    onProgress(walk?'Looking for additional walking routes via nearby waypoints…':'Looking for additional road routes via nearby waypoints…');
    const dx=((b[0]-a[0]+540)%360)-180,dy=b[1]-a[1],span=Math.hypot(dx,dy),offset=Math.min(walk?.025:1.4,span*.16);
    for(const factor of [1,-1,2,-2]) {
      if(options.length>=3)break;signal.throwIfAborted();
      const lon=((a[0]+dx/2-dy/span*offset*factor+540)%360)-180,lat=Math.max(-84,Math.min(84,a[1]+dy/2+dx/span*offset*factor));
      try{const routes=await roadRequest([a,[lon,lat],b],signal,false,mode);if(routes[0].distance<raw[0].distance*2.2)add(routes[0],`${walk?'Walking':'Road'} detour via ${lat.toFixed(2)}, ${lon.toFixed(2)}`);}catch(error){if(signal.aborted)throw error;}
    }
  }
  return options.slice(0,5);
}
