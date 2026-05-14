# Noxus — Workflows (Flujos funcionales)

Documentación técnica de los flujos funcionales del emulador Noxus.
Cada flujo describe el camino completo de un mensaje desde el cliente hasta
su resolución, incluyendo validaciones, errores y notas de implementación.

---

## Flujo 1: Autenticación y selección de servidor

### Objetivo
Validar credenciales del usuario contra MongoDB, generar un ticket de sesión
y redirigir al cliente al WorldServer.

### Archivos involucrados
| Archivo | Rol |
|---------|-----|
| `src/network/auth.js` | Servidor TCP auth, array de clientes y tickets |
| `src/network/auth_client.js` | Socket del cliente auth, recibe/send |
| `src/handlers/auth_handler.js` | Lógica de login y selección de servidor |
| `src/database/dbmanager.js` | `findAccount()`, `getCharacters()` |
| `src/io/dofus/messages.js` | IdentificationMessage, ServerSelectionMessage, etc. |

### Paso a paso

```
1. Cliente TCP conecta a AuthServer:443
   → AuthServer crea AuthClient(socket)
   → AuthClient envía ProtocolRequiredMessage(1738, 1738)
   → AuthClient envía HelloConnectMessage("ivu9wh58^kQQw*8n:jud11Kw(bHY9m3V", 303)

2. Cliente envía IdentificationMessage (id=4)
   → packet.version (Version: major, minor, release, revision, patch, buildType)
   → packet.lang contiene "username@password" en lugar del idioma
   → packet.autoconnect (boolean flag)

3. AuthHandler.handleIdentificationMessage(client, packet):
   a. Extrae credenciales: packet.lang.split('@')[0] y [1]
   b. DBManager.findAccount(username, callback)
      - Cuenta no encontrada → IdentificationFailedMessage(2)
      - Password incorrecto → IdentificationFailedMessage(2)
      - Cuenta lockeada (locked==1) → IdentificationFailedMessage(3)
   c. OK → disconnectAlreadyConnectedClient(account.uid)
        → Busca y cierra conexiones previas en auth y world
   d. client.account = account
   e. Envía IdentificationSuccessMessage(username, nickname, uid, 0, true,
      secret_question, 0, 1, 0, 0, 5)
   f. Llama a sendServersList(client)
      → DBManager.getCharacters({accountId})
      → Crea GameServerInformations(server_id, 1, 3, 0, true, characters.length, 1)
      → Envía ServersListMessage([servidor], 0, true)

4. Cliente envía ServerSelectionMessage (id=40)
   → packet.serverId
   → AuthHandler.handleServerSelectionMessage():
      - Genera ticket: crypto.randomBytes(42).toString('hex')
      - Guarda en AuthServer.clients_tickets[ticket] = client.account
      - Envía SelectedServerDataMessage(serverId, host, world_port, true, ticket)
      - client.close() → cierra socket auth

5. Cliente se desconecta de AuthServer y conecta a WorldServer:5556
```

### Entradas
- `IdentificationMessage`: version (6 campos), lang ("user@pass"), autoconnect (bool)
- `ServerSelectionMessage`: serverId (varShort)

### Salidas
- `IdentificationFailedMessage(reason)`: 2=wrong credentials, 3=banned
- `IdentificationSuccessMessage`: username, nickname, uid, subscription, secret question...
- `ServersListMessage`: array de GameServerInformations
- `SelectedServerDataMessage`: serverId, host, port, canCreateNewCharacter, ticket

### Validaciones
- Cuenta existe en MongoDB
- Password coincide (texto plano — sin hash)
- Cuenta no está baneada (locked != 1)
- Se fuerza desconexión de sesiones previas del mismo account

### Errores posibles
- Cuenta no encontrada: `IdentificationFailedMessage(2)`
- Password incorrecto: `IdentificationFailedMessage(2)`
- Cuenta baneada: `IdentificationFailedMessage(3)`
- Error de parseo de credenciales (lang sin '@'): credenciales inválidas silenciosas

### Notas técnicas
- **Las credenciales viajan en el campo `lang` del mensaje**, no en `credentials`.
  `packet.lang` debería ser un código de idioma, pero se reutiliza para
  transmitir "username@password". Esto es una adaptación del protocolo.
- **Contraseñas en texto plano**: comparación directa sin hashing.
  Riesgo de seguridad crítico.
- **HelloConnectMessage**: la key "ivu9wh58^kQQw*8n:jud11Kw(bHY9m3V" y salt 303
  son específicos de Dofus 2.39. Si Ankama cambia estos valores en otra versión,
  el handshake falla.
- El ticket se genera con `crypto.randomBytes(42).toString('hex')` (84 chars hex).
  Se elimina del array después del primer uso en `getAccountByTicket()`.

---

## Flujo 2: Gestión de personajes (listar, crear, seleccionar, eliminar)

### Objetivo
Permitir al jugador ver sus personajes existentes, crear uno nuevo,
seleccionar uno para jugar, o eliminar uno existente.

### Archivos involucrados
| Archivo | Rol |
|---------|-----|
| `src/handlers/approach_handler.js` | Lógica de personajes |
| `src/managers/loader_manager.js` | Carga amigos/ignorados del account |
| `src/managers/character_manager.js` | Breed stats, look por defecto, experiencia |
| `src/database/dbmanager.js` | CRUD de personajes |
| `src/database/models/character.js` | Modelo Character (614 líneas) |
| `src/database/models/item_bag.js` | Bolsa de items del personaje |

### Paso a paso

```
1. AuthenticationTicketMessage (id=110)
   → ApproachHandler.handleAuthenticationTicketMessage(client, packet)
   a. client.account = AuthServer.getAccountByTicket(packet.ticket)
      - Busca en AuthServer.clients_tickets[ticket] y borra la entrada
   b. LoaderManager.LoadAccountData(client, callback)
      - Carga amigos: DBManager.getFriends({accountId}) → por cada amigo
        DBManager.getAccount({uid}) para obtener datos
      - Carga ignorados: DBManager.getIgnoreds({accountId}) → por cada uno
        DBManager.getAccount({uid})
   c. Envía secuencia de mensajes:
      - AuthenticationTicketAcceptedMessage
      - ServerSettingsMessage("fr", 0, 0, 30)
      - ServerOptionalFeaturesMessage([])
      - AccountCapabilitiesMessage(false, true, uid, 131071, 131071, 0)
      - TrustStatusMessage

2. CharactersListRequestMessage (id=150)
   → ApproachHandler.sendCharactersList(client)
   a. DBManager.getCharacters({accountId})
   b. Para cada personaje, carga el itemBag de forma asíncrona
   c. Espera a que todos los bags estén cargados (polling con setTimeout 200ms)
   d. Invierte el orden (client.characters.reverse())
   e. Construye array de CharacterBaseInformations
   f. Envía CharactersListMessage

3. [OPCIONAL] CharacterCreationRequestMessage (id=160)
   a. Validaciones:
      - Máximo de personajes (config.max_characters, default 5)
      - Nombre: CheckNameCondition() — solo letras a-z, máximo 1 guión,
        primera letra mayúscula, mínimo 3 caracteres
      - Raza: debe estar en config.breeds_allowed
      - Nombre único: DBManager.getCharacter({name})
   b. Crea objeto Character con valores iniciales:
      - level, kamas, mapId, cellId, dirId desde config.characters_start
      - experience: CharacterManager.getExperienceFloorByLevel(level).xp
      - statsPoints: (level * 5) - 5
      - spellPoints: level - 1
      - scale: CharacterManager.getDefaultScale(breed, sex)
   c. DBManager.createCharacter(character, callback)
      → autoIncrement.getNextSequence para _id
      → Inserta en colección 'characters'
   d. Envía CharacterCreationResultMessage(0) → éxito
   e. Refresca lista de personajes

   Códigos de error de creación:
   - 0: éxito
   - 2: nombre inválido
   - 3: nombre ya existe
   - 4: máximo de personajes alcanzado
   - 5: raza no permitida

4. CharacterSelectionMessage (id=152)
   a. Busca personaje por packet.id en client.characters
   b. client.character = selectedCharacter
   c. client.character.client = client
   d. Envía:
      - NotificationListMessage([553648126, 6])
      - CharacterSelectedSuccessMessage(info, false)
      - CharacterCapabilitiesMessage(6339)
      - CharacterLoadingCompleteMessage

5. [OPCIONAL] CharacterDeletionRequestMessage (id=165)
   a. Verifica que el personaje pertenece al account
   b. DBManager.deleteCharacter({_id})
   c. Elimina de client.characters
   d. Refresca lista (setTimeout 200ms)
```

