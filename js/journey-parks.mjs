export function parkFeatures(parks) {
  return {type:'FeatureCollection',features:parks.map(park=>({type:'Feature',properties:{id:park.id,name:park.name,url:park.url},geometry:{type:'Point',coordinates:park.coordinates}}))};
}
export function parkSprite() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=48;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fffdf1';ctx.strokeStyle='#d8e2ce';ctx.lineWidth=2;ctx.beginPath();ctx.arc(24,24,21,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#35774c';ctx.beginPath();ctx.moveTo(24,7);ctx.lineTo(34,23);ctx.lineTo(29,23);ctx.lineTo(37,32);ctx.lineTo(27,32);ctx.lineTo(27,40);ctx.lineTo(21,40);ctx.lineTo(21,32);ctx.lineTo(11,32);ctx.lineTo(19,23);ctx.lineTo(14,23);ctx.closePath();ctx.fill();
  return ctx.getImageData(0,0,48,48);
}
export function installParkLayer(map,parks,visible,{source='studio-parks',layer='studio-parks',size=.55}={}) {
  if(!map.hasImage('studio-park-tree'))map.addImage('studio-park-tree',parkSprite(),{pixelRatio:2});
  if(!map.getSource(source))map.addSource(source,{type:'geojson',data:parkFeatures(parks)});else map.getSource(source).setData(parkFeatures(parks));
  if(!map.getLayer(layer))map.addLayer({id:layer,type:'symbol',source,layout:{'icon-image':'studio-park-tree','icon-size':size*2,'icon-allow-overlap':true,'icon-ignore-placement':true,visibility:visible?'visible':'none'}});
  else map.setLayoutProperty(layer,'visibility',visible?'visible':'none');
}
