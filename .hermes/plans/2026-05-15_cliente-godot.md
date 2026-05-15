# Plan — Cliente Dofus en Godot + División de repositorios

Fecha: 2026-05-15
Repositorio actual: `/home/enoh/Documentos/mis-proyectos/Dofus`
Proyecto: Noxus — emulador Dofus 2.39
Runtime servidor: Node.js 25.3.0 + pnpm 11.1.2
Base: MongoDB 8.0 en Docker

## Contexto

El servidor Noxus funciona con 47 checks validados en client-test.js v13. El cliente
oficial es un archivo Flash (`.swf`) que depende de Adobe AIR, tecnología deprecada
desde 2020. Godot Engine 4.x es una alternativa moderna, open-source, con soporte para
2D/3D, scripting en GDScript/C#, y excelente tooling para exportar a desktop.

Este plan propone crear un cliente propio en Godot que reemplace al `.swf`, dividir el
monorepo actual en dos repositorios independientes (servidor + cliente), y actualizar
las skills para que apunten al repo correcto.

---

## 1. Diagnóstico inicial

### 1.1 — Estado del protocolo

| Componente | Líneas | Complejidad | ¿Necesario para MVP? |
|-----------|--------|-------------|---------------------|
| `messages.js` | ~5000 | 250+ clases de mensajes | NO — solo 15-20 para MVP |
| `types.js` | ~3500 | ~150 tipos de datos | NO — solo 10-15 para MVP |
| `bytearray.js` | ~1200 | Lector/escritor binario big-endian | **SÍ — todo depende de esto** |
| `custom_data_wrapper.js` | ~634 | VarInt, BooleanByteWrapper, Int64 | **SÍ** |
| `network_message.js` | ~70 | Formato de header TCP | **SÍ** |
| `protocol.js` (export) | ~290 | Mapeo typeProtocolId → clase | Parcial (solo IDs usados) |

### 1.2 — Flujo TCP mínimo para MVP visual

```
1. TCP connect AuthServer:443
2. ← ProtocolRequiredMessage (id=1)
3. ← HelloConnectMessage (id=3) [key fija + salt]
4. → IdentificationMessage (id=4) [version + "user@pass" + autoconnect]
5. ← IdentificationSuccessMessage (id=22)
6. ← ServersListMessage (id=30)
7. → ServerSelectionMessage (id=40) [serverId=1]
8. ← SelectedServerDataMessage (id=42) [host, port, ticket]
9. TCP disconnect Auth, connect WorldServer:5556
10. ← HelloGameMessage (id=101)
11. → AuthenticationTicketMessage (id=110) [lang + ticket]
12. ← TrustStatusMessage (id=6267) + config messages
13. → CharactersListRequestMessage (id=150)
14. ← CharactersListMessage (id=151)
15. → CharacterSelectionMessage (id=152)
16. ← CharacterSelectedSuccessMessage (id=153) + CharacterLoadingComplete (id=6471)
17. → GameContextCreateRequestMessage (id=250)
18. ← GameContextCreateMessage (id=200) + stats + spells + shortcuts
19. ← CurrentMapMessage (id=220) [mapId + decryptKey]
20. → MapInformationsRequestMessage (id=225)
21. ← MapComplementaryInformationsDataMessage (id=226) [células, actores, interactivos]
22. ← GameRolePlayShowActorMessage (id=5632) [NPCs, monstruos, personajes]
```

**MVP visual requiere implementar ~22 mensajes** (ida y vuelta) + ~15 tipos de datos.

### 1.3 — Estado actual del repositorio

| Archivo/Carpeta | Destino |
|----------------|---------|
| `src/` (servidor) | → `noxus-server/` |
| `db/` (datos JSON) | → `noxus-server/` |
| `tools/` (extractores) | → `noxus-server/` |
| `export/` (protocolo exportado) | → compartido o duplicado en ambos |
| `patch/DofusInvoker.swf` | → legacy, no se migra |
| `client-test.js` | → `noxus-server/` (es test del servidor) |
| `config.json` | → `noxus-server/` |
| `docs/` | → `noxus-server/docs/` |
| `.hermes/` | → config del asistente (queda fuera de ambos repos) |

---

## 2. Plan paso a paso

### Fase G.0 — Decisión de arquitectura Godot

