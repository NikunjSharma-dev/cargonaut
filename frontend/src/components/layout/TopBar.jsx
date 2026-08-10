import { useState, useEffect } from 'react'
import { Bell, Search, Menu, MessageSquare, Calendar, SlidersHorizontal, CheckCircle2, Moon, Sun } from 'lucide-react'
import { useThemeStore, resolveTheme } from '../../store/themeStore'
import { useAuthStore } from '../../store/authStore'
import clsx from 'clsx'

export default function TopBar({ title, onMenuToggle, onOpenSearch }) {
  const user = useAuthStore(s => s.user)
  const isDemo = useAuthStore(s => s.isDemo)
  const theme = useThemeStore(s => s.theme)
  const toggleTheme = useThemeStore(s => s.toggle)
  const isDark = resolveTheme(theme) === 'dark'
  const [showNotifications, setShowNotifications] = useState(false)
  const [unreadCount, setUnreadCount] = useState(3)

  const notifications = [
    { id: 1, title: 'SLA Alert: Truck TRK-802', time: '10m ago', desc: 'Delay reported on Waypoint #3 (Traffic)', type: 'danger' },
    { id: 2, title: 'Delivery Completed', time: '24m ago', desc: 'Order #ORD-9421 delivered successfully', type: 'success' },
    { id: 3, title: 'New Request Created', time: '1h ago', desc: 'Carrier TransLog assigned to Shipment #802', type: 'info' },
  ]

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (onOpenSearch) onOpenSearch()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onOpenSearch])

  return (
    <header className="h-[var(--topbar-h)] flex items-center justify-between px-4 sm:px-6 bg-app-surface border-b border-app-border sticky top-0 z-30 shadow-2xs">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-xl text-muted hover:text-heading hover:bg-app-hover transition-colors"
          title="Open menu"
        >
          <Menu size={20} />
        </button>

        <div>
          <h1 className="page-title text-base sm:text-lg flex items-center gap-2">
            {title}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {isDemo && (
          <span
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-400"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            Demo mode
          </span>
        )}

        {/* Date Filter Pill (Reference A/B Detail) */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-app-panel border border-app-border text-xs font-medium text-body">
          <Calendar size={14} className="text-primary" />
          <span>Aug 1 — Aug 31, 2026</span>
        </div>

        {/* Global Search with ⌘K */}
        <div
          onClick={() => onOpenSearch && onOpenSearch()}
          className="relative hidden sm:flex items-center cursor-pointer"
        >
          <Search size={15} className="absolute left-3 text-subtle pointer-events-none" />
          <input
            readOnly
            className="input pl-9 pr-14 w-52 sm:w-64 h-9 text-xs bg-app-panel hover:bg-app-hover/80 cursor-pointer border-app-border focus:bg-app-surface"
            placeholder="Search orders, trucks, drivers..."
          />
          <div className="absolute right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-app-border bg-app-surface text-[10px] font-mono text-subtle shadow-2xs">
            <span className="text-[11px]">⌘</span>K
          </div>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl text-muted hover:text-primary hover:bg-primary-soft transition-colors"
          title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label="Toggle color theme"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {/* Quick Chat Icon */}
        <button
          className="p-2 rounded-xl text-muted hover:text-primary hover:bg-primary-soft transition-colors relative"
          title="Operator Messages"
        >
          <MessageSquare size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full ring-2 ring-white" />
        </button>

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(prev => !prev)}
            className="p-2 rounded-xl text-muted hover:text-primary hover:bg-primary-soft transition-colors relative"
            title="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full ring-2 ring-white" />
            )}
          </button>

          {/* Notifications Dropdown Popover */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-88 bg-app-surface border border-app-border rounded-2xl shadow-floating z-50 p-4 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-app-border">
                <span className="text-xs font-bold text-heading">Notifications</span>
                <button
                  onClick={() => setUnreadCount(0)}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  Mark all read
                </button>
              </div>

              <div className="divide-y divide-app-border max-h-72 overflow-y-auto my-1">
                {notifications.map(n => (
                  <div key={n.id} className="py-2.5 px-1 flex gap-3 items-start hover:bg-app-panel rounded-lg transition-colors">
                    <span className={clsx(
                      'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                      n.type === 'danger' ? 'bg-danger' : n.type === 'success' ? 'bg-success' : 'bg-primary'
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center">
                        <p className="text-xs font-semibold text-heading truncate">{n.title}</p>
                        <span className="text-[10px] text-subtle">{n.time}</span>
                      </div>
                      <p className="text-[11px] text-muted line-clamp-2 mt-0.5">{n.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-app-border text-center">
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-xs text-primary font-medium hover:underline"
                >
                  View notification center
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
