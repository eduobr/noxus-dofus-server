const net = require('net');

function serVersion(major, minor, release, revision, patch, buildType) {
  const b = Buffer.alloc(11);
  b.writeUInt8(major, 0); b.writeUInt8(minor, 1); b.writeUInt8(release, 2);
  b.writeInt32BE(revision, 3); b.writeUInt8(patch, 7); b.writeUInt8(buildType, 8);
  b.writeUInt8(0, 9); b.writeUInt8(0, 10);
  return b;
}

function serUTF(str) {
  const utf = Buffer.from(str, 'utf8');
  const b = Buffer.alloc(2 + utf.length);
  b.writeUInt16BE(utf.length, 0);
  utf.copy(b, 2);
  return b;
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

function sendMsg(s, msgId, body) {
  const bodyLen = body.length;
  let typeLen = bodyLen > 65535 ? 3 : bodyLen > 255 ? 2 : bodyLen > 0 ? 1 : 0;
  const hdr = Buffer.alloc(2 + typeLen);
  hdr.writeUInt16BE((msgId << 2) | typeLen, 0);
  if (typeLen === 1) hdr.writeUInt8(bodyLen, 2);
  else if (typeLen === 2) hdr.writeUInt16BE(bodyLen, 2);
  else if (typeLen === 3) { hdr.writeUInt8((bodyLen >> 16) & 0xFF, 2); hdr.writeUInt16BE(bodyLen & 0xFFFF, 3); }
  s.write(bodyLen > 0 ? Buffer.concat([hdr, body]) : hdr);
}

const s = net.createConnection({host:'127.0.0.1',port:443}, () => {
  let buf = Buffer.alloc(0);
  let sent = false;
  s.on('data', d => {
    buf = Buffer.concat([buf,d]);
    while (buf.length >= 2) {
      const hdr = buf.readUInt16BE(0);
      const msgId = hdr >> 2;
      const typeLen = hdr & 3;
      const hdrSize = 2 + typeLen;
      if (buf.length < hdrSize) break;
      let bodyLen = 0;
      if (typeLen === 1) bodyLen = buf[2];
      else if (typeLen === 2) bodyLen = buf.readUInt16BE(2);
      else if (typeLen === 3) bodyLen = (buf[2]<<16)|(buf[3]<<8)|buf[4];
      const total = hdrSize + bodyLen;
      if (buf.length < total) break;
      const body = buf.slice(hdrSize, total);
      console.log('RECV msgId=' + msgId + ' bodyLen=' + bodyLen);
      // Decode specific messages
      if (msgId === 22)
        console.log('  FAIL reason=' + body[0] + ' (2=wrong creds, 3=banned)');
      if (msgId === 21) // Success
        console.log('  SUCCESS');
      if (msgId === 30) { // ServersList
        const srvCount = body.readUInt16BE(0);
        console.log('  ServersList: ' + srvCount + ' servers');
      }
      buf = buf.slice(total);
    }
    if (!sent) {
      sent = true;
      setTimeout(() => {
        const flags = Buffer.from([0x00]);
        const version = serVersion(2, 39, 0, 0, 0, 0);
        const lang = serUTF('test@test');
        const credLen = serVarShort(0);
        const body = Buffer.concat([flags, version, lang, credLen]);
        console.log('SEND Identification body=' + body.toString('hex'));
        sendMsg(s, 4, body);
      }, 200);
    }
  });
});

setTimeout(() => process.exit(0), 8000);
