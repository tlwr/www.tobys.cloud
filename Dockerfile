FROM nginx

COPY ./src /usr/share/nginx/html
COPY ./conf/nginx/photos.conf /etc/nginx/conf.d/photos.conf

EXPOSE 80
