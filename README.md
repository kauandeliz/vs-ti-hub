# VS TI Hub

Internal IT hub for VinilSul — quick access to all IT resources, systems, and the employee onboarding credential generator.

---

## Project Structure

```
vs-ti-hub/
│
├── index.html              # Entry point — shell with sidebar, topbar & all page sections
├── README.md
│
├── css/
│   ├── variables.css       # CSS custom properties (design tokens) + reset + utilities
│   ├── layout.css          # Sidebar, navigation, topbar, main, badges, responsive
│   ├── components.css      # Cards, tables, label cards, section labels, page transitions
│   ├── gerador.css         # Generator page: form, checkboxes, buttons, results panel
│   ├── historico.css       # Histórico page: toolbar, stats, table, modals, pagination
│   └── cadastros.css       # CRUD admin page layout (setores, cargos, filiais)
│
├── js/
│   ├── nav.js              # SPA navigation, page lifecycle hooks, global search
│   ├── supabase.js         # App data layer: Supabase client + DB/Admin APIs + error handling
│   ├── auth.js             # Session guard, login/logout, user widget
│   ├── gerador-data.js     # Catálogo dinâmico (setor/cargo/localidade) + credential logic
│   ├── gerador-ui.js       # Form validation, generation flow, persistence, CSV export
│   ├── usuarios.js         # Admin user management (invite, activate, deactivate, password)
│   ├── unidades.js         # Unidades/filiais page (dados dinâmicos do catálogo)
│   ├── etiquetas.js        # Etiquetas dinâmicas com base em filiais
│   ├── cadastros.js        # CRUD admin de setores, cargos e filiais
│   └── historico.js        # Histórico page: list, search, revoke, detail modal, pagination
│
└── supabase/
    └── schema.sql          # PostgreSQL table + indexes + RLS policies
```

---

## Pages

| Route key        | Description                         |
|------------------|-------------------------------------|
| `home`           | Dashboard — quick access cards      |
| `gerador`        | IT onboarding credential generator  |
| `helpdesk`       | Helpdesk system links               |
| `corporativo`    | Core corporate systems              |
| `telecom`        | Telecom operator portals            |
| `unidades`       | Branches / units table              |
| `etiquetas`      | Shipping label copy-paste cards     |
| `cadastros`      | Admin CRUD for dynamic catalog      |

Navigation is client-side SPA-style (show/hide `.page` elements). No build step required — open `index.html` directly.

---

## How to Run

Simply open `index.html` in any modern browser — no server or build step required.

For development with live reload, any static server works:

```bash
# Python
python3 -m http.server 8080

# Node.js (npx)
npx serve .

# VS Code Live Server extension
# Right-click index.html → "Open with Live Server"
```

---

## Supabase Setup (required for Histórico de Acessos)

1. **Crie um projeto** em [supabase.com](https://supabase.com) (gratuito)

2. **Execute o schema** em *Project → SQL Editor → New Query*:
   ```
   Copie e cole o conteúdo de supabase/schema.sql e execute
   ```

3. **Configure as credenciais** em `js/supabase.js`:
   - Ajuste o bloco `DEFAULT_CONFIG` com `supabaseUrl` e `supabaseAnonKey`
   - Opcionalmente, sobrescreva com `window.VSTI_CONFIG` antes de carregar os scripts

4. **Deploy no Cloudflare Pages**: publique via GitHub (Cloudflare Pages) ou use upload de site estático.  
   Não há variáveis de ambiente server-side — as chaves ficam no JS do cliente (a `anon key` do Supabase é segura para exposição; as RLS policies controlam o acesso).

## Cloudflare Pages (produção)

Configuração recomendada no Cloudflare Pages:
- **Production branch**: `main`
- **Framework preset**: `None`
- **Build command**: *(vazio)*
- **Build output directory**: `.`

Depois do primeiro deploy, atualize no Supabase:
- `Authentication → URL Configuration → Site URL`: `https://SEU-PROJETO.pages.dev`
- `Authentication → URL Configuration → Redirect URLs`: `https://SEU-PROJETO.pages.dev/**`
- Se usar domínio próprio no Cloudflare, adicione também o domínio em `Site URL`/`Redirect URLs`

### Segurança em produção

Para ambientes com dados sensíveis, adicione autenticação antes de ir a produção:
- Ative **Supabase Auth** (e-mail/senha ou SSO)
- Altere as RLS policies em `schema.sql` para `auth.role() = 'authenticated'`
- Adicione uma tela de login simples no frontend

---

## Adding a New Page

1. Add a nav button in `index.html` inside `<aside class="sidebar">`:
   ```html
   <button class="nav-item" data-nav="minha-pagina">
       <span class="nav-icon">🆕</span> Minha Página
   </button>
   ```

2. Add a page label in `js/nav.js` → `PAGE_LABELS`:
   ```js
   'minha-pagina': 'Minha Página',
   ```

3. Add the page section in `index.html` inside `#pages-container`:
   ```html
   <div class="page" id="page-minha-pagina">
       <div class="page-header"><h1>Minha Página</h1></div>
       <!-- content -->
   </div>
   ```

---

## Adding a New Tool Card

Inside the relevant page section, add:

```html
<a href="https://..." target="_blank" class="tool-card">
    <div class="card-banner"><img src="..." alt="Tool Name"></div>
    <!-- or for emoji icon: <div class="card-icon-banner">🔧</div> -->
    <div class="card-body">
        <h3>Tool Name</h3>
        <p>Short description.</p>
    </div>
    <div class="card-footer">Acessar</div>
</a>
```

For internal tools (green left border), add the `internal` class to `.tool-card`.

---

## Catálogo Dinâmico (CRUD)

Os dados de setor/cargo/localidade/filiais não ficam mais hardcoded no JS.

Para manter esses campos:
1. Acesse a página **Cadastros** (somente admin)
2. Faça CRUD de **Setores**, **Cargos** e **Filiais**
3. O Gerador, Histórico (UF), Unidades e Etiquetas serão atualizados com essa base

---

## Notes

- No frameworks, no build tools — pure HTML, CSS, and vanilla JS.
- All navigation is handled by `navTo()` in `js/nav.js`.
- Credential generation logic remains isolated in `gerarDados()` in `js/gerador-data.js`.
- Clipboard operations use the async `navigator.clipboard` API (requires HTTPS or localhost in production).
