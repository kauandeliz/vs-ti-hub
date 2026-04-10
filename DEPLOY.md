# 🚀 Guia de Deploy — VS TI Hub
### Do zero ao ar em ~30 minutos

---

## O que você vai precisar

| Ferramenta | Para quê | Gratuito? |
|---|---|---|
| [Node.js](https://nodejs.org) (v18+) | Rodar o Supabase CLI | ✅ |
| [Git](https://git-scm.com) | Versionar e fazer deploy | ✅ |
| [Supabase](https://supabase.com) | Banco de dados + autenticação | ✅ |
| [Cloudflare](https://cloudflare.com) | Hospedar o site | ✅ |
| [GitHub](https://github.com) | Repositório do código | ✅ |

---

## PARTE 1 — Supabase (banco de dados)

### 1.1 Criar o projeto

1. Acesse **https://supabase.com** e clique em **Start your project**
2. Faça login com GitHub ou e-mail
3. Clique em **New project**
4. Preencha:
   - **Name:** `vs-ti-hub`
   - **Database Password:** crie uma senha forte e **anote ela**
   - **Region:** `South America (São Paulo)`
5. Clique em **Create new project** e aguarde ~2 minutos

### 1.2 Copiar as credenciais

1. No painel do projeto, vá em **Project Settings** (ícone de engrenagem) → **API**
2. Copie e anote os dois valores:
   - **Project URL** → algo como `https://ufoykcfcaygtwwpwwhyl.supabase.co`
   - **anon public** (em Project API keys) → começa com `eyJ...`
3. Ainda na mesma página, copie também:
   - **Project Reference ID** → a parte `ufoykcfcaygtwwpwwhyl` da URL, ou está em **General** como "Reference ID"

### 1.3 Criar a tabela no banco

1. No menu lateral, clique em **SQL Editor**
2. Clique em **New query**
3. Abra o arquivo `supabase/schema.sql` que está dentro do projeto
4. Copie todo o conteúdo e cole no editor
5. Clique em **Run** (▶)
6. Deve aparecer "Success. No rows returned" — está certo

### 1.4 Criar sua conta admin

1. No menu lateral, clique em **Authentication** → **Users**
2. Clique em **Add user** → **Create new user**
3. Preencha seu e-mail e uma senha forte
4. Clique em **Create user**
5. Na lista de usuários, clique no usuário recém-criado
6. Role até **User Metadata** e clique em **Edit**
7. Substitua o conteúdo por:
   ```json
   {
     "name": "Seu Nome Completo",
     "role": "admin"
   }
   ```
8. Clique em **Save**

### 1.5 Configurar a URL do site (para os e-mails de convite funcionarem)

1. Ainda em **Authentication**, clique em **URL Configuration**
2. Em **Site URL**, coloque por enquanto: `http://localhost:3000`
   *(você vai atualizar depois com a URL real do Cloudflare Pages)*
3. Clique em **Save**

---

## PARTE 2 — Configurar o código

### 2.1 Extrair o projeto

1. Extraia o arquivo `vs-ti-hub.zip` em uma pasta no seu computador
2. Você terá uma pasta `vs-ti-hub/` com toda a estrutura

### 2.2 Inserir as credenciais do Supabase

1. Abra o arquivo `vs-ti-hub/js/supabase.js` em qualquer editor de texto
   *(Notepad, VS Code, etc.)*
2. Localize as duas primeiras linhas de configuração e substitua pelos valores que você copiou no Passo 1.2:
   ```js
   const SUPABASE_URL  = 'https://SEU-PROJECT-REF.supabase.co';   // ← sua Project URL
   const SUPABASE_ANON = 'SUA_ANON_PUBLIC_KEY';                   // ← sua anon key
   ```
3. Salve o arquivo

### 2.3 Testar localmente

Abra o terminal na pasta `vs-ti-hub/` e rode:

```bash
npx serve .
```

Acesse **http://localhost:3000** no navegador.
Você deve ver a tela de login. Tente entrar com as credenciais que criou no Passo 1.4.

> Se aparecer erro de CORS, use `http://localhost:3000` exatamente como está — não `127.0.0.1`.

---

## PARTE 3 — Deploy das Edge Functions

As Edge Functions rodam no servidor do Supabase e são necessárias para criar usuários e salvar senhas com hash.

### 3.1 Instalar o Node.js (se ainda não tiver)

Baixe em **https://nodejs.org** → versão **LTS**. Instale normalmente.

Verifique no terminal:
```bash
node --version   # deve mostrar v18 ou superior
npm --version    # deve mostrar algum número
```

### 3.2 Instalar o Supabase CLI

```bash
npm install -g supabase
```

Verifique:
```bash
supabase --version   # deve mostrar a versão instalada
```

### 3.3 Fazer login no Supabase CLI

```bash
supabase login
```

Isso vai abrir o navegador. Faça login e autorize o CLI.

### 3.4 Linkar o projeto

Navegue até a pasta raiz do projeto no terminal:

```bash
cd caminho/para/vs-ti-hub
```

Depois rode (substitua `abcdefgh` pelo seu Reference ID do Passo 1.2):

```bash
supabase link --project-ref ufoykcfcaygtwwpwwhyl
```

Quando pedir a senha do banco, use a que você criou no Passo 1.1.

### 3.5 Fazer o deploy das funções

Opcional (recomendado): restringir CORS para seu domínio Cloudflare:

```bash
supabase secrets set ALLOWED_ORIGINS=https://vs-ti-hub.pages.dev,https://seu-dominio.com
```

```bash
supabase functions deploy invite-user
supabase functions deploy save-acesso
```

Cada comando deve finalizar com "Done". Se der erro de permissão, tente com `npx supabase` no lugar de `supabase`.

---

## PARTE 4 — Deploy no GitHub + Cloudflare Pages

### 4.1 Criar repositório no GitHub

1. Acesse **https://github.com** e faça login
2. Clique em **New repository** (botão verde ou no `+` do canto superior direito)
3. Preencha:
   - **Repository name:** `vs-ti-hub`
   - **Visibility:** Private *(recomendado — o código tem as suas chaves)*
4. Clique em **Create repository**

### 4.2 Enviar o código para o GitHub

No terminal, dentro da pasta `vs-ti-hub/`:

```bash
git init
git add .
git commit -m "primeiro commit"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/vs-ti-hub.git
git push -u origin main
```

> Substitua `SEU-USUARIO` pelo seu usuário do GitHub.
> Se pedir usuário e senha, use seu usuário e um **Personal Access Token**
> (GitHub → Settings → Developer settings → Personal access tokens → Generate new token).

### 4.3 Criar o site no Cloudflare Pages

1. Acesse **https://dash.cloudflare.com** e faça login
2. Vá em **Pages** → **Create a project**
3. Conecte o repositório do GitHub `vs-ti-hub`
4. Configure:
   - **Production branch:** `main`
   - **Framework preset:** None
   - **Build command:** *(deixe em branco)*
   - **Build output directory:** `.`
5. Clique em **Save and deploy**
6. Aguarde ~1 minuto — o Cloudflare Pages vai gerar uma URL tipo `https://vs-ti-hub.pages.dev`

### 4.4 Atualizar a URL no Supabase

Agora que você tem a URL real do site:

1. Volte ao painel do Supabase → **Authentication** → **URL Configuration**
2. Atualize a **Site URL** para a URL do Cloudflare:
   ```
   https://vs-ti-hub.pages.dev
   ```
3. Em **Redirect URLs**, adicione também:
   ```
   https://vs-ti-hub.pages.dev/**
   ```
4. Clique em **Save**
5. Se você usar domínio próprio no Cloudflare, adicione também:
   - `https://seu-dominio.com`
   - `https://seu-dominio.com/**`

### 4.5 (Opcional) Configurar domínio personalizado no Cloudflare

1. No painel do Cloudflare, vá em **Pages** → seu projeto
2. Clique em **Custom domains**
3. Siga as instruções para apontar seu domínio e validar SSL

---

## PARTE 5 — Verificação final

Acesse a URL do Cloudflare Pages e faça este checklist:

- [ ] Tela de login aparece com o fundo correto (grade + glow azul)
- [ ] Login com seu e-mail e senha funciona
- [ ] Dashboard carrega normalmente após o login
- [ ] Item "👥 Usuários" aparece na sidebar (você é admin)
- [ ] Na página Usuários, tente convidar um e-mail de teste
- [ ] O e-mail de convite chega na caixa de entrada
- [ ] O convidado consegue definir senha e fazer login
- [ ] Gerador de Acessos funciona e salva no Histórico
- [ ] Histórico mostra os registros com senha como "🔒 bcrypt hash"

---

## Fazendo atualizações no futuro

Sempre que alterar o código:

```bash
git add .
git commit -m "descrição da mudança"
git push
```

O Cloudflare Pages detecta o push automaticamente e faz o redeploy em ~1 minuto.

Se alterar as Edge Functions:

```bash
supabase functions deploy invite-user
supabase functions deploy save-acesso
```

---

## Problemas comuns

| Problema | Solução |
|---|---|
| "Invalid login credentials" | Verifique se o usuário foi criado em Authentication → Users |
| "Failed to fetch" ao gerar acesso | As Edge Functions não foram deployadas — repita o Passo 3.5 |
| E-mail de convite não chega | Verifique Authentication → URL Configuration → Site URL |
| Tela branca após login | Abra o console do navegador (F12) e veja o erro — provavelmente a `SUPABASE_URL` está errada |
| `supabase: command not found` | Use `npx supabase` no lugar de `supabase` |
| Erro de CORS nas Edge Functions | Verifique se o deploy foi feito com `supabase functions deploy` |
