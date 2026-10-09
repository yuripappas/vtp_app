import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>; // JSON Schema
  handler: (args: Record<string, unknown>, sb: SupabaseClient) => Promise<unknown>;
}
