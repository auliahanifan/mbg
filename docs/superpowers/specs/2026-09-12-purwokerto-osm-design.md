# Kurir MBG — Purwokerto dari OpenStreetMap (Design Spec)

Mengganti dunia grid 17×17 dengan jalan dan gedung **asli Purwokerto** dari OpenStreetMap: pemain menyetir mobil boks SPPG di Jl. Jend. Soedirman yang beneran, dari SPPG Polresta Banyumas ke SD yang beneran, dengan geometri kota 1 unit = 1 meter.

Menggantikan bagian "World" dari `2026-09-12-mbg-delivery-game-design.md`; bagian gameplay, kamera, fisika, visual (livery BGN, post-processing) tetap berlaku.

## Keputusan (brainstorming 2026-09-12)

| Hal | Keputusan |
|---|---|
| Area | Pusat kota **2,5 × 2,5 km**, berpusat Alun-alun Purwokerto (−7.4236, 109.2389) |
| Gedung | **Extrude footprint OSM** (balok low-poly), bukan aset Kenney |
| Skala | **1 unit = 1 meter**, fisika mobil tidak diubah (maks ≈ 100 km/j) |
| Traffic | **Ditulis ulang** untuk graph jalan (path-following, lajur kiri, antre) |
| Jalan | **Pita mesh** per ruas + lingkaran di simpul; bukan tekstur kanvas |
| Tabrakan | **Grid okupansi 1 m** dari footprint gedung, dipakai ulang oleh `resolveCar` (circle vs AABB) |
| Sumber data | Overpass API, di-fetch **offline** oleh script, hasil JSON di-commit |

## 1. Data & representasi dunia

### Pipeline offline: `scripts/fetch-osm.mjs`

Node murni tanpa dependensi. Query Overpass untuk bbox 2,5 km (lat ±0.01125°, lon ±0.01130° dari pusat):

- `way[highway]` **kecuali** `footway|path|steps|cycleway|track|pedestrian|bridleway|corridor|proposed|construction`.
- `way[building]` (ring luar saja; relasi multipolygon dilewati).

Proyeksi equirectangular ke meter, utara = −z (konvensi game):
`x = (lon − lon0) · 111320 · cos(lat0)`, `z = −(lat − lat0) · 110574`.

Logika proyeksi, klasifikasi lebar, dan pembangunan graph ada di **`src/world/osm.ts`** (murni, unit-tested); script hanya fetch → panggil → tulis file. Keluaran **`public/purwokerto.json`** (~1–2 MB, di-commit; atribusi ODbL di README):

```ts
interface CityData {
  nodes: [number, number][];                 // [x, z] semua simpul jalan; index = id
  ways: { n: number[]; w: number; name?: string }[]; // urutan index node + lebar (m)
  buildings: { p: [number, number][]; h: number }[]; // ring luar (tanpa titik penutup) + tinggi (m)
  pois: { id: string; name: string; kind: 'kitchen' | 'school' | 'landmark'; x: number; z: number }[];
}
```

- Lebar per `highway`: primary/trunk 12, secondary 10, tertiary 8, residential/unclassified 6, service/living_street 4. Nilai lain → 6.
- Tinggi gedung deterministik dari hash koordinat: 1–3 lantai × 3,2 m; tag `building=commercial|retail|hotel|office|mall` atau `building:levels` → pakai `building:levels`·3,2 jika ada, else 5–8 lantai.
- Simpul graph = node yang dipakai ≥ 2 way, atau ujung way. Graph edge = pasangan node berurutan dalam `ways[i].n`. Satu representasi untuk render, traffic, routing.
- **POI di-hardcode** di script (`POIS` dengan lat/lon): `K` SPPG Polresta Banyumas, `1` SDN 1 Bancarkembar, `2` SDN 1 Sokanegara, `3` SDN 1 Kranji, landmark `A` Alun-alun Purwokerto, `M` Menara Teratai, `S` Stasiun Purwokerto, `G` GOR Satria. Koordinat dicari saat menulis plan; tidak bergantung pada query nama di runtime.

### Runtime: `src/world/city.ts` (murni, tanpa three)

`loadCity(data: CityData): City` menghasilkan graph + helper:
- `edges: { a: number; b: number; w: number; len: number }[]` dan `edgesFrom(node): number[]`.
- `nearestEdge(x, z): { edge, t, dist }` — proyeksi titik ke edge terdekat (linear scan cukup: ≤ ~5.000 edge).
- `pointOnEdge(edge, t): { x, z, heading }`.
- Titik berhenti quest = proyeksi POI ke edge terdekat (`stop = pointOnEdge(nearestEdge(poi))`).

`src/world/routing.ts`: `shortestPath(city, fromNode, toNode): { nodes: number[]; length: number }` — Dijkstra (heap sederhana, tanpa lib). Dipakai untuk timer ronde dan garis rute di minimap.

### Dihapus

`src/world/cityMap.ts`, `src/world/cityBuilder.ts` beserta test-nya; model Kenney `roads/`, `commercial/`, `suburban/` di `public/models` dan entri di `scripts/fetch-assets.sh`. Car Kit tetap. Asumsi grid di `hud.ts`, `traffic.ts`, `main.ts` dihapus.

## 2. Render

### Jalan — `src/render/roads.ts`

`buildRoads(city): THREE.Group` → tiga mesh gabungan (`BufferGeometry` dibangun manual):

