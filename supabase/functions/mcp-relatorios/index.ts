// VTP Compras — mcp-relatorios
//
// Servidor MCP (Model Context Protocol) somente-leitura, transporte
// Streamable HTTP (modo simples: 1 requisição JSON-RPC → 1 resposta JSON,
// sem stream SSE — suficiente aqui porque nenhuma tool precisa notificar o
// cliente no meio da execução). Existe pra dar a agentes externos (Hermes)
// acesso de CONSULTA aos números do negócio (vendas, CMV, estoque) — nunca
// escreve nada: cada tool só faz `.select()` no Supabase.
//
// Protegido por token compartilhado (header "Authorization: Bearer <token>"),
// guardado como secret MCP_ACCESS_TOKEN — sem isso, qualquer um que
// descobrisse a URL da function leria faturamento/CMV do negócio.
//
// Ver plano: /Users/yurioliveira/.claude/plans/witty-painting-gadget.md

import { getServiceClient } from './_shared/supabase-client.ts';
import type { McpTool } from './_shared/types.ts';
import { vendasResumo, vendasPorCanalTool, vendasPorHora, vendasPorBairro } from './vendas.ts';
import { cmvPeriodo } from './cmv.ts';
import { estoqueConsulta, estoqueAbaixoMinimo } from './estoque.ts';
import { operacaoTempos, pedidosAtrasados } from './operacao.ts';
import { clientesRecorrencia } from './clientes.ts';

const TOOLS: McpTool[] = [
  vendasResumo, vendasPorCanalTool, vendasPorHora, vendasPorBairro,
  cmvPeriodo,
  estoqueConsulta, estoqueAbaixoMinimo,
  operacaoTempos, pedidosAtrasados,
  clientesRecorrencia,
];
const TOOLS_BY_NAME = new Map(TOOLS.map(t => [t.name, t]));

const SERVER_INFO = { name: 'vtp-relatorios', version: '1.0.0' };
const PROTOCOL_VERSION = '2024-11-05';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const JSON_HEADERS = { ...CORS_HEADERS, 'Content-Type': 'application/json' };

interface JsonRpcRequest { jsonrpc: '2.0'; id?: string | number | null; method: string; params?: Record<string, unknown> }
interface JsonRpcResponse { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string } }

function rpcResult(id: JsonRpcRequest['id'], result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, result };
}
function rpcError(id: JsonRpcRequest['id'], code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function handleOne(req: JsonRpcRequest, sb: ReturnType<typeof getServiceClient>): Promise<JsonRpcResponse | null> {
  const isNotification = req.id === undefined;

  switch (req.method) {
    case 'initialize':
      return isNotification ? null : rpcResult(req.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });

    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null; // notificações não recebem resposta (spec JSON-RPC 2.0)

    case 'ping':
      return isNotification ? null : rpcResult(req.id, {});

    case 'tools/list':
      return isNotification ? null : rpcResult(req.id, {
        tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });

    case 'tools/call': {
      const name = req.params?.name as string | undefined;
      const args = (req.params?.arguments as Record<string, unknown>) || {};
      const tool = name ? TOOLS_BY_NAME.get(name) : undefined;
      if (!tool) {
        if (isNotification) return null;
        return rpcResult(req.id, { content: [{ type: 'text', text: `Tool desconhecida: "${name}"` }], isError: true });
      }
      try {
        const data = await tool.handler(args, sb);
        if (isNotification) return null;
        return rpcResult(req.id, { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
      } catch (e) {
        if (isNotification) return null;
        const msg = e instanceof Error ? e.message : String(e);
        return rpcResult(req.id, { content: [{ type: 'text', text: `Erro ao executar "${name}": ${msg}` }], isError: true });
      }
    }

    default:
      return isNotification ? null : rpcError(req.id, -32601, `Método desconhecido: "${req.method}"`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });

  const expectedToken = Deno.env.get('MCP_ACCESS_TOKEN');
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!expectedToken || token !== expectedToken) {
    return new Response(JSON.stringify(rpcError(null, -32000, 'Não autorizado')), { status: 401, headers: JSON_HEADERS });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify(rpcError(null, -32700, 'JSON inválido')), { status: 400, headers: JSON_HEADERS });
  }

  const sb = getServiceClient();
  const requests = Array.isArray(body) ? body as JsonRpcRequest[] : [body as JsonRpcRequest];
  const responses = (await Promise.all(requests.map(r => handleOne(r, sb)))).filter((r): r is JsonRpcResponse => r !== null);

  if (!responses.length) return new Response(null, { status: 202, headers: CORS_HEADERS }); // só notificações
  const payload = Array.isArray(body) ? responses : responses[0];
  return new Response(JSON.stringify(payload), { headers: JSON_HEADERS });
});
