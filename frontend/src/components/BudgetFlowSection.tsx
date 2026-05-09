import { useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Euro, ChevronDown, ChevronUp, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react'
import type { BudgetResponse, Correlacion } from '../types/analysis'

// ─── Tooltip personalizado ────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-lg p-2.5 text-xs">
      <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1.5">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} />
          <span className="text-gray-500 dark:text-gray-400">{p.name}:</span>
          <span className="font-mono font-semibold text-gray-800 dark:text-gray-200">
            {p.dataKey === 'gasto_millones'
              ? `${p.value} M€`
              : p.dataKey === 'deficit_pct'
              ? `${p.value}%`
              : p.value.toLocaleString('es')}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Tarjeta de correlación ───────────────────────────────────────────────────

function CorrelacionCard({ cor }: { cor: Correlacion }) {
  const positive = cor.coef >= 0
  const abs = Math.abs(cor.coef)
  const barWidth = Math.round(abs * 100)

  const barColor =
    abs >= 0.8 ? 'bg-red-500' :
    abs >= 0.6 ? 'bg-amber-500' :
    abs >= 0.4 ? 'bg-yellow-400' : 'bg-slate-300'

  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-100 dark:border-gray-700/30">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">{cor.x}</div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-0.5">
            {positive ? <TrendingUp size={9} className="text-rojo-alerta" /> : <TrendingDown size={9} className="text-verde-sas" />}
            {cor.y}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-base font-bold font-mono ${abs >= 0.6 ? 'text-rojo-alerta' : 'text-gray-700 dark:text-gray-300'}`}>
            {cor.coef > 0 ? '+' : ''}{cor.coef.toFixed(2)}
          </div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500 capitalize">{cor.fuerza}</div>
        </div>
      </div>
      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${barWidth}%` }} />
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface Props {
  data: BudgetResponse | null
  loading: boolean
}

export default function BudgetFlowSection({ data, loading }: Props) {
  const [open, setOpen] = useState(true)

  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-700/50 overflow-hidden bg-white dark:bg-gray-800/90 shadow-sm">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
      >
        <Euro size={15} className="text-verde-sas shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-gray-700 dark:text-gray-200 uppercase tracking-widest">Flujo de dinero público a sanidad privada</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 font-normal normal-case tracking-normal mt-0.5">
            Gasto en conciertos SAS 2018-2024 · déficit de profesionales · correlaciones indicativas
          </div>
        </div>
        {data && (
          <span className="hidden sm:block text-sm font-bold text-rojo-alerta tabular-nums shrink-0">
            {data.total_acumulado_millones.toLocaleString('es')} M€
          </span>
        )}
        {open ? <ChevronUp size={13} className="text-gray-400 shrink-0" /> : <ChevronDown size={13} className="text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4">
          {loading && (
            <div className="space-y-4 animate-pulse">
              <div className="grid grid-cols-3 gap-3">
                {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700/50 rounded-xl" />)}
              </div>
              <div className="h-56 bg-gray-100 dark:bg-gray-700/50 rounded-xl" />
              <div className="grid grid-cols-3 gap-2">
                {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 dark:bg-gray-700/50 rounded-xl" />)}
              </div>
            </div>
          )}
          {!loading && !data && (
            <div className="py-6 text-center text-sm text-gray-400">No se pudo cargar el análisis presupuestario.</div>
          )}

          {!loading && data && (
            <>
              {/* Cifras de cabecera */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold tabular-nums text-rojo-alerta">{data.total_acumulado_millones.toLocaleString('es')} M€</div>
                  <div className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">Total acumulado 2018-2024</div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
                    <TrendingUp size={16} />+{data.variacion_pct}%
                  </div>
                  <div className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">Crecimiento del gasto</div>
                </div>
                <div className="col-span-2 sm:col-span-1 bg-gray-50 dark:bg-gray-700/40 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold tabular-nums text-gray-800 dark:text-gray-200">145→312 M€</div>
                  <div className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">2018 → 2024</div>
                </div>
              </div>

              {/* Gráfico ComposedChart */}
              <div>
                <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Gasto en conciertos (M€) y déficit de profesionales (%)
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <ComposedChart data={data.gasto_anual} margin={{ top: 4, right: 48, bottom: 0, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.4} />
                    <XAxis
                      dataKey="año"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                      label={{ value: 'M€', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 9, fill: '#9ca3af' } }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      axisLine={false}
                      tickLine={false}
                      label={{ value: '% déficit', angle: 90, position: 'insideRight', offset: 16, style: { fontSize: 9, fill: '#9ca3af' } }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      iconType="circle"
                      iconSize={7}
                      wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                      formatter={v =>
                        v === 'gasto_millones' ? 'Gasto conciertos (M€)' :
                        v === 'deficit_pct' ? 'Déficit profesionales (%)' : v
                      }
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="gasto_millones"
                      fill="#E24B4A"
                      opacity={0.75}
                      radius={[3, 3, 0, 0]}
                      name="gasto_millones"
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="deficit_pct"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#f59e0b' }}
                      activeDot={{ r: 5 }}
                      name="deficit_pct"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Correlaciones */}
              <div>
                <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Correlaciones de Pearson (n=7, indicativas)
                </div>
                <div className="grid sm:grid-cols-3 gap-2">
                  {data.correlaciones.map((c, i) => (
                    <CorrelacionCard key={i} cor={c} />
                  ))}
                </div>
              </div>

              {/* Interpretación */}
              <div className="rounded-xl border border-gray-100 dark:border-gray-700/30 p-3 bg-gray-50 dark:bg-gray-800/40">
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{data.interpretacion}</p>
              </div>

              {/* Nota metodológica */}
              <p className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 flex items-start gap-1.5">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                {data.nota_metodologica}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
