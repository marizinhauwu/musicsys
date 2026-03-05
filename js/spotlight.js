// ══════════════════════════════════════════════════════════════════════
//  SPOTLIGHT HORIZONTAL ENGINE  v2 — robust, no override conflicts
// ══════════════════════════════════════════════════════════════════════

// ── Utility helpers ──────────────────────────────────────────────────
if (typeof escHtml === 'undefined') {
  window.escHtml = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function spotGetInitial(name) { return (name || '?')[0].toUpperCase(); }

function spotGradientFor(idx) {
  const gs = [
    'linear-gradient(135deg,#ff3cb4,#ff6b3d)',
    'linear-gradient(135deg,#ff6b3d,#ffc83c)',
    'linear-gradient(135deg,#72efdd,#0d8f6a)',
    'linear-gradient(135deg,#9b1a6b,#ff3cb4)',
    'linear-gradient(135deg,#3b82f6,#7c3aed)',
    'linear-gradient(135deg,#ffc83c,#ff6b3d)',
  ];
  return gs[idx % gs.length];
}

function spotBgFor(idx) {
  const bgs = [
    'linear-gradient(145deg,#1a0830,#0d1a2a)',
    'linear-gradient(145deg,#0a1a2a,#1a0820)',
    'linear-gradient(145deg,#0d1a0a,#1a1a0a)',
    'linear-gradient(145deg,#1a0a0a,#0d0a2a)',
    'linear-gradient(145deg,#0a0a1a,#1a0a14)',
    'linear-gradient(145deg,#1a1a0d,#0d1a1a)',
  ];
  return bgs[idx % bgs.length];
}

function spotConfetti(container) {
  if (!container) return;
  const colors = ['#ff3cb4', '#ff6b3d', '#ffc83c', '#72efdd', '#ff5c7c', '#f8eef6'];
  for (let i = 0; i < 28; i++) {
    const el = document.createElement('div');
    const cx = (Math.random() - 0.5) * 120;
    el.style.cssText = `position:absolute;width:${5 + Math.random() * 7}px;height:${5 + Math.random() * 7}px;`
      + `left:${20 + Math.random() * 60}%;top:-10px;`
      + `background:${colors[Math.floor(Math.random() * colors.length)]};`
      + `border-radius:${Math.random() > 0.5 ? '50%' : '3px'};`
      + `--cx:${cx}px;`
      + `animation:confettiDrop ${0.9 + Math.random() * 1.1}s ease ${Math.random() * 0.4}s forwards;`
      + `z-index:200;pointer-events:none;`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }
}

function spotBuildStats(stats) {
  if (!stats) return '';
  const entries = Object.entries(stats).filter(([, v]) => v && String(v) !== '0' && v !== '-');
  if (!entries.length) return '';
  const labels = { projects: 'PROJETOS', views: 'VIEWS', followers: 'SEGUID.' };
  return entries.slice(0, 3).map(([k, v]) =>
    `<div class="spotlight-stat">
      <div class="spotlight-stat-num">${escHtml(String(v))}</div>
      <div class="spotlight-stat-lbl">${labels[k] || k.toUpperCase()}</div>
    </div>`
  ).join('');
}

function spotBuildLinks(links) {
  if (!links) return '';
  const map = { youtube: '▶ YouTube', spotify: '♫ Spotify', instagram: '◈ Instagram', tiktok: 'TikTok', discord: '🎮 Discord', site: '🔗 Site' };
  return Object.entries(links).filter(([, v]) => v).map(([k, v]) => {
    const href = v.startsWith('http') ? v : 'https://' + v;
    return `<a href="${href}" target="_blank" class="spotlight-link-btn">${map[k] || k}</a>`;
  }).join('');
}

function spotProgress(el, total, current) {
  if (!el) return;
  el.innerHTML = Array.from({ length: Math.min(total, 10) }, (_, i) =>
    `<div class="spot-prog-dot${i < current ? ' done' : i === current ? ' active' : ''}"></div>`
  ).join('');
}

function spotAnimate(wrapId, dir, cb) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) { if (cb) cb(); return; }
  const cls = dir === 'skip' ? 'sliding-left' : 'sliding-right';
  wrap.classList.add(cls);
  setTimeout(() => {
    wrap.classList.remove(cls);
    if (cb) cb();
    setTimeout(() => {
      wrap.classList.add('sliding-in');
      setTimeout(() => wrap.classList.remove('sliding-in'), 420);
    }, 20);
  }, 320);
}

