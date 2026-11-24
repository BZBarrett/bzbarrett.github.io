export const uid = () => crypto.randomUUID();
export const escapeXML = value => String(value ?? '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export const validCoordinate = p => Array.isArray(p) && p.length >= 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90;
export function validTime(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)) return false;
  const date = value.slice(0,10), parsed = new Date(date + 'T00:00:00Z');
  return Number.isFinite(Date.parse(value)) && Number.isFinite(+parsed) && parsed.toISOString().slice(0,10) === date;
}
export function validateTimes(start, end) {
  if (!validTime(start) || !validTime(end)) throw new Error('Use a valid ISO date or date/time, such as 2026-11-23 or 2026-11-23T09:00:00-05:00.');
  if (start && end && Date.parse(end) < Date.parse(start)) throw new Error('The end time must be after the start time.');
}
const tag = (name, text) => `<${name}>${escapeXML(text)}</${name}>`;
const timeXML = item => item.end ? `<TimeSpan>${item.start ? tag('begin',item.start) : ''}${tag('end',item.end)}</TimeSpan>` : item.start ? `<TimeStamp>${tag('when',item.start)}</TimeStamp>` : '';
const extended = fields => '<ExtendedData>' + Object.entries(fields).filter(([,v]) => v != null).map(([k,v]) => `<Data name="${escapeXML(k)}">${tag('value', typeof v === 'object' ? JSON.stringify(v) : v)}</Data>`).join('') + '</ExtendedData>';
const coordinateXML = points => points.map(p => p.join(',')).join(' ');
export function exportKML(trip) {
  const routeMarks = [], pointMarks = [];
  for (const item of trip.items) {
    const marks = item.kind === 'point' ? pointMarks : routeMarks;
    validateTimes(item.start,item.end);
    const common = tag('name',item.name) + tag('description',item.notes || '') + tag('visibility',item.visible===false?'0':'1') + timeXML(item);
    const metadata = {studioId:item.id,kind:item.kind,mode:item.mode,vehicle:item.vehicle,important:item.important || false,visible:item.visible!==false,startNode:item.startNode,endNode:item.endNode,routeSource:item.routeSource,routeLabel:item.routeLabel,extra:item.extra,trackTimes:item.trackTimes};
    if (item.kind === 'point') {
      if (!validCoordinate(item.coordinates)) throw new Error('A place has invalid coordinates.');
      marks.push(`<Placemark>${common}${tag('styleUrl',item.important ? '#important' : '#place')}${extended(metadata)}<Point>${tag('altitudeMode',item.altitudeMode || 'clampToGround')}${tag('coordinates',coordinateXML([item.coordinates]))}</Point></Placemark>`);
    } else {
      if (item.coordinates.length < 2 || !item.coordinates.every(validCoordinate)) throw new Error('A route needs at least two valid coordinates.');
      const timedTrack=Array.isArray(item.trackTimes)&&item.trackTimes.length===item.coordinates.length&&item.trackTimes.every(t=>t&&validTime(t));
      const geometry=timedTrack?`<gx:Track>${tag('altitudeMode',item.altitudeMode || 'clampToGround')}${item.trackTimes.map(t=>tag('when',t)).join('')}${item.coordinates.map(p=>tag('gx:coord',[p[0],p[1],p[2]||0].join(' '))).join('')}</gx:Track>`:`<LineString><tessellate>1</tessellate>${tag('altitudeMode',item.altitudeMode || 'clampToGround')}${tag('coordinates',coordinateXML(item.coordinates))}</LineString>`;
      marks.push(`<Placemark>${common}${tag('styleUrl','#' + (item.mode || 'car'))}${extended(metadata)}${geometry}</Placemark>`);
      for (const [key,node] of [['start',item.startNode],['end',item.endNode]]) {
        if (!node) continue;
        const point = node.coordinates || item.coordinates[key === 'start' ? 0 : item.coordinates.length-1];
        const when = key === 'start' ? item.start : item.end;
        marks.push(`<Placemark>${tag('name',node.name || (key === 'start' ? 'Start' : 'Destination'))}${when ? `<TimeStamp>${tag('when',when)}</TimeStamp>` : ''}${tag('styleUrl',node.important ? '#important' : '#place')}${extended({studioEndpoint:item.id,endpoint:key,important:!!node.important})}<Point>${tag('coordinates',coordinateXML([point]))}</Point></Placemark>`);
      }
    }
  }
  const hex=/^#[0-9a-f]{6}$/i.test(trip.color||'')?trip.color.slice(1):null,journeyColor=hex?'ff'+hex.slice(4,6)+hex.slice(2,4)+hex.slice(0,2):null;
  const styles = [['car',journeyColor||'ff2960be'],['train',journeyColor||'ff93603b'],['plane',journeyColor||'ff995e7f'],['walk',journeyColor||'ff61852c']].map(([id,color]) => `<Style id="${id}"><LineStyle><color>${color}</color><width>4</width></LineStyle></Style>`).join('') +
    '<Style id="place"><IconStyle><color>ff386624</color><scale>1</scale><Icon><href>https://maps.google.com/mapfiles/kml/paddle/wht-circle.png</href></Icon></IconStyle></Style><Style id="important"><IconStyle><color>ff0082ff</color><scale>1.3</scale><Icon><href>https://maps.google.com/mapfiles/kml/paddle/wht-stars.png</href></Icon></IconStyle></Style>';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document>${tag('name',trip.name)}${extended({journeyColor:trip.color})}${styles}<Folder><name>Route segments</name>${routeMarks.join('\n')}</Folder><Folder><name>Saved places</name>${pointMarks.join('\n')}</Folder></Document></kml>`;
}
const children = (node,name) => [...node.getElementsByTagNameNS('*',name)];
const first = (node,name) => children(node,name)[0];
const content = (node,name) => first(node,name)?.textContent.trim() || '';
const direct = (node,name) => [...node.children].find(c => c.localName === name)?.textContent.trim() || '';
function coordinates(text, separator = ',') {
  const points = text.trim().split(/\s+/).filter(Boolean).map(p => p.split(separator).map(Number));
  if (!points.length || !points.every(validCoordinate)) throw new Error('This KML contains invalid or out-of-range coordinates.');
  return points;
}
export function importKML(text, fallbackName = 'Imported journey') {
  if (text.length > 10 * 1024 * 1024) throw new Error('Please import a KML smaller than 10 MB.');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('KML with custom XML entities is not supported.');
  const xml = new DOMParser().parseFromString(text,'application/xml');
  if (first(xml,'parsererror') || xml.documentElement.localName !== 'kml') throw new Error('This file is not valid KML.');
  const items = [], endpoints = [], warnings = [], usedIDs = new Set();
  const unsupported = ['Polygon','GroundOverlay','NetworkLink','Model'].filter(name => children(xml,name).length);
  if (unsupported.length) warnings.push('Not imported: ' + unsupported.join(', ') + '. Keep the original file to preserve these features.');
  for (const mark of children(xml,'Placemark')) {
    const extra = Object.fromEntries(children(mark,'Data').map(n => [n.getAttribute('name'),content(n,'value')]));
    for (const n of children(mark,'SimpleData')) extra[n.getAttribute('name')] = n.textContent;
    const parseObject = key => { try { return JSON.parse(extra[key]); } catch { return undefined; } };
    const times = {start:content(mark,'begin') || content(mark,'when'),end:content(mark,'end')};
    try { validateTimes(times.start,times.end); } catch { warnings.push('An unsupported time was retained in metadata; edit its date before exporting.'); extra.originalStart = times.start; extra.originalEnd = times.end; times.start=''; times.end=''; }
    const folderPath=[];for(let parent=mark.parentElement;parent;parent=parent.parentElement)if(parent.localName==='Folder')folderPath.unshift(direct(parent,'name'));
    const common = {visible:extra.visible!=='false'&&direct(mark,'visibility')!=='0',name:direct(mark,'name') || 'Untitled place',notes:direct(mark,'description'),...times,extra:parseObject('extra') || {...extra,...(folderPath.length?{sourceFolderPath:folderPath}:{}),...(direct(mark,'styleUrl')?{sourceStyleUrl:direct(mark,'styleUrl')}:{})}};
    const nodeMeta = key => { const value = parseObject(key); return value && validCoordinate(value.coordinates) ? {name:String(value.name || ''),coordinates:value.coordinates,important:!!value.important} : undefined; };
    for (const geometry of [...children(mark,'Point'),...children(mark,'LineString'),...children(mark,'Track')]) {
      let coords;
      if (geometry.localName === 'Track') {
        coords = children(geometry,'coord').map(n => n.textContent.trim().split(/\s+/).map(Number));
        if (!coords.every(validCoordinate)) throw new Error('A track contains invalid coordinates.');
      } else coords = coordinates(content(geometry,'coordinates'));
      const kind = geometry.localName === 'Point' ? 'point' : 'segment';
      if (kind === 'segment' && coords.length < 2) { warnings.push('Skipped a line with fewer than two coordinates.'); continue; }
      if (extra.studioEndpoint && kind === 'point') { endpoints.push({...common,coordinates:coords[0],parent:extra.studioEndpoint,endpoint:extra.endpoint,important:extra.important === 'true'}); continue; }
      const id = extra.studioId && !usedIDs.has(extra.studioId) ? extra.studioId : uid(); usedIDs.add(id);
      const item = {...common,id,kind,coordinates:kind === 'point' ? coords[0] : coords,altitudeMode:content(geometry,'altitudeMode') || 'clampToGround'};
      if (kind === 'point') item.important = extra.important === 'true' || content(mark,'styleUrl') === '#important';
      else Object.assign(item,{vehicle:String(extra.vehicle||'').slice(0,160),mode:['car','train','plane','walk'].includes(extra.mode) ? extra.mode : 'car',startNode:nodeMeta('startNode') || {name:'Start',coordinates:coords[0],important:false},endNode:nodeMeta('endNode') || {name:'Destination',coordinates:coords.at(-1),important:false},routeSource:extra.routeSource || 'Imported KML',routeLabel:extra.routeLabel || 'Imported geometry',trackTimes:geometry.localName === 'Track' ? children(geometry,'when').map(n=>n.textContent) : parseObject('trackTimes')});
      items.push(item);
    }
  }
  for (const node of endpoints) {
    const segment = items.find(i => i.id === node.parent && i.kind === 'segment');
    if (segment && ['start','end'].includes(node.endpoint)) segment[node.endpoint+'Node'] = {name:node.name,coordinates:node.coordinates,important:node.important};
    else items.push({id:uid(),kind:'point',name:node.name,notes:node.notes,coordinates:node.coordinates,important:node.important,start:node.start,end:node.end});
  }
  if (!items.length) throw new Error('No editable points or line routes were found in this KML.');
  const documentNode=first(xml,'Document'),colorData=[...(documentNode?.children||[])].find(n=>n.localName==='ExtendedData'),colorValue=colorData?[...children(colorData,'Data')].find(n=>n.getAttribute('name')==='journeyColor'):null;
  const color=colorValue?content(colorValue,'value'):'';
  return {trip:{id:uid(),...(/^#[0-9a-f]{6}$/i.test(color)?{color}:{}),name:direct(first(xml,'Document') || xml.documentElement,'name') || fallbackName,items,updatedAt:Date.now()},warnings:[...new Set(warnings)]};
}
export function downloadFile(blob,name) {
  const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href=url; link.download=name; document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export const safeFilename = name => (name || 'journey').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100);

export function exportJourneysKML(trips,title) {
  if(trips.length===1)return exportKML(trips[0]);
  const folders=trips.map((trip,index)=>{
    const xml=new DOMParser().parseFromString(exportKML(trip),'application/xml'),document=xml.getElementsByTagName('Document')[0],prefix=`journey-${index}-`;
    for(const style of document.querySelectorAll('Style[id]'))style.setAttribute('id',prefix+style.getAttribute('id'));
    for(const ref of document.querySelectorAll('styleUrl'))if(ref.textContent.startsWith('#'))ref.textContent='#'+prefix+ref.textContent.slice(1);
    for(const data of document.querySelectorAll('Data[name="studioId"],Data[name="studioEndpoint"]'))data.querySelector('value').textContent=prefix+data.querySelector('value').textContent;
    const serializer=new XMLSerializer();return '<Folder>'+[...document.children].map(node=>serializer.serializeToString(node)).join('')+'</Folder>';
  });
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>${escapeXML(title)}</name>${folders.join('')}</Document></kml>`;
}

