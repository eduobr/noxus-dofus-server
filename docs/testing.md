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
flujo TCP completo auth → world → selección de personaje → contexto de juego:

```bash
node client-test.js
```

Llegar a `GameContextCreateMessage` / `¡CONTEXTO DE JUEGO CREADO!` cuenta como
éxito funcional aunque el proceso termine luego por timeout.

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
