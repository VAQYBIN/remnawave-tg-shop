FROM node:20-slim AS builder

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build


FROM nginx:alpine

# Нужен wget для скачивания telegram-web-app.js
RUN apk add --no-cache wget

COPY --from=builder /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend/docker-entrypoint.sh /docker-entrypoint.sh

RUN sed -i 's/\r//' /docker-entrypoint.sh \
    && chmod +x /docker-entrypoint.sh \
    && mkdir -p /usr/share/nginx/html/vendor \
    && wget -O /usr/share/nginx/html/vendor/telegram-web-app.js \
       "https://telegram.org/js/telegram-web-app.js?62" \
    && cp /usr/share/nginx/html/index.html /usr/share/nginx/html/index.html.bak \
    && sed -i \
       's#https://telegram.org/js/telegram-web-app.js?62#/vendor/telegram-web-app.js#g' \
       /usr/share/nginx/html/index.html

EXPOSE 3000
ENTRYPOINT ["/docker-entrypoint.sh"]