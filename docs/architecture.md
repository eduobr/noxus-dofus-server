# Noxus — Architecture

Documento de arquitectura del emulador Noxus (Dofus 2.39).
Cubre capas, dependencias, patrones, flujos y deuda técnica.

---

## 1. Arquitectura general

Noxus es un **monolito en capas** que ejecuta dos servidores TCP (auth +
world) en un solo proceso Node.js. Los datos estáticos del juego se cargan
completos en RAM al iniciar mediante `Datacenter`. Los datos dinámicos
(cuentas, personajes, inventarios) se persisten en MongoDB en tiempo real.

El servidor implementa el protocolo binario propietario de Dofus 2.39
(protocol ID 1738) usando ingeniería inversa. Cada mensaje tiene un
`messageId` numérico, una longitud variable (1-3 bytes) y un payload
serializado manualmente campo por campo.

```
┌──────────────────────────────────────────────────────────────┐
│                    Cliente Dofus (.swf)                       │
│            patch/DofusInvoker.swf (modificado)                │
└────────────┬───────────────────────────┬─────────────────────┘
             │ TCP :443                  │ TCP :5556
             ▼                           ▼
┌──────────────────────┐   ┌──────────────────────────────────┐
│     AuthServer        │   │        WorldServer               │
│  src/network/auth.js  │   │   src/network/world.js          │
│                       │   │                                  │
│  AuthClient[]         │   │  WorldClient[]                  │
│  clients_tickets[]    │   │  partys[]                       │
│                       │   │  instanciedMaps[]               │
│  → HelloConnectMessage│   │  startTime                      │
│    (key + salt D2.39) │   │                                  │
└──────────┬───────────┘   └──────────────┬───────────────────┘
           │                              │
           └──────────┬───────────────────┘
                      ▼
┌──────────────────────────────────────────────────────────────┐
│                   Processor (router)                          │
│            src/network/processor.js                           │
│                                                              │
│  Diccionario estático PROTOCOL_HANDLERS:                     │
│  messageId → { message: clase, handler: función }            │
│  ~50 mensajes mapeados (~25% del protocolo total)             │
│                                                              │
│  Flujo de un mensaje:                                        │
│  socket data → WorldClient.processPart()                     │
│    → header = readShort(), messageId = header >> 2           │
│    → typeLen = header & 3, len = getPacketLength(buffer, tl) │
│    → Processor.handle(client, messageId, slice(buffer, len)) │
│    → new handler.message().deserialize(buffer)               │
│    → handler.handler(client, packet)                         │
└──────────┬───────────────────────────────────────────────────┘
           ▼
┌──────────────────────────────────────────────────────────────┐
│                Handlers (15 archivos)                         │
│                                                              │
│  auth_handler       → login, password, servidor              │
│  approach_handler   → ticket, lista/selección de personajes  │
│  game_handler       → movimiento, stats, hechizos, shortcuts │
│  chat_handler       → chat privado y multicanal              │
│  admin_handler      → comandos de administrador               │
│  friend_handler     → amigos, lista, estado, warn            │
│  ignored_handler    → lista de ignorados                      │
│  interactive_handler→ objetos interactivos, zaaps, diálogos  │
│  emote_handler      → emotes                                 │
│  item_handler       → inventario, mover/borrar objetos       │
│  party_handler      → grupos, invitaciones, follow           │
│  exchange_handler   → intercambio entre jugadores            │
│  fight_handler      → combate PvM/PvP, hechizos en combate   │
│  npc_handler        → diálogos y comercio NPC                │
│  finish_move_handler→ acabados (finishing moves)             │
└──────────┬───────────────────────────────────────────────────┘
           ▼
┌──────────────────────────────────────────────────────────────┐
│               Game Logic (src/game/)                          │
│                                                              │
│  fight/     → Fight, FightTeam, Fighter, FightTimeline,     │
│               FightSpellProcessor, FightShapeProcessor,      │
│               MonsterFighter, DropItem, resultados           │
│  spell/     → SpellManager, buffs/ (~25 tipos), effects/    │
│               (~30 efectos: daño, buffs, push, steal, trap)  │
│  monsters/  → Monster, MonstersGroup, MonstersManager,       │
│               IA básica (BasicAI)                            │
│  npcs/      → Acciones (talk, buy/sell) y respuestas         │
│               (dialog, teleport)                             │
│  pathfinding→ A* sobre grid hexagonal, MapPoint, CellInfo,   │
│               DataMapProvider                                │
│  party/     → Party, PartyFollower, PartyInvitation          │
│  dialog/    → NpcDialog, ShopDialog, ZaapDialog, ZaapiDialog │
│  exchange/  → ExchangePlayer                                 │
│  item/      → ItemManager, ItemDiceEffect, ItemEffectInteger │
│  stats/     → StatsManager, MonsterStatsManager              │
│  map_tools/ → Dofus1Line (algoritmo de línea recta)         │
└──────────┬───────────────────────────────────────────────────┘
           ▼
┌──────────────────────────────────────────────────────────────┐
│                Managers (src/managers/)                       │
│                                                              │
│  character_manager   → breeds, looks, experiencia,           │
│                        ciclo de vida del personaje           │
│  world_manager       → caché de mapas, teleports, save       │
│  spawn_manager       → generación de monstruos por subárea   │
│  command_manager     → 22 comandos admin con roles           │
│  chat_restriction_   → cooldowns por canal de chat           │
│  exchange_manager    → estado de intercambios                │
│  loader_manager      → carga datos de cuenta al hacer login  │
│  look_manager        → parseo de strings EntityLook          │
│  sublook_manager     → sub-entidades del look                │
└──────────┬───────────────────────────────────────────────────┘
           ▼
┌──────────────────────────────────────────────────────────────┐
│              Database Layer                                   │
│                                                              │
│  Datacenter (RAM)  ◄─── DBManager ───►  MongoDB              │
│  ~19 colecciones         (src/database/)   localhost:27017   │
│  cacheadas:                                                  │
│  breeds, heads, spells,                                      │
│  items, monsters, maps,                                      │
│  npcs, experiences,                                          │
│  emotes, smileys...                                          │
│                                                              │
│  models/ (7 archivos):                                       │
│  Account, AccountFriend, AccountIgnored,                     │
│  Character, CharacterItem, ItemBag, Map, NpcSpawn            │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Estructura de carpetas

```
Dofus/
├── src/                       # Código fuente del servidor
│   ├── app.js                 # Entry point. Orquesta arranque en 6 pasos.
│   ├── common.js              # DOFUS_PROTOCOL_ID=1738, versión NOXUS
│   │
│   ├── io/                    # Capa de entrada/salida
│   │   ├── bytearray.js       # Lector/escritor binario big-endian (1229 líneas)
│   │   ├── custom_data_wrapper.js # Wrapper con varint, BooleanByteWrapper,
│   │   │                          # Int64/UInt64, Binary64 (634 líneas)
│   │   ├── logger.js          # Logger con colores: infos/error/debug/network
│   │   └── dofus/             # Implementación del protocolo Dofus
│   │       ├── messages.js    # ~5000 líneas: TODOS los mensajes del protocolo
│   │       ├── types.js       # ~3500 líneas: ~150 tipos de datos
│   │       ├── network_message.js # Formato de header: (msgId << 2) | typeLen
│   │       └── protocol_type_manager.js # 300 líneas: typeProtocolId → clase
│   │
│   ├── network/               # Servidores TCP
│   │   ├── auth.js            # AuthServer: escucha en puerto 443
│   │   ├── auth_client.js     # AuthClient: recibe/send, HelloConnectMessage
│   │   ├── world.js           # WorldServer: escucha en puerto 5556
│   │   ├── world_client.js    # WorldClient: recibe/send, maneja desconexión
│   │   └── processor.js       # Router messageId → handler (~130 líneas)
│   │
│   ├── handlers/              # Manejadores de mensajes (15 archivos)
│   │   ├── auth_handler.js    # Login, validación de cuenta, ticket
│   │   ├── approach_handler.js# Selección de servidor/personaje
│   │   ├── game_handler.js    # Movimiento, mapas, stats, shortcuts, spells
│   │   ├── chat_handler.js    # Chat privado y multicanal
│   │   ├── admin_handler.js   # Comandos admin (messageId 5662)
│   │   ├── friend_handler.js  # Amigos, warn on connection
│   │   ├── ignored_handler.js # Lista de ignorados
│   │   ├── interactive_handler.js # Objetos interactivos, zaaps
│   │   ├── emote_handler.js   # Emotes
│   │   ├── item_handler.js    # Mover/borrar objetos del inventario
│   │   ├── party_handler.js   # Grupos: crear, invitar, kick, follow
│   │   ├── exchange_handler.js# Intercambio entre jugadores
│   │   ├── fight_handler.js   # Combate: iniciar, hechizos, turnos
│   │   ├── npc_handler.js     # Diálogos y comercio con NPCs
│   │   └── finish_move_handler.js # Acabados (finishing moves)
│   │
│   ├── game/                  # Lógica de juego (~80 archivos)
│   │   ├── fight/             # Sistema de combate (11 archivos)
│   │   ├── spell/             # Hechizos, buffs (25), efectos (30)
│   │   ├── monsters/          # Monstruos (3) + IA básica (1)
│   │   ├── npcs/              # Acciones (2) + respuestas (2)
│   │   ├── pathfinding/       # A* hexagonal (7 archivos)
│   │   ├── party/             # Sistema de grupos (4)
│   │   ├── dialog/            # Diálogos NPC, tienda, zaap, zaapi (4)
│   │   ├── exchange/          # Intercambio entre jugadores (1)
│   │   ├── item/              # Gestión de objetos (3)
│   │   ├── stats/             # Estadísticas (2)
│   │   └── map_tools/         # Dofus1Line (1)
│   │
│   ├── database/              # Persistencia
│   │   ├── dbmanager.js       # Acceso a MongoDB (~450 líneas)
│   │   ├── datacenter.js      # Carga datos de juego en RAM (~300 líneas)
│   │   └── models/            # Modelos de datos (7 archivos)
│   │
│   ├── managers/              # Gestores globales (9 archivos)
│   ├── enums/                 # Enumeraciones (14 archivos)
│   ├── utils/                 # Utilidades (3: config, format, basic)
│   ├── world/                 # map_instance.js (vacío, 0 bytes)
│   └── typings/               # Definiciones TypeScript para Node.js
│
├── db/                        # Datos de juego en JSON (27 archivos)
├── tools/                     # Herramientas de extracción (4 subcarpetas)
│   ├── Noxus-D2OReader/       # Lee archivos .d2o del cliente
│   ├── Noxus-D2IReader/       # Lee archivos .d2i (i18n)
│   ├── Noxus-ItemAppearenceSniffer/ # Extrae apariencias de items
│   ├── Noxus-ExperienceImporter/    # Importa tablas de experiencia
│   └── AmaknaSniffer/         # Sniffer de logs del juego oficial
├── export/                    # Definiciones de protocolo exportadas
│   ├── protocol.js            # typeProtocolId[] (~290 líneas)
│   ├── Messages.js            # Definiciones de mensajes
│   └── Types.js               # Definiciones de tipos
├── patch/                     # DofusInvoker.swf modificado
├── docs/                      # Documentación del proyecto
├── config.json                # Configuración del servidor
├── package.json               # Dependencias NPM
├── .babelrc                   # Babel: preset es2015 + class-properties
├── .gitignore                 # Ignora node_modules, dist/
└── compilation.sh             # Build: babel src → dist (watch)
```

---

## 3. Responsabilidad de cada carpeta importante

### `src/io/` — Capa de entrada/salida

Responsable de toda la serialización binaria. El protocolo Dofus es big-endian
con tipos de longitud variable (varint, varshort, varlong).

| Archivo                    | Líneas | Rol                                              |
|----------------------------|--------|--------------------------------------------------|
| `bytearray.js`             | 1229   | Lector/escritor binario puro. DataView + offset. |
|                            |        | Lee/escribe: boolean, byte, short, int, float,   |
|                            |        | double, UTF-8, UTF-16, bits individuales,        |
|                            |        | variable-sized unsigned int. Soporta zlib.       |
| `custom_data_wrapper.js`   | 634    | Capa sobre ByteArray. Añade: varInt, varShort,   |
|                            |        | varLong, Int64/UInt64, BooleanByteWrapper        |
|                            |        | (empaqueta 8 flags en 1 byte).                   |
| `dofus/network_message.js` | 70     | Formato de header TCP:                           |
|                            |        | `(messageId << 2) | typeLen` + longitud 1-3 bytes|
| `dofus/messages.js`        | 4912   | Definición de TODOS los mensajes del protocolo.  |
|                            |        | Cada clase extiende `ProtocolMessage(id)`.       |
| `dofus/types.js`           | 3468   | Definición de ~150 tipos de datos compuestos.    |
| `dofus/protocol_type_      | 306    | Mapea typeProtocolId (ej. 484) a nombre de clase |
|  manager.js`               |        | (ej. "StatisticData"). Lazy-init.                |
| `logger.js`                | 42     | Logger con colores. Niveles: infos, error, debug,|
|                            |        | network (solo si Logger.level == 0), warning.    |

### `src/network/` — Servidores TCP

| Archivo           | Líneas | Rol                                              |
|-------------------|--------|--------------------------------------------------|
| `auth.js`         | 64     | net.createServer en puerto 443. Trackea clientes |
|                   |        | y tickets (crypto.randomBytes 42 → hex).         |
| `auth_client.js`  | 84     | Socket de cliente auth. Envía HelloConnectMessage|
|                   |        | con key "ivu9wh58^kQQw*8n:jud11Kw(bHY9m3V".      |
|                   |        | Recibe datos, parsea headers, delega a Processor.|
| `world.js`        | 129    | net.createServer en puerto 5556. Trackea clientes,|
|                   |        | partys[], instanciedMaps[]. Métodos de búsqueda   |
|                   |        | de clientes online por nombre, ID, nickname.      |
| `world_client.js` | 106    | Socket de cliente world. Maneja desconexión:      |
|                   |        | removeClient del mapa, disconnect del fight,      |
|                   |        | save del personaje.                               |
| `processor.js`    | 132    | Router central. Diccionario PROTOCOL_HANDLERS     |
|                   |        | con ~50 entradas messageId → handler.             |

AuthClient y WorldClient comparten la misma lógica de parseo de paquetes:
leer header (2 bytes), extraer messageId (`header >> 2`) y typeLen
(`header & 3`), leer longitud según typeLen (1, 2 o 3 bytes), y pasar el
slice al Processor.

### `src/handlers/` — Manejadores de mensajes

Cada handler es una clase con métodos `static` que reciben `(client, packet)`.
Delegan la lógica de negocio a `src/game/` y `src/managers/`. Responden al
cliente con `client.send(new Messages.AlgunMensaje(...))`.

Los 15 handlers cubren estas responsabilidades:

| Handler              | Responsabilidad                                    |
|----------------------|----------------------------------------------------|
| auth_handler         | Login, validación de password, lista de servidores |
| approach_handler     | Ticket de autenticación, lista/creación/selección  |
|                      | de personajes                                      |
| game_handler         | Movimiento en mapa, cambio de orientación, stats,  |
|                      | shortcuts, hechizos, solicitud de info de mapa     |
| chat_handler         | Chat privado (id=851) y multicanal (id=861)        |
| admin_handler        | Recibe AdminQuietCommandMessage, parsea y delega   |
|                      | a CommandManager                                   |
| friend_handler       | Agregar/eliminar amigos, lista, warn on connection |
| ignored_handler      | Agregar/eliminar/consultar ignorados               |
| interactive_handler  | Usar objetos interactivos, dejar diálogo, teleport |
| emote_handler        | Reproducir emotes                                  |
| item_handler         | Mover objeto en inventario, borrar objeto          |
| party_handler        | 11 operaciones: crear, invitar, aceptar, rechazar, |
|                      | cancelar, abandonar, kick, abdicar, seguir, dejar  |
|                      | de seguir, detalles de invitación                  |
| exchange_handler     | Solicitar, aceptar, mover kamas/items, confirmar   |
| fight_handler        | Iniciar combate, responder desafío amistoso,       |
|                      | colocar luchador, listo, unirse, abandonar,        |
|                      | terminar turno, lanzar hechizo, echar, atacar      |
|                      | monstruo                                           |
| npc_handler          | Acción genérica NPC, responder diálogo, comprar,   |
|                      | vender                                             |
| finish_move_handler  | Solicitar lista de acabados                        |

### `src/game/` — Lógica de juego

La capa más grande (~80 archivos). Contiene toda la lógica de negocio:

| Subcarpeta   | Archivos | Rol                                              |
|--------------|----------|--------------------------------------------------|
| fight/       | 11       | Combate por turnos. Fight (898 líneas) es la     |
|              |          | clase central. Maneja fases: STARTING, FIGHTING, |
|              |          | ENDING. Tipos: PvM, PvP, challenge, agresión.    |
|              |          | Incluye cálculo de daños, timeline, resultados,   |
|              |          | drops.                                           |
| spell/       | ~55      | Hechizos: SpellManager, SpellHistory, categorías. |
|              |          | buffs/ (25 clases): add_ap, remove_mp, add_range, |
|              |          | invisibility, damage_x, steal_x...               |
|              |          | effects/ (30 clases): daño por elemento, buffs,   |
|              |          | push, attraction, teleport, trap, steal...       |
| monsters/    | 4        | Monster, MonstersGroup, MonstersManager, BasicAI |
| pathfinding/ | 7        | A* sobre grid hexagonal. MapPoint (coordenadas    |
|              |          | hex), CellInfo, DataMapProvider, DirectionsEnum,  |
|              |          | Point, Pathfinding, PathfindingDijkstra           |
| npcs/        | 4        | actions/: npcBuySell, npcTalk                    |
|              |          | replies/: dialog, teleport                       |
| dialog/      | 4        | NpcDialog, ShopDialog, ZaapDialog, ZaapiDialog   |
| party/       | 4        | Party, PartyFollower, PartyFriend, PartyInvitation|
| exchange/    | 1        | ExchangePlayer                                   |
| item/        | 3        | ItemManager, ItemDiceEffect, ItemEffectInteger   |
| stats/       | 2        | StatsManager, MonsterStatsManager                |
| map_tools/   | 1        | Dofus1Line: algoritmo de línea recta en grid hex |

### `src/database/` — Persistencia

| Archivo          | Líneas | Rol                                              |
|------------------|--------|--------------------------------------------------|
| dbmanager.js     | 453    | CRUD contra MongoDB. Métodos: findAccount,        |
|                  |        | createCharacter, deleteCharacter, updateCharacter,|
|                  |        | getCharacters, getBreeds, getMaps, getItems,      |
|                  |        | getSpells, getMonsters, getNpcs... (~30 métodos) |
|                  |        | Usa mongodb-autoincrement para IDs autoincrement. |
| datacenter.js    | 303    | Carga ~19 colecciones de MongoDB a RAM en arrays  |
|                  |        | estáticos. 18 loaders paralelos. Provee getters   |
|                  |        | con búsqueda O(n): getNpcs(id), getMapElement(),  |
|                  |        | getInteractivesMap(id)...                         |
| models/          | 7       | Account, AccountFriend, AccountIgnored, Character,|
|                  |        | CharacterItem, ItemBag, Map, NpcSpawn             |

### `src/managers/` — Gestores globales

| Manager                  | Líneas | Rol                                              |
|--------------------------|--------|--------------------------------------------------|
| character_manager.js     | 198    | Breed stats, look parsing, experiencia por nivel, |
|                          |        | ciclo connect/disconnect, auto-aprender hechizos, |
|                          |        | crear shortcuts de hechizos, regeneración.       |
| world_manager.js         | 75     | Caché de mapas (WorldManager.maps[]), teleport   |
|                          |        | entre mapas, getMap (carga lazy de MongoDB),      |
|                          |        | saveWorld (guarda todos los personajes online).   |
| spawn_manager.js         | 208    | Generación de monstruos por subárea. Lógica de   |
|                          |        | miniboss: máximo por subárea configurable.       |
|                          |        | Grupos de 2-5 monstruos, celdas walkable random. |
| command_manager.js       | 489    | 22 comandos admin (en francés): infos, start, go, |
|                          |        | help, kick, ban, unban, exp, item, emote, kamas, |
|                          |        | goto, gome, itemset, life, save, saveworld,      |
|                          |        | capital, spell, spellpoints, kill.               |
|                          |        | Roles: PLAYER(1), ANIMATOR(2), MODERATOR(3),     |
|                          |        | ADMINISTRATOR(4).                                |
| chat_restriction_manager | —      | Cooldowns por canal de chat.                     |
| exchange_manager.js      | —      | Estado de intercambios entre jugadores.           |
| loader_manager.js        | 93     | Carga datos de cuenta al hacer login: amigos,    |
|                          |        | ignorados, amigos online.                        |
| look_manager.js          | 166    | Parsea strings EntityLook del protocolo Dofus.    |
|                          |        | Formato: "{bases|skins|colores|escalas|sublooks}".|
|                          |        | Convierte a Types.EntityLook para enviar.         |
| sublook_manager.js       | —      | Sub-entidades del look (monturas, alas...).       |

### `src/enums/` — Enumeraciones

14 archivos, todos exportados como `module.exports = { ... }` (CommonJS):

| Enum                             | Valores                                     |
|----------------------------------|---------------------------------------------|
| account_role_enum                | PLAYER, ANIMATOR, MODERATOR, ADMINISTRATOR  |
| chat_activable_channels_enum     | Canales de chat activables                  |
| compass_type_enum                | Tipos de compás                             |
| exchange_type_enum               | Tipos de intercambio                        |
| friend_failure_enum              | Errores al agregar amigo                    |
| invisibility_state_enum          | Estados de invisibilidad                    |
| mark_cells_type_enum             | Tipos de marcas en celdas                   |
| mark_type_enum                   | Tipos de marcas                             |
| npc_action_enum                  | Acciones de NPC                             |
| party_type                       | Tipos de grupo                              |
| playable_breed_enum              | Razas jugables                              |
| player_state_enum                | Estados del jugador                         |
| white_list_invisible_state       | Estados de invisibilidad en whitelist       |

### `src/utils/` — Utilidades

| Archivo            | Líneas | Rol                                              |
|--------------------|--------|--------------------------------------------------|
| configmanager.js   | 23     | Lee config.json con fs.readFile, parsea JSON,     |
|                    |        | guarda en ConfigManager.configData.               |
| formatter.js       | 9      | Convierte Buffer a ArrayBuffer (toArrayBuffer).   |
| basic.js           | 14     | getRandomInt(min, max), parseLook(), getPercentage|

### `src/world/`

Contiene `map_instance.js` — **vacío (0 bytes)**. Posiblemente planeado para
gestión de instancias de mapa pero nunca implementado.

---

## 4. Capas del sistema

El sistema tiene 5 capas bien definidas con dependencias unidireccionales
(aunque con algunas violaciones):

```
Capa 1: Network (src/network/)
    Depende de: io/, handlers/, common.js
    ↓
