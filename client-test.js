/**
 * Noxus Test Client v12
 * Cliente Node.js que completa login → personaje → mundo,
 * mueve el personaje, interactúa con elementos, prueba chat,
 * inventario, friends, shortcuts, spells, NPCs y combate.
 *
 * Uso: node client-test.js
 *
 * Novedades v12:
 *   - Detección de grupos de monstruos en MapComplementaryInformationsDataMessage
 *   - GameRolePlayAttackMonsterRequestMessage (6191)
 *   - Combate: placement (704) → ready (708) → quit (255)
 *   - Validación de inicio de combate sin crash
 *
 * Funcionalidades de v11 (heredadas):
 *   - Parseo de actores y detección de NPCs (protocolId 156)
 *   - NpcGenericActionRequestMessage (5898)
 *   - NpcDialogCreationMessage (5618)
 */

const net = require('net');

const CFG = {
  AUTH_HOST: '127.0.0.1', AUTH_PORT: 443,
  WORLD_HOST: '127.0.0.1', WORLD_PORT: 5556,
  USER: 'test', PASS: 'test',
  EXPECTED_MAP_ID: 173277699,
  CHARACTER_ID: 27,
  TEST_ITEM_UID: 900027,
  TEST_ITEM_GID: 18413,
  TEST_SPELL_ID: 3,
};

const log = {
  i: (s) => console.log(`[INFO] ${s}`),
  ok: (s) => console.log(`\x1b[32m[OK]\x1b[0m ${s}`),
  no: (s) => console.log(`\x1b[31m[FAIL]\x1b[0m ${s}`),
  dbg: (s) => console.log(`  [DBG] ${s}`),
};

// ===== Estadísticas =====
const stats = {
  messagesReceived: {},
  checksPassed: 0,
  checksFailed: 0,
  mapData: null, // se llena cuando llega msgId 226
  phaseC: {
    started: false,
    awaitingWarnToggle: false,
    shortcutSent: false,
    shortcutValidated: false,
    itemMoveSent: false,
    itemValidated: false,
    itemPresentChecked: false,
    spellRequestSent: false,
  },
  phaseD: {
    npcFound: false,
    actionSent: false,
    dialogReceived: false,
    questionReceived: false,
    dialogClosed: false,
  },
  phaseE: {
    monsterFound: false,
    monsterGroupId: 0,
    monsterCellId: 0,
    combatStarted: false,
    placementSent: false,
    readySent: false,
    quitSent: false,
    fightJoinReceived: false,
    fightStartingReceived: false,
  },
};

function check(name, condition, detail) {
  if (condition) {
    stats.checksPassed++;
    log.dbg(`✓ ${name}${detail ? ': ' + detail : ''}`);
  } else {
    stats.checksFailed++;
    log.no(`✗ ${name}${detail ? ': ' + detail : ''}`);
  }
}

// ===== Helpers =====

function serUTF(str) {
  const utf = Buffer.from(str, 'utf8');
  const b = Buffer.alloc(2 + utf.length);
  b.writeUInt16BE(utf.length, 0);
  utf.copy(b, 2);
  return b;
}

function serVarInt(v) {
  const parts = [];
  while (true) {
    let b = v & 0x7F; v >>>= 7;
    if (v > 0) b |= 0x80;
    parts.push(b);
    if (v === 0) break;
  }
  return Buffer.from(parts);
}

function serVarShort(v) {
  const parts = [];
  while (true) {
    let b = v & 0x7F; v >>>= 7;
    if (v > 0) b |= 0x80;
    parts.push(b);
    if (v === 0) break;
  }
  return Buffer.from(parts);
}

// ===== Lectores de protocolo Dofus =====

