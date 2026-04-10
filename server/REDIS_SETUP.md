# Configuração Redis para Session Management

## 📋 Pré-requisitos

- **Node.js** >= 16
- **Redis** >= 6.0

---

## 🚀 Instalação

### 1. Instalar Redis

#### Windows (WSL2 recomendado ou Docker)

**Opção A: Docker (recomendado)**
```bash
docker run -d -p 6379:6379 --name redis redis:7-alpine
```

**Opção B: WSL2**
```bash
# Inside WSL2
sudo apt update
sudo apt install redis-server
redis-server
```

**Opção C: Redis Windows (usar apenas em dev local)**
- Download em: https://github.com/microsoftarchive/redis/releases
- Descompactar e rodar `redis-server.exe`

#### macOS
```bash
brew install redis
brew services start redis
```

#### Linux
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
```

---

### 2. Verificar Redis está rodando
```bash
redis-cli ping
# Resposta esperada: PONG
```

---

### 3. Configurar o servidor

```bash
cd server
cp .env.example .env
```

**Editar `.env` com suas valores:**
```env
PORT=3000
NODE_ENV=development

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=         # deixar vazio se sem senha
REDIS_DB=0

SESSION_SECRET=your-super-secret-generate-this
SESSION_MAX_AGE=86400000

CLIENT_URL=http://localhost:8080

SUPABASE_URL=https://ufoykcfcaygtwwpwwhyl.supabase.co
SUPABASE_ANON=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Gerar um `SESSION_SECRET` seguro:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 4. Instalar dependências

```bash
npm install
```

---

### 5. Iniciar o servidor

**Desenvolvimento (com hot-reload):**
```bash
npm run dev
```

**Produção:**
```bash
npm start
```

Esperado:
```
✅ VS TI Hub Server running on http://localhost:3000
📍 Environment: development
🔐 Session TTL: 24h
🗄️  Redis: localhost:6379
🌐 CORS: http://localhost:8080
✅ Redis connected
```

---

## 📡 Endpoints da API

### `POST /auth/login`
Autentica usuário e cria sessão.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "senha123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "userMetadata": { "role": "admin" }
  }
}
```
*Header `Set-Cookie`: sessionId cookie com flags HttpOnly, Secure, SameSite=Lax*

**Response (Error):**
```json
{
  "error": "Invalid credentials",
  "code": "AUTH_FAILED"
}
```

---

### `GET /auth/me`
Retorna dados da sessão atual.

**Response (Authenticated):**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "userMetadata": { "role": "admin" }
  }
}
```

**Response (Not Authenticated):**
```json
{
  "user": null
}
```

---

### `POST /auth/logout`
Destroy a sessão e limpa o cookie.

**Response:**
```json
{
  "success": true
}
```

---

### `POST /auth/refresh`
Extend session TTL (útil para keep-alive).

**Response:**
```json
{
  "success": true
}
```

---

### `DELETE /auth/sessions/:sessionId`
Revocar uma sessão específica (admin only).

**Response:**
```json
{
  "success": true
}
```

---

### `GET /health`
Health check para monitoramento.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-03-25T10:30:00.000Z"
}
```

---

## 🔒 Segurança - Flags de Cookie

Todas as cookies de sessão incluem:

| Flag | Valor | Propósito |
|------|-------|----------|
| **HttpOnly** | true | Protege contra ataques XSS (JavaScript não pode acessar) |
| **Secure** | true* | Só envia sobre HTTPS em produção |
| **SameSite** | Lax | Protege contra CSRF; permite navegação (e.g., links) |
| **Path** | / | Cookie disponível em toda a aplicação |
| **MaxAge** | 86400000ms (24h) | Tempo de expiração |

*`Secure` é automático em produção (`NODE_ENV=production`)

---

## 🗄️ Estrutura Redis

Sessões são armazenadas como:

```
Key: session:{sessionId}
Value: {
  "userId": "uuid",
  "email": "user@example.com",
  "userMetadata": { "role": "admin" },
  "createdAt": "2024-03-25T10:30:00.000Z"
}
TTL: 86400 segundos (24 horas)
```

---

## 📊 Monitoramento Redis

### Ver todas as sessões ativas
```bash
redis-cli
> KEYS session:*
> DBSIZE

# Ver uma sessão específica
> GET session:{sessionId}
> TTL session:{sessionId}
```

### Limpeza manual (development)
```bash
> FLUSHDB  # Limpar todas as chaves (CUIDADO: remove tudo!)
```

---

## 🐢 Troubleshooting

### Redis connection refused
```bash
# Verificar se Redis está rodando
redis-cli ping

# Se não responder, iniciar Redis
# Depende da instalação (veja acima)
```

### CORS errors ao chamar API
- Verificar que `CLIENT_URL` no `.env` está correto
- Em desenvolvimento: `http://localhost:8080`
- Em produção: incluir domain do site

### Cookie não persiste no cliente
- Verificar que o cliente está usando `fetch` com `credentials: 'include'`
- Certificar que `SameSite=Lax` não está bloqueando (depend da política do browser)

### Session expirada prematuramente
- Verificar que Redis não está deletando chaves automaticamente
- Verificar que `SESSION_MAX_AGE` está setado corretamente

---

## 🔄 Fluxo de Autenticação

```
Cliente                    Servidor                   Redis
  |                            |                        |
  |--POST /auth/login--------->|                        |
  |  (email, password)         |                        |
  |                            |--Supabase Auth-------->|
  |                            |<--access_token--------|
  |                            |                        |
  |                            |--Generate sessionId----|
  |                            |                        |
  |                            |--SET session:xxx----->|
  |                            |   (with TTL 24h)      |
  |                            |                        |
  |<--Set-Cookie: sessionId----|                        |
  |   (HttpOnly, Secure)       |                        |
  |<--{ user, success }--------|                        |
  |                            |                        |
  |                            |                        |
  |--GET /auth/me             |                        |
  |   (Cookie: sessionId)----->|                        |
  |                            |--GET session:xxx----->|
  |                            |<--{ user data }-------|
  |<--{ user }-----------------|                        |
```

---

## 📝 Integração com o Cliente

Para integrar com o cliente JavaScript:

```javascript
// Fazer login
const response = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // ⚠️ IMPORTANTE: permite cookies
    body: JSON.stringify({ email, password })
});

// Fazer logout
await fetch('http://localhost:3000/auth/logout', {
    method: 'POST',
    credentials: 'include'
});

// Obter usuário atual
const meResponse = await fetch('http://localhost:3000/auth/me', {
    credentials: 'include'
});
const { user } = await meResponse.json();

// Refresh periódico (keep-alive)
setInterval(async () => {
    await fetch('http://localhost:3000/auth/refresh', {
        method: 'POST',
        credentials: 'include'
    });
}, 3600000); // A cada 1h
```

---

## 🚀 Deploy em Produção

- **Redis**: Use um serviço gerenciado (Redis Cloud, ElastiCache AWS, Heroku Redis)
- **NODE_ENV**: Set para `production`
- **SESSION_SECRET**: Use um valor long e aleatório, guardado em secret management
- **REDIS_PASSWORD**: Configure autenticação no Redis
- **SSL/HTTPS**: Certificar `Secure` flag funciona corretamente
- **CORS**: Atualize `CLIENT_URL` para seu domínio de produção

---

## 📚 Referências

- [Express.js](https://expressjs.com/)
- [redis-js (node-redis)](https://github.com/redis/node-redis)
- [Cookie security best practices](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
