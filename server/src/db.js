'use strict';
/* Sambungan basis data, pelari migrasi, dan penyiapan peran terbatas. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const { parse: uraiURL } = require('pg-connection-string');

const DIR_MIGRASI = path.join(__dirname, '..', 'migrasi');

function urlDB() {
  const u = process.env.DATABASE_URL;
  if (!u) throw new Error('DATABASE_URL belum disetel. Lihat server/.env.contoh.');
  return u;
}

/* Kolam aplikasi: dipakai semua rute biasa (produk, transaksi, pengaturan).
   Perannya pemilik tabel, jadi boleh apa saja — termasuk menjalankan migrasi. */
const kolamApp = new Pool({
  connectionString: urlDB(),
  max: Number(process.env.KOLAM_MAKS || 10),
  idle_in_transaction_session_timeout: 10000
});

/* Kolam konsol SQL: peran kasir_sql, yang TIDAK memiliki satu tabel pun dan
   karena itu tidak bisa menjatuhkan atau mengubah bentuknya. Sengaja sambungan
   terpisah, bukan SET ROLE dari kolam di atas — lihat migrasi/002_peran.sql. */
let kolamSQL = null;

/* Kata sandi peran konsol. Kalau tidak disetel di lingkungan, dibuat acak tiap
   boot: hanya proses ini yang tahu, dan tidak ada rahasia yang perlu diurus
   waktu mencoba di komputer sendiri. Di server dengan lebih dari satu proses,
   SANDI_PERAN_SQL WAJIB disetel — kalau tidak, proses yang boot belakangan
   mengganti sandinya dan kolam milik proses lain gagal menyambung ulang. Gagalnya
   pun baru terasa berjam-jam kemudian, waktu sambungan lamanya kedaluwarsa. */
function sandiPeranSQL() {
  return process.env.SANDI_PERAN_SQL || sandiPeranSQL._acak ||
        (sandiPeranSQL._acak = crypto.randomBytes(24).toString('hex'));
}

async function siapkanPeranSQL() {
  const sandi = sandiPeranSQL();

  /* ALTER ROLE tidak menerima parameter terikat, jadi sandinya mau tidak mau
     harus ikut sebagai teks di dalam perintah. Pelolosan karakternya diminta
     ke Postgres lewat quote_literal, bukan ditulis sendiri di sini: aturan
     pelolosan berubah mengikuti setelan standard_conforming_strings, dan
     menebaknya salah pada perintah yang memasang kata sandi adalah cara paling
     sunyi untuk memasang sandi yang bukan sandi yang kita kira. Satu perjalanan
     bolak-balik tambahan, sekali waktu boot — murah untuk keraguan yang hilang. */
  const { rows } = await kolamApp.query('SELECT quote_literal($1::text) AS lit', [sandi]);
  await kolamApp.query(`ALTER ROLE kasir_sql LOGIN PASSWORD ${rows[0].lit}`);

  /* Sambungan konsol dibangun dari hasil urai DATABASE_URL memakai pengurai
     milik pg sendiri, lalu penggunanya ditukar. Bukan dengan menyunting teks
     URL-nya: bentuk sambungan lewat soket Unix (host=/var/run/postgresql)
     bukan URL yang sah menurut WHATWG, jadi menyuntingnya lewat new URL akan
     jalan mulus di laptop yang memakai TCP lalu meledak di server yang memakai
     soket — tempat kesalahannya paling mahal ditemukan. */
  const cfg = uraiURL(urlDB());
  if (kolamSQL) await kolamSQL.end().catch(() => {});
  kolamSQL = new Pool(Object.assign({}, cfg, {
    user: 'kasir_sql',
    password: sandi,
    max: Number(process.env.KOLAM_SQL_MAKS || 3),
    idle_in_transaction_session_timeout: 5000
  }));
  return kolamSQL;
}

function ambilKolamSQL() {
  if (!kolamSQL) throw new Error('Kolam SQL belum disiapkan — panggil siapkanDB() dulu.');
  return kolamSQL;
}

/* ── MIGRASI ──────────────────────────────────────────────────────────────
   Berkas dijalankan sekali, urut nama, masing-masing di dalam satu transaksi.
   Sidik jarinya disimpan: berkas yang sudah terpakai lalu disunting akan
   ditolak, bukan didiamkan. Migrasi yang berubah isinya sesudah dijalankan
   berarti bentuk basis data di dua tempat sudah tidak sama, dan itu tidak akan
   pernah ketahuan sendiri — sampai ada kueri yang gagal di satu server saja,
   berbulan-bulan kemudian, dengan pesan yang tidak menyinggung migrasi. */
async function jalankanMigrasi(diam) {
  const catat = diam ? () => {} : (...a) => console.log(...a);

  await kolamApp.query(`
    CREATE TABLE IF NOT EXISTS migrasi (
      berkas      text PRIMARY KEY,
      sidik       text        NOT NULL,
      dijalankan  timestamptz NOT NULL DEFAULT now()
    )`);

  const sudah = new Map(
    (await kolamApp.query('SELECT berkas, sidik FROM migrasi')).rows.map(r => [r.berkas, r.sidik])
  );

  const berkas = fs.readdirSync(DIR_MIGRASI).filter(f => f.endsWith('.sql')).sort();
  let baru = 0;

  for (const f of berkas) {
    const isi = fs.readFileSync(path.join(DIR_MIGRASI, f), 'utf8');
    const sidik = crypto.createHash('sha256').update(isi).digest('hex');

    if (sudah.has(f)) {
      if (sudah.get(f) !== sidik) {
        throw new Error(
          `Migrasi "${f}" sudah pernah dijalankan tapi isinya berubah.\n` +
          `  tersimpan : ${sudah.get(f).slice(0, 16)}…\n` +
          `  sekarang  : ${sidik.slice(0, 16)}…\n` +
          `  Migrasi yang sudah jalan tidak boleh disunting. Buat berkas baru.`
        );
      }
      continue;
    }

    const klien = await kolamApp.connect();
    try {
      await klien.query('BEGIN');
      await klien.query(isi);
      await klien.query('INSERT INTO migrasi (berkas, sidik) VALUES ($1, $2)', [f, sidik]);
      await klien.query('COMMIT');
      catat('  migrasi ✓', f);
      baru++;
    } catch (e) {
      await klien.query('ROLLBACK').catch(() => {});
      throw new Error(`Migrasi "${f}" gagal: ${e.message}`);
    } finally {
      klien.release();
    }
  }
  if (!baru) catat('  migrasi — tidak ada yang baru');
  return baru;
}

/* Menjalankan fn di dalam satu transaksi; batal otomatis kalau melempar. */
async function transaksi(fn) {
  const klien = await kolamApp.connect();
  try {
    await klien.query('BEGIN');
    const hasil = await fn(klien);
    await klien.query('COMMIT');
    return hasil;
  } catch (e) {
    await klien.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    klien.release();
  }
}

async function siapkanDB(diam) {
  await jalankanMigrasi(diam);
  await siapkanPeranSQL();
}

async function tutupDB() {
  await Promise.all([
    kolamApp.end().catch(() => {}),
    kolamSQL ? kolamSQL.end().catch(() => {}) : Promise.resolve()
  ]);
}

module.exports = {
  kolamApp, ambilKolamSQL, siapkanDB, jalankanMigrasi, siapkanPeranSQL, transaksi, tutupDB
};