1. **Trotoar**: pita lebar `w + 2,4`, abu terang, y = 0,02.
2. **Aspal**: pita lebar `w`, abu gelap, y = 0,04, ditambah `CircleGeometry` r = `w/2` (16 segmen) di setiap simpul agar belokan dan simpang tersambung mulus.
3. **Marka**: pita 0,15 m putih putus-putus (3 m garis, 3 m jeda) di garis tengah way dengan `w ≥ 6`, y = 0,05; berhenti `w` meter sebelum simpul graph agar tidak menyilang simpang.

Pita = strip segitiga sepanjang polyline dengan **miter join** di simpul tengah (offset sepanjang rata-rata normal dua segmen, panjang miter dibatasi 2× lebar). Tanah = plane hijau seperti sekarang (y = −0,05).

### Gedung — `src/render/buildings.ts`

`buildBuildings(data.buildings): THREE.Mesh` — tiap footprint → `THREE.Shape` → `ExtrudeGeometry` (depth `h`, tanpa bevel, diputar agar extrude ke +y), atribut `color` per gedung dari palet 6 pastel (hash index), digabung via `BufferGeometryUtils.mergeGeometries` → **1 draw call**, `MeshStandardMaterial({ vertexColors: true })`, cast/receive shadow.

### Landmark — `src/render/landmarks.ts`

Pindahan dari `cityBuilder.ts`: label sprite untuk semua `pois` (auto-fit font), mesh Menara Teratai di POI `M`, Gunung Slamet (cone tanpa fog, y 80, z −700 relatif pusat — skala visual, bukan geografis). Kamera far tetap 1500.

## 3. Tabrakan — `src/vehicle/occupancy.ts` (murni + tested)

- `rasterize(buildings, size = 2500): Uint8Array` — grid 1 m/sel, origin di sudut bbox. Implementasi runtime: gambar footprint ke offscreen canvas `fill`, baca `getImageData`; fungsi konversi `ImageData → Uint8Array` dan `boxesAround` murni sehingga bisa dites dengan array buatan.
- `boxesAround(grid, x, z, r = 3): Box[]` — AABB 1×1 untuk sel terisi dalam radius `r`, ditambah 4 AABB dinding batas peta.
- `resolveCar(car, boxes, circles)` yang ada dipakai apa adanya (boxes dari `boxesAround`, circles dari traffic).

## 4. Traffic — `src/traffic/traffic.ts` (ditulis ulang, murni + tested)

- State: `{ edge, t, dir: 1 | -1, speed, model, x, z, heading, stuck }`; posisi = `pointOnEdge` + offset **lajur kiri** `w/4` tegak lurus arah gerak.
- Di simpul: pilih edge keluar acak selain balik arah (balik hanya jika buntu).
- Kecepatan target 8–12 m/s (acak per mobil), × 0,7 pada `w ≤ 4`. Look-ahead 10 m untuk mobil lain/pemain; logika queue & `stuck` (3 s → putar balik) dari implementasi sekarang dipertahankan.
- **Spawn dinamis**: jaga 30 mobil dalam radius 250 m dari pemain; mobil > 350 m di-respawn di edge acak pada ring 150–250 m dari pemain (di luar pandangan). Spawn awal menghindari radius 20 m dari pemain.
- `trafficRenderer.ts` tidak berubah.

## 5. Quest, HUD, main

- **Quest**: urutan K → 1 → 2 → 3 tetap. `STOP_RADIUS` 5 → 8 m. `roundTime(round, routeLen) = (30 + routeLen / 8) · max(0.6, 1 − 0.1·(round − 1))`, `routeLen` = panjang Dijkstra K→1→2→3 dari titik berhenti. Skor tetap (100/SD + sisa detik).
- **Minimap** (`hud.ts`): jendela 400 × 400 m berpusat mobil, utara di atas, 200 px. Gambar `ways` sebagai garis (lebar ∝ `w`), rute Dijkstra ke target (kuning), titik target, panah mobil. Digambar tiap frame.
- **HUD**: `KMH_PER_UNIT` → 3,6.
- **Marker 3D** (`markers.ts`): tidak diubah.
- **Spawn pemain**: titik di Jl. Jend. Soedirman dekat Alun-alun (hardcode x,z), heading dari edge terdekat.
- **main.ts**: fetch `/purwokerto.json` → `loadCity` → `buildRoads`/`buildBuildings`/`buildLandmarks` → rasterize okupansi → spawn traffic. Overlay "Memuat Purwokerto…" sampai semua siap.

## 6. Performa & non-goals

- Target: gedung 1 draw call, jalan 3, ≥ 60 fps laptop biasa; fog 70–230 m tetap membatasi jarak render.
- **Tidak dikerjakan v1**: pohon/landuse, nama jalan di HUD, lampu lalu lintas, gedung multipolygon, siang-malam, streaming/chunking.

## 7. Testing

Vitest, modul murni:
- `osm.test.ts`: proyeksi lat/lon → meter (utara = −z), lebar per highway, graph split di node bersama, tinggi gedung.
- `city.test.ts`: `edgesFrom`, `nearestEdge`, `pointOnEdge` pada graph kecil buatan.
- `routing.test.ts`: jalur terpendek & panjangnya; node tak terhubung.
- `occupancy.test.ts`: `ImageData → grid`, `boxesAround` termasuk dinding batas.
- `traffic.test.ts`: maju sepanjang edge, belok di simpul tanpa balik arah, balik di jalan buntu, mengerem di belakang mobil/pemain, respawn saat terlalu jauh.
- `quest.test.ts`: `roundTime` baru.

Verifikasi visual manual: drive ke keempat POI, cek simpang mulus, marka tidak menyilang, mobil AI di lajur kiri, tabrakan gedung.
