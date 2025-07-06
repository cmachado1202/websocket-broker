# 1. Elige una base de Node.js oficial y ligera
FROM node:18-alpine

# 2. Establece el directorio de trabajo
WORKDIR /usr/src/app

# 3. Copia SOLO el package.json para aprovechar la caché de Docker
COPY package*.json ./

# 4. Instala las dependencias
RUN npm install

# 5. Copia el resto del código de la aplicación
COPY . .

# 6. Expone el puerto que la app va a usar
EXPOSE 8080

# 7. El comando para arrancar la app
CMD [ "node", "index.js" ]
