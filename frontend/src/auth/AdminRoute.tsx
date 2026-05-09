import { Navigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { getAdminMe } from '@/api/admin'
import { ApiError } from '@/api/client'

interface AdminRouteProps {
  children: React.ReactNode
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { user, isLoading: authLoading } = useAuth()
  const location = useLocation()

  const { data, isLoading: adminLoading, isError } = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: getAdminMe,
    enabled: !!user,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  if (authLoading || (user && adminLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[hsl(var(--primary))] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (isError || !data?.is_admin) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
