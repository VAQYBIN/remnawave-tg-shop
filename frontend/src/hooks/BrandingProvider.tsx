import { createContext, useContext } from 'react'
import { useBranding } from './useBranding'
import type { PublicBrandingResponse } from '@/api/admin/branding'

interface BrandingContextValue {
  branding: PublicBrandingResponse | undefined
  newsEnabled: boolean
  referralEnabled: boolean
  devicesEnabled: boolean
  supportEnabled: boolean
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: undefined,
  newsEnabled: true,
  referralEnabled: true,
  devicesEnabled: true,
  supportEnabled: true,
})

export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const branding = useBranding()

  const value: BrandingContextValue = {
    branding,
    newsEnabled: branding?.news_enabled ?? true,
    referralEnabled: branding?.referral_enabled ?? true,
    devicesEnabled: branding?.devices_enabled ?? true,
    supportEnabled: branding?.support_enabled ?? true,
  }

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

export function useBrandingContext() {
  return useContext(BrandingContext)
}
