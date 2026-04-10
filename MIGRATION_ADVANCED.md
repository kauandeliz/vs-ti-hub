# Guia de Migração: Versão Básica → Versão Avançada

## 📋 Overview

Você criou duas versões do servidor:

| Versão | Arquivo | Features | Use Case |
|--------|---------|----------|----------|
| **Básica** | `index.js` (original) | Sessão simples, no Redis | Dev/MVP rápido |
| **Avançada** | `index-advanced.js` | Rotation, dupla expiração, fingerprinting | Produção segura |

---

## 🚀 Passos para Migração

### Passo 1: Backup
```bash
cd server
cp index.js index-basic-backup.js
cp ../../js/session-client.js ../../js/session-client-basic.js
cp ../../js/auth.js ../../js/auth-basic.js
```

### Passo 2: Ativar Versão Avançada
```bash
# Substituir arquivo principal
cp index-advanced.js index.js
```

### Passo 3: Atualizar .env
```bash
# Adicionar novos timeouts
echo "IDLE_TIMEOUT=1800" >> .env
echo "ABSOLUTE_TIMEOUT=86400" >> .env
```

### Passo 4: Atualizar Cliente JavaScript
```bash
cd ../js
# Usar novo cliente avançado
cp session-client-advanced.js session-client.js
```

### Passo 5: Testar
```bash
cd ../server
npm run dev

# Em outro terminal:
curl http://localhost:3000/health
```

Esperado:
```
✅ VS TI Hub Server running on http://localhost:3000
👆 Session Rotation: Enabled
👁️  Fingerprinting: Enabled
```

---

## 🔄 Mudanças na API

### Server Endpoints

**Novos endpoints:**
```
POST   /auth/rotate-session           (força rotation)
GET    /auth/sessions/active          (listar sessões)
DELETE /auth/sessions/:sessionId       (logout outro device)
GET    /auth/audit-log                (ver histórico)
POST   /auth/privilege-change/         (admin muda role)
```

**Endpoints existentes (compatíveis):**
```
POST   /auth/login            (agora com rotation)
POST   /auth/logout           (OK)
GET    /auth/me               (agora retorna sessionInfo)
POST   /auth/refresh          (OK, reseta idle)
```

### Cliente JavaScript

**Funções novas:**
```javascript
SessionClient.resultadoSession()        // Força rotation
SessionClient.getActiveSessions()       // Lista 
SessionClient.logoutSession(id)         // Logout outro
SessionClient.getAuditLog()             // Auditoria
SessionClient.onSessionExpired(cb)      // Callback
```

**Funções existentes (compatíveis):**
```javascript
SessionClient.login()                   // OK (com rotation)
SessionClient.logout()                  // OK
SessionClient.getCurrentUser()          // OK
SessionClient.refreshSession()          // OK (reseta idle)
```

---

## ⚠️ Breaking Changes

| Item | Antes | Depois |
|------|-------|--------|
| **SessãoID** | Persistida durante session | Regenerada a cada login |
| **Timeout config** | `SESSION_MAX_AGE` | `IDLE_TIMEOUT` + `ABSOLUTE_TIMEOUT` |
| **GET /auth/me** | Retorna `{ user }` | Retorna `{ user, session }` |
| **Cookie TTL** | 24h fixa | 30m idle (resumido por refresh) |
| **IP validation** | Não | Sim (com warnings) |
| **Audit log** | Não | Sim (últimas 10 por user) |

---

## 🛠️ Updates no Seu auth.js

### Adicionar Imports
```javascript
// Nada novo! Apenas usar SessionClient que já existe
```

### Alterar initAuth()
```javascript
// Antes:
const { data: { session } } = await _supabase.auth.getSession();

// Depois:
const hasSession = await SessionClient.initSession();
if (hasSession) {
    const user = SessionClient.getCurrentUser();
    await onSignedIn(user);
}
```

### Adicionar Session Expiration Callback
```javascript
// Novo: registrar callback
SessionClient.onSessionExpired((reason, details) => {
    if (reason === 'idle_warning') {
        showWarning(`Sessão expira em ${details.remainingMs / 60000}m`);
    } else if (reason === 'expired') {
        window.location.href = '/login';
    }
});
```

### Adicionar UI para Gerenciar Sessões
```html
<!-- Novo: botões de gerenciamento -->
<button onclick="logoutAllOtherDevices()">Logout Outros Dispositivos</button>
<button onclick="showAuditLog()">Ver Histórico de Segurança</button>
<button onclick="forceSessionRotation('password_reset')">Rotar Sessão</button>
```

Veja exemplo em `server/auth-advanced.js.example`.

---

## 🧪 Teste de Compatibilidade

### 1. Login Simples
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' \
  -c cookies.txt
```

**Esperado:**
```json
{
  "success": true,
  "user": { "id": "...", "email": "...", "userMetadata": {...} },
  "sessionId": "a1b2c3d4"
}
```

### 2. Verificar Sessão
```bash
curl -X GET http://localhost:3000/auth/me \
  -b cookies.txt
