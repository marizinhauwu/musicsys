/**
 * social-bridge.js — v2.0 HARDENED
 * ═══════════════════════════════════════════════════════════════
 * Módulo Bridge: conecta o sistema de Amigos (FriendsAPI/FriendsUI)
 * ao sistema de Private Messaging (PM) já existente no firebase-init.js.
 *
 * PRINCÍPIO FAILSAFE:
 * - Este módulo é 100% não-destrutivo.
 * - Se falhar, o PM continua funcionando normalmente.
 * - Se o FriendsAPI não estiver disponível, o módulo silencia.
 * - Nenhuma exceção escapa para fora deste módulo.
 *
 * REGRAS DE NEGÓCIO:
 * - Somente amigos podem conversar (chat PM restrito).
 * - Contatos no PM são filtrados pela lista de amigos.
 * - Envio de mensagens bloqueado para não-amigos.
 * - Novas conversas só podem ser iniciadas com amigos.
 *
 * DEPENDÊNCIAS (opcionais — funciona mesmo sem):
 * - window.FriendsAPI  (js/modules/friends/friends-api.js)
 * - window.FriendsUI   (js/modules/friends/friends-ui.js)
 * - window.pmOpenInbox / window.pmOpenChatWith  (firebase-init.js)
 * - window.currentUser  (firebase-init.js)
 *
 * COMO REMOVER:
 * 1. Remover <script src="js/modules/social/social-bridge.js"> do index.html
 * 2. Remover <link href="css/social.css"> do index.html
 * 3. Remover o bloco <script> failsafe inline do index.html
 * 4. Tudo volta ao comportamento original automaticamente.
 * ═══════════════════════════════════════════════════════════════
 */

