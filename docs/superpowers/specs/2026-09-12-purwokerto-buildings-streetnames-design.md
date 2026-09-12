# Gedung Realistis Purwokerto & Nama Jalan di Peta (Design Spec)

Dua perbaikan pada dunia OSM (`2026-09-12-purwokerto-osm-design.md`): gedung yang **mirip Purwokerto asli** (rumah genteng, ruko, hotel, masjid berkubah) menggantikan balok pastel seragam, dan **nama jalan** tampil di minimap plus label "jalan saat ini" di HUD, dengan nama yang dilengkapi dari data OSM yang bolong.

## Keputusan (dirumuskan 2026-09-12 dari analisis data, tanpa sesi brainstorming — lihat "Ruling")

| Hal | Keputusan |
|---|---|
| Sumber realisme | Footprint + tag OSM (99 % gedung hanya `building=yes`; hanya 18 punya `building:levels`, 5 `height`, 0 `roof:shape`) → klasifikasi **berdasarkan luas footprint + tag** yang ada (`shop`, `amenity`, `tourism`, `office`, `religion`, `name`) |
| Rumah | Footprint polos ≤ 300 m² (median kota 91 m²): 1 lantai (78 %) / 2 lantai (22 %), **atap limas (hip) genteng** bila footprint ≤ 8 titik, rasio isi kotak-terorientasi ≥ 0,7, sisi pendek ≤ 18 m (93 % lolos) |
| Ruko / kantor | `shop`/`amenity`/`office`/`tourism` non-hotel atau `building=commercial|retail|office|apartments`: 2–3 lantai, **atap datar** beton |
| Hotel | `tourism=hotel`: 6–9 lantai; mall/rumah sakit 3–4; sekolah/civic/gudang 1–2; `building:levels` atau `height` selalu menang |
| Masjid | `building=mosque` atau `religion=muslim` atau `amenity=place_of_worship` tanpa `religion` atau nama /masjid\|musholl?a/: 4,8 m + **kubah hijau** |
| Dinding | Tekstur jendela prosedural (canvas, 1 jendela per 3 m × 3,2 m/lantai) dikalikan warna vertex (7 warna krem/putih) |
| Warna atap | Limas: genteng terakota (5/7), seng abu, asbes gelap; datar: abu beton; kubah: hijau |
| Draw call | 2 mesh gabungan (dinding bertekstur, atap berwarna vertex), ganti `ExtrudeGeometry` dengan quad manual (tanpa tutup bawah) |
| Nama jalan: kelengkapan | `name` → fallback `alt_name` → `official_name`; lalu **propagasi**: ruas tanpa nama mewarisi nama ruas yang ia teruskan lurus (≤ 30°) di simpul ujung bersama, diulang sampai stabil. Data nyata: 324 → 413 ruas bernama, jalan sekunder/tersier tanpa nama 26 → 10 |
| Nama jalan: minimap | Satu label per nama dalam jendela 400 m, di tengah panjang ruas yang terlihat, diputar searah jalan, selalu tegak, disingkat (`Jalan`→`Jl.`, `Jenderal`→`Jend.`, dst.), dilewati bila lebih panjang dari ruasnya |
| Nama jalan: HUD | Kotak bawah-tengah "jalan saat ini" = nama way dari edge terdekat mobil (nama lengkap); disembunyikan bila tanpa nama |
| Format data | `buildings[i]` mendapat `r?: 'hip' \| 'dome'` (absen = datar); `City.edges[i].way` = index way |

## Ruling / asumsi (perlu konfirmasi user, tidak memblokir)

- "Se-realistis mungkin" diartikan **low-poly tapi benar secara tipologi** (rumah genteng, ruko, kubah), bukan foto-realistis/asset 3D per gedung.
- "Lengkapi nama jalan" diartikan dari data OSM saja (fallback tag + propagasi). ~10 ruas besar dan ~760 gang tetap tanpa nama karena OSM tidak punya namanya; tidak ada tabel nama manual.
- Papan nama jalan 3D, pohon/vegetasi, menara masjid, parapet ruko: **tidak dikerjakan** (bisa ditambah nanti).

## Testing

Vitest pada modul murni: `osm.test.ts` (`area`, `orientedBox`, `classify`, `propagateNames`), `buildings.test.ts` (`wallQuads`, `flatCap`, `hipRoof`), `mapLabels.test.ts` (`shortName`, `labelSpots`). Verifikasi visual manual: rumah genteng merah, kubah di Masjid Jenderal Soedirman, hotel Aston 12 lantai, label jalan di minimap, kotak nama jalan berubah saat belok.