function spotShowMatch(wrapId, matchId, subId, avsId, name1, init1, grad1, name2, init2, grad2, isTeam2) {
  const wrap = document.getElementById(wrapId);
  const matchEl = document.getElementById(matchId);
  const subEl = document.getElementById(subId);
  const avsEl = document.getElementById(avsId);
  if (subEl) subEl.textContent = name2.toUpperCase() + ' TAMBÉM TE CURTIU!';
  if (avsEl) {
    const shape2 = isTeam2 ? 'border-radius:20px' : 'border-radius:50%';
    avsEl.innerHTML = `
      <div class="spot-match-av" style="background:${grad1}">${init1}</div>
      <div style="font-size:26px;animation:spotMatchTitle 0.5s ease 0.9s both">💚</div>
      <div class="spot-match-av" style="background:${grad2};${shape2}">${init2}</div>`;
  }
  if (matchEl) {
    matchEl.classList.add('show');
    spotConfetti(wrap);
    setTimeout(() => matchEl.classList.remove('show'), 3300);
  }
}

// ══════════════════════════════════════════════════════════════════════
//  EQUIPE VÊ ARTISTAS — hub spotlight
// ══════════════════════════════════════════════════════════════════════
let _hubSpotIndex = 0;
let _hubSpotEligible = [];

