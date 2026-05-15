# Noxus — Deployment

## Estado actual

El despliegue sigue siendo **manual**. El repositorio no contiene todavía:

- Dockerfile oficial
- docker-compose.yml oficial
- Scripts de CI/CD
- Configuración de orquestación (Kubernetes, etc.)
- Gestión de variables de entorno (`.env`)

El runtime actual sí cambió: Noxus corre directamente con **Node 25 + pnpm**, sin
Babel ni carpeta `dist/`.

## Cómo se despliega actualmente

Flujo manual recomendado:

1. Clonar el repositorio en el servidor.
2. Activar Node 25.3.0.
3. Instalar dependencias con `pnpm install`.
4. Asegurar MongoDB 8.0 corriendo en `localhost:27017`.
5. Importar datos de juego a MongoDB desde `db/` si la base está vacía.
6. Dar capability al binario de Node para puerto 443.
7. Ejecutar `node src/app.js`.

Comandos base:

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus
export PATH="/home/enoh/.nvm/versions/node/v25.3.0/bin:$PATH"
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock

pnpm install
docker start noxus-mongo8 2>/dev/null || \
  docker run -d --name noxus-mongo8 -p 27017:27017 \
    -v noxus-mongo8-data:/data/db mongo:8.0

node src/app.js
```

## Consideraciones de ambiente

### Puertos

| Servicio  | Puerto | Protocolo | Requiere root/capability? |
|-----------|--------|-----------|---------------------------|
| Auth      | 443    | TCP       | Sí (`cap_net_bind_service`) |
| World     | 5556   | TCP       | No                        |
| MongoDB   | 27017  | TCP       | No (pero firewall)        |

Para permitir que Node escuche en 443 sin root:

```bash
sudo setcap 'cap_net_bind_service=+ep' /home/enoh/.nvm/versions/node/v25.3.0/bin/node
getcap /home/enoh/.nvm/versions/node/v25.3.0/bin/node
```

En producción se recomienda evaluar:

- Un reverse proxy / TCP proxy para el puerto 443 en lugar de capability directa.
- Firewall para limitar acceso a MongoDB.
- No exponer 27017 públicamente.

### MongoDB

- Versión validada actual: MongoDB 8.0 en Docker (`mongo:8.0`).
- Contenedor local activo: `noxus-mongo8`.
- Volumen local activo: `noxus-mongo8-data`.
- Base por defecto: `Noxus`.
- La app se conecta sin usuario/contraseña según `config.json`.
- Rollback temporal: conservar `noxus-mongo` (`mongo:4.2`) detenido con su volumen original y volver a arrancarlo si MongoDB 8.0 falla.
- Plan de migración ejecutado: `.hermes/plans/2026-05-14_202655-migrar-mongodb-42-a-80.md`.

### Variables de entorno

La aplicación no consume variables de entorno propias. Toda la configuración de
Noxus está en `config.json`.

Variable operativa necesaria en esta máquina para hablar con Docker Desktop:

```bash
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock
```

Para un despliegue profesional se recomienda, en una fase futura, soportar:

```bash
export NOXUS_HOST=0.0.0.0
export NOXUS_AUTH_PORT=443
export NOXUS_WORLD_PORT=5556
export NOXUS_MONGO_HOST=mongodb
export NOXUS_MONGO_PORT=27017
export NOXUS_MONGO_DB=Noxus
```

## Dockerización propuesta

No hay Dockerfile oficial todavía. Si se crea uno, debe usar Node moderno y no
compilar con Babel.

### Dockerfile propuesto

```dockerfile
FROM node:25-slim

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && corepack prepare pnpm@11.1.2 --activate && pnpm install --frozen-lockfile

COPY . .

EXPOSE 443 5556
CMD ["node", "src/app.js"]
```

### docker-compose.yml propuesto

```yaml
services:
  mongodb:
    image: mongo:8.0
    volumes:
      - noxus-mongo8-data:/data/db
    ports:
      - "27017:27017"

  noxus:
    build: .
    ports:
      - "443:443"
      - "5556:5556"
    depends_on:
      - mongodb
    # Requiere ajustar config/env en una fase futura para conectar a host mongodb.

volumes:
  noxus-mongo8-data:
```

Nota: actualmente `config.json` apunta a `localhost`, por lo que un compose real
requiere modificar la configuración o implementar variables de entorno.

## Seguridad

Consideraciones para producción:

- Las contraseñas se almacenan en texto plano en MongoDB — **crítico**.
  Implementar hashing (bcrypt/argon2) antes de cualquier despliegue público.
- Sin rate limiting en auth (posible brute force).
- Sin cifrado TLS en la conexión cliente-servidor (pendiente por confirmar si el
  protocolo/cliente lo soporta en esta versión).
- MongoDB sin autenticación — restringir acceso por firewall o red privada.
- El proceso Node puede quedar con capability para puerto 443; controlar quién
  puede ejecutar ese binario.

## Validación post-deploy

```bash
ss -tlnp | grep -E ':(443|5556)\b'
node client-test.js | tee /tmp/noxus-client-deploy.log
```

Éxito funcional:

```text
🎉 ¡CONTEXTO DE JUEGO CREADO!
```