Capa 2: Handlers (src/handlers/)
    Depende de: io/, database/, managers/, game/, enums/
    ↓
Capa 3: Game Logic (src/game/)
    Depende de: io/, database/, managers/, enums/
    ↓
Capa 4: Managers (src/managers/)
    Depende de: io/, database/, game/, enums/
    ↓
Capa 5: Database (src/database/)
    Depende de: io/, utils/, models/
```

**Violaciones de capa detectadas:**
- `src/database/models/map.js` importa `InteractiveHandler` y `Fight`
  (dependencia hacia arriba: modelo → handler/game)
- Los handlers a veces contienen lógica de negocio que debería estar en
  `src/game/` (ej. `auth_handler` valida password e itera clients)

---

## 5. Dependencias internas entre módulos

### Grafo de imports principales

```
app.js
  ├── AuthServer, WorldServer
  ├── ConfigManager → utils/configmanager.js → fs
  ├── DBManager → database/dbmanager.js → mongodb, models/
  ├── Datacenter → database/datacenter.js → DBManager, models/, managers/
  └── Logger → io/logger.js → colors

AuthClient / WorldClient
  ├── NetworkMessage → io/dofus/network_message.js
  ├── CustomDataWrapper → io/custom_data_wrapper.js → ByteArray
  ├── ByteArray → io/bytearray.js → zlib
  ├── Formatter → utils/formatter.js
  ├── Processor → network/processor.js
  │     ├── Messages → io/dofus/messages.js
  │     │     ├── ProtocolMessage, CustomDataWrapper, Types
  │     │     └── ProtocolTypeManager → io/dofus/protocol_type_manager.js
  │     └── Handlers (15) → cada uno importa Messages, Types, Managers
  ├── Common → common.js
  └── arraybuffer-to-buffer, base64-js (npm)

