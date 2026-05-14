# Noxus — Dofus 2.39 Server Emulator

Emulador de servidor privado para Dofus 2.39. Originalmente creado en 2016 por
Yuki, Arkalius y Yamisaaf. Revivido, documentado y adaptado a Linux en 2026.

**Estado**: ✅ Funcional — login, personajes, mundo, combate.

---

## Stack

| Componente | Tecnología |
|-----------|-----------|
| Runtime | Node.js 8.17.0 |
| Base de datos | MongoDB 3.6 |
| Protocolo | Dofus 2.39 (TCP binario, ID 1738) |
| Build | Babel 6 (ES2015 → ES5) |
| Cliente | Dofus 2.39 Flash (.swf) + Flash Projector |
| SO | Linux (probado en Arch) |

---

## Requisitos

- Node.js 8.17.0 ([nvm](https://github.com/nvm-sh/nvm) recomendado)
- MongoDB 3.6 ([Docker](https://www.docker.com/) recomendado)
- npm 6.x
- Flash Player Projector (para el cliente)
- Cliente Dofus 2.39 completo (~2-4 GB)

---

## Instalación rápida

```bash
# 1. Clonar
git clone https://github.com/eduobr/noxus-dofus-server.git
cd noxus-dofus-server

# 2. Node 8
nvm install 8.17.0
nvm use 8.17.0

# 3. MongoDB (Docker)
docker run -d --name noxus-mongo -p 27017:27017 -v noxus-data:/data/db mongo:3.6

# 4. Importar datos de juego
for f in db/*.json; do
  collection=$(basename "$f" .json)
  docker exec -i noxus-mongo mongoimport --db Noxus --collection "$collection" \
    --jsonArray --drop --file - < "$f" 2>/dev/null || \
  docker exec -i noxus-mongo mongoimport --db Noxus --collection "$collection" \
    --drop --file - < "$f"
done

# 5. Dependencias
npm install

# 6. Compilar
./node_modules/.bin/babel src --out-dir dist

# 7. Dar permiso al puerto 443
sudo setcap 'cap_net_bind_service=+ep' $(which node)

# 8. Iniciar
node dist/app.js
```

Salida esperada:
```
[INFOS] : Auth server started on 127.0.0.1:443
[INFOS] : World server started on 127.0.0.1:5556
[INFOS] : Server started successfully !
```

---

## Cliente de prueba

```bash
node client-test.js
```

Salida esperada:
```
[OK] Login exitoso
[OK] Ticket aceptado por World
[OK] Personajes recibidos
[OK] Personaje seleccionado: Bizelzapobany
[OK] 🎉 ¡CONTEXTO DE JUEGO CREADO!
```

---

## Cuenta de prueba

El servidor incluye una cuenta pre-cargada:

| Campo | Valor |
|-------|-------|
| Usuario | `test` |
| Password | `test` |
| Personaje | Bizelzapobany (Feca, nivel 150) |

Para crear tu propia cuenta:

```bash
docker exec -i noxus-mongo mongo Noxus --eval "
db.accounts.insert({
  uid: 100, username: 'miuser', password: 'mipass',
  nickname: 'MiNick', role: 4, locked: 0
})"
```

---

## Documentación

| Archivo | Contenido |
|---------|-----------|
| `docs/overview.md` | Resumen del proyecto, stack, módulos |
| `docs/architecture.md` | Arquitectura completa, capas, patrones, riesgos |
| `docs/setup.md` | Instalación detallada paso a paso |
| `docs/workflows.md` | 10 flujos funcionales con messageId reales |
| `docs/decisions.md` | Decisiones técnicas y trade-offs |
| `docs/coding-standards.md` | Convenciones de código del proyecto |
| `docs/testing.md` | Estado actual de testing y recomendaciones |
| `docs/deployment.md` | Despliegue y Docker propuesto |
| `docs/agents.md` | Guía para agentes IA que trabajen en el repo |
| `AGENTS.md` | Instrucciones para agentes (raíz del proyecto) |

---

## Estructura

```
src/               # Código fuente del servidor
├── app.js         # Entry point
├── io/            # Binary I/O, protocolo Dofus
├── network/       # Servidores TCP (auth + world)
├── handlers/      # 15 manejadores de mensajes
├── game/          # Lógica de juego (combate, pathfinding, NPCs...)
├── database/      # MongoDB + Datacenter en RAM
├── managers/      # Gestores globales
├── enums/         # 14 enumeraciones
└── utils/         # Utilidades
db/                # Datos de juego en JSON (28 colecciones)
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

## Bugs conocidos

- **Contraseñas en texto plano** — `auth_handler.js` compara sin hash
- **Pathfinding del servidor comentado** — confía en el cliente
- **`remove_mp_buff.js` es un stub** — copiado de `remove_ap_buff.js`
- **`CharacterLoadingCompleteMessage` no pasa messageId a `super()`**
- **Rate limiting ausente** — sin protección anti brute-force

---

## Créditos

- **Autores originales**: Yuki, Arkalius, Yamisaaf (2016)
- **Revival Linux + documentación**: Hermes + eduobr (2026)
- **Repositorio original**: Azure DevOps (nightwolfdev)

---

## Licencia

ISC — ver `package.json`.
