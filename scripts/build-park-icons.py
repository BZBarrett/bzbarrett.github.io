#!/usr/bin/env python3
"""Prepare the supplied park artwork for the static site; originals stay untouched."""
import json
import re
import shutil
import subprocess
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "Resource" / "np_icons"
TARGET = ROOT / "images" / "park-badges"


def slug(name):
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("'", "")).strip("-")


def main():
    encoder = shutil.which("cwebp")
    if not encoder:
        raise SystemExit("cwebp is required to prepare the supplied PNG artwork.")
    parks = json.loads((ROOT / "data/national-parks.json").read_text())["parks"]
    files = {re.sub(r"-v\d+$", "", re.sub(r"^\d+-", "", p.stem)): p for p in SOURCE.glob("*.png")}
    assert set(files) == {slug(p["name"]) for p in parks}, "Artwork must match every park exactly."
    TARGET.mkdir(parents=True, exist_ok=True)
    def prepare(park):
        source = files[slug(park["name"])]
        output = TARGET / (park["id"] + ".webp")
        subprocess.run([encoder, "-quiet", "-q", "92", "-m", "6", "-alpha_q", "100",
                        "-resize", "640", "0", str(source), "-o", str(output)], check=True)
        return park["id"], {"src": "images/park-badges/" + output.name, "source": source.name}
    with ThreadPoolExecutor(max_workers=4) as workers:
        icons = dict(workers.map(prepare, parks))
    (ROOT / "data/park-icons.json").write_text(json.dumps({"version": 1, "icons": icons}, indent=2) + "\n")
    print(f"Prepared {len(icons)} park badges ({sum(p.stat().st_size for p in TARGET.glob('*.webp')) / 1e6:.1f} MB).")


if __name__ == "__main__":
    main()
