// Long routes on a globe need a spherical center. A longitude/latitude box
// can face the wrong hemisphere, especially for flights crossing the poles.
export function globeRouteCamera(map,coordinates,padding) {
  const rad=Math.PI/180,sum=[0,0,0];
  for(const [lon,lat] of coordinates){const c=Math.cos(lat*rad);sum[0]+=c*Math.cos(lon*rad);sum[1]+=c*Math.sin(lon*rad);sum[2]+=Math.sin(lat*rad);}
  if(Math.hypot(...sum)<1e-8)return null;
  const center=[Math.atan2(sum[1],sum[0])/rad,Math.atan2(sum[2],Math.hypot(sum[0],sum[1]))/rad];
  // Use the bundled MapLibre transform without moving the live camera. This
  // bounded search runs only on a fit request, never in animation frames.
  const transform=map.transform.clone();
  transform.setTransitionState(1,0);
  transform.setPadding(padding);transform.setCenter(new window.maplibregl.LngLat(...center));transform.setPitch(0);transform.setBearing(0);transform.setRoll(0);
  const points=coordinates.map(p=>new window.maplibregl.LngLat(p[0],p[1]));
  const fits=zoom=>{
    transform.setZoom(zoom);
    for(const point of points){
      if(transform.isLocationOccluded(point))return false;
      const p=transform.locationToScreenPoint(point);
      if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<padding.left||p.x>transform.width-padding.right||p.y<padding.top||p.y>transform.height-padding.bottom)return false;
    }
    return true;
  };
  let low=map.getMinZoom(),high=Math.min(13,map.getMaxZoom());
  // Some world-spanning itineraries cannot all face the camera at once.
  if(!fits(low))return null;
  for(let i=0;i<16;i++){const zoom=(low+high)/2;if(fits(zoom))low=zoom;else high=zoom;}
  return {center,zoom:low,pitch:0,bearing:0,roll:0,padding};
}
