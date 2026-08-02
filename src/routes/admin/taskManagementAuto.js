import React, { useState, useEffect } from 'react'
import { Loader, AlertCircle, Clock, ShoppingCart, Users, Info } from 'lucide-react'

const API_BASE = `${import.meta.env.VITE_API_BASE_URL}/api`

type PlateItem = {
  plate_id: number
  plate_name: string
  category: string
  quantity: number | null
  quantity_is_estimate: boolean
  task: string
}

type Schedule = Record<string, PlateItem[]>

type ProcurementItem = { ingredient: string; quantity: number; unit: string; cost_per_lb: number | null; total_cost: number | null }
type SupplierOrder = { items: ProcurementItem[]; total_cost: number }

type PlanData = {
  summary: { week_start: string; active_customers: number; estimated_meals: number | null; meals_are_estimate: boolean; plates: number }
  schedule: Schedule
  procurement: { suppliers: number; total_cost: number; orders: Record<string, SupplierOrder> }
  labor: Array<{ role: string; target_hours: number; hourly_rate: number; budget_cost: number }>
  message?: string
}

export default function TaskManagementPage() {
  const [weeks, setWeeks] = useState<string[]>([])
  const [selectedWeek, setSelectedWeek] = useState<string>('')
  const [activeTab, setActiveTab] = useState('timeline')
  const [loading, setLoading] = useState(false)
  const [planData, setPlanData] = useState<PlanData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchWeeks()
  }, [])

  useEffect(() => {
    generatePlan()
  }, [selectedWeek])

  const fetchWeeks = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/task-management-auto/weeks-with-plates`)
      const data = await response.json()
      setWeeks(data.weeks || [])
    } catch (err) {
      console.error('Error fetching weeks:', err)
    }
  }

  const generatePlan = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`${API_BASE}/admin/task-management-auto/auto-generate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedWeek ? { week_start: selectedWeek } : {}),
      })

      if (!response.ok) throw new Error('Failed to generate plan')
      const data = await response.json()
      setPlanData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <main className="flex-1 p-8 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-900">Generating Production Plan...</h2>
        </div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="flex-1 p-8 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
        <div className="bg-red-50 border border-red-300 rounded-lg p-6">
          <AlertCircle className="w-6 h-6 text-red-600 mb-2" />
          <h2 className="text-xl font-bold text-red-900">Error</h2>
          <p className="text-red-800">{error}</p>
          <button onClick={generatePlan} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
            Try Again
          </button>
        </div>
      </main>
    )
  }

  if (!planData) {
    return (
      <main className="flex-1 p-8">
        <p className="text-slate-600">No data</p>
      </main>
    )
  }

  const { summary, schedule, procurement, labor, message } = planData

  const dayColors: Record<string, string> = {
    Saturday: 'bg-yellow-50 border-yellow-200',
    Sunday: 'bg-orange-50 border-orange-200',
    Monday: 'bg-blue-50 border-blue-200',
    Tuesday: 'bg-purple-50 border-purple-200',
    Wednesday: 'bg-amber-50 border-amber-200',
    Thursday: 'bg-blue-50 border-blue-200',
    Friday: 'bg-slate-50 border-slate-200',
  }

  const dayIcons: Record<string, string> = {
    Saturday: '🔪', Sunday: '🍳', Monday: '🚚', Tuesday: '🛒', Wednesday: '⚡', Thursday: '📦', Friday: '📋',
  }

  const dayNotes: Record<string, string> = {
    Saturday: 'Prep for Monday delivery',
    Sunday: 'Cook for Monday delivery',
    Monday: 'Pack & deliver',
    Tuesday: 'Shopping, restocking, admin',
    Wednesday: 'Prep & cook for Thursday delivery',
    Thursday: 'Pack & deliver',
    Friday: 'Weekly wrap-up, inventory audit',
  }

  const daysOfWeek = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

  return (
    <main className="flex-1 p-8 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold text-slate-900">Production Planning</h1>
          <p className="text-slate-600 mt-2">
            Week of {summary.week_start ? new Date(summary.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '-'} • {summary.plates} plates planned
          </p>
        </div>
        <select
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
          className="px-4 py-2 border-2 border-slate-300 rounded-lg bg-white font-bold text-slate-900 text-lg"
        >
          <option value="">Next Week</option>
          {weeks.map((week) => (
            <option key={week} value={week}>
              Week of {new Date(week).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
            </option>
          ))}
        </select>
      </div>

      {message && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-blue-900">{message}</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-600" />
            <div>
              <p className="text-slate-600 text-sm">Active Customers</p>
              <p className="text-2xl font-bold text-slate-900">{summary.active_customers}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-orange-600" />
            <div>
              <p className="text-slate-600 text-sm">
                {summary.meals_are_estimate ? 'Estimated Meals' : 'Real Meals Ordered'}
              </p>
              <p className="text-2xl font-bold text-slate-900">{summary.estimated_meals ?? 'TBD'}</p>
              {summary.meals_are_estimate && (
                <p className="text-xs text-orange-600">Orders not in yet for this week</p>
              )}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-6 h-6 text-green-600" />
            <div>
              <p className="text-slate-600 text-sm">Plates Planned</p>
              <p className="text-2xl font-bold text-slate-900">{summary.plates}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-6 h-6 text-purple-600" />
            <div>
              <p className="text-slate-600 text-sm">Procurement Cost</p>
              <p className="text-2xl font-bold text-slate-900">${procurement.total_cost.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-slate-300 mb-6">
        {['timeline', 'procurement', 'labor'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-bold text-lg transition ${
              activeTab === tab ? 'text-blue-700 border-b-4 border-blue-700' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            {tab === 'timeline' ? '📅 7-Day Timeline' : tab === 'procurement' ? '🛒 Procurement' : '👷 Labor'}
          </button>
        ))}
      </div>

      {/* Timeline Tab */}
      {activeTab === 'timeline' && (
        <div className="space-y-6">
          {daysOfWeek.map((day) => {
            const dayItems = schedule[day] || []
            return (
              <div key={day} className={`rounded-lg border-2 ${dayColors[day]} p-6 shadow-md`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                      <span className="text-3xl">{dayIcons[day]}</span>
                      {day}
                    </h3>
                    <p className="text-slate-600 mt-1">{dayNotes[day]}</p>
                  </div>
                </div>

                {dayItems.length > 0 ? (
                  <div className="space-y-3 mt-4">
                    {dayItems.map((item, idx) => (
                      <div key={idx} className="bg-white rounded-lg p-4 border border-slate-200 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-900 text-lg">{item.plate_name}</p>
                          <p className="text-sm text-slate-600">{item.task} • {item.category}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-slate-900">
                            {item.quantity != null ? item.quantity : 'TBD'}
                          </p>
                          {item.quantity_is_estimate && <p className="text-xs text-orange-600">no orders yet</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-600 italic mt-2">No production scheduled</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Procurement Tab */}
      {activeTab === 'procurement' && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-md">
            <h3 className="text-xl font-bold text-slate-900 mb-4">Suppliers: {procurement.suppliers}</h3>
            <p className="text-slate-600 mb-6 text-lg font-bold">Total Cost: ${procurement.total_cost.toFixed(2)}</p>

            {Object.entries(procurement.orders).map(([supplier, details]) => (
              <div key={supplier} className="border-t border-slate-200 pt-4 mt-4 first:border-t-0 first:pt-0 first:mt-0">
                <h4 className="font-bold text-slate-900 text-lg">{supplier}</h4>
                <p className="text-slate-600 mt-2">
                  {details.items.length} items • ${details.total_cost.toFixed(2)}
                </p>
                <div className="mt-3 space-y-2">
                  {details.items.map((item, idx) => (
                    <div key={idx} className="text-sm text-slate-600 flex justify-between">
                      <span>{item.ingredient}</span>
                      <span>
                        {item.quantity} {item.unit}
                        {item.total_cost != null && ` • $${item.total_cost.toFixed(2)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Labor Tab */}
      {activeTab === 'labor' && (
        <div className="grid grid-cols-2 gap-4">
          {labor.map((role, idx) => (
            <div key={idx} className="bg-white rounded-lg p-6 border border-slate-200 shadow-md">
              <h4 className="font-bold text-slate-900 text-lg">{role.role.replace('_', ' ')}</h4>
              <p className="text-slate-600 mt-2">{role.target_hours} hours @ ${role.hourly_rate}/hr</p>
              <p className="text-slate-900 font-bold mt-1">${role.budget_cost.toFixed(2)} budgeted</p>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
