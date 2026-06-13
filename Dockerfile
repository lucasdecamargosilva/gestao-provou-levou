# Usa a imagem oficial do Nginx para servir arquivos estáticos
FROM nginx:stable-alpine

# Copia os arquivos do projeto para o diretório do Nginx
COPY . /usr/share/nginx/html

# Remove do diretório público arquivos de build (não devem ser servidos)
RUN rm -f /usr/share/nginx/html/Dockerfile \
          /usr/share/nginx/html/package.json \
          /usr/share/nginx/html/package-lock.json

# Expõe a porta 80
EXPOSE 80

# Gera o env-config.js dinamicamente (a partir das env vars) antes de iniciar o Nginx.
# SUPABASE_KEY deve ser a chave ANON (pública, segura) — o acesso é controlado por
# login Supabase no front + RLS (policies admins_only por email). NUNCA usar service_role aqui.
CMD ["/bin/sh", "-c", "echo \"window.LOCAL_SUPABASE_URL = '$SUPABASE_URL'; window.LOCAL_SUPABASE_KEY = '$SUPABASE_KEY';\" > /usr/share/nginx/html/env-config.js && nginx -g 'daemon off;'"]