Handlers → Managers / Game Logic
  ├── Messages, Types, IO, Formatter
  ├── DBManager, Datacenter
  ├── WorldServer, AuthServer
  └── ConfigManager

Game Logic → Managers / Database
  ├── SpellManager → Datacenter
  ├── Fight → FightTeam, Fighter, FightTimeline, SpellManager, Messages
  ├── Pathfinding → CellInfo, MapPoint, DataMapProvider
  ├── MonstersManager → Monster, MonstersGroup, SpawnManager
  └── ItemManager → Datacenter, DBManager
```

### Dependencias npm externas usadas en runtime

| Paquete                  | Usado en                                  |
|--------------------------|-------------------------------------------|
| `mongodb`                | dbmanager.js (MongoClient.connect)        |
| `mongodb-autoincrement`  | dbmanager.js (IDs autoincrementales)      |
| `arraybuffer-to-buffer`  | auth_client.js, world_client.js           |
| `base64-js`              | auth_client.js, world_client.js           |
| `colors`                 | logger.js                                 |
| `node-dijkstra`          | *No se usa directamente en src/. Posible- |
|                          | mente en tools/ o planeado para futuro.*   |
| `zlib` (nativo)          | bytearray.js, models/map.js               |

---

## 6. Dependencias externas relevantes

| Dependencia        | Versión    | Tipo        | Impacto si falta                          |
|--------------------|------------|-------------|-------------------------------------------|
| MongoDB            | 2.2.x      | Runtime     | El servidor no arranca.                   |
| Node.js            | 6-8 (est.) | Runtime     | APIs deprecadas en Node moderno.          |
| Babel 6            | 6.18       | Build       | No se puede compilar ES6 → ES5.           |
| Cliente Dofus .swf | 2.39       | Runtime     | Sin cliente no hay forma de probar.       |
| Datos .d2o         | 2.39       | Importación | Sin datos el mundo está vacío.            |

---

## 7. Flujo de datos principal

### 7.1 Flujo de recepción de un paquete

```
1. Socket TCP recibe datos binarios (Buffer)
2. WorldClient.receive() → socket.on('data')
3. Formatter.toArrayBuffer(data) → ArrayBuffer
4. new CustomDataWrapper(arrayBuffer)
5. Loop mientras bytesAvailable > 0:
   a. header = buffer.readShort()           // 2 bytes, big-endian
   b. messageId = header >> 2               // 14 bits superiores
   c. typeLen = header & 3                  // 2 bits inferiores
   d. messageLen = NetworkMessage.getPacketLength(buffer, typeLen)
      - typeLen 1: 1 byte  (0-255)
      - typeLen 2: 2 bytes (0-65535)
      - typeLen 3: 3 bytes (0-16777215)
   e. slice(buffer, buffer.position, messageLen)
   f. Processor.handle(client, messageId, new CustomDataWrapper(slice))
      - Busca en PROTOCOL_HANDLERS[messageId]
      - new handler.message().deserialize(buffer)
      - handler.handler(client, packet)
   g. buffer.position += messageLen
