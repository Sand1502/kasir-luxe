const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const AKAR = path.join(__dirname, '..');
const { Client } = require(path.join(AKAR, 'server/node_modules/pg'));

const PORT = 3577;
const DB = 'postgresql://postgres@/kasir_web?host=/tmp&port=5433';
const SANDI = 'sandi-toko-uji';
let gagal = 0;
const ok = (n, c, d) => { console.log((c ? '  OK   ' : '  GAGAL') + ' ' + n + (d ? '  → ' + d : '')); if (!c) gagal++; };

async function db(q, p) {
  const c = new Client({ connectionString: DB }); await c.connect();
  const r = await c.query(q, p); await c.end(); return r.rows;
}

(async () => {
  // Basis data disegarkan tiap kali: uji yang menumpang sisa data jalannya
  // sendiri akan lulus sekali lalu gagal selamanya sesudah itu.
  const { execSync } = require('child_process');
  execSync(`psql -h /tmp -p 5433 -U postgres -q -c "DROP DATABASE IF EXISTS kasir_web;" -c "CREATE DATABASE kasir_web;"`, { stdio: 'ignore' });

  const srv = spawn('node', ['src/index.js'], {
    cwd: path.join(AKAR, 'server'),
    env: { ...process.env, DATABASE_URL: DB, SANDI_TOKO: SANDI, RAHASIA_SESI: 'rahasia-web-uji', PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  srv.stderr.on('data', d => process.stderr.write('[peladen] ' + d));
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('peladen tidak siap')), 15000);
    srv.stdout.on('data', d => { if (String(d).includes('siap di')) { clearTimeout(t); res(); } });
  });

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();
  const galat = [];
  pg.on('pageerror', e => galat.push(String(e)));
  /* Uji di bawah sengaja memancing 401 dan 400 (sandi salah, DROP ditolak).
     Peramban mencatat tiap balasan 4xx sebagai galat konsol, jadi yang dihitung
     di sini hanya galat yang BUKAN itu — kalau tidak, uji ini akan selalu merah
     justru karena pagarnya bekerja. */
  pg.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/status of (400|401|409)/.test(t)) return;
    galat.push('console: ' + t);
  });

  try {
    // ══════════ MASUK ══════════
    console.log('\n[1] MODE SERVER TERDETEKSI & PINTU MASUK');
    await pg.goto(`http://127.0.0.1:${PORT}/`);
    await pg.waitForTimeout(900);
    ok('kotak masuk muncul sendiri', await pg.locator('#masukSheet.open').isVisible());

    await pg.fill('#masukSandi', 'salah');
    await pg.click('#btnMasuk');
    await pg.waitForTimeout(500);
    ok('sandi salah ditolak & kotak tetap terbuka',
       await pg.locator('#masukSheet.open').isVisible() && !(await pg.locator('#masukGalat').isHidden()));

    await pg.fill('#masukSandi', SANDI);
    await pg.click('#btnMasuk');
    await pg.waitForTimeout(900);
    ok('sandi benar → kotak tertutup', !(await pg.locator('#masukSheet').evaluate(e => e.classList.contains('open'))));
    ok('menu Data muncul', await pg.locator('#bnav [data-nav="data"]').count() === 1 &&
       await pg.locator('#tabs [data-nav="data"]').isVisible());
    ok('lencana "server" terpasang di topbar', (await pg.locator('#tbStore .modetag').textContent()).trim() === 'server');

    // ══════════ PRODUK LEWAT API ══════════
    console.log('\n[2] PRODUK MASUK KE POSTGRES, BUKAN localStorage');
    await pg.click('#tabs [data-nav="produk"]');
    await pg.waitForTimeout(300);
    await pg.click('#btnAddProduct');
    await pg.waitForTimeout(400);
    await pg.fill('#fName', 'Kopi Uji Server');
    await pg.fill('#fCat', 'Minuman');
    await pg.fill('#fPrice', '12500');
    await pg.fill('#fStock', '7');
    await pg.click('#btnSaveProduct');
    await pg.waitForTimeout(700);

    let baris = await db("SELECT nama, harga, stok, kategori FROM produk WHERE nama='Kopi Uji Server'");
    ok('produk tersimpan di Postgres', baris.length === 1, JSON.stringify(baris[0]));
    ok('harga numeric, bukan float', baris[0] && baris[0].harga === '12500.00');
    ok('tampil di daftar produk', (await pg.locator('#plist').textContent()).includes('Kopi Uji Server'));

    const lokal = await pg.evaluate(() => localStorage.getItem('kasirluxe.v1'));
    ok('data toko TIDAK ditulis ke localStorage di mode server',
       !lokal || !lokal.includes('Kopi Uji Server'));

    // ══════════ TRANSAKSI ══════════
    console.log('\n[3] TRANSAKSI ATOMIS DI PELADEN');
    await pg.click('#tabs [data-nav="kasir"]');
    await pg.waitForTimeout(400);
    const kartu = pg.locator('#pgrid .pcard').filter({ hasText: 'Kopi Uji Server' }).first();
    await kartu.click(); await pg.waitForTimeout(200);
    await kartu.click(); await pg.waitForTimeout(300);
    ok('flash tetap jalan di mode server', await pg.locator('#flash.show').isVisible());

    await pg.click('#btnPay');
    await pg.waitForTimeout(400);
    await pg.locator('#payChips .chip').first().click();
    await pg.waitForTimeout(200);
    await pg.click('#btnFinish');
    await pg.waitForTimeout(1200);
    ok('struk terbit', await pg.locator('#receiptSheet.open').isVisible());
    const nomor = (await pg.locator('#rcMeta').textContent()).trim();
    ok('nomor struk dari peladen', /TRX-\d{8}-001/.test(nomor), nomor);

    baris = await db("SELECT stok FROM produk WHERE nama='Kopi Uji Server'");
    ok('stok berkurang di basis data (7-2=5)', baris[0].stok === 5, 'stok=' + baris[0].stok);
    const item = await db("SELECT count(*)::int AS n FROM transaksi_item");
    ok('rincian transaksi tercatat', item[0].n >= 1);
    await pg.click('#btnDone');
    await pg.waitForTimeout(400);

    // ══════════ KONSOL SQL ══════════
    console.log('\n[4] KONSOL SQL — BACA');
    await pg.click('#tabs [data-nav="data"]');
    await pg.waitForTimeout(500);
    ok('contoh kueri tersedia', (await pg.locator('#sqlContoh button').count()) >= 6);
    ok('tombol berbunyi "Jalankan" untuk kueri kosong/baca',
       (await pg.locator('#lblJalan').textContent()).trim() === 'Jalankan');

    await pg.fill('#sqlKueri', 'SELECT nama, harga, stok FROM produk ORDER BY nama');
    await pg.click('#btnJalan');
    await pg.waitForTimeout(800);
    ok('tabel hasil tampil', await pg.locator('#sqlHasil table').isVisible());
    ok('judul kolom benar', (await pg.locator('#sqlHasil th').allTextContents()).join(',') === 'nama,harga,stok');
    ok('meta menyebut jumlah baris', (await pg.locator('#sqlMeta').textContent()).includes('baris'));
    ok('palang penegasan TIDAK muncul untuk SELECT', await pg.locator('#sqlConf').isHidden());

    console.log('\n[5] KONSOL SQL — TULIS WAJIB DIPRATINJAU DULU');
    await pg.fill('#sqlKueri', "UPDATE produk SET harga = harga * 2");
    await pg.waitForTimeout(200);
    ok('tombol berubah jadi "Pratinjau perubahan"',
       (await pg.locator('#lblJalan').textContent()).trim() === 'Pratinjau perubahan');

    const hargaSebelum = (await db("SELECT harga FROM produk WHERE nama='Kopi Uji Server'"))[0].harga;
    await pg.click('#btnJalan');
    await pg.waitForTimeout(900);
    ok('palang penegasan muncul', await pg.locator('#sqlConf').isVisible());
    const judul = (await pg.locator('#confJudul').textContent()).trim();
    ok('menyebut jumlah baris yang akan berubah', /\d+ baris akan berubah/.test(judul), judul);

    const hargaSesudahPratinjau = (await db("SELECT harga FROM produk WHERE nama='Kopi Uji Server'"))[0].harga;
    ok('PRATINJAU TIDAK MENGUBAH DATA', hargaSesudahPratinjau === hargaSebelum,
       hargaSebelum + ' → ' + hargaSesudahPratinjau);

    console.log('\n[6] KONSOL SQL — BARU BERUBAH SESUDAH DITEGASKAN');
    await pg.click('#btnSimpanTulis');
    await pg.waitForTimeout(1400);
    const hargaAkhir = (await db("SELECT harga FROM produk WHERE nama='Kopi Uji Server'"))[0].harga;
    ok('data berubah sesudah ditegaskan', hargaAkhir === '25000.00', hargaSebelum + ' → ' + hargaAkhir);
    ok('palang penegasan menutup', await pg.locator('#sqlConf').isHidden());
    const cad = await db('SELECT count(*)::int AS n FROM cadangan_otomatis');
    ok('cadangan otomatis terambil', cad[0].n >= 1, cad[0].n + ' cadangan');

    await pg.click('#tabs [data-nav="produk"]');
    await pg.waitForTimeout(500);
    ok('layar ikut disegarkan sesudah kueri tulis',
       (await pg.locator('#plist').textContent()).includes('25.000'));

    console.log('\n[7] PAGAR TETAP BERDIRI DARI SISI PERAMBAN');
    await pg.click('#tabs [data-nav="data"]');
    await pg.waitForTimeout(300);
    for (const [q, sebut] of [['DROP TABLE produk', 'DROP'], ['ALTER TABLE produk ADD COLUMN x int', 'ALTER'],
                              ['DELETE FROM jejak_sql', 'hapus jejak'], ['SELECT 1; DROP TABLE produk', 'dua perintah']]) {
      await pg.fill('#sqlKueri', q);
      await pg.click('#btnJalan');
      await pg.waitForTimeout(700);
      const adaGalat = await pg.locator('#sqlGalat').isVisible();
      const adaConf  = await pg.locator('#sqlConf').isVisible();
      ok(sebut + ' ditolak dan tidak menawarkan simpan', adaGalat && !adaConf);
    }
    const masihAda = await db("SELECT to_regclass('public.produk') AS ada");
    ok('tabel produk masih berdiri', !!masihAda[0].ada);

    console.log('\n[8] SISA-SISA');
    await pg.click('#btnSkema');
    await pg.waitForTimeout(700);
    ok('daftar tabel terbuka', await pg.locator('#skemaSheet.open').isVisible());
    const tbl = await pg.locator('#skemaIsi .skematbl__n b').allTextContents();
    ok('memuat tabel produk & transaksi', tbl.includes('produk') && tbl.includes('transaksi'), tbl.join(','));
    ok('tabel internal disembunyikan', !tbl.includes('jejak_sql'));
    await pg.click('#skemaSheet .sheet__head [data-close]');
    await pg.waitForTimeout(300);

    ok('jejak kueri terisi', (await pg.locator('#sqlJejak button').count()) >= 3);

    const melar = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok('halaman tidak melar mendatar', melar <= 0, 'lebih ' + melar + 'px');
    ok('tanpa galat javascript', galat.length === 0, galat.join(' | '));

  } finally {
    await b.close();
    srv.kill('SIGTERM');
  }

  console.log('\n' + (gagal === 0 ? '✓ SEMUA UJI SERVER LULUS' : '✗ ' + gagal + ' UJI GAGAL'));
  process.exit(gagal === 0 ? 0 : 1);
})().catch(e => { console.error('MELEDAK:', e); process.exit(1); });
