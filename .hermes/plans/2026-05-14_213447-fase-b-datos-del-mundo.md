# Plan — Fase B: Datos del mundo en MongoDB 8.0

Fecha: 2026-05-14
Repositorio: `/home/enoh/Documentos/mis-proyectos/Dofus`
Proyecto: Noxus — emulador Dofus 2.39
Runtime objetivo: Node.js 25.3.0 + pnpm 11.1.2
Base objetivo: MongoDB 8.0 en Docker, contenedor `noxus-mongo8`, volumen `noxus-mongo8-data`

## Alcance de esta fase

Trabajar únicamente en la Fase B: Datos del mundo.

Objetivo: reparar el estado incompleto de datos estáticos del mundo en MongoDB 8.0, preservando rollback, sin tocar `config.json`, sin modificar `tools/` ni `export/`, y sin hacer refactors de código.

Este plan se basa en la auditoría previa, que confirmó:

- `maps` está vacía/no existe en MongoDB 8.0.
- `maps_positions`, `map_scroll_actions`, `experiences` e `items` también están vacías/no existen.
- `elements` existe, pero parece parcial: 17.000 docs actuales vs 26.742 docs importables desde `db/elements.json`.
- `client-test.js` llega a `GameContextCreateMessage` porque el servidor envía ese mensaje antes de validar que el mapa real cargó correctamente.

---

## 1. Diagnóstico inicial

| Componente / colección | Estado actual auditado | Estado necesario | Acción propuesta |
|---|---:|---:|---|
| Node.js | 25.3.0 disponible | 25.3.0 | Verificar antes de validar |
| pnpm | 11.1.2 disponible | 11.1.2 | No se requieren cambios |
| MongoDB | 8.0.23 en `noxus-mongo8` | MongoDB 8.0 activo | Verificar antes de importar |
| Docker Desktop | Socket en `/home/enoh/.docker/desktop/docker.sock` | Usar ese socket | Exportar `DOCKER_HOST` |
| Contenedor activo | `noxus-mongo8` activo | `noxus-mongo8` activo | Mantener |
| Rollback legacy | `noxus-mongo` detenido | No eliminar | Mantener detenido |
| `config.json` | Funcional para localhost:27017 | Sin cambios | No modificar |
| `backups/` | Ignorado por Git | Backup lógico local | Crear backup antes de `--drop` |
| `maps` | 0 docs | 12.167 docs | Importar desde `db/maps.json` limpio |
| `maps_positions` | 0 docs | 12.012 docs | Importar desde `db/maps_positions.json` limpio |
| `map_scroll_actions` | 0 docs | 1.396 docs | Importar desde `db/map_scroll_actions.json` limpio |
| `experiences` | 0 docs | 200 docs | Importar desde `db/experiences.json` limpio |
| `items` | 0 docs | 15.861 docs | Importar desde `db/items.json` limpio |
| `elements` | 17.000 docs | 26.742 docs | Reimportar con `--drop` desde `db/elements.json` limpio |
| `areas` | No confirmado por código | No requerida en esta fase | No importar |
| `subareas` | No confirmado por código | No requerida en esta fase | No importar |
| `interactives` | No confirmado por código; código usa `interactives_objects` | No requerida en esta fase | No importar |
| `ornaments` | No confirmado por código | No requerida en esta fase | No importar |
| `npcs_messages` | Existe; uso no confirmado aunque hay método DBManager | No tocar | No importar |

---

## 2. Plan paso a paso

### Fase 0 — Preparar entorno

Objetivo: asegurar que todos los comandos se ejecuten contra el repo correcto, Node 25 y Docker Desktop.

Estado: pendiente.

