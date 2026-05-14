const net = require('net');
let ticket = '';

function parseMsg(buf) {
  if (buf.length < 2) return null;
  const hdr = buf.readUInt16BE(0), msgId = hdr >> 2, typeLen = hdr & 3, hdrSize = 2+typeLen;
  if (buf.length < hdrSize) return null;
  let bl = 0;
  if (typeLen===1) bl=buf[2]; else if (typeLen===2) bl=buf.readUInt16BE(2); else if (typeLen===3) bl=(buf[2]<<16)|(buf[3]<<8)|buf[4];
  if (buf.length < hdrSize+bl) return null;
  return {msgId, body: buf.slice(hdrSize, hdrSize+bl), total: hdrSize+bl};
}

function serUTF(s) { const b=Buffer.alloc(2+s.length); b.writeUInt16BE(s.length,0); Buffer.from(s).copy(b,2); return b; }

const auth = net.createConnection({host:'127.0.0.1',port:443}, () => {
  let buf = Buffer.alloc(0), sentId=false, sentSS=false;
  auth.on('data', d => {
    buf = Buffer.concat([buf,d]);
    let m;
    while ((m = parseMsg(buf))) {
      buf = buf.slice(m.total);
      console.log('AUTH ← msgId=' + m.msgId + ' bodyLen=' + m.body.length);

      if (m.msgId === 3 && !sentId) {
        sentId = true;
        const ver = Buffer.alloc(11); ver.writeUInt8(2,0); ver.writeUInt8(39,1);
        const body = Buffer.concat([Buffer.from([0x00]), ver, serUTF('test@test'), Buffer.from([0x00])]);
        const h = Buffer.alloc(3); h.writeUInt16BE((4<<2)|1,0); h.writeUInt8(body.length,2);
        auth.write(Buffer.concat([h, body]));
        console.log('AUTH → Identification');
      }
      if (m.msgId === 30 && !sentSS) {
        sentSS = true;
        const h = Buffer.alloc(3); h.writeUInt16BE((40<<2)|1,0); h.writeUInt8(1,2);
        auth.write(Buffer.concat([h, Buffer.from([0x01])]));
        console.log('AUTH → ServerSelection');
      }
      if (m.msgId === 42) {
        // ServerId(varShort=1) + host(UTF="127.0.0.1"=11) + port(short=2) + canCreate(bool=1) + ticket(UTF=86)
        // ticket UTF: [2B len=84][84B hex]
        ticket = m.body.slice(1+11+2+1+2, 1+11+2+1+2+84).toString();
        console.log('TICKET=' + ticket.substring(0,20) + '... len=' + ticket.length);
        auth.end();
        setTimeout(connectWorld, 300);
      }
    }
  });
});

function connectWorld() {
  console.log('\n--- WORLD ---');
  const world = net.createConnection({host:'127.0.0.1',port:5556}, () => {
    let buf = Buffer.alloc(0), sentTicket=false;
    world.on('data', d => {
      buf = Buffer.concat([buf,d]);
      let m;
      while ((m = parseMsg(buf))) {
        buf = buf.slice(m.total);
        console.log('WORLD ← msgId=' + m.msgId + ' bodyLen=' + m.body.length);

        if (m.msgId === 101 && !sentTicket) {
          sentTicket = true;
          const body = Buffer.concat([serUTF('fr'), serUTF(ticket)]);
          const h = Buffer.alloc(3); h.writeUInt16BE((110<<2)|1,0); h.writeUInt8(body.length,2);
          world.write(Buffer.concat([h, body]));
          console.log('WORLD → AuthenticationTicket');
        }
      }
    });
  });
}

setTimeout(() => process.exit(0), 10000);
