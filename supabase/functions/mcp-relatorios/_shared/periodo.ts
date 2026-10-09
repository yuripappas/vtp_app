// Resolve um período de datas (YYYY-MM-DD, calendário de São Paulo) pro
// range UTC que a query em cw_created_at (timestamptz) precisa.
// Brasil aboliu horário de verão em 2019 — offset fixo -03:00, sem DST.
const OFFSET_SP = '-03:00';

function hojeSP(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
}

function validarData(d: string, campo: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`${campo} inválida: "${d}" (use YYYY-MM-DD)`);
}

export interface Periodo { inicio: string; fim: string; inicioISO: string; fimISO: string }

// data_inicio/data_fim são opcionais: sem nenhum → hoje; só data_inicio →
// data_inicio até hoje; os dois → range inclusivo.
export function resolverPeriodo(data_inicio?: string, data_fim?: string): Periodo {
  const hoje = hojeSP();
  const inicio = data_inicio || hoje;
  const fim = data_fim || (data_inicio ? hoje : inicio);
  validarData(inicio, 'data_inicio');
  validarData(fim, 'data_fim');
  if (inicio > fim) throw new Error(`data_inicio (${inicio}) não pode ser depois de data_fim (${fim})`);

  const inicioISO = new Date(`${inicio}T00:00:00${OFFSET_SP}`).toISOString();
  const fimISO    = new Date(`${fim}T23:59:59.999${OFFSET_SP}`).toISOString();
  return { inicio, fim, inicioISO, fimISO };
}
