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
roads https://kenney.nl/media/pages/assets/city-kit-roads/74288c9459-1787042796/kenney_city-kit-roads.zip
commercial https://kenney.nl/media/pages/assets/city-kit-commercial/a742d900eb-1753115042/kenney_city-kit-commercial_2.1.zip
suburban https://kenney.nl/media/pages/assets/city-kit-suburban/2c871b7af2-1745479373/kenney_city-kit-suburban_20.zip
cars https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip
EOF

copy() { # copy <pack> <names...>
  local pack=$1; shift
  mkdir -p "public/models/$pack/Textures"
  cp "$tmp/$pack/Models/GLB format/Textures/colormap.png" "public/models/$pack/Textures/"
  for n in "$@"; do cp "$tmp/$pack/Models/GLB format/$n.glb" "public/models/$pack/"; done
}
copy roads road-straight road-crossing road-bend road-intersection road-crossroad road-end tile-low light-curved
copy commercial building-a building-b building-c building-d building-e building-f building-g building-h \
  building-i building-j building-k building-l building-m building-n \
  building-skyscraper-a building-skyscraper-b building-skyscraper-c building-skyscraper-d building-skyscraper-e
copy suburban building-type-a building-type-b building-type-c building-type-d building-type-e building-type-f tree-large tree-small
copy cars delivery sedan suv taxi van hatchback-sports truck
cp "$tmp/cars/License.txt" public/models/LICENSE-kenney.txt
rm -rf "$tmp"
find public/models -type f | wc -l
