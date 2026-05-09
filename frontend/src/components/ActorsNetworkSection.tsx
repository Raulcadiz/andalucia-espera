import { useState } from 'react'
import { Users, ChevronDown, ChevronUp, ExternalLink, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { Actor, ActorTipo, ActorsResponse } from '../types/analysis'

// ─── Tipos ────────────────────────────────────────────────────────────────────

const TIPO_CFG: Record<ActorTipo, { label: string; badge: string }> = {
  político:      { label: 'Político',       badge: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800' },
  empresa:       { label: 'Empresa',        badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' },
  institución:   { label: 'Institución',    badge: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800' },
  sociedad_civil:{ label: 'Sociedad civil', badge: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800' },
  sindicato:     { label: 'Sindicato',      badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800' },
}

const SIGNAL_CFG: Record<string, { label: string; dot: string; text: string }> = {
  none:     { label: 'Sin señal', dot: 'bg-slate-400',  text: 'text-slate-500 dark:text-slate-400' },
  weak:     { label: 'Débil',     dot: 'bg-sky-500',    text: 'text-sky-600 dark:text-sky-400' },
  moderate: { label: 'Moderada',  dot: 'bg-amber-500',  text: 'text-amber-600 dark:text-amber-400' },
  strong:   { label: 'Fuerte',    dot: 'bg-red-500',    text: 'text-red-600 dark:text-red-400' },
}

const TIPOS: ActorTipo[] = ['político', 'empresa', 'institución', 'sociedad_civil', 'sindicato']

// ─── Fila de actor ────────────────────────────────────────────────────────────

function ActorRow({ actor }: { actor: Actor }) {
  const [open, setOpen] = useState(false)
  const tipo = TIPO_CFG[actor.tipo] ?? TIPO_CFG['institución']
  const signal = SIGNAL_CFG[actor.impacto.signal_strength] ?? SIGNAL_CFG.none
  const positiveEffect = (actor.impacto.effect_size ?? 0) > 0

  return (
    <div className="border-b border-gray-50 dark:border-gray-700/20 last:border-0">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors text-left"
      >
        {/* Nombre y rol */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{actor.nombre}</div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{actor.rol}</div>
        </div>

        {/* Tipo badge */}
        <span className={`hidden sm:inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${tipo.badge}`}>
          {tipo.label}
        </span>

        {/* Partido */}
        {actor.partido && (
          <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500 shrink-0">{actor.partido}</span>
        )}

        {/* Signal */}
        <span className={`flex items-center gap-1 text-[10px] font-medium shrink-0 ${signal.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${signal.dot}`} />
          <span className="hidden sm:inline">{signal.label}</span>
        </span>

        {open
          ? <ChevronUp size={12} className="text-gray-400 shrink-0" />
          : <ChevronDown size={12} className="text-gray-400 shrink-0" />
        }
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 bg-gray-50/50 dark:bg-gray-800/30">
          {/* Tipo en móvil */}
          <div className="flex items-center gap-2 pt-1 sm:hidden">
            <span className={`inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full ${tipo.badge}`}>{tipo.label}</span>
            {actor.partido && <span className="text-[10px] font-mono text-gray-400">{actor.partido}</span>}
          </div>

          {/* Señal estadística */}
          {actor.impacto.signal_strength !== 'none' && (
            <div className="flex flex-wrap gap-3 p-2.5 rounded-lg bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/30">
              <div>
                <div className="text-[9px] text-gray-400 uppercase tracking-wider">Señal</div>
                <div className={`text-xs font-semibold ${signal.text}`}>{signal.label}</div>
              </div>
              <div>
                <div className="text-[9px] text-gray-400 uppercase tracking-wider">p-valor</div>
                <div className="text-xs font-mono text-gray-700 dark:text-gray-300">{actor.impacto.p_value.toFixed(4)}</div>
              </div>
              <div>
                <div className="text-[9px] text-gray-400 uppercase tracking-wider">Efecto</div>
                <div className={`text-xs font-mono flex items-center gap-0.5 ${positiveEffect ? 'text-rojo-alerta' : 'text-verde-sas'}`}>
                  {positiveEffect ? <TrendingUp size={9} /> : actor.impacto.effect_size < 0 ? <TrendingDown size={9} /> : <Minus size={9} />}
                  {actor.impacto.effect_size.toFixed(3)}
                </div>
              </div>
              {actor.impacto.consistency != null && (
                <div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wider">Consist.</div>
                  <div className="text-xs font-mono text-gray-700 dark:text-gray-300">{Math.round(actor.impacto.consistency * 100)}%</div>
                </div>
              )}
              {actor.impacto.n_decisiones != null && (
                <div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wider">Eventos</div>
                  <div className="text-xs font-mono text-gray-700 dark:text-gray-300">{actor.impacto.n_decisiones}</div>
                </div>
              )}
            </div>
          )}

          {/* Decisiones documentadas */}
          <div>
            <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
              Decisiones documentadas
            </div>
            <div className="space-y-2">
              {actor.decisiones.map((d, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0 w-14 pt-0.5">{d.fecha.slice(0, 7)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-snug">{d.descripcion}</p>
                    {d.fuente && (
                      <a
                        href={d.fuente}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-gray-400 hover:text-verde-sas transition-colors inline-flex items-center gap-0.5 mt-0.5"
                      >
                        Fuente oficial <ExternalLink size={8} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  data: ActorsResponse | null
  loading: boolean
}

export default function ActorsNetworkSection({ data, loading }: Props) {
  const [open, setOpen] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState<ActorTipo | 'todos'>('todos')

  const actoresFiltrados = data?.actores.filter(
    a => filtroTipo === 'todos' || a.tipo === filtroTipo
  ) ?? []

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-700/50 overflow-hidden bg-white dark:bg-gray-800/90 shadow-sm">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
      >
        <Users size={15} className="text-verde-sas shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-widest">Red de actores e intereses</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 font-normal normal-case tracking-normal mt-0.5">
            Decisiones documentadas · asociación estadística con listas de espera (Mann-Whitney U)
          </div>
        </div>
        {data && (
          <span className="hidden sm:block text-xs text-gray-400 dark:text-gray-500 shrink-0">
            {data.actores.length} actores
          </span>
        )}
        {open ? <ChevronUp size={13} className="text-gray-400 shrink-0" /> : <ChevronDown size={13} className="text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="pb-4">
          {loading && (
            <div className="border-t border-gray-100 dark:border-gray-700/30 animate-pulse">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-700/20">
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-40 bg-gray-200 dark:bg-gray-700 rounded-full" />
                    <div className="h-3 w-56 bg-gray-100 dark:bg-gray-700/60 rounded-full" />
                  </div>
                  <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
                  <div className="h-4 w-12 bg-gray-100 dark:bg-gray-700/60 rounded-full" />
                </div>
              ))}
            </div>
          )}
          {!loading && !data && (
            <div className="py-6 text-center text-sm text-gray-400">No se pudo cargar la red de actores.</div>
          )}

          {!loading && data && (
            <>
              {/* Filtro por tipo */}
              <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                <button
                  onClick={() => setFiltroTipo('todos')}
                  className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${filtroTipo === 'todos' ? 'bg-verde-sas text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                >
                  Todos ({data.actores.length})
                </button>
                {TIPOS.map(t => {
                  const count = data.actores.filter(a => a.tipo === t).length
                  if (count === 0) return null
                  const cfg = TIPO_CFG[t]
                  return (
                    <button
                      key={t}
                      onClick={() => setFiltroTipo(t)}
                      className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${filtroTipo === t ? 'bg-verde-sas text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                    >
                      {cfg.label} ({count})
                    </button>
                  )
                })}
              </div>

              {/* Tabla */}
              <div className="border-t border-gray-100 dark:border-gray-700/30">
                {actoresFiltrados.map(actor => (
                  <ActorRow key={actor.nombre} actor={actor} />
                ))}
              </div>

              {/* Nota */}
              <div className="px-5 pt-3">
                <p className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 flex items-start gap-1.5">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                  {data.nota}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
