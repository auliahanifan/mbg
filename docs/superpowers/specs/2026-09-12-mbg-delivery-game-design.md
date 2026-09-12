# Kurir MBG — Design Spec

Game browser 3D bergaya GTA (third-person chase cam) di mana pemain mengemudikan truk boks **MBG (Makan Bergizi Gratis)**, mengambil paket di **Dapur SPPG**, lalu mengantarnya ke beberapa **SD** sebelum waktu habis.

## Keputusan (dari brainstorming 2026-09-12)

| Hal | Keputusan |
|---|---|
| Kamera | Third-person chase cam (GTA III–V) |
| Visual | Aset glTF CC0 dari Kenney: City Kit (Roads, Commercial, Suburban) + Car Kit. Lighting PBR, shadow, Sky, fog, bloom, ACES tone mapping |
| Scope v1 | Core loop (ambil → antar 3 SD → skor/timer) **+ traffic AI** |
| Engine | three.js + Vite + TypeScript, tanpa physics engine (arcade physics + AABB) |
| Deploy | Vercel (static Vite build, output `dist/`) |
| Bahasa UI | Indonesia |
| Kontrol | WASD / panah, Spasi rem, R ulang ronde |

## World

- Grid 17×17 tile, 1 tile = 12 unit dunia (jalan 9.6 lebar; gedung skala 8 dengan trotoar/setback — diubah dari 8 saat eksekusi agar jalan terasa lebar seperti GTA). Peta didefinisikan sebagai array string (`MAP`) di `src/world/cityMap.ts`.
- Tile: `R` jalan, `.` gedung komersial, `X` pencakar langit (ring luar), `H` rumah, `T` taman, `K` Dapur SPPG, `1`/`2`/`3` SD.
- Model tile jalan dipilih otomatis dari bitmask tetangga (straight/bend/T/crossroad/end) + rotasi.
- Lalu lintas kiri (Indonesia): mobil traffic berjalan di lajur kiri.

## Gameplay

1. Mulai di jalan. HUD: "Ambil paket MBG di Dapur SPPG". Marker ring kuning di titik stop + panah di atas truk.
2. Berhenti (kecepatan < 1.5) dalam radius 5 unit dari titik stop dapur → muatan terisi, timer mulai (150 s ronde 1, −20 s per ronde, min 60 s).
3. Antar berurutan ke 3 SD. Tiap SD +100 skor. Selesai → +sisa detik, pesan sukses, R untuk ronde berikutnya.
4. Timer habis → gagal, R untuk ulang dari ronde 1.
5. Tabrak gedung/mobil → kecepatan turun 60 %, truk didorong keluar.

## Visual target

Kota low-poly terang ala siang hari: sun directional shadow yang mengikuti truk, hemisphere light, `Sky` addon, fog horizon, bloom tipis, MSAA. Truk pemain = `delivery.glb` dengan decal "MBG" di kedua sisi boks. (lihat amandemen di bawah: kini putih dengan livery BGN)

## Non-goals v1

Pejalan kaki, polisi/wanted, siang-malam, suara, mobile touch controls, orbit kamera mouse.

## Amandemen 2026-09-12 — Purwokerto & livery BGN

- Kota = **Purwokerto**. POI nyata: dapur `SPPG Polresta Banyumas`; SD `SDN 1 Bancarkembar`, `SDN 1 Sokanegara`, `SDN 1 Kranji`.
- Tile landmark baru (scenery, bukan quest stop): `A` Alun-alun Purwokerto (pusat taman), `M` Menara Teratai (mesh prosedural ±30 unit), `S` Stasiun Purwokerto, `G` GOR Satria, `U` Kampus Unsoed — semua berlabel. Ring `X` kini gedung rendah (Purwokerto tanpa pencakar langit). Gunung Slamet = cone tanpa fog di utara (−z), camera far 1500.
- Mobil pemain: `delivery.glb` **putih** (UV body/door dipindah ke sel putih colormap Kenney), stiker livery di kedua sisi boks + pintu belakang: lambang BGN resmi (`public/logo-bgn.png`, warna resmi #071e49 / #92d05d), teks "MAKAN BERGIZI GRATIS", "SPPG POLRESTA BANYUMAS", strip hijau-biru.
- Teks quest "Ambil paket MBG di {nama dapur}".