### Entradas
- `AuthenticationTicketMessage`: ticket (string)
- `CharactersListRequestMessage`: sin parámetros
- `CharacterCreationRequestMessage`: name, breed, sex, colors, cosmeticId
- `CharacterSelectionMessage`: id (varInt)
- `CharacterDeletionRequestMessage`: characterId (varInt)

### Salidas
- `AuthenticationTicketAcceptedMessage`
- `CharactersListMessage`: array de CharacterBaseInformations
- `CharacterCreationResultMessage`: result (0-5)
- `CharacterSelectedSuccessMessage`: CharacterBaseInformations + isCollectingStats
- `CharacterDeletionErrorMessage`: errorType

### Validaciones
- Ticket de autenticación válido y no usado previamente
- Máximo de personajes por cuenta
- Nombre: solo [a-zA-Z], máximo 1 guión, sin mayúsculas internas, longitud ≥ 3
- Raza en lista de permitidas
- Nombre único en la base de datos
- Personaje a eliminar pertenece al account

### Errores posibles
- Ticket inválido o ya usado → el account queda null, falla silenciosa
- Nombre duplicado → CharacterCreationResultMessage(3)
- Nombre inválido → CharacterCreationResultMessage(2)
- Raza no permitida → CharacterCreationResultMessage(5)
- Límite de personajes → CharacterCreationResultMessage(4)
- Personaje no encontrado en selección → client.close()
- Error al eliminar → CharacterDeletionErrorMessage(1)

### Notas técnicas
- **Polling para carga de bags**: `sendCharactersList` usa `setTimeout(fnCheck, 200)`
  para esperar a que todos los `itemBag` se carguen asíncronamente antes de
  enviar la lista. Esto es frágil y puede causar race conditions.
- **Breeds disponibles**: `getAvailableBreeds()` retorna `131071`, que en binario
  es `11111111111111111` (17 bits) — todas las razas habilitadas.
- **Nombre aleatorio**: `generateRandomNickname()` combina sílabas predefinidas
  (lo, la, li, wo, wi, ka...) para generar nombres de 3-6 sílabas.
- **ReloginTokenRequestMessage (id=6540)**: el handler está implementado pero
  comentado. No soportado actualmente.
- La creación de personaje no asigna items iniciales ni hechizos de raza en
  este punto. Los hechizos se aprenden en `CharacterManager.onConnected()`.

---

## Flujo 3: Entrada al mundo (Game Context)

### Objetivo
Transicionar al personaje del estado de selección al mundo de juego,
cargando su mapa, stats, hechizos, amigos, inventario y shortcuts.

### Archivos involucrados
| Archivo | Rol |
|---------|-----|
| `src/handlers/game_handler.js` | handleGameContextCreateRequestMessage |
| `src/handlers/approach_handler.js` | handleCharacterSelectionMessage (paso previo) |
| `src/managers/character_manager.js` | onConnected(), learnSpells, createShortcut |
| `src/managers/world_manager.js` | teleportClient(), getMap() |
| `src/managers/loader_manager.js` | LoadCharacterData() |
| `src/game/stats/stats_manager.js` | sendStats(), sendSpellsList(), recalculateStats() |
| `src/database/models/map.js` | init(), addClient(), sendComplementaryInformations |
| `src/handlers/friend_handler.js` | sendFriendsOnlineMessage, warnFriends |

### Paso a paso

```
1. GameContextCreateRequestMessage (id=250)
   → GameHandler.handleGameContextCreateRequestMessage(client, packet)

2. client.character.sendEmotesList()
   → EmoteListMessage con array de IDs de emotes

3. Envía GameContextDestroyMessage + GameContextCreateMessage(1)
   → Limpia cualquier contexto previo y crea contexto de roleplay

4. client.character.statsManager.sendStats()
   → Envía stats completos al cliente

5. Si es firstContext (primera entrada al mundo):
   a. LoaderManager.LoadCharacterData(client, callback)
      → getFriendsOnline() cuenta amigos conectados
      → Establece client.character.friendsOnline
   b. WorldManager.teleportClient(client, mapid, cellid, callback)
      → getMap(mapId): busca en caché WorldManager.maps[]
      → Si no está, DBManager.getMaps({_id}) → new Map() → map.init()
      → map.init(): descomprime celdas (zlib.inflateSync + base64 decode)
      → SpawnManager.getMonstersAndGenerateGroups(map)
      → removeClient del mapa anterior (si existe)
      → addClient al nuevo mapa
      → Si hay party, envía posición a seguidores
   c. Si éxito: client.character.firstContext = false
   d. client.character.onConnected():
      → GameHandler.sendWelcomeMessage()
         - replyLangsMessage(1, 89, []) — mensaje de bienvenida i18n
         - replyWelcome(config.welcome_message)
      → FriendHandler.sendFriendsOnlineMessage()
      → FriendHandler.warnFriends() — notifica a amigos que se conectó
      → sendWarnOnStateMessages()
      → sendInventoryBag() — contenido del inventario
      → LifePointsRegenBeginMessage(10)
      → statsManager.sendStats()
      → CharacterManager.learnSpellsForCharacter()
         - Itera breed.breedSpellsId
         - Si spellLevel.minPlayerLevel <= character.level y no lo tiene
         - Añade a character.spells: {spellId, spellLevel: 1}
         - Crea shortcut en barra de hechizos
      → statsManager.sendSpellsList()
      → refreshShortcutsBar()
      → setRegenState() — timestamp para regeneración
      → AlmanachCalendarDateMessage(94)

6. Si NO es firstContext (reconexión):
   → Va directamente a WorldManager.teleportClient()
```

### Entradas
- `GameContextCreateRequestMessage`: sin parámetros relevantes

