BEGIN;

CREATE TABLE IF NOT EXISTS public.catalog_dashboard_relatorios (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT,
    origem TEXT NOT NULL,
    dimensao TEXT NOT NULL,
    visualizacao TEXT NOT NULL DEFAULT 'bar',
    limite INTEGER NOT NULL DEFAULT 8,
    ordem INTEGER NOT NULL DEFAULT 100,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_por UUID REFERENCES auth.users(id),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT catalog_dashboard_relatorios_origem_chk CHECK (
        origem IN ('colaboradores', 'filiais', 'linhas', 'documentacao', 'direcionadores', 'usuarios')
    ),
    CONSTRAINT catalog_dashboard_relatorios_visualizacao_chk CHECK (
        visualizacao IN ('bar', 'line', 'doughnut', 'polarArea')
    ),
    CONSTRAINT catalog_dashboard_relatorios_limite_chk CHECK (limite BETWEEN 3 AND 20),
    CONSTRAINT catalog_dashboard_relatorios_ordem_chk CHECK (ordem >= 0)
);

CREATE INDEX IF NOT EXISTS idx_catalog_dashboard_relatorios_ativo_ordem_nome
ON public.catalog_dashboard_relatorios (ativo, ordem, nome);

CREATE INDEX IF NOT EXISTS idx_catalog_dashboard_relatorios_origem_dimensao
ON public.catalog_dashboard_relatorios (origem, dimensao);

DROP TRIGGER IF EXISTS trg_touch_catalog_dashboard_relatorios_updated_at ON public.catalog_dashboard_relatorios;
CREATE TRIGGER trg_touch_catalog_dashboard_relatorios_updated_at
BEFORE UPDATE ON public.catalog_dashboard_relatorios
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.catalog_dashboard_relatorios (nome, descricao, origem, dimensao, visualizacao, limite, ordem, ativo)
SELECT
    'Colaboradores por setor',
    'Distribuicao de colaboradores por setor.',
    'colaboradores',
    'setor',
    'bar',
    10,
    10,
    TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM public.catalog_dashboard_relatorios WHERE nome = 'Colaboradores por setor'
);

INSERT INTO public.catalog_dashboard_relatorios (nome, descricao, origem, dimensao, visualizacao, limite, ordem, ativo)
SELECT
    'Filiais por cidade',
    'Volume de filiais cadastradas por cidade.',
    'filiais',
    'cidade',
    'bar',
    10,
    20,
    TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM public.catalog_dashboard_relatorios WHERE nome = 'Filiais por cidade'
);

INSERT INTO public.catalog_dashboard_relatorios (nome, descricao, origem, dimensao, visualizacao, limite, ordem, ativo)
SELECT
    'Linhas por departamento',
    'Distribuicao das linhas telefonicas por departamento.',
    'linhas',
    'dpto',
    'doughnut',
    8,
    30,
    TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM public.catalog_dashboard_relatorios WHERE nome = 'Linhas por departamento'
);

INSERT INTO public.catalog_dashboard_relatorios (nome, descricao, origem, dimensao, visualizacao, limite, ordem, ativo)
SELECT
    'Documentos por categoria',
    'Distribuicao da documentacao por categoria.',
    'documentacao',
    'categoria',
    'polarArea',
    8,
    40,
    TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM public.catalog_dashboard_relatorios WHERE nome = 'Documentos por categoria'
);

ALTER TABLE public.catalog_dashboard_relatorios ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_dashboard_relatorios TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.catalog_dashboard_relatorios_id_seq TO authenticated;

DROP POLICY IF EXISTS catalog_dashboard_relatorios_select_authenticated ON public.catalog_dashboard_relatorios;
DROP POLICY IF EXISTS catalog_dashboard_relatorios_write_admin ON public.catalog_dashboard_relatorios;
DROP POLICY IF EXISTS catalog_dashboard_relatorios_update_admin ON public.catalog_dashboard_relatorios;
DROP POLICY IF EXISTS catalog_dashboard_relatorios_delete_admin ON public.catalog_dashboard_relatorios;

CREATE POLICY catalog_dashboard_relatorios_select_authenticated
ON public.catalog_dashboard_relatorios
FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY catalog_dashboard_relatorios_write_admin
ON public.catalog_dashboard_relatorios
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY catalog_dashboard_relatorios_update_admin
ON public.catalog_dashboard_relatorios
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY catalog_dashboard_relatorios_delete_admin
ON public.catalog_dashboard_relatorios
FOR DELETE
TO authenticated
USING (public.is_admin());

COMMENT ON TABLE public.catalog_dashboard_relatorios IS 'Relatorios customizados para a aba Dashboards com configuracao de origem, dimensao e visualizacao.';

COMMIT;
