# KASIR LUXE

Aplikasi kasir (Point of Sale) **satu berkas HTML**. Jalan penuh tanpa internet,
tanpa server, tanpa akun. Datanya tersimpan di perangkat pemakai sendiri.

Dibuat untuk NABES · Naturagen Berkah Sejahtera.

## Cara pakai

Buka halamannya, selesai. Tidak ada yang perlu dipasang.

- **Kasir** — ketuk barang, jumlahnya nambah, uang pembeli masuk lewat keypad, kembalian dihitung
- **Produk** — daftar barang sendiri: tambah, ubah, hapus
- **Riwayat** — transaksi yang sudah lewat, lengkap dengan rinciannya
- **Atur** — nama toko, format angka, dan **cadangan data**

## Di mana datanya disimpan

Di `localStorage` peramban, kunci `kasirluxe.v1`. Artinya:

- **Tidak pernah dikirim ke mana pun.** Tidak ada server, tidak ada akun, tidak ada pelacak.
- **Terikat ke satu peramban di satu perangkat.** Buka di HP lain = data kosong.
- **Bisa hilang** kalau data situs dibersihkan, atau dibuka dari mode penyamaran.

Karena itu tombol **Atur → Cadangkan ke file → Unduh** bukan pelengkap, tapi
pengaman utama. Pakai secara rutin. Berkas `.json`-nya bisa dipulihkan lewat
**Pulihkan dari file** di perangkat mana pun.

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
