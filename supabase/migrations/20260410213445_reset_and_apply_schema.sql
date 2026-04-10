-- =====================================================
-- RESET TOTAL DO SCHEMA PUBLIC (DESTRUTIVO)
-- Esta migration remove todo o schema public e reaplica o schema.sql
-- =====================================================

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;

-- =====================================================
-- VS TI Hub - Database Schema (Production-ready)
-- =====================================================


CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.acessos (
    id BIGSERIAL PRIMARY KEY,

    -- Dados do colaborador
    nome TEXT NOT NULL,
    cpf TEXT NOT NULL,
    data_admissao DATE,
    setor TEXT NOT NULL,
    cargo TEXT NOT NULL,
    uf CHAR(2) NOT NULL,
    cidade TEXT NOT NULL,
    bairro TEXT,

    -- Credenciais (sempre hash, nunca senha plana)
    login_email TEXT,
    senha_email TEXT,
    login_wts TEXT,
    senha_wts TEXT,
    login_helpdesk TEXT,
    senha_helpdesk TEXT,
    login_nyxos TEXT,
    senha_nyxos TEXT,

    -- Controle de status
    status TEXT NOT NULL DEFAULT 'ativo',
    motivo_revogacao TEXT,
    revogado_em TIMESTAMPTZ,

    -- Auditoria
    criado_por UUID REFERENCES auth.users(id),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill seguro para instalações existentes
UPDATE public.acessos
SET atualizado_em = COALESCE(atualizado_em, NOW())
WHERE atualizado_em IS NULL;

-- Constraints (nomeadas e explícitas)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'acessos_status_chk'
    ) THEN
        ALTER TABLE public.acessos
        ADD CONSTRAINT acessos_status_chk
        CHECK (status IN ('ativo', 'revogado'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'acessos_cpf_digits_chk'
    ) THEN
        ALTER TABLE public.acessos
        ADD CONSTRAINT acessos_cpf_digits_chk
        CHECK (cpf ~ '^[0-9]{11}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'acessos_uf_chk'
    ) THEN
        ALTER TABLE public.acessos
        ADD CONSTRAINT acessos_uf_chk
        CHECK (uf ~ '^[A-Z]{2}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'acessos_has_login_chk'
    ) THEN
        ALTER TABLE public.acessos
        ADD CONSTRAINT acessos_has_login_chk
        CHECK (
            COALESCE(login_email, '') <> ''
            OR COALESCE(login_wts, '') <> ''
            OR COALESCE(login_helpdesk, '') <> ''
            OR COALESCE(login_nyxos, '') <> ''
        );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'acessos_revogacao_consistencia_chk'
    ) THEN
        ALTER TABLE public.acessos
        ADD CONSTRAINT acessos_revogacao_consistencia_chk
        CHECK (
            (status = 'ativo' AND revogado_em IS NULL AND motivo_revogacao IS NULL)
            OR (status = 'revogado' AND revogado_em IS NOT NULL)
        );
    END IF;
END $$;

-- Trigger: normalização + proteção de metadados
CREATE OR REPLACE FUNCTION public.normalize_acessos_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.nome := BTRIM(COALESCE(NEW.nome, ''));
    NEW.setor := BTRIM(COALESCE(NEW.setor, ''));
    NEW.cargo := BTRIM(COALESCE(NEW.cargo, ''));
    NEW.cidade := BTRIM(COALESCE(NEW.cidade, ''));
    NEW.bairro := NULLIF(BTRIM(COALESCE(NEW.bairro, '')), '');

    NEW.cpf := REGEXP_REPLACE(COALESCE(NEW.cpf, ''), '\D', '', 'g');
    NEW.uf := UPPER(BTRIM(COALESCE(NEW.uf, '')));

    NEW.atualizado_em := NOW();

    IF TG_OP = 'INSERT' THEN
        NEW.criado_em := COALESCE(NEW.criado_em, NOW());
        IF NEW.criado_por IS NULL THEN
            NEW.criado_por := auth.uid();
        END IF;
    ELSE
        -- Campos imutáveis em update
        NEW.criado_em := OLD.criado_em;
        NEW.criado_por := OLD.criado_por;
    END IF;

    -- Consistência de status/revogação
    IF NEW.status = 'ativo' THEN
        NEW.revogado_em := NULL;
        NEW.motivo_revogacao := NULL;
    ELSIF NEW.status = 'revogado' AND NEW.revogado_em IS NULL THEN
        NEW.revogado_em := NOW();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_acessos_before_write ON public.acessos;
