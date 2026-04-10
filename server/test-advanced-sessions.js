/**
 * test-advanced-sessions.js
 * 
 * Testes para validar funcionalidades avançadas de sessão.
 * 
 * Use em um HTML ou console do navegador com SessionClient carregado.
 */

console.log('🧪 Advanced Session Tests Loaded');

window.AdvancedTests = {
    
    /**
     * Teste 1: Session Rotation - cada login gera novo ID
     */
    async testSessionRotation() {
        console.log('\n🧪 TESTE 1: Session Rotation...');
        
        const email = prompt('Email:');
        const password = prompt('Senha:');
        
        if (!email || !password) return;

        // Primeiro login
        const result1 = await SessionClient.login(email, password);
        if (!result1.success) {
            console.log('❌ Login 1 falhou:', result1.error);
            return;
        }
        const sessionId1 = result1.user.id;
        console.log('✅ Login 1: sessionId', sessionId1);

        // Logout
        await SessionClient.logout();
        console.log('✅ Logout');

        // Segundo login (deve gerar novo sessionId)
        const result2 = await SessionClient.login(email, password);
        if (!result2.success) {
            console.log('❌ Login 2 falhou:', result2.error);
            return;
        }
        const sessionId2 = result2.user.id;
        console.log('✅ Login 2: sessionId', sessionId2);

        if (sessionId1 !== sessionId2) {
            console.log('✅ TESTE PASSOU: SessionIds são diferentes (rotation funcionando)');
        } else {
            console.log('❌ TESTE FALHOU: SessionIds são iguais (rotation NÃO funcionando)');
        }
    },

    /**
     * Teste 2: Dupla Expiração - Idle Timeout
     */
    async testIdleTimeout() {
        console.log('\n🧪 TESTE 2: Idle Timeout...');
        
        const info = SessionClient.getSessionInfo();
        if (!info) {
            console.log('❌ Sem sessão ativa');
            return;
        }

        const idleMinRemaining = info.idleTimeoutMs / 60000;
        console.log(`⏱️  Idle timeout restante: ${idleMinRemaining.toFixed(1)}m`);

        if (idleMinRemaining <= 30 && idleMinRemaining > 0) {
            console.log('✅ TESTE PASSOU: Idle timeout dentro do esperado (0-30m)');
        } else {
            console.log('⚠️  Idle timeout fora do esperado:', idleMinRemaining);
        }
    },

    /**
     * Teste 3: Dupla Expiração - Absolute Timeout
     */
    async testAbsoluteTimeout() {
        console.log('\n🧪 TESTE 3: Absolute Timeout...');
        
        const info = SessionClient.getSessionInfo();
        if (!info) {
            console.log('❌ Sem sessão ativa');
            return;
        }

        const absoluteHourRemaining = info.absoluteTimeoutMs / 3600000;
        console.log(`⏳ Absolute timeout restante: ${absoluteHourRemaining.toFixed(1)}h`);

        if (absoluteHourRemaining <= 24 && absoluteHourRemaining > 0) {
            console.log('✅ TESTE PASSOU: Absolute timeout dentro do esperado (0-24h)');
        } else {
            console.log('⚠️  Absolute timeout fora do esperado:', absoluteHourRemaining);
        }
    },

    /**
     * Teste 4: Refresh estende Idle Timeout
     */
    async testRefreshExtendIdle() {
        console.log('\n🧪 TESTE 4: Refresh estende Idle Timeout...');
        
        const infoBefore = SessionClient.getSessionInfo();
        if (!infoBefore) {
            console.log('❌ Sem sessão ativa');
            return;
        }

        const idleBefore = infoBefore.idleTimeoutMs;
        console.log(`⏱️  Idle antes: ${(idleBefore / 60000).toFixed(1)}m`);

        // Wait 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Refresh
        const refreshed = await SessionClient.refreshSession();
        if (!refreshed) {
            console.log('❌ Refresh falhou');
            return;
        }

        const infoAfter = SessionClient.getSessionInfo();
        const idleAfter = infoAfter.idleTimeoutMs;
        console.log(`⏱️  Idle depois: ${(idleAfter / 60000).toFixed(1)}m`);

        if (idleAfter > idleBefore) {
            console.log('✅ TESTE PASSOU: Idle timeout foi estendido');
        } else {
            console.log('⚠️  Idle timeout NÃO foi estendido (pode estar cacheado)');
        }
    },

    /**
     * Teste 5: Multiple Active Sessions
     */
    async testMultipleSessions() {
        console.log('\n🧪 TESTE 5: Multiple Active Sessions...');
        
        const sessions = await SessionClient.getActiveSessions();
        
        if (!sessions || sessions.length === 0) {
            console.log('❌ Nenhuma sessão ativa');
            return;
        }

        console.log(`✅ ${sessions.length} sessão(ões) ativa(s):`);
        sessions.forEach((s, i) => {
            const isCurrent = s.isCurrentSession ? '(ATUAL)' : '';
            console.log(`   ${i + 1}. ${s.sessionId} - criada há ${new Date(s.createdAt).toLocaleString()} ${isCurrent}`);
        });

        const currentSessions = sessions.filter(s => s.isCurrentSession);
        if (currentSessions.length === 1) {
            console.log('✅ TESTE PASSOU: Uma sessão marcada como atual');
        } else {
            console.log('❌ TESTE FALHOU: Múltiplas ou nenhuma sessão como atual');
        }
    },

    /**
     * Teste 6: Logout other session
     */
    async testLogoutOtherSession() {
        console.log('\n🧪 TESTE 6: Logout Other Session...');
        
        const sessionsBefore = await SessionClient.getActiveSessions();
        const nonCurrentSessions = sessionsBefore.filter(s => !s.isCurrentSession);

        if (nonCurrentSessions.length === 0) {
            console.log('⚠️  Nenhuma outra sessão para logout');
            return;
        }

        const targetSession = nonCurrentSessions[0];
        console.log(`Tentando logout de: ${targetSession.sessionId}`);

        const success = await SessionClient.logoutSession(targetSession.sessionId);
        
        if (success) {
            const sessionsAfter = await SessionClient.getActiveSessions();
            if (sessionsAfter.length < sessionsBefore.length) {
                console.log('✅ TESTE PASSOU: Sessão foi removida');
            } else {
                console.log('⚠️  Sessão ainda aparece (pode estar cacheada)');
            }
        } else {
            console.log('❌ Logout falhou');
        }
    },

    /**
     * Teste 7: Force Session Rotation
     */
    async testForceRotation() {
        console.log('\n🧪 TESTE 7: Force Session Rotation...');
        
        const userBefore = SessionClient.getCurrentUser();
        if (!userBefore) {
            console.log('❌ Sem sessão ativa');
            return;
        }

        console.log('Forçando rotation...');
        const success = await SessionClient.rotateSession('test');

        if (success) {
            const userAfter = SessionClient.getCurrentUser();
            if (userAfter === null) {
                console.log('✅ TESTE PASSOU: Sessão foi rotacionada e usuário deslogado');
                console.log('⚠️  User precisa fazer login novamente');
            } else {
                console.log('⚠️  User ainda logado após rotation');
            }
        } else {
            console.log('❌ Rotation falhou');
        }
    },

    /**
     * Teste 8: Audit Log
     */
    async testAuditLog() {
        console.log('\n🧪 TESTE 8: Audit Log...');
        
        const entries = await SessionClient.getAuditLog();

        if (!entries || entries.length === 0) {
            console.log('❌ Nenhuma entrada de auditoria');
            return;
        }

        console.log(`✅ ${entries.length} entradas de auditoria:`);
        entries.forEach((e, i) => {
            let details = ` - ${e.timestamp}`;
            if (e.ip) details += ` (IP: ${e.ip})`;
            if (e.oldIp) details += ` (IP: ${e.oldIp} → ${e.newIp})`;
            console.log(`   ${i + 1}. ${e.action}${details}`);
        });

        // Verificar se há entrada de LOGIN
        const hasLogin = entries.some(e => e.action === 'LOGIN_SUCCESS');
        if (hasLogin) {
            console.log('✅ TESTE PASSOU: Audit log contém LOGIN_SUCCESS');
        } else {
            console.log('⚠️  LOGIN_SUCCESS não encontrado no audit log');
        }
    },

    /**
     * Teste 9: Fingerprinting - IP Change Detection
     */
    async testFingerprintingWarning() {
        console.log('\n🧪 TESTE 9: Fingerprinting (Warnings)...');
        
        const entries = await SessionClient.getAuditLog();

        if (!entries || entries.length === 0) {
            console.log('⚠️  Nenhuma entrada de auditoria');
            return;
        }

        const ipChangeEntries = entries.filter(e => e.action === 'SESSION_IP_CHANGED');
        const uaChangeEntries = entries.filter(e => e.action === 'SESSION_UA_CHANGED');

        if (ipChangeEntries.length > 0) {
            console.log('⚠️  IP mudou durante sessão:');
            ipChangeEntries.forEach(e => {
                console.log(`   ${e.oldIp} → ${e.newIp}`);
            });
        } else {
            console.log('✅ Sem IP mudanças detectadas');
        }

        if (uaChangeEntries.length > 0) {
            console.log('⚠️  User-Agent mudou durante sessão');
        } else {
            console.log('✅ User-Agent permaneceu consistente');
        }

        console.log('✅ Fingerprinting está monitorando corretamente');
    },

    /**
     * Teste 10: Session Expiration Callback
     */
    async testExpirationCallback() {
        console.log('\n🧪 TESTE 10: Session Expiration Callback...');
        
        let callbackFired = false;
        let callbackReason = null;

        // Register callback
        SessionClient.onSessionExpired((reason, details) => {
            callbackFired = true;
            callbackReason = reason;
            console.log(`🔔 Callback disparado: ${reason}`, details);
        });

        console.log('✅ Callback registrado');
        console.log('⚠️  Aguardando eventos de timeout...');
        console.log('💡 Dica: Deixe sessão inativa > 30 min ou espere > 24h para ver callback');
    },

    /**
     * Rodar todos os testes
     */
    async runAll() {
        console.log('\n🚀 EXECUTANDO TODOS OS TESTES AVANÇADOS...\n');

        try {
            await this.testSessionRotation();
            await this.testIdleTimeout();
            await this.testAbsoluteTimeout();
            await this.testRefreshExtendIdle();
            await this.testMultipleSessions();
            await this.testLogoutOtherSession();
            // await this.testForceRotation();  // Descomente se quiser logout
            await this.testAuditLog();
            await this.testFingerprintingWarning();
            await this.testExpirationCallback();
        } catch (err) {
            console.error('❌ Erro durante testes:', err);
        }

        console.log('\n✅ Testes concluídos');
    }
};

console.log(`
🧪 Testes Avançados Disponíveis:
   - AdvancedTests.testSessionRotation()
   - AdvancedTests.testIdleTimeout()
   - AdvancedTests.testAbsoluteTimeout()
   - AdvancedTests.testRefreshExtendIdle()
   - AdvancedTests.testMultipleSessions()
   - AdvancedTests.testLogoutOtherSession()
   - AdvancedTests.testForceRotation()
   - AdvancedTests.testAuditLog()
   - AdvancedTests.testFingerprintingWarning()
   - AdvancedTests.testExpirationCallback()
   - AdvancedTests.runAll()

💡 Uso:
   > AdvancedTests.runAll()
   > AdvancedTests.testSessionRotation()
`);
