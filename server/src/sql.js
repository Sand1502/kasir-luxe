'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   KONSOL SQL
   Menjalankan kueri yang diketik pemilik toko dari menu Data.

   Tiga mode, dan pembagiannya bukan kenyamanan melainkan pengaman:

     baca   BEGIN ... SET TRANSACTION READ ONLY ... ROLLBACK
            Postgres sendiri yang menolak segala bentuk penulisan. Tidak perlu
            menebak apakah sebuah kueri "mengubah data" — mesinnya yang tahu.

     coba   BEGIN ... ROLLBACK
            Kueri tulis dijalankan sungguhan lalu DIBATALKAN, dan yang
            dilaporkan cuma jumlah baris yang akan terkena. Inilah jawaban atas
            kesalahan paling mahal di kotak seperti ini: UPDATE tanpa WHERE.
            Angkanya kelihatan sebelum apa pun berubah.

     jalan  cadangan dulu, BEGIN ... COMMIT
            Baru di sini data berubah, dan cuma sesudah pemakai melihat angka
            dari mode coba.

   Yang menahan DROP/ALTER/CREATE bukan berkas ini, melainkan hak akses peran
   kasir_sql di migrasi/002_peran.sql. Pemeriksaan teks di bawah cuma lapis
   kedua untuk pesan galat yang lebih enak dibaca — kalau dia bocor, peran
   basis datanya tetap menolak.
   ══════════════════════════════════════════════════════════════════════════ */

const { kolamApp, ambilKolamSQL } = require('./db');

const MAKS_BARIS   = Number(process.env.SQL_MAKS_BARIS   || 500);
const BATAS_WAKTU  = Number(process.env.SQL_BATAS_WAKTU  || 5000);   // milidetik
const SIMPAN_CADANGAN = Number(process.env.SQL_SIMPAN_CADANGAN || 20);

/* Membuang komentar, teks dalam kutip, dan kutip-dolar, supaya titik koma yang
   tersisa benar-benar pemisah pernyataan — bukan titik koma di dalam sebuah
   nama barang. Sengaja sederhana: ini bukan pengurai SQL, dan tidak berpura-pura
   jadi pengurai SQL. Tugasnya cuma menangkap "; " yang jelas-jelas memisahkan
   dua perintah, supaya angka dari mode coba tidak menghitung perintah yang
   salah. Perlindungan sungguhannya ada di hak akses peran. */
function telanjangi(sql) {
  return String(sql)
    .replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1?\$/g, ' ')  // $$ ... $$ / $tag$ ... $tag$
    .replace(/'(?:[^']|'')*'/g, "''")                      // 'teks'
    .replace(/"(?:[^"]|"")*"/g, '""')                      // "nama kolom"
    .replace(/--[^\n]*/g, ' ')                             // -- komentar
    .replace(/\/\*[\s\S]*?\*\//g, ' ');                    // /* komentar */
}

function satuPernyataan(sql) {
  const bersih = telanjangi(sql).trim().replace(/;\s*$/, '');
  return bersih.indexOf(';') === -1;
}

/* Tebakan kasar apakah kueri ini membaca saja. Dipakai HANYA untuk memilih mode
   bawaan di antarmuka — bukan untuk memutuskan boleh atau tidak. Yang memutuskan
   tetap READ ONLY milik Postgres. */
function sepertinyaBaca(sql) {
  return /^\s*(select|with|table|show|explain)\b/i.test(telanjangi(sql).trim());
}

async function catatJejak(kueri, mode, baris, galat, alamat) {
  /* Lewat kolam aplikasi, bukan kolam konsol: peran kasir_sql memang tidak
     diberi hak ke tabel ini, supaya kueri dari kotak Data tidak bisa menghapus
     catatan tentang dirinya sendiri. */
  try {
    await kolamApp.query(
      'INSERT INTO jejak_sql (kueri, mode, baris, galat, alamat) VALUES ($1,$2,$3,$4,$5)',
      [String(kueri).slice(0, 20000), mode, baris, galat ? String(galat).slice(0, 2000) : null, alamat || null]
    );
  } catch (e) {
    console.error('jejak_sql gagal dicatat:', e.message);   // jangan sampai menggagalkan kuerinya
  }
}

/* Salinan seluruh data toko, diambil tepat sebelum kueri tulis dijalankan
   sungguhan. Untuk warung dengan ribuan baris ini murah; kalau datanya kelak
   jadi jauh lebih besar, inilah bagian pertama yang harus diganti dengan
   pg_dump terjadwal. */
