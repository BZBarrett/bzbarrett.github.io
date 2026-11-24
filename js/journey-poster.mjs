import {downloadFile, safeFilename} from './journey-kml.mjs';
export const EXPORT_SCALE = 2;

let assets;
export async function parkAssets() {
  if (!assets) assets = Promise.all(['data/national-parks.json', 'data/us-states.geojson'].map(async path => {
    const response = await fetch(path);
    if (!response.ok) throw new Error('The poster map could not be loaded. Please try again.');
    return response.json();
  })).catch(error => { assets = null; throw error; });
  return assets;
}

const stateCodes = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','12':'FL','13':'GA',
  '15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD',
  '25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ',
  '35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC',
  '46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY'
};
export function stateChecklist(statesGeoJSON) {
  return statesGeoJSON.features.filter(feature => stateCodes[String(feature.id).padStart(2, '0')])
    .map(feature => ({id: String(feature.id).padStart(2, '0'), name: feature.properties.name, state: stateCodes[String(feature.id).padStart(2, '0')]}))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const themes = {
  fieldnotes: {paper:'#f2efdf', ink:'#233d30', muted:'#61715b', accent:'#ae672f', land:'#d9dfc5', border:'#a7b595', visited:'#468556', list:'#f7f4e8', tree:'#247748', gray:'#8a9083', ocean:'#e9eddd', titleFont:'Georgia'},
  midnight: {paper:'#101f32', ink:'#edf3e7', muted:'#adbec6', accent:'#e8bd72', land:'#2a4052', border:'#617c84', visited:'#43886f', list:'#eaf0e9', tree:'#5db77f', gray:'#82909a', ocean:'#172c41', titleFont:'Georgia'},
  postcard: {paper:'#f9eed8', ink:'#463e30', muted:'#786b52', accent:'#c45b3e', land:'#cbd9ba', border:'#8da58a', visited:'#4d895a', list:'#fff7e7', tree:'#287647', gray:'#8c9485', ocean:'#dbe5d6', titleFont:'Georgia'},
  atlas: {paper:'#f5f5f1', ink:'#192c31', muted:'#647176', accent:'#d85727', land:'#dce1df', border:'#a3b0ad', visited:'#e49264', list:'#ffffff', tree:'#207849', gray:'#8b9593', ocean:'#eff1ed', titleFont:'Arial'}
};
function family(font, content = '') {
  const serifFallback = content.includes('嘚') ? '"Hiragino Sans GB", "PingFang SC", "Arial Unicode MS", serif' : '"Songti SC", "Noto Serif CJK SC", "Hiragino Sans GB", serif';
  return font.replace(/Arial/g, 'Arial, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Hiragino Sans GB", "Arial Unicode MS", sans-serif')
    .replace(/Georgia/g, 'Georgia, ' + serifFallback);
}
function posterCopy(language, mode) {
  const zh = String(language).toLowerCase().startsWith('zh');
  return {
    zh, brand: zh ? '玩嘚儿了~' : 'WANDERLUST',
    subject: zh ? (mode === 'states' ? '走遍美国五十州' : '美国国家公园旅行清单') : (mode === 'states' ? 'THE FIFTY UNITED STATES' : 'THE NATIONAL PARKS OF THE UNITED STATES'),
    description: (count, total) => zh ? `已探索 ${count} ${mode === 'states' ? '州' : '座公园'} · 还有 ${total-count} 处风景等待相逢` : `${count} ${mode === 'states' ? 'states' : 'parks'} explored · ${total-count} still to discover`,
    explored: zh ? '已探索' : 'Explored', waiting: zh ? '待探索' : 'Still on the list',
    notes: zh ? '玩嘚儿了~  /  山野手记' : 'W A N D E R L U S T   /   F I E L D   N O T E S',
    night: zh ? '玩嘚儿了~  ·  星夜漫游' : 'W A N D E R L U S T   •   A F T E R   D A R K',
    greetings: zh ? '玩嘚儿了~  ·  寄一张来自远方的明信片' : 'G R E E T I N G S   F R O M   T H E   G R E A T   O U T D O O R S',
    atlas: zh ? '玩嘚儿了~  /  我的旅行地图集' : 'WANDERLUST  /  PERSONAL ATLAS',
    tagline: zh ? (mode === 'states' ? '五十个州，无数个故事。' : '奔赴山野，收藏一生的回忆。') : (mode === 'states' ? 'FIFTY STATES. ENDLESS STORIES.' : 'WILD PLACES. LIFELONG MEMORIES.'),
    atlasNote: zh ? '把回忆写进地图' : 'A GEOGRAPHY OF MEMORIES',
    headings: zh ? {fieldnotes:'山河辽阔，慢慢相逢。',midnight:'同一片星空下，继续出发。',postcard:'把沿途风景，收藏成故事。',atlas:'每一站，都是故事'} : {fieldnotes:'So many places. One beautiful planet.',midnight:'Under the same wide sky.',postcard:'Adventure, collected.',atlas:'THE PLACES THAT MAKE THE STORY'},
    regions: zh ? {main:'美国本土',alaska:'阿拉斯加',hawaii:'夏威夷',samoa:'美属萨摩亚',virgin:'美属维尔京群岛'} : {main:'CONTIGUOUS UNITED STATES',alaska:'ALASKA',hawaii:'HAWAIʻI',samoa:'AMERICAN SAMOA',virgin:'US VIRGIN ISLANDS'},
    count: (count, total) => zh ? `已探索 ${count} / ${total}` : `${count} / ${total} EXPLORED`,
    statesCount: count => zh ? `已探索 ${count} 州` : `${count} STATES EXPLORED`,
    source: date => zh ? (mode === 'states' ? '美国50州 · 不含哥伦比亚特区和海外领地' : `国家公园名录 · ${date}`) : (mode === 'states' ? '50 states · District of Columbia and territories excluded' : `NPS national park list · ${date}`),
    attribution: zh ? '地图：美国人口普查局  /  附图采用不同比例尺' : 'Map: US Census Bureau  /  Insets are not to a common scale',
    defaultTitle: zh ? (mode === 'states' ? '每一州，都是新故事' : '与山野相逢') : (mode === 'states' ? 'Every state, a new story' : 'A lifetime of wild places')
  };
}
export function posterLayout(orientation) {
  const landscape = orientation === 'landscape';
  return landscape ? {landscape:true,width:3000,height:2400,mapRight:1890,legendX:1020,legendY:1920,list:{left:1990,right:2855,top:520,bottom:2220,startY:690}}
    : {landscape:false,width:2400,height:3000,mapRight:2255,legendX:1200,legendY:1840,list:{left:145,right:2255,top:1900,bottom:2860,startY:2070}};
}
const treeColor = '#287547', unvisitedInk = '#17201c';
function line(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
function text(ctx, content, x, y, font, color, align = 'left') {
  ctx.font = family(font, content); ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(content, x, y);
}
function fitText(ctx, content, x, y, maxWidth, size, font, color, align = 'center', weight = '') {
  ctx.font = family(`${weight} ${size}px ${font}`, content);
  while (ctx.measureText(content).width > maxWidth && size > 28) { size -= 2; ctx.font = family(`${weight} ${size}px ${font}`, content); }
  ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(content, x, y);
}
function wrappedText(ctx, content, x, y, maxWidth, lineHeight) {
  let current = ''; const lines = [];
  for (const word of content.split(' ')) {
    const next = current ? current + ' ' + word : word;
    if (ctx.measureText(next).width > maxWidth && current) { lines.push(current); current = word; } else current = next;
  }
  if (current) lines.push(current);
  lines.forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
}
function tree(ctx, x, y, size, color, halo = '#f7f5e9') {
  ctx.save(); ctx.translate(x, y); ctx.fillStyle = color; ctx.strokeStyle = halo; ctx.lineJoin = 'round'; ctx.lineWidth = size * .17;
  ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size*.48, -size*.24); ctx.lineTo(size*.28, -size*.24);
  ctx.lineTo(size*.62, size*.24); ctx.lineTo(size*.15, size*.24); ctx.lineTo(size*.15, size*.65);
  ctx.lineTo(-size*.15, size*.65); ctx.lineTo(-size*.15, size*.24); ctx.lineTo(-size*.62, size*.24);
  ctx.lineTo(-size*.28, -size*.24); ctx.lineTo(-size*.48, -size*.24); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
}
function projectRegion(bounds, box) {
  const [west, south, east, north] = bounds, cos = Math.cos((north + south) / 2 * Math.PI / 180);
  const scale = Math.min(box.w / ((east-west)*cos), box.h / (north-south));
  const dx = (box.w-(east-west)*cos*scale)/2, dy = (box.h-(north-south)*scale)/2;
  return point => [box.x + dx + (point[0]-west)*cos*scale, box.y + dy + (north-point[1])*scale];
}
function compass(ctx, x, y, color, north = 'N') {
  ctx.save(); ctx.translate(x,y); ctx.strokeStyle=color;ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(0,0,32,0,Math.PI*2);ctx.stroke();
  line(ctx,0,-51,0,51,color);line(ctx,-51,0,51,0,color);
  ctx.beginPath();ctx.moveTo(0,-39);ctx.lineTo(10,13);ctx.lineTo(0,4);ctx.lineTo(-10,13);ctx.closePath();ctx.fillStyle=color;ctx.fill();
  text(ctx,north,0,-65,'18px Arial',color,'center');ctx.restore();
}
function contourTexture(ctx, color, width = 2400) {
  ctx.strokeStyle=color;ctx.lineWidth=1.4;
  for(let i=0;i<61;i++) { ctx.beginPath();for(let x=-100;x<=width+100;x+=25){const y=50+i*52+28*Math.sin(x/255+i*.27)+14*Math.cos(x/145+i*.18);x===-100?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke(); }
}
function starTexture(ctx, width = 2400, height = 1885) {
  for(let i=0;i<140;i++) {
    const x=90+(i*179.3)%(width-180), y=75+(i*i*17.9)%(height-200), radius=i%9===0?2.4:1.2;
    ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fillStyle=i%4===0?'#e3c99577':'#b7d6e946';ctx.fill();
  }
  [[1850,160,1940,120],[1940,120,2050,190],[2050,190,2170,130],[2170,130,2230,235]].forEach(points=>line(ctx,...points,'#cfb77750',1.4));
}
function mountain(ctx, points, color) {
  ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=color;ctx.fill();
}
function background(ctx, theme, template, mode, title, count, total, layout, copy) {
  const {width:W,height:H,landscape}=layout,center=W/2,right=W-150;
  ctx.fillStyle=theme.paper;ctx.fillRect(0,0,W,H);
  const subject=copy.subject,description=copy.description(count,total);
  if(template==='fieldnotes') {
    contourTexture(ctx,'#59764e12',W);
    ctx.strokeStyle=theme.ink;ctx.lineWidth=3;ctx.strokeRect(52,52,W-104,H-104);ctx.strokeStyle='#94a582';ctx.lineWidth=1;ctx.strokeRect(67,67,W-134,H-134);
    text(ctx,copy.notes,center,154,'600 24px Arial',theme.muted,'center');
    fitText(ctx,title,center,285,W-300,100,'Georgia',theme.ink);
    text(ctx,subject,center,351,'25px Arial',theme.muted,'center');
    text(ctx,description,center,413,'italic 34px Georgia',theme.accent,'center');
    compass(ctx,landscape?1770:2115,landscape?535:490,theme.muted,copy.zh?'北':'N');
  } else if(template==='midnight') {
    const glow=ctx.createRadialGradient(center,700,50,center,700,1900);glow.addColorStop(0,'#244157');glow.addColorStop(1,theme.paper);ctx.fillStyle=glow;ctx.fillRect(0,0,W,landscape?H:1885);starTexture(ctx,W,landscape?H:1885);
    text(ctx,copy.night,center,150,'23px Arial',theme.accent,'center');
    fitText(ctx,title,center,285,W-290,105,'Georgia',theme.ink);
    text(ctx,subject,center,355,'24px Arial',theme.muted,'center');
    line(ctx,center-460,409,center-240,409,theme.accent,1);line(ctx,center+240,409,center+460,409,theme.accent,1);
    text(ctx,copy.count(count,total),center,419,'24px Arial',theme.accent,'center');
    ctx.strokeStyle='#738c9a65';ctx.lineWidth=2;ctx.strokeRect(65,65,W-130,H-130);
  } else if(template==='postcard') {
    ctx.fillStyle=theme.accent;ctx.fillRect(0,0,W,45);ctx.fillRect(0,H-45,W,45);
    text(ctx,copy.greetings,140,120,'600 24px Arial',theme.accent);
    ctx.save();ctx.translate(W-2400,0);ctx.beginPath();ctx.rect(1500,130,760,310);ctx.clip();
    ctx.beginPath();ctx.arc(1925,420,245,0,Math.PI*2);ctx.fillStyle='#e9ae54';ctx.fill();
    mountain(ctx,[[1480,440],[1660,310],[1770,375],[1930,235],[2110,395],[2260,310],[2400,450]],'#96ac84');
    mountain(ctx,[[1450,450],[1700,390],[1850,440],[2040,335],[2290,450]],'#476c58');ctx.restore();
    fitText(ctx,title,140,266,W-950,100,'Georgia',theme.ink,'left','bold');
    text(ctx,copy.tagline,144,335,'24px Arial',theme.muted);
    text(ctx,description,144,402,'italic 31px Georgia',theme.accent);
    line(ctx,140,455,W-140,455,theme.accent,4);
    ctx.setLineDash([9,9]);ctx.strokeStyle='#b3b99d';ctx.lineWidth=2;ctx.strokeRect(105,490,landscape?1820:2190,landscape?1490:1295);ctx.setLineDash([]);
  } else {
    ctx.fillStyle=theme.ink;ctx.fillRect(0,0,48,H);
    text(ctx,copy.atlas,145,128,'600 25px Arial',theme.ink);
    text(ctx,mode==='mixed'?(copy.zh?'国家公园 + 美国五十州':'NATIONAL PARKS + FIFTY STATES'):copy.zh?(mode==='states'?'美国五十州 / 50':'国家公园 / '+total):(mode==='states'?'UNITED STATES / 50':'NATIONAL PARKS / '+total),right,128,'22px Arial',theme.muted,'right');
    line(ctx,145,170,right,170,theme.ink,2);
    fitText(ctx,title,140,296,W-270,111,'Arial',theme.ink,'left','bold');
    text(ctx,subject,145,364,'23px Arial',theme.muted);
    ctx.fillStyle=theme.accent;ctx.fillRect(145,414,153,10);
    text(ctx,`${String(count).padStart(2,'0')} / ${total}`,right,421,'bold 53px Arial',theme.accent,'right');
    text(ctx,copy.zh?'已探索':'EXPLORED',right-320,421,'19px Arial',theme.muted,'right');
    ctx.save();ctx.translate(99,1370);ctx.rotate(-Math.PI/2);text(ctx,copy.atlasNote,0,0,'18px Arial',theme.muted);ctx.restore();
  }
  if(landscape) {
    line(ctx,175,2045,1850,2045,theme.border,1);
    text(ctx,copy.headings[template],1010,2120,template==='atlas'?'bold 28px Arial':'italic 35px Georgia',theme.ink,'center');
    text(ctx,copy.zh?'收藏沿途的风景，也收藏出发时的自己。':'Collect the places. Remember the moments.',1010,2180,'22px Arial',theme.muted,'center');
  }
}
function regionsFor(mode, layout, copy) {
  const landscape=layout.landscape;
  const regions=[{key:'main',bounds:[-125,24,-66,50],box:landscape?{x:150,y:620,w:1695,h:865}:{x:185,y:530,w:2030,h:870}}];
  if(mode==='states') regions.push(
    {key:'alaska',bounds:[-170,51,-129,72],box:landscape?{x:340,y:1550,w:590,h:285}:{x:370,y:1450,w:680,h:295}},
    {key:'hawaii',bounds:[-160.5,18.8,-154.5,22.5],box:landscape?{x:1170,y:1570,w:510,h:240}:{x:1370,y:1470,w:570,h:250}}
  );
  else regions.push(
    {key:'alaska',bounds:[-170,51,-129,72],box:landscape?{x:160,y:1540,w:500,h:285}:{x:175,y:1450,w:620,h:295}},
    {key:'hawaii',bounds:[-160.5,18.8,-154.5,22.5],box:landscape?{x:730,y:1560,w:370,h:245}:{x:875,y:1470,w:450,h:250}},
    {key:'samoa',bounds:[-171,-14.5,-169.3,-13.7],box:landscape?{x:1190,y:1560,w:280,h:245}:{x:1430,y:1460,w:320,h:265}},
    {key:'virgin',bounds:[-65.1,17.6,-64.5,18.6],box:landscape?{x:1570,y:1540,w:280,h:265}:{x:1860,y:1450,w:310,h:285}}
  );
  return regions.map(region=>({...region,name:copy.regions[region.key],project:projectRegion(region.bounds,region.box)}));
}
function belongs(feature, region) {
  const id=String(feature.id).padStart(2,'0');
  if(region.key==='alaska')return id==='02';
  if(region.key==='hawaii')return id==='15';
  if(region.key==='samoa')return id==='60';
  if(region.key==='virgin')return id==='78';
  return Boolean(stateCodes[id])&&id!=='02'&&id!=='15';
}
function polygonsFor(feature) {return feature.geometry.type==='MultiPolygon'?feature.geometry.coordinates:[feature.geometry.coordinates];}
function geometryPath(ctx, polygon, project) {
  ctx.beginPath();for(const ring of polygon){ring.forEach((point,index)=>{const [x,y]=project(point);index?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();}
}
const stateLabelPoints={
  AL:[-86.8,32.8],AK:[-151.5,64.6],AZ:[-111.8,34.2],AR:[-92.5,34.8],CA:[-119.6,37.3],CO:[-105.5,39.0],CT:[-72.7,41.6],DE:[-75.4,39],FL:[-81.7,28.3],GA:[-83.5,32.5],
  HI:[-156.4,20.9],ID:[-114.5,44.2],IL:[-89.2,40],IN:[-86.2,39.9],IA:[-93.5,42],KS:[-98.3,38.5],KY:[-85.5,37.6],LA:[-92.5,31.1],ME:[-69,45.1],MD:[-76.7,39.0],
  MA:[-71.7,42.3],MI:[-84.6,43.7],MN:[-94.5,46],MS:[-89.7,32.8],MO:[-92.5,38.5],MT:[-110.5,47],NE:[-99.8,41.5],NV:[-117,39],NH:[-71.6,43.9],NJ:[-74.6,40.1],
  NM:[-106,34.5],NY:[-75.8,43],NC:[-79.5,35.5],ND:[-100.5,47.5],OH:[-82.7,40.4],OK:[-97.5,35.6],OR:[-120.5,44],PA:[-77.7,40.9],RI:[-71.5,41.7],SC:[-80.8,33.8],
  SD:[-100.3,44.5],TN:[-86,35.9],TX:[-99.3,31.5],UT:[-111.6,39.3],VT:[-72.6,44.1],VA:[-79.2,37.7],WA:[-120.5,47.4],WV:[-80.6,38.5],WI:[-89.5,44.6],WY:[-107.5,43]
};
function mapRegions(ctx, states, regions, selected, mode, theme, template, layout) {
  for(const region of regions) {
    if(template==='midnight') {ctx.fillStyle='#152b3f66';ctx.fillRect(region.box.x-17,region.box.y-12,region.box.w+34,region.box.h+24);}
    ctx.save();ctx.beginPath();ctx.rect(region.box.x,region.box.y,region.box.w,region.box.h);ctx.clip();
    for(const feature of states.features.filter(feature=>belongs(feature,region))) {
    const done=mode!=='parks'&&selected.has(String(feature.id).padStart(2,'0'));
      for(const polygon of polygonsFor(feature)) {
        if(!polygon[0].some(point=>point[0]>=region.bounds[0]&&point[0]<=region.bounds[2]&&point[1]>=region.bounds[1]&&point[1]<=region.bounds[3]))continue;
        geometryPath(ctx,polygon,region.project);ctx.fillStyle=done?theme.visited:theme.land;ctx.fill('evenodd');ctx.strokeStyle=theme.border;ctx.lineWidth=1.7;ctx.stroke();
      }
    }
    ctx.restore();
    if(region.key!=='main')line(ctx,region.box.x,region.box.y-15,region.box.x+region.box.w,region.box.y-15,theme.border,1);
    text(ctx,region.name,region.box.x+region.box.w/2,region.key==='main'?region.box.y-20:region.box.y+region.box.h+35,'18px Arial',theme.muted,'center');
  }
  if(mode!=='parks') drawStateLabels(ctx,regions,selected,theme,template,layout);
}
function drawStateLabels(ctx,regions,selected,theme,template,layout) {
  const callouts=layout.landscape?{VT:[1775,690],NH:[1810,747],MA:[1830,810],RI:[1850,873],CT:[1830,936],NJ:[1800,1000],DE:[1800,1060],MD:[1775,1120]}:{VT:[2025,649],NH:[2110,676],MA:[2155,729],RI:[2210,784],CT:[2125,816],NJ:[2155,880],DE:[2115,935],MD:[2020,985]};
  for(const [id,postal] of Object.entries(stateCodes)) {
    const region=regions.find(r=>r.key===(id==='02'?'alaska':id==='15'?'hawaii':'main'));
    const [x,y]=region.project(stateLabelPoints[postal]);const done=selected.has(id),color=done?'#ffffff':template==='midnight'?'#b9ccd0':'#52645a';
    if(callouts[postal]) {
      const [tx,ty]=callouts[postal];line(ctx,x,y,tx-20,ty-6,theme.muted,1.2);
      text(ctx,postal,tx,ty,'bold 20px Arial',theme.ink,'center');
      ctx.beginPath();ctx.arc(x,y,2.5,0,Math.PI*2);ctx.fillStyle=theme.ink;ctx.fill();
    } else text(ctx,postal,x,y,'bold 22px Arial',color,'center');
  }
}
function parkMarkers(ctx, parks, regions, selected, theme) {
  const occupied=[];
  const regionFor=point=>point[1]<0?'samoa':point[0]>-66?'virgin':point[1]>50?'alaska':point[0]<-150?'hawaii':'main';
  parks.forEach((park,index)=>{
    const region=regions.find(r=>r.key===regionFor(park.coordinates)),[x,y]=region.project(park.coordinates),size=17;
    let px=x,py=y;
    for(let attempt=0;attempt<30;attempt++) {
      const collision=occupied.some(([ox,oy])=>Math.abs(ox-px)<42&&Math.abs(oy-py)<33);
      if(!collision)break;
      const angle=attempt*Math.PI/4,radius=23+Math.floor(attempt/8)*18;px=x+Math.cos(angle)*radius;py=y+Math.sin(angle)*radius;
    }
    occupied.push([px,py]);
    if(Math.hypot(px-x,py-y)>4){line(ctx,x,y,px,py,theme.muted,1.15);ctx.beginPath();ctx.arc(x,y,2.5,0,Math.PI*2);ctx.fillStyle=theme.muted;ctx.fill();}
    tree(ctx,px,py,size,selected.has(park.id)?theme.tree:theme.gray,theme.paper);
    ctx.font='bold 16px Arial';ctx.textAlign='left';ctx.lineWidth=5;ctx.lineJoin='round';ctx.strokeStyle=theme.paper;ctx.strokeText(String(index+1),px+14,py-9);ctx.fillStyle=theme.ink;ctx.fillText(String(index+1),px+14,py-9);
  });
}
function legend(ctx,mode,theme,layout,copy) {
  const x=layout.legendX,y=layout.legendY,left=x-350,right=x+60;
  if(mode==='mixed') {
    const labels=copy.zh?['已到访公园','待到访公园','已到访州','待到访州']:['Parks explored','Parks to discover','States explored','States to discover'];
    const width=layout.landscape?1650:2000,step=width/4,start=x-width/2;
    labels.forEach((label,i)=>{const px=start+i*step;if(i<2)tree(ctx,px,y,18,i?theme.gray:theme.tree,theme.paper);else{ctx.fillStyle=i===2?theme.visited:theme.land;ctx.fillRect(px-13,y-14,26,26);ctx.strokeStyle=theme.border;ctx.strokeRect(px-13,y-14,26,26);}text(ctx,label,px+25,y+7,'20px Arial',theme.ink);});return;
  }
  if(mode==='parks') {
    tree(ctx,left,y,20,theme.tree,theme.paper);text(ctx,copy.explored,left+35,y+8,'24px Arial',theme.ink);
    tree(ctx,right,y,20,theme.gray,theme.paper);text(ctx,copy.waiting,right+35,y+8,'24px Arial',theme.ink);
  } else {
    ctx.fillStyle=theme.visited;ctx.fillRect(left-20,y-16,25,25);text(ctx,copy.explored,left+23,y+7,'24px Arial',theme.ink);
    ctx.fillStyle=theme.land;ctx.fillRect(right-15,y-16,25,25);ctx.strokeStyle=theme.border;ctx.strokeRect(right-15,y-16,25,25);text(ctx,copy.waiting,right+28,y+7,'24px Arial',theme.ink);
  }
}
function checklist(ctx,items,selected,mode,theme,template,layout,copy) {
  const dark=template==='midnight',{left,right,top,bottom,startY}=layout.list,center=(left+right)/2,landscape=layout.landscape;
  ctx.fillStyle=theme.list;ctx.fillRect(left-24,top,right-left+48,bottom-top);
  if(template==='midnight') {ctx.fillStyle=theme.accent;ctx.fillRect(left-24,top,right-left+48,7);}
  else if(template==='postcard') {
    ctx.strokeStyle=theme.accent;ctx.lineWidth=2;ctx.strokeRect(left-24,top,right-left+48,bottom-top);
    for(let x=left+15;x<right;x+=45){ctx.beginPath();ctx.arc(x,top,5,0,Math.PI*2);ctx.fillStyle=theme.paper;ctx.fill();}
  } else line(ctx,left,top,right,top,theme.border,1.5);
  const heading=landscape?(copy.zh?'我的旅行清单':mode==='states'?'THE FIFTY STATES':'THE NATIONAL PARKS'):copy.headings[template];
  fitText(ctx,heading,center,top+83,right-left-45,landscape?35:template==='atlas'?30:42,template==='atlas'?'Arial':'Georgia',dark?'#294139':theme.ink,'center',template==='atlas'?'bold':'');
  if(landscape)text(ctx,copy.count(items.filter(item=>selected.has(item.id)).length,items.length),center,top+128,'19px Arial','#677b67','center');
  const columns=landscape?2:mode==='states'?5:4,rows=Math.ceil(items.length/columns),colWidth=(right-left)/columns;
  const rowHeight=landscape?(mode==='states'?56:46):(mode==='states'?65:47);
  items.forEach((item,index)=>{
    const column=Math.floor(index/rows),row=index%rows,x=left+column*colWidth,y=startY+row*rowHeight,done=selected.has(item.id);
    text(ctx,String(index+1).padStart(2,'0'),x+25,y,'16px Arial','#788275','right');
    if(mode==='parks')tree(ctx,x+48,y-5,11,done?treeColor:'#8a9082',theme.list);
    else {ctx.strokeStyle=done?treeColor:'#8a9082';ctx.lineWidth=1.6;ctx.strokeRect(x+38,y-17,18,18);if(done){ctx.fillStyle=treeColor;ctx.fillRect(x+38,y-17,18,18);line(ctx,x+42,y-8,x+46,y-3,'#fff',2);line(ctx,x+46,y-3,x+53,y-13,'#fff',2);}}
    ctx.textAlign='left';ctx.fillStyle=done?treeColor:unvisitedInk;ctx.font=(done?'bold ':'')+(mode==='states'?'24':'21')+'px Arial';
    wrappedText(ctx,item.name,x+68,y,colWidth-82,22);
    if(mode==='states')text(ctx,item.state,x+68,y+25,'16px Arial',done?'#51815a':'#737c72');
  });
  if(mode==='states') {
    const count=items.filter(item=>selected.has(item.id)).length;
    line(ctx,left+35,bottom-92,right-35,bottom-92,'#b9c3b5',1);
    text(ctx,copy.statesCount(count),left+40,bottom-47,'20px Arial','#3d5c44');
    const barX=landscape?left+350:730,barY=bottom-67,barW=landscape?right-barX-40:1485;
    ctx.fillStyle='#d5ddd1';ctx.fillRect(barX,barY,barW,15);ctx.fillStyle=treeColor;ctx.fillRect(barX,barY,barW*count/50,15);
  }
}
function mixedChecklist(ctx,parks,states,selected,theme,template,layout,copy) {
  const {left,right,top,bottom}=layout.list,landscape=layout.landscape;
  ctx.fillStyle=theme.list;ctx.fillRect(left-24,top,right-left+48,bottom-top);
  line(ctx,left-24,top,right+24,top,theme.accent,5);
  fitText(ctx,copy.zh?'山野与城市，都是足迹':'PARKS, STATES & STORIES',(left+right)/2,top+66,right-left-40,landscape?30:38,'Georgia','#294139');
  const group=(items,label,startY,columns,rowHeight,park)=>{
    text(ctx,label,left+8,startY,'bold 20px Arial','#355443');
    const rows=Math.ceil(items.length/columns),colWidth=(right-left)/columns;
    items.forEach((item,index)=>{
      const x=left+Math.floor(index/rows)*colWidth,y=startY+36+(index%rows)*rowHeight,done=selected.has(item.id);
      if(park){text(ctx,String(index+1).padStart(2,'0'),x+22,y,'15px Arial','#788275','right');tree(ctx,x+41,y-5,10,done?treeColor:'#8a9082',theme.list);}
      else {ctx.fillStyle=done?treeColor:'#8a9082';ctx.fillRect(x+9,y-12,11,11);}
      ctx.font=(done?'bold ':'')+'18px Arial';ctx.fillStyle=done?treeColor:unvisitedInk;ctx.textAlign='left';wrappedText(ctx,item.name,x+(park?58:30),y,colWidth-(park?69:40),20);
    });
    return startY+36+rows*rowHeight;
  };
  const end=group(parks,copy.zh?'国家公园':'NATIONAL PARKS',top+115,landscape?2:6,landscape?28:43,true);
  line(ctx,left+8,end+6,right-8,end+6,'#b9c3b5');
  group(states,copy.zh?'美国各州':'THE FIFTY STATES',end+37,landscape?2:5,landscape?22:23,false);
}

export async function renderPoster(canvas, visited, title, {mode = 'parks', template = 'fieldnotes', orientation = 'portrait', language = 'en',pixelRatio=1} = {}) {
  const [data,states] = await parkAssets();
  mode = ['states','mixed'].includes(mode) ? mode : 'parks';
  template = Object.hasOwn(themes,template) ? template : 'fieldnotes';
  const layout=posterLayout(orientation),copy=posterCopy(language,mode);
  const mixed=mode==='mixed',stateItems=stateChecklist(states),theme={...themes[template],...(mixed?{visited:template==='midnight'?'#7c6f4c':'#dfbc83'}:{})};
  const items=mode==='states'?stateItems:mixed?[...data.parks,...stateItems]:data.parks,selected=new Set(mixed?[...(visited?.parks||[]),...(visited?.states||[])]:visited||[]);
  if(mixed){
    const parkCount=data.parks.filter(p=>selected.has(p.id)).length,stateCount=stateItems.filter(p=>selected.has(p.id)).length;
    copy.subject=copy.zh?'美国国家公园与五十州':'THE NATIONAL PARKS & FIFTY STATES';
    copy.description=()=>copy.zh?`已探索 ${parkCount} / ${data.parks.length} 座公园 · ${stateCount} / 50 个州`:`${parkCount} / ${data.parks.length} parks · ${stateCount} / 50 states explored`;
    copy.defaultTitle=copy.zh?'山野与城市，都是足迹':'Parks, states & stories';
  }
  const count=items.filter(item=>selected.has(item.id)).length,ctx=canvas.getContext('2d');
  if(!ctx)throw new Error(copy.zh?'此浏览器无法生成海报。':'This browser cannot render the poster.');
  canvas.width=layout.width*pixelRatio;canvas.height=layout.height*pixelRatio;ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
  title=String(title||copy.defaultTitle).slice(0,100);
  background(ctx,theme,template,mode,title,count,items.length,layout,copy);
  const regions=regionsFor(mode,layout,copy);mapRegions(ctx,states,regions,selected,mode,theme,template,layout);
  if(mode!=='states')parkMarkers(ctx,data.parks,regions,selected,theme);
  legend(ctx,mode,theme,layout,copy);
  if(mixed)mixedChecklist(ctx,data.parks,stateItems,selected,theme,template,layout,copy);
  else checklist(ctx,items,selected,mode,theme,template,layout,copy);
  text(ctx,`${copy.source(data.updated)}  /  ${copy.attribution}`,layout.width/2,layout.height-88,'17px Arial',theme.muted,'center');
  canvas._posterRender={visited:structuredClone(visited),title,options:{mode,template,orientation,language}};
  canvas.setAttribute('aria-label',mixed?(copy.zh?'美国国家公园与50州混合海报，包含公园树图标、已到访州填色，以及两份完整清单。':'Combined parks and states poster, with park tree markers, visited state shading and both complete checklists.'):copy.zh
    ? (mode==='parks'?`国家公园海报：已探索 ${count} 座，共 ${items.length} 座。绿色树标记已去过的公园，灰色树标记未去过的公园，并附完整编号清单。`:`美国五十州海报：已探索 ${count} 州。彩色区域表示去过的州，阿拉斯加和夏威夷单独展示，并附完整清单。`)
    : mode==='parks'?`National Parks poster: ${count} of ${items.length} explored. Green trees show visited parks; gray trees show unvisited parks. Full numbered checklist included.`
      :`United States poster: ${count} of 50 states explored. Colored states are visited. Alaska and Hawaii have separate insets. Full checklist included.`);
  return data;
}
export async function downloadPoster(canvas,title) {
  const spec=canvas._posterRender;if(!spec)throw new Error('The poster could not be exported. Please try again.');
  const print=document.createElement('canvas');await renderPoster(print,spec.visited,title||spec.title,{...spec.options,pixelRatio:EXPORT_SCALE});
  const blob=await new Promise(resolve=>print.toBlob(resolve,'image/jpeg',.96));print.width=print.height=1;
  if(!blob)throw new Error('The poster could not be exported. Please try again.');
  downloadFile(blob,safeFilename(title||'national-parks-bucket-list')+'.jpg');
}
