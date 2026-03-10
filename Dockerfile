# Usa a imagem oficial do Nginx para servir arquivos estáticos
FROM nginx:stable-alpine

# Copia os arquivos do seu projeto para o diretório padrão do Nginx
COPY . /usr/share/nginx/html

# Expõe a porta 80
EXPOSE 80

# Gera o arquivo env-config.js dinamicamente antes de iniciar o Nginx
CMD ["/bin/sh", "-c", "echo \"window.LOCAL_SUPABASE_URL = '$SUPABASE_URL'; window.LOCAL_SUPABASE_KEY = '$SUPABASE_KEY';\" > /usr/share/nginx/html/env-config.js && nginx -g \"daemon off;\""]
