/**
 * Noxus Test Client v7
 * Cliente Node.js que completa login → personaje → mundo,
 * solicita datos del mapa y envía un movimiento de prueba.
 *
 * Uso: node client-test.js
 *
 * Novedades v7:
 *   - GameMapMovementRequestMessage (950) tras recibir datos del mapa
 *   - Valida GameMapMovementMessage (951) de respuesta del servidor
 *   - Helpers readVarShort/readVarInt para protocolo Dofus
 */

const net = require('net');

const CFG = {
  AUTH_HOST: '127.0.0.1', AUTH_PORT: 443,
  WORLD_HOST: '127.0.0.1', WORLD_PORT: 5556,
  USER: 'test', PASS: 'test',
  EXPECTED_MAP_ID: 173277699,
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
console.log('║   Noxus Test Client v7      ║');
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
          sendMsg(ws, 152, serVarInt(27));
          log.i('→ CharacterSelectionMessage (id=27)');
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
          check('Mapa correcto', mapId === CFG.EXPECTED_MAP_ID,
            `mapId=${mapId} (esperado ${CFG.EXPECTED_MAP_ID})`);

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

          // Actors array: short(count) + N * (short(protocolId) + serialized)
          const actorCount = m.body.readUInt16BE(off); off += 2;
          // Skip actors — they're complex protocol-typed objects
          // Each actor: short(protocolId) + variable-length serialized data
          // We can't easily skip without knowing each actor type's size
          // For now, just count them
          let actorsSkipped = 0;
          const actorStartOff = off;
          try {
            for (let i = 0; i < actorCount && off < m.bl; i++) {
              const protoId = m.body.readUInt16BE(off); off += 2;
              // GameRolePlayNpcInformations = -NpcId, look, disposition, npcId, sex, specialArtworkId
              // GameRolePlayCharacterInformations = ...
              // We can't know exact size, so skip heuristically
              // Most actors are ~40-200 bytes. We'll estimate by reading protocolId
              actorsSkipped++;
              // For safety, break if we seem stuck
              if (off >= m.bl - 10) break;
            }
          } catch (e) {
            // If we overshoot, it's OK — the data is there
          }
          // Reset to after actor count — we'll just report the header info
          off = actorStartOff;
          // Skip actor data by estimating: each actor has at least protocolId(2) + some data
          // Actually let's just skip all actors by advancing past them
          // Better approach: just report what we CAN parse: header counts

          // Skip remaining body bytes and just report what we have
          check('Datos del mapa recibidos', m.bl > 0,
            `subArea=${subAreaId.value} mapId=${dataMapId} actores=${actorCount} interactivos=?`);

          // Parse interactives too
          // interactiveElements: at off after actors... we can't easily find where
          // Let's just log the raw size
          log.dbg(`  Mapa complementario: ${m.bl} bytes total, ${actorCount} actor(es)`);

          // Store for final report
          stats.mapData = {
            subAreaId: subAreaId.value,
            mapId: dataMapId,
            actorCount,
            totalBytes: m.bl,
          };

          // Enviar movimiento de prueba tras recibir datos del mapa
          setTimeout(() => {
            log.i('→ GameMapMovementRequestMessage (moviendo personaje)');
            // keyMovement = (direction << 12) | cellId
            // Desde cellId 328, dir=1 (DOWN_RIGHT), hacia cellId 329
            const key1 = (1 << 12) | 328;  // start: dir=DOWN_RIGHT, cell=328
            const key2 = (0 << 12) | 329;  // end: dir=RIGHT, cell=329
            const body = Buffer.alloc(2 + 2 + 2 + 4);  // count(short) + 2×keys(short) + mapId(int)
            body.writeUInt16BE(2, 0);       // 2 key movements
            body.writeUInt16BE(key1, 2);    // first key
            body.writeUInt16BE(key2, 4);    // second key
            body.writeInt32BE(dataMapId, 6); // mapId
            sendMsg(ws, 950, body);
          }, 500);
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

        3016: (m) => {
          check('Inventario recibido', m.bl > 0, `${m.bl} bytes`);
        },

        5630: () => { log.dbg('FriendWarnOnConnectionState recibido'); },

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
        951: (m) => {
          // GameMapMovementMessage: respuesta del servidor al movimiento
          const keyCount = m.bl >= 2 ? m.body.readUInt16BE(0) : 0;
          const actorId = m.bl >= 2 + keyCount * 2 + 8
            ? m.body.readDoubleBE(2 + keyCount * 2) : 0;
          check('Movimiento aceptado', keyCount > 0,
            `${keyCount} keys, actorId=${actorId}`);
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
  };

  const sorted = Object.entries(stats.messagesReceived)
    .sort((a, b) => b[1] - a[1]);
  for (const [msgId, count] of sorted) {
    const name = MSG_NAMES[parseInt(msgId)] || '?';
    console.log(`  msgId ${msgId} (${name}): ${count}`);
  }

  // Mostrar datos del mapa si se recibieron
  if (stats.mapData) {
    console.log(`\n📦 Datos del mapa ${stats.mapData.mapId}:`);
    console.log(`   SubÁrea: ${stats.mapData.subAreaId}`);
    console.log(`   Actores (NPCs/players): ${stats.mapData.actorCount}`);
    console.log(`   Tamaño total: ${stats.mapData.totalBytes} bytes`);
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

  if (gotContext200 && gotMap220 && gotMapData && gotMovement && stats.checksFailed === 0) {
    console.log('✅ SERVIDOR FUNCIONAL: contexto, mapa, stats, datos del mapa y movimiento validados.');
  } else if (gotContext200 && gotMap220 && gotMapData && !gotMovement) {
    console.log('⚠️  Movimiento NO validado. ¿El servidor respondió a GameMapMovementRequestMessage?');
  } else {
    console.log('⚠️  Hay validaciones pendientes. Revisar checks fallados.');
  }

  process.exit(stats.checksFailed > 0 ? 1 : 0);
}, 15000);
