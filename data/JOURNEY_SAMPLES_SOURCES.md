# Journey Studio example routes

Prepared November 23, 2026. `journey-samples.json` is a bundled, offline-ready
collection of six editable journeys. Stable `sampleId` values allow loading the
collection again without duplicating or overwriting an already loaded example.
Every segment carries source notes for KML export.

## National parks

The road journey uses [Randal S. Olson's 2026 National Parks route](https://optimalroadtrips.com/trips/national-parks-2026/),
updated October 21, 2026, and its [published GeoJSON](https://optimalroadtrips.com/data/trips/national-parks-2026/national-parks-2026.geojson).
The source reports a minimum **driving-time** loop through 52 lower-48 park
gateways: 16,178 miles and about 272 driving hours. Its
[methodology](https://optimalroadtrips.com/methodology/) explains the optimization.
This is not a minimum-distance result and is not a complete transport itinerary
to every island, Alaska, Hawaii, or territory park. Island parks use road-accessible
gateways; the road geometry does not continue across the ocean.

All 52 published legs remain in their original visiting order, including the
closing leg back to Acadia. Road vertices were simplified with an approximately
250 m Douglas–Peucker tolerance and rounded to six decimal places. Endpoints are
preserved. Reported source distances/durations remain in notes; the app's measured
display length uses the simplified geometry and can differ.

The same journey includes **all 64 national parks as independent overview points**,
using this repository's `national-parks.json`. The [official NPS directory](https://www.nps.gov/aboutus/national-park-system.htm)
was checked on the preparation date and includes Chiricahua. These points are
representative park locations, not navigation entrances. The twelve parks outside
the lower 48 are intentionally not connected by invented driving routes.

Road geometry attribution: **© OpenStreetMap contributors**. The published route
file specifies [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
The adapted road portion of this collection is offered under the same license.
Retain the source URL and attribution when distributing that data or a derived
database. NPS point provenance is detailed in [SOURCES.md](SOURCES.md).

## Railways

Rail geometry comes from the [USDOT/FRA/BTS National Transportation Atlas Database Amtrak Routes layer](https://services.arcgis.com/xOi1kZaI0eWDREZv/arcgis/rest/services/NTAD_Amtrak_Routes/FeatureServer/0),
updated May 12, 2026. The dataset is a US government work available for unrestricted
public use. Credit the Federal Railroad Administration, Amtrak, and the Bureau of
Transportation Statistics. The [official catalog record](https://catalog.data.gov/dataset/amtrak-routes)
also describes the dataset.

Included corridors, cross-checked against Amtrak's route pages:

| Journey | Selected direction | Official service page |
| --- | --- | --- |
| California Zephyr | Chicago → Emeryville | [Amtrak](https://www.amtrak.com/california-zephyr-train) |
| Empire Builder | Chicago → Seattle branch | [Amtrak](https://www.amtrak.com/empire-builder-train) |
| Southwest Chief | Chicago → Los Angeles | [Amtrak](https://www.amtrak.com/southwest-chief-train) |
| Lake Shore Limited | New York → Chicago branch | [Amtrak](https://www.amtrak.com/lake-shore-limited-train) |

The New York–Chicago route can be followed by any of the three western corridors
for a coast-to-coast demonstration; the examples do not assert valid timetable
connections. Portland and Boston branches are not part of these selected paths.

The ArcGIS query requested WGS84 GeoJSON for those four names with
`maxAllowableOffset=0.001` degrees. Original line parts were oriented and ordered
along each selected corridor; duplicate source pieces and off-corridor terminal
spurs were excluded. Connectivity across nearby endpoints was used only to order
the pieces. **Gaps in the source remain separate editable segments and are not
rendered as invented rail links.** The result has three California Zephyr sections,
one Empire Builder section, five Southwest Chief sections, and two Lake Shore
Limited sections. Gap lengths range from about 33 m to 1.65 km. This is generalized
reference geometry, not a precise operational track or navigation product.

## Flights

The flight journey contains the three requested pairs:

- College Station (CLL) → Los Angeles (LAX)
- Los Angeles (LAX) → Seattle (SEA)
- New York (JFK) → St. Louis (STL)

Airport coordinates were selected from the [OurAirports open dataset](https://ourairports.com/data/)
([CSV](https://davidmegginson.github.io/ourairports-data/airports.csv)), downloaded
November 23, 2026. OurAirports releases its data to the public domain. Each route
is a generated 81-vertex great-circle arc between the airport reference points.
These arcs are **synthetic animation examples**, not recorded flight tracks and
not a claim that a nonstop service is offered. The disconnected New York–St. Louis
leg is kept separate from the western flights.

## Validation

The bundle contains 130 items: 52 road legs, 64 independent park points, 11 rail
sections, and three flight arcs. All item IDs and journey sample IDs are unique;
all coordinates are finite WGS84 longitude/latitude pairs. Every route retains
its own endpoints and transportation mode. No schedules or visit dates are
invented.