### Salidas
- `GameContextDestroyMessage` + `GameContextCreateMessage(1)`
- `EmoteListMessage`
- `CharacterStatsListMessage`
- `SpellListMessage`
- Inventory messages (ObjectAdded, etc.)
- `LifePointsRegenBeginMessage`
- `AlmanachCalendarDateMessage`
- Mensajes de chat de bienvenida

### Validaciones
- El personaje debe existir y estar asignado a client.character
- El mapa inicial debe ser cargable desde MongoDB
- La celda inicial debe ser walkable

### Errores posibles
- Mapa no encontrado en MongoDB → `Logger.error`, `character.disconnect()`
- Celda no walkable → el personaje podría quedar atrapado
- Error en carga de account data → `client.close()`

### Notas técnicas
- **firstContext** es un flag en Character que distingue entre primera entrada
  y reconexiones. Solo se ejecuta `onConnected()` en la primera entrada.
- **Aprendizaje automático de hechizos**: al conectar, el sistema verifica si
  el personaje debería conocer hechizos de su raza según su nivel actual.
- **Regeneración**: `setRegenState()` guarda un timestamp Unix. En cada
  interacción posterior, `applyRegen()` calcula la vida/maná a regenerar
  basado en el tiempo transcurrido.
- Las celdas del mapa se descomprimen con `zlib.inflateSync(new Buffer(cellsRaw, 'base64'))`.

---

## Flujo 4: Movimiento y pathfinding

### Objetivo
Validar y ejecutar el movimiento de un personaje en el mapa, calculando la
ruta óptima entre celdas usando A* sobre grid hexagonal.

### Archivos involucrados
| Archivo | Rol |
|---------|-----|
| `src/handlers/game_handler.js` | handleGameMapMovementRequestMessage, confirm, cancel |
| `src/game/pathfinding/pathfinding.js` | Algoritmo A* (193 líneas) |
| `src/game/pathfinding/map_point.js` | Coordenadas hexagonales, distancias, orientación |
| `src/game/pathfinding/cell_info.js` | Información de celda (walkable, cost) |
| `src/game/pathfinding/data_map_provider.js` | Proveedor de datos del mapa para pathfinding |
| `src/game/pathfinding/point.js` | Punto 2D |
| `src/game/pathfinding/directions_enum.js` | Direcciones cardinales |
| `src/game/map_tools/dofus_1_line.js` | Algoritmo de línea recta en grid hexagonal |
| `src/database/models/map.js` | Map, células, vecinos |

### Paso a paso

```
1. GameMapMovementRequestMessage (id=950)
   → packet.keyMovements: array de ints. Cada int codifica:
     - cellId: keyMovement & 4095 (12 bits inferiores)
     - direction: keyMovement >> 12 (bits superiores)

2. GameHandler.handleGameMapMovementRequestMessage(client, packet):
   a. Decodifica keyMovements a objetos {id, dir, point: MapPoint.fromCellId(id)}
   b. Calcula distancia entre primera y última celda del path
   c. Crea Pathfinding(map.dataMapProvider)
   d. Si NO está en combate:
      - map.send(GameMapMovementMessage(keyMovements, character._id))
        → broadcast a todos los clientes en el mapa
      - character.nextCellId = última celda del path
      - character.dirId = orientación entre primera y última celda
   e. Si ESTÁ en combate:
      - fight.requestMove(fighter, keyMovements, pathfinding)
```

### Algoritmo de pathfinding (A*)

```
Pathfinding.findShortestPath(startCellId, endCellId, excludedCells):
  1. Inicializa todas las celdas del mapa como CellInfo
  2. startCell.f = 0, añade a openList
  3. Mientras openList no vacía:
     a. getCurrentNode(): selecciona nodo con menor f
     b. Si es endCell → reconstruye path desde endCell.parent
     c. Añade a closedList
     d. Para cada celda vecina (4 direcciones en grid hexagonal):
        - Si no es walkable → skip
        - Si está en closedList → skip
        - Calcula g = current.g + CELL_DISTANCE_VALUE (15)
        - Calcula h = distancia euclidiana al destino
        - f = g + h
        - Si no está en openList o nuevo f < existente → actualiza
```

### Confirmación de movimiento

```
3. GameMapMovementConfirmMessage (id=952)
   → character.cellid = character.nextCellId
   → character.nextCellId = -1
   → Verifica elementos interactivos en la celda:
      - Busca en la lista de elementos del mapa
      - Si hay un trigger (skill tipo 339) en esa celda:
        → WorldManager.teleportClient(client, optionalValue1, optionalValue2)
   → Envía BasicNoOperationMessage (ack)
```

### Cancelación de movimiento

```
4. GameMapMovementCancelMessage (id=953)
   → character.cellid = packet.cellId
   → Revierte a la posición original
```

### Entradas
- `GameMapMovementRequestMessage`: keyMovements (array de ints codificados)
- `GameMapMovementConfirmMessage`: sin parámetros (usa nextCellId interno)
- `GameMapMovementCancelMessage`: cellId

### Salidas
- `GameMapMovementMessage(keyMovements, character._id)` → broadcast al mapa
- `BasicNoOperationMessage` → confirmación

### Validaciones
- En el código actual, **el pathfinding del servidor está comentado** (líneas 72-79).
  El servidor confía en el path enviado por el cliente y solo hace broadcast.
- En combate, el movimiento se delega a `fight.requestMove()`.

### Errores posibles
- Path con celdas no walkable: el servidor no lo valida actualmente
- Celda destino fuera de rango (>550): comportamiento indefinido

### Notas técnicas
- **El servidor NO valida el path actualmente**. Las líneas 72-79 de game_handler.js
  están comentadas. El cliente calcula el camino y el servidor solo hace broadcast.
  Esto es un riesgo de seguridad (speedhack, wallhack).
- La orientación se calcula con `MapPoint.orientationTo()` entre la primera y
  última celda del path.
- Los `keyMovements` codifican cellId en 12 bits (máx 4095 celdas) y dirección
  en los bits restantes.
- `CELL_DISTANCE_VALUE = 15` es el costo base entre celdas adyacentes en A*.

---

## Flujo 5: Cambio de mapa (scroll entre mapas)

### Objetivo
Gestionar la transición del personaje entre mapas adyacentes al hacer scroll
por los bordes, respetando vecinos y scroll actions.

### Archivos involucrados
| Archivo | Rol |
|---------|-----|
| `src/handlers/game_handler.js` | handleChangeMapMessage |
| `src/managers/world_manager.js` | teleportClient, getMap |
| `src/database/datacenter.js` | getMapScrollActionById |
| `src/game/pathfinding/pathfinding.js` | findClosestWalkableCell |
| `src/database/models/map.js` | topNeighbourId, rightNeighbourId, etc. |

### Paso a paso

