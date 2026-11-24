export const palettes = {
  single: {name:'Single color', colors:['#31765c']},
  trail: {name:'Trail tones', colors:['#bc5c28','#2e7761','#456fa4','#9563a0','#b18b28','#b54d69']},
  coast: {name:'Coastal', colors:['#147d92','#4266b0','#ba6e31','#3f8b78','#996dba','#bd5476']},
  sunset: {name:'Sunset', colors:['#c44d3d','#a16e1b','#af477d','#7858a1','#ca6c25','#3b7e88']},
  vivid: {name:'Vivid', colors:['#2368b5','#c54c31','#33884d','#9360b0','#ad7b16','#bb4489']}
};
export const validColor = color => typeof color==='string' && /^#[0-9a-f]{6}$/i.test(color);
export const paletteColors = workspace => workspace.palette==='single'?[validColor(workspace.singleColor)?workspace.singleColor:'#31765c']:(palettes[workspace.palette]||palettes.trail).colors;
export function colorJourneys(workspace) {
  const colors=paletteColors(workspace);
  workspace.trips.forEach((trip,index)=>{if(!validColor(trip.color))trip.color=colors[index%colors.length];});
}
