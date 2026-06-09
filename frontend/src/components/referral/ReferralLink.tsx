import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Copy, Check, Link } from 'lucide-react'

interface ReferralLinkProps {
  referralCode: string
  referralLink: string
}

export function ReferralLink({ referralCode, referralLink }: ReferralLinkProps) {
  const { t } = useTranslation()
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  const copyToClipboard = async (text: string, type: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'link') {
        setCopiedLink(true)
        setTimeout(() => setCopiedLink(false), 2000)
      } else {
        setCopiedCode(true)
        setTimeout(() => setCopiedCode(false), 2000)
      }
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link size={18} className="text-[hsl(var(--primary))]" />
          {t('referral_your_link')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{t('referral_link_label')}</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 bg-[hsl(var(--muted))] rounded-lg px-3 py-2 text-sm font-mono truncate">
              {referralLink}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard(referralLink, 'link')}
              className="shrink-0"
            >
              {copiedLink ? <Check size={15} className="text-[var(--success)]" /> : <Copy size={15} />}
            </Button>
          </div>
        </div>

        <div>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{t('referral_code_label')}</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-[hsl(var(--muted))] rounded-lg px-3 py-2 text-sm font-mono font-bold tracking-widest">
              {referralCode}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => copyToClipboard(referralCode, 'code')}
              className="shrink-0"
            >
              {copiedCode ? <Check size={15} className="text-[var(--success)]" /> : <Copy size={15} />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
