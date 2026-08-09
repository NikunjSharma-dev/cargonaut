import { Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useAuthStore } from '../../store/authStore'
import { Modal } from '../ui'
import { Plus, Search, Package, Truck, User } from 'lucide-react'
import clsx from 'clsx'

const FULL_BLEED_ROUTES = ['/tracking']

const PAGE_TITLES = {
  '/dashboard':   'Operations Overview',
  '/orders':      'Orders & Logistics Requests',
  '/dispatch':    'Dispatch Control Center',
  '/tracking':    'Live Fleet Tracking Ops',
  '/drivers':     'Drivers Management',
  '/driver-view': 'Driver Mobile Terminal',
  '/fleet':       'Fleet Assets & Vehicles',
  '/hubs':        'Hubs & Warehouses',
  '/analytics':   'Fleet Performance & Analytics',
  '/settings':    'System Settings',
}

export default function AppLayout() {
  const location = useLocation()
  const hydrate = useAuthStore(s => s.hydrate)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    hydrate()
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const title = PAGE_TITLES[location.pathname] || 'Cargonaut'
  // Pages that own their full viewport (split panel layouts) get no page padding
  const fullBleed = FULL_BLEED_ROUTES.includes(location.pathname)

  return (
    <div className="flex min-h-screen bg-[var(--bg-app)]">
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onOpenCreateOrder={() => setCreateModalOpen(true)}
        collapsed={navCollapsed}
        onToggleCollapse={() => setNavCollapsed(c => !c)}
      />

      {/* Margin tracks the sidebar width so collapsing does not leave a gap */}
      <div
        className={clsx(
          'flex-1 flex flex-col min-h-screen w-full min-w-0 transition-[margin] duration-200',
          navCollapsed ? 'lg:ml-[var(--nav-collapsed-width)]' : 'lg:ml-[var(--nav-width)]'
        )}
      >
        <TopBar
          title={title}
          onMenuToggle={() => setMobileOpen(prev => !prev)}
          onOpenSearch={() => setSearchModalOpen(true)}
        />
        <main
          className={clsx(
            'flex-1 w-full min-h-0',
            fullBleed
              ? 'lg:h-[calc(100vh-var(--topbar-h))] overflow-hidden'
              : 'overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto'
          )}
        >
          <Outlet context={{ title, openCreateOrder: () => setCreateModalOpen(true) }} />
        </main>
      </div>

      {/* Global Quick Search Modal */}
      <Modal
        open={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        title="Global Fleet Search"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <input
              autoFocus
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input pl-9 text-sm"
              placeholder="Type order #, vehicle registration, driver name..."
            />
          </div>

          <div className="space-y-2 text-xs">
            <p className="font-semibold text-subtle uppercase tracking-wider text-[10px]">Quick Shortcuts</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={() => setSearchModalOpen(false)}
                className="p-2.5 rounded-xl border border-app-border hover:bg-primary-soft hover:border-primary/30 text-left transition-colors flex items-center gap-2"
              >
                <Package size={16} className="text-primary" />
                <div>
                  <p className="font-semibold text-heading">Active Orders</p>
                  <p className="text-[11px] text-muted">View 14 orders</p>
                </div>
              </button>
              <button
                onClick={() => setSearchModalOpen(false)}
                className="p-2.5 rounded-xl border border-app-border hover:bg-primary-soft hover:border-primary/30 text-left transition-colors flex items-center gap-2"
              >
                <Truck size={16} className="text-primary" />
                <div>
                  <p className="font-semibold text-heading">Live Fleet</p>
                  <p className="text-[11px] text-muted">28 vehicles</p>
                </div>
              </button>
              <button
                onClick={() => setSearchModalOpen(false)}
                className="p-2.5 rounded-xl border border-app-border hover:bg-primary-soft hover:border-primary/30 text-left transition-colors flex items-center gap-2"
              >
                <User size={16} className="text-primary" />
                <div>
                  <p className="font-semibold text-heading">Drivers List</p>
                  <p className="text-[11px] text-muted">18 active</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Global Quick Create Order Modal */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create New Shipment / Request"
      >
        <form onSubmit={(e) => { e.preventDefault(); setCreateModalOpen(false); }} className="space-y-4 text-xs">
          <div>
            <label className="font-medium text-body block mb-1">Customer / Organization Name</label>
            <input required className="input" placeholder="e.g. Apex Logistics Ltd" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium text-body block mb-1">Pickup Location</label>
              <input required className="input" placeholder="City or Warehouse Depot" />
            </div>
            <div>
              <label className="font-medium text-body block mb-1">Delivery Destination</label>
              <input required className="input" placeholder="Destination City" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium text-body block mb-1">Vehicle Type Required</label>
              <select className="select">
                <option>Heavy Cargo Truck (24T)</option>
                <option>Medium Freight Van (10T)</option>
                <option>Express Delivery Vehicle (3.5T)</option>
              </select>
            </div>
            <div>
              <label className="font-medium text-body block mb-1">Priority Level</label>
              <select className="select">
                <option>Normal (Standard SLA)</option>
                <option>High Priority</option>
                <option>Urgent / Express SLA</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-app-border flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="btn-neutral text-xs"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary text-xs">
              <Plus size={14} /> Submit Request
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
