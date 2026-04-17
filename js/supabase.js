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

    function normalizeColaboradorStatus(value) {
        const normalized = sanitizeText(value).toUpperCase();
        if (normalized === 'ATIVO' || normalized === 'INATIVO') {
            return normalized;
        }
        return null;
    }

    function normalizeColaboradorPayload(fields = {}, { partial = false } = {}) {
        const payload = {};
        const labels = {
            status: 'STATUS',
            uf: 'UF',
            loja: 'LOJA',
            empresa: 'EMPRESA',
            nome: 'NOME',
            setor: 'SETOR',
            funcao: 'FUNÇÃO',
        };

        if (Object.prototype.hasOwnProperty.call(fields, 'status')) {
            const status = normalizeColaboradorStatus(fields.status);
            if (!status) {
                return { payload: null, error: normalizeError('Status inválido. Use ATIVO ou INATIVO.', 'VALIDATION_ERROR') };
            }
            payload.status = status;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'uf')) {
            const uf = sanitizeText(fields.uf).toUpperCase();
            if (!/^[A-Z]{2}$/.test(uf)) {
                return { payload: null, error: normalizeError('UF inválida. Use 2 letras.', 'VALIDATION_ERROR') };
            }
            payload.uf = uf;
        }

        const requiredTextFields = ['loja', 'empresa', 'nome', 'setor', 'funcao'];
        for (const field of requiredTextFields) {
            if (!Object.prototype.hasOwnProperty.call(fields, field)) continue;
            const value = sanitizeText(fields[field]);
            if (!value) {
                return { payload: null, error: normalizeError(`Informe ${labels[field] || field}.`, 'VALIDATION_ERROR') };
            }
            payload[field] = value;
        }

        if (!partial) {
            const required = ['status', 'uf', 'loja', 'empresa', 'nome', 'setor', 'funcao'];
            for (const field of required) {
                if (!payload[field]) {
                    return { payload: null, error: normalizeError(`Campo obrigatório: ${labels[field] || field}.`, 'VALIDATION_ERROR') };
                }
            }
        }

        return { payload, error: null };
    }

    async function listarColaboradores({ search = '', status = '' } = {}) {
        let query = client
            .from('colaboradores')
            .select('*')
            .order('nome', { ascending: true });

        const normalizedStatus = sanitizeText(status).toLowerCase();
        if (normalizedStatus === 'ativo') {
            query = query.eq('status', 'ATIVO');
        } else if (normalizedStatus === 'inativo') {
            query = query.eq('status', 'INATIVO');
        }

        const term = sanitizeSearchTerm(search);
        if (term) {
            query = query.or(`status.ilike.%${term}%,uf.ilike.%${term}%,loja.ilike.%${term}%,empresa.ilike.%${term}%,nome.ilike.%${term}%,setor.ilike.%${term}%,funcao.ilike.%${term}%`);
        }

        const { data, error } = await query;
        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_COLAB_LIST_ERROR', error),
            };
        }

        return { data: data || [], error: null };
    }

    async function criarColaborador(fields = {}) {
        const { payload, error: payloadError } = normalizeColaboradorPayload(fields, { partial: false });
        if (payloadError) {
            return { data: null, error: payloadError };
        }

        const { data, error } = await client
            .from('colaboradores')
            .insert([payload])
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_COLAB_CREATE_ERROR', error),
            };
        }

        return { data, error: null };
    }

    async function atualizarColaborador(id, fields = {}) {
        const { payload, error: payloadError } = normalizeColaboradorPayload(fields, { partial: true });
        if (payloadError) {
            return { data: null, error: payloadError };
        }

        if (!Object.keys(payload).length) {
            return { data: null, error: normalizeError('Nenhuma alteração foi informada.', 'VALIDATION_ERROR') };
        }

        const { data, error } = await client
            .from('colaboradores')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_COLAB_UPDATE_ERROR', error),
            };
        }

        return { data, error: null };
    }

    async function removerColaborador(id) {
        const { error } = await client
            .from('colaboradores')
            .delete()
            .eq('id', id);

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_COLAB_DELETE_ERROR', error),
            };
        }

        return { data: { id }, error: null };
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

    async function updateUserProfile({ targetUserId, name, email, type, setor, cargo }) {
        return invokeFunction('invite-user', {
            action: 'update-profile',
            targetUserId,
            name,
            email,
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

    const DIRECIONADOR_AREAS = new Set(['home', 'helpdesk', 'corporativo', 'telecom']);

    function normalizeDirecionadorArea(area) {
        const parsed = sanitizeText(area).toLowerCase();
        if (!DIRECIONADOR_AREAS.has(parsed)) {
            return { value: null, error: normalizeError('Área inválida para o card.', 'VALIDATION_ERROR') };
        }
        return { value: parsed, error: null };
    }

    function normalizeHttpUrl(rawValue, fieldLabel) {
        const value = sanitizeText(rawValue);
        if (!value) {
            return { value: null, error: normalizeError(`Informe ${fieldLabel}.`, 'VALIDATION_ERROR') };
        }

        try {
            const parsed = new URL(value);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                return { value: null, error: normalizeError(`${fieldLabel} inválido. Use URL http(s).`, 'VALIDATION_ERROR') };
            }
            return { value: parsed.toString(), error: null };
        } catch {
            return { value: null, error: normalizeError(`${fieldLabel} inválido. Use URL http(s).`, 'VALIDATION_ERROR') };
        }
    }

    function normalizeDirecionadorPayload(fields = {}, { partial = false } = {}) {
        const payload = {};

        if (Object.prototype.hasOwnProperty.call(fields, 'area')) {
            const { value, error } = normalizeDirecionadorArea(fields.area);
            if (error) return { payload: null, error };
            payload.area = value;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'nome')) {
            const nome = sanitizeText(fields.nome);
            if (!nome) {
                return { payload: null, error: normalizeError('Informe o nome do card.', 'VALIDATION_ERROR') };
            }
            payload.nome = nome;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'descricao')) {
            const descricao = sanitizeText(fields.descricao);
            if (!descricao) {
                return { payload: null, error: normalizeError('Informe a descrição do card.', 'VALIDATION_ERROR') };
            }
            payload.descricao = descricao;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'link')) {
            const { value, error } = normalizeHttpUrl(fields.link, 'o link do card');
            if (error) return { payload: null, error };
            payload.link = value;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'imagemUrl')) {
            const { value, error } = normalizeHttpUrl(fields.imagemUrl, 'a foto do card');
            if (error) return { payload: null, error };
            payload.imagem_url = value;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'ordem')) {
            const raw = sanitizeText(fields.ordem);
            if (!raw) {
                payload.ordem = 100;
            } else {
                const parsed = Number(raw);
                if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
                    return { payload: null, error: normalizeError('Ordem inválida. Use número inteiro maior ou igual a zero.', 'VALIDATION_ERROR') };
                }
                payload.ordem = parsed;
            }
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'ativo')) {
            payload.ativo = Boolean(fields.ativo);
        }

        if (!partial) {
            const requiredFields = ['area', 'nome', 'descricao', 'link', 'imagem_url'];
            for (const key of requiredFields) {
                if (!payload[key]) {
                    return { payload: null, error: normalizeError(`Campo obrigatório: ${key}.`, 'VALIDATION_ERROR') };
                }
            }
            if (!Object.prototype.hasOwnProperty.call(payload, 'ordem')) {
                payload.ordem = 100;
            }
        }

        return { payload, error: null };
    }

    async function listarDirecionadores({ area = null, apenasAtivos = false } = {}) {
        let query = client
            .from('catalog_direcionadores')
            .select('*')
            .order('area', { ascending: true })
            .order('ordem', { ascending: true })
            .order('nome', { ascending: true });

        if (sanitizeText(area)) {
            const { value, error } = normalizeDirecionadorArea(area);
            if (error) {
                return { data: null, error };
            }
            query = query.eq('area', value);
        }

        if (apenasAtivos) {
            query = query.eq('ativo', true);
        }

        const { data, error } = await query;
        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_DIRECIONADOR_LIST_ERROR', error),
            };
        }

        return { data: data || [], error: null };
    }

    async function criarDirecionador(fields = {}) {
        const { payload, error: payloadError } = normalizeDirecionadorPayload(fields, { partial: false });
        if (payloadError) {
            return { data: null, error: payloadError };
        }

        const { data, error } = await client
            .from('catalog_direcionadores')
            .insert([payload])
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_DIRECIONADOR_CREATE_ERROR', error),
            };
        }

        return { data, error: null };
    }

    async function atualizarDirecionador(id, fields = {}) {
        const { payload, error: payloadError } = normalizeDirecionadorPayload(fields, { partial: true });
        if (payloadError) {
            return { data: null, error: payloadError };
        }

        if (!Object.keys(payload).length) {
            return { data: null, error: normalizeError('Nenhuma alteração foi informada.', 'VALIDATION_ERROR') };
        }

        const { data, error } = await client
            .from('catalog_direcionadores')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_DIRECIONADOR_UPDATE_ERROR', error),
            };
        }

        return { data, error: null };
    }

    async function removerDirecionador(id) {
        const { error } = await client
            .from('catalog_direcionadores')
            .delete()
            .eq('id', id);

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_DIRECIONADOR_DELETE_ERROR', error),
            };
        }

        return { data: { id }, error: null };
    }

    const DOCUMENTOS_BUCKET = 'documentacao';
    const DOCUMENTO_CATEGORIAS = new Set(['TERMO_RESPONSABILIDADE', 'TUTORIAL_TI', 'TERMO_ASSINADO', 'GERAL']);
    const MAX_DOCUMENTO_BYTES = 20 * 1024 * 1024;

    function normalizeDocumentoCategoria(value) {
        const categoria = sanitizeText(value).toUpperCase();
        if (!DOCUMENTO_CATEGORIAS.has(categoria)) {
            return { value: null, error: normalizeError('Categoria inválida para o documento.', 'VALIDATION_ERROR') };
        }
        return { value: categoria, error: null };
    }

    function normalizeDocumentoPayload(fields = {}, { partial = false } = {}) {
        const payload = {};

        if (Object.prototype.hasOwnProperty.call(fields, 'categoria')) {
            const { value, error } = normalizeDocumentoCategoria(fields.categoria);
            if (error) return { payload: null, error };
            payload.categoria = value;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'titulo')) {
            const titulo = sanitizeText(fields.titulo);
            if (!titulo) {
                return { payload: null, error: normalizeError('Informe o título do documento.', 'VALIDATION_ERROR') };
            }
            payload.titulo = titulo;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'descricao')) {
            payload.descricao = sanitizeText(fields.descricao) || null;
        }

        if (!partial) {
            if (!payload.categoria) {
                return { payload: null, error: normalizeError('Selecione a categoria do documento.', 'VALIDATION_ERROR') };
            }
            if (!payload.titulo) {
                return { payload: null, error: normalizeError('Informe o título do documento.', 'VALIDATION_ERROR') };
            }
        }

        return { payload, error: null };
    }

    function isFileLike(file) {
        return Boolean(
            file
            && typeof file === 'object'
            && typeof file.name === 'string'
            && Number.isFinite(file.size)
        );
    }

    function sanitizeStorageFileName(fileName) {
        const normalized = String(fileName || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(-120);

        return normalized || 'arquivo';
    }

    function buildDocumentoStoragePath(fileName) {
        const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
        const random = Math.random().toString(36).slice(2, 10);
        const safeName = sanitizeStorageFileName(fileName);
        return `${stamp}_${random}_${safeName}`;
    }

    function normalizeDocumentoFile(file, { required = true } = {}) {
        if (!isFileLike(file)) {
            if (required) {
                return { file: null, error: normalizeError('Selecione um arquivo para o documento.', 'VALIDATION_ERROR') };
            }
            return { file: null, error: null };
        }

        if (file.size <= 0) {
            return { file: null, error: normalizeError('Arquivo inválido ou vazio.', 'VALIDATION_ERROR') };
        }

        if (file.size > MAX_DOCUMENTO_BYTES) {
            return { file: null, error: normalizeError('Arquivo acima de 20 MB. Reduza o tamanho antes de enviar.', 'VALIDATION_ERROR') };
        }

        return { file, error: null };
    }

    async function listarDocumentos({ search = '', categoria = '' } = {}) {
        let query = client
            .from('catalog_documentacao')
            .select('*')
            .order('criado_em', { ascending: false });

        if (sanitizeText(categoria)) {
            const { value, error } = normalizeDocumentoCategoria(categoria);
            if (error) {
                return { data: null, error };
            }
            query = query.eq('categoria', value);
        }

        const term = sanitizeSearchTerm(search);
        if (term) {
            query = query.or(`titulo.ilike.%${term}%,descricao.ilike.%${term}%,arquivo_nome.ilike.%${term}%,categoria.ilike.%${term}%`);
        }

        const { data, error } = await query;
        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_DOCUMENTO_LIST_ERROR', error),
            };
        }

        return { data: data || [], error: null };
    }

    async function criarDocumento(fields = {}) {
        const { payload, error: payloadError } = normalizeDocumentoPayload(fields, { partial: false });
        if (payloadError) {
            return { data: null, error: payloadError };
        }

        const { file, error: fileError } = normalizeDocumentoFile(fields.file, { required: true });
        if (fileError) {
            return { data: null, error: fileError };
        }

        const arquivoPath = buildDocumentoStoragePath(file.name);
        const { error: uploadError } = await client
            .storage
            .from(DOCUMENTOS_BUCKET)
            .upload(arquivoPath, file, {
                upsert: false,
                contentType: file.type || 'application/octet-stream',
            });

        if (uploadError) {
            return {
                data: null,
                error: normalizeError(uploadError.message, uploadError.statusCode || 'STORAGE_UPLOAD_ERROR', uploadError),
            };
        }

        const insertPayload = {
            ...payload,
            arquivo_nome: file.name,
            arquivo_path: arquivoPath,
            arquivo_mime_type: file.type || 'application/octet-stream',
            arquivo_tamanho_bytes: Number(file.size) || 0,
        };

        const { data, error } = await client
            .from('catalog_documentacao')
            .insert([insertPayload])
            .select()
            .single();

        if (error) {
            await client.storage.from(DOCUMENTOS_BUCKET).remove([arquivoPath]);
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_DOCUMENTO_CREATE_ERROR', error),
            };
        }

        return { data, error: null };
    }

    async function atualizarDocumento(id, fields = {}) {
        const numericId = Number(id);
        if (!Number.isFinite(numericId) || numericId <= 0) {
            return { data: null, error: normalizeError('Documento inválido para atualização.', 'VALIDATION_ERROR') };
        }

        const { data: currentRow, error: currentError } = await client
            .from('catalog_documentacao')
            .select('*')
            .eq('id', numericId)
            .single();

        if (currentError || !currentRow) {
            return {
                data: null,
                error: normalizeError(currentError?.message || 'Documento não encontrado.', currentError?.code || 'DB_DOCUMENTO_NOT_FOUND', currentError),
            };
        }

        const { payload, error: payloadError } = normalizeDocumentoPayload(fields, { partial: true });
        if (payloadError) {
            return { data: null, error: payloadError };
        }

        let uploadedPath = null;
        let previousPathToDelete = null;

        const { file, error: fileError } = normalizeDocumentoFile(fields.file, { required: false });
        if (fileError) {
            return { data: null, error: fileError };
        }

        if (file) {
            uploadedPath = buildDocumentoStoragePath(file.name);
            const { error: uploadError } = await client
                .storage
                .from(DOCUMENTOS_BUCKET)
                .upload(uploadedPath, file, {
                    upsert: false,
                    contentType: file.type || 'application/octet-stream',
                });

            if (uploadError) {
                return {
                    data: null,
                    error: normalizeError(uploadError.message, uploadError.statusCode || 'STORAGE_UPLOAD_ERROR', uploadError),
                };
            }

            payload.arquivo_nome = file.name;
            payload.arquivo_path = uploadedPath;
            payload.arquivo_mime_type = file.type || 'application/octet-stream';
            payload.arquivo_tamanho_bytes = Number(file.size) || 0;
            previousPathToDelete = sanitizeText(currentRow.arquivo_path) || null;
        }

        if (!Object.keys(payload).length) {
            if (uploadedPath) {
                await client.storage.from(DOCUMENTOS_BUCKET).remove([uploadedPath]);
            }
            return { data: null, error: normalizeError('Nenhuma alteração foi informada.', 'VALIDATION_ERROR') };
        }

        const { data, error } = await client
            .from('catalog_documentacao')
            .update(payload)
            .eq('id', numericId)
            .select()
            .single();

        if (error) {
            if (uploadedPath) {
                await client.storage.from(DOCUMENTOS_BUCKET).remove([uploadedPath]);
            }
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_DOCUMENTO_UPDATE_ERROR', error),
            };
        }

        if (previousPathToDelete && previousPathToDelete !== uploadedPath) {
            await client.storage.from(DOCUMENTOS_BUCKET).remove([previousPathToDelete]);
        }

        return { data, error: null };
    }

    async function removerDocumento(id) {
        const numericId = Number(id);
        if (!Number.isFinite(numericId) || numericId <= 0) {
            return { data: null, error: normalizeError('Documento inválido para exclusão.', 'VALIDATION_ERROR') };
        }

        const { data: row, error: rowError } = await client
            .from('catalog_documentacao')
            .select('id, arquivo_path')
            .eq('id', numericId)
            .single();

        if (rowError || !row) {
            return {
                data: null,
                error: normalizeError(rowError?.message || 'Documento não encontrado.', rowError?.code || 'DB_DOCUMENTO_NOT_FOUND', rowError),
            };
        }

        const { error } = await client
            .from('catalog_documentacao')
            .delete()
            .eq('id', numericId);

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_DOCUMENTO_DELETE_ERROR', error),
            };
        }

        let warning = null;
        const arquivoPath = sanitizeText(row.arquivo_path);
        if (arquivoPath) {
            const { error: storageError } = await client
                .storage
                .from(DOCUMENTOS_BUCKET)
                .remove([arquivoPath]);

            if (storageError) {
                warning = normalizeError(storageError.message, storageError.statusCode || 'STORAGE_DELETE_WARNING', storageError);
            }
        }

        return { data: { id: numericId, warning }, error: null };
    }

    async function gerarUrlDocumento(path, { download = false, expiresIn = 3600 } = {}) {
        const arquivoPath = sanitizeText(path);
        if (!arquivoPath) {
            return { data: null, error: normalizeError('Arquivo não encontrado para visualização.', 'VALIDATION_ERROR') };
        }

        const ttl = Number.isFinite(expiresIn) && expiresIn > 0 ? Number(expiresIn) : 3600;
        const options = download ? { download: true } : undefined;
        const { data, error } = await client
            .storage
            .from(DOCUMENTOS_BUCKET)
            .createSignedUrl(arquivoPath, ttl, options);

        if (error || !data?.signedUrl) {
            return {
                data: null,
                error: normalizeError(error?.message || 'Não foi possível gerar URL assinada do documento.', error?.statusCode || 'STORAGE_SIGNED_URL_ERROR', error),
            };
        }

        return { data: { signedUrl: data.signedUrl }, error: null };
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
        colaboradores: {
            listar: listarColaboradores,
            criar: criarColaborador,
            atualizar: atualizarColaborador,
            remover: removerColaborador,
        },
        admin: {
            listUsers,
            inviteUser,
            updateUserProfile,
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
            listarDirecionadores,
            criarDirecionador,
            atualizarDirecionador,
            removerDirecionador,
            getCatalogSnapshot,
            invalidateCatalogCache,
        },
        documentacao: {
            listar: listarDocumentos,
            criar: criarDocumento,
            atualizar: atualizarDocumento,
            remover: removerDocumento,
            gerarUrl: gerarUrlDocumento,
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
    window.dbGetCatalogSnapshot = getCatalogSnapshot;

    window.parseDateBR = parseDateBR;
    window.formatDateBR = formatDateBR;
    window.formatDateTimeBR = formatDateTimeBR;
})();
