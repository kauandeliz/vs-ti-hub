BEGIN;

-- Reestrutura colaboradores para o formato operacional:
-- STATUS, UF, LOJA, EMPRESA, NOME, SETOR, FUNCAO

ALTER TABLE public.colaboradores
    ADD COLUMN IF NOT EXISTS status TEXT,
    ADD COLUMN IF NOT EXISTS loja TEXT,
    ADD COLUMN IF NOT EXISTS empresa TEXT,
    ADD COLUMN IF NOT EXISTS funcao TEXT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'colaboradores'
          AND column_name = 'ativo'
    ) THEN
        EXECUTE $q$
            UPDATE public.colaboradores
            SET status = COALESCE(status, CASE WHEN ativo THEN 'ATIVO' ELSE 'INATIVO' END)
        $q$;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'colaboradores'
          AND column_name = 'cidade'
    ) THEN
        EXECUTE $q$
            UPDATE public.colaboradores
            SET loja = COALESCE(loja, NULLIF(BTRIM(cidade), ''))
        $q$;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'colaboradores'
          AND column_name = 'cargo'
    ) THEN
        EXECUTE $q$
            UPDATE public.colaboradores
            SET funcao = COALESCE(funcao, NULLIF(BTRIM(cargo), ''))
        $q$;
    END IF;
END $$;

UPDATE public.colaboradores
SET
    status = COALESCE(NULLIF(UPPER(BTRIM(status)), ''), 'ATIVO'),
    loja = COALESCE(NULLIF(BTRIM(loja), ''), 'N/D'),
    empresa = COALESCE(NULLIF(BTRIM(empresa), ''), 'N/D'),
    funcao = COALESCE(NULLIF(BTRIM(funcao), ''), 'N/D'),
    nome = COALESCE(NULLIF(BTRIM(nome), ''), 'N/D'),
    setor = COALESCE(NULLIF(BTRIM(setor), ''), 'N/D'),
    uf = COALESCE(NULLIF(UPPER(BTRIM(uf)), ''), 'SP');

DROP INDEX IF EXISTS idx_colaboradores_ativo_nome;
DROP INDEX IF EXISTS idx_colaboradores_uf_cidade;
DROP INDEX IF EXISTS idx_colaboradores_cpf;

ALTER TABLE public.colaboradores
    DROP CONSTRAINT IF EXISTS colaboradores_cpf_digits_chk,
    DROP CONSTRAINT IF EXISTS colaboradores_cpf_unique,
    DROP CONSTRAINT IF EXISTS colaboradores_status_chk,
    DROP CONSTRAINT IF EXISTS colaboradores_uf_chk;

ALTER TABLE public.colaboradores
    ALTER COLUMN status SET DEFAULT 'ATIVO',
    ALTER COLUMN status SET NOT NULL,
    ALTER COLUMN loja SET NOT NULL,
    ALTER COLUMN empresa SET NOT NULL,
    ALTER COLUMN funcao SET NOT NULL,
    ALTER COLUMN nome SET NOT NULL,
    ALTER COLUMN setor SET NOT NULL,
    ALTER COLUMN uf SET NOT NULL;

ALTER TABLE public.colaboradores
    ADD CONSTRAINT colaboradores_status_chk
    CHECK (status IN ('ATIVO', 'INATIVO'));

ALTER TABLE public.colaboradores
    ADD CONSTRAINT colaboradores_uf_chk
    CHECK (uf ~ '^[A-Z]{2}$');

ALTER TABLE public.colaboradores
    DROP COLUMN IF EXISTS cpf,
    DROP COLUMN IF EXISTS data_admissao,
    DROP COLUMN IF EXISTS cargo,
    DROP COLUMN IF EXISTS cidade,
    DROP COLUMN IF EXISTS bairro,
    DROP COLUMN IF EXISTS ativo;

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

CREATE INDEX IF NOT EXISTS idx_colaboradores_status_nome ON public.colaboradores (status, nome);
CREATE INDEX IF NOT EXISTS idx_colaboradores_uf_loja ON public.colaboradores (uf, loja);
CREATE INDEX IF NOT EXISTS idx_colaboradores_funcao_trgm ON public.colaboradores USING gin (funcao gin_trgm_ops);

COMMENT ON COLUMN public.colaboradores.status IS 'Status operacional do colaborador (ATIVO/INATIVO)';

COMMIT;
