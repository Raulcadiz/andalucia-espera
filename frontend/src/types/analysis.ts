// Tipos para los nuevos endpoints de análisis

export type SignalStrength = 'none' | 'weak' | 'moderate' | 'strong'

export interface SignalResult {
  signal_strength: SignalStrength
  p_value: number
  effect_size: number
  consistency: number | null
  n_incumplimientos?: number
  n_decisiones?: number
}

// ─── Legal ────────────────────────────────────────────────────────────────────

export interface SparklinePoint {
  fecha: string
  valor: number
  desc: string
}

export type ComplianceEstado = 'incumplido' | 'parcial' | 'activo'

export interface ComplianceLaw {
  id: string
  ley: string
  garantia: string
  realidad: string
  estado: ComplianceEstado
  sparkline_data: SparklinePoint[]
  signal: SignalResult
}

export interface LegalResponse {
  leyes: ComplianceLaw[]
  especialidad_analizada: string
  nota: string
}

// ─── Presupuesto ──────────────────────────────────────────────────────────────

export interface BudgetYear {
  año: number
  gasto_millones: number
  deficit_pct: number
  pacientes_espera: number
}

export interface Correlacion {
  x: string
  y: string
  coef: number
  fuerza: string
  signo: string
}

export interface BudgetResponse {
  gasto_anual: BudgetYear[]
  total_acumulado_millones: number
  variacion_pct: number
  correlaciones: Correlacion[]
  interpretacion: string
  nota_metodologica: string
  fuentes: string[]
}

// ─── Actores ──────────────────────────────────────────────────────────────────

export type ActorTipo = 'político' | 'empresa' | 'institución' | 'sociedad_civil' | 'sindicato'

export interface ActorDecision {
  fecha: string
  descripcion: string
  fuente: string
}

export interface Actor {
  nombre: string
  rol: string
  tipo: ActorTipo
  partido: string | null
  decisiones: ActorDecision[]
  impacto: SignalResult
}

export interface ActorsResponse {
  actores: Actor[]
  nota: string
}
