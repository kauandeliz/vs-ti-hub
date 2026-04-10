# Segurança Avançada de Sessões

## 📋 Features Implementadas

### 1️⃣ Session Rotation
- ✅ Nova sessionId gerada **sempre no login** (nunca reutiliza)
- ✅ Rotation automático em **mudanças de privilégio** (role change)
- ✅ Manual via `POST /auth/rotate-session`
- ✅ All old sessions invalidadas instantaneamente

### 2️⃣ Dupla Expiração
- ✅ **Idle Timeout**: 30 minutos sem atividade
- ✅ **Absolute Timeout**: 24 horas máximo (independente de atividade)
- ✅ Refresh automático a cada 10 minutos (se ativo)
- ✅ Warnings antes de expiração

### 3️⃣ Fingerprinting
- ✅ Validação de **User-Agent** (browser + versão major)
- ✅ Validação de **IP** (detecta mudanças de subnet)
- ✅ Logs de detecção de mudanças
- ✅ Não bloqueia por padrão (apenas log + audit)

### 4️⃣ Audit Log
- ✅ Registra todos os eventos: login, logout, rotation, mudanças
- ✅ Acessível via API para o usuário visualizar
- ✅ TTL de 30 dias em Redis

---

## 🔄 Session Rotation em Detalhes

### Quando Ocorre

| Evento | Efeito |
|--------|--------|
| **Login bem-sucedido** | Novo sessionId gerado |
| **Privilege change** (admin muda role) | Todas as sessões do usuário rotacionadas |
| **Logout** | Session destruída |
| **Expiração (idle/absolute)** | Session automaticamente removida |
| **Manual** | Via `/auth/rotate-session` |

### Exemplo: Privilégio Change

```
Admin faz PATCH /users/123 → role: "admin"
  ↓
Backend chama POST /auth/privilege-change
  ↓
Todas as sessões de user 123 são invalidadas
  ↓
User é desconectado automaticamente
  ↓
Precisa fazer login novamente com new role
```

---

## ⏱️ Dupla Expiração Explicada

### Idle Timeout (30 minutos)

```
User faz login → sessionId criado
    ↓
User inativo por 25 min → OK (não expirou)
    ↓
User clica mouse/digita → Idle timer resetado
    ↓
User inativo por 30 min → ❌ Session expirada
    ↓
Próxima requisição retorna 401 Unauthorized
```

**Auto-refresh a cada 10 min:**
- Se user está ativo, auto-refresh estende o timeout
- Se inativo, expira normalmente após 30 min

**Manual refresh:**
```javascript
// Usuário quer renovar sessão
await SessionClient.refreshSession();
// TTL estendido por 30 min
```

### Absolute Timeout (24 horas)

```
User faz login às 10:00 → createdAt = 10:00
    ↓
User muito ativo, refresh a cada 10 min
    ↓
Às 10:29 → OK (20h 1m restante)
    ↓
Às 10:59 (24h depois) → ❌ Expired!
    ↓
Mesmo que user esteja ativo, session expirou
    ↓
Precisa fazer login novamente
```

**Por quê dupla?**
- **Idle**: Protege sessões órfãs (user deixou browser aberto)
- **Absolute**: Força reautenticação periodicamente (segurança)

---

## 👁️ Fingerprinting Detalhado

### O que é Rastreado

| Item | Detalhes |
|------|----------|
| **User-Agent** | Navegador + Major version (ex: Chrome/124) |
| **IP Address** | Primeira 3 casas (subnet) |
| **Hash** | SHA256 do User-Agent normalizado + IP |

### Detecção de Mudanças

```
User em Chrome no IP 192.168.1.100
    ↓
Session fingerprint = SHA256("Chrome/124|192.168.1")
    ↓
Próxima requisição do user (ainda em Chrome, mesma rede)
    ↓
Fingerprint idêntico → ✅ OK, atividade normal
    ↓
Requisição de IP 203.0.113.50 (outro país/provedor)
    ↓
Fingerprint diferente → ⚠️ ALERTA
    ↓
Log: "IP mudou de 192.168 para 203.0"
    ↓
Audit entry criada (user pode ver)
```

