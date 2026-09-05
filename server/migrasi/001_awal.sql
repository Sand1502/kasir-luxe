-- ══════════════════════════════════════════════════════════════════════════
-- KASIR LUXE — bentuk awal basis data
--
-- Nama tabel dan kolom sengaja berbahasa Indonesia. Basis data ini bukan cuma
-- dipakai kode: pemilik toko mengetik SQL-nya sendiri lewat menu Data. Menyuruh
-- orang menghafal "products.stock" padahal seluruh aplikasinya berbahasa
-- Indonesia cuma menambah satu lapis terjemahan di kepala, tiap kali.
-- ══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ── TOKO ──────────────────────────────────────────────────────────────────
-- Satu baris saja, dikunci lewat CHECK (id = 1). Tabel satu-baris lebih baik
-- daripada tabel kunci-nilai: tiap pengaturan punya tipe sendiri, jadi
-- "dua_desimal" tidak bisa diisi 'iya' dan baru meledak waktu dibaca.
CREATE TABLE toko (
  id            smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nama          text        NOT NULL DEFAULT 'Toko Berkah Jaya',
  alamat        text        NOT NULL DEFAULT '',
  catatan_struk text        NOT NULL DEFAULT '',
  mata_uang     text        NOT NULL DEFAULT 'Rp',
  dua_desimal   boolean     NOT NULL DEFAULT true,
  tema          text        NOT NULL DEFAULT 'dark' CHECK (tema IN ('dark','light')),
  diperbarui    timestamptz NOT NULL DEFAULT now()
);
INSERT INTO toko (id) VALUES (1);

