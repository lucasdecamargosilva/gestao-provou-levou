# Usa a imagem oficial do Nginx para servir arquivos estáticos
FROM nginx:stable-alpine

# Copia os arquivos do seu projeto para o diretório padrão do Nginx
COPY . /usr/share/nginx/html

# Expõe a porta 80
EXPOSE 80

# Injeta as variáveis de ambiente no script.js antes de iniciar o Nginx
CMD ["/bin/sh", "-c", "sed -i \"s|%%SUPABASE_URL%%|$SUPABASE_URL|g\" /usr/share/nginx/html/script.js && sed -i \"s|%%SUPABASE_KEY%%|$SUPABASE_KEY|g\" /usr/share/nginx/html/script.js && nginx -g \"daemon off;\""]
