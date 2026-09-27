-- Checklist: aplicação atômica de alterações nas sessões (vtp_ck_sessoes).
--
-- Antes, cada aparelho regravava o array inteiro de sessões no kv_store. Com
-- vários funcionários marcando itens ao mesmo tempo (abertura), a última
-- gravação apagava as marcações dos outros.
--
-- Agora o cliente envia só as operações (diff) e esta função aplica sobre o
-- valor atual com FOR UPDATE — serializa as gravações sem mudar o formato do
-- dado (o resto do app e o Realtime continuam lendo o mesmo kv_store).
--
-- Operações (p_ops = array):
--   {op:'add',   sess:{...}}                 insere se não existir (mesmo id, ou mesmo templateId+userId+data)
--   {op:'del',   id}                         remove a sessão
--   {op:'patch', id, fields:{...}}           merge raso de campos (null = limpa)
--   {op:'resp',  id, item, val}              respostas[item] = val  (val null = desmarca)
--
-- Retorna o array resultante.

CREATE OR REPLACE FUNCTION ck_aplicar_ops(p_ops JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v    JSONB;
  op   JSONB;
  idx  INT;
  resp JSONB;
BEGIN
  INSERT INTO kv_store (key, value) VALUES ('vtp_ck_sessoes', '[]'::jsonb)
  ON CONFLICT (key) DO NOTHING;

  SELECT value INTO v FROM kv_store WHERE key = 'vtp_ck_sessoes' FOR UPDATE;
  IF v IS NULL OR jsonb_typeof(v) <> 'array' THEN v := '[]'::jsonb; END IF;

  FOR op IN SELECT * FROM jsonb_array_elements(COALESCE(p_ops, '[]'::jsonb)) LOOP
    idx := NULL;

    IF op->>'op' = 'add' THEN
      SELECT (e.i - 1) INTO idx
      FROM jsonb_array_elements(v) WITH ORDINALITY AS e(s, i)
      WHERE e.s->>'id' = op->'sess'->>'id'
         OR (e.s->>'templateId' = op->'sess'->>'templateId'
             AND e.s->>'userId' = op->'sess'->>'userId'
             AND e.s->>'data'   = op->'sess'->>'data')
      LIMIT 1;
      IF idx IS NULL THEN v := v || jsonb_build_array(op->'sess'); END IF;
      CONTINUE;
    END IF;

    SELECT (e.i - 1) INTO idx
    FROM jsonb_array_elements(v) WITH ORDINALITY AS e(s, i)
    WHERE e.s->>'id' = op->>'id'
    LIMIT 1;
    IF idx IS NULL THEN CONTINUE; END IF;

    IF op->>'op' = 'del' THEN
      v := v - idx;
    ELSIF op->>'op' = 'patch' THEN
      v := jsonb_set(v, ARRAY[idx::text], (v->idx) || COALESCE(op->'fields', '{}'::jsonb));
    ELSIF op->>'op' = 'resp' THEN
      resp := v->idx->'respostas';
      IF resp IS NULL OR jsonb_typeof(resp) <> 'object' THEN resp := '{}'::jsonb; END IF;
      IF op->'val' IS NULL OR jsonb_typeof(op->'val') = 'null' THEN
        resp := resp - (op->>'item');
      ELSE
        resp := resp || jsonb_build_object(op->>'item', op->'val');
      END IF;
      v := jsonb_set(v, ARRAY[idx::text, 'respostas'], resp);
    END IF;
  END LOOP;

  UPDATE kv_store SET value = v WHERE key = 'vtp_ck_sessoes';
  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION ck_aplicar_ops(JSONB) TO anon, authenticated;
