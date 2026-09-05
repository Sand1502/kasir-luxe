'use strict';
const express = require('express');
const { kolamApp, transaksi } = require('./db');
const sqlKonsol = require('./sql');
const auth = require('./auth');

const r = express.Router();

/* Kunci penasihat untuk penomoran struk. Angkanya sembarang, yang penting sama
   di seluruh proses. */
const KUNCI_NOMOR = 728411;

const angka  = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const bulat  = v => Math.max(0, Math.round(angka(v)));
const teks   = (v, n) => String(v == null ? '' : v).slice(0, n || 200);

function tangani(fn) {
  return (req, res) => fn(req, res).catch(e => {
    console.error(req.method, req.path, '→', e.message);
    /* Pesan galat basis data tidak diteruskan mentah-mentah ke luar: isinya bisa
       menyebut nama tabel, batasan, bahkan potongan data. Kecuali di rute SQL,
       yang memang gunanya menampilkan pesan asli. */
    res.status(500).json({ galat: 'Gagal memproses permintaan.' });
  });
}

/* ── MASUK / KELUAR ───────────────────────────────────────────────────────── */
r.post('/masuk', tangani(async (req, res) => {
  const alamat = req.ip || 'entah';
  if (!auth.bolehCoba(alamat)) {
    return res.status(429).json({ galat: `Terlalu banyak percobaan. Tunggu 15 menit.` });
  }
  if (!auth.samaAman(String(req.body && req.body.sandi || ''), auth.sandiToko())) {
    auth.catatGagal(alamat);
    return res.status(401).json({ galat: 'Kata sandi salah.' });
  }
  auth.bersihkanGagal(alamat);
  auth.pasangKue(res, auth.buatTiket());
  res.json({ ok: true });
}));

r.post('/keluar', (req, res) => { auth.hapusKue(res); res.json({ ok: true }); });

r.get('/keadaan', tangani(async (req, res) => {
  if (!auth.sudahMasuk(req)) return res.json({ masuk: false });
  const toko = (await kolamApp.query('SELECT * FROM toko WHERE id = 1')).rows[0];
  res.json({ masuk: true, toko });
}));

/* Semua rute di bawah ini wajib sudah masuk. */
r.use(auth.wajibMasuk);

/* ── MUATAN AWAL ──────────────────────────────────────────────────────────── */
/* Satu permintaan untuk seluruh keadaan awal. Tiga permintaan terpisah di
   pembukaan aplikasi berarti tiga kali waktu tempuh jaringan sebelum kasir bisa
   mengetuk apa pun — terasa sekali di sinyal seluler yang lambat. */
r.get('/semua', tangani(async (req, res) => {
  const [toko, produk, trx] = await Promise.all([
    kolamApp.query('SELECT * FROM toko WHERE id = 1'),
    kolamApp.query('SELECT * FROM produk ORDER BY dibuat DESC'),
    kolamApp.query(`
      SELECT x.*, COALESCE(jsonb_agg(jsonb_build_object(
               'nama', i.nama, 'ikon', i.ikon, 'harga', i.harga,
               'jumlah', i.jumlah, 'subtotal', i.subtotal
             ) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]') AS item
        FROM transaksi x
        LEFT JOIN transaksi_item i ON i.transaksi_id = x.id
       GROUP BY x.id
       ORDER BY x.waktu DESC
       LIMIT 500`)
  ]);
  res.json({ toko: toko.rows[0], produk: produk.rows, transaksi: trx.rows });
}));

