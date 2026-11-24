import {mercator, fromMercator} from './route-data.mjs';

// This local overview keeps the actual KML usable while the live basemap is loading or offline.
export class RouteSketch {
  constructor(canvas, route, padding, onSelect, onGesture) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.padding = padding;
    this.route = route;
    this.paths = route.lines.map(line => line.points.map(mercator));
    this.stops = route.stops.map(stop => ({name: stop.name, point: mercator(stop.point), color: stop.color}));
    this.area = route.bounds.map(mercator);
    this.selected = -1;
    this.free = false;
    this.land = [];
    this.visible = true;
    let drag;
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || drag) return;
      onGesture();
      drag = {id: event.pointerId, x: event.clientX, y: event.clientY, center: [...this.center], moved: false};
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (drag?.id !== event.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      this.free = true;
      this.center = [drag.center[0] - dx / this.scale, drag.center[1] - dy / this.scale];
      this.drawSoon();
    });
    canvas.addEventListener('pointerup', event => {
      if (drag?.id !== event.pointerId || drag.moved) return;
      const rect = canvas.getBoundingClientRect();
      const stop = this.stops.findIndex(({point}) => {
        const [x, y] = this.pixel(point);
        return Math.hypot(event.clientX - rect.left - x, event.clientY - rect.top - y) < 16;
      });
      if (stop >= 0) onSelect(stop);
    });
    canvas.addEventListener('lostpointercapture', () => { drag = null; });
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      onGesture();
      const rect = canvas.getBoundingClientRect();
      this.zoom(event.deltaY < 0 ? .25 : -.25, [event.clientX - rect.left, event.clientY - rect.top]);
    }, {passive: false});
    canvas.addEventListener('keydown', event => {
      const delta = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[event.key];
      if (!delta && !['+', '=', '-', 'Home'].includes(event.key)) return;
      event.preventDefault();
      onGesture();
      if (delta) {
        this.free = true;
        this.center[0] += delta[0] * 80 / this.scale;
        this.center[1] += delta[1] * 80 / this.scale;
      } else if (event.key === 'Home') onSelect(-1);
      else this.zoom(event.key === '-' ? -1 : 1);
      this.drawSoon();
    });
    this.resize();
  }

  resize() {
    const w = this.canvas.parentElement.clientWidth, h = this.canvas.parentElement.clientHeight;
    if (!w || !h) return;
    this.w = w; this.h = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    const p = this.padding();
    const availableW = Math.max(1, w - p.left - p.right), availableH = Math.max(1, h - p.top - p.bottom);
    this.origin = [p.left + availableW / 2, p.top + availableH / 2];
    const [sw, ne] = this.area;
    this.fitScale = Math.min(512 * 2 ** 13, availableW / Math.max(.00001, ne[0] - sw[0]), availableH / Math.max(.00001, sw[1] - ne[1]));
    if (!this.free) this.focus(this.selected);
    this.drawSoon();
  }

  focus(index) {
    this.selected = index;
    this.free = false;
    if (!this.origin) return;
    const [sw, ne] = this.area;
    this.center = index < 0 ? [(sw[0] + ne[0]) / 2, (sw[1] + ne[1]) / 2] : [...this.stops[index].point];
    this.scale = index < 0 ? this.fitScale : Math.min(512 * 2 ** 15, Math.max(512 * 2 ** 8, this.fitScale * 3));
    this.drawSoon();
  }

  zoom(steps, anchor = this.origin) {
    if (!this.center) return;
    this.free = true;
    const oldScale = this.scale;
    this.scale = Math.max(230, Math.min(512 * 2 ** 17, oldScale * 2 ** steps));
    this.center = this.center.map((n, i) => n + (anchor[i] - this.origin[i]) * (1 / oldScale - 1 / this.scale));
    this.drawSoon();
  }

  setContext(geojson) {
    this.land = [];
    for (const feature of geojson.features) {
      const g = feature.geometry;
      const polygons = g?.type === 'MultiPolygon' ? g.coordinates : g?.type === 'Polygon' ? [g.coordinates] : [];
      for (const polygon of polygons) {
        const rings = polygon.map(ring => ring.map(mercator));
        if (!rings[0]?.length) continue;
        const x = rings[0].map(p => p[0]), y = rings[0].map(p => p[1]);
        this.land.push({rings, kind: feature.properties.kind, box: [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)]});
      }
    }
    this.drawSoon();
  }

  pixel([x, y]) {
    return [this.origin[0] + (x - this.center[0]) * this.scale, this.origin[1] + (y - this.center[1]) * this.scale];
  }

  drawSoon() {
    if (!this.ctx || !this.visible || !this.center || this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.visible) this.draw();
    });
  }

  draw() {
    const ctx = this.ctx, w = this.w, h = this.h;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const dark=this.theme==='dark',minimal=this.theme==='positron';
    ctx.fillStyle = dark?'#1c2b39':minimal?'#e4e8eb':this.land.length ? '#bdd4d1' : '#e5e7d8';
    ctx.fillRect(0, 0, w, h);
    const west = this.center[0] - this.origin[0] / this.scale, north = this.center[1] - this.origin[1] / this.scale;
    const east = west + w / this.scale, south = north + h / this.scale;
    const trace = (points, offset = 0) => {
      for (const [i, point] of points.entries()) {
        const [x, y] = this.pixel([point[0] + offset, point[1]]);
        if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    };
    for (const {box, rings, kind} of this.land) {
      const shift = Math.round(this.center[0] - (box[0] + box[2]) / 2);
      if (box[2] + shift < west || box[0] + shift > east || box[3] < north || box[1] > south) continue;
      ctx.beginPath();
      for (const ring of rings) { trace(ring, shift); ctx.closePath(); }
      if (kind === 'land') {
        ctx.fillStyle = dark?'#324351':minimal?'#fafafa':'#e6e8d9'; ctx.fill('evenodd');
        ctx.setLineDash([]); ctx.strokeStyle = '#a9b9a4'; ctx.lineWidth = .8;
      } else {
        ctx.setLineDash([6, 5]); ctx.strokeStyle = '#95a387'; ctx.lineWidth = 1;
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const step = [.002, .005, .01, .025, .05, .1, .25, .5, 1, 2, 5, 10, 30, 60, 90].find(n => n * this.scale / 360 >= 110) || 90;
    const [minLon, maxLat] = fromMercator([west, north]), [maxLon, minLat] = fromMercator([east, south]);
    ctx.strokeStyle = '#566f6028'; ctx.lineWidth = .7; ctx.beginPath();
    for (let lon = Math.ceil(minLon / step) * step; lon < maxLon; lon += step) {
      const x = this.pixel(mercator([lon, 0]))[0]; ctx.moveTo(x, 0); ctx.lineTo(x, h);
    }
    for (let lat = Math.ceil(Math.max(-85, minLat) / step) * step; lat <= Math.min(85, maxLat); lat += step) {
      const y = this.pixel(mercator([0, lat]))[1]; ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();
    if (this.flatBasemap) {
      const painted = this.flatBasemap.draw(ctx, west, north, this.scale, w, h);
      if (painted !== this.tilesPainted) {
        this.tilesPainted = painted;
        this.onTileStatus?.(painted);
      }
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    this.paths.forEach((path,index)=>{
      if(this.playbackTripId&&((this.playbackTripIds||[this.playbackTripId]).includes(this.route.lines[index]?.tripId)||this.route.lines[index]?.option))return;
      ctx.setLineDash(this.route.lines[index]?.mode==='plane'?[12,12]:[]);
      ctx.beginPath();trace(path);if(this.route.lines[index]?.selected){ctx.strokeStyle='#ffb32faa';ctx.lineWidth=15;ctx.stroke();}ctx.strokeStyle=dark?'#10212a':'#faf6e4';ctx.lineWidth=8;ctx.stroke();
      ctx.strokeStyle=this.route.lines[index]?.color||'#b64e1b';ctx.lineWidth=3.6;ctx.stroke();
    });

    ctx.setLineDash([]);
    const labels = [];
    if(this.showNationalParks)for(const park of this.parkMarkers||[]){
      const point=[...park.point];point[0]+=Math.round(this.center[0]-point[0]);const [x,y]=this.pixel(point);if(x< -20||x>w+20||y< -20||y>h+20)continue;
      ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.arc(0,0,11,0,Math.PI*2);ctx.fillStyle='#fffdf1';ctx.fill();ctx.strokeStyle='#b8c9af';ctx.lineWidth=1;ctx.stroke();
      ctx.beginPath();ctx.moveTo(0,-8);ctx.lineTo(6,1);ctx.lineTo(3,1);ctx.lineTo(7,6);ctx.lineTo(2,6);ctx.lineTo(2,10);ctx.lineTo(-2,10);ctx.lineTo(-2,6);ctx.lineTo(-7,6);ctx.lineTo(-3,1);ctx.lineTo(-6,1);ctx.closePath();ctx.fillStyle='#35774c';ctx.fill();ctx.restore();
    }
    const order = this.stops.map((_, i) => i).sort((a, b) => Number(b === this.selected) - Number(a === this.selected));
    for (const i of order) {
      const stop = this.stops[i], [x, y] = this.pixel(stop.point);
      if (x < -10 || x > w + 10 || y < -10 || y > h + 10) continue;
      const active = i === this.selected||stop.selected;
      ctx.beginPath(); ctx.arc(x, y, active ? 8 : 5.5, 0, 2 * Math.PI);
      ctx.fillStyle = stop.color || (active ? '#cc571c' : '#234738'); ctx.strokeStyle = stop.selected?'#ffae20':'#fff9e7'; ctx.lineWidth = stop.selected?6:2.8; ctx.fill(); ctx.stroke();
      ctx.font = (active ? 'bold ' : '') + '13px Arial, sans-serif';
      const left = x + 12, top = y - 11, right = left + ctx.measureText(stop.name).width;
      if (labels.some(b => b[0] < right && left < b[2] && b[1] < top + 16 && top < b[3])) continue;
      labels.push([left, top, right, top + 16]);
      ctx.lineWidth = 3.5; ctx.strokeStyle = '#f6f6e8'; ctx.strokeText(stop.name, left, y + 4);
      ctx.fillStyle = '#263e32'; ctx.fillText(stop.name, left, y + 4);
    }
    this.onDraw?.();
  }
}
