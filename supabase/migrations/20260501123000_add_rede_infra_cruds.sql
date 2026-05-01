BEGIN;

CREATE TABLE IF NOT EXISTS public.catalog_rede_usuarios (
    id BIGSERIAL PRIMARY KEY,
    nome_completo TEXT NOT NULL,
    unidade TEXT NOT NULL,
    usuario TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'ATIVO',
    assinaturas BOOLEAN NOT NULL DEFAULT FALSE,
    bancos BOOLEAN NOT NULL DEFAULT FALSE,
    contab BOOLEAN NOT NULL DEFAULT FALSE,
    comercial BOOLEAN NOT NULL DEFAULT FALSE,
    dir BOOLEAN NOT NULL DEFAULT FALSE,
    dsk BOOLEAN NOT NULL DEFAULT FALSE,
    filiais BOOLEAN NOT NULL DEFAULT FALSE,
    fisc BOOLEAN NOT NULL DEFAULT FALSE,
    ger BOOLEAN NOT NULL DEFAULT FALSE,
    importacao_trading BOOLEAN NOT NULL DEFAULT FALSE,
    logistica BOOLEAN NOT NULL DEFAULT FALSE,
    m_fat BOOLEAN NOT NULL DEFAULT FALSE,
    mkt BOOLEAN NOT NULL DEFAULT FALSE,
    oper BOOLEAN NOT NULL DEFAULT FALSE,
    rh BOOLEAN NOT NULL DEFAULT FALSE,
    rh_filiais BOOLEAN NOT NULL DEFAULT FALSE,
    salesforce BOOLEAN NOT NULL DEFAULT FALSE,
    sistemas BOOLEAN NOT NULL DEFAULT FALSE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT catalog_rede_usuarios_status_chk CHECK (status IN ('ATIVO', 'INATIVO'))
);

CREATE TABLE IF NOT EXISTS public.catalog_rede_topologia (
    id BIGSERIAL PRIMARY KEY,
    codigo TEXT NOT NULL UNIQUE,
    localidade TEXT NOT NULL,
    tipo_unidade TEXT NOT NULL,
    hardware_critico TEXT NOT NULL,
    conecta_vpn BOOLEAN NOT NULL DEFAULT TRUE,
    modelo_firewall TEXT NOT NULL DEFAULT 'pfSense',
    ordem INTEGER NOT NULL DEFAULT 100,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT catalog_rede_topologia_tipo_chk CHECK (tipo_unidade IN ('MATRIZ', 'FILIAL')),
    CONSTRAINT catalog_rede_topologia_ordem_chk CHECK (ordem >= 0)
);

CREATE TABLE IF NOT EXISTS public.catalog_rede_politicas (
    id BIGSERIAL PRIMARY KEY,
    categoria TEXT NOT NULL,
    topico TEXT NOT NULL,
    descricao TEXT NOT NULL,
    responsavel TEXT,
    periodicidade TEXT,
    ordem INTEGER NOT NULL DEFAULT 100,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT catalog_rede_politicas_categoria_chk CHECK (
        categoria IN (
            'OBJETIVO',
            'ESCOPO',
            'TOPOLOGIA',
            'RESPONSABILIDADE',
            'ACESSO_SEGURANCA',
            'SISTEMA_CRITICO',
            'MANUTENCAO',
            'LGPD',
            'VIGENCIA'
        )
    ),
    CONSTRAINT catalog_rede_politicas_ordem_chk CHECK (ordem >= 0),
    UNIQUE (categoria, topico)
);

CREATE INDEX IF NOT EXISTS idx_catalog_rede_usuarios_unidade_status_nome
ON public.catalog_rede_usuarios (unidade, status, nome_completo);

CREATE INDEX IF NOT EXISTS idx_catalog_rede_usuarios_usuario
ON public.catalog_rede_usuarios (usuario);

CREATE INDEX IF NOT EXISTS idx_catalog_rede_topologia_ordem_codigo
ON public.catalog_rede_topologia (ordem, codigo);

CREATE INDEX IF NOT EXISTS idx_catalog_rede_topologia_tipo_ativo
ON public.catalog_rede_topologia (tipo_unidade, ativo);

CREATE INDEX IF NOT EXISTS idx_catalog_rede_politicas_categoria_ordem
ON public.catalog_rede_politicas (categoria, ordem, topico);

CREATE INDEX IF NOT EXISTS idx_catalog_rede_politicas_ativo
ON public.catalog_rede_politicas (ativo, categoria);

