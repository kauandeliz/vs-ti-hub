-- =====================================================
-- VS TI Hub — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- =====================================================

-- Tabela principal de acessos gerados
CREATE TABLE IF NOT EXISTS public.acessos (
    id                  BIGSERIAL PRIMARY KEY,

    -- Dados do colaborador
    nome                TEXT        NOT NULL,
    cpf                 TEXT        NOT NULL,
    data_admissao       DATE,
    setor               TEXT        NOT NULL,
    cargo               TEXT        NOT NULL,
    uf                  CHAR(2)     NOT NULL,
    cidade              TEXT        NOT NULL,
    bairro              TEXT,

    -- Credenciais geradas
    login_email         TEXT,
    senha_email         TEXT,
    login_wts           TEXT,
    senha_wts           TEXT,
    login_helpdesk      TEXT,
    senha_helpdesk      TEXT,
    login_nyxos         TEXT,
    senha_nyxos         TEXT,

    -- Controle de status
    status              TEXT        NOT NULL DEFAULT 'ativo'
                            CHECK (status IN ('ativo', 'revogado')),
    motivo_revogacao    TEXT,
    revogado_em         TIMESTAMPTZ,

    -- Auditoria
    criado_por          UUID        REFERENCES auth.users(id),
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMPTZ
);

-- Índices para buscas comuns
CREATE INDEX IF NOT EXISTS idx_acessos_nome    ON public.acessos (nome);
CREATE INDEX IF NOT EXISTS idx_acessos_cpf     ON public.acessos (cpf);
CREATE INDEX IF NOT EXISTS idx_acessos_status  ON public.acessos (status);
CREATE INDEX IF NOT EXISTS idx_acessos_uf      ON public.acessos (uf);
CREATE INDEX IF NOT EXISTS idx_acessos_criado  ON public.acessos (criado_em DESC);

-- Índice para full-text search em português (opcional, melhora buscas por nome/cargo)
CREATE INDEX IF NOT EXISTS idx_acessos_fts ON public.acessos
    USING gin(to_tsvector('portuguese', nome || ' ' || cargo || ' ' || setor));

-- ─── ROW LEVEL SECURITY ────────────────────────────────
-- Apenas usuários autenticados podem acessar os dados.

ALTER TABLE public.acessos ENABLE ROW LEVEL SECURITY;

-- Policy: somente usuários autenticados podem ler
CREATE POLICY "Somente autenticados podem ler" ON public.acessos
    FOR SELECT USING (auth.role() = 'authenticated');

-- Policy: somente usuários autenticados podem inserir
CREATE POLICY "Somente autenticados podem inserir" ON public.acessos
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Policy: somente usuários autenticados podem atualizar
CREATE POLICY "Somente autenticados podem atualizar" ON public.acessos
    FOR UPDATE USING (auth.role() = 'authenticated');

-- ─── COMENTÁRIOS ───────────────────────────────────────
COMMENT ON TABLE  public.acessos              IS 'Histórico de acessos gerados pelo VS TI Hub';
COMMENT ON COLUMN public.acessos.status       IS 'ativo | revogado';
COMMENT ON COLUMN public.acessos.senha_email  IS 'bcrypt hash — senha plain-text nunca é armazenada';

-- ─── DADOS DE EXEMPLO (remova em produção) ─────────────
/*
INSERT INTO public.acessos
    (nome, cpf, data_admissao, setor, cargo, uf, cidade, bairro,
     login_email, senha_email, login_wts, senha_wts,
     login_helpdesk, senha_helpdesk, login_nyxos, senha_nyxos, status)
VALUES
    ('João da Silva', '000.000.000-00', '2025-01-15',
     'Logística', 'Auxiliar de Logística', 'PR', 'Curitiba', 'Rebouças',
     'joao.silva@vinilsul.com.br', 'joao@1430#MAIL',
     'pr-joao.silva', 'joao@1430#WTS',
     'joao.silva@vinilsul.com.br', 'joao@1430#HELP',
     'joao.silva', '1234', 'ativo'),

    ('Maria Souza', '111.111.111-11', '2025-03-01',
     'Comercial', 'Executivo de Contas PL', 'SP', 'São Paulo', 'Vila Monumento',
     'maria.souza@vinilsul.com.br', 'mari@0900#MAIL',
     'sp-maria.souza', 'mari@0900#WTS',
     'maria.souza@vinilsul.com.br', 'mari@0900#HELP',
     'maria.souza', '1234', 'ativo');
*/
