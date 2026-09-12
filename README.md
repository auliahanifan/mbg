# Kurir MBG

Game 3D browser bergaya GTA di **Purwokerto asli** (jalan & gedung dari OpenStreetMap, 1 unit = 1 m): kemudikan mobil boks putih SPPG (Makan Bergizi Gratis) berlogo BGN, ambil paket di SPPG Polresta Banyumas, antar ke 3 SD sebelum waktu habis.

## Jalankan

Butuh Node.js ≥ 20.19 (Vite 8).

    pnpm install
    pnpm dev        # http://localhost:5173
    pnpm test       # unit test logika (vitest)
    pnpm build      # tsc + vite build -> dist/

Kontrol: W/A/S/D atau panah, Spasi rem, R ulang ronde.

## Deploy ke Vercel

Push repo ke GitHub, lalu di Vercel **Add New → Project → Import**. Vercel mendeteksi Vite otomatis
(Build Command `pnpm build`, Output Directory `dist`, install via `pnpm` karena ada `pnpm-lock.yaml`). Tidak perlu `vercel.json`.
Alternatif CLI: `npx vercel --prod`.

## Aset

Model mobil dari [Kenney](https://kenney.nl) Car Kit (CC0). Ambil ulang dengan `scripts/fetch-assets.sh`.
Logo Badan Gizi Nasional (`public/logo-bgn.png`) diambil dari [bgn.go.id](https://www.bgn.go.id) — lambang instansi pemerintah, dipakai hanya sebagai livery mobil SPPG dalam game.
Data jalan & gedung Purwokerto (`public/purwokerto.json`) © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, lisensi ODbL. Perbarui dengan `node scripts/fetch-osm.mjs`.
