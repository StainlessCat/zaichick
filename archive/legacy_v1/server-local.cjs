const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, execSync } = require('child_process');

const ROOT_DIR = __dirname;
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const PREBUILT_DIR = path.join(ROOT_DIR, 'prebuilt');
const DEFAULT_PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv; charset=utf-8',
};

function resolveStaticRoot() {
  if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    return DIST_DIR;
  }
  if (fs.existsSync(path.join(PREBUILT_DIR, 'index.html'))) {
    return PREBUILT_DIR;
  }

  console.log('[1/2] Папка готовой сборки не найдена. Выполняется сборка приложения...');
  try {
    const viteBin = path.join(
      ROOT_DIR,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'vite.cmd' : 'vite'
    );
    if (!fs.existsSync(viteBin)) {
      console.log('Установка пакетов (npm install --legacy-peer-deps)...');
      execSync('npm install --legacy-peer-deps --no-audit --no-fund', {
        cwd: ROOT_DIR,
        stdio: 'inherit',
      });
    }
    execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });
    if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
      return DIST_DIR;
    }
    return null;
  } catch (err) {
    console.error('[ОШИБКА] Не удалось собрать приложение:', err.message);
    return null;
  }
}

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

function openBrowser(url) {
  if (process.env.NO_OPEN_BROWSER === '1') return;
  if (process.platform === 'win32') {
    exec(`start "" "${url}"`);
  } else if (process.platform === 'darwin') {
    exec(`open "${url}"`);
  } else {
    exec(`xdg-open "${url}"`);
  }
}

function createStaticServer(staticRoot) {
  return http.createServer((req, res) => {
    try {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      const decodedPathname = decodeURIComponent(parsedUrl.pathname);
      const safeRelPath = path.normalize(decodedPathname).replace(/^(\.\.[/\\])+/, '');

      let filePath = path.join(staticRoot, safeRelPath);

      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      if (!fs.existsSync(filePath)) {
        const publicFallback = path.join(ROOT_DIR, 'public', safeRelPath);
        if (fs.existsSync(publicFallback) && fs.statSync(publicFallback).isFile()) {
          filePath = publicFallback;
        } else {
          filePath = path.join(staticRoot, 'index.html');
        }
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      });

      const stream = fs.createReadStream(filePath);
      stream.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        }
        res.end('Internal Server Error');
      });
      stream.pipe(res);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Server Error');
    }
  });
}

function startServer(staticRoot, port) {
  const server = createStaticServer(staticRoot);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < DEFAULT_PORT + 10) {
      console.log(`Порт ${port} уже занят, переключаемся на порт ${port + 1}...`);
      startServer(staticRoot, port + 1);
    } else {
      console.error('[ОШИБКА СЕРВЕРА]:', err.message);
      process.exit(1);
    }
  });

  server.listen(port, '0.0.0.0', () => {
    const localUrl = `http://localhost:${port}`;
    const lanIps = getLocalIpAddresses();

    console.log('============================================================================');
    console.log('  СИСТЕМА АВТОМАТИЗАЦИИ СВАРОЧНОГО ПРОИЗВОДСТВА «ZAYCHICK»');
    console.log('  Сервер успешно запущен и готов к работе!');
    console.log('============================================================================');
    console.log('');
    console.log(`  Локальный адрес (на этом ПК):   ${localUrl}`);
    if (lanIps.length > 0) {
      console.log('  Доступ для коллег по локальной сети (Wi-Fi / LAN):');
      lanIps.forEach((ip) => {
        console.log(`                                  http://${ip}:${port}`);
      });
    }
    console.log('');
    console.log('  Для остановки программы закройте это окно или нажмите Ctrl+C.');
    console.log('============================================================================');

    openBrowser(localUrl);
  });
}

const staticRoot = resolveStaticRoot();
if (staticRoot) {
  startServer(staticRoot, DEFAULT_PORT);
} else {
  process.exit(1);
}
