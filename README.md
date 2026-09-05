# KASIR LUXE

Aplikasi kasir (Point of Sale) **satu berkas HTML**. Jalan penuh tanpa internet,
tanpa server, tanpa akun. Datanya tersimpan di perangkat pemakai sendiri.

Dibuat untuk NABES · Naturagen Berkah Sejahtera.

## Cara pakai

Buka halamannya, selesai. Tidak ada yang perlu dipasang.

- **Kasir** — ketuk barang, jumlahnya nambah, uang pembeli masuk lewat keypad, kembalian dihitung. Tiap ketukan dijawab: kartunya berdenyut, HP bergetar pendek, dan muncul keping kecil yang menyebut barang apa yang barusan masuk dan jadi berapa — lengkap dengan tombol **Urungkan**
- **Produk** — daftar barang sendiri: tambah, ubah, hapus
- **Riwayat** — transaksi yang sudah lewat, lengkap dengan rinciannya
- **Atur** — nama toko, format angka, dan **cadangan data**

## Di mana datanya disimpan

Di `localStorage` peramban, dua kunci:

| kunci | isi |
|---|---|
| `kasirluxe.v1` | data yang dipakai — produk, riwayat, pengaturan |
| `kasirluxe.v1.bak` | salinan mentah sebelum perubahan besar terakhir (lihat bawah) |

Artinya:

- **Tidak pernah dikirim ke mana pun.** Tidak ada server, tidak ada akun, tidak ada pelacak.
- **Terikat ke satu peramban di satu perangkat.** Buka di HP lain = data kosong.
- **Bisa hilang** kalau data situs dibersihkan, atau dibuka dari mode penyamaran.

Karena itu tombol **Atur → Cadangkan ke file → Unduh** bukan pelengkap, tapi
pengaman utama. Pakai secara rutin. Berkas `.json`-nya bisa dipulihkan lewat
**Pulihkan dari file** di perangkat mana pun.

## Versi skema & migrasi

Aplikasi ini ditimpa utuh waktu diperbarui: pemakai menyalin HTML baru ke HP,
membukanya, dan detik itu juga kode baru membaca data lama yang sudah ada.
Tidak ada server yang sempat merapikan datanya lebih dulu. Jadi bentuk data
punya nomor sendiri — `schema` — dan kode baru wajib bisa membaca bentuk lama
lalu mengubahnya sendiri saat dibuka.

Yang berlaku sekarang: **skema v2**. Nomornya tampil di **Atur → Cadangan**.

Aturan waktu menambah `MIGRATIONS[n]` baru di `index.html`:

1. **Jangan pernah ganti nama kunci `kasirluxe.v1`.** Mengganti nama kunci sama
   saja dengan menghapus data toko — tanpa galat, tanpa peringatan, cuma "kok
   produknya balik ke contoh semua".
2. **Satu langkah per kenaikan versi, maju saja.** Tidak ada jalan mundur.
3. **Jangan buang kolom yang tidak dikenali.** Pemakai yang sempat membuka versi
   lebih baru menaruh sesuatu di situ.
4. **Uji dengan data bentuk lama, bukan data bersih.** Kalau tidak, langkahnya
   cuma terbukti jalan pada data yang memang sudah benar.

Sebelum langkah pertama dijalankan, isi `kasirluxe.v1` disalin apa adanya ke
`kasirluxe.v1.bak`. Salinan itu juga dibuat sebelum **Pulihkan** dan sebelum
**Reset** — dua tombol yang paling gampang menghapus sehari penuh penjualan.
Isinya bisa diambil lewat **Atur → Salinan sebelum pemutakhiran → Unduh**.

Sengaja hanya bisa diunduh, bukan dipulihkan sekali ketuk: kalau langsung
dipulihkan, pemakai yang salah pencet di situ kehilangan penjualan sesudah
migrasi — masalah yang sama dari arah sebaliknya. Diunduh dulu, diperiksa, baru
masuk lewat **Pulihkan dari file** yang memang sudah minta konfirmasi.

## Isi gudang ini

| berkas | apa |
|---|---|
| `index.html` | halaman yang disajikan — **salinan persis**, jangan disunting langsung |
| `sinkron.sh` | menyalin sumbernya jadi `index.html` lalu membuktikan keduanya identik |

## ⚠️ SATU SUMBER, SATU ARAH

Sumber yang sebenarnya **bukan** `index.html`, melainkan `KASIR/KASIR.html`
di repositori kerja NABES. Berkas itu juga yang dipanggil `KASIR/android/build.sh`
waktu merakit APK.

```
KASIR/KASIR.html  ──sinkron.sh──>  index.html   (dan build.sh ──> APK)
```

Kalau `index.html` disunting langsung, suntingannya akan **hilang tanpa suara**
begitu `sinkron.sh` dijalankan lagi, dan APK-nya tidak akan pernah ikut berubah.
Ini bukan kekhawatiran teoretis — pola persis ini sudah pernah memakan waktu
setengah hari di proyek lain waktu `build.sh` diam-diam menimpa berkas papan.

`sinkron.sh` membandingkan hash kedua berkas sesudah menyalin, dan berhenti
dengan galat kalau tidak sama. Jangan dilewati.

## Rencana lanjutan — jadi aplikasi web yang bisa dipasang

Belum dikerjakan. Yang dibutuhkan:

1. `manifest.webmanifest` — supaya muncul tombol "Pasang" di Chrome Android
2. `sw.js` (service worker) — supaya tetap jalan waktu sinyal mati
3. ikon 192px & 512px
4. dua baris tambahan di `<head>`: tautan manifest + pendaftaran service worker

Yang perlu dipikirkan dulu sebelum mengerjakan: langkah 4 **mengubah isi HTML**,
jadi dia harus masuk ke `KASIR.html` (sumbernya), bukan ke `index.html`. Tapi
service worker tidak jalan dari `file://` — artinya APK yang memuat dari
`file:///android_asset/` akan mendaftarkan service worker yang selalu gagal.
Perlu dipagari supaya pendaftarannya hanya jalan di `http(s)`, kalau tidak
APK-nya kena galat yang tidak ada gunanya.

## Lisensi

Belum ditentukan.
