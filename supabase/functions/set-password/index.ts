/**
 * supabase/functions/set-password/index.ts
 *
 * Atualiza a senha do usuário autenticado preservando metadata.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
        const userClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            {
                global: {
                    headers: { Authorization: authHeader },
                },
            },
        );

        const { data: userData, error: userError } = await userClient.auth.getUser();
        if (userError || !userData.user) {
            return jsonResponse(req, 401, { error: 'Sessão inválida.' });
        }

        const body = (await req.json()) as { password?: unknown };
        const password = sanitizeText(body.password);

        if (password.length < 8) {
            return jsonResponse(req, 400, { error: 'Senha deve ter no mínimo 8 caracteres.' });
        }

        if (password.length > 128) {
            return jsonResponse(req, 400, { error: 'Senha excede o tamanho máximo permitido.' });
        }

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

        const metadata = userData.user.user_metadata || {};
        const { error } = await adminClient.auth.admin.updateUserById(userData.user.id, {
            password,
            user_metadata: {
                ...metadata,
                password_set: true,
                password_set_at: new Date().toISOString(),
            },
        });

        if (error) {
            return jsonResponse(req, 400, { error: error.message });
        }

        return jsonResponse(req, 200, { success: true });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        return jsonResponse(req, 500, { error: message });
    }
});
