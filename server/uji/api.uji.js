'use strict';
/* Uji API ujung ke ujung terhadap Postgres sungguhan — bukan tiruan.
   Yang paling ingin dibuktikan di sini bukan "rutenya membalas 200", melainkan
   dua hal yang kalau salah baru ketahuan setelah uang berpindah tangan:
   transaksi yang batal harus batal SELURUHNYA, dan konsol SQL harus benar-benar
   tidak sanggup merusak bentuk basis data. */

const { test, before, after } = require('node:test');
const assert = require('node:assert');

process.env.DATABASE_URL   = process.env.DATABASE_URL_UJI || 'postgresql://postgres@/kasir_uji?host=/tmp&port=5433';
process.env.SANDI_TOKO     = 'sandi-uji-yang-panjang';
process.env.RAHASIA_SESI   = 'rahasia-uji';
process.env.PORT           = '0';

const { app } = require('../src/index');
const { siapkanDB, tutupDB, kolamApp } = require('../src/db');

let dasar, srv, kue = '';

async function panggil(jalur, opsi = {}) {
  const res = await fetch(dasar + jalur, {
    method: opsi.method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, kue ? { Cookie: kue } : {}, opsi.headers || {}),
    body: opsi.body ? JSON.stringify(opsi.body) : undefined
  });
  const set = res.headers.get('set-cookie');
  if (set) kue = set.split(';')[0];
  let isi = null;
  try { isi = await res.json(); } catch (e) { /* bukan json */ }
  return { status: res.status, isi };
}

before(async () => {
  await siapkanDB(true);
  await kolamApp.query('TRUNCATE transaksi, produk, jejak_sql, cadangan_otomatis RESTART IDENTITY CASCADE');
  await kolamApp.query("UPDATE toko SET nama='Toko Uji', alamat='Jl. Uji 1' WHERE id=1");
  await new Promise(r => { srv = app.listen(0, r); });
  dasar = 'http://127.0.0.1:' + srv.address().port;
});

after(async () => { srv && srv.close(); await tutupDB(); });

/* ── PELADEN MENOLAK SANDI YANG TIDAK LAYAK ───────────────────────────────
   Repositori ini publik, jadi nilai contoh di .env.contoh bisa dibaca siapa pun.
   Peladen yang menyala dengan nilai itu punya pintu yang sandinya tertulis di
   internet — dan tidak ada yang terlihat salah dari luar. */
test('peladen menolak sandi contoh dan sandi terlalu pendek', async () => {
  const auth = require('../src/auth');
  const asli = process.env.SANDI_TOKO;
  try {
    for (const buruk of ['ganti-jadi-sesuatu-yang-panjang', 'GANTI-SANDI-INI', 'password', 'admin']) {
      process.env.SANDI_TOKO = buruk;
      assert.throws(() => auth.sandiToko(), /nilai contoh|terlalu pendek/i, buruk);
    }
    process.env.SANDI_TOKO = 'pendek';
    assert.throws(() => auth.sandiToko(), /terlalu pendek/i);

    process.env.SANDI_TOKO = '';
    assert.throws(() => auth.sandiToko(), /belum disetel/i);

    process.env.SANDI_TOKO = 'sandi-yang-cukup-panjang-dan-bukan-contoh';
    assert.doesNotThrow(() => auth.sandiToko());
  } finally {
    process.env.SANDI_TOKO = asli;
  }
});

/* ── PINTU MASUK ──────────────────────────────────────────────────────────── */
test('tanpa masuk, data toko tertutup', async () => {
  const r = await panggil('/api/semua');
  assert.strictEqual(r.status, 401);
});

test('kata sandi salah ditolak', async () => {
  const r = await panggil('/api/masuk', { method: 'POST', body: { sandi: 'salah' } });
  assert.strictEqual(r.status, 401);
  kue = '';
});

test('kata sandi benar diterima', async () => {
  const r = await panggil('/api/masuk', { method: 'POST', body: { sandi: 'sandi-uji-yang-panjang' } });
  assert.strictEqual(r.status, 200);
  assert.ok(kue.startsWith('kasir_sesi='), 'kue sesi terpasang');
});

test('sesudah masuk, muatan awal terbaca', async () => {
  const r = await panggil('/api/semua');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.isi.toko.nama, 'Toko Uji');
  assert.ok(Array.isArray(r.isi.produk));
});