DROP TRIGGER IF EXISTS trg_touch_catalog_rede_usuarios_updated_at ON public.catalog_rede_usuarios;
CREATE TRIGGER trg_touch_catalog_rede_usuarios_updated_at
BEFORE UPDATE ON public.catalog_rede_usuarios
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_catalog_rede_topologia_updated_at ON public.catalog_rede_topologia;
CREATE TRIGGER trg_touch_catalog_rede_topologia_updated_at
BEFORE UPDATE ON public.catalog_rede_topologia
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_catalog_rede_politicas_updated_at ON public.catalog_rede_politicas;
CREATE TRIGGER trg_touch_catalog_rede_politicas_updated_at
BEFORE UPDATE ON public.catalog_rede_politicas
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.catalog_rede_topologia (codigo, localidade, tipo_unidade, hardware_critico, conecta_vpn, modelo_firewall, ordem, ativo)
VALUES
    ('100-PR/BRIG', 'Curitiba/PR (Matriz)', 'MATRIZ', 'Servidores + Firewall', TRUE, 'pfSense', 10, TRUE),
    ('11-PR/BOT', 'Botucatu/PR', 'FILIAL', 'Firewall pfSense', TRUE, 'pfSense', 20, TRUE),
    ('111-PR-CIC', 'Curitiba/PR (CIC)', 'FILIAL', 'Firewall pfSense', TRUE, 'pfSense', 30, TRUE),
    ('21-SP', 'São Paulo/SP', 'FILIAL', 'Firewall pfSense', TRUE, 'pfSense', 40, TRUE),
    ('31-RS', 'Rio Grande do Sul', 'FILIAL', 'Firewall pfSense', TRUE, 'pfSense', 50, TRUE),
    ('61-SC', 'Santa Catarina', 'FILIAL', 'Firewall pfSense', TRUE, 'pfSense', 60, TRUE),
    ('141-RJ', 'Rio de Janeiro/RJ', 'FILIAL', 'Firewall pfSense', TRUE, 'pfSense', 70, TRUE),
    ('151-GO/APAR', 'Aparecida de Goiânia/GO', 'FILIAL', 'Firewall pfSense', TRUE, 'pfSense', 80, TRUE),
    ('152-GO/BUE', 'Goiás (Bueno)', 'FILIAL', 'Firewall pfSense', TRUE, 'pfSense', 90, TRUE),
    ('171-MG', 'Minas Gerais', 'FILIAL', 'Firewall pfSense', TRUE, 'pfSense', 100, TRUE),
    ('191-DF', 'Distrito Federal', 'FILIAL', 'Firewall pfSense', TRUE, 'pfSense', 110, TRUE)
ON CONFLICT (codigo) DO UPDATE
SET
    localidade = EXCLUDED.localidade,
    tipo_unidade = EXCLUDED.tipo_unidade,
    hardware_critico = EXCLUDED.hardware_critico,
    conecta_vpn = EXCLUDED.conecta_vpn,
    modelo_firewall = EXCLUDED.modelo_firewall,
    ordem = EXCLUDED.ordem,
    ativo = EXCLUDED.ativo,
    atualizado_em = NOW();

