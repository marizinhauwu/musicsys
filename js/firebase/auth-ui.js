import {
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, updateProfile
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
    doc, getDoc, setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// ─── AUTH STATE ───────────────────────────────────────────────────────────────
// Usamos as instâncias globais inicializadas no core (firebase-init.js por enquanto)
// Como este arquivo é um módulo, ele roda após a inicialização se colocado na ordem correta.
const auth = window.auth;
const db = window.db;
const gProvider = new GoogleAuthProvider();

let currentUser = null;
let currentUserData = null;

// Sincroniza com o window para compatibilidade com outros scripts
Object.defineProperty(window, 'currentUser', {
    get() { return currentUser; },
    configurable: true
});
Object.defineProperty(window, 'currentUserData', {
    get() { return currentUserData; },
    configurable: true
});

// ─── AUTH SCREENS ─────────────────────────────────────────────────────────────
window.switchAuthTab = function (tab) {
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');

    if (!formLogin || !formRegister || !tabLogin || !tabRegister) {
        console.error('[switchAuthTab] Elemento(s) do painel de auth não encontrado(s) no DOM.');
        return;
    }

    formLogin.style.display = tab === 'login' ? 'block' : 'none';
    formRegister.style.display = tab === 'register' ? 'block' : 'none';
    tabLogin.classList.toggle('active', tab === 'login');
    tabRegister.classList.toggle('active', tab === 'register');
    clearAuthMessages();
};

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    const suc = document.getElementById('auth-success');
    if (el) { el.textContent = msg; el.classList.add('show'); }
    if (suc) suc.classList.remove('show');
}
window.showAuthError = showAuthError;

function showAuthSuccess(msg) {
    const el = document.getElementById('auth-success');
    const err = document.getElementById('auth-error');
    if (el) { el.textContent = msg; el.classList.add('show'); }
    if (err) err.classList.remove('show');
}
window.showAuthSuccess = showAuthSuccess;

function clearAuthMessages() {
    const err = document.getElementById('auth-error');
    const suc = document.getElementById('auth-success');
    if (err) err.classList.remove('show');
    if (suc) suc.classList.remove('show');
}
window.clearAuthMessages = clearAuthMessages;

const AUTH_ERRORS = {
    'auth/user-not-found': 'Conta não encontrada com este email.', 'auth/wrong-password': 'Senha incorreta.',
    'auth/email-already-in-use': 'Este email já está cadastrado. Que tal tentar "Recuperar Senha"?', 'auth/weak-password': 'A senha informada é muito fraca (mínimo 6 caracteres).',
    'auth/invalid-email': 'O formato do email está incorreto.', 'auth/invalid-credential': 'As credenciais são desconhecidas ou incorretas.',
    'auth/invalid-login-credentials': 'Email não encontrado ou senha incorreta.',
    'auth/popup-closed-by-user': 'O login com o Google foi fechado antes de concluir.',
    'auth/too-many-requests': 'Muitas tentativas falhas. Conta temporariamente bloqueada, tente mais tarde.',
    'auth/network-request-failed': 'Falha na conexão. Verifique sua internet ou VPN.',
    'auth/operation-not-allowed': 'Este método de login não está ativado.',
};

