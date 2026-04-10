-- =====================================================
-- PURGE AUTH USERS (DESTRUTIVO)
-- Remove todos os usuários do Supabase Auth
-- =====================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'acessos'
    ) THEN
        UPDATE public.acessos
        SET criado_por = NULL
        WHERE criado_por IS NOT NULL;
    END IF;
END $$;

DO $$
DECLARE
    removed_count INTEGER;
BEGIN
    DELETE FROM auth.users;
    GET DIAGNOSTICS removed_count = ROW_COUNT;
    RAISE NOTICE 'auth.users removidos: %', removed_count;
END $$;
