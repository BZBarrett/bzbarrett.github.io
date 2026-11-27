// The original artwork is supplied by the site owner. Load it only for this cover.
const monochrome = new WeakMap();
function iconLoader(collection) {
  let loading;const decoded=new Map();
  const assetError=`The ${collection} icons could not be loaded. Please select the template again to retry.`;
  return entries=>{
    if(!loading)loading=fetch(`data/${collection}-icons.json`).then(async response=>{
      if(!response.ok)throw new Error(assetError);
      const {icons}=await response.json();
      await Promise.all(entries.map(async entry=>{
        if(decoded.has(entry.id))return;
        if(!icons[entry.id]?.src)throw new Error(assetError);
        const image=new Image();image.src=icons[entry.id].src;await image.decode();decoded.set(entry.id,image);
      }));return decoded;
    }).catch(()=>{loading=null;throw new Error(assetError);});
    return loading;
  };
}
export const parkIconAssets=iconLoader('park');
export const stateIconAssets=iconLoader('state');

function gray(image) {
  if (!monochrome.has(image)) {
    // Pixel conversion works in browsers without CanvasRenderingContext2D.filter.
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d', {willReadFrequently:true});
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) {
      const value = Math.round(pixels.data[i]*.2126 + pixels.data[i+1]*.7152 + pixels.data[i+2]*.0722);
      pixels.data[i] = pixels.data[i+1] = pixels.data[i+2] = value;
    }
    ctx.putImageData(pixels, 0, 0); monochrome.set(image, canvas);
  }
  return monochrome.get(image);
}

