# ===========================
# Stage 1: Build Stage
# ===========================
FROM node:20-alpine AS build

WORKDIR /app

# Instalar dependencias solo de producción
COPY package*.json ./
RUN npm install --only=production

# Copiar el resto del código
COPY . .

# ===========================
# Stage 2: Production Stage
# ===========================
FROM node:20-alpine

WORKDIR /app

# Copiar la app desde el build
COPY --from=build /app /app

# Instalar cliente de PostgreSQL para pg_isready
RUN apk add --no-cache postgresql-client bash

# Copiar y dar permisos al script de entrada
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Exponer el puerto de la aplicación
EXPOSE 3000

# Usar el entrypoint personalizado
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]
