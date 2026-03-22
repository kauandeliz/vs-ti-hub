/**
 * supabase/functions/set-password/index.ts
 *
 * Supabase Edge Function — runs server-side with the Service Role key.
 * Handles setting password for invited users while preserving existing metadata.
 *
 * DEPLOY:
 *   1. Install Supabase CLI:  npm install -g supabase
 *   2. Login:                 supabase login
 *   3. Link project:          supabase link --project-ref SEU-PROJECT-REF
 *   4. Deploy function:       supabase functions deploy set-password --no-verify-jwt
 *
 * The --no-verify-jwt flag is used here since we handle auth inside the function.
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

        // ── Get password from request ───────────────────────
        const body = await req.json();
        const { password } = body;
        if (!password || password.length < 8) {
            return errorResponse('Senha deve ter no mínimo 8 caracteres.', 400);
        }

        // ── Preserve existing metadata and add password_set ──
        const existingData = user.user_metadata || {};
        const updatedData = {
            ...existingData,
            password_set: true
        };

        // ── Update user with new password and preserved metadata ──
        const { error } = await adminClient.auth.admin.updateUserById(user.id, {
            password: password,
            user_metadata: updatedData
        });

        if (error) {
            return errorResponse(error.message, 400);
        }

        return okResponse({ success: true });

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