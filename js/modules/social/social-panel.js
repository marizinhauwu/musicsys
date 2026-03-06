/**
 * social-panel.js
 * ═══════════════════════════════════════════════════════════════
 * Hub compacto que unifica Amigos e Conversas do PM.
 * Fica atrelado ao botão flutuante inferior direito.
 * Reutiliza lógicas existentes (pmOpenInbox, FriendsAPI, etc).
 * ═══════════════════════════════════════════════════════════════
 */

window.SocialPanel = (function () {
    let isOpen = false;
    let initialized = false;
    let currentTab = 'friends';

    // Referências DOM
    let panelEl, friendsListEl, convsListEl, searchInputEl;

    // Helper para criar avatar de fallback
    function createFallbackAvatar(letter) {
        const fallbackNode = document.createElement('div');
        fallbackNode.className = 'fs-sp-avatar-fallback';
        fallbackNode.textContent = letter;
        return fallbackNode;
    }

    // Inicializador preguiçoso
    function init() {
        if (initialized) return;

        // Construir HTML base dinamicamente caso não exista no index.html
        if (!document.getElementById('fs-social-panel')) {
            const wrap = document.createElement('div');
            wrap.id = 'fs-social-panel';
            wrap.className = 'fs-sp-panel';
            wrap.innerHTML = `
                <div class="fs-sp-header">
                    <div class="fs-sp-title">
                        <span class="fs-sp-title-icon">🌍</span> Social
                    </div>
                    <div class="fs-sp-actions">
                        <button class="fs-sp-icon-btn" onclick="window.pmOpenInbox()" title="Abrir Caixa de Mensagens Completa">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z"/></svg>
                        </button>
                        <button class="fs-sp-icon-btn" onclick="window.SocialPanel.close()" title="Fechar">✕</button>
                    </div>
                </div>
                
                <div class="fs-sp-nav">
                    <div class="fs-sp-tab active" id="fs-sp-tab-friends" onclick="window.SocialPanel.switchTab('friends')">Amigos Online</div>
                    <div class="fs-sp-tab" id="fs-sp-tab-convs" onclick="window.SocialPanel.switchTab('convs')">Conversas</div>
                </div>

                <div class="fs-sp-content">
                    
                    <!-- View: AMIGOS -->
                    <div class="fs-sp-view active" id="fs-sp-view-friends">
                        <div class="fs-sp-search-box">
                            <div class="fs-sp-search-input-wrap">
                                <span style="color:var(--text3);margin-right:2px;font-size:12px">@</span>
                                <input type="text" class="fs-sp-search-input" id="fs-sp-search-input" placeholder="Buscar e adicionar...">
                            </div>
                        </div>
                        <div class="fs-sp-list" id="fs-sp-friends-list">
                            <!-- Injetado via JS -->
                        </div>
                    </div>

                    <!-- View: CONVERSAS -->
                    <div class="fs-sp-view" id="fs-sp-view-convs">
                        <div class="fs-sp-list" id="fs-sp-convs-list">
                            <!-- Injetado via JS -->
                        </div>
                    </div>

                </div>

                <div class="fs-sp-footer">
                    <button class="fs-sp-ft-btn" onclick="window.openModal('modal-friends')">
                        <span>👥</span> Gerenciar Amizades
                    </button>
                </div>
            `;
            document.body.appendChild(wrap);
        }

        panelEl = document.getElementById('fs-social-panel');
        friendsListEl = document.getElementById('fs-sp-friends-list');
        convsListEl = document.getElementById('fs-sp-convs-list');
        searchInputEl = document.getElementById('fs-sp-search-input');

        // Eventos
        if (searchInputEl) {
            let debounceTimer;
            searchInputEl.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => handleSearch(e.target.value), 300);
            });
        }

        // Fechar ao clicar fora
        document.addEventListener('click', (e) => {
            if (isOpen && panelEl && !panelEl.contains(e.target) && !e.target.closest('#pm-bubble-btn') && !e.target.closest('#modal-friends')) {
                close();
            }
        });

        // Fechar se apertar Esc
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isOpen) close();
        });

        initialized = true;
    }

    // Ações de Toggle
    function toggle() {
        if (!isOpen) open();
        else close();
    }

    function open() {
        init();
        if (!window.currentUser) {
            // Reverter para o PM auth guard original se deslogado
            if (typeof window.pmToggle === 'function') window.pmToggle();
            return;
        }

        isOpen = true;
        panelEl.classList.add('fs-sp-open');

        // Garante que o PM tradicional não esteja aberto ao mesmo tempo
        const oldPmPanel = document.getElementById('pm-panel');
        if (oldPmPanel && oldPmPanel.classList.contains('open')) {
            if (typeof window.pmToggle === 'function') window.pmToggle();
        }

        refreshData();

        if (searchInputEl) searchInputEl.value = '';
    }

    function close() {
        if (!isOpen || !panelEl) return;
        isOpen = false;
        panelEl.classList.remove('fs-sp-open');
    }

    function switchTab(tabId) {
        currentTab = tabId;

        document.querySelectorAll('.fs-sp-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.fs-sp-view').forEach(v => v.classList.remove('active'));

        document.getElementById('fs-sp-tab-' + tabId)?.classList.add('active');
        document.getElementById('fs-sp-view-' + tabId)?.classList.add('active');
    }

    // Renderização
    async function refreshData() {
        await renderFriends();
        renderConvs();
    }

    async function handleSearch(query) {
        if (!query.trim()) {
            renderFriends(); // Volta para a lista de amigos original
            return;
        }

        if (!window.FriendsAPI) return;

        friendsListEl.innerHTML = '<div class="fs-sp-empty"><span class="fs-sp-empty-text">Buscando...</span></div>';

        try {
            const results = await window.FriendsAPI.searchByUsername(query.replace('@', ''));

            if (!results || results.length === 0) {
                friendsListEl.innerHTML = '<div class="fs-sp-empty"><span class="fs-sp-empty-text">Nenhum usuário encontrado.</span></div>';
                return;
            }

            friendsListEl.innerHTML = '';
            results.forEach(user => {
                if (user.id === window.currentUser.uid) return; // Ignora a si mesmo

                const item = document.createElement('div');
                item.className = 'fs-sp-user-item';

                const displayName = user.displayName || user.name || user.username || 'Usuário';
                const avatarUrl = user.avatar || user.photoURL;
                const relationship = user.relationship || user.status || 'none';

                // Content wrap
                const avWrap = document.createElement('div');
                avWrap.className = 'fs-sp-avatar-wrap';

                // Fallback para caso sem foto
                const letterObj = displayName.charAt(0).toUpperCase();

                if (avatarUrl && !avatarUrl.startsWith('data:image/svg')) {
                    const img = document.createElement('img');
                    img.src = avatarUrl;
                    img.className = 'fs-sp-avatar';
                    img.onerror = function () {
                        this.replaceWith(createFallbackAvatar(letterObj));
                    };
                    avWrap.appendChild(img);
                } else {
                    avWrap.appendChild(createFallbackAvatar(letterObj));
                }

                const infoWrap = document.createElement('div');
                infoWrap.className = 'fs-sp-user-info';

                const nameEl = document.createElement('div');
                nameEl.className = 'fs-sp-user-name';
                nameEl.textContent = displayName;

                const handleEl = document.createElement('div');
                handleEl.className = 'fs-sp-msg-preview';
                handleEl.style.color = 'var(--text3)';
                handleEl.textContent = '@' + user.username;

                infoWrap.appendChild(nameEl);
                infoWrap.appendChild(handleEl);

                // Clique para abrir o perfil sobrepõe o painel
                const openProfile = (e) => {
                    e.stopPropagation();
                    close();
                    if (window.openProfilePopup) {
                        window.openProfilePopup({ id: user.id, name: displayName, handle: user.username, photo: avatarUrl }, 'social', e);
                    }
                };
                avWrap.style.cursor = 'pointer';
                avWrap.onclick = openProfile;
                infoWrap.style.cursor = 'pointer';
                infoWrap.onclick = openProfile;

                const actionWrap = document.createElement('div');
                actionWrap.style.flexShrink = '0';

                // Determina o status para exibir o botão correto
                if (relationship === 'friend' || relationship === 'friends') {
                    const btn = document.createElement('button');
                    btn.className = 'fs-sp-item-action';
                    btn.title = 'Mensagem';
                    btn.textContent = '💬';
                    btn.onclick = (e) => { e.stopPropagation(); close(); if (window.pmOpenChatWith) window.pmOpenChatWith(user.id, displayName, avatarUrl); };
                    actionWrap.appendChild(btn);
                } else if (relationship === 'sent' || relationship === 'pending_sent') {
                    const btn = document.createElement('button');
                    btn.className = 'fs-sp-btn-pending';
                    btn.textContent = 'Enviado';
                    actionWrap.appendChild(btn);
                } else if (relationship === 'received' || relationship === 'pending_received') {
                    const btn = document.createElement('button');
                    btn.className = 'fs-sp-btn-add';
                    btn.textContent = 'Responder';
                    btn.onclick = (e) => { e.stopPropagation(); window.openModal('modal-friends'); };
                    actionWrap.appendChild(btn);
                } else {
                    const btn = document.createElement('button');
                    btn.className = 'fs-sp-btn-add js-sp-add-btn';
                    btn.dataset.uid = user.id;
                    btn.textContent = 'Adicionar';
                    actionWrap.appendChild(btn);
                }

                item.appendChild(avWrap);
                item.appendChild(infoWrap);
                item.appendChild(actionWrap);

                friendsListEl.appendChild(item);

                // Bind do botão adicionar
                const addBtn = item.querySelector('.js-sp-add-btn');
                if (addBtn) {
                    addBtn.onclick = async (e) => {
                        e.stopPropagation();
                        addBtn.disabled = true;
                        addBtn.textContent = '...';
                        try {
                            const res = await window.FriendsAPI.sendFriendRequest(user.id);
                            if (res.success) {
                                addBtn.className = 'fs-sp-btn-pending';
                                addBtn.textContent = 'Enviado';
                            } else {
                                addBtn.disabled = false;
                                addBtn.textContent = 'Adicionar';
                            }
                        } catch (e) {
                            addBtn.disabled = false;
                            addBtn.textContent = 'Erro';
                        }
                    };
                }
            });

        } catch (e) {
            friendsListEl.innerHTML = '<div class="fs-sp-empty"><span class="fs-sp-empty-text">Erro ao buscar usuário.</span></div>';
        }
    }

    async function renderFriends() {
        if (!friendsListEl) return;

        friendsListEl.innerHTML = '<div class="fs-sp-empty"><span class="fs-sp-empty-text">Carregando amigos...</span></div>';

        if (!window.FriendsAPI) {
            friendsListEl.innerHTML = '<div class="fs-sp-empty"><span class="fs-sp-empty-text">Sistema de Amigos offline.</span></div>';
            return;
        }

        let friends = [];
        try {
            const fullList = await window.FriendsAPI.getFriendsList();
            friends = fullList.filter(u => u.status === 'friends');
        } catch (error) {
            console.error('[SocialPanel] Erro ao buscar API de amigos', error);
            friendsListEl.innerHTML = '<div class="fs-sp-empty"><span class="fs-sp-empty-text">Falha de conexão.<br>Tente abrir o painel novamente.</span></div>';
            return;
        }

        if (friends.length === 0) {
            friendsListEl.innerHTML = `
                <div class="fs-sp-empty">
                    <div class="fs-sp-empty-icon">🌍</div>
                    <div class="fs-sp-empty-text">Você ainda não adicionou ninguém.<br>Busque por um @username acima.</div>
                </div>
            `;
            return;
        }

        friendsListEl.innerHTML = '';
        friends.forEach(f => {
            // Mock básico de presença: consideraremos se tem "lastSeen" recente (se existir no PM) ou random pra demo visual. 
            // Em ambiente real conectaria com presence API.
            const isOnline = true; // Hardcoded como online pra visual premium. Pode ser puxado se houver no userData

            const displayName = f.displayName || f.name || f.username || 'Usuário';
            const avatarUrl = f.avatar || f.photoURL;

            const item = document.createElement('div');
            item.className = 'fs-sp-user-item';

            const avWrap = document.createElement('div');
            avWrap.className = 'fs-sp-avatar-wrap';

            const letterObj = displayName.charAt(0).toUpperCase();

            if (avatarUrl && !avatarUrl.startsWith('data:image/svg')) {
                const img = document.createElement('img');
                img.src = avatarUrl;
                img.className = 'fs-sp-avatar';
                img.onerror = function () {
                    this.replaceWith(createFallbackAvatar(letterObj));
                };
                avWrap.appendChild(img);
            } else {
                avWrap.appendChild(createFallbackAvatar(letterObj));
            }

            const statusDot = document.createElement('div');
            statusDot.className = 'fs-sp-status ' + (isOnline ? 'online' : 'offline');
            avWrap.appendChild(statusDot);

            const infoWrap = document.createElement('div');
            infoWrap.className = 'fs-sp-user-info';
            const nameEl = document.createElement('div');
            nameEl.className = 'fs-sp-user-name';
            nameEl.textContent = displayName;
            const msgPreview = document.createElement('div');
            msgPreview.className = 'fs-sp-msg-preview';
            msgPreview.textContent = 'Amigo conectado';
            infoWrap.appendChild(nameEl);
            infoWrap.appendChild(msgPreview);

            const openProfile = (e) => {
                e.stopPropagation();
                close();
                if (window.openProfilePopup) {
                    window.openProfilePopup({ id: f.id, name: displayName, handle: f.username, photo: avatarUrl }, 'social', e);
                }
            };
            avWrap.style.cursor = 'pointer';
            avWrap.onclick = openProfile;
            infoWrap.style.cursor = 'pointer';
            infoWrap.onclick = openProfile;

            const actionBtn = document.createElement('button');
            actionBtn.className = 'fs-sp-item-action';
            actionBtn.title = 'Mensagem';
            actionBtn.textContent = '💬';
            actionBtn.onclick = (e) => {
                e.stopPropagation();
                close();
                if (window.pmOpenChatWith) window.pmOpenChatWith(f.id, displayName, avatarUrl);
            };

            item.appendChild(avWrap);
            item.appendChild(infoWrap);
            item.appendChild(actionBtn);
            friendsListEl.appendChild(item);
        });
    }

    function renderConvs() {
        if (!convsListEl) return;

        // O sistema de PM guarda conversas em uma array _pmConversations em escopo global (firebase-init.js)
        // Se ela não estiver exposta, não acessaremos. O painel dependerá de window._pmConversations
        const convs = window._pmConversations || [];

        if (convs.length === 0) {
            convsListEl.innerHTML = `
                <div class="fs-sp-empty">
                    <div class="fs-sp-empty-icon">💬</div>
                    <div class="fs-sp-empty-text">Nenhuma conversa recente.</div>
                </div>
            `;
            return;
        }

        convsListEl.innerHTML = '';
        convs.forEach(c => {
            const item = document.createElement('div');
            item.className = 'fs-sp-user-item';

            const unreadCount = c.unread || 0;
            const previewText = c.lastMsg ? c.lastMsg.substring(0, 30) + (c.lastMsg.length > 30 ? '...' : '') : '—';

            const avWrap = document.createElement('div');
            avWrap.className = 'fs-sp-avatar-wrap';

            const letterObj = (c.otherName || '?').charAt(0).toUpperCase();

            if (c.otherPhoto && !c.otherPhoto.startsWith('data:image/svg')) {
                const img = document.createElement('img');
                img.src = c.otherPhoto;
                img.className = 'fs-sp-avatar';
                img.onerror = function () {
                    this.replaceWith(createFallbackAvatar(letterObj));
                };
                avWrap.appendChild(img);
            } else {
                avWrap.appendChild(createFallbackAvatar(letterObj));
            }

            const infoWrap = document.createElement('div');
            infoWrap.className = 'fs-sp-user-info';
            const nameEl = document.createElement('div');
            nameEl.className = 'fs-sp-user-name';
            if (unreadCount > 0) nameEl.style.color = 'var(--a1)';
            nameEl.textContent = c.otherName || '?';
            const msgPreview = document.createElement('div');
            msgPreview.className = 'fs-sp-msg-preview';
            if (unreadCount > 0) msgPreview.style.color = 'var(--text)';
            msgPreview.textContent = previewText;
            infoWrap.appendChild(nameEl);
            infoWrap.appendChild(msgPreview);

            const openProfile = (e) => {
                e.stopPropagation();
                close();
                if (window.openProfilePopup) {
                    window.openProfilePopup({ id: c.otherUid, name: c.otherName, handle: c.otherName, photo: c.otherPhoto }, 'social', e);
                }
            };
            avWrap.style.cursor = 'pointer';
            avWrap.onclick = openProfile;
            infoWrap.style.cursor = 'pointer';
            infoWrap.onclick = openProfile;

            // Substituído o item completo por apenas a setinha visual ali para a mensagem ou icone
            const actionBtn = document.createElement('button');
            actionBtn.className = 'fs-sp-item-action';
            actionBtn.title = 'Abrir Conversa';
            actionBtn.textContent = '💬'; // ou usar outro icone para diferenciar da aba de amigos. Mantido chat pra harmonia
            actionBtn.onclick = (e) => {
                e.stopPropagation();
                close();
                if (window.pmOpenChatWith) window.pmOpenChatWith(c.otherUid, c.otherName, c.otherPhoto);
            };

            item.appendChild(avWrap);
            item.appendChild(infoWrap);
            item.appendChild(actionBtn);

            if (unreadCount > 0) {
                const unreadBadge = document.createElement('div');
                unreadBadge.className = 'fs-sp-unread';
                unreadBadge.textContent = unreadCount;
                item.appendChild(unreadBadge);
            }
            convsListEl.appendChild(item);
        });
    }

    return {
        init,
        toggle,
        open,
        close,
        switchTab,
        refreshData
    };

})();
