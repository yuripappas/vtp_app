-- VTP Atendimento — dados iniciais (canal, tags, base de conhecimento)

INSERT INTO atd_canais (tipo, nome, config) VALUES
  ('whatsapp', 'WhatsApp VTP', '{}'::jsonb);

INSERT INTO atd_tags (nome, categoria, sentimento, peso_reputacao) VALUES
  ('Atendimento rápido',     'Serviço',    'positivo', 3),
  ('Atendimento demorado',   'Serviço',    'negativo', 6),
  ('Atraso na entrega',      'Entrega',    'negativo', 6),
  ('Endereço não encontrado','Entrega',    'negativo', 4),
  ('Entrega no prazo',       'Entrega',    'positivo', 2),
  ('Pizza fria',             'Produto',    'negativo', 7),
  ('Corpo estranho',         'Produto',    'negativo', 10),
  ('Elogio ao sabor',        'Produto',    'positivo', 4),
  ('Reclamação de preço',    'Preço',      'negativo', 3),
  ('Ameaça jurídica',        'Reputação',  'negativo', 10),
  ('Ameaça redes sociais',   'Reputação',  'negativo', 9),
  ('Resolvido com cupom',    'Resolução',  'neutro',   2),
  ('Resolvido com reenvio',  'Resolução',  'neutro',   3),
  ('Escalado ao gerente',    'Resolução',  'neutro',   1);

INSERT INTO atd_base_conhecimento (secao, titulo, conteudo) VALUES
('tom_voz', 'Tom de voz e identidade da marca',
$$Tom: caloroso, descontraído mas profissional. Nunca formal demais, nunca informal demais.

SEMPRE:
- Cumprimentar com o nome do cliente quando disponível
- Usar emojis com moderação (🍕 ❤️ ✅ são os principais)
- Frases curtas e diretas
- Encerrar oferecendo ajuda: "Qualquer dúvida é só chamar!"

NUNCA:
- "Prezado(a)" — muito formal
- Abreviações: vc, tb, pq, tá, ta, cmg, blz
- Texto em CAIXA ALTA
- Múltiplos pontos de exclamação seguidos (!!!)
- Resposta genérica sem contexto$$),

('gestao_crise', 'Protocolos de gestão de crise',
$$ATRASO NA ENTREGA:
- Até 15min: informar + pedir desculpas
- 15–30min: cupom 10% próxima compra
- +30min: cupom 20% ou reenvio
- +1h: reenvio obrigatório + cupom 30% + ESCALAR GERENTE

PROBLEMA DE QUALIDADE:
- Sem foto: pedir foto antes de qualquer ação
- Com foto - problema pequeno: cupom 15%
- Com foto - corpo estranho / problema grave: ESCALAR GERENTE IMEDIATAMENTE
- NUNCA minimizar reclamação de qualidade

CLIENTE INSATISFEITO (sem problema real comprovado):
- Tom empático mas firme
- NÃO oferecer compensação automaticamente
- Se insistir muito: cupom simbólico 10%
- Se ameaçar redes sociais: ESCALAR GERENTE

AMEAÇA JURÍDICA (Procon, advogado, processo):
- PARAR imediatamente — NÃO prometer nada
- ESCALAR GERENTE — decisão humana obrigatória
- Resposta padrão: "Entendo sua situação. Vou acionar nossa gestão para que possamos resolver isso da melhor forma. Pode aguardar um momento?"$$),

('compensacoes', 'Políticas de compensação',
$$CUPONS — quem pode criar:
- Até 15% desconto: atendente pode criar sozinho
- 20–30% desconto: requer aprovação do gerente
- Reenvio de pedido: requer aprovação do gerente
- Reembolso em dinheiro: NUNCA pelo atendimento — somente gerente

REENVIO:
- Apenas para problemas comprovados com foto
- Registrar motivo obrigatório
- Informar prazo estimado honesto (não prometer o impossível)$$);

INSERT INTO atd_respostas_rapidas (atalho, titulo, conteudo) VALUES
  ('/horario',  'Horário de funcionamento', 'Funcionamos de terça a domingo, das 18h às 23h30! 🍕'),
  ('/cardapio', 'Link do cardápio',         'Olha nosso cardápio completo aqui: [link]'),
  ('/pix',      'Dados para Pix',           'Pode fazer o Pix pra chave: [chave] — qualquer coisa me chama!');
