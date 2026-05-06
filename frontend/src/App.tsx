import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { AdminRoute } from '@/auth/AdminRoute'
import { ToastProvider } from '@/lib/toast-context'
import { Toaster } from '@/components/ui/toaster'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { BrandingProvider } from '@/hooks/BrandingProvider'

const LoginPage = lazy(() => import('@/pages/LoginPage').then(({ LoginPage }) => ({ default: LoginPage })))
const RegisterPage = lazy(() => import('@/pages/RegisterPage').then(({ RegisterPage }) => ({ default: RegisterPage })))
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage').then(({ ForgotPasswordPage }) => ({ default: ForgotPasswordPage })))
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(({ DashboardPage }) => ({ default: DashboardPage })))
const SubscriptionPage = lazy(() => import('@/pages/SubscriptionPage').then(({ SubscriptionPage }) => ({ default: SubscriptionPage })))
const PaymentHistoryPage = lazy(() => import('@/pages/PaymentHistoryPage').then(({ PaymentHistoryPage }) => ({ default: PaymentHistoryPage })))
const PaymentCallbackPage = lazy(() => import('@/pages/PaymentCallbackPage').then(({ PaymentCallbackPage }) => ({ default: PaymentCallbackPage })))
const PaymentPendingPage = lazy(() => import('@/pages/PaymentPendingPage').then(({ PaymentPendingPage }) => ({ default: PaymentPendingPage })))
const TelegramCallbackPage = lazy(() => import('@/pages/TelegramCallbackPage').then(({ TelegramCallbackPage }) => ({ default: TelegramCallbackPage })))
const ReferralPage = lazy(() => import('@/pages/ReferralPage').then(({ ReferralPage }) => ({ default: ReferralPage })))
const DevicesPage = lazy(() => import('@/pages/DevicesPage').then(({ DevicesPage }) => ({ default: DevicesPage })))
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then(({ ProfilePage }) => ({ default: ProfilePage })))
const NewsPage = lazy(() => import('@/pages/NewsPage').then(({ NewsPage }) => ({ default: NewsPage })))

const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout').then(({ AdminLayout }) => ({ default: AdminLayout })))
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage').then(({ AdminDashboardPage }) => ({ default: AdminDashboardPage })))
const BrandingPage = lazy(() => import('@/pages/admin/BrandingPage').then(({ BrandingPage }) => ({ default: BrandingPage })))
const FeaturesPage = lazy(() => import('@/pages/admin/FeaturesPage').then(({ FeaturesPage }) => ({ default: FeaturesPage })))
const PlansPage = lazy(() => import('@/pages/admin/PlansPage').then(({ PlansPage }) => ({ default: PlansPage })))
const PaymentProvidersPage = lazy(() => import('@/pages/admin/PaymentProvidersPage').then(({ PaymentProvidersPage }) => ({ default: PaymentProvidersPage })))
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage').then(({ AdminUsersPage }) => ({ default: AdminUsersPage })))
const AdminUserDetailPage = lazy(() => import('@/pages/admin/AdminUserDetailPage').then(({ AdminUserDetailPage }) => ({ default: AdminUserDetailPage })))
const AdminPaymentsPage = lazy(() => import('@/pages/admin/AdminPaymentsPage').then(({ AdminPaymentsPage }) => ({ default: AdminPaymentsPage })))
const AdminPromosPage = lazy(() => import('@/pages/admin/AdminPromosPage').then(({ AdminPromosPage }) => ({ default: AdminPromosPage })))
const PanelStatsPage = lazy(() => import('@/pages/admin/PanelStatsPage').then(({ PanelStatsPage }) => ({ default: PanelStatsPage })))
const NodesPage = lazy(() => import('@/pages/admin/NodesPage').then(({ NodesPage }) => ({ default: NodesPage })))
const NodeDetailPage = lazy(() => import('@/pages/admin/NodeDetailPage').then(({ NodeDetailPage }) => ({ default: NodeDetailPage })))
const PanelUsersPage = lazy(() => import('@/pages/admin/PanelUsersPage').then(({ PanelUsersPage }) => ({ default: PanelUsersPage })))
const PanelUserDetailPage = lazy(() => import('@/pages/admin/PanelUserDetailPage').then(({ PanelUserDetailPage }) => ({ default: PanelUserDetailPage })))
const BroadcastPage = lazy(() => import('@/pages/admin/BroadcastPage').then(({ BroadcastPage }) => ({ default: BroadcastPage })))

function RouteLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] text-sm text-[hsl(var(--muted-foreground))]">
      Загрузка...
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Toaster />
        <AuthProvider>
          <BrandingProvider>
            <Suspense fallback={<RouteLoader />}>
            <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/auth/telegram/callback" element={<TelegramCallbackPage />} />

            {/* Protected */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <ErrorBoundary><DashboardPage /></ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/subscription"
              element={
                <ProtectedRoute>
                  <ErrorBoundary><SubscriptionPage /></ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/payments"
              element={
                <ProtectedRoute>
                  <ErrorBoundary><PaymentHistoryPage /></ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/payment/:paymentId"
              element={
                <ProtectedRoute>
                  <ErrorBoundary><PaymentPendingPage /></ErrorBoundary>
                </ProtectedRoute>
              }
            />
            {/* Legacy callback URL — kept for backwards compat with old return_url */}
            <Route
              path="/payment/callback"
              element={
                <ProtectedRoute>
                  <ErrorBoundary><PaymentCallbackPage /></ErrorBoundary>
                </ProtectedRoute>
              }
            />

            <Route
              path="/referral"
              element={
                <ProtectedRoute>
                  <ErrorBoundary><ReferralPage /></ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/devices"
              element={
                <ProtectedRoute>
                  <ErrorBoundary><DevicesPage /></ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ErrorBoundary><ProfilePage /></ErrorBoundary>
                </ProtectedRoute>
              }
            />
            <Route
              path="/news"
              element={
                <ProtectedRoute>
                  <ErrorBoundary><NewsPage /></ErrorBoundary>
                </ProtectedRoute>
              }
            />

            {/* Admin */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminLayout />
                </AdminRoute>
              }
            >
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<ErrorBoundary><AdminDashboardPage /></ErrorBoundary>} />
              <Route path="branding" element={<ErrorBoundary><BrandingPage /></ErrorBoundary>} />
              <Route path="features" element={<ErrorBoundary><FeaturesPage /></ErrorBoundary>} />
              <Route path="plans" element={<ErrorBoundary><PlansPage /></ErrorBoundary>} />
              <Route path="payment-providers" element={<ErrorBoundary><PaymentProvidersPage /></ErrorBoundary>} />
              <Route path="users" element={<ErrorBoundary><AdminUsersPage /></ErrorBoundary>} />
              <Route path="users/:userId" element={<ErrorBoundary><AdminUserDetailPage /></ErrorBoundary>} />
              <Route path="payments" element={<ErrorBoundary><AdminPaymentsPage /></ErrorBoundary>} />
              <Route path="promos" element={<ErrorBoundary><AdminPromosPage /></ErrorBoundary>} />
              <Route path="broadcast" element={<ErrorBoundary><BroadcastPage /></ErrorBoundary>} />
              <Route path="panel" element={<ErrorBoundary><PanelStatsPage /></ErrorBoundary>} />
              <Route path="panel/users" element={<ErrorBoundary><PanelUsersPage /></ErrorBoundary>} />
              <Route path="panel/users/:uuid" element={<ErrorBoundary><PanelUserDetailPage /></ErrorBoundary>} />
              <Route path="nodes" element={<ErrorBoundary><NodesPage /></ErrorBoundary>} />
              <Route path="nodes/:uuid" element={<ErrorBoundary><NodeDetailPage /></ErrorBoundary>} />
            </Route>

              {/* Default redirect */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
            </Suspense>
          </BrandingProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