/* ── PRODUK ───────────────────────────────────────────────────────────────── */
r.post('/produk', tangani(async (req, res) => {
  const b = req.body || {};
  const nama = teks(b.nama).trim();
  if (!nama) return res.status(400).json({ galat: 'Nama barang wajib diisi.' });
  const { rows } = await kolamApp.query(
    `INSERT INTO produk (nama, kategori, harga, stok, ikon) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [nama, teks(b.kategori).trim() || 'Lainnya', angka(b.harga),
     b.stok == null || b.stok === '' ? null : bulat(b.stok), teks(b.ikon, 8)]
  );
  res.json(rows[0]);
}));

r.put('/produk/:id', tangani(async (req, res) => {
  const b = req.body || {};
  const nama = teks(b.nama).trim();
  if (!nama) return res.status(400).json({ galat: 'Nama barang wajib diisi.' });
  const { rows } = await kolamApp.query(
    `UPDATE produk SET nama=$2, kategori=$3, harga=$4, stok=$5, ikon=$6, diperbarui=now()
      WHERE id=$1 RETURNING *`,
    [req.params.id, nama, teks(b.kategori).trim() || 'Lainnya', angka(b.harga),
     b.stok == null || b.stok === '' ? null : bulat(b.stok), teks(b.ikon, 8)]
  );
  if (!rows[0]) return res.status(404).json({ galat: 'Produk tidak ditemukan.' });
  res.json(rows[0]);
}));

r.delete('/produk/:id', tangani(async (req, res) => {
  const { rowCount } = await kolamApp.query('DELETE FROM produk WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ galat: 'Produk tidak ditemukan.' });
  res.json({ ok: true });
}));

/* Memuat contoh produk. Dipakai tombol "Contoh" di menu Produk. */
r.post('/produk/contoh', tangani(async (req, res) => {
  const daftar = Array.isArray(req.body && req.body.daftar) ? req.body.daftar.slice(0, 200) : [];
  if (!daftar.length) return res.status(400).json({ galat: 'Daftar contoh kosong.' });
  const hasil = await transaksi(async k => {
    const out = [];
    for (const p of daftar) {
      const nama = teks(p.nama).trim();
      if (!nama) continue;
      const { rows } = await k.query(
        `INSERT INTO produk (nama, kategori, harga, stok, ikon) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [nama, teks(p.kategori).trim() || 'Lainnya', angka(p.harga),
         p.stok == null || p.stok === '' ? null : bulat(p.stok), teks(p.ikon, 8)]
      );
      out.push(rows[0]);
    }
    return out;
  });
  res.json({ produk: hasil });
}));

/* ── TRANSAKSI ────────────────────────────────────────────────────────────── */
/* Satu transaksi basis data untuk tiga hal yang tidak boleh terpisah: catatan
   penjualan, rincian barangnya, dan pengurangan stok. Kalau stok satu barang
   ternyata sudah habis diambil kasir lain sedetik lalu, SELURUHNYA batal —
   bukan tercatat setengah, yang justru lebih sulit dibereskan daripada gagal. */