function _getHubEligibleTalents() {
  const vacancies = (window._teamProfile && window._teamProfile.vacancies) ? window._teamProfile.vacancies : {};
  const vacRoles = Object.keys(vacancies).filter(r => vacancies[r] > 0);

  let pool = [];
  // Always include mock data when enabled
  if (window.USE_MOCK_DATA && typeof window.MOCK_TALENT_PROFILES !== 'undefined') {
    pool = [...window.MOCK_TALENT_PROFILES];
  }
  // Merge real Firestore profiles
  if (Array.isArray(window._hubAllTalents)) {
    pool = pool.concat(window._hubAllTalents);
  }
  // Deduplicate by uid/id
  const seen = new Set();
  pool = pool.filter(t => {
    const k = t.uid || t.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // If no open vacancies, show all
  if (vacRoles.length === 0) return pool;
  return pool.filter(t => vacRoles.some(r => t.skills && t.skills[r]));
}

window.renderHubSpotlight = function () {
  _hubSpotEligible = _getHubEligibleTalents();
  const wrap = document.getElementById('hub-spotlight-wrap');
  const empty = document.getElementById('hub-spot-empty');
  const prog = document.getElementById('hub-spot-progress');
  if (!wrap) return;

  if (_hubSpotIndex >= _hubSpotEligible.length) {
    wrap.style.display = 'none';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  wrap.style.display = 'flex';

  const t = _hubSpotEligible[_hubSpotIndex];
  const vacancies = (window._teamProfile && window._teamProfile.vacancies) ? window._teamProfile.vacancies : {};
  const vacRoles = Object.keys(vacancies).filter(r => vacancies[r] > 0);
  const myRole = (window.TALENT_ROLES || []).find(x => vacRoles.includes(x.id) && t.skills && t.skills[x.id]);

  spotProgress(prog, _hubSpotEligible.length, _hubSpotIndex);

  // ── Visual ──
  const avEl = document.getElementById('hub-spot-avatar');
  if (avEl) {
    if (t.photo) {
      avEl.style.background = 'none';
      avEl.innerHTML = `<img src="${escHtml(t.photo)}" class="u-avatar-img">`;
    } else {
      avEl.style.background = spotGradientFor(_hubSpotIndex);
      avEl.textContent = spotGetInitial(t.name);
    }
  }
  const bgEl = document.getElementById('hub-spot-bg');
  if (bgEl) bgEl.style.background = spotBgFor(_hubSpotIndex);

  const stEl = document.getElementById('hub-spot-status');
  if (stEl) {
    stEl.className = 'spotlight-status-pill' + (t.availability === 'busy' ? ' busy' : '');
    stEl.textContent = t.availability === 'busy' ? '🔶 OCUPADO' : '✅ DISPONÍVEL';
  }
  const rtEl = document.getElementById('hub-spot-roletag');
  if (rtEl) rtEl.textContent = myRole ? (myRole.icon + ' ' + myRole.label) : '';

  // ── Content ──
  const compatEl = document.getElementById('hub-spot-compat-text');
  if (compatEl) compatEl.textContent = myRole ? ('COMPATÍVEL · VAGA DE ' + myRole.label.toUpperCase()) : 'COMPATÍVEL COM SUA EQUIPE';

  const nameEl = document.getElementById('hub-spot-name');
  if (nameEl) nameEl.textContent = t.name || '—';

  // ETAPA 5: badge inline ao lado do nome no spotlight
  const spotBadgePlanInfo = typeof getEffectivePlanForUser === 'function' ? getEffectivePlanForUser(t) : { plan: t.plan || 'free' };
  const spotBadgeEl = document.getElementById('hub-spot-plan-badge');
  if (spotBadgeEl) spotBadgeEl.innerHTML = typeof renderPlanChip === 'function' ? renderPlanChip(spotBadgePlanInfo, 'inline') : '';

  const tagEl = document.getElementById('hub-spot-tagline');
  if (tagEl) tagEl.textContent = (t.title || '') + (t.location ? ' · ' + t.location : '');

  const bioEl = document.getElementById('hub-spot-bio');
  if (bioEl) bioEl.textContent = t.bio || '';

  const tagsLbl = document.getElementById('hub-spot-tags-label');
  if (tagsLbl) tagsLbl.textContent = 'HABILIDADES';

  const tagsEl = document.getElementById('hub-spot-tags');
  if (tagsEl) {
    tagsEl.innerHTML = Object.keys(t.skills || {}).map(rid => {
      const role = (window.TALENT_ROLES || []).find(x => x.id === rid);
      const lv = (window.SKILL_LEVELS || []).find(x => x.id === (t.skills || {})[rid]);
      if (!role) return '';
      const c = lv ? lv.color : 'var(--text3)';
      const match = vacRoles.includes(rid);
      return `<span class="spotlight-tag" style="background:${c}18;border:1px solid ${c}40;color:${c}${match ? ';font-weight:700;box-shadow:0 0 8px ' + c + '40' : ''}">${role.icon} ${role.label}${lv ? ' · ' + lv.label : ''}${match ? ' ✓' : ''}</span>`;
    }).join('');
  }

  const linksEl = document.getElementById('hub-spot-links');
  if (linksEl) linksEl.innerHTML = spotBuildLinks(t.links);

  const statsEl = document.getElementById('hub-spot-stats');
  if (statsEl) statsEl.innerHTML = spotBuildStats(t.stats);
};

// Kept for backward compat with old tab system
window.renderHubSwipeCard = function () { renderHubSpotlight(); };

window.hubSpotAction = async function (action) {
  if (_hubSpotIndex >= _hubSpotEligible.length) return;
  const t = _hubSpotEligible[_hubSpotIndex];

  if (action === 'super') {
    if (typeof toast === 'function') toast('⭐ Super Like enviado! Você aparece em destaque.');
  }

  if (action === 'like' || action === 'super') {
    const isMutual = await _hubDoLike(t);
    if (isMutual) {
      _hubSpotIndex++;
      setTimeout(() => renderHubSpotlight(), 100);
      return;
    }
  }

  spotAnimate('hub-spotlight-wrap', action === 'skip' ? 'skip' : 'like', () => {
    _hubSpotIndex++;
    renderHubSpotlight();
  });
};

async function _hubDoLike(t) {
  const talentUid = t.uid || t.id;
  if (window._hubTeamLikes) window._hubTeamLikes[talentUid] = true;
  try {
    if (window.db && window.doc && window.setDoc && !talentUid.startsWith('mock_')) {
      await setDoc(doc(db, 'team_likes', _currentTeamId),
        { likes: { [talentUid]: true }, teamId: _currentTeamId, updatedAt: new Date().toISOString() },
        { merge: true });
    }
  } catch (e) { }

  let isMutual = false;
  try {
    if (window.db && !talentUid.startsWith('mock_')) {
      const snap = await getDoc(doc(db, 'talent_likes', talentUid));
      isMutual = snap.exists() && !!(snap.data()?.likedTeams?.[_currentTeamId]);
    } else {
      isMutual = Math.random() > 0.55;
    }
  } catch (e) { }

  if (isMutual) {
    const teamName = (window._teamProfile && window._teamProfile.name) ||
      (_myTeams && _myTeams.find(x => x.id === _currentTeamId)?.name) || 'Equipe';
    spotShowMatch(
      'hub-spotlight-wrap', 'hub-spot-match', 'hub-spot-match-sub', 'hub-spot-match-avs',
      teamName, spotGetInitial(teamName), spotGradientFor(10),
      t.name, spotGetInitial(t.name), spotGradientFor(_hubSpotIndex),
      false
    );
    if (typeof toast === 'function') toast('🎉 Match com ' + (t.name || 'talento') + '!', 'success');
  } else {
    if (typeof toast === 'function') toast('💌 Interesse enviado para ' + (t.name || 'talento') + '!');
  }
  return isMutual;
}

// ══════════════════════════════════════════════════════════════════════
//  TAB WIRING — Hub tab system
// ══════════════════════════════════════════════════════════════════════
(function wireSpotlight() {

  // ── Hub tab system ──
  window.setMatchHubTab = function (tab) {
    window._currentHubTab = tab;
    ['search', 'match', 'matches'].forEach(t => {
      const el = document.getElementById('hub-tab-' + t);
      const btn = document.getElementById('hub-btn-' + t);
      if (el) el.style.display = t === tab ? 'block' : 'none';
      if (btn) btn.className = t === tab ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
    });
    if (tab === 'search' && window.renderHubSearch) renderHubSearch();
    if (tab === 'match') { window._hubSpotIndex = 0; renderHubSpotlight(); }
    if (tab === 'matches' && window.renderHubMatchesFixed) renderHubMatchesFixed();
  };

  // ── Legacy aliases (Hub only) ──
  window.renderHubSwipeCard = function () { renderHubSpotlight(); };
  window.hubSwipeAction = function (a) { hubSpotAction(a === 'like' ? 'like' : 'skip'); };

  // ── openMatchHub — always starts on spotlight tab, merge mocks ──
  window.openMatchHub = async function () {
    if (typeof showLoading === 'function') showLoading('Carregando talentos...');
    window._hubAllTalents = window._hubAllTalents || [];
    try {
      if (window.db) {
        const snap = await getDocs(collection(db, 'talent_profiles'));
        window._hubAllTalents = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(t => t.availability !== 'hidden')
          .sort(typeof _sortByPriority === 'function' ? _sortByPriority : () => 0); // ETAPA 4
      }
    } catch (e) { }
    try {
      if (window.db && window._currentTeamId) {
        const ls = await getDoc(doc(db, 'team_likes', _currentTeamId));
        window._hubTeamLikes = ls.exists() ? (ls.data().likes || {}) : {};
      }
    } catch (e) { window._hubTeamLikes = {}; }
    if (typeof hideLoading === 'function') hideLoading();
    if (typeof openModal === 'function') openModal('modal-match-hub');
    setMatchHubTab('match');
  };

})();

// ── Keyboard shortcuts (Hub only) ─────────────────────────────────────
document.addEventListener('keydown', function (e) {
  const hubMatch = document.getElementById('hub-tab-match');
  if (hubMatch && hubMatch.style.display !== 'none') {
    if (e.key === 'ArrowLeft') hubSpotAction('skip');
    if (e.key === 'ArrowRight') hubSpotAction('like');
    if (e.key === 'ArrowUp') hubSpotAction('super');
  }
});
