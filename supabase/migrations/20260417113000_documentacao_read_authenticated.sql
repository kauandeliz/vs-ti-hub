BEGIN;

DROP POLICY IF EXISTS catalog_documentacao_select_admin ON public.catalog_documentacao;
DROP POLICY IF EXISTS catalog_documentacao_select_authenticated ON public.catalog_documentacao;
CREATE POLICY catalog_documentacao_select_authenticated
ON public.catalog_documentacao
FOR SELECT
TO authenticated
USING (TRUE);

DROP POLICY IF EXISTS storage_documentacao_select_admin ON storage.objects;
DROP POLICY IF EXISTS storage_documentacao_select_authenticated ON storage.objects;
CREATE POLICY storage_documentacao_select_authenticated
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'documentacao');

COMMIT;