r.post('/transaksi', tangani(async (req, res) => {
  const b = req.body || {};
  const item = Array.isArray(b.item) ? b.item : [];
  if (!item.length) return res.status(400).json({ galat: 'Keranjang kosong.' });
  if (item.length > 500) return res.status(400).json({ galat: 'Terlalu banyak jenis barang.' });

  let keluar;
  try {
    keluar = await transaksi(async k => {
      await k.query('SELECT pg_advisory_xact_lock($1)', [KUNCI_NOMOR]);

      const toko = (await k.query('SELECT * FROM toko WHERE id = 1')).rows[0];

      let jenis = 0, pcs = 0, total = 0;
      const siap = [];
      for (const it of item) {
        const jumlah = bulat(it.jumlah);
        if (jumlah <= 0) continue;
        const p = (await k.query('SELECT * FROM produk WHERE id = $1', [it.produk_id])).rows[0];
        if (!p) { const e = new Error('Produk sudah tidak ada: ' + teks(it.nama)); e.pakai = 409; throw e; }

        // Kurangi stok dan periksa kecukupannya dalam satu perintah: memeriksa
        // dulu lalu mengurangi belakangan membuka celah waktu di antaranya.
        const upd = await k.query(
          `UPDATE produk SET stok = stok - $2, diperbarui = now()
            WHERE id = $1 AND (stok IS NULL OR stok >= $2) RETURNING stok`,
          [p.id, jumlah]
        );
        if (!upd.rowCount) {
          const e = new Error(`Stok "${p.nama}" tinggal ${p.stok} pcs.`); e.pakai = 409; throw e;
        }

        const harga = Number(p.harga);
        const sub = Math.round(harga * jumlah * 100) / 100;
        jenis += 1; pcs += jumlah; total += sub;
        siap.push({ produk_id: p.id, nama: p.nama, ikon: p.ikon, harga, jumlah, subtotal: sub });
      }
      if (!siap.length) { const e = new Error('Tidak ada barang yang sah.'); e.pakai = 400; throw e; }

      total = Math.round(total * 100) / 100;
      const bayar = Math.round(angka(b.bayar) * 100) / 100;
      if (bayar < total) { const e = new Error('Uang pembeli kurang dari total.'); e.pakai = 400; throw e; }

      const nomor = (await k.query(
        `SELECT 'TRX-' || to_char(now(),'YYYYMMDD') || '-' ||
                lpad((count(*)+1)::text, 3, '0') AS n
           FROM transaksi WHERE waktu >= date_trunc('day', now())`
      )).rows[0].n;

      const trx = (await k.query(
        `INSERT INTO transaksi (nomor, jenis_item, total_pcs, total, bayar, kembali,
                                toko_nama, toko_alamat, toko_catatan, mata_uang, dua_desimal)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [nomor, jenis, pcs, total, bayar, Math.round((bayar - total) * 100) / 100,
         toko.nama, toko.alamat, toko.catatan_struk, toko.mata_uang, toko.dua_desimal]
      )).rows[0];

      for (const s of siap) {
        await k.query(
          `INSERT INTO transaksi_item (transaksi_id, produk_id, nama, ikon, harga, jumlah, subtotal)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [trx.id, s.produk_id, s.nama, s.ikon, s.harga, s.jumlah, s.subtotal]
        );
      }
      trx.item = siap;
      return trx;
    });
  } catch (e) {
    if (e.pakai) return res.status(e.pakai).json({ galat: e.message });
    throw e;
  }

  const produk = (await kolamApp.query('SELECT * FROM produk ORDER BY dibuat DESC')).rows;
  res.json({ transaksi: keluar, produk });
}));

