const gibs='https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/';
const nasa='Imagery: NASA GIBS / ESDIS';
export const rasterThemes={
  satellite:{hint:'Global satellite imagery · approximately 500 m detail.',credit:nasa,url:'https://nasa-gibs.github.io/gibs-api-docs/',tiles:gibs+'BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',maxzoom:8},
  hybrid:{hint:'Global satellite imagery with place labels · approximately 500 m detail.',credit:nasa+' · © OpenStreetMap contributors (openstreetmap.org/copyright)',url:'https://nasa-gibs.github.io/gibs-api-docs/',tiles:gibs+'BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',maxzoom:8},
  topo:{hint:'Detailed US topographic map · USGS.',credit:'Map services and data: U.S. Geological Survey, National Geospatial Program',url:'https://www.usgs.gov/programs/national-geospatial-program/national-map',tiles:'https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}',maxzoom:16}
};
export const mapThemes=['liberty','positron','bright','dark',...Object.keys(rasterThemes)];
export function rasterStyle(theme){
  const base=rasterThemes[theme];if(!base)return null;
  const sources={basemap:{type:'raster',tiles:[base.tiles],tileSize:256,minzoom:0,maxzoom:base.maxzoom,attribution:base.credit}};
  const layers=[{id:'background',type:'background',paint:{'background-color':'#dce5d8'}},{id:'basemap',type:'raster',source:'basemap',paint:{'raster-fade-duration':0}}];
  if(theme==='hybrid'){sources.labels={type:'raster',tiles:[gibs+'Reference_Labels_15m/default/GoogleMapsCompatible_Level13/{z}/{y}/{x}.png'],tileSize:256,minzoom:0,maxzoom:13,attribution:'© OpenStreetMap contributors'};layers.push({id:'basemap-labels',type:'raster',source:'labels',paint:{'raster-fade-duration':0}});}
  return {version:8,sources,layers};
}
export function mapCredit(theme,overview=false){return overview?'Natural Earth · US Census Bureau · © OpenStreetMap contributors':rasterThemes[theme]?.credit||'OpenFreeMap · © OpenStreetMap contributors · OpenMapTiles · Natural Earth';}
export function updateMapCredit(theme,overview=false){
  const host=document.querySelector('.map-credit');if(!host)return;
  host.replaceChildren();
  const link=(label,href)=>{if(host.childNodes.length)host.append(' · ');const a=document.createElement('a');a.textContent=label;a.href=href;a.target='_blank';a.rel='noopener';host.append(a);};
  if(overview){host.textContent='Natural Earth';return;}
  if(rasterThemes[theme]){link(theme==='topo'?'USGS · National Geospatial Program':nasa,rasterThemes[theme].url);if(theme==='hybrid')link('© OpenStreetMap','https://www.openstreetmap.org/copyright');}
  else {link('OpenFreeMap','https://openfreemap.org/');link('© OpenStreetMap','https://www.openstreetmap.org/copyright');link('OpenMapTiles','https://openmaptiles.org/');host.append(' · Natural Earth');}
}