```
1. ChangeMapMessage (id=221)
   → packet.mapId: ID del mapa destino

2. GameHandler.handleChangeMapMessage(client, packet):
   a. Determina dirección del cambio (1=top, 2=right, 3=bottom, 4=left)
      comparando packet.mapId con los neighbourId del mapa actual
   b. Calcula nueva celda según dirección:
      - Top (1):    cellId + 532
      - Right (2):  cellId - 13
      - Bottom (3): cellId - 532
      - Left (4):   cellId + 13
   c. Si la dirección no coincide con ningún vecino → posible cheat, aborta

3. Verifica scroll actions (Datacenter.getMapScrollActionById):
   - Si existe un scrollAction para el mapa actual, puede sobrescribir
     el mapa destino según la dirección
   - Ej: scrollAction.rightMapId != 0 → usa ese en lugar del neighbour

4. Ejecuta teleportClient(client, toMap, toCellId):
   a. getMap(toMap) → carga lazy si no está en caché
   b. removeClient del mapa anterior
   c. addClient al nuevo mapa
   d. Verifica que la celda destino sea walkable (cells[cell]._mov):
      - Si no lo es → findClosestWalkableCell(client)
        - Si encuentra → teleport a esa celda
        - Si no → teleport al mapa inicial (startMap, startCell)
          con mensaje de error
   e. character.save()

5. El mapa envía GameMapMovementMessage y GameContextActorInformations
   a los clientes del mapa destino para mostrar al nuevo personaje
```

### Entradas
- `ChangeMapMessage`: mapId (int)

### Salidas
- `GameMapMovementMessage` → broadcast en mapa destino
- `GameContextActorInformations` → broadcast en mapa destino
- `GameContextRemoveActor` en mapa origen (implícito por removeClient)

### Validaciones
- El mapa destino debe ser vecino del actual (top/bottom/left/right)
- La celda destino debe ser walkable; si no, busca la más cercana
- Si no hay celdas walkables, envía al spawn inicial

### Errores posibles
- Dirección no válida (no es vecino) → "Client trying to change map on a
  non neighbour map, maybe cheat?"
- Celda no walkable sin alternativas → teleport al mapa de inicio

### Notas técnicas
- **Offset de celdas entre mapas**: top=+532, bottom=-532, left=+13, right=-13.
  Estos valores dependen del layout del grid hexagonal de Dofus (mapas de
  40x14 celdas = 560 celdas, con 532 siendo el offset vertical).
- **Scroll actions**: permiten redirigir el cambio de mapa. Útil para
  transportadores, edificios con interior, etc.
- **findClosestWalkableCell**: busca celdas walkable alrededor del personaje
  si la celda destino está bloqueada.
- El personaje se guarda en MongoDB después de cada cambio de mapa.

---

## Flujo 6: Chat

### Objetivo
Gestionar la comunicación entre jugadores a través de canales de chat
(global, privado, ventas, búsqueda, grupo) con restricciones de tiempo
y filtrado HTML.

### Archivos involucrados
| Archivo | Rol |
|---------|-----|
| `src/handlers/chat_handler.js` | Chat privado y multicanal (115 líneas) |
| `src/managers/chat_restriction_manager.js` | Cooldowns por canal |
| `src/managers/command_manager.js` | Comandos admin (mensajes con '.') |
| `src/handlers/ignored_handler.js` | Verificación de ignorados |
| `src/enums/chat_activable_channels_enum.js` | IDs de canales |
| `src/enums/account_role_enum.js` | Roles para escape de HTML |

### Paso a paso

#### Chat global (CHANNEL_GLOBAL)

```
1. Cliente envía ChatClientMultiMessage (id=861)
   → packet.content, packet.channel

2. Validaciones:
   - Longitud máxima: 256 caracteres
   - Si no es ADMINISTRATOR → escapeHtml(content)
     (& → &amp; < → &lt; > → &gt; " → &quot; ' → &#039;)
   - character.canSendMessage() → verifica cooldown global
     (0.5s entre mensajes, 10s si se excede)

3. Si el primer carácter es '.':
   → CommandManager.manageCommand(content.substr(1), client)
   → (Ver Flujo 7: Comandos de administrador)

4. Si no es comando:
   - Si está en combate → broadcast al fight
   - Si no → broadcast al mapa actual
   → map.send(ChatServerMessage(channel, content, timestamp, fingerprint,
              senderName, senderId, senderName, accountId))

5. Actualiza lastMessage timestamp
```

#### Canales especiales

```
CHANNEL_SALES:
  → canSendSalesMessage() → cooldown: 60s (config.time_channel.sales)
  → WorldServer.sendToAllOnlineClients(ChatServerMessage)
  → updateLastSalesMessage()

CHANNEL_SEEK:
  → canSendSeekMessage() → cooldown: 30s (config.time_channel.seek)
  → WorldServer.sendToAllOnlineClients(ChatServerMessage)
  → updateLastSeekMessage()

CHANNEL_PARTY:
  → Si el personaje tiene party
  → party.sendToParty(ChatServerMessage)
  → Solo visible para miembros del grupo
```

#### Chat privado (whisper)

```
1. ChatClientPrivateMessage (id=851)
   → packet.content, packet.receiver

2. Validaciones:
   - Longitud máxima: 256 caracteres
   - No enviarse a sí mismo: "Le message n'a pas été envoyé : vous vous parlez
     à vous-même..."
   - Escape HTML (si no es admin)

3. Busca destinatario: WorldServer.getOnlineClientByCharacterName(receiver)

4. Verifica ignorados:
   - isIgnoringForSession(target, sender) → ignorado en esta sesión
   - isIgnoring(target, senderAccount) → ignorado permanente

5. Si no está ignorado y puede enviar mensaje:
   - Envía ChatServerCopyMessage al remitente (copia confirmación)
   - Envía ChatServerMessage al destinatario
   - updateLastMessage()

6. Si está ignorado:
   → replyLangsMessage(1, 370, [targetName])
   ("Ce personnage a décidé de ne plus communiquer avec vous.")
```

### Entradas
- `ChatClientMultiMessage`: content (string UTF), channel (byte)
- `ChatClientPrivateMessage`: content (string UTF), receiver (string)

### Salidas
- `ChatServerMessage`: channel, content, timestamp, fingerprint, senderId,
  senderName, prefix, accountId
- `ChatServerCopyMessage`: igual + receiverName, receiverId
- `ChatSmileyMessage` (si se usa smiley)

### Validaciones
- Longitud máxima de mensaje: 256 caracteres
- Cooldown por canal: global (0.5s), sales (60s), seek (30s)
- Filtro de ignorados para mensajes privados
- HTML escape para no-admins

### Errores posibles
- Destinatario offline: "Le message n'a pas pu être envoyé : le destinataire
  est introuvable."
- Auto-mensaje: "vous vous parlez à vous-même..."
- Ignorado: replyLangsMessage(1, 370)

### Notas técnicas
- **Comandos admin**: cualquier mensaje global que empiece con '.' se trata
  como comando. Ver Flujo 7.
- **Sin límite de rate en whisper**: el chat privado solo verifica
  `canSendMessage()` pero no tiene cooldown adicional.
- **El HTML escape se salta para ADMINISTRATOR**: permite enviar HTML
  formateado para broadcasts del staff.
- **Timestamp**: usa `Date.now()` para marcar cada mensaje.
- **Fingerprint**: se pasa como `target.character.name` en el mensaje de chat
  privado. No es un fingerprint criptográfico real.
- Los canales de chat usan valores del enum `ChatChannel`: GLOBAL, SALES, SEEK,
  PARTY, PSEUDO_CHANNEL_PRIVATE, etc.

