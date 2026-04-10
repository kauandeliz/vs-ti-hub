# Quick Reference - Advanced Sessions

## 🚀 Setup (5 minutos)

```bash
# 1. Ativar versão avançada
cd server
cp index-advanced.js index.js

# 2. Configurar timeouts
echo "IDLE_TIMEOUT=1800" >> .env
echo "ABSOLUTE_TIMEOUT=86400" >> .env

# 3. Usar cliente avançado
cd ../js
cp session-client-advanced.js session-client.js

# 4. Rodar
cd ../server
npm run dev
```

---

## 📡 Endpoints

### Login & Logout

```javascript
// Login (gera novo sessionId)
POST /auth/login
  { email, password }
  → { success, user, sessionId }

// Logout (destroi sessão)
POST /auth/logout
  → { success }

// Get current user + session info
GET /auth/me
  → { user, session: { idleTimeoutMs, absoluteTimeoutMs, ... } }
```

### Session Management

```javascript
// Listar todas as sessões do user
GET /auth/sessions/active
  → { sessions: [ { sessionId, createdAt, isCurrentSession } ] }

// Logout uma sessão específica (outro device)
DELETE /auth/sessions/:sessionId
  → { success }

// Forçar rotation (logout + novo login requerido)
POST /auth/rotate-session
  { reason?: 'manual' | 'password_reset' | ... }
  → { success, message }

// Renovar sessão (estende idle timeout)
POST /auth/refresh
  → { success }
```

### Admin/Audit

```javascript
// Invalidar todas as sessões de um user (quando role muda)
POST /auth/privilege-change  (admin only)
  { userId, newRole }
  → { success, sessionsRotated }

// Ver audit log (últimas 10 ações)
GET /auth/audit-log
  → { entries: [ { action, timestamp, ip, ... } ] }
```

---

## 💻 Cliente JavaScript

### Carregar

```html
<script src="js/session-client-advanced.js"></script>
```

### Usar

```javascript
// Login com auto-management
const result = await SessionClient.login(email, password);
if (result.success) {
    // Auto-refresh: 10 em 10 min
    // Timeouts: warnings + auto-logout
}

// Logout
await SessionClient.logout();

// Refresh manual
await SessionClient.refreshSession();

// Ver sessões ativas
const sessions = await SessionClient.getActiveSessions();

// Logout outro device
await SessionClient.logoutSession(sessionId);

// Forçar rotation
await SessionClient.rotateSession('password_reset');

// Ver auditoria
const logs = await SessionClient.getAuditLog();

// Registrar callback para expiração
SessionClient.onSessionExpired((reason, details) => {
    if (reason === 'idle_warning') {
        showWarning(`Expira em ${details.remainingMs / 60000}m`);
    } else if (reason === 'expired') {
        window.location.href = '/login';
    }
});
```

---

## ⏱️ Timeouts

| Config | Padrão | O que faz |
|--------|--------|----------|
| `IDLE_TIMEOUT` | 1800s (30m) | Expira se user inativo |
| `ABSOLUTE_TIMEOUT` | 86400s (24h) | Expira após 24h total |
| Auto-refresh | 10m | Estende idle se ativo |

### Timeline Exemplo

```
10:00 - Login
10:10 - Auto-refresh (idle reseta)
10:20 - User no app, refresh automático
10:29:59 - Última atividade
10:30:00 - ❌ IDLE TIMEOUT (30 min sem atividade)
```

---

## 🔐 Segurança

### Cookies (Automaticamente)
- ✅ **HttpOnly**: JS não acessa
- ✅ **Secure**: HTTPS em produção
- ✅ **SameSite=Lax**: CSRF protection

### Session Rotation
- ✅ Novo ID **every login**
- ✅ Novo ID after **privilege change**
- ✅ Detecta **manual rotation**

### Fingerprinting
- ✅ Valida **User-Agent** (browser)
- ✅ Valida **IP** (subnet)
- ✅ Log de **mudanças suspeitas**
- ⚠️ Não bloqueia (apenas audit)

### Audit Trail
- ✅ Rastreia: LOGIN, LOGOUT, REFRESH, ROTATION, IP_CHANGED, etc
- ✅ Últimas 10 por user
- ✅ TTL de 30 dias em Redis

---

## 🧪 Testar

### No Console do Navegador

```javascript
// Carregar testes
fetch('server/test-advanced-sessions.js').then(r => r.text()).then(eval);

// Rodar tudo
AdvancedTests.runAll();

// Testes individuais
AdvancedTests.testSessionRotation();
AdvancedTests.testIdleTimeout();
AdvancedTests.testAuditLog();
```