-- ── PRODUK ────────────────────────────────────────────────────────────────
-- harga memakai numeric, BUKAN float. Uang tidak boleh disimpan sebagai
-- pecahan biner: 0.1 + 0.2 tidak sama dengan 0.3 di float, dan selisih satu
-- perak yang muncul entah dari mana adalah jenis galat yang paling lama dicari
-- karena tidak pernah bisa diulang dengan angka yang sama.
CREATE TABLE produk (
  id         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  nama       text          NOT NULL CHECK (btrim(nama) <> ''),
  kategori   text          NOT NULL DEFAULT 'Lainnya',
  harga      numeric(14,2) NOT NULL CHECK (harga >= 0),
  -- NULL berarti "stok tak dibatasi". Skema lama punya tiga penanda untuk hal
  -- yang sama ('', null, kolomnya hilang); di sini cuma ada satu, dan NOT NULL
  -- sengaja TIDAK dipasang supaya penandanya tetap satu.
  stok       integer       CHECK (stok IS NULL OR stok >= 0),
  ikon       text          NOT NULL DEFAULT '',
  dibuat     timestamptz   NOT NULL DEFAULT now(),
  diperbarui timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX produk_kategori_idx ON produk (kategori);
CREATE INDEX produk_nama_idx     ON produk (lower(nama));

-- ── TRANSAKSI ─────────────────────────────────────────────────────────────
-- Identitas toko ikut disalin ke tiap transaksi. Kelihatan mubazir, tapi struk
-- yang sudah dicetak harus tetap cocok dengan kertasnya: kalau nama atau alamat
-- toko diganti bulan depan, struk bulan lalu tidak boleh ikut berubah waktu
-- dibuka lagi dari Riwayat.
CREATE TABLE transaksi (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  nomor        text          NOT NULL UNIQUE,
  waktu        timestamptz   NOT NULL DEFAULT now(),
  jenis_item   integer       NOT NULL CHECK (jenis_item >= 0),
  total_pcs    integer       NOT NULL CHECK (total_pcs  >= 0),
  total        numeric(14,2) NOT NULL CHECK (total   >= 0),
  bayar        numeric(14,2) NOT NULL CHECK (bayar   >= 0),
  kembali      numeric(14,2) NOT NULL CHECK (kembali >= 0),
  toko_nama    text          NOT NULL DEFAULT '',
  toko_alamat  text          NOT NULL DEFAULT '',
  toko_catatan text          NOT NULL DEFAULT '',
  mata_uang    text          NOT NULL DEFAULT 'Rp',
  dua_desimal  boolean       NOT NULL DEFAULT true,
  CONSTRAINT bayar_cukup CHECK (bayar >= total)
);
CREATE INDEX transaksi_waktu_idx ON transaksi (waktu DESC);

-- ── ISI TRANSAKSI ─────────────────────────────────────────────────────────
-- nama/harga ikut disalin dengan alasan yang sama seperti di atas. produk_id
-- boleh NULL supaya barang yang sudah dihapus dari daftar tidak menyeret
-- riwayat penjualannya ikut hilang — ON DELETE SET NULL, bukan CASCADE.
CREATE TABLE transaksi_item (
  id           bigserial     PRIMARY KEY,
  transaksi_id uuid          NOT NULL REFERENCES transaksi (id) ON DELETE CASCADE,
  produk_id    uuid          REFERENCES produk (id) ON DELETE SET NULL,
  nama         text          NOT NULL,
  ikon         text          NOT NULL DEFAULT '',
  harga        numeric(14,2) NOT NULL CHECK (harga  >= 0),
  jumlah       integer       NOT NULL CHECK (jumlah > 0),
  subtotal     numeric(14,2) NOT NULL CHECK (subtotal >= 0)
);
CREATE INDEX transaksi_item_transaksi_idx ON transaksi_item (transaksi_id);
CREATE INDEX transaksi_item_produk_idx    ON transaksi_item (produk_id);

-- ── JEJAK KONSOL SQL ──────────────────────────────────────────────────────
-- Tiap kueri dari menu Data dicatat di sini. Peran basis data yang dipakai
-- konsol sengaja TIDAK diberi hak apa pun ke tabel ini (lihat 002), supaya
-- kueri dari konsol tidak bisa menghapus jejaknya sendiri.
CREATE TABLE jejak_sql (
  id     bigserial   PRIMARY KEY,
  waktu  timestamptz NOT NULL DEFAULT now(),
  kueri  text        NOT NULL,
  mode   text        NOT NULL,
  baris  integer,
  galat  text,
  alamat text
);
CREATE INDEX jejak_sql_waktu_idx ON jejak_sql (waktu DESC);

-- ── CADANGAN OTOMATIS ─────────────────────────────────────────────────────
-- Diambil tepat sebelum kueri tulis dari konsol dijalankan sungguhan. Satu
-- UPDATE tanpa WHERE bisa menghapus harga seluruh toko dalam sepersekian detik,
-- dan itu justru kesalahan yang paling gampang dilakukan orang yang baru belajar
-- SQL — persis orang yang akan memakai kotak ini.
CREATE TABLE cadangan_otomatis (
  id     bigserial   PRIMARY KEY,
  waktu  timestamptz NOT NULL DEFAULT now(),
  sebab  text        NOT NULL,
  isi    jsonb       NOT NULL
);
CREATE INDEX cadangan_otomatis_waktu_idx ON cadangan_otomatis (waktu DESC);

-- ── TAMPILAN BANTU ────────────────────────────────────────────────────────
-- Tiga pertanyaan yang paling sering ditanyakan pemilik toko, disiapkan supaya
-- tidak perlu ditulis ulang tiap kali dari nol.
CREATE VIEW penjualan_harian AS
  SELECT date_trunc('day', waktu)::date AS tanggal,
         count(*)                       AS transaksi,
         sum(total_pcs)                 AS pcs,
         sum(total)                     AS omset
    FROM transaksi
   GROUP BY 1
   ORDER BY 1 DESC;

CREATE VIEW produk_terlaris AS
  SELECT i.nama,
         count(DISTINCT i.transaksi_id) AS transaksi,
         sum(i.jumlah)                  AS pcs,
         sum(i.subtotal)                AS omset
    FROM transaksi_item i
   GROUP BY 1
   ORDER BY pcs DESC;

CREATE VIEW stok_menipis AS
  SELECT nama, kategori, harga, stok
    FROM produk
   WHERE stok IS NOT NULL AND stok <= 5
   ORDER BY stok, nama;
