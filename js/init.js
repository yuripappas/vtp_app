(async () => {
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  function setLoadMsg(msg) {
    const el = document.getElementById('vtpLoadMsg');
    if (el) el.textContent = msg;
  }

  const VTP_ALL_KEYS = [
    'vtp_items','vtp_suppliers','vtp_users','vtp_ordens','vtp_listas',
    'vtp_cycle_history','vtp_price_history','vtp_carrinho','vtp_forn_memoria',
    'vtp_prestadores','vtp_terceirizados','vtp_funcionarios',
    'vtp_emp_terceir','vtp_emp_cargos','vtp_emp_tipos_desp','vtp_emp_cat_insumo',
    'vtp_emp_ausencias','vtp_rh_escalas','vtp_rh_presencas','vtp_rh_horasextras',
    'vtp_rh_materiais','vtp_rh_periodos','vtp_rh_config','vtp_rh_diaristas',
    'vtp_rh_avaliacoes','vtp_sabores','vtp_produtos','vtp_produtos_pizza','vtp_opcoes','vtp_cw_mapa','vtp_canais_comissao','vtp_perms','vtp_config',
    'vtp_movimentacoes','vtp_hist_contagens','vtp_contagensInv',
    'vtp_manut_itens','vtp_manut_cats_cfg','vtp_manut_grupos',
    'vtp_inv_locs','vtp_inv_cats','vtp_ck_turnos','vtp_tipos_lista',
    'vtp_auditlog','vtp_alertas','vtp_desperdicios','vtp_manut_sessoes','vtp_v',
    'vtp_etiq_metodos','vtp_etiq_validades','vtp_etiquetas','vtp_etiq_pontos',
  ];

  // Sync data from Supabase into localStorage before data.js runs
  try {
    setLoadMsg('Conectando ao servidor...');
    const _sb = supabase.createClient(VTP_SUPABASE_URL, VTP_SUPABASE_KEY);
    window._vtpSb = _sb;
    const rowCount = await db.syncFromSupabase(_sb);

    if (rowCount === 0) {
      // First run: Supabase empty — migrate any existing localStorage data up
      window._vtpFirstRun = true;
      setLoadMsg('Primeira vez — sincronizando dados locais...');
      const rows = [];
      for (const key of VTP_ALL_KEYS) {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          try { rows.push({ key, value: JSON.parse(raw) }); } catch (_) {}
        }
      }
      if (rows.length > 0) {
        await _sb.from('kv_store').upsert(rows, { onConflict: 'key' });
      }
    }
    setLoadMsg('Carregando dados...');
  } catch (e) {
    console.warn('[vtp] Supabase offline, usando dados locais:', e?.message);
    setLoadMsg('Modo offline — usando dados locais');
  }

  // Load all app scripts in order (data.js reads localStorage already populated above)
  const APP_SCRIPTS = [
    'js/data.js', 'js/utils.js', 'js/cw-api.js', 'js/dashboard.js', 'js/estoque.js',
    'js/compras.js', 'js/relatorios.js', 'js/modules.js', 'js/previsao.js',
    'js/cadastros.js', 'js/vendas.js', 'js/vendas-ui.js', 'js/configuracoes.js', 'js/desperdicio.js',
    'js/checklist.js', 'js/manutencao.js', 'js/inventario.js',
    'js/rh.js', 'js/alertas.js', 'js/auditoria.js', 'js/etiquetagem.js',
    'js/atendimento.js', 'js/login.js',
  ];
  for (const src of APP_SCRIPTS) {
    await loadScript(src + '?v=141');
  }

  // First run: push all initialized data to Supabase
  // (data.js defaults are now in memory but not yet in Supabase)
  if (typeof _vtpFirstRun !== 'undefined' && _vtpFirstRun) {
    setLoadMsg('Salvando dados iniciais...');
    const _flushFns = [
      () => typeof saveI            === 'function' && saveI(),
      () => typeof saveS            === 'function' && saveS(),
      () => typeof saveU            === 'function' && saveU(),
      () => typeof saveO            === 'function' && saveO(),
      () => typeof saveListas       === 'function' && saveListas(),
      () => typeof savePrest        === 'function' && savePrest(),
      () => typeof saveTerceir      === 'function' && saveTerceir(),
      () => typeof saveTerceirFuncoes === 'function' && saveTerceirFuncoes(),
      () => typeof saveFuncs        === 'function' && saveFuncs(),
      () => typeof saveFuncCargos   === 'function' && saveFuncCargos(),
      () => typeof saveTiposDesperdicio === 'function' && saveTiposDesperdicio(),
      () => typeof saveCategoriasInsumo === 'function' && saveCategoriasInsumo(),
      () => typeof saveTiposAusencia === 'function' && saveTiposAusencia(),
      () => typeof saveRhConfig     === 'function' && saveRhConfig(),
    ];
    _flushFns.forEach(fn => { try { fn(); } catch (_) {} });
  }

  // Set default filter dates
  const _hoje = new Date().toISOString().slice(0, 10);
  const _30d  = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  ['despDe', 'relDe'].forEach(id => { const el = document.getElementById(id); if (el && !el.value) el.value = _30d; });
  ['despAte', 'relAte'].forEach(id => { const el = document.getElementById(id); if (el && !el.value) el.value = _hoje; });
  if (typeof renderCatTags === 'function') renderCatTags([]);

  // Realtime — assina kv_store após todos os scripts carregados
  if (window._vtpSb) db.subscribeRealtime();

  // Hide loading overlay and start auth
  const ov = document.getElementById('vtpLoadOverlay');
  if (ov) ov.style.display = 'none';
  initAuth();
})();
