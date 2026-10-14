sudo cp mexme.conf /etc/nginx/sites-available/mexme.conf
sudo ln -s /etc/nginx/sites-available/mexme.conf /etc/nginx/sites-enabled/mexme.conf
sudo nginx -t
sudo systemctl restart nginx