```

### 7.2 Flujo de envío de un paquete

```
1. new Messages.AlgunMensaje(param1, param2, ...)
2. packet.serialize()
   - packet.buffer.writeX(campo1)
   - packet.buffer.writeX(campo2)
   - ...
3. messageBuffer = new CustomDataWrapper(new ByteArray())
4. NetworkMessage.writePacket(messageBuffer, packet.messageId, packet.buffer)
   - Escribe header: (messageId << 2) | typeLen
   - Escribe longitud según tipo
   - Copia payload
5. arrayBufferToBuffer(messageBuffer.data.buffer)
6. socket.write(finalBuffer)
```

### 7.3 Ejemplo concreto: mensaje de chat

```
RECEPCIÓN:
  Cliente envía: [header 2B][len 1-3B][channel][content][timestamp]...
  → ChatClientMultiMessage.deserialize(buffer):
      this.content = buffer.readUTF()
      this.channel = buffer.readByte()
  → ChatHandler.handleChatClientMultiMessage(client, packet)
  → ChatRestrictionManager verifica cooldown del canal
  → WorldServer.sendToAllOnlineClients(
      new Messages.ChatServerMessage(
          channel, content, timestamp, fingerprint,
          senderId, senderName, accountId
      )
    )

ENVÍO (broadcast):
  → ChatServerMessage.serialize()
      buffer.writeByte(this.channel)
      buffer.writeUTF(this.content)
      buffer.writeInt(this.timestamp)
      ...
  → Para cada WorldClient online:
      client.send(message)
      → socket.write(packetBinario)
