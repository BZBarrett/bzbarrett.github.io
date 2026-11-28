const fontFamily='Arial, "PingFang SC", sans-serif';
const graphemes=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;

// Keep English words together, but allow long words and unspaced CJK text to
// wrap. Grapheme boundaries preserve emoji and combining characters.
function wrapText(ctx,text,width){
  const lines=[];
  for(const paragraph of String(text).replace(/\r\n?/g,'\n').split('\n')){
    let line='';
    for(const token of paragraph.match(/\s+|\S+/gu)||[]){
      if(/^\s+$/u.test(token)){if(line)line+=' ';continue;}
      if(ctx.measureText(line+token).width<=width){line+=token;continue;}
      if(line.trim()){lines.push(line.trimEnd());line='';}
      if(ctx.measureText(token).width<=width){line=token;continue;}
      const characters=graphemes?Array.from(graphemes.segment(token),part=>part.segment):Array.from(token);
      for(const character of characters){
        if(line&&ctx.measureText(line+character).width>width){lines.push(line);line='';}
        line+=character;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

// Only captions are shortened. Saved route names, addresses and exports retain
// their original values; no geocoding is needed during video rendering.
function placeLabel(value){
  const name=String(value||'').trim();
  if(/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(name))return name;
  const parts=name.split(/[,，;；\n]+/u).map(part=>part.trim()).filter(Boolean);
  const address=part=>/^\d+(?:[-/]\d+)?(?:\s|$)/u.test(part)||/^(?:suite|unit|apt\.?|floor|#)\s*\w+/i.test(part)||/\b(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|highway|hwy|way)\.?$/i.test(part)||/^[A-Z]{2}\s+\d{5}(?:-\d{4})?$/.test(part);
  const index=parts.findIndex(part=>!address(part));
  let label=parts[index<0?0:index]||name;
  if(/^Washington$/i.test(label)&&/^D\.?C\.?$/i.test(parts[index+1]||''))label+=' DC';
  // Chinese street addresses put the city before the street, without commas.
  if(/[省市区县].*(?:路|街|巷|弄|号)/u.test(label)){
    const city=label.replace(/^(?:中国|中华人民共和国)/u,'').match(/^(?:(?:.+?(?:省|自治区)))?(.+?市)/u);
    if(city)label=city[1];
  }
  return label;
}
export function itineraryCaption(item){
  const name=String(item.name||'').trim();
  const parts=name.replace(/^from\s+/i,'').split(/\s*(?:→|⇒|⟶|➜|->)\s*|\s+(?:to|至|到)\s+/iu);
  if(parts.length>1)return parts.map(placeLabel).filter(Boolean).join(' → ');
  const endpoints=[item.startNode?.name,item.endNode?.name];
  if((!name||/^(?:route|path|track|segment|路线|路径|路段)\s*\d*$/iu.test(name))&&endpoints.every(value=>value&&!/^(?:start|end|destination|起点|终点)$/iu.test(value.trim())))return endpoints.map(placeLabel).join(' → ');
  return placeLabel(name);
}

export function videoCaptionLayout(ctx,title,subtitle,width,height){
  const panelWidth=Math.min(440,width-40),availableHeight=height-64;
  function arrange(panelWidth,scale=1){
    const textWidth=panelWidth-52,titleSize=17*scale,subtitleSize=12*scale;
    const titleFont=`600 ${titleSize}px ${fontFamily}`,subtitleFont=`${subtitleSize}px ${fontFamily}`;
    ctx.font=titleFont;const titleLines=title?wrapText(ctx,title,textWidth):[];
    ctx.font=subtitleFont;const subtitleLines=subtitle?wrapText(ctx,subtitle,textWidth):[];
    const titleLineHeight=22*scale,subtitleLineHeight=17*scale,gap=titleLines.length&&subtitleLines.length?8*scale:0;
    return {width:panelWidth,height:Math.max(75,28+titleLines.length*titleLineHeight+gap+subtitleLines.length*subtitleLineHeight),titleLines,subtitleLines,titleFont,subtitleFont,titleLineHeight,subtitleLineHeight,gap};
  }
  ctx.save();
  try{
    let layout=arrange(panelWidth);
    // Keep the compact width even for long titles; wrap first, then reduce
    // the type size only if the complete caption exceeds the frame height.
    if(layout.height>availableHeight){
      let low=0,high=1;
      for(let i=0;i<16;i++){const scale=(low+high)/2,next=arrange(panelWidth,scale);if(next.height<=availableHeight){low=scale;layout=next;}else high=scale;}
    }
    return layout;
  }finally{ctx.restore();}
}
