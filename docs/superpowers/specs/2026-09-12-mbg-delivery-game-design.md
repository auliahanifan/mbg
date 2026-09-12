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

- Grid 17×17 tile, 1 tile = 8 unit dunia. Peta didefinisikan sebagai array string (`MAP`) di `src/world/cityMap.ts`.
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

Kota low-poly terang ala siang hari: sun directional shadow yang mengikuti truk, hemisphere light, `Sky` addon, fog horizon, bloom tipis, MSAA. Truk pemain = `delivery.glb` dengan decal "MBG" di kedua sisi boks.

## Non-goals v1

Pejalan kaki, polisi/wanted, siang-malam, suara, mobile touch controls, orbit kamera mouse.
