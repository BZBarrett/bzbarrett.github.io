# National park badge artwork

The 64 illustrations were supplied by the site owner in the sibling
`Resource/np_icons` folder. They are used by the **Park Passport / 山野徽章**
Bucket List cover. Original PNGs are retained unchanged in that folder.
No additional license or public-domain status is asserted here.

`park-icons.json` maps each existing park ID to its original filename and
the browser-ready WebP asset. This includes `33-hot-springs-v2.png`.

Regenerate the web assets with:

```sh
python3 scripts/build-park-icons.py
```

The script requires `cwebp`, verifies that the filenames match the complete
park checklist, and encodes transparent 640-pixel-wide images at quality 92.
This exceeds the badge size used by either full-resolution poster orientation.
The application loads these images only when the new cover is used. It derives
grayscale badges in canvas without altering the original files.
