/**
 * test-sessions.js
 * Script para testar manualmente o sistema de sessões
 * 
 * Use em `/api-test.html` ou no console do navegador:
 * ```html
 * <script src="js/session-client.js"></script>
 * <script src="server/test-sessions.js"></script>
 * ```
 */

console.log('✅ Teste de Sessões Carregado');

// ─── TESTES MANUAIS ──────────────────────────────────

window.SessionTests = {
    
    /**
     * Teste 1: Verificar estado de sessão (sem login)
     */
    async testInitNoSession() {
        console.log('\n🧪 TESTE 1: Verificar estado sem sessão...');
        const hasSession = await SessionClient.initSession();
        console.log('   Resultado:', hasSession ? '✅ Sessão encontrada' : '❌ Sem sessão');
        console.log('   User:', SessionClient.getCurrentUser());
    },

    /**
     * Teste 2: Fazer login com credenciais válidas
     */
    async testValidLogin() {
        console.log('\n🧪 TESTE 2: Login com credenciais válidas...');
        const email = prompt('Email:');
        const password = prompt('Senha:');
        
        if (!email || !password) {
            console.log('   ❌ Cancelado');
            return;
        }

        const result = await SessionClient.login(email, password);
        console.log('   Resultado:', result);
        
        if (result.success) {
            console.log('   ✅ Login bem-sucedido');
            console.log('   User:', SessionClient.getCurrentUser());
        } else {
            console.log('   ❌ Login falhou:', result.error);
        }
    },

    /**
     * Teste 3: Fazer login com credenciais inválidas
     */
    async testInvalidLogin() {
        console.log('\n🧪 TESTE 3: Login com credenciais inválidas...');
        const result = await SessionClient.login(
            'invalidemail@example.com',
            'invalidpassword'
        );
        console.log('   Resultado:', result);
        console.log('   Status:', result.success ? '✅ Erro esperado' : '❌ Falha inesperada');
    },

    /**
     * Teste 4: Verificar usuário atual
     */
    testGetCurrentUser() {
        console.log('\n🧪 TESTE 4: Obter usuário atual...');
        const user = SessionClient.getCurrentUser();
        console.log('   User:', user);
        console.log('   Email:', user?.email);
        console.log('   Is Admin:', SessionClient.isAdmin());
    },

    /**
     * Teste 5: Fazer logout
     */
    async testLogout() {
        console.log('\n🧪 TESTE 5: Fazer logout...');
        const success = await SessionClient.logout();
        console.log('   Status:', success ? '✅ Logout bem-sucedido' : '❌ Logout falhou');
        console.log('   User após logout:', SessionClient.getCurrentUser());
    },

    /**
     * Teste 6: Refrescar sessão
     */
    async testRefreshSession() {
        console.log('\n🧪 TESTE 6: Refrescar sessão...');
        const user = SessionClient.getCurrentUser();
        
        if (!user) {
            console.log('   ❌ Sem sessão ativa');
            return;
        }

        const success = await SessionClient.refreshSession();
        console.log('   Status:', success ? '✅ Sessão refrescada' : '❌ Refresh falhou');
    },

    /**
     * Teste 7: Verificar cookies
     */
    testCheckCookies() {
        console.log('\n🧪 TESTE 7: Verificar cookies...');
        const cookies = document.cookie.split(';');
        console.log('   Todas as cookies:');
        cookies.forEach(cookie => console.log('     -', cookie.trim()));
        
        const hasSessionId = cookies.some(c => c.includes('sessionId'));
        console.log('   sessionId presente:', hasSessionId ? '✅ Sim' : '❌ Não');
        
        // Note: Não podemos ler o valor porque é HttpOnly!
        console.log('   ⚠️  Valor não pode ser lido (HttpOnly - isso é bom!)');
    },

    /**
     * Teste 8: Chamar /auth/me diretamente
     */
    async testAuthMe() {
        console.log('\n🧪 TESTE 8: Chamar /auth/me diretamente...');
        try {
            const response = await fetch('http://localhost:3000/auth/me', {
                credentials: 'include'
            });
            const data = await response.json();
            console.log('   Response:', data);
            console.log('   Status:', response.ok ? '✅ OK' : '❌ Erro');
        } catch (err) {
            console.log('   ❌ Erro:', err.message);
        }
    },

    /**
     * Teste 9: Verificar health do servidor
     */
    async testServerHealth() {
        console.log('\n🧪 TESTE 9: Health check do servidor...');
        try {
            const response = await fetch('http://localhost:3000/health');
            const data = await response.json();
            console.log('   Servidor status:', data.status);
            console.log('   Timestamp:', data.timestamp);
            console.log('   ✅ Servidor respondendo');
        } catch (err) {
            console.log('   ❌ Servidor não respondendo:', err.message);
        }
    },

    /**
     * Teste 10: Rodar todos os testes em sequência
     */
    async runAll() {
        console.log('\n🚀 EXECUTANDO TODOS OS TESTES...\n');
        
        try {
            await this.testServerHealth();
            await this.testInitNoSession();
            await this.testValidLogin();
            this.testGetCurrentUser();
            this.testCheckCookies();
            await this.testAuthMe();
            // await this.testLogout();  // Descomente se quiser
        } catch (err) {
            console.error('❌ Erro durante testes:', err);
        }

        console.log('\n✅ Testes concluídos');
    }
};

console.log(`
📋 Testes Disponíveis:
   - SessionTests.testInitNoSession()
   - SessionTests.testValidLogin()
   - SessionTests.testInvalidLogin()
   - SessionTests.testGetCurrentUser()
   - SessionTests.testLogout()
   - SessionTests.testRefreshSession()
   - SessionTests.testCheckCookies()
   - SessionTests.testAuthMe()
   - SessionTests.testServerHealth()
   - SessionTests.runAll()

💡 Use no console do navegador:
   > SessionTests.runAll()
   > SessionTests.testValidLogin()
   > etc.
`);