window.SocialBridge = (() => {
    'use strict';

    // ── Estado Interno ──
    let _initialized = false;
    let _observerSetup = false;
    let _friendsCache = [];             // Cache local: [{id, displayName, avatar, ...}]
    let _friendsIdSet = new Set();      // Set de UIDs para lookup O(1)
    let _cacheReady = false;            // true após primeiro carregamento
    let _cachePromise = null;           // Promise do carregamento em andamento
    let _observerDebounceTimer = null;  // Debounce do MutationObserver
    let _pmOriginals = {};              // Referências originais das funções PM (para rollback)

    // ═══════════════════════════════════════════════════════════
    // INIT — Inicializa o bridge quando TODAS as dependências existem
    // ═══════════════════════════════════════════════════════════
    function init() {
        // Guard: não inicializar duas vezes
        if (_initialized) {
            return;
        }

        try {
            // Guard: dependências obrigatórias
            if (!window.FriendsAPI || typeof window.FriendsAPI.getFriendsList !== 'function') {
                console.warn('[SocialBridge] FriendsAPI não disponível — bridge desativado.');
                return;
            }
            if (!window.currentUser || !window.currentUser.uid) {
                console.warn('[SocialBridge] Usuário não logado — bridge adiado.');
                return;
            }

            // Guard: PM system deve existir
            if (typeof window.pmOpenInbox !== 'function' && typeof window.pmOpenChatWith !== 'function') {
                console.warn('[SocialBridge] PM system não disponível — bridge desativado.');
                return;
            }

            // Marca como inicializado ANTES de qualquer operação async
            _initialized = true;

            // Carrega lista de amigos no cache
            refreshFriendsCache();

            // Injeta botão "Chat" nos cards de amigos (observador de mutação)
            _setupFriendsListObserver();

            // Aplica filtro de amigos no PM system
            _applyPmFriendsFilter();

            console.log('✅ [SocialBridge v2] Inicializado — Amigos + Chat conectados.');
        } catch (e) {
            console.error('[SocialBridge] Erro na inicialização (site não afetado):', e);
            _initialized = false;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // FRIENDS CACHE — Lista de amigos com lookup O(1)
    // ═══════════════════════════════════════════════════════════
    /**
     * Atualiza o cache de amigos a partir do Firestore via FriendsAPI.
     * Retorna uma Promise que resolve quando o cache está pronto.
     * @returns {Promise<void>}
     */
    async function refreshFriendsCache() {
        // Se já há um carregamento em andamento, retorna ele
        if (_cachePromise) return _cachePromise;

        _cachePromise = (async () => {
            try {
                if (!window.FriendsAPI || typeof window.FriendsAPI.getFriendsList !== 'function') {
                    return;
                }
                _friendsCache = await window.FriendsAPI.getFriendsList();
                _friendsIdSet = new Set(_friendsCache.map(f => f.id));
                _cacheReady = true;
            } catch (e) {
                console.warn('[SocialBridge] Erro ao carregar amigos:', e);
                // Mantém cache anterior se existir
                if (!_friendsCache.length) {
                    _friendsCache = [];
                    _friendsIdSet = new Set();
                }
            } finally {
                _cachePromise = null;
            }
        })();

        return _cachePromise;
    }

    /**
     * Verifica se um userId é amigo. Síncrono — usa cache.
     * Se o cache não estiver pronto, retorna false (conservador).
     * @param {string} userId
     * @returns {boolean}
     */
    function isFriend(userId) {
        if (!userId) return false;
        return _friendsIdSet.has(userId);
    }

    /**
     * Verifica se é amigo de forma assíncrona.
     * Se o cache não estiver pronto, espera carregá-lo primeiro.
     * @param {string} userId
     * @returns {Promise<boolean>}
     */
    async function isFriendAsync(userId) {
        if (!userId) return false;
        if (!_cacheReady) {
            await refreshFriendsCache();
        }
        return _friendsIdSet.has(userId);
    }

    /**
     * Retorna a lista de amigos cacheada.
     * @returns {Array}
     */
    function getFriends() {
        return [..._friendsCache]; // Cópia para evitar mutação externa
    }

    /**
     * Encontra dados de um amigo pelo ID.
     * @param {string} userId
     * @returns {object|null}
     */
    function getFriendById(userId) {
        return _friendsCache.find(f => f.id === userId) || null;
    }

    // ═══════════════════════════════════════════════════════════
    // PM FRIENDS FILTER — Restringe PM apenas a amigos
    // ═══════════════════════════════════════════════════════════
    /**
     * Aplica filtros de amigos nas funções PM existentes.
     * Usa wrapper pattern (não modifica o core, adiciona camada por cima).
     * Se removido, tudo volta ao original.
     */
    function _applyPmFriendsFilter() {
        try {
            // ── Guard: pmSendTo — bloqueia envio para não-amigos ──
            if (typeof window.pmSendTo === 'function' && !_pmOriginals.pmSendTo) {
                _pmOriginals.pmSendTo = window.pmSendTo;
                window.pmSendTo = async function (otherUid, otherName, otherPhoto, text) {
                    // Garante que cache está pronto antes de verificar
                    const friend = await isFriendAsync(otherUid);
                    if (!friend) {
                        console.warn('[SocialBridge] Mensagem bloqueada: não é amigo:', otherUid);
                        if (typeof window.toast === 'function') {
                            window.toast('Apenas amigos podem trocar mensagens.', 'error');
                        }
                        return;
                    }
                    return _pmOriginals.pmSendTo.call(this, otherUid, otherName, otherPhoto, text);
                };
            }

            // ── Guard: pmOpenChatWith — bloqueia abertura para não-amigos ──
            if (typeof window.pmOpenChatWith === 'function' && !_pmOriginals.pmOpenChatWith) {
                _pmOriginals.pmOpenChatWith = window.pmOpenChatWith;
                window.pmOpenChatWith = function (uid, name, photo) {
                    if (!_cacheReady) {
                        // Cache não pronto — carrega e tenta de novo
                        refreshFriendsCache().then(() => {
                            if (isFriend(uid)) {
                                _pmOriginals.pmOpenChatWith(uid, name, photo);
                            } else {
                                console.warn('[SocialBridge] Chat bloqueado: não é amigo:', uid);
                                if (typeof window.toast === 'function') {
                                    window.toast('Adicione como amigo para conversar.', 'error');
                                }
                            }
                        });
                        return;
                    }
                    if (!isFriend(uid)) {
                        console.warn('[SocialBridge] Chat bloqueado: não é amigo:', uid);
                        if (typeof window.toast === 'function') {
                            window.toast('Adicione como amigo para conversar.', 'error');
                        }
                        return;
                    }
                    _pmOriginals.pmOpenChatWith(uid, name, photo);
                };
            }

            // ── Guard: pmStartNewChat — redireciona para modal de amigos ──
            if (typeof window.pmStartNewChat === 'function' && !_pmOriginals.pmStartNewChat) {
                _pmOriginals.pmStartNewChat = window.pmStartNewChat;
                window.pmStartNewChat = function () {
                    // Em vez de abrir o inbox vazio, abre o modal de amigos
                    if (typeof window.openModal === 'function') {
                        window.openModal('modal-friends');
                        if (typeof window.toast === 'function') {
                            window.toast('Adicione amigos para iniciar conversas.');
                        }
                    } else {
                        // Fallback: comportamento original
                        _pmOriginals.pmStartNewChat();
                    }
                };
            }

        } catch (e) {
            console.error('[SocialBridge] Erro ao aplicar filtros PM (PM não afetado):', e);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ON FRIENDSHIP ACCEPTED — Callback robusto sem delays fixos
    // ═══════════════════════════════════════════════════════════
    /**
     * Chamado pelo FriendsUI.acceptRequest() quando uma amizade é aceita.
     * Abre o PM Inbox quando o PM estiver pronto (sem delay fixo).
     *
     * @param {string} userId - UID do novo amigo
     * @param {string} displayName - Nome de exibição
     * @param {string} avatar - URL do avatar
     */
    function onFriendshipAccepted(userId, displayName, avatar) {
        try {
            if (!userId) return;

            // Atualiza cache imediatamente com dados conhecidos
            if (!_friendsIdSet.has(userId)) {
                _friendsCache.push({
                    id: userId,
                    displayName: displayName || 'Amigo',
                    avatar: avatar || '',
                    username: '',
                    relationship: 'friend'
                });
                _friendsIdSet.add(userId);
                _cacheReady = true;
            }

            // Também faz refresh completo do cache em background
            refreshFriendsCache();

            // Abre PM quando estiver pronto — sem delay fixo
            _waitForPmAndOpen(userId, displayName, avatar);

            // Toast de feedback
            _showSocialToast('🎉 Amizade aceita! Chat desbloqueado com ' + (displayName || 'amigo') + '.');

        } catch (e) {
            console.warn('[SocialBridge] Erro no onFriendshipAccepted (não crítico):', e);
        }
    }

    /**
     * Espera o PM system estar pronto e abre a conversa.
     * Usa polling leve (50ms intervals, max 3s) em vez de delay fixo.
     */
    function _waitForPmAndOpen(userId, displayName, avatar) {
        let attempts = 0;
        const maxAttempts = 60; // 60 * 50ms = 3s max
        const interval = 50;

        const tryOpen = () => {
            attempts++;
            // Usa o original (unwrapped) para o aceite — é um amigo recém-adicionado
            const openFn = _pmOriginals.pmOpenChatWith || window.pmOpenChatWith;
            const openInboxFn = window.pmOpenInbox;

            if (typeof openFn === 'function') {
                try { openFn(userId, displayName || '', avatar || ''); return; }
                catch (e) { /* continua tentando */ }
            } else if (typeof openInboxFn === 'function') {
                try { openInboxFn(userId, displayName || '', avatar || ''); return; }
                catch (e) { /* continua tentando */ }
            }

            if (attempts < maxAttempts) {
                setTimeout(tryOpen, interval);
            }
            // Se falhou após 3s, silencia — o amigo está no cache, user verá no próximo reload
        };

        // Inicia a primeira tentativa após um tick (permite UI atualizar)
        setTimeout(tryOpen, 100);
    }

    // ═══════════════════════════════════════════════════════════
    // OPEN CHAT WITH FRIEND — Wrapper seguro
    // ═══════════════════════════════════════════════════════════
    /**
     * Abre o PM Inbox com o amigo selecionado.
     * Chamado pelo botão "💬 Chat" nos cards de amigos.
     * Usa a função original (unwrapped) porque já sabemos que é amigo.
     */
    function openChatWithFriend(userId, name, photo) {
        try {
            // Usa o original para evitar o guard de isFriend (já sabemos que é amigo)
            const openFn = _pmOriginals.pmOpenChatWith || window.pmOpenChatWith;
            if (typeof openFn === 'function') {
                openFn(userId, name || '', photo || '');
            } else if (typeof window.pmOpenInbox === 'function') {
                window.pmOpenInbox(userId, name || '', photo || '');
            } else {
                console.warn('[SocialBridge] PM system não disponível.');
            }
        } catch (e) {
            console.warn('[SocialBridge] Erro ao abrir chat:', e);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // FRIENDS LIST OBSERVER — Debounced, com guard anti-duplicação
    // ═══════════════════════════════════════════════════════════
    function _setupFriendsListObserver() {
        // Guard: não configurar observer duas vezes
        if (_observerSetup) return;

        const friendsList = document.getElementById('fs-friends-friends-list');
        if (!friendsList) return;

        _observerSetup = true;

        // Observa mudanças no DOM com debounce de 100ms
        const observer = new MutationObserver(() => {
            if (_observerDebounceTimer) clearTimeout(_observerDebounceTimer);
            _observerDebounceTimer = setTimeout(() => {
                _injectChatButtons(friendsList);
            }, 100);
        });
        observer.observe(friendsList, { childList: true, subtree: false });

        // Injeta agora se já houver conteúdo
        _injectChatButtons(friendsList);
    }

    /**
     * Injeta botão "💬 Chat" nos cards de amigos.
     * Proteção tripla contra duplicação:
     * 1. data-social-chat-injected="true" no card
     * 2. Verifica se já existe um .fs-social-chat-btn no actionsDiv
     * 3. Só injeta em cards que têm o botão "Amigo(a)" (relationship === 'friend')
     */
    function _injectChatButtons(container) {
        if (!container) return;
        const cards = container.querySelectorAll('.fs-user-card');

        cards.forEach(card => {
            // ── Proteção 1: atributo de marcação ──
            if (card.getAttribute('data-social-chat-injected') === 'true') return;

            const actionsDiv = card.querySelector('.fs-user-actions');
            if (!actionsDiv) return;

            // ── Proteção 2: verificar se botão já existe ──
            if (actionsDiv.querySelector('.fs-social-chat-btn')) return;

            // ── Proteção 3: só injetar em cards de amigos (tem botão disabled "Amigo(a)") ──
            const friendBtn = actionsDiv.querySelector('button[disabled]');
            if (!friendBtn) return;

            // Extrai dados do card
            const nameEl = card.querySelector('.fs-user-name');
            const avatarEl = card.querySelector('.fs-user-avatar');

            const displayName = nameEl?.textContent?.trim() || '?';
            const avatar = avatarEl?.src || '';

            // Lê userId diretamente do atributo explícito data-user-id
            // (gravado pelo friends-ui.js no renderUserList)
            const userId = card.getAttribute('data-user-id') || '';

            if (!userId) return;

            // Marca card como processado ANTES de injetar
            card.setAttribute('data-social-chat-injected', 'true');

            // Cria botão de Chat
            const chatBtn = document.createElement('button');
            chatBtn.className = 'fs-btn fs-btn-primary fs-social-chat-btn';
            chatBtn.textContent = '💬 Chat';
            chatBtn.style.marginLeft = '8px';
            chatBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                openChatWithFriend(userId, displayName, avatar);
            });

            actionsDiv.appendChild(chatBtn);
        });
    }

    // ═══════════════════════════════════════════════════════════
    // TOAST — Feedback visual usando toast existente
    // ═══════════════════════════════════════════════════════════
    function _showSocialToast(message) {
        try {
            // Tenta usar o toast do FriendsUI
            const toastEl = document.getElementById('fs-friends-toast');
            const toastMsg = document.getElementById('fs-friends-toast-msg');

            if (toastEl && toastMsg) {
                toastMsg.textContent = message;
                toastEl.classList.add('fs-toast-success', 'fs-show');
                setTimeout(() => {
                    toastEl.classList.remove('fs-show', 'fs-toast-success');
                }, 4000);
                return;
            }

            // Fallback: toast global
            if (typeof window.toast === 'function') {
                window.toast(message);
            }
        } catch (e) {
            // Toast é cosmético — não propaga erros
        }
    }

    // ═══════════════════════════════════════════════════════════
    // ROLLBACK — Restaura funções PM originais (para testes/debug)
    // ═══════════════════════════════════════════════════════════
    function _rollback() {
        Object.keys(_pmOriginals).forEach(key => {
            if (typeof _pmOriginals[key] === 'function') {
                window[key] = _pmOriginals[key];
            }
        });
        _pmOriginals = {};
        _initialized = false;
        _observerSetup = false;
        console.log('[SocialBridge] Rollback completo — PM restaurado ao original.');
    }

    // ═══════════════════════════════════════════════════════════
    // EXPORTAÇÃO PÚBLICA
    // ═══════════════════════════════════════════════════════════
    return {
        init,
        isFriend,
        isFriendAsync,
        getFriends,
        getFriendById,
        refreshFriendsCache,
        onFriendshipAccepted,
        openChatWithFriend,
        // Debug / Testes
        get __initialized() { return _initialized; },
        get __cacheReady() { return _cacheReady; },
        get __cacheSize() { return _friendsIdSet.size; },
        _rollback // Apenas para debug/testes — não usar em produção
    };
})();

// ═══════════════════════════════════════════════════════════
// AUTO-INIT — Polling robusto + hook no modal de amigos
// ═══════════════════════════════════════════════════════════
(function _socialBridgeAutoInit() {
    'use strict';

    // Tenta inicializar a cada 1s até ter sucesso (max 30 tentativas = 30s)
    let _autoInitAttempts = 0;
    const _maxAutoInitAttempts = 30;

    function tryInit() {
        if (window.SocialBridge.__initialized) return;
        if (_autoInitAttempts >= _maxAutoInitAttempts) {
            console.warn('[SocialBridge] Auto-init: limite atingido (30s). Init manual necessário.');
            return;
        }
        _autoInitAttempts++;

        if (window.currentUser && window.FriendsAPI && (window.pmOpenInbox || window.pmOpenChatWith)) {
            window.SocialBridge.init();
        } else {
            setTimeout(tryInit, 1000);
        }
    }

    // Inicia polling após DOM pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(tryInit, 500));
    } else {
        setTimeout(tryInit, 500);
    }

    // ── Hook: re-inicializa quando o modal de amigos abre ──
    // Garante que os botões de chat são injetados mesmo se o auto-init
    // foi lento ou se o modal foi aberto antes do init completar.
    const _origOpenModal = window.openModal;
    if (typeof _origOpenModal === 'function') {
        window.openModal = function (modalId) {
            _origOpenModal.apply(this, arguments);

            // Se é o modal de amigos, tenta init + injeta botões
            if (modalId === 'modal-friends') {
                setTimeout(() => {
                    // Tenta init se ainda não inicializou
                    if (!window.SocialBridge.__initialized && window.currentUser && window.FriendsAPI) {
                        window.SocialBridge.init();
                    }
                    // Re-injeta botões de chat na lista de amigos (pode ter re-renderizado)
                    if (window.SocialBridge.__initialized) {
                        const friendsList = document.getElementById('fs-friends-friends-list');
                        if (friendsList) {
                            const cards = friendsList.querySelectorAll('.fs-user-card:not([data-social-chat-injected="true"])');
                            if (cards.length > 0) {
                                window.SocialBridge.refreshFriendsCache().then(() => {
                                    // Força re-renderização via click na tab Amigos
                                    const tabAmigos = document.getElementById('fs-tab-friends');
                                    if (tabAmigos) tabAmigos.click();
                                });
                            }
                        }
                    }
                }, 300);
            }
        };
    }
})();
