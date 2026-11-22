// Draw OpenFreeMap's OpenMapTiles vector data on devices without a WebGL map.
export const openFreeMapStyle = 'https://tiles.openfreemap.org/styles/liberty';
const tileSize = 512;

async function json(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('Basemap metadata unavailable');
  return response.json();
}

function paintTile(tile, zoom) {
  const paper = document.createElement('canvas');
  paper.width = paper.height = tileSize;
  const ctx = paper.getContext('2d');
  ctx.fillStyle = '#edf0df'; ctx.fillRect(0, 0, tileSize, tileSize);
  ctx.lineCap = ctx.lineJoin = 'round';
  const covers = {wood: '#a8c09b', forest: '#a8c09b', grass: '#d7e3bd', farmland: '#e6e6c8',
    meadow: '#cfddbb', park: '#c6d9b6', residential: '#e8e5dc', industrial: '#deddd5', sand: '#e9dfc5'};
  for (const name of ['landuse', 'park', 'landcover', 'water', 'waterway', 'boundary', 'transportation', 'building', 'place']) {
    const layer = tile.layers[name];
    if (!layer || (name === 'building' && zoom < 13)) continue;
    const factor = tileSize / layer.extent;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i), props = feature.properties;
      let tint, width = 1;
      if (name === 'landcover' || name === 'landuse') tint = covers[props.class];
      else if (name === 'park') tint = '#c9dbb9';
      else if (name === 'water' || name === 'waterway') { tint = '#9fc4c7'; width = props.class === 'river' ? 2 : 1; }
      else if (name === 'boundary') { if (Number(props.admin_level) > 6) continue; tint = '#98a396'; }
      else if (name === 'building') tint = '#cfc8b9';
      else if (name === 'transportation') {
        const major = ['motorway', 'trunk', 'primary', 'secondary'].includes(props.class);
        if (!major && zoom < 9) continue;
        width = major ? 2.8 : 1.15;
        tint = major ? '#d0aa78' : '#fffbee';
      } else if (name === 'place') {
        const label = props['name:en'] || props.name;
        if (!label || (zoom < 7 && Number(props.rank || 0) > 5)) continue;
        const point = feature.loadGeometry()[0]?.[0];
        if (!point) continue;
        const x = point.x * factor, y = point.y * factor;
        ctx.font = '13px Arial, sans-serif'; ctx.textAlign = 'center';
        ctx.strokeStyle = '#f7f6e9'; ctx.lineWidth = 3; ctx.strokeText(label, x, y);
        ctx.fillStyle = '#465947'; ctx.fillText(label, x, y);
        continue;
      }
      if (!tint || feature.type < 2) continue;
      ctx.beginPath();
      for (const part of feature.loadGeometry()) {
        for (const [j, point] of part.entries()) {
          const x = point.x * factor, y = point.y * factor;
          if (!j) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        if (feature.type === 3) ctx.closePath();
      }
      if (feature.type === 3) { ctx.fillStyle = tint; ctx.fill('evenodd'); }
      else { ctx.strokeStyle = tint; ctx.lineWidth = width; ctx.stroke(); }
    }
  }
  return paper;
}

export async function openFlatBasemap(redraw) {
  const style = await json(openFreeMapStyle);
  const source = Object.values(style.sources).find(item => item.type === 'vector');
  const metadata = source.tiles ? source : await json(new URL(source.url, openFreeMapStyle));
  const template = metadata.tiles[0];
  // These readers are needed only for the Canvas fallback.
  const [{VectorTile}, {default: Pbf}] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/@mapbox/vector-tile@2.0.4/+esm'),
    import('https://cdn.jsdelivr.net/npm/pbf@4.0.1/+esm')
  ]);
  const cache = new Map(), pending = new Map();
  let wanted = [], closed = false;

  function queue() {
    if (closed) return;
    for (const t of wanted) {
      if (pending.size >= 4) break;
      if (pending.has(t.key) || cache.has(t.key)) continue;
      const request = new AbortController();
      pending.set(t.key, request);
      const url = template.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y);
      const timeout = setTimeout(() => request.abort(), 9000);
      fetch(url, {signal: request.signal}).then(response => {
        if (!response.ok) throw new Error('Tile unavailable');
        return response.arrayBuffer();
      }).then(bytes => {
        if (!closed) cache.set(t.key, {paper: paintTile(new VectorTile(new Pbf(new Uint8Array(bytes))), t.z)});
      }).catch(() => { if (!closed) cache.set(t.key, {retryAt: Date.now() + 30000}); })
        .finally(() => {
          clearTimeout(timeout); pending.delete(t.key);
          if (!closed) { redraw(); queue(); }
        });
    }
  }

  return {
    draw(ctx, west, north, scale, w, h) {
      const z = Math.max(metadata.minzoom || 0, Math.min(metadata.maxzoom ?? 14, Math.round(Math.log2(scale / tileSize))));
      const n = 2 ** z, size = scale / n;
      const visible = [], now = Date.now();
      let painted = false;
      for (let row = Math.max(0, Math.floor(north * n)); row < Math.min(n, Math.ceil((north + h / scale) * n)); row++) {
        for (let col = Math.floor(west * n); col < Math.ceil((west + w / scale) * n); col++) {
          const x = (col % n + n) % n, key = [z, x, row].join('/');
          const item = cache.get(key);
          if (item?.retryAt <= now) cache.delete(key);
          if (item?.paper) {
            ctx.drawImage(item.paper, (col / n - west) * scale, (row / n - north) * scale, size + .45, size + .45);
            cache.delete(key); cache.set(key, item);
            painted = true;
          }
          visible.push({key, z, x, y: row});
        }
      }
      while (cache.size > 64) cache.delete(cache.keys().next().value);
      wanted = visible;
      queue();
      return painted;
    },
    close() {
      closed = true; wanted = []; cache.clear();
      for (const request of pending.values()) request.abort();
    }
  };
}
