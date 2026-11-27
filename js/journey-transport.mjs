export const transportNames={car:'Car',train:'Train',plane:'Plane',walk:'Walk',transit:'Public'};
export const transportModes=Object.keys(transportNames);
export const DEFAULT_TRANSPORT_SPEEDS=Object.freeze({car:1,train:1.5,plane:3,walk:.5,transit:1});
export const isTransportMode=mode=>Object.hasOwn(transportNames,mode);
export function normalizeTransportSpeeds(value={}){
  return Object.fromEntries(transportModes.map(mode=>{const ratio=value?.[mode];return [mode,mode==='car'?1:typeof ratio==='number'&&Number.isFinite(ratio)&&ratio>=.05&&ratio<=20?ratio:DEFAULT_TRANSPORT_SPEEDS[mode]];}));
}
