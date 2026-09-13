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

Semuanya berangkat dari data, bukan ingatan: kalau peta diam, game-nya juga tidak mengarang.

**Dari OSM apa adanya.** Jalan & gedung; lebar jalan dari tag `width` lalu `lanes` (180 ruas punya `lanes`), tabel per kelas cuma dipakai kalau peta diam; ruas `oneway` tidak digambari marka tengah. `clearRoads` (`src/world/osm.ts`) mendorong setiap dinding keluar dari aspal **dan trotoar 1,2 m** (test regresi di `osm.test.ts` memeriksa seluruh data Purwokerto). Tinggi gedung memakai `height`/`building:levels` kalau ada (18 gedung punya). Nama toko/bank/sekolah asli jadi papan nama (`src/render/signs.ts`): 135 dari tag `name` gedung, ditambah node POI yang jatuh **di dalam** footprint-nya atau ≤ 12 m darinya (`nameFromPois`) — di luar itu gedung dibiarkan tanpa nama daripada salah label. Gedung yang OSM sebut sekolah/RS/kantor/tempat ibadah ditandai `civic` dan tidak pernah diberi etalase toko.

**Landmark, dengan sumbernya.** Stadion Satria digambar di atas ring `leisure=stadium` aslinya (149 × 205 m). Alun-alun memakai ring `leisure=park`-nya sendiri untuk titik tengah dan ukuran. Menara Pandang Teratai 117 m dengan dek observasi + jembatan kaca di 70–80 m ([Wikipedia](https://id.wikipedia.org/wiki/Menara_Pandang_Teratai_Purwokerto)). Gunung Slamet memakai node OSM-nya (−7,2414693 109,2149699, ele 3428): 19,6 km pada bearing 353°, digambar di 4200 m dengan skala yang sama supaya ukuran sudut dan arahnya persis. Semua pin misi adalah centroid way OSM yang membawa namanya — SPPG ada di `Kepolisian Resort Banyumas`. Beberapa gedung yang OSM-nya kosong dicantumkan tangan di tabel `KNOWN`.

**Tipikal, bukan klaim per gedung.** Yang berikut ini default render karena peta tidak merekamnya, dan berlaku umum di kota Jawa: lantai kampung (tanah padat/plester) di sekeliling tiap footprint, jadi rumput hanya tersisa di taman, sawah, dan lapangan; rumah beratap genteng limasan/pelana dengan pagar & teras; tiap blok atap datar ≤ 3 lantai yang menghadap jalan jadi deret ruko dengan etalase, papan nama per unit ~5,5 m, dan kanopi di atas trotoar; parapet + tandon air di tiap dak beton; masjid berkubah, gereja beratap pelana. Gapura hanya dipasang di mulut jalan yang **namanya memang "Gang …"** menurut OSM (28 titik), bukan di tiap gang tebakan. Pohon peneduh di kerb jalan ≥ 8 m.

Trotoar diisi **pejalan kaki** (`src/people`) yang berjalan di sisi kiri, menyeberang di simpang, lari kalau ditabrak dan terpental kalau kena mobil, plus **motor parkir** di depan setiap ruko (`src/render/parked.ts`), tenda PKL, tiang listrik, dan lampu lalu lintas. Lalu lintas 70 kendaraan dalam radius respawn, separuhnya motor.

Belum terpakai: 11 gedung OSM yang dipetakan sebagai relasi multipolygon (kami hanya membaca `way`).

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
