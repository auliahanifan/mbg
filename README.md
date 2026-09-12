# Kurir MBG

Game 3D browser bergaya GTA: kemudikan truk MBG (Makan Bergizi Gratis), ambil paket di Dapur SPPG, antar ke 3 SD sebelum waktu habis.

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

Model 3D dari [Kenney](https://kenney.nl) (CC0) — City Kit Roads/Commercial/Suburban, Car Kit. Ambil ulang dengan `scripts/fetch-assets.sh`.
Logo Badan Gizi Nasional (`public/logo-bgn.png`) diambil dari [bgn.go.id](https://www.bgn.go.id) — lambang instansi pemerintah, dipakai hanya sebagai livery mobil SPPG dalam game.
