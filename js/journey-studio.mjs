import {setupVehiclePicker} from './journey-vehicles.mjs';
import {transportNames,isTransportMode,normalizeTransportSpeeds,DEFAULT_TRANSPORT_SPEEDS} from './journey-transport.mjs';
import {setupBatchExport} from './journey-batch-export.mjs';
import {readDateFields as dateValue,writeDateFields,setupDateFields,dateLabel} from './journey-dates.mjs';
import {importJourneyEntries,downloadJourneys,subsetTrip} from './journey-files.mjs';
import {rasterThemes} from './journey-basemaps.mjs';
import {setupStudioLayout} from './journey-layout.mjs';
import {JourneyPlayback} from './journey-playback.mjs';
import {t,setLanguage,captureStaticTranslations,translatedStatus,refreshStatuses} from './journey-i18n.mjs';
import {palettes,colorJourneys,paletteColors} from './journey-palettes.mjs';
import {PosterPreview} from './journey-preview.mjs';
import {uid,importKML,exportKML,downloadFile,safeFilename,validateTimes} from './journey-kml.mjs';
import {geocode,parseLatLon,findRoutes,routeDistance,distance,distanceLabel} from './journey-routes.mjs';
import {JourneyStore,normalizeWorkspace} from './journey-storage.mjs';
import {JourneyMap} from './journey-map.mjs';
import {parkAssets,stateChecklist,renderPoster,downloadPoster} from './journey-poster.mjs';
import {countryAssets,countryChecklist} from './journey-countries.mjs';
import {sampleData,addSampleJourneys} from './journey-samples.mjs';
import {setupLocation} from './journey-location.mjs';
import {setupMapExport} from './journey-map-export.mjs';
import {setupVideoExport} from './journey-video.mjs';
const el=id=>document.getElementById(id),status=message=>translatedStatus(el('form-status'),message);
const translateStatic=captureStaticTranslations();
const vehiclePicker=setupVehiclePicker();
const modeValue=id=>el(id).querySelector('input:checked').value;
const setMode=(id,mode)=>{el(id).querySelector('input[value="'+(isTransportMode(mode)?mode:'car')+'"]').checked=true;};
const makeTrip=()=>({id:uid(),name:t('My next adventure'),visible:true,items:[],updatedAt:Date.now()});
let workspace=normalizeWorkspace({version:1,trips:[makeTrip()],activeTrip:null,visited:[],updatedAt:Date.now()});
let places={start:null,end:null,point:null},options=[],selectedOption=-1,routeRequest,replaceId=null,editingId=null,saveTimer,posterFrame,posterGeneration=0,parks=[],states=[],countries=[],countryLoading=false;
const selectedItems=new Set();let pickingTarget=null,reviewTrip=null;
let importState=null;
const searchRequests={},searchTimers={},suggestions={},suggestionIndex={};let loading=true;
const store=new JourneyStore(message=>{translatedStatus(el('save-status'),message);renderFolderLocation();});
const trip=()=>workspace.trips.find(t=>t.id===workspace.activeTrip)||workspace.trips[0];
const nodeName=name=>name.split(',').slice(0,2).join(',');
function restoreBuilderDates(){
  for(const kind of ['segment','point'])for(const edge of ['start','end'])writeDateFields(kind+'-'+edge,trip().dateDefaults?.[edge]||'');
}
setupDateFields((id,value)=>{
  if(!/^(segment|point)-(start|end)$/.test(id)||replaceId)return;
  const [kind,edge]=id.split('-'),defaults=trip().dateDefaults||{start:'',end:''},previous=defaults.start;
  defaults[edge]=value;
  if(edge==='start'&&(!defaults.end||defaults.end===previous)){
    defaults.end=value;writeDateFields(kind+'-end',value);
  }
  trip().dateDefaults=defaults;
  const other=kind==='segment'?'point':'segment';
  for(const key of ['start','end'])writeDateFields(other+'-'+key,defaults[key]);
  save();
});
const modeLabel=mode=>t(transportNames[mode]||'Route');
function element(tag,text,className) {const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function action(label,fn,aria) {const button=element('button',t(label));button.type='button';if(aria)button.setAttribute('aria-label',t(aria));button.addEventListener('click',fn);return button;}
function save({delay=200}={}) {
  if(loading)return;workspace.activeTrip=trip().id;trip().updatedAt=Date.now();el('save-status').textContent=t('Saving locally…');clearTimeout(saveTimer);saveTimer=setTimeout(()=>store.save(workspace),delay);
}
function changed() {renderTrips();renderItinerary();updateMap();save();}
function renderTrips() {
  colorJourneys(workspace);renderColors();
  renderJourneyList();
  const segments=trip().items.filter(i=>i.kind==='segment'),points=trip().items.filter(i=>i.kind==='point');
  const total=segments.reduce((sum,i)=>sum+routeDistance(i.coordinates),0);
  el('trip-video-title').value=trip().videoTitle||'';
  el('trip-summary').hidden=!segments.length&&!points.length;
  el('trip-summary').textContent=t(segments.length||points.length?`${segments.length} segments · ${points.length} places${segments.length?' · '+distanceLabel(total,workspace.units):''}`:'');
}
function renderJourneyList() {
  const list=el('journey-list'),scroll=list.scrollTop;
  list.replaceChildren(...workspace.trips.map(journey=>{
    const row=element('li',undefined,'journey-row');row.dataset.journeyId=journey.id;row.classList.toggle('is-active',journey===trip());row.style.setProperty('--trip-color',journey.color);
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=journey.visible!==false;checkbox.dataset.journeyVisible=journey.id;checkbox.setAttribute('aria-label',t('Show {name} on map',{name:journey.name}));
    checkbox.addEventListener('change',()=>{journey.visible=checkbox.checked;journey.updatedAt=Date.now();batchExport.refresh();updateMap();save();});
    const name=action('',()=>activateTrip(journey.id));name.className='journey-select';name.dataset.journeySelect=journey.id;name.setAttribute('aria-pressed',String(journey===trip()));name.title=journey.name;
    name.append(element('i',undefined,'journey-color-dot'),element('span',journey.name));
    const remove=action('',()=>deleteJourney(journey.id));remove.className='journey-icon-button journey-remove';remove.dataset.journeyDelete=journey.id;remove.setAttribute('aria-label',t('Delete journey {name}',{name:journey.name}));remove.title=t('Delete journey');remove.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/></svg>';
    row.append(checkbox,name,remove);return row;
  }));list.scrollTop=scroll;batchExport.refresh();
}
function deleteJourney(id) {
  const target=workspace.trips.find(journey=>journey.id===id);if(!target||!confirm(t('Delete “'+target.name+'” from this notebook? Previously exported KML files are kept.')))return;
  const active=trip().id;workspace.trips=workspace.trips.filter(journey=>journey.id!==id);if(!workspace.trips.length)workspace.trips.push(makeTrip());
  if(active===id)activateTrip(workspace.trips[0].id);else changed();
}
function renderItinerary() {
  const scroll=el('itinerary').scrollTop;
  layout.refreshTabs();refreshSelection();
  el('itinerary-empty').hidden=true;
  for(const kind of ['segment','point']) {
    const entries=trip().items.filter(item=>item.kind===kind),list=el(kind==='segment'?'route-itinerary':'point-itinerary');
    list.replaceChildren();el(kind==='segment'?'segment-count':'point-count').textContent=t(entries.length);
    el(kind==='segment'?'routes-empty':'points-empty').hidden=entries.length>0;
    entries.forEach((item,index)=>{
      const li=element('li');li.dataset.id=item.id;li.dataset.kind=item.kind;
      li.classList.toggle('is-selected',selectedItems.has(item.id));li.classList.toggle('is-muted',item.visible===false);
      const heading=element('div',undefined,'itinerary-entry-heading'),select=document.createElement('input');select.type='checkbox';select.checked=selectedItems.has(item.id);select.dataset.itemSelect=item.id;select.setAttribute('aria-label',t('Select {name}',{name:item.name}));select.addEventListener('change',()=>{select.checked?selectedItems.add(item.id):selectedItems.delete(item.id);li.classList.toggle('is-selected',select.checked);refreshSelection();updateMap();});
      const visibility=action('',()=>{item.visible=item.visible===false;changed();});visibility.className='journey-icon-button item-visibility';visibility.dataset.itemVisible=item.id;visibility.setAttribute('aria-pressed',String(item.visible!==false));visibility.setAttribute('aria-label',t(item.visible===false?'Show {name} on map':'Hide {name} on map',{name:item.name}));visibility.title=t(item.visible===false?'Show on map':'Hide on map');visibility.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'+(item.visible===false?'<path d="m3 3 18 18"/>':'')+'</svg>';
      heading.append(select,element('h3',(item.important?'★ ':'')+item.name),visibility);li.append(heading);
      li.append(element('small',kind==='point'?t(`Place · ${item.coordinates[1].toFixed(4)}, ${item.coordinates[0].toFixed(4)}`):`${modeLabel(item.mode)}${item.mode==='car'&&item.vehicle?' · '+item.vehicle:''} · ${distanceLabel(routeDistance(item.coordinates),workspace.units)} · ${t(item.routeSource||'Imported geometry')}`));
      if(item.start||item.end)li.append(element('small',[item.start,item.end].filter(Boolean).map(dateLabel).join(' — ')));
      if(item.startNode?.important||item.endNode?.important)li.append(element('small','★ '+[item.startNode,item.endNode].filter(n=>n?.important).map(n=>nodeName(n.name)).join(' · ')));
      const actions=element('div',undefined,'entry-actions');
      const iconAction=(key,label,fn,aria,path)=>{const button=action('',fn,aria);button.className='journey-icon-button item-action';button.dataset.itemAction=key;button.title=t(label);button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="'+path+'"/></svg>';return button;};
      const up=iconAction('earlier','Earlier',()=>moveItem(item.id,-1),'Move '+item.name+' earlier','M12 20V4m-6 6 6-6 6 6'),down=iconAction('later','Later',()=>moveItem(item.id,1),'Move '+item.name+' later','M12 4v16m-6-6 6 6 6-6');up.disabled=index===0;down.disabled=index===entries.length-1;
      actions.append(iconAction('edit','Edit',()=>editItem(item.id),'Edit '+item.name,'m15 4 5 5M4 20l5-1L21 7l-4-4L5 15l-1 5Z'),iconAction('locate','Locate',()=>map.fit(kind==='point'?[item.coordinates]:item.coordinates),'Locate '+item.name,'M12 2v4m0 12v4M2 12h4m12 0h4M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0M13 12a1 1 0 1 1-2 0 1 1 0 0 1 2 0'),up,down,iconAction('remove','Remove',()=>{if(confirm(t('Remove “'+item.name+'” from this journey?'))){trip().items=trip().items.filter(i=>i.id!==item.id);changed();}},'Remove '+item.name,'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6'));
      const download=action('',()=>review([item.id]),t('Export {name}',{name:item.name}));download.className='journey-icon-button item-export';download.title=t('Export {name}',{name:item.name});download.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 15v6h14v-6"/></svg>';actions.append(download);li.append(actions);list.append(li);
    });
  }
  el('itinerary').scrollTop=scroll;
}
function refreshSelection(){const ids=new Set(trip().items.map(i=>i.id));for(const id of selectedItems)if(!ids.has(id))selectedItems.delete(id);el('selection-count').textContent=t('{count} selected',{count:selectedItems.size});el('export-selected').disabled=!selectedItems.size;}
function moveItem(id,offset) {
  const items=trip().items,index=items.findIndex(i=>i.id===id),item=items[index];if(!item)return;
  const siblings=items.filter(i=>i.kind===item.kind),other=siblings[siblings.indexOf(item)+offset];if(!other)return;
  const target=items.indexOf(other);[items[index],items[target]]=[items[target],items[index]];changed();
}
function renderFolderLocation() {
  const location=store.folderLocation||(store.folder?'…/'+store.folder.name:'');
  el('folder-location').hidden=!location;el('folder-path').textContent=t(location);
  el('folder-location-label').textContent=t(store.folder?'Connected folder':'Saved folder · reconnect to sync');
}
function resetBuilder() {
  routeRequest?.abort();for(const request of Object.values(searchRequests))request?.abort();
  places={start:null,end:null,point:null};options=[];selectedOption=-1;replaceId=null;
  el('segment-form').reset();el('point-form').reset();restoreBuilderDates();el('cancel-replace').hidden=true;el('route-options').replaceChildren();el('find-routes').disabled=false;el('find-routes').textContent=t('Find route options');
  for(const id of ['start','end','point'])clearSearch(id);
  cancelPicking();updateModeHint();status('');
}
function invalidateRoutes() {routeRequest?.abort();const hadOptions=options.length>0||selectedOption!==-1;options=[];selectedOption=-1;el('route-options').replaceChildren();el('find-routes').disabled=false;el('find-routes').textContent=t('Find route options');if(hadOptions)updateMapOptions();}
function activateTrip(id) {el('itinerary').scrollTop=0;selectedItems.clear();workspace.activeTrip=id;resetBuilder();el('trip-name').value=trip().name;renderTrips();renderItinerary();updateMap();const coordinates=trip().items.filter(item=>item.visible!==false).flatMap(item=>item.kind==='point'?[item.coordinates]:item.coordinates);if(coordinates.length)map.fit(coordinates);save();}
function clearSearch(key) {
  clearTimeout(searchTimers[key]);searchRequests[key]?.abort();suggestions[key]=[];suggestionIndex[key]=-1;
  const input=el(key+'-query'),results=el(key+'-results');results.replaceChildren();results.hidden=true;
  input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');input.removeAttribute('aria-busy');translatedStatus(el(key+'-search-status'),'');
}
function selectPlace(key,place,{fit=true}={}) {
  clearSearch(key);places[key]={...place};el(key+'-query').value=place.name;
  if(key==='point'&&!el('point-name').value)el('point-name').value=nodeName(place.name);
  if(key!=='point')invalidateRoutes();if(fit)map.fit([place.coordinates]);status('Selected '+nodeName(place.name)+'.');
}
function highlightSuggestion(key,index) {
  const matches=suggestions[key]||[];if(!matches.length)return;
  suggestionIndex[key]=(index+matches.length)%matches.length;
  const buttons=[...el(key+'-results').children];buttons.forEach((button,i)=>button.setAttribute('aria-selected',String(i===suggestionIndex[key])));
  const active=buttons[suggestionIndex[key]];el(key+'-query').setAttribute('aria-activedescendant',active.id);active.scrollIntoView({block:'nearest'});
}
async function searchPlace(key,{automatic=false}={}) {
  clearSearch(key);const input=el(key+'-query'),query=input.value;
  if(automatic&&query.trim().length<2)return;
  const request=searchRequests[key]=new AbortController();input.setAttribute('aria-busy','true');translatedStatus(el(key+'-search-status'),'Searching…');if(!automatic)status('Finding places…');
  try {
    const results=await geocode(query,request.signal);if(request.signal.aborted||query!==input.value)return;
    if(!results.length){translatedStatus(el(key+'-search-status'),'No matching places. Try a city, address, or coordinates.');if(!automatic)status('No places found. Try a more specific name or latitude, longitude.');return;}
    if(!automatic&&(parseLatLon(query)||results.length===1)){selectPlace(key,results[0]);return;}
    suggestions[key]=results;suggestionIndex[key]=-1;
    el(key+'-results').replaceChildren(...results.map((place,index)=>{const button=action('',()=>selectPlace(key,place));button.textContent=place.name;button.id=key+'-suggestion-'+index;button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.tabIndex=-1;return button;}));
    el(key+'-results').hidden=false;input.setAttribute('aria-expanded','true');translatedStatus(el(key+'-search-status'),`${results.length} suggestions · use ↑ / ↓ and Enter to select.`);
    if(!automatic)status('Choose the matching place from the results.');
  }catch(error){if(!request.signal.aborted){translatedStatus(el(key+'-search-status'),error.message);if(!automatic)status(error.message);}}
  finally{if(searchRequests[key]===request)input.removeAttribute('aria-busy');}
}
function scheduleSearch(key,event) {
  places[key]=null;clearSearch(key);if(key!=='point')invalidateRoutes();
  if(event?.isComposing||el(key+'-query').value.trim().length<2)return;
  searchTimers[key]=setTimeout(()=>searchPlace(key,{automatic:true}),300);
}
function toggleBuilder(point) {cancelPicking();
  el('segment-form').hidden=point;el('point-form').hidden=!point;el('segment-tab').setAttribute('aria-pressed',String(!point));el('point-tab').setAttribute('aria-pressed',String(point));
  if(point)invalidateRoutes();if(!point){cancelPicking();}status('');
}
function updateModeHint() {el('segment-vehicle-label').hidden=modeValue('segment-mode')!=='car';el('mode-hint').textContent=t(modeValue('segment-mode')==='walk'?'Compare walking routes along the pedestrian network.':modeValue('segment-mode')==='car'?'Compare road routes, including suggested detours where available.':modeValue('segment-mode')==='transit'?'Geographic sketch; public transport routes and schedules are not verified. Import a route file for exact geometry.':'Compare geographic planning sketches, directly or via suggested hubs. These are not verified services or rail-track routes.');}
function renderOptions() {
  const host=el('route-options');host.replaceChildren();
  options.forEach((option,index)=>{
    const button=action('',()=>{selectedOption=index;renderOptions();updateMapOptions();map.fit(option.coordinates);});button.className='route-option';button.setAttribute('aria-pressed',String(index===selectedOption));
    button.append(element('strong',t(option.label)),element('small',distanceLabel(option.distance,workspace.units)+(option.duration?' · '+Math.floor(option.duration/3600)+(workspace.language==='zh'?'时 ':'h ')+Math.round(option.duration%3600/60)+(workspace.language==='zh'?'分（估计）':'m (estimate)'):'')),element('small',t(option.note)));host.append(button);
  });
  if(options.length){const add=action(replaceId?'Replace this segment':'Add selected segment',addSegment);add.className='button forest full';add.disabled=selectedOption<0;host.append(add);}
}
async function searchRoutes(event) {
  event.preventDefault();invalidateRoutes();
  for(const key of ['start','end'])if(!places[key]){await searchPlace(key);if(!places[key])return;}
  try{validateTimes(dateValue('segment-start'),dateValue('segment-end'));}catch(error){status(error.message);return;}
  const request=routeRequest=new AbortController(),active=trip().id;
  el('find-routes').disabled=true;el('find-routes').textContent=t('Comparing routes…');status('Finding route options…');
  try {
    const result=await findRoutes(places.start.coordinates,places.end.coordinates,modeValue('segment-mode'),request.signal,status);
    if(request.signal.aborted||trip().id!==active)return;options=result;selectedOption=0;renderOptions();updateMapOptions();map.fit(options[selectedOption].coordinates);
    status(modeValue('segment-mode')==='transit'?'Public transport sketch ready. Import an existing route for exact geometry.':result.length>=3?`${result.length} options found. Preview one, then add it to your itinerary.`:`${result.length} distinct option${result.length===1?'':'s'} available for these places. The service could not find three valid alternatives.`);
  }catch(error){if(!request.signal.aborted)status(error.message);}finally{if(routeRequest===request){el('find-routes').disabled=false;el('find-routes').textContent=t('Find route options');}}
}
function addSegment() {
  const option=options[selectedOption];if(!option)return;
  try {
    const start=dateValue('segment-start'),end=dateValue('segment-end');validateTimes(start,end);
    const item={id:replaceId||uid(),kind:'segment',name:nodeName(places.start.name)+' → '+nodeName(places.end.name),mode:modeValue('segment-mode'),vehicle:modeValue('segment-mode')==='car'?el('segment-vehicle').value.trim():'',coordinates:option.coordinates,startNode:{...places.start,important:el('start-important').checked},endNode:{...places.end,important:el('end-important').checked},start,end,notes:el('segment-notes').value,routeSource:option.source,routeLabel:option.label};
    const index=trip().items.findIndex(i=>i.id===replaceId);if(index>=0)trip().items[index]=item;else trip().items.push(item);
    if(!replaceId)trip().dateDefaults={start:dateLabel(start),end:dateLabel(end)};
    workspace.itineraryTab='routes';const endPlace={...places.end};resetBuilder();setMode('segment-mode',item.mode);el('segment-vehicle').value=item.vehicle||'';updateModeHint();places.start=endPlace;el('start-query').value=endPlace.name;changed();map.fit(item.coordinates);status('Segment saved. Continue from this destination, or add a place.');
  }catch(error){status(error.message);}
}
async function addPoint(event) {
  event.preventDefault();if(!places.point){await searchPlace('point');if(!places.point)return;}
  try{const start=dateValue('point-start'),end=dateValue('point-end');validateTimes(start,end);trip().dateDefaults={start:dateLabel(start),end:dateLabel(end)};workspace.itineraryTab='places';trip().items.push({id:uid(),kind:'point',name:el('point-name').value.trim()||nodeName(places.point.name),coordinates:places.point.coordinates,important:el('point-important').checked,start,end,notes:el('point-notes').value});const coordinates=places.point.coordinates;places.point=null;el('point-form').reset();restoreBuilderDates();cancelPicking();changed();map.fit([coordinates]);status('Place saved to your journey.');}catch(error){status(error.message);}
}
function editItem(id) {
  const item=trip().items.find(i=>i.id===id);if(!item)return;editingId=id;const point=item.kind==='point';
  el('edit-title').textContent=t(point?'Edit place':'Edit route segment');el('edit-name').value=item.name;el('edit-notes').value=item.notes||'';writeDateFields('edit-start',item.start);writeDateFields('edit-end',item.end);el('edit-error').textContent=t('');
  el('edit-point-fields').hidden=!point;el('edit-mode-label').hidden=point;el('edit-segment-fields').hidden=point;el('replace-route').hidden=point;
  el('edit-lat').required=el('edit-lon').required=point;
  if(point){el('edit-lat').value=item.coordinates[1];el('edit-lon').value=item.coordinates[0];el('edit-important').checked=!!item.important;}
  else{setMode('edit-mode',item.mode);el('edit-start-important').checked=!!item.startNode?.important;el('edit-end-important').checked=!!item.endNode?.important;}
  el('edit-vehicle').value=item.vehicle||'';el('edit-vehicle-label').hidden=point||item.mode!=='car';
  el('edit-dialog').showModal();
}
function submitEdit(event) {
  event.preventDefault();const item=trip().items.find(i=>i.id===editingId);if(!item)return;
  try{const start=dateValue('edit-start'),end=dateValue('edit-end');validateTimes(start,end);
    Object.assign(item,{name:el('edit-name').value.trim()||item.name,notes:el('edit-notes').value,start,end});
    if(item.kind==='point'){item.coordinates=[Number(el('edit-lon').value),Number(el('edit-lat').value),...item.coordinates.slice(2)];item.important=el('edit-important').checked;}
    else{item.mode=modeValue('edit-mode');item.vehicle=el('edit-vehicle').value.trim();item.startNode.important=el('edit-start-important').checked;item.endNode.important=el('edit-end-important').checked;}
    el('edit-dialog').close();changed();
  }catch(error){el('edit-error').textContent=t(error.message);}
}
function replaceRoute() {
  const item=trip().items.find(i=>i.id===editingId);if(!item)return;
  resetBuilder();toggleBuilder(false);replaceId=item.id;places.start={...item.startNode};places.end={...item.endNode};
  el('start-query').value=places.start.name;el('end-query').value=places.end.name;setMode('segment-mode',item.mode);el('segment-vehicle').value=item.vehicle||'';el('start-important').checked=!!places.start.important;el('end-important').checked=!!places.end.important;
  writeDateFields('segment-start',item.start);writeDateFields('segment-end',item.end);el('segment-notes').value=item.notes||'';el('cancel-replace').hidden=false;updateModeHint();el('edit-dialog').close();el('segment-form').scrollIntoView({block:'nearest',behavior:'smooth'});status('Choose new endpoints or a route. The existing segment stays in place until you confirm its replacement.');
}
function review(ids) {
  reviewTrip=subsetTrip(trip(),trip().items.filter(item=>!Array.isArray(ids)||ids.includes(item.id)));
  if(!reviewTrip.items.length){status('Add a segment or place before exporting.');return;}
  el('review-summary').textContent=reviewTrip.name+' · '+t('{count} selected',{count:reviewTrip.items.length});el('review-list').replaceChildren(...reviewTrip.items.map(i=>element('li',i.name+' · '+(i.kind==='point'?t('Place'):modeLabel(i.mode)))));
  const segments=reviewTrip.items.filter(i=>i.kind==='segment'),gaps=segments.slice(1).filter((i,index)=>distance(segments[index].coordinates.at(-1),i.coordinates[0])>1000).length;
  el('review-warning').textContent=t([gaps?`${gaps} gap(s) between consecutive segments; exported as separate lines.`:'',segments.some(i=>i.routeSource==='Planning sketch')?'Planning sketches are included as labeled geometries. Verify actual train / flight services separately.':'',...(trip().importWarnings||[])].filter(Boolean).map(message=>t(message)).join(' '));
  el('confirm-journey').checked=false;el('export-kml').disabled=true;el('review-dialog').showModal();
}
function renderImportReport() {
  el('import-report').hidden=!importState;if(!importState)return;
  const {busy,index,total,name,results}=importState,imported=results.filter(result=>result.imported),failed=results.filter(result=>result.error);
  const summary=busy?t('Importing {index} of {total}: {name}',{index,total,name}):[
    imported.length===1?t('File imported as a new journey. Your other journeys are preserved.'):imported.length?t('Imported {count} files as separate journeys.',{count:imported.length}):t('No journeys were imported.'),
    failed.length?t('{count} file(s) could not be imported.',{count:failed.length}):''
  ].filter(Boolean).join(' ');
  el('import-status').textContent=summary;
  const details=results.flatMap(result=>(result.error?[result.error]:result.warnings).map(message=>element('li',result.name+' — '+t(message))));
  el('import-details').replaceChildren(...details);el('import-details').hidden=!details.length;
}
async function importFiles(event) {
  const input=event.target,files=Array.from(input.files||[]);input.value='';if(!files.length||importState?.busy)return;
  const button=el('import-kml'),imported=[];input.disabled=button.disabled=true;button.setAttribute('aria-busy','true');
  importState={busy:true,index:0,total:files.length,name:'',results:[]};
  try{
    // Parse one archive at a time. One damaged file must not discard the rest.
    for(const [index,file]of files.entries()){
      Object.assign(importState,{index:index+1,name:file.name});renderImportReport();
      try{for await(const result of importJourneyEntries(file,name=>{importState.name=name;renderImportReport();})){
        if(result.error)importState.results.push({name:result.name,error:result.error});
        else{result.trip.importWarnings=result.warnings;imported.push(result.trip);importState.results.push({imported:true,warnings:result.warnings,name:result.name});}
      }}
      catch(error){importState.results.push({name:file.name,error:error?.message||String(error)});}
    }
    // Append and render once; keep valid imported colors and custom video titles.
    if(imported.length){workspace.trips.push(...imported);colorJourneys(workspace);activateTrip(imported[0].id);}
    const messages=importState.results.flatMap(result=>(result.error?[result.error]:result.warnings).map(message=>result.name+' — '+t(message)));
    status(messages.join(' ')||(imported.length===1?'File imported as a new journey. Your other journeys are preserved.':t('Imported {count} files as separate journeys.',{count:imported.length})));
  }finally{importState.busy=false;input.disabled=button.disabled=false;button.removeAttribute('aria-busy');renderImportReport();}
}
const bucketSelectionKey=()=>workspace.bucketMode==='countries'?'visitedCountries':workspace.bucketMode==='states'?'visitedStates':'visited';
const bucketTitleKey=()=>workspace.bucketMode==='countries'?'countriesPosterTitle':workspace.bucketMode==='mixed'?'mixedPosterTitle':workspace.bucketMode==='states'?'statesPosterTitle':'posterTitle';
const bucketGroups=()=>[{mode:'parks',key:'visited',entries:parks},{mode:'states',key:'visitedStates',entries:states},{mode:'countries',key:'visitedCountries',entries:countries}].filter(group=>workspace.bucketMode==='mixed'?group.mode!=='countries':group.mode===workspace.bucketMode);
const bucketVisited=()=>workspace.bucketMode==='mixed'?{parks:[...workspace.visited],states:[...workspace.visitedStates]}:[...workspace[bucketSelectionKey()]];
const bucketTemplate=()=>workspace.posterTemplate==='passport'&&workspace.bucketMode==='countries'?'fieldnotes':workspace.posterTemplate;
function syncBucketControls() {
  const statesMode=workspace.bucketMode==='states',mixed=workspace.bucketMode==='mixed',world=workspace.bucketMode==='countries';
  el('bucket-title').textContent=t(world?'The World Bucket List':mixed?'Parks & States Bucket List':statesMode?'The Fifty States Bucket List':'The National Parks Bucket List');
  for(const mode of ['parks','states','countries','mixed'])el('bucket-'+mode).setAttribute('aria-pressed',String(workspace.bucketMode===mode));
  el('poster-title').value=workspace[bucketTitleKey()];el('bucket-search-label').textContent=t(world?'Find a country or region':mixed?'Find a park or state':statesMode?'Find a state':'Find a park');el('park-filter').placeholder=t(world?'Search names or country codes':statesMode?'Search states or abbreviations':'Search parks or states');
  for(const button of document.querySelectorAll('button[data-template]')){const badge=button.dataset.template==='passport';button.hidden=badge&&world;button.setAttribute('aria-pressed',String(button.dataset.template===bucketTemplate()));button.querySelector('img').src='images/poster-templates/'+(badge?(statesMode?'states-':mixed?'mixed-':''):world?'world-':'')+button.dataset.template+'.webp';if(badge){const span=button.querySelector('span');span.replaceChildren(document.createTextNode(t(statesMode?'State Passport':mixed?'Parks & States Passport':'Park Passport')),element('small',t(statesMode?'Collect the state badges':mixed?'Collect park and state badges':'Collect the park badges')));}}
  for(const button of document.querySelectorAll('button[data-orientation]'))button.setAttribute('aria-pressed',String(button.dataset.orientation===workspace.posterOrientation));
  const size=workspace.posterOrientation==='landscape'?'6000 × 4800':'4800 × 6000';el('poster-size').textContent=size+' JPG';el('export-poster').textContent=t('Download JPG · {size}',{size});
  const source=el('bucket-source');source.replaceChildren();
  if(world){source.append(t('Countries and regions, including small islands. Visited places are colored on the world map.'),' ');const link=element('a',t('Map & checklist sources'));link.href='data/WORLD_COUNTRIES_SOURCES.md';link.target='_blank';link.rel='noopener';source.append(link);}
  else if(statesMode)source.textContent=t('All 50 US states, including Alaska and Hawaii. Washington, DC and territories are not states.');
  else{const link=element('a',t('National Park Service list'));link.href='https://www.nps.gov/aboutus/national-park-system.htm';link.target='_blank';link.rel='noopener';source.append(link,' '+t('· Updated November 2026'));}
}
function renderBucket() {
  const groups=bucketGroups(),query=el('park-filter').value.toLowerCase();let found=0;
  const counts=()=>el('park-count').textContent=groups.map(({entries,key,mode})=>t(`${entries.filter(p=>workspace[key].includes(p.id)).length} of ${entries.length} ${mode==='countries'?'countries & regions':mode} explored`)).join(' · ');
  counts();el('park-checklist').replaceChildren();el('parks-all').disabled=groups.every(g=>!g.entries.length);el('parks-clear').disabled=groups.every(g=>!workspace[g.key].length);
  if(workspace.bucketMode==='countries'&&!countries.length){
    el('park-checklist').append(element('p',t('Loading countries and regions…'),'group-empty'));
    if(!countryLoading){countryLoading=true;countryAssets().then(([data])=>{countries=data.countries;if(workspace.bucketMode==='countries'&&el('bucket-dialog').open){renderBucket();queuePoster();}}).catch(error=>{if(workspace.bucketMode==='countries'){el('poster-status').textContent=t(error.message);const retry=action('Try again',renderBucket);retry.className='text-button';el('park-checklist').replaceChildren(element('p',t(error.message),'group-empty'),retry);}}).finally(()=>countryLoading=false);}
    return;
  }
  for(const {entries,key,mode} of groups){
    const visited=new Set(workspace[key]),source=mode==='countries'?countryChecklist({countries:entries},workspace.language):entries,matches=source.filter(p=>[p.name,p.nameZh,p.id,p.state,p.region,t(p.region||'')].filter(Boolean).join(' ').toLowerCase().includes(query.trim()));found+=matches.length;
    if(workspace.bucketMode==='mixed'&&matches.length)el('park-checklist').append(element('h3',t(mode==='parks'?'National parks':'US states'),'checklist-heading'));
    el('park-checklist').append(...matches.map(entry=>{
      const label=element('label',undefined,'check'),input=document.createElement('input');input.type='checkbox';input.checked=visited.has(entry.id);input.value=entry.id;input.dataset.collection=mode;
      input.addEventListener('change',()=>{workspace[key]=input.checked?[...new Set([...workspace[key],entry.id])]:workspace[key].filter(id=>id!==entry.id);save();counts();el('parks-clear').disabled=!workspace[key].length&&bucketGroups().every(g=>!workspace[g.key].length);queuePoster();});
      const span=element('span',entry.displayName||entry.name);span.append(element('small',mode==='countries'?entry.id+' · '+t(entry.region):entry.state));label.append(input,span);return label;
    }));
  }
  if(!found)el('park-checklist').append(element('p',t('No matches. Try another name.'),'group-empty'));
}
async function drawPoster() {
  const generation=++posterGeneration,visited=bucketVisited(),title=workspace[bucketTitleKey()],options={mode:workspace.bucketMode,template:bucketTemplate(),orientation:workspace.posterOrientation,language:workspace.language};
  el('export-poster').disabled=true;
  try{
    if(generation!==posterGeneration)return false;
    const draft=document.createElement('canvas');await renderPoster(draft,visited,title,options);if(generation!==posterGeneration)return false;
    const canvas=el('park-poster');canvas.width=draft.width;canvas.height=draft.height;canvas.getContext('2d').drawImage(draft,0,0);canvas._posterRender=draft._posterRender;canvas.setAttribute('aria-label',draft.getAttribute('aria-label')||'Travel poster');canvas.dataset.mode=options.mode;canvas.dataset.template=options.template;canvas.dataset.orientation=options.orientation;canvas.dataset.language=options.language;preview.paint();draft.width=draft.height=1;
    el('poster-status').textContent=t('');el('export-poster').disabled=false;return true;
  }catch(error){if(generation===posterGeneration){el('poster-status').textContent=t(error.message);el('export-poster').disabled=true;}return false;}
}
function queuePoster(){cancelAnimationFrame(posterFrame);posterGeneration++;el('export-poster').disabled=true;posterFrame=requestAnimationFrame(drawPoster);}
async function openBucket() {
  el('bucket-dialog').showModal();syncBucketControls();el('poster-status').textContent=t('Preparing your travel print…');el('export-poster').disabled=true;
  try{const [data,geography]=await parkAssets();parks=data.parks;states=stateChecklist(geography);renderBucket();await drawPoster();preview.fit();}catch(error){el('poster-status').textContent=t(error.message);}
}
function switchBucket(mode) {workspace.bucketMode=mode;el('park-filter').value='';syncBucketControls();renderBucket();queuePoster();save();}
function cancelPicking(){pickingTarget=null;map.pick(false);for(const key of ['start','end','point'])el('pick-'+key).setAttribute('aria-pressed','false');}
function beginPicking(key){const active=pickingTarget!==key;cancelPicking();if(active){pickingTarget=key;playback.exit();map.pick(true);el('pick-'+key).setAttribute('aria-pressed','true');document.querySelector('.studio-map-panel').scrollIntoView({behavior:'smooth',block:'center'});}status(active?'Click or tap a location on the map. You can also enter latitude, longitude.':'Map selection cancelled.');}
const map=new JourneyMap(point=>{const key=pickingTarget||'point';cancelPicking();layout.open();toggleBuilder(key==='point');selectPlace(key,{name:point[1].toFixed(5)+', '+point[0].toFixed(5),coordinates:point},{fit:false});el(key+'-query').scrollIntoView({block:'nearest',behavior:'smooth'});status(key==='point'?'Map location selected. Give it a name and add it to the journey.':'Endpoint selected on the map.');},(id,tripId)=>{if(tripId&&tripId!==trip().id)activateTrip(tripId);selectedItems.add(id);renderItinerary();updateMap();editItem(id);});

const playback=new JourneyPlayback(map);
const geolocation=setupLocation({map,playback,getUnits:()=>workspace.units,cancelPicking});
const layout=setupStudioLayout({getWorkspace:()=>workspace,save,playback});
const preview=new PosterPreview(el('poster-viewport'),el('park-poster'),el('poster-zoom-level'));
const mapExport=setupMapExport({map,playback,getWorkspace:()=>workspace,getTrip:trip});
const videoExport=setupVideoExport({map,playback,getWorkspace:()=>workspace});
const batchExport=setupBatchExport({getWorkspace:()=>workspace,report:status});
function updateMapOptions(){map.updateOptions((trip().visible===false?[]:options).map(option=>({...option,mode:modeValue('segment-mode')})),selectedOption);}
function updateMap(){colorJourneys(workspace);const journeys=workspace.trips.filter(journey=>journey.visible!==false);playback.sync(trip().visible===false?{...trip(),items:[]}:trip(),journeys,workspace.transportSpeeds);map.update(journeys.flatMap(journey=>journey.items.filter(item=>item.visible!==false).map(item=>({...item,_selected:journey.id===trip().id&&selectedItems.has(item.id),_color:journey.color,_tripId:journey.id}))),(trip().visible===false?[]:options).map(option=>({...option,mode:modeValue('segment-mode')})),selectedOption);document.documentElement.style.setProperty('--journey-color',trip().color);}
async function syncNationalParks() {
  el('toggle-national-parks').setAttribute('aria-pressed',String(workspace.showNationalParks));
  try{if(workspace.showNationalParks&&!parks.length){const [data,geography]=await parkAssets();parks=data.parks;states=stateChecklist(geography);}map.setNationalParks(parks,workspace.showNationalParks);}
  catch(error){workspace.showNationalParks=false;el('toggle-national-parks').setAttribute('aria-pressed','false');status(error.message);}
}
function renderColors(){
  el('palette-picker').replaceChildren(...Object.entries(palettes).map(([key,palette])=>{
    const button=action(palette.name,()=>{workspace.palette=key;const colors=paletteColors(workspace);workspace.trips.forEach((journey,index)=>{journey.color=colors[index%colors.length];journey.updatedAt=Date.now();});changed();});button.dataset.palette=key;button.setAttribute('aria-pressed',String(workspace.palette===key));
    const swatches=element('span',undefined,'palette-swatches');swatches.setAttribute('aria-hidden','true');(key==='single'?[workspace.singleColor]:palette.colors).slice(0,4).forEach(color=>{const dot=element('i');dot.style.backgroundColor=color;swatches.append(dot);});button.prepend(swatches);return button;
  }));
  el('journey-color-list').replaceChildren(...workspace.trips.map(journey=>{
    const label=element('label'),input=document.createElement('input');input.type='color';input.value=journey.color;input.setAttribute('aria-label',t('Color for {name}',{name:journey.name}));input.dataset.tripColor=journey.id;
    input.addEventListener('input',()=>{journey.color=input.value;journey.updatedAt=Date.now();renderJourneyList();updateMap();save();});label.append(input,element('span',journey.name));return label;
  }));el('single-color-label').hidden=workspace.palette!=='single';el('single-journey-color').value=workspace.singleColor;
}
function applyPreferences(){
  setLanguage(workspace.language);translateStatic();refreshStatuses();layout.refresh();for(const [button,format]of [['export-kml',document.querySelector('[name=export-format]:checked').value],['download-map-kml',el('map-file-format').value]])el(button).textContent=t('Export '+(format==='geojson'?'GeoJSON':format.toUpperCase()));
  renderImportReport();renderTransportSpeeds();vehiclePicker.refresh();
  for(const node of document.querySelectorAll('[data-brand-name]'))node.textContent=workspace.language==='zh'?'玩嘚儿了':'Wanderlust';
  for(const node of document.querySelectorAll('.brand-tilde'))node.hidden=workspace.language!=='zh';
  for(const node of document.querySelectorAll('.brand-period'))node.hidden=workspace.language==='zh';
  for(const button of document.querySelectorAll('button[data-language]'))button.setAttribute('aria-pressed',String(button.dataset.language===workspace.language));
  for(const button of document.querySelectorAll('button[data-units]'))button.setAttribute('aria-pressed',String(button.dataset.units===workspace.units));
  el('globe-gesture-hint').hidden=workspace.mapView!=='globe'||!!map.sketch;
  el('map-theme').value=workspace.mapTheme;refreshMapHint();map.setUnits(workspace.units);map.setTheme(workspace.mapTheme);map.setView(workspace.mapView);
  for(const button of document.querySelectorAll('button[data-map-view]'))button.setAttribute('aria-pressed',String(button.dataset.mapView===(map.sketch?'2d':workspace.mapView)));
  renderTrips();renderItinerary();renderOptions();renderFolderLocation();updateModeHint();updateMap();
  syncNationalParks();
  geolocation.refresh();mapExport.refresh();videoExport.refresh();if(!el('sample-details').hidden)sampleData().then(data=>el('sample-note').textContent=data.notes[workspace.language]||data.notes.en).catch(()=>{});
  el('find-routes').textContent=t(el('find-routes').disabled?'Comparing routes…':'Find route options');
  if(el('bucket-dialog').open){syncBucketControls();renderBucket();queuePoster();}
  if(!window.showDirectoryPicker){el('connect-folder').textContent=t('About local storage');el('storage-note').textContent=t('Automatically saved in this browser. For a hidden folder on disk, open this page in desktop Chrome or Edge.');}
}
function renderTransportSpeeds(){
  for(const input of document.querySelectorAll('[data-transport-speed]'))input.value=workspace.transportSpeeds[input.dataset.transportSpeed];
}
for(const input of document.querySelectorAll('[data-transport-speed]'))input.addEventListener('change',()=>{
  if(!input.checkValidity()||!Number.isFinite(input.valueAsNumber)){input.reportValidity();return;}
  workspace.transportSpeeds=normalizeTransportSpeeds({...workspace.transportSpeeds,[input.dataset.transportSpeed]:input.valueAsNumber});renderTransportSpeeds();updateMap();save();
});
el('reset-transport-speeds').addEventListener('click',()=>{workspace.transportSpeeds={...DEFAULT_TRANSPORT_SPEEDS};renderTransportSpeeds();updateMap();save();});
el('open-settings').addEventListener('click',()=>{renderColors();renderTransportSpeeds();el('settings-dialog').showModal();});
el('load-samples').addEventListener('click',async()=>{
  const button=el('load-samples');button.disabled=true;el('samples-status').textContent=t('Loading test journeys…');
  try{
    const data=await sampleData(),result=addSampleJourneys(workspace,data);playback.pause();if(result.first)activateTrip(result.first);else changed();
    el('samples-status').textContent=t(result.added?'Added {count} sample journeys. Your existing journeys are kept.':'Test journeys are already loaded.',{count:result.added});
    el('sample-details').hidden=false;el('sample-note').textContent=data.notes[workspace.language]||data.notes.en;el('sample-sources').replaceChildren(...data.sources.map(source=>{const li=element('li'),a=element('a',source.title);a.href=source.url;a.target='_blank';a.rel='noopener';li.append(a);return li;}));save();
  }catch(error){el('samples-status').textContent=t(error.message);}finally{button.disabled=false;}
});
el('toggle-national-parks').addEventListener('click',async()=>{workspace.showNationalParks=!workspace.showNationalParks;await syncNationalParks();save();});
for(const button of document.querySelectorAll('button[data-language]'))button.addEventListener('click',()=>{workspace.language=button.dataset.language;applyPreferences();save();});
for(const button of document.querySelectorAll('button[data-units]'))button.addEventListener('click',()=>{workspace.units=button.dataset.units;applyPreferences();save();});
for(const [id,visible] of [['journeys-show-all',true],['journeys-hide-all',false]])el(id).addEventListener('click',()=>{workspace.trips.forEach(journey=>{journey.visible=visible;journey.updatedAt=Date.now();});renderJourneyList();updateMap();save();});
el('single-journey-color').addEventListener('input',()=>{workspace.singleColor=el('single-journey-color').value;workspace.trips.forEach(journey=>{journey.color=workspace.singleColor;journey.updatedAt=Date.now();});renderJourneyList();for(const input of document.querySelectorAll('[data-trip-color]'))input.value=workspace.singleColor;el('palette-picker').querySelector('[data-palette=single] i').style.backgroundColor=workspace.singleColor;updateMap();save();});
function refreshMapHint(){const hint=rasterThemes[workspace.mapTheme]?.hint;el('map-theme-hint').textContent=hint?t(hint):'';el('map-theme-hint').hidden=!hint;}
el('map-theme').addEventListener('change',async()=>{const theme=el('map-theme').value;workspace.mapTheme=theme;refreshMapHint();const ok=await map.setTheme(theme);if(!ok&&el('map-theme').value===theme){workspace.mapTheme=map.theme;el('map-theme').value=map.theme;refreshMapHint();}save();});
for(const button of document.querySelectorAll('button[data-map-view]'))button.addEventListener('click',()=>{workspace.mapView=button.dataset.mapView;el('globe-gesture-hint').hidden=workspace.mapView!=='globe';map.setView(workspace.mapView);for(const control of document.querySelectorAll('button[data-map-view]'))control.setAttribute('aria-pressed',String(control===button));save();});
document.addEventListener('studio-map-fallback',()=>{el('map-capability-note').hidden=false;el('globe-gesture-hint').hidden=true;for(const button of document.querySelectorAll('button[data-map-view]')){button.disabled=button.dataset.mapView!=='2d';button.setAttribute('aria-pressed',String(button.dataset.mapView==='2d'));}});
for(const button of document.querySelectorAll('button[data-orientation]'))button.addEventListener('click',()=>{workspace.posterOrientation=button.dataset.orientation;syncBucketControls();queuePoster();preview.fit();save();});
el('poster-zoom-in').addEventListener('click',()=>preview.scale(1.25));el('poster-zoom-out').addEventListener('click',()=>preview.scale(.8));el('poster-fit').addEventListener('click',()=>preview.fit());

el('segment-tab').addEventListener('click',()=>toggleBuilder(false));el('point-tab').addEventListener('click',()=>toggleBuilder(true));
el('segment-mode').addEventListener('change',()=>{invalidateRoutes();updateModeHint();});
for(const key of ['start','end','point']) {
  const input=el(key+'-query');
  document.querySelector(`[data-search="${key}"]`).addEventListener('click',()=>searchPlace(key));
  input.addEventListener('input',event=>scheduleSearch(key,event));input.addEventListener('compositionend',()=>scheduleSearch(key));
  input.addEventListener('keydown',event=>{
    if(event.isComposing)return;
    if(event.key==='Escape'){clearSearch(key);return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(suggestions[key]?.length)highlightSuggestion(key,(suggestionIndex[key]??-1)+(event.key==='ArrowDown'?1:-1));else searchPlace(key,{automatic:true});return;}
    if(event.key==='Enter'){event.preventDefault();const selected=suggestions[key]?.[suggestionIndex[key]];if(selected)selectPlace(key,selected);else searchPlace(key);}
  });
  input.closest('.place-search').addEventListener('focusout',event=>{if(!event.currentTarget.contains(event.relatedTarget))clearSearch(key);});
}

el('segment-form').addEventListener('submit',searchRoutes);el('point-form').addEventListener('submit',addPoint);
for(const key of ['start','end','point'])el('pick-'+key).addEventListener('click',()=>beginPicking(key));
addEventListener('keydown',event=>{if(event.key==='Escape'&&pickingTarget){cancelPicking();status('Map selection cancelled.');}});
el('select-itinerary').addEventListener('click',()=>{trip().items.filter(i=>i.kind===(workspace.itineraryTab==='places'?'point':'segment')).forEach(i=>selectedItems.add(i.id));renderItinerary();updateMap();});
el('clear-itinerary').addEventListener('click',()=>{selectedItems.clear();renderItinerary();updateMap();});
el('export-selected').addEventListener('click',()=>review([...selectedItems]));
el('new-trip').addEventListener('click',()=>{const fresh=makeTrip();workspace.trips.push(fresh);activateTrip(fresh.id);el('trip-name').focus();el('trip-name').select();});
let videoTitleComposing=false;
el('trip-video-title').addEventListener('compositionstart',()=>{videoTitleComposing=true;clearTimeout(saveTimer);});
el('trip-video-title').addEventListener('input',event=>{trip().videoTitle=event.target.value;if(!videoTitleComposing&&!event.isComposing)save({delay:800});});
el('trip-video-title').addEventListener('compositionend',()=>{videoTitleComposing=false;trip().videoTitle=el('trip-video-title').value;save({delay:800});});
el('trip-video-title').addEventListener('change',()=>{if(!videoTitleComposing)save({delay:0});});
el('trip-name').addEventListener('input',()=>{trip().name=el('trip-name').value.trim()||t('Untitled journey');renderJourneyList();save();});
function showFolderSetup(){
  const supported=!!window.showDirectoryPicker||!!store.savedFolder;
  el('folder-setup-message').textContent=t(!supported?'This browser saves journeys on this device, but cannot connect a local folder. Use desktop Chrome or Edge to enable folder sync.':store.connectionIssue==='unreadable'?'The saved folder could not be read. Its files have been kept unchanged. Reconnect it or choose another folder.':store.savedFolder?'Your saved folder needs permission before it can sync. Reconnect to merge its journeys with this browser.':'No local folder is connected. Choose a folder to sync your journeys and keep KML backups in its hidden .wanderlust folder.');
  el('folder-setup-location').textContent=store.folderLocation;el('startup-connect-folder').hidden=!supported;el('startup-connect-folder').textContent=t(store.savedFolder?'Reconnect folder':'Connect folder');el('startup-change-folder').hidden=!store.savedFolder||!window.showDirectoryPicker;
  el('folder-setup-dialog').showModal();
}
let connectingFolder=false;
async function connectFolder(reconnect=false){
  if(connectingFolder)return;connectingFolder=true;clearTimeout(saveTimer);el('folder-setup-error').textContent='';
  for(const id of ['connect-folder','startup-connect-folder','startup-change-folder'])el(id).disabled=true;
  try{
    workspace=await store.connect(workspace,{reconnect});
    if(!workspace.trips.length)workspace.trips.push(makeTrip());
    applyPreferences();activateTrip(workspace.activeTrip);
    if(!store.folder)throw new Error('Folder sync paused; reconnect the folder.');
    el('folder-setup-dialog').close();status('Connected. Journeys and KML copies are saved in the hidden .wanderlust folder inside your chosen directory.');
  }catch(error){if(error.name!=='AbortError'){status(error.message);el('folder-setup-error').textContent=t(error.message);}}
  finally{connectingFolder=false;for(const id of ['connect-folder','startup-connect-folder','startup-change-folder'])el(id).disabled=false;}
}
el('connect-folder').addEventListener('click',()=>connectFolder(!!store.savedFolder&&!store.folder));
el('startup-connect-folder').addEventListener('click',()=>connectFolder(!!store.savedFolder));
el('startup-change-folder').addEventListener('click',()=>connectFolder(false));
el('cancel-replace').addEventListener('click',()=>{resetBuilder();updateMap();});
el('edit-mode').addEventListener('change',()=>{el('edit-vehicle-label').hidden=modeValue('edit-mode')!=='car';});
el('edit-form').addEventListener('submit',submitEdit);el('replace-route').addEventListener('click',replaceRoute);
for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>el(button.dataset.close).close());
el('import-kml').addEventListener('click',()=>el('kml-file').click());el('kml-file').addEventListener('change',importFiles);
el('review-trip').addEventListener('click',review);el('confirm-journey').addEventListener('change',()=>{el('export-kml').disabled=!el('confirm-journey').checked;});
for(const radio of document.querySelectorAll('[name=export-format]'))radio.addEventListener('change',()=>el('export-kml').textContent=t('Export '+(radio.value==='geojson'?'GeoJSON':radio.value.toUpperCase())));
el('export-kml').addEventListener('click',async()=>{el('export-kml').disabled=true;try{const format=document.querySelector('[name=export-format]:checked').value;await downloadJourneys([structuredClone(reviewTrip||trip())],format,(reviewTrip||trip()).name);el('review-dialog').close();status('Journey file exported.');}catch(error){el('review-warning').textContent=t(error.message);}finally{el('export-kml').disabled=!el('confirm-journey').checked;}});
for(const id of ['fit-journey','map-fit'])el(id).addEventListener('click',()=>map.fit());el('map-plus').addEventListener('click',()=>map.zoom(1));el('map-minus').addEventListener('click',()=>map.zoom(-1));
el('open-bucket').addEventListener('click',openBucket);el('park-filter').addEventListener('input',renderBucket);
for(const mode of ['parks','states','countries','mixed'])el('bucket-'+mode).addEventListener('click',()=>switchBucket(mode));
for(const button of document.querySelectorAll('button[data-template]'))button.addEventListener('click',()=>{workspace.posterTemplate=button.dataset.template;syncBucketControls();queuePoster();save();});
el('parks-all').addEventListener('click',()=>{for(const group of bucketGroups())workspace[group.key]=group.entries.map(p=>p.id);renderBucket();queuePoster();save();});
el('parks-clear').addEventListener('click',()=>{const groups=bucketGroups();if(groups.some(group=>workspace[group.key].length)&&!confirm(t('Clear all visited '+(workspace.bucketMode==='mixed'?'parks and states':workspace.bucketMode==='states'?'states':workspace.bucketMode==='countries'?'countries and regions':'parks')+' from this Bucket List?')))return;for(const group of groups)workspace[group.key]=[];renderBucket();queuePoster();save();});
el('poster-title').addEventListener('input',()=>{workspace[bucketTitleKey()]=el('poster-title').value;queuePoster();save();});
el('export-poster').addEventListener('click',async()=>{try{cancelAnimationFrame(posterFrame);const title=workspace[bucketTitleKey()];if(await drawPoster()){el('export-poster').disabled=true;await downloadPoster(el('park-poster'),title);}}catch(error){el('poster-status').textContent=t(error.message);}finally{el('export-poster').disabled=false;}});
addEventListener('pagehide',()=>{if(!loading){clearTimeout(saveTimer);store.save(workspace);}});
// Keep separate tabs in sync without overwriting a newer notebook with stale state.
addEventListener('storage',event=>{if(event.key!=='wanderlust-studio-v1'||!event.newValue)return;try{const remote=JSON.parse(event.newValue);if(remote.version===1&&remote.updatedAt>(workspace.updatedAt||0)){clearTimeout(saveTimer);workspace=normalizeWorkspace(remote);applyPreferences();resetBuilder();el('trip-name').value=trip().name;renderTrips();renderItinerary();updateMap();if(el('bucket-dialog').open){syncBucketControls();renderBucket();queuePoster();}el('save-status').textContent=t('Updated from another tab on this device.');}}catch{}});

try{const saved=await store.open();if(saved)workspace=saved;}catch{el('save-status').textContent=t('Local storage unavailable. Export KML to keep your work.');}
workspace=normalizeWorkspace(workspace);if(!workspace.trips.length)workspace.trips.push(makeTrip());workspace.activeTrip=trip().id;loading=false;restoreBuilderDates();applyPreferences();renderFolderLocation();
el('trip-name').value=trip().name;renderTrips();renderItinerary();updateMap();map.open().then(()=>map.fitCoordinates?map.fit(map.fitCoordinates,{duration:0}):map.userLocation?map.centerLocation():map.view==='globe'&&!map.sketch?map.globeOverview(false):map.fit());
if(!window.showDirectoryPicker){el('connect-folder').textContent=t('About local storage');el('storage-note').textContent=t('Automatically saved in this browser. For a hidden folder on disk, open this page in desktop Chrome or Edge.');}

if(!store.folder)showFolderSetup();
document.documentElement.dataset.studioReady='true';