async function cadangkan(sebab) {
  await kolamApp.query(
    `INSERT INTO cadangan_otomatis (sebab, isi) VALUES ($1, jsonb_build_object(
        'toko',            (SELECT jsonb_agg(t) FROM toko t),
        'produk',          (SELECT jsonb_agg(p) FROM produk p),
        'transaksi',       (SELECT jsonb_agg(x) FROM transaksi x),
        'transaksi_item',  (SELECT jsonb_agg(i) FROM transaksi_item i)
     ))`,
    [String(sebab).slice(0, 500)]
  );
  await kolamApp.query(
    `DELETE FROM cadangan_otomatis WHERE id NOT IN (
       SELECT id FROM cadangan_otomatis ORDER BY waktu DESC, id DESC LIMIT $1)`,
    [SIMPAN_CADANGAN]
  );
}

async function jalankan(kueri, mode, alamat) {
  kueri = String(kueri == null ? '' : kueri).trim();

  if (!kueri)                    return { ok: false, galat: 'Kueri masih kosong.' };
  if (kueri.length > 100000)     return { ok: false, galat: 'Kueri terlalu panjang (maksimal 100.000 karakter).' };
  if (!['baca', 'coba', 'jalan'].includes(mode)) return { ok: false, galat: 'Mode tidak dikenal.' };
  if (!satuPernyataan(kueri)) {
    const g = 'Jalankan satu perintah saja. Titik koma di tengah membuat angka pratinjau menghitung perintah yang salah.';
    await catatJejak(kueri, mode, null, g, alamat);
    return { ok: false, galat: g };
  }

  if (mode === 'jalan') {
    try { await cadangkan('sebelum kueri: ' + kueri.slice(0, 200)); }
    catch (e) {
      // Menolak menulis kalau cadangannya gagal: seluruh alasan mode ini aman
      // bertumpu pada adanya jalan pulang.
      const g = 'Cadangan otomatis gagal dibuat, jadi kueri tidak dijalankan: ' + e.message;
      await catatJejak(kueri, mode, null, g, alamat);
      return { ok: false, galat: g };
    }
  }

  const klien = await ambilKolamSQL().connect();
  const mulai = Date.now();
  try {
    await klien.query('BEGIN');
    await klien.query(`SET LOCAL statement_timeout = ${Number(BATAS_WAKTU) | 0}`);
    if (mode === 'baca') await klien.query('SET TRANSACTION READ ONLY');

    const res = await klien.query({ text: kueri, rowMode: 'array' });

    // Kueri gabungan (mis. beberapa pernyataan) mengembalikan larik hasil;
    // yang ditampilkan hasil terakhir, sama seperti perilaku psql.
    const r = Array.isArray(res) ? res[res.length - 1] : res;

    const kolom  = (r.fields || []).map(f => f.name);
    const semua  = r.rows || [];
    const baris  = semua.slice(0, MAKS_BARIS);
    const jumlah = (r.rowCount == null) ? semua.length : r.rowCount;

    if (mode === 'jalan') await klien.query('COMMIT');
    else                  await klien.query('ROLLBACK');

    const ms = Date.now() - mulai;
    await catatJejak(kueri, mode, jumlah, null, alamat);

    return {
      ok: true,
      mode,
      kolom,
      baris,
      jumlahBaris: jumlah,
      terpotong: semua.length > baris.length,
      ms,
      perintah: r.command || null,
      /* Di mode coba semuanya sudah dibatalkan — ini yang membuat angka di atas
         aman dilihat dulu sebelum diputuskan. */
      dibatalkan: mode !== 'jalan'
    };
  } catch (e) {
    await klien.query('ROLLBACK').catch(() => {});
    await catatJejak(kueri, mode, null, e.message, alamat);
    return { ok: false, galat: e.message, kode: e.code || null, ms: Date.now() - mulai };
  } finally {
    klien.release();
  }
}

/* Daftar tabel dan kolom, untuk panel bantuan di antarmuka. Orang tidak bisa
   menulis SQL untuk basis data yang bentuknya tidak dia lihat. */
async function skema() {
  const { rows } = await kolamApp.query(`
    SELECT c.relname AS tabel,
           CASE c.relkind WHEN 'v' THEN 'tampilan' ELSE 'tabel' END AS jenis,
           jsonb_agg(jsonb_build_object(
             'nama', a.attname,
             'tipe', format_type(a.atttypid, a.atttypmod),
             'wajib', a.attnotnull
           ) ORDER BY a.attnum) AS kolom
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r','v')
       AND c.relname NOT IN ('migrasi','jejak_sql','cadangan_otomatis')
     GROUP BY c.relname, c.relkind
     ORDER BY c.relkind, c.relname`);
  return rows;
}

async function jejak(batas) {
  const { rows } = await kolamApp.query(
    'SELECT id, waktu, kueri, mode, baris, galat FROM jejak_sql ORDER BY waktu DESC, id DESC LIMIT $1',
    [Math.min(Number(batas) || 50, 200)]
  );
  return rows;
}

module.exports = { jalankan, skema, jejak, cadangkan, sepertinyaBaca, satuPernyataan, telanjangi, MAKS_BARIS };
