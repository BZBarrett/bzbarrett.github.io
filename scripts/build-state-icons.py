#!/usr/bin/env python3
"""Prepare the supplied state artwork for the static site; originals stay untouched."""
import json
import re
import shutil
import subprocess
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "Resource" / "state_icons"
TARGET = ROOT / "images" / "state-badges"


def slug(name):
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", name.lower().replace("'", "")).strip("-")


def main():
    encoder = shutil.which("cwebp")
    if not encoder:
        raise SystemExit("cwebp is required to prepare the supplied PNG artwork.")
    features = json.loads((ROOT / "data/us-states.geojson").read_text())["features"]
    states = [{"id": str(f["id"]).zfill(2), "name": f["properties"]["name"]} for f in features if str(f["id"]).zfill(2) not in {"11", "60", "66", "69", "72", "78"}]
    assert len(states) == 50, "Expected exactly 50 states."
    files = {re.sub(r"-v\d+$", "", re.sub(r"^\d+-", "", p.stem)): p for p in SOURCE.glob("*.png")}
    assert set(files) == {slug(p["name"]) for p in states}, "Artwork must match every state exactly."
    TARGET.mkdir(parents=True, exist_ok=True)
    def prepare(state):
        source = files[slug(state["name"])]
        output = TARGET / (state["id"] + ".webp")
        subprocess.run([encoder, "-quiet", "-q", "92", "-m", "6", "-alpha_q", "100",
                        "-resize", "640", "0", str(source), "-o", str(output)], check=True)
        return state["id"], {"src": "images/state-badges/" + output.name, "source": source.name}
    with ThreadPoolExecutor(max_workers=4) as workers:
        icons = dict(workers.map(prepare, states))
    (ROOT / "data/state-icons.json").write_text(json.dumps({"version": 1, "icons": icons}, indent=2) + "\n")
    print(f"Prepared {len(icons)} state badges ({sum(p.stat().st_size for p in TARGET.glob('*.webp')) / 1e6:.1f} MB).")


if __name__ == "__main__":
    main()
