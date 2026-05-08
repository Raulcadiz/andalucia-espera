import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Brush, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Moon, Sun, RefreshCw, ChevronDown, ChevronUp, ExternalLink,
  Activity, BarChart2, AlertTriangle, TrendingUp, TrendingDown,
  Clock, CheckCircle2, Building2, Scissors, FileText, ArrowUpRight,
  Minus,
} from 'lucide-react'
import './index.css'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface WaitingRecord {
  id: number; fecha: string; provincia: string; especialidad: string
  pacientes_espera: number; demora_media_dias: number; fuente: string
}
interface PrivatizacionEvent {
  id: number; fecha: string; tipo: string; descripcion: string
  consejeria: string; importe_euros: number | null; fuente_url: string
  confirmado: boolean
}
interface AnalysisResult {
  id: number; ejecutado_en: string; metrica: string
  provincia: string | null; especialidad: string | null
  p_value: number; effect_size: number
  signal_strength: 'none' | 'weak' | 'moderate' | 'strong'
  significant: boolean; narrative: string | null; n_events: number
  best_lag_hours: number | null; consistency: number | null
  baseline_median: number | null
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PROVINCIAS = ['Almería','Cádiz','Córdoba','Granada','Huelva','Jaén','Málaga','Sevilla']
const ESPECIALIDADES = [
  'cardiología','dermatología','digestivo','endocrinología',
  'ginecología','neurología','neumología','oftalmología',
  'otorrinolaringología','reumatología','traumatología','urología',
]

type SignalLevel = 'none' | 'weak' | 'moderate' | 'strong'

const SIGNAL: Record<SignalLevel, { label: string; cell: string; badge: string; dot: string; ring: string }> = {
  none:     { label: 'Sin señal',  cell: 'bg-slate-100 dark:bg-slate-700/40 hover:bg-slate-200',                  badge: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',   dot: 'bg-slate-400', ring: 'ring-slate-300' },
  weak:     { label: 'Débil',      cell: 'bg-sky-50 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-800/30', badge: 'bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300',         dot: 'bg-sky-400',   ring: 'ring-sky-300' },
  moderate: { label: 'Moderada',   cell: 'bg-amber-100 dark:bg-amber-900/25 hover:bg-amber-200',                  badge: 'bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', dot: 'bg-amber-400', ring: 'ring-amber-400' },
  strong:   { label: 'Fuerte',     cell: 'bg-red-100 dark:bg-red-900/25 hover:bg-red-200',                        badge: 'bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300',         dot: 'bg-red-500',   ring: 'ring-red-400' },
}

const TIPO_STYLE: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  concierto:       { color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', icon: <Building2 size={13} />,    label: 'Concierto' },
  externalización: { color: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',                         icon: <ArrowUpRight size={13} />, label: 'Externalización' },
  recorte:         { color: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',                         icon: <Scissors size={13} />,     label: 'Recorte' },
  decreto:         { color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',             icon: <FileText size={13} />,     label: 'Decreto' },
  cambio_político: { color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',       icon: <Activity size={13} />,     label: 'Cambio político' },
}

const api = axios.create({ baseURL: '/api' })
const fmt = (n: number, d = 2) => n.toFixed(d)
const fmtEuros = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M€`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)} k€`
  return `${n} €`
}
const fmtLag = (h: number) => {
  const days = Math.round(h / 24)
  return days < 7 ? `${days} d` : `${Math.round(days / 7)} sem`
}

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
    <div className={`bg-white dark:bg-gray-800/90 rounded-2xl border border-gray-100 dark:border-gray-700/60 shadow-sm ${className}`}>
      {children}
    </div>
  )
}

function SectionTitle({ icon, children, sub }: { icon: React.ReactNode; children: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-start gap-2.5 mb-5">
      <span className="text-verde-sas mt-0.5">{icon}</span>
      <div>
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 uppercase tracking-widest">{children}</h2>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Timeline de eventos ──────────────────────────────────────────────────────

function EventsTimeline({ events }: { events: PrivatizacionEvent[] }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = [...events].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const visible = expanded ? sorted : sorted.slice(0, 6)

  if (events.length === 0) return null

  return (
    <Card className="p-5">
      <SectionTitle icon={<FileText size={16} />} sub="Órdenes, decretos y contratos documentados de la Junta de Andalucía">
        Eventos de privatización y recortes
      </SectionTitle>

      <div className="relative">
        {/* línea vertical */}
        <div className="absolute left-[4.5rem] top-0 bottom-0 w-px bg-gray-100 dark:bg-gray-700/60" />

        <div className="space-y-1">
          {visible.map((ev, i) => {
            const [year, month, day] = ev.fecha.split('-')
            const evStyle = TIPO_STYLE[ev.tipo] ?? TIPO_STYLE.decreto
            const dotColor = ev.tipo === 'recorte' ? 'bg-red-400' :
              ev.tipo === 'concierto' ? 'bg-emerald-400' :
              ev.tipo === 'externalización' ? 'bg-sky-400' :
              ev.tipo === 'cambio_político' ? 'bg-purple-400' : 'bg-amber-400'
            return (
              <div key={ev.id} className={`flex gap-4 group ${i < visible.length - 1 ? 'pb-4' : ''}`}>
                {/* fecha */}
                <div className="w-16 shrink-0 text-right pt-0.5">
                  <div className="text-xs font-bold text-gray-700 dark:text-gray-200 tabular-nums">{day}/{month}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">{year}</div>
                </div>
                {/* dot */}
                <div className="relative z-10 mt-1 shrink-0">
                  <div className={`w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800 ${dotColor}`} />
                </div>
                {/* contenido */}
                <div className="flex-1 min-w-0 pb-1">
                  <div className="flex flex-wrap items-start gap-1.5 mb-1">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${evStyle.color}`}>
                      {evStyle.icon}{evStyle.label}
                    </span>
                    {ev.confirmado && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-verde-sas font-medium">
                        <CheckCircle2 size={11} /> BOJA verificado
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-200 leading-snug">{ev.descripcion}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5">
                    <span className="text-xs text-gray-400 dark:text-gray-500">{ev.consejeria}</span>
                    {ev.importe_euros != null && (
                      <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        {fmtEuros(ev.importe_euros)}
                      </span>
                    )}
                    {ev.fuente_url && (
                      <a href={ev.fuente_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-gray-400 hover:text-verde-sas dark:hover:text-verde-sas transition-colors inline-flex items-center gap-0.5">
                        Fuente <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {sorted.length > 6 && (
        <button onClick={() => setExpanded(v => !v)}
          className="mt-4 w-full text-xs text-gray-400 hover:text-verde-sas transition-colors flex items-center justify-center gap-1">
          {expanded ? <><ChevronUp size={13} /> Ver menos</> : <><ChevronDown size={13} /> Ver {sorted.length - 6} más</>}
        </button>
      )}
    </Card>
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
    <div>
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0.5 text-xs mx-auto">
          <thead>
            <tr>
              <th className="w-24" />
              {ESPECIALIDADES.map(e => (
                <th key={e} className="pb-1">
                  <div className="text-gray-400 dark:text-gray-500 font-normal"
                    style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 80, lineHeight: 1.2 }}>
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
                    ? `p=${fmt(r.p_value, 4)}  efecto=${fmt(r.effect_size, 3)}`
                    : `${prov} · ${espec}`
                  return (
                    <td key={espec} className="p-0">
                      <button
                        onClick={() => onCellClick(prov, espec)}
                        title={tip}
                        className={`w-8 h-7 rounded transition-all duration-100 ring-0 hover:ring-2 hover:ring-offset-1 hover:ring-verde-sas ${s.cell}`}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-center flex-wrap gap-3 mt-4">
        {(Object.entries(SIGNAL) as [SignalLevel, typeof SIGNAL[SignalLevel]][]).map(([k, v]) => (
          <span key={k} className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${v.badge}`}>
            <span className={`w-2 h-2 rounded-full ${v.dot}`} />
            {v.label}
          </span>
        ))}
        <span className="text-xs text-gray-400 dark:text-gray-500 self-center">· clic para ver evolución</span>
      </div>
    </div>
  )
}

// ─── Top señales ──────────────────────────────────────────────────────────────

function TopSignals({ results, onSelect }: {
  results: AnalysisResult[]
  onSelect: (p: string, e: string) => void
}) {
  const top = useMemo(() => {
    const rank: Record<string, number> = { none: 0, weak: 1, moderate: 2, strong: 3 }
    const byKey: Record<string, AnalysisResult> = {}
    for (const r of results) {
      if (!r.provincia || !r.especialidad) continue
      const key = `${r.provincia}::${r.especialidad}`
      const prev = byKey[key]
      if (!prev || rank[r.signal_strength] > rank[prev.signal_strength]) byKey[key] = r
    }
    return Object.values(byKey)
      .filter(r => r.signal_strength === 'strong' || r.signal_strength === 'moderate')
      .sort((a, b) => {
        const rd: Record<string, number> = { strong: 2, moderate: 1 }
        if (rd[b.signal_strength] !== rd[a.signal_strength]) return rd[b.signal_strength] - rd[a.signal_strength]
        return a.p_value - b.p_value
      })
  }, [results])

  if (top.length === 0) return (
    <div className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
      Sin señales moderadas o fuertes. Pulsa <strong>Analizar</strong> para ejecutar el análisis estadístico.
    </div>
  )

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {top.map(r => {
        const s = SIGNAL[r.signal_strength]
        const positive = (r.effect_size ?? 0) > 0
        return (
          <button key={r.id} onClick={() => onSelect(r.provincia!, r.especialidad!)}
            className={`text-left rounded-xl border p-4 transition-all hover:shadow-md hover:ring-1 bg-white dark:bg-gray-800/80 ${s.ring} border-gray-100 dark:border-gray-700/60`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{r.provincia}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{r.especialidad}</div>
              </div>
              <SignalBadge strength={r.signal_strength} />
            </div>

            {/* Métricas estadísticas */}
            <div className="flex gap-3 mb-3">
              <div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">p-valor</div>
                <div className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300">{fmt(r.p_value, 4)}</div>
              </div>
              <div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Efecto</div>
                <div className={`text-xs font-mono font-semibold flex items-center gap-0.5 ${positive ? 'text-rojo-alerta' : 'text-verde-sas'}`}>
                  {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {fmt(r.effect_size, 3)}
                </div>
              </div>
              {r.consistency != null && (
                <div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Consistencia</div>
                  <div className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300">{Math.round(r.consistency * 100)}%</div>
                </div>
              )}
              {r.best_lag_hours != null && r.best_lag_hours > 0 && (
                <div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">Lag</div>
                  <div className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-0.5">
                    <Clock size={10} className="text-gray-400" />{fmtLag(r.best_lag_hours)}
                  </div>
                </div>
              )}
            </div>

            {/* Narrativa */}
            {r.narrative && (
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3 border-t border-gray-50 dark:border-gray-700/40 pt-2">
                {r.narrative}
              </p>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ─── Gráfico ──────────────────────────────────────────────────────────────────

function MainChart({ records, events, provincia, especialidad, onProv, onEspec, analysisResult }: {
  records: WaitingRecord[]; events: PrivatizacionEvent[]
  provincia: string; especialidad: string
  onProv: (p: string) => void; onEspec: (e: string) => void
  analysisResult: AnalysisResult | null
}) {
  const data = useMemo(() =>
    records
      .filter(r => r.provincia === provincia && r.especialidad === especialidad)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map(r => ({ fecha: r.fecha, demora: r.demora_media_dias, pacientes: r.pacientes_espera }))
  , [records, provincia, especialidad])

  return (
    <div>
      {/* controles */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <select value={provincia} onChange={e => onProv(e.target.value)}
          className="text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-verde-sas">
          {PROVINCIAS.map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={especialidad} onChange={e => onEspec(e.target.value)}
          className="text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-verde-sas">
          {ESPECIALIDADES.map(e => <option key={e}>{e}</option>)}
        </select>
        {analysisResult && (
          <div className="ml-auto flex items-center gap-2">
            <SignalBadge strength={analysisResult.signal_strength} />
            {analysisResult.best_lag_hours != null && analysisResult.best_lag_hours > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-0.5">
                <Clock size={11} /> mejor lag {fmtLag(analysisResult.best_lag_hours)}
              </span>
            )}
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          Sin datos para {provincia} · {especialidad}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 4, right: 32, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.4} />
            <XAxis dataKey="fecha" tick={{ fontSize: 11, fill: '#9ca3af' }}
              tickFormatter={v => v.slice(0, 7)} axisLine={false} tickLine={false} />
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
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 4px 16px #0002' }}
            />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={v => v === 'demora' ? 'Demora media (días)' : 'Pacientes en espera'} />
            {events.map(e => (
              <ReferenceLine key={e.id} x={e.fecha} yAxisId="left"
                stroke="#E24B4A" strokeDasharray="4 3" strokeWidth={1.5}
                label={{ value: '▼', position: 'insideTopRight', fill: '#E24B4A', fontSize: 8 }} />
            ))}
            <Line yAxisId="left" type="monotone" dataKey="demora" stroke="#3b82f6"
              strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} name="demora" />
            <Line yAxisId="right" type="monotone" dataKey="pacientes" stroke="#f97316"
              strokeWidth={2} dot={false} activeDot={{ r: 4 }} name="pacientes" />
            <Brush dataKey="fecha" height={18} stroke="#d1d5db" fill="transparent" travellerWidth={5} />
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Narrativa del análisis seleccionado */}
      {analysisResult?.narrative && (
        <div className="mt-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700/40">
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{analysisResult.narrative}</p>
          <p className="text-xs text-amber-600 dark:text-amber-500 mt-2 flex items-center gap-1">
            <AlertTriangle size={11} /> Asociación estadística — no implica causalidad
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Tabla completa (colapsable) ──────────────────────────────────────────────

type SortKey = 'provincia' | 'especialidad' | 'p_value' | 'effect_size' | 'signal_strength'

function FullResultsTable({ results }: { results: AnalysisResult[] }) {
  const [open, setOpen] = useState(false)
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
      className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-verde-sas transition-colors whitespace-nowrap">
      {label}{sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : ''}
    </th>
  )

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 dark:bg-gray-800/80 text-left hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <BarChart2 size={14} className="text-verde-sas" />
          Tabla completa de resultados
          {results.length > 0 && <span className="text-xs text-gray-400 dark:text-gray-500">({results.length} combinaciones)</span>}
        </span>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>

      {open && (
        <div className="p-4 bg-white dark:bg-gray-800/80">
          <input type="text" placeholder="Filtrar por provincia, especialidad o señal..."
            value={filter} onChange={e => setFilter(e.target.value)}
            className="w-full mb-3 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-verde-sas" />
          <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700/40">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                  <Th label="Provincia" k="provincia" />
                  <Th label="Especialidad" k="especialidad" />
                  <Th label="Señal" k="signal_strength" />
                  <Th label="p-valor" k="p_value" />
                  <Th label="Efecto" k="effect_size" />
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Lag / Consist.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/30">
                {sorted.slice(0, 200).map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/20 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800 dark:text-gray-200 text-xs">{r.provincia ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-400 text-xs capitalize">{r.especialidad ?? '—'}</td>
                    <td className="px-3 py-2"><SignalBadge strength={r.signal_strength} /></td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">{fmt(r.p_value, 4)}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <span className={`flex items-center gap-0.5 ${(r.effect_size ?? 0) > 0 ? 'text-rojo-alerta' : 'text-verde-sas'}`}>
                        {(r.effect_size ?? 0) > 0 ? <TrendingUp size={10} /> : (r.effect_size ?? 0) < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                        {fmt(r.effect_size, 3)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      {r.best_lag_hours != null ? fmtLag(r.best_lag_hours) : '—'}
                      {r.consistency != null ? ` · ${Math.round(r.consistency * 100)}%` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sorted.length > 200 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-right">
              Mostrando 200 / {sorted.length}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Metodología ──────────────────────────────────────────────────────────────

function Metodologia() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-700/60 overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 bg-gray-50 dark:bg-gray-800/80 text-left hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">¿Cómo funciona este análisis?</span>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-5 py-4 bg-white dark:bg-gray-900 text-sm text-gray-600 dark:text-gray-400 space-y-3 leading-relaxed">
          <p><strong className="text-gray-800 dark:text-gray-200">Mann-Whitney U</strong> — prueba no paramétrica que compara la distribución de demoras en los 90 días posteriores a cada evento con la línea base del año anterior. No asume distribución normal.</p>
          <p><strong className="text-gray-800 dark:text-gray-200">Corrección FDR</strong> (Benjamini-Hochberg) — ajusta los p-valores para controlar la tasa de falsos positivos al comparar las 96 combinaciones provincia×especialidad simultáneamente.</p>
          <p><strong className="text-gray-800 dark:text-gray-200">find_best_lag</strong> — barrido de desfases temporales (0–720 h) para encontrar el intervalo entre evento y respuesta con mayor tamaño del efecto.</p>
          <p><strong className="text-gray-800 dark:text-gray-200">SignificanceConfig</strong> — umbrales calibrados para datos sanitarios trimestrales: efecto fuerte ≥ 0.25, moderado ≥ 0.15, débil ≥ 0.08.</p>
          <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
            <p className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <AlertTriangle size={14} /> Asociación estadística ≠ causalidad
            </p>
            <p className="mt-1 text-amber-700 dark:text-amber-400">
              Los patrones pueden deberse a factores estacionales, demográficos, pandémicos u otros no controlados.
              Los datos de listas de espera son actualmente sintéticos (modelo calibrado con parámetros reales del SAS).
              Las cifras exactas no deben interpretarse como datos oficiales.
            </p>
          </div>
          <p>Motor:{' '}
            <a href="https://pypi.org/project/chrono-correlator/" target="_blank" rel="noopener noreferrer"
              className="text-verde-sas hover:underline inline-flex items-center gap-1">
              chrono-correlator <ExternalLink size={11} />
            </a>
            {' '}· Fuentes: BOJA, Junta de Andalucía, Ministerio de Sanidad · GPL-3.0
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${color}`}>
      <span className="font-bold tabular-nums">{value}</span>
      <span className="opacity-75">{label}</span>
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
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4500) }

  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [recR, evR, anaR] = await Promise.all([
        api.get('/data/waiting-lists', { params: { limit: 4000 } }),
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
      showToast(`Análisis completado — ${r.data.count} combinaciones evaluadas`)
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

  // Resultado de análisis para la combinación actualmente seleccionada en el gráfico
  const activeResult = useMemo(() =>
    results
      .filter(r => r.provincia === provincia && r.especialidad === especialidad)
      .sort((a, b) => new Date(b.ejecutado_en).getTime() - new Date(a.ejecutado_en).getTime())[0] ?? null
  , [results, provincia, especialidad])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-fondo-oscuro text-gray-900 dark:text-gray-100 transition-colors">

      {/* ── Header ── */}
      <header className="bg-verde-sas sticky top-0 z-40 shadow-md">
        <div className="max-w-screen-xl mx-auto px-4 h-14 flex items-center gap-3">
          <Activity size={19} className="text-white/90 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-white font-bold text-lg tracking-tight leading-none">Andalucía Espera</span>
            <span className="hidden md:inline text-white/55 text-xs ml-3">
              listas de espera SAS · análisis no paramétrico · fuentes públicas
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
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-gray-700 text-white text-xs px-4 py-2 rounded-full shadow-lg whitespace-nowrap">
          {toast}
        </div>
      )}

      {/* ── Barra de estadísticas ── */}
      {(records.length > 0 || results.length > 0) && (
        <div className="bg-white dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700/60">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {records.length.toLocaleString('es')} registros · {events.length} eventos
            </span>
            {results.length > 0 && (
              <>
                <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1" />
                <StatPill value={counts.strong}   label="señales fuertes"   color="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20" />
                <StatPill value={counts.moderate} label="moderadas" color="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20" />
                <StatPill value={counts.weak}     label="débiles"   color="text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20" />
                <StatPill value={counts.none}     label="sin señal" color="text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/60" />
              </>
            )}
            {loading && <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto animate-pulse">Cargando…</span>}
          </div>
        </div>
      )}

      <main className="max-w-screen-xl mx-auto px-4 py-6 space-y-5">

        {/* ── 1. Eventos de privatización ── */}
        <EventsTimeline events={events} />

        {/* ── 2. Mapa de señales ── */}
        <Card className="p-5">
          <SectionTitle icon={<BarChart2 size={16} />} sub="Haz clic en una celda para ver la evolución temporal">
            Mapa de señales — provincias × especialidades
          </SectionTitle>
          {results.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              Sin análisis. Pulsa{' '}
              <button onClick={handleAnalysis} className="text-verde-sas hover:underline font-medium">Analizar</button>
              {' '}para detectar asociaciones temporales.
            </div>
          ) : (
            <SignalMap results={results} onCellClick={(p, e) => { setProvincia(p); setEspecialidad(e) }} />
          )}
        </Card>

        {/* ── 3. Señales destacadas ── */}
        {results.length > 0 && (
          <Card className="p-5">
            <SectionTitle icon={<TrendingUp size={16} />} sub="Combinaciones con asociación moderada o fuerte entre evento y demora">
              Señales estadísticas destacadas
            </SectionTitle>
            <TopSignals results={results} onSelect={(p, e) => { setProvincia(p); setEspecialidad(e) }} />
          </Card>
        )}

        {/* ── 4. Gráfico ── */}
        <Card className="p-5">
          <SectionTitle icon={<Activity size={16} />} sub="Evolución trimestral · líneas rojas = eventos de privatización">
            Evolución temporal
          </SectionTitle>
          <MainChart records={records} events={events}
            provincia={provincia} especialidad={especialidad}
            onProv={setProvincia} onEspec={setEspecialidad}
            analysisResult={activeResult} />
        </Card>

        {/* ── 5. Tabla completa (colapsable) ── */}
        {results.length > 0 && <FullResultsTable results={results} />}

        {/* ── 6. Metodología ── */}
        <Metodologia />

      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-200 dark:border-gray-700/60 mt-6 py-5 px-4">
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          Datos: Junta de Andalucía / BOJA (CC BY 4.0) ·{' '}
          <a href="https://pypi.org/project/chrono-correlator/" target="_blank" rel="noopener noreferrer"
            className="hover:text-verde-sas transition-colors">chrono-correlator</a>{' '}
          (Apache 2.0) · Proyecto GPL-3.0 ·{' '}
          <a href="https://github.com/Raulcadiz/andalucia-espera" target="_blank" rel="noopener noreferrer"
            className="hover:text-verde-sas transition-colors">raulcadiz</a>
        </p>
      </footer>

    </div>
  )
}
