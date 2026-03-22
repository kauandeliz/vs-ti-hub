/**
 * supabase.js
 * Supabase client initialisation and all database operations for VS TI Hub.
 *
 * HOW TO CONFIGURE:
 *   1. Create a project at https://supabase.com
 *   2. Go to Project Settings → API
 *   3. Copy "Project URL" and "anon public" key into the constants below
 *   4. Run the SQL in /supabase/schema.sql in the Supabase SQL editor
 */

// ─── CONFIG ──────────────────────────────────────────
// Replace these with your real Supabase project values.
const SUPABASE_URL    = 'https://ufoykcfcaygtwwpwwhyl.supabase.co';
const SUPABASE_ANON   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmb3lrY2ZjYXlndHd3cHd3aHlsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDAyNjE4NSwiZXhwIjoyMDg5NjAyMTg1fQ.VaYr5bmi9bd_MHhRO61UqxYWI82T4HKTVTE82s30o7A';

// ─── CLIENT ──────────────────────────────────────────
// Using the Supabase JS SDK v2 loaded via CDN (see index.html <head>)
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── TABLE NAME ───────────────────────────────────────
const TABLE = 'acessos';

// ─── PUBLIC API ───────────────────────────────────────

/**
 * Save a newly generated access record.
 *
 * Passwords are hashed with bcrypt server-side via the `save-acesso` Edge Function.
 * The plain-text passwords are sent over HTTPS to the function and are NEVER stored.
 *
 * @param {Object} admissionData  - Form fields (nome, cpf, setor, cargo, uf, local, bairro, dataAdmissao)
 * @param {Object} acessos        - Generated credentials map (plain-text, used only in transit)
 * @returns {Promise<{data, error}>}
 */
async function dbSalvarAcesso(admissionData, acessos) {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return { data: null, error: { message: 'Sessão inválida.' } };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/save-acesso`, {
        method: 'POST',
        headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ admissionData, acessos }),
    });

    const json = await res.json();
    if (!res.ok) return { data: null, error: { message: json.error ?? 'Erro ao salvar.' } };
    return { data: json.record, error: null };
}

/**
 * List access records with optional filters.
 *
 * @param {Object} opts
 * @param {string}  [opts.search]   - Text search across nome / cpf / cargo
 * @param {string}  [opts.status]   - 'ativo' | 'revogado' | '' (all)
 * @param {string}  [opts.uf]       - Filter by UF
 * @param {number}  [opts.limit]    - Max rows (default 100)
 * @returns {Promise<{data, error}>}
 */
async function dbListarAcessos({ search = '', status = '', uf = '', limit = 100 } = {}) {
    let query = _supabase
        .from(TABLE)
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(limit);

    if (status)  query = query.eq('status', status);
    if (uf)      query = query.eq('uf', uf);
    if (search) {
        const s = search.trim();
        query = query.or(`nome.ilike.%${s}%,cpf.ilike.%${s}%,cargo.ilike.%${s}%,login_email.ilike.%${s}%`);
    }

    return await query;
}

/**
 * Fetch a single record by ID.
 * @param {string|number} id
 */
async function dbBuscarAcesso(id) {
    return await _supabase.from(TABLE).select('*').eq('id', id).single();
}

/**
 * Revoke an access record (sets status = 'revogado' and records who/when).
 * @param {string|number} id
 * @param {string} motivo - Reason for revocation
 */
async function dbRevogarAcesso(id, motivo = '') {
    return await _supabase
        .from(TABLE)
        .update({
            status:       'revogado',
            revogado_em:  new Date().toISOString(),
            motivo_revogacao: motivo,
        })
        .eq('id', id)
        .select()
        .single();
}

/**
 * Reactivate a previously revoked record.
 * @param {string|number} id
 */
async function dbReativarAcesso(id) {
    return await _supabase
        .from(TABLE)
        .update({ status: 'ativo', revogado_em: null, motivo_revogacao: null })
        .eq('id', id)
        .select()
        .single();
}

/**
 * Update editable fields of a record.
 * @param {string|number} id
 * @param {Object} fields - Partial record fields to update
 */
async function dbAtualizarAcesso(id, fields) {
    return await _supabase
        .from(TABLE)
        .update({ ...fields, atualizado_em: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
}

// ─── HELPERS ──────────────────────────────────────────

/**
 * Convert "dd/mm/aaaa" → "aaaa-mm-dd" for Postgres DATE columns.
 * Falls back to null if format is unrecognised.
 */
function parseDateBR(str) {
    if (!str) return null;
    const [d, m, y] = str.split('/');
    if (!d || !m || !y) return null;
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

/**
 * Format an ISO date string to "dd/mm/aaaa" for display.
 */
function formatDateBR(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleDateString('pt-BR');
}

/**
 * Format an ISO datetime string to "dd/mm/aaaa HH:MM" for display.
 */
function formatDateTimeBR(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
