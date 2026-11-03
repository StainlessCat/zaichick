# Высокопроизводительный веб-сервер Nginx для корпоративной сети
# Использует готовую оптимизированную сборку из папки prebuilt/ (не требует npm install)
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY prebuilt /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
