#!/usr/bin/env bash
# Downloads Kenney CC0 packs and copies only the models the game uses into public/models.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
mkdir -p public/models

while read -r pack url; do
  echo "fetching $pack"
  curl -sSL -o "$tmp/$pack.zip" "$url"
  unzip -qo "$tmp/$pack.zip" -d "$tmp/$pack"
done <<'EOF'
cars https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip
EOF

copy() { # copy <pack> <names...>
  local pack=$1; shift
  mkdir -p "public/models/$pack/Textures"
  cp "$tmp/$pack/Models/GLB format/Textures/colormap.png" "public/models/$pack/Textures/"
  for n in "$@"; do cp "$tmp/$pack/Models/GLB format/$n.glb" "public/models/$pack/"; done
}
copy cars delivery sedan suv taxi van hatchback-sports truck
cp "$tmp/cars/License.txt" public/models/LICENSE-kenney.txt
rm -rf "$tmp"
find public/models -type f | wc -l
