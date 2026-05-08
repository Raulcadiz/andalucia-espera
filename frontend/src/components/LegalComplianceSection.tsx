import { useState } from 'react'
import { Scale, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, XCircle, MinusCircle, TrendingUp, TrendingDown } from 'lucide-react'
import type { ComplianceLaw, ComplianceEstado, LegalResponse } from '../types/analysis'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ESTADO_CFG: Record<ComplianceEstado, { label: string; badge: string; icon: React.ReactNode }> = {
  incumplido: {
    label: 'Incumplido',
    badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800',
    icon: <XCircle size={12} />,
  },
  parcial: {
    label: 'Parcial',
    badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
    icon: <MinusCircle size={12} />,
  },
  activo: {
    label: 'Activo',
    badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
    icon: <CheckCircle2 size={12} />,
  },
}

const SIGNAL_LABEL: Record<string, string> = {
  none: 'Sin señal estadística',
  weak: 'Señal débil',
  moderate: 'Señal moderada',
  strong: 'Señal fuerte',
}

const SIGNAL_COLOR: Record<string, string> = {
  none: 'text-slate-500 dark:text-slate-400',
  weak: 'text-sky-600 dark:text-sky-400',
  moderate: 'text-amber-600 dark:text-amber-400',
  strong: 'text-red-600 dark:text-red-400',
}

function MiniSparkline({ data }: { data: ComplianceLaw['sparkline_data'] }) {
  const sorted = [...data].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const colorForValor = (v: number) =>
    v >= 1.0 ? '#1D9E75' : v >= 0.5 ? '#f59e0b' : '#E24B4A'

  return (
    <div className="flex items-end gap-1 h-6" title="Evolución cumplimiento">
      {sorted.map((p, i) => (
        <div
          key={i}
          className="w-2.5 rounded-sm transition-all"
          style={{
            height: `${Math.max(4, p.valor * 24)}px`,
            backgroundColor: colorForValor(p.valor),
            opacity: 0.85,
          }}
          title={`${p.fecha.slice(0, 7)}: ${p.desc}`}
        />
      ))}
    </div>
  )
}

function LawRow({ ley }: { ley: ComplianceLaw }) {
  const [open, setOpen] = useState(false)
  const estado = ESTADO_CFG[ley.estado]
  const positiveEffect = (ley.signal.effect_size ?? 0) > 0

  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700/40 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors text-left"
      >
        <span className={`inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${estado.badge}`}>
          {estado.icon} {estado.label}
        </span>
        <span className="flex-1 text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{ley.ley}</span>
        <MiniSparkline data={ley.sparkline_data} />
        {open ? <ChevronUp size={13} className="shrink-0 text-gray-400" /> : <ChevronDown size={13} className="shrink-0 text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 py-3 space-y-3 bg-white dark:bg-gray-900/50">
          {/* Garantía */}
          <div>
            <div className="text-[10px] font-bold text-verde-sas uppercase tracking-wider mb-0.5">Garantía legal</div>
            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{ley.garantia}</p>
          </div>

          {/* Realidad */}
          <div>
            <div className="text-[10px] font-bold text-rojo-alerta uppercase tracking-wider mb-0.5">Realidad documentada</div>
            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{ley.realidad}</p>
          </div>

          {/* Historial de cumplimiento */}
          <div>
            <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Historial de cumplimiento</div>
            <div className="space-y-1">
              {[...ley.sparkline_data]
                .sort((a, b) => b.fecha.localeCompare(a.fecha))
                .map((p, i) => {
                  const cfg = ESTADO_CFG[p.valor >= 1 ? 'activo' : p.valor >= 0.5 ? 'parcial' : 'incumplido']
                  return (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0 w-14">{p.fecha.slice(0, 7)}</span>
                      <span className={`inline-flex items-center gap-0.5 shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
                        {cfg.icon}
                      </span>
                      <span className="text-[11px] text-gray-600 dark:text-gray-400 leading-tight">{p.desc}</span>
                    </div>
                  )
                })}
            </div>
          </div>

          {/* Señal estadística */}
          {ley.signal.signal_strength !== 'none' && (
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700/30">
              <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                Señal estadística (Mann-Whitney U)
              </div>
              <div className="flex flex-wrap gap-3">
                <div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wider">Señal</div>
                  <div className={`text-xs font-semibold ${SIGNAL_COLOR[ley.signal.signal_strength]}`}>
                    {SIGNAL_LABEL[ley.signal.signal_strength]}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wider">p-valor</div>
                  <div className="text-xs font-mono text-gray-700 dark:text-gray-300">{ley.signal.p_value.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wider">Efecto</div>
                  <div className={`text-xs font-mono flex items-center gap-0.5 ${positiveEffect ? 'text-rojo-alerta' : 'text-verde-sas'}`}>
                    {positiveEffect ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                    {ley.signal.effect_size.toFixed(3)}
                  </div>
                </div>
                {ley.signal.consistency != null && (
                  <div>
                    <div className="text-[9px] text-gray-400 uppercase tracking-wider">Consistencia</div>
                    <div className="text-xs font-mono text-gray-700 dark:text-gray-300">{Math.round(ley.signal.consistency * 100)}%</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  data: LegalResponse | null
  loading: boolean
}

export default function LegalComplianceSection({ data, loading }: Props) {
  const [open, setOpen] = useState(true)

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-700/50 overflow-hidden bg-white dark:bg-gray-800/90 shadow-sm">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
      >
        <Scale size={15} className="text-verde-sas shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-widest">Marco legal y garantías</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 font-normal normal-case tracking-normal mt-0.5">
            Estado de cumplimiento de 3 leyes sanitarias — asociación estadística con listas de espera
          </div>
        </div>
        {open ? <ChevronUp size={13} className="text-gray-400 shrink-0" /> : <ChevronDown size={13} className="text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-2.5">
          {loading && (
            <div className="py-6 text-center text-sm text-gray-400 animate-pulse">Cargando análisis legal…</div>
          )}
          {!loading && !data && (
            <div className="py-6 text-center text-sm text-gray-400">No se pudo cargar el análisis legal.</div>
          )}
          {!loading && data && (
            <>
              {data.leyes.map(ley => (
                <LawRow key={ley.id} ley={ley} />
              ))}
              <p className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 flex items-start gap-1.5 mt-1">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                {data.nota}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
