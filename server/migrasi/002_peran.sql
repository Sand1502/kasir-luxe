-- ══════════════════════════════════════════════════════════════════════════
-- DUA PERAN, DUA SAMBUNGAN
--
-- Kotak SQL di menu Data menerima kueri apa pun yang diketik pemilik toko.
-- Yang menahannya supaya tidak bisa "DROP TABLE produk" BUKAN penyaringan teks
-- di sisi Node, melainkan hak akses Postgres sendiri.
--
-- Alasannya: penyaringan teks harus benar SETIAP KALI untuk bisa disebut aman,
-- sementara SQL punya tak terhingga cara menuliskan hal yang sama — komentar di
-- tengah kata kunci, kutip dolar, huruf besar-kecil campur, spasi tak terlihat.
-- Satu celah saja, dan seluruh perlindungannya tidak ada artinya. Hak akses
-- basis data tidak punya celah seperti itu: kalau perannya tidak memiliki tabel,
-- DROP-nya ditolak mesin, bukan ditebak oleh regex saya.
--
-- Karena itu peran ini WAJIB dipakai lewat sambungan login-nya sendiri, bukan
-- lewat SET ROLE dari sambungan aplikasi. SET ROLE bisa dibatalkan oleh kueri
-- yang menyusup di pernyataan kedua, dan pertahanannya balik lagi bergantung
-- pada pemeriksaan teks yang tadi justru mau dihindari.
-- ══════════════════════════════════════════════════════════════════════════

-- Dibuat tanpa LOGIN dulu; kata sandinya dipasang saat boot dari peubah
-- lingkungan, supaya rahasianya tidak pernah ikut masuk ke dalam berkas ini.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'kasir_sql') THEN
    CREATE ROLE kasir_sql NOLOGIN;
  END IF;
END $$;

-- Tidak boleh bikin apa pun di skema public (Postgres 15+ sudah begini secara
-- bawaan; ditulis ulang supaya tetap benar di server yang dinaikkan dari versi
-- lama, tempat setelan bawaannya masih longgar).
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM kasir_sql;
GRANT  USAGE  ON SCHEMA public TO   kasir_sql;

-- Boleh mengolah data toko: itu memang gunanya kotak ini.
GRANT SELECT, INSERT, UPDATE, DELETE ON toko, produk, transaksi, transaksi_item TO kasir_sql;
GRANT SELECT ON penjualan_harian, produk_terlaris, stok_menipis TO kasir_sql;
GRANT USAGE, SELECT ON SEQUENCE transaksi_item_id_seq TO kasir_sql;

-- TIDAK diberi hak apa pun ke jejak_sql dan cadangan_otomatis. Jejak yang bisa
-- dihapus dari kotak yang sama dengan yang dijejaki bukan jejak, dan cadangan
-- yang bisa dihapus oleh kueri yang seharusnya dilindunginya bukan cadangan.
REVOKE ALL ON jejak_sql, cadangan_otomatis FROM kasir_sql;
