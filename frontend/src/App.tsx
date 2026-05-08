import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Brush, ResponsiveContainer, Legend,
} from 'recharts'
import { Moon, Sun, RefreshCw, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import './index.css'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface WaitingRecord {
  id: number
  fecha: string
  provincia: string
  especialidad: string
  pacientes_espera: number
  demora_media_dias: number
  fuente: string
}

interface PrivatizacionEvent {
  id: number
  fecha: string
  tipo: string
  descripcion: string
  consejeria: string
  importe_euros: number | null
  fuente_url: string
}

interface AnalysisResult {
  id: number
  ejecutado_en: string
  metrica: string
  provincia: string | null
  especialidad: string | null
  p_value: number
  effect_size: number
  signal_strength: 'none' | 'moderate' | 'strong'
  narrative: string | null
  n_events: number
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const PROVINCIAS = ['Almería','Cádiz','Córdoba','Granada','Huelva','Jaén','Málaga','Sevilla']
const ESPECIALIDADES = [
  'cardiología','dermatología','digestivo','endocrinología',
  'ginecología','neurología','neumología','oftalmología',
  'otorrinolaringología','reumatología','traumatología','urología',
]

const SIGNAL_CONFIG = {
  none:     { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-800 dark:text-emerald-300', label: 'Sin señal', dot: 'bg-emerald-500' },
  moderate: { bg: 'bg-yellow-100 dark:bg-yellow-900/40',  text: 'text-yellow-800 dark:text-yellow-300',  label: 'Moderada',  dot: 'bg-yellow-500' },
  strong:   { bg: 'bg-red-100 dark:bg-red-900/40',        text: 'text-red-800 dark:text-red-300',        label: 'Fuerte',    dot: 'bg-red-500' },
}

const api = axios.create({ baseURL: '/api' })

function fmt(n: number, decimals = 2) { return n.toFixed(decimals) }
function signalConfig(s: string) { return SIGNAL_CONFIG[s as keyof typeof SIGNAL_CONFIG] ?? SIGNAL_CONFIG.none }

// ─── Badge de señal ───────────────────────────────────────────────────────────

function SignalBadge({ strength }: { strength: string }) {
  const cfg = signalConfig(strength)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ─── Mapa de señales ──────────────────────────────────────────────────────────

function SignalMap({ results, onCellClick }: { results: AnalysisResult[]; onCellClick: (p: string, e: string) => void }) {
  const signalMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const r of results) {
      if (r.provincia && r.especialidad) {
        const key = `${r.provincia}::${r.especialidad}`
        const prev = m[key]
        const rank = { none: 0, moderate: 1, strong: 2 }
        if (!prev || (rank[r.signal_strength as keyof typeof rank] ?? 0) > (rank[prev as keyof typeof rank] ?? 0)) {
          m[key] = r.signal_strength
        }
      }
    }
    return m
  }, [results])

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-xs">
        <thead>
          <tr>
            <th className="text-left p-1 pr-3 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap min-w-24" />
            {ESPECIALIDADES.map(e => (
              <th key={e} className="p-1 font-medium text-gray-500 dark:text-gray-400">
                <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 80 }} className="whitespace-nowrap">
                  {e}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PROVINCIAS.map(prov => (
            <tr key={prov}>
              <td className="p-1 pr-3 font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">{prov}</td>
              {ESPECIALIDADES.map(espec => {
                const strength = signalMap[`${prov}::${espec}`] ?? 'none'
                const cfg = signalConfig(strength)
                const r = results.find(x => x.provincia === prov && x.especialidad === espec)
                return (
                  <td key={espec} className="p-0.5">
                    <button
                      onClick={() => onCellClick(prov, espec)}
                      title={r ? `p=${fmt(r.p_value, 4)}\n${r.narrative ?? ''}` : `${prov} · ${espec}`}
                      className={`w-7 h-7 rounded cursor-pointer transition-all hover:ring-2 hover:ring-green-500 hover:ring-offset-1 ${cfg.bg}`}
                    />
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
        {Object.entries(SIGNAL_CONFIG).map(([k, v]) => (
          <span key={k} className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${v.bg} ${v.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />
            {v.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Gráfico principal ────────────────────────────────────────────────────────

function MainChart({
  records, events, provincia, especialidad, onProvinciaChange, onEspecialidadChange,
}: {
  records: WaitingRecord[]
  events: PrivatizacionEvent[]
  provincia: string
  especialidad: string
  onProvinciaChange: (p: string) => void
  onEspecialidadChange: (e: string) => void
}) {
  const data = useMemo(() =>
    records
      .filter(r => r.provincia === provincia && r.especialidad === especialidad)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map(r => ({ fecha: r.fecha, demora: r.demora_media_dias, pacientes: r.pacientes_espera }))
  , [records, provincia, especialidad])

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <select value={provincia} onChange={e => onProvinciaChange(e.target.value)}
          className="text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1">
          {PROVINCIAS.map(p => <option key={p}>{p}</option>)}
        </select>
        <select value={especialidad} onChange={e => onEspecialidadChange(e.target.value)}
          className="text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1">
          {ESPECIALIDADES.map(e => <option key={e}>{e}</option>)}
        </select>
      </div>
      {data.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-gray-400 dark:text-gray-500">
          Sin datos para {provincia} · {especialidad}
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data} margin={{ top: 5, right: 30, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis dataKey="fecha" tick={{ fontSize: 11 }} tickFormatter={v => v.slice(0, 7)} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }}
                label={{ value: 'Demora (días)', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 11 } }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }}
                label={{ value: 'Pacientes', angle: 90, position: 'insideRight', offset: 10, style: { fontSize: 11 } }} />
              <Tooltip
                formatter={(value, name) => [
                  name === 'demora' ? `${Number(value).toFixed(1)} días` : Number(value).toLocaleString('es'),
                  name === 'demora' ? 'Demora media' : 'Pacientes en espera',
                ]}
                labelFormatter={(l) => `Fecha: ${l}`}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend formatter={v => v === 'demora' ? 'Demora media (días)' : 'Pacientes en espera'} />
              {events.map(e => (
                <ReferenceLine key={e.id} x={e.fecha} yAxisId="left"
                  stroke="#E24B4A" strokeDasharray="4 2" strokeWidth={1.5}
                  label={{ value: '▼', position: 'top', fill: '#E24B4A', fontSize: 10 }}
                />
              ))}
              <Line yAxisId="left" type="monotone" dataKey="demora" stroke="#3b82f6" strokeWidth={2} dot={false} name="demora" />
              <Line yAxisId="right" type="monotone" dataKey="pacientes" stroke="#f97316" strokeWidth={2} dot={false} name="pacientes" />
              <Brush dataKey="fecha" height={20} stroke="#6b7280" travellerWidth={6} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Líneas rojas discontinuas = eventos de privatización o recortes registrados
          </p>
        </>
      )}
    </div>
  )
}

// ─── Tabla de resultados ──────────────────────────────────────────────────────

type SortKey = 'provincia' | 'especialidad' | 'p_value' | 'effect_size' | 'signal_strength'

function ResultsTable({ results, onNarrativeClick }: { results: AnalysisResult[]; onNarrativeClick: (r: AnalysisResult) => void }) {
  const [filter, setFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('p_value')
  const [sortAsc, setSortAsc] = useState(true)

  const sorted = useMemo(() => {
    const q = filter.toLowerCase()
    const filtered = results.filter(r =>
      (r.provincia?.toLowerCase().includes(q) ?? false) ||
      (r.especialidad?.toLowerCase().includes(q) ?? false) ||
      r.signal_strength.includes(q)
    )
    return filtered.sort((a, b) => {
      const va = a[sortKey] ?? ''; const vb = b[sortKey] ?? ''
      return sortAsc ? (va < vb ? -1 : va > vb ? 1 : 0) : (va > vb ? -1 : va < vb ? 1 : 0)
    })
  }, [results, filter, sortKey, sortAsc])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(v => !v)
    else { setSortKey(key); setSortAsc(true) }
  }

  const Th = ({ label, k }: { label: string; k: SortKey }) => (
    <th onClick={() => toggleSort(k)}
      className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none whitespace-nowrap">
      {label} {sortKey === k ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  )

  if (results.length === 0) return (
    <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
      Sin resultados de análisis. Pulsa "Ejecutar análisis" para comenzar.
    </div>
  )

  return (
    <div>
      <input type="text" placeholder="Filtrar por provincia, especialidad o señal..."
        value={filter} onChange={e => setFilter(e.target.value)}
        className="w-full mb-3 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5" />
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <Th label="Provincia" k="provincia" />
              <Th label="Especialidad" k="especialidad" />
              <Th label="p-valor" k="p_value" />
              <Th label="Efecto" k="effect_size" />
              <Th label="Señal" k="signal_strength" />
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Narrativa
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
            {sorted.slice(0, 200).map(r => (
              <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-3 py-2 whitespace-nowrap">{r.provincia ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{r.especialidad ?? '—'}</td>
                <td className="px-3 py-2 font-mono text-xs">{fmt(r.p_value, 4)}</td>
                <td className="px-3 py-2 font-mono text-xs">{fmt(r.effect_size, 3)}</td>
                <td className="px-3 py-2"><SignalBadge strength={r.signal_strength} /></td>
                <td className="px-3 py-2">
                  {r.narrative
                    ? <button onClick={() => onNarrativeClick(r)}
                        className="text-green-600 dark:text-green-400 hover:underline text-xs max-w-xs truncate block text-left">
                        {r.narrative.slice(0, 60)}…
                      </button>
                    : <span className="text-gray-400 dark:text-gray-600 text-xs">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
        Mostrando {Math.min(sorted.length, 200)} de {sorted.length} resultados
      </p>
    </div>
  )
}

// ─── Metodología ──────────────────────────────────────────────────────────────

function Metodologia() {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 text-left font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
        <span>Metodología estadística</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="px-4 py-4 bg-white dark:bg-gray-900 text-sm text-gray-600 dark:text-gray-400 space-y-3">
          <p>
            <strong className="text-gray-800 dark:text-gray-200">Prueba estadística:</strong>{' '}
            Mann-Whitney U (no paramétrica). Compara la distribución de demoras en los 90 días
            posteriores a cada evento con la línea base del año anterior. No asume distribución
            normal, adecuada para datos sanitarios con valores atípicos.
          </p>
          <p>
            <strong className="text-gray-800 dark:text-gray-200">p-valor:</strong>{' '}
            Probabilidad de observar el patrón si no existiera ninguna asociación.
            Un p-valor {'<'} 0.05 indica que el patrón es estadísticamente inusual,
            <em> no que la privatización lo causó</em>.
          </p>
          <p>
            <strong className="text-gray-800 dark:text-gray-200">Effect size (tamaño del efecto):</strong>{' '}
            Magnitud de la diferencia observada. Valor próximo a 0 = cambio mínimo; próximo a 1 = cambio sustancial.
            Complementa al p-valor aportando contexto práctico.
          </p>
          <div className="border-l-2 border-amber-400 pl-3 py-1">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              Advertencia fundamental: asociación estadística ≠ causalidad.
            </p>
            <p className="mt-1">
              Los patrones detectados pueden deberse a factores estacionales, demográficos,
              pandémicos u otros no controlados en este análisis. Este proyecto no afirma
              que la privatización cause el aumento de listas de espera.
            </p>
          </div>
          <p>
            Motor de análisis:{' '}
            <a href="https://github.com/Raulcadiz/chrono-correlator" target="_blank" rel="noopener noreferrer"
              className="text-green-600 dark:text-green-400 hover:underline inline-flex items-center gap-1">
              chrono-correlator <ExternalLink size={12} />
            </a>
            {' '}(Apache 2.0) — análisis de series temporales con eventos discretos.
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
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-lg w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              {result.provincia} · {result.especialidad}
            </h3>
            <div className="flex gap-2 mt-1">
              <SignalBadge strength={result.signal_strength} />
              <span className="text-xs text-gray-500 dark:text-gray-400">
                p={fmt(result.p_value, 4)} · efecto={fmt(result.effect_size, 3)}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl font-bold leading-none ml-4">×</button>
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {result.narrative ?? 'Sin narrativa generada. Configura GROQ_API_KEY o ANTHROPIC_API_KEY en el .env para habilitarla.'}
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 italic">
          Asociación estadística observada — no implica causalidad.
        </p>
      </div>
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
  const [modalResult, setModalResult] = useState<AnalysisResult | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [recResp, evResp, anaResp] = await Promise.all([
        api.get('/data/waiting-lists', { params: { limit: 1000 } }),
        api.get('/data/events'),
        api.get('/analysis/latest'),
      ])
      setRecords(recResp.data.items ?? [])
      setEvents(evResp.data ?? [])
      setResults(anaResp.data ?? [])
    } catch {
      setStatus('Error al cargar datos. Comprueba que el backend está en marcha en el puerto 8112.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const handleRefresh = async () => {
    setRefreshing(true)
    setStatus('Actualizando datos...')
    try {
      const r = await api.post('/data/refresh')
      setStatus(`Actualización completa: ${r.data.records_added} registros nuevos`)
      await loadAll()
    } catch {
      setStatus('Error al actualizar datos')
    } finally {
      setRefreshing(false)
    }
  }

  const handleRunAnalysis = async () => {
    setStatus('Ejecutando análisis estadístico...')
    try {
      const r = await api.post('/analysis/run', {})
      setStatus(`Análisis completado: ${r.data.count} combinaciones evaluadas`)
      const anaResp = await api.get('/analysis/latest')
      setResults(anaResp.data ?? [])
    } catch (e: any) {
      setStatus(e?.response?.data?.detail ?? 'Error en el análisis (¿está chrono-correlator instalado?)')
    }
  }

  const signalCounts = useMemo(() => ({
    strong: results.filter(r => r.signal_strength === 'strong').length,
    moderate: results.filter(r => r.signal_strength === 'moderate').length,
    none: results.filter(r => r.signal_strength === 'none').length,
  }), [results])

  return (
    <div className="min-h-screen bg-white dark:bg-fondo-oscuro text-gray-900 dark:text-gray-100 transition-colors">

      {/* Header */}
      <header style={{ backgroundColor: '#1D9E75' }} className="text-white px-4 py-4 shadow">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight m-0">Andalucía Espera</h1>
            <p className="text-sm mt-0.5 opacity-80">
              Listas de espera SAS vs eventos de privatización · datos públicos · estadística no paramétrica
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {status && (
              <span className="text-xs bg-white/20 rounded px-2 py-1 max-w-xs truncate">{status}</span>
            )}
            <button onClick={handleRunAnalysis}
              className="text-sm bg-white/20 hover:bg-white/30 rounded px-3 py-1.5 transition-colors">
              Ejecutar análisis
            </button>
            <button onClick={handleRefresh} disabled={refreshing}
              className="flex items-center gap-1.5 text-sm bg-white/20 hover:bg-white/30 rounded px-3 py-1.5 transition-colors disabled:opacity-50">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              Actualizar datos
            </button>
            <button onClick={() => setDark(v => !v)} title="Cambiar tema"
              className="p-1.5 bg-white/20 hover:bg-white/30 rounded transition-colors">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>
      </header>

      {/* Barra resumen */}
      {(records.length > 0 || results.length > 0) && (
        <div className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
          <div className="max-w-7xl mx-auto flex flex-wrap gap-4 text-sm">
            <span className="text-gray-500 dark:text-gray-400">
              {records.length.toLocaleString('es')} registros · {events.length} eventos · {results.length} análisis
            </span>
            {results.length > 0 && (
              <>
                <span className="text-red-500 dark:text-red-400 font-medium">{signalCounts.strong} señales fuertes</span>
                <span className="text-yellow-600 dark:text-yellow-400 font-medium">{signalCounts.moderate} señales moderadas</span>
                <span className="text-emerald-600 dark:text-emerald-400">{signalCounts.none} sin señal</span>
              </>
            )}
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-8">

        {loading && (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">Cargando datos...</div>
        )}

        {/* Sección 1: Mapa de señales */}
        <section>
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">
            Mapa de señales — provincias × especialidades
          </h2>
          {results.length === 0 ? (
            <div className="py-6 text-sm text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/50 rounded-lg text-center">
              Sin análisis ejecutado. Pulsa "Ejecutar análisis" en el encabezado.
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm overflow-x-auto">
              <SignalMap results={results} onCellClick={(p, e) => { setProvincia(p); setEspecialidad(e) }} />
            </div>
          )}
        </section>

        {/* Sección 2: Gráfico principal */}
        <section>
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">
            Evolución temporal
          </h2>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
            <MainChart records={records} events={events}
              provincia={provincia} especialidad={especialidad}
              onProvinciaChange={setProvincia} onEspecialidadChange={setEspecialidad} />
          </div>
        </section>

        {/* Sección 3: Tabla de resultados */}
        <section>
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">
            Resultados estadísticos
          </h2>
          <ResultsTable results={results} onNarrativeClick={r => setModalResult(r)} />
        </section>

        {/* Sección 4: Metodología */}
        <section>
          <h2 className="text-lg font-semibold mb-3 text-gray-800 dark:text-gray-200">
            Metodología
          </h2>
          <Metodologia />
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 dark:border-gray-800 mt-8 px-4 py-5">
        <p className="text-center text-xs text-gray-400 dark:text-gray-500">
          Datos: Junta de Andalucía (CC BY 4.0) ·{' '}
          Análisis:{' '}
          <a href="https://github.com/Raulcadiz/chrono-correlator"
            className="hover:underline" target="_blank" rel="noopener noreferrer">
            chrono-correlator
          </a>{' '}
          (Apache 2.0) · Código: GPL-3.0 · Raúl Gallardo (g3v3r)
        </p>
      </footer>

      {/* Modal narrativa */}
      <NarrativeModal result={modalResult} onClose={() => setModalResult(null)} />

    </div>
  )
}
