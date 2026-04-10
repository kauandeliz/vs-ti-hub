/**
 * supabase.js
 *
 * Camada central de acesso a dados e Edge Functions do VS TI Hub.
 * - Inicializa o cliente Supabase uma única vez
 * - Padroniza erros e respostas
 * - Centraliza chamadas de banco e funções administrativas
 */

(function bootstrapSupabaseLayer() {
    'use strict';

    const DEFAULT_CONFIG = Object.freeze({
        supabaseUrl: 'https://ufoykcfcaygtwwpwwhyl.supabase.co',
        supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmb3lrY2ZjYXlndHd3cHd3aHlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjYxODUsImV4cCI6MjA4OTYwMjE4NX0.ZgY6K0rf6MEhY9sVnX0D0XRlITA6wyc8X_wZs-m5pq0',
        functionsPrefix: '/functions/v1',
    });

    const userConfig = window.VSTI_CONFIG || {};
    const config = Object.freeze({
        ...DEFAULT_CONFIG,
        ...userConfig,
    });

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        throw new Error('Supabase SDK não foi carregado. Verifique o script CDN em index.html.');
    }

    const client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
        },
    });

    function normalizeError(message, code = 'APP_ERROR', details = null) {
        return {
            message: String(message || 'Erro desconhecido.'),
            code,
            details,
        };
    }

    async function parseJsonSafe(response) {
        try {
            return await response.json();
        } catch {
            return null;
        }
    }

    async function getSessionOrError() {
        const { data, error } = await client.auth.getSession();
        if (error) {
            return { session: null, error: normalizeError(error.message, error.code || 'SESSION_ERROR') };
        }

        const session = data?.session || null;
        if (!session) {
            return { session: null, error: normalizeError('Sessão inválida. Faça login novamente.', 'NO_SESSION') };
        }

        return { session, error: null };
    }

    async function invokeFunction(name, payload = {}, opts = {}) {
        const {
            requiresAuth = true,
            method = 'POST',
        } = opts;

        const headers = {
            'Content-Type': 'application/json',
        };

        if (requiresAuth) {
            const { session, error } = await getSessionOrError();
            if (error) {
                return { data: null, error };
            }
            headers.Authorization = `Bearer ${session.access_token}`;
        }

        try {
            const response = await fetch(`${config.supabaseUrl}${config.functionsPrefix}/${name}`, {
                method,
                headers,
                body: JSON.stringify(payload ?? {}),
            });

            const body = await parseJsonSafe(response);

            if (!response.ok) {
                return {
                    data: null,
                    error: normalizeError(body?.error || 'Falha ao processar requisição.', `HTTP_${response.status}`, body),
                };
            }

            return { data: body, error: null };
        } catch (err) {
            return {
                data: null,
                error: normalizeError(err instanceof Error ? err.message : 'Erro de rede.', 'NETWORK_ERROR'),
            };
        }
    }

    function sanitizeSearchTerm(rawTerm) {
        return String(rawTerm || '').trim();
    }

    async function salvarAcesso(admissionData, acessos) {
        const { data, error } = await invokeFunction('save-acesso', { admissionData, acessos }, { requiresAuth: true });
        if (error) {
            return { data: null, error };
        }

        return {
            data: data?.record || null,
            error: null,
        };
    }

    async function listarAcessos({ search = '', status = '', uf = '', limit = 100, page = 1, pageSize = 50 } = {}) {
        const resolvedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 50;
        const resolvedPage = Number.isFinite(page) && page > 0 ? page : 1;

        let query = client
            .from('acessos')
            .select('*', { count: 'exact' })
            .order('criado_em', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        if (uf) {
            query = query.eq('uf', uf);
        }

        const term = sanitizeSearchTerm(search);
        if (term) {
            query = query.or(`nome.ilike.%${term}%,cpf.ilike.%${term}%,cargo.ilike.%${term}%,setor.ilike.%${term}%,login_email.ilike.%${term}%`);
        }

        if (Number.isFinite(limit) && limit > 0) {
            query = query.limit(limit);
        } else {
            const rangeFrom = (resolvedPage - 1) * resolvedPageSize;
            const rangeTo = rangeFrom + resolvedPageSize - 1;
            query = query.range(rangeFrom, rangeTo);
        }

        const { data, error, count } = await query;
        if (error) {
            return {
                data: null,
                count: 0,
                error: normalizeError(error.message, error.code || 'DB_LIST_ERROR', error),
            };
        }

        return {
            data: data || [],
            count: Number.isFinite(count) ? count : (data || []).length,
            error: null,
        };
    }

    async function buscarAcesso(id) {
        const { data, error } = await client
            .from('acessos')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_GET_ERROR', error),
            };
        }

        return { data, error: null };
    }

    async function revogarAcesso(id, motivo = '') {
        const { data, error } = await client
            .from('acessos')
            .update({
                status: 'revogado',
                revogado_em: new Date().toISOString(),
                motivo_revogacao: motivo || null,
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_REVOKE_ERROR', error),
            };
        }

        return { data, error: null };
    }

    async function reativarAcesso(id) {
        const { data, error } = await client
            .from('acessos')
            .update({
                status: 'ativo',
                revogado_em: null,
                motivo_revogacao: null,
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_RESTORE_ERROR', error),
            };
        }

        return { data, error: null };
    }

    async function atualizarAcesso(id, fields) {
        const { data, error } = await client
            .from('acessos')
            .update({ ...fields, atualizado_em: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_UPDATE_ERROR', error),
            };
        }

        return { data, error: null };
    }

    async function listUsers() {
        const { data, error } = await invokeFunction('invite-user', { action: 'list' }, { requiresAuth: true });
        return {
            data: data?.users || null,
            error,
        };
    }

    async function inviteUser({ name, email, password, type, setor, cargo }) {
        return invokeFunction('invite-user', {
            action: 'invite',
            name,
            email,
            password,
            type,
            setor,
            cargo,
        }, { requiresAuth: true });
    }

    async function deactivateUser(userId) {
        return invokeFunction('invite-user', { action: 'deactivate', userId }, { requiresAuth: true });
    }

    async function reactivateUser(userId) {
        return invokeFunction('invite-user', { action: 'reactivate', userId }, { requiresAuth: true });
    }

    async function changeUserPassword(targetUserId, newPassword) {
        return invokeFunction('invite-user', {
            action: 'change-password',
            targetUserId,
            newPassword,
        }, { requiresAuth: true });
    }

    const CATALOG_CACHE_TTL_MS = 45_000;
    let catalogSnapshotCache = null;
    let catalogSnapshotCachedAt = 0;

    function sanitizeText(value) {
        return String(value || '').trim();
    }

    function sortLocaleBR(values) {
        return [...values].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
    }

    function invalidateCatalogCache() {
        catalogSnapshotCache = null;
        catalogSnapshotCachedAt = 0;
    }

    async function listarSetores({ apenasAtivos = false } = {}) {
        let query = client
            .from('catalog_setores')
            .select('*')
            .order('nome', { ascending: true });

        if (apenasAtivos) {
            query = query.eq('ativo', true);
        }

        const { data, error } = await query;
        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_SETOR_LIST_ERROR', error),
            };
        }

        return { data: data || [], error: null };
    }

    async function criarSetor({ nome, ativo = true }) {
        const nomeLimpo = sanitizeText(nome);
        if (!nomeLimpo) {
            return { data: null, error: normalizeError('Informe o nome do setor.', 'VALIDATION_ERROR') };
        }

        const { data, error } = await client
            .from('catalog_setores')
            .insert([{ nome: nomeLimpo, ativo: Boolean(ativo) }])
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_SETOR_CREATE_ERROR', error),
            };
        }

        invalidateCatalogCache();
        return { data, error: null };
    }

    async function atualizarSetor(id, fields = {}) {
        const payload = {};

        if (Object.prototype.hasOwnProperty.call(fields, 'nome')) {
            const nomeLimpo = sanitizeText(fields.nome);
            if (!nomeLimpo) {
                return { data: null, error: normalizeError('Informe o nome do setor.', 'VALIDATION_ERROR') };
            }
            payload.nome = nomeLimpo;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'ativo')) {
            payload.ativo = Boolean(fields.ativo);
        }

        if (!Object.keys(payload).length) {
            return { data: null, error: normalizeError('Nenhuma alteração foi informada.', 'VALIDATION_ERROR') };
        }

        const { data, error } = await client
            .from('catalog_setores')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_SETOR_UPDATE_ERROR', error),
            };
        }

        invalidateCatalogCache();
        return { data, error: null };
    }

    async function removerSetor(id) {
        const { error } = await client
            .from('catalog_setores')
            .delete()
            .eq('id', id);

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_SETOR_DELETE_ERROR', error),
            };
        }

        invalidateCatalogCache();
        return { data: { id }, error: null };
    }

    async function listarCargos({ setorId = null, apenasAtivos = false } = {}) {
        let query = client
            .from('catalog_cargos')
            .select('*')
            .order('nome', { ascending: true });

        if (Number.isFinite(setorId) && Number(setorId) > 0) {
            query = query.eq('setor_id', Number(setorId));
        }

        if (apenasAtivos) {
            query = query.eq('ativo', true);
        }

        const { data, error } = await query;
        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_CARGO_LIST_ERROR', error),
            };
        }

        return { data: data || [], error: null };
    }

    async function criarCargo({ setorId, nome, ativo = true }) {
        const idSetor = Number(setorId);
        const nomeLimpo = sanitizeText(nome);

        if (!Number.isFinite(idSetor) || idSetor <= 0) {
            return { data: null, error: normalizeError('Selecione um setor válido.', 'VALIDATION_ERROR') };
        }

        if (!nomeLimpo) {
            return { data: null, error: normalizeError('Informe o nome do cargo.', 'VALIDATION_ERROR') };
        }

        const { data, error } = await client
            .from('catalog_cargos')
            .insert([{ setor_id: idSetor, nome: nomeLimpo, ativo: Boolean(ativo) }])
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_CARGO_CREATE_ERROR', error),
            };
        }

        invalidateCatalogCache();
        return { data, error: null };
    }

    async function atualizarCargo(id, fields = {}) {
        const payload = {};

        if (Object.prototype.hasOwnProperty.call(fields, 'setorId')) {
            const idSetor = Number(fields.setorId);
            if (!Number.isFinite(idSetor) || idSetor <= 0) {
                return { data: null, error: normalizeError('Selecione um setor válido.', 'VALIDATION_ERROR') };
            }
            payload.setor_id = idSetor;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'nome')) {
            const nomeLimpo = sanitizeText(fields.nome);
            if (!nomeLimpo) {
                return { data: null, error: normalizeError('Informe o nome do cargo.', 'VALIDATION_ERROR') };
            }
            payload.nome = nomeLimpo;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'ativo')) {
            payload.ativo = Boolean(fields.ativo);
        }

        if (!Object.keys(payload).length) {
            return { data: null, error: normalizeError('Nenhuma alteração foi informada.', 'VALIDATION_ERROR') };
        }

        const { data, error } = await client
            .from('catalog_cargos')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_CARGO_UPDATE_ERROR', error),
            };
        }

        invalidateCatalogCache();
        return { data, error: null };
    }

    async function removerCargo(id) {
        const { error } = await client
            .from('catalog_cargos')
            .delete()
            .eq('id', id);

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_CARGO_DELETE_ERROR', error),
            };
        }

        invalidateCatalogCache();
        return { data: { id }, error: null };
    }

    function normalizeFilialPayload(fields = {}, { partial = false } = {}) {
        const payload = {};

        if (Object.prototype.hasOwnProperty.call(fields, 'codigo')) {
            const raw = sanitizeText(fields.codigo);
            if (!raw) {
                payload.codigo = null;
            } else {
                const parsed = Number(raw);
                if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) {
                    return { payload: null, error: normalizeError('Código da filial inválido.', 'VALIDATION_ERROR') };
                }
                payload.codigo = parsed;
            }
        }

        const textFields = ['nome', 'cidade', 'bairro', 'endereco', 'numero', 'cnpj', 'cep'];
        textFields.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(fields, field)) {
                const value = sanitizeText(fields[field]);
                payload[field] = value || null;
            }
        });

        if (Object.prototype.hasOwnProperty.call(fields, 'uf')) {
            const uf = sanitizeText(fields.uf).toUpperCase();
            payload.uf = uf || null;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'usaEtiqueta')) {
            payload.usa_etiqueta = Boolean(fields.usaEtiqueta);
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'ativo')) {
            payload.ativo = Boolean(fields.ativo);
        }

        if (!partial) {
            const required = ['nome', 'uf', 'cidade', 'bairro', 'endereco', 'numero'];
            for (const field of required) {
                if (!payload[field]) {
                    return { payload: null, error: normalizeError(`Campo obrigatório: ${field}.`, 'VALIDATION_ERROR') };
                }
            }
        }

        if (payload.uf && !/^[A-Z]{2}$/.test(payload.uf)) {
            return { payload: null, error: normalizeError('UF deve conter 2 letras.', 'VALIDATION_ERROR') };
        }

        return { payload, error: null };
    }

    async function listarFiliais({ apenasAtivos = false, apenasEtiqueta = null } = {}) {
        let query = client
            .from('filiais')
            .select('*')
            .order('codigo', { ascending: true, nullsFirst: false })
            .order('nome', { ascending: true });

        if (apenasAtivos) {
            query = query.eq('ativo', true);
        }

        if (apenasEtiqueta === true) {
            query = query.eq('usa_etiqueta', true);
        }

        const { data, error } = await query;
        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_FILIAL_LIST_ERROR', error),
            };
        }

        return { data: data || [], error: null };
    }

    async function criarFilial(fields) {
        const { payload, error: payloadError } = normalizeFilialPayload(fields, { partial: false });
        if (payloadError) {
            return { data: null, error: payloadError };
        }

        const { data, error } = await client
            .from('filiais')
            .insert([payload])
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_FILIAL_CREATE_ERROR', error),
            };
        }

        invalidateCatalogCache();
        return { data, error: null };
    }

    async function atualizarFilial(id, fields = {}) {
        const { payload, error: payloadError } = normalizeFilialPayload(fields, { partial: true });
        if (payloadError) {
            return { data: null, error: payloadError };
        }

        if (!Object.keys(payload).length) {
            return { data: null, error: normalizeError('Nenhuma alteração foi informada.', 'VALIDATION_ERROR') };
        }

        const { data, error } = await client
            .from('filiais')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_FILIAL_UPDATE_ERROR', error),
            };
        }

        invalidateCatalogCache();
        return { data, error: null };
    }

    async function removerFilial(id) {
        const { error } = await client
            .from('filiais')
            .delete()
            .eq('id', id);

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_FILIAL_DELETE_ERROR', error),
            };
        }

        invalidateCatalogCache();
        return { data: { id }, error: null };
    }

    function buildCatalogSnapshot({ setores, cargos, filiais }) {
        const sortedSetores = sortLocaleBR(setores.map((item) => item.nome));
        const setorNomePorId = new Map(setores.map((item) => [item.id, item.nome]));

        const cargosPorSetor = {};
        cargos.forEach((cargo) => {
            const setorNome = setorNomePorId.get(cargo.setor_id);
            if (!setorNome) return;
            if (!cargosPorSetor[setorNome]) {
                cargosPorSetor[setorNome] = [];
            }
            cargosPorSetor[setorNome].push(cargo.nome);
        });

        Object.keys(cargosPorSetor).forEach((setorNome) => {
            cargosPorSetor[setorNome] = sortLocaleBR(cargosPorSetor[setorNome]);
        });

        const localidadeData = {};
        filiais.forEach((filial) => {
            const uf = sanitizeText(filial.uf).toUpperCase();
            const cidade = sanitizeText(filial.cidade);
            const bairro = sanitizeText(filial.bairro);

            if (!uf || !cidade || !bairro) return;

            if (!localidadeData[uf]) {
                localidadeData[uf] = {};
            }
            if (!localidadeData[uf][cidade]) {
                localidadeData[uf][cidade] = [];
            }
            if (!localidadeData[uf][cidade].includes(bairro)) {
                localidadeData[uf][cidade].push(bairro);
            }
        });

        Object.keys(localidadeData).forEach((uf) => {
            const cidades = localidadeData[uf];
            Object.keys(cidades).forEach((cidade) => {
                cidades[cidade] = sortLocaleBR(cidades[cidade]);
            });
        });

        const ufs = sortLocaleBR(Object.keys(localidadeData));

        return {
            setores: sortedSetores,
            cargosPorSetor,
            localidadeData,
            ufs,
            filiais,
            raw: {
                setores,
                cargos,
                filiais,
            },
        };
    }

    async function getCatalogSnapshot({ force = false, apenasAtivos = true } = {}) {
        const useCache = apenasAtivos === true;
        const cacheIsValid = useCache
            && catalogSnapshotCache
            && (Date.now() - catalogSnapshotCachedAt) < CATALOG_CACHE_TTL_MS;

        if (!force && cacheIsValid) {
            return { data: catalogSnapshotCache, error: null };
        }

        const [setoresRes, cargosRes, filiaisRes] = await Promise.all([
            listarSetores({ apenasAtivos }),
            listarCargos({ apenasAtivos }),
            listarFiliais({ apenasAtivos }),
        ]);

        const firstError = setoresRes.error || cargosRes.error || filiaisRes.error;
        if (firstError) {
            return { data: null, error: firstError };
        }

        const snapshot = buildCatalogSnapshot({
            setores: setoresRes.data || [],
            cargos: cargosRes.data || [],
            filiais: filiaisRes.data || [],
        });

        if (useCache) {
            catalogSnapshotCache = snapshot;
            catalogSnapshotCachedAt = Date.now();
        }

        return { data: snapshot, error: null };
    }

    function parseDateBR(value) {
        if (!value) return null;

        const normalized = String(value).trim();
        const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (!match) return null;

        const [, day, month, year] = match;
        return `${year}-${month}-${day}`;
    }

    function formatDateBR(isoValue) {
        if (!isoValue) return '—';
        const date = new Date(isoValue);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleDateString('pt-BR');
    }

    function formatDateTimeBR(isoValue) {
        if (!isoValue) return '—';
        const date = new Date(isoValue);
        if (Number.isNaN(date.getTime())) return '—';
        return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    }

    const api = {
        db: {
            salvarAcesso,
            listarAcessos,
            buscarAcesso,
            revogarAcesso,
            reativarAcesso,
            atualizarAcesso,
        },
        admin: {
            listUsers,
            inviteUser,
            deactivateUser,
            reactivateUser,
            changeUserPassword,
        },
        catalog: {
            listarSetores,
            criarSetor,
            atualizarSetor,
            removerSetor,
            listarCargos,
            criarCargo,
            atualizarCargo,
            removerCargo,
            listarFiliais,
            criarFilial,
            atualizarFilial,
            removerFilial,
            getCatalogSnapshot,
            invalidateCatalogCache,
        },
        auth: {
            getSessionOrError,
            invokeFunction,
        },
    };

    window.App = window.App || {};
    window.App.config = config;
    window.App.supabase = client;
    window.App.api = api;
    window.App.utils = {
        parseDateBR,
        formatDateBR,
        formatDateTimeBR,
        normalizeError,
    };

    // Compatibilidade com o código legado
    window.SUPABASE_URL = config.supabaseUrl;
    window.SUPABASE_ANON = config.supabaseAnonKey;
    window._supabase = client;

    window.dbSalvarAcesso = salvarAcesso;
    window.dbListarAcessos = listarAcessos;
    window.dbBuscarAcesso = buscarAcesso;
    window.dbRevogarAcesso = revogarAcesso;
    window.dbReativarAcesso = reativarAcesso;
    window.dbAtualizarAcesso = atualizarAcesso;
    window.dbGetCatalogSnapshot = getCatalogSnapshot;

    window.parseDateBR = parseDateBR;
    window.formatDateBR = formatDateBR;
    window.formatDateTimeBR = formatDateTimeBR;
})();