const ink = '#193e33', gold = '#cf9a53', muted = '#69796d';
function text(ctx, value, x, y, size, color=ink, font='Arial', align='left') {
  ctx.font = `${size}px ${font}, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = align; ctx.fillStyle = color; ctx.fillText(value, x, y);
}
function rule(ctx, x, y, width, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+width,y); ctx.stroke();
}
function titleLines(ctx, value, width, size) {
  ctx.font = `${size}px Georgia, "Songti SC", serif`;
  const lines = []; let line = '';
  const tokens = /\s/.test(value) ? value.split(' ').map(word=>word+' ') : [...value];
  for (const token of tokens) {
    if (line && ctx.measureText(line+token).width > width) { lines.push(line.trim()); line=''; }
    line += token;
  }
  if (line) lines.push(line.trim());
  return lines;
}
export function passportLayout(orientation, mode, count=64, stateCount=50) {
  const landscape=orientation==='landscape',width=landscape?3000:2400,height=landscape?2400:3000;
  const columns=mode==='mixed'?(landscape?13:10):(landscape?10:8),rows=Math.ceil(count/columns),left=105,top=590,bottom=height-160;
  const stateRows=mode==='mixed'?Math.ceil(stateCount/columns):0,gap=mode==='mixed'?88:0;
  const cellWidth=(width-left*2)/columns,cellHeight=(bottom-top-gap)/(rows+stateRows);
  return {width,height,columns,rows,left,top,bottom,cellWidth,cellHeight,stateTop:top+rows*cellHeight+gap};
}
function paintBadges(ctx,entries,images,selected,layout,startY) {
  const {left,columns,cellWidth,cellHeight}=layout;
  entries.forEach((entry,index)=>{
    const column=index%columns,row=Math.floor(index/columns),rowCount=Math.min(columns,entries.length-row*columns);
    const x=left+(column+(columns-rowCount)/2)*cellWidth,y=startY+row*cellHeight,done=selected.has(entry.id);
    const image=images.get(entry.id),badge=done?image:gray(image);
    const side=Math.min(cellWidth-30,cellHeight-24),scale=Math.min(side/badge.width,side/badge.height),w=badge.width*scale,h=badge.height*scale;
    ctx.drawImage(badge,x+(cellWidth-w)/2,y+(cellHeight-h)/2,w,h);
    if(done){
      const cx=x+cellWidth-18,cy=y+17;
      ctx.beginPath();ctx.arc(cx,cy,10,0,Math.PI*2);ctx.fillStyle=ink;ctx.fill();
      ctx.strokeStyle='#fffdf0';ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineJoin='round';
      ctx.beginPath();ctx.moveTo(cx-4,cy);ctx.lineTo(cx-1,cy+3);ctx.lineTo(cx+5,cy-4);ctx.stroke();
    }
  });
}

export function paintParkPassport(ctx, {parks,states,selected,images,stateImages,title,orientation,mode,language,drawMap}) {
  const zh=language==='zh',statesOnly=mode==='states',entries=statesOnly?states:parks,layout=passportLayout(orientation,mode,entries.length,states.length);
  const {width:W,height:H,left,top,columns,cellWidth,cellHeight}=layout;
  const count=entries.filter(entry=>selected.has(entry.id)).length, mixed=mode==='mixed';
  ctx.fillStyle='#faf9f4'; ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='#bcc5b6'; ctx.lineWidth=2; ctx.strokeRect(42,42,W-84,H-84);
  ctx.strokeStyle='#dde1d6'; ctx.lineWidth=1; ctx.strokeRect(54,54,W-108,H-108);
  const header=ctx.createLinearGradient(80,80,W-80,510);
  header.addColorStop(0,'#173c31'); header.addColorStop(1,'#2d5848');
  ctx.fillStyle=header; ctx.fillRect(80,80,W-160,425);
  ctx.save(); ctx.beginPath(); ctx.rect(80,80,W-160,425); ctx.clip();
  ctx.strokeStyle='#e3ce9120'; ctx.lineWidth=1;
  for(let n=0;n<16;n++) { ctx.beginPath(); for(let x=60;x<W;x+=25) {
    const y=110+n*30+19*Math.sin(x/150+n*.25); x===60?ctx.moveTo(x,y):ctx.lineTo(x,y);
  } ctx.stroke(); }
  ctx.restore();
  text(ctx,zh?(statesOnly?'玩嘚儿了~   /   五十州徽章':mixed?'玩嘚儿了~   /   公园与州徽章':'玩嘚儿了~   /   山野徽章'):(statesOnly?'W A N D E R L U S T   /   S T A T E   P A S S P O R T':mixed?'WANDERLUST   /   PARKS & STATES':'W A N D E R L U S T   /   P A R K   P A S S P O R T'),140,143,23,'#e4c794');
  const titleWidth=W*.57-170; let size=orientation==='landscape'?93:82, lines=titleLines(ctx,title,titleWidth,size);
  while((lines.length>2||lines.some(line=>ctx.measureText(line).width>titleWidth))&&size>30) {size-=2;lines=titleLines(ctx,title,titleWidth,size);}
  const first=lines.length>1?252:283;
  lines.forEach((line,i)=>text(ctx,line,137,first+i*size*1.12,size,'#fffdf0','Georgia'));
  text(ctx,zh?(statesOnly?'美国五十州 · 每一枚徽章，都是一段回忆':'美国国家公园 · 每一枚徽章，都是一段回忆'):(statesOnly?'FIFTY STATES · A COLLECTION OF MEMORIES':'THE NATIONAL PARKS · A COLLECTION OF MEMORIES'),142,395,21,'#c9d4c4');
  text(ctx,String(count).padStart(2,'0'),140,465,52,'#efd09a','Georgia');
  text(ctx,zh?`/ ${entries.length}  已探索`:`/ ${entries.length}  EXPLORED`,212,463,23,'#e6e6d5');
  const barX=440,barW=Math.max(200,titleWidth-320);
  ctx.fillStyle='#577164';ctx.fillRect(barX,444,barW,8);
  ctx.fillStyle=gold;ctx.fillRect(barX,444,barW*count/entries.length,8);
  drawMap(ctx,{x:W*.61,y:125,w:W*.32,h:330});
  text(ctx,zh?(statesOnly?'我的五十州徽章册':'我的国家公园徽章册'):(statesOnly?'THE STATE BADGE COLLECTION':'THE PARK BADGE COLLECTION'),left+8,552,25,ink,'Georgia');
  text(ctx,zh?'彩色 · 已到访     灰色 · 待探索':'COLOR · EXPLORED     GRAYSCALE · STILL TO DISCOVER',W-left-8,550,19,muted,'Arial','right');
  rule(ctx,left,571,W-left*2,'#cad1c4');
  paintBadges(ctx,entries,statesOnly?stateImages:images,selected,layout,top);
  if(mixed){
    const y=layout.stateTop-72,stateCount=states.filter(state=>selected.has(state.id)).length;
    rule(ctx,left,y,W-left*2,'#a6b5a2');
    text(ctx,zh?'沿途的五十州':'THE FIFTY STATES ALONG THE WAY',left+8,y+43,25,ink,'Georgia');
    text(ctx,zh?`已探索 ${stateCount} / 50 州`:`${stateCount} / 50 STATES EXPLORED`,W-left-8,y+43,20,muted,'Arial','right');
    paintBadges(ctx,states,stateImages,selected,layout,layout.stateTop);
  }
  rule(ctx,left,H-119,W-left*2,'#cad1c4');
  text(ctx,zh?'收藏山野，奔赴下一段风景。':'Collect the wild. Keep the wonder.',left+8,H-78,24,ink,'Georgia');
  text(ctx,'WANDERLUST  /  JOURNEY STUDIO',W-left-8,H-79,17,muted,'Arial','right');
  return layout;
}