**Objetivo**: Decidir el stack técnico del cliente Godot antes de escribir código.

Estado: pendiente. Requiere decisión del usuario.

#### Opciones de lenguaje en Godot 4.x:

| Opción | Ventajas | Desventajas |
|--------|---------|-------------|
| **GDScript** | Nativo de Godot, sin dependencias, rápido prototipado | Más lento para parsing binario intensivo, menos tipado |
| **C# (.NET)** | Tipado fuerte, mejor para lógica binaria, familiar si venís de JS/TS | Requiere Godot Mono, compilación extra |
| **C++ (GDExtension)** | Máximo rendimiento, ideal para el protocolo binario | Curva de aprendizaje alta, build system complejo |

**Recomendación**: C# para la capa de protocolo (parsing binario tipado es más fácil de
debuggear) + GDScript para la UI y el game loop. O GDScript puro si se prefiere
simplicidad.

#### Estructura sugerida del proyecto Godot:

```
noxus-godot-client/
├── project.godot
├── scenes/
│   ├── login.tscn
│   ├── character_select.tscn
│   └── world.tscn
├── scripts/
│   ├── protocol/
│   │   ├── byte_array.gd          # Port de bytearray.js
│   │   ├── custom_data_wrapper.gd # Port de custom_data_wrapper.js
│   │   ├── network_message.gd     # Formato de header TCP
│   │   ├── messages.gd            # Solo mensajes del MVP (no los 5000)
│   │   └── types.gd               # Solo tipos del MVP
│   ├── network/
│   │   ├── tcp_client.gd          # Conexión TCP genérica
│   │   ├── auth_client.gd         # Flujo de auth
│   │   └── world_client.gd        # Flujo de mundo
│   └── ui/
│       ├── login_ui.gd
│       ├── char_select_ui.gd
│       └── world_ui.gd
├── assets/
│   ├── maps/                      # Tiles y texturas de mapas
│   └── sprites/                   # Sprites de personajes
└── export/                        # Copia del protocolo exportado (referencia)
```

---

### Fase G.1 — Dividir el repositorio

**Objetivo**: Separar servidor y cliente en dos repos independientes.

Estado: pendiente.

#### G.1.1 — Crear `noxus-server`

```bash
cd /home/enoh/Documentos/mis-proyectos
mkdir noxus-server
cd noxus-server
git init
# Copiar archivos del servidor desde Dofus/
cp -r ../Dofus/src .
cp -r ../Dofus/db .
cp -r ../Dofus/tools .
cp -r ../Dofus/export .
cp -r ../Dofus/docs .
cp ../Dofus/config.json .
cp ../Dofus/client-test.js .
cp ../Dofus/package.json .
cp ../Dofus/pnpm-lock.yaml .
cp ../Dofus/.gitignore .
cp ../Dofus/AGENTS.md .
# NO copiar: patch/ (es SWF legacy), .hermes/ (es config del asistente)
```

#### G.1.2 — Crear `noxus-godot-client`

```bash
cd /home/enoh/Documentos/mis-proyectos
mkdir noxus-godot-client
cd noxus-godot-client
git init
# Crear proyecto Godot vacío desde el editor o CLI
# Copiar export/ como referencia del protocolo
cp -r ../Dofus/export .
```

#### G.1.3 — Actualizar skills

Las skills existentes referencian paths absolutos como:
```
/home/enoh/Documentos/mis-proyectos/Dofus/
```

Actualizar a:
- Skills del servidor → apuntar a `noxus-server/`
- Skills del cliente → apuntar a `noxus-godot-client/`

Skills que requieren actualización:
| Skill | Nuevo target | Nota |
|-------|-------------|------|
| `noxus-npc-testing` | `noxus-server/` | Solo cambia el path base |
| `plan` | neutro | No referencia paths fijos |

---

### Fase G.2 — Port de la capa de protocolo a GDScript

**Objetivo**: Implementar las primitivas binarias del protocolo Dofus en Godot.

Estado: pendiente. Es la fase más crítica y laboriosa.

#### G.2.1 — Port de `bytearray.js`

