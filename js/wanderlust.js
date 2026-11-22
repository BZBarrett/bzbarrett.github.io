import {parseRoute, routeBearing} from './route-data.mjs';
import {RouteSketch} from './route-sketch.mjs';
import {openFreeMapStyle, openFlatBasemap} from './flat-basemap.mjs';

const el = id => document.getElementById(id);
const panel = el('tab-wanderlust'), atlas = el('journey-atlas'), mapHost = el('journey-map');
const routeCard = atlas.querySelector('.route-card'), header = el('atlas-title'), controls = el('route-controls');
const selector = el('route-stop'), play = el('route-play'), retry = el('atlas-retry'), status = el('atlas-status');
const sketchCanvas = el('route-sketch'), expand = el('atlas-expand');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const active = () => panel.classList.contains('active') && !document.hidden;
const collection = features => ({type: 'FeatureCollection', features});
let route, sketch, map, initializing = false, connecting = false, live = false, tileWait, tourTimer, layoutFrame;
let selection = -1, playing = false, manuallyMoved = false, overviewZoom = 9;
let flatAttempt;

// Leave room for the itinerary so every stop is visible even on a phone.
function padding() {
  const rect = atlas.getBoundingClientRect(), card = routeCard.getBoundingClientRect();
  const onPhone = rect.width <= 640;
  return {
    left: onPhone ? 25 : Math.min(Math.round(card.right - rect.left + 32), Math.round(rect.width * .49)),
    right: onPhone ? 40 : Math.min(100, Math.round(rect.width * .11)),
    top: Math.min(onPhone ? 78 : 105, Math.round(rect.height * .2)),
    bottom: onPhone ? Math.min(Math.round(rect.bottom - card.top + 19), Math.round(rect.height * .55)) : 55
  };
}

function camera(animate) {
  if (!map || !route) return;
  const duration = animate && !motion.matches ? 1550 : 0;
  const pad = padding();
  const overview = map.cameraForBounds(route.bounds, {padding: pad, maxZoom: 13, bearing: 0});
  overviewZoom = overview?.zoom ?? 10;
  if (selection < 0) {
    map.fitBounds(route.bounds, {padding: pad, maxZoom: 13, duration, pitch: 0, bearing: 0});
  } else {
    const stop = route.stops[selection];
    const next = route.stops[selection + 1]?.point;
    const previous = route.stops[selection - 1]?.point;
    const bearing = next ? routeBearing(stop.point, next) : previous ? routeBearing(previous, stop.point) : 0;
    map.flyTo({center: stop.point, padding: pad, zoom: Math.min(15, Math.max(9, overviewZoom + 2)),
      bearing, pitch: 48, duration, essential: false});
  }
}

function updatePlay(value) {
  clearTimeout(tourTimer);
  playing = value;
  play.setAttribute('aria-pressed', String(value));
  play.textContent = value ? 'Pause tour' : 'Play tour';
}

function stopAt(position, animate = true) {
  if (!route) return;
  selection = Math.max(-1, Math.min(position, route.stops.length - 1));
  manuallyMoved = false;
  const stop = route.stops[selection];
  selector.value = String(selection);
  const count = route.stops.length;
  const countText = selection < 0 ? count + (count === 1 ? ' stop' : ' stops') : 'Stop ' + (selection + 1) + ' of ' + count;
  el('route-type').textContent = (route.sample ? 'Sample route' : 'Travel route') + ' · ' + countText;
  el('route-title').textContent = stop ? stop.name : route.name;
  el('route-notes').textContent = stop ? stop.description || route.name : route.description;
  el('route-prev').disabled = selection < 0;
  el('route-next').disabled = selection === count - 1;
  if (map?.getLayer('journey-active')) map.setFilter('journey-active', ['==', ['get', 'index'], selection]);
  if (sketch) { sketch.focus(selection); sketch.resize(); }
  camera(animate);
}

function choose(position) {
  updatePlay(false);
  stopAt(position);
}