### Exemplo de Resultado

```javascript
// Quando há mudança detectada:
{
  action: "SESSION_IP_CHANGED",
  timestamp: "2024-03-25T10:35:00.000Z",
  oldIp: "192.168.1.100",
  newIp: "203.0.113.50",
  sessionId: "a1b2c3d4"
}
```

### Tolerância

**Não bloqueia automaticamente porque:**
- VPN pode mudar IP
- Cellular → WiFi muda subnet
- Empresas com múltiplos proxies

**Mas registra para auditoria:**
- User pode revisar em `/auth/audit-log`
- Admin pode investigar
- Se mudar radicalmente (país), pode implementar 2FA

---

## 📡 Novos Endpoints

### `POST /auth/rotate-session`
Force session rotation (logout da sessão atual).

**Requisição:**
```javascript
const result = await fetch('http://localhost:3000/auth/rotate-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
        reason: 'password_reset' // opcional
    })
});
```

**Response:**
```json
{
  "success": true,
  "message": "Session rotated - please login again"
}
```

---

### `GET /auth/sessions/active`
List todas as sessões ativas do usuário.

**Response:**
```json
{
  "sessions": [
    {
      "sessionId": "a1b2c3d4",
      "createdAt": "2024-03-25T10:00:00.000Z",
      "lastActivityAt": "2024-03-25T10:35:12.000Z",
      "isCurrentSession": true
    },
    {
      "sessionId": "x9y8z7w6",
      "createdAt": "2024-03-24T15:20:00.000Z",
      "lastActivityAt": "2024-03-24T18:15:00.000Z",
      "isCurrentSession": false
    }
  ]
}
```

**Use case: "Logout all other devices"**
```javascript
const sessions = await SessionClient.getActiveSessions();

for (const session of sessions) {
    if (!session.isCurrentSession) {
        await SessionClient.logoutSession(session.sessionId);
    }
}
```

---

### `GET /auth/audit-log`
Retrieve últimas 10 entradas de auditoria do usuário.

**Response:**
```json
{
  "entries": [
    {
      "action": "LOGIN_SUCCESS",
      "timestamp": "2024-03-25T10:00:00.000Z",
      "email": "user@example.com",
      "ip": "192.168.1.100"
    },
    {
      "action": "SESSION_IP_CHANGED",
      "timestamp": "2024-03-25T10:35:00.000Z",
      "oldIp": "192.168.1.100",
      "newIp": "203.0.113.50"
    },
    {
      "action": "SESSION_REFRESHED",
      "timestamp": "2024-03-25T10:40:00.000Z",
      "sessionId": "a1b2c3"
    }
  ]
}
```

---

### `POST /auth/privilege-change` (Internal Admin)
Usado quando admin muda role de um usuário.

**Requisição:**
```javascript
// Admin API call
const result = await fetch('http://localhost:3000/auth/privilege-change', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
        userId: 'user-uuid',
        newRole: 'admin'
    })
});
```

**Response:**
```json
{
  "success": true,
  "sessionsRotated": 2,
  "message": "2 session(s) invalidated due to privilege change"
}
```

---

## 🛠️ Inicializar Servidor Avançado

### 1. Backup do servidor antigo
```bash
cd server
cp index.js index-basic.js
```

### 2. Copiar novo servidor
```bash
cp index-advanced.js index.js
```

### 3. Atualizar `.env`
```env
# Novos timeouts (em segundos):
IDLE_TIMEOUT=1800        # 30 minutos
ABSOLUTE_TIMEOUT=86400   # 24 horas
```

### 4. Rodar novo servidor
```bash
npm run dev
```

Esperado:
```
✅ VS TI Hub Server running on http://localhost:3000
🔐 Idle Timeout: 30m
⏱️  Absolute Timeout: 24h
👆 Session Rotation: Enabled
👁️  Fingerprinting: Enabled
```

