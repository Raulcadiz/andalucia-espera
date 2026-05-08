import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Brush, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Moon, Sun, RefreshCw, ChevronDown, ChevronUp, ExternalLink,
  Activity, BarChart2, AlertTriangle, TrendingUp, TrendingDown,
  Clock, CheckCircle2, Building2, Scissors, FileText, ArrowUpRight,
  Minus, MessageCircle, Send, X, Lightbulb, Newspaper,
} from 'lucide-react'
import LegalComplianceSection from './components/LegalComplianceSection'
import BudgetFlowSection from './components/BudgetFlowSection'
import ActorsNetworkSection from './components/ActorsNetworkSection'
import type { LegalResponse, BudgetResponse, ActorsResponse } from './types/analysis'
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

// Promesas vs realidad (datos de informes oficiales y programas electorales)
const PROMESAS = [
  { año: 2018, promesa: 'Reducir listas de espera a máximo 60 días', resultado: 'Demora media traumatología: +34% en 2019–2023 (datos sintéticos calibrados con parámetros SAS)', fuente: 'Programa electoral PP Andalucía 2018' },
  { año: 2018, promesa: 'Reforzar la Atención Primaria como pilar del sistema', resultado: 'AP incluida en concierto privado (BOJA 41/2023), revertido parcialmente en 2024 (BOJA 94/2024)', fuente: 'Programa electoral PP Andalucía 2018' },
  { año: 2019, promesa: 'No reducir el gasto sanitario público en términos reales', resultado: 'Presupuesto SAS 2024 creció 4,1% nominal con IPC sanitario del 6,8% (−2,7% real)', fuente: 'Consejería de Hacienda, Ley Presupuestos 2024' },
  { año: 2022, promesa: 'Plan de choque para eliminar lista de espera quirúrgica', resultado: 'Espera quirúrgica en Andalucía pasó de 74.000 (2021) a 118.000 pacientes (2023) según CMBD-Sanidad', fuente: 'Programa electoral PP Andalucía 2022 · Ministerio de Sanidad' },
]

// Datos de impacto humano (fuentes oficiales)
const IMPACTO_HUMANO = [
  { valor: '~1.200/año', etiqueta: 'Fallecimientos estimados en lista de espera', fuente: 'Escuela Andaluza de Salud Pública 2023' },
  { valor: '118.000', etiqueta: 'Pacientes en espera quirúrgica (2023)', fuente: 'Ministerio de Sanidad, CMBD' },
  { valor: '847', etiqueta: 'Quejas al Defensor del Pueblo (trim. 4/2022)', fuente: 'Informe Defensor del Pueblo Andaluz 2023' },
  { valor: '4.200', etiqueta: 'Déficit de profesionales sanitarios estimado', fuente: 'CCOO-Sanidad Andalucía 2023' },
]

type SignalLevel = 'none' | 'weak' | 'moderate' | 'strong'