Funciones mínimas necesarias:
```
readByte(), writeByte()
readBoolean(), writeBoolean()
readShort(), writeShort()
readInt(), writeInt()
readDouble(), writeDouble()
readUTF(), writeUTF()
readVarShort(), writeVarShort()
readVarInt(), writeVarInt()
```
~400 líneas de GDScript. Big-endian en todo momento. Usar `PackedByteArray` o `StreamPeerBuffer` de Godot.

#### G.2.2 — Port de `custom_data_wrapper.js`

- `BooleanByteWrapper`: empaquetar 8 flags en 1 byte (getFlag, setFlag)
- `readVarUhShort`, `readVarUhInt`, `readVarUhLong`
- Int64/UInt64 (simplificado si no se necesita precisión total)

#### G.2.3 — Port de mensajes MVP

Solo los 22 mensajes del flujo TCP mínimo. Cada uno es una clase con `serialize()` y/o `deserialize()`.

Ejemplo en GDScript:
```gdscript
class_name IdentificationMessage
extends ProtocolMessage

var version: Dictionary  # {major, minor, release, revision, patch, buildType}
var lang: String
var autoconnect: bool

func _init():
    message_id = 4

func serialize():
    _buffer.write_byte(0x00)  # flag1
    _buffer.write_byte(version.major)
    ...etc

func deserialize(data: PackedByteArray):
    var flag1 = data.read_u8()
    autoconnect = BooleanByteWrapper.get_flag(flag1, 0)
    ...
```

#### G.2.4 — Port de tipos MVP

Tipos necesarios para el flujo mínimo:
- `EntityLook` (look del personaje)
- `EntityDispositionInformations` (cellId, direction)
- `GameRolePlayCharacterInformations` (información del personaje en el mapa)
- `GameRolePlayNpcInformations` (información de NPC)
- `Version` (versión del cliente)

---

### Fase G.3 — MVP visual: Connect, Authenticate, Show Map

**Objetivo**: Un cliente Godot que conecta al servidor, autentica, selecciona personaje,
y muestra el mapa inicial con el personaje y los NPCs.

Estado: pendiente.

#### G.3.1 — Pantalla de login

- Campo username/password
- Botón conectar
- Al conectar: flujo TCP auth (mensajes 1-42 del diagnóstico)
- Mostrar error si falla

#### G.3.2 — Pantalla de selección de personaje

- Lista de personajes existentes
- Botón "Entrar al mundo"
- Flujo TCP world (mensajes 101-6471)

#### G.3.3 — Renderizado del mapa

**Este es el desafío más grande.** Formato de celdas del mapa:
```
cells = JSON.parse(zlib.inflateSync(new Buffer(cellsRaw, 'base64')))
// Cada celda es un objeto con propiedades: id, _mov, _use, etc.
```

Godot tiene soporte para:
- `Zlib.decompress()` en `Marshalls` (necesita `base64_decode` primero)
- TileMaps para renderizado por tiles

**Estrategia MVP**: No intentar renderizar como Dofus (isométrico con sprites). Usar un
enfoque minimalista:

1. Decodificar celdas del mapa
2. Crear un TileMap con tiles simples (colores por tipo de celda)
3. Colocar sprites simples para personaje y NPCs en sus celdas

El renderizado completo (sprites de Dofus, animaciones, UI del juego) es un proyecto
aparte que puede tomar semanas.

#### G.3.4 — Verificación visual

- ¿Se ve el personaje en la celda correcta?
- ¿Se ven los NPCs como actores en el mapa?
- ¿Se ven los monstruos (si hay `groups_per_map > 0`)?

---

### Fase G.4 — Movimiento e interacción básica

**Objetivo**: Clic en una celda → movimiento del personaje.

Estado: pendiente.

#### G.4.1 — Click-to-move

- Detectar clic en el tilemap
- Calcular ruta (pathfinding) — **puede delegarse al servidor** (el servidor ya tiene A* hexagonal)
- Enviar `GameMapMovementRequestMessage` (id=950)
- Recibir `GameMapMovementMessage` (id=951) — animar movimiento

#### G.4.2 — Interacción con NPCs

- Clic en NPC → mostrar menú de acciones
- Enviar `NpcGenericActionRequestMessage` (id=5898)
- Mostrar diálogo si hay

---

### Fase G.5 — Sincronización continua con el servidor

**Objetivo**: Manejar mensajes asíncronos del servidor (movimiento de otros, chat, etc.).

