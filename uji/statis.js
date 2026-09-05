/* Skenario GitHub Pages: index.html disajikan lewat http BIASA, tanpa /api sama
   sekali. kenali() akan tetap mencoba menghubungi peladen, jadi yang harus
   dibuktikan di sini: gagalnya mendarat mulus ke mode lokal, bukan jadi layar
   macet atau aplikasi yang menolak jalan. */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const AKAR = path.join(__dirname, '..');
const PORT = 4599;
let gagal = 0;
const ok = (n, c, d) => { console.log((c ? '  OK   ' : '  GAGAL') + ' ' + n + (d ? '  → ' + d : '')); if (!c) gagal++; };

(async () => {
  // peladen berkas statis polos — persis seperti GitHub Pages
  const srv = spawn('npx', ['--yes', 'http-server', AKAR, '-p', String(PORT), '-c-1', '--silent'],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise(r => setTimeout(r, 3500));

  const b = await chromium.launch();
  const pg = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const galat = [];
  pg.on('pageerror', e => galat.push(String(e)));

  await pg.goto(`http://127.0.0.1:${PORT}/index.html`);
  await pg.waitForTimeout(1500);

  ok('halaman depan tampil (tidak macet)', await pg.locator('#landing').isVisible());
  ok('kotak masuk TIDAK muncul', !(await pg.locator('#masukSheet').evaluate(e => e.classList.contains('open'))));
  ok('menu Data TIDAK muncul', await pg.locator('#bnav [data-nav="data"]').isHidden());

  await pg.click('[data-open-app]');
  await pg.waitForTimeout(500);
  ok('kasir kebuka', await pg.locator('#view-kasir').isVisible());
  ok('produk contoh terisi', (await pg.locator('#pgrid .pcard').count()) === 13);

  // transaksi penuh, murni lokal
  const kartu = pg.locator('#pgrid .pcard').first();
  await kartu.click(); await pg.waitForTimeout(200);
  await kartu.click(); await pg.waitForTimeout(300);
  ok('flash "masuk keranjang" jalan', await pg.locator('#flash.show').isVisible());

  await pg.click('#cartBar'); await pg.waitForTimeout(400);
  await pg.click('#btnPay'); await pg.waitForTimeout(400);
  await pg.locator('#payChips .chip').first().click(); await pg.waitForTimeout(200);
  await pg.click('#btnFinish'); await pg.waitForTimeout(900);
  ok('struk terbit', await pg.locator('#receiptSheet.open').isVisible());
  await pg.click('#btnDone'); await pg.waitForTimeout(300);

  const ls = await pg.evaluate(() => localStorage.getItem('kasirluxe.v1'));
  ok('data tersimpan di localStorage (mode lokal)', !!ls && JSON.parse(ls).trx.length === 1);

  // bertahan sesudah dimuat ulang
  await pg.reload(); await pg.waitForTimeout(1200);
  await pg.click('[data-open-app]'); await pg.waitForTimeout(400);
  await pg.click('#bnav [data-nav="riwayat"]'); await pg.waitForTimeout(400);
  ok('riwayat bertahan sesudah muat ulang', (await pg.locator('#rlist .trxrow').count()) === 1);
  ok('tanpa galat javascript', galat.length === 0, galat.join(' | '));

  await b.close(); srv.kill('SIGTERM');
  console.log('\n' + (gagal === 0 ? '✓ AMAN disajikan sebagai berkas statis (GitHub Pages)' : '✗ ' + gagal + ' GAGAL'));
  process.exit(gagal === 0 ? 0 : 1);
})().catch(e => { console.error('MELEDAK:', e.message); process.exit(1); });