Comandos:

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus
export PATH="/home/enoh/.nvm/versions/node/v25.3.0/bin:$PATH"
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock
node --version
pnpm --version
docker ps -a --filter name=noxus-mongo --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker exec noxus-mongo8 mongosh --quiet --eval 'db.version()'
```

Criterios de éxito:

- `node --version` muestra `v25.3.0`.
- `pnpm --version` muestra `11.1.2`.
- `noxus-mongo8` aparece activo.
- `noxus-mongo` aparece detenido; no se elimina.
- MongoDB reporta versión `8.0.x`.

Riesgos específicos:

- Docker Desktop puede no estar levantado.
- `DOCKER_HOST` puede apuntar al socket incorrecto si no se exporta.

---

### Fase 1 — Capturar estado pre-importación

Objetivo: dejar evidencia del estado real antes de tocar datos.

Estado: pendiente.

Comandos:

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock

mkdir -p backups/phaseB-world-data-precheck

docker exec noxus-mongo8 mongosh --quiet Noxus --eval '
print("== collection counts ==")
db.getCollectionNames().sort().forEach(function(n) {
  print(n + ": " + db.getCollection(n).countDocuments())
})
print("== character/map checks ==")
var ch = db.characters.findOne({_id: 27})
printjson({
  character27: ch && { name: ch.name, mapid: ch.mapid, cellid: ch.cellid, dirId: ch.dirId },
  mapsTotal: db.maps.countDocuments(),
  mapForCharacter: ch ? db.maps.countDocuments({_id: ch.mapid}) : null,
  mapsPositionsTotal: db.maps_positions.countDocuments(),
  mapPositionForCharacter: ch ? db.maps_positions.countDocuments({_id: ch.mapid}) : null,
  mapScrollActionsTotal: db.map_scroll_actions.countDocuments(),
  experiencesTotal: db.experiences.countDocuments(),
  itemsTotal: db.items.countDocuments(),
  elementsTotal: db.elements.countDocuments()
})
' | tee backups/phaseB-world-data-precheck/pre-import-counts.txt

git status --short | tee backups/phaseB-world-data-precheck/pre-import-git-status.txt
```

Criterios de éxito:

- Se guarda `backups/phaseB-world-data-precheck/pre-import-counts.txt`.
- Se guarda `backups/phaseB-world-data-precheck/pre-import-git-status.txt`.
- `backups/` sigue ignorado por Git.

Riesgos específicos:

- Si `characters` no contiene `_id:27`, ajustar la validación funcional al personaje disponible antes de importar.

---

### Fase 2 — Crear backup lógico completo antes de cualquier `--drop`

Objetivo: preservar rollback lógico de la base `Noxus` antes de reemplazar colecciones estáticas.

Estado: pendiente.

Comandos:

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock

BACKUP_DIR="backups/phaseB-world-data-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

docker exec noxus-mongo8 mongodump \
  --db Noxus \
  --archive=/tmp/noxus-phaseB-before-import.archive \
  --gzip

docker cp \
  noxus-mongo8:/tmp/noxus-phaseB-before-import.archive \
  "$BACKUP_DIR/noxus-phaseB-before-import.archive.gz"

docker exec noxus-mongo8 rm -f /tmp/noxus-phaseB-before-import.archive

ls -lh "$BACKUP_DIR/noxus-phaseB-before-import.archive.gz"
printf '%s\n' "$BACKUP_DIR" | tee backups/phaseB-world-data-precheck/latest-backup-dir.txt
```

Criterios de éxito:

- Existe un archivo `.archive.gz` en `backups/phaseB-world-data-*`.
- El archivo tiene tamaño mayor que cero.
- No se versiona porque `backups/` está en `.gitignore`.

Riesgos específicos:

- Falta de espacio en disco.
- Backup fallido por contenedor detenido.

---

### Fase 3 — Generar archivos JSON limpios preservando `_id`

Objetivo: convertir los JSON legacy a JSON importable por MongoDB 8 sin perder claves semánticas.

Estado: pendiente.

Regla de limpieza:

- `NumberInt(123)` → `123`
- `NumberLong(123)` → `123`
- `ObjectId("hex24")` → `{ "$oid": "hex24" }`
- No borrar `_id` en `maps`, `maps_positions`, `items` ni `elements`.

Comandos:

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus

rm -rf /tmp/noxus-phaseB-cleaned
mkdir -p /tmp/noxus-phaseB-cleaned

python - <<'PY'
from pathlib import Path
import re

src = Path("db")
out = Path("/tmp/noxus-phaseB-cleaned")
out.mkdir(exist_ok=True)

files = [
    "maps.json",
    "maps_positions.json",
    "map_scroll_actions.json",
    "experiences.json",
    "items.json",
    "elements.json",
]

for name in files:
    text = (src / name).read_text(errors="replace")
    text = re.sub(r'NumberInt\((-?\d+)\)', r'\1', text)
    text = re.sub(r'NumberLong\((-?\d+)\)', r'\1', text)
    text = re.sub(r'ObjectId\("([0-9a-fA-F]{24})"\)', r'{"$oid":"\1"}', text)
    target = out / name
    target.write_text(text)
    print(f"{name}: {target} ({target.stat().st_size} bytes)")
PY

ls -lh /tmp/noxus-phaseB-cleaned
```

Criterios de éxito:

