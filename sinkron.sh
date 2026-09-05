#!/usr/bin/env bash
# Menyalin sumber KASIR.html menjadi index.html, lalu MEMBUKTIKAN keduanya sama.
#
# ⛔ BACA INI DULU — arah salinannya sudah TIDAK lagi jelas satu arah.
#
# Waktu skrip ini ditulis (5/9/2026 pagi), aturannya sederhana:
#   KASIR/KASIR.html  =  sumber       ->  index.html  =  salinan
#
# Siang harinya aturan itu PATAH. Seorang agen mengerjakan aplikasinya langsung
# di index.html di dalam repositori (+1301 baris: umpan balik tiap ketukan,
# migrasi data berversi, perbaikan position:sticky) dan kerjanya itu TIDAK
# pernah kembali ke KASIR.html. Jadi sekarang:
#
#   index.html      = 157 KB, versi TERBARU, dipakai halaman web
#   KASIR.html      =  99 KB, versi LAMA, dipakai android/build.sh untuk APK
#
# Menjalankan skrip ini apa adanya akan MENIMPA yang baru dengan yang lama, dan
# cp tidak akan menggerutu sedikit pun. Itulah sebabnya sekarang ada gerbang di
# bawah: kalau isinya berbeda, skrip ini BERHENTI dan menolak menyalin, sampai
# ada manusia yang memutuskan arah mana yang benar.
#
# Kalau kamu memang sengaja mau menimpa index.html dengan KASIR.html:
#     bash sinkron.sh --paksa
#
# Kalau yang benar justru sebaliknya (bawa kerja agen ke APK), JANGAN pakai
# skrip ini. Salin index.html -> KASIR.html dengan tangan, lalu uji APK-nya
# di HP sebelum dipercaya - itu kasir yang dipakai berjualan sungguhan.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUMBER="$DIR/../KASIR/KASIR.html"
TUJUAN="$DIR/index.html"
PAKSA="${1:-}"

if [ ! -f "$SUMBER" ]; then
  echo "GAGAL: sumbernya tidak ada -> $SUMBER" >&2
  echo "       (repositori ini mengharapkan folder KASIR ada di sebelahnya)" >&2
  exit 1
fi

# ── GERBANG: jangan pernah menimpa diam-diam ──────────────────────────────
if [ -f "$TUJUAN" ] && [ "$PAKSA" != "--paksa" ]; then
  HS=$(sha256sum "$SUMBER" | cut -d' ' -f1)
  HT=$(sha256sum "$TUJUAN" | cut -d' ' -f1)
  if [ "$HS" != "$HT" ]; then
    BS=$(wc -c < "$SUMBER")
    BT=$(wc -c < "$TUJUAN")
    echo "BERHENTI: isinya berbeda, dan menyalin akan MEMBUANG isi index.html." >&2
    echo "" >&2
    echo "  KASIR.html (sumber APK) : $BS bita" >&2
    echo "  index.html (halaman web): $BT bita" >&2
    echo "" >&2
    if [ "$BT" -gt "$BS" ]; then
      echo "  index.html JUSTRU LEBIH BESAR. Kemungkinan besar di situlah kerja" >&2
      echo "  terbaru berada, dan menyalin akan menghapusnya." >&2
    fi
    echo "" >&2
    echo "  Putuskan dulu arah yang benar:" >&2
    echo "    - mau menimpa index.html dengan KASIR.html : bash sinkron.sh --paksa" >&2
    echo "    - mau membawa index.html ke APK            : salin dengan tangan," >&2
    echo "      lalu UJI APK-nya di HP sebelum dipercaya" >&2
    exit 1
  fi
fi

cp "$SUMBER" "$TUJUAN"

H1=$(sha256sum "$SUMBER" | cut -d' ' -f1)
H2=$(sha256sum "$TUJUAN" | cut -d' ' -f1)

if [ "$H1" != "$H2" ]; then
  echo "GAGAL: sesudah disalin, isinya TETAP BEDA." >&2
  echo "  sumber : $H1" >&2
  echo "  tujuan : $H2" >&2
  exit 1
fi

echo "OK  index.html = KASIR.html"
echo "    sha256 $H1"
echo "    $(wc -c < "$TUJUAN") bita"
