# Plan — Fase F: Cobertura pendiente (modelo básico)

Fecha: 2026-05-15
Repositorio: `/home/enoh/Documentos/mis-proyectos/Dofus`
Proyecto: Noxus — emulador Dofus 2.39
Runtime: Node.js 25.3.0 + pnpm 11.1.2
Base: MongoDB 8.0 en Docker, contenedor `noxus-mongo8`

## Contexto

Las fases C, D y E están completas. El client-test v12 valida 30 checks: auth,
personaje, stats, mapa, movimiento, interacción, chat, items, friends, shortcuts,
spells, NPCs y combate. Quedan handlers sin probar que extenderían la cobertura
sin requerir setup complejo (party, exchange).

Este plan está diseñado para ser ejecutado por un modelo de capacidad media
(DeepSeek Flash). Cada fase es autocontenida, usa comandos copy-paste, y no
requiere debug de parsing binario complejo.

---

## 1. Diagnóstico inicial

| Componente | Estado actual | Estado necesario | Acción |
|------------|--------------|-----------------|--------|
| client-test | v12, 30 checks | v13-v14, ~38 checks | Extender con delete, swap, remove, NPC reply |
| Items | ObjectSetPosition probado | ObjectDeleteMessage (3022) probado | Enviar delete de item de prueba |
| Shortcuts | ShortcutBarAdd probado | Swap (6230) + Remove (6228) probados | Enviar swap/remove de atajo |
| NPC diálogo | Action genérica probada | Reply (5616) probado | Insertar npcs_replies en BD para NPC 81 |
| Combate real | Attack despachado (sin conectar) | FightStarting + FightJoin recibidos | Parsear cellId del monstruo del 226 |
| Friends/Ignored | GetList + Warn probados | Add (4004) + Delete (5603) probados | Enviar add/delete con datos válidos |
| Party | 10 handlers sin probar | Fuera de alcance Fase F | Requiere 2 jugadores |
| Exchange | 5 handlers sin probar | Fuera de alcance Fase F | Requiere 2 jugadores |
| `config.json` | Ya tiene `monsters` | Sin cambios | No modificar |
| `db/*.json` | Sin cambios | Sin cambios | No modificar |
| `src/` | Sin cambios | Sin cambios | Solo si hay bugs |

---

## 2. Plan paso a paso

### Fase F.1 — Items: ObjectDeleteMessage (3022)

Objetivo: validar que el handler de eliminar items no crashea.

Estado: pendiente.

#### F.1.1 — Enviar ObjectDeleteMessage

```bash
cd /home/enoh/Documentos/mis-proyectos/Dofus
export PATH="/home/enoh/.nvm/versions/node/v25.3.0/bin:$PATH"
```

En client-test.js v13, después de validar ObjectMovement (en el handler 3010), enviar
ObjectDeleteMessage al item de prueba. El formato del mensaje 3022 es:

```
objectUID (varInt) + quantity (varInt)
```

El item de prueba tiene `objectUID=900027`. Enviar con quantity=1.

**Riesgo**: El handler `handleObjectDeleteMessage` en `item_handler.js` puede no
eliminar correctamente si el item no existe en el inventario tras moverlo. Plan B:
verificar que no crashea aunque el servidor loggee error.

**Criterios de éxito:**
- ObjectDeleteMessage despachado sin crash en el servidor
- Conexión sigue viva

---

### Fase F.2 — Shortcuts: Swap y Remove

Objetivo: validar handlers ShortcutBarSwapRequest (6230) y ShortcutBarRemoveRequest (6228).

Estado: pendiente.

#### F.2.1 — ShortcutSwap

Formato de 6230:

```
barType (byte) + firstSlot (byte) + secondSlot (byte)
```

En la barra 1, intercambiar slots 0 y 1 tras haber creado un atajo.

#### F.2.2 — ShortcutRemove

Formato de 6228:

```
barType (byte) + slot (byte)
```

Eliminar el atajo del slot 20 de la barra 1.

**Riesgo**: Los handlers pueden devolver errores si los slots están vacíos o fuera de
rango. Plan B: validar dispatch sin crash, no esperar respuesta concreta.

**Criterios de éxito:**
- ShortcutSwap y ShortcutRemove despachados sin crash
- Conexión sigue viva

---

### Fase F.3 — NPC diálogo: NpcDialogReplyMessage (5616)

