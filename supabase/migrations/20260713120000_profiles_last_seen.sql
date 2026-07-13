-- Adiciona last_seen para presença em tempo real no módulo Omnichannel
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;

-- Índice para queries de "online nos últimos 90s"
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON profiles (last_seen DESC);

-- RLS: atendentes podem atualizar seu próprio last_seen
CREATE POLICY "Atendente atualiza proprio last_seen"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
