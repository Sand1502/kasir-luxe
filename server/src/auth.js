'use strict';
/* Masuk satu kata sandi untuk satu toko. Bukan sistem pengguna: yang dijaga
   adalah satu warung dengan satu-dua kasir, dan menambah tabel pengguna,
   peran, serta pemulihan sandi ke situ cuma menambah yang bisa rusak tanpa
   menambah yang dijaga. */

const crypto = require('crypto');

const NAMA_KUE   = 'kasir_sesi';
const UMUR_SESI  = Number(process.env.UMUR_SESI_JAM || 12) * 3600 * 1000;

function rahasia() {
  return process.env.RAHASIA_SESI || rahasia._acak ||
        (rahasia._acak = crypto.randomBytes(32).toString('hex'));
}

/* Nilai-nilai yang tertulis di server/.env.contoh. Berkas itu ikut ke dalam
   repositori yang PUBLIK, jadi kalau ada yang menyalakan peladen tanpa sempat
   menggantinya, kata sandi tokonya bisa dibaca siapa pun yang membuka GitHub —
   dan pintu masuknya sama sekali tidak terasa terbuka, karena kotak sandinya
   tetap muncul seperti biasa. Ditolak mentah-mentah di sini, bukan diperingatkan:
   peringatan di log adalah hal pertama yang tidak dibaca orang. */
const SANDI_TERLARANG = [
  'ganti-jadi-sesuatu-yang-panjang',
  'ganti-sandi-ini',
  'kasir-lokal',
  'password', 'admin', 'kasir', '12345678', 'rahasia'
];
const PANJANG_MINIMAL = 10;

function sandiToko() {
  const s = process.env.SANDI_TOKO;
  if (!s) {
    throw new Error('SANDI_TOKO belum disetel — peladen menolak jalan tanpa kata sandi.');
  }
  if (SANDI_TERLARANG.indexOf(s.trim().toLowerCase()) !== -1) {
    throw new Error(
      'SANDI_TOKO masih memakai nilai contoh dari server/.env.contoh.\n' +
      '  Berkas itu ada di repositori publik, jadi sandinya bisa dibaca siapa saja.\n' +
      '  Ganti dulu di server/.env sebelum peladen dinyalakan.');
  }
  if (s.length < PANJANG_MINIMAL) {
    throw new Error(
      `SANDI_TOKO terlalu pendek (${s.length} huruf, minimal ${PANJANG_MINIMAL}).\n` +
      '  Pintu ini menghadap internet dan di baliknya ada kotak SQL.');
  }
  return s;
}

/* Perbandingan yang waktunya tidak bergantung isi. Perbandingan biasa berhenti
   di karakter pertama yang beda, dan selisih waktunya — walau kecil — cukup
   untuk menebak sandi satu huruf demi satu huruf lewat jaringan. */
function samaAman(a, b) {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  if (x.length !== y.length) {
    // Tetap bandingkan sesuatu supaya panjang yang salah tidak lebih cepat ditolak.
    crypto.timingSafeEqual(x, x);
    return false;
  }
  return crypto.timingSafeEqual(x, y);
}

function tandaTangan(data) {
  return crypto.createHmac('sha256', rahasia()).update(data).digest('base64url');
}

function buatTiket() {
  const data = Buffer.from(JSON.stringify({ exp: Date.now() + UMUR_SESI })).toString('base64url');
  return data + '.' + tandaTangan(data);
}

function tiketSah(tiket) {
  if (!tiket || typeof tiket !== 'string') return false;
  const titik = tiket.lastIndexOf('.');
  if (titik < 1) return false;
  const data = tiket.slice(0, titik);
  const ttd  = tiket.slice(titik + 1);
  if (!samaAman(ttd, tandaTangan(data))) return false;
  try {
    const isi = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    return typeof isi.exp === 'number' && isi.exp > Date.now();
  } catch (e) { return false; }
}

/* ── PEMBATAS PERCOBAAN ────────────────────────────────────────────────────
   Kotak SQL ada di balik pintu ini, jadi pintunya tidak boleh bisa digedor
   ribuan kali per menit. Hitungannya di memori: cukup untuk satu proses, dan
   kalau kelak jadi banyak proses, ini bagian pertama yang harus pindah ke
   basis data — ditulis di sini supaya tidak terlupa. */
const gagal = new Map();
const MAKS_GAGAL = 8;
const JEDA_MS    = 15 * 60 * 1000;

function bolehCoba(alamat) {
  const g = gagal.get(alamat);
  if (!g) return true;
  if (Date.now() - g.terakhir > JEDA_MS) { gagal.delete(alamat); return true; }
  return g.jumlah < MAKS_GAGAL;
}
function catatGagal(alamat) {
  const g = gagal.get(alamat) || { jumlah: 0, terakhir: 0 };
  g.jumlah += 1; g.terakhir = Date.now();
  gagal.set(alamat, g);
}
function bersihkanGagal(alamat) { gagal.delete(alamat); }

/* ── MIDDLEWARE ─────────────────────────────────────────────────────────── */
function bacaKue(req) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const bagian of raw.split(';')) {
    const i = bagian.indexOf('=');
    if (i === -1) continue;
    if (bagian.slice(0, i).trim() === NAMA_KUE) {
      return decodeURIComponent(bagian.slice(i + 1).trim());
    }
  }
  return null;
}

function sudahMasuk(req) { return tiketSah(bacaKue(req)); }

function wajibMasuk(req, res, next) {
  if (sudahMasuk(req)) return next();
  res.status(401).json({ galat: 'Belum masuk.' });
}

function pasangKue(res, tiket) {
  const aman = process.env.PAKAI_HTTPS === '1';
  res.setHeader('Set-Cookie',
    `${NAMA_KUE}=${encodeURIComponent(tiket)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(UMUR_SESI / 1000)}` +
    (aman ? '; Secure' : ''));
}
function hapusKue(res) {
  res.setHeader('Set-Cookie', `${NAMA_KUE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
}

module.exports = {
  sandiToko, samaAman, buatTiket, tiketSah, sudahMasuk, wajibMasuk,
  pasangKue, hapusKue, bolehCoba, catatGagal, bersihkanGagal, MAKS_GAGAL
};
