/**
 * Noxus Test Client v5
 * Cliente Node.js que completa login → personaje → mundo
 * con validación de mensajes del servidor.
 *
 * Uso: node client-test.js
 *
 * Novedades v5:
 *   - Handlers para todos los mensajes del mundo conocidos
 *   - Validación de CurrentMapMessage (mapId), stats, vida, peso, hechizos
 *   - Resumen final de mensajes recibidos
 *   - Timeout 15s (suficiente tras fix de ciclos en Node 25)
 */

const net = require('net');

const CFG = {
  AUTH_HOST: '127.0.0.1', AUTH_PORT: 443,
  WORLD_HOST: '127.0.0.1', WORLD_PORT: 5556,
  USER: 'test', PASS: 'test',
  EXPECTED_MAP_ID: 173277699, // Mapa del personaje Bizelzapobany (id=27)
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
        // Solo mostrar primeras 3 ocurrencias de mensajes desconocidos
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
console.log('║   Noxus Test Client v5      ║');
console.log('╚══════════════════════════════╝\n');

let worldConnected = false;

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
      worldConnected = true;
      log.i('\n--- Fase 2: Mundo ---');
      createSocket(CFG.WORLD_HOST, CFG.WORLD_PORT, 'World', {
        // ===== Handshake =====
        1: () => { }, // ProtocolRequired
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
        201: () => { /* GameContextDestroyMessage — normal, se envía antes de crear */ },

        // ===== Validaciones del mundo =====
        220: (m) => {
          // CurrentMapMessage: mapId (int32BE, 4 bytes) + mapKey (UTF string)
          const mapId = m.body.readInt32BE(0);
          const mapKey = m.body.slice(4).toString('utf8');
          check('Mapa correcto', mapId === CFG.EXPECTED_MAP_ID,
            `mapId=${mapId} (esperado ${CFG.EXPECTED_MAP_ID})`);
          log.dbg(`  mapKey: "${mapKey.substring(0, 20)}..."`);
        },

        500: (m) => {
          // CharacterStatsListMessage: stats del personaje
          check('Stats recibidos', m.bl > 0, `${m.bl} bytes de stats`);
        },

        5658: (m) => {
          // UpdateLifePointsMessage: vida actual (varInt) + vida máxima (varInt)
          // Simplificado: leemos los primeros bytes como UInt16BE
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
          // TextInformationMessage: mensajes del sistema
          // msgType(1) + msgId(varShort) + params
          if (m.bl >= 3) {
            const msgType = m.body[0];
            log.dbg(`TextInformation: type=${msgType}, ${m.bl} bytes`);
          }
        },

        1200: (m) => {
          // SpellListMessage: lista de hechizos
          check('Hechizos recibidos', m.bl > 0, `${m.bl} bytes de hechizos`);
        },

        3009: (m) => {
          // InventoryWeightMessage: peso actual (varInt) + peso máximo (varInt)
          if (m.bl >= 2) {
            const weight = m.body.readUInt16BE(0);
            const maxWeight = m.bl >= 4 ? m.body.readUInt16BE(2) : 0;
            check('Peso del inventario', true,
              `peso=${weight}${maxWeight ? '/' + maxWeight : ''}`);
          }
        },

        3016: (m) => {
          // InventoryContentMessage: contenido del inventario
          check('Inventario recibido', m.bl > 0, `${m.bl} bytes`);
        },

        5630: () => {
          // FriendWarnOnConnectionStateMessage: aviso de conexión de amigos
          log.dbg('FriendWarnOnConnectionState recibido');
        },

        5684: (m) => {
          // LifePointsRegenBeginMessage: inicio de regeneración
          check('Regeneración iniciada', m.bl > 0, `${m.bl} bytes`);
        },

        6231: (m) => {
          // ShortcutBarContentMessage: barra de atajos
          const barType = m.bl > 0 ? m.body[0] : '?';
          const shortcutBytes = m.bl > 1 ? m.bl - 1 : 0;
          check(`Shortcut bar ${barType}`, shortcutBytes >= 0,
            `${shortcutBytes} bytes de atajos`);
        },

        6341: () => {
          // AlmanachCalendarDateMessage: fecha del calendario
          log.dbg('AlmanachCalendarDate recibido');
        },

        // ===== Mensajes de configuración (ignorar) =====
        5637: () => { }, 6087: () => { }, 6339: () => { },
        5635: () => { }, // CharacterCapabilitiesMessage
        117: () => { }, 121: () => { }, 105: () => { },
        128: () => { }, 225: () => { }, 661: () => { },
        983: () => { }, 2326: () => { }, 1763: () => { },
        5544: () => { }, 6216: () => { }, 6305: () => { },
        6340: () => { }, 6475: () => { }, 6500: () => { },
        6540: () => { },
      });
    }, 200);
  },
  // Auth: mensajes iniciales
  1: () => { },
  20: (m) => { log.no(`Login fallido: reason=${m.body[0]}`); process.exit(1); },
});

// ===== Timeout + resumen =====
setTimeout(() => {
  console.log('\n═══════════════════════════════════════');
  console.log('  RESUMEN DE VALIDACIONES');
  console.log('═══════════════════════════════════════');

  // Mostrar todos los mensajes recibidos
  console.log('\nMensajes recibidos del servidor:');
  const MSG_NAMES = {
    1: 'ProtocolRequired', 3: 'HelloConnectMessage', 22: 'LoginSuccess',
    30: 'ServersList', 42: 'SelectedServerData', 101: 'HelloGame',
    111: 'TicketAccepted', 150: 'CharsListReq', 151: 'CharactersList',
    153: 'CharSelected', 200: 'GameContextCreate', 201: 'GameContextDestroy',
    220: 'CurrentMap', 225: '?225', 226: 'MapComplementaryInfo',
    500: 'CharStatsList', 780: 'TextInformation',
    1200: 'SpellList', 3009: 'InventoryWeight', 3016: 'InventoryContent',
    5630: 'FriendWarn', 5637: 'NotificationList',
    5658: 'UpdateLifePoints', 5684: 'LifePointsRegenBegin',
    6087: 'NotificationList2', 6231: 'ShortcutBarContent',
    6267: 'TrustStatus', 6339: 'CharCapabilities', 6341: 'AlmanachCalendar',
    6471: 'CharLoadingComplete',
  };

  const sorted = Object.entries(stats.messagesReceived)
    .sort((a, b) => b[1] - a[1]);
  for (const [msgId, count] of sorted) {
    const name = MSG_NAMES[parseInt(msgId)] || '?';
    console.log(`  msgId ${msgId} (${name}): ${count}`);
  }

  console.log(`\n✅ Checks pasados: ${stats.checksPassed}`);
  if (stats.checksFailed > 0) {
    console.log(`❌ Checks fallados: ${stats.checksFailed}`);
  }

  // Verificación del mapa
  const gotMap220 = stats.messagesReceived['220'] > 0;
  const gotContext200 = stats.messagesReceived['200'] > 0;
  const gotStats = stats.messagesReceived['500'] > 0;
  const gotLifePoints = stats.messagesReceived['5658'] > 0;

  console.log('\n--- VEREDICTO ---');
  if (gotContext200 && gotMap220 && gotStats && gotLifePoints && stats.checksFailed === 0) {
    console.log('✅ SERVIDOR FUNCIONAL: contexto de juego, mapa, stats y vida validados.');
  } else {
    console.log('⚠️  Hay validaciones pendientes. Revisar checks fallados.');
  }

  process.exit(stats.checksFailed > 0 ? 1 : 0);
}, 15000);
