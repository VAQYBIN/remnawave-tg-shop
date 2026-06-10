import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getConnection } from '@/api/subscription'
import { useToast } from '@/hooks/useToast'
import { Copy, Check, QrCode, X } from 'lucide-react'

export function ConnectionLinkCard() {
  const { t } = useTranslation()
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)

  const { data: connection, isLoading, refetch } = useQuery({
    queryKey: ['connection'],
    queryFn: getConnection,
  })

  const link = connection?.link ?? ''

  const handleCopy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    toast.success(t('copied'))
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base">{t('dashboard_connect_title')}</CardTitle>
            <CardDescription>{t('dashboard_connect_desc')}</CardDescription>
          </div>
          <Badge variant="info" className="shrink-0">VLESS · TLS</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="h-12 animate-pulse rounded-[var(--radius)] bg-[hsl(var(--muted))]" />
        ) : link ? (
          <>
            <code className="block w-full break-all rounded-[var(--radius)] bg-[hsl(var(--muted))] p-3 font-mono text-xs leading-relaxed text-[hsl(var(--foreground))]">
              {link}
            </code>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleCopy}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {t('dashboard_connect_copy')}
              </Button>
              <Button variant="outline" onClick={() => setQrOpen(true)}>
                <QrCode size={16} />
                {t('dashboard_connect_qr')}
              </Button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{t('dashboard_connect_empty')}</p>
            <Button variant="outline" onClick={() => refetch()}>
              {t('dashboard_connect_get')}
            </Button>
          </div>
        )}
      </CardContent>

      {qrOpen &&
        createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center px-4">
            <div className="absolute inset-0 z-0 bg-black/50" onClick={() => setQrOpen(false)} />
            <div className="relative z-10 w-full max-w-sm rounded-2xl bg-[hsl(var(--card))] p-6 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-[hsl(var(--foreground))]">{t('dashboard_qr_title')}</h2>
                  <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{t('dashboard_qr_desc')}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setQrOpen(false)}
                  className="shrink-0 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                  aria-label={t('dashboard_qr_close')}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="mt-5 flex justify-center">
                <div className="rounded-xl border border-[hsl(var(--border))] bg-white p-4">
                  <QRCodeSVG value={link} size={220} level="M" />
                </div>
              </div>
              <Button variant="outline" className="mt-5 w-full" onClick={() => setQrOpen(false)}>
                {t('dashboard_qr_close')}
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </Card>
  )
}
