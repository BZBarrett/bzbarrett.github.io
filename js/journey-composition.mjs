import {t} from './journey-i18n.mjs';
const el=id=>document.getElementById(id),clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

// Export framing is independent of the zoom used to inspect the whole poster.
export class MapComposition {
  constructor(viewport,canvas,onChange) {
    Object.assign(this,{viewport,canvas,onChange,mode:'compose',value:{zoom:1,x:0,y:0}});
    for(const key of ['zoom','x','y'])el('map-compose-'+key).addEventListener('input',()=>this.update({[key]:Number(el('map-compose-'+key).value)}));
    el('map-compose-reset').addEventListener('click',()=>this.reset());
    let drag;
    viewport.addEventListener('pointerdown',event=>{
      if(this.mode!=='compose'||event.button!==0||drag||!this.contains(event))return;
      event.preventDefault();viewport.focus({preventScroll:true});viewport.setPointerCapture(event.pointerId);
      drag={id:event.pointerId,x:event.clientX,y:event.clientY,value:{...this.value},frame:this.frame()};viewport.classList.add('dragging');
    });
    viewport.addEventListener('pointermove',event=>{
      if(!drag||drag.id!==event.pointerId)return;
      this.update({x:drag.value.x+(event.clientX-drag.x)/drag.frame.w*100,y:drag.value.y+(event.clientY-drag.y)/drag.frame.h*100});
    });
    const release=event=>{if(drag?.id===event.pointerId){drag=null;viewport.classList.remove('dragging');}};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(event,release);
    viewport.addEventListener('wheel',event=>{
      if(this.mode!=='compose'||!this.contains(event))return;event.preventDefault();
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1);
      const frame=this.frame(),zoom=clamp(this.value.zoom*Math.exp(-clamp(delta,-500,500)*.002),.5,4),ratio=zoom/this.value.zoom;
      this.update({zoom,x:((event.clientX-frame.x)/frame.w-.5)*100*(1-ratio)+this.value.x*ratio,y:((event.clientY-frame.y)/frame.h-.5)*100*(1-ratio)+this.value.y*ratio});
    },{passive:false});
    viewport.addEventListener('dblclick',event=>{if(this.mode==='compose'&&this.contains(event)){event.preventDefault();this.update({zoom:this.value.zoom*(event.shiftKey?.8:1.25)});}});
    viewport.addEventListener('keydown',event=>{
      if(this.mode!=='compose')return;
      const moves={ArrowLeft:{x:this.value.x-2},ArrowRight:{x:this.value.x+2},ArrowUp:{y:this.value.y-2},ArrowDown:{y:this.value.y+2}};
      if(moves[event.key]){event.preventDefault();this.update(moves[event.key]);}
      else if(['Home','0','+','=','-'].includes(event.key)){event.preventDefault();if(['Home','0'].includes(event.key))this.reset();else this.update({zoom:this.value.zoom*(event.key==='-'?.8:1.25)});}
    });
    this.refresh();
  }
  frame(){const r=this.canvas.getBoundingClientRect(),f=this.canvas._mapFrame||{x:0,y:0,w:1,h:1};return {x:r.left+r.width*f.x,y:r.top+r.height*f.y,w:r.width*f.w,h:r.height*f.h};}
  contains(event){const f=this.frame();return event.clientX>=f.x&&event.clientX<=f.x+f.w&&event.clientY>=f.y&&event.clientY<=f.y+f.h;}
  update(patch){if(this.locked)return;Object.assign(this.value,patch);this.value.zoom=clamp(this.value.zoom,.5,4);this.value.x=clamp(this.value.x,-40,40);this.value.y=clamp(this.value.y,-40,40);this.refresh();this.onChange();}
  reset(){this.update({zoom:1,x:0,y:0});}
  setMode(mode){this.mode=mode;this.refresh();}
  refresh(){
    for(const key of ['zoom','x','y']){el('map-compose-'+key).value=String(this.value[key]);el('map-compose-'+key+'-value').value=Math.round(this.value[key]*(key==='zoom'?100:1))+'%';}
    for(const button of document.querySelectorAll('[data-map-interaction]'))button.setAttribute('aria-pressed',String(button.dataset.mapInteraction===this.mode));
    this.viewport.dataset.interaction=this.mode;
    const hint=this.mode==='compose'?'Drag the map to position it. Scroll to change its scale. Home resets the composition.':'Scroll to zoom · drag to pan · double-click to zoom · Home to fit';
    el('map-interaction-hint').textContent=t(hint);this.viewport.setAttribute('aria-label',t(hint));
  }
}
