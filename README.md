# KASIR LUXE

Aplikasi kasir (Point of Sale) dengan **dua mode**, satu berkas antarmuka yang sama.

| mode | data disimpan di | butuh internet | untuk apa |
|---|---|---|---|
| **lokal** | `localStorage` peramban | tidak | satu HP, jalan penuh waktu sinyal mati, dibungkus jadi APK |
| **server** | Postgres lewat `/api` | ya | dipakai bersama beberapa perangkat, plus menu **Data** untuk mengolah dengan SQL |

Modenya **tidak disetel tangan**, melainkan disimpulkan dari cara halaman dibuka:
dibuka dari berkas (`file://`, termasuk APK) → lokal; disajikan peladen (`http://`)
→ server. Kalau modenya berupa setelan, cepat atau lambat ada yang menyalakan
mode server di HP lalu membawanya ke tempat tanpa sinyal — dan kasirnya berhenti
jualan justru di saat paling ramai.

Dibuat untuk NABES · Naturagen Berkah Sejahtera.

## Cara pakai

Buka halamannya, selesai. Tidak ada yang perlu dipasang.

- **Kasir** — ketuk barang, jumlahnya nambah, uang pembeli masuk lewat keypad, kembalian dihitung. Tiap ketukan dijawab: kartunya berdenyut, HP bergetar pendek, dan muncul keping kecil yang menyebut barang apa yang barusan masuk dan jadi berapa — lengkap dengan tombol **Urungkan**
- **Produk** — daftar barang sendiri: tambah, ubah, hapus
- **Riwayat** — transaksi yang sudah lewat, lengkap dengan rinciannya
- **Atur** — nama toko, format angka, dan **cadangan data**

## Di mana datanya disimpan (mode lokal)

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

## Versi skema & migrasi (mode lokal)

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

## Cara membukanya

Tiga jalan, dari yang paling cepat:

| cara | dapat apa | mode |
|---|---|---|
| **Sajikan sebagai berkas statis** (GitHub Pages, atau peladen statis apa pun) | tautan yang bisa dibuka di HP mana pun | lokal |
| **Salin `index.html` ke HP** → buka pakai Chrome → titik tiga → **Tambahkan ke layar utama** | ikon seperti aplikasi biasa, jalan tanpa sinyal | lokal |
| **`docker compose up`** | data dipakai bersama + menu **Data** untuk SQL | server |

Disajikan statis, `index.html` tetap mencoba menghubungi `/api` lalu **mendarat
mulus ke mode lokal** waktu tidak menemukannya — menu Data tidak muncul, dan
datanya tinggal di peramban masing-masing pengunjung. Dibuktikan di
`uji/statis.js`; halaman yang macet karena menunggu peladen yang tidak pernah
ada adalah kegagalan yang tidak menampilkan galat apa pun.

Karena itu, menyajikannya lewat GitHub Pages **tidak membocorkan data toko**:
halamannya tidak membawa data sama sekali, tiap pengunjung dapat salinan kosong
di peramban sendiri.

**Belum ada APK di gudang ini.** Perakitnya (`KASIR/android/build.sh`) ada di
repositori kerja NABES, bukan di sini. Cara kedua di tabel atas memberi hasil
yang praktis sama tanpa merakit apa pun.

## Mode server

### Menjalankan

```bash
cp server/.env.contoh server/.env     # lalu isi SANDI_TOKO
docker compose up                     # buka http://localhost:3000
```

Tanpa Docker:

```bash
createdb kasir
cd server && npm install
DATABASE_URL=postgresql://…/kasir SANDI_TOKO=… npm run migrasi
DATABASE_URL=postgresql://…/kasir SANDI_TOKO=… npm start
```

Peladen **menolak jalan tanpa `SANDI_TOKO`**. Kasir yang terbuka di internet
tanpa kata sandi bukan kasir, melainkan basis data milik umum.

### Menu Data — mengolah dengan SQL

Menu **Data** hanya muncul di mode server. Isinya kotak SQL yang menerima kueri
apa pun ke basis data toko, dengan tiga pengaman yang tidak bisa dilewati:

**1. Kueri tulis WAJIB dipratinjau dulu.** `UPDATE`/`DELETE` tidak pernah langsung
jalan. Kueri dijalankan sungguhan di basis data lalu **dibatalkan**, dan yang
dilaporkan cuma jumlah baris yang akan terkena. Baru sesudah angkanya terlihat,
tombol "Ya, simpan" muncul.

Ini menjawab kesalahan yang paling mahal di kotak seperti ini: lupa `WHERE`.
`UPDATE produk SET harga = 0` dan versi ber-`WHERE`-nya kelihatan mirip di layar
kecil, tapi yang satu mengubah 4 baris dan yang lain 400. **Angkanya yang
membedakan, bukan hurufnya.**

