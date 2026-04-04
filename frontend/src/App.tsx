import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/auth/AuthProvider'
import { ProtectedRoute } from '@/auth/ProtectedRoute'
import { AdminRoute } from '@/auth/AdminRoute'
import { ToastProvider } from '@/lib/toast-context'
import { Toaster } from '@/components/ui/toaster'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { BrandingProvider } from '@/hooks/BrandingProvider'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { SubscriptionPage } from '@/pages/SubscriptionPage'
import { PaymentHistoryPage } from '@/pages/PaymentHistoryPage'
import { PaymentCallbackPage } from '@/pages/PaymentCallbackPage'
import { TelegramCallbackPage } from '@/pages/TelegramCallbackPage'
import { ReferralPage } from '@/pages/ReferralPage'
import { DevicesPage } from '@/pages/DevicesPage'
import { ProfilePage } from '@/pages/ProfilePage'
import { NewsPage } from '@/pages/NewsPage'
import { AdminLayout } from '@/pages/admin/AdminLayout'
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage'
import { BrandingPage } from '@/pages/admin/BrandingPage'
import { FeaturesPage } from '@/pages/admin/FeaturesPage'

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Toaster />
        <AuthProvider>
          <BrandingProvider>
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
            </Route>

              {/* Default redirect */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrandingProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
