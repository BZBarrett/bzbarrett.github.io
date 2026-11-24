// Preview gestures only change the view; the export always uses the full-resolution canvas.
export class PosterPreview {
  constructor(viewport,canvas,output,{enabled=()=>true}={}) {
    Object.assign(this,{viewport,canvas,output,zoom:1,x:0,y:0,pointers:new Map()});
    viewport.addEventListener('wheel',event=>{
      if(!enabled())return;
      event.preventDefault();const rect=viewport.getBoundingClientRect();
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?rect.height:1);
      this.scale(Math.exp(-Math.max(-500,Math.min(500,delta))*.002),event.clientX-rect.left,event.clientY-rect.top);
    },{passive:false});
    viewport.addEventListener('pointerdown',event=>{
      if(!enabled())return;
      if(![0,1].includes(event.button))return;event.preventDefault();viewport.focus({preventScroll:true});
      viewport.setPointerCapture(event.pointerId);this.pointers.set(event.pointerId,[event.clientX,event.clientY]);viewport.classList.add('dragging');
    });
    viewport.addEventListener('pointermove',event=>{
      if(!enabled())return;
      if(!this.pointers.has(event.pointerId))return;
      const old=[...this.pointers.values()];this.pointers.set(event.pointerId,[event.clientX,event.clientY]);const next=[...this.pointers.values()];
      if(next.length===1){this.x+=next[0][0]-old[0][0];this.y+=next[0][1]-old[0][1];}
      else if(next.length===2){
        const center=points=>[(points[0][0]+points[1][0])/2,(points[0][1]+points[1][1])/2],a=center(old),b=center(next),rect=viewport.getBoundingClientRect();
        const before=Math.hypot(old[0][0]-old[1][0],old[0][1]-old[1][1]),after=Math.hypot(next[0][0]-next[1][0],next[0][1]-next[1][1]);
        if(before>0)this.scale(after/before,a[0]-rect.left,a[1]-rect.top);
        this.x+=b[0]-a[0];this.y+=b[1]-a[1];
      }
      this.paint();
    });
    const release=event=>{this.pointers.delete(event.pointerId);if(!this.pointers.size)viewport.classList.remove('dragging');};
    for(const event of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(event,release);
    viewport.addEventListener('dblclick',event=>{
      if(!enabled())return;event.preventDefault();const rect=viewport.getBoundingClientRect();this.scale(event.shiftKey?.5:1.6,event.clientX-rect.left,event.clientY-rect.top);});
    viewport.addEventListener('keydown',event=>{
      if(!enabled())return;
      const moves={ArrowLeft:[45,0],ArrowRight:[-45,0],ArrowUp:[0,45],ArrowDown:[0,-45]};
      if(moves[event.key]){event.preventDefault();this.x+=moves[event.key][0];this.y+=moves[event.key][1];this.paint();}
      else if(['+','=','-','0','Home'].includes(event.key)){event.preventDefault();if(['0','Home'].includes(event.key))this.fit();else this.scale(event.key==='-'?.8:1.25);}
    });
    new ResizeObserver(()=>this.paint()).observe(viewport);
  }
  scale(factor,anchorX=this.viewport.clientWidth/2,anchorY=this.viewport.clientHeight/2) {
    const previous=this.zoom;this.zoom=Math.max(.5,Math.min(8,this.zoom*factor));const ratio=this.zoom/previous;
    this.x=(anchorX-this.viewport.clientWidth/2)*(1-ratio)+this.x*ratio;
    this.y=(anchorY-this.viewport.clientHeight/2)*(1-ratio)+this.y*ratio;this.paint();
  }
  fit() {this.zoom=1;this.x=this.y=0;this.paint();}
  paint() {
    const w=this.viewport.clientWidth,h=this.viewport.clientHeight;if(!w||!h)return;
    const fit=Math.min((w-28)/this.canvas.width,(h-28)/this.canvas.height),width=this.canvas.width*fit*this.zoom,height=this.canvas.height*fit*this.zoom;
    // Keep a visible part of the artwork in reach even when dragging far outside it.
    this.x=Math.max(-(w+width)/2+50,Math.min((w+width)/2-50,this.x));this.y=Math.max(-(h+height)/2+50,Math.min((h+height)/2-50,this.y));
    Object.assign(this.canvas.style,{width:width+'px',height:height+'px',transform:`translate(${this.x}px,${this.y}px) translate(-50%,-50%)`});
    this.output.value=Math.round(this.zoom*100)+'%';this.viewport.dataset.zoom=String(this.zoom);
  }
}
