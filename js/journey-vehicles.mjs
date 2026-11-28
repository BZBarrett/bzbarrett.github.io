import {vehicleCatalog} from './journey-vehicle-catalog.mjs';
import {t} from './journey-i18n.mjs';
export {vehicleCatalog};
export const DEFAULT_VEHICLE_ICON='113-1991-porsche-911-carrera-2-964-black.png';
export const vehicleLabel=vehicle=>`${vehicle.year} ${vehicle.make} ${vehicle.model} · ${vehicle.color}`;
export const vehicleIconURL=filename=>'images/vehicle-icons/'+filename;
const normalize=value=>String(value||'').normalize('NFKD').toLowerCase().replace(/grey/g,'gray').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const fallback=vehicleCatalog.find(v=>v.filename===DEFAULT_VEHICLE_ICON),exact=new Map(),matches=new Map();
for(const vehicle of vehicleCatalog){
  const model=`${vehicle.make} ${vehicle.model}`;
  for(const key of [vehicle.filename,vehicle.filename.replace(/\.png$/,''),vehicleLabel(vehicle),model,`${vehicle.year} ${model}`,`${model} ${vehicle.color}`,vehicle.model,`${vehicle.model} ${vehicle.color}`])if(!exact.has(normalize(key)))exact.set(normalize(key),vehicle);
}
export function resolveVehicleIcon(value){
  const key=normalize(value);if(!key)return fallback;if(exact.has(key))return exact.get(key);if(matches.has(key))return matches.get(key);
  const tokens=key.split(' '),found=vehicleCatalog.find(v=>{const words=normalize(vehicleLabel(v)).split(' '),model=normalize(v.model).split(' ');return tokens.every(token=>words.includes(token))&&tokens.some(token=>model.includes(token)&&!normalize(v.make).split(' ').includes(token));})||fallback;
  if(matches.size>=256)matches.clear();matches.set(key,found);return found;
}
const loaded=new Map();
export function loadVehicleIcon(filename){
  if(!vehicleCatalog.some(v=>v.filename===filename))filename=DEFAULT_VEHICLE_ICON;
  if(!loaded.has(filename))loaded.set(filename,(async()=>{const image=new Image();image.src=vehicleIconURL(filename);try{await image.decode();return image;}catch(error){loaded.delete(filename);if(filename!==DEFAULT_VEHICLE_ICON)return loadVehicleIcon(DEFAULT_VEHICLE_ICON);throw error;}})());
  return loaded.get(filename);
}
export function setupVehiclePicker(){
  const dialog=document.getElementById('vehicle-dialog'),filter=document.getElementById('vehicle-search'),grid=document.getElementById('vehicle-list'),count=document.getElementById('vehicle-count');let target;
  function render(){
    const terms=normalize(filter.value).split(' ').filter(Boolean),selected=resolveVehicleIcon(target?.value),records=vehicleCatalog.filter(v=>terms.every(term=>normalize(vehicleLabel(v)+' '+t(v.color)).includes(term)));
    count.textContent=t('{count} vehicles',{count:records.length});
    grid.replaceChildren(...records.map(vehicle=>{
      const button=document.createElement('button');button.type='button';button.className='vehicle-option';button.dataset.vehicle=vehicle.filename;button.setAttribute('aria-pressed',String(vehicle===selected));
      const image=document.createElement('img');image.src=vehicleIconURL(vehicle.filename);image.alt='';image.loading='lazy';image.decoding='async';image.width=256;image.height=128;
      const name=document.createElement('strong');name.textContent=vehicle.make+' '+vehicle.model;
      const detail=document.createElement('span');detail.textContent=vehicle.year+' · '+t(vehicle.color);
      button.append(image,name,detail);button.addEventListener('click',()=>{target.value=vehicleLabel(vehicle);target.dispatchEvent(new Event('input',{bubbles:true}));dialog.close();target.focus();});return button;
    }));
    document.getElementById('vehicle-empty').hidden=records.length>0;
  }
  for(const button of document.querySelectorAll('[data-choose-vehicle]'))button.addEventListener('click',()=>{target=document.getElementById(button.dataset.chooseVehicle);filter.value='';render();dialog.showModal();grid.scrollTop=0;filter.focus();});
  filter.addEventListener('input',render);
  return {refresh(){if(dialog.open)render();}};
}
