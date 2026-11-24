const el=id=>document.getElementById(id);
export function setupStudioLayout({getWorkspace,save,playback}) {
  const root=document.querySelector('.studio-layout'),sidebar=el('studio-sidebar'),mobile=matchMedia('(max-width:700px)');
  function refreshTabs(){
    const active=getWorkspace().itineraryTab;
    for(const key of ['routes','places']){const button=el(key+'-tab'),selected=active===key;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;el(key+'-panel').hidden=!selected;}
  }
  function refresh(){
    const w=getWorkspace(),collapsed=w.sidebarState==='collapsed',hidden=w.sidebarState==='hidden';root.dataset.sidebar=w.sidebarState;root.dataset.pinned=String(w.sidebarPinned);
    sidebar.hidden=hidden||(mobile.matches&&collapsed);el('sidebar-open').hidden=!collapsed;el('sidebar-collapse').hidden=collapsed;el('sidebar-pin').hidden=collapsed;el('sidebar-reveal').hidden=!(hidden||(mobile.matches&&collapsed));
    sidebar.querySelector('.sidebar-content').hidden=collapsed;el('sidebar-pin').setAttribute('aria-pressed',String(w.sidebarPinned));
    playback.setControlsHidden(w.playerHidden);refreshTabs();
  }
  function state(value){getWorkspace().sidebarState=value;refresh();save();}
  for(const id of ['sidebar-open','sidebar-reveal'])el(id).addEventListener('click',()=>{state('open');el('sidebar-collapse').focus({preventScroll:true});});
  el('sidebar-collapse').addEventListener('click',()=>{state('collapsed');(mobile.matches?el('sidebar-reveal'):el('sidebar-open')).focus({preventScroll:true});});
  el('sidebar-hide').addEventListener('click',()=>{state('hidden');el('sidebar-reveal').focus({preventScroll:true});});
  el('sidebar-pin').addEventListener('click',()=>{getWorkspace().sidebarPinned=!getWorkspace().sidebarPinned;refresh();save();});
  document.addEventListener('pointerdown',event=>{const w=getWorkspace();if(!w.sidebarPinned&&w.sidebarState==='open'&&!sidebar.contains(event.target)&&!event.target.closest('dialog,#sidebar-reveal,.header-actions'))state('collapsed');});
  sidebar.addEventListener('keydown',event=>{if(event.key==='Escape'&&!getWorkspace().sidebarPinned){event.preventDefault();state('collapsed');}});
  for(const [id,hidden] of [['hide-player',true],['show-player',false]])el(id).addEventListener('click',()=>{getWorkspace().playerHidden=hidden;playback.setControlsHidden(hidden);save();el(hidden?'show-player':'hide-player').focus({preventScroll:true});});
  for(const key of ['routes','places']){
    const button=el(key+'-tab');const select=()=>{getWorkspace().itineraryTab=key;refreshTabs();save();};button.addEventListener('click',select);
    button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?'routes':event.key==='End'?'places':key==='routes'?'places':'routes';el(next+'-tab').click();el(next+'-tab').focus();});
  }
  mobile.addEventListener('change',refresh);
  return {refresh,refreshTabs,open:()=>{if(getWorkspace().sidebarState!=='open')state('open');}};
}
