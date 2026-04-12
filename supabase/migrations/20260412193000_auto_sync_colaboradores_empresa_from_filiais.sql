BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;

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
AS $$
BEGIN
    DELETE FROM public.colaboradores_loja_empresa_map
    WHERE fonte = 'FILIAIS';

    -- Prioridade 1: nome da filial
    INSERT INTO public.colaboradores_loja_empresa_map (loja_chave, empresa, fonte, loja_referencia)
    SELECT
        public.normalize_lookup_text(f.nome) AS loja_chave,
        COALESCE(f.codigo::TEXT, 'N/D') AS empresa,
        'FILIAIS' AS fonte,
        f.nome AS loja_referencia
    FROM public.filiais f
    WHERE f.ativo = TRUE
      AND public.normalize_lookup_text(f.nome) <> ''
    ON CONFLICT (loja_chave) DO NOTHING;

    -- Prioridade 2: cidade + bairro
    INSERT INTO public.colaboradores_loja_empresa_map (loja_chave, empresa, fonte, loja_referencia)
    SELECT
        public.normalize_lookup_text(f.cidade || ' ' || f.bairro) AS loja_chave,
        COALESCE(f.codigo::TEXT, 'N/D') AS empresa,
        'FILIAIS' AS fonte,
        f.cidade || ' / ' || f.bairro AS loja_referencia
    FROM public.filiais f
    WHERE f.ativo = TRUE
      AND public.normalize_lookup_text(f.cidade || ' ' || f.bairro) <> ''
    ON CONFLICT (loja_chave) DO NOTHING;

    -- Prioridade 3: cidade única
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

    -- Prioridade 4: bairro único
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

-- Seeds manuais para aliases operacionais observados na planilha
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

COMMENT ON TABLE public.colaboradores_loja_empresa_map IS 'Mapa de vínculo entre chave normalizada da loja e código de empresa';
COMMENT ON FUNCTION public.sync_colaboradores_empresa_from_loja() IS 'Reaplica empresa em colaboradores com base no mapa de loja';
COMMENT ON FUNCTION public.refresh_colaboradores_loja_empresa_map_from_filiais() IS 'Reconstrói entradas automáticas do mapa LOJA->EMPRESA usando filiais ativas';

COMMIT;