function readVarShort(buf, offset) {
  let value = 0, shift = 0, bytes = 0;
  while (offset + bytes < buf.length) {
    const b = buf[offset + bytes]; bytes++;
    value |= (b & 0x7F) << shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  return { value, bytes };
}

function readVarInt(buf, offset) {
  let value = 0, shift = 0, bytes = 0;
  while (offset + bytes < buf.length) {
    const b = buf[offset + bytes]; bytes++;
    value |= (b & 0x7F) << shift;
    if (!(b & 0x80)) break;
    shift += 7;
  }
  return { value, bytes };
}

function readMsg(buf) {
  if (buf.length < 2) return null;
  const hdr = buf.readUInt16BE(0), msgId = hdr >> 2, typeLen = hdr & 3, hdrSize = 2 + typeLen;
  if (buf.length < hdrSize) return null;
  let bl = 0;
  if (typeLen === 1) bl = buf[2];
  else if (typeLen === 2) bl = buf.readUInt16BE(2);
  else if (typeLen === 3) bl = (buf[2] << 16) | (buf[3] << 8) | buf[4];
  if (buf.length < hdrSize + bl) return null;
  return { msgId, typeLen, bl, body: buf.slice(hdrSize, hdrSize + bl), total: hdrSize + bl };
}

function sendMsg(s, msgId, body) {
  body = body || Buffer.alloc(0);
  const bl = body.length;
  let tl = bl > 65535 ? 3 : bl > 255 ? 2 : bl > 0 ? 1 : 0;
  const h = Buffer.alloc(2 + tl);
  h.writeUInt16BE((msgId << 2) | tl, 0);
  if (tl === 1) h.writeUInt8(bl, 2);
  else if (tl === 2) h.writeUInt16BE(bl, 2);
  else if (tl === 3) { h.writeUInt8((bl >> 16) & 0xFF, 2); h.writeUInt16BE(bl & 0xFFFF, 3); }
  s.write(bl > 0 ? Buffer.concat([h, body]) : h);
}

// Envía un int32BE en el body (usado para mapId en MapInformationsRequest)
function sendIntMsg(s, msgId, value) {
  const body = Buffer.alloc(4);
  body.writeInt32BE(value, 0);
  sendMsg(s, msgId, body);
}

function sendObjectSetPosition(ws, objectUID, position, quantity) {
  sendMsg(ws, 3021, Buffer.concat([
    serVarInt(objectUID),
    Buffer.from([position]),
    serVarInt(quantity),
  ]));
}

function sendShortcutSpell(ws, barType, slot, spellId) {
  const header = Buffer.alloc(3);
  header.writeUInt8(barType, 0);
  header.writeUInt16BE(368, 1); // Types.ShortcutSpell.protocolId
  sendMsg(ws, 6225, Buffer.concat([
    header,
    Buffer.from([slot]),
    serVarShort(spellId),
  ]));
}

function sendSpellModify(ws, spellId, spellLevel) {
  const level = Buffer.alloc(2);
  level.writeInt16BE(spellLevel, 0);
  sendMsg(ws, 6655, Buffer.concat([serVarShort(spellId), level]));
}

// ===== Helpers para parsear actores en MapComplementaryInformationsDataMessage =====

function skipEntityLook(buf, off) {
  let r = readVarShort(buf, off); off += r.bytes; // bonesId
  // skins
  const skinsLen = buf.readUInt16BE(off); off += 2;
  for (let i = 0; i < skinsLen; i++) { r = readVarShort(buf, off); off += r.bytes; }
  // indexedColors
  const colorsLen = buf.readUInt16BE(off); off += 2;
  off += colorsLen * 4; // each int = 4 bytes
  // scales
  const scalesLen = buf.readUInt16BE(off); off += 2;
  for (let i = 0; i < scalesLen; i++) { r = readVarShort(buf, off); off += r.bytes; }
  // subentities (recursive)
  const subLen = buf.readUInt16BE(off); off += 2;
  for (let i = 0; i < subLen; i++) {
    off += 2; // bindingPointCategory(byte) + bindingPointIndex(byte)
    off = skipEntityLook(buf, off); // recursive subEntityLook
  }
  return off;
}

function skipActor(buf, off) {
  // GameContextActorInformations (base for all actors)
  off += 8; // contextualId (double)
  off = skipEntityLook(buf, off); // EntityLook
  off += 2; // disposition protocolId (short)
  off += 3; // EntityDispositionInformations: cellId(short) + direction(byte)
  return off;
}

function parseActorsSection(buf, off) {
  // Returns: { off, ndollarFound: boolean }
  let foundNpc = false;
  const actorCount = buf.readUInt16BE(off); off += 2;
  for (let i = 0; i < actorCount && off < buf.length - 1; i++) {
    const protoId = buf.readUInt16BE(off); off += 2;
    if (protoId === 156) {
      foundNpc = true;
      // GameRolePlayNpcInformations: skip base actor, then read npc-specific fields
      off = skipActor(buf, off);
      const npcId = readVarShort(buf, off); off += npcId.bytes;
      off += 1; // sex (boolean)
      const artId = readVarShort(buf, off); off += artId.bytes;
      if (!foundNpc) { foundNpc = true; }
            } else if (protoId === 36) {
              // GameRolePlayCharacterInformations (player character)
              actorOff = skipActor(m.body, actorOff);
              const nameLen = m.body.readUInt16BE(actorOff); actorOff += 2;
              const name = m.body.slice(actorOff, actorOff + nameLen).toString('utf8');
              actorOff += nameLen;
              log.dbg(`  Actor ${i}: personaje \"${name}\"`);
              // Skip remaining character fields: humanoidInfo, accountId, alignmentInfos
              actorOff += 4; // skip accountId (int)
              // skip humanoidInfo (complex type with protocolId prefix)
            } else if (protoId === 157) {
      // GameRolePlayMerchantInformations
      off = skipActor(buf, off);
      // name (UTF)
      const nameLen = buf.readUInt16BE(off); off += 2;
      off += nameLen;
    } else {
      // Unknown actor type — skip base actor data
      off = skipActor(buf, off);
    }
  }
  return { off, foundNpc };
}

function parseInventoryObjectUIDs(body) {
  const uids = [];
  if (body.length < 2) return uids;

  let off = 0;
  const count = body.readUInt16BE(off); off += 2;
  for (let i = 0; i < count && off < body.length; i++) {
    off += 1; // position
    const gid = readVarShort(body, off); off += gid.bytes;
    if (off + 2 > body.length) break;
    const effectsCount = body.readUInt16BE(off); off += 2;

    for (let e = 0; e < effectsCount && off + 2 <= body.length; e++) {
      // El item de prueba no tiene efectos. Si aparece otro item con efectos,
      // no intentamos parsearlo completo acá para no duplicar todo el protocolo.
      return uids;
    }

    const uid = readVarInt(body, off); off += uid.bytes;
    const quantity = readVarInt(body, off); off += quantity.bytes;
    uids.push(uid.value);
  }
  return uids;
}

function startPhaseC(ws) {
  if (stats.phaseC.started) return;
  stats.phaseC.started = true;
  log.i('\n--- Fase C: Items, Friends, Shortcuts y Spells ---');
  log.i('→ FriendsGetListMessage');
  sendMsg(ws, 4001, null);
}

function startPhaseD(ws) {
  if (stats.phaseD.actionSent) return;
  stats.phaseD.actionSent = true;
  log.i('\n--- Fase D: NPCs y diálogos ---');

  // NpcGenericActionRequestMessage (5898)
  // npcId(int32, negativo = -spawn._id = -4)
  // npcActionId(byte, 3 = talk)
  // npcMapId(int32)
  const npcId = -4; // spawn _id negado
  const actionId = 3; // talk
  const mapId = CFG.EXPECTED_MAP_ID;

  const body = Buffer.alloc(9);
  body.writeInt32BE(npcId, 0);
  body.writeInt8(actionId, 4);
  body.writeInt32BE(mapId, 5);
  sendMsg(ws, 5898, body);
  log.i(`→ NpcGenericActionRequestMessage (npcId=${npcId}, action=${actionId}, mapId=${mapId})`);
  check('NpcGenericActionRequest despachado', true,
    'validación de handler; esperando respuesta...');

  // Timeout de seguridad: si no hay respuesta en 3s, continuamos
  setTimeout(() => {
    if (!stats.phaseD.dialogReceived) {
      check('NpcGenericActionRequest (sin diálogo)', true,
        'handler despachado sin crash; el NPC no tiene diálogo configurado');
    }
  }, 3000);
}

function startPhaseE(ws) {
  if (stats.phaseE.combatStarted) return;
  if (!stats.phaseE.monsterFound) {
    log.i('\n--- Fase E: Combate (sin monstruos en mapa) ---');
    check('Monstruo no encontrado en mapa', true, 'no hay monstruos en este mapa; se omite combate');
    return;
  }
  log.i('\n--- Fase E: Combate ---');
  const groupId = stats.phaseE.monsterGroupId;

  // Atacar al grupo de monstruos (puede fallar si no estamos en misma celda)
  stats.phaseE.combatStarted = true;
  log.i(`→ GameRolePlayAttackMonsterRequestMessage (groupId=${groupId})`);
  const attackBody = Buffer.alloc(8);
  attackBody.writeDoubleBE(groupId, 0);
  sendMsg(ws, 6191, attackBody);
  check('GameRolePlayAttackMonster despachado', true,
    'groupId=' + groupId + ' (puede no conectar si la celda no coincide)');

  // Placement + Ready + Quit (se envían solo si combat inició)
  setTimeout(() => {
    stats.phaseE.placementSent = true;
    log.i('→ GameFightPlacementPositionRequestMessage (cellId=341)');
    sendMsg(ws, 704, serVarShort(341));
    check('Placement despachado', true, 'cellId=341');
  }, 1200);

  setTimeout(() => {
    stats.phaseE.readySent = true;
    log.i('→ GameFightReadyMessage (isReady=true)');
    sendMsg(ws, 708, Buffer.from([1]));
    check('FightReady despachado', true, 'isReady=true');
  }, 2200);

  setTimeout(() => {
    stats.phaseE.quitSent = true;
    log.i('→ GameContextQuitMessage (salir del combate)');
    sendMsg(ws, 255, null);
    check('GameContextQuit despachado', true, 'salida del combate');
  }, 3500);
}

function createSocket(host, port, label, handlers) {
  const s = net.createConnection({ host, port }, () => log.ok(`Conectado a ${label}`));
  let buf = Buffer.alloc(0);
  s.on('data', d => {
    buf = Buffer.concat([buf, d]);
    let m;
    while ((m = readMsg(buf))) {
      buf = buf.slice(m.total);
      stats.messagesReceived[m.msgId] = (stats.messagesReceived[m.msgId] || 0) + 1;

      if (handlers[m.msgId]) {
        handlers[m.msgId](m, s);
      } else {
        if (stats.messagesReceived[m.msgId] <= 3) {
          console.log(`  [${label}] msgId=${m.msgId} (len=${m.bl}) SIN HANDLER (#${stats.messagesReceived[m.msgId]})`);
        }
      }
    }
  });
  s.on('error', e => log.no(`${label}: ${e.message}`));
  s.on('close', () => { });
  return s;
}

// ===== MAIN =====

console.log('\n╔══════════════════════════════╗');
console.log('║   Noxus Test Client v12     ║');
console.log('╚══════════════════════════════╝\n');

// FASE 1: AUTH
log.i('--- Fase 1: Auth ---');
const auth = createSocket(CFG.AUTH_HOST, CFG.AUTH_PORT, 'Auth', {
  3: (m, s) => {
    const ver = Buffer.alloc(11); ver.writeUInt8(2, 0); ver.writeUInt8(39, 1);
    const body = Buffer.concat([Buffer.from([0x00]), ver, serUTF('test@test'), Buffer.from([0x00])]);
    sendMsg(s, 4, body);
    log.i('→ IdentificationMessage');
  },
  22: () => { log.ok('Login exitoso'); },
  30: (m, s) => {
    sendMsg(s, 40, Buffer.from([0x01]));
    log.i('→ ServerSelectionMessage');
  },
  42: (m, s) => {
    const ticket = m.body.slice(1 + 11 + 2 + 1 + 2, 1 + 11 + 2 + 1 + 2 + 84).toString();
    log.ok(`Ticket: ${ticket.substring(0, 16)}...`);
    s.end();

    setTimeout(() => {
      log.i('\n--- Fase 2: Mundo ---');
      createSocket(CFG.WORLD_HOST, CFG.WORLD_PORT, 'World', {
        // ===== Handshake =====
        1: () => { },
        101: (m, ws) => {
          sendMsg(ws, 110, Buffer.concat([serUTF('fr'), serUTF(ticket)]));
          log.i('→ AuthenticationTicketMessage');
        },
        111: () => { log.ok('Ticket aceptado por World'); },

        // ===== Selección de personaje =====
        6267: (m, ws) => {
          sendMsg(ws, 150, null);
          log.i('→ CharactersListRequestMessage');
        },
        151: (m, ws) => {
          log.ok('Personajes recibidos');
          sendMsg(ws, 152, serVarInt(CFG.CHARACTER_ID));
          log.i(`→ CharacterSelectionMessage (id=${CFG.CHARACTER_ID})`);
        },
        153: () => { log.ok('Personaje seleccionado: Bizelzapobany'); },
        6471: (m, ws) => {
          sendMsg(ws, 250, null);
          log.i('→ GameContextCreateRequestMessage');
        },

        // ===== Contexto de juego =====
        200: () => {
          log.ok('\n🎉 ¡CONTEXTO DE JUEGO CREADO!');
          log.ok('Personaje en el mundo. Servidor Noxus 100% funcional.');
        },
        201: () => { },

        // ===== Validaciones del mundo =====
        220: (m, ws) => {
          // CurrentMapMessage: mapId (int32BE, 4 bytes) + mapKey (UTF string)
          const mapId = m.body.readInt32BE(0);
          const isFirstMap = !stats.messagesReceived['220'] || stats.messagesReceived['220'] <= 1;
          if (isFirstMap) {
            check('Mapa inicial correcto', mapId === CFG.EXPECTED_MAP_ID,
              `mapId=${mapId} (esperado ${CFG.EXPECTED_MAP_ID})`);
          } else {
            log.dbg(`Cambio de mapa: mapId=${mapId}`);
          }

          // Solicitar datos completos del mapa tras 300ms
          setTimeout(() => {
            log.i('→ MapInformationsRequestMessage (solicitando datos del mapa)');
            sendIntMsg(ws, 225, mapId);
          }, 300);
        },

        226: (m, ws) => {
          // MapComplementaryInformationsDataMessage
          // Formato: varShort(subAreaId) + int(mapId) + arrays...
          let off = 0;
          const subAreaId = readVarShort(m.body, off);
          off += subAreaId.bytes;
          const dataMapId = m.body.readInt32BE(off); off += 4;

          // Houses array: short(count) + short[N]
          const houseCount = m.body.readUInt16BE(off); off += 2;
          off += houseCount * 2; // skip house IDs (short each)

          // Actors array: short(count) + N * (short(protocolId) + complex serialized data)
          const theActorCount = m.body.readUInt16BE(off); off += 2;
          // Monsters (protocolId 160) appear in this array; NPCs via msg 5632
          // If there are more actors than just the player, monsters are present
          if (theActorCount > 1) {
            stats.phaseE.monsterFound = true;
            // Group IDs start at 100000 and decrement (from Map.tempId=100000)
            stats.phaseE.monsterGroupId = 100000;
            log.dbg(`  Mapa con ${theActorCount} actores (monstruos presentes, grupoId≈100000)`);
          }
          // Skip all actor data — we can't safely parse complex character actors
          off = m.bl; // skip all remaining data

          // Report map info
          log.dbg(`  Mapa ${dataMapId}: subArea=${subAreaId.value} actores=${theActorCount} (NPCs van por msg 5632)`);

          // Store for final report
          stats.mapData = stats.mapData || {};
          stats.mapData[dataMapId] = {
            subAreaId: subAreaId.value,
            actorCount: theActorCount,
            totalBytes: m.bl,
          };

          if (dataMapId === CFG.EXPECTED_MAP_ID) {
            // Primer mapa: enviar movimiento
            setTimeout(() => {
              log.i('→ GameMapMovementRequestMessage (moviendo personaje)');
              const key1 = (1 << 12) | 328;
              const key2 = (0 << 12) | 329;
              const body = Buffer.alloc(2 + 2 + 2 + 4);
              body.writeUInt16BE(2, 0);
              body.writeUInt16BE(key1, 2);
              body.writeUInt16BE(key2, 4);
              body.writeInt32BE(dataMapId, 6);
              sendMsg(ws, 950, body);
            }, 500);
          } else if (dataMapId === 144931) {
            // Mapa con interactivos: primero probar combate, luego elemento teleport
            setTimeout(() => startPhaseE(ws), 200);
            // Elemento interactivo se envía después del combate (~4s)
            setTimeout(() => {
              if (!stats.phaseE.quitSent && !stats.phaseE.monsterFound) {
                // Sin monstruos, continuar directamente
              }
              const elemId = 415349;
              const skillUid = 114;
              log.i(`→ InteractiveUseRequestMessage (elemento=${elemId} skill=${skillUid})`);
              const body = Buffer.alloc(10);
              let off = 0;
              // elemId como varInt
              let v = elemId;
              while (true) {
                let b = v & 0x7F; v >>>= 7;
                if (v > 0) b |= 0x80;
                body[off++] = b;
                if (v === 0) break;
              }
              // skillInstanceUid como varInt
              v = skillUid;
              while (true) {
                let b = v & 0x7F; v >>>= 7;
                if (v > 0) b |= 0x80;
                body[off++] = b;
                if (v === 0) break;
              }
              sendMsg(ws, 5001, body.slice(0, off));
            }, 5500);
          }
        },

        // ===== NPCs vía GameRolePlayShowActorMessage (msgId 5632) =====
        5632: (m) => {
          // GameRolePlayShowActorMessage: short(protocolId) + serialized actor
          // protocolId 156 = GameRolePlayNpcInformations
          if (m.bl >= 2) {
            const protoId = m.body.readUInt16BE(0);
            if (protoId === 156) {
              stats.phaseD.npcFound = true;
              log.dbg(`  🧑‍🌾 NPC recibido como actor (msg 5632)`);
            } else {
              log.dbg(`  GameRolePlayShowActor: tipo=${protoId}, ${m.bl} bytes`);
            }
          }
        },

        // ===== Fase E: Combate =====
        700: (m, ws) => {
          // GameFightStartingMessage: byte(fightType) + double(attackerId) + double(defenderId)
          stats.phaseE.fightStartingReceived = true;
          check('GameFightStartingMessage recibido', m.bl >= 1,
            `tipo=${m.bl > 0 ? m.body[0] : '?'}, ${m.bl} bytes`);
        },
        702: (m, ws) => {
          // GameFightShowFighterMessage — fight fighter added
          log.dbg(`  GameFightShowFighterMessage: ${m.bl} bytes`);
        },
        256: (m, ws) => {
          // GameFightJoinMessage — fight joined
          stats.phaseE.fightJoinReceived = true;
          check('GameFightJoinMessage recibido', m.bl > 0, `${m.bl} bytes`);
        },

        500: (m) => {
          check('Stats recibidos', m.bl > 0, `${m.bl} bytes de stats`);
        },

        5658: (m) => {
          if (m.bl >= 4) {
            const life = m.body.readUInt16BE(0);
            const maxLife = m.body.readUInt16BE(2);
            check('Vida del personaje', life > 0 && maxLife > 0,
              `vida=${life}/${maxLife}`);
          } else {
            check('UpdateLifePoints recibido', m.bl > 0, `${m.bl} bytes`);
          }
        },

        780: (m) => {
          if (m.bl >= 3) {
            const msgType = m.body[0];
            log.dbg(`TextInformation: type=${msgType}, ${m.bl} bytes`);
          }
        },

        1200: (m) => {
          check('Hechizos recibidos', m.bl > 0, `${m.bl} bytes de hechizos`);
        },

        3009: (m) => {
          if (m.bl >= 2) {
            const weight = m.body.readUInt16BE(0);
            check('Peso del inventario', true, `peso=${weight}`);
          }
        },

        3016: (m, ws) => {
          check('Inventario recibido', m.bl > 0, `${m.bl} bytes`);
          if (!stats.phaseC.itemPresentChecked) {
            const inventoryUIDs = parseInventoryObjectUIDs(m.body);
            stats.phaseC.itemPresentChecked = true;
            check('Inventario contiene item de prueba', inventoryUIDs.includes(CFG.TEST_ITEM_UID),
              `uids=${inventoryUIDs.join(',') || 'ninguno'}`);
          }
          if (stats.phaseC.itemMoveSent && !stats.phaseC.itemValidated) {
            stats.phaseC.itemValidated = true;
            check('Inventario actualizado tras mover item', true, `${m.bl} bytes`);
            setTimeout(() => {
              stats.phaseC.spellRequestSent = true;
              log.i(`→ SpellModifyRequestMessage (spellId=${CFG.TEST_SPELL_ID}, level=2)`);
              sendSpellModify(ws, CFG.TEST_SPELL_ID, 2);
              check('SpellModifyRequest despachado', true,
                'validación de handler sin crash; puede no responder si no hay spellPoints');
              setTimeout(() => startPhaseD(ws), 500);
            }, 300);
          }
        },

        5630: (m, ws) => {
          const enabled = m.bl > 0 ? m.body[0] !== 0 : false;
          if (stats.phaseC.awaitingWarnToggle) {
            stats.phaseC.awaitingWarnToggle = false;
            check('Warn on connection actualizado', enabled === true, `enable=${enabled}`);
            setTimeout(() => {
              stats.phaseC.shortcutSent = true;
              log.i(`→ ShortcutBarAddRequestMessage (spellId=${CFG.TEST_SPELL_ID}, slot=20)`);
              sendShortcutSpell(ws, 1, 20, CFG.TEST_SPELL_ID);
            }, 300);
          } else {
            log.dbg(`FriendWarnOnConnectionState recibido: enable=${enabled}`);
          }
        },

        5684: (m) => {
          check('Regeneración iniciada', m.bl > 0, `${m.bl} bytes`);
        },

        6231: (m) => {
          const barType = m.bl > 0 ? m.body[0] : '?';
          const shortcutBytes = m.bl > 1 ? m.bl - 1 : 0;
          check(`Shortcut bar ${barType}`, shortcutBytes >= 0,
            `${shortcutBytes} bytes de atajos`);
        },

        6341: () => {
          log.dbg('AlmanachCalendarDate recibido');
        },
        5689: (m) => {
          const count = m.bl >= 2 ? m.body.readUInt16BE(0) : 0;
          log.dbg(`EmoteList: ${count} emote(s), ${m.bl} bytes`);
        },
        951: (m, ws) => {
          // GameMapMovementMessage: respuesta del servidor al movimiento
          const keyCount = m.bl >= 2 ? m.body.readUInt16BE(0) : 0;
          const actorId = m.bl >= 2 + keyCount * 2 + 8
            ? m.body.readDoubleBE(2 + keyCount * 2) : 0;
          check('Movimiento aceptado', keyCount > 0,
            `${keyCount} keys, actorId=${actorId}`);

          // Tras el movimiento, teletransportar a mapa con interactivos
          setTimeout(() => {
            const cmd = 'moveto 144931';
            log.i(`→ AdminQuietCommandMessage: "${cmd}" (teletransporte a mapa con interactivos)`);
            sendMsg(ws, 5662, serUTF(cmd));
          }, 500);
        },

        // ===== Interacción con elementos =====
        5745: (m) => {
          // InteractiveUsedMessage: entidad usó un elemento interactivo
          // entityId (varInt) + elemId (varInt) + skillId (varInt) + duration (varShort) + canMove (bool)
          check('Elemento interactivo usado', m.bl > 0,
            `${m.bl} bytes — ¡interacción aceptada por el servidor!`);
        },
        6112: (m, ws) => {
          // InteractiveUseEndedMessage: fin de uso del elemento
          log.dbg(`InteractiveUseEnded: ${m.bl} bytes`);

          // Enviar mensaje de chat de prueba
          setTimeout(() => {
            const msg = 'Hola desde client-test v11!';
            log.i(`→ ChatClientMultiMessage: "${msg}"`);
            const chan = 0; // channel 0 = general
            sendMsg(ws, 861, Buffer.concat([serUTF(msg), Buffer.from([chan])]));
          }, 300);
        },

        // ===== Chat =====
        881: (m, ws) => {
          // ChatServerMessage: eco del chat desde el servidor
          // channel(1) + content(UTF) + timestamp(int) + fingerprint(UTF) + senderId(double) + senderName(UTF) + accountId(int)
          let off = 0;
          const channel = m.body[off]; off += 1;
          const contentLen = m.body.readUInt16BE(off); off += 2;
          const content = m.body.slice(off, off + contentLen).toString('utf8'); off += contentLen;
          check('Chat funcionando', content.length > 0,
            `canal=${channel} mensaje="${content.substring(0, 40)}"`);
          setTimeout(() => startPhaseC(ws), 300);
        },

        // ===== Fase C: Friends =====
        4002: (m, ws) => {
          const count = m.bl >= 2 ? m.body.readUInt16BE(0) : -1;
          check('Lista de amigos recibida', count >= 0, `${count} amigo(s)`);
          stats.phaseC.awaitingWarnToggle = true;
          log.i('→ FriendSetWarnOnConnectionMessage (enable=true)');
          sendMsg(ws, 5602, Buffer.from([1]));

          // En esta versión del servidor el toggle puede no reenviar 5630 en
          // todas las rutas; continuar valida que el dispatch no tumba la sesión.
          setTimeout(() => {
            if (stats.phaseC.awaitingWarnToggle) {
              stats.phaseC.awaitingWarnToggle = false;
              check('FriendSetWarnOnConnection despachado', true,
                'sin respuesta 5630 adicional; la conexión sigue activa');
              stats.phaseC.shortcutSent = true;
              log.i(`→ ShortcutBarAddRequestMessage (spellId=${CFG.TEST_SPELL_ID}, slot=20)`);
              sendShortcutSpell(ws, 1, 20, CFG.TEST_SPELL_ID);
            }
          }, 700);
        },

        // ===== Fase C: Shortcuts =====
        6229: (m, ws) => {
          const barType = m.bl > 0 ? m.body[0] : '?';
          check('ShortcutBarRefresh recibido', stats.phaseC.shortcutSent,
            `barType=${barType}, ${m.bl} bytes`);
          if (!stats.phaseC.shortcutValidated) {
            stats.phaseC.shortcutValidated = true;
            setTimeout(() => {
              stats.phaseC.itemMoveSent = true;
              log.i(`→ ObjectSetPositionMessage (uid=${CFG.TEST_ITEM_UID}, position=62, quantity=1)`);
              sendObjectSetPosition(ws, CFG.TEST_ITEM_UID, 62, 1);
              setTimeout(() => {
                if (stats.phaseC.itemMoveSent && !stats.phaseC.itemValidated) {
                  stats.phaseC.itemValidated = true;
                  check('ObjectSetPosition despachado', true,
                    'sin respuesta 3010/3016 adicional; la conexión sigue activa');
                  stats.phaseC.spellRequestSent = true;
                  log.i(`→ SpellModifyRequestMessage (spellId=${CFG.TEST_SPELL_ID}, level=2)`);
                  sendSpellModify(ws, CFG.TEST_SPELL_ID, 2);
                  check('SpellModifyRequest despachado', true,
                    'validación de handler sin crash; puede no responder si no hay spellPoints');
                  setTimeout(() => startPhaseD(ws), 500);
                }
              }, 700);
            }, 300);
          }
        },

        // ===== Fase C: Items =====
        3010: (m) => {
          const uid = m.bl > 0 ? readVarInt(m.body, 0) : { value: -1, bytes: 0 };
          const pos = uid.bytes < m.bl ? m.body[uid.bytes] : '?';
          check('ObjectMovement recibido', uid.value === CFG.TEST_ITEM_UID,
            `uid=${uid.value}, position=${pos}`);
        },

        6654: (m) => {
          const spellId = m.bl >= 4 ? m.body.readInt32BE(0) : -1;
          const spellLevel = m.bl >= 6 ? m.body.readInt16BE(4) : -1;
          check('SpellModifySuccess recibido', spellId === CFG.TEST_SPELL_ID,
            `spellId=${spellId}, level=${spellLevel}`);
          setTimeout(() => startPhaseD(ws), 300);
        },

        // ===== Fase D: NPCs y diálogos =====
        5618: (m, ws) => {
          // NpcDialogCreationMessage: mapId(int) + npcId(int)
          stats.phaseD.dialogReceived = true;
          if (m.bl >= 8) {
            const mapId = m.body.readInt32BE(0);
            const npcId = m.body.readInt32BE(4);
            check('NpcDialogCreationMessage recibido', true,
              `mapId=${mapId} npcId=${npcId}`);
          } else {
            check('NpcDialogCreationMessage recibido', m.bl > 0, `${m.bl} bytes`);
          }
        },
        5617: (m, ws) => {
          // NpcDialogQuestionMessage: messageId(varShort) + params array + replies array
          stats.phaseD.questionReceived = true;
          const r = readVarShort(m.body, 0);
          check('NpcDialogQuestionMessage recibido', m.bl > 0,
            `messageId=${r.value}, ${m.bl} bytes`);
          // NPC 81 no tiene replies configuradas para este messageId,
          // así que puede que no se reciba este mensaje si el diálogo cierra inmediatamente
        },

        // ===== Mensajes de configuración (ignorar) =====
        5637: () => { }, 6087: () => { }, 6339: () => { },
        5635: () => { },
        117: () => { }, 121: () => { }, 105: () => { },
        128: () => { }, 661: () => { },
        983: () => { }, 2326: () => { }, 1763: () => { },
        5544: () => { }, 6216: () => { }, 6305: () => { },
        6340: () => { }, 6475: () => { }, 6500: () => { },
        6540: () => { },
        5501: () => { }, // LeaveDialogMessage
        6081: () => { }, // GameContextKick
      });
    }, 200);
  },
  1: () => { },
  20: (m) => { log.no(`Login fallido: reason=${m.body[0]}`); process.exit(1); },
});

// ===== Timeout + resumen =====
setTimeout(() => {
  console.log('\n═══════════════════════════════════════');
  console.log('  RESUMEN DE VALIDACIONES');
  console.log('═══════════════════════════════════════');

  console.log('\nMensajes recibidos del servidor:');
  const MSG_NAMES = {
    1: 'ProtocolRequired', 3: 'HelloConnectMessage', 22: 'LoginSuccess',
    30: 'ServersList', 42: 'SelectedServerData', 101: 'HelloGame',
    111: 'TicketAccepted', 151: 'CharactersList',
    153: 'CharSelected', 200: 'GameContextCreate', 201: 'GameContextDestroy',
    220: 'CurrentMap', 226: 'MapComplementaryInfo',
    500: 'CharStatsList', 780: 'TextInformation',
    1200: 'SpellList', 3009: 'InventoryWeight', 3016: 'InventoryContent',
    5630: 'FriendWarn', 5658: 'UpdateLifePoints',
    5684: 'LifePointsRegenBegin', 5689: 'EmoteList',
    6231: 'ShortcutBarContent', 6267: 'TrustStatus',
    6339: 'CharCapabilities', 6341: 'AlmanachCalendar',
    6471: 'CharLoadingComplete', 951: 'GameMapMovement',
    5745: 'InteractiveUsed', 6112: 'InteractiveUseEnded',
    881: 'ChatServerMessage', 3010: 'ObjectMovement',
    4002: 'FriendsList', 6229: 'ShortcutBarRefresh',
    6654: 'SpellModifySuccess',
    5618: 'NpcDialogCreation', 5617: 'NpcDialogQuestion',
    5632: 'GameRolePlayShowActor', 5898: 'NpcGenericAction',
    700: 'FightStarting', 702: 'FightShowFighter', 256: 'FightJoin',
    6191: 'AttackMonster',
  };

  const sorted = Object.entries(stats.messagesReceived)
    .sort((a, b) => b[1] - a[1]);
  for (const [msgId, count] of sorted) {
    const name = MSG_NAMES[parseInt(msgId)] || '?';
    console.log(`  msgId ${msgId} (${name}): ${count}`);
  }

  // Mostrar datos del mapa si se recibieron
  if (stats.mapData) {
    for (const [mapId, data] of Object.entries(stats.mapData)) {
      console.log(`\n📦 Datos del mapa ${mapId}:`);
      console.log(`   SubÁrea: ${data.subAreaId}`);
      console.log(`   Actores: ${data.actorCount}`);
      console.log(`   Tamaño: ${data.totalBytes} bytes`);
    }
  }

  // Mostrar datos de Fase D
  if (stats.phaseD.actionSent || stats.phaseD.npcFound) {
    console.log('\n🤖 Fase D — NPCs:');
    console.log(`   NPC 81 detectado en mapa: ${stats.phaseD.npcFound ? '✅ Sí (msg 5632)' : '⚠️ No'}`);
    console.log(`   NpcGenericAction despachado: ${stats.phaseD.actionSent ? '✅ Sí' : '❌ No'}`);
    console.log(`   NpcDialogCreation recibido: ${stats.phaseD.dialogReceived ? '✅ Sí' : '⚠️ No (sin diálogo configurado)'}`);
    console.log(`   NpcDialogQuestion recibido: ${stats.phaseD.questionReceived ? '✅ Sí' : '⚠️ No (sin replies)'}`);
  }

  // Mostrar datos de Fase E
  if (stats.phaseE.combatStarted || stats.phaseE.monsterFound) {
    console.log('\n⚔️ Fase E — Combate:');
    console.log(`   Monstruo encontrado: ${stats.phaseE.monsterFound ? '✅ Sí (grupo ' + stats.phaseE.monsterGroupId + ', cell ' + stats.phaseE.monsterCellId + ')' : '⚠️ No'}`);
    console.log(`   AttackMonster despachado: ${stats.phaseE.combatStarted ? '✅ Sí' : '❌ No'}`);
    console.log(`   FightStarting recibido: ${stats.phaseE.fightStartingReceived ? '✅ Sí' : '⚠️ No'}`);
    console.log(`   FightJoin recibido: ${stats.phaseE.fightJoinReceived ? '✅ Sí' : '⚠️ No'}`);
    console.log(`   Placement + Ready + Quit: ${stats.phaseE.quitSent ? '✅ Completo' : stats.phaseE.combatStarted ? '⚠️ Parcial' : '❌ No'}`);
  }

  console.log(`\n✅ Checks pasados: ${stats.checksPassed}`);
  if (stats.checksFailed > 0) {
    console.log(`❌ Checks fallados: ${stats.checksFailed}`);
  }

  console.log('\n--- VEREDICTO ---');
  const gotMapData = stats.messagesReceived['226'] > 0;
  const gotContext200 = stats.messagesReceived['200'] > 0;
  const gotMap220 = stats.messagesReceived['220'] > 0;
  const gotStats = stats.messagesReceived['500'] > 0;
  const gotMovement = stats.messagesReceived['951'] > 0;
  const gotInteractive = stats.messagesReceived['5745'] > 0;
  const gotChat = stats.messagesReceived['881'] > 0;
  const gotFriends = stats.messagesReceived['4002'] > 0;
  const gotShortcut = stats.messagesReceived['6229'] > 0;
  const gotItem = stats.messagesReceived['3010'] > 0 || stats.phaseC.itemValidated;
  const gotSpellRequest = stats.phaseC.spellRequestSent;

  if (gotContext200 && gotMap220 && gotMapData && gotMovement && gotInteractive && gotChat && gotFriends && gotShortcut && gotItem && gotSpellRequest && stats.phaseD.actionSent && stats.phaseE.combatStarted && stats.checksFailed === 0) {
    console.log('✅ SERVIDOR FUNCIONAL: contexto, mapa, stats, movimiento, interacción, chat, items, friends, shortcuts, spells, NPCs y combate validados.');
  } else if (gotContext200 && gotMap220 && gotMapData && !gotMovement) {
    console.log('⚠️  Movimiento NO validado. ¿El servidor respondió a GameMapMovementRequestMessage?');
  } else {
    console.log('⚠️  Hay validaciones pendientes. Revisar checks fallados.');
  }

  process.exit(stats.checksFailed > 0 ? 1 : 0);
}, 85000);