INSERT INTO public.catalog_rede_politicas (categoria, topico, descricao, responsavel, periodicidade, ordem, ativo)
VALUES
    ('OBJETIVO', 'Conectividade segura entre unidades', 'Garantir conectividade segura e estavel entre matriz e filiais.', 'TI VinilSul', NULL, 10, TRUE),
    ('OBJETIVO', 'Padronizacao tecnica', 'Padronizar processos, configuracoes e diretrizes de rede corporativa.', 'TI VinilSul', NULL, 20, TRUE),
    ('ESCOPO', 'Abrangencia da politica', 'Aplica-se a toda infraestrutura de rede da VinilSul (matriz e filiais).', 'TI VinilSul', NULL, 30, TRUE),
    ('ESCOPO', 'Parceiros tecnicos', 'Abrange colaboradores internos, prestadores e parceiros Sekur Informatica e Athrium.', 'TI VinilSul', NULL, 40, TRUE),
    ('TOPOLOGIA', 'Arquitetura centralizada', 'A matriz em Curitiba (100-PR/BRIG) concentra AD, sistemas e politicas de seguranca.', 'Sekur Informatica', NULL, 50, TRUE),
    ('TOPOLOGIA', 'Conexao matriz-filial via VPN', 'Todas as filiais conectam-se a matriz por VPN IPSec em firewall pfSense.', 'Sekur Informatica', NULL, 60, TRUE),
    ('RESPONSABILIDADE', 'Sekur Informatica', 'Responsavel pela gestao tecnica de VPN, AD, GPO, firewall, failover e monitoramento.', 'Sekur Informatica', NULL, 70, TRUE),
    ('RESPONSABILIDADE', 'Athrium', 'Responsavel por suporte local presencial em Sao Paulo e coordenacao com Sekur.', 'Athrium', NULL, 80, TRUE),
    ('RESPONSABILIDADE', 'Gerencia de TI VinilSul', 'Responsavel por governanca estrategica, contratos, seguranca e conformidade LGPD.', 'TI VinilSul', NULL, 90, TRUE),
    ('ACESSO_SEGURANCA', 'Autenticacao centralizada AD', 'Todos os usuarios autenticam via Active Directory centralizado na matriz.', 'Sekur Informatica', NULL, 100, TRUE),
    ('ACESSO_SEGURANCA', 'Politica de senhas', 'Senhas com minimo de 8 caracteres e renovacao obrigatoria a cada 90 dias.', 'TI VinilSul', '90 dias', 110, TRUE),
    ('ACESSO_SEGURANCA', 'Menor privilegio', 'Acesso a sistemas e pastas de rede baseado em perfil de cargo.', 'TI VinilSul', 'Trimestral', 120, TRUE),
    ('ACESSO_SEGURANCA', 'Desativacao de contas', 'Desativacao imediata de contas de usuarios desligados.', 'TI VinilSul', 'Imediata', 130, TRUE),
    ('ACESSO_SEGURANCA', 'Seguranca de rede', 'Bloqueio automatico de portas e servicos nao essenciais e monitoramento continuo.', 'Sekur Informatica', NULL, 140, TRUE),
    ('LGPD', 'Retencao de logs', 'Logs de acesso mantidos por 12 meses para auditoria e conformidade.', 'DPO / TI VinilSul', '12 meses', 150, TRUE),
    ('LGPD', 'Criptografia de comunicacao', 'Criptografia em todas as comunicacoes matriz-filial via VPN IPSec.', 'Sekur Informatica', NULL, 160, TRUE),
    ('VIGENCIA', 'Revisao da politica', 'Politica vigente desde Fevereiro/2026, com revisao anual ou por mudancas relevantes.', 'TI VinilSul', 'Anual', 170, TRUE),
    ('SISTEMA_CRITICO', 'Salesforce CRM', 'Gestão de relacionamento com clientes e vendas', 'TI VinilSul', 'Critico', 210, TRUE),
    ('SISTEMA_CRITICO', 'Nyxos ERP', 'Sistema integrado de gestão empresarial', 'TI VinilSul', 'Critico', 220, TRUE),
    ('SISTEMA_CRITICO', 'Integrações Bancárias', 'Nexxera VAN, Banco Sofisa e outros sistemas financeiros', 'TI VinilSul', 'Critico', 230, TRUE),
    ('SISTEMA_CRITICO', 'WebService', 'Serviços web internos e APIs', 'TI VinilSul', 'Critico', 240, TRUE),
    ('SISTEMA_CRITICO', 'Pastas de Rede', 'Compartilhamento de arquivos corporativos', 'TI VinilSul', 'Critico', 250, TRUE),
    ('SISTEMA_CRITICO', 'Active Directory', 'Autenticação e gestão de identidades', 'TI VinilSul', 'Critico', 260, TRUE),
    ('MANUTENCAO', 'Atualização de firewall', 'Atividade de manutencao preventiva da infraestrutura de rede.', 'Sekur Informática', 'Mensal', 310, TRUE),
    ('MANUTENCAO', 'Backup de configurações', 'Atividade de manutencao preventiva da infraestrutura de rede.', 'Sekur Informática', 'Semanal', 320, TRUE),
    ('MANUTENCAO', 'Revisão de logs de acesso', 'Atividade de manutencao preventiva da infraestrutura de rede.', 'Sekur Informática', 'Semanal', 330, TRUE),
    ('MANUTENCAO', 'Auditoria de permissões AD', 'Atividade de manutencao preventiva da infraestrutura de rede.', 'Sekur + TI VinilSul', 'Trimestral', 340, TRUE),
    ('MANUTENCAO', 'Teste de failover VPN', 'Atividade de manutencao preventiva da infraestrutura de rede.', 'Sekur Informática', 'Semestral', 350, TRUE),
    ('MANUTENCAO', 'Revisão completa da política', 'Atividade de manutencao preventiva da infraestrutura de rede.', 'TI VinilSul', 'Anual', 360, TRUE)
ON CONFLICT (categoria, topico) DO UPDATE
SET
    descricao = EXCLUDED.descricao,
    responsavel = EXCLUDED.responsavel,
    periodicidade = EXCLUDED.periodicidade,
    ordem = EXCLUDED.ordem,
    ativo = EXCLUDED.ativo,
    atualizado_em = NOW();

