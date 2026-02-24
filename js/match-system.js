// ══════════════════════════════════════════════════════════════════════════════
// MATCH SYSTEM v2 — Procure sua Equipe & Encontre Artistas
// ══════════════════════════════════════════════════════════════════════════════

const MATCH_ROLES = [
  { id:'r_vocal',  label:'Vocais',         icon:'🎤' },
  { id:'r_beat',   label:'Beat',           icon:'🥁' },
  { id:'r_mix',    label:'Mix & Master',   icon:'🎚️' },
  { id:'r_letra',  label:'Letra',          icon:'✍️' },
  { id:'r_edit',   label:'Edição de Vídeo',icon:'🎬' },
  { id:'r_ilus',   label:'Ilustração',     icon:'🖼️' },
  { id:'r_thumb',  label:'Thumbnail',      icon:'🎨' },
  { id:'r_ideal',  label:'Idealização',    icon:'💡' },
  { id:'r_roteiro',label:'Roteiro',        icon:'📝' },
  { id:'r_direcao',label:'Direção',        icon:'🎬' },
];

const MATCH_BANNER_GRADS = [
  'linear-gradient(135deg,#a855f7,#3c8eff)',
  'linear-gradient(135deg,#ff3c8e,#ff8c00)',
  'linear-gradient(135deg,#00c896,#3c8eff)',
  'linear-gradient(135deg,#ffc83c,#ff6b35)',
  'linear-gradient(135deg,#3c8eff,#00c896)',
  'linear-gradient(135deg,#ff3c8e,#a855f7)',
];

// ── State ─────────────────────────────────────────────────────────────────────
let _matchAllTalents = [];
let _matchFiltered   = [];
let _matchMode       = 'grid';   // 'grid' | 'swipe'
let _matchSwipeIdx   = 0;
let _matchLikes      = {};  // { uid: true }
let _matchConfirmed  = {};  // { uid: true }
let _matchView       = 'team';
let _matchRoleFilter = '';
let _matchInboxTab   = 'received';
let _matchIsArtistMode   = false;  // true when user has no team (browsing teams)
let _matchAllTeams       = [];     // all teams with vacancies (artist mode)
let _matchTeamsFiltered  = [];     // filtered subset
let _matchArtistSentInterests = {}; // { teamId: 'pending'|'accepted' }

// ── Load page ─────────────────────────────────────────────────────────────────
window._loadTalentsPageV5 = window.loadTalentsPage = async function() {
  const noteam    = document.getElementById('match-noteam');
  const noprofile = document.getElementById('match-noprofile');
  const main      = document.getElementById('match-main');

  noteam?.classList.add('hidden');
  noprofile?.classList.add('hidden');
  main?.classList.add('hidden');

  // Reset swipe state to prevent getting stuck if navigated away during animation
  _matchSwipeState = 'idle';

  // Se foi aberto da teams-screen (Procurar Equipe), força modo artista
  // independente do _currentTeamId salvo no localStorage
  const forceArtist = !!window._talentStandaloneForceArtistMode;
  window._talentStandaloneForceArtistMode = false; // reset após usar

  window.showLoading('Carregando...');
  try {
    // Load my profile (needed in both modes)
    if (window._matchGetUser) {
      try {
        const snap = await window.getDoc(window.doc(window.db, 'talent_profiles', window._matchGetUser.uid));
        if (snap.exists()) {
          window._myTalentProfile = { id: window._matchGetUser.uid, ...snap.data() };
          _matchUpdateMyProfileBtn(window._myTalentProfile);
        } else {
          window._myTalentProfile = null;
        }
      } catch(e) { window._myTalentProfile = null; }
    }

    if (!window._currentTeamId || forceArtist) {
      // ── ARTIST MODE: sem equipe ou chamado da teams-screen ────────────────
      _matchIsArtistMode = true;
      _matchConfigureArtistModeUI();

      if (!window._myTalentProfile) {
        window.hideLoading();
        noprofile?.classList.remove('hidden');
        return;
      }

      await _matchLoadArtistMode();
      window.hideLoading();
      main?.classList.remove('hidden');
      matchSwitchView('team'); // view-team agora mostra equipes pra artista
      matchRenderInbox();
      matchRenderMatches();
      // Atualiza badge de interesses recebidos na Tab 2 (artista)
      _matchUpdateArtistReceivedBadge();

    } else {
      // ── TEAM MODE: tem equipe → equipe busca artistas ────────────────────
      _matchIsArtistMode = false;
      _matchConfigureTeamModeUI();

      if (!window._myTalentProfile) {
        window.hideLoading();
        noprofile?.classList.remove('hidden');
        return;
      }

      const talentSnap = await window.getDocs(
        window.query(window.collection(window.db, 'talent_profiles'), window.limit(500))
      );
      _matchAllTalents = talentSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(t => t.availability !== 'hidden' && t.uid !== window._matchGetUser?.uid);

      try {
        const likesSnap = await window.getDoc(window.doc(window.db, 'team_likes', window._currentTeamId));
        const rawLikes = likesSnap.exists() ? (likesSnap.data().likes || {}) : {};
        // Filtra entradas inválidas: só mantém UIDs que existem em talent_profiles
        // Isso remove ghost entries (IDs de documentos antigos, uids corrompidos, etc.)
        const validUids = new Set(_matchAllTalents.map(t => t.uid || t.id));
        _matchLikes = {};
        Object.keys(rawLikes).forEach(k => {
          if (validUids.has(k)) _matchLikes[k] = rawLikes[k];
        });
      } catch(e) { _matchLikes = {}; }

      try {
        const matchQ = window.query(window.collection(window.db, 'matches'), window.where('teamId', '==', window._currentTeamId), window.limit(50));
        const matchSnap = await window.getDocs(matchQ);
        _matchConfirmed = {};
        matchSnap.docs.forEach(d => { _matchConfirmed[d.data().userUid] = { id: d.id, ...d.data() }; });
      } catch(e) { _matchConfirmed = {}; }

      window.hideLoading();
      main?.classList.remove('hidden');
      matchFilter();
      matchRenderMode();
      matchRenderSentPanel();
      matchRenderInbox();
      matchRenderMatches();
      // Atualiza badge de matches na Tab 2
      const matchCount = Object.keys(_matchConfirmed).length;
      const matchBadge = document.getElementById('match-matches-badge');
      if (matchBadge) { if (matchCount) { matchBadge.style.display=''; matchBadge.textContent=matchCount; } else matchBadge.style.display='none'; }
    }

  } catch(e) {
    window.hideLoading();
    window.toast('Erro ao carregar: ' + e.message, 'error');
  }
};

// ── Artist mode: configure UI labels ─────────────────────────────────────────
function _matchConfigureArtistModeUI() {
  const btnTeam   = document.getElementById('match-vbtn-team');
  const btnArtist = document.getElementById('match-vbtn-artist');
  if (btnTeam)   btnTeam.innerHTML   = '🔍 ENCONTRAR EQUIPES';
  if (btnArtist) btnArtist.innerHTML = '📬 INTERESSES';

  // Topbar title
  const topbarTitle = document.querySelector('.talent-standalone-title');
  if (topbarTitle) topbarTitle.textContent = '🔍 PROCURAR EQUIPE';

  const panelTitle = document.querySelector('#match-view-team .match-panel-title > div > div:first-child');
  if (panelTitle) panelTitle.textContent = 'Encontrar Equipes';
  const panelSub = document.querySelector('#match-view-team .match-panel-title > div > div:last-child');
  if (panelSub) panelSub.textContent = 'MODO ARTISTA';
  const panelIcon = document.querySelector('#match-view-team .match-panel-icon');
  if (panelIcon) { panelIcon.textContent = '🔍'; panelIcon.style.background = 'linear-gradient(135deg,#ff3c8e,#ff8c00)'; }

  const search = document.getElementById('match-search');
  if (search) search.placeholder = 'Buscar por nome, estilo ou cidade...';

  // Sent panel title
  const sentPanelTitle = document.querySelector('#match-view-team .match-panel:last-child .match-panel-title');
  if (sentPanelTitle) {
    const tDiv = sentPanelTitle.querySelector('div:last-child');
    if (tDiv && !tDiv.className.includes('match-panel-icon')) tDiv.textContent = 'Interesses Enviados';
  }

  // Melhoria: reseta filtros de busca ao trocar de modo
  _matchResetFilters();
}

function _matchConfigureTeamModeUI() {
  const btnTeam   = document.getElementById('match-vbtn-team');
  const btnArtist = document.getElementById('match-vbtn-artist');
  if (btnTeam)   btnTeam.innerHTML   = '👥 ENCONTRAR ARTISTAS';
  if (btnArtist) btnArtist.innerHTML = '📬 INTERESSES RECEBIDOS';

  // Topbar title - quando equipe usa o sistema, o título muda
  const topbarTitle = document.querySelector('.talent-standalone-title');
  if (topbarTitle) topbarTitle.textContent = '🎯 ENCONTRAR MEMBROS';

  const panelTitle = document.querySelector('#match-view-team .match-panel-title > div > div:first-child');
  if (panelTitle) panelTitle.textContent = 'Encontrar Artistas';
  const panelSub = document.querySelector('#match-view-team .match-panel-title > div > div:last-child');
  if (panelSub) panelSub.textContent = 'VISÃO DA EQUIPE';
  const panelIcon = document.querySelector('#match-view-team .match-panel-icon');
  if (panelIcon) { panelIcon.textContent = '👥'; panelIcon.style.background = 'linear-gradient(135deg,var(--a1),var(--a2))'; }

  const search = document.getElementById('match-search');
  if (search) search.placeholder = 'Buscar por nome ou bio...';

  // Melhoria: reseta filtros de busca ao trocar de modo
  _matchResetFilters();
}

// ── Reset de filtros ao trocar de modo (artista ↔ equipe) ────────────────────
function _matchResetFilters() {
  // Limpa campo de texto
  const searchEl = document.getElementById('match-search');
  if (searchEl) searchEl.value = '';
  // Limpa disponibilidade (só existe no modo equipe, mas inofensivo no artista)
  const availEl = document.getElementById('match-avail');
  if (availEl) availEl.value = '';
  // Reseta chips de habilidade para TODOS
  _matchRoleFilter = '';
  document.querySelectorAll('.match-chip').forEach(c => c.classList.remove('match-chip-active'));
  const todosChip = document.querySelector('.match-chip[data-role=""]');
  if (todosChip) todosChip.classList.add('match-chip-active');
  // Reseta sub-aba da inbox para RECEBIDOS
  _matchInboxTab = 'received';
  document.querySelectorAll('.match-inbox-tab').forEach(t => t.classList.remove('match-itab-active'));
  const receivedTab = document.getElementById('itab-received');
  if (receivedTab) receivedTab.classList.add('match-itab-active');
}

// ── Artist mode: load teams from Firestore ────────────────────────────────────
async function _matchLoadArtistMode() {
  try {
    // Carrega teams e team_profiles em paralelo (limit 200 para segurança em escala)
    const [teamsSnap, tpSnap] = await Promise.all([
      window.getDocs(window.query(window.collection(window.db, 'teams'), window.limit(200))),
      window.getDocs(window.query(window.collection(window.db, 'team_profiles'), window.limit(200))).catch(() => ({ docs: [] }))
    ]);

    // Monta mapa de team_profiles por id
    const tpMap = {};
    tpSnap.docs.forEach(d => { tpMap[d.id] = d.data(); });

    // Merge: team_profiles tem foto, tagline, bio; teams tem name, members, vacancies
    _matchAllTeams = teamsSnap.docs
      .map(d => {
        const base = { id: d.id, ...d.data() };
        const tp   = tpMap[d.id] || {};
        return {
          ...base,
          photo:   tp.photo   || tp.logo    || base.photo   || '',
          banner:  tp.banner  || base.banner || '',
          tagline: tp.tagline || tp.description || base.tagline || '',
          bio:     tp.bio     || base.bio    || '',
          name:    tp.name    || base.name   || 'Equipe',
          vacancies: base.vacancies || tp.vacancies || {},
          isPublic: base.isPublic !== false,
        };
      })
      .filter(t => t.isPublic);

    // Load sent interests (artist→team) — single-field query to avoid composite index
    if (window._matchGetUser) {
      try {
        const q = window.query(
          window.collection(window.db, 'interests'),
          window.where('fromUserUid', '==', window._matchGetUser.uid),
          window.limit(100)
        );
        const snap = await window.getDocs(q);
        _matchArtistSentInterests = {};
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(d => d.type === 'artist_to_team')
          .forEach(d => { _matchArtistSentInterests[d.toTeamId] = d.status || 'pending'; });
      } catch(e) { _matchArtistSentInterests = {}; }
    }

    _matchTeamsFiltered = [..._matchAllTeams];
    const lbl = document.getElementById('match-count-lbl');
    if (lbl) lbl.textContent = _matchTeamsFiltered.length + ' equipe' + (_matchTeamsFiltered.length !== 1 ? 's' : '');

    _matchSwipeIdx = 0;
  } catch(e) {
    window.toast('Erro ao carregar equipes: ' + e.message, 'error');
  }
}

// ── Artist mode: atualiza badge de interesses recebidos ──────────────────────
async function _matchUpdateArtistReceivedBadge() {
  if (!window._matchGetUser) return;
  try {
    const q = window.query(
      window.collection(window.db, 'interests'),
      window.where('toUserUid', '==', window._matchGetUser.uid),
      window.limit(100)
    );
    const snap = await window.getDocs(q);
    const unread = snap.docs
      .map(d => d.data())
      .filter(d => d.type === 'team_to_artist' && d.status === 'pending' && !d.read).length;

    // Badge na Tab 2 (itab-received)
    const badge = document.getElementById('match-received-badge');
    if (badge) { if (unread > 0) { badge.style.display = ''; badge.textContent = unread; } else badge.style.display = 'none'; }
    // Badge no botão da sidebar (ts-interest-badge e interest-sidebar-badge)
    const tsb = document.getElementById('ts-interest-badge');
    if (tsb) { tsb.textContent = unread > 0 ? unread : ''; tsb.classList.toggle('show', unread > 0); }
    const sb = document.getElementById('interest-sidebar-badge');
    if (sb) { sb.textContent = unread > 0 ? unread : ''; sb.classList.toggle('show', unread > 0); }
  } catch(e) { /* ignora */ }
}

