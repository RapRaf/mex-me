#!/bin/sh
# Applica deploy/mexme.conf (creato da mexme.conf.example, escluso da git).
set -e
cd "$(dirname "$0")"
[ -f mexme.conf ] || { echo "Manca deploy/mexme.conf: copia mexme.conf.example e compila i valori."; exit 1; }
sudo cp mexme.conf /etc/nginx/sites-available/mexme.conf
sudo ln -sf /etc/nginx/sites-available/mexme.conf /etc/nginx/sites-enabled/mexme.conf
sudo nginx -t
sudo systemctl reload nginx
echo "nginx aggiornato."