Objetivo: validar que el handler de reply de diálogo NPC no crashea.

Estado: pendiente. Requiere insertar `npcs_replies` y `npcs_messages` en MongoDB.

#### F.3.1 — Insertar datos de diálogo para NPC 81

```bash
export DOCKER_HOST=unix:///home/enoh/.docker/desktop/docker.sock
```

Insertar en MongoDB:

```javascript
// npcs_messages: mensaje de diálogo del NPC (messageId=9999, texto placeholder)
db.npcs_messages.insertOne({ _id: 9999, messageId: 9999 });

// npcs_replies: una reply que enlace la acción 3 con el mensaje
db.npcs_replies.insertOne({
  _id: 100,
  type: "dialog",
  replyId: 1001,
  messageId: 9999,
  condition: null,
  param1: null,
  param2: null
});

// Actualizar la acción 3 del NPC 81 para que apunte al messageId 9999
db.npcs_actions.updateOne(
  { npcId: 81, action: 3 },
  { $set: { messageId: 9999 } }
);
```

Esto hace que:
1. La acción 3 del NPC 81 tenga `messageId=9999`
2. `NpcSpawn.existReplies()` encuentre la acción 3 y establezca `currentMessage=9999`
3. Al abrir el diálogo, `NpcDialog.open()` envíe `NpcDialogCreationMessage`
4. `changeMessage()` llame a `getReplies(9999)` y encuentre la reply 1001
5. Se envíe `NpcDialogQuestionMessage` con `replyIds=[1001]`

#### F.3.2 — Enviar NpcDialogReplyMessage

Formato de 5616:

```
replyId (varInt)
```

Después de que el diálogo se abra y se reciba `NpcDialogQuestionMessage`, enviar
`replyId=1001` como respuesta.

**Riesgo**: La reply 1001 es de tipo "dialog" y su `param1` es null. El handler
`Dialog.execute()` intenta cambiar `npc.currentMessage = reply.optionalValue1`,
que sería `null`. Esto podría crashear. Plan B: si crashea, cambiar la reply a
tipo "teleport" (que es más estable) o simplemente validar que `NpcDialogCreationMessage`
se recibe (ya validado en v12).

**Criterios de éxito:**
- NpcDialogQuestionMessage recibido con replyIds=[1001]
- NpcDialogReplyMessage (5616) enviado sin crash
- O, si el diálogo no funciona: documentar que el reply handler fue despachado sin crash

---

### Fase F.4 — Combate conectado (opcional, mayor complejidad)

Objetivo: parsear el cellId del primer grupo de monstruos para que el ataque conecte.

Estado: pendiente. Requiere parsing binario robusto.

#### F.4.1 — Estrategia simple

En lugar de parsear el `GameRolePlayGroupMonsterInformations` completo, usar una
estrategia de "skip inteligente":

1. En el handler 226, cuando `theActorCount > 1`:
   - Avanzar `off` para saltar el actor del personaje (protocolId=36 + datos)
   - El siguiente actor es el primer grupo de monstruos (protocolId=160)
   - Leer: `protocolId(2) + contextualId/groupId(8) + skipEntityLook + disposition(5 bytes)`
   - Extraer cellId de los 2 bytes después de disposition protocolId

2. Código de salto del personaje:
   ```javascript
   // Salto seguro: leer protocolId(2) + skipActor + name(UTF) + ~100 bytes extra
   const charProto = m.body.readUInt16BE(off); off += 2; // debe ser 36
   off = skipActor(m.body, off); // GameContextActorInformations
   // GameRolePlayNamedActorInformations: name(UTF)
   const nameLen = m.body.readUInt16BE(off); off += 2;
   off += Math.min(nameLen, m.bl - off - 10);
   // GameRolePlayHumanoidInformations + GameRolePlayCharacterInformations: ~150 bytes
   off = Math.min(off + 150, m.bl - 20);
   ```

3. Lectura del monstruo:
   ```javascript
   const monsterProto = m.body.readUInt16BE(off); off += 2; // debe ser 160
   const groupId = m.body.readDoubleBE(off); off += 8;
   off = skipEntityLook(m.body, off);
   off += 2; // disposition protocolId
   const cellId = m.body.readUInt16BE(off); off += 2; // cellId!!!
   ```

4. Luego: admin command `go 144931 <cellId>` para teleport, y atacar con `groupId`.

