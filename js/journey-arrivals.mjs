import {mercator,fromMercator} from './route-data.mjs';

// Sorted arrival times let both renderers reveal a prefix without scanning all pins.
export function arrivalCount(points,elapsed){
  if(elapsed<=0)return 0;
  let lo=0,hi=points.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(points[mid].elapsed<=elapsed+1e-8)lo=mid+1;else hi=mid;}
  return lo;
}
const overlaps=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
function pinTree(entries){
  if(!entries.length)return null;
  const bounds=[Infinity,Infinity,-Infinity,-Infinity];
  for(const {box} of entries){bounds[0]=Math.min(bounds[0],box[0]);bounds[1]=Math.min(bounds[1],box[1]);bounds[2]=Math.max(bounds[2],box[2]);bounds[3]=Math.max(bounds[3],box[3]);}
  if(entries.length<=8)return {bounds,entries};
  const axis=bounds[2]-bounds[0]>bounds[3]-bounds[1]?0:1;
  entries.sort((a,b)=>a.box[axis]+a.box[axis+2]-b.box[axis]-b.box[axis+2]);
  const middle=entries.length>>1;return {bounds,left:pinTree(entries.slice(0,middle)),right:pinTree(entries.slice(middle))};
}
function queryPins(tree,box,visit){
  if(!tree||!overlaps(tree.bounds,box))return;
  if(tree.entries){for(const entry of tree.entries)if(overlaps(entry.box,box))visit(entry);}
  else{queryPins(tree.left,box,visit);queryPins(tree.right,box,visit);}
}

// Compute once per plan. Index pin buffers, then visit each actual route edge once;
// never match pins against gaps between independent segments or hidden geometry.
export function routeArrivals(items,segments,measure){
  const arrivals=new Map(),byId=new Map(items.map(item=>[item.id,item]));
  const add=(node,elapsed,id)=>{
    const key=JSON.stringify([node.name||'',node.coordinates.slice(0,2).map(n=>Number(n.toFixed(6)))]),visit=key+'@'+elapsed.toFixed(7),old=arrivals.get(visit);
    if(!old)arrivals.set(visit,{key,id,name:node.name||'',coordinates:node.coordinates.slice(0,2),elapsed,important:!!node.important});
    else if(node.important)old.important=true;
  };
  for(const segment of segments){
    const item=byId.get(segment.id);
    if(item.startNode)add(item.startNode,segment.offset,item.id);
    if(item.endNode)add(item.endNode,segment.offset+segment.duration,item.id);
  }
  const pins=items.filter(item=>item.kind==='point'&&item.visible!==false),entries=[],visits=new Map();
  for(const pin of pins){
    const [x,y]=mercator(pin.coordinates),radius=76/(40030228.88*Math.max(.01,Math.cos(fromMercator([x,y])[1]*Math.PI/180)));
    for(const shift of [-1,0,1])entries.push({pin,x:x+shift,y,box:[x+shift-radius,y-radius,x+shift+radius,y+radius]});
  }
  const tree=pinTree(entries);
  if(tree)for(const segment of segments){
    let a=mercator(segment.coordinates[0]);
    for(let i=1;i<segment.coordinates.length;i++){
      const b=mercator(segment.coordinates[i]);b[0]+=Math.round(a[0]-b[0]);
      const dx=b[0]-a[0],dy=b[1]-a[1],size=dx*dx+dy*dy;
      queryPins(tree,[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])],({pin,x,y})=>{
        const f=size?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/size)):0,coordinate=fromMercator([a[0]+dx*f,a[1]+dy*f]);
        const distance=measure(pin.coordinates,coordinate);if(distance>75)return;
        const along=segment.cumulative[i-1]+measure(segment.coordinates[i-1],coordinate);
        const elapsed=segment.offset+along/segment.length*segment.duration;
        let list=visits.get(pin);if(!list){list=[];visits.set(pin,list);}const previous=list.at(-1);
        // Consecutive edges form one visit only while their shared vertex stays near
        // the pin. A long out-and-back edge pair must trigger a fresh arrival.
        if(previous?.segment===segment&&(previous.edge===i||previous.edge===i-1&&measure(pin.coordinates,segment.coordinates[i-1])<=75)){
          previous.edge=i;if(distance<previous.distance-1e-4){previous.distance=distance;previous.elapsed=elapsed;}
        }else list.push({segment,edge:i,distance,elapsed});
      });
      a=mercator(segment.coordinates[i]);
    }
  }
  for(const [pin,list]of visits)for(const {elapsed}of list)add(pin,elapsed,pin.id);
  return [...arrivals.values()].sort((a,b)=>a.elapsed-b.elapsed);
}