Estado: pendiente.

El servidor envía mensajes no solicitados constantemente:
- Movimiento de monstruos (cada ~10-30s)
- Chat de otros jugadores
- Cambios de estado (combate, etc.)

El cliente Godot debe tener un event loop que procese mensajes entrantes y actualice
la escena.

---

## 3. Resumen de archivos a modificar/crear

| Ruta | Acción | Propósito |
|------|--------|-----------|
| `noxus-server/` (nuevo repo) | CREAR | Código del servidor extraído del monorepo actual |
| `noxus-godot-client/` (nuevo repo) | CREAR | Nuevo cliente Godot |
| `noxus-godot-client/project.godot` | CREAR | Configuración del proyecto Godot |
| `noxus-godot-client/scripts/protocol/byte_array.gd` | CREAR | Port de `bytearray.js` |
| `noxus-godot-client/scripts/protocol/custom_data_wrapper.gd` | CREAR | Port de `custom_data_wrapper.js` |
| `noxus-godot-client/scripts/protocol/messages.gd` | CREAR | Mensajes del MVP |
| `noxus-godot-client/scripts/protocol/types.gd` | CREAR | Tipos del MVP |
| `noxus-godot-client/scripts/network/tcp_client.gd` | CREAR | Conexión TCP |
| `noxus-godot-client/scripts/network/auth_client.gd` | CREAR | Flujo de auth |
| `noxus-godot-client/scripts/network/world_client.gd` | CREAR | Flujo de mundo |
| `noxus-godot-client/scenes/login.tscn` | CREAR | UI de login |
| `noxus-godot-client/scenes/world.tscn` | CREAR | Escena del mundo |
| Skills (`noxus-*`) | MODIFICAR | Actualizar paths a los nuevos repos |

---

## 4. Riesgos y plan B

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Port del protocolo binario en GDScript es más lento de lo esperado | Alta | Medio | Usar C# para la capa de protocolo; GDScript solo para UI |
| Renderizado del mapa es demasiado complejo para MVP | Alta | Medio | Fase G.3 renderiza tiles de colores, no sprites reales |
| `zlib.inflateSync` no tiene equivalente directo en Godot 4 | Media | Alto | Godot tiene `Marshalls.decompress()` con modo gzip; si no funciona, pre-procesar celdas en el servidor |
| La división de repos rompe referencias en skills o scripts | Media | Bajo | Actualizar paths absolutos en skills; scripts del servidor usan paths relativos |
| El cliente Godot requiere assets visuales que no existen | Alta | Bajo | Usar placeholders geométricos (rectángulos de colores) para MVP |
| El proyecto toma más tiempo del estimado | Alta | Medio | Dividir en milestones: G.2 es el hito crítico; si se completa, el resto avanza |

---

## 5. Validación final

- [ ] `noxus-server/` es un repo git independiente con su propio `origin`
- [ ] `noxus-godot-client/` es un repo git independiente con su propio `origin`
- [ ] `node src/app.js` en `noxus-server/` arranca sin errores
- [ ] `node client-test.js` en `noxus-server/` pasa 47 checks
- [ ] El proyecto Godot abre en el editor sin errores
- [ ] El cliente Godot conecta al servidor y completa el handshake auth
- [ ] El cliente Godot recibe la lista de personajes
- [ ] El cliente Godot entra al mundo y recibe datos del mapa
- [ ] El mapa se renderiza visualmente (aunque sea con tiles de colores)
- [ ] El personaje se mueve al hacer clic
- [ ] Skills actualizadas apuntan a los paths correctos

---

## 6. Tiempo estimado

| Fase | Tiempo estimado |
|------|----------------|
| G.0 — Decisión de arquitectura Godot | 5 min (decisión) |
| G.1 — División de repositorios | 15 min |
| G.2 — Port de capa de protocolo | 2-4 h |
| G.3 — MVP visual (connect + map) | 3-6 h |
| G.4 — Movimiento e interacción | 1-2 h |
| G.5 — Sincronización continua | 1-2 h |
| Buffer de troubleshooting | 2 h |

Tiempo total estimado: **10-18 horas** (2-3 sesiones de trabajo).
El tiempo real depende fuertemente de la familiaridad con Godot y de cuán fiel se quiera
el renderizado del mapa.
