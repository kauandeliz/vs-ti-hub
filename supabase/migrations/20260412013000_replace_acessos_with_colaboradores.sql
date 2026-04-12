BEGIN;

-- Remove histórico de credenciais por segurança
DROP TABLE IF EXISTS public.acessos CASCADE;
DROP FUNCTION IF EXISTS public.normalize_acessos_before_write();

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Novo cadastro de colaboradores (sem credenciais)
CREATE TABLE IF NOT EXISTS public.colaboradores (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    cpf TEXT NOT NULL UNIQUE,
    data_admissao DATE,
    setor TEXT NOT NULL,
    cargo TEXT NOT NULL,
    uf CHAR(2) NOT NULL CHECK (uf ~ '^[A-Z]{2}$'),
    cidade TEXT NOT NULL,
    bairro TEXT,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_por UUID REFERENCES auth.users(id),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT colaboradores_cpf_digits_chk CHECK (cpf ~ '^[0-9]{11}$')
);

CREATE OR REPLACE FUNCTION public.normalize_colaboradores_before_write()
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

CREATE INDEX IF NOT EXISTS idx_colaboradores_criado_em_desc ON public.colaboradores (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_colaboradores_ativo_nome ON public.colaboradores (ativo, nome);
CREATE INDEX IF NOT EXISTS idx_colaboradores_uf_cidade ON public.colaboradores (uf, cidade);
CREATE INDEX IF NOT EXISTS idx_colaboradores_cpf ON public.colaboradores (cpf);
CREATE INDEX IF NOT EXISTS idx_colaboradores_nome_trgm ON public.colaboradores USING gin (nome gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_colaboradores_setor_trgm ON public.colaboradores USING gin (setor gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin', false);
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.colaboradores TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.colaboradores_id_seq TO authenticated;

DROP POLICY IF EXISTS colaboradores_select_authenticated ON public.colaboradores;
DROP POLICY IF EXISTS colaboradores_write_admin ON public.colaboradores;
DROP POLICY IF EXISTS colaboradores_update_admin ON public.colaboradores;
DROP POLICY IF EXISTS colaboradores_delete_admin ON public.colaboradores;

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

COMMENT ON TABLE public.colaboradores IS 'Cadastro interno de colaboradores sem armazenamento de credenciais';
COMMENT ON COLUMN public.colaboradores.ativo IS 'TRUE quando colaborador está ativo na operação';

COMMIT;
