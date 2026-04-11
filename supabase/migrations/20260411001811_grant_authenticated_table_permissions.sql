BEGIN;

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.acessos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_setores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_cargos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.filiais TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_direcionadores TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE public.acessos_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.catalog_setores_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.catalog_cargos_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.filiais_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.catalog_direcionadores_id_seq TO authenticated;

COMMIT;
