# Guia Rápido: Sistema de Sessões com Redis

## 📋 Resumo

Seu projeto agora tem:

1. **Backend Express** (`server/index.js`)
   - Gerencia sessões em **Redis** (server-side)
   - Endpoints REST para login, logout, verificação de sessão
   - Cookies **HttpOnly + Secure + SameSite=Lax**

2. **Cliente JavaScript** (`js/session-client.js`)
   - Interface para chamar endpoints do servidor
   - Automaticamente envia/recebe cookies (HttpOnly)
   - Mantém usuário logado via refresh automático

3. **Suporte a múltiplos servidores** (Stateless)
   - Como redis é central, qualquer servidor pode validar qualquer sessão
   - Perfeito para load balancing e auto-scaling

---

## 🚀 Quick Start

### Passo 1: Instalar Redis (escolha uma opção)

**Docker (recomendado):**
```bash
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

**ou Windows local:**
- https://github.com/microsoftarchive/redis/releases

---

### Passo 2: Configurar servidor

```bash
cd server
npm install
cp .env.example .env
```

Editar `.env`:
```env
SESSION_SECRET=use-a-random-long-secret-here
CLIENT_URL=http://localhost:8080
```

**Gerar SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### Passo 3: Iniciar servidor

```bash
npm run dev
# Porém: npm start (produção)
```

Esperado:
```
✅ VS TI Hub Server running on http://localhost:3000
✅ Redis connected
```

---

### Passo 4: Atualizar cliente HTML

No seu `index.html`, carregue o novo client:

```html
<!-- Remova a dependência do Supabase Auth -->
<!-- <script src="js/auth.js"></script> -->

<!-- Use o novo session client -->
<script src="js/session-client.js"></script>
```

---

### Passo 5: Atualizar auth.js ou login

Em vez de usar `_supabase.auth.signInWithPassword()`, use:

```javascript
// Antigo (Supabase)
// const { data, error } = await _supabase.auth.signInWithPassword({
//     email, password
// });

// Novo (Session Client)
const { success, user, error } = await SessionClient.login(email, password);

if (success) {
    // User logado
    console.log('Usuário:', user);
} else {
    // Login falhou
    console.error('Erro:', error);
}
```

---

## 🔐 Segurança das Cookies

Todas as cookies incluem **obrigatoriamente**:

| Flag | Valor | Razão |
|------|-------|-------|
| `HttpOnly` | ✅ | JavaScript não pode acessar (protege XSS) |
| `Secure` | ✅ | Só envia via HTTPS em produção |
| `SameSite` | `Lax` | Protege CSRF; permite navegação normal |

A cookie NÃO pode ser acessada via `document.cookie` (segurança!).  
O navegador envia automaticamente em toda requisição.

---

## 📡 Endpoints Disponíveis

| Método | Path | Descrição | Requer Auth? |
|--------|------|-----------|-------------|
| POST | `/auth/login` | Autentica e cria sessão | ❌ |
| POST | `/auth/logout` | Destroy sessão e limpa cookie | ✅ |
| GET | `/auth/me` | Retorna usuário atual | ❌ (retorna null se não autenticado) |
| POST | `/auth/refresh` | Estende TTL da sessão | ✅ |
| DELETE | `/auth/sessions/:id` | Revoga uma sessão (admin only) | ✅ |
| GET | `/health` | Health check | ❌ |

---

## 🗄️ Como Funciona

```
┌─────────────────┐
│   Cliente       │─── credentials: 'include' ──→ ┌─────────────────┐
│ session-client  │                             │  Express Server │
│                 │                             │  (port 3000)    │
└─────────────────┘                             └─────────────────┘
        ▲                                               │
        │                                               │
        └─── Set-Cookie: sessionId ◀────────────────────┘
        │   (HttpOnly, Secure, SameSite=Lax)
        │
        │  ┌──→ Navegador salva automaticamente
        │  │  ┌──→ Envia automático em próximas requisições
        │  │  │
        └──┴──→ Redis: session:{sessionId} = { user data }
                       TTL = 24h
