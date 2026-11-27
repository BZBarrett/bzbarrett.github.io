import {mercator} from './route-data.mjs';
import {pathAtScale} from './journey-path-cache.mjs';

const baseLayers=['studio-selection','studio-casing','studio-lines','studio-flight-casing','studio-flights','studio-options','studio-flight-options'];
const completedLayers=['studio-completed-casing','studio-completed-lines','studio-completed-flights'];
const sourceId='studio-completed';
const empty=()=>({type:'FeatureCollection',features:[]});
const projected=new WeakMap();
const guardedSources=new WeakSet();
function allowEmptyTileUpdates(source){
  // MapLibre 5.12 assumes cached tiles have a feature index. Empty tiles do
  // not: reload them conservatively when an incremental route first arrives.
  // Scope the compatibility guard to our source; do not change the basemap.
  if(guardedSources.has(source)||!source.shouldReloadTile)return;
  const shouldReload=source.shouldReloadTile;
  source.shouldReloadTile=function(tile,changes){return !tile.latestFeatureIndex||shouldReload.call(this,tile,changes);};
  guardedSources.add(source);
}

function featureFor(adapter,index,scale){
  const segment=adapter.playbackPlan[index];let points=projected.get(segment);
  if(!points){let previous;points=segment.coordinates.map(coordinate=>{const point=mercator(coordinate);if(previous!==undefined)point[0]+=Math.round(previous-point[0]);previous=point[0];return point;});projected.set(segment,points);}
  const coordinates=pathAtScale(points,scale).indices.map(i=>[points[i][0]*360-180,segment.coordinates[i][1]]);
  const tripId=segment.tripId||adapter.playbackDefaultTrip,item=adapter.playbackItems?.get(JSON.stringify([tripId,segment.id]));
  // Numeric IDs survive vector-tile encoding; trip/item IDs remain in properties.
  return {type:'Feature',id:index,properties:{id:segment.id,tripId,mode:segment.mode,color:segment.color||item?._color||'#31765c',order:index},geometry:{type:'LineString',coordinates}};
}

function visibility(map,ids,value){for(const id of ids)if(map.getLayer(id)&&map.getLayoutProperty(id,'visibility')!==value)map.setLayoutProperty(id,'visibility',value);}

// Future routes never enter this source. Following the camera renders only the
// completed, screen-simplified geometry plus the small active-route overlay.
export function syncPlaybackRoutes(adapter){
  const map=adapter.map;if(!map?.getSource('studio-data'))return;
  const active=!!adapter.playbackTripId;
  visibility(map,baseLayers,active?'none':'visible');
  if(!active){visibility(map,completedLayers,'none');return;}
  if(!map.getSource(sourceId)){
    map.addSource(sourceId,{type:'geojson',data:empty()});
    const road=['!=',['get','mode'],'plane'],flight=['==',['get','mode'],'plane'];
    for(const [id,filter,color,width,opacity,dash]of [
      [completedLayers[0],road,'#fff9eb',7,1,null],
      [completedLayers[1],road,['get','color'],3.5,1,null],
      [completedLayers[2],flight,['get','color'],3.5,.5,[4,4]]
    ])map.addLayer({id,type:'line',source:sourceId,filter,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':color,'line-width':width,'line-opacity':opacity,...(dash?{'line-dasharray':dash}:{})}},map.getLayer('studio-points')?'studio-points':undefined);
  }
  const source=map.getSource(sourceId),plan=adapter.playbackPlan||[],count=Math.max(0,Math.min(plan.length,adapter.playbackCursor||0));
  allowEmptyTileUpdates(source);
  // Globe follow compensates zoom for latitude. Ignore floating-point noise at
  // an exact zoom boundary so the same camera scale cannot rebuild the source.
  const level=Math.ceil(Math.log2(Math.max(1,adapter.playbackScale()))-1e-7),scale=2**level;
  let state=adapter.completedRoutes;
  if(!state||state.source!==source||state.plan!==plan||state.level!==level){
    const features=Array.from({length:count},(_,i)=>featureFor(adapter,i,scale));
    source.setData({type:'FeatureCollection',features});
    adapter.completedRoutes=state={source,plan,level,count,features};
  }else if(count!==state.count){
    if(count>state.count){
      const add=Array.from({length:count-state.count},(_,i)=>featureFor(adapter,state.count+i,scale));
      state.features.push(...add);source.updateData({add});
    }else{
      source.updateData({remove:state.features.slice(count).map(feature=>feature.id)});state.features.length=count;
    }
    state.count=count;
  }
  visibility(map,completedLayers,count?'visible':'none');
}
