BEGIN;

CREATE TABLE IF NOT EXISTS public.catalog_documentacao (
    id BIGSERIAL PRIMARY KEY,
    categoria TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    arquivo_nome TEXT NOT NULL,
    arquivo_path TEXT NOT NULL UNIQUE,
    arquivo_mime_type TEXT,
    arquivo_tamanho_bytes BIGINT,
    criado_por UUID REFERENCES auth.users(id),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT catalog_documentacao_categoria_chk CHECK (categoria IN ('TERMO_RESPONSABILIDADE', 'TUTORIAL_TI', 'TERMO_ASSINADO', 'GERAL')),
    CONSTRAINT catalog_documentacao_arquivo_tamanho_chk CHECK (arquivo_tamanho_bytes IS NULL OR arquivo_tamanho_bytes >= 0)
);

CREATE INDEX IF NOT EXISTS idx_catalog_documentacao_categoria_criado_em
ON public.catalog_documentacao (categoria, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_catalog_documentacao_titulo_trgm
ON public.catalog_documentacao USING gin (titulo gin_trgm_ops);

DROP TRIGGER IF EXISTS trg_touch_catalog_documentacao_updated_at ON public.catalog_documentacao;
CREATE TRIGGER trg_touch_catalog_documentacao_updated_at
BEFORE UPDATE ON public.catalog_documentacao
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin', false);
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

ALTER TABLE public.catalog_documentacao ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_documentacao TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.catalog_documentacao_id_seq TO authenticated;

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
ON CONFLICT (id) DO UPDATE
SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

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

COMMENT ON TABLE public.catalog_documentacao IS 'Documentos internos de TI com categoria, metadados e vínculo ao arquivo no bucket documentacao';

COMMIT;
