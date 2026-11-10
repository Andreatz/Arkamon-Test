import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readdirSync, mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const backend = process.env.ARKAMON_GUEST_BACKEND_CHECKOUT
if (!backend || !path.isAbsolute(backend)) throw new Error('An isolated absolute Arkanight checkout is required')
// Next loads .env files automatically. A sanitized environment alone is insufficient.
if (readdirSync(backend).some(name => /^\.env(?:\..*)?$/.test(name) && name !== '.env.example')) throw new Error('The isolated service must not contain real environment files')
const requireBackend = createRequire(path.join(backend, 'package.json'))
const scratch = mkdtempSync(path.join(os.tmpdir(), 'arkamon-private-service-'))
const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|CI)$/i.test(key)))
const child = spawn(process.execPath, [requireBackend.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3047'], {
  cwd: backend, stdio: 'inherit', env: { ...inherited, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
    ADMIN_PASSWORD: 'local-browser-test-only', ARKAMON_VOTE_LOCAL_STORE: scratch,
    ARKAMON_VOTE_PUBLIC_ORIGIN: 'http://127.0.0.1:3047',
    ARKAMON_HOST_ORIGINS: 'http://127.0.0.1:3047,http://127.0.0.1:3035,http://127.0.0.1:3014' },
})
child.on('exit', code => { rmSync(scratch, { recursive: true, force: true }); process.exit(code ?? 1) })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
