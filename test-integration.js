// test-integration.js — corre server y cliente juntos
const { spawn } = require('child_process');
const path = require('path');

const serverProc = spawn(process.execPath, [path.join(__dirname, 'dist/app.js')], {
  cwd: __dirname,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: Object.assign({}, process.env, { PATH: '/home/enoh/.nvm/versions/node/v8.17.0/bin:' + process.env.PATH })
});

let serverOut = '';
serverProc.stdout.on('data', d => { serverOut += d; });
serverProc.stderr.on('data', d => { serverOut += d; });

// Esperar a que arranque
setTimeout(() => {
  console.log('=== Server output ===');
  console.log(serverOut.slice(-500));
  serverOut = '';
  
  // Lanzar cliente
  const clientProc = spawn(process.execPath, [path.join(__dirname, 'client-test.js')], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { PATH: '/home/enoh/.nvm/versions/node/v8.17.0/bin:' + process.env.PATH })
  });
  
  let clientOut = '';
  clientProc.stdout.on('data', d => { clientOut += d; });
  clientProc.stderr.on('data', d => { clientOut += d; });
  
  setTimeout(() => {
    console.log('=== Client output ===');
    console.log(clientOut);
    
    setTimeout(() => {
      console.log('=== Server output (after client) ===');
      console.log(serverOut.slice(-800));
      serverProc.kill();
      clientProc.kill();
      process.exit(0);
    }, 3000);
  }, 5000);
}, 10000);
