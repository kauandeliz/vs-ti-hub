/**
 * supabase/functions/save-acesso/index.ts
 *
 * Edge Function — salva um novo acesso com senhas em bcrypt hash.
 * Roda server-side, nunca expõe o algoritmo de hash ao cliente.
 *
 * DEPLOY:
 *   supabase functions deploy save-acesso
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        // ── Verify authenticated session ─────────────────────
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) return errorRes('Não autorizado.', 401);

        const userClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            { global: { headers: { Authorization: authHeader } } }
        );

        const { data: { user }, error: userError } = await userClient.auth.getUser();
        if (userError || !user) return errorRes('Sessão inválida.', 401);

        // ── Parse body ───────────────────────────────────────
        const body = await req.json();
        const { admissionData, acessos } = body;

        if (!admissionData || !acessos) {
            return errorRes('Payload inválido.');
        }

        // ── Hash all non-null passwords (cost factor 10) ─────
        const hashIfPresent = async (plain: string | null): Promise<string | null> => {
            if (!plain) return null;
            return await bcrypt.hash(plain, await bcrypt.genSalt(10));
        };

        const [
            hash_email,
            hash_wts,
            hash_helpdesk,
            hash_nyxos,
        ] = await Promise.all([
            hashIfPresent(acessos['Senha E-mail']    ?? null),
            hashIfPresent(acessos['Senha WTS']       ?? null),
            hashIfPresent(acessos['Senha Helpdesk']  ?? null),
            hashIfPresent(acessos['Senha Nyxos']     ?? null),
        ]);

        // ── Insert into DB ───────────────────────────────────
        const adminClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
            { auth: { autoRefreshToken: false, persistSession: false } }
        );

        const { data, error } = await adminClient
            .from('acessos')
            .insert([{
                nome:           admissionData['Nome Completo'],
                cpf:            admissionData['CPF'],
                data_admissao:  parseDateBR(admissionData['Data Admissão']),
                setor:          admissionData['Setor'],
                cargo:          admissionData['Cargo'],
                uf:             admissionData['UF'],
                cidade:         admissionData['Local'],
                bairro:         admissionData['Bairro'],

                login_email:    acessos['Login E-mail']    ?? null,
                senha_email:    hash_email,

                login_wts:      acessos['Login WTS']       ?? null,
                senha_wts:      hash_wts,

                login_helpdesk: acessos['Login Helpdesk']  ?? null,
                senha_helpdesk: hash_helpdesk,

                login_nyxos:    acessos['Login Nyxos']     ?? null,
                senha_nyxos:    hash_nyxos,

                status:         'ativo',
                criado_por:     user.id,
                criado_em:      new Date().toISOString(),
            }])
            .select('id, nome, login_email, criado_em')
            .single();

        if (error) return errorRes(error.message);

        return okRes({ record: data });

    } catch (err) {
        return errorRes(err instanceof Error ? err.message : 'Erro interno.');
    }
});

function parseDateBR(str: string): string | null {
    if (!str) return null;
    const [d, m, y] = str.split('/');
    if (!d || !m || !y) return null;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

function okRes(data: object) {
    return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
    });
}

function errorRes(message: string, status = 400) {
    return new Response(JSON.stringify({ error: message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status,
    });
}
