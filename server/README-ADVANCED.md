# server/README-ADVANCED.md

## Advanced Session Management

Versão avançada com **session rotation**, **dupla expiração** e **fingerprinting**.

### Features

| Feature | Descrição |
|---------|-----------|
| 🔄 **Session Rotation** | Novo ID gerado a cada login + privilege change |
| ⏱️  **Idle Timeout** | 30 min sem atividade |
| ⏳ **Absolute Timeout** | 24h máximo (força re-login) |
| 👁️  **Fingerprinting** | User-Agent + IP validation |
| 📋 **Audit Log** | Rastreia todas as ações (30 dias) |
| 🔐 **Multi-Session** | Gerenciar múltiplas sessões por usuário |

### Rápido Setup

```bash
# 1. Copiar arquivo
cp index-advanced.js index.js

# 2. Configurar .env
sed -i 's/SESSION_MAX_AGE.*/IDLE_TIMEOUT=1800\nABSOLUTE_TIMEOUT=86400/' .env

# 3. Rodar
npm run dev
```

### Novos Endpoints

```
POST   /auth/rotate-session           Force session rotation
GET    /auth/sessions/active          List all user sessions
DELETE /auth/sessions/:sessionId       Logout other device
GET    /auth/audit-log                View last 10 actions
POST   /auth/privilege-change          Admin revoke all user sessions
```

### Cliente

Use `js/session-client-advanced.js` para:

```javascript
SessionClient.login()                  // Login com rotation
SessionClient.rotateSession(reason)    // Force rotation
SessionClient.getActiveSessions()      // Listar sessões
SessionClient.logoutSession(id)        // Logout outro device
SessionClient.getAuditLog()            // Ver auditoria
SessionClient.onSessionExpired(cb)     // Eventos de expiração
```

### Configuração

```env
IDLE_TIMEOUT=1800          # 30 minutos
ABSOLUTE_TIMEOUT=86400     # 24 horas
```

### Segurança

✅ HttpOnly + Secure + SameSite=Lax cookies
✅ Session rotation on every login
✅ Automatic logout after expiration
✅ Audit logging for compliance
✅ IP + User-Agent validation

---

[Veja guia completo em `ADVANCED_SESSIONS.md`](../ADVANCED_SESSIONS.md)