// ── Artist mode: filter teams ─────────────────────────────────────────────────
function matchFilterTeams() {
  const q    = (document.getElementById('match-search')?.value || '').toLowerCase();
  const role = _matchRoleFilter;

  _matchTeamsFiltered = _matchAllTeams.filter(t => {
    // Only filter by role when a specific role chip is selected
    if (role && !(t.vacancies && Number(t.vacancies[role]) > 0)) return false;
    if (q) {
      const text = ((t.name||'') + ' ' + (t.tagline||'') + ' ' + (t.bio||'') + ' ' + (t.location||'')).toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const lbl = document.getElementById('match-count-lbl');
  if (lbl) lbl.textContent = _matchTeamsFiltered.length + ' equipe' + (_matchTeamsFiltered.length !== 1 ? 's' : '');
  matchRenderMode();
}

// ── Artist mode: render team grid ─────────────────────────────────────────────
function matchRenderTeamGrid() {
  const grid  = document.getElementById('match-grid');
  const empty = document.getElementById('match-grid-empty');
  if (!grid) return;

  if (!_matchTeamsFiltered.length) {
    grid.innerHTML = '';
    empty?.classList.remove('hidden');
    if (empty) { const msg = empty.querySelector('div:last-child'); if (msg) msg.textContent = 'NENHUMA EQUIPE ENCONTRADA'; }
    return;
  }
  empty?.classList.add('hidden');

  const RLOC = {r_vocal:'🎤 Vocal',r_beat:'🥁 Beat',r_mix:'🎛️ Mix',r_letra:'✍️ Letra',r_edit:'🎬 Edição',r_ilus:'🖼️ Visual',r_thumb:'🎨 Thumb',r_ideal:'💡 Ideal',r_social:'📲 Social',r_photo:'📸 Foto'};
  const mySkills = Object.keys(window._myTalentProfile?.skills || {});

  grid.innerHTML = _matchTeamsFiltered.map((t, idx) => {
    const grad   = t.banner?.startsWith('http') ? `url('${t.banner}') center/cover` : MATCH_BANNER_GRADS[idx % MATCH_BANNER_GRADS.length];
    const avHtml = t.photo ? `<img src="${t.photo}" alt="">` : (t.name||'?')[0].toUpperCase();
    const status = _matchArtistSentInterests[t.id];

    let btnHtml;
    if (status === 'accepted' || status === 'matched') {
      btnHtml = `<button class="match-btn-interest matched" onclick="matchSwitchView('matches');event.stopPropagation()">💛 MATCH! VER</button>`;
    } else if (status) {
      btnHtml = `<button class="match-btn-interest sent" disabled>✅ INTERESSE ENVIADO</button>`;
    } else {
      btnHtml = `<button class="match-btn-interest send" id="mabtn-${t.id}" onclick="matchArtistSendInterest('${t.id}','${window.escHtml(t.name||'')}','${window.escHtml(t.photo||'')}');event.stopPropagation()">💛 DEMONSTRAR INTERESSE</button>`;
    }

    const vacTags = Object.entries(t.vacancies || {})
      .filter(([, v]) => Number(v) > 0).slice(0, 4)
      .map(([rid]) => `<span class="match-tcard-tag${mySkills.includes(rid)?' hi':''}">${RLOC[rid]||rid}</span>`)
      .join('');

    return `<div class="match-tcard" onclick="matchArtistViewTeam('${t.id}')">
      <div class="match-tcard-banner" style="background:${grad}"></div>
      <div class="match-tcard-av">${avHtml}</div>
      <div class="match-tcard-body">
        <div class="match-tcard-name">${window.escHtml(t.name||'Sem nome')}</div>
        <div class="match-tcard-handle">${window.escHtml(t.tagline||t.location||'')}</div>
        <div class="match-tcard-tags">${vacTags}</div>
        ${btnHtml}
      </div>
    </div>`;
  }).join('');
}

// ── Artist mode: render team swipe ────────────────────────────────────────────
function matchRenderTeamSwipe() {
  const container = document.getElementById('match-swipe-container');
  const btns      = document.getElementById('match-swipe-btns');
  const empty     = document.getElementById('match-swipe-empty');
  if (!container) return;

  container.querySelectorAll('.match-swipe-card').forEach(c => c.remove());

  if (_matchSwipeIdx >= _matchTeamsFiltered.length) {
    empty?.classList.remove('hidden'); btns?.classList.add('hidden');
    const lbl = document.getElementById('match-swipe-lbl');
    if (lbl) lbl.textContent = 'VOCÊ VIU TODAS AS EQUIPES!';
    return;
  }
  empty?.classList.add('hidden'); btns?.classList.remove('hidden');

  if (_matchSwipeIdx + 1 < _matchTeamsFiltered.length) {
    container.appendChild(_matchBuildTeamSwipeCard(_matchTeamsFiltered[_matchSwipeIdx + 1], false));
  }
  container.appendChild(_matchBuildTeamSwipeCard(_matchTeamsFiltered[_matchSwipeIdx], true));

  const lbl = document.getElementById('match-swipe-lbl');
  if (lbl) lbl.textContent = `${_matchSwipeIdx + 1} DE ${_matchTeamsFiltered.length} EQUIPES`;
}

function _matchBuildTeamSwipeCard(t, active) {
  const card = document.createElement('div');
  card.className = 'match-swipe-card' + (active ? ' front' : ' back');
  if (!active) {
    card.style.cssText = 'z-index:1;transform:scale(0.96) translateY(8px);opacity:0.6;pointer-events:none';
  } else {
    card.style.zIndex = '2';
  }

  const RLOC = {r_vocal:'🎤 Vocal',r_beat:'🥁 Beat',r_mix:'🎛️ Mix',r_letra:'✍️ Letra',r_edit:'🎬 Edição',r_ilus:'🖼️ Visual',r_thumb:'🎨 Thumb',r_ideal:'💡 Ideal',r_social:'📲 Social',r_photo:'📸 Foto'};
  const mySkills = Object.keys(window._myTalentProfile?.skills || {});
  const grad = t.banner?.startsWith('http') ? `url('${t.banner}') center/cover` : MATCH_BANNER_GRADS[_matchSwipeIdx % MATCH_BANNER_GRADS.length];
  const avHtml = t.photo ? `<img src="${t.photo}">` : `<span>${(t.name||'?')[0].toUpperCase()}</span>`;

  const vacHtml = Object.entries(t.vacancies || {})
    .filter(([, v]) => Number(v) > 0)
    .map(([rid]) => {
      const match = mySkills.includes(rid);
      return `<div class="match-swipe-skill" style="${match?'border-color:rgba(255,60,142,.4);color:var(--a1)':''}">${RLOC[rid]||rid}${match?' ✨':''}</div>`;
    }).join('');

  const locationHtml = t.location
    ? `<div class="match-swipe-avail" style="background:rgba(168,85,247,.1)"><span style="width:6px;height:6px;border-radius:50%;background:var(--purple);display:inline-block"></span>${window.escHtml(t.location)}</div>`
    : '';

  card.innerHTML = `
    <span class="match-swipe-overlay like" id="mswipe-like-lbl">CURTIR</span>
    <span class="match-swipe-overlay pass" id="mswipe-pass-lbl">PASSAR</span>
    <div class="match-swipe-card-banner" style="background:${grad}">
      <div class="match-swipe-av">${avHtml}</div>
    </div>
    <div class="match-swipe-body">
      <div class="match-swipe-name">${window.escHtml(t.name||'Sem nome')}</div>
      <div class="match-swipe-handle">${window.escHtml(t.tagline||'')}</div>
      ${locationHtml}
      <div class="match-swipe-bio">${window.escHtml((t.bio||'').substring(0, 160))}</div>
      <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3);margin-bottom:8px;letter-spacing:1px">VAGAS ABERTAS</div>
      <div class="match-swipe-skills">${vacHtml||'<div style="color:var(--text3);font-size:11px">Sem vagas listadas</div>'}</div>
    </div>`;
  return card;
}

// ── Artist mode: swipe action ─────────────────────────────────────────────────
function matchArtistSwipeAction(action) {
  if (_matchSwipeState !== 'idle') return;
  const card = document.querySelector('.match-swipe-card.front');
  if (!card) return;
  _matchSwipeState = 'busy';

  if (action === 'like' || action === 'superlike') {
    card.classList.add('going-right');
    const t = _matchTeamsFiltered[_matchSwipeIdx];
    if (t) {
      // Bug 4 Fix: atualiza cache local imediatamente para o painel refletir o estado correto,
      // sem depender do Firestore write completar antes do re-render
      _matchArtistSentInterests[t.id] = _matchArtistSentInterests[t.id] || 'pending';
      _matchArtistSendInterestSilent(t.id, t.name||'', t.photo||'')
        .then(() => matchRenderSentPanel());
      window.toast(action === 'superlike'
        ? '⭐ Super interesse enviado para ' + (t.name||'equipe') + '!'
        : '💛 Interesse enviado para ' + (t.name||'equipe') + '!');
      matchRenderSentPanel(); // render imediato com estado local (feedback visual instantâneo)
    }
  } else {
    card.classList.add('going-left');
  }

  setTimeout(() => {
    _matchSwipeIdx++;
    _matchSwipeState = 'idle';
    matchRenderTeamSwipe();
  }, 380);
}

// ── Artist send interest to team ─────────────────────────────────────────────
window.matchArtistSendInterest = async function(teamId, teamName, teamPhoto) {
  if (!teamId) return;
  // Melhoria: estado de loading imediato no botão antes do Firestore write
  const btn = document.getElementById('mabtn-' + teamId);
  if (btn) { btn.className = 'match-btn-interest loading'; btn.textContent = '⏳ ENVIANDO...'; btn.disabled = true; }
  await _matchArtistSendInterestSilent(teamId, teamName, teamPhoto);
  // Só atualiza para "enviado" se não virou match (matched já é tratado dentro do silent)
  if (btn && _matchArtistSentInterests[teamId] !== 'matched') {
    btn.className = 'match-btn-interest sent';
    btn.textContent = '✅ INTERESSE ENVIADO';
  }
  matchRenderSentPanel();
};

async function _matchArtistSendInterestSilent(teamId, teamName, teamPhoto) {
  if (!teamId || !window._matchGetUser) return;
  _matchArtistSentInterests[teamId] = 'pending';

  try {
    const p = window._myTalentProfile;
    // ── CORREÇÃO: campos duais (Match System + Interest Panel) ──
    const intData = {
      // Campos do Match System
      type:          'artist_to_team',
      fromUserUid:   window._matchGetUser.uid,
      fromUserName:  p?.name  || '',
      fromUserPhoto: p?.photo || '',
      toTeamId:      teamId,
      toTeamName:    teamName,
      toTeamPhoto:   teamPhoto,
      // Campos do Interest Panel (para intLoadAll encontrar)
      fromType:  'user',
      fromId:    window._matchGetUser.uid,
      fromName:  p?.name  || '',
      fromPhoto: p?.photo || '',
      toType:    'team',
      toId:      teamId,
      toName:    teamName,
      toPhoto:   teamPhoto,
      // Campos comuns
      createdAt: new Date().toISOString(),
      status:    'pending',
    };
    const intRef = await window.addDoc(window.collection(window.db, 'interests'), intData);

    // Busca reversa robusta: tenta padrão canônico primeiro, depois Match System
    let rev = null;
    try {
      const revQ1 = window.query(
        window.collection(window.db, 'interests'),
        window.where('fromId', '==', teamId),
        window.where('toId', '==', window._matchGetUser.uid), window.limit(1)
      );
      const revSnap1 = await window.getDocs(revQ1);
      if (!revSnap1.empty) rev = { id: revSnap1.docs[0].id, ...revSnap1.docs[0].data() };
    } catch(e) {}

    // Fallback: padrão Match System
    if (!rev) {
      try {
        const revQ2 = window.query(
          window.collection(window.db, 'interests'),
          window.where('toUserUid', '==', window._matchGetUser.uid),
          window.limit(100)
        );
        const revSnap2 = await window.getDocs(revQ2);
        const found = revSnap2.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .find(d => (d.fromTeamId === teamId || d.fromId === teamId) &&
                     (d.type === 'team_to_artist' || d.fromType === 'team') &&
                     d.status === 'pending');
        if (found) rev = found;
      } catch(e) {}
    }

    if (rev) {
      const _createdMatchId = await _matchCreateMatch(
        window._matchGetUser.uid, p?.name||'', p?.photo||'',
        rev.id, intRef.id,
        { teamId: rev.fromTeamId || rev.fromId, teamName: rev.fromTeamName||rev.fromName||teamName, teamPhoto: rev.fromTeamPhoto||rev.fromPhoto||teamPhoto, teamOwnerId: rev.senderUid||'' }
      );
      _matchArtistSentInterests[teamId] = 'matched';
      matchShowCelebration(teamName, teamPhoto, p?.name||'', p?.photo||'', _createdMatchId);
      matchRenderTeamGrid();
      matchRenderMatches();
    }
  } catch(e) {
    console.warn('[matchArtistSendInterest]', e.message);
  }
}

// ── Artist mode: sent interests panel (right panel in view-team) ──────────────
async function _matchRenderArtistSentPanel() {
  const sentList      = document.getElementById('match-sent-list');
  const confirmedList = document.getElementById('match-confirmed-team');
  const badge         = document.getElementById('match-sent-badge');
  if (!sentList) return;

  const pendingTeamIds = Object.keys(_matchArtistSentInterests).filter(id => _matchArtistSentInterests[id] === 'pending');
  const matchedTeamIds = Object.keys(_matchArtistSentInterests).filter(id => _matchArtistSentInterests[id] === 'accepted' || _matchArtistSentInterests[id] === 'matched');

  if (badge) {
    if (pendingTeamIds.length) { badge.style.display = ''; badge.textContent = pendingTeamIds.length + ' PENDENTE' + (pendingTeamIds.length !== 1 ? 'S' : ''); }
    else badge.style.display = 'none';
  }

  if (!pendingTeamIds.length) {
    sentList.innerHTML = `<div class="match-empty-state" style="padding:24px"><div style="font-size:28px;margin-bottom:8px">💛</div><div>NENHUM INTERESSE ENVIADO</div></div>`;
  } else {
    sentList.innerHTML = pendingTeamIds.map(tid => {
      const t = _matchAllTeams.find(x => x.id === tid);
      const name = t?.name || tid.substring(0, 8) + '...';
      const avHtml = t?.photo
        ? `<img src="${t.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`
        : `<span style="font-weight:800;font-size:14px">${(name[0]||'?').toUpperCase()}</span>`;
      return `<div class="match-sent-item" id="msent-${tid}" onclick="matchArtistViewTeam('${tid}')" style="cursor:pointer">
        <div class="match-sent-av" style="border-radius:10px;background:linear-gradient(135deg,var(--a1),var(--a2))">${avHtml}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${window.escHtml(name)}</div>
          <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3)">${window.escHtml(t?.tagline||'EQUIPE')}</div>
        </div>
        <button class="match-btn-decline" onclick="event.stopPropagation();matchCancelArtistInterest('${tid}','${window.escHtml(name)}')" style="font-size:9px;padding:5px 10px">✕ CANCELAR</button>
      </div>`;
    }).join('');
  }

  if (!matchedTeamIds.length) {
    if (confirmedList) confirmedList.innerHTML = `<div class="match-empty-state" style="padding:16px"><div style="font-size:24px;margin-bottom:6px">🏆</div><div>NENHUM MATCH AINDA</div></div>`;
  } else {
    if (confirmedList) confirmedList.innerHTML = matchedTeamIds.map(tid => {
      const t = _matchAllTeams.find(x => x.id === tid);
      const name = t?.name || tid.substring(0, 8);
      const avHtml = t?.photo ? `<img src="${t.photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:10px">` : (name[0]||'?').toUpperCase();
      return `<div class="match-card-item">
        <div class="match-card-pair">
          <div class="match-card-av" style="border-radius:10px">${avHtml}</div>
          <span style="font-size:16px">💛</span>
          <div class="match-card-info">
            <div class="match-card-title">${window.escHtml(name)}</div>
            <div class="match-card-sub">MATCH CONFIRMADO!</div>
          </div>
          <span class="match-badge">MATCH</span>
        </div>
        <div class="match-card-actions">
          <button class="match-btn-chat" onclick="(() => {
            const _tid = '${tid}';
            const _myUid = window._matchGetUser ? window._matchGetUser.uid : '';
            const _matchId = 'match_' + _tid + '_' + _myUid;
            matchSwitchView('matches');
            setTimeout(() => matchOpenChatInPanel(_matchId, 'artist'), 200);
          })()">💬 VER CHAT</button>
          <button class="match-btn-decline" style="font-size:9px;padding:5px 10px" onclick="(() => {
            const _tid = '${tid}';
            const _myUid = window._matchGetUser ? window._matchGetUser.uid : '';
            // v5.20.2 — passa o matchId determinístico como sugestão, mas matchCancelMatch
            // irá verificar a existência real do doc e usar query de fallback se necessário
            const _mId = 'match_' + _tid + '_' + _myUid;
            const _t = _matchAllTeams.find(x => x.id === _tid);
            matchCancelMatch(_mId, _tid, _myUid, (_t && _t.name) ? _t.name : _tid);
          })()">✕ CANCELAR</button>
        </div>
      </div>`;
    }).join('');
  }
}

// ── Artist mode: open team preview from grid card ─────────────────────────────
window.matchArtistViewTeam = function(teamId) {
  const t = _matchAllTeams.find(x => x.id === teamId);
  if (!t) return;
  matchSwitchView('artist');
  matchShowTeamPreview(teamId, t.name||'', t.photo||'');
};

// ── My profile button ─────────────────────────────────────────────────────────
function _matchUpdateMyProfileBtn(p) {
  const btn = document.getElementById('match-myprofile-btn');
  const av  = document.getElementById('match-myavatar');
  const nm  = document.getElementById('match-myname');
  if (btn) btn.style.display = 'block';
  if (av) {
    if (p.photo) { av.innerHTML = `<img src="${p.photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; }
    else { av.textContent = (p.name||'?')[0].toUpperCase(); }
  }
  if (nm) nm.textContent = (p.name || 'Meu Perfil').toUpperCase().substring(0, 14);
}

window.matchOpenMyProfile = async function() {
  // Open profile edit using existing UPE system if available
  if (typeof window.openUnifiedProfileEdit === 'function') {
    window.openUnifiedProfileEdit();
  } else {
    // Fallback: simple inline profile editor
    matchShowProfileEditor();
  }
};

// ── View switching ─────────────────────────────────────────────────────────────
window.matchSwitchView = function(view) {
  _matchView = view;
  document.querySelectorAll('.match-vbtn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.match-view').forEach(v => { v.classList.add('hidden'); v.classList.remove('match-view-active'); });

  const vbtn = document.getElementById('match-vbtn-' + view);
  if (vbtn) vbtn.classList.add('active');

  const vEl = document.getElementById('match-view-' + view);
  if (vEl) { vEl.classList.remove('hidden'); vEl.classList.add('match-view-active'); }

  if (view === 'team') {
    // Both modes: re-render grid + sent panel when switching to tab 1
    matchRenderMode();
    matchRenderSentPanel();
  } else if (view === 'artist') {
    matchRenderInbox();
  } else if (view === 'matches') {
    matchRenderMatches();
  }
};

// ── Mode (grid/swipe) ─────────────────────────────────────────────────────────
window.matchSetMode = function(mode) {
  _matchMode = mode;
  document.getElementById('match-mode-grid')?.classList.toggle('match-mode-active', mode === 'grid');
  document.getElementById('match-mode-swipe')?.classList.toggle('match-mode-active', mode === 'swipe');
  document.getElementById('match-grid-view').style.display   = mode === 'grid'  ? '' : 'none';
  document.getElementById('match-swipe-view').style.display  = mode === 'swipe' ? '' : 'none';
  if (mode === 'swipe') {
    _matchSwipeIdx = 0;
    if (_matchIsArtistMode) matchRenderTeamSwipe();  // artista vê equipes em swipe
    else matchRenderSwipe();                          // equipe vê artistas em swipe
  } else {
    if (_matchIsArtistMode) matchRenderTeamGrid();    // artista vê equipes em grid
    else matchRenderGrid();                           // equipe vê artistas em grid
  }
};

// ── Filtering ─────────────────────────────────────────────────────────────────
window.matchFilter = function() {
  if (_matchIsArtistMode) { matchFilterTeams(); return; }
  const q     = (document.getElementById('match-search')?.value || '').toLowerCase();
  const avail = document.getElementById('match-avail')?.value || '';
  const role  = _matchRoleFilter;

  _matchFiltered = _matchAllTalents.filter(t => {
    if (avail && t.availability !== avail) return false;
    if (role && !(t.skills && t.skills[role])) return false;
    if (q) {
      const text = ((t.name||'') + ' ' + (t.bio||'')).toLowerCase();
      if (!text.includes(q)) return false;
    }
    return true;
  });

  const lbl = document.getElementById('match-count-lbl');
  if (lbl) lbl.textContent = _matchFiltered.length + ' talento' + (_matchFiltered.length !== 1 ? 's' : '');

  matchRenderMode();
};

window.matchChip = function(el, role) {
  document.querySelectorAll('.match-chip').forEach(c => c.classList.remove('match-chip-active'));
  el.classList.add('match-chip-active');
  _matchRoleFilter = role;
  matchFilter();
};

function matchRenderMode() {
  if (_matchIsArtistMode) {
    if (_matchMode === 'grid') matchRenderTeamGrid();
    else { _matchSwipeIdx = 0; matchRenderTeamSwipe(); }
    return;
  }
  if (_matchMode === 'grid') matchRenderGrid();
  else { _matchSwipeIdx = 0; matchRenderSwipe(); }
}

// ── Grid ──────────────────────────────────────────────────────────────────────
function matchRenderGrid() {
  const grid  = document.getElementById('match-grid');
  const empty = document.getElementById('match-grid-empty');
  if (!grid) return;

  if (!_matchFiltered.length) {
    grid.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  // Get team vacancies for highlighting
  const team = (window._myTeams || []).find(t => t.id === window._currentTeamId);
  const vacancies = Object.keys(team?.vacancies || {}).filter(k => (team?.vacancies[k]||0) > 0);

  grid.innerHTML = _matchFiltered.map((t, idx) => {
    const grad    = t.banner?.startsWith('http') ? `url('${t.banner}') center/cover` : MATCH_BANNER_GRADS[idx % MATCH_BANNER_GRADS.length];
    const avHtml  = t.photo ? `<img src="${t.photo}" alt="">` : (t.name||'?')[0].toUpperCase();
    const isLiked = _matchLikes[t.uid || t.id];
    const isMatch = _matchConfirmed[t.uid || t.id];

    let btnHtml;
    if (isMatch) {
      btnHtml = `<button class="match-btn-interest matched" onclick="matchSwitchView('matches');event.stopPropagation()">💛 MATCH! VER</button>`;
    } else if (isLiked) {
      btnHtml = `<button class="match-btn-interest sent" disabled>✅ INTERESSE ENVIADO</button>`;
    } else {
      btnHtml = `<button class="match-btn-interest send" id="mabtn-${t.uid||t.id}" onclick="matchSendInterest('${t.uid||t.id}','${window.escHtml(t.name||'')}','${window.escHtml(t.photo||'')}');event.stopPropagation()">💛 DEMONSTRAR INTERESSE</button>`;
    }

    const tags = Object.keys(t.skills || {}).slice(0, 4).map(rid => {
      const role = MATCH_ROLES.find(r => r.id === rid);
      if (!role) return '';
      const hi = vacancies.includes(rid);
      return `<span class="match-tcard-tag${hi?' hi':''}">${role.icon} ${role.label}</span>`;
    }).join('');

    return `<div class="match-tcard" onclick="matchViewTalent('${t.id}')">
      <div class="match-tcard-banner" style="background:${grad}"></div>
      <div class="match-tcard-av">${avHtml}</div>
      <div class="match-tcard-body">
        <div class="match-tcard-name" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">${window.escHtml(t.name||'Sem nome')}${renderPlanInlineChip(t.plan)}</div>
        ${renderPlanPill(t.plan) ? `<div style="margin:3px 0 4px">${renderPlanPill(t.plan)}</div>` : ''}
        <div class="match-tcard-handle">${window.escHtml(t.handle||'')}</div>
        <div class="match-tcard-tags">${tags}</div>
        ${btnHtml}
      </div>
    </div>`;
  }).join('');
}

// ── Swipe ─────────────────────────────────────────────────────────────────────
function matchRenderSwipe() {
  const container = document.getElementById('match-swipe-container');
  const btns      = document.getElementById('match-swipe-btns');
  const empty     = document.getElementById('match-swipe-empty');
  if (!container) return;

  container.querySelectorAll('.match-swipe-card').forEach(c => c.remove());

  if (_matchSwipeIdx >= _matchFiltered.length) {
    empty?.classList.remove('hidden'); btns?.classList.add('hidden');
    const lbl = document.getElementById('match-swipe-lbl');
    if (lbl) lbl.textContent = 'VOCÊ VIU TODOS OS PERFIS!';
    return;
  }
  empty?.classList.add('hidden'); btns?.classList.remove('hidden');

  // Back card
  if (_matchSwipeIdx + 1 < _matchFiltered.length) {
    container.appendChild(_matchBuildSwipeCard(_matchFiltered[_matchSwipeIdx + 1], false));
  }
  // Front card
  container.appendChild(_matchBuildSwipeCard(_matchFiltered[_matchSwipeIdx], true));

  const lbl = document.getElementById('match-swipe-lbl');
  if (lbl) lbl.textContent = `${_matchSwipeIdx + 1} DE ${_matchFiltered.length} PERFIS`;
}

function _matchBuildSwipeCard(t, active) {
  const card = document.createElement('div');
  card.className = 'match-swipe-card' + (active ? ' front' : ' back');
  if (!active) { card.style.zIndex = '1'; card.style.transform = 'scale(0.96) translateY(8px)'; card.style.opacity = '0.6'; card.style.pointerEvents = 'none'; }
  else card.style.zIndex = '2';

  const grad = t.banner?.startsWith('http') ? `url('${t.banner}') center/cover` : MATCH_BANNER_GRADS[_matchSwipeIdx % MATCH_BANNER_GRADS.length];
  const avHtml = t.photo ? `<img src="${t.photo}">` : `<span>${(t.name||'?')[0].toUpperCase()}</span>`;
  const avLabel = { open:'✅ Disponível para colaborar', busy:'🔶 Ocupado no momento', hidden:'🔒 Indisponível' };
  const avColor = { open:'rgba(60,255,200,.1)', busy:'rgba(255,200,60,.1)' };
  const skillsHtml = Object.keys(t.skills || {}).slice(0,5).map(rid => {
    const role = MATCH_ROLES.find(r => r.id === rid);
    return role ? `<div class="match-swipe-skill">${role.icon} ${role.label}</div>` : '';
  }).join('');

  card.innerHTML = `
    <span class="match-swipe-overlay like" id="mswipe-like-lbl">CURTIR</span>
    <span class="match-swipe-overlay pass" id="mswipe-pass-lbl">PASSAR</span>
    <div class="match-swipe-card-banner" style="background:${grad}">
      <div class="match-swipe-av">${avHtml}</div>
    </div>
    <div class="match-swipe-body">
      <div class="match-swipe-name" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">${window.escHtml(t.name||'Sem nome')}${renderPlanInlineChip(t.plan)}</div>
      <div class="match-swipe-handle">${window.escHtml(t.handle||'')}</div>
      <div class="match-swipe-avail" style="background:${avColor[t.availability||'open']||'rgba(60,255,200,.1)'}">
        <span style="width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block"></span>
        ${avLabel[t.availability||'open'] || 'Disponível'}
      </div>
      <div class="match-swipe-bio">${window.escHtml((t.bio||'').substring(0, 160))}</div>
      <div class="match-swipe-skills">${skillsHtml}</div>
    </div>`;
  return card;
}

let _matchSwipeState = 'idle';
window.matchSwipeAction = function(action) {
  if (_matchIsArtistMode) { matchArtistSwipeAction(action); return; }
  if (_matchSwipeState !== 'idle') return;
  const card = document.querySelector('.match-swipe-card.front');
  if (!card) return;
  _matchSwipeState = 'busy';

  if (action === 'like' || action === 'superlike') {
    card.classList.add('going-right');
    const t = _matchFiltered[_matchSwipeIdx];
    if (t) {
      matchSendInterestSilent(t.uid || t.id, t.name || '', t.photo || '');
      window.toast(action === 'superlike' ? '⭐ Super interesse enviado para ' + (t.name||'talento') + '!' : '💛 Interesse enviado para ' + (t.name||'talento') + '!');
    }
  } else {
    card.classList.add('going-left');
  }

  setTimeout(() => {
    _matchSwipeIdx++;
    _matchSwipeState = 'idle';
    matchRenderSwipe();
  }, 380);
};

// ── Send Interest (from card button) ─────────────────────────────────────────
window.matchSendInterest = async function(uid, name, photo) {
  if (!uid) return;
  // Melhoria: estado de loading imediato antes do Firestore write
  const btn = document.getElementById('mabtn-' + uid);
  if (btn) { btn.className = 'match-btn-interest loading'; btn.textContent = '⏳ ENVIANDO...'; btn.disabled = true; }
  await matchSendInterestSilent(uid, name, photo);
  // Só atualiza para "enviado" se não virou match (matched já trata o botão dentro do silent)
  if (btn && !_matchConfirmed[uid]) {
    btn.className = 'match-btn-interest sent';
    btn.textContent = '✅ INTERESSE ENVIADO';
  }
  matchRenderSentPanel();
};

async function matchSendInterestSilent(uid, name, photo) {
  if (!uid || !window._currentTeamId || !window._matchGetUser) return;
  _matchLikes[uid] = true;

  try {
    const team = (window._myTeams||[]).find(t => t.id === window._currentTeamId);
    const teamName  = team?.name || 'Equipe';
    const teamPhoto = team?.photo || '';

    // ── CORREÇÃO: campos duais (Match System + Interest Panel) ──
    const intData = {
      // Campos do Match System
      type:          'team_to_artist',
      fromTeamId:    window._currentTeamId,
      fromTeamName:  teamName,
      fromTeamPhoto: teamPhoto,
      toUserUid:     uid,
      toUserName:    name,
      toUserPhoto:   photo,
      senderUid:     window._matchGetUser.uid,
      // Campos do Interest Panel (para intLoadAll encontrar)
      fromType:  'team',
      fromId:    window._currentTeamId,
      fromName:  teamName,
      fromPhoto: teamPhoto,
      toType:    'user',
      toId:      uid,
      toName:    name,
      toPhoto:   photo,
      // Campos comuns
      createdAt: new Date().toISOString(),
      status:    'pending',
    };
    const intRef = await window.addDoc(window.collection(window.db, 'interests'), intData);

    // Atualiza matchNotifs do artista
    try {
      await window.setDoc(
        window.doc(window.db, 'users', uid, 'matchNotifs', window._currentTeamId),
        { fromTeamId: window._currentTeamId, fromTeamName: teamName, fromTeamPhoto: teamPhoto, createdAt: new Date().toISOString(), read: false },
        { merge: false }
      );
    } catch(e) {}

    // Salva no team_likes
    try {
      const likeUpdateObj = {};
      likeUpdateObj['likes.' + uid] = true;
      await window.updateDoc(window.doc(window.db, 'team_likes', window._currentTeamId), likeUpdateObj);
    } catch(e) {
      try {
        await window.setDoc(window.doc(window.db, 'team_likes', window._currentTeamId), { likes: { ..._matchLikes } }, { merge: true });
      } catch(e2) {}
    }

    // Busca reversa robusta: padrão canônico + Match System
    let rev = null;
    try {
      const reverseQ1 = window.query(
        window.collection(window.db, 'interests'),
        window.where('fromId', '==', uid),
        window.where('toId', '==', window._currentTeamId), window.limit(1)
      );
      const revSnap1 = await window.getDocs(reverseQ1);
      if (!revSnap1.empty) rev = { id: revSnap1.docs[0].id, ...revSnap1.docs[0].data() };
    } catch(e) {}

    // Fallback: padrão Match System (fromUserUid / toTeamId)
    if (!rev) {
      try {
        const reverseQ2 = window.query(
          window.collection(window.db, 'interests'),
          window.where('toTeamId', '==', window._currentTeamId),
          window.limit(100)
        );
        const reverseSnap2 = await window.getDocs(reverseQ2);
        const found = reverseSnap2.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .find(d => (d.fromUserUid === uid || d.fromId === uid) &&
                     (d.type === 'artist_to_team' || d.fromType === 'user') &&
                     d.status === 'pending');
        if (found) rev = found;
      } catch(e) {}
    }

    if (rev) {
      const _createdMatchId2 = await _matchCreateMatch(uid, name, photo, intRef.id, rev.id);
      matchShowCelebration(name, photo, teamName, teamPhoto, _createdMatchId2);
      const gridBtn = document.getElementById('mabtn-' + uid);
      if (gridBtn) {
        gridBtn.className = 'match-btn-interest matched';
        gridBtn.textContent = '💛 MATCH! VER';
        gridBtn.disabled = false;
        gridBtn.onclick = function(e) { matchSwitchView('matches'); e.stopPropagation(); };
      }
      matchRenderMatches();
    }
  } catch(e) {
    console.warn('[matchSendInterest]', e.message);
  }
}

// ── Cancel interest: artista cancela interesse em equipe ──────────────────────
window.matchCancelArtistInterest = async function(teamId, teamName) {
  const item = document.getElementById('msent-' + teamId);
  if (item) { item.style.opacity = '0.4'; item.style.pointerEvents = 'none'; }
  try {
    // Busca TODOS os docs de interesse do artista para esta equipe (pode haver múltiplos
    // se o artista enviou, cancelou e enviou de novo) e deleta todos
    const q = window.query(
      window.collection(window.db, 'interests'),
      window.where('fromUserUid', '==', window._matchGetUser.uid),
      window.limit(100)
    );
    const snap = await window.getDocs(q);
    const docsToDelete = snap.docs.filter(d =>
      d.data().type === 'artist_to_team' && d.data().toTeamId === teamId
    );
    await Promise.all(docsToDelete.map(d => window.deleteDoc(d.ref)));
  } catch(e) { /* ignora erro Firestore, remove do cache local mesmo assim */ }

  // Remove do cache local
  delete _matchArtistSentInterests[teamId];
  window.toast('Interesse em ' + teamName + ' cancelado.');
  // Bug 1 Fix: re-renderiza o grid COMPLETO para garantir que todos os botões
  // reflitam o estado correto, independente de estarem no DOM no momento do cancel
  matchRenderMode();
  matchRenderSentPanel();
};

// ── Cancel interest: equipe cancela interesse em artista ──────────────────────
window.matchCancelTeamInterest = async function(talentUid, talentName) {
  const item = document.getElementById('mtsent-' + talentUid);
  if (item) { item.style.opacity = '0.4'; item.style.pointerEvents = 'none'; }
  try {
    // Deleta TODOS os docs de interesse da equipe para este artista
    const q = window.query(
      window.collection(window.db, 'interests'),
      window.where('toUserUid', '==', talentUid),
      window.limit(100)
    );
    const snap = await window.getDocs(q);
    const docsToDelete = snap.docs.filter(d =>
      d.data().type === 'team_to_artist' && d.data().fromTeamId === window._currentTeamId
    );
    await Promise.all(docsToDelete.map(d => window.deleteDoc(d.ref)));
  } catch(e) { /* ignora erro Firestore */ }

  // Remove do cache local e persiste no team_likes
  // Usa updateDoc com campo específico para evitar race condition entre membros da equipe
  delete _matchLikes[talentUid];
  try {
    const updateObj = {};
    updateObj['likes.' + talentUid] = window.deleteField ? window.deleteField() : null;
    await window.updateDoc(
      window.doc(window.db, 'team_likes', window._currentTeamId),
      updateObj
    );
  } catch(e) {
    // Fallback: reescreve o objeto caso o doc não exista ainda
    try {
      await window.setDoc(
        window.doc(window.db, 'team_likes', window._currentTeamId),
        { likes: { ..._matchLikes } },
        { merge: true }
      );
    } catch(e2) { /* ignora */ }
  }

  // Restaura botão no grid
  const gridBtn = document.getElementById('mabtn-' + talentUid);
  if (gridBtn) { gridBtn.className = 'match-btn-interest send'; gridBtn.textContent = '💛 DEMONSTRAR INTERESSE'; gridBtn.disabled = false; }
  window.toast('Interesse em ' + talentName + ' cancelado.');
  matchRenderSentPanel();
};

// ── Render Sent Panel (team view, right panel) ────────────────────────────────
window.matchRenderSentPanel = async function() {
  if (_matchIsArtistMode) { await _matchRenderArtistSentPanel(); return; }
  const sentList      = document.getElementById('match-sent-list');
  const confirmedList = document.getElementById('match-confirmed-team');
  const badge         = document.getElementById('match-sent-badge');
  if (!sentList) return;

  const pendingUids  = Object.keys(_matchLikes).filter(uid => !_matchConfirmed[uid]);
  const matchedUids  = Object.keys(_matchConfirmed);

  // Badge
  if (badge) {
    if (pendingUids.length) { badge.style.display = ''; badge.textContent = pendingUids.length + ' PENDENTE' + (pendingUids.length !== 1 ? 'S' : ''); }
    else badge.style.display = 'none';
  }

  // Pending items
  if (!pendingUids.length) {
    sentList.innerHTML = `<div class="match-empty-state" style="padding:24px"><div style="font-size:28px;margin-bottom:8px">💛</div><div>NENHUM INTERESSE ENVIADO</div></div>`;
  } else {
    sentList.innerHTML = pendingUids.map(uid => {
      const t = _matchAllTalents.find(x => (x.uid||x.id) === uid);
      const name = t?.name || uid.substring(0,8)+'...';
      const avHtml = t?.photo
        ? `<img src="${t.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : `<span style="font-weight:800;font-size:14px">${(name[0]||'?').toUpperCase()}</span>`;
      return `<div class="match-sent-item" id="mtsent-${uid}">
        <div class="match-sent-av" style="background:linear-gradient(135deg,var(--a1),var(--a2))">${avHtml}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${window.escHtml(name)}</div>
          <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3)">INTERESSE ENVIADO</div>
        </div>
        <button class="match-btn-decline" onclick="matchCancelTeamInterest('${uid}','${window.escHtml(name)}')" style="font-size:9px;padding:5px 10px">✕ CANCELAR</button>
      </div>`;
    }).join('');
  }

  // Confirmed matches
  if (!matchedUids.length) {
    confirmedList.innerHTML = `<div class="match-empty-state" style="padding:16px"><div style="font-size:24px;margin-bottom:6px">🏆</div><div>NENHUM MATCH AINDA</div></div>`;
  } else {
    confirmedList.innerHTML = matchedUids.map(uid => {
      const m = _matchConfirmed[uid];
      const name = m?.userName || m?.talentName || uid.substring(0,8);
      const photo = m?.userPhoto || '';
      const avHtml = photo ? `<img src="${photo}" alt="" style="width:100%;height:100%;object-fit:cover">` : (name[0]||'?').toUpperCase();
      return `<div class="match-card-item">
        <div class="match-card-pair">
          <div class="match-card-av">${avHtml}</div>
          <span style="font-size:16px">💛</span>
          <div class="match-card-info">
            <div class="match-card-title">${window.escHtml(name)}</div>
            <div class="match-card-sub">MATCH CONFIRMADO</div>
          </div>
          <span class="match-badge">MATCH</span>
        </div>
        <div class="match-card-actions">
          <button class="match-btn-chat" onclick="matchSwitchView('matches');setTimeout(()=>matchOpenChatInPanel('${m?.id||uid}','team'),200)">💬 ABRIR CHAT</button>
          ${(() => { const _teamForInvite = (window._myTeams||[]).find(t=>t.id===window._currentTeamId); const _isOwner = _teamForInvite?.members?.find?.(mb=>mb.uid===window._matchGetUser?.uid)?.role === 'owner'; if (!_isOwner) return ''; return !m?.inviteSent ? `<button class="match-btn-invite" onclick="matchSendInvite('${m?.id||uid}')">📨 CONVIDAR</button>` : `<span style="font-family:var(--font-mono);font-size:9px;color:var(--green)">✅ CONVITE ENVIADO</span>`; })()}
          <button class="match-btn-decline" style="font-size:9px;padding:5px 10px" onclick="matchCancelMatch('${m?.id||uid}','${window._currentTeamId||''}','${uid}','${window.escHtml(name)}')">✕ CANCELAR</button>
        </div>
      </div>`;
    }).join('');
  }
};

// ── Inbox / Interesses Recebidos ──────────────────────────────────────────────
window.matchRenderInbox = async function() {
  if (!_matchIsArtistMode) {
    // MODO EQUIPE: respeita a aba selecionada
    if (_matchInboxTab === 'sent')    { await matchRenderTeamSentInterests(); return; }
    if (_matchInboxTab === 'matches') { await matchRenderTeamMatchesInbox();  return; }
    // default: 'received'
    await matchRenderTeamReceivedInterests();
    return;
  }
  // MODO ARTISTA: inbox pessoal do artista
  if (_matchInboxTab === 'received') await matchRenderReceived();
  else if (_matchInboxTab === 'sent') await matchRenderArtistSent();
  // v5.20.2 — FIX ITEM 3: matchRenderArtistMatches busca por userUid, não por teamId.
  // Usuários que pertencem a uma equipe E têm perfil de artista precisam ver os matches
  // onde aparecem como 'userUid' (papel de artista), não apenas como membro da equipe.
  else await matchRenderArtistMatches();
};

// ── Team mode: artistas que enviaram interesse para esta equipe ───────────────
async function matchRenderTeamReceivedInterests() {
  const body = document.getElementById('match-inbox-body');
  if (!body || !window._currentTeamId) return;
  body.innerHTML = `<div class="match-empty-state"><div style="font-size:28px;margin-bottom:8px">⏳</div><div>CARREGANDO...</div></div>`;

  // Atualiza o título do painel para refletir o contexto
  const panelTitleEl = document.querySelector('#match-view-artist .match-panel-title > div > div:first-child');
  if (panelTitleEl) panelTitleEl.textContent = 'Interesses Recebidos';
  const panelSubEl = document.querySelector('#match-view-artist .match-panel-title > div > div:last-child');
  if (panelSubEl) panelSubEl.textContent = 'ARTISTAS INTERESSADOS';
  const panelIconEl = document.querySelector('#match-view-artist .match-panel-icon');
  if (panelIconEl) { panelIconEl.textContent = '📬'; panelIconEl.style.background = 'linear-gradient(135deg,#5b5ef4,#7c3aed)'; }

  try {
    // Busca interests do tipo artist_to_team para esta equipe
    const q = window.query(
      window.collection(window.db, 'interests'),
      window.where('toTeamId', '==', window._currentTeamId),
      window.limit(100)
    );
    const snap = await window.getDocs(q);
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(d => d.type === 'artist_to_team' && d.status === 'pending');

    if (!items.length) {
      body.innerHTML = `<div class="match-empty-state" style="padding:40px 20px">
        <div style="font-size:36px;margin-bottom:10px">📭</div>
        <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:2px;color:var(--text3)">NENHUM ARTISTA DEMONSTROU INTERESSE</div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3);margin-top:8px;opacity:.6">Quando artistas demonstrarem interesse na sua equipe, eles aparecerão aqui</div>
      </div>`;
      return;
    }

    body.innerHTML = items.map(item => {
      const name    = item.fromUserName || 'Artista';
      const photo   = item.fromUserPhoto || '';
      const uid     = item.fromUserUid  || '';
      const initial = (name[0] || '?').toUpperCase();
      const avHtml  = photo
        ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : `<span style="font-weight:800;font-size:15px">${initial}</span>`;

      // Verifica se o artista está nos talentos carregados para mostrar skills
      const talent = _matchAllTalents.find(x => (x.uid || x.id) === uid);
      const skillTags = talent ? Object.keys(talent.skills || {}).slice(0,3).map(k => {
        const role = (typeof MATCH_ROLES !== 'undefined' ? MATCH_ROLES : []).find(r => r.id === k);
        return `<span style="font-family:var(--font-mono);font-size:8px;padding:2px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;color:var(--text2)">${role ? role.icon + ' ' + role.label : k}</span>`;
      }).join('') : '';

      return `<div class="match-sent-item" style="padding:12px 0;cursor:pointer" onclick="matchViewTalent('${uid}')">
        <div class="match-sent-av" style="background:linear-gradient(135deg,var(--a1),var(--a2));flex-shrink:0">${avHtml}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px;margin-bottom:3px;display:flex;align-items:center;gap:5px;flex-wrap:wrap">${window.escHtml(name)}${renderPlanInlineChip(talent?.plan)}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap">${skillTags}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
          <button class="match-btn-interest send" style="font-size:9px;padding:5px 10px;white-space:nowrap"
            onclick="event.stopPropagation();matchTeamAcceptArtistInterest('${item.id}','${uid}','${window.escHtml(name)}','${photo}')">
            ✅ ACEITAR
          </button>
          <button class="match-btn-decline" style="font-size:9px;padding:5px 10px;white-space:nowrap"
            onclick="event.stopPropagation();matchTeamDeclineArtistInterest('${item.id}')">
            ✕ RECUSAR
          </button>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    body.innerHTML = `<div class="match-empty-state"><div>Erro: ${window.escHtml(e.message)}</div></div>`;
  }
}

// ── Team mode: interesses ENVIADOS pela equipe (team_to_artist pendentes) ────────
async function matchRenderTeamSentInterests() {
  const body = document.getElementById('match-inbox-body');
  if (!body || !window._currentTeamId) return;
  body.innerHTML = `<div class="match-empty-state"><div style="font-size:28px;margin-bottom:8px">⏳</div><div>CARREGANDO...</div></div>`;

  // Atualiza título do painel
  const panelTitleEl = document.querySelector('#match-view-artist .match-panel-title > div > div:first-child');
  if (panelTitleEl) panelTitleEl.textContent = 'Interesses Enviados';
  const panelSubEl = document.querySelector('#match-view-artist .match-panel-title > div > div:last-child');
  if (panelSubEl) panelSubEl.textContent = 'AGUARDANDO RESPOSTA';
  const panelIconEl = document.querySelector('#match-view-artist .match-panel-icon');
  if (panelIconEl) { panelIconEl.textContent = '📤'; panelIconEl.style.background = 'linear-gradient(135deg,#f59e0b,#ef4444)'; }

  try {
    const q = window.query(
      window.collection(window.db, 'interests'),
      window.where('fromTeamId', '==', window._currentTeamId),
      window.limit(100)
    );
    const snap = await window.getDocs(q);
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(d => d.type === 'team_to_artist' && d.status === 'pending');

    if (!items.length) {
      body.innerHTML = `<div class="match-empty-state" style="padding:40px 20px">
        <div style="font-size:36px;margin-bottom:10px">📤</div>
        <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:2px;color:var(--text3)">NENHUM INTERESSE ENVIADO</div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3);margin-top:8px;opacity:.6">Envie interesse para artistas na aba "Encontrar Artistas"</div>
      </div>`;
      return;
    }

    body.innerHTML = items.map(item => {
      const name    = item.toUserName  || 'Artista';
      const photo   = item.toUserPhoto || '';
      const uid     = item.toUserUid   || '';
      const avHtml  = photo
        ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : `<span style="font-weight:800;font-size:15px">${(name[0]||'?').toUpperCase()}</span>`;

      const talent = _matchAllTalents.find(x => (x.uid || x.id) === uid);
      const skillTags = talent ? Object.keys(talent.skills || {}).slice(0,3).map(k => {
        const role = (typeof MATCH_ROLES !== 'undefined' ? MATCH_ROLES : []).find(r => r.id === k);
        return `<span style="font-family:var(--font-mono);font-size:8px;padding:2px 6px;background:var(--bg3);border:1px solid var(--border);border-radius:5px;color:var(--text2)">${role ? role.icon + ' ' + role.label : k}</span>`;
      }).join('') : '';

      return `<div class="match-sent-item" style="padding:12px 0;cursor:pointer" onclick="matchViewTalent('${uid}')">
        <div class="match-sent-av" style="background:linear-gradient(135deg,var(--a1),var(--a2));flex-shrink:0">${avHtml}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px;margin-bottom:3px;display:flex;align-items:center;gap:5px;flex-wrap:wrap">${window.escHtml(name)}${renderPlanInlineChip(talent?.plan)}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px">${skillTags}</div>
          <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3)">AGUARDANDO RESPOSTA</div>
        </div>
        <button class="match-btn-decline" style="font-size:9px;padding:5px 10px;white-space:nowrap;flex-shrink:0"
          onclick="event.stopPropagation();matchCancelTeamInterest('${uid}','${window.escHtml(name)}')">
          ✕ CANCELAR
        </button>
      </div>`;
    }).join('');
  } catch(e) {
    body.innerHTML = `<div class="match-empty-state"><div>Erro: ${window.escHtml(e.message)}</div></div>`;
  }
}

// ── Team mode: MATCHES confirmados na caixa de inbox ─────────────────────────────
async function matchRenderTeamMatchesInbox() {
  const body = document.getElementById('match-inbox-body');
  if (!body || !window._currentTeamId) return;
  body.innerHTML = `<div class="match-empty-state"><div style="font-size:28px;margin-bottom:8px">⏳</div><div>CARREGANDO...</div></div>`;

  // Atualiza título do painel
  const panelTitleEl = document.querySelector('#match-view-artist .match-panel-title > div > div:first-child');
  if (panelTitleEl) panelTitleEl.textContent = 'Matches Confirmados';
  const panelSubEl = document.querySelector('#match-view-artist .match-panel-title > div > div:last-child');
  if (panelSubEl) panelSubEl.textContent = 'PARCERIAS FECHADAS';
  const panelIconEl = document.querySelector('#match-view-artist .match-panel-icon');
  if (panelIconEl) { panelIconEl.textContent = '💛'; panelIconEl.style.background = 'linear-gradient(135deg,#f59e0b,#a855f7)'; }

  try {
    const q = window.query(
      window.collection(window.db, 'matches'),
      window.where('teamId', '==', window._currentTeamId),
      window.limit(50)
    );
    const snap = await window.getDocs(q);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!items.length) {
      body.innerHTML = `<div class="match-empty-state" style="padding:40px 20px">
        <div style="font-size:36px;margin-bottom:10px">💛</div>
        <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:2px;color:var(--text3)">NENHUM MATCH AINDA</div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3);margin-top:8px;opacity:.6">Aceite interesses ou envie interesse para artistas para criar matches</div>
      </div>`;
      return;
    }

    const team = (window._myTeams||[]).find(t => t.id === window._currentTeamId);
    const isOwner = team?.members?.find?.(mb => mb.uid === window._matchGetUser?.uid)?.role === 'owner';

    body.innerHTML = items.map(m => {
      const name  = m.userName  || 'Artista';
      const photo = m.userPhoto || '';
      const avHtml = photo
        ? `<img src="${photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
        : `<span style="font-weight:800;font-size:18px">${(name[0]||'?').toUpperCase()}</span>`;

      return `<div class="match-card-item">
        <div class="match-card-pair">
          <div class="match-card-av">${avHtml}</div>
          <span style="font-size:16px">💛</span>
          <div class="match-card-info">
            <div class="match-card-title">${window.escHtml(name)}</div>
            <div class="match-card-sub">MATCH CONFIRMADO</div>
          </div>
          <span class="match-badge">MATCH</span>
        </div>
        <div class="match-card-actions">
          <button class="match-btn-chat" onclick="matchSwitchView('matches');setTimeout(()=>matchOpenChatInPanel('${m.id}','team'),200)">💬 ABRIR CHAT</button>
          ${isOwner && !m.inviteSent ? `<button class="match-btn-invite" onclick="matchSendInvite('${m.id}')">📨 CONVIDAR</button>` : ''}
          ${m.inviteSent ? `<span style="font-family:var(--font-mono);font-size:9px;color:var(--green)">✅ CONVITE ENVIADO</span>` : ''}
          <button class="match-btn-decline" style="font-size:9px;padding:5px 10px" onclick="matchCancelMatch('${m.id}','${m.teamId||''}','${m.userUid||''}','${window.escHtml(name)}')">✕ CANCELAR</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    body.innerHTML = `<div class="match-empty-state"><div>Erro: ${window.escHtml(e.message)}</div></div>`;
  }
}

// ── Equipe aceita interesse de artista → cria match ───────────────────────────
window.matchTeamAcceptArtistInterest = async function(interestId, artistUid, artistName, artistPhoto) {
  if (!window._currentTeamId || !window._matchGetUser) return;
  const team = (window._myTeams || []).find(t => t.id === window._currentTeamId);
  const teamName  = team?.name  || 'Equipe';
  const teamPhoto = team?.photo || '';
  try {
    // 1. Marca o interesse do artista como accepted imediatamente
    try { await window.updateDoc(window.doc(window.db, 'interests', interestId), { status: 'accepted' }); } catch(e) {}

    // 2. Busca o interesse reverso (team_to_artist) se existir
    let reverseId = null;
    try {
      const revQ = window.query(
        window.collection(window.db, 'interests'),
        window.where('fromTeamId', '==', window._currentTeamId),
        window.limit(50)
      );
      const revSnap = await window.getDocs(revQ);
      const rev = revSnap.docs.find(d => d.data().toUserUid === artistUid && d.data().type === 'team_to_artist');
      if (rev) reverseId = rev.id;
    } catch(e) {}

    // 3. Cria o match (_matchCreateMatch atualiza ambos os interesses para matched)
    const _createdMatchId3 = await _matchCreateMatch(artistUid, artistName, artistPhoto, reverseId || interestId, interestId);
    matchShowCelebration(artistName, artistPhoto, teamName, teamPhoto, _createdMatchId3);
    window.toast('🎉 Match com ' + artistName + '!');
    matchRenderInbox();
    matchRenderSentPanel();
    matchRenderMatches();
    // Atualiza badge da aba Matches na Tab 2 (modo equipe)
    const _matchBadge = document.getElementById('match-matches-badge');
    if (_matchBadge) {
      const _cnt = Object.keys(_matchConfirmed).length;
      if (_cnt > 0) { _matchBadge.style.display = ''; _matchBadge.textContent = _cnt; }
    }
  } catch(e) {
    window.toast('Erro ao aceitar interesse: ' + e.message, 'error');
  }
};

// ── Equipe recusa interesse de artista ────────────────────────────────────────
window.matchTeamDeclineArtistInterest = async function(interestId) {
  try {
    await window.updateDoc(window.doc(window.db, 'interests', interestId), { status: 'declined' });
    window.toast('Interesse recusado.');
    matchRenderInbox();
  } catch(e) {
    window.toast('Erro ao recusar: ' + e.message, 'error');
  }
};

window.matchInboxTab = function(tab, btn) {
  _matchInboxTab = tab;
  document.querySelectorAll('.match-inbox-tab').forEach(t => t.classList.remove('match-itab-active'));
  btn?.classList.add('match-itab-active');
  matchRenderInbox();
};

async function matchRenderReceived() {
  const body = document.getElementById('match-inbox-body');
  const badge = document.getElementById('match-inbox-badge');
  if (!body || !window._matchGetUser) return;
  body.innerHTML = `<div class="match-empty-state"><div style="font-size:28px;margin-bottom:8px">⏳</div><div>CARREGANDO...</div></div>`;

  try {
    // Single-field query to avoid needing composite indexes
    const q = window.query(
      window.collection(window.db, 'interests'),
      window.where('toUserUid', '==', window._matchGetUser.uid),
      window.limit(100)
    );
    const snap = await window.getDocs(q);
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(d => d.type === 'team_to_artist' && d.status === 'pending');

    if (badge) {
      if (items.length) { badge.style.display = ''; badge.textContent = items.length; }
      else badge.style.display = 'none';
    }

    if (!items.length) {
      body.innerHTML = `<div class="match-empty-state" style="padding:40px 20px"><div style="font-size:32px;margin-bottom:10px">📬</div><div>NENHUM INTERESSE RECEBIDO</div></div>`;
      return;
    }

    // Marca itens nao lidos como read:true apos visualizacao
    const unreadItems = items.filter(i => !i.read);
    if (unreadItems.length) {
      setTimeout(async () => {
        for (const item of unreadItems) {
          try { await window.updateDoc(window.doc(window.db, 'interests', item.id), { read: true }); } catch(e) {}
        }
      }, 1500);
    }

    body.innerHTML = items.map((item, idx) => {
      const isNew = !item.read && idx < 10; // NOVO = nao lido (campo read:true do Firestore)
      const avStyle = `background:linear-gradient(135deg,var(--a1),var(--a2))`;
      const initials = (item.fromTeamName||'?')[0].toUpperCase();
      const avHtml = item.fromTeamPhoto
        ? `<img src="${item.fromTeamPhoto}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`
        : initials;
      return `<div class="match-interest-item ${isNew?'new':''}" id="minterest-${item.id}">
        <div class="match-interest-av" style="${avStyle};border-radius:10px">${avHtml}</div>
        <div class="match-interest-info">
          <div class="match-interest-name">${window.escHtml(item.fromTeamName||'Equipe')}</div>
          <div class="match-interest-meta">${isNew?'NOVO • ':''} INTERESSE RECEBIDO</div>
          <div class="match-interest-actions">
            <button class="match-btn-accept" onclick="matchAcceptInterest('${item.id}','${window.escHtml(item.fromTeamName||'')}','${item.fromTeamPhoto||''}','${item.fromTeamId||''}','${item.senderUid||''}')">✅ ACEITAR</button>
            <button class="match-btn-decline" onclick="matchDeclineInterest('${item.id}')">✕ RECUSAR</button>
            <button class="match-btn-view" onclick="matchShowTeamPreview('${item.fromTeamId||''}','${window.escHtml(item.fromTeamName||'')}','${item.fromTeamPhoto||''}')">👥 VER EQUIPE</button>
          </div>
        </div>
      </div>`;
    }).join('');

  } catch(e) {
    body.innerHTML = `<div class="match-empty-state"><div>Erro: ${e.message}</div></div>`;
  }
}

async function matchRenderArtistSent() {
  const body = document.getElementById('match-inbox-body');
  if (!body || !window._matchGetUser) return;
  body.innerHTML = `<div class="match-empty-state"><div style="font-size:28px;margin-bottom:8px">⏳</div><div>CARREGANDO...</div></div>`;
  try {
    // Single-field query to avoid composite index requirement
    const q = window.query(window.collection(window.db, 'interests'), window.where('fromUserUid', '==', window._matchGetUser.uid), window.limit(200));
    const snap = await window.getDocs(q);
    const raw = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(d => d.type === 'artist_to_team' && d.status !== 'declined');

    // Deduplica por toTeamId: mantém apenas o doc mais recente por equipe.
    // Isso evita entradas duplicadas quando o artista cancela e reenvia interesse.
    const byTeam = {};
    raw.forEach(d => {
      const tid = d.toTeamId || d.id;
      const existing = byTeam[tid];
      if (!existing || (d.createdAt || '') > (existing.createdAt || '')) {
        byTeam[tid] = d;
      }
    });
    const items = Object.values(byTeam);

    if (!items.length) {
      body.innerHTML = `<div class="match-empty-state" style="padding:40px 20px"><div style="font-size:32px;margin-bottom:10px">📤</div><div>NENHUM INTERESSE ENVIADO</div></div>`;
      return;
    }
    body.innerHTML = items.map(item => {
      const teamId    = item.toTeamId    || '';
      const teamName  = item.toTeamName  || 'Equipe';
      const teamPhoto = item.toTeamPhoto || '';
      const initials  = (teamName[0] || '?').toUpperCase();
      const avHtml    = teamPhoto
        ? `<img src="${teamPhoto}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`
        : initials;
      const isMatch = item.status === 'matched';
      return `<div class="match-sent-item" style="cursor:pointer" onclick="matchShowTeamPreview('${teamId}','${window.escHtml(teamName)}','${window.escHtml(teamPhoto)}')">\
        <div class="match-sent-av" style="background:linear-gradient(135deg,var(--a1),var(--a2));border-radius:10px">${avHtml}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${window.escHtml(teamName)}</div>
          <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3)">${isMatch ? '💛 MATCH CONFIRMADO' : 'INTERESSE ENVIADO'}</div>
        </div>
        <span class="match-sent-status ${isMatch?'matched':'pending'}">${isMatch ? '💛 MATCH' : 'PENDENTE'}</span>
      </div>`;
    }).join('');
  } catch(e) {
    body.innerHTML = `<div class="match-empty-state"><div>Erro: ${e.message}</div></div>`;
  }
}

async function matchRenderArtistMatches() {
  const body  = document.getElementById('match-inbox-body');
  const badge = document.getElementById('match-matches-badge');
  if (!body || !window._matchGetUser) return;
  body.innerHTML = `<div class="match-empty-state"><div style="font-size:28px;margin-bottom:8px">⏳</div><div>CARREGANDO...</div></div>`;

  try {
    // v5.20.2 — FIX ITEM 3: busca matches onde o usuário aparece como ARTISTA (userUid).
    // Essa query funciona independente de _matchIsArtistMode ou _currentTeamId.
    const q = window.query(
      window.collection(window.db, 'matches'),
      window.where('userUid', '==', window._matchGetUser.uid),
      window.limit(50)
    );
    const snap = await window.getDocs(q);
    let items = snap.docs.map(d => ({ id: d.id, ...d.data(), _perspective: 'artist' }));

    // v5.20.3 — FIX ITEM 3 (complemento): usuários que pertencem a uma equipe E têm
    // perfil de artista precisam ver também os matches onde participaram como EQUIPE.
    // A query anterior (userUid) só trazia perspectiva de artista, deixando matches
    // criados via ENCONTRAR MEMBROS invisíveis na aba "Procurar Equipe > Matches".
    if (window._currentTeamId) {
      try {
        const qTeam = window.query(
          window.collection(window.db, 'matches'),
          window.where('teamId', '==', window._currentTeamId),
          window.limit(30)
        );
        const snapTeam = await window.getDocs(qTeam);
        snapTeam.docs.forEach(d => {
          if (!items.find(x => x.id === d.id))
            items.push({ id: d.id, ...d.data(), _perspective: 'team' });
        });
      } catch(e) { /* best-effort: equipe sem memberUids ou sem permissão */ }
    }

    // Deduplica por teamId — mantém só o mais recente (maior createdAt)
    // Resolve o bug de réplicas ao desfazer/refazer match
    const byTeamId = {};
    items.forEach(m => {
      const existing = byTeamId[m.teamId];
      if (!existing || m.createdAt > existing.createdAt) byTeamId[m.teamId] = m;
    });
    items = Object.values(byTeamId);

    // Badge
    if (badge) {
      if (items.length) { badge.style.display = ''; badge.textContent = items.length; }
      else badge.style.display = 'none';
    }

    if (!items.length) {
      body.innerHTML = `<div class="match-empty-state" style="padding:40px 20px">
        <div style="font-size:36px;margin-bottom:10px">💛</div>
        <div style="font-family:var(--font-mono);font-size:11px;letter-spacing:2px;color:var(--text3)">NENHUM MATCH AINDA</div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3);margin-top:8px;opacity:.6">Demonstre interesse em equipes ou aceite um interesse recebido</div>
      </div>`;
      return;
    }

    // Enriquece teamName/teamPhoto ausentes em paralelo
    const missingIds = [...new Set(items.filter(m => !m.teamName && m.teamId).map(m => m.teamId))];
    if (missingIds.length) {
      await Promise.all(missingIds.map(async tid => {
        try {
          const tpSnap = await window.getDoc(window.doc(window.db, 'team_profiles', tid));
          if (tpSnap.exists()) {
            const td = tpSnap.data();
            items.forEach(m => { if (m.teamId === tid) { m.teamName = m.teamName || td.name || ''; m.teamPhoto = m.teamPhoto || td.photo || ''; } });
          }
          // Fallback: colecao teams
          if (!items.find(m => m.teamId === tid && m.teamName)) {
            const t2 = await window.getDoc(window.doc(window.db, 'teams', tid));
            if (t2.exists()) items.forEach(m => { if (m.teamId === tid) m.teamName = m.teamName || t2.data().name || ''; });
          }
        } catch(e) { /* best-effort por team */ }
      }));
    }

    body.innerHTML = items.map(m => {
      // v5.20.3 — detecta perspectiva para mostrar a "outra parte" corretamente:
      // artista → mostra equipe (teamName/teamPhoto); equipe → mostra artista (userName/userPhoto)
      const isTeamPerspective = m._perspective === 'team' && m.userUid !== window._matchGetUser?.uid;
      const name    = isTeamPerspective ? (m.userName  || 'Artista') : (m.teamName  || 'Equipe');
      const photo   = isTeamPerspective ? (m.userPhoto || '')        : (m.teamPhoto || '');
      const subLabel = isTeamPerspective ? 'MATCH — PERSPECTIVA EQUIPE' : 'MATCH CONFIRMADO';
      const initial = (name[0] || '?').toUpperCase();
      const avHtml  = photo
        ? `<img src="${photo}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`
        : `<span style="font-weight:800;font-size:18px">${initial}</span>`;

      return `<div class="match-card-item">
        <div class="match-card-pair">
          <div class="match-card-av team" style="border-radius:10px">${avHtml}</div>
          <span style="font-size:16px">💛</span>
          <div class="match-card-info">
            <div class="match-card-title">${window.escHtml(name)}</div>
            <div class="match-card-sub">${subLabel}</div>
          </div>
          <span class="match-badge">MATCH</span>
        </div>
        <div class="match-card-actions">
          <button class="match-btn-chat" onclick="matchSwitchView('matches');setTimeout(()=>matchOpenChatInPanel('${m.id}','${m._perspective||'artist'}'),200)">💬 ABRIR CHAT</button>
          <button class="match-btn-decline" style="font-size:9px;padding:5px 10px" onclick="matchCancelMatch('${m.id}','${m.teamId||''}','${m.userUid||''}','${window.escHtml(name)}')">✕ CANCELAR</button>
        </div>
      </div>`;
    }).join('');

  } catch(e) {
    body.innerHTML = `<div class="match-empty-state"><div>Erro: ${window.escHtml(e.message)}</div></div>`;
  }
}

// ── Accept / Decline Interest ─────────────────────────────────────────────────
window.matchAcceptInterest = async function(intId, teamName, teamPhoto, teamId, teamOwnerId) {
  const item = document.getElementById('minterest-' + intId);

  // FASE 2B — verifica limite de conexões antes de qualquer escrita
  if (window._matchGetUser) {
    const _canConnect = await _checkFriendLimit(currentUserData, window._matchGetUser.uid);
    if (!_canConnect) {
      // Restaura a opacidade do item se foi ocultado antecipadamente
      if (item) { item.style.opacity = ''; item.style.transform = ''; }
      return; // bloqueado — toast e modal já foram disparados
    }
  }

  if (item) { item.style.opacity = '0'; item.style.transform = 'translateX(40px)'; item.style.transition = 'all .3s'; }

  try {
    // Update interest status
    await window.updateDoc(window.doc(window.db, 'interests', intId), { status: 'accepted' });

    // Create match com ID determinístico para evitar duplicatas em re-match
    if (window._matchGetUser) {
      const p = window._myTalentProfile;
      const matchData = {
        userUid:     window._matchGetUser.uid,
        userName:    p?.name || '',
        userPhoto:   p?.photo || '',
        teamId:      teamId,
        teamName:    teamName,
        teamPhoto:   teamPhoto,
        teamOwnerId: teamOwnerId || '',
        createdAt:   new Date().toISOString(),
        intId:       intId,
      };
      const matchId = `match_${teamId}_${window._matchGetUser.uid}`;
      await window.setDoc(window.doc(window.db, 'matches', matchId), matchData);

      // Atualiza cache local do artista imediatamente (sem aguardar recarga)
      _matchArtistSentInterests[teamId] = 'matched';

      // Atualiza botão no grid de equipes se estiver visível
      const gridBtn = document.getElementById('mabtn-' + teamId);
      if (gridBtn) {
        gridBtn.className = 'match-btn-interest matched';
        gridBtn.textContent = '💛 MATCH! VER';
        gridBtn.disabled = false;
        gridBtn.onclick = function(e) { matchSwitchView('matches'); e.stopPropagation(); };
      }
    }

    setTimeout(() => {
      item?.remove();
      matchRenderInbox();
      matchRenderSentPanel(); // atualiza painel direito (move de pendente para match)
      matchRenderMatches();
      _matchUpdateArtistReceivedBadge(); // atualiza badge
    }, 320);
    matchShowCelebration(teamName, teamPhoto, window._myTalentProfile?.name || '', window._myTalentProfile?.photo || '', `match_${teamId}_${window._matchGetUser?.uid}`);
    window.toast('🎉 Match com ' + teamName + '!');

  } catch(e) {
    window.toast('Erro: ' + e.message, 'error');
    if (item) { item.style.opacity = ''; item.style.transform = ''; }
  }
};

window.matchDeclineInterest = async function(intId) {
  const item = document.getElementById('minterest-' + intId);
  if (item) { item.style.opacity = '0'; item.style.transform = 'translateX(-20px)'; item.style.transition = 'all .3s'; setTimeout(() => item.remove(), 300); }
  try { await window.updateDoc(window.doc(window.db, 'interests', intId), { status: 'declined' }); } catch(e) {}
  window.toast('Interesse recusado.', 'info');
};

// ── Team preview (artist view, right panel) ───────────────────────────────────
// v5.20.2 — Preview expandido: busca dados reais de team_profiles + teams
//           exibindo membros reais, projetos publicados, gêneros e atividade recente
window.matchShowTeamPreview = async function(teamId, teamName, teamPhoto) {
  const panel = document.getElementById('match-team-preview-body');
  const title = document.getElementById('match-preview-team-name');
  if (!panel) return;
  if (title) title.textContent = teamName || 'Equipe';

  panel.innerHTML = `<div class="match-empty-state"><div style="font-size:28px;margin-bottom:8px">⏳</div><div>CARREGANDO...</div></div>`;

  try {
    // Busca paralela: team_profiles (bio, vagas, banner) + teams (membros, projetos)
    let teamData = null;
    let teamsData = null;
    if (teamId) {
      const [tpSnap, tSnap] = await Promise.all([
        window.getDoc(window.doc(window.db, 'team_profiles', teamId)).catch(() => null),
        window.getDoc(window.doc(window.db, 'teams', teamId)).catch(() => null),
      ]);
      if (tpSnap?.exists()) teamData = { id: tpSnap.id, ...tpSnap.data() };
      if (tSnap?.exists()) teamsData = { id: tSnap.id, ...tSnap.data() };
    }

    // Busca projetos publicados da equipe para mostrar stats reais
    let publishedCount = 0;
    let activeCount = 0;
    if (teamId) {
      try {
        const projSnap = await window.getDocs(
          window.query(window.collection(window.db, 'teams', teamId, 'projects'), window.limit(100))
        );
        projSnap.docs.forEach(d => {
          const s = d.data().status || '';
          if (s === 'published' || s === 'lançado') publishedCount++;
          else if (s === 'active' || s === 'ativo') activeCount++;
        });
      } catch(e) { /* best-effort */ }
    }

    // Prioriza dados do team_profiles, fallback para _matchAllTeams (já carregado)
    const cached = _matchAllTeams.find(x => x.id === teamId);
    const resolvedName    = teamData?.name    || teamsData?.name  || cached?.name    || teamName  || 'Equipe';
    const resolvedPhoto   = teamData?.photo   || teamsData?.photo || cached?.photo   || teamPhoto || '';
    const resolvedBanner  = teamData?.banner  || cached?.banner  || '';
    const resolvedTagline = teamData?.tagline || cached?.tagline || '';
    const resolvedBio     = teamData?.bio     || teamData?.description || teamsData?.description || cached?.bio || '';
    const resolvedGenres  = teamData?.genres  || teamsData?.genres || cached?.genres || [];
    const resolvedLocation = teamData?.location || teamsData?.location || '';
    // v5.20.3 — campos adicionais sincronizados com o formulário de edição de perfil
    const resolvedStory      = teamData?.story || '';
    const resolvedStage      = teamData?.stage || '';
    const resolvedFoundedYear = teamData?.foundedYear || teamData?.year || '';
    const resolvedLinks      = teamData?.links || {};
    const resolvedStats      = teamData?.stats || {};
    const resolvedCategories = teamData?.categories || [];

    // Membros reais da equipe (array de objetos com name, photo, role)
    const members = Array.isArray(teamsData?.members) ? teamsData.members
      : Array.isArray(teamData?.members) ? teamData.members : [];
    const memberCount = members.length || (typeof teamsData?.members === 'object' ? Object.keys(teamsData.members || {}).length : 0) || '—';

    const initials  = (resolvedName[0] || '?').toUpperCase();
    const avHtml    = resolvedPhoto
      ? `<img src="${resolvedPhoto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`
      : `<span style="font-weight:800;font-size:18px;color:#fff">${initials}</span>`;

    const bannerStyle = resolvedBanner
      ? `url('${resolvedBanner}') center/cover`
      : 'linear-gradient(135deg,var(--a1),var(--a2))';

    const vacancies = teamData?.vacancies || teamsData?.vacancies || cached?.vacancies || {};
    const totalVagas = Object.values(vacancies).reduce((s,v)=>s+Number(v||0),0);

    // Gêneros como tags
    const genreTags = Array.isArray(resolvedGenres) && resolvedGenres.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px">
          ${resolvedGenres.slice(0,5).map(g => `<span style="font-family:var(--font-mono);font-size:8px;padding:2px 7px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;color:var(--a1)">${window.escHtml(String(g))}</span>`).join('')}
         </div>`
      : '';

    // Grid de membros reais (máx 6)
    const memberGrid = members.length
      ? `<div class="match-section-label" style="margin-top:14px;margin-bottom:8px">MEMBROS (${memberCount})</div>
         <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px">
           ${members.slice(0,6).map(mb => {
             const mname = mb.name || mb.displayName || '?';
             const mphoto = mb.photo || mb.photoURL || '';
             const mrole  = mb.role  || mb.artRole   || '';
             return `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;width:42px">
               <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--a1),var(--a2));display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">
                 ${mphoto ? `<img src="${mphoto}" style="width:100%;height:100%;object-fit:cover">` : `<span style="font-size:12px;font-weight:800;color:#fff">${(mname[0]||'?').toUpperCase()}</span>`}
               </div>
               <div style="font-size:8px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:42px;color:var(--text2)">${window.escHtml(mname.split(' ')[0])}</div>
             </div>`;
           }).join('')}
           ${members.length > 6 ? `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;width:42px"><div style="width:36px;height:36px;border-radius:50%;background:var(--bg3);border:1px dashed var(--border);display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:9px;color:var(--text3)">+${members.length-6}</div></div>` : ''}
         </div>`
      : '';

    panel.innerHTML = `
      <div style="position:relative;height:80px;background:${bannerStyle};border-radius:10px;margin-bottom:28px;flex-shrink:0">
        <div style="position:absolute;bottom:-20px;left:14px;width:40px;height:40px;border-radius:50%;border:2px solid var(--bg2);background:linear-gradient(135deg,var(--a1),var(--a2));display:flex;align-items:center;justify-content:center;overflow:hidden">${avHtml}</div>
      </div>
      <div style="font-size:14px;font-weight:800;margin-bottom:2px">${window.escHtml(resolvedName)}</div>
      ${resolvedTagline ? `<div style="font-family:var(--font-mono);font-size:9px;color:var(--text3);margin-bottom:6px">${window.escHtml(resolvedTagline)}</div>` : ''}
      ${resolvedLocation ? `<div style="font-family:var(--font-mono);font-size:8px;color:var(--text3);margin-bottom:8px">📍 ${window.escHtml(resolvedLocation)}</div>` : ''}
      ${resolvedFoundedYear ? `<div style="font-family:var(--font-mono);font-size:8px;color:var(--text3);margin-bottom:8px">📅 Desde ${window.escHtml(String(resolvedFoundedYear))}</div>` : ''}
      ${resolvedStage ? `<div style="font-family:var(--font-mono);font-size:8px;padding:2px 8px;display:inline-block;background:rgba(168,85,247,0.12);border:1px solid rgba(168,85,247,0.3);border-radius:8px;color:#a855f7;margin-bottom:8px">${window.escHtml(resolvedStage)}</div>` : ''}
      ${genreTags}
      ${resolvedBio ? `<div style="font-size:11px;color:var(--text2);line-height:1.6;margin-bottom:14px;padding:10px;background:var(--bg3);border-radius:8px;border:1px solid var(--border)">${window.escHtml(resolvedBio)}</div>` : ''}
      ${resolvedStory ? `<div style="margin-bottom:14px"><div class="match-section-label" style="margin-bottom:6px">HISTÓRIA</div><div style="font-size:11px;color:var(--text2);line-height:1.6;padding:10px;background:var(--bg3);border-radius:8px;border:1px solid var(--border)">${window.escHtml(resolvedStory)}</div></div>` : ''}
      <div class="match-stats-row" style="margin-bottom:14px">
        <div class="match-stat-pill"><div class="match-stat-val" style="color:var(--a1)">${memberCount}</div><div class="match-stat-lbl">MEMBROS</div></div>
        <div class="match-stat-pill"><div class="match-stat-val" style="color:var(--a2)">${publishedCount || '—'}</div><div class="match-stat-lbl">LANÇADOS</div></div>
        <div class="match-stat-pill"><div class="match-stat-val" style="color:var(--a3,#f59e0b)">${activeCount || '—'}</div><div class="match-stat-lbl">ATIVOS</div></div>
        ${totalVagas ? `<div class="match-stat-pill"><div class="match-stat-val" style="color:var(--green,#10b981)">${totalVagas}</div><div class="match-stat-lbl">VAGAS</div></div>` : ''}
        ${resolvedStats?.views ? `<div class="match-stat-pill"><div class="match-stat-val" style="color:var(--a1)">${window.escHtml(String(resolvedStats.views))}</div><div class="match-stat-lbl">VIEWS</div></div>` : ''}
        ${resolvedStats?.followers ? `<div class="match-stat-pill"><div class="match-stat-val" style="color:var(--a2)">${window.escHtml(String(resolvedStats.followers))}</div><div class="match-stat-lbl">SEGUIDORES</div></div>` : ''}
      </div>
      ${resolvedCategories.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px">${resolvedCategories.slice(0,6).map(c => `<span style="font-family:var(--font-mono);font-size:8px;padding:2px 7px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;color:var(--text2)">${window.escHtml(String(c))}</span>`).join('')}</div>` : ''}
      ${memberGrid}
      ${(resolvedLinks.youtube||resolvedLinks.spotify||resolvedLinks.instagram||resolvedLinks.tiktok||resolvedLinks.discord||resolvedLinks.site) ? `
        <div class="match-section-label" style="margin-top:4px;margin-bottom:8px">LINKS</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
          ${resolvedLinks.youtube   ? `<a href="${window.escHtml(resolvedLinks.youtube)}"   target="_blank" rel="noopener" style="font-family:var(--font-mono);font-size:9px;padding:4px 10px;background:rgba(255,0,0,0.08);border:1px solid rgba(255,0,0,0.2);border-radius:8px;color:#ff4444;text-decoration:none">▶ YouTube</a>` : ''}
          ${resolvedLinks.spotify   ? `<a href="${window.escHtml(resolvedLinks.spotify)}"   target="_blank" rel="noopener" style="font-family:var(--font-mono);font-size:9px;padding:4px 10px;background:rgba(30,215,96,0.08);border:1px solid rgba(30,215,96,0.2);border-radius:8px;color:#1ed760;text-decoration:none">♫ Spotify</a>` : ''}
          ${resolvedLinks.instagram ? `<a href="${window.escHtml(resolvedLinks.instagram)}" target="_blank" rel="noopener" style="font-family:var(--font-mono);font-size:9px;padding:4px 10px;background:rgba(225,48,108,0.08);border:1px solid rgba(225,48,108,0.2);border-radius:8px;color:#e1306c;text-decoration:none">📷 Instagram</a>` : ''}
          ${resolvedLinks.tiktok    ? `<a href="${window.escHtml(resolvedLinks.tiktok)}"    target="_blank" rel="noopener" style="font-family:var(--font-mono);font-size:9px;padding:4px 10px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:8px;color:var(--text2);text-decoration:none">♪ TikTok</a>` : ''}
          ${resolvedLinks.discord   ? `<a href="${window.escHtml(resolvedLinks.discord)}"   target="_blank" rel="noopener" style="font-family:var(--font-mono);font-size:9px;padding:4px 10px;background:rgba(88,101,242,0.08);border:1px solid rgba(88,101,242,0.2);border-radius:8px;color:#5865f2;text-decoration:none">💬 Discord</a>` : ''}
          ${resolvedLinks.site      ? `<a href="${window.escHtml(resolvedLinks.site)}"      target="_blank" rel="noopener" style="font-family:var(--font-mono);font-size:9px;padding:4px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--a1);text-decoration:none">🌐 Site</a>` : ''}
        </div>
      ` : ''}
      ${Object.keys(vacancies).length ? `
        <div class="match-section-label" style="margin-top:4px">VAGAS ABERTAS</div>
        <div style="margin-top:8px">
        ${Object.keys(vacancies).map(k => {
          const role = (typeof MATCH_ROLES !== 'undefined' ? MATCH_ROLES : []).find(r => r.id === k);
          if (!role || !Number(vacancies[k])) return '';
          const mySkills = window._myTalentProfile?.skills || {};
          const isSkillMatch = !!mySkills[k];
          return `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;background:${isSkillMatch?'rgba(255,60,142,.08)':'var(--bg3)'};border:1px solid ${isSkillMatch?'rgba(255,60,142,.25)':'var(--border)'};border-radius:10px;margin-bottom:6px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:15px">${role.icon}</span>
              <div>
                <div style="font-size:12px;font-weight:700">${role.label}</div>
                ${isSkillMatch ? `<div style="font-family:var(--font-mono);font-size:9px;color:var(--a1)">COMBINA COM VOCÊ ✨</div>` : ''}
              </div>
            </div>
            <span style="font-family:var(--font-mono);font-size:8px;color:var(--text3)">${vacancies[k]} VAGA(S)</span>
          </div>`;
        }).join('')}
        </div>
      ` : ''}
    `;
  } catch(e) {
    panel.innerHTML = `<div class="match-empty-state"><div>Não foi possível carregar o perfil da equipe.</div></div>`;
  }
};

// ── All Matches view ──────────────────────────────────────────────────────────
window.matchRenderMatches = async function() {
  const list  = document.getElementById('match-all-matches');
  const badge = document.getElementById('match-total-badge');
  if (!list || !window._matchGetUser) return;
  list.innerHTML = `<div class="match-empty-state"><div style="font-size:28px;margin-bottom:8px">⏳</div><div>CARREGANDO...</div></div>`;
  try {
    let items = [];

    // v5.20.1 — Só roda a query de teamId se estiver em MODO EQUIPE (!_matchIsArtistMode).
    // Em modo artista, _currentTeamId pode estar set mas a query de team não deve rodar:
    // ela aciona get(teams/teamId) nas regras do Firestore e causa "Missing permissions".
    if (window._currentTeamId && !_matchIsArtistMode) {
      try {
        const q = window.query(window.collection(window.db, 'matches'), window.where('teamId', '==', window._currentTeamId), window.limit(30));
        const snap = await window.getDocs(q);
        items = snap.docs.map(d => ({ id: d.id, ...d.data(), perspective: 'team' }));
      } catch(e) { /* ignora erro de permissão da query de team */ }
    }
    // Query do artista: sempre roda (regra simples: userUid == auth.uid)
    try {
      const q2 = window.query(window.collection(window.db, 'matches'), window.where('userUid', '==', window._matchGetUser.uid), window.limit(30));
      const snap2 = await window.getDocs(q2);
      snap2.docs.forEach(d => {
        if (!items.find(x => x.id === d.id)) items.push({ id: d.id, ...d.data(), perspective: 'artist' });
      });
    } catch(e) { /* ignora erro da query de artista */ }

    if (badge) badge.textContent = items.length + ' MATCH' + (items.length !== 1 ? 'ES' : '');

    // Deduplica por doc ID: elimina duplicatas absolutas (mesmo doc carregado 2x)
    // Depois, para cada teamId único, se vier como 'team' E 'artist' (user é membro e artista),
    // mantém apenas a perspectiva de 'team' (mais informativa para membros da equipe)
    const seenIds = new Set();
    items = items.filter(m => { if (seenIds.has(m.id)) return false; seenIds.add(m.id); return true; });

    const seenTeams = {};
    items = items.filter(m => {
      if (!m.teamId) return true;
      const key = m.teamId;
      const existing = seenTeams[key];
      if (!existing) { seenTeams[key] = m; return true; }
      // Prefere perspectiva 'team' sobre 'artist'; se mesma perspectiva, mantém mais recente
      if (existing.perspective === 'artist' && m.perspective === 'team') {
        seenTeams[key] = m;
        return true; // substitui: remove o existente via filtragem posterior
      }
      if (existing.perspective === m.perspective && m.createdAt > existing.createdAt) {
        seenTeams[key] = m; return true;
      }
      return false;
    });
    // Segunda passagem: remove os que foram substituídos por perspectiva melhor
    const finalIds = new Set(Object.values(seenTeams).map(m => m.id));
    items = items.filter(m => finalIds.has(m.id));

    if (!items.length) {
      list.innerHTML = `<div class="match-empty-state" style="padding:40px 20px"><div style="font-size:36px;margin-bottom:12px">💛</div><div>NENHUM MATCH AINDA<br><br>Demonstre interesse e aguarde!</div></div>`;
      return;
    }

    // Enrich missing teamNames from team_profiles (em paralelo para melhor performance)
    const missingTeamIds = [...new Set(items.filter(m => !m.teamName && m.teamId).map(m => m.teamId))];
    if (missingTeamIds.length) {
      try {
        await Promise.all(missingTeamIds.map(async tid => {
          try {
            const tSnap = await window.getDoc(window.doc(window.db, 'team_profiles', tid));
            if (tSnap && tSnap.exists()) {
              const td = tSnap.data();
              items.forEach(m => { if (m.teamId === tid && !m.teamName) { m.teamName = td.name || td.teamName || ''; m.teamPhoto = m.teamPhoto || td.photo || ''; } });
            }
            // Fallback: colecao teams
            if (!items.find(m => m.teamId === tid && m.teamName)) {
              const t2 = await window.getDoc(window.doc(window.db, 'teams', tid));
              if (t2 && t2.exists()) {
                const td2 = t2.data();
                items.forEach(m => { if (m.teamId === tid) m.teamName = m.teamName || td2.name || ''; });
              }
            }
          } catch(e) { /* best-effort por team */ }
        }));
      } catch(e) { /* best-effort geral */ }
    }

    list.innerHTML = items.map(m => {
      const isTeam = m.perspective === 'team';
      const name   = isTeam ? (m.userName||m.talentName||'Artista') : (m.teamName||'Equipe');
      const photo  = isTeam ? (m.userPhoto||m.talentPhoto||'') : (m.teamPhoto||'');
      const avHtml = photo ? `<img src="${photo}" alt="" style="width:100%;height:100%;object-fit:cover">` : (name[0]||'?').toUpperCase();
      const isOwner = (window._myTeams||[]).find(t=>t.id===window._currentTeamId)?.members?.find?.(mb=>mb.uid===window._matchGetUser?.uid)?.role === 'owner';
      // For artist perspective we chat with teamOwnerId; for team we chat with userUid
      const chatUid = isTeam ? m.userUid : (m.teamOwnerId || m.teamId || '');
      return `<div class="match-card-item">
        <div class="match-card-pair">
          <div class="match-card-av ${isTeam?'':'team'}">${avHtml}</div>
          <span style="font-size:16px">💛</span>
          <div class="match-card-info">
            <div class="match-card-title">${window.escHtml(name)}</div>
            <div class="match-card-sub">MATCH CONFIRMADO</div>
          </div>
          <span class="match-badge">MATCH</span>
        </div>
        <div class="match-card-actions">
          <button class="match-btn-chat" onclick="matchOpenChatInPanel('${m.id}','${m.perspective||'artist'}')">💬 ABRIR CHAT</button>
          ${isTeam && isOwner && !m.inviteSent ? `<button class="match-btn-invite" onclick="matchSendInvite('${m.id}')">📨 CONVIDAR</button>` : ''}
          <button class="match-btn-decline" style="font-size:9px;padding:5px 10px" onclick="matchCancelMatch('${m.id}','${m.teamId||''}','${m.userUid||''}','${window.escHtml(name)}')">✕ CANCELAR</button>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    list.innerHTML = `<div class="match-empty-state"><div>Erro: ${e.message}</div></div>`;
  }
};

// ── View talent profile ───────────────────────────────────────────────────────
window.matchViewTalent = async function(id) {
  if (typeof window.openProfilePopup !== 'function') return;
  const t = _matchAllTalents.find(x => x.id === id);
  if (!t) return;

  // Normaliza campos para o formato que openProfilePopup espera
  // e busca o bannerURL do documento users/{uid} (onde ele é salvo)
  const normalized = {
    ...t,
    name:    t.name || t.displayName || '?',
    photo:   t.photo || t.photoURL || '',
    bio:     t.bio || '',
    roles:   Object.keys(t.skills || {}),
    availability: t.availability || 'open',
    uid:     t.uid || t.id,
    id:      t.id,
    // banner do talent_profile vira bannerURL para o popup
    bannerURL: t.bannerURL || t.banner || '',
    stats: [
      { v: t.availability === 'open' ? 'Disponível' : 'Ocupado', l: 'Status' },
    ],
    skillBars: Object.keys(t.skills || {}).slice(0, 4).map(r => {
      const role = (typeof MATCH_ROLES !== 'undefined' ? MATCH_ROLES : []).find(x => x.id === r);
      return { n: role?.label || r, w: 60 + (r.charCodeAt(2) % 35), l: ['Iniciante','Médio','Avançado','Expert'][r.charCodeAt(2) % 4] };
    }),
    activity: [],
    badges: { earned: [], locked: [] },
  };

  // Tenta buscar bannerURL mais atualizado do users/{uid} se não tiver
  if (!normalized.bannerURL && (t.uid || t.id)) {
    try {
      const userSnap = await window.getDoc(window.doc(window.db, 'users', t.uid || t.id));
      if (userSnap.exists()) {
        const ud = userSnap.data();
        normalized.bannerURL = ud.bannerURL || '';
        // Atualiza foto também se mais recente
        if (!normalized.photo && ud.photoURL) normalized.photo = ud.photoURL;
      }
    } catch(e) { /* ignora erro silenciosamente */ }
  }

  window.openProfilePopup(normalized, 'team');
};

// ── Open chat ─────────────────────────────────────────────────────────────────
window.matchOpenChat = async function(matchId, uidParam, nameParam) {
  if (!matchId) { window.toast('Match inválido.', 'error'); return; }
  const perspectiveHint = (window._currentTeamId && !window._talentStandaloneForceArtistMode)
    ? 'team' : 'artist';
  if (typeof window.matchSwitchView === 'function') window.matchSwitchView('matches');
  setTimeout(() => {
    if (typeof window.matchOpenChatInPanel === 'function') {
      window.matchOpenChatInPanel(matchId, perspectiveHint);
    }
  }, 120);
};

// ── Send invite ───────────────────────────────────────────────────────────────
window.matchSendInvite = async function(matchId) {
  if (!window._currentTeamId || !window._matchGetUser) return;
  try {
    const team = (window._myTeams||[]).find(t => t.id === window._currentTeamId);
    if (!team?.inviteCode) { window.toast('Código de convite não encontrado.', 'error'); return; }

    // Busca dados do match para saber quem é o artista
    const matchSnap = await window.getDoc(window.doc(window.db, 'matches', matchId));
    if (!matchSnap.exists()) { window.toast('Match não encontrado.', 'error'); return; }
    const m = matchSnap.data();
    const teamName = team.name || 'Equipe';

    // 1. Marca convite como enviado
    await window.updateDoc(window.doc(window.db, 'matches', matchId), { inviteSent: true });

    // 2. Envia mensagem de convite no Match Chat (matches/{matchId}/messages)
    // v5.20.0 — Convite enviado no canal do Match, não no PM privado.
    // Isso mantém o contexto do convite no chat de Match onde a conversa aconteceu.
    const me = window._matchGetUser;
    const inviteText = '🎉 Convite oficial da equipe ' + teamName + '!\n\nUse o código abaixo para entrar:\n\n🔑 ' + team.inviteCode + '\n\nNa tela de equipes, clique em "Entrar com código" e insira o código acima.';
    try {
      await window.addDoc(
        window.collection(window.db, 'matches', matchId, 'messages'),
        {
          senderProfileId: window._currentTeamId,  // profileId do perfil ativo = teamId
          senderType:      'team',
          senderId:        me.uid,                  // uid Firebase (retrocompat)
          from:            me.uid,                  // retrocompat legado
          text:            inviteText,
          createdAt:       window.serverTimestamp ? window.serverTimestamp() : new Date(),
          fromIsTeam:      true,
          fromName:        team.name   || 'Equipe',
          fromPhoto:       team.photo  || '',
          teamId:          window._currentTeamId,
          isInvite:        true,
        }
      );
    } catch(e) {
      // Falha silenciosa na mensagem não cancela o convite
      console.warn('[matchSendInvite] Erro ao salvar msg de convite no Match Chat:', e.message);
    }

    // 3. Toast de confirmação — NÃO abre PM (sistemas separados)
    window.toast('📨 Convite enviado para ' + (m.userName || 'artista') + '!');

    // 4. Atualiza botão CONVIDAR no painel inline se estiver aberto para este match
    if (window._matchPanelContext && window._matchPanelContext.matchId === matchId) {
      const inviteBtn = document.getElementById('mcp-invite-btn-' + matchId);
      if (inviteBtn) {
        inviteBtn.outerHTML = `<span style="font-family:var(--font-mono);font-size:8px;color:var(--green);padding:5px 4px">✅</span>`;
      }
    }

    matchRenderSentPanel();
    matchRenderMatches();
    // Atualiza Tab 2 aba Matches caso esteja aberta
    if (_matchInboxTab === 'matches') matchRenderInbox();
  } catch(e) { window.toast('Erro ao enviar convite: ' + e.message, 'error'); }
};

// ── Match Chat Inline Panel ───────────────────────────────────────────────────
// Contexto congelado do chat: definido em matchOpenChatInPanel e lido em toda a engine.
// Nunca modificado fora de matchOpenChatInPanel.
window._matchPanelContext        = null;  // {matchId, activeProfileId, activeProfileType, otherProfileId, otherProfileType, otherProfileName, otherProfilePhoto, otherUid, canInvite, teamId, inviteSent}
window._matchPanelChatUnsub      = null;  // unsubscribe do onSnapshot de mensagens
window._matchPanelTypingTimer    = null;  // timer de "está digitando"
window._matchPanelTypingUnsub    = null;  // unsubscribe do onSnapshot de typing

// Envia sinal de "está digitando" ao Firestore (pm_chats/{chatId})
window._matchPanelChatTyping = async function() {
  const otherUid = window._matchPanelContext?.otherUid;
  if (!otherUid || !window._matchGetUser || !window.db) return;
  const chatId = typeof window.pmChatId === 'function'
    ? window.pmChatId(window._matchGetUser.uid, otherUid)
    : [window._matchGetUser.uid, otherUid].sort().join('_');
  const myKey  = 'typing_' + window._matchGetUser.uid;
  try {
    await window.setDoc(
      window.doc(window.db, 'pm_chats', chatId),
      { [myKey]: window.serverTimestamp ? window.serverTimestamp() : new Date() },
      { merge: true }
    );
  } catch(e) {}
  clearTimeout(window._matchPanelTypingTimer);
  window._matchPanelTypingTimer = setTimeout(async () => {
    try {
      await window.updateDoc(window.doc(window.db, 'pm_chats', chatId), { [myKey]: null });
    } catch(e) {}
  }, 3000);
};

// Inicia listener de typing remoto — atualiza o mcp-sub-label
function _matchStartTypingListener(otherUid) {
  if (!window._matchGetUser || !window.db) return;
  // Cancela listener anterior de typing se existir
  if (window._matchPanelTypingUnsub) { window._matchPanelTypingUnsub(); window._matchPanelTypingUnsub = null; }
  const chatId   = typeof window.pmChatId === 'function'
    ? window.pmChatId(window._matchGetUser.uid, otherUid)
    : [window._matchGetUser.uid, otherUid].sort().join('_');
  const otherKey = 'typing_' + otherUid;
  const baseLabel = (window._matchPanelContext?.activeProfileType === 'artist')
    ? 'CONVERSA COM EQUIPE' : 'CONVERSA COM ARTISTA';
  try {
    window._matchPanelTypingUnsub = window.onSnapshot(
      window.doc(window.db, 'pm_chats', chatId),
      snap => {
        const subEl = document.getElementById('mcp-sub-label');
        if (!subEl) return;
        const data = snap.exists() ? snap.data() : {};
        const typingTs = data[otherKey];
        let isTyping = false;
        if (typingTs) {
          const ts = typingTs?.toDate ? typingTs.toDate() : new Date(typingTs);
          isTyping = (Date.now() - ts.getTime()) < 4500;
        }
        subEl.textContent = isTyping ? '✍️ DIGITANDO...' : baseLabel;
        subEl.style.color = isTyping ? 'var(--green)' : '';
      },
      err => console.warn('[matchTyping] listener error:', err)
    );
  } catch(e) { console.warn('[matchTyping] setup error:', e); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MATCH CHAT ENGINE — fonte única de verdade: window._matchPanelContext
//
// Estrutura congelada no momento da abertura e nunca mais recalculada:
//   window._matchPanelContext = {
//     matchId,
//     activeProfileId,   // ID canônico do perfil ativo (teamId ou auth.uid)
//     activeProfileType, // "artist" | "team"
//     otherProfileId,    // ID do outro perfil (teamId ou auth.uid)
//     otherProfileType,  // "team" | "artist"
//     otherProfileName,  // nome para exibição no header
//     otherProfilePhoto, // foto para exibição
//     otherUid,          // uid Firebase do outro (para typing, view profile)
//     canInvite,         // boolean: botão de convite visível
//     teamId,            // m.teamId (para envio de convite)
//   }
//
// REGRAS ABSOLUTAS após definir o contexto:
//   • Header  → usa SOMENTE otherProfileName / otherProfileType
//   • Render  → mine = (msg.senderProfileId === activeProfileId)  SEM FALLBACK
//   • Send    → senderProfileId = activeProfileId  SEM FALLBACK
//   • Listener→ captura structuredClone do contexto no closure — imune a mutações
// ═══════════════════════════════════════════════════════════════════════════════

// perspectiveHint: 'artist' | 'team' passado pelo call site (botões de lista).
// Quando ausente (notificações), a heurística m.userUid === authUid é usada.
// Essa heurística É segura: userUid é o uid Firebase do artista — comparar com
// authUid é a única inferência permitida quando o call site não passa contexto.
window.matchOpenChatInPanel = async function(matchId, perspectiveHint) {
  if (!matchId || !window._matchGetUser) return;
  const preview = document.getElementById('match-chat-preview');
  if (!preview) return;

  // Desmonta listener anterior
  if (window._matchPanelChatUnsub) { window._matchPanelChatUnsub(); window._matchPanelChatUnsub = null; }
  if (window._matchPanelTypingUnsub) { window._matchPanelTypingUnsub(); window._matchPanelTypingUnsub = null; }

  preview.classList.add('mcp-active');
  preview.innerHTML = `<div class="match-empty-state" style="padding:40px 20px"><div style="font-size:24px;margin-bottom:8px">⏳</div><div style="font-family:var(--font-mono);font-size:10px">ABRINDO CHAT...</div></div>`;

  try {
    const snap = await window.getDoc(window.doc(window.db, 'matches', matchId));
    if (!snap || !snap.exists()) {
      preview.innerHTML = `<div class="match-empty-state"><div>Match não encontrado.</div></div>`;
      return;
    }
    const m      = snap.data();
    const authUid = window._matchGetUser.uid;

    // ── RESOLUÇÃO DE PERSPECTIVA ─────────────────────────────────────────────
    // Prioridade:
    //   1. perspectiveHint explícito do call site → verdade absoluta
    //   2. m.userUid === authUid → usuário É o artista deste match
    //   3. fallback → equipe (quando uid não bate com userUid)
    let iAmArtist;
    if (perspectiveHint === 'artist')      { iAmArtist = true;  }
    else if (perspectiveHint === 'team')   { iAmArtist = false; }
    else if (m.userUid && m.userUid === authUid) { iAmArtist = true; }
    else                                   { iAmArtist = false; }

    // ── IDENTIDADES CONGELADAS ────────────────────────────────────────────────
    const activeProfileId   = iAmArtist ? authUid   : m.teamId;
    const activeProfileType = iAmArtist ? 'artist'  : 'team';
    const otherProfileType  = iAmArtist ? 'team'    : 'artist';

    // ── DADOS DO OUTRO LADO ───────────────────────────────────────────────────
    // Artista abrindo → outro lado é a equipe (dados: m.teamName, m.teamPhoto, m.teamOwnerId)
    // Equipe abrindo  → outro lado é o artista (dados: m.userName, m.userPhoto, m.userUid)
    // Esses campos vêm do documento do match — escritos no momento da criação.
    // São os únicos campos usados. Não há inferência após este bloco.
    let otherProfileId, otherProfileName, otherProfilePhoto, otherUid;

    if (iAmArtist) {
      // Lado equipe: ID é m.teamId; nome/foto vêm de m.teamName/m.teamPhoto
      otherProfileId    = m.teamId    || '';
      otherProfileName  = m.teamName  || 'Equipe';
      otherProfilePhoto = m.teamPhoto || '';
      otherUid          = m.teamOwnerId || '';

      // Enriquece nome/foto e ownerUid a partir de team_profiles / teams se ausentes
      if ((!otherUid || !otherProfileName || otherProfileName === 'Equipe') && m.teamId) {
        try {
          const tpSnap = await window.getDoc(window.doc(window.db, 'team_profiles', m.teamId));
          if (tpSnap.exists()) {
            const td = tpSnap.data();
            otherUid          = otherUid          || td.ownerUid || '';
            otherProfileName  = otherProfileName !== 'Equipe' ? otherProfileName : (td.name  || otherProfileName);
            otherProfilePhoto = otherProfilePhoto || td.photo || '';
          }
        } catch(e) {}
        if (!otherUid) {
          try {
            const tSnap = await window.getDoc(window.doc(window.db, 'teams', m.teamId));
            if (tSnap.exists()) {
              const td = tSnap.data();
              const owner = (td.members || []).find(mb => mb.role === 'owner');
              otherUid         = owner?.uid || '';
              otherProfileName = otherProfileName !== 'Equipe' ? otherProfileName : (td.name || otherProfileName);
            }
          } catch(e) {}
        }
      }
    } else {
      // Lado artista: ID é m.userUid; nome/foto vêm de m.userName/m.userPhoto
      otherProfileId    = m.userUid   || '';
      otherProfileName  = m.userName  || 'Artista';
      otherProfilePhoto = m.userPhoto || '';
      otherUid          = m.userUid   || '';

      // Enriquece nome/foto a partir de talent_profiles se ausentes
      if (otherUid && (!otherProfileName || otherProfileName === 'Artista' || !otherProfilePhoto)) {
        try {
          const tpSnap = await window.getDoc(window.doc(window.db, 'talent_profiles', otherUid));
          if (tpSnap && tpSnap.exists()) {
            const tp = tpSnap.data();
            if (tp.name)  otherProfileName  = tp.name;
            if (tp.photo) otherProfilePhoto = tp.photo;
          }
        } catch(e) {}
      }
    }

    // Valida que temos o ID do outro lado
    if (!otherProfileId) {
      preview.innerHTML = `<div class="match-empty-state"><div>Não foi possível identificar a outra parte.</div></div>`;
      return;
    }

    // ── CONGELA O CONTEXTO ────────────────────────────────────────────────────
    // A partir daqui, NENHUMA função do chat lê _currentTeamId, authUid, ou
    // qualquer outra variável global para decidir identidade ou renderização.
    const canInvite = !iAmArtist && !m.inviteSent &&
      !!((window._myTeams||[]).find(t => t.id === m.teamId)
          ?.members?.find?.(mb => mb.uid === authUid && mb.role === 'owner'));

    window._matchPanelContext = {
      matchId,
      activeProfileId,
      activeProfileType,
      otherProfileId,
      otherProfileType,
      otherProfileName,
      otherProfilePhoto,
      otherUid,
      canInvite,
      teamId: m.teamId || '',
      inviteSent: !!m.inviteSent,
    };

    // ── RENDER DO PAINEL ──────────────────────────────────────────────────────
    // Todas as strings abaixo vêm SOMENTE de _matchPanelContext — zero inferência.
    const ctx = window._matchPanelContext;
    const subLabel = ctx.activeProfileType === 'artist' ? 'CONVERSA COM EQUIPE' : 'CONVERSA COM ARTISTA';
    const matchDate = m.createdAt
      ? new Date(m.createdAt).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric'})
      : '';

    const avHtml = ctx.otherProfilePhoto
      ? `<img src="${ctx.otherProfilePhoto}" style="width:100%;height:100%;object-fit:cover">`
      : `<span style="font-size:14px;font-weight:800">${(ctx.otherProfileName[0]||'?').toUpperCase()}</span>`;

    const quickMsgs = ctx.activeProfileType === 'artist'
      ? [
          { label: 'Olá! Adorei o perfil 🎶',  text: 'Olá! Adorei o perfil da equipe! Gostaria de saber mais 🎶' },
          { label: 'Posso contribuir com...',    text: 'Tenho experiência em ' + ((window._myTalentProfile?.skills && Object.keys(window._myTalentProfile.skills).length) ? Object.keys(window._myTalentProfile.skills).slice(0,2).join(', ') : 'produção') + ' — posso contribuir bastante!' },
          { label: 'Marcar call?',               text: 'Podemos marcar uma call para conversar sobre os próximos passos?' },
          { label: 'Disponibilidade',            text: 'Quando vocês estariam disponíveis para começar um projeto?' },
        ]
      : [
          { label: 'Olá! Adorei o perfil 🎶',  text: 'Olá! Adoramos o seu perfil — acreditamos que você seria incrível na nossa equipe! 🎶' },
          { label: 'Que projetos fazemos',       text: 'Nossa equipe trabalha com projetos de ' + (ctx.teamId ? ((window._myTeams||[]).find(t=>t.id===ctx.teamId)?.name || 'música') : 'música') + '. Quer saber mais?' },
          { label: 'Marcar call?',               text: 'Podemos marcar uma call para te apresentar a equipe e os projetos?' },
          { label: 'Disponibilidade',            text: 'Quando você teria disponibilidade para começar a colaborar?' },
        ];

    preview.innerHTML = `
      <div class="mcp-wrap">
        <div class="mcp-hdr">
          <div class="mcp-av" onclick="matchOpenChatViewProfile()" style="cursor:pointer" title="Ver perfil">${avHtml}</div>
          <div class="mcp-info">
            <div class="mcp-name">${window.escHtml(ctx.otherProfileName)}</div>
            <div class="mcp-sub">${subLabel}</div>
          </div>
          <div class="mcp-hdr-acts">
            <button class="mcp-hdr-btn" onclick="matchOpenChatViewProfile()" title="Ver perfil">👤</button>
            ${ctx.canInvite ? `<button class="mcp-hdr-btn invite" id="mcp-invite-btn-${matchId}" onclick="matchSendInvite('${matchId}')" title="Enviar convite">📨</button>` : ''}
            ${ctx.inviteSent ? `<span style="font-family:var(--font-mono);font-size:8px;color:var(--green);padding:5px 4px">✅</span>` : ''}
          </div>
        </div>
        <div class="mcp-match-banner">💛 MATCH CONFIRMADO com ${window.escHtml(ctx.otherProfileName)}${matchDate ? ' · ' + matchDate : ''}</div>
        <div class="mcp-msgs" id="mcp-msgs-area">
          <div class="mcp-empty-msgs"><div style="font-size:28px;margin-bottom:8px">💬</div><div>NENHUMA MENSAGEM AINDA<br>Comece a conversa!</div></div>
        </div>
        <div class="mcp-quick-btns">
          ${quickMsgs.map(q => `<button class="mcp-quick-btn" onclick="matchChatPanelQuick(${JSON.stringify(q.text)})">${window.escHtml(q.label)}</button>`).join('')}
        </div>
        <div class="mcp-input-row">
          <input class="mcp-input" id="mcp-input-field" placeholder="Mensagem para ${window.escHtml(ctx.otherProfileName)}..." maxlength="500" onkeydown="if(event.key==='Enter')matchChatPanelSend()" oninput="_matchPanelChatTyping()">
          <button class="mcp-send" onclick="matchChatPanelSend()">➤</button>
        </div>
      </div>
    `;

    // Inicia listener com cópia congelada do contexto — imune a qualquer mutação global
    _matchStartPanelChatListener(Object.assign({}, window._matchPanelContext));
    _matchStartTypingListener(ctx.otherUid);

  } catch(e) {
    preview.innerHTML = `<div class="match-empty-state"><div>Erro ao abrir chat: ${window.escHtml(e.message)}</div></div>`;
  }
};

// ── Listener de mensagens ─────────────────────────────────────────────────────
// frozenCtx é uma CÓPIA do contexto no momento da abertura.
// Qualquer mutação posterior de window._matchPanelContext não afeta este listener.
function _matchStartPanelChatListener(frozenCtx) {
  if (!window.db || !frozenCtx || !frozenCtx.matchId || !frozenCtx.activeProfileId) return;

  try {
    window._matchPanelChatUnsub = window.onSnapshot(
      window.query(
        window.collection(window.db, 'matches', frozenCtx.matchId, 'messages'),
        window.orderBy('createdAt', 'asc'),
        window.limit(100)
      ),
      snap => _matchRenderPanelMessages(
        snap.docs.map(d => ({ id: d.id, ...d.data() })),
        frozenCtx.activeProfileId   // único ID usado para decidir mine/theirs
      ),
      err => console.warn('[matchPanelChat] listener error:', err.code || err.message)
    );
  } catch(e) { console.warn('[matchPanelChat] listener setup:', e); }
}

// ── Renderização de mensagens ─────────────────────────────────────────────────
// frozenActiveProfileId: capturado no closure do listener — NUNCA relido de global.
// mine = (msg.senderProfileId === frozenActiveProfileId)
//   • Se senderProfileId existe → comparação direta, fim.
//   • Se não existe (mensagem legada anterior ao P14) → tenta inferir do campo
//     fromIsTeam para retrocompat, mas ainda compara contra frozenActiveProfileId.
//   • Se não for possível inferir → trata como 'theirs' (seguro, não espelha).
function _matchRenderPanelMessages(msgs, frozenActiveProfileId) {
  const area = document.getElementById('mcp-msgs-area');
  if (!area || !frozenActiveProfileId) return;

  if (!msgs.length) {
    area.innerHTML = `<div class="mcp-empty-msgs"><div style="font-size:28px;margin-bottom:8px">💬</div><div>NENHUMA MENSAGEM AINDA<br>Comece a conversa!</div></div>`;
    return;
  }

  // teamId do contexto: necessário SOMENTE para retrocompat de mensagens legadas
  // sem senderProfileId. Lido do contexto congelado, não de global mutável.
  const ctxTeamId = (window._matchPanelContext && window._matchPanelContext.matchId === msgs[0]?.matchId)
    ? window._matchPanelContext.teamId
    : (window._matchPanelContext?.teamId || '');

  let lastDate = '';
  area.innerHTML = msgs.map(m => {
    // 1. senderProfileId canônico (P14+): comparação direta
    let authorProfileId = m.senderProfileId || '';

    // 2. Retrocompat para mensagens sem senderProfileId (legado pré-P14)
    if (!authorProfileId) {
      if (m.fromIsTeam === true) {
        // Era enviado por equipe → profileId = teamId do match
        authorProfileId = m.teamId || ctxTeamId || '';
      } else {
        // Era enviado por artista → profileId = uid Firebase do remetente
        authorProfileId = m.senderId || m.from || '';
      }
    }

    // mine: comparação contra o profileId congelado — sem exceção, sem fallback
    const mine = !!(authorProfileId && authorProfileId === frozenActiveProfileId);

    const ts = m.createdAt?.toDate ? m.createdAt.toDate() : new Date(m.createdAt || Date.now());
    const dateKey = ts.toLocaleDateString('pt-BR');
    const time    = ts.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    let sep = '';
    if (dateKey !== lastDate) {
      lastDate = dateKey;
      const today     = new Date().toLocaleDateString('pt-BR');
      const yesterday = new Date(Date.now()-86400000).toLocaleDateString('pt-BR');
      const label = dateKey === today ? 'HOJE' : dateKey === yesterday ? 'ONTEM' : dateKey;
      sep = `<div style="text-align:center;font-family:var(--font-mono);font-size:8px;color:var(--text3);letter-spacing:2px;padding:6px 0">${label}</div>`;
    }
    return `${sep}<div class="mcp-msg ${mine?'mine':'theirs'}">
      <div class="mcp-bbl">${window.escHtml ? window.escHtml(m.text||'') : (m.text||'')}</div>
      <span class="mcp-bbl-time">${time}${mine?' ✓✓':''}</span>
    </div>`;
  }).join('');

  setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
}

// ── Envio de mensagem ─────────────────────────────────────────────────────────
// TODA identidade vem de window._matchPanelContext — sem leitura de outras globais.
window.matchChatPanelSend = async function() {
  const input = document.getElementById('mcp-input-field');
  const text  = input?.value.trim();
  if (!text || !window._matchGetUser) return;

  const ctx = window._matchPanelContext;
  if (!ctx || !ctx.matchId || !ctx.activeProfileId) return;
  input.value = '';

  const me = window._matchGetUser;

  try {
    const msgData = {
      senderProfileId: ctx.activeProfileId,    // ID canônico — fonte única de verdade
      senderType:      ctx.activeProfileType,  // "artist" | "team"
      senderId:        me.uid,                 // uid Firebase (retrocompat)
      from:            me.uid,                 // retrocompat legado
      text,
      createdAt: window.serverTimestamp ? window.serverTimestamp() : new Date(),
      fromIsTeam: ctx.activeProfileType === 'team',
    };

    if (ctx.activeProfileType === 'team') {
      const team = (window._myTeams||[]).find(t => t.id === ctx.teamId);
      msgData.fromName  = team?.name  || ctx.otherProfileName || 'Equipe';
      msgData.fromPhoto = team?.photo || '';
      msgData.teamId    = ctx.teamId  || '';
    } else {
      const p = window._myTalentProfile;
      msgData.fromName  = p?.name  || me.displayName || '';
      msgData.fromPhoto = p?.photo || me.photoURL    || '';
    }

    await window.addDoc(
      window.collection(window.db, 'matches', ctx.matchId, 'messages'),
      msgData
    );
  } catch(e) { window.toast('Erro ao enviar mensagem: ' + e.message, 'error'); }
};

window.matchChatPanelQuick = function(text) {
  const input = document.getElementById('mcp-input-field');
  if (input) { input.value = text; input.focus(); }
};

// matchOpenChatViewProfile: abre o perfil do outro lado do chat.
// Não recebe parâmetros — lê tudo de _matchPanelContext (fonte única de verdade).
window.matchOpenChatViewProfile = function() {
  const ctx = window._matchPanelContext;
  if (!ctx) return;
  if (ctx.activeProfileType === 'artist') {
    // Artista vendo perfil de equipe
    if (ctx.teamId && typeof matchShowTeamPreview === 'function') {
      matchShowTeamPreview(ctx.teamId, ctx.otherProfileName, ctx.otherProfilePhoto);
    }
  } else {
    // Equipe vendo perfil do artista
    if (ctx.otherUid && typeof window.matchViewTalent === 'function') {
      window.matchViewTalent(ctx.otherUid);
    }
  }
};

// ── Cancel Match ──────────────────────────────────────────────────────────────
window.matchCancelMatch = async function(matchId, teamId, artistUid, displayName) {
  if (!window._matchGetUser) return;
  const confirmed = window.confirm
    ? window.confirm('Cancelar o match com ' + displayName + '?\nEsta ação não pode ser desfeita.')
    : true;
  if (!confirmed) return;

  try {
    // 1. v5.20.2 — Resolve o matchId real antes de deletar.
    //    Problema anterior: em modo artista o matchId era construído como
    //    'match_' + tid + '_' + myUid (hardcoded), mas nem todos os matches
    //    foram criados com esse ID determinístico (alguns usaram addDoc).
    //    Solução: tenta deletar pelo ID recebido; se o doc não existir OU der
    //    permissão negada, faz uma query por userUid para achar o doc real.
    let resolvedMatchId = matchId;
    let matchDocRef = window.doc(window.db, 'matches', matchId);

    // Verifica se o doc existe e se o usuário é o dono antes de tentar deletar
    try {
      const checkSnap = await window.getDoc(matchDocRef);
      if (!checkSnap.exists()) {
        // Doc não existe com esse ID — busca pelo userUid (modo artista)
        const qByUser = window.query(
          window.collection(window.db, 'matches'),
          window.where('userUid', '==', window._matchGetUser.uid),
          window.limit(50)
        );
        const userMatchSnap = await window.getDocs(qByUser);
        const found = userMatchSnap.docs.find(d => {
          const data = d.data();
          return (!teamId || data.teamId === teamId);
        });
        if (found) {
          resolvedMatchId = found.id;
          matchDocRef = found.ref;
        } else if (teamId) {
          // Fallback: busca pelo teamId (modo equipe)
          const qByTeam = window.query(
            window.collection(window.db, 'matches'),
            window.where('teamId', '==', teamId),
            window.limit(50)
          );
          const teamMatchSnap = await window.getDocs(qByTeam);
          const foundTeam = teamMatchSnap.docs.find(d => !artistUid || d.data().userUid === artistUid);
          if (foundTeam) {
            resolvedMatchId = foundTeam.id;
            matchDocRef = foundTeam.ref;
          }
        }
      }
    } catch(resolveErr) {
      // Se falhou ao resolver, tenta com o ID original mesmo
      console.warn('[matchCancelMatch] resolve fallback:', resolveErr.message);
    }

    // Deleta o documento de match
    await window.deleteDoc(matchDocRef);

    // 2. v5.20.1 — Limpa TODOS os docs de interesse relacionados a este par (equipe ↔ artista).
    //    Sem essa limpeza, re-enviar interesse cria novos docs com status='pending'
    //    enquanto os antigos com status='matched' persistem, causando o "stack" na tela.
    if (teamId && artistUid) {
      try {
        // Busca interests desta equipe para este artista
        const qTeam = window.query(
          window.collection(window.db, 'interests'),
          window.where('fromUserUid', '==', artistUid),
          window.limit(100)
        );
        const snapTeam = await window.getDocs(qTeam);
        const toDelete = snapTeam.docs.filter(d => {
          const data = d.data();
          return (data.toTeamId === teamId || data.fromTeamId === teamId || data.toId === teamId || data.fromId === teamId);
        });
        // Também busca interests da equipe para o artista
        const qArtist = window.query(
          window.collection(window.db, 'interests'),
          window.where('toUserUid', '==', artistUid),
          window.limit(100)
        );
        const snapArtist = await window.getDocs(qArtist);
        const toDeleteArtist = snapArtist.docs.filter(d => {
          const data = d.data();
          return (data.fromTeamId === teamId || data.fromId === teamId);
        });
        const allToDelete = [...toDelete, ...toDeleteArtist.filter(d => !toDelete.find(x => x.id === d.id))];
        await Promise.all(allToDelete.map(d => window.deleteDoc(d.ref)));
      } catch(e) { /* limpeza de interests é best-effort */ }
    }

    // 3. Atualiza caches locais conforme o modo
    if (_matchIsArtistMode) {
      if (teamId) {
        delete _matchArtistSentInterests[teamId];
        // Remove também da lista de matches do sistema de interesses
        _intMatchList = (_intMatchList || []).filter(m => m.id !== matchId);
      }
    } else {
      if (artistUid) {
        delete _matchConfirmed[artistUid];
        delete _matchLikes[artistUid];
        _intMatchList = (_intMatchList || []).filter(m => m.id !== matchId);
      }
    }

    // 4. Fecha o chat inline do match se estiver aberto para este matchId
    if (window._matchPanelContext && window._matchPanelContext.matchId === matchId) {
      window._matchPanelChatUnsub?.();
      window._matchPanelChatUnsub = null;
      window._matchPanelTypingUnsub?.();
      window._matchPanelTypingUnsub = null;
      window._matchPanelContext = null;
      const preview = document.getElementById('match-chat-preview');
      if (preview) preview.innerHTML = `<div class="match-empty-state" style="padding:60px 20px"><div style="font-size:32px;margin-bottom:10px">💬</div><div>SELECIONE UM MATCH PARA VER O CHAT</div></div>`;
    }

    window.toast('Match cancelado.');
    matchRenderSentPanel();
    matchRenderMatches();
    matchRenderInbox();
    if (_matchIsArtistMode) matchRenderMode();
  } catch(e) {
    window.toast('Erro ao cancelar match: ' + e.message, 'error');
  }
};

// ── Create match helper ───────────────────────────────────────────────────────
// opts: { teamId, teamName, teamPhoto, teamOwnerId } - permite override para modo artista
async function _matchCreateMatch(artistUid, artistName, artistPhoto, intId1, intId2, opts) {
  // No modo artista, teamId vem do interesse reverso (opts); no modo equipe usa _currentTeamId
  const resolvedTeamId = opts?.teamId || window._currentTeamId;
  if (!resolvedTeamId) {
    console.warn('[_matchCreateMatch] teamId nao definido - match abortado');
    return;
  }

  // FASE 2B — verifica limite de conexões antes de qualquer escrita
  // artistUid é sempre o "userUid" da conexão — o plano a verificar é o dele
  const _limitUserDoc = (artistUid === (window._matchGetUser?.uid)) ? currentUserData : { plan: 'free' };
  const _canConnect   = await _checkFriendLimit(_limitUserDoc, artistUid);
  if (!_canConnect) return undefined; // bloqueado — toast e modal já foram disparados

  const team = (window._myTeams||[]).find(t => t.id === resolvedTeamId);
  const teamOwner = team?.members?.find(m => m.role === 'owner');
  const matchData = {
    userUid:     artistUid,
    userName:    artistName,
    userPhoto:   artistPhoto,
    teamId:      resolvedTeamId,
    teamName:    opts?.teamName || team?.name || '',
    teamPhoto:   opts?.teamPhoto || team?.photo || '',
    teamOwnerId: opts?.teamOwnerId || teamOwner?.uid || window._matchGetUser?.uid || '',
    inviteSent: false,
    // CORREÇÃO: status explícito 'matched' para matchOpenChatInPanel verificar
    status:    'matched',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    intId1, intId2,
  };
  // ID determinístico: evita duplicatas quando o match é desfeito e refeito
  const matchId = `match_${resolvedTeamId}_${artistUid}`;
  await window.setDoc(window.doc(window.db, 'matches', matchId), matchData);
  _matchConfirmed[artistUid] = { id: matchId, ...matchData };
  // Atualiza status dos interesses
  try { await window.updateDoc(window.doc(window.db, 'interests', intId1), { status: 'matched', matchId }); } catch(e) {}
  if (intId2 && intId2 !== intId1) {
    try { await window.updateDoc(window.doc(window.db, 'interests', intId2), { status: 'matched', matchId }); } catch(e) {}
  }
  return matchId; // retorna matchId para a chamada passar para matchShowCelebration
}

// ── Celebration ───────────────────────────────────────────────────────────────
// Delega para showGlobalMatch() — overlay global independente de contexto.
// Este bloco é sobrescrito pelo patch DOMContentLoaded no script global abaixo,
// mas mantemos aqui como fallback imediato para chamadas síncronas.
window.matchShowCelebration = function(name1, photo1, name2, photo2, matchId) {
  if (typeof window.showGlobalMatch === 'function') {
    window.showGlobalMatch({ name1, photo1, name2, photo2, matchId: matchId || null });
  } else {
    // Fallback direto caso showGlobalMatch ainda não esteja disponível
    const overlay = document.getElementById('match-celebrate-overlay');
    if (!overlay) return;
    window._pendingMatchIdForCelebration = matchId || null;
    overlay.classList.add('visible');
    const avs = document.getElementById('match-cel-avatars');
    const nms = document.getElementById('match-cel-names');
    if (avs) {
      const av1 = photo1 ? `<img src="${photo1}" style="width:100%;height:100%;object-fit:cover">` : (name1[0]||'?').toUpperCase();
      const av2 = photo2 ? `<img src="${photo2}" style="width:100%;height:100%;object-fit:cover">` : (name2[0]||'?').toUpperCase();
      avs.innerHTML = `<div class="match-cel-av">${av1}</div><span class="match-cel-heart">💛</span><div class="match-cel-av team">${av2}</div>`;
    }
    if (nms) nms.textContent = (name1||'') + ' & ' + (name2||'') + ' se curtiram!';
    _matchLaunchConfetti();
  }
};

window.matchHideCelebration = function() {
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

function _matchLaunchConfetti() {
  const colors = ['#ff3c8e','#ffc83c','#3cffc8','#a855f7','#3c8eff','#ff6b35'];
  for (let i = 0; i < 60; i++) {
    setTimeout(() => {
      const el = document.createElement('div');
      el.className = 'match-confetti';
      el.style.left = Math.random() * 100 + 'vw';
      el.style.background = colors[Math.floor(Math.random() * colors.length)];
      el.style.animationDuration = (1.5 + Math.random() * 2) + 's';
      el.style.width = el.style.height = (6 + Math.random() * 6) + 'px';
      el.style.borderRadius = Math.random() > .5 ? '50%' : '2px';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 4000);
    }, i * 30);
  }
}

// ── Member talent profile (used in team popups) ───────────────────────────────
window.openMemberTalentProfile = async function(uid, triggerEl) {
  let fallbackData = {};
  if (triggerEl?.dataset?.fallback) {
    try { fallbackData = JSON.parse(triggerEl.dataset.fallback.replace(/&quot;/g, '"')); } catch(e) {}
  }
  let p = null;
  if (uid) {
    try { const snap = await window.getDoc(window.doc(window.db, 'talent_profiles', uid)); if (snap.exists()) p = { id: uid, ...snap.data() }; } catch(e) {}
  }
  if (!p && fallbackData.name) p = { id: uid, ...fallbackData };
  if (p && typeof window.openProfilePopup === 'function') {
    window.openProfilePopup(p, 'team');
  } else if (p) {
    window.toast((p.name||'Membro') + ' — ' + (p.bio||'Sem bio').substring(0,60));
  }
};

// ── Simple profile editor (fallback if UPE not available) ─────────────────────
function matchShowProfileEditor() {
  // Just reload using loadTalentsPage after saving via the interest panel system
  if (typeof window.openUnifiedProfileEdit === 'function') window.openUnifiedProfileEdit();
  else window.toast('Editor de perfil disponível em Configurações.', 'info');
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (document.getElementById('match-swipe-view')?.style.display !== 'none' && _matchMode === 'swipe') {
    if (e.key === 'ArrowLeft')  matchSwipeAction('skip');
    if (e.key === 'ArrowRight') matchSwipeAction('like');
    if (e.key === 'ArrowUp')    matchSwipeAction('superlike');
  }
  if (e.key === 'Escape') matchHideCelebration();
});

// ── Expose to window ──────────────────────────────────────────────────────────
window.loadTalentsPage         = window.loadTalentsPage;
window.matchSwitchView         = window.matchSwitchView;
window.matchSetMode            = window.matchSetMode;
window.matchFilter             = window.matchFilter;
window.matchChip               = window.matchChip;
window.matchSendInterest       = window.matchSendInterest;
window.matchSwipeAction        = window.matchSwipeAction;
window.matchInboxTab           = window.matchInboxTab;
window.matchAcceptInterest     = window.matchAcceptInterest;
window.matchDeclineInterest    = window.matchDeclineInterest;
window.matchShowTeamPreview    = window.matchShowTeamPreview;
window.matchRenderMatches      = window.matchRenderMatches;
window.matchViewTalent         = window.matchViewTalent;
window.matchOpenChat           = window.matchOpenChat;
window.matchSendInvite         = window.matchSendInvite;
window.matchShowCelebration    = window.matchShowCelebration;
window.matchHideCelebration    = window.matchHideCelebration;
window.matchOpenMyProfile      = window.matchOpenMyProfile;
window.matchArtistSendInterest = window.matchArtistSendInterest;
window.openMemberTalentProfile  = window.openMemberTalentProfile;
window.matchCancelMatch         = window.matchCancelMatch;
window.matchOpenChatInPanel     = window.matchOpenChatInPanel;
window.matchChatPanelSend       = window.matchChatPanelSend;
window.matchChatPanelQuick      = window.matchChatPanelQuick;
window.matchOpenChatViewProfile = window.matchOpenChatViewProfile;
window.matchOpenChat            = window.matchOpenChat;

/* ════════════════════════════════════════════════════════════════════════
   PATCHNOTES — FREQsys Match System
   ════════════════════════════════════════════════════════════════════════

   v5.20.3 (PATCH) — BUG FIX: Match System — Permissões & Sincronização
   ───────────────────────────────────────────────────────────────────────

   [FIX] ITEM 1 — "Erro ao cancelar match: Missing or insufficient permissions"
         Causa RAIZ: rules de matches/{matchId} (read/update/delete) e de
         matches/{matchId}/messages (read/create) usavam
           members.hasAny([{'uid': request.auth.uid}])
         mas Firestore exige igualdade EXATA de objetos — como members tem campos
         extras (role, name, photo, etc.), o hasAny sempre retornava false para
         qualquer membro da equipe, bloqueando toda operação do lado equipe.
         Fix: substituído por memberUids.hasAny([request.auth.uid]) usando o array
         flat adicionado em v5.20.1. Adicionado teamOwnerId como fallback para
         matches criados antes do campo memberUids existir.
         Adicionalmente: intCreateMatch() (sistema legado de interesses) agora
         persiste teamOwnerId no documento de match.
         Impacto: Corrige cancel, abertura de chat e envio de mensagens para
         TODOS os membros da equipe (não só o criador). Zero breaking change.

   [FIX] ITEM 2 — Preview da equipe incompleto (Aba Interesses → Preview da Equipe)
         Causa: matchShowTeamPreview() não renderizava os campos: story, stage,
         foundedYear, links (youtube/spotify/instagram/tiktok/discord/site),
         stats (views/followers), categories — presentes no formulário de edição
         mas ausentes no painel de preview.
         Fix: adicionados todos os campos faltantes ao render do panel.innerHTML,
         com renderização condicional para não mostrar seções vazias.
         Links renderizados como âncoras com cores de marca (YouTube vermelho,
         Spotify verde, Instagram rosa, Discord roxo).
         Impacto: +0 leituras Firestore (dados já vinham no fetch de team_profiles).

   [FIX] ITEM 3 — "Seus Matches" vazio apesar de existir match confirmado
         Causa: matchRenderArtistMatches() só buscava matches com userUid == auth.uid
         (perspectiva artista). Usuários que são simultaneamente membro de equipe
         E artista não viam os matches criados pelo lado equipe (teamId query).
         O match aparecia em ENCONTRAR MEMBROS mas não em PROCURAR EQUIPE.
         Fix: adicionada query secundária por teamId (se currentTeamId disponível)
         com deduplicação por id. Render atualizado para mostrar a "outra parte"
         corretamente por perspectiva (artista mostra equipe; equipe mostra artista).
         Impacto: +1 query Firestore em modo híbrido. best-effort com try/catch.

   [FIX] ITEM 4 — Chat Match "Erro ao abrir chat: Missing or insufficient permissions"
         (Interface Procurar Equipe → Aba Matches → Chat do Match)
         Causa: mesmo bug de hasAny do ITEM 1, afetando a leitura de
         matches/{matchId}/messages via onSnapshot. A regra bloqueava todo membro
         da equipe de ler mensagens do chat do Match.
         Fix: coberto pelo mesmo fix das rules descrito no ITEM 1.
         Impacto: zero — regra corrigida cobre ambos os contextos.

   [FIX] ITEM 5 — Chat Match dessincronizado (ENCONTRAR MEMBROS → Chat do Match)
         Causa (permissão): idêntica ao ITEM 4 — rules com hasAny quebrado.
         Causa (dessincronização): matchOpenChatInPanel() exibia nome/foto do
         artista a partir dos campos userName/userPhoto do documento de match,
         que podem estar desatualizados se o artista editou seu perfil após o match.
         Fix (permissão): coberto pelo fix das rules (ITEM 1).
         Fix (dessincronização): após identificar otherUid (artista), busca
         talent_profiles/{otherUid} para obter nome/foto frescos. best-effort
         com try/catch — mantém dados do match se talent_profiles inacessível.
         Impacto: +1 leitura talent_profiles por abertura de chat. Negligível.

   ────────────────────────────────────────────────────────────────────────
   v5.20.2 (PATCH) — 2025 — BUG FIX: Match System
   ─────────────────────────────────────────────────
   [FIX] ITEM 1 — "Erro ao cancelar match: Missing or insufficient permissions"
         Causa: matchCancelMatch() tentava deleteDoc com ID construído heuristicamente
         ('match_' + tid + '_' + uid) sem verificar se o doc realmente existia com
         esse ID no Firestore. Matches criados com addDoc (ID aleatório) nunca eram
         encontrados, resultando em tentativa de delete em doc inexistente/sem permissão.
         Fix: matchCancelMatch() agora verifica se o doc existe antes de deletar.
         Se não existe, faz query de fallback por userUid (artista) ou teamId (equipe)
         para encontrar o doc real e deletar pelo ref correto.
         Impacto: Zero — não quebra matches existentes. Apenas melhora a resolução.

   [FIX] ITEM 2 — Preview da equipe na aba "Interesses" incompleto
         Causa: matchShowTeamPreview() buscava apenas team_profiles (bio, vagas, tagline)
         mas não carregava membros reais, projetos publicados/ativos, gêneros ou localização.
         O documento conceitual define que o preview deve ser "o perfil completo da equipe
         sincronizado", não apenas campos básicos.
         Fix: matchShowTeamPreview() agora busca team_profiles + teams em paralelo,
         faz query nos projetos da equipe para stats reais (publicados/ativos),
         exibe grid de membros reais (máx 6 + counter), gêneros como tags, localização
         e bio com formatação melhorada.
         Impacto: +2 leituras Firestore por abertura de preview (projetos + teams).
         Totalmente seguro — todas as leituras são best-effort com try/catch.

   [FIX] ITEM 3 — Aba "Matches" em "Procurar Equipe" não mostrava matches
         Causa: matchRenderInbox() em modo artista chamava matchRenderArtistMatches()
         corretamente, mas usuários que pertencem a uma equipe E têm perfil de artista
         tinham _matchIsArtistMode = false. Isso fazia o fluxo cair em
         matchRenderTeamMatchesInbox() que busca por teamId — mas matches do papel
         de artista tem userUid preenchido, nunca aparecendo na query de equipe.
         Fix: matchRenderInbox() em modo artista sempre chama matchRenderArtistMatches()
         na aba 'matches', independente de _currentTeamId estar set ou não.
         matchRenderArtistMatches() busca por userUid — garante que todos os matches
         onde o usuário atuou como artista apareçam, sem conflito com o modo equipe.
         Bônus: adicionado botão "✕ CANCELAR" na listagem de matches do artista
         (estava ausente nessa view, presente apenas na view da equipe).
         Impacto: Nenhum — não altera estrutura de dados, apenas corrige a query.

   ────────────────────────────────────────────────────────────────────────
   v5.20.1 (PATCH) — BUG FIX: Match System (histórico)
   ─────────────────────────────────────────────────────
   [FIX] matchRenderMatches() — query de teamId bloqueada em modo artista
         (evitava "Missing permissions" por acesso a teams sem memberUids)
   [FIX] _matchCreateMatch() — ID determinístico match_${teamId}_${userUid}
         (evitava duplicatas em re-match do mesmo par)
   [FIX] matchCancelMatch() — limpeza de interests relacionados ao par após cancel
         (evitava "stack" de docs antigos com status matched)
   [FIX] matchShowCelebration() — migrado para overlay global (z-index correto)
   [FIX] teams: adicionado campo memberUids (array flat) para rules eficientes

   ────────────────────────────────────────────────────────────────────────
   v5.20.0 (MINOR) — Match System v2 + Chat do Match inline
   ─────────────────────────────────────────────────────────
   [NEW] Chat do Match usa exclusivamente matches/{matchId}/messages
   [NEW] Convite enviado no canal do Match (não no PM privado)
   [NEW] Sistema de interesses bidirecional artista ↔ equipe
   ════════════════════════════════════════════════════════════════════════ */

