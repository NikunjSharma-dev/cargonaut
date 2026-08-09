import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutGrid, Package, Truck, Users, UserRound,
  Navigation, BarChart3, Settings, LogOut, Radar,
  Warehouse, X, Plus, ChevronRight, ChevronDown,
  Bell, Zap, Smartphone, FileBarChart, LineChart, CalendarClock, Wrench,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { initials } from '../../utils/helpers'
import clsx from 'clsx'

const NAV_ITEMS = [
  { to: '/dashboard', icon: LayoutGrid, label: 'Dashboard' },
  { to: '/hubs', icon: Warehouse, label: 'Partners' },
  { to: '/dispatch', icon: Zap, label: 'Dispatch', badge: 7 },
  { to: '/tracking', icon: Navigation, label: 'Tracking' },
  { to: '/geofences', icon: Radar, label: 'Geofences' },
  {
    key: 'request',
    icon: Bell,
    label: 'Request',
    badge: 4,
    children: [
      { to: '/fleet', icon: Truck, label: 'Trucks' },
      { to: '/orders', icon: Package, label: 'Cargos', badge: 2 },
      { to: '/drivers', icon: UserRound, label: 'Drivers' },
      { to: '/shifts', icon: CalendarClock, label: 'Shifts' },
      { to: '/maintenance', icon: Wrench, label: 'Maintenance' },
      { to: '/driver-view', icon: Smartphone, label: 'Driver App' },
      { to: '/analytics', icon: FileBarChart, label: 'Reports', badge: 2 },
    ],
  },
  {
    key: 'analysis',
    icon: LineChart,
    label: 'Analysis',
    children: [
      { to: '/analytics', icon: BarChart3, label: 'Performance' },
      { to: '/settings', icon: Settings, label: 'Settings & API' },
    ],
  },
]

function CountBadge({ value, active }) {
  return (
    <span
      className={clsx(
        'min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center',
        active ? 'bg-white/25 text-white' : 'bg-primary text-white'
      )}
    >
      {value}
    </span>
  )
}

export default function Sidebar({ mobileOpen, onClose, onOpenCreateOrder, collapsed, onToggleCollapse }) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [openGroups, setOpenGroups] = useState({ request: true, analysis: false })

  function toggleGroup(key) {
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const isDriver = user?.role === 'driver'

  const filteredNav = NAV_ITEMS.map(item => {
    if (isDriver) {
      if (item.to && !['/dashboard', '/tracking', '/shifts', '/driver-view'].includes(item.to)) {
        return null
      }
      if (item.children) {
        const allowedChildren = item.children.filter(c => ['/dashboard', '/tracking', '/shifts', '/driver-view'].includes(c.to))
        if (allowedChildren.length === 0) return null
        return { ...item, children: allowedChildren }
      }
    }
    return item
  }).filter(Boolean)

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-40 lg:hidden"
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 bg-app-surface border-r border-app-border flex flex-col z-50 transition-all duration-200 ease-in-out overflow-x-hidden',
          collapsed ? 'w-[var(--nav-collapsed-width)]' : 'w-[var(--nav-width)]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Account header */}
        <div
          className={clsx(
            'flex items-center gap-3 border-b border-app-border flex-shrink-0',
            collapsed ? 'px-0 py-5 justify-center' : 'px-5 py-5'
          )}
        >
          <div className="w-11 h-11 rounded-full bg-primary-soft text-primary font-bold text-sm flex items-center justify-center flex-shrink-0 ring-2 ring-white shadow-card">
            {initials(user?.full_name || 'Fleet Operator')}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-heading truncate font-display leading-tight">
                {user?.full_name || 'Fleet Operator'}
              </p>
              <p className="text-[11px] text-muted truncate mt-0.5">
                {user?.email || 'ops@cargonaut.io'}
              </p>
            </div>
          )}
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-subtle hover:text-body hover:bg-app-hover"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto no-scrollbar py-4">
          <ul className="space-y-0.5">
            {filteredNav.map(item => {
              const Icon = item.icon

              // Flat link
              if (!item.children) {
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onClose}
                      className={({ isActive }) =>
                        clsx('nav-item', isActive && 'active', collapsed && 'justify-center px-0')
                      }
                      title={collapsed ? item.label : undefined}
                    >
                      {({ isActive }) => (
                        <>
                          <Icon size={20} className="flex-shrink-0" strokeWidth={isActive ? 2.4 : 2} />
                          {!collapsed && (
                            <span className="flex-1 flex items-center justify-between min-w-0">
                              <span className="truncate">{item.label}</span>
                              {item.badge && <CountBadge value={item.badge} active={isActive} />}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                )
              }

              // Expandable group
              const groupActive = item.children.some(c => c.to === location.pathname)
              const isOpen = collapsed ? false : (openGroups[item.key] ?? groupActive)

              return (
                <li key={item.key}>
                  <button
                    onClick={() => (collapsed ? navigate(item.children[0].to) : toggleGroup(item.key))}
                    className={clsx('nav-item w-full text-left', collapsed && 'justify-center px-0')}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon size={20} className="flex-shrink-0" />
                    {!collapsed && (
                      <span className="flex-1 flex items-center justify-between min-w-0">
                        <span className="flex items-center gap-2 truncate">
                          <span className="truncate">{item.label}</span>
                          <ChevronDown
                            size={16}
                            className={clsx('transition-transform duration-200 text-subtle', isOpen && 'rotate-180')}
                          />
                        </span>
                        {item.badge && <CountBadge value={item.badge} />}
                      </span>
                    )}
                  </button>

                  {isOpen && (
                    <ul className="relative ml-[34px] mr-4 mt-1 mb-2 pl-4 border-l border-dashed border-app-border space-y-0.5">
                      {item.children.map(child => {
                        const ChildIcon = child.icon
                        return (
                          <li key={child.label} className="relative">
                            {/* tree tick */}
                            <span className="absolute -left-4 top-1/2 w-3 border-t border-dashed border-app-border" />
                            <NavLink
                              to={child.to}
                              onClick={onClose}
                              className={({ isActive }) => clsx('nav-sub-item', isActive && 'active')}
                            >
                              <ChildIcon size={16} className="flex-shrink-0 text-muted" />
                              <span className="flex-1 truncate">{child.label}</span>
                              {child.badge && <CountBadge value={child.badge} />}
                            </NavLink>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Bottom CTA */}
        <div className={clsx('flex-shrink-0 bg-app-surface', collapsed ? 'p-3' : 'px-5 pb-5 pt-3')}>
          <button
            onClick={() => (onOpenCreateOrder ? onOpenCreateOrder() : navigate('/orders'))}
            className={clsx('btn-primary w-full', collapsed ? 'px-0 py-2.5' : 'py-3 text-sm')}
            title="Create new request"
          >
            <Plus size={16} />
            {!collapsed && <span>Create new request</span>}
          </button>

          <div className="pt-2 flex items-center justify-between">
            {!collapsed && (
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-xs text-muted hover:text-primary px-1 py-1.5 rounded-lg transition-colors"
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            )}
            <button
              onClick={onToggleCollapse}
              className="hidden lg:flex p-1.5 rounded-lg text-subtle hover:text-body hover:bg-app-hover transition-colors ml-auto"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <ChevronRight size={16} className={clsx('transition-transform duration-200', !collapsed && 'rotate-180')} />
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
