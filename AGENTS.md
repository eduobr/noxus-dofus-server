# AGENTS.md — AI Agent Instructions for Noxus

Instrucciones para cualquier agente de IA (Claude, Hermes, Copilot, etc.)
que trabaje en este repositorio.

Este proyecto es **Noxus**, un emulador de servidor privado para Dofus 2.39.
Es un monolito Node.js con dos servidores TCP (auth + world), MongoDB como
base de datos y un protocolo binario propietario.

---

## 1. Documentación obligatoria antes de tocar código

Antes de modificar cualquier archivo, el agente debe leer:

| Archivo                   | Cuándo leerlo                                     |
|---------------------------|---------------------------------------------------|
| `docs/overview.md`        | Siempre. Entender qué es el proyecto.             |
| `docs/architecture.md`    | Siempre. Capas, carpetas, flujo de datos.          |
| `docs/coding-standards.md`| Siempre. Naming, imports, estructura esperada.     |
| `docs/testing.md`         | Si vas a tocar o crear tests.                      |
| `docs/workflows.md`       | Si tu cambio afecta un flujo funcional.            |
| `docs/decisions.md`       | Si necesitas entender por qué algo es como es.     |
| `docs/agents.md`          | Guía extendida con ejemplos de código reales.      |

---

## 2. Cambios en el servidor (handlers, game logic, database)

2.1 **Respeta la arquitectura existente.**
    - El proyecto tiene capas definidas: `network/` → `handlers/` → `game/` →
      `database/`. No rompas esta separación.
    - El router está en `src/network/processor.js`. Si añades un mensaje nuevo
      de protocolo, registra su `messageId` aquí.

2.2 **No crees nuevas convenciones si ya existe una.**
    - Handlers: clases con métodos `static` que reciben `(client, packet)`.
    - Modelos: clases en `src/database/models/` instanciadas con `new Model(doc)`.
    - Logging: `Logger.infos()`, `Logger.error()`, `Logger.debug()`.
    - Serialización: extiende `ProtocolMessage`, define `serialize()`/`deserialize()`.

2.3 **Mantén los handlers livianos.**
    - Un handler (`src/handlers/`) debe parsear el mensaje y delegar la lógica
      a los módulos en `src/game/` y `src/managers/`.
    - No metas 200 líneas de lógica de negocio dentro de un handler.
    - Ejemplo real: `FightHandler` recibe mensajes de combate, delega a
      `FightManager` y `FightSpellProcessor`.

2.4 **La lógica de juego va en `src/game/`.**
    - Combate → `src/game/fight/`
    - Hechizos y efectos → `src/game/spell/`
    - Pathfinding → `src/game/pathfinding/`
    - NPCs → `src/game/npcs/`
    - Monstruos → `src/game/monsters/`
    - Grupos → `src/game/party/`

2.5 **No hay frontend en este repositorio.**
    - El cliente Dofus es un archivo `.swf` externo en `patch/DofusInvoker.swf`.
    - No hay componentes UI, no hay HTML/CSS, no hay framework de frontend.
    - La "vista" del jugador la renderiza el cliente de Ankama con los datos
      que el servidor le envía.

---

## 3. Cambios en datos o configuración

3.1 **`config.json` no se modifica sin preguntar.**
    - Contiene puertos, IPs, credenciales de MongoDB y reglas de juego.
    - Para desarrollo local, se puede proponer un `config.dev.json`.

3.2 **No modificar archivos en `tools/` ni `export/`.**
    - Son herramientas de extracción de datos y definiciones de protocolo
      generadas por ingeniería inversa.

3.3 **Los datos de juego están en `db/` como JSON.**
    - Se importan a MongoDB. Si modificas un JSON, documenta qué cambió y por qué.

---

## 4. Cambios en testing

4.1 **Actualmente no hay tests.** Cualquier test que añadas es bienvenido.

4.2 **Lee `docs/testing.md`** antes de crear la estructura de tests.

