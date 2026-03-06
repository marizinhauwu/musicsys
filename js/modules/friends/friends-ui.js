// friends-ui.js
// Lógica de UI do Mockup de Adicionar Amigos
// Tudo encapsulado para facilitar a integração futura no projeto principal.

const FriendsUI = (() => {
    // Cache de elementos do DOM
    const DOM = {
        searchInput: document.getElementById('fs-friends-search-input'),
        searchSpinner: document.getElementById('fs-friends-search-spinner'),
        searchResults: document.getElementById('fs-friends-results'),

        tabSearch: document.getElementById('fs-tab-search'),
        tabRequests: document.getElementById('fs-tab-requests'),
        tabFriends: document.getElementById('fs-tab-friends'),

        contentSearch: document.getElementById('fs-content-search'),
        contentRequests: document.getElementById('fs-content-requests'),
        contentFriends: document.getElementById('fs-content-friends'),

        requestsList: document.getElementById('fs-friends-requests-list'),
        friendsList: document.getElementById('fs-friends-friends-list'),

        toast: document.getElementById('fs-friends-toast'),
        toastMsg: document.getElementById('fs-friends-toast-msg')
    };

    let searchTimeout = null;

    // Inicialização segura
    const init = () => {
        try {
            if (!DOM.searchInput) return; // Se modal não existir no DOM, abortar sem erro

            setupEventListeners();
            loadInitialData(); // Simula o carregamento inicial ao abrir a aba/modal
            console.log("Friends module initialized successfully.");
        } catch (e) {
            console.error("Failed to initialize FriendsUI module:", e);
        }
    };

    const setupEventListeners = () => {
        // Busca com Debounce
        DOM.searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            if (searchTimeout) clearTimeout(searchTimeout);

            if (query.length === 0) {
                renderEmptySearch();
                DOM.searchSpinner.style.display = 'none';
                return;
            }

            DOM.searchSpinner.style.display = 'block';

            // Aguarda o usuário parar de digitar (debounce)
            searchTimeout = setTimeout(() => {
                handleSearch(query);
            }, 600);
        });

        // Tabs
        DOM.tabSearch.addEventListener('click', () => switchTab('search'));
        DOM.tabRequests.addEventListener('click', () => {
            switchTab('requests');
            loadRequests();
        });
        DOM.tabFriends.addEventListener('click', () => {
            switchTab('friends');
            loadFriends();
        });
    };

    const switchTab = (tabName) => {
        // Reset actives
        document.querySelectorAll('.fs-tab').forEach(t => t.classList.remove('fs-active'));
        document.querySelectorAll('.fs-tab-content').forEach(c => c.classList.remove('fs-active'));

        // Set actives
        if (tabName === 'search') {
            DOM.tabSearch.classList.add('fs-active');
            DOM.contentSearch.classList.add('fs-active');
        } else if (tabName === 'requests') {
            DOM.tabRequests.classList.add('fs-active');
            DOM.contentRequests.classList.add('fs-active');
        } else if (tabName === 'friends') {
            DOM.tabFriends.classList.add('fs-active');
            DOM.contentFriends.classList.add('fs-active');
        }
    };

    // Lógica de Busca
    const handleSearch = async (query) => {
        const results = await window.FriendsAPI.searchByUsername(query);
        DOM.searchSpinner.style.display = 'none';

        if (results.length === 0) {
            DOM.searchResults.innerHTML = `<div class="fs-state-empty">Nenhum usuário encontrado para "${query}"</div>`;
            return;
        }

        renderUserList(results, DOM.searchResults, 'search');
    };

    const loadRequests = async () => {
        DOM.requestsList.innerHTML = `<div class="fs-state-empty">Carregando pedidos...</div>`;
        const requests = await window.FriendsAPI.getPendingRequests();
        if (requests.length === 0) {
            DOM.requestsList.innerHTML = `<div class="fs-state-empty">Nenhum pedido pendente.</div>`;
        } else {
            renderUserList(requests, DOM.requestsList, 'requests');
        }
    };

    const loadFriends = async () => {
        DOM.friendsList.innerHTML = `<div class="fs-state-empty">Carregando amigos...</div>`;
        const friends = await window.FriendsAPI.getFriendsList();
        if (friends.length === 0) {
            DOM.friendsList.innerHTML = `<div class="fs-state-empty">Você ainda não adicionou ninguém.</div>`;
        } else {
            renderUserList(friends, DOM.friendsList, 'friends');
        }
    };

    const loadInitialData = () => {
        renderEmptySearch();
    };

    const renderEmptySearch = () => {
        DOM.searchResults.innerHTML = `<div class="fs-state-empty">Digite o @username para buscar...</div>`;
    };

    // Renderiza uma lista genérica de usuários, variando os botões por contexto (busca, pendentes, amigos)
    const renderUserList = (users, container, context) => {
        // Limpa container
        container.innerHTML = '';

        users.forEach(user => {
            const card = document.createElement('div');
            card.className = 'fs-user-card';

            const infoHtml = `
                <img src="${user.avatar}" class="fs-user-avatar" alt="Avatar" style="cursor:pointer" onclick="window.openProfilePopup({ id: '${user.id}', name: '${user.displayName}', handle: '${user.username}', photo: '${user.avatar}'}, 'friend', event)">
                <div class="fs-user-info">
                    <div class="fs-user-name" style="cursor:pointer" onclick="window.openProfilePopup({ id: '${user.id}', name: '${user.displayName}', handle: '${user.username}', photo: '${user.avatar}'}, 'friend', event)">${user.displayName}</div>
                    <div class="fs-user-handle">@${user.username}</div>
                </div>
            `;

            const actionContainer = document.createElement('div');
            actionContainer.className = 'fs-user-actions';

            // Define botões baseado no status/relacionamento do usuário com quem está acessando
            if (user.relationship === 'none') {
                actionContainer.innerHTML = `<button class="fs-btn fs-btn-primary" onclick="window.FriendsUI.addFriend('${user.id}')">Adicionar</button>`;
            }
            else if (user.relationship === 'sent') {
                actionContainer.innerHTML = `
                    <span class="fs-friends-badge">Pedido Enviado</span>
                    <button class="fs-btn fs-btn-secondary" onclick="window.FriendsUI.cancelRequest('${user.id}', '${context}')" style="margin-left: 8px;">Cancelar</button>
                `;
            }
            else if (user.relationship === 'received') {
                actionContainer.innerHTML = `
                    <button class="fs-btn fs-btn-primary" onclick="window.FriendsUI.acceptRequest('${user.id}', '${context}')">Aceitar</button>
                    <button class="fs-btn fs-btn-danger" style="margin-left: 8px;" onclick="window.FriendsUI.rejectRequest('${user.id}', '${context}')">Recusar</button>
                `;
            }
            else if (user.relationship === 'friend') {
                actionContainer.innerHTML = `<button class="fs-btn fs-btn-secondary" disabled>Amigo(a)</button>`;
            }

            card.innerHTML = infoHtml;
            card.appendChild(actionContainer);
            container.appendChild(card);
        });
    };

    // Ações do Usuário (exportadas no objeto FriendsUI para acesso global)

    // Enviar Pedido
    const addFriend = async (userId) => {
        const res = await window.FriendsAPI.sendFriendRequest(userId);
        if (res.success) {
            showToast('Pedido de amizade enviado!');
            // Re-render a busca atual para atualizar botoes (Simulação Rápida)
            const query = DOM.searchInput.value.trim();
            if (query) handleSearch(query);
            else if (DOM.tabRequests.classList.contains('fs-active')) loadRequests();
        } else {
            showToast('Erro: Conta não pôde ser adicionada.');
        }
    };

    // Cancelar Pedido Enviado
    const cancelRequest = async (userId, context) => {
        const res = await window.FriendsAPI.cancelFriendRequest(userId);
        if (res.success) {
            showToast('Pedido cancelado.');
            if (context === 'search') handleSearch(DOM.searchInput.value.trim());
            else if (context === 'requests') loadRequests();
        }
    };

    // Aceitar Pedido Recebido
    const acceptRequest = async (userId, context) => {
        const res = await window.FriendsAPI.acceptFriendRequest(userId);
        if (res.success) {
            showToast('Amizade aceita!', true);
            if (context === 'search') handleSearch(DOM.searchInput.value.trim());
            if (context === 'requests') loadRequests();
        }
    };

    // Recusar Pedido Recebido
    const rejectRequest = async (userId, context) => {
        const res = await window.FriendsAPI.rejectFriendRequest(userId);
        if (res.success) {
            showToast('Pedido recusado.');
            if (context === 'search') handleSearch(DOM.searchInput.value.trim());
            if (context === 'requests') loadRequests();
        }
    };

    // Feedback visual
    const showToast = (message, isSuccess = false) => {
        DOM.toastMsg.textContent = message;
        if (isSuccess) DOM.toast.classList.add('fs-toast-success');
        else DOM.toast.classList.remove('fs-toast-success');

        DOM.toast.classList.add('fs-show');

        // Hide after 3 seconds
        setTimeout(() => {
            DOM.toast.classList.remove('fs-show');
        }, 3000);
    };

    return {
        init,
        addFriend,
        cancelRequest,
        acceptRequest,
        rejectRequest
    };
})();

// Expose on Window for HTML onclick handlers
window.FriendsUI = FriendsUI;

// Inicializa a UI do módulo usando DOMContentLoaded ou init delay para safety
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', FriendsUI.init);
} else {
    setTimeout(FriendsUI.init, 100);
}