---

## Flujo 7: Comandos de administrador

### Objetivo
Ejecutar comandos administrativos y de juego mediante el chat, con control
de acceso basado en roles.

### Archivos involucrados
| Archivo | Rol |
|---------|-----|
| `src/managers/command_manager.js` | 22 comandos, dispatch, roles (489 líneas) |
| `src/handlers/chat_handler.js` | Detección de '.' en chat global |
| `src/handlers/admin_handler.js` | AdminQuietCommandMessage (id=5662) |
| `src/enums/account_role_enum.js` | PLAYER(1), ANIMATOR(2), MODERATOR(3), ADMINISTRATOR(4) |

### Paso a paso

```
1. El comando puede llegar por dos vías:
   a. Chat global con prefijo '.' → CommandManager.manageCommand(content.substr(1))
   b. AdminQuietCommandMessage (id=5662) → mismo flujo

2. CommandManager.manageCommand(command, client):
   a. Separa por espacios: data = command.split(" ")
   b. Busca data[0] en commandsList (array de {name, role, description})
   c. Si no se encuentra → "Impossible de trouver cette commande, pour avoir
      la liste des commandes disponible écris <b>.help</b>"
   d. Verifica rol: client.account.scope >= command.role
   e. Ejecuta por reflexión: CommandManager["handle_" + commandName](data, client)
```

### Lista de comandos

| Comando      | Rol mínimo  | Función                                          |
|-------------|-------------|--------------------------------------------------|
| infos       | MODERATOR   | Muestra versión, uptime, jugadores online        |
| start       | PLAYER      | Teletransporta a zona de inicio                  |
| go          | ANIMATOR    | Teletransporta a (mapId, cellId)                 |
| help        | PLAYER      | Lista comandos disponibles según rol             |
| kick        | ANIMATOR    | Expulsa un jugador (con razón opcional)          |
| ban         | MODERATOR   | Banea un jugador (lockea la cuenta)              |
| unban       | MODERATOR   | Desbanea por nombre de personaje                 |
| exp         | MODERATOR   | Añade experiencia a un personaje                 |
| item        | MODERATOR   | Crea un item por ID en el inventario             |
| emote       | ANIMATOR    | Añade emote(s) a un personaje ("all" = todos)    |
| kamas       | ANIMATOR    | Añade kamas a un personaje                       |
| goto        | ANIMATOR    | Teletransporta al personaje del admin hacia otro |
| gome        | ANIMATOR    | Teletransporta otro personaje hacia el admin     |
| itemset     | ANIMATOR    | Añade todos los items de una panoplia (set)      |
| life        | PLAYER      | Regenera vida al máximo (fuera de combate)       |
| save        | PLAYER      | Guarda el personaje (fuera de combate)           |
| saveworld   | ANIMATOR    | Guarda todos los personajes online               |
| capital     | MODERATOR   | Añade puntos de características                  |
| spell       | MODERATOR   | Aprende un hechizo por ID                        |
| spellpoints | MODERATOR   | Añade puntos de hechizo                          |
| kill        | MODERATOR   | Mata a todos los enemigos en combate actual      |

### Entradas
- String de comando: ".kick Jugador razón opcional"
- `AdminQuietCommandMessage`: content (string)

### Salidas
- `replyText(message)` → mensaje HTML en chat
- `replyError(message)` → mensaje de error en rojo
- `replyImportant(message)` → mensaje importante
- Efectos secundarios: teleports, cambios en DB, kicks, bans

### Validaciones
- Rol del account vs rol requerido por el comando
- Comando existe en commandsList
- Validaciones específicas por comando (personaje existe, no en combate, etc.)

### Errores posibles
- "Vous n'avez pas les droits suffisant pour exécuter cette commande."
- "Impossible de trouver cette commande"
- "Erreur de syntaxe (.comando param1 param2)"
- "Impossible de trouver ce personnage"
- "Impossible en combat" (para .life, .save, .start, .goto)

### Notas técnicas
- **Reflexión**: usa `CommandManager["handle_" + name]` para ejecutar comandos.
  Si un atacante pudiera controlar el nombre del método, sería RCE. En la
  práctica, el nombre debe existir en `commandsList`.
- **Roles**: PLAYER=1, ANIMATOR=2, MODERATOR=3, ADMINISTRATOR=4. La verificación
  es `account.scope >= command.role`.
- **Jerarquía**: un admin no puede kickear/bannear a alguien con rol superior.
- **.kill**: solo funciona en combate. Pone la vida de todos los enemigos a 0
  y llama a `fight.checkEnd()`.
- **.saveworld**: ejecuta `WorldManager.saveWorld()` que itera todos los
  clientes online y guarda sus personajes.
- **.ban**: pone `account.locked = 1`. El unban lo revierte.
- **Idioma**: todos los mensajes de comando están en francés.

---

## Flujo 8: Combate PvM (Jugador vs Monstruos)

### Objetivo
Iniciar y gestionar un combate por turnos entre un jugador y un grupo de
monstruos, incluyendo colocación, turnos, hechizos, daño y recompensas.

### Archivos involucrados
| Archivo | Rol |
|---------|-----|
| `src/handlers/fight_handler.js` | Entrada de mensajes de combate |
| `src/game/fight/fight.js` | Clase central Fight (898 líneas) |
| `src/game/fight/pvm_fight.js` | Fight para PvM |
| `src/game/fight/fight_team.js` | Equipos red/blue |
| `src/game/fight/fighter.js` | Luchador individual |
| `src/game/fight/fight_timeline.js` | Orden de turnos |
| `src/game/fight/fight_spell_processor.js` | Procesamiento de hechizos |
| `src/game/fight/fight_shape_processor.js` | Áreas de efecto (círculo, línea...) |
| `src/game/fight/monster_fighter.js` | Luchador IA para monstruos |
| `src/game/fight/drop_item.js` | Cálculo de drops |
| `src/game/fight/results/fight_pvm_result.js` | Resultado PvM |
| `src/game/monsters/monsters_group.js` | Grupo de monstruos en mapa |
| `src/game/monsters/basic_ai.js` | IA básica de monstruos |

### Paso a paso

#### Inicio del combate

```
1. GameRolePlayAttackMonsterRequestMessage (id=6191)
   → packet.monsterGroupId

2. FightHandler.handleGameRolePlayAttackMonsterRequestMessage():
   a. Busca monsterGroup en map.getMonsterGroup(packet.monsterGroupId)
   b. Verifica que el jugador está en la misma celda que el grupo
   c. Verifica que no está ya en combate
   d. map.removeMonsterGroup(monsterGroup) → desaparece del mapa
   e. Crea new PVMFight(client, monsterGroup)
   f. Añade a map.fights[]
   g. client.character.fight = fight
   h. fight.initialize()
```

#### Inicialización del combate