```

---

## 🛠️ Exemplos de Integração

### Login
```javascript
const result = await SessionClient.login('user@example.com', 'senha123');
if (result.success) {
    console.log('Bem-vindo:', result.user.email);
    // Redirecionar para app principal
} else {
    console.error('Login falhou:', result.error);
}
```

### Verificar se está logado
```javascript
const user = SessionClient.getCurrentUser();
if (user) {
    console.log('Logado como:', user.email);
} else {
    console.log('Não autenticado');
}
```

### Logout
```javascript
await SessionClient.logout();
console.log('Deslogado');
```

### Verificar permissão de admin
```javascript
if (SessionClient.isAdmin()) {
    // Mostrar botões de admin
} else {
    // Ocultar
}
```

### Refrescar sessão manualmente
```javascript
const success = await SessionClient.refreshSession();
if (!success) {
    console.warn('Sessão expirou');
}
```

---

## 📊 Monitoramento

### Ver sessões ativas em Redis
```bash
redis-cli
> KEYS session:*
> GET session:{sessionId}
> TTL session:{sessionId}
```

### Logs do servidor
O servidor loga todos os eventos:
- Login bem-sucedido
- Logout
- Falha de autenticação
- Erros de conexão Redis

---

## 🚀 Deploy para Produção

### 1. Usar Redis gerenciado
- **Redis Cloud** (free tier: https://redis.com/try-free/)
- **AWS ElastiCache**
- **Heroku Redis**
- **Azure Cache for Redis**

### 2. Configurar ambiente
```env
NODE_ENV=production
PORT=3000
REDIS_HOST=your-redis-host.com
REDIS_PORT=6379
REDIS_PASSWORD=your-password
SESSION_SECRET=use-strong-random-secret
CLIENT_URL=https://seu-site.com
```

### 3. Certificar HTTPS
O servidor automaticamente ativa `Secure` quando `NODE_ENV=production`.

### 4. Deploy do servidor
```bash
# Heroku, Vercel, DigitalOcean, ou seu provedor
npm install
npm start
```

---

## ❓ Troubleshooting

### "Redis connection refused"
```bash
# Verificar se Redis está rodando
redis-cli ping
# Se não: docker run -d -p 6379:6379 --name redis redis:7-alpine
```

### "sessionId cookie não aparece"
- Verificar que cliente chama com `credentials: 'include'`
- Checar CORS: `CLIENT_URL` deve ser o domínio do frontend

### "Sessão expira rápido demais"
- Verificar `SESSION_MAX_AGE` no `.env`
- Checar que Redis não foi resetado

### "Usuário fica deslogado aleatoriamente"
- Aumentar `SESSION_MAX_AGE` (padrão: 24h)
- Implementar `SessionClient.refreshSession()` periodicamente

---

## 📚 Próximos Passos

1. **Remova dependência do Supabase Auth** do HTML
   - Substitua por `session-client.js`

2. **Atualize seu `auth.js`** para usar `SessionClient`

3. **Teste login/logout**
   - Abra DevTools → Application → Cookies
   - Veja se `sessionId` aparece com flags HttpOnly, Secure, SameSite

4. **Configure HTTPS** em produção
   - Necessário para `Secure` flag funcionar

---

## 📖 Arquitetura

```
┌────────────────────────────────────────────────────────┐
│ Cliente (navegador)                                    │
│  - index.html                                          │
│  - session-client.js (novo)                            │
│  - auth.js (modificado)                                │
└────────────────────────────────────────────────────────┘
                        ▲
                        │ HTTPS
                        │ fetch() com credentials: 'include'
                        │
┌────────────────────────────────────────────────────────┐
│ Servidor Express (Node.js)                             │
│  - server/index.js                                     │
│  - Endpoints: /auth/login, /logout, /me, /refresh     │
│  - Middleware: parseJSON, CORS, cookies, auth         │
└────────────────────────────────────────────────────────┘
                        ▲
                        │ Redis Protocol
                        │
┌────────────────────────────────────────────────────────┐
│ Redis (Cache + Session Store)                          │
│  - Chave: session:{sessionId}                          │
│  - Valor: { userId, email, userMetadata, ... }        │
│  - TTL: 24 horas                                       │
│  - Múltiplos servidores → sessão compartilhada        │
└────────────────────────────────────────────────────────┘
```

---

## 🔗 Supabase Integration

O servidor ainda integra com Supabase para autenticação:

```
Client --login--> Server --auth api--> Supabase
                    │
                    │ (Supabase confirms user)
                    │
                    └──> Redis (store session)
```

Isso significa:
- Você mantém Supabase como "fonte da verdade" (users table)
- Mas sessões são gerenciadas localmente (mais rápido, escalável)

---

## ✅ Checklist de Implementação

- [ ] Redis instalado e rodando
- [ ] `server/` configurado com `npm install`
- [ ] `.env` preenchido com secrets
- [ ] Servidor Express rodando (`npm run dev`)
- [ ] HTML carregando `session-client.js`
- [ ] Login funcionando
- [ ] Cookie `sessionId` aparecendo com HttOnly flag
- [ ] `/auth/me` retornando usuário
- [ ] Logout funcionando corretamente
- [ ] Testar em múltiplos abas (sessão compartilhada)

---

**👍 Pronto! Seu sistema de sessões é seguro, escalável e rápido.**