/* ── PRODUK ───────────────────────────────────────────────────────────────── */
let idBeras, idPupuk;
test('produk bisa ditambah', async () => {
  let r = await panggil('/api/produk', { method: 'POST', body: { nama: 'Beras 5 kg', kategori: 'Sembako', harga: 72500, stok: 10, ikon: '🍚' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.isi.harga, '72500.00', 'harga disimpan sebagai numeric, bukan float');
  idBeras = r.isi.id;

  r = await panggil('/api/produk', { method: 'POST', body: { nama: 'Pupuk NPK', kategori: 'Pertanian', harga: 18000, stok: '', ikon: '🌱' } });
  assert.strictEqual(r.isi.stok, null, 'stok kosong tersimpan sebagai NULL = tak dibatasi');
  idPupuk = r.isi.id;
});

test('produk tanpa nama ditolak', async () => {
  const r = await panggil('/api/produk', { method: 'POST', body: { nama: '   ', harga: 1000 } });
  assert.strictEqual(r.status, 400);
});

test('produk bisa diubah dan dihapus', async () => {
  let r = await panggil('/api/produk/' + idBeras, { method: 'PUT', body: { nama: 'Beras Premium 5 kg', kategori: 'Sembako', harga: 75000, stok: 10 } });
  assert.strictEqual(r.isi.nama, 'Beras Premium 5 kg');
  assert.strictEqual(r.isi.harga, '75000.00');

  r = await panggil('/api/produk', { method: 'POST', body: { nama: 'Buang Saya', harga: 1 } });
  const buang = r.isi.id;
  assert.strictEqual((await panggil('/api/produk/' + buang, { method: 'DELETE' })).status, 200);
  assert.strictEqual((await panggil('/api/produk/' + buang, { method: 'DELETE' })).status, 404);
});

/* ── TRANSAKSI ────────────────────────────────────────────────────────────── */
test('transaksi mengurangi stok dan menomori struk', async () => {
  const r = await panggil('/api/transaksi', { method: 'POST', body: {
    item: [{ produk_id: idBeras, jumlah: 2 }, { produk_id: idPupuk, jumlah: 3 }], bayar: 250000
  }});
  assert.strictEqual(r.status, 200);
  const t = r.isi.transaksi;
  assert.match(t.nomor, /^TRX-\d{8}-001$/, 'nomor struk terbentuk');
  assert.strictEqual(t.total, '204000.00', '75000*2 + 18000*3');
  assert.strictEqual(t.kembali, '46000.00');
  assert.strictEqual(t.toko_nama, 'Toko Uji', 'identitas toko ikut tersalin ke struk');

  const beras = r.isi.produk.find(p => p.id === idBeras);
  const pupuk = r.isi.produk.find(p => p.id === idPupuk);
  assert.strictEqual(beras.stok, 8, 'stok terbatas berkurang');
  assert.strictEqual(pupuk.stok, null, 'stok tak dibatasi tetap NULL');
});

test('nomor struk berurut dalam satu hari', async () => {
  const r = await panggil('/api/transaksi', { method: 'POST', body: { item: [{ produk_id: idPupuk, jumlah: 1 }], bayar: 20000 } });
  assert.match(r.isi.transaksi.nomor, /^TRX-\d{8}-002$/);
});

test('stok kurang membatalkan SELURUH transaksi, bukan sebagian', async () => {
  const sebelum = (await panggil('/api/semua')).isi;
  const berasSebelum = sebelum.produk.find(p => p.id === idBeras).stok;
  const jumlahTrxSebelum = sebelum.transaksi.length;

  // Pupuk (tak dibatasi) sengaja ditaruh DULU supaya sempat terproses sebelum
  // beras gagal — inilah yang membuktikan pembatalannya menyeluruh.
  const r = await panggil('/api/transaksi', { method: 'POST', body: {
    item: [{ produk_id: idPupuk, jumlah: 5 }, { produk_id: idBeras, jumlah: 999 }], bayar: 9999999
  }});
  assert.strictEqual(r.status, 409);
  assert.match(r.isi.galat, /Stok/);

  const sesudah = (await panggil('/api/semua')).isi;
  assert.strictEqual(sesudah.produk.find(p => p.id === idBeras).stok, berasSebelum, 'stok beras utuh');
  assert.strictEqual(sesudah.transaksi.length, jumlahTrxSebelum, 'tidak ada transaksi setengah jadi');
});

test('uang kurang ditolak', async () => {
  const r = await panggil('/api/transaksi', { method: 'POST', body: { item: [{ produk_id: idPupuk, jumlah: 1 }], bayar: 5 } });
  assert.strictEqual(r.status, 400);
});

test('keranjang kosong ditolak', async () => {
  assert.strictEqual((await panggil('/api/transaksi', { method: 'POST', body: { item: [], bayar: 0 } })).status, 400);
});

test('menghapus produk tidak menghapus riwayat penjualannya', async () => {
  const r = await panggil('/api/produk', { method: 'POST', body: { nama: 'Barang Sekali Jual', harga: 5000, stok: 5 } });
  const id = r.isi.id;
  await panggil('/api/transaksi', { method: 'POST', body: { item: [{ produk_id: id, jumlah: 1 }], bayar: 5000 } });
  await panggil('/api/produk/' + id, { method: 'DELETE' });

  const { rows } = await kolamApp.query("SELECT nama, produk_id FROM transaksi_item WHERE nama = 'Barang Sekali Jual'");
  assert.strictEqual(rows.length, 1, 'baris penjualannya masih ada');
  assert.strictEqual(rows[0].produk_id, null, 'kaitannya dilepas, bukan barisnya dihapus');
});

/* ── KONSOL SQL ───────────────────────────────────────────────────────────── */
test('mode baca menjalankan SELECT', async () => {
  const r = await panggil('/api/sql', { method: 'POST', body: { kueri: 'SELECT nama, harga FROM produk ORDER BY nama', mode: 'baca' } });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(r.isi.kolom, ['nama', 'harga']);
  assert.ok(r.isi.jumlahBaris >= 2);
});

test('mode baca menolak segala penulisan', async () => {
  for (const q of ['UPDATE produk SET harga = 1', 'DELETE FROM produk', 'INSERT INTO produk (nama,harga) VALUES (\'x\',1)']) {
    const r = await panggil('/api/sql', { method: 'POST', body: { kueri: q, mode: 'baca' } });
    assert.strictEqual(r.status, 400, q);
    assert.match(r.isi.galat, /read-only/i, q);
  }
});

test('mode coba melaporkan jumlah baris TANPA mengubah apa pun', async () => {
  const sebelum = (await kolamApp.query('SELECT nama, harga FROM produk ORDER BY nama')).rows;
  const r = await panggil('/api/sql', { method: 'POST', body: { kueri: 'UPDATE produk SET harga = 0', mode: 'coba' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.isi.jumlahBaris, sebelum.length, 'melaporkan semua baris akan terkena');
  assert.strictEqual(r.isi.dibatalkan, true);
  const sesudah = (await kolamApp.query('SELECT nama, harga FROM produk ORDER BY nama')).rows;
  assert.deepStrictEqual(sesudah, sebelum, 'harga tidak berubah sedikit pun');
});

test('mode jalan mengubah data dan menyisakan cadangan', async () => {
  const c0 = Number((await kolamApp.query('SELECT count(*) FROM cadangan_otomatis')).rows[0].count);
  const r = await panggil('/api/sql', { method: 'POST', body: {
    kueri: "UPDATE produk SET harga = harga + 1000 WHERE nama = 'Pupuk NPK'", mode: 'jalan' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.isi.jumlahBaris, 1);
  assert.strictEqual(r.isi.dibatalkan, false);

  const h = (await kolamApp.query("SELECT harga FROM produk WHERE nama='Pupuk NPK'")).rows[0].harga;
  assert.strictEqual(h, '19000.00');
  const c1 = Number((await kolamApp.query('SELECT count(*) FROM cadangan_otomatis')).rows[0].count);
  assert.strictEqual(c1, c0 + 1, 'cadangan diambil sebelum menulis');
});

test('konsol TIDAK BISA mengubah bentuk basis data, bahkan di mode jalan', async () => {
  for (const q of ['DROP TABLE produk', 'ALTER TABLE produk ADD COLUMN x int',
                   'CREATE TABLE jahat (a int)', 'TRUNCATE produk',
                   'DROP VIEW stok_menipis', 'CREATE INDEX ON produk (nama)']) {
    const r = await panggil('/api/sql', { method: 'POST', body: { kueri: q, mode: 'jalan' } });
    assert.strictEqual(r.status, 400, q + ' seharusnya ditolak');
  }
  const { rows } = await kolamApp.query("SELECT to_regclass('public.produk') AS ada");
  assert.ok(rows[0].ada, 'tabel produk masih berdiri');
});

test('konsol tidak bisa membaca atau menghapus jejaknya sendiri', async () => {
  for (const q of ['SELECT * FROM jejak_sql', 'DELETE FROM jejak_sql', 'DELETE FROM cadangan_otomatis']) {
    const r = await panggil('/api/sql', { method: 'POST', body: { kueri: q, mode: 'jalan' } });
    assert.strictEqual(r.status, 400, q);
    assert.match(r.isi.galat, /permission denied/i, q);
  }
});

test('dua perintah sekaligus ditolak, tapi titik koma dalam teks aman', async () => {
  let r = await panggil('/api/sql', { method: 'POST', body: { kueri: "SELECT 1; DROP TABLE produk", mode: 'jalan' } });
  assert.strictEqual(r.status, 400);
  assert.match(r.isi.galat, /satu perintah/i);

  r = await panggil('/api/sql', { method: 'POST', body: { kueri: "SELECT 'a;b' AS x", mode: 'baca' } });
  assert.strictEqual(r.status, 200, 'titik koma di dalam kutip bukan pemisah perintah');

  r = await panggil('/api/sql', { method: 'POST', body: { kueri: "SELECT 1 -- ; DROP TABLE produk", mode: 'baca' } });
  assert.strictEqual(r.status, 200, 'titik koma di dalam komentar juga bukan pemisah');
});

test('kueri lambat dihentikan batas waktu', async () => {
  const r = await panggil('/api/sql', { method: 'POST', body: { kueri: 'SELECT pg_sleep(30)', mode: 'baca' } });
  assert.strictEqual(r.status, 400);
  assert.match(r.isi.galat, /timeout|dibatalkan|canceling/i);
});

test('tampilan bantu bisa dipakai', async () => {
  for (const v of ['penjualan_harian', 'produk_terlaris', 'stok_menipis']) {
    const r = await panggil('/api/sql', { method: 'POST', body: { kueri: 'SELECT * FROM ' + v, mode: 'baca' } });
    assert.strictEqual(r.status, 200, v);
  }
});

test('jejak mencatat kueri berhasil maupun gagal', async () => {
  const r = await panggil('/api/sql/jejak?batas=100');
  assert.strictEqual(r.status, 200);
  assert.ok(r.isi.jejak.some(j => j.galat), 'kueri gagal ikut tercatat');
  assert.ok(r.isi.jejak.some(j => !j.galat), 'kueri berhasil ikut tercatat');
});

test('skema bisa dibaca untuk panel bantuan', async () => {
  const r = await panggil('/api/sql/skema');
  const nama = r.isi.skema.map(t => t.tabel);
  assert.ok(nama.includes('produk'));
  assert.ok(!nama.includes('jejak_sql'), 'tabel internal tidak diumumkan');
  const produk = r.isi.skema.find(t => t.tabel === 'produk');
  assert.ok(produk.kolom.some(k => k.nama === 'harga'));
});

/* ── CADANGAN ─────────────────────────────────────────────────────────────── */
test('cadangan berisi seluruh data toko', async () => {
  const r = await panggil('/api/cadangan');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.isi.v, 1);
  assert.strictEqual(r.isi.schema, 2);
  assert.ok(r.isi.produk.length >= 2);
  assert.ok(r.isi.transaksi.length >= 2);
  assert.ok(r.isi.transaksi_item.length >= 2);
});

test('cadangan otomatis bisa didaftar dan diunduh', async () => {
  const daftar = await panggil('/api/cadangan/otomatis');
  assert.ok(daftar.isi.cadangan.length >= 1);
  const satu = await panggil('/api/cadangan/otomatis/' + daftar.isi.cadangan[0].id);
  assert.strictEqual(satu.status, 200);
  assert.ok(Array.isArray(satu.isi.produk));
});

/* ── PINDAH DARI MODE LOKAL ───────────────────────────────────────────────
   Bentuk cadangan aplikasi lokal berbeda kata (products/trx/settings, id buatan
   sendiri yang bukan uuid). Inilah jalan satu-satunya memindahkan data toko yang
   selama ini cuma ada di satu HP, jadi harus terbukti bekerja apa adanya —
   tanpa menyuruh siapa pun menyunting JSON dengan tangan. */
test('cadangan bentuk LAMA (lokal) bisa dipulihkan ke peladen', async () => {
  const lama = {
    v: 1, schema: 2,
    settings: { store: 'Warung Lama', addr: 'Jl. Lama 9', note: 'terima kasih', currency: 'Rp', decimals: false },
    products: [
      { id: 'pabc123', name: 'Kopi Sachet', cat: 'Minuman', price: 12000, stock: 45, emoji: '☕' },
      { id: 'pdef456', name: 'Air Mineral', cat: 'Minuman', price: 3500, stock: '',  emoji: '💧' }
    ],
    trx: [
      { id: 't2', no: 'TRX-20250102-001', ts: Date.parse('2025-01-02T10:00:00Z'), lines: 1, qty: 2, total: 24000,
        pay: 25000, change: 1000, store: 'Warung Lama',
        items: [{ id: 'pabc123', name: 'Kopi Sachet', emoji: '☕', price: 12000, qty: 2, sub: 24000 }] },
      { id: 't1', no: 'TRX-20250101-001', ts: Date.parse('2025-01-01T10:00:00Z'), lines: 1, qty: 1, total: 3500,
        pay: 5000, change: 1500, store: 'Warung Lama',
        items: [{ id: 'pdef456', name: 'Air Mineral', emoji: '💧', price: 3500, qty: 1, sub: 3500 }] }
    ]
  };
  const r = await panggil('/api/pulihkan', { method: 'POST', body: lama });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.isi.produk, 2);
  assert.strictEqual(r.isi.transaksi, 2);

  const semua = (await panggil('/api/semua')).isi;
  assert.strictEqual(semua.toko.nama, 'Warung Lama');
  assert.strictEqual(semua.toko.dua_desimal, false, 'pengaturan angka ikut pindah');

  const kopi = semua.produk.find(p => p.nama === 'Kopi Sachet');
  const air  = semua.produk.find(p => p.nama === 'Air Mineral');
  assert.strictEqual(kopi.stok, 45);
  assert.strictEqual(air.stok, null, "stok '' jadi tak dibatasi");
  assert.strictEqual(kopi.harga, '12000.00');

  assert.strictEqual(semua.transaksi.length, 2);
  const t2 = semua.transaksi.find(t => t.nomor === 'TRX-20250102-001');
  assert.strictEqual(t2.item.length, 1);
  assert.strictEqual(t2.item[0].nama, 'Kopi Sachet');

  // Kaitan ke produk ditarik ulang lewat id lama, bukan diputus.
  const { rows } = await kolamApp.query(
    `SELECT i.produk_id, p.nama FROM transaksi_item i JOIN produk p ON p.id = i.produk_id
      WHERE i.nama = 'Kopi Sachet'`);
  assert.strictEqual(rows.length, 1, 'baris penjualan tersambung ke produk yang baru dibuat');
  assert.strictEqual(rows[0].nama, 'Kopi Sachet');
});

test('pulihkan menyisakan cadangan otomatis dari keadaan sebelumnya', async () => {
  const c0 = Number((await kolamApp.query('SELECT count(*) FROM cadangan_otomatis')).rows[0].count);
  await panggil('/api/pulihkan', { method: 'POST', body: { products: [{ name: 'Cuma Satu', price: 1000, stock: 1 }] } });
  const c1 = Number((await kolamApp.query('SELECT count(*) FROM cadangan_otomatis')).rows[0].count);
  assert.strictEqual(c1, c0 + 1);
  const isi = (await kolamApp.query('SELECT isi FROM cadangan_otomatis ORDER BY id DESC LIMIT 1')).rows[0].isi;
  assert.ok(isi.produk.some(p => p.nama === 'Kopi Sachet'), 'yang tercadang adalah keadaan SEBELUM dipulihkan');
});

test('cadangan tanpa daftar produk ditolak', async () => {
  const r = await panggil('/api/pulihkan', { method: 'POST', body: { sembarang: true } });
  assert.strictEqual(r.status, 400);
});

/* ── KELUAR ───────────────────────────────────────────────────────────────── */
test('keluar menutup kembali pintunya', async () => {
  await panggil('/api/keluar', { method: 'POST' });
  kue = '';
  assert.strictEqual((await panggil('/api/semua')).status, 401);
  assert.strictEqual((await panggil('/api/sql', { method: 'POST', body: { kueri: 'SELECT 1', mode: 'baca' } })).status, 401);
});
