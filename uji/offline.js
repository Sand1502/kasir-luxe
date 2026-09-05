const { chromium } = require('playwright');
const path = require('path');
const AKAR = path.join(__dirname, '..');
const URL = 'file://' + path.join(AKAR, 'index.html');
let gagal = 0;
function ok(nama, syarat, detail) {
  console.log((syarat ? '  OK   ' : '  GAGAL') + ' ' + nama + (detail ? '  → ' + detail : ''));
  if (!syarat) gagal++;
}

(async () => {
  const browser = await chromium.launch();

  // ══════════ 1. PONSEL: alur ketuk → flash → urungkan ══════════
  console.log('\n[1] PONSEL 390x844 — umpan balik ketukan');
  let ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  let pg = await ctx.newPage();
  const galat = [];
  pg.on('pageerror', e => galat.push(String(e)));
  pg.on('console', m => { if (m.type() === 'error') galat.push('console: ' + m.text()); });
  await pg.goto(URL);
  await pg.click('[data-open-app]');

  const kartu = pg.locator('#pgrid .pcard').first();
  const namaProduk = (await kartu.locator('.pcard__n').textContent()).trim();
  await kartu.click();
  await pg.waitForTimeout(150);

  ok('flash muncul', await pg.locator('#flash.show').isVisible());
  ok('flash menyebut nama barang', (await pg.locator('#flName').textContent()).trim() === namaProduk,
     await pg.locator('#flName').textContent());
  ok('flash menyebut 1 pcs', (await pg.locator('#flMeta').textContent()).includes('1 pcs'),
     (await pg.locator('#flMeta').textContent()).trim());
  ok('lencana jumlah di kartu', (await kartu.locator('.pcard__b').textContent()).trim() === '1');
  ok('kartu bertanda sudah-di-keranjang', await kartu.evaluate(e => e.classList.contains('is-in')));
  ok('cartbar menampilkan ikon isi', await pg.locator('#cbAv span').count() === 1);

  await kartu.click();
  await pg.waitForTimeout(120);
  ok('ketuk kedua → 2 pcs di flash', (await pg.locator('#flMeta').textContent()).includes('2 pcs'),
     (await pg.locator('#flMeta').textContent()).trim());
  ok('flash tidak menumpuk', await pg.locator('.flash').count() === 1);

  await pg.click('#flUndo');
  await pg.waitForTimeout(120);
  ok('urungkan → balik 1 pcs', (await kartu.locator('.pcard__b').textContent()).trim() === '1');
  ok('flash tertutup sesudah urungkan', !(await pg.locator('#flash').evaluate(e => e.classList.contains('show'))));

  await kartu.click(); await pg.waitForTimeout(100);
  await pg.click('#flUndo'); await pg.waitForTimeout(100);
  await pg.click('#flUndo').catch(() => {});
  await pg.waitForTimeout(100);
  ok('urungkan saat flash mati tidak meledak', galat.length === 0, galat.join(' | '));

  // flash hilang otomatis
  await kartu.click();
  await pg.waitForTimeout(2900);
  ok('flash hilang sendiri sesudah ~2,6 dtk', !(await pg.locator('#flash').evaluate(e => e.classList.contains('show'))));

  // ══════════ 2. PONSEL: transaksi penuh ══════════
  console.log('\n[2] PONSEL — transaksi sampai struk');
  await pg.click('#cartBar');
  await pg.waitForTimeout(350);
  await pg.click('#btnPay');
  await pg.waitForTimeout(350);
  const total = (await pg.locator('#payTotal').textContent()).trim();
  await pg.locator('#payChips .chip').first().click();
  await pg.waitForTimeout(120);
  ok('tombol Selesaikan hidup', !(await pg.locator('#btnFinish').isDisabled()), 'total ' + total);
  await pg.click('#btnFinish');
  await pg.waitForTimeout(400);
  ok('struk terbit', await pg.locator('#receiptSheet.open').isVisible());
  ok('nomor struk terbentuk', /TRX-\d{8}-\d{3}/.test(await pg.locator('#rcMeta').textContent()),
     (await pg.locator('#rcMeta').textContent()).trim());
  await pg.click('#btnDone');
  await pg.waitForTimeout(250);
  ok('keranjang kosong sesudah bayar', (await pg.locator('#cbCount').textContent()).includes('0 item'));
  ok('tanpa galat javascript', galat.length === 0, galat.join(' | '));
  await ctx.close();

  // ══════════ 3. MEJA: rel kategori + keranjang menempel ══════════
  console.log('\n[3] MEJA 1280x800 — tata letak tiga kolom');
  ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  pg = await ctx.newPage();
  const galat3 = [];
  pg.on('pageerror', e => galat3.push(String(e)));
  await pg.goto(URL);
  await pg.click('[data-open-app]');
  await pg.waitForTimeout(200);
  ok('rel kategori tampil', await pg.locator('#rail').isVisible());
  ok('rel berisi kategori + jumlah', (await pg.locator('#rail button').count()) >= 5,
     (await pg.locator('#rail button').count()) + ' baris');
  ok('keping kategori mendatar disembunyikan', !(await pg.locator('#cats').isVisible()));
  ok('keranjang menempel sebagai kolom', await pg.locator('#cartWrap').isVisible());
  ok('nav bawah disembunyikan', !(await pg.locator('#bnav').isVisible()));
  ok('tab atas tampil', await pg.locator('#tabs').isVisible());

  // saring lewat rel
  const relPertama = pg.locator('#rail button').nth(1);
  const namaKat = (await relPertama.locator('i').textContent()).trim();
  const jmlKat = parseInt((await relPertama.locator('u').textContent()).trim(), 10);
  await relPertama.click();
  await pg.waitForTimeout(200);
  ok('rel menyaring kisi', await pg.locator('#pgrid .pcard').count() === jmlKat,
     namaKat + ': hitungan rel ' + jmlKat + ', kartu ' + (await pg.locator('#pgrid .pcard').count()));
  ok('rel menandai yang terpilih', await relPertama.evaluate(e => e.classList.contains('is-on')));

  // tidak melar ke samping
  const melar = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  ok('halaman tidak melar mendatar', !melar);
  ok('tanpa galat javascript', galat3.length === 0, galat3.join(' | '));
  await ctx.close();

  // ══════════ 4. MIGRASI v1 → v2 ══════════
  console.log('\n[4] MIGRASI — data skema v1 dibuka kode v2');
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  pg = await ctx.newPage();
  const galat4 = [];
  pg.on('pageerror', e => galat4.push(String(e)));
  await pg.goto(URL);
  // Tanam data BENTUK LAMA: tanpa "schema", stok '' / null / hilang / string angka.
  const lama = {
    products: [
      { id: 'a1', name: 'Barang Stok Kosong', cat: 'Uji', price: 1000, stock: '', emoji: '🅰️' },
      { id: 'a2', name: 'Barang Stok Null', cat: 'Uji', price: '2500', stock: null },
      { id: 'a3', name: 'Barang Tanpa Kolom Stok', cat: 'Uji', price: 3000 },
      { id: 'a4', name: 'Barang Stok Angka', cat: 'Uji', price: 4000, stock: '7', catatan: 'kolom asing' },
      { name: 'Barang Tanpa Id', cat: 'Uji', price: 500, stock: 3 },
      { name: '', cat: 'Uji', price: 100, stock: 1 }
    ],
    trx: [{ id: 't1', no: 'TRX-20200101-001', ts: Date.now(), items: [], lines: 0, qty: 0, total: 0, pay: 0, change: 0 }],
    settings: { store: 'Toko Lama', decimals: false, landing: false }
  };
  await pg.evaluate(d => localStorage.setItem('kasirluxe.v1', JSON.stringify(d)), lama);
  await pg.reload();
  await pg.waitForTimeout(400);

  const st = await pg.evaluate(() => JSON.parse(localStorage.getItem('kasirluxe.v1')));
  ok('skema naik ke v2', st.schema === 2, 'schema=' + st.schema);
  const byName = n => st.products.filter(p => p.name === n)[0];
  ok("stok '' → null", byName('Barang Stok Kosong').stock === null);
  ok('stok null tetap null', byName('Barang Stok Null').stock === null);
  ok('stok hilang → null', byName('Barang Tanpa Kolom Stok').stock === null);
  ok("stok '7' → angka 7", byName('Barang Stok Angka').stock === 7);
  ok("harga '2500' → angka 2500", byName('Barang Stok Null').price === 2500);
  ok('kolom asing lestari', byName('Barang Stok Angka').catatan === 'kolom asing');
  ok('produk tanpa id dapat id', !!byName('Barang Tanpa Id').id);
  ok('produk tanpa nama dibuang', st.products.length === 5, st.products.length + ' produk');
  ok('riwayat lama utuh', st.trx.length === 1);
  ok('pengaturan lama terbawa', st.settings.store === 'Toko Lama' && st.settings.decimals === false);

  const bak = await pg.evaluate(() => localStorage.getItem('kasirluxe.v1.bak'));
  ok('salinan sebelum migrasi tersimpan', !!bak && JSON.parse(bak).schema === undefined);

  // barang "stok bebas" harus bisa dijual berkali-kali
  await pg.waitForTimeout(200);
  const kartuBebas = pg.locator('#pgrid .pcard').filter({ hasText: 'Barang Stok Kosong' }).first();
  ok('barang stok-bebas tidak dianggap habis', !(await kartuBebas.evaluate(e => e.classList.contains('is-out'))));
  await kartuBebas.click(); await pg.waitForTimeout(80);
  await kartuBebas.click(); await pg.waitForTimeout(80);
  await kartuBebas.click(); await pg.waitForTimeout(120);
  ok('stok bebas bisa ditambah berulang', (await kartuBebas.locator('.pcard__b').textContent()).trim() === '3');

  // baris salinan muncul di Atur
  await pg.click('#bnav [data-nav="atur"]');
  await pg.waitForTimeout(250);
  ok('baris salinan tampil di Atur', await pg.locator('#rowBak').isVisible());
  ok('info skema tampil', (await pg.locator('#dbInfo').textContent()).includes('skema v2'),
     (await pg.locator('#dbInfo').textContent()).trim());

  // ══════════ 5. MEMBUKA ULANG TIDAK MEMIGRASI LAGI ══════════
  const bakSebelum = await pg.evaluate(() => localStorage.getItem('kasirluxe.v1.bak'));
  await pg.evaluate(() => localStorage.setItem('kasirluxe.v1.bak', 'PENANDA'));
  await pg.reload();
  await pg.waitForTimeout(300);
  const bakSesudah = await pg.evaluate(() => localStorage.getItem('kasirluxe.v1.bak'));
  ok('buka ulang tidak menimpa salinan', bakSesudah === 'PENANDA', 'nilai=' + String(bakSesudah).slice(0, 30));
  ok('tanpa galat javascript', galat4.length === 0, galat4.join(' | '));

  // ══════════ 6. CADANGAN LAMA (v1, dari berkas) IKUT DIMIGRASI ══════════
  console.log('\n[6] PULIHKAN cadangan v1 dari berkas');
  await pg.evaluate(() => { localStorage.clear(); });
  await pg.reload();
  await pg.waitForTimeout(300);
  await pg.click('[data-open-app]');   // data bersih -> halaman depan tampil lagi
  await pg.waitForTimeout(200);
  await pg.click('#bnav [data-nav="atur"]');
  await pg.waitForTimeout(200);
  await pg.click('#btnPasteBk');
  await pg.waitForTimeout(300);
  await pg.fill('#pasteArea', JSON.stringify({ v: 1, products: [{ id: 'z1', name: 'Dari Cadangan Lama', cat: 'Uji', price: 999, stock: '' }], trx: [], settings: { store: 'Toko Cadangan' } }));
  await pg.click('#btnPasteOk');
  await pg.waitForTimeout(300);
  await pg.click('#cfOk');
  await pg.waitForTimeout(400);
  const st6 = await pg.evaluate(() => JSON.parse(localStorage.getItem('kasirluxe.v1')));
  ok('cadangan v1 naik ke skema v2', st6.schema === 2, 'schema=' + st6.schema);
  ok("stok '' dari cadangan → null", st6.products[0].stock === null);
  ok('nama toko dari cadangan terpakai', st6.settings.store === 'Toko Cadangan');

  // ══════════ 7. TIDAK MELAR MENDATAR & HEADER MENEMPEL ══════════
  // Penahan overflow-x:hidden di body sudah dicabut (merusak position:sticky),
  // jadi lebar halaman harus dibuktikan ulang di tiap ukuran, bukan diasumsikan.
  console.log('\n[7] LEBAR HALAMAN + HEADER MENEMPEL');
  for (const w of [320, 360, 390, 430, 768, 900, 1024, 1280, 1440]) {
    const c = await browser.newContext({ viewport: { width: w, height: 780 } });
    const q = await c.newPage();
    await q.goto(URL);
    await q.click('[data-open-app]');
    await q.waitForTimeout(150);
    // isi keranjang supaya cartbar/flash ikut terhitung lebarnya
    await q.locator('#pgrid .pcard').first().click();
    await q.waitForTimeout(120);
    const res = await q.evaluate(() => {
      window.scrollTo(0, 800);
      return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({
        melar: document.documentElement.scrollWidth - window.innerWidth,
        topbar: Math.round(document.querySelector('.topbar').getBoundingClientRect().top),
        gulung: window.scrollY
      }))));
    });
    const lekat = res.gulung < 10 || Math.abs(res.topbar) < 2;   // halaman pendek = tak perlu digulung
    ok('lebar ' + w + 'px: tidak melar & topbar menempel', res.melar <= 0 && lekat,
       'lebih ' + res.melar + 'px, topbar top=' + res.topbar);
    // daftar produk & riwayat juga tidak boleh melar
    for (const v of ['produk', 'riwayat', 'atur']) {
      await q.click((w >= 900 ? '#tabs' : '#bnav') + ' [data-nav="' + v + '"]');
      await q.waitForTimeout(120);
      const m = await q.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok('  ' + w + 'px / ' + v + ' tidak melar', m <= 0, 'lebih ' + m + 'px');
    }
    await c.close();
  }

  await browser.close();
  console.log('\n' + (gagal === 0 ? '✓ SEMUA UJI LULUS' : '✗ ' + gagal + ' UJI GAGAL'));
  process.exit(gagal === 0 ? 0 : 1);
})();