---

## 💻 Usar no Cliente

### HTML
```html
<!-- Use o novo cliente avançado -->
<script src="js/session-client-advanced.js"></script>
```

### JavaScript

**Login com auto-management:**
```javascript
// Faz login E inicia auto-refresh + timeouts
const result = await SessionClient.login(email, password);

if (result.success) {
    // Auto-refresh: a cada 10 min
    // Idle warning: 5 min antes de expirar
    // Absolute warning: 1 hora antes de expirar
}
```

**Registrar callback de expiração:**
```javascript
SessionClient.onSessionExpired((reason, details) => {
    if (reason === 'idle_warning') {
        showWarning(`Sessão expira em ${details.remainingMs / 60000}m`);
    } else if (reason === 'expired') {
        showError('Sessão expirou - faça login novamente');
        window.location.href = '/login';
    }
});
```

**Ver sessões ativas:**
```javascript
const sessions = await SessionClient.getActiveSessions();
// [
//   { sessionId: "abc", createdAt: "...", isCurrentSession: true },
//   { sessionId: "xyz", createdAt: "...", isCurrentSession: false }
// ]
```

**Logout all other devices:**
```javascript
const sessions = await SessionClient.getActiveSessions();
for (const s of sessions) {
    if (!s.isCurrentSession) {
        await SessionClient.logoutSession(s.sessionId);
    }
}
showSuccess('Todos outros dispositivos foram desconectados');
```

**Ver audit log:**
```javascript
const entries = await SessionClient.getAuditLog();
entries.forEach(entry => {
    console.log(`${entry.action} - ${entry.timestamp}`);
});
```

---

## 🔐 Configurações de Produção

### 1. Aumentar Timeout para Absolute
```env
# Para aplicação 24/7, aumentar para 7 dias
ABSOLUTE_TIMEOUT=604800  # 7 dias
```

### 2. Reduzir Idle para Segurança
```env
# Para app financeiro, reduzir para 15 min
IDLE_TIMEOUT=900  # 15 minutos
```

### 3. Implementar Fingerprinting Mais Forte
No `index.js`, adicionar:
```javascript
// Modo strict: bloqueia mudanças
const FINGERPRINT_MODE = 'strict'; // ou 'warn'

if (FINGERPRINT_MODE === 'strict' && fingerprint changed) {
    // Bloqueia acesso
    return res.status(403).json({ error: 'Fingerprint mismatch' });
}
```

### 4. Rate Limiting
```javascript
// Após N tentativas de login, bloquear IP
const loginAttempts = new Map(); // ou Redis key

if (loginAttempts.get(ip) > 5 && recentTime) {
    return res.status(429).json({ error: 'Too many attempts' });
}
```

---

## 📊 Eventos de Auditoria

Todos os eventos registrados em Redis:

| evento | quando | dados |
|--------|--------|-------|
| `LOGIN_SUCCESS` | Login bem-sucedido | email, ip |
| `LOGIN_FAILED` | Credenciais inválidas | email, reason |
| `LOGOUT` | User faz logout | sessionId |
| `SESSION_REFRESHED` | Auto-refresh ou manual | sessionId |
| `SESSION_ROTATED` | Rotation manual | oldSessionId, reason |
| `SESSION_IP_CHANGED` | IP mudou | oldIp, newIp |
| `SESSION_UA_CHANGED` | User-Agent mudou | - |
| `SESSION_IDLE_EXPIRED` | Timeout por inatividade | - |
| `SESSION_ABSOLUTE_EXPIRED` | Timeout absoluto | - |
| `PRIVILEGE_CHANGED` | Admin muda role | targetUserId, newRole, sessionsRotated |
| `LOGOUT_OTHER` | User logout outro device | targetSessionId |

---

## 🎓 Fluxograma Completo

