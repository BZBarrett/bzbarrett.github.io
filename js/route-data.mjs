// KML is the single source for the route title, geometry, waypoint order and notes.
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export const nearLongitude = (lon, reference) => lon + 360 * Math.round((reference - lon) / 360);

export function mercator([lon, lat]) {
  const radians = clamp(lat, -85.051129, 85.051129) * Math.PI / 180;
  return [(lon + 180) / 360, (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2];
}

export function fromMercator([x, y]) {
  return [360 * x - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI];
}

function childText(parent, name) {
  return [...(parent?.children || [])].find(node => node.localName === name)?.textContent.trim() || '';
}

function coordinates(text, separator) {
  const [east, north] = text.trim().split(separator);
  if (!east || !north) return null;
  const lon = Number(east), lat = Number(north);
  return Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 90 ? [lon, lat] : null;
}

function boundsOf(points) {
  // The shortest longitude interval keeps Pacific routes together across the date line.
  const longitudes = points.map(([lon]) => (lon + 360) % 360).sort((a, b) => a - b);
  let largestGap = -1, west = 0, south = 90, north = -90;
  for (let i = 0; i < longitudes.length; i++) {
    const next = i + 1 === longitudes.length ? longitudes[0] + 360 : longitudes[i + 1];
    if (next - longitudes[i] > largestGap) {
      largestGap = next - longitudes[i];
      west = (next + 180) % 360 - 180;
    }
  }
  for (const [, lat] of points) { south = Math.min(south, lat); north = Math.max(north, lat); }
  return [[west, south], [west + 360 - largestGap, north]];
}

export function parseRoute(xml) {
  if (xml.getElementsByTagNameNS('*', 'parsererror').length || xml.documentElement?.localName !== 'kml') {
    throw new Error('Invalid KML');
  }
  const children = (node, name) => [...node.getElementsByTagNameNS('*', name)];
  const doc = children(xml, 'Document')[0] || children(xml, 'Folder')[0] || xml.documentElement;
  const notes = node => childText(node, 'description').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const sampleFlag = [...doc.children].find(node => node.localName === 'ExtendedData');
  const sample = sampleFlag && children(sampleFlag, 'Data').some(node => node.getAttribute('name') === 'sample' && childText(node, 'value') === 'true');
  const lines = [], stops = [];

  for (const mark of children(xml, 'Placemark')) {
    const name = childText(mark, 'name'), description = notes(mark);
    for (const geometry of mark.getElementsByTagNameNS('*', '*')) {
      if (geometry.localName === 'Point') {
        const point = coordinates(childText(geometry, 'coordinates'), ',');
        if (point) stops.push({name: name || 'Stop ' + (stops.length + 1), description, point});
      } else if (geometry.localName === 'LineString' || geometry.localName === 'Track') {
        const points = geometry.localName === 'Track'
          ? children(geometry, 'coord').map(node => coordinates(node.textContent, /\s+/))
          : childText(geometry, 'coordinates').split(/\s+/).map(pair => coordinates(pair, ','));
        const valid = points.filter(Boolean);
        if (valid.length > 1) lines.push({name, points: valid});
      }
    }
  }
  if (!lines.length && !stops.length) throw new Error('The KML contains no route or waypoints.');
  if (!stops.length) {
    const first = lines[0].points[0], last = lines[lines.length - 1].points.at(-1);
    stops.push({name: 'Start', description: '', point: [...first]});
    stops.push({name: 'Finish', description: '', point: [...last]});
  }
  const bounds = boundsOf(lines.flatMap(line => line.points).concat(stops.map(stop => stop.point)));
  const middle = (bounds[0][0] + bounds[1][0]) / 2;
  for (const line of lines) {
    let previous = middle;
    for (const point of line.points) {
      point[0] = nearLongitude(point[0], previous);
      previous = point[0];
    }
  }
  for (const stop of stops) stop.point[0] = nearLongitude(stop.point[0], middle);
  return {name: childText(doc, 'name') || lines.find(line => line.name)?.name || 'Travel route',
    description: notes(doc), sample: Boolean(sample), lines, stops, bounds};
}

export function routeBearing(a, b) {
  if (!b) return 0;
  const rad = Math.PI / 180;
  const delta = (b[0] - a[0]) * rad;
  return Math.atan2(Math.sin(delta) * Math.cos(b[1] * rad),
    Math.cos(a[1] * rad) * Math.sin(b[1] * rad) - Math.sin(a[1] * rad) * Math.cos(b[1] * rad) * Math.cos(delta)) / rad;
}
