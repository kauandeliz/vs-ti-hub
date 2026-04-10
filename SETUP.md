# Guia de Configuração — Autenticação e Deploy

## Passo 1 — Configurar o Supabase

### 1.1 Criar o projeto
1. Acesse https://supabase.com e crie um projeto gratuito
2. Anote a **Project URL** e a **anon key** (Project Settings → API)

### 1.2 Executar o schema
1. No painel do Supabase, vá em **SQL Editor → New Query**
2. Cole o conteúdo do arquivo `supabase/schema.sql` e execute

### 1.3 Configurar o e-mail de convite (opcional mas recomendado)
1. Vá em **Authentication → Email Templates**
2. Edite o template **Invite user** com a identidade visual da VinilSul
3. Em **Authentication → URL Configuration**, defina a **Site URL** como:
   - Em dev:  `http://localhost:3000`
   - Em prod: `https://seu-site.pages.dev`

---

## Passo 2 — Criar sua conta admin

1. No painel do Supabase, vá em **Authentication → Users → Add user**
2. Preencha seu e-mail e uma senha forte
3. Após criar, clique no usuário → edite os **User Metadata**:
   ```json
   { "name": "Seu Nome", "role": "admin" }
   ```
4. Salve. Agora você é admin.

---

## Passo 3 — Configurar o código

Edite `js/supabase.js` com suas credenciais:

```js
const SUPABASE_URL  = 'https://xxxxxxxxxxxx.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

---

## Passo 4 — Deploy da Edge Function (para criar usuários)

A criação de usuários precisa de uma Edge Function server-side.

### Instalar o Supabase CLI
```bash
npm install -g supabase
```

### Login e link com o projeto
```bash
supabase login
supabase link --project-ref SEU-PROJECT-REF
# O project-ref está na URL do seu projeto: supabase.com/dashboard/project/SEU-PROJECT-REF
```

### Deploy das funções
```bash
supabase secrets set ALLOWED_ORIGINS=https://seu-site.pages.dev,https://seu-dominio.com
supabase functions deploy invite-user
supabase functions deploy save-acesso
```

Após o deploy, a função estará disponível em:
`https://SEU-PROJECT-REF.supabase.co/functions/v1/invite-user`

---

## Passo 5 — Deploy no Cloudflare Pages

### Opção A: arrastar e soltar (mais simples)
1. Acesse https://dash.cloudflare.com
2. No menu, vá em **Pages** e crie um projeto novo
3. Escolha **Direct Upload** e envie os arquivos do projeto
4. Pronto — a URL será gerada automaticamente

### Opção B: via Git (recomendado para atualizações)
1. Suba o projeto para um repositório GitHub
2. No Cloudflare Pages: **Add new project → Connect GitHub**
3. Conecte o repositório
4. Build settings: deixe em branco (site estático)
5. Build output directory: `.`

### Atualizar URL do Supabase após publicar no Cloudflare
1. Copie a URL gerada no Cloudflare (ex.: `https://seu-site.pages.dev`)
2. No Supabase, vá em **Authentication → URL Configuration**
3. Atualize:
   - **Site URL**: `https://seu-site.pages.dev`
   - **Redirect URLs**: `https://seu-site.pages.dev/**`
4. Se usar domínio próprio no Cloudflare, adicione também:
   - `https://seu-dominio.com`
   - `https://seu-dominio.com/**`

---

## Fluxo de uso após configurado

```
Admin cria usuário
    ↓
Supabase envia e-mail de convite automático
    ↓
Usuário clica no link do e-mail
    ↓
Define uma senha
    ↓
Faz login no VS TI Hub
    ↓
Acessa o sistema normalmente
```

---

## Estrutura de arquivos nova

```
vs-ti-hub/
├── ...
├── css/
│   └── auth.css                          # Tela de login + widget de usuário
├── js/
│   ├── auth.js                           # Login, logout, guarda de sessão
│   └── usuarios.js                       # Página de gerenciamento de usuários
└── supabase/
    ├── schema.sql                        # Banco de dados
    └── functions/
        └── invite-user/
            └── index.ts                  # Edge Function (cria/lista/desativa usuários)
```
