BEGIN;

CREATE OR REPLACE VIEW public.vw_colaboradores_planilha AS
SELECT
    c.status AS "STATUS",
    c.uf AS "UF",
    c.loja AS "LOJA",
    c.empresa AS "EMPRESA",
    c.nome AS "NOME",
    c.setor AS "SETOR",
    c.funcao AS "FUNÇÃO"
FROM public.colaboradores c;

GRANT SELECT ON TABLE public.vw_colaboradores_planilha TO authenticated;

COMMENT ON VIEW public.vw_colaboradores_planilha IS 'Visão dos colaboradores com colunas no padrão da planilha (STATUS, UF, LOJA, EMPRESA, NOME, SETOR, FUNÇÃO)';

COMMIT;
