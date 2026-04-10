BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_direcionadores TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.catalog_direcionadores_id_seq TO authenticated;

COMMIT;
