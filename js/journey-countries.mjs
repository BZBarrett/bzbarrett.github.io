let assets;
export async function countryAssets(){
  if(!assets)assets=Promise.all(['data/world-countries.json','data/world-countries.geojson'].map(async path=>{const response=await fetch(path);if(!response.ok)throw new Error('The world map could not be loaded. Please try again.');return response.json();})).catch(()=>{assets=null;throw new Error('The world map could not be loaded. Please try again.');});
  return assets;
}
export function countryChecklist(data,language='en'){
  return data.countries.map(country=>({...country,displayName:language==='zh'?country.nameZh||country.name:country.name})).sort((a,b)=>a.displayName.localeCompare(b.displayName,language==='zh'?'zh-CN':'en'));
}
// Equal Earth projection, sized to the whole world including Antarctica. Rings
// retain Natural Earth's antimeridian cuts, so Fiji/Russia do not span the map.
export function projectWorld([longitude,latitude]){
  const radians=Math.PI/180,theta=Math.asin(Math.sqrt(3)/2*Math.sin(latitude*radians)),theta2=theta*theta,theta6=theta2**3;
  const a1=1.340264,a2=-.081106,a3=.000893,a4=.003796;
  return [2*Math.sqrt(3)*longitude*radians*Math.cos(theta)/(3*(a1+3*a2*theta2+theta6*(7*a3+9*a4*theta2))),theta*(a1+a2*theta2+theta6*(a3+a4*theta2))];
}
export function worldProjector(box){
  const halfWidth=projectWorld([180,0])[0],halfHeight=projectWorld([0,90])[1],scale=Math.min(box.w/(halfWidth*2),box.h/(halfHeight*2));
  return point=>{const [x,y]=projectWorld(point);return [box.x+box.w/2+x*scale,box.y+box.h/2-y*scale];};
}
