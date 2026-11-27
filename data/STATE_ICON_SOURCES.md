# State badge artwork

The site owner supplied all 50 illustrations in the sibling `Resource/state_icons` folder.
Original PNGs are preserved. Each includes the English state name and a common nickname.

`state-icons.json` maps the site's two-digit Census/FIPS state IDs to original filenames
and transparent WebP assets. Filename numbering is alphabetical and is not a FIPS code;
for example, `42-tennessee.png` maps to FIPS `47`.

Run `python3 scripts/build-state-icons.py` with `cwebp` installed to regenerate the
640-pixel-wide, quality-92 assets with full alpha quality. The script checks that all
50 names match the state checklist. Washington, DC and territories are excluded.

State artwork is loaded only for the State Passport and combined Parks & States
Passport covers. Decoded images and grayscale variants are cached; failed image
loads block incomplete exports and can be retried. Both orientations and exported
JPGs include the same selected visits, names and nicknames.
