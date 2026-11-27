#!/usr/bin/env python3
"""Build the bundled world checklist/map. Requires Python 3 and shapely==2.1.2.
Run from any directory; downloads pinned source data to a temporary directory.
"""
import json
import urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from shapely import make_valid
from shapely.geometry import shape, mapping, Point, MultiPolygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[1]
NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/'
CLDR = 'https://raw.githubusercontent.com/unicode-org/cldr-json/48.0.0/'
SOURCE_URLS = {
    'mapunits50': NE+'ne_50m_admin_0_map_units.geojson',
    'mapunits10': NE+'ne_10m_admin_0_map_units.geojson',
    'countries10': NE+'ne_10m_admin_0_countries.geojson',
    'names-en': CLDR+'cldr-json/cldr-localenames-full/main/en/territories.json',
    'names-zh': CLDR+'cldr-json/cldr-localenames-full/main/zh/territories.json',
    'containment': CLDR+'cldr-json/cldr-core/supplemental/territoryContainment.json',
    'regions': 'https://raw.githubusercontent.com/unicode-org/cldr/release-48/common/validity/region.xml',
}
# These CLDR regular region identifiers are not assigned ISO 3166-1 alpha-2 codes.
EXTRA_CLDR = set('AC CP CQ DG EA IC TA XK'.split())
REGIONS = {'002':'Africa', '003':'North America', '005':'South America',
           '150':'Europe', '142':'Asia', '009':'Oceania'}


def read_sources():
    result = {}
    for key, url in SOURCE_URLS.items():
        with urllib.request.urlopen(url) as response:
            raw = response.read().decode('utf-8')
        result[key] = raw if key == 'regions' else json.loads(raw)
    return result


def iso_codes(xml):
    values = set()
    for element in ET.fromstring(xml).iter('id'):
        if element.attrib.get('idStatus') != 'regular':
            continue
        for token in element.text.split():
            if '~' not in token:
                values.add(token)
                continue
            a, b = token.split('~')
            b = a[:-len(b)] + b
            assert a[:-1] == b[:-1]
            values.update(a[:-1] + chr(n) for n in range(ord(a[-1]), ord(b[-1])+1))
    return values - EXTRA_CLDR


def polygons(geometry):
    if geometry.geom_type == 'Polygon':
        return [geometry]
    return [p for g in geometry.geoms for p in polygons(g)] if hasattr(geometry, 'geoms') else []


def valid_polygons(geometry):
    parts = polygons(make_valid(geometry))
    return parts[0] if len(parts) == 1 else MultiPolygon(parts)


def round_coords(value):
    return [round_coords(v) for v in value] if isinstance(value, (list, tuple)) else round(value, 4)


def build(data):
    codes = iso_codes(data['regions'])
    assert len(codes) == 249
    en = data['names-en']['main']['en']['localeDisplayNames']['territories']
    zh = data['names-zh']['main']['zh']['localeDisplayNames']['territories']
    containment = data['containment']['supplemental']['territoryContainment']
    regions = {}
    def descendants(code):
        if code in codes:
            return [code]
        return [region for child in containment.get(code, {}).get('_contains', []) for region in descendants(child)]
    for code, name in REGIONS.items():
        regions.update({region:name for region in descendants(code)})
    regions['AQ'] = 'Antarctica'
    assert codes <= regions.keys()
    groups = defaultdict(list)
    neutral = []
    for feature in data['mapunits50']['features']:
        p = feature['properties']
        code = p['ISO_A2_EH']
        # Jan Mayen and Svalbard share ISO code SJ; Natural Earth assigns NJM to Norway.
        if p['GU_A3'] == 'NJM':
            code = 'SJ'
        if code in codes:
            groups[code].append(shape(feature['geometry']))
        else:
            neutral.append(('NE_'+p['GU_A3'], p['NAME_EN'], shape(feature['geometry'])))
    # The 50m map units omit these small regions, but Natural Earth 10m includes them.
    for feature in data['mapunits10']['features']:
        code = feature['properties']['ISO_A2_EH']
        if code in {'BV', 'GI'}:
            groups[code].append(shape(feature['geometry']))
    for feature in data['countries10']['features']:
        if feature['properties']['ISO_A2_EH'] == 'UM':
            groups['UM'].append(shape(feature['geometry']))
    assert set(groups) == codes
    labels = {f['properties']['ISO_A2_EH']:(f['properties']['LABEL_X'], f['properties']['LABEL_Y'])
              for f in data['countries10']['features']}
    countries, features = [], []
    for code in sorted(codes):
        geometry = valid_polygons(unary_union([valid_polygons(g) for g in groups[code]]))
        preferred = Point(labels[code]) if code in labels else None
        representative = preferred if preferred and geometry.covers(preferred) else max(polygons(geometry), key=lambda p:p.area).representative_point()
        entry = {'id':code, 'name':en[code], 'nameZh':zh[code], 'region':regions[code],
                 'coordinates':[round(representative.x, 5), round(representative.y, 5)], 'hasGeometry':True}
        countries.append(entry)
        simplified = valid_polygons(geometry.simplify(.025, preserve_topology=True))
        geo = mapping(simplified)
        geo['coordinates'] = round_coords(geo['coordinates'])
        # Rounding can collapse tiny offshore rings. Repair only the rounded output;
        # microstates retain all their source polygons under topology-preserving simplification.
        rounded = valid_polygons(shape(geo))
        geo = mapping(rounded)
        features.append({'type':'Feature', 'id':code,
                         'properties':{'id':code, 'name':entry['name'], 'nameZh':entry['nameZh'], 'region':entry['region']},
                         'geometry':geo})
    for id, name, geometry in neutral:
        geo = mapping(valid_polygons(geometry).simplify(.025, preserve_topology=True))
        geo['coordinates'] = round_coords(geo['coordinates'])
        features.append({'type':'Feature', 'id':id, 'properties':{'id':id, 'name':name, 'selectable':False}, 'geometry':geo})
    countries.sort(key=lambda c:c['name'])
    return {'version':1, 'source':'Natural Earth 5.1.2 / Unicode CLDR 48',
            'count':len(countries), 'countries':countries}, {'type':'FeatureCollection', 'features':features}


if __name__ == '__main__':
    checklist, geography = build(read_sources())
    for filename, data in [('world-countries.json', checklist), ('world-countries.geojson', geography)]:
        target = ROOT/'data'/filename
        target.write_text(json.dumps(data, ensure_ascii=False, separators=(',',':'))+'\n', encoding='utf-8')
        print(f'{filename}: {target.stat().st_size:,} bytes')
    print(f'{len(checklist["countries"])} checklist countries/regions; {len(geography["features"])} map features')