```
3. Fight.initialize():
   a. Para cada fighter HUMANO:
      - map.removeClient(fighter.character.client)
      - fighter.createContext() → GameContextCreateMessage(2)
      - fighter.getStats().sendStats()
      - send(GameFightStartingMessage)
   b. sendStartupPhase() para cada fighter
   c. showFighters() → GameFightShowFighterMessage a todos
   d. displayMapBlades() → GameRolePlayShowChallengeMessage al mapa
   e. refreshBaseFighters()
   f. startStartupTimeline():
      - Si es PvM: setTimeout de 30 segundos para auto-iniciar

4. Constructor de Fight:
   - id = Math.floor(Date.now() / 10000)
   - fightState = STARTING (1)
   - Equipos: red (jugador) y blue (monstruos)
   - Células de colocación generadas proceduralmente
   - Timeline = new FightTimeline(this)
   - Glyphs = []
```

#### Fase de colocación

```
5. GameFightPlacementPositionRequestMessage (id=704)
   → packet.cellId
   → fight.requestFightPlacement(fighter, cellId)
      - Valida que la celda está en placementCells del equipo
      - Asigna fighter.cellId

6. GameFightReadyMessage (id=708)
   → packet.isReady
   → fighter.setReadyState(isReady)
   → Cuando todos están ready → fight.startFight()
```

#### Fase de combate

```
7. Fight.startFight():
   - fightState = FIGHTING (2)
   - Timeline.sort() → ordena luchadores por iniciativa
   - Primer turno

8. Turno del jugador:
   a. GameActionFightCastRequestMessage (id=1005) o
      GameActionFightCastOnTargetRequestMessage (id=6330)
      → packet.spellId, packet.cellId (o packet.targetId)
   b. fight.requestCastSpell(fighter, spellId, cellId)
   c. FightSpellProcessor.process(fight, caster, spell, spellLevel,
                                   effects, cellId):
      - Separa efectos random de no-random
      - Si hay random: selecciona uno por peso (ruleta)
      - Para cada efecto:
        * getTargets(): calcula objetivos según shape
        * getEffects(effectId): carga el módulo de efecto desde
          src/game/spell/effects/ (carga lazy con require)
        * processor.process({fight, caster, spell, ...})
      - Maneja invisibilidad: si el lanzador es invisible y lanza
        un hechizo no whitelist → se vuelve visible

   d. GameFightTurnFinishMessage (id=718) → fighter.passTurn()

9. Turno del monstruo (IA):
   - Timeline.nextTurn() → siguiente luchador
   - Si es MonsterFighter → BasicAI elige acción:
     * Selecciona hechizo disponible
     * Selecciona objetivo (jugador más cercano o aleatorio)
     * Ejecuta hechizo
   - O pasa turno si no puede actuar
```

#### Fin del combate

```
10. Fight.checkEnd():
    - Si un equipo no tiene miembros vivos → fight.endFight()
    - winner = equipo con miembros vivos
    - looser = equipo derrotado

11. Fight.endFight(result):
    - fightState = END (3)
    - Si es PvM: FightPVMResult
      * Calcula experiencia por nivel de monstruos
      * Calcula drops: DropItem.process(fight)
      * Añade experiencia al jugador
      * statsManager.checkLevelUp()
    - Envía GameFightEndMessage
    - Envía resultados a cada fighter
    - Reintegra jugadores al mapa
    - Limpia la instancia de fight
```

### Entradas
- `GameRolePlayAttackMonsterRequestMessage`: monsterGroupId
- `GameFightPlacementPositionRequestMessage`: cellId
- `GameFightReadyMessage`: isReady (bool)
- `GameActionFightCastRequestMessage`: spellId, cellId
- `GameActionFightCastOnTargetRequestMessage`: spellId, targetId
- `GameFightTurnFinishMessage`: sin params
- `GameFightJoinRequestMessage`: fightId, fighterId
- `GameContextQuitMessage`: sin params (abandonar)

### Salidas
- `GameFightStartingMessage`: fightType, attackerId, defenderId
- `GameFightShowFighterMessage`: informaciones de cada luchador
- `GameRolePlayShowChallengeMessage`: blades en el mapa
- `GameFightTurnListMessage`: orden de turnos
- `GameFightSynchronizeMessage`: cambios de estado de luchadores
- `GameActionFightSpellCastMessage`: animación de hechizo
- `GameActionFightLifePointsLostMessage`: daño aplicado
- `GameFightEndMessage`: duración, resultado, recompensas

### Validaciones
- Grupo de monstruos existe en el mapa
- Jugador en misma celda que el grupo
- Jugador no está ya en combate
- Celda de colocación dentro de placementCells
- Hechizo conocido por el luchador
- Turno actual corresponde al luchador

### Errores posibles
- Grupo no encontrado: "Can't attack the monster group because is missing"
- Celda incorrecta: "Can't attack the monster group because he is not on the
  same cell"
- Hechizo no manejado: "Effect id: X of the spellLevel id Y is not handled yet"
- Efecto undefined: "Trying to process an undefined effect"

### Notas técnicas
- **Efectos lazy-load**: `FightSpellProcessor.getEffects()` carga todos los
  módulos de `src/game/spell/effects/` con `fs.readdirSync` la primera vez.
  Usa `require()` dinámico, no `import`.
- **Efectos random**: el parámetro `random` en efectos es un peso (0-100).
  Se usa ruleta de selección ponderada.
- **Invisibilidad**: los luchadores invisibles se vuelven visibles al lanzar
  hechizos no whitelist. Whitelist definida en `white_list_invisible_state.js`.
- **Auto-inicio PvM**: si el jugador no coloca en 30 segundos, el combate
  inicia automáticamente.
- **Células de colocación**: generadas proceduralmente con
  `generateProceduralyCells()`. El código tiene un TODO: "Fix place cells or
  with pattern".
- **Drops**: se calculan al final del combate usando `DropItem.process(fight)`.
- **Experiencia**: se añade con `character.experience += xp` y
  `statsManager.checkLevelUp()` para verificar subida de nivel.
- **PVMFight vs ChallengeFight**: PvM usa `PVMFight` (hereda de Fight),
  PvP amistoso usa `ChallengeFight`.

---

## Flujo 9: Interacción con NPCs (diálogo y comercio)

### Objetivo
Permitir al jugador hablar con NPCs para diálogos y comercio (compra/venta).

### Archivos involucrados
| Archivo | Rol |
|---------|-----|
| `src/handlers/npc_handler.js` | Entrada de mensajes NPC |
| `src/database/models/npc_spawn.js` | Modelo de NPC en el mapa |
| `src/game/npcs/actions/npcTalk.js` | Acción de hablar |
| `src/game/npcs/actions/npcBuySell.js` | Acción de comercio |
| `src/game/dialog/npc_dialog.js` | Sistema de diálogo |
| `src/game/dialog/shop_dialog.js` | Sistema de tienda |
| `src/game/npcs/replies/dialog.js` | Ejecución de respuestas de diálogo |
| `src/game/npcs/replies/teleport.js` | Respuesta de teletransporte |
| `src/database/datacenter.js` | getNpcReplies, getNpcItems |

### Paso a paso

#### Apertura del NPC