```

---

## 8. Patrones detectados

### 8.1 Message Dispatch Centralizado

Un diccionario estático en `Processor.PROTOCOL_HANDLERS` mapea `messageId`
(numérico) a una tupla `{ message: clase, handler: función }`. No hay
reflexión ni anotaciones. Cada entrada se registra manualmente.

```js
// processor.js
4: { message: Messages.IdentificationMessage,
     handler: AuthHandler.handleIdentificationMessage },
40: { message: Messages.ServerSelectionMessage,
      handler: AuthHandler.handleServerSelectionMessage },
```

Este patrón es el corazón del servidor: cada mensaje que llega del cliente
pasa por aquí.

### 8.2 Singleton con Static Properties

Las clases principales usan propiedades `static` como estado global mutable.
Nunca se instancian con `new`; se accede como `Clase.metodo()`.

```js
AuthServer.clients = []         // Array de AuthClient
AuthServer.clients_tickets = [] // Ticket → account

WorldServer.clients = []        // Array de WorldClient
WorldServer.partys = []         // Grupos activos
WorldServer.instanciedMaps = [] // Mapas cargados

Datacenter.breeds = []          // Datos cacheados
Datacenter.items = []           // ...
Datacenter.spells = []          // ...

WorldManager.maps = []          // Caché de mapas
```

### 8.3 Protocol Message Pattern

Cada mensaje del protocolo es una clase que extiende `ProtocolMessage(id)` y
define `serialize()` (para enviar) y/o `deserialize(buffer)` (para recibir).

```js
// messages.js
export class ChatServerMessage extends ProtocolMessage {
    constructor(channel, content, timestamp, fingerprint,
                senderId, senderName, accountId) {
        super(883);  // messageId fijo
        this.channel = channel;
        this.content = content;
        // ...
    }

