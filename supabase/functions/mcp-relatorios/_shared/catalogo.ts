// Carrega os blobs kv_store que o motor de custo (vendas-engine.ts) precisa
// pra resolver sabor→Opção e bebida→Produto/Insumo. Espelha o carregamento
// que js/data.js faz via db._get no browser (mesmas chaves).
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { Catalogo, CatalogItem, Opcao, Produto, ProdutoPizza, CwMapa } from './vendas-engine.ts';

const KEYS = ['vtp_items', 'vtp_opcoes', 'vtp_produtos', 'vtp_produtos_pizza', 'vtp_cw_mapa'] as const;

export async function carregarCatalogo(sb: SupabaseClient): Promise<Catalogo> {
  const { data, error } = await sb.from('kv_store').select('key, value').in('key', KEYS);
  if (error) throw new Error(`Falha ao carregar catálogo (kv_store): ${error.message}`);

  const porChave: Record<string, unknown> = {};
  for (const row of (data || [])) porChave[row.key] = row.value;

  return {
    items:         (porChave['vtp_items'] as CatalogItem[]) || [],
    opcoes:        (porChave['vtp_opcoes'] as Opcao[]) || [],
    produtos:      (porChave['vtp_produtos'] as Produto[]) || [],
    produtosPizza: (porChave['vtp_produtos_pizza'] as ProdutoPizza[]) || [],
    cwMapa:        (porChave['vtp_cw_mapa'] as CwMapa) || { sabores: {}, bebidas: {} },
  };
}

// Só o item de estoque — usado pelas tools de estoque, que não precisam do
// resto do catálogo (opções/produtos/receitas).
export async function carregarItens(sb: SupabaseClient): Promise<CatalogItem[]> {
  const { data, error } = await sb.from('kv_store').select('value').eq('key', 'vtp_items').maybeSingle();
  if (error) throw new Error(`Falha ao carregar itens de estoque (kv_store): ${error.message}`);
  return (data?.value as CatalogItem[]) || [];
}