- Se crean seis archivos en `/tmp/noxus-phaseB-cleaned`.
- Los archivos no contienen `NumberInt(`, `NumberLong(` ni `ObjectId(`.

Comandos de verificación opcional:

```bash
! grep -R 'NumberInt\|NumberLong\|ObjectId(' /tmp/noxus-phaseB-cleaned
```

Riesgos específicos:

- Una sustitución incorrecta de `ObjectId()` podría romper `_id` en `experiences` o `map_scroll_actions`.
- Borrar `_id` en mapas/items rompería el servidor; por eso este plan conserva `_id`.

---

### Fase 4 — Prueba de importación en base temporal

Objetivo: validar que los archivos limpios importan correctamente antes de tocar `Noxus`.

Estado: pendiente.

Comandos:

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock

docker exec noxus-mongo8 mongosh --quiet --eval 'db.getSiblingDB("Noxus_phaseB_audit").dropDatabase()'

for f in maps maps_positions map_scroll_actions experiences items elements; do
  docker cp "/tmp/noxus-phaseB-cleaned/$f.json" "noxus-mongo8:/tmp/$f-cleaned.json"
  docker exec noxus-mongo8 mongoimport \
    --quiet \
    --db Noxus_phaseB_audit \
    --collection "$f" \
    --file "/tmp/$f-cleaned.json"
  docker exec noxus-mongo8 mongosh --quiet Noxus_phaseB_audit --eval "print('$f: ' + db.getCollection('$f').countDocuments())"
done

docker exec noxus-mongo8 mongosh --quiet Noxus_phaseB_audit --eval '
printjson({
  maps: db.maps.countDocuments(),
  maps_positions: db.maps_positions.countDocuments(),
  map_scroll_actions: db.map_scroll_actions.countDocuments(),
  experiences: db.experiences.countDocuments(),
  items: db.items.countDocuments(),
  elements: db.elements.countDocuments(),
  map173277699: db.maps.countDocuments({_id: 173277699}),
  mapPosition173277699: db.maps_positions.countDocuments({_id: 173277699}),
  expLevel1: db.experiences.findOne({level: 1}, {_id: 0}),
  itemSample: db.items.findOne({}, {_id: 1, nameId: 1, typeId: 1}),
  elementSample: db.elements.findOne({}, {_id: 1, Element_id: 1, Map_id: 1})
})
'
```

Conteos esperados en base temporal:

| Colección | Conteo esperado |
|---|---:|
| maps | 12.167 |
| maps_positions | 12.012 |
| map_scroll_actions | 1.396 |
| experiences | 200 |
| items | 15.861 |
| elements | 26.742 |

Criterios de éxito:

- Todos los conteos coinciden con la tabla.
- `map173277699` devuelve `1`.
- `mapPosition173277699` devuelve `1`.
- `expLevel1` no es `null`.

Riesgos específicos:

- Si algún conteo no coincide, detener el plan y revisar el archivo limpio antes de tocar `Noxus`.

---

### Fase 5 — Importar/reparar colecciones en `Noxus`

Objetivo: reemplazar solo las colecciones estáticas necesarias para que el mundo real pueda cargar.

Estado: pendiente.

Prerequisito obligatorio:

- Fase 2 completada con backup lógico válido.
- Fase 4 completada con conteos correctos en `Noxus_phaseB_audit`.

Comandos:

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock

for f in maps maps_positions map_scroll_actions experiences items elements; do
  docker cp "/tmp/noxus-phaseB-cleaned/$f.json" "noxus-mongo8:/tmp/$f-cleaned.json"
done

docker exec noxus-mongo8 mongoimport --db Noxus --collection maps \
  --drop --file /tmp/maps-cleaned.json

docker exec noxus-mongo8 mongoimport --db Noxus --collection maps_positions \
  --drop --file /tmp/maps_positions-cleaned.json

docker exec noxus-mongo8 mongoimport --db Noxus --collection map_scroll_actions \
  --drop --file /tmp/map_scroll_actions-cleaned.json

docker exec noxus-mongo8 mongoimport --db Noxus --collection experiences \
  --drop --file /tmp/experiences-cleaned.json

docker exec noxus-mongo8 mongoimport --db Noxus --collection items \
  --drop --file /tmp/items-cleaned.json

docker exec noxus-mongo8 mongoimport --db Noxus --collection elements \
  --drop --file /tmp/elements-cleaned.json
```

Justificación de `--drop`:

- `maps`, `maps_positions`, `map_scroll_actions`, `experiences` e `items` están vacías o no existen.
- `elements` existe pero está parcial; importar encima podría dejar datos duplicados/inconsistentes.
- Hay backup lógico previo.
- Son datos estáticos del juego importados desde `db/`, no datos dinámicos de usuario.

Riesgos específicos:

- Si se omite el backup, no ejecutar esta fase.
- Si se ejecuta contra una base distinta a `Noxus`, se rompe la validación.
- Si `elements` contiene modificaciones manuales no documentadas, `--drop` las reemplazará; la auditoría previa no encontró evidencia de que sean datos dinámicos.

---

### Fase 6 — Validar conteos post-importación

Objetivo: confirmar que MongoDB quedó con los datos estáticos requeridos por el código.

Estado: pendiente.

Comandos:

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock

docker exec noxus-mongo8 mongosh --quiet Noxus --eval '
print("== post-import counts ==")
[
  "maps",
  "maps_positions",
  "map_scroll_actions",
  "experiences",
  "items",
  "elements"
].forEach(function(n) {
  print(n + ": " + db.getCollection(n).countDocuments())
})

print("== character/map checks ==")
var ch = db.characters.findOne({_id: 27})
printjson({
  character27: ch && { name: ch.name, mapid: ch.mapid, cellid: ch.cellid, dirId: ch.dirId },
  mapForCharacter: ch ? db.maps.countDocuments({_id: ch.mapid}) : null,
  mapPositionForCharacter: ch ? db.maps_positions.countDocuments({_id: ch.mapid}) : null,
  expLevel1: db.experiences.findOne({level: 1}, {_id: 0}),
  itemSample: db.items.findOne({}, {_id: 1, nameId: 1, typeId: 1}),
  elementSample: db.elements.findOne({}, {_id: 1, Element_id: 1, Map_id: 1})
})
'
```

Conteos esperados:

| Colección | Conteo esperado |
|---|---:|
| maps | 12.167 |
| maps_positions | 12.012 |
| map_scroll_actions | 1.396 |
| experiences | 200 |
| items | 15.861 |
| elements | 26.742 |

Criterios de éxito:

- `mapForCharacter: 1`.
- `mapPositionForCharacter: 1`.
- `expLevel1` no es `null`.
- `itemSample` no es `null`.
- `elementSample` no es `null`.

Riesgos específicos:

- Si conteos quedan en 0, probablemente se usó mal `mongoimport` o el archivo no llegó al contenedor.

---

### Fase 7 — Limpiar temporales

Objetivo: borrar archivos temporales del contenedor y de `/tmp`, manteniendo solo el backup en `backups/`.

Estado: pendiente.

Comandos:

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock

for f in maps maps_positions map_scroll_actions experiences items elements; do
  docker exec noxus-mongo8 rm -f "/tmp/$f-cleaned.json"
done

docker exec noxus-mongo8 mongosh --quiet --eval 'db.getSiblingDB("Noxus_phaseB_audit").dropDatabase()'
rm -rf /tmp/noxus-phaseB-cleaned
```

Criterios de éxito:

- No queda base `Noxus_phaseB_audit`.
- No quedan `/tmp/*-cleaned.json` dentro del contenedor.
- Se conserva el backup en `backups/`.

Riesgos específicos:

- No borrar `backups/`.
- No borrar volúmenes Docker.

---

### Fase 8 — Validar arranque del servidor

Objetivo: confirmar que los datos reparados no rompen la carga inicial de Datacenter ni el arranque de auth/world.

Estado: pendiente.

Comandos:

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus
export PATH="/home/enoh/.nvm/versions/node/v25.3.0/bin:$PATH"
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock

pkill -f 'node src/app.js' 2>/dev/null || true
fuser -k 443/tcp 5556/tcp 2>/dev/null || true

node src/app.js 2>&1 | tee /tmp/noxus-phaseB-server.log
```

En otra terminal, verificar puertos cuando el servidor indique arranque completo:

```bash
ss -tlnp | grep -E ':(443|5556)\b'
```

Criterios de éxito:

- Log contiene `Connected to MongoDB`.
- Log contiene cargas de Datacenter con conteos no cero para las colecciones esperadas.
- Log contiene `Server started successfully !`.
- Puertos `127.0.0.1:443` y `127.0.0.1:5556` están en LISTEN.

Riesgos específicos:

- Si falta capability para puerto 443, aparecerá `EACCES`; el usuario maneja sudo/capabilities manualmente.
- Si el proceso queda corriendo de una validación anterior, liberar puertos antes de iniciar.

---

### Fase 9 — Validar smoke test conocido

Objetivo: confirmar que el flujo auth → world → personaje → contexto sigue funcionando después de reparar datos.

Estado: pendiente.

Comandos:

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus
export PATH="/home/enoh/.nvm/versions/node/v25.3.0/bin:$PATH"
node client-test.js 2>&1 | tee /tmp/noxus-phaseB-client-test.log
```

