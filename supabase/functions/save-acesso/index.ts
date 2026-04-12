/**
 * supabase/functions/save-acesso/index.ts
 *
 * Função desativada por segurança:
 * não é permitido persistir histórico de credenciais.
 */

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

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: getCorsHeaders(req) });
    }

    return jsonResponse(req, 410, {
        error: 'Funcionalidade desativada por segurança. O sistema não armazena histórico de credenciais.',
    });
});
