import {isTransportMode} from './journey-transport.mjs';
import {uid,validCoordinate,validateTimes,importKML,exportJourneysKML,downloadFile,safeFilename} from './journey-kml.mjs';
const LIMIT=10*1024*1024,UNPACK_LIMIT=50*1024*1024;
let zipLibrary;
async function zipClass(){await(zipLibrary ||= import('./vendor/jszip-3.10.1.js'));return globalThis.JSZip;}
function base64(bytes){let text='';for(let offset=0;offset<bytes.length;offset+=32768)text+=String.fromCharCode(...bytes.subarray(offset,offset+32768));return btoa(text);}
function readZipText(entry){return new Promise((resolve,reject)=>{let length=0,done=false;const parts=[],stream=entry.internalStream('string');stream.on('data',part=>{if(done)return;length+=part.length;if(length>LIMIT){done=true;stream.pause();reject(new Error('Please import a KML smaller than 10 MB.'));}else parts.push(part);});stream.on('end',()=>{if(!done){done=true;resolve(parts.join(''));}});stream.on('error',error=>{if(!done){done=true;reject(error);}});stream.resume();});}
function zipLimit(){const error=new Error('This ZIP expands beyond the 50 MB limit.');error.archiveLimit=true;return error;}
function consumeArchive(budget,size){if(budget){if(budget.used+size>UNPACK_LIMIT)throw zipLimit();budget.used+=size;}}
function readZipBytes(entry,budget){
  if((entry._data?.uncompressedSize||0)>LIMIT)throw new Error('Please import a file smaller than 10 MB.');
  return new Promise((resolve,reject)=>{
    let size=0,done=false;const parts=[],stream=entry.internalStream('uint8array');
    stream.on('data',part=>{if(done)return;size+=part.byteLength;const error=size>LIMIT?new Error('Please import a file smaller than 10 MB.'):budget.used+size>UNPACK_LIMIT?zipLimit():null;if(error){done=true;stream.pause();reject(error);}else parts.push(part);});
    stream.on('end',()=>{if(done)return;done=true;consumeArchive(budget,size);const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}resolve(bytes);});
    stream.on('error',error=>{if(!done){done=true;reject(error);}});stream.resume();
  });
}
// ZIP is a collection of independent journey files; KMZ remains one journey.
// Extract only one supported entry at a time, including entries in subfolders.
export async function* importJourneyEntries(file,onEntry=()=>{}){
  if(!/\.zip$/i.test(file.name)){onEntry(file.name);yield {name:file.name,...await importJourneyFile(file)};return;}
  if(file.size>UNPACK_LIMIT)throw new Error('Please import a ZIP smaller than 50 MB.');
  const Zip=await zipClass();let zip;try{zip=await Zip.loadAsync(await file.arrayBuffer());}catch{throw new Error('This file is not a readable ZIP archive.');}
  const entries=Object.values(zip.files).filter(entry=>!entry.dir);
  if(entries.length>1000)throw new Error('This ZIP contains more than 1,000 files.');
  if(entries.reduce((sum,e)=>sum+(e._data?.uncompressedSize||0),0)>UNPACK_LIMIT)throw zipLimit();
  const supported=entries.filter(e=>/\.(kml|kmz|geojson|json)$/i.test(e.name)&&!e.name.split('/').some(part=>part==='__MACOSX'||part.startsWith('._')));
  if(!supported.length)throw new Error('This ZIP contains no KML, KMZ or GeoJSON files.');
  const budget={used:0};
  for(const entry of supported){
    const name=file.name+' / '+entry.name;onEntry(name);
    try{const bytes=await readZipBytes(entry,budget),source=new File([bytes],entry.name.split('/').at(-1));yield {name,...await importJourneyFile(source,{budget})};}
    catch(error){yield {name,error:error?.message||String(error)};if(error.archiveLimit)break;}
  }
}
export function importGeoJSON(text,name='Imported journey'){
  if(text.length>LIMIT)throw new Error('Please import a file smaller than 10 MB.');
  let data;try{data=JSON.parse(text);}catch{throw new Error('This file is not valid GeoJSON.');}
  if(!data||typeof data!=='object')throw new Error('This file is not valid GeoJSON.');
  if(data.crs&&!/4326|CRS84/i.test(JSON.stringify(data.crs)))throw new Error('GeoJSON must use WGS84 longitude and latitude.');
  const features=data.type==='FeatureCollection'?data.features:data.type==='Feature'?[data]:[{type:'Feature',properties:{},geometry:data}];
  if(!Array.isArray(features))throw new Error('This file is not valid GeoJSON.');
  const items=[],warnings=[],used=new Set();
  for(const feature of features){
    if(feature?.type!=='Feature')throw new Error('This file is not valid GeoJSON.');
    const props=feature.properties&&typeof feature.properties==='object'?feature.properties:{},meta=props.journeyStudio||{};
    const visit=geometry=>{
      if(!geometry){warnings.push('A feature without geometry was retained in the source archive.');return;}
      if(geometry.type==='GeometryCollection'){if(!Array.isArray(geometry.geometries))throw new Error('This file is not valid GeoJSON.');geometry.geometries.forEach(visit);return;}
      if(['MultiPoint','MultiLineString'].includes(geometry.type)){if(!Array.isArray(geometry.coordinates))throw new Error('This file is not valid GeoJSON.');geometry.coordinates.forEach(coordinates=>visit({type:geometry.type==='MultiPoint'?'Point':'LineString',coordinates}));return;}
      if(!['Point','LineString'].includes(geometry.type)){warnings.push('Not editable: '+geometry.type+'. Original data is retained in the source archive.');return;}
      const point=geometry.type==='Point',coords=geometry.coordinates;
      if(point?!validCoordinate(coords):!Array.isArray(coords)||coords.length<2||!coords.every(validCoordinate))throw new Error('This file contains invalid or out-of-range coordinates.');
      let start=String(meta.start??props.start??props.time??''),end=String(meta.end??props.end??'');
      try{validateTimes(start,end);}catch{warnings.push('An unsupported time was retained in metadata; edit its date before exporting.');start=end='';}
      const id=typeof meta.id==='string'&&!used.has(meta.id)?meta.id:uid();used.add(id);
      const extra={...(meta.extra&&typeof meta.extra==='object'?meta.extra:{}),geojsonProperties:props,geojsonFeatureId:feature.id};
      // Avoid recursively nesting our own exported metadata on every round trip.
      if(props.journeyStudio){extra.geojsonProperties={...props};delete extra.geojsonProperties.journeyStudio;}
      const item={id,kind:point?'point':'segment',name:String(meta.name??props.name??props.title??'Untitled place'),coordinates:coords,notes:String(meta.notes??props.description??props.notes??''),start,end,important:!!(meta.important??props.important),visible:(meta.visible??props.visible)!==false,altitudeMode:meta.altitudeMode||'clampToGround',extra};
      if(!point){Object.assign(item,{mode:isTransportMode(meta.mode??props.mode)?(meta.mode??props.mode):'car',vehicle:String(meta.vehicle??props.vehicle??''),trackTimes:meta.trackTimes,routeSource:meta.routeSource||'Imported GeoJSON',routeLabel:meta.routeLabel||'Imported geometry'});for(const key of ['startNode','endNode'])item[key]=validCoordinate(meta[key]?.coordinates)?meta[key]:{name:key==='startNode'?'Start':'Destination',coordinates:coords[key==='startNode'?0:coords.length-1],important:false};}
      items.push(item);
    };visit(feature.geometry);
  }
  if(!items.length)throw new Error('No editable points or line routes were found in this file.');
  return {trip:{id:uid(),name:String(data.name||name),color:data.journeyStudio?.color,videoTitle:typeof data.journeyStudio?.videoTitle==='string'?data.journeyStudio.videoTitle.slice(0,240):'',items,updatedAt:Date.now()},warnings:[...new Set(warnings)]};
}
export function exportGeoJSON(trips,title){
  const features=trips.flatMap(trip=>trip.items.map(item=>{
    validateTimes(item.start,item.end);const point=item.kind==='point';if(point?!validCoordinate(item.coordinates):!Array.isArray(item.coordinates)||item.coordinates.length<2||!item.coordinates.every(validCoordinate))throw new Error('This file contains invalid or out-of-range coordinates.');
    const {coordinates,extra,...metadata}=item;const preserved={...(extra||{})};delete preserved.geojsonProperties;delete preserved.geojsonFeatureId;
    return {type:'Feature',...(extra?.geojsonFeatureId!==undefined?{id:extra.geojsonFeatureId}:{id:item.id}),properties:{...(extra?.geojsonProperties||{}),name:item.name,description:item.notes||'',journeyStudio:{...metadata,extra:preserved,journeyId:trip.id,journeyName:trip.name,journeyColor:trip.color,journeyVideoTitle:trip.videoTitle||''}},geometry:{type:point?'Point':'LineString',coordinates:item.coordinates}};
  }));return JSON.stringify({type:'FeatureCollection',name:title||trips[0]?.name||'Journeys',journeyStudio:{version:1,color:trips.length===1?trips[0].color:undefined,videoTitle:trips.length===1?trips[0].videoTitle:undefined},features});
}
export async function importJourneyFile(file,{budget}={}){
  if(file.size>LIMIT)throw new Error('Please import a file smaller than 10 MB.');
  const ext=file.name.split('.').at(-1).toLowerCase(),name=file.name.replace(/\.(kml|kmz|geojson|json)$/i,'');let result,zip;
  if(ext==='kmz'){
    const Zip=await zipClass();try{zip=await Zip.loadAsync(await file.arrayBuffer());}catch{throw new Error('This file is not a readable KMZ archive.');}
    const entries=Object.values(zip.files).filter(entry=>!entry.dir);
    if(entries.length>1000||entries.reduce((sum,e)=>sum+(e._data?.uncompressedSize||0),0)>UNPACK_LIMIT)throw new Error('This KMZ expands beyond the 50 MB limit.');
    consumeArchive(budget,entries.reduce((sum,e)=>sum+(e._data?.uncompressedSize||0),0));
    const docs=entries.filter(e=>/\.kml$/i.test(e.name)).sort((a,b)=>Number(b.name==='doc.kml')-Number(a.name==='doc.kml'));
    if(!docs.length)throw new Error('No KML document was found in this KMZ.');
    let size=0;const all=[];
    for(const doc of docs){if((doc._data?.uncompressedSize||0)>LIMIT)throw new Error('Please import a KML smaller than 10 MB.');const text=await readZipText(doc);size+=text.length;if(size>LIMIT)throw new Error('Please import a KML smaller than 10 MB.');all.push(importKML(text,name));}
    result=all[0];for(const r of all.slice(1)){result.trip.items.push(...r.trip.items);result.warnings.push(...r.warnings);}result.warnings=[...new Set(result.warnings)];
  }else if(['geojson','json'].includes(ext))result=importGeoJSON(await file.text(),name);
  else if(ext==='kml')result=importKML(await file.text(),name);
  else throw new Error('Choose a KML, KMZ or GeoJSON file.');
  // Keep source styles, folder structure, icons and unsupported properties recoverable.
  // Imported, previously archived Studio files already carry this information.
  if(!result.trip.items.some(i=>i.extra?.sourceArchive||i.extra?._sourceArchive)){
    const Zip=await zipClass();let bytes,filename;
    if(ext==='kmz'){bytes=new Uint8Array(await file.arrayBuffer());filename=file.name;}
    else{const source=new Zip();source.file(file.name,await file.arrayBuffer());bytes=await source.generateAsync({type:'uint8array',compression:'DEFLATE'});filename=file.name+'.zip';}
    const first=result.trip.items[0];first.extra={...first.extra,_sourceArchive:{filename,encoding:'base64',base64:base64(bytes)}};
  }
  return result;
}
export async function journeyFile(trips,format,title){
  if(!trips.some(t=>t.items.length))throw new Error('Select at least one itinerary item.');
  if(format==='geojson')return new Blob([exportGeoJSON(trips,title)],{type:'application/geo+json'});
  let kml=exportJourneysKML(trips,title||trips[0].name);
  if(format==='kml')return new Blob([kml],{type:'application/vnd.google-earth.kml+xml'});
  if(format!=='kmz')throw new Error('Choose a KML, KMZ or GeoJSON file.');
  const Zip=await zipClass(),zip=new Zip();
  for(const [name,source] of [['place','wht-circle'],['important','wht-stars']]){const canvas=document.createElement('canvas');canvas.width=canvas.height=40;const c=canvas.getContext('2d');c.fillStyle='#fff';c.strokeStyle='#555';c.lineWidth=2;c.beginPath();if(name==='place')c.arc(20,20,15,0,Math.PI*2);else{for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?7:17;i?c.lineTo(20+Math.cos(a)*r,20+Math.sin(a)*r):c.moveTo(20+Math.cos(a)*r,20+Math.sin(a)*r);}c.closePath();}c.fill();c.stroke();zip.file('images/'+name+'.png',canvas.toDataURL('image/png').split(',')[1],{base64:true});kml=kml.replaceAll('<href>https://maps.google.com/mapfiles/kml/paddle/'+source+'.png</href>','<href>images/'+name+'.png</href>');}
  zip.file('doc.kml',kml);
  // Source KMZs keep their original embedded resources inside the metadata.
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.google-earth.kmz',compression:'DEFLATE'});
}
// One download avoids the browser's multiple-download prompt. Build every
// journey before publishing the ZIP so a failed item cannot yield a partial set.
export async function journeyArchive(trips,format){
  if(!trips.some(trip=>trip.items.length))throw new Error('Select at least one itinerary item.');
  const Zip=await zipClass(),archive=new Zip(),used=new Set();
  for(const trip of trips){
    if(!trip.items.length)continue;
    let stem=safeFilename(trip.name).replace(/[. ]+$/g,'')||'journey';
    if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem))stem='_'+stem;
    let name=stem+'.'+format,suffix=2;
    while(used.has(name.toLowerCase()))name=stem+' ('+(suffix++)+').'+format;
    used.add(name.toLowerCase());
    try{archive.file(name,await (await journeyFile([trip],format,trip.name)).arrayBuffer());}
    catch(error){error.journeyName=trip.name;throw error;}
  }
  return archive.generateAsync({type:'blob',mimeType:'application/zip',compression:'DEFLATE'});
}
export async function downloadJourneys(trips,format,title){const blob=await journeyFile(trips,format,title);downloadFile(blob,safeFilename(title||trips[0].name)+'.'+format);}

export function subsetTrip(trip,items){return {...trip,items:items.length===trip.items.length?items:items.map(item=>{const extra={...item.extra};delete extra._sourceArchive;delete extra.sourceArchive;return {...item,extra};})};}