4.3 **Prioridad de testing** (qué testear primero):
    1. Pathfinding (`src/game/pathfinding/`) — lógica pura, sin dependencias externas
    2. Serialización de mensajes — `serialize()` seguido de `deserialize()` debe
       ser idempotente
    3. Efectos de hechizos y buffs — lógica de daño, modificadores de stats
    4. Handlers — mockear `client` y verificar respuestas

4.4 **Usa el mismo estilo del proyecto**: ES6 imports, clases, sin TypeScript
    (a menos que se decida migrar explícitamente).

---

## 5. Documentación que actualizar después de cambios

| Tipo de cambio                     | Documentación a actualizar         |
|------------------------------------|-------------------------------------|
| Nuevo módulo o dominio             | `docs/overview.md`                 |
| Cambio de arquitectura/capas       | `docs/architecture.md`             |
| Cambio en flujo funcional          | `docs/workflows.md`                |
| Decisión técnica importante        | `docs/decisions.md`                |
| Nueva dependencia                  | `docs/setup.md`, `docs/overview.md`|
| Cambio en deployment               | `docs/deployment.md`               |
| Convención de código nueva         | `docs/coding-standards.md`         |
| Tests añadidos                     | `docs/testing.md`                  |

---

## 6. Reglas generales

6.1 **No inventes contexto.** Si no hay evidencia en el código de por qué
    algo es como es, márcalo como "inferido" o "pendiente por confirmar".

6.2 **No hagas refactors grandes sin justificación.** El proyecto funciona
    como está. Un refactor masivo (ej. migrar todos los callbacks a
    async/await) requiere aprobación explícita.

6.3 **No cambies los contratos públicos sin documentarlo.**
    - Si cambias un `messageId` en `processor.js`, el cliente Dofus deja de
      funcionar para ese mensaje.
    - Si cambias el orden de los campos en `serialize()`/`deserialize()`, el
      protocolo se corrompe.
    - Documenta cada cambio de contrato en `docs/decisions.md`.

6.4 **No modifiques variables de entorno sin actualizar `docs/setup.md`.**
    - Actualmente no hay `.env`. Si creas uno, documéntalo.

6.5 **No cambies la configuración de despliegue sin actualizar
    `docs/deployment.md`.**
    - Actualmente el despliegue es manual. Si agregas Docker o CI/CD,
      actualiza la documentación.

6.6 **Prueba tus cambios.**
    - Como mínimo, verifica que el servidor arranca sin errores:
      ```bash
      ./node_modules/.bin/babel src --out-dir dist && node dist/app.js
      ```
    - Si tu cambio afecta la comunicación cliente-servidor, necesitas un
      cliente Dofus real para verificar (el `.swf` en `patch/`).

6.7 **Idioma.**
    - La comunicación con el usuario es en español.
    - El código y los comentarios heredados están en francés/inglés.
      Mantén el mismo idioma que el archivo que estás modificando.
    - La documentación (`docs/`) está en español.

---

## 7. Peligros específicos de este proyecto

- **Las contraseñas se almacenan en texto plano** (`auth_handler.js` línea 57).
  No repliques este patrón en código nuevo. Si implementas autenticación
  adicional, usa bcrypt.

- **El estado es global y mutable.** `AuthServer.clients` y `WorldServer.clients`
  son arrays `static`. Un cambio en un handler puede tener efectos laterales
  impredecibles en otras conexiones activas.

- **El protocolo es posicional.** Los campos en `serialize()`/`deserialize()`
  deben leerse y escribirse en el orden exacto que espera el cliente Dofus.
  Un campo de más o de menos = corrupción de paquete.

- **No hay manejo de errores consistente.** Muchos callbacks ignoran el
  parámetro `err`. Agrega try/catch defensivo en código nuevo.

- **El `messageId` es ley.** Cada número en `Processor.PROTOCOL_HANDLERS`
  fue reverse-engineered del cliente Dofus 2.39. Si Ankama cambió ese número
  en una versión posterior, el mensaje simplemente no se procesa.
