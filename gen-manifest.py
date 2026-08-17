import json
from pathlib import Path

patterns_dir = Path("patterns")
manifest_path = patterns_dir / "manifest.json"

files = sorted(
    file.name
    for file in patterns_dir.glob("*.svg")
    if file.is_file()
)

manifest_path.write_text(
    json.dumps(files, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8",
)

print(f"Generated {manifest_path}")
print(f"Found {len(files)} SVG files")