import { Outlet } from 'react-router-dom'
import { AdminSidebar } from '@/components/admin/AdminSidebar'

export function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-[hsl(var(--background))]">
      <AdminSidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
