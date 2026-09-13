# Kurir MBG

Game 3D browser bergaya GTA di **Purwokerto asli** (jalan & gedung dari OpenStreetMap, 1 unit = 1 m): kemudikan mobil boks putih SPPG (Makan Bergizi Gratis) berlogo BGN, ambil paket di SPPG Polresta Banyumas, antar ke 3 SD sebelum waktu habis.

## Jalankan

Butuh Node.js ≥ 20.19 (Vite 8).
Script data OSM (`node scripts/fetch-osm.mjs`) butuh Node ≥ 23.6 (type stripping).

    pnpm install
    pnpm dev        # http://localhost:5173
    pnpm test       # unit test logika (vitest)
    pnpm build      # tsc + vite build -> dist/

Kontrol: W/A/S/D atau panah, Spasi rem, H klakson, M bisu, R ulang ronde.
Untuk melihat sudut kota tertentu saat mengembangkan: `http://localhost:5173/?at=x,z,heading` (meter dari pusat peta, heading radian).

## Kota

Jalan & gedung dari OSM; `clearRoads` (`src/world/osm.ts`) mendorong setiap dinding keluar dari aspal **dan trotoar 1,2 m** (test regresi di `osm.test.ts` memeriksa seluruh data Purwokerto). Di atasnya: rumah Jawa beratap genteng limasan/pelana dengan pagar & teras, ruko dengan papan nama warna-warni, **nama toko/bank/sekolah asli dari OSM** sebagai papan nama (`src/render/signs.ts`), masjid berkubah, gereja beratap pelana, Alun-alun hasil renovasi (plaza, beringin, huruf ALUN-ALUN PURWOKERTO), Menara Teratai, GOR Satria, Gunung Slamet di utara. Trotoar diisi **pejalan kaki** (`src/people`) yang berjalan di sisi kiri, menyeberang di simpang, lari kalau ditabrak dan terpental kalau kena mobil, plus **motor parkir** di depan setiap ruko (`src/render/parked.ts`), tenda PKL, tiang listrik, dan lampu lalu lintas.

## Deploy ke Vercel

Push repo ke GitHub, lalu di Vercel **Add New → Project → Import**. Vercel mendeteksi Vite otomatis
(Build Command `pnpm build`, Output Directory `dist`, install via `pnpm` karena ada `pnpm-lock.yaml`). Tidak perlu `vercel.json`.
Alternatif CLI: `npx vercel --prod`.

## Aset

Model mobil dari [Kenney](https://kenney.nl) Car Kit (CC0). Ambil ulang dengan `scripts/fetch-assets.sh`.
Logo Badan Gizi Nasional (`public/logo-bgn.png`) diambil dari [bgn.go.id](https://www.bgn.go.id) — lambang instansi pemerintah, dipakai hanya sebagai livery mobil SPPG dalam game.
Data jalan & gedung Purwokerto (`public/purwokerto.json`) © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, lisensi ODbL. Perbarui dengan `node scripts/fetch-osm.mjs`. Selain jalan & gedung, script juga mengambil landuse (taman, sawah, hutan, parkir), air (sungai, kali, drainase), rel KA, dan pohon (`natural=tree` + sebaran deterministik di hutan/taman) — dirender `src/render/terrain.ts`.
Ketinggian (MDPL) dari SRTM 30 m via [Open Topo Data](https://www.opentopodata.org) (`public/dem.json`, grid 40 m, dihaluskan 3×3 saat dimuat). Perbarui dengan `node scripts/fetch-dem.mjs`. Jalan, gedung, pohon, mobil, dan kamera mengikuti kontur; HUD menampilkan MDPL.
Nama jalan diambil dari tag `name` (fallback `alt_name`/`official_name`); ruas tanpa nama mewarisi nama ruas yang diteruskannya lurus (≤ 30°), lihat `propagateNames` di `src/world/osm.ts`.
Suara (`public/audio`, Ogg mono) diambil ulang & dikonversi dengan `scripts/fetch-audio.sh` (butuh ffmpeg). Mesin = 3 loop rekaman (idle/cruise/high) di-crossfade & di-pitch menurut RPM 4 gigi; mobil lalu lintas terdekat pakai loop posisional (PannerNode). Sumber CC0 dari Freesound: car_idle_loop & car_ignition (AndrewAlexander), Sedan engine loop (Dmitry_mansurev64), SFX_Car_Engine_Outside_RPMHigh (GiocoSound), J1_Car_Horn (Iamgiorgio), Car Crash with Glass (magnuswaker), Small city ambience (felix.blume); [Kenney](https://kenney.nl) Impact Sounds, Music Jingles, Interface Sounds (CC0). Decit ban: [Car tire squeal skid loop](https://opengameart.org/content/car-tire-squeal-skid-loop) oleh Vertigon, CC-BY 3.0.
