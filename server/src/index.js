'use strict';
const path = require('path');
const express = require('express');
const { siapkanDB, tutupDB, kolamApp } = require('./db');
const auth = require('./auth');
const rute = require('./rute');

const PORT = Number(process.env.PORT || 3000);
const AKAR = path.join(__dirname, '..', '..');   // repositori: tempat index.html

const app = express();

/* Di balik reverse proxy (nginx, Caddy, Railway, Fly), req.ip tanpa ini akan
   selalu berisi alamat proxy-nya. Pembatas percobaan masuk lalu menghitung
   seluruh dunia sebagai satu pengunjung: delapan kesalahan dari siapa pun
   mengunci semua orang. */
app.set('trust proxy', Number(process.env.LAPIS_PROXY || 1));
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  /* 'unsafe-inline' terpaksa ada: seluruh gaya dan skrip aplikasi memang berada
     di dalam satu berkas HTML, dan itu justru syarat supaya berkas yang sama
     tetap bisa dibuka langsung tanpa peladen dan dibungkus jadi APK. Yang tetap
     dikunci adalah tujuan keluarnya — connect-src 'self' membuat data toko tidak
     bisa dikirim ke alamat lain walau ada skrip asing yang lolos masuk. */
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  next();
});

app.use(express.json({ limit: '2mb' }));
app.use('/api', rute);

/* Halaman aplikasinya sendiri. index.html disajikan tanpa singgahan supaya
   pemutakhiran berkas langsung terasa; sisanya boleh disinggahi. */
app.get('/', (req, res) => res.sendFile(path.join(AKAR, 'index.html'), { headers: { 'Cache-Control': 'no-store' } }));
app.use(express.static(AKAR, { index: false, dotfiles: 'deny', maxAge: '1h' }));

app.use((req, res) => res.status(404).json({ galat: 'Tidak ada.' }));

async function jalan() {
  auth.sandiToko();          // gagal cepat kalau SANDI_TOKO belum ada
  console.log('KASIR LUXE — peladen');
  await siapkanDB();
  const v = await kolamApp.query('SELECT current_database() AS db, version() AS v');
  console.log('  basis data:', v.rows[0].db);
  if (!process.env.RAHASIA_SESI) console.log('  ⚠ RAHASIA_SESI belum disetel — sesi akan hangus tiap peladen dimulai ulang.');
  if (!process.env.SANDI_PERAN_SQL) console.log('  ⚠ SANDI_PERAN_SQL belum disetel — jangan jalankan lebih dari satu proses.');

  const srv = app.listen(PORT, () => console.log(`  siap di http://localhost:${PORT}`));

  for (const isyarat of ['SIGINT', 'SIGTERM']) {
    process.on(isyarat, () => {
      console.log('\n  berhenti…');
      srv.close(async () => { await tutupDB(); process.exit(0); });
      setTimeout(() => process.exit(1), 5000).unref();
    });
  }
}

if (require.main === module) {
  jalan().catch(e => { console.error('GAGAL START:', e.message); process.exit(1); });
}

module.exports = { app, jalan };
