# Usa a imagem oficial do Nginx para servir arquivos estáticos
FROM nginx:stable-alpine

# Copia os arquivos do projeto para o diretório do Nginx
COPY . /usr/share/nginx/html

# Config do Nginx com Basic Auth (protege o site inteiro, inclusive env-config.js)
COPY default.conf /etc/nginx/conf.d/default.conf
COPY .htpasswd /etc/nginx/.htpasswd

# Remove do diretório público os arquivos sensíveis/de build (não devem ser servidos)
RUN rm -f /usr/share/nginx/html/.htpasswd \
          /usr/share/nginx/html/default.conf \
          /usr/share/nginx/html/Dockerfile \
          /usr/share/nginx/html/package.json \
          /usr/share/nginx/html/package-lock.json

# Expõe a porta 80
EXPOSE 80

# Gera o arquivo env-config.js dinamicamente antes de iniciar o Nginx
CMD ["/bin/sh", "-c", "echo \"window.LOCAL_SUPABASE_URL = '$SUPABASE_URL'; window.LOCAL_SUPABASE_KEY = '$SUPABASE_KEY';\" > /usr/share/nginx/html/env-config.js && nginx -g 'daemon off;'"]
