/**
 * supabase/functions/save-acesso/index.ts
 *
 * Persiste um novo acesso com hashes bcrypt das senhas.
 * Nunca armazena senha em texto plano.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as bcrypt from 'https://deno.land/x/bcrypt@v0.4.1/mod.ts';

type AdmissionData = {
    nomeCompleto: string;
    cpf: string;
    dataAdmissao: string;
    setor: string;
    cargo: string;
    uf: string;
    cidade: string;
    bairro: string;
};

type AccessEntry = {
    login: string;
    senha: string;
};

type AccessMap = {
    email: AccessEntry | null;
    wts: AccessEntry | null;
    helpdesk: AccessEntry | null;
    nyxos: AccessEntry | null;
};

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

function normalizeCpf(value: string) {
    return value.replace(/\D/g, '');
}

function parseDateBR(value: string) {
    const trimmed = sanitizeText(value);

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
    }

    const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;

    const [, day, month, year] = match;
    const iso = `${year}-${month}-${day}`;
    const date = new Date(`${iso}T00:00:00Z`);

    if (Number.isNaN(date.getTime())) return null;
    return iso;
}

function parseAdmissionData(raw: Record<string, unknown>): AdmissionData {
    const payload: AdmissionData = {
        nomeCompleto: sanitizeText(raw.nomeCompleto ?? raw['Nome Completo']),
        cpf: normalizeCpf(sanitizeText(raw.cpf ?? raw.CPF)),
        dataAdmissao: sanitizeText(raw.dataAdmissao ?? raw['Data Admissão']),
        setor: sanitizeText(raw.setor ?? raw.Setor),
        cargo: sanitizeText(raw.cargo ?? raw.Cargo),
        uf: sanitizeText(raw.uf ?? raw.UF).toUpperCase(),
        cidade: sanitizeText(raw.cidade ?? raw.local ?? raw.Local),
        bairro: sanitizeText(raw.bairro ?? raw.Bairro),
    };

    if (!payload.nomeCompleto || payload.nomeCompleto.split(/\s+/).length < 2) {
        throw new Error('Nome completo inválido.');
    }

    if (!/^\d{11}$/.test(payload.cpf)) {
        throw new Error('CPF inválido.');
    }

    if (!/^\w{2}$/i.test(payload.uf)) {
        throw new Error('UF inválida.');
    }

    if (!payload.setor || !payload.cargo || !payload.cidade || !payload.bairro) {
        throw new Error('Dados de admissão incompletos.');
    }

    const parsedDate = parseDateBR(payload.dataAdmissao);
    if (!parsedDate) {
        throw new Error('Data de admissão inválida.');
    }

    payload.dataAdmissao = parsedDate;
    return payload;
}

function parseAccessEntry(rawLogin: unknown, rawSenha: unknown): AccessEntry | null {
    const login = sanitizeText(rawLogin);
    const senha = sanitizeText(rawSenha);

    if (!login && !senha) return null;
    if (!login || !senha) {
        throw new Error('Cada acesso deve possuir login e senha.');
    }

    if (senha.length < 4) {
        throw new Error('Senha de acesso inválida.');
    }

    return { login, senha };
}

function parseAccesses(raw: Record<string, unknown>): AccessMap {
    const email = (raw.email as Record<string, unknown> | undefined) || null;
    const wts = (raw.wts as Record<string, unknown> | undefined) || null;
    const helpdesk = (raw.helpdesk as Record<string, unknown> | undefined) || null;
    const nyxos = (raw.nyxos as Record<string, unknown> | undefined) || null;

    const parsed: AccessMap = {
        email: parseAccessEntry(email?.login ?? raw['Login E-mail'], email?.senha ?? raw['Senha E-mail']),
        wts: parseAccessEntry(wts?.login ?? raw['Login WTS'], wts?.senha ?? raw['Senha WTS']),
        helpdesk: parseAccessEntry(helpdesk?.login ?? raw['Login Helpdesk'], helpdesk?.senha ?? raw['Senha Helpdesk']),
        nyxos: parseAccessEntry(nyxos?.login ?? raw['Login Nyxos'], nyxos?.senha ?? raw['Senha Nyxos']),
    };

    if (!parsed.email && !parsed.wts && !parsed.helpdesk && !parsed.nyxos) {
        throw new Error('Selecione pelo menos um acesso para salvar.');
    }

    return parsed;
}

async function hashAccessSenha(value: AccessEntry | null) {
    if (!value) return null;

    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(value.senha, salt);
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
        const anonClient = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_ANON_KEY')!,
            {
                global: {
                    headers: { Authorization: authHeader },
                },
            },
        );

        const { data: userData, error: userError } = await anonClient.auth.getUser();
        if (userError || !userData.user) {
            return jsonResponse(req, 401, { error: 'Sessão inválida.' });
        }

        const body = await req.json();
        const admissionData = parseAdmissionData((body?.admissionData || {}) as Record<string, unknown>);
        const acessos = parseAccesses((body?.acessos || {}) as Record<string, unknown>);

        const [hashEmail, hashWts, hashHelpdesk, hashNyxos] = await Promise.all([
            hashAccessSenha(acessos.email),
            hashAccessSenha(acessos.wts),
            hashAccessSenha(acessos.helpdesk),
            hashAccessSenha(acessos.nyxos),
        ]);

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

        const { data, error } = await adminClient
            .from('acessos')
            .insert([
                {
                    nome: admissionData.nomeCompleto,
                    cpf: admissionData.cpf,
                    data_admissao: admissionData.dataAdmissao,
                    setor: admissionData.setor,
                    cargo: admissionData.cargo,
                    uf: admissionData.uf,
                    cidade: admissionData.cidade,
                    bairro: admissionData.bairro,

                    login_email: acessos.email?.login || null,
                    senha_email: hashEmail,

                    login_wts: acessos.wts?.login || null,
                    senha_wts: hashWts,

                    login_helpdesk: acessos.helpdesk?.login || null,
                    senha_helpdesk: hashHelpdesk,

                    login_nyxos: acessos.nyxos?.login || null,
                    senha_nyxos: hashNyxos,

                    status: 'ativo',
                    criado_por: userData.user.id,
                },
            ])
            .select('id, nome, login_email, criado_em, status')
            .single();

        if (error) {
            return jsonResponse(req, 400, { error: error.message });
        }

        return jsonResponse(req, 200, { record: data });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro interno.';
        return jsonResponse(req, 400, { error: message });
    }
});