// Colores saturados y visibles
const SIGNAL: Record<SignalLevel, { label: string; cell: string; badge: string; dot: string; ring: string; hex: string }> = {
  none:     { label: 'Sin señal',  hex: '#94a3b8', cell: 'bg-slate-200 dark:bg-slate-600/70 hover:bg-slate-300 dark:hover:bg-slate-500/70',   badge: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',   dot: 'bg-slate-400',  ring: 'ring-slate-300' },
  weak:     { label: 'Débil',      hex: '#38bdf8', cell: 'bg-sky-300 dark:bg-sky-700/70 hover:bg-sky-400 dark:hover:bg-sky-600/70',            badge: 'bg-sky-50 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300',         dot: 'bg-sky-500',    ring: 'ring-sky-400' },
  moderate: { label: 'Moderada',   hex: '#f59e0b', cell: 'bg-amber-400 dark:bg-amber-600/80 hover:bg-amber-500 dark:hover:bg-amber-500/80',    badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300', dot: 'bg-amber-500',  ring: 'ring-amber-400' },
  strong:   { label: 'Fuerte',     hex: '#ef4444', cell: 'bg-red-500 dark:bg-red-600/80 hover:bg-red-600 dark:hover:bg-red-500/80',            badge: 'bg-red-50 dark:bg-red-900/40 text-red-700 dark:text-red-300',         dot: 'bg-red-500',    ring: 'ring-red-400' },
}

const TIPO_STYLE: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  concierto:       { color: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', icon: <Building2 size={12} />,    label: 'Concierto' },
  externalización: { color: 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800',                         icon: <ArrowUpRight size={12} />, label: 'Externalización' },
  recorte:         { color: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',                         icon: <Scissors size={12} />,     label: 'Recorte' },
  decreto:         { color: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',             icon: <FileText size={12} />,     label: 'Decreto' },
  cambio_político: { color: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',       icon: <Activity size={12} />,     label: 'Cambio político' },
}

const api = axios.create({ baseURL: '/api' })
const fmt = (n: number, d = 2) => n.toFixed(d)
const fmtEuros = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(0)} M€` : `${(n/1_000).toFixed(0)} k€`
const fmtLag   = (h: number) => { const d = Math.round(h/24); return d < 14 ? `${d}d` : `${Math.round(d/7)} sem` }

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
    <div className="flex items-start gap-2.5 mb-4">
      <span className="text-verde-sas mt-0.5 shrink-0">{icon}</span>
      <div>
        <h2 className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-widest">{children}</h2>
        {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-normal normal-case tracking-normal">{sub}</p>}
      </div>
    </div>
  )
}

// ─── Timeline de eventos ──────────────────────────────────────────────────────

function EventsTimeline({ events }: { events: PrivatizacionEvent[] }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = [...events].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const visible = expanded ? sorted : sorted.slice(0, 5)

  if (events.length === 0) return null

  return (
    <Card className="p-5">
      <SectionTitle icon={<Newspaper size={15} />}
        sub="Órdenes y decretos documentados — empresas adjudicatarias, medios y contexto">
        Cronología de eventos privatización / recortes
      </SectionTitle>

      <div className="relative">
        <div className="absolute left-[4.2rem] top-0 bottom-0 w-px bg-gray-100 dark:bg-gray-700/50 hidden sm:block" />
        <div className="space-y-0">
          {visible.map((ev, i) => {
            const [year, month, day] = ev.fecha.split('-')
            const ts = TIPO_STYLE[ev.tipo] ?? TIPO_STYLE.decreto
            const dotColor = ev.tipo === 'recorte' ? 'bg-red-500' : ev.tipo === 'concierto' ? 'bg-emerald-500' : ev.tipo === 'externalización' ? 'bg-sky-500' : ev.tipo === 'cambio_político' ? 'bg-purple-500' : 'bg-amber-500'
            return (
              <div key={ev.id} className={`flex gap-3 sm:gap-4 ${i < visible.length - 1 ? 'pb-5' : ''}`}>
                <div className="w-[3.8rem] shrink-0 text-right pt-0.5">
                  <div className="text-xs font-bold text-gray-700 dark:text-gray-200 tabular-nums leading-none">{day}/{month}</div>
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">{year}</div>
                </div>
                <div className="relative z-10 mt-1.5 shrink-0 hidden sm:block">
                  <div className={`w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800 shadow ${dotColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${ts.color}`}>
                      {ts.icon}{ts.label}
                    </span>
                    {ev.confirmado && (
                      <span className="inline-flex items-center gap-0.5 text-[11px] text-verde-sas font-semibold">
                        <CheckCircle2 size={10} /> BOJA verificado
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-200 leading-snug">{ev.descripcion}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-1">
                    {ev.importe_euros != null && (
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full">
                        {fmtEuros(ev.importe_euros)}
                      </span>
                    )}
                    {ev.fuente_url && (
                      <a href={ev.fuente_url} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-gray-400 hover:text-verde-sas transition-colors inline-flex items-center gap-0.5">
                        Fuente oficial <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {sorted.length > 5 && (
        <button onClick={() => setExpanded(v => !v)}
          className="mt-3 w-full text-xs text-gray-400 hover:text-verde-sas transition-colors flex items-center justify-center gap-1 py-1">
          {expanded ? <><ChevronUp size={12} /> Mostrar menos</> : <><ChevronDown size={12} /> Ver {sorted.length - 5} más</>}
        </button>
      )}
    </Card>
  )
}

// ─── Impacto humano + promesas ────────────────────────────────────────────────

function ImpactoYPromesas() {
  const [tab, setTab] = useState<'impacto' | 'promesas'>('impacto')
  return (
    <Card className="p-5">
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-700/50 rounded-xl p-1">
        <button onClick={() => setTab('impacto')}
          className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${tab === 'impacto' ? 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
          Impacto humano
        </button>
        <button onClick={() => setTab('promesas')}
          className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${tab === 'promesas' ? 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
          Promesas vs realidad
        </button>
      </div>

      {tab === 'impacto' && (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {IMPACTO_HUMANO.map((item, i) => (
              <div key={i} className="bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3 text-center">
                <div className={`text-xl font-bold tabular-nums ${i === 0 ? 'text-rojo-alerta' : 'text-gray-800 dark:text-gray-100'}`}>{item.valor}</div>
                <div className="text-[11px] text-gray-600 dark:text-gray-400 mt-1 leading-tight">{item.etiqueta}</div>
                <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 italic">{item.fuente}</div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 flex items-start gap-1.5">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            Estas cifras son estadísticas de mortalidad evitable, no casos individuales atribuibles a causas concretas. Los datos provienen de fuentes oficiales.
          </p>
        </div>
      )}

      {tab === 'promesas' && (
        <div className="space-y-3">
          {PROMESAS.map((p, i) => (
            <div key={i} className="rounded-xl border border-gray-100 dark:border-gray-700/40 overflow-hidden">
              <div className="bg-gray-50 dark:bg-gray-700/40 px-3 py-1.5 flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Promesa {p.año}</span>
              </div>
              <div className="px-3 py-2 grid sm:grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] font-semibold text-verde-sas uppercase tracking-wider mb-0.5">Lo prometido</div>
                  <p className="text-xs text-gray-700 dark:text-gray-300">{p.promesa}</p>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-rojo-alerta uppercase tracking-wider mb-0.5">Lo registrado</div>
                  <p className="text-xs text-gray-700 dark:text-gray-300">{p.resultado}</p>
                </div>
              </div>
              <div className="px-3 pb-1.5">
                <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">{p.fuente}</span>
              </div>
            </div>
          ))}
          <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">
            Esta sección compara objetivos públicamente declarados con indicadores medibles. No implica juicio sobre intenciones.
          </p>
        </div>
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

  const hasData = Object.keys(signalMap).length > 0

  return (
    <div>
      {!hasData && (
        <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
          Sin datos de análisis. Pulsa <button className="text-verde-sas hover:underline font-medium">Analizar</button> para detectar patrones.
        </div>
      )}
      {hasData && (
        <>
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="border-separate border-spacing-1 text-xs mx-auto">
              <thead>
                <tr>
                  <th className="w-20 sm:w-24" />
                  {ESPECIALIDADES.map(e => (
                    <th key={e} className="pb-1">
                      <div className="text-gray-400 dark:text-gray-500 font-normal text-[10px]"
                        style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 70, lineHeight: 1.2 }}>
                        {e}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PROVINCIAS.map(prov => (
                  <tr key={prov}>
                    <td className="pr-2 text-right font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap text-[11px] sm:text-xs">
                      {prov}
                    </td>
                    {ESPECIALIDADES.map(espec => {
                      const strength = (signalMap[`${prov}::${espec}`] ?? 'none') as SignalLevel
                      const s = SIGNAL[strength]
                      const r = results.find(x => x.provincia === prov && x.especialidad === espec)
                      return (
                        <td key={espec} className="p-0">
                          <button
                            onClick={() => onCellClick(prov, espec)}
                            title={r ? `${prov} · ${espec}\np=${fmt(r.p_value,4)}  efecto=${fmt(r.effect_size,3)}\n${s.label}` : `${prov} · ${espec}`}
                            className={`w-7 h-6 sm:w-8 sm:h-7 rounded transition-all duration-100 hover:ring-2 hover:ring-offset-1 hover:ring-verde-sas ${s.cell}`}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-center flex-wrap gap-2 mt-3">
            {(Object.entries(SIGNAL) as [SignalLevel, typeof SIGNAL[SignalLevel]][]).map(([k, v]) => (
              <span key={k} className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${v.badge}`}>
                <span className="w-2 h-2 rounded-sm" style={{ background: v.hex }} />
                {v.label}
              </span>
            ))}
          </div>
          <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 mt-1">Clic en una celda → ver evolución temporal</p>
        </>
      )}
    </div>
  )
}