**2. Bentuk basis data tidak bisa disentuh.** `DROP`, `ALTER`, `CREATE`, `TRUNCATE`
selalu ditolak. Yang menolak bukan penyaringan teks di sisi Node melainkan hak
akses peran `kasir_sql` di Postgres (lihat `server/migrasi/002_peran.sql`).

Penyaringan teks harus benar **setiap kali** untuk bisa disebut aman, sementara
SQL punya tak terhingga cara menuliskan hal yang sama — komentar di tengah kata
kunci, kutip dolar, spasi tak terlihat. Satu celah, dan perlindungannya tidak ada
artinya. Hak akses basis data tidak punya celah seperti itu.

**3. Cadangan diambil sebelum menulis.** Setiap kueri yang benar-benar disimpan
didahului salinan seluruh isi toko ke tabel `cadangan_otomatis` (20 terakhir
disimpan). Kalau cadangannya gagal dibuat, kuerinya **tidak dijalankan** — seluruh
alasan mode ini aman bertumpu pada adanya jalan pulang.

Peran `kasir_sql` juga tidak diberi hak apa pun ke `jejak_sql` dan
`cadangan_otomatis`: jejak yang bisa dihapus dari kotak yang sama dengan yang
dijejaki bukan jejak, dan cadangan yang bisa dihapus oleh kueri yang seharusnya
dilindunginya bukan cadangan.

### Repositori ini publik — apakah data toko ikut terbuka?

**Tidak.** Yang publik adalah *kodenya*, bukan datanya. Orang yang membuka
GitHub bisa membaca cara aplikasi ini bekerja, tapi itu tidak memberinya jalan
masuk ke basis data toko mana pun — sama seperti mengetahui merek gembok tidak
memberi orang kuncinya.

Yang menjaga pintu ada di luar repositori:

| | tempatnya | ikut ke GitHub? |
|---|---|---|
| `SANDI_TOKO` | `server/.env` | **tidak** — ada di `.gitignore` |
| `RAHASIA_SESI` | `server/.env` | **tidak** |
| sandi basis data | `server/.env` | **tidak** |
| `server/.env.contoh` | repositori | ya, tapi isinya cuma nilai contoh |

Karena `.env.contoh` ikut terbaca umum, peladen **menolak menyala** kalau
`SANDI_TOKO` masih berisi nilai contoh dari berkas itu, atau kurang dari 10
huruf. Peringatan di log tidak cukup: itu hal pertama yang tidak dibaca orang,
dan pintu yang sandinya tertulis di internet tidak terlihat berbeda dari pintu
yang aman.

Sisanya yang tetap perlu diurus sendiri:

- **Jangan pernah `git add` berkas `.env`.** Sudah dijaga `.gitignore`, tapi
  `git add -f` tetap bisa menembusnya.
- **Periksa pull request sebelum digabung.** Siapa pun boleh mengirim perubahan
  ke repositori publik. Yang berbahaya bukan mereka membaca kode ini, melainkan
  kode kiriman mereka ikut terpasang di peladen tanpa dibaca dulu.
- **Kalau sandinya pernah bocor, ganti `SANDI_TOKO` lalu nyalakan ulang.**
  Semua sesi yang sedang berjalan ikut gugur.

### Pindah dari mode lokal ke server

Di HP: **Atur → Cadangkan ke file → Unduh**. Lalu di aplikasi mode server:
**Atur → Pulihkan dari file**. Bentuk cadangan lama diterima apa adanya —
tidak perlu menyunting JSON dengan tangan. Riwayat penjualan lama ikut
tersambung kembali ke produk yang baru dibuat.

### Tabel yang tersedia

`produk`, `transaksi`, `transaksi_item`, `toko`, plus tiga tampilan siap pakai:
`penjualan_harian`, `produk_terlaris`, `stok_menipis`. Nama tabel dan kolomnya
berbahasa Indonesia karena yang mengetik SQL-nya adalah pemilik toko, bukan kode.

## Isi gudang ini

| berkas | apa |
|---|---|
| `index.html` | antarmuka — satu berkas, dua mode. **Salinan persis**, jangan disunting langsung |
| `sinkron.sh` | menyalin sumbernya jadi `index.html` lalu membuktikan keduanya identik |
| `server/` | peladen Node + Postgres: API, konsol SQL, migrasi |
| `uji/` | uji peramban — `node uji/offline.js` dan `node uji/server.js` |
| `docker-compose.yml` | menjalankan mode server di komputer sendiri |

## Menjalankan uji

```bash
cd server && npm run uji     # 30 uji API terhadap Postgres sungguhan
cd uji && npm install && npm run semua   # 82 uji mode lokal + 33 uji mode server
```

Uji peramban butuh Postgres di `localhost:5433` (lihat berkasnya untuk sambungan).

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
