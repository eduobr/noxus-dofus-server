# Noxus — AI Agent Guide

Guía para agentes de IA (como Hermes) que trabajen en este repositorio.

## Reglas generales

1. **No modificar sin entender**: este es un emulador de servidor de juego con
   protocolo binario. Un cambio menor puede romper la compatibilidad con el
   cliente Dofus.

2. **Español para comunicación con el usuario**: el usuario prefiere español
   para este proyecto.

3. **No borrar documentación existente sin preguntar**.

4. **No modificar `config.json` sin preguntar**: contiene configuración
   sensible de red y base de datos.

5. **No modificar archivos en `tools/` ni `export/`**: son herramientas de
   extracción y definiciones de protocolo exportadas.

6. **No modificar `patch/DofusInvoker.swf`**: es un binario.

## Archivos que leer ANTES de modificar código

Si vas a trabajar en una funcionalidad, lee estos archivos primero:

| Área              | Archivos a leer                                      |
|-------------------|------------------------------------------------------|
| Arranque          | `src/app.js`, `src/common.js`, `config.json`         |
| Red/Auth          | `src/network/auth.js`, `src/network/auth_client.js`  |
| Red/World         | `src/network/world.js`, `src/network/world_client.js`|
| Router            | `src/network/processor.js`                           |
| Protocolo         | `src/io/dofus/messages.js`, `src/io/custom_data_wrapper.js` |
| Base de datos     | `src/database/dbmanager.js`, `src/database/datacenter.js` |
| Combate           | `src/game/fight/fight.js`, `src/game/fight/fight_spell_processor.js` |
| Hechizos          | `src/game/spell/spell_manager.js`                    |
| Pathfinding       | `src/game/pathfinding/pathfinding.js`                |
| NPCs              | `src/handlers/npc_handler.js`, `src/game/npcs/`      |
| Chat              | `src/handlers/chat_handler.js`, `src/managers/chat_restriction_manager.js` |
| Documentación     | `docs/architecture.md`, `docs/workflows.md`          |

## Cómo añadir una feature nueva

### Nuevo mensaje de protocolo

1. Define la clase del mensaje en `src/io/dofus/messages.js`:
   - Extiende `ProtocolMessage`
   - Define `serialize()` y/o `deserialize()`
   - Usa los métodos de `CustomDataWrapper` para leer/escribir campos

2. Crea o actualiza el handler en `src/handlers/`

3. Registra el messageId en `src/network/processor.js`:
   ```js
   MESSAGE_ID: {
       message: Messages.NuevoMensaje,
       handler: MiHandler.handleNuevoMensaje
   },
   ```

### Nueva lógica de juego

1. El código va en `src/game/<dominio>/`
2. Si es un efecto de hechizo nuevo: `src/game/spell/effects/`
3. Si es un buff nuevo: `src/game/spell/buffs/`
4. Registra el efecto en `SpellManager` o `FightSpellProcessor`

### Nuevo comando admin

1. Añadir en `src/handlers/admin_handler.js`
2. El messageId ya está registrado: `5662` (AdminQuietCommandMessage)

## Documentación que actualizar después de cambios

| Cambio                              | Documentación a actualizar         |
|-------------------------------------|------------------------------------|
| Nueva feature grande                | `docs/workflows.md`                |
| Cambio de arquitectura              | `docs/architecture.md`             |
| Nueva dependencia o cambio de stack | `docs/overview.md`, `docs/setup.md`|
| Cambio en flujo de arranque         | `docs/architecture.md`             |
| Convención de código nueva          | `docs/coding-standards.md`         |
| Decisión técnica importante         | `docs/decisions.md`                |
| Cambio en deployment                | `docs/deployment.md`               |
| Tests añadidos                      | `docs/testing.md`                  |

## Peligros comunes

1. **Modificar messageId en processor.js**: si cambias un ID que el cliente
   espera, la feature se rompe silenciosamente.

2. **Cambiar el orden de campos en serialize/deserialize**: el protocolo es
   posicional. Un campo fuera de orden = datos corruptos.

3. **Romper ciclos CommonJS**: tras la migración a Node 25, el proyecto usa
   `require` / `module.exports`. En módulos con dependencias circulares usa
   lazy `require` (`function getX() { return require(...) }`) en vez de imports
   de nivel superior que devuelvan `{}` parcialmente inicializado.

4. **Asumir que los callbacks manejan errores**: la mayoría no lo hacen.
   Agrega try/catch defensivo.

5. **Modificar `Datacenter` sin entender la carga**: los datos se cargan una
   vez al inicio. Si agregas una colección nueva, debe registrarse en el
   array `loaders` de `Datacenter.load()`.

6. **Olvidar que las propiedades son static**: `AuthServer.clients` y
   `WorldServer.clients` son estado global mutable. Los cambios afectan a
   todas las conexiones.

## Convenciones del repositorio

- Archivos: `snake_case.js`
- Clases: `PascalCase`
- Imports de proyecto: `const X = require("../ruta/x")`, salvo ciclos donde se
  usa lazy `require`
- Módulos nativos: `const x = require('x')` o `var x = require('x')` en código
  heredado
- Logging: `Logger.infos()`, `Logger.error()`, `Logger.debug()`
- Handlers: métodos `static` que reciben `(client, packet)`
- Respuestas: `client.send(new Messages.TipoMensaje(params))`
