# VS TI Hub — Servidor Express com Redis Sessions

Backend Node.js para autenticação e gerenciamento de sessões server-side usando Redis.

## 📋 Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `index.js` | Servidor Express principal com endpoints de autenticação |
| `package.json` | Dependências do projeto |
| `.env.example` | Variáveis de ambiente (copie para `.env`) |
| `test-sessions.js` | Scripts de teste para validar funcionamento |
| `auth-with-sessions.js.example` | Exemplo de como adaptar o auth.js |

## 🚀 Quick Start

```bash
# 1. Copiar variáveis de ambiente
cp .env.example .env

# 2. Gerar SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Instalar dependências
npm install

# 4. Iniciar servidor (desenvolvimento)
npm run dev

# 5. Em outro terminal, testar
curl http://localhost:3000/health
```

## 🔐 Segurança

- **Cookies HttpOnly**: JavaScript não pode acessar (protege XSS)
- **SameSite=Lax**: Proteção contra CSRF
- **Secure flag**: Apenas HTTPS em produção
- **Redis TTL**: Sessões expiram automaticamente (padrão: 24h)

## 📡 Endpoints

- `POST /auth/login` — Autentica e cria sessão
- `GET /auth/me` — Retorna usuário atual
- `POST /auth/logout` — Destroy sessão
- `POST /auth/refresh` — Estende TTL
- `DELETE /auth/sessions/:id` — Revoga sessão (admin)
- `GET /health` — Health check

## 🗄️ Dependências

- **express**: Framework HTTP
- **redis**: Cliente Redis
- **cookie-parser**: Parse cookies
- **cors**: CORS middleware
- **dotenv**: Load .env

## 📖 Documentação Completa

Veja `REDIS_SETUP.md` para:
- Instalação de Redis
- Configuração detalhada
- Troubleshooting
- Exemplos de integração

## 🧪 Testar

No console do navegador (carregue `test-sessions.js`):
```javascript
SessionTests.runAll();
SessionTests.testValidLogin();
SessionTests.testCheckCookies();
```

## 🚀 Deploy

- Configure variáveis de ambiente em produção
- Use um Redis gerenciado (Redis Cloud, AWS ElastiCache, etc)
- SET `NODE_ENV=production`
- Certifique HTTPS está ativado

---

**Por favor veja a raiz do projeto (`SESSIONS.md`) para guia completo.**
