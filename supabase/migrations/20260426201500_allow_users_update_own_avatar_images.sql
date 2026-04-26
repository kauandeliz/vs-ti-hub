BEGIN;

DROP POLICY IF EXISTS storage_app_imagens_insert_admin ON storage.objects;
DROP POLICY IF EXISTS storage_app_imagens_update_admin ON storage.objects;
DROP POLICY IF EXISTS storage_app_imagens_delete_admin ON storage.objects;

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

COMMIT;
