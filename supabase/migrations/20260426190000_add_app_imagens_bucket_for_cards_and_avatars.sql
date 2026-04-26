BEGIN;

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

DROP POLICY IF EXISTS storage_app_imagens_select_authenticated ON storage.objects;
DROP POLICY IF EXISTS storage_app_imagens_insert_admin ON storage.objects;
DROP POLICY IF EXISTS storage_app_imagens_update_admin ON storage.objects;
DROP POLICY IF EXISTS storage_app_imagens_delete_admin ON storage.objects;

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
    AND public.is_admin()
);

CREATE POLICY storage_app_imagens_update_admin
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'app-imagens'
    AND public.is_admin()
)
WITH CHECK (
    bucket_id = 'app-imagens'
    AND public.is_admin()
);

CREATE POLICY storage_app_imagens_delete_admin
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'app-imagens'
    AND public.is_admin()
);

COMMIT;
