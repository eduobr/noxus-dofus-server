# Noxus — Coding Standards

## Convenciones detectadas en el código existente

### Estilo general

El código mezcla convenciones ES6 y patrones más antiguos. No hay un linter
configurado ni guía de estilo explícita. Lo siguiente se infiere del código:

### Naming

| Elemento            | Convención         | Ejemplo real                              |
|---------------------|--------------------|-------------------------------------------|
| Clases              | PascalCase         | `AuthServer`, `WorldClient`, `FightTeam`  |
| Archivos            | snake_case         | `auth_handler.js`, `world_client.js`      |
| Métodos estáticos   | camelCase          | `generateTicket()`, `removeClient()`      |
| Constantes estáticas| UPPER_SNAKE_CASE   | `DOFUS_PROTOCOL_ID`, `FIGHT_TYPE`         |
| Enums               | UPPER_SNAKE_CASE   | `FIGHT_TYPE_CHALLENGE`, `FIGHT_TYPE_PvM`  |
| Carpetas            | snake_case / short | `game/`, `database/`, `io/`, `utils/`     |

### Estructura de archivos esperada

Un handler típico (`src/handlers/ejemplo_handler.js`):

```js
import Logger from "../io/logger"
import * as Messages from "../io/dofus/messages"
import * as Types from "../io/dofus/types"

export default class EjemploHandler {

    static handleEjemploMessage(client, packet) {
        Logger.debug("Procesando mensaje de ejemplo");
        // Lógica del handler
        client.send(new Messages.RespuestaMessage(/* ... */));
    }
}
```

Un modelo de datos típico (`src/database/models/ejemplo.js`):

```js
export default class Ejemplo {
    constructor(data) {
        this._id = data._id;
        // ... resto de campos
    }
}
```

### Imports

- Usar `import` para módulos del proyecto (ES6)
- Usar `require()` solo para módulos nativos de Node.js (`net`, `fs`, `crypto`)
  y dependencias legacy que no soportan `import`
- Los imports no se ordenan alfabéticamente en el código existente
- No se usa index.js para re-exportar; cada archivo se importa directamente

### Manejo de errores

- Try/catch inconsistente. En `processor.js` línea 117-124 está comentado:
  ```js
  //try {
      packet.deserialize(buffer);
      handler.handler(client, packet);
  /*}
  catch(ex) {
      Logger.error("Error when process message ..");
      Logger.error(ex);
  }*/
  ```
- Los callbacks de MongoDB frecuentemente ignoran el parámetro `err`

### Logging

Usar los métodos estáticos de `Logger`:

```js
import Logger from "../io/logger"

Logger.infos("Mensaje informativo");
Logger.error("Mensaje de error");
Logger.debug("Mensaje de debug");
Logger.warning("Mensaje de advertencia");
Logger.network("Mensaje de red");  // Solo visible si Logger.level == 0
```

### Serialización de mensajes

Cada mensaje del protocolo extiende `ProtocolMessage` y define `serialize()`
y/o `deserialize()`:

```js
export class IdentificationMessage extends ProtocolMessage {
    constructor() {
        super(4);  // messageId
    }

    deserialize(buffer) {
        var flag1 = buffer.readByte();
        this.autoconnect = IO.BooleanByteWrapper.getFlag(flag1, 0);
        // ... leer cada campo binario
    }
}
```

### Registro de nuevos mensajes

Para añadir un nuevo mensaje al protocolo:

1. Definir la clase en `src/io/dofus/messages.js`
2. Registrar el handler en `src/network/processor.js`:
   ```js
   MESSAGE_ID: {
       message: Messages.NuevoMensaje,
       handler: EjemploHandler.handleNuevoMensaje
   },
   ```

## Buenas prácticas sugeridas (no existen actualmente)

Estas son recomendaciones para código nuevo, no reflejan el estado actual:

- **Un handler por dominio funcional** (ya se sigue: auth, chat, fight, etc.)
- **No mezclar lógica de negocio con serialización** (no se sigue actualmente:
  algunos handlers contienen lógica de negocio extensa)
- **Preferir `import` sobre `require`** para consistencia (parcialmente seguido)
- **Documentar messageId en comentarios** (se hace parcialmente en processor.js)
- **No usar `var`; preferir `let`/`const`** (no se sigue: hay muchos `var`)

## Conflictos conocidos

- Hay archivos con conflictos de merge sin resolver:
  - `tools/Noxus-D2OReader/app (Copie en conflit de Yamisaaf Yamidevs 2016-12-29).js`
  - Archivos `.idea/workspace*.xml` con múltiples copias de conflicto
