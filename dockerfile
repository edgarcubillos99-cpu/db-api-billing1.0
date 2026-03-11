# ==========================================
# Etapa 1: Construcción (Builder)
# ==========================================
FROM node:20-alpine

# Directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiamos los archivos de dependencias
COPY package*.json ./

# Instalamos TODAS las dependencias (incluyendo las de desarrollo necesarias para compilar)
RUN npm install

# Copiamos todo el código fuente
COPY . .

# Compilamos el proyecto (genera la carpeta /dist)
RUN npm run build

# Comando para arrancar la aplicación en producción
CMD ["npm", "run", "start:prod"]