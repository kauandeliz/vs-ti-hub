BEGIN;

ALTER FUNCTION public.refresh_colaboradores_loja_empresa_map_from_filiais()
    SECURITY DEFINER
    SET search_path = public, pg_temp;

ALTER FUNCTION public.sync_colaboradores_empresa_from_loja()
    SECURITY DEFINER
    SET search_path = public, pg_temp;

ALTER FUNCTION public.apply_colaborador_empresa_from_map()
    SECURITY DEFINER
    SET search_path = public, pg_temp;

ALTER FUNCTION public.handle_filiais_change_refresh_colaboradores_map()
    SECURITY DEFINER
    SET search_path = public, pg_temp;

COMMIT;