    serialize() {
        this.buffer.writeByte(this.channel);
        this.buffer.writeUTF(this.content);
        this.buffer.writeInt(this.timestamp);
        // ...
    }
}
```

### 8.4 Serialización Binaria Manual

Todos los tipos se leen/escriben campo por campo usando `CustomDataWrapper`:

| Método           | Tipo               | Bytes   |
|------------------|--------------------|---------|
| readByte()       | int8               | 1       |
| readShort()      | int16 BE           | 2       |
| readInt()        | int32 BE           | 4       |
| readDouble()     | float64 BE         | 8       |
| readBoolean()    | uint8 != 0         | 1       |
| readUTF()        | uint16 len + UTF-8 | variable|
| readVarInt()     | int variable       | 1-5     |
| readVarShort()   | short variable     | 1-3     |
| readVarLong()    | long variable      | 1-9     |

El `BooleanByteWrapper` empaqueta 8 booleanos en 1 byte usando máscaras
de bits (bit 0 = flag 1, bit 1 = flag 2, ...).

### 8.5 Callback Hell

Prácticamente todas las operaciones de base de datos y carga de datos usan
callbacks anidados. No se usa Promises ni async/await en el código activo.

```js
// dbmanager.js
DBManager.getCharacter({name: name}, function(character) {
    if (character) {
        DBManager.getAccount({uid: character.accountId}, function(account) {
            if (account) callback(account);
            else callback(null);
        });
    } else callback(null);
});
```

### 8.6 Mezcla CommonJS y ES6

- Archivos `.js` en `src/`: usan `import` (ES6)
- Módulos nativos: usan `var x = require('x')` (CommonJS)
- Enums: usan `module.exports = { ... }` (CommonJS)
- `bytearray.js` y `custom_data_wrapper.js`: código pre-ES6 con `var`,
  `function`, prototipos, sin imports

### 8.7 Lazy Loading de Mapas

Los mapas no se cargan todos al iniciar. `WorldManager.getMap()` primero
busca en el array `WorldManager.maps[]`. Si no está, carga desde MongoDB,
crea una instancia `new Map()`, llama a `map.init()` (descomprime celdas),
y genera grupos de monstruos.

### 8.8 Datos de mapa comprimidos

Las celdas del mapa se almacenan en MongoDB como:
```
base64(zlib.deflate(JSON.stringify(cells)))
```

Al cargar un mapa, se descomprimen con:
```js
this.cells = JSON.parse(
    zlib.inflateSync(
        new Buffer(this.cellsRaw, 'base64')
    ).toString()
);
```

### 8.9 Sistema de comandos por reflexión

`CommandManager` tiene 22 comandos. El dispatch usa reflexión sobre nombres
de método: `"handle_" + commandName`. Los comandos se buscan por nombre en
un array estático `commandsList` que incluye el rol mínimo requerido.

```js
CommandManager[(prefix + commandName)](data, client);
// Ej: ".kick nombre" → CommandManager["handle_kick"](data, client)
```

---

## 9. Convenciones arquitectónicas

### 9.1 Naming

| Elemento          | Convención         | Ejemplo                              |
|-------------------|--------------------|--------------------------------------|
| Clases            | PascalCase         | `AuthServer`, `FightTeam`            |
| Archivos          | snake_case         | `auth_handler.js`, `world_client.js` |
| Métodos estáticos | camelCase          | `generateTicket()`, `removeClient()` |
| Constantes        | UPPER_SNAKE_CASE   | `DOFUS_PROTOCOL_ID`, `FIGHT_TYPE`    |
| Carpetas          | short / snake_case | `io/`, `game/`, `map_tools/`         |
| Handlers          | `handleXxxMessage` | `handleIdentificationMessage`        |

### 9.2 Registro de mensajes nuevos

Para añadir un mensaje de protocolo nuevo:

1. Definir la clase en `src/io/dofus/messages.js` (extiende `ProtocolMessage`)
2. Si necesita tipos compuestos, definirlos en `src/io/dofus/types.js`
3. Si el tipo tiene protocolId, registrarlo en
   `src/io/dofus/protocol_type_manager.js`
4. Registrar el messageId en `src/network/processor.js`
5. Crear/actualizar el handler en `src/handlers/`

### 9.3 Comunicación entre capas

```
Handler → Manager/Game Logic (método estático)
Manager → DBManager/Datacenter (datos)
Manager → WorldServer (broadcast)
Game Logic → Manager (spawn, stats)
Model → Handler (dependencia circular en Map)
```

### 9.4 Persistencia

- Datos estáticos de juego: MongoDB → Datacenter (RAM) → búsqueda O(n)
- Datos de jugador: MongoDB directo via DBManager con callbacks
- No hay caché ni write-back para datos de jugador
- `WorldManager.saveWorld()` itera todos los clientes online y llama a
  `character.save()` uno por uno

---

## 10. Riesgos técnicos y deuda técnica

### 10.1 Riesgos de seguridad

| Riesgo                              | Severidad | Evidencia                                    |
|-------------------------------------|-----------|----------------------------------------------|
| Contraseñas en texto plano          | CRÍTICO   | `auth_handler.js:57`: `account.password !=`  |
|                                     |           | `credentials.password` — comparación directa |
| Sin rate limiting en auth           | ALTO      | No hay límite de intentos de login           |
| MongoDB sin autenticación           | ALTO      | Conexión sin usuario/contraseña              |
| Sin cifrado TLS                     | MEDIO     | TCP plano, sin TLS                           |
| Comandos admin por reflexión        | MEDIO     | `CommandManager["handle_" + x]` — si un      |
|                                     |           | atacante controla el string, RCE potencial   |
| Key hardcodeada en auth_client      | BAJO      | `"ivu9wh58^kQQw*8n:jud11Kw(bHY9m3V"`        |

### 10.2 Deuda técnica

| Problema                            | Impacto   | Detalle                                       |
|-------------------------------------|-----------|-----------------------------------------------|
| Sin tests                           | CRÍTICO   | `npm test` devuelve error. 0 tests.           |
| Callback hell                       | ALTO      | ~450 líneas de DBManager son callbacks        |
|                                     |           | anidados. Difícil de debuggear.               |
| Estado global mutable               | ALTO      | Arrays estáticos en AuthServer, WorldServer,  |
|                                     |           | Datacenter. Efectos laterales impredecibles.  |
| Try/catch comentado en processor    | ALTO      | El manejo de errores del router está          |
|                                     |           | silenciado. Mensajes malformados = ignored.   |
| Búsqueda O(n) en Datacenter         | MEDIO     | Cada getNpc(id) itera todo el array.          |
|                                     |           | Con miles de NPCs, maps, items — lento.       |
| Sin separation of concerns          | MEDIO     | Map model importa InteractiveHandler y Fight. |
|                                     |           | auth_handler valida passwords y gestiona      |
|                                     |           | desconexiones (lógica de negocio en handler). |
| Mensajes sin handler → NoOperation  | MEDIO     | Si un messageId no está registrado, el        |
|                                     |           | cliente recibe BasicNoOperation — silencio.   |
| Archivos con conflictos de merge    | BAJO      | `app (Copie en conflit...).js`,               |
|                                     |           | `.idea/workspace*.xml` con copias de conflicto|
| map_instance.js vacío               | BAJO      | 0 bytes. Probablemente planeado, no usado.    |
| Dependencias de 2016                | BAJO      | Babel 6, MongoDB driver 2.2. Con Node moderno |
|                                     |           | pueden fallar APIs deprecadas.                |

### 10.3 Limitaciones de escalabilidad

| Limitación                          | Detalle                                       |
|-------------------------------------|-----------------------------------------------|
| Monolito single-threaded            | Auth + World en un solo proceso Node.js.      |
|                                     | Si uno crashea, todo abajo.                   |
| Datacenter en RAM                   | Todas las colecciones cargadas completas.     |
|                                     | Crece con el contenido del juego.             |
| Sin connection pooling visible      | Una sola conexión MongoDB para todo.          |
| Sin sharding ni clustering          | Un solo proceso = un solo núcleo.             |
| Sin hot reload                      | Cualquier cambio requiere recompilar y        |
|                                     | reiniciar el proceso completo.                |

### 10.4 Deuda de documentación (cubierta parcialmente por docs/)

| Falta                               | Estado                                        |
|-------------------------------------|-----------------------------------------------|
| README.md                           | Creado como docs/overview.md                  |
| Documentación de API/protocolo      | Export/ existe pero no es documentación       |
| Diagrama de arquitectura            | Cubierto en este documento                    |
| Guía de contribución                | docs/coding-standards.md + docs/agents.md     |
| Documentación de comandos admin     | Cubierto en docs/workflows.md parcialmente    |
