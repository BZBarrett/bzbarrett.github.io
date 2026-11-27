import {mercator} from './route-data.mjs';

const empty={type:'FeatureCollection',features:[]};
function install(map){
  if(map.getSource('studio-arrivals'))return false;
  map.addSource('studio-arrivals',{type:'geojson',data:empty});
  if(!map.hasImage('studio-star')){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff9e9';ctx.beginPath();
    for(let i=0;i<10;i++){const angle=-Math.PI/2+i*Math.PI/5,r=i%2?5:11,x=16+Math.cos(angle)*r,y=16+Math.sin(angle)*r;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();ctx.fill();map.addImage('studio-star',ctx.getImageData(0,0,32,32));
  }
  map.addLayer({id:'studio-arrival-points',type:'circle',source:'studio-arrivals',filter:['<',['get','order'],0],paint:{'circle-color':['get','color'],'circle-radius':['case',['get','important'],9,6],'circle-stroke-color':'#fff9e9','circle-stroke-width':2.5}});
  map.addLayer({id:'studio-arrival-stars',type:'symbol',source:'studio-arrivals',filter:['all',['<',['get','order'],0],['get','important']],layout:{'icon-image':'studio-star','icon-size':.65,'icon-allow-overlap':true}});
  return true;
}
export function applyPlaybackPoints(adapter,changed=false){
  const active=!!adapter.playbackPoints,count=active?adapter.playbackPointCount:0,map=adapter.map;
  if(map&&(adapter.ready||map.getSource('studio-data'))){
    const created=active&&install(map);
    if((changed||created)&&active)map.getSource('studio-arrivals').setData(adapter.playbackPointData);
    // Both ordinary and important static markers use the same playback gate.
    // Keep the filter as well as layout visibility safe across source/style rebuilds.
    const staticPoints=['all',['==',['geometry-type'],'Point'],['==',['literal',active],false]];
    if(adapter.playbackStaticPointsActive!==active){
      for(const id of ['studio-points','studio-stars'])if(map.getLayer(id)){
        map.setLayoutProperty(id,'visibility',active?'none':'visible');
        map.setFilter(id,id==='studio-stars'?['all',staticPoints,['==',['get','important'],true]]:staticPoints);
      }
      adapter.playbackStaticPointsActive=active;
    }
    if(map.getLayer('studio-arrival-points')){
      map.setFilter('studio-arrival-points',['<',['get','order'],count]);
      map.setFilter('studio-arrival-stars',['all',['<',['get','order'],count],['get','important']]);
    }
  }
  if(adapter.sketch){
    adapter.sketch.playbackPointStops=active?adapter.playbackPointStops:null;adapter.sketch.playbackPointCount=count;if(!adapter.playbackManualRender)adapter.sketch.drawSoon();
  }
}
export function setPlaybackPoints(points,count=0,tripId,color='#31765c'){
  const changed=this.playbackPoints!==points||this.playbackPointTrip!==tripId||this.playbackPointColor!==color;
  if(!changed&&this.playbackPointCount===count)return;
  this.playbackPoints=points;this.playbackPointCount=count;this.playbackPointTrip=tripId;this.playbackPointColor=color;
  if(changed&&points){
    this.playbackPointData={type:'FeatureCollection',features:points.map((point,order)=>({type:'Feature',properties:{id:point.id,tripId:point.tripId||tripId,name:point.name,important:!!point.important,color:point.color||color,order},geometry:{type:'Point',coordinates:point.coordinates}}))};
    this.playbackPointStops=points.map(point=>({...point,tripId:point.tripId||tripId,point:mercator(point.coordinates),color:point.color||color}));
  }
  applyPlaybackPoints(this,changed);
}