```

**Esperado:**
```json
{
  "user": { "id": "...", "email": "..." },
  "session": {
    "idleTimeoutMs": 1800000,
    "absoluteTimeoutMs": 86350000,
    "createdAt": "...",
    "lastActivityAt": "..."
  }
}
```

### 3. Listar Sessões Ativas
```bash
curl -X GET http://localhost:3000/auth/sessions/active \
  -b cookies.txt
```

**Esperado:**
```json
{
  "sessions": [
    {
      "sessionId": "a1b2c3d4",
      "createdAt": "2024-03-25T10:00:00.000Z",
      "lastActivityAt": "2024-03-25T10:35:12.000Z",
      "isCurrentSession": true
    }
  ]
}
```

### 4. Ver Audit Log
```bash
curl -X GET http://localhost:3000/auth/audit-log \
  -b cookies.txt
```

**Esperado:**
```json
{
  "entries": [
    {
      "action": "LOGIN_SUCCESS",
      "timestamp": "2024-03-25T10:00:00.000Z",
      "email": "test@example.com",
      "ip": "127.0.0.1"
    }
  ]
}
```

---

## ⏮️ Rollback (Se Necessário)

### 1. Restaurar versão básica
```bash
cp server/index-basic-backup.js server/index.js
cp js/session-client-basic.js js/session-client.js
cp js/auth-basic.js js/auth.js
```

### 2. Remover timeouts extras do .env
```bash
# Remove IDLE_TIMEOUT e ABSOLUTE_TIMEOUT se voltou ao básico
sed -i '/IDLE_TIMEOUT/d; /ABSOLUTE_TIMEOUT/d' server/.env
```

### 3. Reiniciar servidor
```bash
npm run dev
```

---

## 📊 Comparação: Antes vs Depois

### Segurança
```
Básico:
- ✅ Sessão em Redis
- ✅ HttpOnly cookies
- ❌ SemRotation
- ❌ Sem expiração dupla
- ❌ Sem fingerprinting

Avançado:
- ✅ Sessão em Redis
- ✅ HttpOnly cookies
- ✅ ✅ ✅ Session rotation
- ✅ ✅ ✅ Idle + Absolute timeouts
- ✅ ✅ ✅ Fingerprinting + audit log
```

### Performance
```
Ambos: IDÊNTICO
- Redis queries equally fast
- Fingerprint hash = negligível
- No extra network calls
```

### Banco de Dados
```
Básico:
- 1 chave Redis por sessão

Avançado:
- 1 chave Redis por sessão
- + 1 chave Redis por audit entry (último 30 dias)
- ~negligível (Redis pode guardar trilhões de keys)
```

---

## 🎓 Casos de Uso

### Quando Usar Versão Básica
- ✅ Prototipagem rápida
- ✅ MVP sem requisitos de segurança
- ✅ Aplicação interna (confiança alta)
- ✅ Dev/staging

### Quando Usar Versão Avançada
- ✅ Produção com dados sensíveis
- ✅ App financeira/banking
- ✅ Healthcare/HIPAA
- ✅ SaaS multi-tenant
- ✅ Qualquer app com compliance reqs
- ✅ Quando você quer sleep à noite 😴

---

## 📞 Troubleshooting

### "Erro ao fazer login após migração"
**Problema:** Segurança CORS ou fingerprinting.

**Solução:**
```bash
# Verifique .env
grep -E "(CLIENT_URL|IDLE_TIMEOUT)" .env

# Tente desabilitar fingerprinting temporariamente
# (comentar validação em index.js)
```

### "Sessão expira muito rápido"
**Problema:** `IDLE_TIMEOUT` menor que esperado.

**Solução:**
```bash
# Aumentar timeout
sed -i 's/IDLE_TIMEOUT=.*/IDLE_TIMEOUT=3600/' .env
# Reiniciar servidor
npm run dev
```

### "Audit log cresce muito rápido"
**Problema:** Muitos eventos sendo registrados.

**Solução:**
```bash
# Reduzir frequência de eventos em index.js
# Ou aumentar TTL de 30 dias para mais
```

---

## ✅ Final Checklist

Após migração:

- [ ] Versão avançada rodando (`npm run dev`)
- [ ] Health check OK (`curl http://localhost:3000/health`)
- [ ] Login funcionando
- [ ] Cookie sessionId aparecendo com HttpOnly flag
- [ ] `/auth/me` retornando `sessionInfo`
- [ ] `/auth/sessions/active` listando sessões
- [ ] `/auth/audit-log` mostrando eventos
- [ ] Session expirando após 30 min de inatividade (no teste)
- [ ] Auto-refresh a cada 10 min funcionando
- [ ] Client callbacks de expiração funcionando
- [ ] UI mostrando warnings de timeout

---

**Pronto para produção! 🚀**

Dúvidas? Ver `ADVANCED_SESSIONS.md` para mais detalhes.
