-- =====================================================
-- VS TI Hub - Database Schema (Production-ready)
-- =====================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS public.colaboradores (
    id BIGSERIAL PRIMARY KEY,

    -- Campos de cadastro operacional
    status TEXT NOT NULL DEFAULT 'ATIVO',
    uf CHAR(2) NOT NULL,
    loja TEXT NOT NULL,
    empresa TEXT NOT NULL,
    nome TEXT NOT NULL,
    setor TEXT NOT NULL,
    funcao TEXT NOT NULL,

    -- Auditoria
    criado_por UUID REFERENCES auth.users(id),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill seguro para instalações existentes
UPDATE public.colaboradores
SET atualizado_em = COALESCE(atualizado_em, NOW())
WHERE atualizado_em IS NULL;

-- Constraints (nomeadas e explícitas)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'colaboradores_status_chk'
    ) THEN
        ALTER TABLE public.colaboradores
        ADD CONSTRAINT colaboradores_status_chk
        CHECK (status IN ('ATIVO', 'INATIVO'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'colaboradores_uf_chk'
    ) THEN
        ALTER TABLE public.colaboradores
        ADD CONSTRAINT colaboradores_uf_chk
        CHECK (uf ~ '^[A-Z]{2}$');
    END IF;

END $$;

-- Trigger: normalização + proteção de metadados
CREATE OR REPLACE FUNCTION public.normalize_colaboradores_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.status := UPPER(BTRIM(COALESCE(NEW.status, 'ATIVO')));
    NEW.uf := UPPER(BTRIM(COALESCE(NEW.uf, '')));
    NEW.loja := BTRIM(COALESCE(NEW.loja, ''));
    NEW.empresa := BTRIM(COALESCE(NEW.empresa, ''));
    NEW.nome := BTRIM(COALESCE(NEW.nome, ''));
    NEW.setor := BTRIM(COALESCE(NEW.setor, ''));
    NEW.funcao := BTRIM(COALESCE(NEW.funcao, ''));

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

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_colaboradores_before_write ON public.colaboradores;
CREATE TRIGGER trg_normalize_colaboradores_before_write
BEFORE INSERT OR UPDATE ON public.colaboradores
FOR EACH ROW
EXECUTE FUNCTION public.normalize_colaboradores_before_write();

-- Índices
CREATE INDEX IF NOT EXISTS idx_colaboradores_criado_em_desc ON public.colaboradores (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_colaboradores_status_nome ON public.colaboradores (status, nome);
CREATE INDEX IF NOT EXISTS idx_colaboradores_uf_loja ON public.colaboradores (uf, loja);
CREATE INDEX IF NOT EXISTS idx_colaboradores_nome_trgm ON public.colaboradores USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_colaboradores_setor_trgm ON public.colaboradores USING gin (setor gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_colaboradores_funcao_trgm ON public.colaboradores USING gin (funcao gin_trgm_ops);

CREATE OR REPLACE VIEW public.vw_colaboradores_planilha AS
SELECT
    c.status AS "STATUS",
    c.uf AS "UF",
    c.loja AS "LOJA",
    c.empresa AS "EMPRESA",
    c.nome AS "NOME",
    c.setor AS "SETOR",
    c.funcao AS "FUNÇÃO"
FROM public.colaboradores c;

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

CREATE TABLE IF NOT EXISTS public.catalog_direcionadores (
    id BIGSERIAL PRIMARY KEY,
    area TEXT NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT NOT NULL,
    link TEXT NOT NULL,
    imagem_url TEXT NOT NULL,
    ordem INTEGER NOT NULL DEFAULT 100,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT catalog_direcionadores_area_chk CHECK (area IN ('home', 'helpdesk', 'corporativo', 'telecom')),
    CONSTRAINT catalog_direcionadores_ordem_chk CHECK (ordem >= 0),
    UNIQUE (area, nome)
);

CREATE TABLE IF NOT EXISTS public.catalog_documentacao (
    id BIGSERIAL PRIMARY KEY,
    tipo TEXT NOT NULL DEFAULT 'DOCUMENTO',
    parent_id BIGINT REFERENCES public.catalog_documentacao(id) ON DELETE CASCADE,
    ordem INTEGER NOT NULL DEFAULT 100,
    categoria TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    arquivo_nome TEXT,
    arquivo_path TEXT UNIQUE,
    arquivo_mime_type TEXT,
    arquivo_tamanho_bytes BIGINT,
    criado_por UUID REFERENCES auth.users(id),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT catalog_documentacao_tipo_chk CHECK (tipo IN ('DOCUMENTO', 'PASTA')),
    CONSTRAINT catalog_documentacao_parent_chk CHECK (parent_id IS NULL OR parent_id <> id),
    CONSTRAINT catalog_documentacao_categoria_chk CHECK (categoria IN ('TERMO_RESPONSABILIDADE', 'TUTORIAL_TI', 'TERMO_ASSINADO', 'GERAL')),
    CONSTRAINT catalog_documentacao_ordem_chk CHECK (ordem >= 0),
    CONSTRAINT catalog_documentacao_arquivo_tamanho_chk CHECK (arquivo_tamanho_bytes IS NULL OR arquivo_tamanho_bytes >= 0),
    CONSTRAINT catalog_documentacao_tipo_payload_chk CHECK (
        (tipo = 'PASTA' AND arquivo_nome IS NULL AND arquivo_path IS NULL AND arquivo_mime_type IS NULL AND arquivo_tamanho_bytes IS NULL)
        OR
        (tipo = 'DOCUMENTO' AND arquivo_nome IS NOT NULL AND arquivo_path IS NOT NULL)
    )
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

CREATE INDEX IF NOT EXISTS idx_catalog_direcionadores_area_ativo_ordem_nome
ON public.catalog_direcionadores (area, ativo, ordem, nome);

CREATE INDEX IF NOT EXISTS idx_catalog_documentacao_categoria_criado_em
ON public.catalog_documentacao (categoria, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_catalog_documentacao_titulo_trgm
ON public.catalog_documentacao USING gin (titulo gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_catalog_documentacao_parent_ordem_titulo
ON public.catalog_documentacao (parent_id, ordem, titulo);

CREATE INDEX IF NOT EXISTS idx_catalog_documentacao_tipo_parent
ON public.catalog_documentacao (tipo, parent_id);

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

DROP TRIGGER IF EXISTS trg_touch_catalog_direcionadores_updated_at ON public.catalog_direcionadores;
CREATE TRIGGER trg_touch_catalog_direcionadores_updated_at
BEFORE UPDATE ON public.catalog_direcionadores
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_catalog_documentacao_updated_at ON public.catalog_documentacao;
CREATE TRIGGER trg_touch_catalog_documentacao_updated_at
BEFORE UPDATE ON public.catalog_documentacao
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.normalize_lookup_text(input_text TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT BTRIM(
        REGEXP_REPLACE(
            REGEXP_REPLACE(
                UPPER(unaccent(COALESCE(input_text, ''))),
                '[^A-Z0-9]+',
                ' ',
                'g'
            ),
            '\s+',
            ' ',
            'g'
        )
    );
$$;

CREATE TABLE IF NOT EXISTS public.colaboradores_loja_empresa_map (
    id BIGSERIAL PRIMARY KEY,
    loja_chave TEXT NOT NULL UNIQUE,
    empresa TEXT NOT NULL,
    fonte TEXT NOT NULL DEFAULT 'FILIAIS' CHECK (fonte IN ('FILIAIS', 'MANUAL')),
    loja_referencia TEXT,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_touch_colaboradores_loja_empresa_map_updated_at ON public.colaboradores_loja_empresa_map;
CREATE TRIGGER trg_touch_colaboradores_loja_empresa_map_updated_at
BEFORE UPDATE ON public.colaboradores_loja_empresa_map
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.refresh_colaboradores_loja_empresa_map_from_filiais()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM public.colaboradores_loja_empresa_map
    WHERE fonte = 'FILIAIS';

    INSERT INTO public.colaboradores_loja_empresa_map (loja_chave, empresa, fonte, loja_referencia)
    SELECT
        public.normalize_lookup_text(f.nome),
        COALESCE(f.codigo::TEXT, 'N/D'),
        'FILIAIS',
        f.nome
    FROM public.filiais f
    WHERE f.ativo = TRUE
      AND public.normalize_lookup_text(f.nome) <> ''
    ON CONFLICT (loja_chave) DO NOTHING;

    INSERT INTO public.colaboradores_loja_empresa_map (loja_chave, empresa, fonte, loja_referencia)
    SELECT
        public.normalize_lookup_text(f.cidade || ' ' || f.bairro),
        COALESCE(f.codigo::TEXT, 'N/D'),
        'FILIAIS',
        f.cidade || ' / ' || f.bairro
    FROM public.filiais f
    WHERE f.ativo = TRUE
      AND public.normalize_lookup_text(f.cidade || ' ' || f.bairro) <> ''
    ON CONFLICT (loja_chave) DO NOTHING;

    WITH cidades_unicas AS (
        SELECT
            public.normalize_lookup_text(f.cidade) AS cidade_chave,
            MIN(f.codigo)::TEXT AS empresa
        FROM public.filiais f
        WHERE f.ativo = TRUE
        GROUP BY public.normalize_lookup_text(f.cidade)
        HAVING COUNT(*) = 1
    )
    INSERT INTO public.colaboradores_loja_empresa_map (loja_chave, empresa, fonte, loja_referencia)
    SELECT
        cu.cidade_chave,
        cu.empresa,
        'FILIAIS',
        'cidade-unica'
    FROM cidades_unicas cu
    WHERE cu.cidade_chave <> ''
    ON CONFLICT (loja_chave) DO NOTHING;

    WITH bairros_unicos AS (
        SELECT
            public.normalize_lookup_text(f.bairro) AS bairro_chave,
            MIN(f.codigo)::TEXT AS empresa
        FROM public.filiais f
        WHERE f.ativo = TRUE
        GROUP BY public.normalize_lookup_text(f.bairro)
        HAVING COUNT(*) = 1
    )
    INSERT INTO public.colaboradores_loja_empresa_map (loja_chave, empresa, fonte, loja_referencia)
    SELECT
        bu.bairro_chave,
        bu.empresa,
        'FILIAIS',
        'bairro-unico'
    FROM bairros_unicos bu
    WHERE bu.bairro_chave <> ''
    ON CONFLICT (loja_chave) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_colaboradores_empresa_from_loja()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    updated_count INTEGER := 0;
BEGIN
    UPDATE public.colaboradores c
    SET empresa = m.empresa
    FROM public.colaboradores_loja_empresa_map m
    WHERE m.loja_chave = public.normalize_lookup_text(c.loja)
      AND COALESCE(BTRIM(c.empresa), '') IS DISTINCT FROM m.empresa;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_colaborador_empresa_from_map()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    mapped_empresa TEXT;
BEGIN
    SELECT m.empresa
    INTO mapped_empresa
    FROM public.colaboradores_loja_empresa_map m
    WHERE m.loja_chave = public.normalize_lookup_text(NEW.loja)
    LIMIT 1;

    IF mapped_empresa IS NOT NULL THEN
        NEW.empresa := mapped_empresa;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_filiais_change_refresh_colaboradores_map()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM public.refresh_colaboradores_loja_empresa_map_from_filiais();
    PERFORM public.sync_colaboradores_empresa_from_loja();
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_colaborador_empresa_from_map ON public.colaboradores;
CREATE TRIGGER trg_apply_colaborador_empresa_from_map
BEFORE INSERT OR UPDATE OF loja ON public.colaboradores
FOR EACH ROW
EXECUTE FUNCTION public.apply_colaborador_empresa_from_map();

DROP TRIGGER IF EXISTS trg_refresh_colaboradores_map_on_filiais_change ON public.filiais;
CREATE TRIGGER trg_refresh_colaboradores_map_on_filiais_change
AFTER INSERT OR UPDATE OR DELETE ON public.filiais
FOR EACH STATEMENT
EXECUTE FUNCTION public.handle_filiais_change_refresh_colaboradores_map();

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

-- Seed de aliases manuais do mapa LOJA -> EMPRESA
INSERT INTO public.colaboradores_loja_empresa_map (loja_chave, empresa, fonte, loja_referencia)
VALUES
    (public.normalize_lookup_text('CURITIBA BOTANICO'), '11', 'MANUAL', 'Alias planilha'),
    (public.normalize_lookup_text('CURITIBA BRIGADEIRO'), '100', 'MANUAL', 'Alias planilha'),
    (public.normalize_lookup_text('CURITIBA CIC'), '111', 'MANUAL', 'Alias planilha'),
    (public.normalize_lookup_text('SETOR BUENO'), '152', 'MANUAL', 'Alias planilha'),
    (public.normalize_lookup_text('RIO DE JANEIRO'), '141', 'MANUAL', 'Alias planilha'),
    (public.normalize_lookup_text('ESCRITORIO PROPRIO'), '0', 'MANUAL', 'Alias planilha')
ON CONFLICT (loja_chave) DO UPDATE
SET
    empresa = EXCLUDED.empresa,
    fonte = EXCLUDED.fonte,
    loja_referencia = EXCLUDED.loja_referencia,
    atualizado_em = NOW();

SELECT public.refresh_colaboradores_loja_empresa_map_from_filiais();
SELECT public.sync_colaboradores_empresa_from_loja();

-- Seed inicial dos cards direcionadores
INSERT INTO public.catalog_direcionadores (area, nome, descricao, link, imagem_url, ordem)
VALUES
    ('home', 'Helpdesk VinilSul', 'Atendimento interno e gestão de chamados.', 'https://helpdesk.vinilsul.com.br/', 'https://raichu-uploads.s3.amazonaws.com/logo_vinilsul_hNmJQ9.png', 10),
    ('home', 'Microsoft Entra', 'Gestão de identidade, diretório e licenças.', 'https://entra.microsoft.com/', 'https://www.lighthouseit.co.uk/wp-content/uploads/2025/03/MSFT_Entra_Blog-thumb_16-9_v1-771x434.png', 20),
    ('home', 'Senior X', 'Plataforma corporativa de ERP e RH.', 'https://platform.senior.com.br/login/', 'https://s3.amazonaws.com//beta-img.b2bstack.net/uploads/production/provider/image/9/senior-sistemas-logo.png', 30),
    ('home', 'Salesforce CRM', 'Acompanhamento comercial e relacionamento.', 'https://login.salesforce.com/', 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Salesforce.com_logo.svg/500px-Salesforce.com_logo.svg.png', 40),

    ('helpdesk', 'Helpdesk MasterTech', 'GLPI Service Desk — parceiro', 'https://mastertech.soft4.com.br/login', 'https://mastertechsistemas.com.br/wp-content/uploads/logotipo_mastertech.png', 10),
    ('helpdesk', 'Helpdesk Sekur', 'GLPI Service Desk — parceiro', 'https://helpdesk.sekurtecnologia.com.br/', 'https://media.licdn.com/dms/image/v2/C4E0BAQEWdvhrQhtZXw/company-logo_200_200/company-logo_200_200/0/1631367297504/sekur_tecnologia_logo?e=2147483647&v=beta&t=YFzbClhb-amHgkBNp_LZDdC0Z3st-WM-4W1m7MDVeIU', 20),
    ('helpdesk', 'Helpdesk VinilSul', 'GLPI Service Desk — interno', 'https://helpdesk.vinilsul.com.br/', 'https://raichu-uploads.s3.amazonaws.com/logo_vinilsul_hNmJQ9.png', 30),

    ('corporativo', 'Admin E-mails', 'Console de contas', 'https://mailadmin.elhnld.hospedagemweb.net/iredadmin/', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTfxcMZCGSQUbU2Act-QbKDT9pK3X_pTkKlBg&s', 10),
    ('corporativo', 'Admin GoTo', 'Telefonia IP', 'https://admin.goto.com/', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRmPzJYV6y5WOXMrfOge75QBfskhUaKi6WdCg&s', 20),
    ('corporativo', 'Microsoft Entra', 'Active Directory', 'https://entra.microsoft.com/', 'https://www.lighthouseit.co.uk/wp-content/uploads/2025/03/MSFT_Entra_Blog-thumb_16-9_v1-771x434.png', 30),
    ('corporativo', 'Salesforce CRM', 'Gestão Comercial', 'https://login.salesforce.com/', 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Salesforce.com_logo.svg/500px-Salesforce.com_logo.svg.png', 40),
    ('corporativo', 'Senior X', 'ERP & RH', 'https://platform.senior.com.br/login/', 'https://s3.amazonaws.com//beta-img.b2bstack.net/uploads/production/provider/image/9/senior-sistemas-logo.png', 50),
    ('corporativo', 'SQL — Relatórios', 'Gerenciador', 'http://192.168.200.31:9070/relatorios/Pages/Folder.aspx', 'https://files.tecnoblog.net/wp-content/uploads/2019/09/windows-folder-700x394.jpg', 60),
    ('corporativo', 'Webmail', 'E-mail corporativo', 'https://webmail.vinilsul.com.br/mail/', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTfxcMZCGSQUbU2Act-QbKDT9pK3X_pTkKlBg&s', 70),

    ('telecom', 'Algar Telecom', 'Portal do cliente', 'https://customeridentity.algar.com.br/auth?client_id=0d86fb2f-6a6c-47e2-9ad7-6b35521f475f&state=1965756151&nonce&redirect_uri=https%3A%2F%2Floja.algar.com.br%2Fon%2Fdemandware.store%2FSites-algartelecom-BR-Site%2Fpt_BR%2FLogin-OAuthReentryAlgarLoginProvider', 'https://yt3.googleusercontent.com/UiGmCyeAqY_fu8wExnd9XAsjwGIqwLTKiCy-m7fUY_YeLXd6xf_G3QVQb6r_OcwEw4qdmaXlqQ=s900-c-k-c0x00ffffff-no-rj', 10),
    ('telecom', 'Claro / Embratel', 'Embratel Online', 'https://webebt01.embratel.com.br/embratelonline/index.asp', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRLAHujXLaco-9GRUgrtH12xSPaLB1kMip6qA&s', 20),
    ('telecom', 'LEX Alexandria', 'Gestão de energia', 'https://cliente.alexandriaenergia.com/', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQAOeYw50WCigUiyHlqGDoDX64u9LB1ngSR5Q&s', 30),
    ('telecom', 'Ligga Telecom', 'Autoatendimento', 'https://www.liggatelecom.com.br/autoatendimento/pub/login.jsf', 'https://carreira.inhire.com.br/wp-content/uploads/2025/10/LOGO_LIGGA_TELECOM_1-1-1.png', 40),
    ('telecom', 'Meu TIM', 'Gestão corporativa', 'https://meutim.tim.com.br/', 'https://play-lh.googleusercontent.com/U_NE4YtUoSzUU-wa7spbP0vB9VqrVxSrcjodyvGo-EsMDo4Pr-hLmutRuVXNz4V_eg', 50),
    ('telecom', 'Novacia', 'Autoatendimento', 'https://pap.onitel.com.br/central-do-assinante/novacia/', 'https://media.licdn.com/dms/image/v2/C560BAQHGD7niTowhMw/company-logo_200_200/company-logo_200_200/0/1644847527143/grupo_novacia_logo?e=2147483647&v=beta&t=HI4DQhTCq3vWkoAxJW2Wjffj2Fhqka396GIiAbYY3Zw', 60),
    ('telecom', 'Vivo Empresas', 'Móvel corporativa', 'https://mve.vivo.com.br/', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQF6N3dTfE9QmQdpXFiBxVgrTAn_7NV05JSpQ&s', 70)
ON CONFLICT (area, nome) DO NOTHING;

-- =====================================================
-- RLS
-- =====================================================
ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_setores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_cargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_direcionadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_documentacao ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.colaboradores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_setores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_cargos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.filiais TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_direcionadores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_documentacao TO authenticated;
GRANT SELECT ON TABLE public.vw_colaboradores_planilha TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.colaboradores_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.catalog_setores_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.catalog_cargos_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.filiais_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.catalog_direcionadores_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.catalog_documentacao_id_seq TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin', false);
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documentacao',
    'documentacao',
    FALSE,
    20971520,
    ARRAY[
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/webp',
        'text/plain',
        'text/csv',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'app-imagens',
    'app-imagens',
    TRUE,
    5242880,
    ARRAY[
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/webp',
        'image/gif',
        'image/svg+xml'
    ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS colaboradores_select_authenticated ON public.colaboradores;
DROP POLICY IF EXISTS colaboradores_write_admin ON public.colaboradores;
DROP POLICY IF EXISTS colaboradores_update_admin ON public.colaboradores;
DROP POLICY IF EXISTS colaboradores_delete_admin ON public.colaboradores;
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
DROP POLICY IF EXISTS catalog_direcionadores_select_authenticated ON public.catalog_direcionadores;
DROP POLICY IF EXISTS catalog_direcionadores_write_admin ON public.catalog_direcionadores;
DROP POLICY IF EXISTS catalog_direcionadores_update_admin ON public.catalog_direcionadores;
DROP POLICY IF EXISTS catalog_direcionadores_delete_admin ON public.catalog_direcionadores;
DROP POLICY IF EXISTS catalog_documentacao_select_admin ON public.catalog_documentacao;
DROP POLICY IF EXISTS catalog_documentacao_select_authenticated ON public.catalog_documentacao;
DROP POLICY IF EXISTS catalog_documentacao_write_admin ON public.catalog_documentacao;
DROP POLICY IF EXISTS catalog_documentacao_update_admin ON public.catalog_documentacao;
DROP POLICY IF EXISTS catalog_documentacao_delete_admin ON public.catalog_documentacao;
DROP POLICY IF EXISTS storage_documentacao_select_admin ON storage.objects;
DROP POLICY IF EXISTS storage_documentacao_select_authenticated ON storage.objects;
DROP POLICY IF EXISTS storage_documentacao_insert_admin ON storage.objects;
DROP POLICY IF EXISTS storage_documentacao_update_admin ON storage.objects;
DROP POLICY IF EXISTS storage_documentacao_delete_admin ON storage.objects;
DROP POLICY IF EXISTS storage_app_imagens_select_authenticated ON storage.objects;
DROP POLICY IF EXISTS storage_app_imagens_insert_admin ON storage.objects;
DROP POLICY IF EXISTS storage_app_imagens_update_admin ON storage.objects;
DROP POLICY IF EXISTS storage_app_imagens_delete_admin ON storage.objects;

CREATE POLICY colaboradores_select_authenticated
ON public.colaboradores
FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY colaboradores_write_admin
ON public.colaboradores
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY colaboradores_update_admin
ON public.colaboradores
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY colaboradores_delete_admin
ON public.colaboradores
FOR DELETE
TO authenticated
USING (public.is_admin());

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

CREATE POLICY catalog_direcionadores_select_authenticated
ON public.catalog_direcionadores
FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY catalog_direcionadores_write_admin
ON public.catalog_direcionadores
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY catalog_direcionadores_update_admin
ON public.catalog_direcionadores
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY catalog_direcionadores_delete_admin
ON public.catalog_direcionadores
FOR DELETE
TO authenticated
USING (public.is_admin());

CREATE POLICY catalog_documentacao_select_authenticated
ON public.catalog_documentacao
FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY catalog_documentacao_write_admin
ON public.catalog_documentacao
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY catalog_documentacao_update_admin
ON public.catalog_documentacao
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY catalog_documentacao_delete_admin
ON public.catalog_documentacao
FOR DELETE
TO authenticated
USING (public.is_admin());

CREATE POLICY storage_documentacao_select_authenticated
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'documentacao'
);

CREATE POLICY storage_documentacao_insert_admin
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'documentacao'
    AND public.is_admin()
);

CREATE POLICY storage_documentacao_update_admin
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'documentacao'
    AND public.is_admin()
)
WITH CHECK (
    bucket_id = 'documentacao'
    AND public.is_admin()
);

CREATE POLICY storage_documentacao_delete_admin
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'documentacao'
    AND public.is_admin()
);

CREATE POLICY storage_app_imagens_select_authenticated
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'app-imagens'
);

CREATE POLICY storage_app_imagens_insert_admin
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'app-imagens'
    AND (
        public.is_admin()
        OR (
            (storage.foldername(name))[1] = 'avatars'
            AND (storage.foldername(name))[2] = auth.uid()::text
        )
    )
);

CREATE POLICY storage_app_imagens_update_admin
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'app-imagens'
    AND (
        public.is_admin()
        OR (
            (storage.foldername(name))[1] = 'avatars'
            AND (storage.foldername(name))[2] = auth.uid()::text
        )
    )
)
WITH CHECK (
    bucket_id = 'app-imagens'
    AND (
        public.is_admin()
        OR (
            (storage.foldername(name))[1] = 'avatars'
            AND (storage.foldername(name))[2] = auth.uid()::text
        )
    )
);

CREATE POLICY storage_app_imagens_delete_admin
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'app-imagens'
    AND (
        public.is_admin()
        OR (
            (storage.foldername(name))[1] = 'avatars'
            AND (storage.foldername(name))[2] = auth.uid()::text
        )
    )
);

-- Sem policy de DELETE por padrão.

COMMENT ON TABLE public.colaboradores IS 'Cadastro interno de colaboradores sem armazenamento de credenciais';
COMMENT ON COLUMN public.colaboradores.status IS 'Status operacional do colaborador (ATIVO/INATIVO)';
COMMENT ON VIEW public.vw_colaboradores_planilha IS 'Visão dos colaboradores com colunas no padrão da planilha (STATUS, UF, LOJA, EMPRESA, NOME, SETOR, FUNÇÃO)';
COMMENT ON TABLE public.colaboradores_loja_empresa_map IS 'Mapa de vínculo entre chave normalizada da loja e código de empresa';
COMMENT ON FUNCTION public.sync_colaboradores_empresa_from_loja() IS 'Reaplica empresa em colaboradores com base no mapa de loja';
COMMENT ON FUNCTION public.refresh_colaboradores_loja_empresa_map_from_filiais() IS 'Reconstrói entradas automáticas do mapa LOJA->EMPRESA usando filiais ativas';
COMMENT ON TABLE public.catalog_setores IS 'Cadastro de setores para o Gerador de Acessos (CRUD)';
COMMENT ON TABLE public.catalog_cargos IS 'Cadastro de cargos vinculados a setores (CRUD)';
COMMENT ON TABLE public.filiais IS 'Cadastro de filiais/unidades e base para cidades/bairros e etiquetas';
COMMENT ON TABLE public.catalog_direcionadores IS 'Cards direcionadores com link, descrição e imagem (CRUD admin)';
COMMENT ON TABLE public.catalog_documentacao IS 'Biblioteca de documentação com árvore de pastas (tipo/parent_id) e vínculo opcional de arquivo no bucket documentacao';

COMMIT;