CREATE TRIGGER trg_normalize_acessos_before_write
BEFORE INSERT OR UPDATE ON public.acessos
FOR EACH ROW
EXECUTE FUNCTION public.normalize_acessos_before_write();

-- Índices
CREATE INDEX IF NOT EXISTS idx_acessos_criado_em_desc ON public.acessos (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_acessos_status_criado_em ON public.acessos (status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_acessos_uf_criado_em ON public.acessos (uf, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_acessos_cpf ON public.acessos (cpf);
CREATE INDEX IF NOT EXISTS idx_acessos_nome_trgm ON public.acessos USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_acessos_cargo_trgm ON public.acessos USING gin (cargo gin_trgm_ops);

-- =====================================================
-- Catálogos Dinâmicos (CRUD)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.catalog_setores (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.catalog_cargos (
    id BIGSERIAL PRIMARY KEY,
    setor_id BIGINT NOT NULL REFERENCES public.catalog_setores(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (setor_id, nome)
);

CREATE TABLE IF NOT EXISTS public.filiais (
    id BIGSERIAL PRIMARY KEY,
    codigo INTEGER,
    nome TEXT NOT NULL,
    uf CHAR(2) NOT NULL,
    cidade TEXT NOT NULL,
    bairro TEXT NOT NULL,
    endereco TEXT NOT NULL,
    numero TEXT NOT NULL,
    cnpj TEXT,
    cep TEXT,
    usa_etiqueta BOOLEAN NOT NULL DEFAULT TRUE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT filiais_uf_chk CHECK (uf ~ '^[A-Z]{2}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_filiais_codigo_unique
ON public.filiais (codigo)
WHERE codigo IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_setores_ativo_nome
ON public.catalog_setores (ativo, nome);

CREATE INDEX IF NOT EXISTS idx_catalog_cargos_setor_ativo_nome
ON public.catalog_cargos (setor_id, ativo, nome);

CREATE INDEX IF NOT EXISTS idx_filiais_ativo_uf_cidade_bairro
ON public.filiais (ativo, uf, cidade, bairro);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.atualizado_em := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_catalog_setores_updated_at ON public.catalog_setores;
CREATE TRIGGER trg_touch_catalog_setores_updated_at
BEFORE UPDATE ON public.catalog_setores
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_catalog_cargos_updated_at ON public.catalog_cargos;
CREATE TRIGGER trg_touch_catalog_cargos_updated_at
BEFORE UPDATE ON public.catalog_cargos
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_filiais_updated_at ON public.filiais;
CREATE TRIGGER trg_touch_filiais_updated_at
BEFORE UPDATE ON public.filiais
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

-- Seed inicial de setores
INSERT INTO public.catalog_setores (nome)
VALUES
    ('Comercial'),
    ('Financeiro'),
    ('Logística'),
    ('Recursos Humanos'),
    ('Marketing'),
    ('Motoristas'),
    ('Sistemas (TI)'),
    ('Técnico'),
    ('Diretoria'),
    ('Contabilidade'),
    ('Controladoria'),
    ('Terceiros'),
    ('Vendas'),
    ('Labels')
ON CONFLICT (nome) DO NOTHING;

-- Seed inicial de cargos por setor
INSERT INTO public.catalog_cargos (setor_id, nome)
SELECT s.id, v.cargo
FROM (
    VALUES
        ('Comercial', 'Analista Comercial Sul'),
        ('Comercial', 'Assistente de Vendas'),
        ('Comercial', 'Assistente de Vendas de JR'),
        ('Comercial', 'Coordenadora de Vendas'),
        ('Comercial', 'Coordenadora de Vendas PL'),
        ('Comercial', 'Executivo de Contas JR'),
        ('Comercial', 'Executivo de Contas PL'),
        ('Comercial', 'Executivo de Contas SE'),
        ('Comercial', 'Executivo de Vendas de Equipamentos'),
        ('Comercial', 'Gerente Adm de Vendas'),
        ('Comercial', 'Gerente de Mercado'),
        ('Comercial', 'Vendedor Interno'),

        ('Financeiro', 'Assistente de Contas a Pagar'),
        ('Financeiro', 'Assistente de Compras a Receber JR'),
        ('Financeiro', 'Assistente de Crédito e Cobrança'),
        ('Financeiro', 'Gerente Financeiro'),
        ('Financeiro', 'Supervisor de Crédito e Cobrança'),

        ('Logística', 'Assistente de Compras Pleno'),
        ('Logística', 'Auxiliar Administrativo'),
        ('Logística', 'Auxiliar de Documentação Fiscal'),
        ('Logística', 'Auxiliar de Logística'),
        ('Logística', 'Líder de Expedição'),
        ('Logística', 'Supervisor de Logística'),
        ('Logística', 'Gerente de Logística Central'),

        ('Recursos Humanos', 'Auxiliar de Departamento Pessoal'),
        ('Recursos Humanos', 'Assistente de Recursos Humanos'),
        ('Recursos Humanos', 'Coordenador de Recursos Humanos'),

        ('Marketing', 'Analista de Inteligência de Mercado'),
        ('Marketing', 'Menor Aprendiz'),

        ('Motoristas', 'Motorista'),
        ('Motoristas', 'Motorista JR'),

        ('Sistemas (TI)', 'Assistente de TI'),
        ('Sistemas (TI)', 'Estagiário'),
        ('Sistemas (TI)', 'Gerente de Sistemas'),

        ('Técnico', 'Técnico de Manutenção de Máquinas'),
        ('Técnico', 'Gerente de Máquinas'),

        ('Contabilidade', 'Contadora'),
        ('Controladoria', 'Gerente de Controladoria'),
        ('Terceiros', 'Representante de Vendas'),
        ('Vendas', 'Gerente Adm de Vendas'),
        ('Labels', 'Assistente de Vendas Labels PL')
) AS v(setor, cargo)
JOIN public.catalog_setores s ON s.nome = v.setor
ON CONFLICT (setor_id, nome) DO NOTHING;

-- Seed inicial de filiais
INSERT INTO public.filiais (
    codigo,
    nome,
    uf,
    cidade,
    bairro,
    endereco,
    numero,
    cnpj,
    cep,
    usa_etiqueta
)
VALUES
    (11, 'Curitiba (Matriz)', 'PR', 'Curitiba', 'Jardim Botânico', 'Rua São Joaquim', '185', '04.187.580/0001-29', '80210-220', TRUE),
    (21, 'São Paulo', 'SP', 'São Paulo', 'Vila Monumento', 'Av. Teresa Cristina', '210', '04.187.580/0003-90', '01553-000', TRUE),
    (31, 'Porto Alegre', 'RS', 'Porto Alegre', 'Navegantes', 'Rua Padre Diogo Feijó', '183', '04.187.580/0002-00', '90240-421', TRUE),
    (41, 'Rio de Janeiro', 'RJ', 'Rio de Janeiro', 'Bonsucesso', 'Av. Teixeira de Castro', '250', '04.771.035/0001-85', '21040-112', TRUE),
    (61, 'São José (SC)', 'SC', 'São José', 'Serraria', 'Rua N. Sra. de Guadalupe', '477', '04.187.580/0004-71', '88113-130', TRUE),
    (100, 'Curitiba (Rebouças)', 'PR', 'Curitiba', 'Rebouças', 'Rua Brigadeiro Franco', '3519', '04.187.580/0010-10', NULL, FALSE),
    (111, 'Curitiba (CIC)', 'PR', 'Curitiba', 'Cidade Industrial', 'Rua Cyro Correia Pereira', '2100-B', '04.187.580/0007-14', '81460-050', TRUE),
    (141, 'Rio de Janeiro (Unidade 141)', 'RJ', 'Rio de Janeiro', 'Bonsucesso', 'Av. Teixeira de Castro', '250', '04.187.580/0008-03', '21040-112', FALSE),
    (151, 'Aparecida de Goiânia', 'GO', 'Aparecida de Goiânia', 'Vila Maria', 'Av. Juscelino Kubitschek', 'SN', '04.187.580/0009-86', NULL, FALSE),
    (152, 'Goiânia', 'GO', 'Goiânia', 'Setor Bueno', 'Rua T 30', 'SN', '04.187.580/0014-43', NULL, FALSE),
    (171, 'Uberlândia', 'MG', 'Uberlândia', 'Brasil', 'Rua Padre Américo Ceppi', '481', '04.187.580/0012-81', '38400-606', TRUE),
    (191, 'Brasília', 'DF', 'Brasília', 'Guará', 'ST SCIA Quadra-13 Conj-03', 'SN', '04.187.580/0011-09', '71250-715', TRUE)
ON CONFLICT DO NOTHING;

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE public.acessos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_setores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filiais ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin', false);
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "Somente autenticados podem ler" ON public.acessos;
DROP POLICY IF EXISTS "Somente autenticados podem inserir" ON public.acessos;
DROP POLICY IF EXISTS "Somente autenticados podem atualizar" ON public.acessos;
DROP POLICY IF EXISTS acessos_select_authenticated ON public.acessos;
DROP POLICY IF EXISTS acessos_insert_authenticated ON public.acessos;
DROP POLICY IF EXISTS acessos_update_authenticated ON public.acessos;
DROP POLICY IF EXISTS catalog_setores_select_authenticated ON public.catalog_setores;
DROP POLICY IF EXISTS catalog_setores_write_admin ON public.catalog_setores;
DROP POLICY IF EXISTS catalog_setores_update_admin ON public.catalog_setores;
DROP POLICY IF EXISTS catalog_setores_delete_admin ON public.catalog_setores;
DROP POLICY IF EXISTS catalog_cargos_select_authenticated ON public.catalog_cargos;
DROP POLICY IF EXISTS catalog_cargos_write_admin ON public.catalog_cargos;
DROP POLICY IF EXISTS catalog_cargos_update_admin ON public.catalog_cargos;
DROP POLICY IF EXISTS catalog_cargos_delete_admin ON public.catalog_cargos;
DROP POLICY IF EXISTS filiais_select_authenticated ON public.filiais;
DROP POLICY IF EXISTS filiais_write_admin ON public.filiais;
DROP POLICY IF EXISTS filiais_update_admin ON public.filiais;
DROP POLICY IF EXISTS filiais_delete_admin ON public.filiais;

CREATE POLICY acessos_select_authenticated
ON public.acessos
FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY acessos_insert_authenticated
ON public.acessos
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY acessos_update_authenticated
ON public.acessos
FOR UPDATE
TO authenticated
USING (TRUE)
WITH CHECK (TRUE);

CREATE POLICY catalog_setores_select_authenticated
ON public.catalog_setores
FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY catalog_setores_write_admin
ON public.catalog_setores
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY catalog_setores_update_admin
ON public.catalog_setores
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY catalog_setores_delete_admin
ON public.catalog_setores
FOR DELETE
TO authenticated
USING (public.is_admin());

CREATE POLICY catalog_cargos_select_authenticated
ON public.catalog_cargos
FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY catalog_cargos_write_admin
ON public.catalog_cargos
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY catalog_cargos_update_admin
ON public.catalog_cargos
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY catalog_cargos_delete_admin
ON public.catalog_cargos
FOR DELETE
TO authenticated
USING (public.is_admin());

CREATE POLICY filiais_select_authenticated
ON public.filiais
FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY filiais_write_admin
ON public.filiais
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY filiais_update_admin
ON public.filiais
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY filiais_delete_admin
ON public.filiais
FOR DELETE
TO authenticated
USING (public.is_admin());

-- Sem policy de DELETE por padrão.

COMMENT ON TABLE public.acessos IS 'Historico de acessos gerados no VS TI Hub';
COMMENT ON COLUMN public.acessos.senha_email IS 'Hash bcrypt (senha em texto nunca e armazenada)';
COMMENT ON COLUMN public.acessos.status IS 'ativo | revogado';
COMMENT ON TABLE public.catalog_setores IS 'Cadastro de setores para o Gerador de Acessos (CRUD)';
COMMENT ON TABLE public.catalog_cargos IS 'Cadastro de cargos vinculados a setores (CRUD)';
COMMENT ON TABLE public.filiais IS 'Cadastro de filiais/unidades e base para cidades/bairros e etiquetas';

