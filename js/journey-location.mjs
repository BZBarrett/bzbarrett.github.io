import {distanceLabel} from './journey-routes.mjs';
import {t} from './journey-i18n.mjs';
// One request per explicit click; this is not a location tracker or saved place.
export function setupLocation({map,playback,getUnits,cancelPicking}){
  const button=document.getElementById('map-locate'),status=document.getElementById('location-status');let pending=false,message='',location;
  function refresh(){status.hidden=!message;status.textContent=message==='located'?t('Current location · accuracy about {distance}',{distance:distanceLabel(location.accuracy,getUnits())}):t(message);button.title=t(pending?'Finding your location…':'Show my location');button.setAttribute('aria-label',button.title);button.setAttribute('aria-busy',String(pending));button.disabled=pending;}
  function fail(code){pending=false;message={1:'Location permission was denied. Allow location access in your browser settings and try again.',2:'Your location is unavailable. Check your device location services and try again.',3:'Finding your location timed out. Please try again.'}[code]||'Your location is unavailable. Check your device location services and try again.';refresh();}
  button.addEventListener('click',()=>{
    if(pending)return;
    if(!window.isSecureContext){message='Location needs HTTPS or localhost.';refresh();return;}
    if(!navigator.geolocation){message='This browser does not support location access.';refresh();return;}
    pending=true;message='Finding your location…';refresh();
    try{navigator.geolocation.getCurrentPosition(position=>{
      const {longitude,latitude,accuracy}=position.coords;
      if(!Number.isFinite(longitude)||!Number.isFinite(latitude)||Math.abs(longitude)>180||Math.abs(latitude)>90||!Number.isFinite(accuracy)||accuracy<0){fail(2);return;}
      location={coordinates:[longitude,latitude],accuracy,timestamp:position.timestamp};pending=false;message='located';playback.pause();cancelPicking();map.setLocation(location);refresh();
    },error=>fail(error.code),{enableHighAccuracy:true,timeout:15000,maximumAge:30000});}catch{fail(2);}
  });
  return {refresh};
}
export function locationFeatures(location){
  if(!location)return {type:'FeatureCollection',features:[]};
  const [lon,lat]=location.coordinates,rad=Math.PI/180,angular=Math.min(location.accuracy/6371008.8,Math.PI/2),ring=[];
  for(let i=0;i<=64;i++){const bearing=i/64*Math.PI*2,phi=Math.asin(Math.sin(lat*rad)*Math.cos(angular)+Math.cos(lat*rad)*Math.sin(angular)*Math.cos(bearing));let lambda=lon+Math.atan2(Math.sin(bearing)*Math.sin(angular)*Math.cos(lat*rad),Math.cos(angular)-Math.sin(lat*rad)*Math.sin(phi))/rad;lambda+=360*Math.round((lon-lambda)/360);ring.push([lambda,phi/rad]);}ring[64]=[...ring[0]];
  return {type:'FeatureCollection',features:[{type:'Feature',properties:{kind:'accuracy'},geometry:{type:'Polygon',coordinates:[ring]}},{type:'Feature',properties:{kind:'location'},geometry:{type:'Point',coordinates:[...location.coordinates]}}]};
}
