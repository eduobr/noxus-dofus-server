# Plan — Fases C, D, E: Ampliación de validación funcional

Fecha: 2026-05-15
Repositorio: `/home/enoh/Documentos/mis-proyectos/Dofus`
Proyecto: Noxus — emulador Dofus 2.39
Runtime: Node.js 25.3.0 + pnpm 11.1.2
Base: MongoDB 8.0 en Docker, contenedor `noxus-mongo8`

## Contexto

Las fases A (levantar servidor) y B (datos del mundo) están completas. El servidor arranca sin errores, los datos del mundo están importados, y el client-test v9 valida 17 checks automatizados: auth → personaje → stats → mapa → movimiento → interacción → chat.

Quedan 3 áreas grandes del protocolo sin validar:

| Área | Handlers sin probar | Requiere setup |
|---|---|---|
| Items + Inventario | `ObjectSetPositionMessage` (3021), `ObjectDeleteMessage` (3022) | Ninguno |
| Friends/Ignored | 5 handlers (4004, 4001, 5603, 5602, 6192) | Ninguno |
| Hechizos | `SpellModifyRequestMessage` (6655) | Ninguno |
| Shortcuts | 3 handlers (6225, 6230, 6228) | Ninguno |
| NPCs/Diálogos | 4 handlers (5898, 5616, 5774, 5778) | Crear NPC spawn en mapa inicial |
| Combate | 10 handlers (5731, 5732, 704, 708, 701, 255, 718, 1005, 6081, 6330, 6191) | Config `monsters.groups_per_map`, spawns de monstruos |
| Party | 10 handlers | 2 jugadores simultáneos |
| Exchange/Trade | 5 handlers | 2 jugadores |

---

## 1. Diagnóstico inicial

| Componente | Estado actual | Estado necesario | Acción |
|---|---|---|---|
| client-test | v9, 17 checks | v10-v12, ~25 checks | Extender con items + friends |
| Items en inventario | Bolsa vacía (solo kamas) | 1 item de prueba | Insertar item en BD |
| NPC spawns | 3 total, 0 en mapa 173277699 | 1 spawn en mapa inicial | Insertar spawn en BD |
| `config.json` monsters | No existe `monsters.groups_per_map` | Agregar clave | Modificar config.json (requiere aprobación) |
| Monstruos en mapa | Ninguno con spawns | Mapa con monstruos | Configurar subárea con monsters |
| Errores de servidor | 0 | 0 | Mantener |

---

## 2. Plan paso a paso

### Fase C — Items, Friends y Shortcuts (sin setup adicional)

Objetivo: validar los handlers que no requieren modificar la base de datos ni config.json.

Estado: pendiente.

#### C.1 — Insertar item de prueba en el inventario del personaje

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock

# Buscar un item bag asociado al personaje
docker exec noxus-mongo8 mongosh --quiet Noxus --eval '
  var ch = db.characters.findOne({_id:27}, {bagId:1, name:1});
  printjson(ch);
'
```

Si no tiene bolsa, crear una. Si tiene, insertar un item de prueba (templateId existente en `db/items.json`).

#### C.2 — Extender client-test a v10: Items

Agregar al flujo post-chat:

1. `ObjectSetPositionMessage` (3021): mover item de posición en inventario
   - Formato: objectUID(varInt) + position(varShort) + quantity(varInt)
2. Validar respuesta `ObjectMovementMessage` o `InventoryContentMessage` (3016) actualizado

#### C.3 — Extender client-test a v10: Friends

Agregar:

1. `FriendsGetListMessage` (4001): solicitar lista de amigos
   - Sin body (payload vacío)
2. Validar `FriendsListMessage` (esperado: lista vacía)
3. `FriendSetWarnOnConnectionMessage` (5602): toggle warn on connection
   - Formato: enable(bool)

#### C.4 — Extender client-test a v10: Shortcuts

1. `ShortcutBarAddRequestMessage` (6225): añadir atajo
   - Formato: barType(byte) + shortcut(variable tipo Shortcut)
2. Validar `ShortcutBarContentMessage` (6231) actualizado

#### C.5 — Extender client-test a v10: SpellModify

1. `SpellModifyRequestMessage` (6655): modificar hechizo
   - Formato: spellId(varInt) + position(byte)

**Criterios de éxito:**
- 0 errores en servidor
- ~22 checks pasados en client-test v10
- Items, friends, shortcuts y spells responden sin crash

---

### Fase D — NPCs y diálogos

Objetivo: crear un NPC spawn en el mapa inicial y validar interacción NPC.

Estado: pendiente.

#### D.1 — Insertar NPC spawn en el mapa 173277699

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock

# Insertar spawn de NPC 81 (ya existe en la BD) en el mapa inicial
docker exec noxus-mongo8 mongosh --quiet Noxus --eval '
  db.npcs_spawns.insertOne({
    _id: 4,
    npcId: 81,
    mapId: "173277699",
    cellId: 350,
    direction: 1,
    description: "NPC de prueba client-test"
  });
'
```