```
1. NpcGenericActionRequestMessage (id=5898)
   → packet.npcId, packet.npcActionId

2. NpcHandler.handleNpcGenericActionRequestMessage():
   a. Busca NPC en el mapa: map.getNpcMap(packet.npcId)
   b. Si existe → npc.open(character, npcActionId)

3. NpcSpawn.open(character, action):
   a. canOpen():
      - Mismo mapa
      - No en combate
      - No tiene requestedFighterId
      - Tiene acciones configuradas
      - La acción solicitada existe
   b. Busca handler: NpcSpawn.handlerAction[action]
      - acción 1 → NpcBuySell.execute (comercio)
      - acción 2 → "" (vacío, no implementado)
      - acción 3 → NpcTalk.execute (diálogo)
```

#### Diálogo NPC (acción 3)

```
4. NpcTalk.execute(character, npc):
   → new NpcDialog(character, npc)
   → npc.open()

5. NpcDialog.open():
   a. character.setDialog(this)
   b. Envía NpcDialogCreationMessage(mapId, -npc._id)
   c. currentMessage = npc.currentMessage
   d. changeMessage()

6. NpcDialog.changeMessage():
   a. Obtiene replies: npc.getReplies(currentMessage)
      → Datacenter.getNpcReplies(messageId)
   b. Si hay replies:
      - Extrae replyId de cada uno
      - Envía NpcDialogQuestionMessage(currentMessage, ["0"], replyIds)
   c. Si no hay replies → close()

7. NpcDialogReplyMessage (id=5616):
   → packet.replyId
   → NpcHandler.handleNpcDialogReplyMessage():
      - Verifica que character.dialog es NpcDialog
      - Llama a dialog.reply(replyId)

8. NpcDialog.reply(replyId):
   a. Busca la respuesta: existReply(replyId)
   b. Ejecuta según replyType[reply.type]:
      - "dialog" → Dialog.execute(character, npc, reply)
        * Cambia npc.currentMessage = reply.optionalValue1
        * Llama a changeMessage() → siguiente paso del diálogo
      - "teleport" → Teleport.execute(character, npc, reply)
        * WorldManager.teleportClient(client, reply.mapId, reply.cellId)
   c. Si no hay replyType → close()
```

#### Comercio NPC (acción 1)

```
9. NpcBuySell.execute(character, npc):
   → new ShopDialog(character, npc)
   → shopDialog.open()

10. ShopDialog.open():
    a. character.setDialog(this)
    b. Obtiene acción tipo 1: npc.getAction(1)
       - money = action.itemId (moneda alternativa) o 0 (kamas)
    c. Para cada item del NPC:
       - ItemManager.getItemTemplateById(item.itemId)
       - Genera efectos aleatorios (diceNum/diceSide)
       - Crea ObjectItemToSellInNpcShop
    d. Envía ExchangeStartOkNpcShopMessage(-npc._id, money, items)

11. Compra: ExchangeBuyMessage (id=5774)
    → shopDialog.buyItem(packet)
    a. Valida quantity > 0
    b. Busca item: npc.getItem(packet.objectToBuyId)
    c. Calcula price = item.price * quantity
    d. Verifica fondos: canBuy(price)
       - Si money > 0: verifica item de moneda en inventario
       - Si money == 0: verifica kamas
    e. Genera item: ItemManager.generateItemStack(itemId, quantity)
    f. Cobra: subKamas(price) o updateItemByTemplateIdAndQuantity
    g. Añade item al inventario
    h. Envía ExchangeBuyOkMessage

12. Venta: ExchangeSellMessage (id=5778)
    → shopDialog.sellItem(packet)
    a. Valida quantity > 0
    b. Busca item en inventario: itemBag.getItemByID(packet.objectToSellId)
    c. Valida cantidad suficiente
    d. Precio de venta: Math.ceil((itemTemplate.price * quantity) / 10)
    e. Elimina items: updateItemByUIDAndQuantity
    f. Añade kamas: addKamas(price)
    g. Envía ExchangeSellOkMessage
```

### Entradas
- `NpcGenericActionRequestMessage`: npcId (int), npcActionId (byte)
- `NpcDialogReplyMessage`: replyId (varInt)
- `ExchangeBuyMessage`: objectToBuyId (varInt), quantity (varInt)
- `ExchangeSellMessage`: objectToSellId (varInt), quantity (varInt)
- `LeaveDialogRequestMessage`: sin params

### Salidas
- `NpcDialogCreationMessage`: mapId, npcId
- `NpcDialogQuestionMessage`: messageId, params, visibleReplies
- `ExchangeStartOkNpcShopMessage`: npcId, money, items
- `ExchangeBuyOkMessage` / `ExchangeSellOkMessage`
- `ExchangeErrorMessage`: errorType (8 o 9)

### Validaciones
- NPC existe en el mapa actual
- Jugador no está en combate
- La acción solicitada existe para ese NPC
- Compra: fondos suficientes, item válido
- Venta: posee el item, cantidad suficiente

### Errores posibles
- NPC no encontrado → silencio (npcs == null)
- Diálogo sin respuestas → se cierra automáticamente
- Fondos insuficientes → ExchangeErrorMessage(8)
- Item no encontrado en venta → ExchangeErrorMessage(9)
- Cantidad inválida → ExchangeErrorMessage(8/9)

### Notas técnicas
- **NPC ID negativo**: `NpcDialogCreationMessage` usa `-npc._id`. El cliente
  interpreta IDs negativos como NPCs (positivos son jugadores).
- **Moneda alternativa**: el campo `action.itemId` permite definir un item
  como moneda (ej. tokens, ogrinas). Si es 0, se usan kamas.
- **Efectos de items en tienda**: los efectos se generan con dados
  (`diceNum`/`diceSide`) y un valor aleatorio entre ambos. Esto simula la
  variabilidad de stats en items.
- **Precio de venta**: 10% del precio base del item (`price / 10`).
- **Acción 2**: existe en `handlerAction` como string vacío. No implementada.
- El diálogo usa un sistema de mensajes encadenados por `messageId`. Cada
  mensaje tiene replies que apuntan al siguiente `messageId`.

---

## Flujo 10: Zaaps y teletransporte

### Objetivo
Permitir el viaje rápido entre zaaps del mundo, con costo en kamas
proporcional a la distancia.

### Archivos involucrados
| Archivo | Rol |
|---------|-----|
| `src/handlers/interactive_handler.js` | Manejo de interactivos |
| `src/game/dialog/zaap_dialog.js` | Diálogo de zaap |
| `src/game/dialog/zaapi_dialog.js` | Diálogo de zaapi |
| `src/managers/world_manager.js` | teleportClient |
| `src/database/datacenter.js` | interactivesObjects, maps_positions |

### Paso a paso

#### Abrir zaap

