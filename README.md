# Crypto Payments Test

Este proyecto es una aplicación para el procesamiento de transacciones de criptomonedas en tiempo real utilizando RabbitMQ, PostgreSQL y Node.js.

## Tabla de Contenidos
- [Requisitos](#requisitos)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Configuración Inicial](#configuración-inicial)
- [Comandos Disponibles](#comandos-disponibles)
- [Flujo del Sistema](#flujo-del-sistema)
- [Tests](#tests)
- [Logs](#logs)

---

## Requisitos

- **Node.js**: v16 o superior
- **Docker**: v20 o superior
- **Docker Compose**: v1.29 o superior

---

## Estructura del Proyecto

```
crypto-payments-test
├── data
│   ├── transactions-1.json
│   ├── transactions-2.json
├── logs
│   ├── combined.log
│   ├── error.log
│   ├── exceptions.log
├── migrations
│   ├── 0001_create_deposits_table.sql
│   ├── 0002_create_failed_transactions_table.sql
│   ├── 0003_create_execution_logs.sql
│   └── runMigrations.js
├── secrets
│   ├── postgres_password.txt
│   ├── postgres_user.txt
├── src
│   ├── config
│   ├── consumers
│   ├── db
│   ├── services
│   ├── utils
│   └── index.js
├── test
│   ├── services
│   │   └── depositRepository.test.js
├── .eslintrc.json
├── .env
├── .gitignore
├── babel.config.cjs
├── docker-compose.yml
├── docker-entrypoint.sh
├── jest.config.cjs
├── package.json
├── package-lock.json
├── Dockerfile
├── README.md
```

### Directorios Clave
- **data/**: Archivos JSON con datos de transacciones para procesar.
- **logs/**: Archivos de logs generados por Winston.
- **migrations/**: Scripts SQL y ejecutor de migraciones.
- **src/**: Código fuente principal.
  - **config/**: Configuraciones del sistema.
  - **consumers/**: Consumidores de RabbitMQ.
  - **db/**: Lógica para interacciones con la base de datos.
  - **services/**: Lógica de negocio.
  - **utils/**: Utilidades compartidas.
- **test/**: Pruebas unitarias.

---

## Configuración Inicial

1. Estar en la carpeta:
   ```bash
   cd crypto-payments-test
   ```

2. Crear el archivo `.env` basado en el ejemplo:
   ```bash
   cp .env.example .env
   ```

3. Crear los secretos para PostgreSQL:
   ```bash
   echo "postgres" > secrets/postgres_user.txt
   echo "yourpassword" > secrets/postgres_password.txt
   ```

4. Iniciar los servicios con Docker Compose:
   ```bash
   docker-compose up --build
   ```

5. Verificar que los contenedores estén en funcionamiento:
   ```bash
   docker ps
   ```
6. Configurar pgAdmin para inspeccionar los datos:
   - Crear un servidor en pgAdmin con los siguientes parámetros:
     - **Hostname**: `postgres` (nombre del servicio en Docker Compose)
     - **Puerto**: `5432`
     - **Usuario**: `postgres` (según `secrets/postgres_user.txt`)
     - **Contraseña**: `yourpassword` (según `secrets/postgres_password.txt`)

---

## Comandos Disponibles

### Iniciar la aplicación
```bash
npm start
```

### Modo de desarrollo
```bash
npm run dev
```

### Ejecutar migraciones
```bash
npm run migrate
```

### Ejecutar pruebas
```bash
npm test
```

### Detener los contenedores de Docker
```bash
docker-compose down
```
---
## Ejemplo de Salida

```plaintext
Deposited for Wesley Crusher: count=35 sum=183.00000000
Deposited for Leonard McCoy: count=18 sum=97.00000000
Deposited for Jonathan Archer: count=19 sum=97.49000000
Deposited for Jadzia Dax: count=15 sum=71.83000000
Deposited for Montgomery Scott: count=27 sum=131.93253000
Deposited for James T. Kirk: count=21 sum=1210.60058269
Deposited for Spock: count=16 sum=827.64088710
Deposited without reference: count=23 sum=1151.88738228
Smallest valid deposit: 0.00000010
Largest valid deposit: 99.61064066
```

### Validaciones de Depósitos Válidos
Los depósitos procesados y reportados en la salida anterior cumplen con las siguientes condiciones:

1. **Formato de Transacción**: Se asegura que todos los campos requeridos en la transacción están presentes y tienen un formato válido:
   - `txid`: Cadena única de identificación de la transacción.
   - `address`: Dirección de la billetera receptora en formato de cadena.
   - `amount`: Monto de la transacción en formato numérico.
   - `confirmations`: Número de confirmaciones como entero.
   - `category`: Tipo de transacción (`receive`).

2. **Criterios de Validación de Depósitos**:
   - La categoría de la transacción debe ser `receive`.
   - El monto (`amount`) debe ser mayor a 0.
   - La transacción debe tener un mínimo de **6 confirmaciones** (`MIN_CONFIRMATIONS`).

3. **Duplicidad**:
   - Las transacciones con el mismo `txid` ya procesadas anteriormente son ignoradas para evitar duplicados.
   - Se utiliza una consulta a la base de datos para obtener `txids` existentes y compararlos con las transacciones nuevas.

4. **Clasificación por Cliente**:
   - Las direcciones conocidas son asociadas a clientes específicos.
   - Las transacciones con direcciones no reconocidas son clasificadas como "sin referencia".

5. **Seguridad y Encriptación**:
   - Las direcciones (`address`) y transacciones (`txid`) se almacenan en la base de datos encriptadas utilizando AES-256 para proteger la información sensible.

---

## Flujo del Sistema

1. **Publicación de Transacciones**: Los datos de los archivos JSON en `data/` se leen y se publican en RabbitMQ mediante el intercambio `main_exchange`.

2. **Consumo de Transacciones**: El consumidor en `src/consumers/transactionConsumer.js` procesa los mensajes desde la cola `transactionsQueue`:
   - Valida las transacciones.
   - Clasifica en válidas y fallidas.
   - Persiste los datos en PostgreSQL.

3. **Persistencia**:
   - Las transacciones válidas se almacenan en la tabla `deposits`.
   - Las fallidas se almacenan en `failed_transactions`.

4. **Logs**: Los detalles de la ejecución y errores se registran en `logs/`.

---

## Tests

### Configuración de Pruebas
- Las pruebas unitarias se encuentran en el directorio `test/`.
- El archivo de configuración es `jest.config.cjs`.

### Ejecutar Pruebas
```bash
npm test
```

---

## Logs
- **combined.log**: Log combinado de información.
- **error.log**: Log de errores.
- **exceptions.log**: Log de excepciones no manejadas.

---

## Notas Adicionales
- Asegúrate de que las credenciales y secretos sean correctos antes de iniciar.
- Utiliza `pgAdmin` para inspeccionar los datos en PostgreSQL.
- Accede a RabbitMQ Management Console en [http://localhost:15672](http://localhost:15672) con usuario `guest` y contraseña `test`.

### Problemas con Terminaciones de Línea en Entornos Linux/Unix
Si experimentas errores relacionados con el archivo `docker-entrypoint.sh` en el entorno Docker, probablemente se deba a las terminaciones de línea de Windows (`CRLF`). Los entornos basados en Unix/Linux requieren terminaciones de línea en formato Unix (`LF`).

#### Solución
Convierte las terminaciones de línea del archivo `docker-entrypoint.sh` de `CRLF` a `LF` usando herramientas como `dos2unix` o un editor de texto compatible.

##### Usando `dos2unix`:
```bash
dos2unix docker-entrypoint.sh
```
## Creación Manual de la Base de Datos en Local
Si estás probando el proyecto de forma local y no en Docker, deberás asegurarte de que la base de datos exista antes de ejecutar las migraciones. Si no existe.
