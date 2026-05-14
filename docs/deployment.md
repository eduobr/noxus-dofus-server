# Noxus — Deployment

## Estado actual

**No hay infraestructura de deployment configurada.** El proyecto no contiene:

- Dockerfile
- docker-compose.yml
- Scripts de CI/CD
- Configuración de orquestación (Kubernetes, etc.)
- Gestión de variables de entorno (`.env`)

## Cómo se despliega actualmente

Basado en los archivos disponibles, el despliegue es **manual**:

1. Clonar el repositorio en el servidor de producción
2. Instalar dependencias: `npm install`
3. Asegurar MongoDB corriendo en `localhost:27017`
4. Importar datos de juego a MongoDB desde `db/`
5. Compilar con Babel: `./compilation.sh` o `npm run build`
6. Ejecutar: `node dist/app.js`

## Consideraciones de ambiente

### Puertos

| Servicio  | Puerto | Protocolo | Requiere root?            |
|-----------|--------|-----------|---------------------------|
| Auth      | 443    | TCP       | Sí (< 1024 en Linux)      |
| World     | 5556   | TCP       | No                        |
| MongoDB   | 27017  | TCP       | No (pero firewall)        |

En producción se recomienda:
- Usar un reverse proxy (nginx, haproxy) para el puerto 443 en lugar de que
  Node.js escuche directamente en un puerto privilegiado.
- Alternativa: cambiar `auth_port` en `config.json` a 8443 y ajustar el
  cliente.

### MongoDB

- Sin autenticación configurada en el código (conexión sin usuario/contraseña)
- La base de datos se llama `Noxus` por defecto
- Sin pooling de conexiones visible (se usa `MongoClient.connect` una vez)

### Variables de entorno

**No se usan variables de entorno.** Toda la configuración está hardcodeada en
`config.json`. Para un despliegue profesional se recomienda:

```bash
# Propuesta de variables de entorno
export NOXUS_HOST=0.0.0.0
export NOXUS_AUTH_PORT=8443
export NOXUS_WORLD_PORT=5556
export NOXUS_MONGO_HOST=mongodb.produccion.local
export NOXUS_MONGO_PORT=27017
export NOXUS_MONGO_DB=Noxus
```

## Recomendación de Dockerización

Crear un `Dockerfile` y `docker-compose.yml` para simplificar el despliegue:

### Dockerfile propuesto

```dockerfile
FROM node:8

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN ./node_modules/.bin/babel src --out-dir dist

EXPOSE 443 5556
CMD ["node", "dist/app.js"]
```

### docker-compose.yml propuesto

```yaml
version: '3'
services:
  mongodb:
    image: mongo:3.2
    volumes:
      - ./db:/docker-entrypoint-initdb.d
  noxus:
    build: .
    ports:
      - "443:443"
      - "5556:5556"
    environment:
      - NOXUS_MONGO_HOST=mongodb
    depends_on:
      - mongodb
```

## Seguridad

Consideraciones para producción:

- Las contraseñas se almacenan en texto plano en MongoDB — **crítico**.
  Implementar hashing (bcrypt) antes de cualquier despliegue público.
- Sin rate limiting en auth (posible brute force).
- Sin cifrado TLS en la conexión cliente-servidor (el protocolo Dofus puede
  soportarlo o no — *pendiente por confirmar*).
- MongoDB sin autenticación — restringir acceso por firewall.