function advanceTour() {
  if (!active() || !playing || selection >= route.stops.length - 1) { updatePlay(false); return; }
  stopAt(selection + 1);
  tourTimer = setTimeout(advanceTour, 4700);
}

function gesture() {
  manuallyMoved = true;
  updatePlay(false);
}

function sketchStatus(message, canRetry = false) {
  if (live || sketch?.tilesPainted) return;
  status.textContent = message;
  retry.hidden = !canRetry;
}

async function connectFlatBasemap() {
  if (flatAttempt || live || !sketch) return;
  const attempt = flatAttempt = Symbol();
  sketchStatus('Route sketch · Loading OpenFreeMap…');
  try {
    const flat = await openFlatBasemap(() => sketch.drawSoon());
    if (live || attempt !== flatAttempt) { flat.close(); return; }
    sketch.flatBasemap = flat;
    sketch.tilesPainted = undefined;
    sketch.onTileStatus = painted => {
      if (live) return;
      el('atlas-sources').hidden = !painted;
      status.textContent = painted ? '' : 'Route sketch · Waiting for OpenFreeMap';
      retry.hidden = painted;
    };
    sketch.drawSoon();
  } catch { if (attempt === flatAttempt) sketchStatus('Route sketch · Live basemap unavailable', true); }
}

