import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Brush, ResponsiveContainer, Legend,
} from 'recharts'
import { Moon, Sun, RefreshCw, ChevronDown, ChevronUp, ExternalLink, Activity, BarChart2, AlertTriangle } from 'lucide-react'
import './index.css'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface WaitingRecord {
  id: number; fecha: string; provincia: string; especialidad: string
  pacientes_espera: number; demora_media_dias: number; fuente: string
}
interface PrivatizacionEvent {
  id: number; fecha: string; tipo: string; descripcion: string
  consejeria: string; importe_euros: number | null; fuente_url: string
}
interface AnalysisResult {
  id: number; ejecutado_en: string; metrica: string
  provincia: string | null; especialidad: string | null
  p_value: number; effect_size: number
  signal_strength: 'none' | 'weak' | 'moderate' | 'strong'
  narrative: string | null; n_events: number
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PROVINCIAS = ['Almería','Cádiz','Córdoba','Granada','Huelva','Jaén','Málaga','Sevilla']
const ESPECIALIDADES = [
  'cardiología','dermatología','digestivo','endocrinología',
  'ginecología','neurología','neumología','oftalmología',
  'otorrinolaringología','reumatología','traumatología','urología',
]

type SignalLevel = 'none' | 'weak' | 'moderate' | 'strong'

const SIGNAL: Record<SignalLevel, { label: string; cell: string; badge: string; dot: string }> = {
  none:     { label: 'Sin señal',  cell: 'bg-slate-100 dark:bg-slate-700/40 hover:bg-slate-200 dark:hover:bg-slate-600/60',   badge: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',   dot: 'bg-slate-400' },
  weak:     { label: 'Débil',      cell: 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-800/30',         badge: 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',       dot: 'bg-blue-400' },
  moderate: { label: 'Moderada',   cell: 'bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-800/40',   badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', dot: 'bg-amber-400' },
  strong:   { label: 'Fuerte',     cell: 'bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-800/40',           badge: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',         dot: 'bg-red-500' },
}

const api = axios.create({ baseURL: '/api' })
const fmt = (n: number, d = 2) => n.toFixed(d)

// ─── Componentes base ─────────────────────────────────────────────────────────

function SignalBadge({ strength }: { strength: string }) {
  const s = SIGNAL[strength as SignalLevel] ?? SIGNAL.none
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-verde-sas">{icon}</span>
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100 uppercase tracking-wide">{children}</h2>
    </div>
  )
}

// ─── Mapa de señales ──────────────────────────────────────────────────────────

function SignalMap({ results, onCellClick }: {
  results: AnalysisResult[]
  onCellClick: (p: string, e: string) => void
}) {
  const rank: Record<string, number> = { none: 0, weak: 1, moderate: 2, strong: 3 }

  const signalMap = useMemo(() => {
    const m: Record<string, SignalLevel> = {}
    for (const r of results) {
      if (!r.provincia || !r.especialidad) continue
      const key = `${r.provincia}::${r.especialidad}`
      const prev = m[key]
      if (!prev || (rank[r.signal_strength] ?? 0) > (rank[prev] ?? 0))
        m[key] = r.signal_strength
    }
    return m
  }, [results])

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-xs mx-auto">
        <thead>
          <tr>
            <th className="w-24" />
            {ESPECIALIDADES.map(e => (
              <th key={e} className="pb-1">
                <div className="text-gray-400 dark:text-gray-500 font-normal"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 76, lineHeight: 1.2 }}>
                  {e}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PROVINCIAS.map(prov => (
            <tr key={prov}>
              <td className="pr-2 text-right font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap py-0.5">
                {prov}
              </td>
              {ESPECIALIDADES.map(espec => {
                const strength = (signalMap[`${prov}::${espec}`] ?? 'none') as SignalLevel
                const s = SIGNAL[strength]
                const r = results.find(x => x.provincia === prov && x.especialidad === espec)
                const tip = r
                  ? `p=${fmt(r.p_value, 4)}  efecto=${fmt(r.effect_size, 3)}\n${r.narrative ?? ''}`
                  : `${prov} · ${espec}`
                return (
                  <td key={espec} className="p-0">
                    <button
                      onClick={() => onCellClick(prov, espec)}
                      title={tip}
                      className={`w-8 h-7 rounded-md transition-all duration-150 ring-0 hover:ring-2 hover:ring-verde-sas hover:ring-offset-1 ${s.cell}`}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Leyenda */}
      <div className="flex justify-center flex-wrap gap-3 mt-4">
        {(Object.entries(SIGNAL) as [SignalLevel, typeof SIGNAL[SignalLevel]][]).map(([k, v]) => (
          <span key={k} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${v.badge}`}>
            <span className={`w-2 h-2 rounded-full ${v.dot}`} />
            {v.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Gráfico principal ────────────────────────────────────────────────────────

function MainChart({ records, events, provincia, especialidad, onProv, onEspec }: {
  records: WaitingRecord[]; events: PrivatizacionEvent[]
  provincia: string; especialidad: string
  onProv: (p: string) => void; onEspec: (e: string) => void
}) {
  const data = useMemo(() =>
    records
      .filter(r => r.provincia === provincia && r.especialidad === especialidad)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map(r => ({ fecha: r.fecha, demora: r.demora_media_dias, pacientes: r.pacientes_espera }))
  , [records, provincia, especialidad])

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-5">
        <select value={provincia} onChange={e => onProv(e.target.value)}
          className="text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-verde-sas">
          {PROVINCIAS.map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={especialidad} onChange={e => onEspec(e.target.value)}
          className="text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-verde-sas">
          {ESPECIALIDADES.map(e => <option key={e}>{e}</option>)}
        </select>
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 self-center">
          {data.length} puntos · <span className="text-rojo-alerta">▼</span> eventos privatización
        </span>
      </div>

      {data.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
          Sin datos para {provincia} · {especialidad}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 4, right: 32, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="demoraGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.5} />
            <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => v.slice(0, 7)} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
              label={{ value: 'días', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 10, fill: '#9ca3af' } }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
              label={{ value: 'pacientes', angle: 90, position: 'insideRight', offset: 12, style: { fontSize: 10, fill: '#9ca3af' } }} />
            <Tooltip
              formatter={(v, name) => [
                name === 'demora' ? `${Number(v).toFixed(1)} días` : Number(v).toLocaleString('es'),
                name === 'demora' ? 'Demora media' : 'Pacientes',
              ]}
              labelFormatter={l => `${l}`}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px #0001' }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={v => v === 'demora' ? 'Demora media (días)' : 'Pacientes en espera'} />
            {events.map(e => (
              <ReferenceLine key={e.id} x={e.fecha} yAxisId="left"
                stroke="#E24B4A" strokeDasharray="4 3" strokeWidth={1.5}
                label={{ value: '▼', position: 'insideTopRight', fill: '#E24B4A', fontSize: 9 }} />
            ))}
            <Line yAxisId="left" type="monotone" dataKey="demora" stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} name="demora" />
            <Line yAxisId="right" type="monotone" dataKey="pacientes" stroke="#f97316" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="pacientes" />
            <Brush dataKey="fecha" height={18} stroke="#d1d5db" fill="transparent" travellerWidth={5} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

// ─── Tabla de resultados ──────────────────────────────────────────────────────

type SortKey = 'provincia' | 'especialidad' | 'p_value' | 'effect_size' | 'signal_strength'

function ResultsTable({ results, onNarrative }: {
  results: AnalysisResult[]
  onNarrative: (r: AnalysisResult) => void
}) {
  const [filter, setFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('p_value')
  const [sortAsc, setSortAsc] = useState(true)

  const sorted = useMemo(() => {
    const q = filter.toLowerCase()
    return results
      .filter(r =>
        (r.provincia?.toLowerCase().includes(q) ?? false) ||
        (r.especialidad?.toLowerCase().includes(q) ?? false) ||
        r.signal_strength.includes(q)
      )
      .sort((a, b) => {
        const va = a[sortKey] ?? ''; const vb = b[sortKey] ?? ''
        return sortAsc ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0)
      })
  }, [results, filter, sortKey, sortAsc])

  const toggleSort = (k: SortKey) => { if (sortKey === k) setSortAsc(v => !v); else { setSortKey(k); setSortAsc(true) } }
  const Th = ({ label, k }: { label: string; k: SortKey }) => (
    <th onClick={() => toggleSort(k)}
      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-verde-sas transition-colors whitespace-nowrap">
      {label}{sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : ''}
    </th>
  )

  if (results.length === 0) return (
    <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
      Sin resultados. Pulsa <strong>Ejecutar análisis</strong> para comenzar.
    </div>
  )

  return (
    <div>
      <input type="text" placeholder="Filtrar por provincia, especialidad o señal..."
        value={filter} onChange={e => setFilter(e.target.value)}
        className="w-full mb-4 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-verde-sas" />
      <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
              <Th label="Provincia" k="provincia" />
              <Th label="Especialidad" k="especialidad" />
              <Th label="p-valor" k="p_value" />
              <Th label="Efecto" k="effect_size" />
              <Th label="Señal" k="signal_strength" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Narrativa
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {sorted.slice(0, 200).map(r => (
              <tr key={r.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/30 transition-colors">
                <td className="px-4 py-2.5 whitespace-nowrap font-medium text-gray-800 dark:text-gray-200">{r.provincia ?? '—'}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-gray-600 dark:text-gray-400">{r.especialidad ?? '—'}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400">{fmt(r.p_value, 4)}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-gray-600 dark:text-gray-400">{fmt(r.effect_size, 3)}</td>
                <td className="px-4 py-2.5"><SignalBadge strength={r.signal_strength} /></td>
                <td className="px-4 py-2.5 max-w-xs">
                  {r.narrative
                    ? <button onClick={() => onNarrative(r)}
                        className="text-verde-sas hover:underline text-xs truncate block text-left max-w-xs">
                        {r.narrative.slice(0, 65)}…
                      </button>
                    : <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-right">
        {Math.min(sorted.length, 200)} / {sorted.length} resultados
      </p>
    </div>
  )
}

// ─── Metodología ──────────────────────────────────────────────────────────────

function Metodologia() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 dark:bg-gray-800 text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/70 transition-colors">
        <span>¿Cómo funciona este análisis?</span>
        {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-5 py-4 bg-white dark:bg-gray-900 text-sm text-gray-600 dark:text-gray-400 space-y-3 leading-relaxed">
          <p><strong className="text-gray-800 dark:text-gray-200">Mann-Whitney U</strong> — prueba no paramétrica que compara la distribución de demoras en los 90 días posteriores a cada evento con la línea base del año anterior. No asume distribución normal.</p>
          <p><strong className="text-gray-800 dark:text-gray-200">Corrección FDR</strong> (Benjamini-Hochberg) — ajusta los p-valores para controlar la tasa de falsos positivos al comparar las 96 combinaciones provincia×especialidad simultáneamente.</p>
          <p><strong className="text-gray-800 dark:text-gray-200">p-valor</strong> — probabilidad de observar este patrón por azar. p&lt;0.05 es estadísticamente inusual, <em>no implica que la privatización sea la causa</em>.</p>
          <p><strong className="text-gray-800 dark:text-gray-200">Effect size</strong> (rank-biserial) — magnitud del cambio: 0 = sin diferencia, ±1 = diferencia máxima.</p>
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
            <p className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <AlertTriangle size={14} /> Asociación estadística ≠ causalidad
            </p>
            <p className="mt-1 text-amber-700 dark:text-amber-400">Los patrones pueden deberse a factores estacionales, demográficos, pandémicos u otros no controlados aquí.</p>
          </div>
          <p className="pt-1">Motor:{' '}
            <a href="https://github.com/Raulcadiz/chrono-correlator" target="_blank" rel="noopener noreferrer"
              className="text-verde-sas hover:underline inline-flex items-center gap-1">
              chrono-correlator <ExternalLink size={11} />
            </a>
            {' '}(Apache 2.0)
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Modal narrativa ──────────────────────────────────────────────────────────

function NarrativeModal({ result, onClose }: { result: AnalysisResult | null; onClose: () => void }) {
  if (!result) return null
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-gray-100 dark:border-gray-700"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-base">
              {result.provincia} · {result.especialidad}
            </h3>
            <div className="flex items-center gap-2 mt-1.5">
              <SignalBadge strength={result.signal_strength} />
              <span className="text-xs text-gray-400 dark:text-gray-500">
                p={fmt(result.p_value, 4)} · efecto={fmt(result.effect_size, 3)}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-lg leading-none">×</button>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {result.narrative ?? 'Sin narrativa. Añade GROQ_API_KEY o ANTHROPIC_API_KEY al .env del servidor para activarla.'}
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-4 italic flex items-center gap-1">
          <AlertTriangle size={11} /> Asociación estadística — no implica causalidad.
        </p>
      </div>
    </div>
  )
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${color}`}>
      <span className="font-bold tabular-nums">{value}</span>
      <span className="opacity-80">{label}</span>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [records, setRecords] = useState<WaitingRecord[]>([])
  const [events, setEvents] = useState<PrivatizacionEvent[]>([])
  const [results, setResults] = useState<AnalysisResult[]>([])
  const [provincia, setProvincia] = useState('Sevilla')
  const [especialidad, setEspecialidad] = useState('traumatología')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [modalResult, setModalResult] = useState<AnalysisResult | null>(null)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [recR, evR, anaR] = await Promise.all([
        api.get('/data/waiting-lists', { params: { limit: 1000 } }),
        api.get('/data/events'),
        api.get('/analysis/latest'),
      ])
      setRecords(recR.data.items ?? [])
      setEvents(evR.data ?? [])
      setResults(anaR.data ?? [])
    } catch {
      showToast('Error conectando con el backend')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const r = await api.post('/data/refresh')
      showToast(`Actualización completa — ${r.data.records_added} registros nuevos`)
      await loadAll()
    } catch { showToast('Error al actualizar') }
    finally { setRefreshing(false) }
  }

  const handleAnalysis = async () => {
    setAnalyzing(true)
    showToast('Ejecutando análisis estadístico…')
    try {
      const r = await api.post('/analysis/run', {})
      showToast(`Análisis completado — ${r.data.count} combinaciones`)
      const ana = await api.get('/analysis/latest')
      setResults(ana.data ?? [])
    } catch (e: any) {
      showToast(e?.response?.data?.detail ?? 'Error en el análisis')
    }
    finally { setAnalyzing(false) }
  }

  const counts = useMemo(() => ({
    strong:   results.filter(r => r.signal_strength === 'strong').length,
    moderate: results.filter(r => r.signal_strength === 'moderate').length,
    weak:     results.filter(r => r.signal_strength === 'weak').length,
    none:     results.filter(r => r.signal_strength === 'none').length,
  }), [results])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-fondo-oscuro text-gray-900 dark:text-gray-100 transition-colors">

      {/* ── Header ── */}
      <header className="bg-verde-sas sticky top-0 z-40 shadow-lg">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center gap-3">
          <Activity size={20} className="text-white/90 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-white font-bold text-lg tracking-tight">Andalucía Espera</span>
            <span className="hidden sm:inline text-white/60 text-xs ml-3">
              listas de espera SAS · estadística no paramétrica · datos públicos
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={handleAnalysis} disabled={analyzing}
              className="hidden sm:flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 text-white rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
              <BarChart2 size={13} />
              {analyzing ? 'Analizando…' : 'Analizar'}
            </button>
            <button onClick={handleRefresh} disabled={refreshing}
              className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 text-white rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">{refreshing ? 'Actualizando…' : 'Actualizar'}</span>
            </button>
            <button onClick={() => setDark(v => !v)}
              className="p-1.5 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-colors">
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-gray-700 text-white text-xs px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {/* ── Stats bar ── */}
      {(records.length > 0 || results.length > 0) && (
        <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {records.length.toLocaleString('es')} registros · {events.length} eventos
            </span>
            {results.length > 0 && (
              <>
                <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1" />
                <StatPill value={counts.strong}   label="fuertes"   color="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20" />
                <StatPill value={counts.moderate} label="moderadas" color="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20" />
                <StatPill value={counts.weak}     label="débiles"   color="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20" />
                <StatPill value={counts.none}     label="sin señal" color="text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700" />
              </>
            )}
          </div>
        </div>
      )}

      <main className="max-w-screen-xl mx-auto px-4 py-6 space-y-6">

        {loading && (
          <div className="text-center py-20 text-gray-400 dark:text-gray-500 text-sm">Cargando…</div>
        )}

        {/* ── Sección 1: Mapa ── */}
        <Card className="p-5">
          <SectionTitle icon={<BarChart2 size={16} />}>Mapa de señales — provincias × especialidades</SectionTitle>
          {results.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              Sin análisis. Pulsa{' '}
              <button onClick={handleAnalysis} className="text-verde-sas hover:underline font-medium">Analizar</button>
              {' '}para comenzar.
            </div>
          ) : (
            <SignalMap results={results} onCellClick={(p, e) => { setProvincia(p); setEspecialidad(e) }} />
          )}
        </Card>

        {/* ── Sección 2: Gráfico ── */}
        <Card className="p-5">
          <SectionTitle icon={<Activity size={16} />}>Evolución temporal</SectionTitle>
          <MainChart records={records} events={events}
            provincia={provincia} especialidad={especialidad}
            onProv={setProvincia} onEspec={setEspecialidad} />
        </Card>

        {/* ── Sección 3: Tabla ── */}
        <Card className="p-5">
          <SectionTitle icon={<BarChart2 size={16} />}>Resultados estadísticos</SectionTitle>
          <ResultsTable results={results} onNarrative={r => setModalResult(r)} />
        </Card>

        {/* ── Sección 4: Metodología ── */}
        <Metodologia />

      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-200 dark:border-gray-700 mt-8 py-5 px-4">
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          Datos: Junta de Andalucía (CC BY 4.0) ·{' '}
          <a href="https://github.com/Raulcadiz/chrono-correlator" target="_blank" rel="noopener noreferrer"
            className="hover:text-verde-sas transition-colors">chrono-correlator</a>{' '}
          (Apache 2.0) · GPL-3.0 ·{' '}
          <a href="https://github.com/Raulcadiz" target="_blank" rel="noopener noreferrer"
            className="hover:text-verde-sas transition-colors">raulcadiz</a>
        </p>
      </footer>

      <NarrativeModal result={modalResult} onClose={() => setModalResult(null)} />
    </div>
  )
}