Criterios de éxito:

- Aparece:

```text
🎉 ¡CONTEXTO DE JUEGO CREADO!
```

- Si aparece timeout después del banner, se considera aceptable según la validación conocida.

Validación adicional específica de esta fase:

```bash
grep -E 'An error occured while trying to load a map|uncaughtException|TypeError' /tmp/noxus-phaseB-server.log || true
```

Criterio adicional deseado:

- No debe aparecer:

```text
An error occured while trying to load a map for the character Bizelzapobany
```

Riesgos específicos:

- `client-test.js` actual no valida completamente que el mapa haya enviado información complementaria; solo valida GameContextCreateMessage.
- Si se quiere una validación más fuerte, debe planearse una fase posterior para extender el cliente de prueba con MapInformationsRequestMessage.

---

### Fase 10 — Verificación de higiene final

Objetivo: dejar el repositorio limpio y documentar cualquier archivo generado.

Estado: pendiente.

Comandos:

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock

docker exec noxus-mongo8 mongosh --quiet --eval 'print(db.getMongo().getDBNames().filter(function(n) { return n.indexOf("Noxus_phaseB") >= 0 }).join(","))'
git status --short
```

Criterios de éxito:

- No aparece `Noxus_phaseB_audit`.
- `git status --short` está limpio, salvo este plan en `.hermes/plans/` si no está ignorado.
- No hay cambios en `config.json`.
- No hay cambios en `tools/` ni `export/`.

Riesgos específicos:

- Si `.hermes/plans/` no está ignorado, este plan aparecerá como archivo nuevo; eso es esperado y debe reportarse.

---

## 3. Resumen de archivos a modificar/crear

| Ruta | Acción | Propósito |
|---|---|---|
| `.hermes/plans/2026-05-14_213447-fase-b-datos-del-mundo.md` | CREAR | Plan operativo de reparación de datos del mundo |
| `backups/phaseB-world-data-precheck/pre-import-counts.txt` | CREAR, no versionar | Evidencia de conteos antes de importar |
| `backups/phaseB-world-data-precheck/pre-import-git-status.txt` | CREAR, no versionar | Evidencia de estado Git antes de importar |
| `backups/phaseB-world-data-*/noxus-phaseB-before-import.archive.gz` | CREAR, no versionar | Backup lógico rollback de MongoDB `Noxus` |
| `/tmp/noxus-phaseB-cleaned/*.json` | CREAR temporal | JSON limpio para `mongoimport` |
| `config.json` | NO MODIFICAR | Mantener conexión actual a MongoDB local |
| `tools/` | NO MODIFICAR | Fuera de alcance |
| `export/` | NO MODIFICAR | Fuera de alcance |
| `db/*.json` | NO MODIFICAR | Usar como fuente, no alterar |

---

## 4. Riesgos y plan B

| Riesgo | Probabilidad | Impacto | Mitigación / Plan B |
|---|---|---|---|
| Importar con `--drop` sin backup | Baja si se sigue el plan | Alto | Fase 2 es obligatoria antes de Fase 5 |
| Limpiar mal `ObjectId()` o `NumberInt()` | Media | Medio/Alto | Fase 4 prueba importación en base temporal antes de tocar `Noxus` |
| Borrar `_id` en `maps`, `maps_positions` o `items` | Baja si se sigue el script | Alto | Script preserva `_id`; no usar receta antigua que elimina `_id` |
| `elements` actual contiene datos manuales no documentados | Baja/Media | Medio | Backup lógico completo; justificar `--drop` por colección parcial |
| `mongoimport` importa 0 docs por usar ruta `-` incorrecta | Media | Medio | Copiar archivo al contenedor y usar `--file /tmp/...` |
| Docker Desktop no está activo | Media | Bajo | Verificar en Fase 0; arrancar Docker Desktop manualmente si falla |
| Puerto 443 ocupado o sin capability | Media | Bajo/Medio | Liberar puerto; si falta capability, usuario aplica `setcap` manualmente |
| Smoke test sigue pasando aunque mapa falle | Alta | Medio | Revisar log servidor buscando error de carga de mapa; considerar prueba extendida posterior |
| Se importa una colección no usada (`areas`, `subareas`, etc.) | Baja | Medio | Plan limita importación a colecciones confirmadas por código |
| Necesidad de rollback completo | Baja | Alto | Usar `mongorestore --drop --gzip --archive=...` desde backup |

Plan B lógico con backup:

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock

BACKUP_FILE="backups/phaseB-world-data-YYYYMMDD-HHMMSS/noxus-phaseB-before-import.archive.gz"

docker cp "$BACKUP_FILE" noxus-mongo8:/tmp/noxus-phaseB-before-import.archive.gz

docker exec noxus-mongo8 mongorestore \
  --drop \
  --gzip \
  --archive=/tmp/noxus-phaseB-before-import.archive.gz

docker exec noxus-mongo8 rm -f /tmp/noxus-phaseB-before-import.archive.gz
```

Plan B de contenedor legacy si MongoDB 8 queda inutilizable:

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock

pkill -f 'node src/app.js' 2>/dev/null || true
fuser -k 443/tcp 5556/tcp 27017/tcp 2>/dev/null || true

docker stop noxus-mongo8
docker start noxus-mongo
```

No eliminar `noxus-mongo` ni su volumen.

---

## 5. Validación final

Checklist observable de éxito:

- [ ] `noxus-mongo8` está activo y MongoDB reporta `8.0.x`.
- [ ] `noxus-mongo` legacy sigue existiendo y está detenido.
- [ ] Existe backup lógico en `backups/phaseB-world-data-*`.
- [ ] La base temporal `Noxus_phaseB_audit` fue eliminada.
- [ ] Conteos finales en `Noxus`:
  - [ ] `maps: 12167`
  - [ ] `maps_positions: 12012`
  - [ ] `map_scroll_actions: 1396`
  - [ ] `experiences: 200`
  - [ ] `items: 15861`
  - [ ] `elements: 26742`
- [ ] `db.maps.countDocuments({_id: 173277699})` devuelve `1`.
- [ ] `db.maps_positions.countDocuments({_id: 173277699})` devuelve `1`.
- [ ] `node src/app.js` arranca sin uncaught exceptions.
- [ ] El log del servidor muestra `Server started successfully !`.
- [ ] Los puertos `127.0.0.1:443` y `127.0.0.1:5556` están en LISTEN.
- [ ] `node client-test.js` llega a `🎉 ¡CONTEXTO DE JUEGO CREADO!`.
- [ ] El log del servidor no muestra `An error occured while trying to load a map for the character Bizelzapobany`.
- [ ] `config.json` no fue modificado.
- [ ] `tools/` no fue modificado.
- [ ] `export/` no fue modificado.
- [ ] `git status --short` está limpio o solo muestra este plan si `.hermes/plans/` no está ignorado.

---

## 6. Tiempo estimado

| Fase | Tiempo estimado |
|---|---:|
| Fase 0 — Preparar entorno | 3 min |
| Fase 1 — Capturar estado pre-importación | 5 min |
| Fase 2 — Backup lógico | 5–10 min |
| Fase 3 — Generar JSON limpio | 3–5 min |
| Fase 4 — Prueba en base temporal | 10–15 min |
| Fase 5 — Importar en `Noxus` | 10–15 min |
| Fase 6 — Validar conteos | 5 min |
| Fase 7 — Limpiar temporales | 3 min |
| Fase 8 — Validar arranque | 5–10 min |
| Fase 9 — Validar `client-test.js` | 1–2 min, más timeout conocido |
| Fase 10 — Higiene final | 3 min |
| Buffer de troubleshooting | 20–30 min |

Tiempo total esperado sin incidencias: 50–75 min.
Tiempo con troubleshooting: 75–105 min.

---

## 7. Nota técnica sobre el smoke test actual

`client-test.js` no es suficiente para certificar que el mundo está jugable.

Confirmado por código: `GameHandler.handleGameContextCreateRequestMessage()` envía `GameContextCreateMessage` antes de validar que `WorldManager.teleportClient()` haya cargado el mapa desde `db.maps`.

Por eso, después de esta fase, el criterio extra debe ser revisar el log del servidor y confirmar que ya no aparece el error de carga de mapa.

Una mejora futura, fuera del alcance de esta Fase B, sería ampliar el cliente de prueba para solicitar o validar `MapComplementaryInformationsDataMessage` después del contexto.
