import {dateLabel} from './journey-dates.mjs';
import {routeDistance,distanceLabel} from './journey-routes.mjs';

function wrap(ctx,value,width,font){
  ctx.font=font;const lines=[];let line='';
  for(const token of String(value||'').split(/(\s+)/)){
    if(ctx.measureText(line+token).width<=width){line+=token;continue;}
    if(line.trim()){lines.push(line.trim());line='';}
    for(const char of token){if(ctx.measureText(line+char).width>width&&line){lines.push(line);line='';}line+=char;}
  }
  if(line.trim())lines.push(line.trim());return lines.length?lines:[''];
}
// Distances and line wrapping are computed once per composition, never during
// drag/zoom frames or the high-resolution repaint of the same renderer.
export function routeListPlan(trips,options,panel){
  if(!panel)return null;
  const zh=options.language==='zh',modes=zh?{car:'汽车',train:'火车',plane:'飞机',walk:'步行',transit:'公共交通'}:{car:'Car',train:'Train',plane:'Plane',walk:'Walk',transit:'Public'};
  const groups=trips.map(trip=>({id:trip.id,name:trip.name,color:trip.color||'#31765c',segments:trip.items.filter(i=>i.kind==='segment').map((item,index)=>({id:item.id,number:index+1,name:item.name,mode:item.mode,meta:[modes[item.mode]||modes.car,item.mode==='car'?item.vehicle:'',distanceLabel(routeDistance(item.coordinates),options.units||'imperial')].filter(Boolean).join(' · '),date:[item.start,item.end].filter(Boolean).map(dateLabel).join(' — ')}))}));
  const ctx=document.createElement('canvas').getContext('2d'),font=(size,bold=false)=>`${bold?'bold ':''}${size}px Arial, "PingFang SC", sans-serif`,total=groups.reduce((n,g)=>n+g.segments.length,0),pad=24,top=110,bottom=panel.h-26;
  for(const columns of [1,2])for(let size=30;size>=18;size-=2){
    const gap=24,colWidth=(panel.w-pad*2-gap*(columns-1))/columns,rows=[];let column=0,y=top,failed=false;
    const header=group=>{const lines=wrap(ctx,group.name,colWidth-20,font(size,true));return {kind:'journey',tripId:group.id,name:group.name,color:group.color,lines,size,height:lines.length*size*1.25+20};};
    const segment=(item,group)=>{const lines=wrap(ctx,item.name,colWidth-42,font(size)),meta=wrap(ctx,item.meta,colWidth-42,font(size*.74)),date=item.date?wrap(ctx,item.date,colWidth-42,font(size*.7)):[];return {...item,kind:'segment',tripId:group.id,color:group.color,lines,meta,date,size,height:lines.length*size*1.24+(meta.length+date.length)*size*.95+18};};
    const next=()=>{column++;y=top;return column<columns;},add=row=>{rows.push({...row,x:pad+column*(colWidth+gap),y,width:colWidth});y+=row.height;};
    for(const group of groups){
      const head=header(group),entries=group.segments.map(item=>segment(item,group));
      if(!entries.length)entries.push({...segment({name:zh?'此行程没有路段':'No route segments in this journey',meta:'',date:''},group),kind:'empty'});
      if(y+head.height+entries[0].height>bottom&&!next()){failed=true;break;}add(head);
      for(const row of entries){if(y+row.height>bottom){if(!next()){failed=true;break;}add(head);}if(y+row.height>bottom){failed=true;break;}add(row);}
      if(failed)break;y+=16;
    }
    if(!failed)return {rows,total,columns,size,title:zh?'沿途的路线':'THE ROUTE LIST',summary:zh?`${trips.length} 个行程 · ${total} 段路线`:`${trips.length} journeys · ${total} segments`,side:options.routeList};
  }
  throw new Error('Too many routes for the side list. Choose fewer journeys or hide the route list.');
}
export function paintRouteList(ctx,panel,plan,skin){
  if(!panel||!plan)return;
  ctx.save();ctx.translate(panel.x,panel.y);ctx.fillStyle=skin.paper;ctx.fillRect(0,0,panel.w,panel.h);ctx.strokeStyle=skin.muted+'66';ctx.lineWidth=1.5;ctx.strokeRect(0,0,panel.w,panel.h);
  ctx.textAlign='left';ctx.fillStyle=skin.accent;ctx.font='bold 28px Arial, "PingFang SC", sans-serif';ctx.fillText(plan.title,24,42);ctx.fillStyle=skin.muted;ctx.font='21px Arial, "PingFang SC", sans-serif';ctx.fillText(plan.summary,24,78);
  for(const row of plan.rows){
    let y=row.y+row.size;
    if(row.kind==='journey'){
      ctx.fillStyle=row.color;ctx.fillRect(row.x,row.y+4,5,row.height-17);ctx.font=`bold ${row.size}px Arial, "PingFang SC", sans-serif`;ctx.fillStyle=skin.ink;
      for(const line of row.lines){ctx.fillText(line,row.x+16,y);y+=row.size*1.25;}continue;
    }
    if(row.kind==='segment'){
      ctx.strokeStyle=row.color;ctx.lineWidth=3;ctx.setLineDash(row.mode==='plane'?[5,4]:[]);ctx.beginPath();ctx.moveTo(row.x+3,row.y+row.size+5);ctx.lineTo(row.x+26,row.y+row.size+5);ctx.stroke();ctx.setLineDash([]);ctx.font=`${row.size*.7}px Arial`;ctx.fillStyle=skin.muted;ctx.fillText(String(row.number).padStart(2,'0'),row.x+2,row.y+row.size-3);
    }
    ctx.fillStyle=skin.ink;ctx.font=`${row.size}px Arial, "PingFang SC", sans-serif`;for(const line of row.lines){ctx.fillText(line,row.x+38,y);y+=row.size*1.24;}
    ctx.fillStyle=skin.muted;ctx.font=`${row.size*.74}px Arial, "PingFang SC", sans-serif`;for(const line of row.meta){ctx.fillText(line,row.x+38,y);y+=row.size*.95;}
    ctx.font=`${row.size*.7}px Arial, "PingFang SC", sans-serif`;for(const line of row.date){ctx.fillText(line,row.x+38,y);y+=row.size*.95;}
  }
  ctx.restore();
}
