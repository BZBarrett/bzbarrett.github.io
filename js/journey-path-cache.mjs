// Screen-scale simplification keeps dense imported GPS tracks inexpensive.
// Original vertices and timestamps are untouched. The retained indices also
// let an animation stop at its exact, unsimplified current position.
const cache = new WeakMap();
export function pathAtScale(points, scale) {
  const level = Math.ceil(Math.log2(Math.max(1, scale)));
  let levels = cache.get(points);
  if (!levels) { levels = new Map(); cache.set(points, levels); }
  if (levels.has(level)) return levels.get(level);
  const tolerance = .2 / 2**level, limit=tolerance*tolerance;
  const keep = new Uint8Array(points.length), stack=[];
  if(points.length){keep[0]=keep[points.length-1]=1;stack.push([0,points.length-1]);}
  while(stack.length) {
    const [first,last]=stack.pop(),a=points[first],b=points[last],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
    let max=limit,index=-1;
    for(let i=first+1;i<last;i++) {
      const p=points[i],t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;
      const error=(p[0]-a[0]-dx*t)**2+(p[1]-a[1]-dy*t)**2;
      if(error>max){max=error;index=i;}
    }
    if(index!==-1){keep[index]=1;stack.push([first,index],[index,last]);}
  }
  const indices=[];for(let i=0;i<keep.length;i++)if(keep[i])indices.push(i);
  const result={indices,points:indices.map(i=>points[i])};
  // Bound memory when a user repeatedly changes zoom during a long session.
  if(levels.size>=4)levels.delete(levels.keys().next().value);
  levels.set(level,result);return result;
}
const boundsCache = new WeakMap();
export function pathBounds(points) {
  let box=boundsCache.get(points);
  if(!box){box=[Infinity,Infinity,-Infinity,-Infinity];for(const [x,y]of points){box[0]=Math.min(box[0],x);box[1]=Math.min(box[1],y);box[2]=Math.max(box[2],x);box[3]=Math.max(box[3],y);}boundsCache.set(points,box);}
  return box;
}
