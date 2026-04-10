# Migração: Supabase Auth → Redis Sessions

## 📝 Resumo das Alterações

Seu projeto está migrando de **Supabase Auth** (baseado em token JWT) para **Redis Sessions** (server-side). Aqui estão as mudanças principais:

| Aspecto | Antes (Supabase) | Depois (Redis) |
|--------|----------------|----------------|
| **Store** | Supabase (cloud) | Redis (local + escalável) |
| **Sessão** | JWT no localStorage | SessionId em cookie HttpOnly |
| **Validação** | Cliente valida JWT | Servidor valida em Redis |
| **Múltiplos servidores** | ❌ (stateful) | ✅ (stateless) |
| **Performance** | Network call cada vez | Cache RAM (ms) |
| **Segurança (XSS)** | JWT em localStorage (vulnerável) | Cookie HttpOnly (protegido) |

---

## 🔄 Como Migrar

### Passo 1: Fazer Backup
```bash
cp js/auth.js js/auth.js.backup
```

### Passo 2: Estudar o Exemplo
Abra `server/auth-with-sessions.js.example` e veja a comparação linha por linha.

---

## 🎯 Mudanças Principais

### 1️⃣ Substituir inicialização

**ANTES:**
```javascript
const { data: { session }, error } = await _supabase.auth.getSession();
if (session?.user) {
    await onSignedIn(session.user);
}
```

**DEPOIS:**
```javascript
const hasSession = await SessionClient.initSession();
if (hasSession) {
    const user = SessionClient.getCurrentUser();
    await onSignedIn(user);
}
```

---

### 2️⃣ Substituir login

**ANTES:**
```javascript
const { data, error } = await _supabase.auth.signInWithPassword({
    email: email,
    password: password
});

if (error) {
    showLoginError(error.message);
} else {
    await onSignedIn(data.user);
}
```

**DEPOIS:**
```javascript
const result = await SessionClient.login(email, password);

if (result.success) {
    await onSignedIn(result.user);
} else {
    showLoginError(result.error);
}
```

---

### 3️⃣ Substituir logout

**ANTES:**
```javascript
const { error } = await _supabase.auth.signOut();
if (!error) {
    onSignedOut();
}
```

**DEPOIS:**
```javascript
const success = await SessionClient.logout();
if (success) {
    onSignedOut();
}
```

---

### 4️⃣ Remover listener de auth state

**ANTES:**
```javascript
_supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
        await onSignedIn(session.user);
    } else {
        onSignedOut();
    }
});
```

**DEPOIS:**
```javascript
// Verifique periodicamente se a sessão foi destruída
setInterval(async () => {
    const user = SessionClient.getCurrentUser();
    if (!user) {
        onSignedOut();
    }
}, 300000); // A cada 5 minutos
```

---

### 5️⃣ Remover listener de auth (onAuthStateChange)

Não é mais necessário fazer:
```javascript
// ❌ REMOVA ISTO:
// const { data: { subscription } } = _supabase.auth.onAuthStateChange(...)
```

O SessionClient não expõe eventos, apenas estados. Use polling se necessário.

---

### 6️⃣ Objeto User mudou de forma

**ANTES (Supabase):**
```javascript
{
    id: "uuid",
    email: "user@example.com",
    user_metadata: { role: "admin" },
    ...muitos outros campos
}
```

**DEPOIS (Sessions):**
```javascript
{
    id: "uuid",
    email: "user@example.com",
    userMetadata: { role: "admin" }  // note: camelCase
}
```

---

## ✅ Checklist de Migração

- [ ] Instalar Redis e rodar servidor (`npm run dev`)
- [ ] Criar backup do `auth.js` original
- [ ] Incluir `<script src="js/session-client.js"></script>` no HTML
- [ ] Remover dependência de Supabase Auth (deixar apenas SDK se precisar de CRUD)
- [ ] Substituir `initAuth()` para usar `SessionClient.initSession()`
- [ ] Substituir `handleLogin()` para usar `SessionClient.login()`
- [ ] Substituir `handleLogout()` para usar `SessionClient.logout()`
- [ ] Remover `onAuthStateChange()` listener
- [ ] Testar login/logout em navegador
- [ ] Verificar que `sessionId` cookie aparece com flags HttpOnly, Secure, SameSite
- [ ] Testar em múltiplas abas (deve compartilhar sessão)
- [ ] Testar expiração de sessão (aguardar 24h ou resetar Redis)

---

## 🔧 Supabase Ainda Precisa Ser Usado?

**Sim, mas apenas para:**
- Armazenar dados de usuários (users table)
- Verificar credenciais (login)
- Operações de banco de dados normais (CRUD)

**Não mais para:**
- Controlar sessão (Redis faz isso agora)
- Invalidar tokens (Redis gerencia TTL)
- Armazenar estado de autenticação (Redis faz isso)

---

## 🚨 Possíveis Erros

### "SessionClient is not defined"
- Verificar que `<script src="js/session-client.js"></script>` está no HTML
- Verificar que está ANTES de outros scripts que usem SessionClient

### "Cookie sessionId não aparece"
- Verificar que servidor está rodando (`npm run dev`)
- Verificar que `CLIENT_URL` no `.env` é correto
- Abrir DevTools → Application → Cookies

### "getUserMetadata is not a property"
- Lembrar que agora é `userMetadata` (camelCase), não `user_metadata`

### "Login retorna 'CORS error'"
- Verificar que servidor está rodando
- Debugar com `console.log(result)` para ver erro real
- Verificar `CLIENT_URL` está correto em `.env`

---

## 📊 Estrutura de Dados Comparada

### Antes (Supabase)
```javascript
// localStorage['Session'] = JWT token
const session = {
    access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    refresh_token: "...",
    expires_in: 3600,
    token_type: "bearer",
    user: {
        id: "uuid",
        email: "user@example.com",
        user_metadata: { role: "admin" }
    }
}

// Cliente decodifica JWT para validar
```

### Depois (Redis)
```javascript
// Cookie: sessionId=abc123def456... (HttpOnly)
// Redis: session:abc123def456 = {
//    userId: "uuid",
//    email: "user@example.com",
//    userMetadata: { role: "admin" },
//    createdAt: "2024-03-25T10:00:00Z"
// }
// TTL: 86400 (24h)

// Servidor valida consultando Redis
```

---

## 🎓 Por que Redis é melhor?

1. **Escalabilidade**: Múltiplos servidores compartilham mesma sessão
2. **Performance**: Redis em RAM é mais rápido que JWT decode
3. **Segurança**: Cookie HttpOnly protege contra XSS
4. **Controle**: Admin pode revogar sessão instantaneamente
5. **Simplicidade**: Não precisa lidar com expiração de JWT manualmente

---

## 📈 Próximos Passos Avançados

- Implementar "Remember Me" (estender TTL)
- Implementar 2FA com Redis
- Criar dashboard de sessões ativas
- Logout de todas as sessões do usuário
- Rate limiting de tentativas de login
- Detectar múltiplos logins simultâneos

---

**Dúvidas? Veja `SESSIONS.md` para mais detalhes.**
