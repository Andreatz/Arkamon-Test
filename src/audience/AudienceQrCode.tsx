import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import './audience.css'

export function AudienceQrCode({ url, label = 'Codice QR per votare' }: { url: string; label?: string }) {
  const [image, setImage] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    setImage(null)
    void QRCode.toDataURL(url, { width: 360, margin: 6, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffff' } })
      .then((value) => { if (active) setImage(value) })
      .catch(() => { if (active) setImage(null) })
    return () => { active = false }
  }, [url])
  return image ? <img className="audience-qr-image" src={image} alt={label} width={360} height={360} /> : <p role="status">Preparazione del codice QR…</p>
}

export async function downloadAudienceQr(url: string, filename: string): Promise<void> {
  const image = await QRCode.toDataURL(url, { width: 900, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#111827', light: '#ffffff' } })
  const anchor = document.createElement('a')
  anchor.href = image
  anchor.download = filename
  anchor.click()
}
