import { useState, useEffect } from 'react'
import { CheckCircle, MapPin, Navigation, Phone, Clock, Truck } from 'lucide-react'
import api from '../utils/api'
import { StatusBadge, CargoBadge, TransportModeBadge } from '../components/ui'

import clsx from 'clsx'

export default function DriverViewPage() {
  const [stops, setStops] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('assigned')
  const [gpsActive, setGpsActive] = useState(false)

  useEffect(() => {
    fetchDriverStops()
  }, [])

  async function fetchDriverStops() {
    try {
      setLoading(true)
      const res = await api.get('/orders/?page_size=50')
      setStops(res.data?.items || [])
    } catch (err) {
      console.error('Failed to load driver stops', err)
    } finally {
      setLoading(false)
    }
  }

  async function updateStatus(orderId, newStatus) {
    try {
      await api.patch(`/orders/${orderId}`, { status: newStatus })
      fetchDriverStops()
    } catch (err) {
      alert(`Status update failed: ${err.message}`)
    }
  }

  const activeStops = stops.filter(s => ['dispatched', 'in_transit', 'arrived'].includes(s.status))
  const completedStops = stops.filter(s => ['delivered', 'failed'].includes(s.status))

  return (
    <div className="max-w-md mx-auto space-y-4 pb-20 animate-in fade-in duration-200">
      {/* Top Driver Header Mobile View */}
      <div className="bg-app-surface border border-app-border p-5 rounded-2xl shadow-card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-bold">
            <Truck size={20} />
          </div>
          <div>
            <h1 className="font-bold text-base text-heading font-display">Driver Mobile Terminal</h1>
            <p className="text-xs text-muted">Assigned Route Stops</p>
          </div>
        </div>

        <button
          onClick={() => setGpsActive(!gpsActive)}
          className={clsx(
            'px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all border',
            gpsActive
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-app-hover text-body border-app-border'
          )}
        >
          <Navigation className="w-3.5 h-3.5" />
          {gpsActive ? 'GPS Broadcast ON' : 'Start GPS'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-app-border bg-app-surface rounded-xl p-1 shadow-2xs">
        <button
          onClick={() => setActiveTab('assigned')}
          className={clsx(
            'flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all',
            activeTab === 'assigned'
              ? 'bg-primary-soft text-primary border border-primary/25'
              : 'text-muted hover:text-heading'
          )}
        >
          Active Stops ({activeStops.length})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={clsx(
            'flex-1 py-2 text-center text-xs font-bold rounded-lg transition-all',
            activeTab === 'completed'
              ? 'bg-primary-soft text-primary border border-primary/25'
              : 'text-muted hover:text-heading'
          )}
        >
          Completed ({completedStops.length})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-10 text-muted text-xs">Syncing driver stops…</div>
      ) : (activeTab === 'assigned' ? activeStops : completedStops).length === 0 ? (
        <div className="bg-app-surface border border-app-border p-8 text-center rounded-2xl text-muted text-xs shadow-xs">
          No stops in this tab.
        </div>
      ) : (
        <div className="space-y-3">
          {(activeTab === 'assigned' ? activeStops : completedStops).map(stop => (
            <div key={stop.id} className="card space-y-3 shadow-card border-app-border">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-mono font-bold text-primary">{stop.order_number}</span>
                    <TransportModeBadge mode={stop.transport_mode || 'road'} />
                    <CargoBadge type={stop.cargo_type || 'general'} />
                  </div>
                  <h3 className="font-bold text-heading text-base font-display">{stop.customer_name}</h3>
                  {stop.air_waybill_number && (
                    <p className="text-[10px] text-purple-700 font-bold font-mono">AWB {stop.air_waybill_number} (Flight {stop.flight_number || 'CG412'})</p>
                  )}
                </div>
                <StatusBadge status={stop.status} />
              </div>


              <div className="text-xs text-body space-y-1 pt-2 border-t border-app-border">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-accent shrink-0" />
                  <span className="font-medium">{stop.delivery_address}, {stop.delivery_city}</span>
                </div>
              </div>

              {/* One-Tap Action Buttons */}
              <div className="pt-2 border-t border-app-border flex gap-2">
                {stop.status === 'dispatched' && (
                  <button
                    onClick={() => updateStatus(stop.id, 'in_transit')}
                    className="flex-1 btn-primary text-xs py-2 justify-center"
                  >
                    <Navigation className="w-3.5 h-3.5" /> Start Trip (In Transit)
                  </button>
                )}
                {stop.status === 'in_transit' && (
                  <button
                    onClick={() => updateStatus(stop.id, 'arrived')}
                    className="flex-1 btn-accent text-xs py-2 justify-center"
                  >
                    <MapPin className="w-3.5 h-3.5" /> Arrived at Location
                  </button>
                )}
                {stop.status === 'arrived' && (
                  <button
                    onClick={() => updateStatus(stop.id, 'delivered')}
                    className="flex-1 bg-emerald-600 text-white font-bold text-xs py-2 rounded-xl flex items-center justify-center gap-1 hover:bg-emerald-700"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Confirm Delivery
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
