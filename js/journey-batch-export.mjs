import {journeyArchive,journeyFile} from './journey-files.mjs';
import {downloadFile,safeFilename} from './journey-kml.mjs';
import {t} from './journey-i18n.mjs';

const el=id=>document.getElementById(id);
export function setupBatchExport({getWorkspace,report}){
  const dialog=el('batch-export-dialog'),button=el('download-checked-journeys'),format=el('batch-file-format'),layout=el('batch-file-layout');
  let trips=[],busy=false,generation=0;
  function controls(){
    format.disabled=layout.disabled=busy;button.disabled=busy||!trips.length;
    button.textContent=t(busy?'Preparing files…':layout.value==='separate'?'Download ZIP':'Export '+(format.value==='geojson'?'GeoJSON':format.value.toUpperCase()));
  }
  function refresh(){el('export-checked-journeys').disabled=!getWorkspace().trips.some(journey=>journey.visible!==false);controls();}
  function open(){
    const checked=getWorkspace().trips.filter(journey=>journey.visible!==false);if(!checked.length)return;
    // Freeze the chosen journeys for this export; never alter visibility or data.
    trips=structuredClone(checked.filter(journey=>journey.items.length));
    el('batch-export-summary').textContent=t('{count} journeys · {items} items',{count:trips.length,items:trips.reduce((n,j)=>n+j.items.length,0)});
    el('batch-export-list').replaceChildren(...checked.map(journey=>{const li=document.createElement('li');li.textContent=journey.name+' · '+t('{count} items',{count:journey.items.length});return li;}));
    el('batch-export-empty').hidden=trips.length===checked.length;
    el('batch-export-status').textContent='';controls();dialog.showModal();
  }
  el('export-checked-journeys').addEventListener('click',open);
  format.addEventListener('change',controls);layout.addEventListener('change',controls);
  dialog.addEventListener('close',()=>{generation++;busy=false;trips=[];controls();});
  button.addEventListener('click',async()=>{
    if(busy||!trips.length)return;
    busy=true;const request=++generation,selectedFormat=format.value,separate=layout.value==='separate',snapshot=trips,title=t('Checked journeys');controls();el('batch-export-status').textContent=t('Preparing files…');
    try{
      const blob=separate?await journeyArchive(snapshot,selectedFormat):await journeyFile(snapshot,selectedFormat,title);
      if(request!==generation||!dialog.open)return;
      downloadFile(blob,safeFilename(title)+(separate?'.zip':'.'+selectedFormat));dialog.close();report('Journey files exported.');
    }catch(error){if(request===generation)el('batch-export-status').textContent=error.journeyName?t('Could not export {name}: {message}',{name:error.journeyName,message:t(error.message)}):t(error.message);}
    finally{if(request===generation){busy=false;controls();}}
  });
  refresh();return {refresh};
}
