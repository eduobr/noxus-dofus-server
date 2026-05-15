# Noxus — Testing

## Estado actual

**No hay tests implementados.** El script `test` en `package.json` es un
placeholder:

```json
"scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
}
```

## Frameworks

Ninguno configurado. No se detectaron dependencias de testing (Mocha, Jest,
Jasmine, etc.) en `package.json`.

## Cómo correr tests

Actualmente no hay suite automatizada. El comando `pnpm test` es un placeholder
que imprime `TODO: tests`.

Sí existe un cliente de integración manual, `client-test.js`, que valida el
flujo TCP completo auth → world → selección de personaje → contexto de juego,
stats, mapa, movimiento, interacción, chat, items, friends, shortcuts, spells
y NPCs:

```bash
node client-test.js
```

### Cobertura actual (v11)

| Fase | Mensajes validados | Checks |
|------|-------------------|--------|
| Auth + Login | ProtocolRequired, HelloConnect, Identification, LoginSuccess, ServersList, SelectedServerData | 6 |
| Mundo + Personaje | AuthTicket, CharactersList, CharSelected, GameContextCreate | 4 |
| Stats | CharacterStatsList, UpdateLifePoints, InventoryWeight, InventoryContent | 4 |
| Mapas | CurrentMap, MapComplementaryInfo | 2 |
| Movimiento | GameMapMovement | 1 |
| Interacción | InteractiveUsed | 1 |
| Chat | ChatServerMessage | 1 |
| Items | ObjectMovement, InventoryContent (item de prueba) | 2 |
| Friends | FriendsList, FriendWarn | 2 |
| Shortcuts | ShortcutBarRefresh, ShortcutBarContent | 2 |
| Spells | SpellList, SpellModifyRequest (dispatch sin crash) | 1 |
| NPCs | GameRolePlayShowActor (detección NPC), NpcGenericActionRequest | 2 |
| **Total** | | **26+ checks** |

El NPC de prueba (`_id=81`) se instancia en el mapa 173277699 como spawn
(`_id=4`, cellId=350, direction=1). Al cargar el mapa, el servidor envía
`GameRolePlayShowActorMessage` (msgId 5632) con el NPC como actor. El cliente
envía `NpcGenericActionRequestMessage` (5898) para validar que el handler de
NPCs no crashea. Como el NPC 81 no tiene replies de diálogo configuradas
(messageId=null en `npcs_actions`), el diálogo no se abre — la validación se
limita a "handler dispatch sin crash".

Para validar diálogo completo, se necesitaría insertar entries en
`npcs_replies` con un `messageId` que coincida con el de la acción 3 del NPC.

Llegar al veredicto `SERVIDOR FUNCIONAL` cuenta como éxito funcional. Si solo se
necesita validar arranque básico, llegar a `GameContextCreateMessage` /
`¡CONTEXTO DE JUEGO CREADO!` sigue siendo una señal útil de que auth y world
funcionan.

## Convenciones para crear pruebas (recomendación)

Si se decide añadir tests en el futuro, se sugiere:

### Framework recomendado

- **Jest** o **Mocha + Chai** para tests unitarios
- **Supertest** o similar para tests de integración de sockets TCP

### Estructura sugerida

```
Dofus/
├── src/
├── tests/
│   ├── unit/
│   │   ├── handlers/
│   │   ├── game/
│   │   │   ├── fight/
│   │   │   ├── spell/
│   │   │   └── pathfinding/
│   │   └── database/
│   ├── integration/
│   │   ├── auth_server.test.js
│   │   └── world_server.test.js
│   └── fixtures/
│       └── test_data.json
```

### Qué testear primero

1. **Pathfinding**: el algoritmo Dijkstra + Dofus1Line es pura lógica,
   testeable sin MongoDB ni red.
2. **Sistema de combate**: `fight_spell_processor.js`, cálculo de daños,
   efectos de hechizos.
3. **Serialización de mensajes**: `messages.js` tiene ~5000 líneas de
   serialize/deserialize que deberían ser idempotentes.
4. **Handlers**: mockear `client` y verificar que los mensajes de respuesta
   son correctos.

### Setup de tests

```bash
pnpm add -D jest
```

Script en `package.json`:
```json
"scripts": {
    "test": "jest",
    "test:watch": "jest --watch"
}
```

### Ejemplo de test unitario para pathfinding

```js
const Pathfinding = require('../src/game/pathfinding/pathfinding')

describe('Pathfinding', () => {
    it('debería encontrar ruta entre celdas adyacentes', () => {
        const path = Pathfinding.findPath(map, startCell, endCell);
        expect(path).toBeDefined();
        expect(path.length).toBeGreaterThan(0);
    });
});
```

## CI/CD

No hay configuración de CI/CD. Si se implementa, se sugiere GitHub Actions o
Azure Pipelines (dado que el repo original estaba en Azure DevOps).
