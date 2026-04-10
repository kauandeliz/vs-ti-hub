BEGIN;

CREATE TABLE IF NOT EXISTS public.catalog_direcionadores (
    id BIGSERIAL PRIMARY KEY,
    area TEXT NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT NOT NULL,
    link TEXT NOT NULL,
    imagem_url TEXT NOT NULL,
    ordem INTEGER NOT NULL DEFAULT 100,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT catalog_direcionadores_area_chk CHECK (area IN ('home', 'helpdesk', 'corporativo', 'telecom')),
    CONSTRAINT catalog_direcionadores_ordem_chk CHECK (ordem >= 0),
    UNIQUE (area, nome)
);

CREATE INDEX IF NOT EXISTS idx_catalog_direcionadores_area_ativo_ordem_nome
ON public.catalog_direcionadores (area, ativo, ordem, nome);

DROP TRIGGER IF EXISTS trg_touch_catalog_direcionadores_updated_at ON public.catalog_direcionadores;
CREATE TRIGGER trg_touch_catalog_direcionadores_updated_at
BEFORE UPDATE ON public.catalog_direcionadores
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.catalog_direcionadores (area, nome, descricao, link, imagem_url, ordem)
VALUES
    ('home', 'Helpdesk VinilSul', 'Atendimento interno e gestão de chamados.', 'https://helpdesk.vinilsul.com.br/', 'https://raichu-uploads.s3.amazonaws.com/logo_vinilsul_hNmJQ9.png', 10),
    ('home', 'Microsoft Entra', 'Gestão de identidade, diretório e licenças.', 'https://entra.microsoft.com/', 'https://www.lighthouseit.co.uk/wp-content/uploads/2025/03/MSFT_Entra_Blog-thumb_16-9_v1-771x434.png', 20),
    ('home', 'Senior X', 'Plataforma corporativa de ERP e RH.', 'https://platform.senior.com.br/login/', 'https://s3.amazonaws.com//beta-img.b2bstack.net/uploads/production/provider/image/9/senior-sistemas-logo.png', 30),
    ('home', 'Salesforce CRM', 'Acompanhamento comercial e relacionamento.', 'https://login.salesforce.com/', 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Salesforce.com_logo.svg/500px-Salesforce.com_logo.svg.png', 40),

    ('helpdesk', 'Helpdesk MasterTech', 'GLPI Service Desk — parceiro', 'https://mastertech.soft4.com.br/login', 'https://mastertechsistemas.com.br/wp-content/uploads/logotipo_mastertech.png', 10),
    ('helpdesk', 'Helpdesk Sekur', 'GLPI Service Desk — parceiro', 'https://helpdesk.sekurtecnologia.com.br/', 'https://media.licdn.com/dms/image/v2/C4E0BAQEWdvhrQhtZXw/company-logo_200_200/company-logo_200_200/0/1631367297504/sekur_tecnologia_logo?e=2147483647&v=beta&t=YFzbClhb-amHgkBNp_LZDdC0Z3st-WM-4W1m7MDVeIU', 20),
    ('helpdesk', 'Helpdesk VinilSul', 'GLPI Service Desk — interno', 'https://helpdesk.vinilsul.com.br/', 'https://raichu-uploads.s3.amazonaws.com/logo_vinilsul_hNmJQ9.png', 30),

    ('corporativo', 'Admin E-mails', 'Console de contas', 'https://mailadmin.elhnld.hospedagemweb.net/iredadmin/', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTfxcMZCGSQUbU2Act-QbKDT9pK3X_pTkKlBg&s', 10),
    ('corporativo', 'Admin GoTo', 'Telefonia IP', 'https://admin.goto.com/', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRmPzJYV6y5WOXMrfOge75QBfskhUaKi6WdCg&s', 20),
    ('corporativo', 'Microsoft Entra', 'Active Directory', 'https://entra.microsoft.com/', 'https://www.lighthouseit.co.uk/wp-content/uploads/2025/03/MSFT_Entra_Blog-thumb_16-9_v1-771x434.png', 30),
    ('corporativo', 'Salesforce CRM', 'Gestão Comercial', 'https://login.salesforce.com/', 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Salesforce.com_logo.svg/500px-Salesforce.com_logo.svg.png', 40),
    ('corporativo', 'Senior X', 'ERP & RH', 'https://platform.senior.com.br/login/', 'https://s3.amazonaws.com//beta-img.b2bstack.net/uploads/production/provider/image/9/senior-sistemas-logo.png', 50),
    ('corporativo', 'SQL — Relatórios', 'Gerenciador', 'http://192.168.200.31:9070/relatorios/Pages/Folder.aspx', 'https://files.tecnoblog.net/wp-content/uploads/2019/09/windows-folder-700x394.jpg', 60),
    ('corporativo', 'Webmail', 'E-mail corporativo', 'https://webmail.vinilsul.com.br/mail/', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTfxcMZCGSQUbU2Act-QbKDT9pK3X_pTkKlBg&s', 70),

    ('telecom', 'Algar Telecom', 'Portal do cliente', 'https://customeridentity.algar.com.br/auth?client_id=0d86fb2f-6a6c-47e2-9ad7-6b35521f475f&state=1965756151&nonce&redirect_uri=https%3A%2F%2Floja.algar.com.br%2Fon%2Fdemandware.store%2FSites-algartelecom-BR-Site%2Fpt_BR%2FLogin-OAuthReentryAlgarLoginProvider', 'https://yt3.googleusercontent.com/UiGmCyeAqY_fu8wExnd9XAsjwGIqwLTKiCy-m7fUY_YeLXd6xf_G3QVQb6r_OcwEw4qdmaXlqQ=s900-c-k-c0x00ffffff-no-rj', 10),
    ('telecom', 'Claro / Embratel', 'Embratel Online', 'https://webebt01.embratel.com.br/embratelonline/index.asp', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRLAHujXLaco-9GRUgrtH12xSPaLB1kMip6qA&s', 20),
    ('telecom', 'LEX Alexandria', 'Gestão de energia', 'https://cliente.alexandriaenergia.com/', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQAOeYw50WCigUiyHlqGDoDX64u9LB1ngSR5Q&s', 30),
    ('telecom', 'Ligga Telecom', 'Autoatendimento', 'https://www.liggatelecom.com.br/autoatendimento/pub/login.jsf', 'https://carreira.inhire.com.br/wp-content/uploads/2025/10/LOGO_LIGGA_TELECOM_1-1-1.png', 40),
    ('telecom', 'Meu TIM', 'Gestão corporativa', 'https://meutim.tim.com.br/', 'https://play-lh.googleusercontent.com/U_NE4YtUoSzUU-wa7spbP0vB9VqrVxSrcjodyvGo-EsMDo4Pr-hLmutRuVXNz4V_eg', 50),
    ('telecom', 'Novacia', 'Autoatendimento', 'https://pap.onitel.com.br/central-do-assinante/novacia/', 'https://media.licdn.com/dms/image/v2/C560BAQHGD7niTowhMw/company-logo_200_200/company-logo_200_200/0/1644847527143/grupo_novacia_logo?e=2147483647&v=beta&t=HI4DQhTCq3vWkoAxJW2Wjffj2Fhqka396GIiAbYY3Zw', 60),
    ('telecom', 'Vivo Empresas', 'Móvel corporativa', 'https://mve.vivo.com.br/', 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQF6N3dTfE9QmQdpXFiBxVgrTAn_7NV05JSpQ&s', 70)
ON CONFLICT (area, nome) DO NOTHING;

ALTER TABLE public.catalog_direcionadores ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_direcionadores TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.catalog_direcionadores_id_seq TO authenticated;

DROP POLICY IF EXISTS catalog_direcionadores_select_authenticated ON public.catalog_direcionadores;
DROP POLICY IF EXISTS catalog_direcionadores_write_admin ON public.catalog_direcionadores;
DROP POLICY IF EXISTS catalog_direcionadores_update_admin ON public.catalog_direcionadores;
DROP POLICY IF EXISTS catalog_direcionadores_delete_admin ON public.catalog_direcionadores;

CREATE POLICY catalog_direcionadores_select_authenticated
ON public.catalog_direcionadores
FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY catalog_direcionadores_write_admin
ON public.catalog_direcionadores
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY catalog_direcionadores_update_admin
ON public.catalog_direcionadores
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY catalog_direcionadores_delete_admin
ON public.catalog_direcionadores
FOR DELETE
TO authenticated
USING (public.is_admin());

COMMENT ON TABLE public.catalog_direcionadores IS 'Cards direcionadores com link, descrição e imagem (CRUD admin)';

COMMIT;
