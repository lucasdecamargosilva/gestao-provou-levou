# Usa a imagem oficial do Nginx para servir arquivos estáticos
FROM nginx:stable-alpine

# Copia os arquivos do seu projeto para o diretório padrão do Nginx
COPY . /usr/share/nginx/html

# Expõe a porta 80
EXPOSE 80

# Inicia o Nginx
CMD ["nginx", "-g", "daemon off;"]