r.delete('/transaksi/:id', tangani(async (req, res) => {
  const { rowCount } = await kolamApp.query('DELETE FROM transaksi WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ galat: 'Transaksi tidak ditemukan.' });
  res.json({ ok: true });
}));

/* ── TOKO ─────────────────────────────────────────────────────────────────── */
r.put('/toko', tangani(async (req, res) => {
  const b = req.body || {};
  const { rows } = await kolamApp.query(
    `UPDATE toko SET nama=COALESCE($1,nama), alamat=COALESCE($2,alamat),
            catatan_struk=COALESCE($3,catatan_struk), mata_uang=COALESCE($4,mata_uang),
            dua_desimal=COALESCE($5,dua_desimal), tema=COALESCE($6,tema), diperbarui=now()
      WHERE id=1 RETURNING *`,
    [b.nama == null ? null : teks(b.nama), b.alamat == null ? null : teks(b.alamat),
     b.catatan_struk == null ? null : teks(b.catatan_struk, 500),
     b.mata_uang == null ? null : teks(b.mata_uang, 6),
     typeof b.dua_desimal === 'boolean' ? b.dua_desimal : null,
     b.tema === 'dark' || b.tema === 'light' ? b.tema : null]
  );
  res.json(rows[0]);
}));

/* ── KONSOL SQL ───────────────────────────────────────────────────────────── */
r.post('/sql', tangani(async (req, res) => {
  const b = req.body || {};
  const hasil = await sqlKonsol.jalankan(b.kueri, b.mode || 'baca', req.ip);
  res.status(hasil.ok ? 200 : 400).json(hasil);
}));

r.get('/sql/skema', tangani(async (req, res) => res.json({ skema: await sqlKonsol.skema() })));
r.get('/sql/jejak', tangani(async (req, res) => res.json({ jejak: await sqlKonsol.jejak(req.query.batas) })));

/* ── CADANGAN ─────────────────────────────────────────────────────────────── */
r.get('/cadangan', tangani(async (req, res) => {
  const { rows } = await kolamApp.query(`
    SELECT jsonb_build_object(
      'v', 1, 'schema', 2, 'sumber', 'server', 'saved', now(),
      'toko',           (SELECT to_jsonb(t) FROM toko t WHERE id = 1),
      'produk',         (SELECT COALESCE(jsonb_agg(p), '[]') FROM produk p),
      'transaksi',      (SELECT COALESCE(jsonb_agg(x), '[]') FROM transaksi x),
      'transaksi_item', (SELECT COALESCE(jsonb_agg(i), '[]') FROM transaksi_item i)
    ) AS isi`);
  res.json(rows[0].isi);
}));

/* Memulihkan seluruh isi toko dari berkas cadangan. Inilah jalan pindah dari
   mode lokal ke mode server: data yang selama ini cuma ada di localStorage satu
   HP ditempelkan ke basis data, sekali, lalu seterusnya dipakai bersama.

   Menerima dua bentuk sekaligus — cadangan lama dari aplikasi lokal
   (products/trx/settings, berbahasa Inggris) dan cadangan dari peladen ini
   sendiri. Memaksa orang mengubah berkasnya dulu berarti memaksa mereka
   menyunting JSON dengan tangan di HP, dan di situlah datanya benar-benar
   hilang. */
r.post('/pulihkan', tangani(async (req, res) => {
  const d = req.body || {};
  const produkMasuk = Array.isArray(d.produk) ? d.produk : (Array.isArray(d.products) ? d.products : null);
  if (!produkMasuk) return res.status(400).json({ galat: 'Isi cadangan tidak sesuai — daftar produk tidak ditemukan.' });

  await sqlKonsol.cadangkan('sebelum pulihkan dari berkas');

  const hasil = await transaksi(async k => {
    await k.query('DELETE FROM transaksi');   // transaksi_item ikut lewat CASCADE
    await k.query('DELETE FROM produk');

    /* Peta id lama → id baru. Cadangan lokal memakai id buatan sendiri ("p7f3x")
       yang bukan uuid, jadi id-nya dibuat ulang di sini; kaitan ke baris
       penjualan lama ditarik lewat peta ini supaya tidak putus. */
    const peta = new Map();
    for (const p of produkMasuk.slice(0, 5000)) {
      const nama = teks(p.nama != null ? p.nama : p.name).trim();
      if (!nama) continue;
      const stokAsal = (p.stok !== undefined) ? p.stok : p.stock;
      const { rows } = await k.query(
        `INSERT INTO produk (nama, kategori, harga, stok, ikon) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [nama,
         teks(p.kategori != null ? p.kategori : p.cat).trim() || 'Lainnya',
         angka(p.harga != null ? p.harga : p.price),
         (stokAsal == null || stokAsal === '') ? null : bulat(stokAsal),
         teks(p.ikon != null ? p.ikon : p.emoji, 8)]
      );
      if (p.id) peta.set(String(p.id), rows[0].id);
    }

    const toko = d.toko || d.settings || {};
    await k.query(
      `UPDATE toko SET nama=$1, alamat=$2, catatan_struk=$3, mata_uang=$4, dua_desimal=$5, diperbarui=now() WHERE id=1`,
      [teks(toko.nama != null ? toko.nama : toko.store) || 'Toko',
       teks(toko.alamat != null ? toko.alamat : toko.addr),
       teks(toko.catatan_struk != null ? toko.catatan_struk : toko.note, 500),
       teks(toko.mata_uang != null ? toko.mata_uang : toko.currency, 6) || 'Rp',
       typeof (toko.dua_desimal != null ? toko.dua_desimal : toko.decimals) === 'boolean'
         ? (toko.dua_desimal != null ? toko.dua_desimal : toko.decimals) : true]
    );

    const trxMasuk = Array.isArray(d.transaksi) ? d.transaksi : (Array.isArray(d.trx) ? d.trx : []);
    /* Dibalik dulu: cadangan menyimpan yang terbaru di depan, sementara nomor
       struk harus tetap urut naik menurut waktu. */
    let jumlahTrx = 0;
    for (const t of trxMasuk.slice(0, 5000).reverse()) {
      const waktu = t.waktu || (t.ts ? new Date(Number(t.ts)).toISOString() : new Date().toISOString());
      const nomor = teks(t.nomor != null ? t.nomor : t.no, 40) || ('TRX-PULIH-' + (jumlahTrx + 1));
      const total = angka(t.total);
      const bayar = Math.max(angka(t.bayar != null ? t.bayar : t.pay), total);
      const item  = Array.isArray(t.item) ? t.item : (Array.isArray(t.items) ? t.items : []);

      let baris;
      try {
        baris = (await k.query(
          `INSERT INTO transaksi (nomor, waktu, jenis_item, total_pcs, total, bayar, kembali,
                                  toko_nama, toko_alamat, toko_catatan, mata_uang, dua_desimal)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
          [nomor, waktu,
           bulat(t.jenis_item != null ? t.jenis_item : (t.lines != null ? t.lines : item.length)),
           bulat(t.total_pcs != null ? t.total_pcs : t.qty),
           total, bayar, Math.round((bayar - total) * 100) / 100,
           teks(t.toko_nama != null ? t.toko_nama : t.store),
           teks(t.toko_alamat != null ? t.toko_alamat : t.addr),
           teks(t.toko_catatan != null ? t.toko_catatan : t.note, 500),
           teks(t.mata_uang != null ? t.mata_uang : t.cur, 6) || 'Rp',
           typeof (t.dua_desimal != null ? t.dua_desimal : t.dec) === 'boolean'
             ? (t.dua_desimal != null ? t.dua_desimal : t.dec) : true]
        )).rows[0];
      } catch (e) {
        if (e.code === '23505') continue;   // nomor struk kembar — lewati, jangan gagalkan semuanya
        throw e;
      }
      jumlahTrx++;

      for (const i of item) {
        const jumlah = bulat(i.jumlah != null ? i.jumlah : i.qty);
        if (jumlah <= 0) continue;
        const harga = angka(i.harga != null ? i.harga : i.price);
        await k.query(
          `INSERT INTO transaksi_item (transaksi_id, produk_id, nama, ikon, harga, jumlah, subtotal)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [baris.id,
           peta.get(String(i.produk_id != null ? i.produk_id : i.id)) || null,
           teks(i.nama != null ? i.nama : i.name) || '(tanpa nama)',
           teks(i.ikon != null ? i.ikon : i.emoji, 8),
           harga, jumlah,
           angka(i.subtotal != null ? i.subtotal : (i.sub != null ? i.sub : harga * jumlah))]
        );
      }
    }
    return { produk: peta.size, transaksi: jumlahTrx };
  });

  res.json(Object.assign({ ok: true }, hasil));
}));

r.get('/cadangan/otomatis', tangani(async (req, res) => {
  const { rows } = await kolamApp.query(
    'SELECT id, waktu, sebab, pg_column_size(isi) AS bita FROM cadangan_otomatis ORDER BY waktu DESC, id DESC LIMIT 20');
  res.json({ cadangan: rows });
}));

r.get('/cadangan/otomatis/:id', tangani(async (req, res) => {
  const { rows } = await kolamApp.query('SELECT isi FROM cadangan_otomatis WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ galat: 'Cadangan tidak ditemukan.' });
  res.json(rows[0].isi);
}));

module.exports = r;
