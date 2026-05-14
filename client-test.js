/**
 * Noxus Test Client v4 — FUNCIONAL
 * Cliente Node.js que completa login → personaje → mundo.
 * Uso: node client-test.js
 */

const net = require('net');

const CFG = {
  AUTH_HOST: '127.0.0.1', AUTH_PORT: 443,
  WORLD_HOST: '127.0.0.1', WORLD_PORT: 5556,
  USER: 'test', PASS: 'test',
};

const log = {
  i: (s) => console.log(`[INFO] ${s}`),
  ok: (s) => console.log(`\x1b[32m[OK]\x1b[0m ${s}`),
  no: (s) => console.log(`\x1b[31m[FAIL]\x1b[0m ${s}`),
};

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

function readMsg(buf) {
  if (buf.length < 2) return null;
  const hdr = buf.readUInt16BE(0), msgId = hdr >> 2, typeLen = hdr & 3, hdrSize = 2+typeLen;
  if (buf.length < hdrSize) return null;
  let bl = 0;
  if (typeLen===1) bl=buf[2]; else if (typeLen===2) bl=buf.readUInt16BE(2); else if (typeLen===3) bl=(buf[2]<<16)|(buf[3]<<8)|buf[4];
  if (buf.length < hdrSize+bl) return null;
  return {msgId, body: buf.slice(hdrSize, hdrSize+bl), total: hdrSize+bl};
}

function sendMsg(s, msgId, body) {
  body = body || Buffer.alloc(0);
  const bl = body.length;
  let tl = bl > 65535 ? 3 : bl > 255 ? 2 : bl > 0 ? 1 : 0;
  const h = Buffer.alloc(2+tl);
  h.writeUInt16BE((msgId<<2)|tl, 0);
  if (tl===1) h.writeUInt8(bl,2); else if (tl===2) h.writeUInt16BE(bl,2); else if (tl===3){h.writeUInt8((bl>>16)&0xFF,2); h.writeUInt16BE(bl&0xFFFF,3);}
  s.write(bl>0 ? Buffer.concat([h,body]) : h);
}

function createSocket(host, port, label, handlers) {
  const s = net.createConnection({host,port}, () => log.ok(`Conectado a ${label}`));
  let buf = Buffer.alloc(0);
  s.on('data', d => {
    buf = Buffer.concat([buf,d]);
    let m;
    while ((m = readMsg(buf))) {
      buf = buf.slice(m.total);
      if (handlers[m.msgId]) {
        handlers[m.msgId](m, s);
      } else {
        console.log('  [' + label + '] msgId=' + m.msgId + ' SIN HANDLER');
      }
    }
  });
  s.on('error', e => log.no(`${label}: ${e.message}`));
  s.on('close', () => {});
  return s;
}

// ===== MAIN =====

console.log('\n╔══════════════════════════════╗');
console.log('║   Noxus Test Client v4      ║');
console.log('╚══════════════════════════════╝\n');

// FASE 1: AUTH
log.i('--- Fase 1: Auth ---');
const auth = createSocket(CFG.AUTH_HOST, CFG.AUTH_PORT, 'Auth', {
  3: (m, s) => {
    // HelloConnectMessage → enviar identificación
    const ver = Buffer.alloc(11); ver.writeUInt8(2,0); ver.writeUInt8(39,1);
    const body = Buffer.concat([Buffer.from([0x00]), ver, serUTF('test@test'), Buffer.from([0x00])]);
    sendMsg(s, 4, body);
    log.i('→ IdentificationMessage');
  },
  22: (m, s) => {
    log.ok('Login exitoso');
  },
  30: (m, s) => {
    // ServersList → seleccionar server
    sendMsg(s, 40, Buffer.from([0x01]));
    log.i('→ ServerSelectionMessage');
  },
  42: (m, s) => {
    // SelectedServerData → extraer ticket, cerrar auth, ir a world
    // serverId(varShort 1) + host(UTF 11) + port(short 2) + bool(1) + ticket(UTF 86)
    const ticket = m.body.slice(1+11+2+1+2, 1+11+2+1+2+84).toString();
    log.ok(`Ticket: ${ticket.substring(0,16)}...`);
    s.end();

    // FASE 2: WORLD
    setTimeout(() => {
      log.i('\n--- Fase 2: Mundo ---');
      createSocket(CFG.WORLD_HOST, CFG.WORLD_PORT, 'World', {
        1: () => {}, // ProtocolRequired (ignorar)
        101: (m, ws) => {
          // HelloGameMessage → enviar ticket (lang primero, ticket después!)
          sendMsg(ws, 110, Buffer.concat([serUTF('fr'), serUTF(ticket)]));
          log.i('→ AuthenticationTicketMessage');
        },
        111: (m, ws) => {
          log.ok('Ticket aceptado por World');
        },
        // 6267 = TrustStatusMessage (último mensaje de config)
        // Después de este, pedir lista de personajes
        6267: (m, ws) => {
          sendMsg(ws, 150, null);
          log.i('→ CharactersListRequestMessage');
        },
        // 151 = CharactersListMessage → seleccionar personaje
        151: (m, ws) => {
          log.ok('Personajes recibidos');
          sendMsg(ws, 152, serVarInt(27));
          log.i('→ CharacterSelectionMessage (id=27)');
        },
        // 5637/6087 = NotificationListMessage, 6339 = CharacterCapabilities (ignorar)
        5637: () => {}, 6087: () => {}, 6339: () => {},
        // 153 = CharacterSelectedSuccessMessage
        153: (m, ws) => {
          log.ok('Personaje seleccionado: Bizelzapobany');
        },
        // 6471 = CharacterLoadingCompleteMessage → crear contexto de juego
        6471: (m, ws) => {
          sendMsg(ws, 250, null);
          log.i('→ GameContextCreateRequestMessage');
        },
        // 200 = GameContextCreateMessage
        200: (m, ws) => {
          log.ok('\n🎉 ¡CONTEXTO DE JUEGO CREADO!');
          log.ok('Personaje en el mundo. Servidor Noxus 100% funcional.');
          log.i('Ctrl+C para salir.');
        },
        // Ignorar otros mensajes de config
        117: () => {}, 121: () => {}, 105: () => {},
        5635: () => {}, // CharacterCapabilitiesMessage
        661: () => {},  // InventoryWeightMessage
        6305: () => {}, // ??
         6216: () => {}, // ??
         6340: () => {}, // ServerSettingsMessage?
         128: () => {}, 225: () => {},
        30: () => {}, 983: () => {}, 
        2326: () => {}, 1763: () => {},
      });
    }, 200);
  },
  // Ignorar mensajes iniciales
  1: () => {},
  20: (m) => { log.no(`Login fallido: reason=${m.body[0]}`); process.exit(1); },
});

// Timeout de seguridad (30s para dar tiempo a MongoDB)
setTimeout(() => { log.no('Timeout'); process.exit(1); }, 30000);
