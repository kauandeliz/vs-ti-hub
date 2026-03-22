/**
 * supabase/functions/invite-user/index.ts
 *
 * Supabase Edge Function — runs server-side with the Service Role key.
 * Handles three actions:
 *   - list:       return all users (admin only)
 *   - invite:     create user and send invite e-mail (admin only)
 *   - deactivate: ban a user so they cannot log in (admin only)
 *
 * DEPLOY:
 *   1. Install Supabase CLI:  npm install -g supabase
 *   2. Login:                 supabase login
 *   3. Link project:          supabase link --project-ref SEU-PROJECT-REF
 *   4. Deploy function:       supabase functions deploy invite-user --no-verify-jwt
 *
 * The --no-verify-jwt flag is NOT used here — we verify the JWT manually
 * to ensure only authenticated admins can call this function.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // ── Verify caller is authenticated ──────────────────
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return errorResponse('Não autorizado.', 401);
        }

        // Admin client (service role) — used for privileged operations
        const adminClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        // User client — used to verify the caller's JWT
        const userClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            { global: { headers: { Authorization: authHeader } } }
        );

        const { data: { user }, error: userError } = await userClient.auth.getUser();
        if (userError || !user) {
            return errorResponse('Sessão inválida.', 401);
        }

        // ── Verify caller is admin ───────────────────────────
        if (user.user_metadata?.role !== 'admin') {
            return errorResponse('Acesso restrito a administradores.', 403);
        }

        // ── Route by action ─────────────────────────────────
        const body = await req.json();
        const { action } = body;

        if (action === 'list') {
            const { data, error } = await adminClient.auth.admin.listUsers();
            if (error) return errorResponse(error.message);
            return okResponse({ users: data.users });
        }

        if (action === 'invite') {
            const { name, email, password } = body;
            if (!name || !email || !password) return errorResponse('Nome, e-mail e senha são obrigatórios.');
            if (password.length < 8) return errorResponse('A senha deve ter no mínimo 8 caracteres.');

            // Criar usuário diretamente com a senha fornecida
            const { data, error } = await adminClient.auth.admin.createUser({
                email: email,
                password: password,
                user_metadata: { 
                    name, 
                    role: 'operador',
                    invited_at: new Date().toISOString()
                },
                email_confirm: true // Marcar email como confirmado
            });

            if (error) return errorResponse(error.message);
            
            return okResponse({ 
                user: data.user,
                message: 'Usuário criado com sucesso.'
            });
        }

        if (action === 'deactivate') {
            const { userId } = body;
            if (!userId) return errorResponse('userId é obrigatório.');

            // Ban user for 100 years (effectively deactivating)
            const { error } = await adminClient.auth.admin.updateUserById(userId, {
                ban_duration: '876000h',
            });

            if (error) return errorResponse(error.message);
            return okResponse({ success: true });
        }

        if (action === 'reactivate') {
            const { userId } = body;
            if (!userId) return errorResponse('userId é obrigatório.');

            const { error } = await adminClient.auth.admin.updateUserById(userId, {
                ban_duration: 'none',
            });

            if (error) return errorResponse(error.message);
            return okResponse({ success: true });
        }

        /**
         * change-password (admin altering another user's password)
         * The admin supplies targetUserId + newPassword.
         * Validation: min 8 chars, enforced server-side.
         */
        if (action === 'change-password') {
            const { targetUserId, newPassword } = body;
            if (!targetUserId || !newPassword) return errorResponse('targetUserId e newPassword são obrigatórios.');
            if (newPassword.length < 8) return errorResponse('A senha deve ter no mínimo 8 caracteres.');

            const { error } = await adminClient.auth.admin.updateUserById(targetUserId, {
                password: newPassword,
            });

            if (error) return errorResponse(error.message);
            return okResponse({ success: true });
        }

        return errorResponse('Ação desconhecida.');

    } catch (err) {
        return errorResponse(err instanceof Error ? err.message : 'Erro interno.');
    }
});

function okResponse(data: object) {
    return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
    });
}

function errorResponse(message: string, status = 400) {
    return new Response(JSON.stringify({ error: message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status,
    });
}
