#!/bin/sh

# Esperar a que PostgreSQL esté listo
echo "Esperando a la base de datos..."
until pg_isready -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U "$(cat $POSTGRES_USER_FILE)"; do
  sleep 2
done

# Ejecutar migraciones
echo "Ejecutando migraciones..."
npm run migrate

# Mantener el contenedor activo sin bucle
echo "🚀 Iniciando aplicación..."
exec npm start
