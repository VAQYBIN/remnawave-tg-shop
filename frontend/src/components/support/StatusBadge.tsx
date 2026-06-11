import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import type { TicketStatus } from '@/api/support'
import { STATUS_KEY, STATUS_VARIANT } from './supportMeta'

export function StatusBadge({ status }: { status: TicketStatus }) {
  const { t } = useTranslation()
  return <Badge variant={STATUS_VARIANT[status]}>{t(STATUS_KEY[status])}</Badge>
}