**Riesgo ALTO**: Si el salto del personaje es incorrecto (tamaño variable de
HumanInformations), se leerán datos basura. Plan B: si falla, dejar el combate
como "dispatch sin crash" (ya validado en v12).

**Criterios de éxito:**
- CellId del monstruo parseado correctamente
- Teleport a la celda del monstruo exitoso
- GameFightStartingMessage (700) recibido
- GameFightJoinMessage recibido

---

### Fase F.5 — Friends: Add y Delete (4004, 5603)

Objetivo: validar handlers de añadir/eliminar amigos sin crash.

Estado: pendiente. No requiere setup adicional.

#### F.5.1 — FriendAddRequest

Formato de 4004:

```
name (UTF string)
```

Enviar FriendAddRequest con un nombre de personaje que no existe (ej. "Nadie").
El handler buscará el target, no lo encontrará, y probablemente devuelva un error.
Validar que no crashea.

#### F.5.2 — FriendDeleteRequest

Formato de 5603:

```
accountId (int)
```

Enviar FriendDeleteRequest con un accountId cualquiera (ej. 999). Validar que no crashea.

**Riesgo**: Los handlers pueden requerir que el amigo exista o que esté en la lista.
Plan B: validar solo dispatch sin crash, sin esperar respuesta exitosa.

**Criterios de éxito:**
- FriendAddRequest y FriendDeleteRequest despachados sin crash
- Conexión sigue viva

---

## 3. Resumen de archivos a modificar/crear

| Ruta | Acción | Propósito |
|------|--------|-----------|
| `client-test.js` | MODIFICAR (v13, v14) | Agregar delete, swap, remove, NPC reply, friend add/delete, y opcionalmente combate real |
| `docs/testing.md` | MODIFICAR | Actualizar cobertura a v13/v14 |
| MongoDB `npcs_messages` | INSERTAR | Mensaje de diálogo para NPC 81 |
| MongoDB `npcs_replies` | INSERTAR | Reply de diálogo para el mensaje |
| MongoDB `npcs_actions` | MODIFICAR | Actualizar messageId de acción 3 |

**NO modificar:**
- `config.json` — ya tiene `monsters`
- `src/` — solo si aparecen bugs
- `db/*.json`, `tools/`, `export/`

---

## 4. Riesgos y plan B

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| NPC reply "dialog" crashea por param1=null | Alta | Bajo | Usar tipo "teleport" en la reply, o validar solo NpcDialogCreation |
| Salto de actor personaje en 226 incorrecto (F.4) | Alta | Medio | Dejar combate como "dispatch sin crash" (v12) |
| FriendAdd no encuentra target y crashea | Baja | Bajo | Validar dispatch sin crash |
| Modelo básico no puede debuggear parsing binario | Media | Alto | F.4 es opcional; las demás fases no requieren parsing |
| Servidor guarda posición y mapa inicial incorrecto | Alta | Bajo | Actualizar `mapid` en BD con servidor detenido |
| ObjectDelete crashea si el item ya fue movido | Baja | Bajo | Validar dispatch sin crash |

---

## 5. Validación final

Checklist observable de éxito:

- [ ] `node src/app.js` arranca con 0 ERROR
- [ ] `node client-test.js` (v13) pasa ≥34 checks
- [ ] ObjectDeleteMessage (3022) despachado sin crash
- [ ] ShortcutSwap (6230) y ShortcutRemove (6228) despachados sin crash
- [ ] NpcDialogQuestionMessage (5617) recibido con replies
- [ ] NpcDialogReplyMessage (5616) despachado sin crash
- [ ] FriendAdd (4004) y FriendDelete (5603) despachados sin crash
- [ ] [OPCIONAL] Combate conecta: GameFightStarting (700) y GameFightJoin recibidos
- [ ] `git status --short` solo muestra archivos esperados
- [ ] `config.json` no modificado

---

## 6. Tiempo estimado

| Fase | Tiempo estimado |
|------|----------------|
| F.1 — ObjectDeleteMessage | 5 min |
| F.2 — ShortcutSwap + Remove | 5 min |
| F.3 — NPC replies + ReplyMessage | 10 min |
| F.4 — Combate conectado (opcional) | 15-20 min |
| F.5 — FriendAdd + Delete | 5 min |
| Buffer de troubleshooting | 10 min |

Tiempo total sin F.4: ~25-35 min.
Tiempo total con F.4: ~45-55 min.
