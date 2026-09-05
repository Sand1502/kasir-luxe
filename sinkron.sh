#!/usr/bin/env bash
# Menyalin sumber KASIR.html menjadi index.html, lalu MEMBUKTIKAN keduanya sama.
#
# Kenapa ada pembuktiannya: menyalin berkas hampir selalu berhasil, jadi godaannya
# adalah menganggap "cp tidak menggerutu = beres". Yang mahal justru kasus diam —
# salinan lama masih di tempatnya karena cp gagal separuh, atau karena seseorang
# menyunting index.html langsung lalu lupa. Jadi hash-nya dibandingkan, dan skrip
# ini keluar dengan kode != 0 kalau tidak cocok. Gerbang yang tidak pernah bisa
# menolak bukan gerbang.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUMBER="$DIR/../KASIR/KASIR.html"
TUJUAN="$DIR/index.html"

if [ ! -f "$SUMBER" ]; then
  echo "GAGAL: sumbernya tidak ada -> $SUMBER" >&2
  echo "       (repositori ini mengharapkan folder KASIR ada di sebelahnya)" >&2
  exit 1
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
