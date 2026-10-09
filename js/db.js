/**
 * VTP Compras — Vai Ter Pizza!
 * db.js — Camada de serviço de dados
 *
 * Abstrai todo o acesso ao localStorage com:
 *  - try/catch em todas as operações (sem crash por JSON corrompido)
 *  - tratamento de QuotaExceededError
 *  - interface pronta para substituição por Supabase na Fase 0
 *
 * USO:
 *   db._get('vtp_items', [])     — lê e parseia, retorna default em caso de erro
 *   db._set('vtp_items', value)  — serializa e salva, retorna bool de sucesso
 *   db.get.<entidade>()          — atalho semântico por entidade
 *   db.set.<entidade>(valor)     — atalho semântico por entidade
 */

const db = (() => {

  // ── Primitivas seguras ─────────────────────────────────────────

  function _get(key, defaultVal) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === undefined) return defaultVal;
      const parsed = JSON.parse(raw);
      return (parsed === null || parsed === undefined) ? defaultVal : parsed;
    } catch (e) {
      console.warn(`[db] Falha ao ler "${key}":`, e.message);
      return defaultVal;
    }
  }

  // ── Supabase sync ─────────────────────────────────────────────
  let _sbClient = null;
  const _debouncers = {};

  function _pushToSupabase(key, value) {
    if (!_sbClient) return;
    clearTimeout(_debouncers[key]);
    _debouncers[key] = setTimeout(async () => {
      try {
        await _sbClient.from('kv_store').upsert({ key, value }, { onConflict: 'key' });
      } catch (e) {
        console.warn('[db] push error:', e?.message);
      }
    }, 400);
  }

  async function syncFromSupabase(client) {
    _sbClient = client;
    try {
      const { data, error } = await client.from('kv_store').select('key, value');
      if (error) { console.warn('[db] sync error:', error.message); return false; }
      for (const row of (data || [])) {
        try { localStorage.setItem(row.key, JSON.stringify(row.value)); } catch (_) {}
      }
      return (data || []).length;
    } catch (e) {
      console.warn('[db] sync exception:', e?.message);
      return false;
    }
  }

  function _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      _pushToSupabase(key, value);
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.error('[db] localStorage cheio:', e);
        if (typeof toast === 'function') {
          toast(
            'Armazenamento local cheio. Exporte os dados ou limpe o histórico em Configurações.',
            'err'
          );
        }
      } else {
        console.error(`[db] Falha ao salvar "${key}":`, e.message);
      }
      return false;
    }
  }

  function _remove(key) {
    try { localStorage.removeItem(key); return true; }
    catch (e) { console.warn(`[db] Falha ao remover "${key}":`, e.message); return false; }
  }

  // ── Verificação de saúde do storage ───────────────────────────

  function healthCheck() {
    const probe = '__vtp_probe__';
    try {
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  }

  // ── Cálculo de uso ────────────────────────────────────────────

  function usage() {
    try {
      let total = 0;
      for (const key of Object.keys(localStorage)) {
        total += (localStorage.getItem(key) || '').length * 2;
      }
      return { bytes: total, kb: (total / 1024).toFixed(1), mb: (total / 1048576).toFixed(2) };
    } catch (e) {
      return { bytes: 0, kb: '0', mb: '0' };
    }
  }

  // ── Export completo (backup) ───────────────────────────────────

  function exportAll() {
    const snapshot = {};
    const VTP_KEYS = [
      'vtp_items','vtp_suppliers','vtp_users','vtp_ordens','vtp_listas',
      'vtp_cycle_history','vtp_price_history','vtp_carrinho','vtp_forn_memoria',
      'vtp_prestadores','vtp_terceirizados','vtp_funcionarios',
      'vtp_emp_terceir','vtp_emp_cargos','vtp_emp_tipos_desp','vtp_emp_cat_insumo',
      'vtp_emp_ausencias','vtp_rh_escalas','vtp_rh_presencas','vtp_rh_horasextras',
      'vtp_rh_materiais','vtp_rh_periodos','vtp_rh_config','vtp_rh_diaristas',
      'vtp_rh_avaliacoes','vtp_sabores','vtp_produtos','vtp_perms','vtp_config',
      'vtp_movimentacoes','vtp_hist_contagens','vtp_contagensInv',
      'vtp_manut_itens','vtp_manut_cats_cfg','vtp_manut_grupos',
      'vtp_inv_locs','vtp_inv_cats','vtp_ck_turnos','vtp_tipos_lista',
      'vtp_auditlog','vtp_alertas',
      'vtp_etiq_metodos','vtp_etiq_validades','vtp_etiquetas','vtp_etiq_pontos',
    ];
    for (const key of VTP_KEYS) {
      const val = _get(key, null);
      if (val !== null) snapshot[key] = val;
    }
    snapshot._exported_at = new Date().toISOString();
    snapshot._version     = _get('vtp_v', '');
    return snapshot;
  }

  // ── Atalhos semânticos por entidade ───────────────────────────
  // get.<entidade>() / set.<entidade>(val)
  // Prontos para substituição por chamadas ao Supabase na Fase 0.

  const ENTITY_MAP = {
    items:             'vtp_items',
    suppliers:         'vtp_suppliers',
    users:             'vtp_users',
    ordens:            'vtp_ordens',
    listas:            'vtp_listas',
    cycleHistory:      'vtp_cycle_history',
    priceHistory:      'vtp_price_history',
    carrinho:          'vtp_carrinho',
    fornMemoria:       'vtp_forn_memoria',
    prestadores:       'vtp_prestadores',
    terceirizados:     'vtp_terceirizados',
    funcionarios:      'vtp_funcionarios',
    terceirFuncoes:    'vtp_emp_terceir',
    funcCargos:        'vtp_emp_cargos',
    tiposDesperdicio:  'vtp_emp_tipos_desp',
    categoriasInsumo:  'vtp_emp_cat_insumo',
    tiposAusencia:     'vtp_emp_ausencias',
    rhEscalas:         'vtp_rh_escalas',
    rhPresencas:       'vtp_rh_presencas',
    rhHorasExtras:     'vtp_rh_horasextras',
    rhMateriais:       'vtp_rh_materiais',
    rhPeriodos:        'vtp_rh_periodos',
    rhConfig:          'vtp_rh_config',
    rhDiaristas:       'vtp_rh_diaristas',
    rhAvaliacoes:      'vtp_rh_avaliacoes',
    sabores:           'vtp_sabores',
    produtos:          'vtp_produtos',
    perms:             'vtp_perms',
    config:            'vtp_config',
    movimentacoes:     'vtp_movimentacoes',
    histContagens:     'vtp_hist_contagens',
    contagensInv:      'vtp_contagensInv',
    manutItens:        'vtp_manut_itens',
    manutCats:         'vtp_manut_cats_cfg',
    manutGrupos:       'vtp_manut_grupos',
    inventarioLocs:    'vtp_inv_locs',
    inventarioCats:    'vtp_inv_cats',
    checklistTurnos:   'vtp_ck_turnos',
    tiposLista:        'vtp_tipos_lista',
    auditLog:          'vtp_auditlog',
    alertas:           'vtp_alertas',
    desperdicios:      'vtp_desperdicios',
    manutSessoes:      'vtp_manut_sessoes',
    etiqMetodos:       'vtp_etiq_metodos',
    etiqValidades:     'vtp_etiq_validades',
    etiquetas:         'vtp_etiquetas',
    etiqPontos:        'vtp_etiq_pontos',
  };

  const get = {};
  const set = {};

  for (const [entity, key] of Object.entries(ENTITY_MAP)) {
    const isArray  = !['fornMemoria','rhConfig','config','perms','manutCats','manutGrupos',
                       'inventarioCats','terceirFuncoes','funcCargos','tiposLista'].includes(entity);
    get[entity] = () => _get(key, isArray ? [] : {});
    set[entity] = (val) => _set(key, val);
  }

  // ── Interface pública ─────────────────────────────────────────

  return { _get, _set, _remove, get, set, healthCheck, usage, exportAll, syncFromSupabase };

})();