function addRouteLayers(target) {
  target.addSource('journey-tracks', {type: 'geojson', data: collection(route.lines.map(line => ({
    type: 'Feature', properties: {}, geometry: {type: 'LineString', coordinates: line.points}
  })))});
  target.addSource('journey-stops', {type: 'geojson', data: collection(route.stops.map((stop, index) => ({
    type: 'Feature', properties: {name: stop.name, index}, geometry: {type: 'Point', coordinates: stop.point}
  })))});
  for (const [id, width, color] of [['journey-casing', 8, '#fff5dc'], ['journey-line', 4, '#ac4717']]) {
    target.addLayer({id, type: 'line', source: 'journey-tracks', layout: {'line-join': 'round', 'line-cap': 'round'},
      paint: {'line-width': width, 'line-color': color}});
  }
  target.addLayer({id: 'journey-pins', type: 'circle', source: 'journey-stops',
    paint: {'circle-radius': 6, 'circle-color': '#244638', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#fffaeb'}});
  target.addLayer({id: 'journey-active', type: 'circle', source: 'journey-stops', filter: ['==', ['get','index'], selection],
    paint: {'circle-radius': 9, 'circle-color': '#c75b26', 'circle-stroke-width': 3, 'circle-stroke-color': '#fff8e1'}});
  const fonts = target.getStyle().layers.map(layer => layer.layout?.['text-font'])
    .find(stack => Array.isArray(stack) && stack.length && stack.every(font => typeof font === 'string' && !font.includes('{')));
  target.addLayer({id: 'journey-names', type: 'symbol', source: 'journey-stops',
    layout: {'text-field': ['get','name'], 'text-font': fonts || ['Noto Sans Regular'], 'text-size': 13, 'text-anchor': 'left',
      'text-offset': [1, 0], 'text-max-width': 11}, paint: {'text-color': '#263a2e', 'text-halo-color': '#fffbef', 'text-halo-width': 1.8}});
  target.on('click', 'journey-pins', event => {
    const index = event.features?.[0]?.properties?.index;
    if (index != null) choose(Number(index));
  });
  target.on('mouseenter', 'journey-pins', () => { target.getCanvas().style.cursor = 'pointer'; });
  target.on('mouseleave', 'journey-pins', () => { target.getCanvas().style.cursor = ''; });
}

function revealMap(target) {
  if (map !== target || live) return;
  live = true;
  flatAttempt = null;
  sketch.flatBasemap?.close();
  sketch.flatBasemap = null;
  clearTimeout(tileWait);
  const focused = document.activeElement === sketchCanvas;
  mapHost.classList.add('map-ready');
  mapHost.inert = false;
  mapHost.removeAttribute('aria-hidden');
  sketchCanvas.hidden = true;
  sketch.visible = false;
  if (focused) target.getCanvas().focus({preventScroll: true});
  status.textContent = '';
  retry.hidden = true;
  el('atlas-sources').hidden = false;
  // Load terrain independently after the vector map is already usable.
  target.addSource('journey-elevation', {type: 'raster-dem', url: 'https://tiles.mapterhorn.com/tilejson.json', tileSize: 512, encoding: 'terrarium'});
  const firstRoad = target.getStyle().layers.find(layer => layer.type === 'line')?.id;
  target.addLayer({id: 'journey-hillshade', type: 'hillshade', source: 'journey-elevation',
    paint: {'hillshade-exaggeration': .34, 'hillshade-shadow-color': '#485d50', 'hillshade-highlight-color': '#fff8db'}}, firstRoad);
  el('terrain-credit').hidden = false;
}

function resetBasemap() {
  clearTimeout(tileWait);
  const previous = map;
  map = null;
  live = false;
  flatAttempt = null;
  if (sketch) {
    sketch.flatBasemap?.close();
    sketch.flatBasemap = null;
    sketch.tilesPainted = false;
  }
  previous?.remove();
  mapHost.inert = true;
  mapHost.setAttribute('aria-hidden', 'true');
  mapHost.classList.remove('map-ready');
  el('atlas-sources').hidden = true;
  el('terrain-credit').hidden = true;
  sketchCanvas.hidden = false;
  if (sketch) { sketch.visible = true; sketch.resize(); }
}

async function connectBasemap() {
  if (connecting || map || !route || !active()) return;
  if (!window.WebGL2RenderingContext) { connectFlatBasemap(); return; }
  connecting = true;
  sketchStatus('Route sketch · Loading OpenFreeMap…');
  try {
    await import('./vendor/maplibre-gl-5.12.0.js');
    if (!active()) return;
    const target = new window.maplibregl.Map({
      container: mapHost, style: openFreeMapStyle,
      bounds: route.bounds, fitBoundsOptions: {padding: padding(), maxZoom: 13},
      attributionControl: false, maplibreLogo: false, trackResize: false, maxPitch: 70
    });
    map = target;
    let nativeTile = false, routeReady = false, elevated = false;
    target.on('sourcedata', event => {
      if (target !== map || !event.tile || event.tile.state !== 'loaded') return;
      if (event.source?.type === 'vector') nativeTile = true;
      if (routeReady && nativeTile && !live) revealMap(target);
      if (!elevated && live && event.sourceId === 'journey-elevation') {
        elevated = true;
        target.setTerrain({source: 'journey-elevation', exaggeration: 1.15});
      }
    });
    target.once('style.load', () => {
      if (target !== map) return;
      addRouteLayers(target);
      routeReady = true;
      camera(false);
      if (nativeTile) revealMap(target);
    });
    target.on('error', event => {
      if (target !== map || live || event.sourceId === 'journey-elevation') return;
      sketchStatus('Route sketch · Live basemap unavailable', true);
    });
    target.on('movestart', event => { if (event.originalEvent) gesture(); });
    target.getCanvas().addEventListener('webglcontextlost', () => {
      if (map !== target) return;
      resetBasemap();
      connectFlatBasemap();
    });
    tileWait = setTimeout(() => { if (map === target) sketchStatus('Route sketch · Waiting for OpenFreeMap', true); }, 12000);
  } catch {
    resetBasemap();
    connectFlatBasemap();
  } finally { connecting = false; }
}

async function openAtlas() {
  if (!active()) return;
  if (route) { resize(); connectBasemap(); return; }
  if (initializing) return;
  initializing = true;
  try {
    const response = await fetch(atlas.dataset.route, {cache: 'no-cache'});
    if (!response.ok) throw new Error('KML unavailable');
    route = parseRoute(new DOMParser().parseFromString(await response.text(), 'application/xml'));
    for (const [i, stop] of route.stops.entries()) selector.add(new Option((i + 1) + ' · ' + stop.name, String(i)));
    controls.disabled = false;
    sketch = new RouteSketch(sketchCanvas, route, padding, choose, gesture);
    fetch('data/atlas-context.geojson').then(r => r.ok ? r.json() : null)
      .then(data => { if (data) sketch.setContext(data); }).catch(() => {});
    choose(-1);
    sketchStatus('Route sketch · Natural Earth');
    connectBasemap();
  } catch {
    route = null;
    el('route-type').textContent = 'Travel route';
    el('route-title').textContent = 'Route unavailable';
    el('route-notes').textContent = 'The route file could not be read.';
    sketchStatus('', true);
  } finally { initializing = false; }
}

function resize() {
  if (!active() || layoutFrame) return;
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0;
    if (!active()) return;
    if (sketch?.visible) sketch.resize();
    if (map) { map.resize(); if (!manuallyMoved) camera(false); }
  });
}

function expandedState() {
  const isExpanded = document.fullscreenElement === atlas || atlas.classList.contains('atlas-expanded');
  expand.setAttribute('aria-label', isExpanded ? 'Exit full screen' : 'Expand map');
  expand.setAttribute('aria-pressed', String(isExpanded));
  expand.title = isExpanded ? 'Exit full screen' : 'Expand map';
  resize();
}

expand.addEventListener('click', async () => {
  if (document.fullscreenElement === atlas) await document.exitFullscreen();
  else if (atlas.classList.contains('atlas-expanded')) atlas.classList.remove('atlas-expanded');
  else if (atlas.requestFullscreen) {
    try { await atlas.requestFullscreen(); } catch { atlas.classList.add('atlas-expanded'); }
  } else atlas.classList.add('atlas-expanded');
  expandedState();
});
document.addEventListener('fullscreenchange', expandedState);
const itineraryToggle = el('itinerary-toggle');
itineraryToggle.addEventListener('click', () => {
  const details = el('itinerary-details');
  details.hidden = !details.hidden;
  const label = details.hidden ? 'Expand itinerary' : 'Collapse itinerary';
  itineraryToggle.setAttribute('aria-expanded', String(!details.hidden));
  itineraryToggle.setAttribute('aria-label', label);
  itineraryToggle.title = label;
  resize();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && atlas.classList.contains('atlas-expanded')) {
    atlas.classList.remove('atlas-expanded'); expandedState(); expand.focus();
  }
});
selector.addEventListener('change', () => choose(Number(selector.value)));
el('route-prev').addEventListener('click', () => choose(selection - 1));
el('route-next').addEventListener('click', () => choose(selection + 1));
el('route-fit').addEventListener('click', () => choose(-1));
play.addEventListener('click', () => {
  if (playing) { updatePlay(false); map?.stop(); return; }
  if (selection === route.stops.length - 1) selection = -1;
  updatePlay(true);
  advanceTour();
});
for (const [id, delta] of [['atlas-zoom-in', 1], ['atlas-zoom-out', -1]]) {
  el(id).addEventListener('click', () => {
    gesture();
    if (live) map.zoomTo(map.getZoom() + delta, {duration: motion.matches ? 0 : 240});
    else sketch?.zoom(delta);
  });
}
retry.addEventListener('click', () => {
  if (!route) { openAtlas(); return; }
  resetBasemap(); connectBasemap();
});
window.addEventListener('online', () => { if (route && !live && active()) { resetBasemap(); connectBasemap(); } });
function navigate() {
  if (active()) { openAtlas(); return; }
  updatePlay(false); map?.stop();
  if (atlas.classList.contains('atlas-expanded')) { atlas.classList.remove('atlas-expanded'); expandedState(); }
}
window.addEventListener('hashchange', navigate);
document.addEventListener('visibilitychange', navigate);
window.addEventListener('resize', resize);
if ('ResizeObserver' in window) new ResizeObserver(resize).observe(atlas);
openAtlas();
