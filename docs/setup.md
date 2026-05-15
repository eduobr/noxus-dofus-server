# Noxus — Setup Guide

## Requisitos

| Componente | Versión requerida | Notas |
|---|---|---|
| Node.js | 25.3.0 | Instalado con nvm; `src/` corre directamente |
| pnpm | 11.1.2 | Reemplaza npm en el flujo actual |
| MongoDB | 4.2 | Docker recomendado; contenedor `noxus-mongo` |
| Docker Desktop | Actual | En esta máquina usa socket `$HOME/.docker/desktop/docker.sock` |
| SO | Linux / Windows | Validado en Arch Linux |

> Estado histórico: el proyecto original usaba Node 8 + Babel 6 + MongoDB 2.x.
> La rama actual ya fue migrada a Node 25 + pnpm, sin Babel ni carpeta `dist/`.

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/eduobr/noxus-dofus-server.git
cd noxus-dofus-server
```

### 2. Activar Node 25

```bash
source /home/enoh/.nvm/nvm.sh
nvm install 25.3.0
nvm use 25.3.0
node --version
```

Salida esperada:

```text
v25.3.0
```

### 3. Instalar pnpm y dependencias

```bash
npm install -g pnpm
pnpm --version
pnpm install
```

Dependencias runtime actuales:

- `mongodb` ^6.3.0
- `chalk` ^4.1.2 (CommonJS compatible)
- `node-dijkstra` ^2.3.0

### 4. Configurar MongoDB 4.2 con Docker

En Docker Desktop de esta máquina:

```bash
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock
```

Arrancar el contenedor existente o crearlo si no existe:

```bash
docker start noxus-mongo 2>/dev/null || \
  docker run -d --name noxus-mongo -p 27017:27017 \
    -v noxus-mongo-data:/data/db mongo:4.2
```

Verificar:

```bash
docker ps --filter name=noxus-mongo
docker exec noxus-mongo mongo --quiet --eval 'db.adminCommand({ ping: 1 })'
```

### 5. Importar datos de juego si la base está vacía

Los datos de juego están en `db/`, pero hay dos formatos:

#### JSON arrays — usar `--jsonArray`

Colecciones conocidas:

- `breeds`
- `items_sets`
- `monsters`
- `Npcs`
- `npcs_messages`
- `spells`
- `spells_levels`

Ejemplo:

```bash
docker exec -i noxus-mongo mongoimport --db Noxus --collection breeds \
  --jsonArray --drop --file - < db/breeds.json
```

#### Extended JSON legacy — limpiar wrappers BSON

Colecciones conocidas:

- `items`, `maps`, `elements`, `emoticons`, `experiences`, `heads`
- `interactives`, `interactives_objects`, `map_scroll_actions`
- `maps_positions`, `npcs_actions`, `npcs_items`, `npcs_replies`
- `npcs_spawns`, `ornaments`, `smileys`, `subareas`
- `accounts`, `accounts_friends`, `characters`, `areas`

MongoDB 4.2+ no parsea directamente `NumberInt()`, `NumberLong()` ni
`ObjectId()` desde estos JSON legacy. Limpia antes de importar:

```bash
sed 's/ObjectId("[^"]*")/"0"/g; s/NumberInt(\([0-9-]*\))/\1/g; s/NumberLong(\([0-9-]*\))/\1/g' db/heads.json \
  | sed '/"_id"/d' > /tmp/heads-cleaned.json

docker cp /tmp/heads-cleaned.json noxus-mongo:/tmp/heads-cleaned.json
docker exec noxus-mongo mongoimport --db Noxus --collection heads \
  --drop --file /tmp/heads-cleaned.json
```

Para el procedimiento completo ya ejecutado, ver:

```text
.hermes/plans/2026-05-14_120000-levantar-noxus.md
```

### 6. Configurar el servidor

`config.json` ya apunta al entorno local:

```json
{
  "host": "127.0.0.1",
  "auth_port": "443",
  "world_port": "5556",
  "mongodb": {
    "host": "localhost",
    "port": "27017",
    "database": "Noxus"
  }
}
```

No modifiques `config.json` sin revisar impacto sobre el cliente `.swf`.

### 7. Dar permiso al puerto 443

Linux no permite a procesos sin privilegios escuchar en puertos `<1024`. Para
usar `auth_port=443`, da capability al binario de Node 25:

```bash
sudo setcap 'cap_net_bind_service=+ep' /home/enoh/.nvm/versions/node/v25.3.0/bin/node
getcap /home/enoh/.nvm/versions/node/v25.3.0/bin/node
```

Salida esperada:

```text
/home/enoh/.nvm/versions/node/v25.3.0/bin/node cap_net_bind_service=ep
```

### 8. Ejecutar el servidor

No hay compilación. No existe `.babelrc`, `compilation.sh` ni `dist/` en el
flujo actual.

```bash
export PATH="/home/enoh/.nvm/versions/node/v25.3.0/bin:$PATH"
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock
node src/app.js
```

### 9. Verificar con cliente de prueba

En otra terminal:

```bash
export PATH="/home/enoh/.nvm/versions/node/v25.3.0/bin:$PATH"
cd /home/enoh/Documentos/mis-proyectos/Dofus
node client-test.js
```

Éxito funcional:

```text
🎉 ¡CONTEXTO DE JUEGO CREADO!
```

`client-test.js` puede terminar después con `[FAIL] Timeout`; si ya apareció el
banner de contexto, el flujo auth → world → personaje → mapa pasó.

---

## Verificación

Al iniciar correctamente, deberías ver en consola:

```text
[INFOS] : Loading configuration file ..
[INFOS] : Configuration file loaded successfully !
[INFOS] : Trying to connect to MongoDB ..
[INFOS] : Connected to MongoDB
[INFOS] : Loaded '17' breed(s)
[INFOS] : Loaded '272' head(s)
...
[INFOS] : Auth server started on 127.0.0.1:443
[INFOS] : World server started on 127.0.0.1:5556
[INFOS] : Server started successfully !
```

Verificar puertos:

```bash
ss -tlnp | grep -E ':(443|5556)\b'
```

---

## Problemas comunes

### `EACCES: permission denied 127.0.0.1:443`

Falta capability en el binario de Node:

```bash
sudo setcap 'cap_net_bind_service=+ep' /home/enoh/.nvm/versions/node/v25.3.0/bin/node
```

### MongoDB connection refused

Verificar Docker Desktop y contenedor:

```bash
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock
docker start noxus-mongo
docker exec noxus-mongo mongo --quiet --eval 'db.adminCommand({ ping: 1 })'
```

### Error de colección vacía o `getHead(...).skins` undefined

Probablemente faltan datos estáticos, especialmente `heads`:

```bash
docker exec noxus-mongo mongo --quiet Noxus --eval 'db.heads.count()'
```

Debe devolver `272` en el entorno actual.

### `Cannot find module` tras migración CommonJS

Buscar imports/exports ES6 residuales:

```bash
grep -RIn '^import \|^export ' src --include='*.js'
```

### Advertencias de dependencias circulares

La migración Node 25 usa lazy `require` para ciclos conocidos. Si aparece:

```text
Warning: Accessing non-existent property ... inside circular dependency
```

revisar `references/circular-deps.md` y aplicar el patrón `function getX() { return require(...) }`.