// ─── Señales destacadas ───────────────────────────────────────────────────────

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
        return rd[b.signal_strength] !== rd[a.signal_strength]
          ? rd[b.signal_strength] - rd[a.signal_strength]
          : a.p_value - b.p_value
      })
  }, [results])

  if (top.length === 0) return (
    <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
      Sin señales moderadas o fuertes. Pulsa <strong>Analizar</strong> para ejecutar el análisis.
    </div>
  )

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {top.map(r => {
        const s = SIGNAL[r.signal_strength]
        const positive = (r.effect_size ?? 0) > 0
        return (
          <button key={r.id} onClick={() => onSelect(r.provincia!, r.especialidad!)}
            className={`text-left rounded-xl border p-4 transition-all hover:shadow-md hover:ring-1 bg-white dark:bg-gray-800/70 border-gray-100 dark:border-gray-700/50 ${s.ring}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{r.provincia}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">{r.especialidad}</div>
              </div>
              <SignalBadge strength={r.signal_strength} />
            </div>
            <div className="flex flex-wrap gap-3 mb-2.5">
              <div>
                <div className="text-[9px] text-gray-400 uppercase tracking-wider">p-valor</div>
                <div className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300">{fmt(r.p_value, 4)}</div>
              </div>
              <div>
                <div className="text-[9px] text-gray-400 uppercase tracking-wider">Efecto</div>
                <div className={`text-xs font-mono font-semibold flex items-center gap-0.5 ${positive ? 'text-rojo-alerta' : 'text-verde-sas'}`}>
                  {positive ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                  {fmt(r.effect_size, 3)}
                </div>
              </div>
              {r.consistency != null && (
                <div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wider">Consist.</div>
                  <div className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300">{Math.round(r.consistency * 100)}%</div>
                </div>
              )}
              {r.best_lag_hours != null && r.best_lag_hours > 0 && (
                <div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wider">Lag</div>
                  <div className="text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-0.5">
                    <Clock size={9}/>{fmtLag(r.best_lag_hours)}
                  </div>
                </div>
              )}
            </div>
            {r.narrative && (
              <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-3 border-t border-gray-50 dark:border-gray-700/30 pt-2">
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
      <div className="flex flex-wrap items-center gap-2 mb-4">
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
              <span className="text-xs text-gray-400 flex items-center gap-0.5"><Clock size={10}/> lag {fmtLag(analysisResult.best_lag_hours)}</span>
            )}
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Sin datos para {provincia} · {especialidad}</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 4, right: 32, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.4} />
            <XAxis dataKey="fecha" tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={v => v.slice(0,7)} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left"  tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
              label={{ value: 'días', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 9, fill: '#9ca3af' } }} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
              label={{ value: 'pacientes', angle: 90, position: 'insideRight', offset: 12, style: { fontSize: 9, fill: '#9ca3af' } }} />
            <Tooltip
              formatter={(v, name) => [name === 'demora' ? `${Number(v).toFixed(1)} días` : Number(v).toLocaleString('es'), name === 'demora' ? 'Demora media' : 'Pacientes']}
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb', boxShadow: '0 4px 16px #0002' }} />
            <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
              formatter={v => v === 'demora' ? 'Demora media (días)' : 'Pacientes en espera'} />
            {events.map(e => (
              <ReferenceLine key={e.id} x={e.fecha} yAxisId="left" stroke="#E24B4A" strokeDasharray="4 3" strokeWidth={1.5}
                label={{ value: '▼', position: 'insideTopRight', fill: '#E24B4A', fontSize: 8 }} />
            ))}
            <Line yAxisId="left"  type="monotone" dataKey="demora"    stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            <Line yAxisId="right" type="monotone" dataKey="pacientes" stroke="#f97316" strokeWidth={2}   dot={false} activeDot={{ r: 4 }} />
            <Brush dataKey="fecha" height={16} stroke="#d1d5db" fill="transparent" travellerWidth={5} />
          </LineChart>
        </ResponsiveContainer>
      )}

      {analysisResult?.narrative && (
        <div className="mt-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700/30">
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{analysisResult.narrative}</p>
          <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-1.5 flex items-center gap-1">
            <AlertTriangle size={10}/> Asociación estadística — no implica causalidad
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Tabla completa ───────────────────────────────────────────────────────────

type SortKey = 'provincia' | 'especialidad' | 'p_value' | 'effect_size' | 'signal_strength'

function FullResultsTable({ results }: { results: AnalysisResult[] }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('p_value')
  const [sortAsc, setSortAsc] = useState(true)

  const sorted = useMemo(() => {
    const q = filter.toLowerCase()
    return results
      .filter(r => (r.provincia?.toLowerCase().includes(q) ?? false) || (r.especialidad?.toLowerCase().includes(q) ?? false) || r.signal_strength.includes(q))
      .sort((a, b) => {
        const va = a[sortKey] ?? ''; const vb = b[sortKey] ?? ''
        return sortAsc ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0)
      })
  }, [results, filter, sortKey, sortAsc])

  const toggleSort = (k: SortKey) => { if (sortKey === k) setSortAsc(v => !v); else { setSortKey(k); setSortAsc(true) } }
  const Th = ({ label, k }: { label: string; k: SortKey }) => (
    <th onClick={() => toggleSort(k)} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-verde-sas transition-colors whitespace-nowrap">
      {label}{sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : ''}
    </th>
  )

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-700/50 overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/70 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <BarChart2 size={13} className="text-verde-sas" />
          Tabla completa de resultados
          {results.length > 0 && <span className="text-gray-400 dark:text-gray-500">({results.length})</span>}
        </span>
        {open ? <ChevronUp size={13} className="text-gray-400"/> : <ChevronDown size={13} className="text-gray-400"/>}
      </button>
      {open && (
        <div className="p-4 bg-white dark:bg-gray-800/70">
          <input type="text" placeholder="Filtrar..." value={filter} onChange={e => setFilter(e.target.value)}
            className="w-full mb-3 text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 px-4 py-1.5 focus:outline-none focus:ring-2 focus:ring-verde-sas" />
          <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-700/30">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <Th label="Provincia" k="provincia" />
                  <Th label="Especialidad" k="especialidad" />
                  <Th label="Señal" k="signal_strength" />
                  <Th label="p-valor" k="p_value" />
                  <Th label="Efecto" k="effect_size" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/20">
                {sorted.slice(0, 200).map(r => (
                  <tr key={r.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/20 transition-colors">
                    <td className="px-3 py-1.5 whitespace-nowrap font-medium text-gray-800 dark:text-gray-200">{r.provincia ?? '—'}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-gray-500 dark:text-gray-400 capitalize">{r.especialidad ?? '—'}</td>
                    <td className="px-3 py-1.5"><SignalBadge strength={r.signal_strength} /></td>
                    <td className="px-3 py-1.5 font-mono text-gray-600 dark:text-gray-400">{fmt(r.p_value, 4)}</td>
                    <td className="px-3 py-1.5 font-mono">
                      <span className={`flex items-center gap-0.5 ${(r.effect_size ?? 0) > 0 ? 'text-rojo-alerta' : 'text-verde-sas'}`}>
                        {(r.effect_size ?? 0) > 0 ? <TrendingUp size={9}/> : (r.effect_size ?? 0) < 0 ? <TrendingDown size={9}/> : <Minus size={9}/>}
                        {fmt(r.effect_size, 3)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Metodología ──────────────────────────────────────────────────────────────

function Metodologia() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-700/50 overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 bg-gray-50 dark:bg-gray-800/70 text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">¿Cómo funciona este análisis?</span>
        {open ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
      </button>
      {open && (
        <div className="px-5 py-4 bg-white dark:bg-gray-900 text-xs text-gray-600 dark:text-gray-400 space-y-2.5 leading-relaxed">
          <p><strong className="text-gray-800 dark:text-gray-200">Mann-Whitney U</strong> — compara demoras 90 días post-evento vs línea base del año anterior. No paramétrico, no asume distribución normal.</p>
          <p><strong className="text-gray-800 dark:text-gray-200">Corrección FDR</strong> (Benjamini-Hochberg) — controla falsos positivos en 96 comparaciones simultáneas.</p>
          <p><strong className="text-gray-800 dark:text-gray-200">find_best_lag</strong> — barrido 0–720 h para encontrar el desfase con mayor tamaño del efecto.</p>
          <p><strong className="text-gray-800 dark:text-gray-200">SignificanceConfig</strong> — umbrales calibrados: efecto fuerte ≥ 0.25, moderado ≥ 0.15, débil ≥ 0.08.</p>
          <p><strong className="text-gray-800 dark:text-gray-200">Datos</strong> — lista de espera: sintéticos calibrados con parámetros reales SAS (datos oficiales no disponibles por API). Eventos: BOJA y fuentes oficiales documentadas.</p>
          <div className="p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
            <p className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1"><AlertTriangle size={12}/> Asociación estadística ≠ causalidad</p>
            <p className="mt-1 text-amber-700 dark:text-amber-400">Factores estacionales, demográficos, pandémicos u otros no controlados pueden explicar los patrones detectados.</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Asistente IA ─────────────────────────────────────────────────────────────

interface ChatMessage { role: 'user' | 'assistant'; text: string }

function AssistantChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [tips, setTips]         = useState<{ id: number; text: string }[]>([])
  const [source, setSource]     = useState<'groq' | 'local' | ''>('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.get('/assistant/tips').then(r => setTips(r.data)).catch(() => {})
  }, [])

  useEffect(() => {
    if (open && messages.length === 0 && tips.length > 0) {
      setMessages([{
        role: 'assistant',
        text: `Hola. Puedo responder preguntas sobre este análisis estadístico, los eventos documentados o la metodología.\n\n💡 ${tips[0]?.text}`,
      }])
    }
  }, [open, tips, messages.length])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text: q }])
    setLoading(true)
    try {
      const r = await api.post('/assistant/ask', { question: q })
      setMessages(m => [...m, { role: 'assistant', text: r.data.answer }])
      setSource(r.data.source)
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: 'Error al conectar con el asistente. El backend debe estar disponible.' }])
    } finally {
      setLoading(false)
    }
  }

  const tipSuggestions = tips.slice(1, 4)

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-5 right-5 z-50 w-12 h-12 bg-verde-sas hover:bg-green-600 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        title="Asistente IA">
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>

      {/* Panel de chat */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 w-80 sm:w-96 max-h-[70vh] flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden">
          {/* Cabecera */}
          <div className="px-4 py-3 bg-verde-sas flex items-center gap-2">
            <Lightbulb size={15} className="text-white/80" />
            <div className="flex-1">
              <span className="text-white text-sm font-semibold">Asistente Andalucía Espera</span>
              {source && (
                <span className="text-white/60 text-[10px] ml-2">{source === 'groq' ? '· Groq AI' : '· local'}</span>
              )}
            </div>
          </div>

          {/* Mensajes */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-verde-sas text-white rounded-br-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-bl-sm'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-xl rounded-bl-sm px-3 py-2">
                  <span className="text-xs text-gray-400 animate-pulse">Pensando…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Sugerencias rápidas */}
          {messages.length <= 1 && tipSuggestions.length > 0 && (
            <div className="px-3 pb-2 flex flex-col gap-1">
              {tipSuggestions.map(t => (
                <button key={t.id} onClick={() => { setInput(t.text.replace(/^💡\s*/, '')); }}
                  className="text-left text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 px-2.5 py-1.5 rounded-lg transition-colors truncate">
                  {t.text.length > 60 ? t.text.slice(0, 60) + '…' : t.text}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="px-3 py-2.5 border-t border-gray-100 dark:border-gray-700/50 flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Pregunta algo…"
              className="flex-1 text-xs rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-verde-sas"
            />
            <button onClick={send} disabled={loading || !input.trim()}
              className="bg-verde-sas hover:bg-green-600 disabled:opacity-40 text-white rounded-xl px-3 py-1.5 transition-colors">
              <Send size={13} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ─── StatPill ─────────────────────────────────────────────────────────────────

function StatPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${color}`}>
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
  const [provincia, setProvincia]       = useState('Sevilla')
  const [especialidad, setEspecialidad] = useState('traumatología')
  const [loading, setLoading]     = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [analyzing, setAnalyzing]  = useState(false)
  const [toast, setToast]          = useState('')

  // Nuevas secciones
  const [legalData, setLegalData]   = useState<LegalResponse | null>(null)
  const [budgetData, setBudgetData] = useState<BudgetResponse | null>(null)
  const [actorsData, setActorsData] = useState<ActorsResponse | null>(null)
  const [loadingExtra, setLoadingExtra] = useState(false)

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

  useEffect(() => {
    setLoadingExtra(true)
    Promise.all([
      api.get('/legal/compliance-impact').catch(() => null),
      api.get('/budget/analysis').catch(() => null),
      api.get('/actors/influence').catch(() => null),
    ]).then(([legalR, budgetR, actorsR]) => {
      if (legalR)  setLegalData(legalR.data)
      if (budgetR) setBudgetData(budgetR.data)
      if (actorsR) setActorsData(actorsR.data)
    }).finally(() => setLoadingExtra(false))
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const r = await api.post('/data/refresh')
      showToast(`Actualizado — ${r.data.records_added} registros nuevos`)
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
    } finally { setAnalyzing(false) }
  }

  const counts = useMemo(() => ({
    strong:   results.filter(r => r.signal_strength === 'strong').length,
    moderate: results.filter(r => r.signal_strength === 'moderate').length,
    weak:     results.filter(r => r.signal_strength === 'weak').length,
    none:     results.filter(r => r.signal_strength === 'none').length,
  }), [results])

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
            <span className="text-white font-bold text-lg tracking-tight">Andalucía Espera</span>
            <span className="hidden md:inline text-white/50 text-xs ml-3">listas de espera SAS · datos públicos · estadística</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={handleAnalysis} disabled={analyzing}
              className="hidden sm:flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 text-white rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
              <BarChart2 size={12}/>{analyzing ? 'Analizando…' : 'Analizar'}
            </button>
            <button onClick={handleRefresh} disabled={refreshing}
              className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 text-white rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50">
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''}/>
              <span className="hidden sm:inline">{refreshing ? 'Actualizando…' : 'Actualizar'}</span>
            </button>
            <button onClick={() => setDark(v => !v)} className="p-1.5 bg-white/15 hover:bg-white/25 text-white rounded-lg transition-colors">
              {dark ? <Sun size={13}/> : <Moon size={13}/>}
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

      {/* ── Stats bar ── */}
      {(records.length > 0 || results.length > 0) && (
        <div className="bg-white dark:bg-gray-800/80 border-b border-gray-100 dark:border-gray-700/50">
          <div className="max-w-screen-xl mx-auto px-4 py-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-gray-400 dark:text-gray-500">{records.length.toLocaleString('es')} registros · {events.length} eventos</span>
            {results.length > 0 && (
              <>
                <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1"/>
                <StatPill value={counts.strong}   label="fuertes"   color="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20"/>
                <StatPill value={counts.moderate} label="moderadas" color="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20"/>
                <StatPill value={counts.weak}     label="débiles"   color="text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20"/>
                <StatPill value={counts.none}     label="sin señal" color="text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/60"/>
              </>
            )}
            {loading && <span className="text-[11px] text-gray-400 ml-auto animate-pulse">Cargando…</span>}
          </div>
        </div>
      )}

      <main className="max-w-screen-xl mx-auto px-4 py-5 space-y-4">

        {/* ── 1. Eventos ── */}
        <EventsTimeline events={events} />

        {/* ── 2. Impacto + Promesas ── */}
        <ImpactoYPromesas />

        {/* ── 3. Marco legal ── */}
        <LegalComplianceSection data={legalData} loading={loadingExtra} />

        {/* ── 5. Mapa de señales ── */}
        <Card className="p-5">
          <SectionTitle icon={<BarChart2 size={15}/>}
            sub="Cada celda = provincia × especialidad. Rojo=fuerte · Naranja=moderada · Azul=débil · Gris=sin señal">
            Mapa de señales estadísticas
          </SectionTitle>
          {results.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              Sin análisis. Pulsa{' '}
              <button onClick={handleAnalysis} className="text-verde-sas hover:underline font-medium">Analizar</button>
              {' '}para detectar asociaciones temporales.
            </div>
          ) : (
            <SignalMap results={results} onCellClick={(p, e) => { setProvincia(p); setEspecialidad(e) }} />
          )}
        </Card>

        {/* ── 5b. Señales destacadas ── */}
        {results.length > 0 && (
          <Card className="p-5">
            <SectionTitle icon={<TrendingUp size={15}/>}
              sub="Combinaciones con asociación moderada o fuerte — narrativa generada automáticamente">
              Señales estadísticas destacadas
            </SectionTitle>
            <TopSignals results={results} onSelect={(p, e) => { setProvincia(p); setEspecialidad(e) }} />
          </Card>
        )}

        {/* ── 5c. Gráfico ── */}
        <Card className="p-5">
          <SectionTitle icon={<Activity size={15}/>}
            sub="Evolución trimestral · líneas rojas = eventos documentados">
            Evolución temporal
          </SectionTitle>
          <MainChart records={records} events={events}
            provincia={provincia} especialidad={especialidad}
            onProv={setProvincia} onEspec={setEspecialidad}
            analysisResult={activeResult} />
        </Card>

        {/* ── 6. Flujo de dinero ── */}
        <BudgetFlowSection data={budgetData} loading={loadingExtra} />

        {/* ── 7. Red de actores ── */}
        <ActorsNetworkSection data={actorsData} loading={loadingExtra} />

        {/* ── 8. Empresas e información adicional ── */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Card className="p-4">
            <SectionTitle icon={<Building2 size={14}/>} sub="Principales beneficiarios de conciertos SAS según BOJA y Portal Transparencia">
              Empresas adjudicatarias
            </SectionTitle>
            <ul className="space-y-2 text-xs">
              {[
                { nombre: 'Quirónsalud', detalle: 'Grupo Fresenius-Helios (Alemania). Mayor red hospitalaria privada en Andalucía.', esp: 'Traumatología, oftalmología, cirugía' },
                { nombre: 'Vithas', detalle: 'Grupo Asisa (España). Hospitales en Sevilla, Granada y Málaga.', esp: 'Especialidades médicas y quirúrgicas' },
                { nombre: 'HM Hospitales', detalle: 'Grupo HM (España). Presencia creciente desde 2021.', esp: 'Oncología, cardiología' },
                { nombre: 'Hospiten', detalle: 'Grupo Hospiten (España-RU). Fuerte en Málaga y Costa del Sol.', esp: 'Urgencias, traumatología' },
                { nombre: 'Beata María Ana', detalle: 'Orden religiosa. Hospitales históricos concertados.', esp: 'Diversas especialidades' },
              ].map(e => (
                <li key={e.nombre} className="flex gap-2 py-1.5 border-b border-gray-50 dark:border-gray-700/30 last:border-0">
                  <div className="w-2 h-2 mt-1 rounded-full bg-emerald-400 shrink-0"/>
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{e.nombre}</span>
                    <span className="text-gray-500 dark:text-gray-400"> — {e.detalle}</span>
                    <div className="text-gray-400 dark:text-gray-500 italic mt-0.5">{e.esp}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="p-4">
            <SectionTitle icon={<Newspaper size={14}/>} sub="Medios que han cubierto la privatización sanitaria en Andalucía">
              Cobertura mediática
            </SectionTitle>
            <ul className="space-y-2 text-xs">
              {[
                { medio: 'elDiario.es Andalucía', cobertura: 'Investigación continuada sobre conciertos SAS 2019–2024. Datos de Portal Transparencia.' },
                { medio: 'El País Andalucía', cobertura: 'Informes sobre listas de espera y privatización hospitalaria.' },
                { medio: 'La Marea', cobertura: 'Reportajes sobre externalización diagnóstico y recortes de plantilla.' },
                { medio: 'RTVE Andalucía', cobertura: 'Informativos sobre manifestaciones Marea Blanca y datos Defensor del Pueblo.' },
                { medio: 'Público', cobertura: 'Análisis presupuestario y cobertura de la Orden BOJA 94/2024.' },
              ].map(e => (
                <li key={e.medio} className="flex gap-2 py-1.5 border-b border-gray-50 dark:border-gray-700/30 last:border-0">
                  <div className="w-2 h-2 mt-1 rounded-full bg-sky-400 shrink-0"/>
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{e.medio}</span>
                    <span className="text-gray-500 dark:text-gray-400"> — {e.cobertura}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* ── 9. Tabla completa ── */}
        {results.length > 0 && <FullResultsTable results={results} />}

        {/* ── 10. Metodología ── */}
        <Metodologia />

      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-200 dark:border-gray-700/50 mt-4 py-5 px-4">
        <p className="text-center text-[11px] text-gray-400 dark:text-gray-500">
          Datos: BOJA / Junta de Andalucía (CC BY 4.0) ·{' '}
          <a href="https://pypi.org/project/chrono-correlator/" target="_blank" rel="noopener noreferrer" className="hover:text-verde-sas">chrono-correlator</a>{' '}
          (Apache 2.0) · GPL-3.0 ·{' '}
          <a href="https://github.com/Raulcadiz/andalucia-espera" target="_blank" rel="noopener noreferrer" className="hover:text-verde-sas">raulcadiz</a>
        </p>
      </footer>

      {/* ── Asistente flotante ── */}
      <AssistantChat />

    </div>
  )
}
