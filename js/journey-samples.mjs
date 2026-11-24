import {uid} from './journey-kml.mjs';
import {normalizeWorkspace} from './journey-storage.mjs';
let pending;
export function sampleData() {
  return pending ||= fetch('data/journey-samples.json').then(async response=>{
    if(!response.ok)throw new Error('Test data could not be loaded. Please try again.');
    const data=await response.json();
    if(data.version!==1||!Array.isArray(data.trips)||!data.trips.every(trip=>typeof trip.sampleId==='string'))throw new Error('Test data could not be loaded. Please try again.');
    normalizeWorkspace({version:1,trips:data.trips.map(trip=>({...structuredClone(trip),id:trip.sampleId}))});return data;
  }).catch(error=>{pending=null;throw error;});
}
export function addSampleJourneys(workspace,data) {
  const known=new Set(workspace.trips.map(trip=>trip.sampleId));let added=0,first;
  for(const source of data.trips){
    if(known.has(source.sampleId)){first ||= workspace.trips.find(trip=>trip.sampleId===source.sampleId)?.id;continue;}
    const trip=structuredClone(source);trip.id=uid();trip.visible=true;trip.name=workspace.language==='zh'?source.nameZh:source.name;trip.updatedAt=Date.now();
    trip.items.forEach(item=>{item.routeSource=item.source?'Research sample':'Test data';});workspace.trips.push(trip);known.add(trip.sampleId);first ||= trip.id;added++;
  }
  return {added,first};
}