### Via cURL

```bash
# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ex.com","password":"pass"}' \
  -c cookies.txt

# Verificar sessão
curl -X GET http://localhost:3000/auth/me -b cookies.txt

# Listar sessões
curl -X GET http://localhost:3000/auth/sessions/active -b cookies.txt

# Ver auditoria
curl -X GET http://localhost:3000/auth/audit-log -b cookies.txt

# Logout
curl -X POST http://localhost:3000/auth/logout -b cookies.txt
```

---

## 🎯 Common Tasks

### "Logout all other devices"
```javascript
const sessions = await SessionClient.getActiveSessions();
for (const s of sessions) {
    if (!s.isCurrentSession) {
        await SessionClient.logoutSession(s.sessionId);
    }
}
```

### "Ver quando sessão expira"
```javascript
const info = SessionClient.getSessionInfo();
const expiresIn = info.idleTimeoutMs / 60000; // minutos
console.log(`Expira em ${expiresIn.toFixed(1)} minutos`);
```

### "Forçar re-login após password change"
```javascript
await SessionClient.rotateSession('password_reset');
// User é deslogado automaticamente
// Precisa fazer login novamente
```

### "Admin invalida sessões de um user"
```javascript
// Backend (admin endpoint):
POST /auth/privilege-change
{ userId: "abc123", newRole: "viewer" }
// Todas as sessões do user são destruídas
```

### "Ver histórico de atividade do user"
```javascript
const entries = await SessionClient.getAuditLog();
entries.forEach(e => {
    console.log(`${e.action} - ${e.timestamp}`);
    if (e.ip) console.log(`  IP: ${e.ip}`);
});
```

---

## ⚙️ Configuração Recomendada

### Desenvolvimento
```env
IDLE_TIMEOUT=3600          # 1 hora
ABSOLUTE_TIMEOUT=604800    # 7 dias
NODE_ENV=development
```

### Produção (Default)
```env
IDLE_TIMEOUT=1800          # 30 minutos
ABSOLUTE_TIMEOUT=86400     # 24 horas
NODE_ENV=production
```

### Produção (Stricto)
```env
IDLE_TIMEOUT=900           # 15 minutos
ABSOLUTE_TIMEOUT=43200     # 12 horas
NODE_ENV=production
```

---

## 📊 Redis Keys

```
session:{sessionId}
  └─ { userId, email, userMetadata, createdAt, lastActivityAt, fingerprint, ip }
  └─ TTL: IDLE_TIMEOUT (30m)

audit:{userId}:{timestamp}
  └─ { action, timestamp, ip, oldIp, newIp, ... }
  └─ TTL: 30 dias
```

---

## 🐛 Troubleshooting

### Login não funciona
```bash
# Checar logs do servidor
npm run dev

# Testar endpoint
curl http://localhost:3000/auth/login
```

### Sessão expira muito rápido
```bash
# Aumentar IDLE_TIMEOUT
echo "IDLE_TIMEOUT=3600" >> .env

# Reiniciar
npm run dev
```

### Fingerprint warnings em locais móveis
```javascript
// Esperado: VPN, Cellular, WiFi muda IP
// Solução: Ignorar warnings em audit (ou implementar 2FA)
```

### Session não persiste entre abas
```javascript
// Usar SessionClient.initSession() em todas as abas
// Cookie é compartilhada automaticamente pelo navegador
await SessionClient.initSession();
```

---

## 📚 Documentação Completa

- **[ADVANCED_SESSIONS.md](../ADVANCED_SESSIONS.md)** - Guia detalhado
- **[MIGRATION_ADVANCED.md](../MIGRATION_ADVANCED.md)** - Como migrar
- **[server/auth-advanced.js.example](auth-advanced.js.example)** - Integração no HTML

---

## 🚀 Próximos Passos

1. ✅ Features básicas: Login, logout, refresh
2. ✅ Session rotation: Novo ID every login
3. ✅ Dupla expiração: Idle + Absolute
4. ✅ Fingerprinting: UA + IP tracking
5. ✅ Audit log: Rastreamento de ações

### Possíveis Melhorias

- [ ] 2FA (Two-Factor Authentication)
- [ ] IP whitelist
- [ ] Device registration ("Remember this device")
- [ ] Rate limiting de login
- [ ] CAPTCHA après falhas
- [ ] Email alerts para ações críticas

---

**Pronto! Seu sistema é seguro, escalável e auditável. 🎉**
