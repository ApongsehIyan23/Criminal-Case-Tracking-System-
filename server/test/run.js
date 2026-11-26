// Runs the tests against a disposable database, never the Neon one.
// By default a temporary local PostgreSQL cluster is created and removed afterwards.
// Set TEST_DATABASE_URL (a local database with "test" in its name) to use your own.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const exe = (name) => (process.platform === 'win32' ? `${name}.exe` : name);

function findPgBin() {
  const candidates = [process.env.PG_BIN, ...(process.env.PATH || '').split(path.delimiter)];
  for (const root of ['C:\\Program Files\\PostgreSQL', '/usr/lib/postgresql']) {
    if (fs.existsSync(root)) {
      const versions = fs.readdirSync(root).sort((a, b) => Number(b) - Number(a));
      candidates.push(...versions.map((v) => path.join(root, v, 'bin')));
    }
  }
  return candidates.find((dir) => dir && fs.existsSync(path.join(dir, exe('initdb'))));
}

const freePort = () => new Promise((resolve) => {
  const server = net.createServer().listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});

async function startCluster() {
  const bin = findPgBin();
  if (!bin) throw new Error('PostgreSQL binaries not found. Set PG_BIN or TEST_DATABASE_URL.');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ccts-pg-'));
  const data = path.join(root, 'data');
  const run = (name, args) => {
    // Output is ignored for pg_ctl because the server would keep the pipe open on Windows.
    const result = spawnSync(path.join(bin, exe(name)), args, { stdio: 'ignore' });
    if (result.status !== 0) throw new Error(`${name} failed (exit ${result.status}). See ${root}`);
  };
  run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8']);
  const port = await freePort();
  run('pg_ctl', ['-D', data, '-l', path.join(root, 'postgres.log'), '-w',
    '-o', `-p ${port} -c listen_addresses=127.0.0.1`, 'start']);
  run('psql', ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-c', 'CREATE DATABASE ccts_test']);
  return {
    url: `postgresql://postgres@127.0.0.1:${port}/ccts_test`,
    stop() {
      run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

async function main() {
  let cluster = null;
  let url = process.env.TEST_DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    // The tests drop the schema, so refuse anything that is not a local test database.
    if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || !parsed.pathname.includes('test')) {
      throw new Error('TEST_DATABASE_URL must point to a local database with "test" in its name.');
    }
  } else {
    cluster = await startCluster();
    url = cluster.url;
  }

  const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js')).map((f) => path.join(__dirname, f));
  const code = await new Promise((resolve) => {
    spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], {
      stdio: 'inherit',
      env: { ...process.env, TEST_DATABASE_URL: url },
    }).on('close', resolve);
  });
  cluster?.stop();
  process.exit(code);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