```
┌──────────────────────────────────────┐
│ User Faz Login                       │
└─────────────┬────────────────────────┘
              │
              ▼
      ┌───────────────────┐
      │ Valida com        │
      │ Supabase (email)  │
      └───────┬───────────┘
              │
        ┌─────┴─────┐
        │           │
      ✅ OK      ❌ Erro
        │           │
        ▼           ▼
   ┌─────────┐   Retorna 401
   │ Gera    │   + audit log
   │ novo    │
 │ sessionId
   └────┬────┘
        │
        ▼
   ┌──────────────────────┐
   │ Cria Fingerprint     │
   │ (User-Agent + IP)    │
   └────┬─────────────────┘
        │
        ▼
   ┌──────────────────────────┐
   │ Salva em Redis           │
   │ Key: session:{id}        │
   │ TTL: IDLE_TIMEOUT (30m)  │
   │ Data: user + timestamps  │
   └────┬─────────────────────┘
        │
        ▼
  ┌──────────────────────────┐
  │ Set Cookie (HttpOnly)    │
  │ Secure + SameSite=Lax    │
  └────┬─────────────────────┘
       │
       ▼
  ┌──────────────────────────┐
  │ Inicia Auto-Management   │
  │ - Refresh a cada 10m     │
  │ - Warnings antes de expi │
  │ - Idle detection         │
  └────┬─────────────────────┘
       │
       └─→ ✅ Login Success


Durante Sessão:
┌──────────────────────────┐
│ User faz requisição      │
└────┬─────────────────────┘
     │
     ▼
┌──────────────────────────┐
│ Load session do Redis    │
└────┬─────────────────────┘
     │
     ├─→ Não existe? → Retorna 401 (não autenticado)
     │
     └─→ Existe?
         │
         ▼
     ┌──────────────────────────┐
     │ Verifica absolute timeout │
     └────┬─────────────────────┘
         │
         ├─→ Sim? → Destroi + retorna 401
         │
         └─→ Não? → Continua
             │
             ▼
         ┌──────────────────────────┐
         │ Valida Fingerprint       │
         │ (User-Agent, IP)         │
         └────┬─────────────────────┘
             │
             ├─→ IP mudou? → Log audit warning
             │
             ├─→ UA mudou? → Log audit warning
             │
             └─→ Falha grave? → Bloqueia (optional)
                 │
                 ▼
             ┌──────────────────────┐
             │ Atualiza lastActivity │
             │ (reseta idle timeout) │
             └────┬─────────────────┘
                 │
                 └─→ ✅ Requisição processada
```

---

## ✅ Segurança vs Conveniência

### Configuração Paranoia (Max Security)
```env
IDLE_TIMEOUT=300           # 5 minutos
ABSOLUTE_TIMEOUT=3600      # 1 hora
FINGERPRINT_MODE=strict    # Bloqueia mudanças
```
👍 Muito seguro | 👎 User fico frustrado (logout frequente)

### Configuração Balanço (Recomendado)
```env
IDLE_TIMEOUT=1800          # 30 minutos
ABSOLUTE_TIMEOUT=86400     # 24 horas
FINGERPRINT_MODE=warn      # Log apenas
```
👍 Seguro + usável | 👎 Moderado log de warnings

### Configuração Permissiva (Max Convenience)
```env
IDLE_TIMEOUT=3600          # 1 hora
ABSOLUTE_TIMEOUT=604800    # 7 dias
FINGERPRINT_MODE=off       # Desativa
```
👎 Menos seguro | 👍 User praticamente nunca faz logout

**Recomendação:**
- Usar **Balanço** por padrão
- Aumentar para **Paranoia** em áreas sensíveis (admin, financeiro)

---

## 📚 Próximos Passos

1. ✅ Implementado: Tudo acima
2. 🔄 Considerar: 2FA (Two-Factor Auth)
3. 🔄 Considerar: CAPTCHA após falhas
4. 🔄 Considerar: IP whitelist
5. 🔄 Considerar: Device registration ("remember this device")

---

**Sistema pronto para produção! 🚀**
