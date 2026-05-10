import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Gift, ArrowRight } from 'lucide-react'
import { activateTrial, getTrialEligibility } from '@/api/subscription'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/useToast'

export function TrialBanner() {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()

  const { data: eligibility } = useQuery({
    queryKey: ['trial-eligibility'],
    queryFn: getTrialEligibility,
    staleTime: 60_000,
  })

  const trialMutation = useMutation({
    mutationFn: activateTrial,
    onSuccess: () => {
      toast.success(t('trial_success'))
      qc.invalidateQueries({ queryKey: ['subscription'] })
      qc.invalidateQueries({ queryKey: ['connection'] })
      qc.invalidateQueries({ queryKey: ['trial-eligibility'] })
    },
    onError: (err: Error) => {
      toast.error(err.message || t('trial_error'))
      qc.invalidateQueries({ queryKey: ['trial-eligibility'] })
    },
  })

  if (!eligibility?.eligible) return null

  return (
    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[hsl(var(--primary))] text-white">
            <Gift size={19} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[hsl(var(--foreground))]">
              {t('trial_banner_title', { days: eligibility.trial_days })}
            </p>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              {eligibility.trial_traffic_gb
                ? t('trial_banner_subtitle_limited', { gb: eligibility.trial_traffic_gb })
                : t('trial_banner_subtitle_unlimited')}
            </p>
          </div>
        </div>
        <Button
          className="w-full shrink-0 sm:w-auto"
          onClick={() => trialMutation.mutate()}
          isLoading={trialMutation.isPending}
        >
          {trialMutation.isPending ? t('trial_activating') : t('trial_activate')}
          {!trialMutation.isPending && <ArrowRight size={16} />}
        </Button>
      </div>
    </div>
  )
}