// ─── AUTH ACTIONS ─────────────────────────────────────────────────────────────
window.doLogin = async function () {
    const emailRaw = FormValidator.val('login-email');
    const email = emailRaw ? FormValidator.isEmail(emailRaw) : '';
    const pass = document.getElementById('login-password').value;

    if (!emailRaw || !pass.trim()) { showAuthError('Preencha email e senha'); return; }
    if (emailRaw && !email) return;

    document.getElementById('login-email').value = email;

    const btn = document.getElementById('login-btn');
    if (btn.disabled) return;
    btn.disabled = true; btn.textContent = 'Entrando...';

    try {
        await signInWithEmailAndPassword(window.auth, email, pass);
    } catch (e) {
        showAuthError(AUTH_ERRORS[e.code] || e.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Entrar';
    }
};

window.doRegister = async function () {
    const nameRaw = FormValidator.val('reg-name');
    const name = nameRaw ? FormValidator.isTitle(nameRaw, 2, 40) : '';
    const emailRaw = FormValidator.val('reg-email');
    const email = emailRaw ? FormValidator.isEmail(emailRaw) : '';
    const pass = document.getElementById('reg-password').value;

    if (!nameRaw || !emailRaw || !pass.trim()) { showAuthError('Preencha todos os campos obrigatórios.'); return; }
    if (nameRaw && !name) return;
    if (emailRaw && !email) return;

    if (pass.length < 6) { showAuthError('A senha é muito curta. O mínimo é 6 caracteres.'); return; }

    document.getElementById('reg-name').value = name;
    document.getElementById('reg-email').value = email;

    const btn = document.getElementById('register-btn');
    if (btn.disabled) return;
    btn.disabled = true; btn.textContent = 'Criando Conta...';

    try {
        const cred = await createUserWithEmailAndPassword(window.auth, email, pass);
        await updateProfile(cred.user, { displayName: name });
        await setDoc(doc(window.db, 'users', cred.user.uid), { uid: cred.user.uid, name, email, role: 'member', plan: 'free', status: 'approved', discordId: null, createdAt: new Date().toISOString() });
        if (typeof _syncTalentPlan === 'function') _syncTalentPlan(cred.user.uid, 'free').catch(() => { });
    } catch (e) {
        showAuthError(AUTH_ERRORS[e.code] || e.message);
    } finally {
        btn.disabled = false; btn.textContent = 'Criar Conta';
    }
};

window.doGoogleLogin = async function () {
    const btn = document.getElementById('google-btn');
    if (btn) btn.disabled = true;
    try {
        const cred = await signInWithPopup(window.auth, gProvider);
        const u = cred.user;

        // Verifica se usuário já existe (usando cache local se disponível ou buscando)
        const userSnap = await getDoc(doc(window.db, 'users', u.uid));
        if (!userSnap.exists()) {
            const safeName = FormValidator.isTitle(u.displayName || u.email, 2, 40) || 'Novo Colaborador';
            await setDoc(doc(window.db, 'users', u.uid), { uid: u.uid, name: safeName, email: u.email, role: 'member', plan: 'free', status: 'approved', discordId: null, createdAt: new Date().toISOString() });
            if (typeof _syncTalentPlan === 'function') _syncTalentPlan(u.uid, 'free').catch(() => { });
        }
    } catch (e) {
        showAuthError(AUTH_ERRORS[e.code] || e.message);
    } finally {
        if (btn) btn.disabled = false;
    }
};

window.doLogout = async function () {
    if (typeof stopListeners === 'function') stopListeners();
    await signOut(window.auth);

    // Limpa estados globais (serão resetados no onAuthStateChanged também)
    window._projects = []; window._collabs = []; window._users = []; window._ready = false;
    window._currentTeamId = null; window._myTeams = []; localStorage.removeItem('last_team_id');
    currentUser = null; currentUserData = null;
    window._appCurrentUser = null; window._appCurrentUserData = null;

    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('pending-screen').style.display = 'none';
    document.getElementById('teams-screen').style.display = 'none';
    document.getElementById('header-user-info').style.display = 'none';
    const sb = document.getElementById('sidebar'); if (sb) sb.style.display = 'none';
    const mc = document.querySelector('.main-content'); if (mc) mc.style.display = 'none';
    document.querySelector('.app').style.display = 'none';
    clearAuthMessages();

    const _lb = document.getElementById('login-btn');
    if (_lb) { _lb.disabled = false; _lb.textContent = 'Entrar'; }
    const _rb = document.getElementById('register-btn');
    if (_rb) { _rb.disabled = false; _rb.textContent = 'Criar Conta'; }
};

// ─── AUTH STATE OBSERVER ──────────────────────────────────────────────────────
onAuthStateChanged(window.auth, async user => {
    if (!user) {
        document.getElementById('auth-screen').style.display = 'block';
        document.getElementById('pending-screen').style.display = 'none';
        document.getElementById('teams-screen').style.display = 'none';
        const sb = document.getElementById('sidebar'); if (sb) sb.style.display = 'none';
        const mc = document.querySelector('.main-content'); if (mc) mc.style.display = 'none';
        document.querySelector('.app').style.display = 'none';

        window._myTalentProfile = null;
        window._adbCurrentProfile = null;
        currentUser = null;
        currentUserData = null;
        if (typeof hideLoading === 'function') hideLoading();
        return;
    }

    currentUser = user;
    window._appCurrentUser = user;
    if (typeof showLoading === 'function') showLoading('Carregando workspace...');
    document.getElementById('auth-screen').style.display = 'none';
    if (typeof hideAuthPanel === 'function') hideAuthPanel();

    let userData = null;
    try {
        const userSnap = await getDoc(doc(window.db, 'users', user.uid));
        if (userSnap.exists()) userData = userSnap.data();
    } catch (e) { }

    if (!userData) {
        userData = { uid: user.uid, name: user.displayName || user.email, email: user.email, role: 'member', plan: 'free', status: 'approved', discordId: null, createdAt: new Date().toISOString() };
        await setDoc(doc(window.db, 'users', user.uid), userData);
        if (typeof _syncTalentPlan === 'function') _syncTalentPlan(user.uid, 'free').catch(() => { });
    }

    currentUserData = userData;

    if (typeof getPlanConfig === 'function') {
        const _bootPlan = getUserPlan(currentUserData);
        const _bootConfig = getPlanConfig(_bootPlan);
        console.info(`[PlanEngine] uid=${userData.uid} | plan=${_bootPlan}`);
    }

    if (typeof refreshEffectivePriority === 'function' && typeof userData.effectivePriority !== 'number') {
        refreshEffectivePriority(user.uid).catch(() => { });
    }

    // Chamar inicializadores do app que ficaram no firebase-init.js (ou outros módulos)
    if (typeof loadMyTeams === 'function') await loadMyTeams();

    if (typeof hideLoading === 'function') hideLoading();

    // Redirecionamento por Invite Code ou Restore Last Team
    const urlParams = new URLSearchParams(window.location.search);
    const urlInviteCode = urlParams.get('code');

    if (urlInviteCode) {
        const url = new URL(window.location.href);
        url.searchParams.delete('code');
        window.history.replaceState({}, '', url);

        const alreadyMemberTeam = window._myTeams?.find(t => t.inviteCode === urlInviteCode);
        if (alreadyMemberTeam && typeof enterTeam === 'function') {
            enterTeam(alreadyMemberTeam.id);
            return;
        }
        window._pendingInviteCode = urlInviteCode;
        const codeInput = document.getElementById('join-team-code');
        if (codeInput) codeInput.value = urlInviteCode;
    }

    const lastTeamId = localStorage.getItem('last_team_id');
    if (lastTeamId && window._myTeams?.find(t => t.id === lastTeamId) && !urlInviteCode) {
        if (typeof enterTeam === 'function') {
            enterTeam(lastTeamId);
            return;
        }
    }

    document.getElementById('pending-screen').style.display = 'none';
    { const _s = document.getElementById('sidebar'); if (_s) _s.style.display = 'none'; }
    { const _m = document.querySelector('.main-content'); if (_m) _m.style.display = 'none'; }
    { const _a = document.querySelector('.app'); if (_a) _a.style.display = 'none'; }
    document.getElementById('teams-screen').style.display = 'flex';

    if (typeof renderTeamsList === 'function') renderTeamsList();
    if (typeof renderTeamsScreenExtras === 'function') renderTeamsScreenExtras();
    if (typeof initNotifications === 'function') initNotifications();
    if (typeof pmInit === 'function') pmInit();
    if (typeof intStartUserNotifListener === 'function') intStartUserNotifListener();

    setTimeout(() => {
        if (typeof renderTeamsScreenExtras === 'function') renderTeamsScreenExtras();
        if (typeof intUpdateBadges === 'function') intUpdateBadges();
    }, 1500);
});
