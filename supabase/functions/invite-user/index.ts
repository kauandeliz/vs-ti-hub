/**
 * supabase/functions/invite-user/index.ts
 *
 * Administração de usuários (somente admin):
 * - list
 * - invite
 * - update-profile
 * - deactivate
 * - reactivate
 * - change-password
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Body = Record<string, unknown>;
type UserType = 'adm' | 'comum';

const APP_IMAGES_BUCKET = 'app-imagens';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

function getCorsHeaders(req: Request) {
    const requestOrigin = req.headers.get('origin') || '';
    const allowOrigin = ALLOWED_ORIGINS.length === 0
        ? '*'
        : (ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0]);

    return {
        'Access-Control-Allow-Origin': allowOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        Vary: 'Origin',
    };
}

function jsonResponse(req: Request, status: number, payload: Record<string, unknown>) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...getCorsHeaders(req),
            'Content-Type': 'application/json',
        },
    });
}

function sanitizeText(value: unknown) {
    return String(value || '').trim();
}

function normalizeEmail(value: unknown) {
    return sanitizeText(value).toLowerCase();
}

function isHttpUrl(value: string) {
    return /^https?:\/\//i.test(value);
}

function getPublicImagePrefix() {
    const supabaseUrl = sanitizeText(Deno.env.get('SUPABASE_URL'));
    if (!supabaseUrl) return '';
    return `${supabaseUrl}/storage/v1/object/public/${APP_IMAGES_BUCKET}/`;
}

function normalizeStoragePath(value: unknown) {
    const path = sanitizeText(value);
    if (!path) return '';
    if (isHttpUrl(path) || path.startsWith('data:') || path.startsWith('blob:')) return '';
    return path;
}

function normalizeOptionalHttpUrl(value: unknown) {
    const raw = sanitizeText(value);
    if (!raw) return { value: '', error: null };

    try {
        const parsed = new URL(raw);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return { value: '', error: 'URL da foto inválida. Use http(s).' };
        }
        const normalized = parsed.toString();
        const prefix = getPublicImagePrefix();
        if (prefix && !normalized.startsWith(prefix)) {
            return { value: '', error: 'URL da foto inválida. Use imagem enviada no próprio sistema.' };
        }
        return { value: normalized, error: null };
    } catch {
        return { value: '', error: 'URL da foto inválida. Use http(s).' };
    }
}

function buildPublicImageUrl(path: string) {
    const supabaseUrl = sanitizeText(Deno.env.get('SUPABASE_URL'));
    const cleanPath = sanitizeText(path);
    if (!supabaseUrl || !cleanPath) return '';

    const encodedPath = cleanPath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');

    return `${supabaseUrl}/storage/v1/object/public/${APP_IMAGES_BUCKET}/${encodedPath}`;
}

function normalizeUserType(value: unknown): UserType | null {
    const raw = sanitizeText(value).toLowerCase();

    if (!raw) return null;
    if (['adm', 'admin', 'administrador'].includes(raw)) return 'adm';
    if (['comum', 'operador', 'usuario', 'usuário', 'user'].includes(raw)) return 'comum';

    return null;
}

function userTypeToRole(type: UserType) {
    return type === 'adm' ? 'admin' : 'operador';
}

function inferTypeFromMetadata(metadata: Record<string, unknown> | undefined): UserType {
    const typeFromMetadata = normalizeUserType(metadata?.type);
    if (typeFromMetadata) return typeFromMetadata;

    const role = sanitizeText(metadata?.role).toLowerCase();
    if (role === 'admin') return 'adm';

    return 'comum';
}

function isValidEmail(value: string) {
    return /^\S+@\S+\.\S+$/.test(value);
}

function parseJsonBody(raw: unknown): Body {
    if (!raw || typeof raw !== 'object') return {};
    return raw as Body;
}

function parseProfilePayload(body: Body) {
    const name = sanitizeText(body.name);
    const email = normalizeEmail(body.email);
    const type = normalizeUserType(body.type);
    const setor = sanitizeText(body.setor);
    const cargo = sanitizeText(body.cargo);
    const avatarPath = normalizeStoragePath(body.avatarPath);
    const { value: avatarUrl, error: avatarUrlError } = normalizeOptionalHttpUrl(body.avatarUrl);
    const removeAvatar = Boolean(body.removeAvatar);

    if (!name || name.split(/\s+/).length < 2) {
        return { data: null, error: 'Informe nome e sobrenome.' };
    }

    if (!isValidEmail(email)) {
        return { data: null, error: 'E-mail inválido.' };
    }

    if (!type) {
        return { data: null, error: 'Tipo inválido. Use adm ou comum.' };
    }

    if (!setor) {
        return { data: null, error: 'Setor é obrigatório.' };
    }

    if (!cargo) {
        return { data: null, error: 'Cargo é obrigatório.' };
    }

    if (avatarUrlError) {
        return { data: null, error: avatarUrlError };
    }

    return {
        data: {
            name,
            email,
            type,
            setor,
            cargo,
            avatarPath,
            avatarUrl,
            removeAvatar,
        },
        error: null,
    };
}

function parseInvitePayload(body: Body) {
    const { data: profileData, error: profileError } = parseProfilePayload(body);
    if (profileError || !profileData) {
        return { data: null, error: profileError || 'Payload inválido.' };
    }

    const password = sanitizeText(body.password);
    if (password.length < 8) {
        return { data: null, error: 'A senha deve ter no mínimo 8 caracteres.' };
    }

    return {
        data: {
            ...profileData,
            password,
        },
        error: null,
    };
}

function parseAvatarPayload(body: Body) {
    const avatarPath = normalizeStoragePath(body.avatarPath);
    const { value: avatarUrl, error: avatarUrlError } = normalizeOptionalHttpUrl(body.avatarUrl);
    const removeAvatar = Boolean(body.removeAvatar);

    if (avatarUrlError) {
        return { data: null, error: avatarUrlError };
    }

    return {
        data: {
            avatarPath,
            avatarUrl,
            removeAvatar,
        },
        error: null,
    };
}

async function handleListUsers(req: Request, adminClient: ReturnType<typeof createClient>, body: Body) {
    const page = Number(body.page) > 0 ? Number(body.page) : 1;
    const perPageRaw = Number(body.perPage);
    const perPage = Number.isFinite(perPageRaw) && perPageRaw > 0
        ? Math.min(perPageRaw, 500)
        : 200;

    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
        return jsonResponse(req, 400, { error: error.message });
    }

    const users = (data?.users || []).map((user) => {
        const metadata = (user.user_metadata || {}) as Record<string, unknown>;
        const avatarPath = normalizeStoragePath(metadata?.avatar_path);
        const { value: validatedAvatarUrl } = normalizeOptionalHttpUrl(metadata?.avatar_url);
        const avatarUrl = validatedAvatarUrl || (avatarPath ? buildPublicImageUrl(avatarPath) : '');
        return {
            id: user.id,
            email: user.email,
            user_metadata: {
                ...metadata,
                type: inferTypeFromMetadata(metadata),
                avatar_path: avatarPath || null,
                avatar_url: avatarUrl || null,
            },
            confirmed_at: user.confirmed_at,
            banned_until: user.banned_until,
            created_at: user.created_at,
            last_sign_in_at: user.last_sign_in_at,
        };
    });

    return jsonResponse(req, 200, { users });
}

async function handleInviteUser(
    req: Request,
    adminClient: ReturnType<typeof createClient>,
    body: Body,
    callerId: string,
) {
    const { data, error: payloadError } = parseInvitePayload(body);
    if (payloadError || !data) {
        return jsonResponse(req, 400, { error: payloadError || 'Payload inválido.' });
    }

    const role = userTypeToRole(data.type);
    const avatarPath = data.avatarPath || '';
    const avatarUrl = data.avatarUrl || (avatarPath ? buildPublicImageUrl(avatarPath) : '');

    const { data: created, error } = await adminClient.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: {
            name: data.name,
            role,
            type: data.type,
            setor: data.setor,
            cargo: data.cargo,
            avatar_path: avatarPath || null,
            avatar_url: avatarUrl || null,
            invited_by: callerId,
            invited_at: new Date().toISOString(),
        },
    });

    if (error) {
        const normalized = error.message.toLowerCase();
        if (normalized.includes('already been registered') || normalized.includes('already exists')) {
            return jsonResponse(req, 409, { error: 'Este e-mail já está cadastrado.' });
        }
        return jsonResponse(req, 400, { error: error.message });
    }

    return jsonResponse(req, 200, {
        user: {
            id: created.user?.id,
            email: created.user?.email,
            user_metadata: created.user?.user_metadata,
        },
    });
}

async function handleUpdateUserProfile(
    req: Request,
    adminClient: ReturnType<typeof createClient>,
    body: Body,
    callerId: string,
) {
    const targetUserId = sanitizeText(body.targetUserId);
    if (!targetUserId) {
        return jsonResponse(req, 400, { error: 'targetUserId é obrigatório.' });
    }

    if (targetUserId === callerId) {
        return jsonResponse(req, 400, { error: 'Use o perfil lateral para editar o próprio usuário.' });
    }

    const { data: profileData, error: profileError } = parseProfilePayload(body);
    if (profileError || !profileData) {
        return jsonResponse(req, 400, { error: profileError || 'Payload inválido.' });
    }

    const { data: currentData, error: currentError } = await adminClient.auth.admin.getUserById(targetUserId);
    if (currentError || !currentData.user) {
        return jsonResponse(req, 404, { error: 'Usuário não encontrado.' });
    }

    const existingMetadata = (currentData.user.user_metadata || {}) as Record<string, unknown>;
    const role = userTypeToRole(profileData.type);
    let nextAvatarPath = normalizeStoragePath(existingMetadata.avatar_path);
    let nextAvatarUrl = sanitizeText(existingMetadata.avatar_url);

    if (profileData.removeAvatar) {
        nextAvatarPath = '';
        nextAvatarUrl = '';
    } else {
        if (profileData.avatarPath) {
            nextAvatarPath = profileData.avatarPath;
        }
        if (profileData.avatarUrl) {
            nextAvatarUrl = profileData.avatarUrl;
        }
        if (nextAvatarPath && !nextAvatarUrl) {
            nextAvatarUrl = buildPublicImageUrl(nextAvatarPath);
        }
        if (!nextAvatarPath) {
            nextAvatarUrl = '';
        }
    }

    const { data: updated, error } = await adminClient.auth.admin.updateUserById(targetUserId, {
        email: profileData.email,
        user_metadata: {
            ...existingMetadata,
            name: profileData.name,
            role,
            type: profileData.type,
            setor: profileData.setor,
            cargo: profileData.cargo,
            avatar_path: nextAvatarPath || null,
            avatar_url: nextAvatarUrl || null,
            updated_by: callerId,
            updated_at: new Date().toISOString(),
        },
    });

    if (error) {
        const normalized = error.message.toLowerCase();
        if (normalized.includes('already been registered') || normalized.includes('already exists')) {
            return jsonResponse(req, 409, { error: 'Este e-mail já está cadastrado.' });
        }
        return jsonResponse(req, 400, { error: error.message });
    }

    return jsonResponse(req, 200, {
        user: {
            id: updated.user?.id,
            email: updated.user?.email,
            user_metadata: updated.user?.user_metadata,
        },
    });
}

async function handleUpdateOwnAvatar(
    req: Request,
    adminClient: ReturnType<typeof createClient>,
    body: Body,
    callerId: string,
) {
    const { data: avatarData, error: avatarError } = parseAvatarPayload(body);
    if (avatarError || !avatarData) {
        return jsonResponse(req, 400, { error: avatarError || 'Payload inválido.' });
    }

    const { data: currentData, error: currentError } = await adminClient.auth.admin.getUserById(callerId);
    if (currentError || !currentData.user) {
        return jsonResponse(req, 404, { error: 'Usuário não encontrado.' });
    }

    const existingMetadata = (currentData.user.user_metadata || {}) as Record<string, unknown>;
    let nextAvatarPath = normalizeStoragePath(existingMetadata.avatar_path);
    let nextAvatarUrl = sanitizeText(existingMetadata.avatar_url);

    if (avatarData.removeAvatar) {
        nextAvatarPath = '';
        nextAvatarUrl = '';
    } else {
        if (avatarData.avatarPath) {
            nextAvatarPath = avatarData.avatarPath;
        }
        if (avatarData.avatarUrl) {
            nextAvatarUrl = avatarData.avatarUrl;
        }
        if (nextAvatarPath && !nextAvatarUrl) {
            nextAvatarUrl = buildPublicImageUrl(nextAvatarPath);
        }
        if (!nextAvatarPath) {
            nextAvatarUrl = '';
        }
    }

    const { data: updated, error } = await adminClient.auth.admin.updateUserById(callerId, {
        user_metadata: {
            ...existingMetadata,
            avatar_path: nextAvatarPath || null,
            avatar_url: nextAvatarUrl || null,
            updated_by: callerId,
            updated_at: new Date().toISOString(),
        },
    });

    if (error) {
        return jsonResponse(req, 400, { error: error.message });
    }

    return jsonResponse(req, 200, {
        user: {
            id: updated.user?.id,
            email: updated.user?.email,
            user_metadata: updated.user?.user_metadata,
        },
    });
}

async function handleDeactivateUser(
    req: Request,
    adminClient: ReturnType<typeof createClient>,
    body: Body,
    callerId: string,
) {
    const userId = sanitizeText(body.userId);
    if (!userId) {
        return jsonResponse(req, 400, { error: 'userId é obrigatório.' });
    }

    if (userId === callerId) {
        return jsonResponse(req, 400, { error: 'Você não pode desativar seu próprio usuário.' });
    }

    const { error } = await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: '876000h',
    });

    if (error) {
        return jsonResponse(req, 400, { error: error.message });
    }

    return jsonResponse(req, 200, { success: true });
}

async function handleReactivateUser(req: Request, adminClient: ReturnType<typeof createClient>, body: Body) {
    const userId = sanitizeText(body.userId);
    if (!userId) {
        return jsonResponse(req, 400, { error: 'userId é obrigatório.' });
    }

    const { error } = await adminClient.auth.admin.updateUserById(userId, {
        ban_duration: 'none',
    });

    if (error) {
        return jsonResponse(req, 400, { error: error.message });
    }

    return jsonResponse(req, 200, { success: true });
}

async function handleChangePassword(req: Request, adminClient: ReturnType<typeof createClient>, body: Body) {
    const targetUserId = sanitizeText(body.targetUserId);
    const newPassword = sanitizeText(body.newPassword);

    if (!targetUserId || !newPassword) {
        return jsonResponse(req, 400, { error: 'targetUserId e newPassword são obrigatórios.' });
    }

    if (newPassword.length < 8) {
        return jsonResponse(req, 400, { error: 'A senha deve ter no mínimo 8 caracteres.' });
    }

    const { error } = await adminClient.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
    });

    if (error) {
        return jsonResponse(req, 400, { error: error.message });
    }

    return jsonResponse(req, 200, { success: true });
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: getCorsHeaders(req) });
    }

    if (req.method !== 'POST') {
        return jsonResponse(req, 405, { error: 'Método não permitido.' });
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
        return jsonResponse(req, 401, { error: 'Não autorizado.' });
    }

    try {
        const adminClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false,
                },
            },
        );

        const userClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            {
                global: {
                    headers: { Authorization: authHeader },
                },
            },
        );

        const { data: authData, error: authError } = await userClient.auth.getUser();
        if (authError || !authData.user) {
            return jsonResponse(req, 401, { error: 'Sessão inválida.' });
        }

        const caller = authData.user;
        const body = parseJsonBody(await req.json());
        const action = sanitizeText(body.action);

        if (!action) {
            return jsonResponse(req, 400, { error: 'Ação não informada.' });
        }

        if (action === 'update-own-avatar') {
            return handleUpdateOwnAvatar(req, adminClient, body, caller.id);
        }

        const isCallerAdmin = caller.user_metadata?.role === 'admin';
        if (!isCallerAdmin) {
            return jsonResponse(req, 403, { error: 'Acesso restrito a administradores.' });
        }

        if (action === 'list') {
            return handleListUsers(req, adminClient, body);
        }

        if (action === 'invite') {
            return handleInviteUser(req, adminClient, body, caller.id);
        }

        if (action === 'update-profile') {
            return handleUpdateUserProfile(req, adminClient, body, caller.id);
        }

        if (action === 'deactivate') {
            return handleDeactivateUser(req, adminClient, body, caller.id);
        }

        if (action === 'reactivate') {
            return handleReactivateUser(req, adminClient, body);
        }

        if (action === 'change-password') {
            return handleChangePassword(req, adminClient, body);
        }

        return jsonResponse(req, 400, { error: 'Ação desconhecida.' });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        return jsonResponse(req, 500, { error: message });
    }
});
