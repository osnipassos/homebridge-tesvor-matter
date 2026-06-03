/**
 * Script de diagnóstico — testa diferentes formas de autenticar no WebSocket WeBack
 * Uso: node test-websocket.mjs <username> <password> <country> [appName]
 * Exemplo: node test-websocket.mjs osni@email.com senha123 0055 WeBack
 */

import crypto from 'crypto';
import WebSocket from 'ws';

const [,, username, password, country, appName = 'WeBack'] = process.argv;

if (!username || !password || !country) {
  console.error('Uso: node test-websocket.mjs <username> <password> <country> [appName]');
  process.exit(1);
}

async function auth() {
  const payload = {
    payload: {
      opt: 'login',
      pwd: crypto.createHash('md5').update(password).digest('hex'),
    },
    header: {
      language: 'de',
      app_name: appName,
      calling_code: country,
      api_version: '1.0',
      account: username,
      client_id: 'yugong_app',
    },
  };

  const res = await fetch('https://user.grit-cloud.com/oauth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json();
  if (body.msg !== 'success') throw new Error('Auth falhou: ' + JSON.stringify(body));
  console.log('✅ Auth OK — region:', body.data.region_name);
  return body;
}

function testWs(label, url, headers) {
  return new Promise((resolve) => {
    console.log(`\n🔌 Testando [${label}]...`);
    console.log('   Headers:', JSON.stringify(headers, null, 2));

    const ws = new WebSocket(url, undefined, { headers, handshakeTimeout: 8000 });

    const timeout = setTimeout(() => {
      ws.terminate();
      console.log(`   ⏱ Timeout`);
      resolve({ label, result: 'timeout' });
    }, 9000);

    ws.on('open', () => {
      clearTimeout(timeout);
      console.log(`   ✅ CONECTOU!`);
      ws.close();
      resolve({ label, result: 'success' });
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      console.log(`   ❌ Erro: ${err.message}`);
      resolve({ label, result: 'error', message: err.message });
    });

    ws.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 1000) console.log(`   🔒 Fechou com código: ${code}`);
    });
  });
}

async function run() {
  console.log('=== Diagnóstico WeBack WebSocket ===\n');
  const data = await auth();
  const { jwt_token, region_name, wss_url } = data.data;

  console.log('WSS URL:', wss_url);
  console.log('Region:', region_name);

  const results = [];

  // Teste 1: headers originais (código antigo)
  results.push(await testWs('Original (Basic null:null)', wss_url, {
    Authorization: 'Basic KG51bGwpOihudWxsKQ==',
    region: region_name,
    token: jwt_token,
    Connection: 'keep-alive, Upgrade',
  }));

  // Teste 2: sem Authorization
  results.push(await testWs('Sem Authorization', wss_url, {
    region: region_name,
    token: jwt_token,
    Connection: 'keep-alive, Upgrade',
  }));

  // Teste 3: Bearer token
  results.push(await testWs('Authorization Bearer', wss_url, {
    Authorization: `Bearer ${jwt_token}`,
    region: region_name,
    Connection: 'keep-alive, Upgrade',
  }));

  // Teste 4: token como Authorization Bearer sem header token
  results.push(await testWs('Apenas Bearer, sem token header', wss_url, {
    Authorization: `Bearer ${jwt_token}`,
    region: region_name,
  }));

  // Teste 5: sem headers extras
  results.push(await testWs('Sem nenhum header', wss_url, {}));

  // Teste 6: token no header x-auth-token
  results.push(await testWs('x-auth-token', wss_url, {
    'x-auth-token': jwt_token,
    region: region_name,
  }));

  console.log('\n=== RESUMO ===');
  results.forEach(r => {
    const icon = r.result === 'success' ? '✅' : r.result === 'timeout' ? '⏱' : '❌';
    console.log(`${icon} [${r.label}]: ${r.result}${r.message ? ' — ' + r.message : ''}`);
  });
}

run().catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
