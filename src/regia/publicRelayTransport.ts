import type { PublicSnapshot } from './publicSnapshot'
import { createPublicImagePublisher } from './publicMedia'

export interface PublicRelayConfiguration { origin: string; token: string; mode: 'publish' | 'viewer' }
export function publicRelayConfiguration(mode: 'publish' | 'viewer', location = window.location): PublicRelayConfiguration | null {
  const params = new URLSearchParams(location.hash.slice(1))
  const address = params.get('publicRelay'), token = params.get(mode)
  if (location.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(location.hostname)
    || !address || !/^127\.0\.0\.1:[0-9]{4,5}$/.test(address) || !token || !/^[a-f0-9]{64}$/.test(token)) return null
  const port = Number(address.split(':')[1])
  return port >= 1024 && port <= 65535 ? { origin: `http://${address}`, token, mode } : null
}

/** At most one request and one newer snapshot are kept, including during disconnect. */
export function createPublicRelayPublisher(config: PublicRelayConfiguration) {
  let pending: PublicSnapshot | null = null, running = false, disposed = false
  let request: AbortController | undefined
  const images = createPublicImagePublisher(config)
  const send = async () => {
    if (running || disposed || !pending) return
    running = true
    const value = pending; pending = null
    request = new AbortController()
    const operation = request
    const timeout = setTimeout(() => operation.abort(), 15_000)
    try {
      const publicValue = await images.prepare(value, operation.signal)
      // publish() may have replaced the queue while image loading yielded.
      const newer = pending as PublicSnapshot | null
      if (disposed || newer && newer.at > value.at) return
      const response = await fetch(`${config.origin}/snapshot`, { method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(publicValue), signal: operation.signal })
      if (response.status === 409) images.reset()
      if (!response.ok && !pending && !disposed) pending = value
    } catch { if (!pending && !disposed) pending = value }
    finally { clearTimeout(timeout); running = false }
  }
  const timer = setInterval(() => { void send() }, 250)
  return { publish(value: PublicSnapshot) { pending = value; void send() }, close() { disposed = true; clearInterval(timer); request?.abort(); pending = null; images.close() } }
}

export function subscribePublicRelay(config: PublicRelayConfiguration, receive: (snapshot: PublicSnapshot) => void) {
  const controller = new AbortController()
  let retry: ReturnType<typeof setTimeout> | undefined
  const connect = async () => {
    const connection = new AbortController()
    const abort = () => connection.abort()
    controller.signal.addEventListener('abort', abort, { once: true })
    let watchdog = setTimeout(abort, 8000)
    try {
      const response = await fetch(`${config.origin}/events`, { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: { Authorization: `Bearer ${config.token}` }, signal: connection.signal })
      if (!response.ok || !response.body) throw new Error('Relay unavailable')
      const reader = response.body.getReader(), decoder = new TextDecoder()
      let buffer = ''
      while (!connection.signal.aborted) {
        const chunk = await reader.read()
        if (chunk.done) break
        clearTimeout(watchdog); watchdog = setTimeout(abort, 8000)
        buffer += decoder.decode(chunk.value, { stream: true })
        if (buffer.length > 4 * 1024 * 1024) throw new Error('Relay event exceeds the public snapshot limit')
        let end: number
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const event = buffer.slice(0, end); buffer = buffer.slice(end + 2)
          if (!event.startsWith('data: ')) continue
          try {
            const snapshot = JSON.parse(event.slice(6)) as PublicSnapshot
            if (snapshot.version === 1 && Array.isArray(snapshot.players) && snapshot.players.length === 2 && typeof snapshot.scene === 'string') receive(snapshot)
          } catch { /* Ignore a damaged public event; never mount a game command. */ }
        }
      }
    } catch { /* A local relay can restart independently from the game. */ }
    finally { clearTimeout(watchdog); controller.signal.removeEventListener('abort', abort); connection.abort() }
    if (!controller.signal.aborted) retry = setTimeout(() => { void connect() }, 1000)
  }
  void connect()
  return () => { controller.abort(); clearTimeout(retry) }
}
