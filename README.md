# Noxus — Dofus 2.39 Server Emulator

Emulador de servidor privado para Dofus 2.39. Originalmente creado en 2016 por
Yuki, Arkalius y Yamisaaf. Revivido, documentado y migrado a Node moderno en
2026.

**Estado**: ✅ Funcional en Node 25 + pnpm — login, ticket, lista de personajes,
selección de personaje y entrada al mundo validados con `client-test.js`.

---

## Stack

| Componente | Tecnología |
|-----------|-----------|
| Runtime | Node.js 25.3.0 |
| Package manager | pnpm 11.1.2 |
| Base de datos | MongoDB 4.2 en Docker (`noxus-mongo`) |
| Driver MongoDB | `mongodb` 6.x |
| Protocolo | Dofus 2.39 (TCP binario, ID 1738) |
| Build | Sin Babel — `src/` corre directamente en Node |
| Módulos | CommonJS (`require` / `module.exports`) |
| Cliente | Dofus 2.39 Flash (`.swf`) + cliente completo externo |
| SO | Linux (probado en Arch) |

---

## Requisitos

- Node.js 25.3.0 ([nvm](https://github.com/nvm-sh/nvm) recomendado)
- pnpm 11.1.2
- Docker / Docker Desktop
- MongoDB 4.2 vía contenedor Docker
- `cap_net_bind_service` en el binario de Node para escuchar en puerto 443
- Flash Player Projector y cliente Dofus 2.39 completo si quieres probar con el
  cliente real

En esta máquina Docker Desktop usa este socket:

```bash
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock
```

---

## Instalación rápida

```bash
# 1. Clonar
git clone https://github.com/eduobr/noxus-dofus-server.git
cd noxus-dofus-server

# 2. Node 25
nvm install 25.3.0
nvm use 25.3.0

# 3. pnpm
npm install -g pnpm
pnpm install

# 4. MongoDB 4.2 (Docker Desktop)
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock
docker start noxus-mongo 2>/dev/null || \
  docker run -d --name noxus-mongo -p 27017:27017 \
    -v noxus-mongo-data:/data/db mongo:4.2

# 5. Dar permiso al puerto 443 al Node 25
sudo setcap 'cap_net_bind_service=+ep' /home/enoh/.nvm/versions/node/v25.3.0/bin/node
getcap /home/enoh/.nvm/versions/node/v25.3.0/bin/node

# 6. Iniciar servidor
node src/app.js
```

Salida esperada:

```text
[INFOS] : Connected to MongoDB
[INFOS] : Auth server started on 127.0.0.1:443
[INFOS] : World server started on 127.0.0.1:5556
[INFOS] : Server started successfully !
```

Verificar puertos:

```bash
ss -tlnp | grep -E ':(443|5556)\b'
```

---

## Datos de MongoDB

Los datos están en `db/`, pero no todos los JSON tienen el mismo formato:

- JSON arrays: importar con `mongoimport --jsonArray`.
- Extended JSON legacy (`NumberInt()`, `NumberLong()`, `ObjectId()`): limpiar
  wrappers antes de importar en MongoDB 4.2+.

El entorno actual ya usa una base `Noxus` importada en el contenedor
`noxus-mongo`. Para una importación desde cero, consulta:

- `.hermes/plans/2026-05-14_120000-levantar-noxus.md`
- `docs/setup.md`

---

## Cliente de prueba

`client-test.js` implementa el flujo completo con TCP binario, sin depender del
cliente Flash:

```bash
export PATH="/home/enoh/.nvm/versions/node/v25.3.0/bin:$PATH"
node client-test.js
```

Salida esperada:

```text
[OK] Login exitoso
[OK] Ticket aceptado por World
[OK] Personajes recibidos
[OK] Personaje seleccionado: Bizelzapobany
[OK] 🎉 ¡CONTEXTO DE JUEGO CREADO!
```

Nota: el cliente de prueba puede terminar luego con `[FAIL] Timeout`; si ya
apareció el banner de contexto de juego, la validación funcional pasó.

---

## Cuenta de prueba

La base local contiene una cuenta de prueba:

| Campo | Valor |
|-------|-------|
| Usuario | `test` |
| Password | `test` |
| Personaje | `Bizelzapobany` (id=27, Feca, nivel 150) |

Crear una cuenta manualmente en MongoDB 4.2:

```bash
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock
docker exec -i noxus-mongo mongo Noxus --eval '
db.accounts.insert({
  uid: 100, username: "miuser", password: "mipass",
  nickname: "MiNick", role: 4, locked: 0
})'
```

---

## Documentación

| Archivo | Contenido |
|---------|-----------|
| `docs/overview.md` | Resumen del proyecto, stack, módulos |
| `docs/architecture.md` | Arquitectura completa, capas, patrones, riesgos |
| `docs/setup.md` | Instalación detallada paso a paso |
| `docs/workflows.md` | Flujos funcionales con messageId reales |
| `docs/decisions.md` | Decisiones técnicas y trade-offs |
| `docs/coding-standards.md` | Convenciones de código actuales |
| `docs/testing.md` | Estado actual de testing y recomendaciones |
| `docs/deployment.md` | Despliegue manual y Docker propuesto |
| `docs/agents.md` | Guía para agentes IA que trabajen en el repo |
| `AGENTS.md` | Instrucciones para agentes (raíz del proyecto) |

Planes útiles:

| Archivo | Contenido |
|---------|-----------|
| `.hermes/plans/2026-05-14_120000-levantar-noxus.md` | Setup/import inicial |
| `.hermes/plans/2026-05-14_220000-migrar-node25-pnpm.md` | Migración Node 25 + pnpm |
| `.hermes/plans/2026-05-14_202655-migrar-mongodb-42-a-80.md` | Plan futuro MongoDB 8.0 |

---

## Estructura

```text
src/               # Código fuente del servidor
├── app.js         # Entry point
├── io/            # Binary I/O, protocolo Dofus
├── network/       # Servidores TCP (auth + world)
├── handlers/      # Manejadores de mensajes
├── game/          # Lógica de juego (combate, pathfinding, NPCs...)
├── database/      # MongoDB + Datacenter en RAM
├── managers/      # Gestores globales
├── enums/         # Enumeraciones
└── utils/         # Utilidades
db/                # Datos de juego en JSON
tools/             # Herramientas de extracción (.d2o → JSON)
patch/             # DofusInvoker.swf modificado
docs/              # Documentación
client-test.js     # Cliente de prueba en Node.js
```

---

## Puertos

| Servicio | Puerto | Protocolo |
|----------|--------|-----------|
| Auth Server | 443 | TCP |
| World Server | 5556 | TCP |
| MongoDB | 27017 | TCP |

---

## Bugs conocidos / deuda técnica

- **Contraseñas en texto plano** — `auth_handler.js` compara sin hash.
- **Pathfinding del servidor comentado** — confía en el cliente en varios flujos.
- **`remove_mp_buff.js` es un stub** — copiado de `remove_ap_buff.js`.
- **Estado global mutable** — `AuthServer.clients`, `WorldServer.clients`, etc.
- **Callbacks conservados** — `DBManager` usa Promises internamente, pero mantiene
  API callback para minimizar cambios.
- **Dependencias circulares** — resueltas con lazy `require`, pero el grafo sigue
  siendo frágil.
- **Rate limiting ausente** — sin protección anti brute-force.

---

## Créditos

- **Autores originales**: Yuki, Arkalius, Yamisaaf (2016)
- **Revival Linux + documentación + migración Node 25**: Hermes + eduobr (2026)
- **Repositorio original**: Azure DevOps (nightwolfdev)

---

## Licencia

ISC — ver `package.json`.
