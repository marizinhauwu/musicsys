// friends-api.js
// Conexão real com Firebase na coleção 'talent_profiles' e gerenciamento de relacionamentos

window.FriendsAPI = {
    /**
     * Busca usuários pelo @username ou nome artístico na coleção 'talent_profiles'.
     * Adiciona o debounce pra evitar mtas leituras no banco.
     */
    searchByUsername: async (searchQuery) => {
        if (!searchQuery || !window.db) return [];

        const searchStr = searchQuery.toLowerCase().replace('@', '').trim();
        if (searchStr.length < 2) return [];

        try {
            // No FREQsys, os perfis públicos (com handle e nome) ficam em talent_profiles
            const profilesRef = collection(window.db, 'talent_profiles');
            const snap = await getDocs(profilesRef); // Traz todos pois não dá pra fazer LIKE query no Firestore facilmente

            const results = [];
            const myUid = window.currentUser?.uid || window.auth?.currentUser?.uid || null;

            // Busca os relacionamentos atuais do user logado pra mapear o status do botao
            let myRelationships = {};
            if (myUid) {
                const reqQuery = query(collection(window.db, 'friend_requests'),
                    where('participants', 'array-contains', myUid));
                const reqSnap = await getDocs(reqQuery);
                reqSnap.forEach(doc => {
                    const data = doc.data();
                    const otherId = data.from === myUid ? data.to : data.from;
                    // se eu mandei -> sent. se eu recebi e ta pending -> received. se aceitou -> friend.
                    if (data.status === 'accepted') {
                        myRelationships[otherId] = 'friend';
                    } else if (data.status === 'pending') {
                        myRelationships[otherId] = data.from === myUid ? 'sent' : 'received';
                    }
                });
            }

            snap.forEach(doc => {
                const data = doc.data();
                if (doc.id === myUid) return; // pular a si mesmo

                const handle = (data.handle || '').toLowerCase();
                const name = (data.name || '').toLowerCase();

                // Filtro "LIKE" no JS
                if (handle.includes(searchStr) || name.includes(searchStr)) {
                    results.push({
                        id: doc.id,   // uid do user alvo
                        username: data.handle || doc.id.substring(0, 8),
                        displayName: data.name || 'Sem nome artístico',
                        avatar: data.photo || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' rx='12' fill='%23181820'/%3E%3Ctext x='40' y='46' text-anchor='middle' font-size='28' fill='%23333'%3E👤%3C/text%3E%3C/svg%3E",
                        relationship: myRelationships[doc.id] || "none"
                    });
                }
            });

            return results;
        } catch (e) {
            console.error("Erro ao buscar usuários:", e);
            return [];
        }
    },

    /**
     * Envia um pedido de amizade.
     */
    sendFriendRequest: async (targetUserId) => {
        const myUid = window.currentUser?.uid || window.auth?.currentUser?.uid || null;
        if (!myUid || !targetUserId) return { success: false, error: 'Não autenticado' };

        try {
            // Cria um doc mesclando ids pra evitar duplicatas ex: "uid1_uid2" (ordem alfabética)
            const ids = [myUid, targetUserId].sort();
            const docId = `${ids[0]}_${ids[1]}`;

            const reqRef = doc(window.db, 'friend_requests', docId);
            await setDoc(reqRef, {
                from: myUid,
                to: targetUserId,
                status: 'pending',
                participants: [myUid, targetUserId],
                createdAt: serverTimestamp()
            });

            return { success: true, status: 'sent' };
        } catch (e) {
            console.error("Erro sendFriendRequest:", e);
            return { success: false, error: e.message };
        }
    },

    /**
     * Cancela um pedido que eu enviei.
     */
    cancelFriendRequest: async (targetUserId) => {
        const myUid = window.currentUser ? window.currentUser.uid : null;
        if (!myUid || !targetUserId) return { success: false };

        try {
            const ids = [myUid, targetUserId].sort();
            const docId = `${ids[0]}_${ids[1]}`;

            await deleteDoc(doc(window.db, 'friend_requests', docId));
            return { success: true, status: 'none' };
        } catch (e) {
            console.error("Erro cancelFriendRequest:", e);
            return { success: false };
        }
    },

    /**
     * Aceita um pedido recebido.
     * Retorna os dados do usuário aceito para o caller poder usar diretamente.
     */
    acceptFriendRequest: async (targetUserId) => {
        const myUid = window.currentUser ? window.currentUser.uid : null;
        if (!myUid || !targetUserId) return { success: false };

        try {
            const ids = [myUid, targetUserId].sort();
            const docId = `${ids[0]}_${ids[1]}`;

            await updateDoc(doc(window.db, 'friend_requests', docId), {
                status: 'accepted',
                updatedAt: serverTimestamp()
            });

            // Busca perfil do amigo aceito para retornar ao caller
            let userData = { id: targetUserId, displayName: 'Amigo', avatar: '', username: '' };
            try {
                const profileSnap = await getDoc(doc(window.db, 'talent_profiles', targetUserId));
                if (profileSnap.exists()) {
                    const pd = profileSnap.data();
                    userData = {
                        id: targetUserId,
                        displayName: pd.name || 'Amigo',
                        avatar: pd.photo || '',
                        username: pd.handle || ''
                    };
                }
            } catch (profileErr) {
                // Não-crítico — usa fallback
                console.warn('[FriendsAPI] Perfil do amigo aceito indisponível:', profileErr);
            }

            return { success: true, status: 'friend', userData };
        } catch (e) {
            console.error("Erro acceptFriendRequest:", e);
            return { success: false };
        }
    },

    /**
     * Rejeita um pedido recebido.
     */
    rejectFriendRequest: async (targetUserId) => {
        return window.FriendsAPI.cancelFriendRequest(targetUserId); // É a mesma lógica, deletar o doc.
    },

    /**
     * Retorna os pedidos de amizade PENDENTES que eu RECEBI ou ENVIEI.
     * Na UI de requests vamos mostrar os que eu recebi para poder aceitar, e os que enviei opcionalmente.
     */
    getPendingRequests: async () => {
        const myUid = window.currentUser?.uid || window.auth?.currentUser?.uid || null;
        if (!myUid) return [];

        try {
            const q = query(collection(window.db, 'friend_requests'),
                where('participants', 'array-contains', myUid),
                where('status', '==', 'pending')
            );
            const snap = await getDocs(q);

            const results = [];
            // Pra renderizar direitinho precisamos do perfil dos remetentes/destinatários
            for (const docSnap of snap.docs) {
                const data = docSnap.data();
                const otherUid = data.from === myUid ? data.to : data.from;
                const relType = data.from === myUid ? 'sent' : 'received';

                // Puxa perfil do cara
                const profileRef = doc(window.db, 'talent_profiles', otherUid);
                const pSnap = await getDoc(profileRef);
                const pData = pSnap.exists() ? pSnap.data() : { handle: otherUid.substring(0, 8), name: 'Usuário', photo: '' };

                results.push({
                    id: otherUid,
                    username: pData.handle || otherUid.substring(0, 8),
                    displayName: pData.name || 'Usuário Sem Nome',
                    avatar: pData.photo || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' rx='12' fill='%23181820'/%3E%3Ctext x='40' y='46' text-anchor='middle' font-size='28' fill='%23333'%3E👤%3C/text%3E%3C/svg%3E",
                    relationship: relType
                });
            }
            return results;
        } catch (e) {
            console.error("Erro getPendingRequests:", e);
            return [];
        }
    },

    /**
     * Retorna a lista dos amigos confirmados (status = accepted)
     */
    getFriendsList: async () => {
        const myUid = window.currentUser?.uid || window.auth?.currentUser?.uid || null;
        if (!myUid) return [];

        try {
            const q = query(collection(window.db, 'friend_requests'),
                where('participants', 'array-contains', myUid),
                where('status', '==', 'accepted')
            );
            const snap = await getDocs(q);

            const results = [];
            for (const docSnap of snap.docs) {
                const data = docSnap.data();
                const otherUid = data.from === myUid ? data.to : data.from;

                const profileRef = doc(window.db, 'talent_profiles', otherUid);
                const pSnap = await getDoc(profileRef);
                const pData = pSnap.exists() ? pSnap.data() : { handle: otherUid.substring(0, 8), name: 'Usuário', photo: '' };

                results.push({
                    id: otherUid,
                    username: pData.handle || otherUid.substring(0, 8),
                    displayName: pData.name || 'Usuário Sem Nome',
                    avatar: pData.photo || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' rx='12' fill='%23181820'/%3E%3Ctext x='40' y='46' text-anchor='middle' font-size='28' fill='%23333'%3E👤%3C/text%3E%3C/svg%3E",
                    relationship: 'friend'
                });
            }
            return results;
        } catch (e) {
            console.error("Erro getFriendsList:", e);
            return [];
        }
    }
};
