BEGIN;

ALTER TABLE public.catalog_documentacao
ADD COLUMN IF NOT EXISTS tipo TEXT;

ALTER TABLE public.catalog_documentacao
ADD COLUMN IF NOT EXISTS parent_id BIGINT;

ALTER TABLE public.catalog_documentacao
ADD COLUMN IF NOT EXISTS ordem INTEGER;

UPDATE public.catalog_documentacao
SET tipo = 'DOCUMENTO'
WHERE tipo IS NULL OR BTRIM(tipo) = '';

UPDATE public.catalog_documentacao
SET ordem = 100
WHERE ordem IS NULL;

ALTER TABLE public.catalog_documentacao
ALTER COLUMN tipo SET DEFAULT 'DOCUMENTO';

ALTER TABLE public.catalog_documentacao
ALTER COLUMN tipo SET NOT NULL;

ALTER TABLE public.catalog_documentacao
ALTER COLUMN ordem SET DEFAULT 100;

ALTER TABLE public.catalog_documentacao
ALTER COLUMN ordem SET NOT NULL;

ALTER TABLE public.catalog_documentacao
ALTER COLUMN arquivo_nome DROP NOT NULL;

ALTER TABLE public.catalog_documentacao
ALTER COLUMN arquivo_path DROP NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'catalog_documentacao_parent_fk'
    ) THEN
        ALTER TABLE public.catalog_documentacao
        ADD CONSTRAINT catalog_documentacao_parent_fk
        FOREIGN KEY (parent_id)
        REFERENCES public.catalog_documentacao(id)
        ON DELETE CASCADE;
    END IF;
END $$;

ALTER TABLE public.catalog_documentacao
DROP CONSTRAINT IF EXISTS catalog_documentacao_tipo_chk;

ALTER TABLE public.catalog_documentacao
DROP CONSTRAINT IF EXISTS catalog_documentacao_parent_chk;

ALTER TABLE public.catalog_documentacao
DROP CONSTRAINT IF EXISTS catalog_documentacao_ordem_chk;

ALTER TABLE public.catalog_documentacao
DROP CONSTRAINT IF EXISTS catalog_documentacao_tipo_payload_chk;

ALTER TABLE public.catalog_documentacao
ADD CONSTRAINT catalog_documentacao_tipo_chk
CHECK (tipo IN ('DOCUMENTO', 'PASTA'));

ALTER TABLE public.catalog_documentacao
ADD CONSTRAINT catalog_documentacao_parent_chk
CHECK (parent_id IS NULL OR parent_id <> id);

ALTER TABLE public.catalog_documentacao
ADD CONSTRAINT catalog_documentacao_ordem_chk
CHECK (ordem >= 0);

ALTER TABLE public.catalog_documentacao
ADD CONSTRAINT catalog_documentacao_tipo_payload_chk
CHECK (
    (tipo = 'PASTA' AND arquivo_nome IS NULL AND arquivo_path IS NULL AND arquivo_mime_type IS NULL AND arquivo_tamanho_bytes IS NULL)
    OR
    (tipo = 'DOCUMENTO' AND arquivo_nome IS NOT NULL AND arquivo_path IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_catalog_documentacao_parent_ordem_titulo
ON public.catalog_documentacao (parent_id, ordem, titulo);

CREATE INDEX IF NOT EXISTS idx_catalog_documentacao_tipo_parent
ON public.catalog_documentacao (tipo, parent_id);

COMMENT ON TABLE public.catalog_documentacao IS 'Biblioteca de documentação com árvore de pastas (tipo/parent_id) e vínculo opcional de arquivo no bucket documentacao';

COMMIT;

