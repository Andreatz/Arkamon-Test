import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

// This test server serves the exact desktop output with the configured policy.
// It is not bundled, is loopback-only, and never handles a real user profile.
const root = path.resolve(process.argv[2] ?? 'dist-desktop')
const resourceRoot = path.resolve('dist-desktop-resources')
const port = Number(process.env.ARKAMON_DESKTOP_TEST_PORT ?? 3019)
const config = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
const csp = Object.entries(config.app.security.csp).map(([key, value]) => `${key} ${Array.isArray(value) ? value.join(' ') : value}`).join('; ')
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' }
const server = http.createServer(async (request, response) => {
  response.setHeader('Content-Security-Policy', csp)
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Cache-Control', 'no-store')
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname)
    let file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!file.startsWith(root + path.sep)) { response.writeHead(404); response.end(); return }
    try { if (!(await stat(file)).isFile()) throw new Error('not a file') }
    catch {
      // Mirror the native same-origin resource handler. The frontend remains
      // the exact small embedded output; no files are copied back for tests.
      file = path.resolve(resourceRoot, '.' + pathname)
      if (!file.startsWith(resourceRoot + path.sep) || !(await stat(file)).isFile()) { response.writeHead(404); response.end(); return }
    }
    response.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream')
    response.end(await readFile(file))
  } catch { response.writeHead(404); response.end() }
})
server.listen(port, '127.0.0.1', () => console.log(`Desktop verification: http://127.0.0.1:${port}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)))
