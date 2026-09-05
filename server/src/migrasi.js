'use strict';
/* Menjalankan migrasi lalu berhenti. Dipakai waktu pasang dan waktu naik versi:
   `npm run migrasi`. Sengaja terpisah dari peladen supaya bisa dijalankan
   sendirian sebelum versi baru dinyalakan. */
const { siapkanDB, tutupDB } = require('./db');

siapkanDB()
  .then(async () => { console.log('selesai.'); await tutupDB(); })
  .catch(async e => { console.error('GAGAL:', e.message); await tutupDB(); process.exit(1); });
