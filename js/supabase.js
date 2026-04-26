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

    const APP_IMAGES_BUCKET = 'app-imagens';
    const MAX_CARD_IMAGE_BYTES = 5 * 1024 * 1024;
    const MAX_AVATAR_IMAGE_BYTES = 3 * 1024 * 1024;
    const ALLOWED_IMAGE_MIME_TYPES = new Set([
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/webp',
        'image/gif',
        'image/svg+xml',
    ]);

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

    function isHttpUrl(value) {
        return /^https?:\/\//i.test(String(value || '').trim());
    }

    function isStoragePath(value) {
        const raw = String(value || '').trim();
        if (!raw) return false;
        if (isHttpUrl(raw)) return false;
        if (raw.startsWith('data:')) return false;
        if (raw.startsWith('blob:')) return false;
        return true;
    }

    function isFileUploadLike(file) {
        return Boolean(
            file
            && typeof file === 'object'
            && typeof file.name === 'string'
            && Number.isFinite(file.size),
        );
    }

    function sanitizeAssetStorageFileName(fileName) {
        const normalized = String(fileName || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(-120);

        return normalized || 'arquivo';
    }

    function buildAppImagePath(folder, fileName) {
        const safeFolder = String(folder || 'misc').replace(/[^a-zA-Z0-9/_-]/g, '').replace(/^\/+|\/+$/g, '') || 'misc';
        const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
        const random = Math.random().toString(36).slice(2, 10);
        const safeName = sanitizeAssetStorageFileName(fileName);
        return `${safeFolder}/${stamp}_${random}_${safeName}`;
    }

    function normalizeImageFile(file, { required = true, maxBytes = MAX_CARD_IMAGE_BYTES, label = 'a imagem' } = {}) {
        if (!isFileUploadLike(file)) {
            if (!required) return { file: null, error: null };
            return { file: null, error: normalizeError(`Selecione ${label}.`, 'VALIDATION_ERROR') };
        }

        if (file.size <= 0) {
            return { file: null, error: normalizeError('Arquivo inválido ou vazio.', 'VALIDATION_ERROR') };
        }

        if (file.size > maxBytes) {
            const mbLimit = Math.floor(maxBytes / (1024 * 1024));
            return { file: null, error: normalizeError(`Arquivo acima de ${mbLimit} MB. Reduza o tamanho e tente novamente.`, 'VALIDATION_ERROR') };
        }

        const mime = String(file.type || '').toLowerCase();
        if (mime && !ALLOWED_IMAGE_MIME_TYPES.has(mime)) {
            return { file: null, error: normalizeError('Formato de imagem inválido. Use PNG, JPG, WEBP, GIF ou SVG.', 'VALIDATION_ERROR') };
        }

        return { file, error: null };
    }

    function getPublicStorageUrl(bucket, path) {
        if (!bucket || !path) return '';
        const { data } = client.storage.from(bucket).getPublicUrl(path);
        return String(data?.publicUrl || '').trim();
    }

    function getStoragePublicPrefix(bucket) {
        const baseUrl = String(config.supabaseUrl || '').replace(/\/+$/, '');
        return `${baseUrl}/storage/v1/object/public/${bucket}/`;
    }

    function extractStoragePathFromPublicUrl(url, bucket = APP_IMAGES_BUCKET) {
        const rawUrl = String(url || '').trim();
        const prefix = getStoragePublicPrefix(bucket);
        if (!rawUrl || !prefix || !rawUrl.startsWith(prefix)) {
            return '';
        }

        const encodedPath = rawUrl.slice(prefix.length);
        if (!encodedPath) return '';
        return encodedPath
            .split('/')
            .map((segment) => {
                try {
                    return decodeURIComponent(segment);
                } catch {
                    return segment;
                }
            })
            .join('/');
    }

    function resolveStoredImageValue(rawValue, bucket = APP_IMAGES_BUCKET) {
        const raw = String(rawValue || '').trim();
        if (!raw) {
            return { path: '', url: '' };
        }

        if (isStoragePath(raw)) {
            return {
                path: raw,
                url: getPublicStorageUrl(bucket, raw),
            };
        }

        const pathFromPublicUrl = extractStoragePathFromPublicUrl(raw, bucket);
        if (pathFromPublicUrl) {
            return {
                path: pathFromPublicUrl,
                url: raw,
            };
        }

        return { path: '', url: '' };
    }

    async function uploadAppImage(file, { folder = 'misc', maxBytes = MAX_CARD_IMAGE_BYTES, label = 'a imagem' } = {}) {
        const { file: normalizedFile, error: fileError } = normalizeImageFile(file, {
            required: true,
            maxBytes,
            label,
        });
        if (fileError) {
            return { data: null, error: fileError };
        }

        const storagePath = buildAppImagePath(folder, normalizedFile.name);
        const { error: uploadError } = await client
            .storage
            .from(APP_IMAGES_BUCKET)
            .upload(storagePath, normalizedFile, {
                upsert: false,
                contentType: normalizedFile.type || 'application/octet-stream',
            });

        if (uploadError) {
            return {
                data: null,
                error: normalizeError(uploadError.message, uploadError.statusCode || 'STORAGE_UPLOAD_ERROR', uploadError),
            };
        }

        return {
            data: {
                path: storagePath,
                url: getPublicStorageUrl(APP_IMAGES_BUCKET, storagePath),
            },
            error: null,
        };
    }

    async function removeAppImage(path) {
        const storagePath = String(path || '').trim();
        if (!isStoragePath(storagePath)) {
            return { data: null, error: null };
        }

        const { error } = await client.storage.from(APP_IMAGES_BUCKET).remove([storagePath]);
        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.statusCode || 'STORAGE_REMOVE_ERROR', error),
            };
        }

        return { data: { path: storagePath }, error: null };
    }

    async function uploadDirecionadorImagem(file) {
        return uploadAppImage(file, {
            folder: 'cards',
            maxBytes: MAX_CARD_IMAGE_BYTES,
            label: 'a imagem do card',
        });
    }

    async function removerDirecionadorImagem(path) {
        return removeAppImage(path);
    }

    async function uploadUserAvatar(file) {
        return uploadAppImage(file, {
            folder: 'avatars',
            maxBytes: MAX_AVATAR_IMAGE_BYTES,
            label: 'a foto de perfil',
        });
    }

    async function removeUserAvatar(path) {
        return removeAppImage(path);
    }

    async function uploadOwnAvatar(file) {
        const { data: userData, error: userError } = await client.auth.getUser();
        if (userError || !userData?.user?.id) {
            return {
                data: null,
                error: normalizeError('Sessão inválida. Faça login novamente.', 'NO_SESSION', userError),
            };
        }

        return uploadAppImage(file, {
            folder: `avatars/${userData.user.id}`,
            maxBytes: MAX_AVATAR_IMAGE_BYTES,
            label: 'a foto de perfil',
        });
    }

    async function removeOwnAvatar(path) {
        return removeAppImage(path);
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

    async function inviteUser({ name, email, password, type, setor, cargo, avatarPath = '', avatarUrl = '' }) {
        return invokeFunction('invite-user', {
            action: 'invite',
            name,
            email,
            password,
            type,
            setor,
            cargo,
            avatarPath,
            avatarUrl,
        }, { requiresAuth: true });
    }

    async function updateUserProfile({
        targetUserId,
        name,
        email,
        type,
        setor,
        cargo,
        avatarPath = '',
        avatarUrl = '',
        removeAvatar = false,
    }) {
        return invokeFunction('invite-user', {
            action: 'update-profile',
            targetUserId,
            name,
            email,
            type,
            setor,
            cargo,
            avatarPath,
            avatarUrl,
            removeAvatar,
        }, { requiresAuth: true });
    }

    async function updateOwnAvatar({
        avatarPath = '',
        avatarUrl = '',
        removeAvatar = false,
    } = {}) {
        return invokeFunction('invite-user', {
            action: 'update-own-avatar',
            avatarPath,
            avatarUrl,
            removeAvatar,
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

    const DASHBOARD_REPORT_ORIGIN_DIMENSIONS = Object.freeze({
        colaboradores: new Set(['status', 'uf', 'setor', 'funcao', 'empresa', 'loja']),
        filiais: new Set(['status', 'uf', 'cidade', 'bairro', 'codigo']),
        linhas: new Set(['tipo', 'loja', 'dpto', 'cargo', 'ddd']),
        documentacao: new Set(['categoria', 'tipo', 'localizacao', 'extensao']),
        direcionadores: new Set(['area', 'status']),
        usuarios: new Set(['status', 'tipo', 'setor', 'cargo']),
    });

    const DASHBOARD_REPORT_VISUAL_OPTIONS = new Set(['bar', 'line', 'doughnut', 'polarArea']);

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

    async function listarFiliais({ apenasAtivos = false } = {}) {
        let query = client
            .from('filiais')
            .select('*')
            .order('codigo', { ascending: true, nullsFirst: false })
            .order('nome', { ascending: true });

        if (apenasAtivos) {
            query = query.eq('ativo', true);
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

    function normalizeLinhaTipo(value) {
        const normalized = sanitizeText(value).toLowerCase();
        if (normalized === 'simcard') return 'simCard';
        if (normalized === 'e-sim' || normalized === 'esim') return 'E-SIM';
        return null;
    }

    function normalizeLinhaPayload(fields = {}, { partial = false } = {}) {
        const payload = {};

        const requiredTextFields = ['loja', 'usuario', 'dpto', 'cargo', 'linha'];
        requiredTextFields.forEach((field) => {
            if (!Object.prototype.hasOwnProperty.call(fields, field)) return;
            const value = sanitizeText(fields[field]);
            if (!value) {
                payload[field] = null;
                return;
            }
            payload[field] = value;
        });

        if (Object.prototype.hasOwnProperty.call(fields, 'ddd')) {
            const ddd = sanitizeText(fields.ddd).replace(/\D+/g, '');
            if (!/^\d{2}$/.test(ddd)) {
                return { payload: null, error: normalizeError('DDD inválido. Use 2 dígitos.', 'VALIDATION_ERROR') };
            }
            payload.ddd = ddd;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'linha')) {
            const linha = sanitizeText(fields.linha);
            const digits = linha.replace(/\D+/g, '');
            if (!/^\d{8,}$/.test(digits)) {
                return { payload: null, error: normalizeError('Linha inválida. Informe apenas números.', 'VALIDATION_ERROR') };
            }
            payload.linha = linha;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'tipo')) {
            const tipo = normalizeLinhaTipo(fields.tipo);
            if (!tipo) {
                return { payload: null, error: normalizeError('Tipo inválido. Use simCard ou E-SIM.', 'VALIDATION_ERROR') };
            }
            payload.tipo = tipo;
        }

        if (!partial) {
            const required = ['loja', 'usuario', 'dpto', 'cargo', 'ddd', 'linha', 'tipo'];
            for (const field of required) {
                if (!payload[field]) {
                    return { payload: null, error: normalizeError(`Campo obrigatório: ${field}.`, 'VALIDATION_ERROR') };
                }
            }
        }

        return { payload, error: null };
    }

    async function listarLinhas({ search = '' } = {}) {
        let query = client
            .from('catalog_linhas')
            .select('*')
            .order('loja', { ascending: true })
            .order('usuario', { ascending: true })
            .order('linha', { ascending: true });

        const term = sanitizeSearchTerm(search);
        if (term) {
            query = query.or(`loja.ilike.%${term}%,usuario.ilike.%${term}%,dpto.ilike.%${term}%,cargo.ilike.%${term}%,ddd.ilike.%${term}%,linha.ilike.%${term}%,tipo.ilike.%${term}%`);
        }

        const { data, error } = await query;
        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_LINHAS_LIST_ERROR', error),
            };
        }

        return { data: data || [], error: null };
    }

    async function criarLinha(fields = {}) {
        const { payload, error: payloadError } = normalizeLinhaPayload(fields, { partial: false });
        if (payloadError) {
            return { data: null, error: payloadError };
        }

        const { data, error } = await client
            .from('catalog_linhas')
            .insert([payload])
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_LINHAS_CREATE_ERROR', error),
            };
        }

        return { data, error: null };
    }

    async function atualizarLinha(id, fields = {}) {
        const { payload, error: payloadError } = normalizeLinhaPayload(fields, { partial: true });
        if (payloadError) {
            return { data: null, error: payloadError };
        }

        if (!Object.keys(payload).length) {
            return { data: null, error: normalizeError('Nenhuma alteração foi informada.', 'VALIDATION_ERROR') };
        }

        const { data, error } = await client
            .from('catalog_linhas')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_LINHAS_UPDATE_ERROR', error),
            };
        }

        return { data, error: null };
    }

    async function removerLinha(id) {
        const { error } = await client
            .from('catalog_linhas')
            .delete()
            .eq('id', id);

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_LINHAS_DELETE_ERROR', error),
            };
        }

        return { data: { id }, error: null };
    }

    function normalizeDashboardReportOrigin(value) {
        const normalized = sanitizeText(value).toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(DASHBOARD_REPORT_ORIGIN_DIMENSIONS, normalized)) {
            return { value: null, error: normalizeError('Origem de dados invalida para relatorio.', 'VALIDATION_ERROR') };
        }
        return { value: normalized, error: null };
    }

    function normalizeDashboardReportVisual(value) {
        const normalized = sanitizeText(value);
        if (!DASHBOARD_REPORT_VISUAL_OPTIONS.has(normalized)) {
            return { value: null, error: normalizeError('Visualizacao invalida para relatorio.', 'VALIDATION_ERROR') };
        }
        return { value: normalized, error: null };
    }

    function isDashboardDimensionValid(origin, dimension) {
        const normalizedOrigin = sanitizeText(origin).toLowerCase();
        const normalizedDimension = sanitizeText(dimension).toLowerCase();
        const allowed = DASHBOARD_REPORT_ORIGIN_DIMENSIONS[normalizedOrigin];
        return Boolean(allowed && allowed.has(normalizedDimension));
    }

    function normalizeDashboardReportPayload(fields = {}, { partial = false } = {}) {
        const payload = {};

        if (Object.prototype.hasOwnProperty.call(fields, 'nome')) {
            const nome = sanitizeText(fields.nome);
            if (!nome) {
                return { payload: null, error: normalizeError('Informe o nome do relatorio.', 'VALIDATION_ERROR') };
            }
            payload.nome = nome;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'descricao')) {
            payload.descricao = sanitizeText(fields.descricao) || null;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'origem')) {
            const { value, error } = normalizeDashboardReportOrigin(fields.origem);
            if (error) return { payload: null, error };
            payload.origem = value;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'dimensao')) {
            const dimensao = sanitizeText(fields.dimensao).toLowerCase();
            if (!dimensao) {
                return { payload: null, error: normalizeError('Selecione a dimensao do relatorio.', 'VALIDATION_ERROR') };
            }
            payload.dimensao = dimensao;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'visualizacao')) {
            const { value, error } = normalizeDashboardReportVisual(fields.visualizacao);
            if (error) return { payload: null, error };
            payload.visualizacao = value;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'limite')) {
            const parsed = Number(sanitizeText(fields.limite));
            if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 3 || parsed > 20) {
                return { payload: null, error: normalizeError('Limite invalido. Use inteiro entre 3 e 20.', 'VALIDATION_ERROR') };
            }
            payload.limite = parsed;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'ordem')) {
            const parsed = Number(sanitizeText(fields.ordem));
            if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
                return { payload: null, error: normalizeError('Ordem invalida. Use inteiro maior ou igual a zero.', 'VALIDATION_ERROR') };
            }
            payload.ordem = parsed;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'ativo')) {
            payload.ativo = Boolean(fields.ativo);
        }

        if (!partial) {
            const requiredFields = ['nome', 'origem', 'dimensao', 'visualizacao'];
            for (const key of requiredFields) {
                if (!payload[key]) {
                    return { payload: null, error: normalizeError(`Campo obrigatorio: ${key}.`, 'VALIDATION_ERROR') };
                }
            }

            if (!Object.prototype.hasOwnProperty.call(payload, 'limite')) {
                payload.limite = 8;
            }
            if (!Object.prototype.hasOwnProperty.call(payload, 'ordem')) {
                payload.ordem = 100;
            }
            if (!Object.prototype.hasOwnProperty.call(payload, 'ativo')) {
                payload.ativo = true;
            }
        }

        return { payload, error: null };
    }

    async function listarDashboardRelatorios({ apenasAtivos = false } = {}) {
        let query = client
            .from('catalog_dashboard_relatorios')
            .select('*')
            .order('ordem', { ascending: true })
            .order('nome', { ascending: true });

        if (apenasAtivos) {
            query = query.eq('ativo', true);
        }

        const { data, error } = await query;
        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_DASH_REPORT_LIST_ERROR', error),
            };
        }

        return { data: data || [], error: null };
    }

    async function criarDashboardRelatorio(fields = {}) {
        const { payload, error: payloadError } = normalizeDashboardReportPayload(fields, { partial: false });
        if (payloadError) {
            return { data: null, error: payloadError };
        }

        if (!isDashboardDimensionValid(payload.origem, payload.dimensao)) {
            return {
                data: null,
                error: normalizeError('Dimensao invalida para a origem selecionada.', 'VALIDATION_ERROR'),
            };
        }

        const { data, error } = await client
            .from('catalog_dashboard_relatorios')
            .insert([payload])
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_DASH_REPORT_CREATE_ERROR', error),
            };
        }

        return { data, error: null };
    }

    async function atualizarDashboardRelatorio(id, fields = {}) {
        const reportId = Number(id);
        if (!Number.isFinite(reportId) || reportId <= 0) {
            return { data: null, error: normalizeError('Relatorio invalido para atualizacao.', 'VALIDATION_ERROR') };
        }

        const { payload, error: payloadError } = normalizeDashboardReportPayload(fields, { partial: true });
        if (payloadError) {
            return { data: null, error: payloadError };
        }

        if (!Object.keys(payload).length) {
            return { data: null, error: normalizeError('Nenhuma alteracao foi informada.', 'VALIDATION_ERROR') };
        }

        const { data: current, error: currentError } = await client
            .from('catalog_dashboard_relatorios')
            .select('id,origem,dimensao')
            .eq('id', reportId)
            .single();

        if (currentError || !current) {
            return {
                data: null,
                error: normalizeError(currentError?.message || 'Relatorio nao encontrado.', currentError?.code || 'DB_DASH_REPORT_NOT_FOUND', currentError),
            };
        }

        const nextOrigin = payload.origem || current.origem;
        const nextDimension = payload.dimensao || current.dimensao;
        if (!isDashboardDimensionValid(nextOrigin, nextDimension)) {
            return {
                data: null,
                error: normalizeError('Dimensao invalida para a origem selecionada.', 'VALIDATION_ERROR'),
            };
        }

        const { data, error } = await client
            .from('catalog_dashboard_relatorios')
            .update(payload)
            .eq('id', reportId)
            .select()
            .single();

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_DASH_REPORT_UPDATE_ERROR', error),
            };
        }

        return { data, error: null };
    }

    async function removerDashboardRelatorio(id) {
        const reportId = Number(id);
        if (!Number.isFinite(reportId) || reportId <= 0) {
            return { data: null, error: normalizeError('Relatorio invalido para exclusao.', 'VALIDATION_ERROR') };
        }

        const { error } = await client
            .from('catalog_dashboard_relatorios')
            .delete()
            .eq('id', reportId);

        if (error) {
            return {
                data: null,
                error: normalizeError(error.message, error.code || 'DB_DASH_REPORT_DELETE_ERROR', error),
            };
        }

        return { data: { id: reportId }, error: null };
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

        if (Object.prototype.hasOwnProperty.call(fields, 'imagemPath')) {
            const imagePath = sanitizeText(fields.imagemPath);
            if (!imagePath || !isStoragePath(imagePath)) {
                return { payload: null, error: normalizeError('Imagem do card inválida. Envie um arquivo de imagem.', 'VALIDATION_ERROR') };
            }
            payload.imagem_url = imagePath;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'imagemUrl') && !Object.prototype.hasOwnProperty.call(fields, 'imagemPath')) {
            const imageUrl = sanitizeText(fields.imagemUrl);
            if (!imageUrl) {
                return { payload: null, error: normalizeError('Envie a imagem do card.', 'VALIDATION_ERROR') };
            }
            const pathFromPublicUrl = extractStoragePathFromPublicUrl(imageUrl, APP_IMAGES_BUCKET);
            if (!pathFromPublicUrl) {
                return {
                    payload: null,
                    error: normalizeError('Imagem inválida. Envie um arquivo para armazenar no sistema.', 'VALIDATION_ERROR'),
                };
            }
            payload.imagem_url = pathFromPublicUrl;
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

        const normalized = (data || []).map((item) => {
            const image = resolveStoredImageValue(item.imagem_url, APP_IMAGES_BUCKET);
            return {
                ...item,
                imagem_path: image.path || (isStoragePath(item.imagem_url) ? String(item.imagem_url) : ''),
                imagem_url: image.url || '',
            };
        });

        return { data: normalized, error: null };
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
    const DOCUMENTO_TIPOS = new Set(['DOCUMENTO', 'PASTA']);
    const MAX_DOCUMENTO_BYTES = 20 * 1024 * 1024;

    function normalizeDocumentoCategoria(value) {
        const categoria = sanitizeText(value).toUpperCase();
        if (!DOCUMENTO_CATEGORIAS.has(categoria)) {
            return { value: null, error: normalizeError('Categoria inválida para o documento.', 'VALIDATION_ERROR') };
        }
        return { value: categoria, error: null };
    }

    function normalizeDocumentoTipo(value) {
        const tipo = sanitizeText(value).toUpperCase();
        if (!DOCUMENTO_TIPOS.has(tipo)) {
            return { value: null, error: normalizeError('Tipo inválido. Use DOCUMENTO ou PASTA.', 'VALIDATION_ERROR') };
        }
        return { value: tipo, error: null };
    }

    function normalizeDocumentoPayload(fields = {}, { partial = false } = {}) {
        const payload = {};

        if (Object.prototype.hasOwnProperty.call(fields, 'tipo')) {
            const { value, error } = normalizeDocumentoTipo(fields.tipo);
            if (error) return { payload: null, error };
            payload.tipo = value;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'parentId')) {
            const rawParent = sanitizeText(fields.parentId);
            if (!rawParent) {
                payload.parent_id = null;
            } else {
                const parentId = Number(rawParent);
                if (!Number.isFinite(parentId) || parentId <= 0) {
                    return { payload: null, error: normalizeError('Pasta pai inválida.', 'VALIDATION_ERROR') };
                }
                payload.parent_id = parentId;
            }
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'categoria')) {
            const { value, error } = normalizeDocumentoCategoria(fields.categoria);
            if (error) return { payload: null, error };
            payload.categoria = value;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'titulo')) {
            const titulo = sanitizeText(fields.titulo);
            if (!titulo) {
                return { payload: null, error: normalizeError('Informe o título do item.', 'VALIDATION_ERROR') };
            }
            payload.titulo = titulo;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'descricao')) {
            payload.descricao = sanitizeText(fields.descricao) || null;
        }

        if (Object.prototype.hasOwnProperty.call(fields, 'ordem')) {
            const raw = sanitizeText(fields.ordem);
            if (!raw) {
                payload.ordem = 100;
            } else {
                const parsed = Number(raw);
                if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
                    return { payload: null, error: normalizeError('Ordem inválida. Use inteiro maior ou igual a zero.', 'VALIDATION_ERROR') };
                }
                payload.ordem = parsed;
            }
        }

        if (!partial) {
            if (!payload.tipo) {
                payload.tipo = 'DOCUMENTO';
            }

            if (!payload.titulo) {
                return { payload: null, error: normalizeError('Informe o título do item.', 'VALIDATION_ERROR') };
            }

            if (!payload.categoria) {
                payload.categoria = payload.tipo === 'PASTA' ? 'GERAL' : null;
            }

            if (!payload.categoria) {
                return { payload: null, error: normalizeError('Selecione a categoria do documento.', 'VALIDATION_ERROR') };
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

    async function hasDocumentoCycle(recordId, nextParentId) {
        if (!Number.isFinite(nextParentId) || nextParentId <= 0) {
            return { hasCycle: false, error: null };
        }

        const { data, error } = await client
            .from('catalog_documentacao')
            .select('id,parent_id');

        if (error) {
            return {
                hasCycle: false,
                error: normalizeError(error.message, error.code || 'DB_DOCUMENTO_CYCLE_CHECK_ERROR', error),
            };
        }

        const parentById = new Map((data || []).map((item) => [Number(item.id), item.parent_id ? Number(item.parent_id) : null]));
        const visited = new Set([Number(recordId)]);
        let cursor = Number(nextParentId);

        while (Number.isFinite(cursor) && cursor > 0) {
            if (visited.has(cursor)) {
                return { hasCycle: true, error: null };
            }
            visited.add(cursor);
            cursor = parentById.get(cursor) || null;
        }

        return { hasCycle: false, error: null };
    }

    async function listarDocumentos({ search = '', categoria = '' } = {}) {
        let query = client
            .from('catalog_documentacao')
            .select('*')
            .order('tipo', { ascending: false })
            .order('ordem', { ascending: true })
            .order('titulo', { ascending: true });

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

        const isFolder = payload.tipo === 'PASTA';
        const { file, error: fileError } = normalizeDocumentoFile(fields.file, { required: !isFolder });
        if (fileError) {
            return { data: null, error: fileError };
        }

        let uploadedPath = null;
        if (!isFolder && file) {
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
        }

        const insertPayload = {
            ...payload,
            arquivo_nome: isFolder ? null : file.name,
            arquivo_path: isFolder ? null : uploadedPath,
            arquivo_mime_type: isFolder ? null : (file.type || 'application/octet-stream'),
            arquivo_tamanho_bytes: isFolder ? null : (Number(file.size) || 0),
        };

        const { data, error } = await client
            .from('catalog_documentacao')
            .insert([insertPayload])
            .select()
            .single();

        if (error) {
            if (uploadedPath) {
                await client.storage.from(DOCUMENTOS_BUCKET).remove([uploadedPath]);
            }
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
                error: normalizeError(currentError?.message || 'Item não encontrado.', currentError?.code || 'DB_DOCUMENTO_NOT_FOUND', currentError),
            };
        }

        const { payload, error: payloadError } = normalizeDocumentoPayload(fields, { partial: true });
        if (payloadError) {
            return { data: null, error: payloadError };
        }

        if (Object.prototype.hasOwnProperty.call(payload, 'parent_id')) {
            const nextParentId = payload.parent_id;
            if (Number.isFinite(nextParentId) && nextParentId === numericId) {
                return { data: null, error: normalizeError('A pasta pai não pode ser o próprio item.', 'VALIDATION_ERROR') };
            }

            const { hasCycle, error: cycleError } = await hasDocumentoCycle(numericId, nextParentId);
            if (cycleError) {
                return { data: null, error: cycleError };
            }
            if (hasCycle) {
                return { data: null, error: normalizeError('Movimento inválido: essa pasta geraria ciclo na árvore.', 'VALIDATION_ERROR') };
            }
        }

        const nextTipo = payload.tipo || String(currentRow.tipo || 'DOCUMENTO').toUpperCase();
        const isFolder = nextTipo === 'PASTA';

        if (isFolder && Object.prototype.hasOwnProperty.call(fields, 'file') && isFileLike(fields.file)) {
            return { data: null, error: normalizeError('Pastas não aceitam upload de arquivo.', 'VALIDATION_ERROR') };
        }

        let uploadedPath = null;
        let previousPathToDelete = null;

        const { file, error: fileError } = normalizeDocumentoFile(fields.file, { required: false });
        if (fileError) {
            return { data: null, error: fileError };
        }

        if (!isFolder && file) {
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

        if (isFolder) {
            payload.arquivo_nome = null;
            payload.arquivo_path = null;
            payload.arquivo_mime_type = null;
            payload.arquivo_tamanho_bytes = null;
            previousPathToDelete = sanitizeText(currentRow.arquivo_path) || null;
        }

        if (!isFolder && !file && !sanitizeText(currentRow.arquivo_path)) {
            if (uploadedPath) {
                await client.storage.from(DOCUMENTOS_BUCKET).remove([uploadedPath]);
            }
            return { data: null, error: normalizeError('Documento sem arquivo. Envie um arquivo para continuar.', 'VALIDATION_ERROR') };
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
            return { data: null, error: normalizeError('Item inválido para exclusão.', 'VALIDATION_ERROR') };
        }

        const { data: allRows, error: listError } = await client
            .from('catalog_documentacao')
            .select('id,parent_id,arquivo_path');

        if (listError) {
            return {
                data: null,
                error: normalizeError(listError.message, listError.code || 'DB_DOCUMENTO_LIST_DELETE_ERROR', listError),
            };
        }

        const rows = allRows || [];
        const byParent = new Map();
        rows.forEach((row) => {
            const key = row.parent_id ? Number(row.parent_id) : 0;
            if (!byParent.has(key)) byParent.set(key, []);
            byParent.get(key).push(row);
        });

        const idsToDelete = [];
        const stack = [numericId];
        const visited = new Set();

        while (stack.length) {
            const currentId = stack.pop();
            if (!Number.isFinite(currentId) || visited.has(currentId)) continue;
            visited.add(currentId);
            idsToDelete.push(currentId);

            const children = byParent.get(currentId) || [];
            children.forEach((child) => {
                const childId = Number(child.id);
                if (Number.isFinite(childId)) stack.push(childId);
            });
        }

        if (!idsToDelete.length) {
            return { data: null, error: normalizeError('Item não encontrado para exclusão.', 'DB_DOCUMENTO_NOT_FOUND') };
        }

        const filePathsToDelete = rows
            .filter((row) => idsToDelete.includes(Number(row.id)))
            .map((row) => sanitizeText(row.arquivo_path))
            .filter(Boolean);

        const { error: deleteError } = await client
            .from('catalog_documentacao')
            .delete()
            .in('id', idsToDelete);

        if (deleteError) {
            return {
                data: null,
                error: normalizeError(deleteError.message, deleteError.code || 'DB_DOCUMENTO_DELETE_ERROR', deleteError),
            };
        }

        let warning = null;
        if (filePathsToDelete.length) {
            const { error: storageError } = await client
                .storage
                .from(DOCUMENTOS_BUCKET)
                .remove(filePathsToDelete);

            if (storageError) {
                warning = normalizeError(storageError.message, storageError.statusCode || 'STORAGE_DELETE_WARNING', storageError);
            }
        }

        return { data: { id: numericId, removidos: idsToDelete.length, warning }, error: null };
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
        linhas: {
            listar: listarLinhas,
            criar: criarLinha,
            atualizar: atualizarLinha,
            remover: removerLinha,
        },
        dashboards: {
            listarRelatorios: listarDashboardRelatorios,
            criarRelatorio: criarDashboardRelatorio,
            atualizarRelatorio: atualizarDashboardRelatorio,
            removerRelatorio: removerDashboardRelatorio,
        },
        admin: {
            listUsers,
            inviteUser,
            updateUserProfile,
            deactivateUser,
            reactivateUser,
            changeUserPassword,
            uploadUserAvatar,
            removeUserAvatar,
        },
        profile: {
            uploadAvatar: uploadOwnAvatar,
            removeAvatar: removeOwnAvatar,
            updateOwnAvatar,
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
            uploadDirecionadorImagem,
            removerDirecionadorImagem,
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
