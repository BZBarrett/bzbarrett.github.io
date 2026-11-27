# World countries and regions — Bucket List assets

Bundled on November 23, 2026. The checklist contains **249 ISO 3166-1 country/region codes**, including dependencies and Antarctica. This is a travel checklist of countries **and regions**, not a count of sovereign states. The collection uses a fixed, reproducible source snapshot; it is not an automatically refreshed list.

## Files and schema

- `world-countries.json`: 249 entries under `countries`, with `id` (alpha-2 code), `name` (English), `nameZh` (Simplified Chinese), `region`, `coordinates` (representative WGS84 longitude/latitude) and `hasGeometry`.
- `world-countries.geojson`: 253 Polygon/MultiPolygon features. All 249 checklist entries have a matching `feature.id` and `properties.id`. The four additional map-only features have `properties.selectable: false`; they remain neutral land rather than being counted as checklist entries.
- `../scripts/build-world-countries.py`: reproducible generator. Requires Python 3 and `shapely==2.1.2` only when regenerating; the website uses the bundled JSON and requires no Python or live geography service.

The map-only features are `NE_SOL` (Somaliland), `NE_KOS` (Kosovo), `NE_CYN` (Northern Cyprus) and `NE_KAS` (Siachen Glacier). Their outlines follow the selected Natural Earth layer. Dataset boundaries and the ISO-based checklist are different concepts; neither is an assertion about sovereignty or recognition.

## Geography

[**Natural Earth 5.1.2**](https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2), pinned to that release:

1. [50m admin-0 map units](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_50m_admin_0_map_units.geojson) provide the base outlines. Using map units retains separate overseas regions such as French Guiana, Réunion, Bonaire/Sint Eustatius/Saba, Cocos Islands and Tokelau.
2. [10m admin-0 map units](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_10m_admin_0_map_units.geojson) supply Gibraltar and Bouvet Island, absent from the 50m layer.
3. [10m admin-0 countries](https://github.com/nvkelso/natural-earth-vector/blob/v5.1.2/geojson/ne_10m_admin_0_countries.geojson) supply U.S. Outlying Islands and preferred representative label coordinates.

Map units are grouped/dissolved by `ISO_A2_EH`. Jan Mayen (`GU_A3=NJM`) is grouped with Svalbard under `SJ` rather than with `NO`, matching the combined ISO region. Subdivisions sharing a code, such as the constituent UK countries and the two Palestinian map units, are combined. Natural Earth's existing land boundaries are otherwise retained, including its default treatment of disputed geography.

Geometries are repaired where necessary, simplified with a topology-preserving 0.025-degree tolerance, rounded to four decimal places and validated again. The output has 46,047 ring vertices. Representative points use the source country label coordinates only when inside the combined outline; otherwise an interior point is computed from its largest polygon. These are overview markers, not capitals, entrances or navigation destinations. Microstates and islands can be too small to distinguish at poster scale, so renderers may add a point marker at the representative coordinate.

Source parts on opposite sides of the antimeridian remain separate polygons. The only longitude edge spanning more than 180 degrees is Antarctica's closing edge along its southern limit (approximately −90 degrees), which is intentional. A world poster should preserve that southern closure rather than draw a line across the northern map.

Natural Earth makes its vector/raster data **public domain**, permitting modification and redistribution: [terms of use](https://www.naturalearthdata.com/about/terms-of-use/). Suggested map attribution: “Made with Natural Earth”.

## Codes, names and region groups

[**Unicode CLDR 48**](https://github.com/unicode-org/cldr-json/tree/48.0.0) provides the English and Simplified Chinese display names and region grouping:

- [English territory names](https://github.com/unicode-org/cldr-json/blob/48.0.0/cldr-json/cldr-localenames-full/main/en/territories.json)
- [Simplified Chinese territory names](https://github.com/unicode-org/cldr-json/blob/48.0.0/cldr-json/cldr-localenames-full/main/zh/territories.json)
- [Territory containment](https://github.com/unicode-org/cldr-json/blob/48.0.0/cldr-json/cldr-core/supplemental/territoryContainment.json)
- [Region validity codes, release 48](https://github.com/unicode-org/cldr/blob/release-48/common/validity/region.xml)

The 249-code set is CLDR's regular region list excluding its additional non-assigned ISO alpha-2 identifiers `AC`, `CP`, `CQ`, `DG`, `EA`, `IC`, `TA` and `XK`. [ISO describes its country-code coverage](https://www.iso.org/iso-3166-country-codes.html), including dependencies and other areas; it allows free use of the codes. Names use CLDR's standard display-name forms rather than making up translations. See [CLDR country/region naming guidance](https://cldr.unicode.org/translation/displaynames/countryregion-territory-names).

Grouping follows CLDR containment into Africa, Asia, Europe, North America (including Central America and the Caribbean), South America and Oceania. Antarctica (`AQ`) is shown as a separate group rather than CLDR's outlying-Oceania container. These are checklist browsing groups. Counts: Africa 60, Asia 51, Europe 51, North America 41, South America 16, Oceania 29, Antarctica 1.

## Validation

All 249 IDs and both language name sets are unique. Every checklist ID matches a nonempty, valid Polygon/MultiPolygon; all coordinates are finite and within WGS84 bounds. All representative points are inside or within the 0.03-degree simplification tolerance of their displayed outline. Every ring is closed. The combined asset payload is approximately 934 KB, uncompressed.

## Unicode license

The following notice accompanies the CLDR-derived data, copied from the [CLDR 48 repository license](https://github.com/unicode-org/cldr-json/blob/48.0.0/LICENSE):

```
UNICODE LICENSE V3

COPYRIGHT AND PERMISSION NOTICE

Copyright © 2015-2024 Unicode, Inc.

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.

SPDX-License-Identifier: Unicode-3.0

```