#### D.2 — Extender client-test a v11: NPCs

Agregar al flujo (en el mapa inicial, antes del moveto):

1. `NpcGenericActionRequestMessage` (5898): interactuar con NPC
   - Formato: npcId(varInt) + npcMapId(int) + npcActionId(byte)
2. Validar respuesta: `NpcDialogCreationMessage` (esperado si el NPC tiene diálogo)
3. Si hay diálogo: `NpcDialogReplyMessage` (5616) para responder

**Criterios de éxito:**
- NPC aparece en `MapComplementaryInformationsDataMessage` (226) como actor adicional
- `NpcGenericActionRequestMessage` no crashea
- Si el NPC tiene réplicas configuradas, responde con diálogo

---

### Fase E — Combate

Objetivo: configurar monstruos en un mapa y validar inicio de combate.

Estado: pendiente.

#### E.1 — Configurar `monsters.groups_per_map` en config.json

Requiere aprobación del usuario. Se propone agregar:

```json
"monsters": {
  "groups_per_map": 3
}
```

#### E.2 — Configurar spawn de monstruos en subárea accesible

1. Identificar la subárea del mapa 173277699 (subAreaId=874)
2. Verificar si `db/monsters.json` tiene entradas para esa subárea
3. Si no, elegir otra subárea con monstruos y teleport al personaje allí

#### E.3 — Extender client-test a v12: Combate

Agregar al flujo:

1. `GameRolePlayAttackMonsterRequestMessage` (6191): atacar grupo de monstruos
   - Formato: monsterGroupId(double)
2. Validar respuesta: `GameFightStartingMessage`, `GameFightJoinMessage`
3. `GameFightPlacementPositionRequestMessage` (704): elegir posición inicial
4. `GameFightReadyMessage` (708): confirmar listo
5. `GameFightTurnFinishMessage` (718): pasar turno (si aplica)
6. `GameContextQuitMessage` (255): salir del combate

**Criterios de éxito:**
- El combate inicia sin crash
- Se reciben mensajes de join/start
- El personaje puede salir del combate limpiamente

---

## 3. Resumen de archivos a modificar/crear

| Ruta | Acción | Propósito |
|---|---|---|
| `client-test.js` | MODIFICAR (v10, v11, v12) | Agregar handlers items, friends, shortcuts, spells, NPCs, combate |
| `config.json` | MODIFICAR (Fase E) | Agregar `monsters.groups_per_map` |
| `.hermes/plans/2026-05-15_fases-cde-ampliacion.md` | CREAR | Este plan |
| MongoDB `npcs_spawns` | INSERTAR (Fase D) | NPC de prueba en mapa 173277699 |
| MongoDB `items_bags` | INSERTAR (Fase C) | Item de prueba en bolsa del personaje |

**NO modificar:**
- `src/` — solo si aparecen bugs durante la validación
- `db/*.json` — usar como fuente, no alterar
- `tools/`, `export/` — fuera de alcance

---

## 4. Riesgos y plan B

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| `ObjectSetPositionMessage` crashea por bolsa vacía | Media | Bajo | Insertar item de prueba primero |
| NPC 81 no tiene réplicas configuradas | Alta | Bajo | El handler no crashea aunque no haya diálogo |
| `npcs_replies` no tiene entradas para NPC 81 | Alta | Bajo | Solo validar que no crashea |
| `config.json` requiere aprobación para modificar | — | — | Preguntar antes de Fase E |
| Subárea 874 no tiene monstruos | Alta | Medio | Elegir subárea con monstruos (ej. 511 del mapa 144931) y teleport |
| Combate requiere 2 turnos mínimos | Media | Medio | Probar solo inicio + salida si no se puede completar |
| `GameFightTurnFinishMessage` crashea sin IA enemiga | Alta | Medio | Validar solo hasta posicionamiento |

---

## 5. Validación final

Checklist observable de éxito:

- [ ] `node src/app.js` arranca con 0 ERROR
- [ ] `node client-test.js` (v10) pasa ≥22 checks con items, friends, shortcuts, spells
- [ ] `node client-test.js` (v11) interactúa con NPC sin crash
- [ ] `node client-test.js` (v12) inicia combate sin crash
- [ ] `config.json` solo modificado en Fase E, con aprobación previa
- [ ] `git status --short` solo muestra archivos esperados

---

## 6. Tiempo estimado

| Fase | Tiempo estimado |
|---|---|
| C.1 — Insertar item de prueba | 5 min |
| C.2-C.5 — Extender client-test v10 (items, friends, shortcuts, spells) | 20-30 min |
| D.1 — Insertar NPC spawn | 5 min |
| D.2 — Extender client-test v11 (NPCs) | 15-20 min |
| E.1-E.2 — Configurar monstruos | 10-15 min |
| E.3 — Extender client-test v12 (combate) | 25-35 min |
| Buffer de troubleshooting | 20-30 min |

Tiempo total esperado sin incidencias: 80-110 min.
Tiempo con troubleshooting: 110-150 min.