```
1. InteractiveUseRequestMessage (id=5001)
   → packet.elemId

2. InteractiveHandler.parseInteractive(client, packet):
   a. Busca elemento: getElementId(packet.elemId)
      → Búsqueda en Datacenter.interactivesObjects
   b. Si existe:
      - Envía InteractiveUsedMessage
      - Envía InteractiveUseEndedMessage
      - Busca handler: ActionInteractive[element.actionType]
        * "Zaap" → openZaap()
        * "Zaapi" → openZaapi()
        * "Teleport" → teleportAction()
        * "Use" → useAction()

3. openZaap(client, packet):
   → new ZaapDialog(client, packet)
   → zaapDialog.openZaap()

4. ZaapDialog.openZaap():
   a. character.setDialog(this)
   b. Determina lista de zaaps:
      - Si config.zaaps.all_zaaps == true:
        → getElementIdByType("Zaap") → todos los zaaps
      - Si false:
        → getElementIdByMap(character.zaapKnows) → solo conocidos
   c. Para cada zaap, carga asíncronamente:
      - WorldManager.getMap(mapId)
      - InteractiveHandler.getMapPosition(mapId)
      - Calcula costo: getCost(posActual, posDestino)
        → Math.floor(Math.sqrt((x1-x2)*(y1-x2)+(y1-y2)*(y1-y2)) * 10)
      - Si costo es NaN → 1000 kamas
   d. Cuando todos están cargados:
      → ZaapListMessage(0, maps, subareas, prices, types, currentMapId)

5. TeleportRequestMessage (id=5961)
   → packet.mapId, packet.teleporterType (0=zaap, 1=zaapi)

6. ZaapDialog.teleportZaap(client, packet):
   a. WorldManager.getMap(packet.mapId)
   b. Calcula precio del viaje
   c. Verifica fondos: character.itemBag.money >= price
   d. Busca celda del zaap: Datacenter.getMapElement(mapId, map.getZaap().elementId)
   e. WorldManager.teleportClient(client, mapId, cell)
   f. Si éxito: character.leaveDialog()
   g. Si fondos insuficientes: replyLangsMessage(1, 82, [])
```

#### Registrar nuevo zaap

```
7. Al entrar en un mapa con zaap:
   → InteractiveHandler.checkIfCharacterHaveZaap(client, map)
   a. Si config.zaaps.all_zaaps == false y map tiene zaap
   b. Verifica si el personaje ya conoce este zaap
   c. Si no → character.zaapKnows.push(map._id)
   d. Guarda personaje
   e. Mensaje: replyLangsMessage(0, 24, []) ("Nouveau zaap enregistré")
```

### Entradas
- `InteractiveUseRequestMessage`: elemId (varInt)
- `TeleportRequestMessage`: mapId (int), teleporterType (byte)

### Salidas
- `InteractiveUsedMessage`: entityId, elemId, skillId, duration, canMove
- `InteractiveUseEndedMessage`: elemId, skillId
- `ZaapListMessage`: teleporterType, mapIds, subAreaIds, costs, types, spawnMapId
- `LeaveDialogMessage`: dialogType (10 = zaap)

### Validaciones
- Elemento interactivo existe
- Es del tipo "Zaap", "Zaapi", "Teleport" o "Use"
- Fondos suficientes para el viaje
- Mapa destino existe y es accesible

### Errores posibles
- Fondos insuficientes: replyLangsMessage(1, 82, [])
  ("Vous ne disposez pas des kamas nécessaires.")
- Mapa destino no encontrado: "Impossible de vous téléporter sur cette carte !"
- Costo NaN → se usa 1000 kamas por defecto

### Notas técnicas
- **Fórmula de costo**: `Math.floor(sqrt(dx² + dy²) * 10)`. La fórmula tiene
  un bug: `(x1-x2)*(y1-x2)` usa `y1-x2` en lugar de `x1-x2` en el segundo
  factor. Debería ser `(x1-x2)*(x1-x2) + (y1-y2)*(y1-y2)`.
- **all_zaaps**: configuración en `config.json` que permite ver todos los
  zaaps sin necesidad de descubrirlos.
- **Zaapi**: versión "interior" del zaap (dentro de edificios). Misma
  mecánica pero `teleporterType = 1`.
- **Carga asíncrona**: `ZaapDialog.openZaap()` hace load asíncrono de cada
  mapa con `WorldManager.getMap()`. Espera a que todos terminen antes de
  enviar la lista. Esto puede ser lento con muchos zaaps.
- **Teleport action**: los elementos tipo "Teleport" ejecutan
  `WorldManager.teleportClient` directamente sin diálogo.
- **Use action**: actualmente solo soporta `optionalValue1 == "Message"` que
  envía un texto al jugador.

---

## Resumen de messageId usados

| messageId | Mensaje                              | Handler          |
|-----------|--------------------------------------|------------------|
| 1         | ProtocolRequiredMessage              | (auto)           |
| 4         | IdentificationMessage                | auth_handler     |
| 40        | ServerSelectionMessage               | auth_handler     |
| 110       | AuthenticationTicketMessage          | approach_handler |
| 150       | CharactersListRequestMessage         | approach_handler |
| 152       | CharacterSelectionMessage            | approach_handler |
| 160       | CharacterCreationRequestMessage      | approach_handler |
| 162       | CharacterNameSuggestionRequestMessage| approach_handler |
| 165       | CharacterDeletionRequestMessage      | approach_handler |
| 221       | ChangeMapMessage                     | game_handler     |
| 225       | MapInformationsRequestMessage        | game_handler     |
| 250       | GameContextCreateRequestMessage      | game_handler     |
| 255       | GameContextQuitMessage               | fight_handler    |
| 700-799   | Fight placement, ready, join, turn   | fight_handler    |
| 800       | ChatSmileyRequestMessage             | game_handler     |
| 851       | ChatClientPrivateMessage             | chat_handler     |
| 861       | ChatClientMultiMessage               | chat_handler     |
| 945       | GameMapChangeOrientationRequestMessage| game_handler    |
| 950       | GameMapMovementRequestMessage        | game_handler     |
| 952       | GameMapMovementConfirmMessage        | game_handler     |
| 953       | GameMapMovementCancelMessage         | game_handler     |
| 1005      | GameActionFightCastRequestMessage    | fight_handler    |
| 3021-3022 | ObjectSetPosition/Delete             | item_handler     |
| 4001-4004 | Friend messages                      | friend_handler   |
| 5001      | InteractiveUseRequestMessage         | interactive_handler |
| 5501      | LeaveDialogRequestMessage            | interactive_handler |
| 5508-5520 | Exchange messages                    | exchange_handler |
| 5574-6264 | Party messages (11)                  | party_handler    |
| 5602-5603 | Friend delete/warn                   | friend_handler   |
| 5616      | NpcDialogReplyMessage                | npc_handler      |
| 5662      | AdminQuietCommandMessage             | admin_handler    |
| 5673-5680 | Ignored messages                     | ignored_handler  |
| 5685      | EmotePlayRequestMessage              | emote_handler    |
| 5731-5732 | Fight request/answer                 | fight_handler    |
| 5773-5778 | Exchange request/move/buy/sell       | exchange/npc_handler |
| 5898      | NpcGenericActionRequestMessage       | npc_handler      |
| 5961      | TeleportRequestMessage               | interactive_handler |
| 6080-6254 | Party management                     | party_handler    |
| 6191      | GameRolePlayAttackMonsterRequestMessage| fight_handler  |
| 6192      | MoodSmileyRequestMessage             | friend_handler   |
| 6225-6230 | Shortcut messages                    | game_handler     |
| 6330      | FightCastOnTargetRequestMessage      | fight_handler    |
| 6540      | ReloginTokenRequestMessage           | approach_handler (comentado) |
| 6655      | SpellModifyRequestMessage            | game_handler     |
| 6702      | FinishMoveListRequestMessage         | finish_move_handler |
