import {normalizeTransportSpeeds} from './journey-transport.mjs';
import {colorJourneys,palettes,validColor} from './journey-palettes.mjs';
import {exportKML,validCoordinate,validTime} from './journey-kml.mjs';
const KEY='wanderlust-studio-v1';
export function normalizeWorkspace(data) {
  if(!data || data.version!==1 || !Array.isArray(data.trips) || !data.trips.every(t=>typeof t.id==='string' && typeof t.name==='string' && Array.isArray(t.items) && t.items.every(i=>i && typeof i.id==='string' && typeof i.name==='string' && (i.kind==='point' ? validCoordinate(i.coordinates) : i.kind==='segment' && Array.isArray(i.coordinates) && i.coordinates.length>=2 && i.coordinates.every(validCoordinate))))) throw new Error('The saved notebook is not a supported Journey Studio file.');
  data.visited=Array.isArray(data.visited)?data.visited:[];
  data.visitedStates=Array.isArray(data.visitedStates)?data.visitedStates:[];
  data.visitedCountries=Array.isArray(data.visitedCountries)?[...new Set(data.visitedCountries.filter(id=>typeof id==='string'&&/^[A-Z]{2}$/.test(id)))]:[];
  data.units=data.units==='metric'?'metric':'imperial';
  data.transportSpeeds=normalizeTransportSpeeds(data.transportSpeeds);
  data.language=data.language==='zh'?'zh':'en';
  data.posterOrientation=data.posterOrientation==='landscape'?'landscape':'portrait';
  data.palette=Object.hasOwn(palettes,data.palette)?data.palette:'trail';
  data.singleColor=validColor(data.singleColor)?data.singleColor:'#31765c';
  const active=data.trips.find(trip=>trip.id===data.activeTrip)||data.trips[0];
  for(const trip of data.trips)if(typeof trip.visible!=='boolean')trip.visible=data.showAllJourneys!==false||trip===active;
  for(const trip of data.trips)if(trip.dateDefaults)trip.dateDefaults=Object.fromEntries(['start','end'].map(key=>{const value=trip.dateDefaults[key];return [key,typeof value==='string'&&/^\d{4}-\d{2}(?:-\d{2})?$/.test(value)&&validTime(value)?value:''];}));
  for(const trip of data.trips)trip.videoTitle=typeof trip.videoTitle==='string'?trip.videoTitle.slice(0,240):'';
  delete data.showAllJourneys;
  data.sidebarState=['open','collapsed','hidden'].includes(data.sidebarState)?data.sidebarState:'open';
  data.sidebarPinned=data.sidebarPinned!==false;data.playerHidden=data.playerHidden===true;data.itineraryTab=data.itineraryTab==='places'?'places':'routes';
  data.showNationalParks=data.showNationalParks===true;
  data.mapTheme=['liberty','positron','bright','dark','satellite','hybrid','topo'].includes(data.mapTheme)?data.mapTheme:'positron';
  data.mapView=['2d','3d','globe'].includes(data.mapView)?data.mapView:'2d';
  colorJourneys(data);
  data.bucketMode=['states','mixed','countries'].includes(data.bucketMode)?data.bucketMode:'parks';
  data.posterTemplate=['fieldnotes','midnight','postcard','atlas','passport'].includes(data.posterTemplate)?data.posterTemplate:'fieldnotes';
  data.posterTitle=typeof data.posterTitle==='string'?data.posterTitle:'A lifetime of wild places';
  data.statesPosterTitle=typeof data.statesPosterTitle==='string'?data.statesPosterTitle:'Fifty states of adventure';
  data.mixedPosterTitle=typeof data.mixedPosterTitle==='string'?data.mixedPosterTitle:'Parks, states & stories';
  data.countriesPosterTitle=typeof data.countriesPosterTitle==='string'?data.countriesPosterTitle:'A world of memories';
  return data;
}
async function db() {
  return new Promise((resolve,reject)=>{const request=indexedDB.open(KEY,1);request.onupgradeneeded=()=>request.result.createObjectStore('settings');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}
async function setting(key,value) {
  const database=await db();
  try{return await new Promise((resolve,reject)=>{const tx=database.transaction('settings',value===undefined?'readonly':'readwrite'),store=tx.objectStore('settings');const request=value===undefined?store.get(key):store.put(value,key);tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{database.close();}
}
async function readNotebook(directory) {
  try {const file=await directory.getFileHandle('workspace.json');return normalizeWorkspace(JSON.parse(await (await file.getFile()).text()));}
  catch(error) {if(error.name==='NotFoundError')return null;throw error;}
}
async function writeFile(directory,name,text) {const file=await directory.getFileHandle(name,{create:true}),writer=await file.createWritable();try{await writer.write(text);await writer.close();}catch(error){await writer.abort().catch(()=>{});throw error;}}
function mergeWorkspaces(a,b) {
  if(!a)return b;if(!b)return a;
  const trips=new Map(a.trips.map(t=>[t.id,t]));
  for(const t of b.trips)if(!trips.has(t.id)||(trips.get(t.id).updatedAt||0)<(t.updatedAt||0))trips.set(t.id,t);
  const newer=(a.updatedAt||0)>(b.updatedAt||0)?a:b;
  return {...newer,trips:[...trips.values()],visited:[...new Set([...a.visited,...b.visited])],visitedStates:[...new Set([...(a.visitedStates||[]),...(b.visitedStates||[])])],visitedCountries:[...new Set([...(a.visitedCountries||[]),...(b.visitedCountries||[])])]};
}
export class JourneyStore {
  constructor(report) {this.report=report;this.queue=Promise.resolve();this.folder=null;this.folderLocation='';this.privateFolder=null;this.needsReconnect=false;this.readOnly=false;this.savedFolder=null;this.connectionIssue='';this.pendingSave=null;this.saving=false;}
  async open() {
    const candidates=[];let damaged=false;
    try {const cached=localStorage.getItem(KEY);if(cached)candidates.push(normalizeWorkspace(JSON.parse(cached)));}catch{damaged=true;}
    try {const saved=await setting('workspace');if(saved)candidates.push(normalizeWorkspace(saved));}catch{}
    try {this.folderLocation=await setting('folderLocation')||'';}catch{}
    try {this.privateFolder=await (await navigator.storage.getDirectory()).getDirectoryHandle('.wanderlust',{create:true});const saved=await readNotebook(this.privateFolder);if(saved)candidates.push(saved);}catch(error){this.privateFolder=null;if(error.name!=='TypeError'&&error.name!=='SecurityError')damaged=true;}
    try {this.savedFolder=await setting('folder');if(this.savedFolder){const permission=await this.savedFolder.queryPermission({mode:'readwrite'});if(permission==='granted'){const saved=await readNotebook(this.savedFolder);if(saved)candidates.push(saved);this.folder=this.savedFolder;}else{this.needsReconnect=true;this.connectionIssue='permission';}}}catch(error){this.folder=null;this.needsReconnect=!!this.savedFolder;this.connectionIssue='unreadable';damaged=true;}
    candidates.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    this.report(damaged?'Recovered available local data; an unreadable copy could not be restored.':this.needsReconnect?'Restored on this device · reconnect your folder to sync.':'Your local notebook is ready.');
    // A corrupt disk copy must not be overwritten by an empty workspace.
    if(damaged && !candidates.length){this.privateFolder=null;this.folder=null;}
    const merged=candidates.reduce((result,candidate)=>mergeWorkspaces(result,candidate),null);
    if(this.folder&&merged)await this.save(merged);
    return merged;
  }
  save(data) {
    if(this.readOnly)return Promise.resolve();
    data.updatedAt=Date.now();
    // Keep at most one in-flight snapshot and one reference to the latest state.
    // Cloning here would retain a full notebook for every edit behind slow disk IO.
    this.pendingSave=data;this.report('Saving locally…');
    if(!this.saving){this.saving=true;this.queue=this.drainSaves();}
    return this.queue;
  }
  async drainSaves() {
    // Coalesce requests from the same event before taking an immutable snapshot.
    await Promise.resolve();let saved=false;
    try{
      while(this.pendingSave){
        const data=this.pendingSave;this.pendingSave=null;
        try{
          const snapshot=structuredClone(data),text=JSON.stringify(snapshot);
          saved=await this.writeSnapshot(snapshot,text);
        }catch{
          saved=false;
          if(!this.pendingSave)this.report('Could not save. Export KML now to keep your work.');
        }
      }
      return saved;
    }finally{this.saving=false;}
  }
  async writeSnapshot(snapshot,text) {
    let saved=false;const warnings=[],directories=[];
    try{localStorage.setItem(KEY,text);saved=true;}catch{}
    try{await setting('workspace',snapshot);saved=true;}catch{}
    const failed=external=>{
      if(external){this.needsReconnect=true;this.connectionIssue='permission';this.folder=null;warnings.push('Folder sync paused; reconnect the folder.');}
      else warnings.push('Private file backup unavailable.');
    };
    // Serialize the notebook once; the browser and both folders share these bytes.
    for(const [directory,external]of [[this.privateFolder,false],[this.folder,true]]){
      if(!directory)continue;
      try{await writeFile(directory,'workspace.json',text);saved=true;directories.push({directory,external});}
      catch{failed(external);}
    }
    // Serialize one journey at a time and reuse its KML across the two backups.
    // Release each string before moving on; never retain all generated KML files.
    for(const trip of snapshot.trips){
      if(!directories.length)break;
      let kml;
      try{kml=exportKML(trip);}catch{warnings.push('A KML copy needs valid dates before it can be refreshed.');continue;}
      for(let i=directories.length-1;i>=0;i--){
        const {directory,external}=directories[i];
        try{await writeFile(directory,'journey-'+trip.id.replace(/[^a-zA-Z0-9-]/g,'_')+'.kml',kml);}
        catch{failed(external);directories.splice(i,1);}
      }
    }
    // An older write must not claim that newer, still-pending edits are saved.
    if(!this.pendingSave)this.report(saved?(this.folder?'Saved to .wanderlust':'Saved on this device')+(warnings.length?' · '+[...new Set(warnings)].join(' '):this.needsReconnect?' · reconnect your folder to sync.':''):'Could not save. Export KML now to keep your work.');
    return saved;
  }
  async connect(current,{reconnect=false}={}) {
    let directory,location=this.folderLocation;
    if(reconnect&&this.savedFolder){
      // Permission must be requested by the user's click, never on page load.
      const permission=await this.savedFolder.requestPermission({mode:'readwrite'});
      if(permission!=='granted')throw new Error('Folder permission was not granted. Allow access or choose another folder.');
      directory=this.savedFolder;
    }else{
      if(!window.showDirectoryPicker)throw new Error('Folder access is available in desktop Chrome or Edge over HTTPS (or localhost). Your notebook still saves in this browser.');
      const parent=await window.showDirectoryPicker({id:'wanderlust-studio',mode:'readwrite'});
      directory=parent.name==='.wanderlust'?parent:await parent.getDirectoryHandle('.wanderlust',{create:true});
      const relative=await parent.resolve(directory);
      location=[parent.name,...(relative||['.wanderlust'])].filter(Boolean).join('/');
    }
    await this.flush();
    // Validate before writing: a corrupt or inaccessible copy stays untouched.
    const disk=await readNotebook(directory),merged=mergeWorkspaces(current,disk);
    await setting('folder',directory);await setting('folderLocation',location);
    this.folder=directory;this.savedFolder=directory;this.folderLocation=location;this.needsReconnect=false;this.connectionIssue='';
    navigator.storage?.persist?.().catch(()=>{});
    await this.save(merged);return merged;
  }
  flush() {return this.queue;}
}