INSERT INTO public.catalog_rede_usuarios (
    nome_completo, unidade, usuario, status,
    assinaturas, bancos, contab, comercial, dir, dsk, filiais, fisc, ger,
    importacao_trading, logistica, m_fat, mkt, oper, rh, rh_filiais, salesforce, sistemas
)
VALUES
    ('Alessandra Dea', 'PR', 'pr-alessandra.dea', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Alessandra Trindade', 'SP', 'sp-alessandra.t', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Alessandra Trindade2', 'SP', 'sp-alessandra.t2', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Alex Sandro', 'SP', 'sp-alex.sandro', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Alexandre Alpha', 'TER', 'ter-alexandre', 'ATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Alexandre Soares', 'SP', 'sp-alexandre.soares', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Alexsandro Souza', 'RS', 'rs-alexsandro.s', 'ATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Aline Santos', 'SC', 'sc-aline.santos', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Amanda Faifer', 'SP', 'sp-amanda.faifer', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Amanda Moura', 'GO', 'go-amanda.moura', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Amanda Oliveira', 'PR', 'pr-amanda.oliveira', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Amanda Oliveira2', 'PR', 'pr-amanda.oliveira2', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Amaury Aguiar', 'GO', 'go-amaury.aguiar', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Ana Ferraz', 'SP', 'sp-ana.ferraz', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Ana Ferraz 2', 'SP', 'sp-ana.ferraz2', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Analise Mastertech', 'TER', 'analise', 'ATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Anderson Santos', 'PR', 'pr-anderson.santos', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Anderson Xavier', 'RS', 'rs-anderson.xavier', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Andre Garcia', 'RS', 'rs-andre.g', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Andreia Almeida', 'PR', 'pr-andreia.almeida', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE),
    ('Antonio Celete', 'SP', 'sp-antonio.celete', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Aparecido Silva', 'PR', 'pr-cido.silva', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Aquiles Sebastião Junior', 'PR', 'pr-aquiles', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Ariane Lima', 'SP', 'sp-ariane.lima', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Braz Pereira', 'PR', 'pr-braz', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Bruno Coelho', 'PR', 'pr-bruno.coelho', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Bruno Costa', 'GO', 'go-bruno.costa', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Bruno Senger', 'SP', 'sp-bruno.senger', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Caio Almeida', 'PR', 'pr-caio.almeida', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Camila Lima', 'SP', 'sp-camila.lima', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Carlos Santos', 'RJ', 'rj-carlos.santos', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Caroline Martins', 'SP', 'sp-caroline.martins', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Caroline Pedroso', 'PR', 'pr-caroline.pedroso', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Catia Bazarin', 'SP', 'sp-catia.bazarin', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Celia Fontolan', 'PR', 'pr-celia', 'ATIVO', TRUE, TRUE, TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE),
    ('Chirley', 'RJ', 'rj-chirley', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Cintia Santos', 'RJ', 'rj-cintia.santos', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Cintia Santos2', 'RJ', 'rj-cintia.santos2', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Claudia', 'GO', 'go-claudia', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Claudio Comenale', 'SP', 'sp-claudio.comenale', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Crisitiane Silva', 'GO', 'go-cristiane.silva', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Cristiane Beatriz dos Santos', 'RS', 'rs-cristiane.santos', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Cristina Borges', 'SP', 'sp-cristina', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Daniel Souza', 'PR', 'pr-daniel.souza', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Danielle Carmo', 'GO', 'go-danielle.carmo', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Danielle Cortes', 'PR', 'pr-danielle.cortes', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Danielle Santos', 'SP', 'sp-danielle.santos', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Danielle Santos2', 'SP', 'sp-danielle.santos2', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Danilo Camargo', 'PR', 'pr-danilo.camargo', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Danniel Faustino', 'SP', 'sp-danniel.faustino', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Daphine Oliveira', 'PR', 'pr-daphine.oliveira', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Daphine Oliveira2', 'PR', 'pr-daphine.oliveira2', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Dayanne Silva', 'PR', 'pr-dayanne.silva', 'ATIVO', TRUE, TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE),
    ('DBA Mastertech', 'TER', 'dba', 'ATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Debora Hubner', 'PR', 'pr-debora.h', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, TRUE),
    ('Débora Oliveira', 'RJ', 'rj-debora.oliveira', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Denise Silva', 'PR', 'pr-denise.silva', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Dennys Viana', 'SP', 'sp-dennys.viana', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Diana Santos', 'GO', 'go-diana.santos', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Diana Trento', 'SC', 'sc-diana.trento', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Diego Souza', 'GO', 'go-diego.souza', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Dinison Carlos', 'RJ', 'rj-dinison.carlos', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Douglas Hubner', 'SC', 'sc-douglas.hubner', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Edilson Andrade', 'RJ', 'rj-edilson.andrade', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Edmar da Silva', 'SP', 'sp-edmar', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Edmar da Silva2', 'SP', 'sp-edmar2', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Edna Neves', 'GO', 'go-edna.neves', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE),
    ('Edson Pascoal', 'RJ', 'rj-edson.pascoal', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Eduardo', 'TER', 'ter-marka', 'ATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Elaine Kulka', 'PR', 'pr-elaine.kulka', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE),
    ('Eliana Lacerda', 'SP', 'sp-eliana.lacerda', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Eliane', 'SC', 'sc-eliane', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Eliane Silva', 'GO', 'go-eliane.silva', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Eliane2', 'SC', 'sc-eliane2', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Eliel Alencar', 'DF', 'df-eliel.alencar', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Elys Moura', 'SP', 'sp-elys.moura', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Elzita Barreto', 'SP', 'sp-elzita.barreto', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Erica Emerenciano', 'PR', 'pr-erica.emerenciano', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Erica Silva', 'GO', 'go-erica.silva', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Estevao Borges', 'RJ', 'rj-estevao.borges', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Estevão Soares', 'GO', 'go-estevao.soares', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Eugenio roese', 'SP', 'sp-eugenio.roese', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Fabiane Oliveira', 'PR', 'pr-fabiane.oliveira', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE),
    ('Fabio Baptista', 'RJ', 'rj-fabio.baptista', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Fabio Roberto', 'GO', 'go-fabio.roberto', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Felipe Barbosa Rebello', 'RJ', 'rj-felipe.barbosa', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Felipe Souza', 'SC', 'sc-felipe.souza', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Fernanda Ferreira', 'GO', 'go-fernanda.ferreira', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Fernandes Costa', 'GO', 'go-fernandes.costa', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Fernando Giacomel', 'SP', 'sp-fernando.giacomel', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Fernando R', 'GO', 'go-fernando.r', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Fernando Rocha', 'GO', 'go-fernando.rocha', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Flávio Adamoski', 'PR', 'pr-flavio.adamoski', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Francieli Jesus', 'PR', 'pr-francieli.jesus', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Franciely Sousa', 'SC', 'sc-franciely.sousa', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Francisco Santos', 'RJ', 'rj-francisco.santos', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Gabriel Couto', 'RJ', 'rj-gabriel.couto', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Gabriel Ravasio', 'RS', 'rs-gabriel.ravasio', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Gabriel Silva', 'MG', 'mg-gabriel.silva', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Gabriela Oliveira', 'RS', 'rs-gabriela.oliveira', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Gabriella Melo', 'RJ', 'rj-gabriella.melo', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Geliene Silva', 'GO', 'go-geliene.silva', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Gilson Batista', 'SP', 'sp-gilson.batista', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Gilson Batista2', 'SP', 'sp-gilson.batista2', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Gislaine Santos', 'PR', 'pr-gislaine.santos', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Glauciane Rabelo', 'PR', 'pr-glauciane.r', 'ATIVO', TRUE, TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE),
    ('Gustavo Muzell', 'RS', 'rs-gustavo.muzell', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Gustavo Sdc', 'TER', 'ter-gustavo.m', 'ATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Gustavo Tassoni', 'RS', 'rs-gustavo.tassoni', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Hugo Aguiar', 'PR', 'pr-hugo', 'ATIVO', TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE),
    ('Hugo Aguiar2', 'PR', 'pr-hugo2', 'ATIVO', TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE),
    ('Isaac Silva', 'SP', 'sp-isaac.silva', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Iury Batista', 'GO', 'go-iury.batista', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Izabella Araujo', 'SP', 'sp-izabella.araujo', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Jaine Rosa', 'PR', 'pr-jaine.rosa', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Jessica Camargo', 'PR', 'pr-jessica.camargo', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE),
    ('Jessica P', 'RS', 'rs-jessica.p', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Jessica Sdc', 'TER', 'ter-jessica.sdc', 'ATIVO', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Jéssica Soda', 'PR', 'pr-jessica.soda', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Joao Aguiar', 'PR', 'pr-joao.aguiar', 'ATIVO', TRUE, TRUE, TRUE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    ('João Aguiar2', 'PR', 'pr-joao', 'ATIVO', TRUE, TRUE, TRUE, FALSE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE),
    ('João Batistel', 'SP', 'sp-joao.batistel', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Johnny Cerqueira', 'SP', 'sp-johnny.cerqueira', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Joinville', 'SC', 'sc-joinville', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Jonatas Melo', 'SC', 'sc-jonatas.melo', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Jordi Silveira dos Santos', 'SC', 'sc-jordi.santos', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('José Carlos de Lima Souza', 'SP', 'sp-jose.lima', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('José Roberto', 'PR', 'pr-jose.roberto', 'ATIVO', TRUE, FALSE, FALSE, TRUE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Josue', 'PR', 'pr-josue', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Joyce Silva', 'SP', 'sp-joyce.silva', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Junio Santana', 'GO', 'go-junio.santana', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Kelly Martins', 'GO', 'go-kelly.martins', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Kelly Martins2', 'GO', 'go-kelly.martins2', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Ketlen Cristina', 'PR', 'pr-ketlen.cristina', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Klebio Fonseca', 'GO', 'go-klebio.fonseca', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Larissa Brito', 'GO', 'go-larissa.brito', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Leandro Reis', 'PR', 'pr-leandro.reis', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Leandro Santos', 'PR', 'pr-leandro.santos', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Leandro Santos 2', 'PR', 'pr-leandro.santos2', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Leidiane Ferreira', 'GO', 'go-leidiane.ferreira', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Leila', 'TER', 'ter-leila.silva', 'ATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Lennon Bastos', 'GO', 'go-lennon.bastos', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Leonardo Conceição Pereira', 'RJ', 'rj-leonardo.pereira', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Leonardo Oliveira', 'PR', 'pr-leonardo.oliveira', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Leonardo Oliveira2', 'PR', 'pr-leonardo.oliveir2', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Leonardo Scardovelli', 'SP', 'sp-leonardo.s', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Letícia G de Souza', 'PR', 'pr-leticia', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE),
    ('Leticia Pereira', 'SP', 'sp-leticia.pereira', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Lilian Silva', 'GO', 'go-lilian.silva', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Lincoln Hartmann', 'PR', 'pr-lincoln', 'ATIVO', TRUE, TRUE, TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, TRUE, TRUE),
    ('Logistica Parana', 'PR', 'pr-logistica', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Lohana Santos', 'PR', 'pr-lohana.santos', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Luana Garcia', 'SP', 'sp-luana.garcia', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Lucas Ferreira', 'GO', 'go-lucas.ferreira', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Lucas Ferreira 2', 'GO', 'go-lucas.ferreira2', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Lucas Martins', 'PR', 'pr-lucas.martins', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Lucia Silva', 'RS', 'rs-lucia.silva', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Luciana Vidal', 'SP', 'sp-luciana.vidal', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE),
    ('Luciana Vidal 2', 'SP', 'sp-luciana.vidal2', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE),
    ('Luis Gustavo M Vasco', 'PR', 'pr-vasco', 'ATIVO', TRUE, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, TRUE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE),
    ('Luiz Almeida', 'RJ', 'rj-luiz.almeida', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Luiz Belarmino', 'PR', 'pr-luiz.belarmino', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE),
    ('Luiz Belarmino2', 'PR', 'pr-luiz.belarmino2', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE),
    ('Luiz Henrique', 'RJ', 'rj-luiz.henrique', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Luiza Santos', 'PR', 'pr-luiza.santos', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Maiara dos Santos', 'SC', 'sc-maiara.santos', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Manuella Macedo', 'GO', 'go-manuella.macedo', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Marcela', 'RJ', 'rj-marcela', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Marcia', 'RJ', 'rj-marcia', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Marco Antônio Simão', 'SP', 'sp-marco', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Mari Camargo', 'PR', 'pr-mari.camargo', 'ATIVO', TRUE, FALSE, TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Mari Sdc', 'TER', 'ter-mari.sdc', 'ATIVO', FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Mariana Aparecida Patricio borges', 'SP', 'sp-mariana.borges', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Marileusa', 'GO', 'go-marileusa', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Marlon Chagas', 'PR', 'pr-marlon.chagas', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Mastertech', 'TER', 'ter-mastertech', 'ATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Mastertech Sistemas', 'TER', 'mastertech', 'ATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Michelle S', 'PR', 'pr-michelle.s', 'ATIVO', TRUE, TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE),
    ('Michely Vieira Alvarenga', 'GO', 'go-michely.vieira', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Michely Vieira Alvarenga 2', 'GO', 'go-michely.vieira2', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Mirian Basso', 'PR', 'pr-mirian.basso', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Mislaine Jesus', 'PR', 'pr-mislaine.jesus', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE),
    ('Monica Pescarolli', 'SP', 'sp-monica.pescarolli', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Nathalia Brito', 'GO', 'go-nathalia.brito', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Nathalia NM. Meneses', 'SP', 'sp-nathalia.meneses', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Neander Silva', 'PR', 'pr-neander.silva', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Nexxera', 'TER', 'nexxera', 'ATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Nilson Alves', 'PR', 'pr-nilson.alves', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Pamela Patricia', 'PR', 'pr-pamela.patricia', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Pamela Patricia 2', 'PR', 'pr-pamela.patricia2', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Patricia Oliveira', 'SP', 'sp-patricia.oliveira', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Patricia Silva', 'PR', 'pr-patricia.silva', 'ATIVO', TRUE, TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE),
    ('Patrick Carvalho', 'DF', 'df-patrick.carvalho', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Patrick Flores', 'SC', 'sc-patrick.flores', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Paulo Hubner', 'PR', 'pr-paulo', 'ATIVO', TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Paulo Jesus', 'GO', 'go-paulo.jesus', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Paulo Juliao', 'SC', 'sc-paulo.juliao', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Paulo Ricaro', 'RS', 'rs-paulo.ricardo', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Paulo Silva', 'GO', 'go-paulo.silva', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Pedro Neto', 'PR', 'pr-pedro.neto', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Peterson Pereira', 'RS', 'rs-peterson.pereira', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Pollyana Santana', 'GO', 'go-pollyana.santana', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Ponto', 'TER', 'ponto', 'ATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Priscila Correa', 'RJ', 'rj-priscila.correa', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Priscila Correa 2', 'RJ', 'rj-priscila.correa2', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Priscila Hubner', 'PR', 'pr-priscila', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, TRUE, FALSE),
    ('Rachel Borba', 'PR', 'pr-rachel.borba', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Rafael Azevedo', 'PR', 'pr-rafael.azevedo', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Raissa Santos', 'PR', 'pr-raissa.santos', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Raphael Ferreira', 'SP', 'sp-raphael.ferreira', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Raphael Firmino', 'RJ', 'rj-raphael.firmino', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Raphael Julio', 'GO', 'go-raphael.julio', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Regina Moraes', 'PR', 'pr-regina.moraes', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Regis Cordeiro', 'PR', 'pr-regis.cordeiro', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Renata Portela', 'SP', 'sp-renata.portela', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Renata Quaresma', 'PR', 'pr-renata.quaresma', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Rene', 'SP', 'sp-rene-t', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Ricardo Viana', 'RJ', 'rj-ricardo.viana', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Roberto Conceicao', 'RS', 'rs-roberto.conceicao', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Rodrigo Barboza', 'RJ', 'rj-rodrigo.barboza', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Rogério Almeida', 'RJ', 'rj-rogerio.almeida', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Romulo Romano', 'PR', 'pr-romulo.romano', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE),
    ('Romulo Romano 2', 'PR', 'pr-romulo.romano2', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE),
    ('Ronaldo Silva', 'RJ', 'rj-ronaldo.silva', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Ronie', 'SP', 'sp-ronie', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Rubens Prado', 'PR', 'pr-rubens.prado', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Sabrina', 'RS', 'rs-sabrina', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Sales Force', 'TER', 'ter-salesforce', 'ATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Salustiano Faria', 'GO', 'go-salustiano.faria', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Sandra Aparcida Ruchinski', 'PR', 'pr-sandra.ruc', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Sandriele Miranda', 'PR', 'pr-sandriele.miranda', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Sany', 'GO', 'go-sany', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('sekur', 'TER', 'sekur', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Shayene Santos', 'PR', 'pr-shayene.santos', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE),
    ('Sidimar', 'PR', 'pr-sidimar', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Simone Lima', 'SP', 'sp-simone.lima', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Solange Teles', 'PR', 'pr-solange.teles', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Solange Teles2', 'PR', 'pr-solange.teles2', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Suporte', 'PR', 'pr-suporte', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Suporte Mastertech', 'TER', 'suporte', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Suzana Correa da Silva', 'RJ', 'rj-suzana.silva', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Tayna Gonçalves', 'RS', 'rs-tayna.goncalves', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Thais Pedroso', 'RS', 'rs-thais.pedroso', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Thais Souza', 'RJ', 'rj-thais.souza', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE),
    ('Thalyta Silva', 'GO', 'go-thalyta.silva', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Thayna Godoy', 'SP', 'sp-thayna.godoy', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Thiago Paz', 'PR', 'pr-thiago.paz', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE),
    ('Thiago Pimentel', 'RJ', 'rj-thiago.pimentel', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Thiago Reis', 'SP', 'sp-thiago.reis', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Thiemi Franca', 'SP', 'sp-thiemi.franca', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Tiago cavallari', 'RJ', 'rj-tiago.cavallari', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Vandeli Amorim Ribeiro', 'PR', 'pr-vandeli', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Vanessa Lacerda', 'SP', 'sp-vanessa.lacerda', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Vanessa Maestrelli Medeiros', 'PR', 'pr-vanessa', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE),
    ('velti', 'TER', 'velti', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Veronica Assis', 'PR', 'pr-veronica.assis', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Victor Ribeiro', 'PR', 'pr-victor.ribeiro', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Vinicius Figueredo', 'GO', 'go-vinicius.f', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Vinicius Hubner', 'PR', 'pr-vinicius.hubner', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE),
    ('Vinicius Melo', 'GO', 'go-vinicius', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Vinicius Peres', 'MG', 'mg-vinicius.peres', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Vithorya Melo', 'GO', 'go-vithorya.melo', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Vivian Kern', 'PR', 'pr-vivian.kern', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Wellington Alcantara', 'MG', 'mg-wellington.a', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Werick Oliveira', 'GO', 'go-werick.oliveira', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Wesley Ribeiro', 'MG', 'mg-wesley.ribeiro', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Wesley Santos', 'GO', 'go-wesley.santos', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Wiliam Marinho', 'RJ', 'rj-wiliam.marinho', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Wilson Junior', 'SP', 'sp-wilson.junior', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Wyllian Santos', 'PR', 'pr-wyllian.santos', 'INATIVO', FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
    ('Ynara Grupp', 'PR', 'pr-ynara.grupp', 'ATIVO', TRUE, FALSE, FALSE, FALSE, FALSE, TRUE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE)
ON CONFLICT (usuario) DO UPDATE
SET
    nome_completo = EXCLUDED.nome_completo,
    unidade = EXCLUDED.unidade,
    status = EXCLUDED.status,
    assinaturas = EXCLUDED.assinaturas,
    bancos = EXCLUDED.bancos,
    contab = EXCLUDED.contab,
    comercial = EXCLUDED.comercial,
    dir = EXCLUDED.dir,
    dsk = EXCLUDED.dsk,
    filiais = EXCLUDED.filiais,
    fisc = EXCLUDED.fisc,
    ger = EXCLUDED.ger,
    importacao_trading = EXCLUDED.importacao_trading,
    logistica = EXCLUDED.logistica,
    m_fat = EXCLUDED.m_fat,
    mkt = EXCLUDED.mkt,
    oper = EXCLUDED.oper,
    rh = EXCLUDED.rh,
    rh_filiais = EXCLUDED.rh_filiais,
    salesforce = EXCLUDED.salesforce,
    sistemas = EXCLUDED.sistemas,
    atualizado_em = NOW();

ALTER TABLE public.catalog_rede_usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_rede_topologia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_rede_politicas ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_rede_usuarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_rede_topologia TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_rede_politicas TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE public.catalog_rede_usuarios_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.catalog_rede_topologia_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.catalog_rede_politicas_id_seq TO authenticated;

DROP POLICY IF EXISTS catalog_rede_usuarios_select_authenticated ON public.catalog_rede_usuarios;
DROP POLICY IF EXISTS catalog_rede_usuarios_write_admin ON public.catalog_rede_usuarios;
DROP POLICY IF EXISTS catalog_rede_usuarios_update_admin ON public.catalog_rede_usuarios;
DROP POLICY IF EXISTS catalog_rede_usuarios_delete_admin ON public.catalog_rede_usuarios;

DROP POLICY IF EXISTS catalog_rede_topologia_select_authenticated ON public.catalog_rede_topologia;
DROP POLICY IF EXISTS catalog_rede_topologia_write_admin ON public.catalog_rede_topologia;
DROP POLICY IF EXISTS catalog_rede_topologia_update_admin ON public.catalog_rede_topologia;
DROP POLICY IF EXISTS catalog_rede_topologia_delete_admin ON public.catalog_rede_topologia;

DROP POLICY IF EXISTS catalog_rede_politicas_select_authenticated ON public.catalog_rede_politicas;
DROP POLICY IF EXISTS catalog_rede_politicas_write_admin ON public.catalog_rede_politicas;
DROP POLICY IF EXISTS catalog_rede_politicas_update_admin ON public.catalog_rede_politicas;
DROP POLICY IF EXISTS catalog_rede_politicas_delete_admin ON public.catalog_rede_politicas;

CREATE POLICY catalog_rede_usuarios_select_authenticated
ON public.catalog_rede_usuarios
FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY catalog_rede_usuarios_write_admin
ON public.catalog_rede_usuarios
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY catalog_rede_usuarios_update_admin
ON public.catalog_rede_usuarios
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY catalog_rede_usuarios_delete_admin
ON public.catalog_rede_usuarios
FOR DELETE
TO authenticated
USING (public.is_admin());

CREATE POLICY catalog_rede_topologia_select_authenticated
ON public.catalog_rede_topologia
FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY catalog_rede_topologia_write_admin
ON public.catalog_rede_topologia
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY catalog_rede_topologia_update_admin
ON public.catalog_rede_topologia
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY catalog_rede_topologia_delete_admin
ON public.catalog_rede_topologia
FOR DELETE
TO authenticated
USING (public.is_admin());

CREATE POLICY catalog_rede_politicas_select_authenticated
ON public.catalog_rede_politicas
FOR SELECT
TO authenticated
USING (TRUE);

CREATE POLICY catalog_rede_politicas_write_admin
ON public.catalog_rede_politicas
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin());

CREATE POLICY catalog_rede_politicas_update_admin
ON public.catalog_rede_politicas
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY catalog_rede_politicas_delete_admin
ON public.catalog_rede_politicas
FOR DELETE
TO authenticated
USING (public.is_admin());

COMMENT ON TABLE public.catalog_rede_usuarios IS 'Base de usuarios de rede importada da planilha Gestor-Usuarios_REDE (CRUD admin + leitura autenticada).';
COMMENT ON TABLE public.catalog_rede_topologia IS 'Cadastro da topologia de rede corporativa com unidades, VPN e hardware critico.';
COMMENT ON TABLE public.catalog_rede_politicas IS 'Diretrizes da politica de infraestrutura de rede, sistemas criticos e manutencoes.';

COMMIT;
