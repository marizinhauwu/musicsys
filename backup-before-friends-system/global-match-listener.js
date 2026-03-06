// ══════════════════════════════════════════════════════════════════════════════
// GLOBAL MATCH LISTENER — singleton, contexto-independente
// Iniciado após onAuthStateChanged. Nunca depende de _currentTeamId, appContext,
// showMainApp() ou startListeners(). Escuta matches com notified==false.
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  'use strict';
  let _globalMatchUnsub = null;

  // Chamado pelo onAuthStateChanged após login — ver hook abaixo
  window.initGlobalMatchListener = function (user) {
    if (!user) { _stopGlobalMatchListener(); return; }
    if (_globalMatchUnsub) return; // singleton

    try {
      const q = window.query(
        window.collection(window.db, 'matches'),
        window.where('participants', 'array-contains', user.uid),
        window.where('notified', '==', false)
      );
      _globalMatchUnsub = window.onSnapshot(q, snap => {
        snap.docChanges().forEach(change => {
          if (change.type !== 'added') return;
          const data = { id: change.doc.id, ...change.doc.data() };
          _markMatchNotified(data.id); // marcar antes de exibir para evitar re-show
          _buildAndShowGlobalMatch(data);
        });
      }, err => {
        // permission-denied silencioso — overlay manual via matchShowCelebration() continua
        console.warn('[GlobalMatchListener]', err.code, err.message);
        _globalMatchUnsub = null;
      });
    } catch (e) {
      console.warn('[GlobalMatchListener] init error:', e.message);
    }
  };

  function _stopGlobalMatchListener() {
    if (_globalMatchUnsub) { _globalMatchUnsub(); _globalMatchUnsub = null; }
  }

  async function _markMatchNotified(matchId) {
    try {
      await window.updateDoc(window.doc(window.db, 'matches', matchId), { notified: true });
    } catch (e) { console.warn('[GlobalMatchListener] markNotified:', e.message); }
  }

  function _buildAndShowGlobalMatch(data) {
    const name1 = data.userName || data.name1 || '';
    const photo1 = data.userPhoto || data.photo1 || '';
    const name2 = data.teamName || data.name2 || '';
    const photo2 = data.teamPhoto || data.photo2 || '';
    window.showGlobalMatch({ name1, photo1, name2, photo2, matchId: data.id });
  }

  // showGlobalMatch({ name1, photo1, name2, photo2, matchId })
  // API pública — funciona em qualquer tela, sem dependência de equipe.
  window.showGlobalMatch = function ({ name1 = '', photo1 = '', name2 = '', photo2 = '', matchId = null } = {}) {
    const overlay = document.getElementById('match-celebrate-overlay');
    if (!overlay) return;
    window._pendingMatchIdForCelebration = matchId;

    const avs = document.getElementById('match-cel-avatars');
    const nms = document.getElementById('match-cel-names');
    if (avs) {
      const _safe = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const _isSafeUrl = u => /^https?:\/\//i.test(u) || /^data:image\//i.test(u);
      const mk = (ph, nm) => (ph && _isSafeUrl(ph))
        ? `<img src="${_safe(ph)}" style="width:100%;height:100%;object-fit:cover">`
        : (nm[0] || '?').toUpperCase();
      avs.innerHTML = `<div class="match-cel-av">${mk(photo1, name1)}</div><span class="match-cel-heart">💛</span><div class="match-cel-av team">${mk(photo2, name2)}</div>`;
    }
    if (nms) nms.textContent = name1 + ' & ' + name2 + ' se curtiram!';

    overlay.classList.add('visible');
    if (typeof _matchLaunchConfetti === 'function') _matchLaunchConfetti();

    // Fecha com Escape
    const _esc = e => { if (e.key === 'Escape') { window.matchHideCelebration(); document.removeEventListener('keydown', _esc); } };
    document.addEventListener('keydown', _esc);
  };

  // Patch matchShowCelebration e matchHideCelebration após scripts principais carregarem
  document.addEventListener('DOMContentLoaded', () => {
    window.matchShowCelebration = function (name1, photo1, name2, photo2, matchId) {
      window.showGlobalMatch({ name1, photo1, name2, photo2, matchId });
    };
    window.matchHideCelebration = function () {
      const overlay = document.getElementById('match-celebrate-overlay');
      if (!overlay) return;
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.25s';
      setTimeout(() => {
        overlay.classList.remove('visible');
        overlay.style.opacity = '';
        overlay.style.transition = '';
      }, 250);
    };
  });

  // Hook automático: inicia listener quando onAuthStateChanged detectar login.
  // Aguarda Firebase estar disponível no window antes de registrar.
  function _hookAuth() {
    if (!window.onAuthStateChanged || !window.auth) {
      setTimeout(_hookAuth, 200);
      return;
    }
    window.onAuthStateChanged(window.auth, user => {
      if (user) {
        // Pequeno delay para garantir que db/query estão disponíveis
        setTimeout(() => window.initGlobalMatchListener(user), 800);
      } else {
        _stopGlobalMatchListener();
      }
    });
  }
  _hookAuth();
})();
