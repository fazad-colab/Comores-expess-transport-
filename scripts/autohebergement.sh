#!/usr/bin/env bash
# Télécharge Leaflet, Font Awesome et QRCode dans ./libs et réécrit index.html + extensions.js pour ne plus dépendre des CDN.
# Optionnel : compile Tailwind (npx). À lancer depuis la racine du projet, avec Internet. NON testé hors-ligne : relisez le résultat.
set -euo pipefail
mkdir -p libs/leaflet/images libs/fa/css libs/fa/webfonts
L=https://unpkg.com/leaflet@1.9.4/dist
curl -fsSL $L/leaflet.css -o libs/leaflet/leaflet.css
curl -fsSL $L/leaflet.js  -o libs/leaflet/leaflet.js
for f in marker-icon.png marker-icon-2x.png marker-shadow.png layers.png layers-2x.png; do curl -fsSL $L/images/$f -o libs/leaflet/images/$f; done
F=https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0
curl -fsSL $F/css/all.min.css -o libs/fa/css/all.min.css
for f in fa-solid-900 fa-regular-400 fa-brands-400; do curl -fsSL $F/webfonts/$f.woff2 -o libs/fa/webfonts/$f.woff2; done
curl -fsSL https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js -o libs/qrcode.min.js
# Tailwind : build statique (3.4.x) à partir des classes présentes dans index.html et extensions.js
echo '@tailwind base;@tailwind components;@tailwind utilities;' > /tmp/tw-in.css
npx --yes tailwindcss@3.4.17 -i /tmp/tw-in.css -o libs/tailwind.css --content "./index.html,./extensions.js" --minify
sed -i \
 -e 's#<script src="https://cdn.tailwindcss.com"></script>#<link rel="stylesheet" href="libs/tailwind.css">#' \
 -e 's#https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css#libs/fa/css/all.min.css#' \
 -e 's#https://unpkg.com/leaflet@1.9.4/dist/leaflet.css#libs/leaflet/leaflet.css#' \
 -e 's#https://unpkg.com/leaflet@1.9.4/dist/leaflet.js#libs/leaflet/leaflet.js#' \
 -e 's#https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js#libs/qrcode.min.js#' index.html
echo "OK. Vérifiez l'application, puis ajoutez les fichiers de libs/ à SHELL dans sw.js (ou laissez le cache dynamique les mémoriser)."
