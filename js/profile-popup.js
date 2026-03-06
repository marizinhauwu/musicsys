/* ═══════════════════════════════════════════════════════
   PROFILE POPUP + FULL PROFILE — Sistema unificado
   ═══════════════════════════════════════════════════════ */

// Catálogo de conquistas (base para expansão futura)
const BADGES_CATALOG = [
  { id: 'estreia', icon: '🚀', name: 'Estreia', tip: 'Primeiro projeto entregue' },
  { id: 'preciso', icon: '🎯', name: 'Preciso', tip: '10 projetos concluídos' },
  { id: 'nota5', icon: '⭐', name: 'Nota 5', tip: 'Receba uma avaliação máxima' },
  { id: 'match', icon: '💘', name: 'Match!', tip: 'Primeiro match no Hub' },
  { id: 'parceiro', icon: '🤝', name: 'Parceiro', tip: 'Membro de uma equipe por 6 meses' },
  { id: 'emchamas', icon: '🔥', name: 'Em Chamas', tip: '3 projetos ativos ao mesmo tempo' },
  { id: 'lenda', icon: '🏆', name: 'Lenda', tip: '??? (secreto)' },
  { id: 'fundador', icon: '👑', name: 'Fundador', tip: 'Criar 3 equipes' },
  { id: 'viral', icon: '🌍', name: 'Viral', tip: '??? (secreto)' },
];

// Estado atual
let _ppCurrentData = null;
let _ppCurrentContext = 'team'; // 'team' | 'match'

// ── Helpers para mapear dados do freqsys para o popup ─────────────────────────

function _ppRoleLabel(roleId) {
  if (!roleId) return '';
  // Use UPE_SKILL_ROLES if available (unified definitions)
  if (window.UPE_SKILL_ROLES) {
    const found = window.UPE_SKILL_ROLES.find(r => r.id === roleId);
    if (found) return found.icon + ' ' + found.label;
  }
  const roleMap = {
    r_vocal: '🎤 Canto', r_beat: '🎹 Instrumental', r_mix: '🎚️ Mix',
    r_master: '🎛️ Master', r_letra: '✍️ Letra', r_edit: '🎬 Edição',
    r_ilus: '🖼️ Ilustração', r_thumb: '🎨 Thumbnail', r_ideal: '💡 Direção',
    r_capa: '💿 Capas', r_leg: '💬 Legendas', r_social: '📲 Social Media',
  };
  if (typeof roleMap[roleId] !== 'undefined') return roleMap[roleId];
  return roleId;
}

function _ppRoleIcon(roleId) {
  if (window.UPE_SKILL_ROLES) {
    const found = window.UPE_SKILL_ROLES.find(r => r.id === roleId);
    if (found) return found.icon;
  }
  const icons = { r_vocal: '🎤', r_beat: '🎹', r_mix: '🎚️', r_master: '🎛️', r_letra: '✍️', r_edit: '🎬', r_ilus: '🖼️', r_thumb: '🎨', r_ideal: '💡', r_capa: '💿', r_leg: '💬' };
  return icons[roleId] || '';
}

// ── Abrir popup ───────────────────────────────────────────────────────────────

/**
 * Abre o mini popup de perfil
 * @param {Object} data - dados do perfil
 * @param {string} context - 'team' ou 'match'
 */
window.openProfilePopup = function (data, context, event) {
  _ppCurrentData = data;
  _ppCurrentContext = context || 'team';

  const card = document.getElementById('pp-card');
  const name = data.name || data.displayName || 'Sem nome';
  const photo = data.photo || data.photoURL || '';
  const bio = data.bio || '';
  const roles = data.roles || Object.keys(data.skills || {});
  const avail = data.availability || 'open';
  const status = data.status || 'online';

  // Banner
  const bannerColors = [
    'linear-gradient(135deg, #2a0f3a 0%, #0f1a2e 50%, #1a0f1e 100%)',
    'linear-gradient(135deg, #0f2a1a 0%, #1a1030 60%, #0f2020 100%)',
    'linear-gradient(135deg, #1a0830 0%, #0a1030 60%, #200a20 100%)',
    'linear-gradient(135deg, #1a1a08 0%, #0a1020 50%, #0f150a 100%)',
  ];
  const colorIdx = name.charCodeAt(0) % bannerColors.length;
  const bannerBgEl = document.getElementById('pp-banner-bg');
  if (data.bannerURL) {
    bannerBgEl.style.background = 'none';
    bannerBgEl.style.backgroundImage = 'url(' + data.bannerURL + ')';
    bannerBgEl.style.backgroundSize = 'cover';
    bannerBgEl.style.backgroundPosition = 'center';
  } else {
    bannerBgEl.style.backgroundImage = '';
    bannerBgEl.style.background = data.bannerBg || bannerColors[colorIdx];
  }

  // Role badge no banner
  const roleEl = document.getElementById('pp-banner-role');
  const mainRole = roles[0];
  if (mainRole) {
    roleEl.textContent = _ppRoleLabel(mainRole).replace(/^[^\s]+ /, '').toUpperCase();
    roleEl.style.display = '';
  } else { roleEl.style.display = 'none'; }

  // Avatar
  const avEl = document.getElementById('pp-avatar');
  const avInner = document.getElementById('pp-avatar-inner');
  if (photo) {
    avInner.innerHTML = `<img src="${photo}" class="u-avatar-img">`;
    avEl.style.background = 'none';
  } else {
    avInner.innerHTML = `<span style="font-size:22px;font-weight:800;color:#fff">${name[0].toUpperCase()}</span>`;
    avEl.style.background = data.avBg || 'linear-gradient(135deg, var(--a1), var(--a2))';
  }

  // Status dot
  const dot = document.getElementById('pp-status-dot');
  dot.className = 'pp-status-dot';
  if (avail === 'busy') dot.classList.add('busy');
  else if (status === 'offline') dot.classList.add('offline');

  // Name/handle
  // ETAPA 5.2: inline chip ao lado do nome no popup de perfil (usando função unificada)
  // Se é o próprio usuário logado, usar currentUserData (contém planOverride)
  const _ppPlanSource = (typeof currentUserData !== 'undefined' && currentUserData && data.uid && data.uid === currentUserData.uid) ? currentUserData : data;
  const _ppPlanInfo = typeof getEffectivePlanForUser === 'function' ? getEffectivePlanForUser(_ppPlanSource) : { plan: data.plan || 'free' };
  const _ppChip = typeof renderPlanChip === 'function' ? renderPlanChip(_ppPlanInfo, 'inline') : '';
  const _ppRoleChip = typeof renderRoleChip === 'function' ? renderRoleChip(_ppPlanSource.staffRole) : '';
  const ppNameEl = document.getElementById('pp-name');
  if (ppNameEl) ppNameEl.innerHTML = (name ? name.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '—') + (_ppRoleChip ? ' ' + _ppRoleChip : '') + (_ppChip ? ' ' + _ppChip : '');
  const handle = data.handle || data.email || (data.uid ? '@' + name.toLowerCase().replace(/\s/g, '') : '');
  document.getElementById('pp-handle').textContent = handle;

  // Activity status (se tiver)
  const actEl = document.getElementById('pp-activity');
  if (data.activityText) {
    document.getElementById('pp-act-icon').textContent = data.activityIcon || '🎵';
    document.getElementById('pp-act-txt').innerHTML = data.activityText;
    actEl.style.display = '';
  } else { actEl.style.display = 'none'; }

  // Skills
  const skillsEl = document.getElementById('pp-skills');
  skillsEl.innerHTML = roles.slice(0, 4).map(r => {
    const lbl = _ppRoleLabel(r);
    return `<span class="pp-skill">${lbl}</span>`;
  }).join('') || '<span style="font-family:var(--font-mono);font-size:9px;color:var(--text3)">Sem habilidades</span>';

  // Context section
  const ctxEl = document.getElementById('pp-context-section');
  if (_ppCurrentContext === 'team' && (data.teamRole || data.joinedAt)) {
    const roleLabel = { owner: '👑 Dono', admin: '⭐ Admin', member: '👤 Membro' };
    ctxEl.innerHTML = `
      <div class="pp-hr"></div>
      <div class="pp-context-label">NA EQUIPE</div>
      ${data.teamRole ? `<div class="pp-context-item"><span class="pp-context-item-icon">🏷️</span>${roleLabel[data.teamRole] || data.teamRole}</div>` : ''}
      ${data.joinedAt ? `<div class="pp-context-item"><span class="pp-context-item-icon">📅</span>Entrou em ${new Date(data.joinedAt).toLocaleDateString('pt-BR')}</div>` : ''}
      ${data.linkedCollab ? `<div class="pp-context-item"><span class="pp-context-item-icon">🔗</span>${data.linkedCollab}</div>` : ''}
    `;
  } else if (_ppCurrentContext === 'match' && bio) {
    ctxEl.innerHTML = `
      <div class="pp-hr"></div>
      <div style="font-size:11px;color:var(--text2);line-height:1.6;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${bio}</div>
    `;
  } else { ctxEl.innerHTML = ''; }

  // Stats
  const statsEl = document.getElementById('pp-stats');
  const stats = data.stats || [];
  if (stats.length) {
    statsEl.innerHTML = stats.map(s => `<div class="pp-stat"><div class="pp-stat-val">${s.v}</div><div class="pp-stat-lbl">${s.l}</div></div>`).join('');
    statsEl.style.display = '';
  } else { statsEl.style.display = 'none'; }

  // Admin edit button (team context only, admin/owner)
  const editBtn = document.getElementById('pp-admin-edit-btn');
  if (_ppCurrentContext === 'team' && data.collabId && typeof canAdmin === 'function' && canAdmin()) {
    editBtn.style.display = '';
    editBtn.onclick = () => { ppClose(); if (typeof editCollab === 'function') editCollab(data.collabId); };
  } else { editBtn.style.display = 'none'; }

  // Match hub invite button
  const inviteBtn = document.getElementById('pp-invite-btn');
  if (_ppCurrentContext === 'match' && data.uid) {
    const alreadyLiked = window._hubTeamLikes && window._hubTeamLikes[data.uid];
    inviteBtn.style.display = '';
    inviteBtn.textContent = alreadyLiked ? '✅ INTERESSE ENVIADO' : '+ DEMONSTRAR INTERESSE';
    inviteBtn.style.opacity = alreadyLiked ? '0.7' : '1';
    inviteBtn.style.border = alreadyLiked ? '1px solid var(--green)' : '';
    inviteBtn.style.background = alreadyLiked ? 'rgba(114,239,221,0.1)' : '';
    inviteBtn.style.color = alreadyLiked ? 'var(--green)' : '';
    inviteBtn.onclick = async () => {
      if (alreadyLiked) {
        // Cancela interesse
        await window.cancelInterestToArtist(data.uid, data.name);
        inviteBtn.textContent = '+ DEMONSTRAR INTERESSE';
        inviteBtn.style.opacity = '1';
        inviteBtn.style.border = '';
        inviteBtn.style.background = '';
        inviteBtn.style.color = '';
        if (window._hubTeamLikes) delete window._hubTeamLikes[data.uid];
      } else {
        // Envia interesse
        if (typeof sendInterestToArtist === 'function') {
          await sendInterestToArtist(data.uid, data.name, data.photo || data.photoURL || '');
        } else if (typeof hubLikeTalent === 'function') {
          hubLikeTalent(data.uid, data.name, data.id || data.uid);
        }
        inviteBtn.textContent = '✅ INTERESSE ENVIADO';
        inviteBtn.style.opacity = '0.7';
        inviteBtn.style.border = '1px solid var(--green)';
        inviteBtn.style.background = 'rgba(114,239,221,0.1)';
        inviteBtn.style.color = 'var(--green)';
        if (window._hubTeamLikes) window._hubTeamLikes[data.uid] = true;
      }
    };
  } else { inviteBtn.style.display = 'none'; }

  // Expand button
  document.getElementById('pp-expand-btn').onclick = () => { ppClose(); openFullProfile(_ppCurrentData, _ppCurrentContext); };

  // ── Icon buttons ──
  const chatBtn = document.getElementById('pp-btn-chat');
  const invDirBtn = document.getElementById('pp-btn-direct-invite');

  // Chat: visible when there's a uid and it's not self
  if (data.uid && data.uid !== currentUser?.uid && chatBtn) {
    chatBtn.style.display = '';
    chatBtn.onclick = (e) => { e.stopPropagation(); ppClose(); window.openMessageModal(data.uid, data.name); };
  } else if (chatBtn) { chatBtn.style.display = 'none'; }

  // Direct invite (🔗): visible only to team owners, when viewing someone with a uid
  const amOwnerSomewhere = (window._myTeams || []).some(t => t.members?.find(m => m.uid === (window._appCurrentUser?.uid || currentUser?.uid))?.role === 'owner');
  if (data.uid && data.uid !== currentUser?.uid && amOwnerSomewhere && invDirBtn) {
    invDirBtn.style.display = '';
    invDirBtn.onclick = (e) => { e.stopPropagation(); ppOpenInviteModal(data); };
  } else if (invDirBtn) { invDirBtn.style.display = 'none'; }

  // ── Talent stats (async) ──
  const talentStatsEl = document.getElementById('pp-talent-stats');
  if (talentStatsEl) talentStatsEl.style.display = 'none';
  if (data.uid) {
    ppLoadTalentStats(data.uid, data.availability);
  }

  // Position near the click event
  // (card já declarado no início da função)
  if (event && card) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardW = 360;
    const cardH = 520; // estimated
    let x = event.clientX + 12;
    let y = event.clientY + 12;
    // Prevent overflow right
    if (x + cardW > vw - 12) x = event.clientX - cardW - 12;
    // Prevent overflow bottom
    if (y + cardH > vh - 12) y = vh - cardH - 12;
    // Prevent overflow top
    if (y < 60) y = 60;
    // Prevent overflow left
    if (x < 12) x = 12;
    card.style.left = x + 'px';
    card.style.top = y + 'px';
    card.style.transform = '';
  } else if (card) {
    // Fallback: centered
    card.style.left = '50%';
    card.style.top = '50%';
    card.style.transform = 'translate(-50%, -50%)';
  }

  // Show
  document.getElementById('pp-overlay').classList.add('open');
};

// ── Carregar stats de talento (equipes, projetos, reputação) ─────────────────
window.ppLoadTalentStats = async function (uid, availabilityField) {
  const el = document.getElementById('pp-talent-stats');
  const row = document.getElementById('pp-talent-stats-row');
  const strip = document.getElementById('pp-avail-strip');
  if (!el || !row) return;

  try {
    // Equipes
    const teamsSnap = await getDocs(collection(db, 'teams'));
    const allTeams = teamsSnap.docs.filter(d => (d.data().members || []).some(m => m.uid === uid));
    // Respeitar teamsVisible do talent_profile
    let _tvMap2 = null;
    try {
      const _tvDoc2 = await getDoc(doc(db, 'talent_profiles', uid));
      if (_tvDoc2.exists()) _tvMap2 = _tvDoc2.data().teamsVisible || null;
    } catch (e) { }
    const userTeams = _tvMap2 ? allTeams.filter(d => _tvMap2[d.id] !== false) : allTeams;
    const teamCount = userTeams.length;

    // Projetos — soma em todas as equipes do usuário
    // Projects link by collabId (collab doc ID), not uid directly
    // So we need to find linkedCollabId for this user in each team
    let projectCount = 0;
    for (const td of userTeams) {
      try {
        // Find collabId linked to this uid in this team
        const tData = td.data();
        const member = (tData.members || []).find(m => m.uid === uid);
        const linkedCollabId = member?.linkedCollabId || null;

        const pSnap = await getDocs(collection(db, 'teams', td.id, 'projects'));
        const myProjects = pSnap.docs.filter(d => {
          const p = d.data();
          return (p.collaborators || []).some(c =>
            (linkedCollabId && c.collabId === linkedCollabId) ||
            c.uid === uid || c.collabId === uid
          ) || p.createdBy === uid;
        });
        projectCount += myProjects.length;
      } catch (e) { /* equipe sem projetos */ }
    }

    // Reputação
    let repScore = null;
    let repCount = 0;
    try {
      const ratSnap = await getDocs(collection(db, 'talent_ratings'));
      const myRatings = ratSnap.docs.filter(d => d.data().targetUid === uid);
      if (myRatings.length) {
        repCount = myRatings.length;
        const avg = myRatings.reduce((s, d) => s + (d.data().score || 0), 0) / repCount;
        repScore = avg.toFixed(1);
      }
    } catch (e) { }

    const repDisplay = repScore ? `${repScore} ★` : '—';

    row.innerHTML = `
      <div class="pp-stat"><div class="pp-stat-val">${teamCount}</div><div class="pp-stat-lbl">Equipes</div></div>
      <div class="pp-stat"><div class="pp-stat-val">${projectCount}</div><div class="pp-stat-lbl">Projetos</div></div>
      <div class="pp-stat"><div class="pp-stat-val" style="color:var(--a3)">${repDisplay}</div><div class="pp-stat-lbl">Reputação${repCount ? ' (' + repCount + ')' : ''}</div></div>
    `;

    // Disponibilidade strip
    if (strip) {
      const avail = availabilityField || 'open';
      const _avLabel = (a) => ({
        available: '✅ Disponível para colaborar', open: '✅ Disponível para colaborar',
        part_time: '🟡 Parcialmente disponível',
        busy: '🔶 Ocupado no momento',
        hidden: '🔒 Não disponível'
      }[a] || '🔒 Não disponível');
      const _avOpen = (a) => ['available', 'open', 'part_time'].includes(a);
      strip.style.display = '';
      strip.style.background = _avOpen(avail) ? 'rgba(114,239,221,0.1)' : avail === 'busy' ? 'rgba(255,200,60,0.08)' : 'rgba(255,255,255,0.04)';
      strip.style.border = '1px solid ' + (_avOpen(avail) ? 'rgba(114,239,221,0.3)' : avail === 'busy' ? 'rgba(255,200,60,0.25)' : 'rgba(255,255,255,0.1)');
      strip.style.color = _avOpen(avail) ? 'var(--green)' : avail === 'busy' ? 'var(--a3)' : 'var(--text3)';
      strip.textContent = _avLabel(avail);
    }

    el.style.display = '';
  } catch (e) {
    console.warn('ppLoadTalentStats error:', e);
  }
};

// ── Modal: convidar para equipe ───────────────────────────────────────────────
let _ppInviteTarget = null;

window.ppOpenInviteModal = function (data) {
  _ppInviteTarget = data;
  const nameEl = document.getElementById('pp-invite-target-name');
  if (nameEl) nameEl.textContent = 'Convidar: ' + (data.name || 'Usuário');

  // List owner's teams
  const listEl = document.getElementById('pp-invite-teams-list');
  if (!listEl) return;

  const ownerTeams = (window._myTeams || []).filter(t =>
    t.members?.find(m => m.uid === (window._appCurrentUser?.uid || currentUser?.uid))?.role === 'owner'
  );

  if (!ownerTeams.length) {
    listEl.innerHTML = `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);text-align:center;padding:20px">Você não é dono de nenhuma equipe.</div>`;
  } else {
    listEl.innerHTML = ownerTeams.map(t => {
      const avatarInner = t.photo
        ? `<img src="${t.photo}" class="u-avatar-img">`
        : `<span style="font-weight:800;font-size:14px;color:#fff">${(t.name || '?')[0].toUpperCase()}</span>`;
      const memberCount = t.members?.length || 0;
      return `<div onclick="ppSendDirectInvite('${t.id}')"
        style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--card);border:1px solid var(--border);border-radius:10px;cursor:pointer;transition:all .2s"
        onmouseover="this.style.borderColor='var(--a2)';this.style.transform='translateY(-1px)'"
        onmouseout="this.style.borderColor='var(--border)';this.style.transform=''">
        <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--a1),var(--a2));display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">${avatarInner}</div>
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--font-body);font-weight:700;font-size:14px">${escHtml(t.name || 'Equipe')}</div>
          <div class="u-mono-label2">${memberCount} membro${memberCount !== 1 ? 's' : ''}</div>
        </div>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--a2)">Convidar →</div>
      </div>`;
    }).join('');
  }

  ppClose();
  openModal('modal-pp-invite-team');
};

window.ppSendDirectInvite = async function (teamId) {
  if (!_ppInviteTarget?.uid) return;
  const team = (window._myTeams || []).find(t => t.id === teamId);
  if (!team) return;

  try {
    // Check already member
    if ((team.members || []).some(m => m.uid === _ppInviteTarget.uid)) {
      toast(`${_ppInviteTarget.name} já é membro desta equipe.`, 'error'); return;
    }
    // Save invite to Firestore
    await setDoc(doc(db, 'talent_invites', `${teamId}_${_ppInviteTarget.uid}`), {
      teamId,
      teamName: team.name || '',
      fromUid: currentUser.uid,
      fromName: currentUserData?.name || currentUser.displayName || 'Dono',
      targetUid: _ppInviteTarget.uid,
      targetName: _ppInviteTarget.name || '',
      inviteCode: team.inviteCode || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    closeModal('modal-pp-invite-team');
    toast(`✅ Convite enviado para ${_ppInviteTarget.name}!`);
  } catch (e) { toast('Erro ao enviar convite: ' + e.message, 'error'); }
};

// ── Reputação: estrelas ───────────────────────────────────────────────────────
let _ppRateTarget = null;
let _ppRateScore = 0;

window.ppOpenRateModal = function (data) {
  _ppRateTarget = data;
  _ppRateScore = 0;
  ppSetStar(0);
  const nameEl = document.getElementById('pp-rate-target-name');
  if (nameEl) nameEl.textContent = 'Avaliando: ' + (data.name || 'Usuário');
  const commentEl = document.getElementById('pp-rate-comment');
  if (commentEl) commentEl.value = '';
  openModal('modal-pp-rate');
};

window.ppSetStar = function (val) {
  _ppRateScore = val;
  document.querySelectorAll('.pp-star').forEach(s => {
    const sv = parseInt(s.getAttribute('data-v'));
    s.style.opacity = sv <= val ? '1' : '0.25';
    s.style.color = sv <= val ? 'var(--a3)' : 'var(--text3)';
  });
};

window.ppSubmitRating = async function () {
  if (!_ppRateTarget?.uid || !_ppRateScore) { toast('Selecione uma nota!', 'error'); return; }
  const comment = document.getElementById('pp-rate-comment')?.value.trim() || '';
  try {
    const ratingId = `${_ppRateTarget.uid}_${currentUser.uid}`;
    await setDoc(doc(db, 'talent_ratings', ratingId), {
      targetUid: _ppRateTarget.uid,
      targetName: _ppRateTarget.name || '',
      raterUid: currentUser.uid,
      raterName: currentUserData?.name || '',
      score: _ppRateScore,
      comment,
      teamId: _currentTeamId || '',
      createdAt: new Date().toISOString(),
    });
    toast('⭐ Avaliação enviada!');
    closeModal('modal-pp-rate');
    // Refresh stats if popup still showing
    if (_ppCurrentData?.uid === _ppRateTarget.uid) {
      ppLoadTalentStats(_ppRateTarget.uid, _ppCurrentData.availability);
    }
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

window.ppClose = function () {
  document.getElementById('pp-overlay').classList.remove('open');
};

// ── Abrir Perfil Completo ─────────────────────────────────────────────────────

window.openFullProfile = function (data, context) {
  if (!data) return;
  _ppCurrentData = data;
  _ppCurrentContext = context || 'team';

  const name = data.name || data.displayName || 'Sem nome';
  const photo = data.photo || data.photoURL || '';
  const bio = data.bio || '';
  const roles = data.roles || Object.keys(data.skills || {});
  const avail = data.availability || 'open';

  // Banner
  const bannerColors = [
    'linear-gradient(135deg, #2a0f3a 0%, #0f1a2e 50%, #1a0f1e 100%)',
    'linear-gradient(135deg, #0f2a1a 0%, #1a1030 60%, #0f2020 100%)',
    'linear-gradient(135deg, #1a0830 0%, #0a1030 60%, #200a20 100%)',
  ];
  const colorIdx = name.charCodeAt(0) % bannerColors.length;
  const fpBannerBgEl = document.getElementById('fp-banner-bg');
  if (data.bannerURL) {
    fpBannerBgEl.style.background = 'none';
    fpBannerBgEl.style.backgroundImage = 'url(' + data.bannerURL + ')';
    fpBannerBgEl.style.backgroundSize = 'cover';
    fpBannerBgEl.style.backgroundPosition = 'center';
  } else {
    fpBannerBgEl.style.backgroundImage = '';
    fpBannerBgEl.style.background = data.bannerBg || bannerColors[colorIdx];
  }
  document.getElementById('fp-banner-mesh').style.background = data.bannerMesh || '';

  // Presence indicator (bolinha de status Discord-style)
  const presenceStatus = data.presenceStatus || 'offline';
  const fpPresenceDot = document.getElementById('fp-presence-dot');
  if (fpPresenceDot) {
    fpPresenceDot.className = 'user-status status-' + presenceStatus;
  }

  // Banner pills (sem pill de disponibilidade — agora usa bolinha)
  const pillsEl = document.getElementById('fp-banner-pills');
  const pills = [];
  if (data.location) pills.push({ l: '📍 ' + data.location });
  pillsEl.innerHTML = pills.map(p => `<span class="fp-banner-pill-new" style="${p.c ? `color:${p.c};border-color:${p.b}` : ''}">${p.l}</span>`).join('');

  // Avatar
  const avWrap = document.getElementById('fp-avatar-new');
  const avInner = document.getElementById('fp-av-inner');
  if (photo) {
    avInner.innerHTML = `<img src="${photo}" class="u-avatar-img">`;
    avWrap.style.background = 'none';
  } else {
    avInner.innerHTML = `<span style="font-size:30px;font-weight:800;color:#fff">${name[0].toUpperCase()}</span>`;
    avWrap.style.background = data.avBg || 'linear-gradient(135deg, var(--a1), var(--a2))';
  }
  document.getElementById('fp-av-ring').style.background = data.avRing || 'linear-gradient(135deg, var(--a1), var(--a3))';

  // Identity — PATCH 5.4B (Sistema Centralizado)
  // Resolve plano do usuário consultando o engine globalmente. Se não logado/invisível fallback usa obj base.
  // Se é o próprio usuário logado, usar currentUserData (contém planOverride — corrige bug ADVANCED)
  const _fpPlanSource = (typeof currentUserData !== 'undefined' && currentUserData && data.uid && data.uid === currentUserData.uid) ? currentUserData : data;
  const _fpPlanInfo = typeof getEffectivePlanForUser === 'function' ? getEffectivePlanForUser(_fpPlanSource) : { plan: data.plan || 'free' };
  const fpNameEl = document.getElementById('fp-name-new');
  if (fpNameEl) {
    // Nome via textContent (seguro — sem innerHTML no nome)
    fpNameEl.textContent = name || '—';
    fpNameEl.querySelectorAll('.plan-chip, .role-chip').forEach(el => el.remove());
    // Insere chip inline ao lado do nome (apenas PRO e ADVANCED — free retorna '')
    if (typeof renderPlanChip === 'function') {
      const _fpRoleHtml = typeof renderRoleChip === 'function' ? renderRoleChip(_fpPlanSource.staffRole) : '';
      const _fpChipHtml = renderPlanChip(_fpPlanInfo, 'inline');
      fpNameEl.insertAdjacentHTML('beforeend', (_fpRoleHtml ? ' ' + _fpRoleHtml : '') + (_fpChipHtml ? ' ' + _fpChipHtml : ''));
    }
  }
  // Pill removida — chip inline ao lado do nome já é suficiente (evita duplicação visual)
  const fpPillEl = document.getElementById('fp-plan-pill-new');
  if (fpPillEl) fpPillEl.innerHTML = '';
  const handle = data.handle || data.email || '';
  document.getElementById('fp-handle-new').textContent = handle;
  document.getElementById('fp-roles-new').innerHTML = (roles.slice(0, 4).map(r => {
    const lbl = _ppRoleLabel(r);
    return `<span class="fp-role-badge-new" style="background:var(--input-bg);border:1px solid var(--border);color:var(--text2)">${lbl}</span>`;
  }).join('') || '<span style="font-family:var(--font-mono);font-size:9px;color:var(--text3)">Sem habilidades</span>');

  // ── Actions: Menu de 3 pontos + Amizade (regras de exibição) ────
  const actionsEl = document.getElementById('fp-actions-new');
  const isOwnProfile = data.uid && data.uid === currentUser?.uid;
  const amOwner = (window._myTeams || []).some(t => t.members?.find(m => m.uid === (window._appCurrentUser?.uid || currentUser?.uid))?.role === 'owner');

  if (isOwnProfile) {
    // ── Perfil próprio: botão Editar Perfil ──
    actionsEl.innerHTML = `<div class="fp-actions-row">
      <button class="fp-edit-profile-btn" onclick="fpClose();openUnifiedProfileEdit()">✏ Editar Perfil</button>
    </div>`;
  } else if (data.uid) {
    // ── Perfil de outro: botão amizade + menu ⋯ ──
    let friendBtnHtml = '';
    let isFriendNow = false;
    // Check friendship (sync first, fallback async)
    if (window.SocialBridge && typeof window.SocialBridge.isFriend === 'function') {
      isFriendNow = window.SocialBridge.isFriend(data.uid);
    }
    if (!isFriendNow) {
      friendBtnHtml = `<button class="fp-friend-btn" id="fp-friend-btn" onclick="fpAddFriend('${data.uid}','${escHtml((data.name || '').replace(/'/g, "\\'"))}')">+ Adicionar amigo</button>`;
    } else {
      friendBtnHtml = `<button class="fp-friend-btn is-friend" id="fp-friend-btn">✓ Amigos</button>`;
    }

    // Build dots menu items
    let menuItems = '';
    menuItems += `<button class="fp-dots-menu-item" onclick="fpClose();openMessageModal('${data.uid}','${escHtml((data.name || '').replace(/'/g, "\\'"))}')">💬 Mensagem</button>`;
    if (amOwner) {
      menuItems += `<button class="fp-dots-menu-item" onclick="ppOpenInviteModal(_ppCurrentData)">🔗 Convidar para Equipe</button>`;
      menuItems += `<button class="fp-dots-menu-item" onclick="ppOpenRateModal(_ppCurrentData)">⭐ Avaliar</button>`;
    }
    if (isFriendNow) {
      menuItems += `<div class="fp-dots-menu-sep"></div>`;
      menuItems += `<button class="fp-dots-menu-item danger" onclick="fpRemoveFriend('${data.uid}')">💔 Desfazer amizade</button>`;
    }
    if (_ppCurrentContext === 'team' && data.collabId && typeof canAdmin === 'function' && canAdmin()) {
      menuItems += `<div class="fp-dots-menu-sep"></div>`;
      menuItems += `<button class="fp-dots-menu-item" onclick="fpClose();editCollab('${data.collabId}')">✏️ Editar membro</button>`;
    }

    actionsEl.innerHTML = `<div class="fp-actions-row">
      ${friendBtnHtml}
      <button class="fp-dots-btn" onclick="fpToggleDotsMenu(event)" title="Mais opções">⋯</button>
      <div class="fp-dots-menu" id="fp-dots-menu">${menuItems}</div>
    </div>`;

    // Async friendship check update (in case cache wasn't ready)
    if (window.SocialBridge && typeof window.SocialBridge.isFriendAsync === 'function') {
      window.SocialBridge.isFriendAsync(data.uid).then(isFriend => {
        const btn = document.getElementById('fp-friend-btn');
        if (!btn) return;
        if (isFriend && !btn.classList.contains('is-friend')) {
          btn.className = 'fp-friend-btn is-friend';
          btn.textContent = '✓ Amigos';
          btn.onclick = null;
          // Add "Desfazer amizade" to menu if not already there
          const menu = document.getElementById('fp-dots-menu');
          if (menu && !menu.querySelector('.danger')) {
            menu.insertAdjacentHTML('beforeend', `<div class="fp-dots-menu-sep"></div><button class="fp-dots-menu-item danger" onclick="fpRemoveFriend('${data.uid}')">💔 Desfazer amizade</button>`);
          }
        }
      }).catch(() => { });
    }
  } else {
    actionsEl.innerHTML = '<div style="font-size:11px;color:var(--text3)">—</div>';
  }

  // Stats
  const statsGrid = document.getElementById('fp-stats-new');
  const stats = data.fullStats || data.stats || [];
  if (stats.length) {
    statsGrid.innerHTML = stats.map(s => `<div class="fp-stat-box-new"><div class="fp-stat-val-new">${s.v}</div><div class="fp-stat-lbl-new">${s.l}</div></div>`).join('');
  } else {
    statsGrid.innerHTML = `<div class="fp-stat-box-new"><div class="fp-stat-val-new">—</div><div class="fp-stat-lbl-new">Projetos</div></div>`;
  }

  // Load real-time talent stats async (overwrites above when ready)
  if (data.uid) {
    (async () => {
      try {
        const teamsSnap = await getDocs(collection(db, 'teams'));
        const allUserTeams = teamsSnap.docs.filter(d => (d.data().members || []).some(m => m.uid === data.uid));
        // Respeitar teamsVisible
        let _tvMap = null;
        try {
          const _tvDoc = await getDoc(doc(db, 'talent_profiles', data.uid));
          if (_tvDoc.exists()) _tvMap = _tvDoc.data().teamsVisible || null;
        } catch (e) { }
        const userTeams = _tvMap
          ? allUserTeams.filter(d => _tvMap[d.id] !== false)
          : allUserTeams;
        let projectCount = 0;
        for (const td of userTeams) {
          try {
            const tData2 = td.data();
            const member2 = (tData2.members || []).find(m => m.uid === data.uid);
            const linkedCId = member2?.linkedCollabId || null;
            const pSnap = await getDocs(collection(db, 'teams', td.id, 'projects'));
            projectCount += pSnap.docs.filter(d => {
              const p = d.data();
              return (p.collaborators || []).some(c =>
                (linkedCId && c.collabId === linkedCId) ||
                c.uid === data.uid || c.collabId === data.uid
              ) || p.createdBy === data.uid;
            }).length;
          } catch (e) { }
        }
        const ratSnap = await getDocs(collection(db, 'talent_ratings'));
        const myRatings = ratSnap.docs.filter(d => d.data().targetUid === data.uid);
        const repScore = myRatings.length
          ? (myRatings.reduce((s, d) => s + (d.data().score || 0), 0) / myRatings.length).toFixed(1)
          : null;

        statsGrid.innerHTML = [
          { v: userTeams.length, l: 'Equipes' },
          { v: projectCount, l: 'Projetos' },
          { v: repScore ? repScore + ' ★' : '—', l: 'Reputação' + (myRatings.length ? ' (' + myRatings.length + ')' : '') },
        ].map(s => `<div class="fp-stat-box-new"><div class="fp-stat-val-new" style="color:var(--a3)">${s.v}</div><div class="fp-stat-lbl-new">${s.l}</div></div>`).join('');

        // Availability strip in fp panel
        const avail = data.availability || 'open';
        const avMap = { available: '✅ Disponível para colaborar', open: '✅ Disponível para colaborar', part_time: '🟡 Parcialmente disponível', busy: '🔶 Ocupado no momento', hidden: '🔒 Não disponível' };
        const avEl = document.getElementById('fp-avail-new');
        const avTxt = document.getElementById('fp-avail-txt');
        if (avEl && avTxt) {
          avTxt.textContent = avMap[avail] || avMap.hidden;
          avEl.style.display = 'flex';
        }
      } catch (e) { }
    })();
  }

  // ── Skill bars — FIX: sempre carrega do Firestore com UID do DONO do perfil ──
  const skillsEl = document.getElementById('fp-skills-new');
  // Mostra placeholder enquanto carrega
  skillsEl.innerHTML = '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3)">Carregando habilidades...</div>';
  if (data.uid) {
    (async () => {
      try {
        // CRITICAL FIX: usar data.uid (dono do perfil) e NÃO currentUser.uid
        const tpSnap = await getDoc(doc(db, 'talent_profiles', data.uid));
        let profileSkills = null;
        let profileRoles = roles;
        if (tpSnap.exists()) {
          const tpData = tpSnap.data();
          profileSkills = tpData.skillBars || tpData.skills || null;
          if (tpData.roles && tpData.roles.length) profileRoles = tpData.roles;
          else if (tpData.skills && typeof tpData.skills === 'object' && !Array.isArray(tpData.skills)) {
            profileRoles = Object.keys(tpData.skills);
          }
        }
        // Renderiza skill bars
        if (profileSkills && Array.isArray(profileSkills) && profileSkills.length) {
          skillsEl.innerHTML = profileSkills.map(s => `
            <div class="fp-skill-row-new">
              <div class="fp-skill-name-new">${s.n || s.name || ''}</div>
              <div class="fp-skill-bar-bg-new"><div class="fp-skill-bar-new" style="width:${s.w || s.level || 50}%"></div></div>
              <div class="fp-skill-lvl-new">${s.l || s.label || ''}</div>
            </div>`).join('');
        } else if (profileSkills && typeof profileSkills === 'object' && !Array.isArray(profileSkills)) {
          // Object format { skillName: level }
          const entries = Object.entries(profileSkills);
          if (entries.length) {
            const lvlMap = { beginner: 30, intermediate: 55, advanced: 75, expert: 95 };
            const lvlLabel = { beginner: 'Iniciante', intermediate: 'Médio', advanced: 'Avançado', expert: 'Expert' };
            skillsEl.innerHTML = entries.slice(0, 8).map(([sk, lv]) => {
              const pct = typeof lv === 'number' ? lv : (lvlMap[lv] || 50);
              const label = typeof lv === 'string' ? (lvlLabel[lv] || lv) : '';
              return `<div class="fp-skill-row-new">
                <div class="fp-skill-name-new">${_ppRoleLabel(sk).replace(/^[^\s]+ /, '')}</div>
                <div class="fp-skill-bar-bg-new"><div class="fp-skill-bar-new" style="width:${pct}%"></div></div>
                <div class="fp-skill-lvl-new">${label}</div>
              </div>`;
            }).join('');
          } else {
            skillsEl.innerHTML = '<div class="fp-empty-state">Sem habilidades cadastradas</div>';
          }
        } else if (profileRoles.length) {
          skillsEl.innerHTML = profileRoles.slice(0, 5).map(r => {
            const lbl = _ppRoleLabel(r).replace(/^[^\s]+ /, '');
            return `<div class="fp-skill-row-new">
              <div class="fp-skill-name-new">${lbl}</div>
              <div class="fp-skill-bar-bg-new"><div class="fp-skill-bar-new" style="width:65%"></div></div>
              <div class="fp-skill-lvl-new">Médio</div>
            </div>`;
          }).join('');
        } else {
          skillsEl.innerHTML = '<div class="fp-empty-state">Sem habilidades cadastradas</div>';
        }
      } catch (e) {
        console.warn('[Profile] Skills load error:', e);
        skillsEl.innerHTML = '<div class="fp-empty-state">Sem habilidades cadastradas</div>';
      }
    })();
  } else {
    skillsEl.innerHTML = '<div class="fp-empty-state">Sem habilidades cadastradas</div>';
  }

  // Equipes — carregadas do Firestore em tempo real, com sync do team_profiles
  const teamsCard = document.getElementById('fp-teams-card');
  const teamsEl = document.getElementById('fp-teams-new');
  if (teamsCard) teamsCard.style.display = 'none';
  if (data.uid && teamsEl && window.getDocs && window.collection && window.db) {
    teamsEl.innerHTML = `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3)">Carregando...</div>`;
    if (teamsCard) teamsCard.style.display = '';
    (async () => {
      try {
        // Load teams and team_profiles in parallel for full sync
        const [tSnap, tpSnap] = await Promise.all([
          window.getDocs(window.collection(window.db, 'teams')),
          window.getDocs(window.collection(window.db, 'team_profiles')).catch(() => ({ docs: [] }))
        ]);
        // Build a map of teamId → team_profile data
        const tpMap = {};
        tpSnap.docs.forEach(d => { tpMap[d.id] = d.data(); });

        const uTeams = tSnap.docs
          .filter(d => (d.data().members || []).some(m => m.uid === data.uid))
          .map(d => ({ id: d.id, ...d.data() }));
        if (!uTeams.length) { if (teamsCard) teamsCard.style.display = 'none'; return; }

        // ── Respeitar teamsVisible do talent_profile ─────────────────────
        // Busca o talent_profile do usuário para ler teamsVisible
        let teamsVisible = null;
        try {
          const tpDoc = await window.getDoc(window.doc(window.db, 'talent_profiles', data.uid));
          if (tpDoc.exists()) teamsVisible = tpDoc.data().teamsVisible || null;
        } catch (e) { }
        // Filtra: se teamsVisible existe, só mostra equipes com value !== false
        const visibleTeams = teamsVisible
          ? uTeams.filter(t => teamsVisible[t.id] !== false)
          : uTeams;
        if (!visibleTeams.length) { if (teamsCard) teamsCard.style.display = 'none'; return; }
        // ─────────────────────────────────────────────────────────────────
        const roleLabel = { owner: '\u{1F451} Dono', admin: '\u2B50 Admin', member: '\u{1F465} Membro' };
        teamsEl.innerHTML = visibleTeams.map(t => {
          const mem = (t.members || []).find(m => m.uid === data.uid);
          const role = roleLabel[mem?.role] || '\u{1F465} Membro';
          // Prefer team_profiles photo, then teams photo, then initial
          const tp = tpMap[t.id] || {};
          const photo = tp.photo || tp.logo || t.photo || '';
          const avL = (tp.name || t.name || '?')[0].toUpperCase();
          const displayName = tp.name || t.name || 'Equipe';
          const tagline = tp.tagline || t.description || '';
          const avBg = tp.color || 'linear-gradient(135deg,var(--a1),var(--a2))';
          const avHtml = photo
            ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`
            : `<span style="font-weight:800;font-size:14px;color:#fff">${avL}</span>`;
          // Store merged team data in global cache for popup use
          const _mergedTeam = { ...t, ...tp, id: t.id };
          if (!window._fpTeamCache) window._fpTeamCache = {};
          window._fpTeamCache[t.id] = _mergedTeam;
          return `<div class="fp-team-new" style="cursor:pointer"
            onclick="fpOpenTeamPopup('${t.id}')"
            onmouseover="this.style.background='rgba(255,255,255,0.05)'"
            onmouseout="this.style.background=''">
            <div class="fp-team-av-new" style="background:${avBg};overflow:hidden;border-radius:8px">${avHtml}</div>
            <div style="flex:1;min-width:0">
              <div class="fp-team-name-new">${escHtml(displayName)}</div>
              <div class="fp-team-role-new">${role} &middot; ${t.members?.length || 0} membros${tagline ? ' · ' + escHtml(tagline.substring(0, 28)) : ''}</div>
            </div>
            <span style="color:var(--text3);font-size:16px">&#8250;</span>
          </div>`;
        }).join('');
        if (teamsCard) teamsCard.style.display = '';
      } catch (e) { if (teamsCard) teamsCard.style.display = 'none'; }
    })();
  }

  // Links
  const linksCard = document.getElementById('fp-links-card');
  const linksEl = document.getElementById('fp-links-new');
  const links = data.links || [];
  if (links.length) {
    linksEl.innerHTML = links.map(l => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:8px;cursor:pointer;margin-bottom:6px;transition:all .15s"
        onmouseover="this.style.borderColor='var(--border2)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.06)'">
        <span style="font-size:14px;width:20px;text-align:center">${l.i}</span>
        <span style="font-family:var(--font-mono);font-size:10px;color:var(--text2)">${l.l}</span>
      </div>`).join('');
    linksCard.style.display = '';
  } else { linksCard.style.display = 'none'; }

  // Availability
  const availEl = document.getElementById('fp-avail-new');
  const availTxt = document.getElementById('fp-avail-txt');
  const _avLabelFp = (a) => ({ available: '✅ Disponível para colaborar', open: '✅ Disponível para colaborar', part_time: '🟡 Parcialmente disponível', busy: '🔶 Ocupado no momento' }[a]);
  const _avLabelVal = data.availText || _avLabelFp(avail);
  if (_avLabelVal && availEl && availTxt) { availTxt.textContent = _avLabelVal; availEl.style.display = ''; }
  else if (availEl) { availEl.style.display = 'none'; }

  // Bio
  document.getElementById('fp-bio-new').innerHTML = bio
    ? bio.replace(/\n\n/g, '<br><br>')
    : '<span style="color:var(--text3);font-family:var(--font-mono);font-size:9px">Nenhuma bio cadastrada.</span>';

  // Badges preview (earned only, max 5)
  const earned = data.badges?.earned || [];
  const locked = data.badges?.locked || [];
  const previewEl = document.getElementById('fp-badges-preview');
  if (earned.length) {
    previewEl.innerHTML = earned.slice(0, 5).map(b => `
      <div class="fp-badge-new" data-tip="${b.tip || ''}">
        <div class="fp-badge-icon-new">${b.i}</div>
        <div class="fp-badge-name-new">${b.n}</div>
        ${b.when ? `<div class="fp-badge-when-new">${b.when}</div>` : ''}
      </div>`).join('');
    document.getElementById('fp-badges-preview-card').style.display = '';
  } else {
    document.getElementById('fp-badges-preview-card').style.display = 'none';
  }

  // ── Feed de Lançamentos (substitui atividade recente) ──────────
  const launchesFeed = document.getElementById('fp-launches-feed');
  const launchAddArea = document.getElementById('fp-launch-add-area');
  if (launchesFeed) {
    launchesFeed.innerHTML = '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3)">Carregando lançamentos...</div>';
    fpLoadLaunches(data.uid);
  }
  // Botão de adicionar lançamento — apenas para o dono do perfil
  if (launchAddArea) {
    if (isOwnProfile) {
      launchAddArea.innerHTML = `<div class="fp-launch-add-btn" onclick="openModal('modal-fp-launch')">+ Novo Lançamento</div>`;
    } else {
      launchAddArea.innerHTML = '';
    }
  }

  // Portfolio tab
  const portfolioEl = document.getElementById('fp-portfolio-new');
  const portfolio = data.portfolio || [];
  if (portfolioEl) portfolioEl.innerHTML = portfolio.map(f => `
    <div class="fp-portfolio-item-new" style="background:${f.bg || 'rgba(255,255,255,0.02)'}">
      <div style="font-size:22px">${f.i}</div>
      <div style="font-family:var(--font-mono);font-size:8px;color:var(--text3);letter-spacing:1px;text-align:center;padding:0 8px">${f.n}</div>
    </div>`).join('');

  // Reputation tab
  const repScore = document.getElementById('fp-rep-score');
  const reviewsEl = document.getElementById('fp-reviews-new');
  const repEmpty = document.getElementById('fp-rep-empty');
  const reviews = data.reviews || [];
  if (data.repScore) repScore.textContent = data.repScore + ' ★★★★★';
  else repScore.textContent = '';
  reviewsEl.innerHTML = reviews.map(r => `
    <div class="fp-review-new" style="border-left-color:${r.bc || 'var(--a3)'}">
      <div class="fp-review-header-new">
        <div class="fp-review-av-new" style="background:${r.bg || 'linear-gradient(135deg,var(--a1),var(--a2))'}">${r.e || '👤'}</div>
        <div><div class="fp-review-author-new">${r.n}</div><div class="fp-review-role-new">${r.r}</div></div>
        <div class="fp-review-stars-new">${r.stars || '⭐⭐⭐⭐⭐'}</div>
      </div>
      <div class="fp-review-text-new">${r.t}</div>
    </div>`).join('');
  repEmpty.style.display = reviews.length ? 'none' : '';

  // Badges tab
  document.getElementById('fp-badges-earned-new').innerHTML = earned.length
    ? earned.map(b => `
        <div class="fp-badge-new" data-tip="${b.tip || ''}">
          <div class="fp-badge-icon-new">${b.i}</div>
          <div class="fp-badge-name-new">${b.n}</div>
          ${b.when ? `<div class="fp-badge-when-new">${b.when}</div>` : ''}
        </div>`).join('')
    : '<div class="fp-empty-state"><div class="fp-empty-state-icon">🚀</div>Nenhuma conquista ainda.</div>';

  document.getElementById('fp-badges-locked-new').innerHTML = locked.length
    ? locked.map(b => `
        <div class="fp-badge-new locked-badge" data-tip="${b.tip || ''}">
          <div class="fp-badge-icon-new">${b.i}</div>
          <div class="fp-badge-name-new">${b.n}</div>
        </div>`).join('')
    : '';

  // Activity timeline
  const activity = data.activity || [];
  document.getElementById('fp-activity-timeline-new').innerHTML = activity.length
    ? activity.map(a => `
        <div class="fp-activity-item-new">
          <div class="fp-activity-icon-new">${a.i}</div>
          <div class="u-flex1">${a.t}</div>
          <div class="fp-activity-time-new">${a.when}</div>
        </div>`).join('')
    : '<div class="fp-empty-state"><div class="fp-empty-state-icon">📭</div>Nenhuma atividade registrada.</div>';

  // Reset to first tab
  fpSetTab('overview', document.querySelector('.fp-tab-btn'));

  // Open
  document.getElementById('fp-overlay-new').classList.add('open');
  document.getElementById('fp-panel-new').scrollTop = 0;
};

window.fpClose = function () {
  document.getElementById('fp-overlay-new').classList.remove('open');
  // Close dots menu if open
  const menu = document.getElementById('fp-dots-menu');
  if (menu) menu.classList.remove('open');
};

// ── Toggle dots menu (⋯) ────────────────────────────────────────────────────
window.fpToggleDotsMenu = function (e) {
  e.stopPropagation();
  const menu = document.getElementById('fp-dots-menu');
  if (menu) menu.classList.toggle('open');
};

// Close dots menu on outside click
document.addEventListener('click', function (e) {
  const menu = document.getElementById('fp-dots-menu');
  if (menu && menu.classList.contains('open')) {
    if (!e.target.closest('.fp-dots-btn') && !e.target.closest('.fp-dots-menu')) {
      menu.classList.remove('open');
    }
  }
});

// ── Add Friend ──────────────────────────────────────────────────────────────
window.fpAddFriend = async function (uid, name) {
  const btn = document.getElementById('fp-friend-btn');
  if (!btn) return;
  try {
    btn.className = 'fp-friend-btn pending';
    btn.textContent = '⏳ Enviando...';
    if (window.FriendsAPI && typeof window.FriendsAPI.sendFriendRequest === 'function') {
      await window.FriendsAPI.sendFriendRequest(uid);
      btn.textContent = '✓ Pedido enviado';
      if (typeof toast === 'function') toast('📨 Pedido de amizade enviado!');
    } else {
      throw new Error('FriendsAPI não disponível');
    }
  } catch (e) {
    btn.className = 'fp-friend-btn';
    btn.innerHTML = '+ Adicionar amigo';
    if (typeof toast === 'function') toast('Erro: ' + e.message, 'error');
  }
};

// ── Remove Friend ───────────────────────────────────────────────────────────
window.fpRemoveFriend = async function (uid) {
  if (!confirm('Deseja realmente desfazer a amizade?')) return;
  try {
    // Remove friendship documents from Firestore (bidirectional)
    const curr = (window._appCurrentUser || window.currentUser)?.uid;
    if (!curr) return;
    const friendDocId1 = `${curr}_${uid}`;
    const friendDocId2 = `${uid}_${curr}`;
    try { await deleteDoc(doc(db, 'friendships', friendDocId1)); } catch (e) { }
    try { await deleteDoc(doc(db, 'friendships', friendDocId2)); } catch (e) { }
    // Refresh SocialBridge cache
    if (window.SocialBridge && typeof window.SocialBridge.refreshFriendsCache === 'function') {
      window.SocialBridge.refreshFriendsCache();
    }
    // Update UI
    const btn = document.getElementById('fp-friend-btn');
    if (btn) {
      btn.className = 'fp-friend-btn';
      btn.innerHTML = '+ Adicionar amigo';
      btn.onclick = function () { fpAddFriend(uid); };
    }
    // Remove "Desfazer amizade" from menu
    const menu = document.getElementById('fp-dots-menu');
    if (menu) {
      const dangerItem = menu.querySelector('.danger');
      if (dangerItem) {
        const sep = dangerItem.previousElementSibling;
        if (sep && sep.classList.contains('fp-dots-menu-sep')) sep.remove();
        dangerItem.remove();
      }
    }
    if (typeof toast === 'function') toast('Amizade desfeita.');
  } catch (e) {
    if (typeof toast === 'function') toast('Erro ao desfazer amizade: ' + e.message, 'error');
  }
};

// ── Load Launches Feed ──────────────────────────────────────────────────────
window.fpLoadLaunches = async function (uid) {
  const feedEl = document.getElementById('fp-launches-feed');
  if (!feedEl || !uid) return;
  try {
    const q = window.query(
      collection(db, 'profile_launches'),
      window.where('userId', '==', uid),
      window.orderBy('createdAt', 'desc'),
      window.limit(10)
    );
    const snap = await getDocs(q);
    if (!snap.docs.length) {
      feedEl.innerHTML = '<div class="fp-empty-state"><div class="fp-empty-state-icon">🎧</div>Nenhum lançamento ainda.</div>';
      return;
    }
    feedEl.innerHTML = snap.docs.map(d => {
      const l = d.data();
      const date = l.createdAt ? new Date(l.createdAt).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      return `<div class="fp-launch-card">
        <div class="fp-launch-title">🎧 ${escHtml(l.title || 'Sem título')}</div>
        ${l.description ? `<div class="fp-launch-desc">${escHtml(l.description)}</div>` : ''}
        ${l.link ? `<a class="fp-launch-link" href="${escHtml(l.link)}" target="_blank" rel="noopener">▶ Ouvir agora</a>` : ''}
        ${date ? `<div class="fp-launch-date">${date}</div>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    console.warn('[Profile] Launches load error:', e);
    feedEl.innerHTML = '<div class="fp-empty-state"><div class="fp-empty-state-icon">🎧</div>Nenhum lançamento ainda.</div>';
  }
};

// ── Submit New Launch ───────────────────────────────────────────────────────
window.fpSubmitLaunch = async function () {
  const title = document.getElementById('fp-launch-title')?.value.trim();
  const link = document.getElementById('fp-launch-link')?.value.trim();
  const desc = document.getElementById('fp-launch-desc')?.value.trim();
  if (!title) { if (typeof toast === 'function') toast('Preencha o título!', 'error'); return; }
  const curr = (window._appCurrentUser || window.currentUser);
  if (!curr?.uid) { if (typeof toast === 'function') toast('Você precisa estar logado.', 'error'); return; }
  try {
    await addDoc(collection(db, 'profile_launches'), {
      userId: curr.uid,
      title,
      link: link || '',
      description: desc || '',
      createdAt: new Date().toISOString(),
    });
    // Clear form
    if (document.getElementById('fp-launch-title')) document.getElementById('fp-launch-title').value = '';
    if (document.getElementById('fp-launch-link')) document.getElementById('fp-launch-link').value = '';
    if (document.getElementById('fp-launch-desc')) document.getElementById('fp-launch-desc').value = '';
    closeModal('modal-fp-launch');
    if (typeof toast === 'function') toast('🎧 Lançamento publicado!');
    // Refresh feed
    fpLoadLaunches(curr.uid);
  } catch (e) {
    if (typeof toast === 'function') toast('Erro: ' + e.message, 'error');
  }
};

// ── Presence selector (edit profile) ────────────────────────────────────────
window.upeSetPresence = function (status) {
  document.querySelectorAll('.upe-presence-opt').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-status') === status);
  });
  window._upePresenceStatus = status;
};

// ── Abre popup de equipe a partir do perfil completo ─────────────────────────
window.fpOpenTeamPopup = function (teamId) {
  fpClose(); // fecha o perfil completo
  const cached = window._fpTeamCache && window._fpTeamCache[teamId];
  if (cached) { if (typeof openTpbPopup === 'function') openTpbPopup(cached); return; }
  const fromAdb = window._adbAllTeams && window._adbAllTeams.find(t => t.id === teamId);
  if (fromAdb) { if (typeof openTpbPopup === 'function') openTpbPopup(fromAdb); return; }
  if (window.getDoc && window.doc && window.db) {
    Promise.all([
      window.getDoc(window.doc(window.db, 'teams', teamId)).catch(() => null),
      window.getDoc(window.doc(window.db, 'team_profiles', teamId)).catch(() => null)
    ]).then(([tSnap, tpSnap]) => {
      const base = (tSnap && tSnap.exists()) ? { id: teamId, ...tSnap.data() } : { id: teamId };
      const prof = (tpSnap && tpSnap.exists()) ? tpSnap.data() : {};
      if (typeof openTpbPopup === 'function') openTpbPopup({ ...base, ...prof, id: teamId });
    });
  }
};

window.fpSetTab = function (name, btn) {
  document.querySelectorAll('.fp-tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.fp-tab-btn').forEach(b => b.classList.remove('active'));
  const pane = document.getElementById('fp-pane-' + name);
  if (pane) pane.classList.add('active');
  if (btn) btn.classList.add('active');
};

// ESC fecha os dois overlays
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    ppClose();
    fpClose();
  }
});

// Click fora do card fecha o popup (sem blur de fundo)
document.addEventListener('click', e => {
  const overlay = document.getElementById('pp-overlay');
  if (!overlay || !overlay.classList.contains('open')) return;
  const card = document.getElementById('pp-card');
  if (card && !card.contains(e.target)) {
    ppClose();
  }
}, true);


// ════════════════════════════════════════════════════════════════════════════
// INTEREST / MATCH SYSTEM
// Coleções Firestore:
//   interests/{id}  → { fromUid, fromType('user'|'team'), fromId, fromName, fromPhoto,
//                        toType('user'|'team'), toId, toName, toPhoto,
//                        status('pending'|'matched'), createdAt, read }
//   matches/{id}    → { userUid, teamId, chatId, inviteSent, createdAt }
// ════════════════════════════════════════════════════════════════════════════

let _intCurrentTab = 'received';
let _intUnsubReceived = null;
let _intReceivedList = [];
let _intSentList = [];
let _intMatchList = [];

// ── Abrir / fechar painel ────────────────────────────────────────────────────
// openInterestPanel redirecionado para o novo sistema de Match (overlay antigo desativado)
window.openInterestPanel = function () {
  // Redireciona para o sistema de match correto baseado no contexto
  if (window._currentTeamId && !window._talentStandaloneForceArtistMode) {
    if (typeof window.openTeamProfileHub === 'function') { window.openTeamProfileHub(); return; }
  }
  if (typeof window.showTalentsStandalone === 'function') { window.showTalentsStandalone(); }
};

window.closeInterestPanel = function () {
  document.getElementById('interest-overlay')?.classList.remove('open');
};

window.switchInterestTab = function (tab, btn) {
  _intCurrentTab = tab;
  document.querySelectorAll('.interest-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  intRenderTab(tab);
};

// ── Carrega tudo de uma vez ──────────────────────────────────────────────────
async function intLoadAll() {
  if (!currentUser) return;
  try {
    // Coleta todos os IDs de equipes do usuário (dono ou membro)
    const allMyTeamIds = (window._myTeams || []).map(t => t.id).filter(Boolean);

    // Interesses RECEBIDOS — busca por toId (Interest Panel) E por toUserUid (Match System)
    try {
      const receivedIds = [currentUser.uid, ...allMyTeamIds];
      let allReceived = [];

      // Padrão canônico: toId
      for (let i = 0; i < receivedIds.length; i += 10) {
        const batch = receivedIds.slice(i, i + 10);
        try {
          const rQ = query(collection(db, 'interests'), where('toId', 'in', batch),
            orderBy('createdAt', 'desc'), limit(50));
          const rSnap = await getDocs(rQ);
          allReceived = allReceived.concat(rSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.warn('[Interest] received batch (toId) error:', e.message); }
      }

      // Complementar: toUserUid (Match System artist-side) — apenas para o próprio usuário
      try {
        const rQ2 = query(collection(db, 'interests'),
          where('toUserUid', '==', currentUser.uid),
          orderBy('createdAt', 'desc'), limit(50));
        const rSnap2 = await getDocs(rQ2);
        allReceived = allReceived.concat(rSnap2.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { /* pode falhar sem índice — ignorar */ }

      // Complementar: toTeamId (Match System team-side) — para cada equipe
      for (const teamId of allMyTeamIds.slice(0, 5)) {
        try {
          const rQ3 = query(collection(db, 'interests'),
            where('toTeamId', '==', teamId),
            orderBy('createdAt', 'desc'), limit(30));
          const rSnap3 = await getDocs(rQ3);
          allReceived = allReceived.concat(rSnap3.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { }
      }

      // Deduplica por id
      const seen = new Set();
      _intReceivedList = allReceived.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
    } catch (e) { console.warn('[Interest] received query error:', e.message); }

    // Interesses ENVIADOS — busca por fromId (canônico) E fromUserUid / fromTeamId (Match System)
    try {
      const sentIds = [currentUser.uid, ...allMyTeamIds];
      let allSent = [];

      // Padrão canônico: fromId
      for (let i = 0; i < sentIds.length; i += 10) {
        const batch = sentIds.slice(i, i + 10);
        try {
          const sQ = query(collection(db, 'interests'), where('fromId', 'in', batch),
            orderBy('createdAt', 'desc'), limit(50));
          const sSnap = await getDocs(sQ);
          allSent = allSent.concat(sSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { }
      }

      // Complementar: fromUserUid (Match System)
      try {
        const sQ2 = query(collection(db, 'interests'),
          where('fromUserUid', '==', currentUser.uid),
          orderBy('createdAt', 'desc'), limit(50));
        const sSnap2 = await getDocs(sQ2);
        allSent = allSent.concat(sSnap2.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) { }

      // Complementar: fromTeamId (Match System)
      for (const teamId of allMyTeamIds.slice(0, 5)) {
        try {
          const sQ3 = query(collection(db, 'interests'),
            where('fromTeamId', '==', teamId),
            orderBy('createdAt', 'desc'), limit(30));
          const sSnap3 = await getDocs(sQ3);
          allSent = allSent.concat(sSnap3.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { }
      }

      const seen2 = new Set();
      _intSentList = allSent.filter(i => { if (seen2.has(i.id)) return false; seen2.add(i.id); return true; });
    } catch (e) { console.warn('[Interest] sent query error:', e.message); }

    // Normaliza campos dos interesses para exibição consistente (ambos os formatos)
    const _normInt = (i) => ({
      ...i,
      fromId: i.fromId || i.fromUserUid || i.fromTeamId || '',
      fromType: i.fromType || (i.type === 'artist_to_team' ? 'user' : i.type === 'team_to_artist' ? 'team' : ''),
      fromName: i.fromName || i.fromUserName || i.fromTeamName || '',
      fromPhoto: i.fromPhoto || i.fromUserPhoto || i.fromTeamPhoto || '',
      toId: i.toId || i.toUserUid || i.toTeamId || '',
      toType: i.toType || (i.type === 'artist_to_team' ? 'team' : i.type === 'team_to_artist' ? 'user' : ''),
      toName: i.toName || i.toUserName || i.toTeamName || '',
      toPhoto: i.toPhoto || i.toUserPhoto || i.toTeamPhoto || '',
    });
    _intReceivedList = _intReceivedList.map(_normInt);
    _intSentList = _intSentList.map(_normInt);

    // MATCHES — consulta a coleção 'matches' diretamente
    try {
      const matchList = [];
      // Matches onde o usuário é o artista
      try {
        const mQ = query(collection(db, 'matches'), where('userUid', '==', currentUser.uid), limit(30));
        const mSnap = await getDocs(mQ);
        mSnap.docs.forEach(d => matchList.push({ id: d.id, ...d.data() }));
      } catch (e) { console.warn('[Interest] matches userUid query error:', e.message); }
      // Matches onde a equipe pertence ao usuário
      for (const teamId of allMyTeamIds.slice(0, 5)) {
        try {
          const tmQ = query(collection(db, 'matches'), where('teamId', '==', teamId), limit(20));
          const tmSnap = await getDocs(tmQ);
          tmSnap.docs.forEach(d => {
            if (!matchList.find(m => m.id === d.id)) matchList.push({ id: d.id, ...d.data() });
          });
        } catch (e) { }
      }
      // Enrich matches with team names if missing
      for (const m of matchList) {
        if (!m.teamName && m.teamId) {
          const cachedTeam = (window._myTeams || []).find(t => t.id === m.teamId);
          if (cachedTeam) { m.teamName = cachedTeam.name; m.teamPhoto = cachedTeam.photo || ''; }
        }
      }
      _intMatchList = matchList;
    } catch (e) { console.warn('[Interest] matches query error:', e.message); }

    intUpdateBadges();
    intRenderTab(_intCurrentTab);
  } catch (e) {
    console.warn('[Interest] loadAll error:', e);
    document.getElementById('interest-body').innerHTML =
      `<div style="text-align:center;padding:40px;font-family:var(--font-mono);font-size:11px;color:var(--text3)">Erro ao carregar. Tente novamente.</div>`;
  }
}

// ── IDs que me representam (meu uid + equipes que sou dono/admin) ────────────
function _intMyIds() {
  const ids = [currentUser.uid];
  if (_currentTeamId) ids.push(_currentTeamId);
  return [...new Set(ids)].slice(0, 10); // Firestore 'in' limit = 10
}

// ── Atualiza badges sidebar + abas ──────────────────────────────────────────
function intUpdateBadges() {
  const unreadReceived = _intReceivedList.filter(i => !i.read && i.toId !== currentUser.uid).length
    + _intReceivedList.filter(i => !i.read && i.toId === _currentTeamId).length;
  const newMatches = _intMatchList.filter(i => !i.seenAt).length;
  const total = unreadReceived + newMatches;

  // Sidebar badge (main + teams-screen)
  const sb = document.getElementById('interest-sidebar-badge');
  if (sb) { sb.textContent = total > 0 ? total : ''; sb.classList.toggle('show', total > 0); }
  const tsb = document.getElementById('ts-interest-badge');
  if (tsb) { tsb.textContent = total > 0 ? total : ''; tsb.classList.toggle('show', total > 0); }

  // Aba badges
  const rb = document.getElementById('int-itab-received-badge');
  if (rb) { rb.textContent = unreadReceived; rb.style.display = unreadReceived > 0 ? 'inline-flex' : 'none'; }
  const mb = document.getElementById('int-itab-matches-badge');
  if (mb) { mb.textContent = newMatches; mb.style.display = newMatches > 0 ? 'inline-flex' : 'none'; }
}

// ── Renderiza aba ────────────────────────────────────────────────────────────
function intRenderTab(tab) {
  const body = document.getElementById('interest-body');
  if (!body) return;
  if (tab === 'received') intRenderReceived(body);
  else if (tab === 'sent') intRenderSent(body);
  else intRenderMatches(body);
}

function intAvatarHtml(name, photo, isTeam) {
  const cls = isTeam ? 'int-card-av team' : 'int-card-av';
  if (photo) return `<div class="${cls}"><img src="${escHtml(photo)}" style="width:100%;height:100%;object-fit:cover"></div>`;
  return `<div class="${cls}">${(name || '?')[0].toUpperCase()}</div>`;
}

function intRenderReceived(body) {
  if (!_intReceivedList.length) {
    body.innerHTML = `<div style="text-align:center;padding:48px 20px">
      <div style="font-size:32px;margin-bottom:12px">💛</div>
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);letter-spacing:2px">NENHUM INTERESSE RECEBIDO</div>
      <div style="font-size:12px;color:var(--text3);margin-top:8px">Quando alguém demonstrar interesse em você ou sua equipe, aparece aqui.</div>
    </div>`; return;
  }
  body.innerHTML = _intReceivedList.map(i => {
    const isTeam = i.fromType === 'team';
    const alreadyMatch = i.status === 'matched';
    return `<div class="int-card" data-int-id="${i.id}">
      ${intAvatarHtml(i.fromName, i.fromPhoto, isTeam)}
      <div class="int-card-info">
        <div class="int-card-name">${escHtml(i.fromName || '?')}</div>
        <div class="int-card-sub">${isTeam ? '🏷️ Equipe' : '🎤 Artista'} · ${intRelTime(i.createdAt)}</div>
      </div>
      <div class="int-card-actions">
        ${alreadyMatch
        ? `<button class="btn btn-ghost btn-sm" onclick="intOpenMatchChat('${i.id}')" style="font-size:10px;border-color:var(--green);color:var(--green)">💬 CHAT</button>`
        : `<button class="btn btn-primary btn-sm" onclick="intReturnInterest('${i.id}')" style="font-size:10px">💛 RETRIBUIR</button>`
      }
        <button class="btn btn-ghost btn-sm" onclick="intRemoveInterest('${i.id}','received')" style="font-size:10px;color:var(--text3)" title="Remover">✕</button>
      </div>
    </div>`;
  }).join('');
  // Marca como lido
  _intReceivedList.filter(i => !i.read).forEach(async i => {
    try { await updateDoc(doc(db, 'interests', i.id), { read: true }); } catch (e) { }
  });
}

function intRenderSent(body) {
  if (!_intSentList.length) {
    body.innerHTML = `<div style="text-align:center;padding:48px 20px">
      <div style="font-size:32px;margin-bottom:12px">📤</div>
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);letter-spacing:2px">NENHUM INTERESSE ENVIADO</div>
      <div style="font-size:12px;color:var(--text3);margin-top:8px">Demonstre interesse em artistas ou equipes para aparecer aqui.</div>
    </div>`; return;
  }
  body.innerHTML = _intSentList.map(i => {
    const isTeam = i.toType === 'team';
    const matched = i.status === 'matched';
    return `<div class="int-card" data-int-id="${i.id}">
      ${intAvatarHtml(i.toName, i.toPhoto, isTeam)}
      <div class="int-card-info">
        <div class="int-card-name">${escHtml(i.toName || '?')}</div>
        <div class="int-card-sub">${isTeam ? '🏷️ Equipe' : '🎤 Artista'} · ${intRelTime(i.createdAt)}</div>
      </div>
      <div class="int-card-actions">
        ${matched
        ? `<span style="font-family:var(--font-mono);font-size:9px;color:var(--green);letter-spacing:1px">✅ MATCH</span>`
        : `<span style="font-family:var(--font-mono);font-size:9px;color:var(--text3);letter-spacing:1px">⏳ AGUARDANDO</span>`
      }
        <button class="btn btn-ghost btn-sm" onclick="intRemoveInterest('${i.id}','sent')" style="font-size:10px;color:var(--text3)" title="Cancelar interesse">✕</button>
      </div>
    </div>`;
  }).join('');
}

function intRenderMatches(body) {
  if (!_intMatchList.length) {
    body.innerHTML = `<div style="text-align:center;padding:48px 20px">
      <div style="font-size:32px;margin-bottom:12px">💘</div>
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);letter-spacing:2px">NENHUM MATCH AINDA</div>
      <div style="font-size:12px;color:var(--text3);margin-top:8px">Quando ambos demonstrarem interesse, vira match e libera o chat.</div>
    </div>`; return;
  }
  body.innerHTML = _intMatchList.map(m => {
    const isTeamMatch = !!m.teamId && m.userUid === currentUser.uid;
    const otherName = m.teamName || m.talentName || '?';
    const otherPhoto = m.teamPhoto || m.talentPhoto || '';
    const isTeam = !!m.teamId;
    return `<div class="int-card" style="border-color:rgba(255,60,180,0.25)">
      ${intAvatarHtml(otherName, otherPhoto, isTeam)}
      <div class="int-card-info">
        <div class="int-card-name">${escHtml(otherName)}</div>
        <div class="int-card-sub" style="color:var(--a1)">💘 Match · ${intRelTime(m.createdAt)}</div>
      </div>
      <div class="int-card-actions">
        <button class="btn btn-primary btn-sm" onclick="intOpenMatchChat('${m.id}')" style="font-size:10px">💬 ABRIR CHAT</button>
      </div>
    </div>`;
  }).join('');
  // Marca matches como vistos
  _intMatchList.filter(m => !m.seenAt).forEach(async m => {
    try { await updateDoc(doc(db, 'matches', m.id), { seenAt: new Date().toISOString() }); } catch (e) { }
  });
}

// ── Enviar interesse: USUÁRIO → EQUIPE ───────────────────────────────────────
window.sendInterestToTeam = async function (teamId, teamName, teamPhoto) {
  if (!currentUser || !teamId) return;
  const myName = currentUserData?.name || currentUser.email || 'Artista';
  const myPhoto = currentUserData?.photoURL || '';

  // Evita duplicata — checa pelos dois padrões de campo (fromId E fromUserUid)
  const existingQ = query(collection(db, 'interests'),
    where('fromId', '==', currentUser.uid),
    where('toId', '==', teamId), limit(1));
  try {
    const existing = await getDocs(existingQ);
    if (!existing.empty) { toast('Você já demonstrou interesse nessa equipe!'); return; }
  } catch (e) { }

  try {
    // ── CORREÇÃO: salvar campos DUAIS para compatibilidade com ambos os sistemas ──
    // Sistema Interest Panel usa: fromId / toId / fromType / toType
    // Match System usa:           fromUserUid / toTeamId / type
    // Ambos os sistemas buscam o reverso com campos diferentes — o doc precisa ter todos.
    const intRef = await addDoc(collection(db, 'interests'), {
      // Campos do Interest Panel (intLoadAll usa fromId/toId)
      fromUid: currentUser.uid,
      fromType: 'user',
      fromId: currentUser.uid,
      fromName: myName,
      fromPhoto: myPhoto,
      toType: 'team',
      toId: teamId,
      toName: teamName,
      toPhoto: teamPhoto,
      // Campos do Match System (swipe usa fromUserUid/toTeamId/type)
      type: 'artist_to_team',
      fromUserUid: currentUser.uid,
      fromUserName: myName,
      fromUserPhoto: myPhoto,
      toTeamId: teamId,
      toTeamName: teamName,
      toTeamPhoto: teamPhoto,
      // Campos comuns
      status: 'pending',
      read: false,
      createdAt: new Date().toISOString(), // ISO string — compatível com ambos os sistemas
    });

    toast(`\u{1F49B} Interesse enviado para ${teamName}!`);

    // Verifica se a equipe já tem interesse em mim → MATCH
    // Busca pelo padrão canônico (fromId) E pelo padrão do Match System (fromTeamId)
    let rev = null;
    try {
      const reverseQ1 = query(collection(db, 'interests'),
        where('fromId', '==', teamId),
        where('toId', '==', currentUser.uid), limit(1));
      const revSnap1 = await getDocs(reverseQ1);
      if (!revSnap1.empty) rev = { id: revSnap1.docs[0].id, ...revSnap1.docs[0].data() };
    } catch (e) { }

    // Fallback: busca pelo padrão do Match System (fromTeamId / toUserUid)
    if (!rev) {
      try {
        const reverseQ2 = query(collection(db, 'interests'),
          where('fromTeamId', '==', teamId),
          where('toUserUid', '==', currentUser.uid), limit(1));
        const revSnap2 = await getDocs(reverseQ2);
        if (!revSnap2.empty) rev = { id: revSnap2.docs[0].id, ...revSnap2.docs[0].data() };
      } catch (e) { }
    }

    if (rev) {
      await intCreateMatch(currentUser.uid, teamId, teamName, teamPhoto, myName, myPhoto, intRef.id, rev.id);
    } else {
      // Notifica membros da equipe
      try {
        const _intTeamSnap = await getDocs(query(collection(db, 'teams'), limit(200)));
        const _intTeamDoc = _intTeamSnap.docs.find(d => d.id === teamId);
        const _intMemberUids = _intTeamDoc?.data()?.memberUids || [];
        const _interestNotif = {
          type: 'interest_received',
          title: '\u{1F49B} Interesse Recebido',
          message: `${myName} demonstrou interesse na sua equipe!`,
          metadata: { fromUid: currentUser.uid, fromName: myName, fromPhoto: myPhoto, interestId: intRef.id, teamId },
          senderUid: currentUser.uid,
          senderName: myName,
          senderPhoto: myPhoto,
          createdAt: serverTimestamp(),
          read: false,
        };
        await Promise.all(_intMemberUids.map(uid =>
          addDoc(collection(db, 'user_notifications', uid, 'notifs'), _interestNotif).catch(() => { })
        ));
      } catch (e) { console.warn('notif team:', e); }
    }
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// ── Enviar interesse: EQUIPE → ARTISTA (já existia como hubLikeTalent) ──────
// Intercepta o botão "Demonstrar Interesse" do pp-popup no contexto de match
window.sendInterestToArtist = async function (talentUid, talentName, talentPhoto) {
  if (!currentUser || !_currentTeamId || !talentUid) return;
  const team = _myTeams?.find(t => t.id === _currentTeamId);
  const teamName = team?.name || 'Equipe';
  const teamPhoto = team?.photo || '';

  // Evita duplicata (checa cache local primeiro — evita query com possível permission error)
  if (window._hubTeamLikes && window._hubTeamLikes[talentUid]) {
    toast('Sua equipe já demonstrou interesse nesse artista!');
    return;
  }

  // Checa Firestore com campos duais (fromId OU fromTeamId)
  try {
    const existingQ = query(collection(db, 'interests'),
      where('fromId', '==', _currentTeamId),
      where('toId', '==', talentUid), limit(1));
    const existing = await getDocs(existingQ);
    if (!existing.empty) {
      if (window._hubTeamLikes) window._hubTeamLikes[talentUid] = true;
      toast('Sua equipe já demonstrou interesse nesse artista!');
      return;
    }
  } catch (e) { /* ignora erro de permissão */ }

  try {
    // ── CORREÇÃO: salvar campos DUAIS para compatibilidade com ambos os sistemas ──
    const intRef = await addDoc(collection(db, 'interests'), {
      // Campos do Interest Panel (intLoadAll usa fromId/toId)
      fromUid: currentUser.uid,
      fromType: 'team',
      fromId: _currentTeamId,
      fromName: teamName,
      fromPhoto: teamPhoto,
      toType: 'user',
      toId: talentUid,
      toName: talentName,
      toPhoto: talentPhoto,
      // Campos do Match System (swipe usa fromTeamId/toUserUid/type)
      type: 'team_to_artist',
      fromTeamId: _currentTeamId,
      fromTeamName: teamName,
      fromTeamPhoto: teamPhoto,
      toUserUid: talentUid,
      toUserName: talentName,
      toUserPhoto: talentPhoto,
      senderUid: currentUser.uid,
      // Campos comuns
      status: 'pending',
      read: false,
      createdAt: new Date().toISOString(),
    });

    // Atualiza cache local
    if (window._hubTeamLikes) window._hubTeamLikes[talentUid] = true;
    toast(`\u{1F49B} Interesse enviado para ${talentName}!`);

    // Verifica match reverso com busca robusta em ambos os padrões de campo
    let rev = null;
    try {
      // Padrão canônico (fromId / toId)
      const reverseQ1 = query(collection(db, 'interests'),
        where('fromId', '==', talentUid),
        where('toId', '==', _currentTeamId), limit(1));
      const revSnap1 = await getDocs(reverseQ1);
      if (!revSnap1.empty) rev = { id: revSnap1.docs[0].id, ...revSnap1.docs[0].data() };
    } catch (e) { }

    // Fallback: padrão do Match System (fromUserUid / toTeamId)
    if (!rev) {
      try {
        const reverseQ2 = query(collection(db, 'interests'),
          where('fromUserUid', '==', talentUid),
          where('toTeamId', '==', _currentTeamId), limit(1));
        const revSnap2 = await getDocs(reverseQ2);
        if (!revSnap2.empty) rev = { id: revSnap2.docs[0].id, ...revSnap2.docs[0].data() };
      } catch (e) { }
    }

    if (rev) {
      await intCreateMatch(talentUid, _currentTeamId, teamName, teamPhoto, talentName, talentPhoto, intRef.id, rev.id);
    } else {
      // Notifica o artista
      try {
        await setDoc(doc(db, 'user_notifications', talentUid, 'notifs', intRef.id), {
          type: 'interest_received',
          title: '\u{1F49B} Interesse Recebido',
          message: `A equipe ${teamName} demonstrou interesse em você!`,
          metadata: { fromId: _currentTeamId, fromName: teamName, fromPhoto: teamPhoto, interestId: intRef.id },
          senderUid: currentUser.uid,
          createdAt: serverTimestamp(),
          read: false,
        });
      } catch (e) { /* ignora erro de notificação */ }
    }
  } catch (e) { toast('Erro ao enviar interesse: ' + e.message, 'error'); }
};

// ── Criar match (Interest Panel) ─────────────────────────────────────────────
async function intCreateMatch(userUid, teamId, teamName, teamPhoto, userName, userPhoto, intId1, intId2) {
  // FASE 2B — verifica limite de conexões antes de qualquer escrita
  // userUid é sempre o artista (quem tem o plano pessoal a verificar)
  const _limitUserDoc = (userUid === (currentUser?.uid)) ? currentUserData : { plan: 'free' };
  const _canConnect = await _checkFriendLimit(_limitUserDoc, userUid);
  if (!_canConnect) return; // bloqueado — toast e modal já foram disparados

  try {
    // ID determinístico: match_${teamId}_${userUid} — evita duplicatas
    const matchId = `match_${teamId}_${userUid}`;
    await setDoc(doc(db, 'matches', matchId), {
      // Campos canônicos usados por matchOpenChatInPanel
      userUid, userName, userPhoto,
      teamId, teamName, teamPhoto,
      teamOwnerId: currentUser?.uid || '',
      inviteSent: false, inviteAccepted: false,
      // CORREÇÃO: adicionar status 'matched' explícito
      status: 'matched',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    // Atualiza status dos dois interesses para 'matched'
    await Promise.all([
      updateDoc(doc(db, 'interests', intId1), { status: 'matched', matchId }),
      updateDoc(doc(db, 'interests', intId2), { status: 'matched', matchId }),
    ]);
    // Mostra celebração
    showMatchCelebrationInt(userName, teamName, matchId);
    // Atualiza badge
    _intMatchList.unshift({ id: matchId, userUid, teamId, teamName, teamPhoto, userName, userPhoto });
    intUpdateBadges();
  } catch (e) { console.error('intCreateMatch:', e); }
}

function showMatchCelebrationInt(userName, teamName, matchId) {
  // v5.20.1 — Usa o overlay global (match-celebrate-overlay, z-index:1000)
  // em vez do modal antigo (openModal) que só funciona dentro do app de equipe.
  // O overlay global é position:fixed no body e aparece em TODAS as telas.

  // Guarda o matchId para o botão "VER MATCH" navegar corretamente
  if (typeof window._pendingMatchIdForCelebration !== 'undefined') {
    window._pendingMatchIdForCelebration = matchId;
  } else {
    window._pendingMatchIdForCelebration = matchId;
  }

  // Atualiza o botão VER MATCH para navegar corretamente independente da tela atual
  const overlay = document.getElementById('match-celebrate-overlay');
  if (overlay) {
    const verBtn = overlay.querySelector('.match-cel-btn');
    if (verBtn) {
      verBtn.onclick = function () {
        matchHideCelebration();
        _matchNavigateToMatchChat(window._pendingMatchIdForCelebration);
      };
    }
  }

  // Busca fotos do artista e da equipe para o overlay
  const team = (window._myTeams || []).find(t => t.id === window._currentTeamId);
  const teamPhoto = team?.photo || window._teamProfile?.photo || '';
  const artistPhoto = ''; // não temos aqui, mas o nome já aparece
  if (typeof window.matchShowCelebration === 'function') {
    window.matchShowCelebration(userName, artistPhoto, teamName, teamPhoto);
  } else {
    // Fallback para o modal antigo se matchShowCelebration não estiver disponível
    const msg = document.getElementById('match-celebrate-msg');
    const contact = document.getElementById('match-celebrate-contact');
    if (msg) msg.textContent = `${userName} e ${teamName} se curtiram mutuamente!`;
    if (contact) contact.innerHTML = `
      <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:2px;color:var(--text3);margin-bottom:8px">PRÓXIMO PASSO</div>
      <div style="font-size:13px;color:var(--text)">Acesse <strong>💛 Interesses → Matches</strong> para abrir o chat.</div>
    `;
    if (typeof openModal === 'function') openModal('modal-match-celebrate');
  }
}

// ── Navega até o chat do Match correto independente da tela atual ──────────────
function _matchNavigateToMatchChat(matchId, perspectiveHint) {
  // perspectiveHint: 'artist' | 'team' | undefined
  // Quando não fornecido, infere do contexto: se _currentTeamId ativo e não forçado artista → 'team'
  const hint = perspectiveHint ||
    ((window._currentTeamId && !window._talentStandaloneForceArtistMode) ? 'team' : 'artist');

  const standalone = document.getElementById('talent-standalone-screen');
  if (standalone && standalone.classList.contains('open')) {
    if (typeof window.matchSwitchView === 'function') window.matchSwitchView('matches');
    setTimeout(() => {
      if (typeof window.matchOpenChatInPanel === 'function' && matchId) {
        window.matchOpenChatInPanel(matchId, hint);
      }
    }, 150);
    return;
  }
  if (window._currentTeamId && !window._talentStandaloneForceArtistMode) {
    if (typeof window.openTeamProfileHub === 'function') window.openTeamProfileHub();
  } else {
    if (typeof window.showTalentsStandalone === 'function') window.showTalentsStandalone();
  }
  setTimeout(() => {
    if (typeof window.matchSwitchView === 'function') window.matchSwitchView('matches');
    setTimeout(() => {
      if (typeof window.matchOpenChatInPanel === 'function' && matchId) {
        window.matchOpenChatInPanel(matchId, hint);
      }
    }, 200);
  }, 400);
}

// ── Retribuir interesse (received → retornar interesse) ──────────────────────
window.intReturnInterest = async function (interestId) {
  const i = _intReceivedList.find(x => x.id === interestId);
  if (!i) return;

  if (i.fromType === 'team') {
    // Artista retribuindo para equipe
    await sendInterestToTeam(i.fromId, i.fromName, i.fromPhoto);
  } else {
    // Equipe retribuindo para artista
    await sendInterestToArtist(i.fromId, i.fromName, i.fromPhoto);
  }
  await intLoadAll();
};

// ── Remover interesse ────────────────────────────────────────────────────────
window.intRemoveInterest = async function (interestId, listType) {
  try {
    await deleteDoc(doc(db, 'interests', interestId));
    if (listType === 'received') _intReceivedList = _intReceivedList.filter(i => i.id !== interestId);
    else _intSentList = _intSentList.filter(i => i.id !== interestId);
    intUpdateBadges();
    intRenderTab(_intCurrentTab);
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// ── Abrir chat de match ───────────────────────────────────────────────────────
window.intOpenMatchChat = async function (matchOrIntId) {
  let resolvedMatchId = matchOrIntId;
  // Infere perspectiva do contexto ativo no momento da chamada
  const perspectiveHint = (window._currentTeamId && !window._talentStandaloneForceArtistMode)
    ? 'team' : 'artist';

  const m = (typeof _intMatchList !== 'undefined' ? _intMatchList : []).find(x => x.id === matchOrIntId);
  if (!m) {
    const allInts = [
      ...((typeof _intReceivedList !== 'undefined' ? _intReceivedList : [])),
      ...((typeof _intSentList !== 'undefined' ? _intSentList : []))
    ];
    const i = allInts.find(x => x.id === matchOrIntId);
    if (i?.matchId) resolvedMatchId = i.matchId;
  }

  if (!resolvedMatchId) { if (typeof toast === 'function') toast('Match não encontrado'); return; }

  closeInterestPanel();

  if (typeof window.openTeamProfileHub === 'function' && window._currentTeamId) {
    window.openTeamProfileHub();
  } else if (typeof window.showTalentsStandalone === 'function') {
    window.showTalentsStandalone();
  }

  setTimeout(() => {
    if (typeof window.matchSwitchView === 'function') window.matchSwitchView('matches');
    setTimeout(() => {
      if (typeof window.matchOpenChatInPanel === 'function') window.matchOpenChatInPanel(resolvedMatchId, perspectiveHint);
    }, 200);
  }, 350);
};

// ── Banner de match no chat ──────────────────────────────────────────────────
function intInjectMatchBanner(match) {
  const area = document.getElementById('pm-match-banner-area');
  if (!area) return;
  const isOwner = _currentTeamId && _myTeams?.find(t => t.id === _currentTeamId)?.members?.find(m => m.uid === currentUser.uid)?.role === 'owner';
  const canInvite = isOwner && !match.inviteSent;

  area.innerHTML = `
    <div class="pm-match-banner">
      <div class="pm-match-banner-icon">\u{1F498}</div>
      <div class="pm-match-banner-text">
        <div class="pm-match-banner-title">Match confirmado!</div>
        <div class="pm-match-banner-sub">${escHtml(match.teamName || '')} + ${escHtml(match.userName || '')} · Converse e firme uma parceria</div>
      </div>
      ${canInvite ? `<button class="pm-match-invite-btn" id="pm-invite-match-btn" onclick="intSendTeamInvite('${match.id}')">📨 CONVIDAR</button>` : ''}
      ${match.inviteSent ? `<span style="font-family:var(--font-mono);font-size:9px;color:var(--green);letter-spacing:1px">✅ CONVITE ENVIADO</span>` : ''}
    </div>`;
}

// ── Enviar convite de equipe via match ────────────────────────────────────────
window.intSendTeamInvite = async function (matchId) {
  const m = _intMatchList.find(x => x.id === matchId);
  if (!m || !_currentTeamId) return;
  const btn = document.getElementById('pm-invite-match-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }

  try {
    // Cria notificação de convite para o artista
    // P1-B FIX: inviteCode incluído no payload para que intAcceptTeamInvite
    // possa fazer o join sem ler teams/{teamId} diretamente (não-membro bloqueado).
    const _invTeam = (_myTeams || []).find(t => t.id === _currentTeamId);
    const _invCode = _invTeam?.inviteCode || null;
    await setDoc(doc(db, 'user_notifications', m.userUid, 'notifs', `inv_${matchId}`), {
      type: 'team_invite',
      title: '\u{1F3AE} Convite de Equipe',
      message: `A equipe "${m.teamName}" quer te convidar! Clique para aceitar.`,
      inviteCode: _invCode, // campo de topo para leitura direta em intAcceptTeamInvite
      metadata: {
        teamId: _currentTeamId,
        teamName: m.teamName,
        teamPhoto: m.teamPhoto,
        matchId,
        inviterUid: currentUser.uid,
        inviteCode: _invCode,
      },
      senderUid: currentUser.uid,
      createdAt: serverTimestamp(),
      read: false,
    });

    // Marca convite como enviado no match
    await updateDoc(doc(db, 'matches', matchId), { inviteSent: true });
    m.inviteSent = true;

    toast(`\u{1F4E8} Convite enviado para ${m.userName}!`);

    // v5.20.0 — Envia mensagem de convite no Match Chat (matches/{matchId}/messages)
    // NÃO usa pmSendTo (PM privado). O convite fica no contexto do chat do match.
    const inviteMsg = `\u{1F3AE} [CONVITE OFICIAL] A equipe ${m.teamName} está te convidando!\n\nAceite pela aba 💛 Interesses → Matches.`;
    if (typeof window.addDoc === 'function' && typeof window.collection === 'function') {
      try {
        await window.addDoc(
          window.collection(window.db, 'matches', matchId, 'messages'),
          {
            senderProfileId: _currentTeamId,      // profileId do perfil ativo = teamId
            senderType: 'team',
            senderId: currentUser.uid,      // uid Firebase (retrocompat)
            from: currentUser.uid,      // retrocompat legado
            text: inviteMsg,
            createdAt: typeof serverTimestamp === 'function' ? serverTimestamp() : new Date(),
            fromIsTeam: true,
            fromName: m.teamName || 'Equipe',
            fromPhoto: m.teamPhoto || '',
            teamId: _currentTeamId,
            isInvite: true,
          }
        );
      } catch (e) { /* falha silenciosa — convite já foi marcado */ }
    }

    // Re-injeta banner com estado atualizado
    intInjectMatchBanner(m);
  } catch (e) { toast('Erro ao enviar convite: ' + e.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = '\u{1F4E8} CONVIDAR'; } }
};

// ── Aceitar convite de equipe (artista) ───────────────────────────────────────
// P1-B FIX: getDoc(teams/teamId) foi removido — artista ainda não é membro,
// então a rule P1-B bloquearia a leitura. O inviteCode agora vem do payload
// da notificação (campo inviteCode), salvo no momento em que o PM envia o convite.
window.intAcceptTeamInvite = async function (teamId, matchId, notifId) {
  if (!currentUser || !teamId) return;
  try {
    // Recupera o inviteCode da notificação (já salvo no campo pelo remetente)
    let invCode = null;
    try {
      const notifSnap = await getDoc(doc(db, 'user_notifications', currentUser.uid, 'notifs', notifId));
      if (notifSnap.exists()) invCode = notifSnap.data().inviteCode || null;
    } catch (e) { }

    if (invCode) {
      // joinTeamByCode faz getDocs(teams) e filtra por inviteCode — não expõe teamId
      const codeInput = document.getElementById('join-team-code');
      if (codeInput) codeInput.value = invCode;
      await joinTeamByCode();
      await updateDoc(doc(db, 'matches', matchId), { inviteAccepted: true });
      await updateDoc(doc(db, 'user_notifications', currentUser.uid, 'notifs', notifId), { read: true });
      return;
    }
    // Fallback: orienta o usuário a usar o código manualmente
    toast('Entre em contato com o dono da equipe para o código de convite.', 'error');
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// ── Listener de notificações pessoais (user_notifications) ──────────────────
let _intUnsubUserNotifs = null;
function intStartUserNotifListener() {
  if (!currentUser) return;
  _intUnsubUserNotifs?.();
  try {
    _intUnsubUserNotifs = onSnapshot(
      query(
        collection(db, 'user_notifications', currentUser.uid, 'notifs'),
        where('read', '==', false),
        orderBy('createdAt', 'desc'),
        limit(10)
      ),
      snap => {
        snap.docChanges().forEach(change => {
          if (change.type === 'added') {
            const n = { id: change.doc.id, ...change.doc.data() };
            intShowNotifToast(n);
            intUpdateBadges();
          }
        });
      },
      err => { /* suppress Firebase permission errors on notif listener */ }
    );
  } catch (e) { }
}

// ── Toast de notificação de interesse recebido ───────────────────────────────
function intShowNotifToast(notif) {
  const container = document.getElementById('int-notif-container');
  if (!container) return;
  const m = notif.metadata || {};
  const isTeamInvite = notif.type === 'team_invite';
  const isInterest = notif.type === 'interest_received';
  if (!isTeamInvite && !isInterest) return;

  const toastId = `int-toast-${notif.id}`;
  const isTeam = !!m.teamId;
  const avatarHtml = m.fromPhoto || m.teamPhoto
    ? `<img src="${escHtml(m.fromPhoto || m.teamPhoto)}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">`
    : `<span>${(m.fromName || m.teamName || '?')[0].toUpperCase()}</span>`;

  const toast_el = document.createElement('div');
  toast_el.className = 'int-notif-toast';
  toast_el.id = toastId;
  toast_el.innerHTML = `
    <div class="int-notif-toast-hdr">
      <div class="int-notif-toast-av${isTeam ? '.team' : ''}">${avatarHtml}</div>
      <div class="int-notif-toast-info">
        <div class="int-notif-toast-title">${escHtml(notif.title)}</div>
        <div class="int-notif-toast-sub">${escHtml(notif.message)}</div>
      </div>
    </div>
    <div class="int-notif-toast-btns">
      ${isInterest ? `<button class="btn btn-primary btn-sm" style="flex:1;font-size:10px" onclick="intToastReturnInterest('${notif.id}','${m.interestId || ''}','${m.fromId || ''}','${escHtml(m.fromName || '')}','${escHtml(m.fromPhoto || '')}')">💛 RETRIBUIR</button>` : ''}
      ${isTeamInvite ? `<button class="btn btn-primary btn-sm" style="flex:1;font-size:10px" onclick="intAcceptTeamInvite('${m.teamId}','${m.matchId || ''}','${notif.id}')">✅ ACEITAR</button>` : ''}
      <button class="btn btn-ghost btn-sm" style="font-size:10px" onclick="intDismissToast('${toastId}','${notif.id}')">Ignorar</button>
    </div>`;
  container.appendChild(toast_el);

  // Auto-dismiss em 12s
  setTimeout(() => intDismissToast(toastId, notif.id), 12000);
}

window.intDismissToast = async function (toastId, notifId) {
  const el = document.getElementById(toastId);
  if (el) el.remove();
  if (notifId && currentUser) {
    try { await updateDoc(doc(db, 'user_notifications', currentUser.uid, 'notifs', notifId), { read: true }); } catch (e) { }
  }
};

window.intToastReturnInterest = async function (notifId, interestId, fromId, fromName, fromPhoto) {
  intDismissToast(`int-toast-${notifId}`, notifId);
  if (_currentTeamId) {
    await sendInterestToArtist(fromId, fromName, fromPhoto);
  } else {
    await sendInterestToTeam(fromId, fromName, fromPhoto);
  }
};

// ── Toggle interesse: envia ou cancela ───────────────────────────────────────
window.hubToggleInterest = async function (talentUid, talentName, talentDocId, fromSwipe = false) {
  const alreadyLiked = window._hubTeamLikes && window._hubTeamLikes[talentUid];
  if (alreadyLiked) {
    // Cancela interesse
    await window.cancelInterestToArtist(talentUid, talentName);
  } else {
    // Envia interesse
    await window.hubLikeTalent(talentUid, talentName, talentDocId, fromSwipe);
  }
};

// ── Cancelar interesse da equipe em um artista ───────────────────────────────
window.cancelInterestToArtist = async function (talentUid, talentName) {
  if (!currentUser || !_currentTeamId || !talentUid) return;
  try {
    // Busca o documento de interesse no Firestore
    const existingQ = query(
      collection(db, 'interests'),
      where('fromId', '==', _currentTeamId),
      where('toId', '==', talentUid),
      limit(1)
    );
    let deleted = false;
    try {
      const snap = await getDocs(existingQ);
      if (!snap.empty) {
        await deleteDoc(snap.docs[0].ref);
        deleted = true;
      }
    } catch (firestoreErr) {
      // Pode falhar por regras Firestore — mesmo assim remove do cache local
      console.warn('[cancelInterest] Firestore error (ignorado, limpando cache local):', firestoreErr.message);
    }

    // Remove do cache local de likes
    if (window._hubTeamLikes) {
      delete window._hubTeamLikes[talentUid];
      // Não tenta reescrever team_likes (Firestore rules restritivas)
    }

    toast(`❌ Interesse em ${talentName} removido.`);
    // Re-renderiza a lista para refletir mudança
    if (typeof renderHubSearch === 'function' && window._currentHubTab === 'search') renderHubSearch();
  } catch (e) {
    toast('Erro ao cancelar interesse: ' + e.message, 'error');
  }
};

// ── Redirecionar pp-popup "Demonstrar Interesse" ─────────────────────────────
// (substituído via onclick no HTML, mas garantia JS)
window.adbSendInterest = async function (teamId) {
  const team = window._adbAllTeams?.find(t => t.id === teamId);
  await sendInterestToTeam(teamId, team?.name || 'Equipe', team?.photo || '');
};

// ── Utilitário de tempo relativo ──────────────────────────────────────────────
function intRelTime(ts) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'agora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

// ── Hook no login para iniciar listener ──────────────────────────────────────
const _origApplyPermissions = window.applyPermissions;
window.applyPermissions = function () {
  if (typeof _origApplyPermissions === 'function') _origApplyPermissions();
  if (currentUser && typeof intStartUserNotifListener === 'function') {
    intStartUserNotifListener();
    // Carrega badge inicial
    setTimeout(async () => {
      try {
        const snap = await getDocs(query(
          collection(db, 'user_notifications', currentUser.uid, 'notifs'),
          where('read', '==', false), limit(20)
        ));
        const count = snap.size;
        const sb = document.getElementById('interest-sidebar-badge');
        if (sb && count > 0) { sb.textContent = count; sb.classList.add('show'); }
      } catch (e) { }
    }, 1500);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// REGRAS FIRESTORE NECESSÁRIAS — cole no Firebase Console → Firestore → Regras
// ══════════════════════════════════════════════════════════════════════════════
/*
COLE ESTAS REGRAS COMPLETAS NO FIREBASE CONSOLE:

rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    match /teams/{teamId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null && (
        resource == null ||
        resource.data.memberUids.hasAny([request.auth.uid])
      );
    }
    match /teams/{teamId}/{document=**} {
      allow read, write: if request.auth != null;
    }

    match /tickets/{ticketId} {
      allow create: if request.auth != null;
      allow read, update, delete: if request.auth != null && (
        resource.data.uid == request.auth.uid ||
        resource.data.authorUid == request.auth.uid
      );
    }

    match /talent_profiles/{uid} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == uid;
      allow update, delete: if request.auth != null && request.auth.uid == uid;
    }

    match /talent_messages/{msgId} {
      allow create: if request.auth != null;
      allow read: if request.auth != null && (
        resource.data.from == request.auth.uid ||
        resource.data.to == request.auth.uid
      );
    }

    match /talent_invites/{docId} {
      allow read, write: if request.auth != null;
    }

    // ── Interesses (artista ↔ equipe) ─────────────────────────────────────
    // v5.20.4 — Adicionados campos do sistema de spotlight (fromUserUid, senderUid,
    //           toUserUid) que não existiam nos checks anteriores, causando
    //           "Missing or insufficient permissions" ao deletar/ler interests
    //           criados pelo novo fluxo de Match bidirecional.
    match /interests/{id} {
      allow create: if request.auth != null;
      allow read, update, delete: if request.auth != null && (
        resource == null ||
        resource.data.fromUid == request.auth.uid ||
        resource.data.fromId == request.auth.uid ||
        resource.data.toId == request.auth.uid ||
        resource.data.fromUserUid == request.auth.uid ||
        resource.data.senderUid == request.auth.uid ||
        resource.data.toUserUid == request.auth.uid
      );
    }

    // ── Matches confirmados ────────────────────────────────────────────────
    // v5.20.4 — CRITICAL FIX: regra anterior usava
    //   members.hasAny([{'uid': request.auth.uid}])
    //   mas Firestore exige igualdade EXATA de objetos — como members tem campos
    //   extras (role, name, photo...) o hasAny sempre falhava, bloqueando
    //   leitura/deleção para qualquer membro da equipe.
    //   Fix: usa memberUids (array flat adicionado em v5.20.1) com hasAny([uid]).
    //   Também adicionado teamOwnerId como fallback para matches antigos sem memberUids.
    match /matches/{matchId} {
      allow create: if request.auth != null;
      allow read: if request.auth != null;
      allow update: if request.auth != null && (
        resource == null ||
        resource.data.userUid == request.auth.uid ||
        resource.data.teamOwnerId == request.auth.uid ||
        (resource.data.teamId != null &&
          exists(/databases/$(database)/documents/teams/$(resource.data.teamId)) &&
          get(/databases/$(database)/documents/teams/$(resource.data.teamId)).data.memberUids.hasAny([request.auth.uid]))
      );
      allow delete: if request.auth != null && (
        resource.data.userUid == request.auth.uid ||
        resource.data.teamOwnerId == request.auth.uid ||
        (resource.data.teamId != null &&
          exists(/databases/$(database)/documents/teams/$(resource.data.teamId)) &&
          get(/databases/$(database)/documents/teams/$(resource.data.teamId)).data.memberUids.hasAny([request.auth.uid]))
      );
    }

    // ── Chat do Match — subcoleção de mensagens por match ─────────────────
    // Separado do pm_chats para que membros da equipe (não só o owner) possam
    // participar do chat de Match com identidade de Equipe (não individual).
    // v5.20.4 — mesmo fix de hasAny → memberUids + teamOwnerId
    match /matches/{matchId}/messages/{msgId} {
      allow read: if request.auth != null && (
        get(/databases/$(database)/documents/matches/$(matchId)).data.userUid == request.auth.uid ||
        get(/databases/$(database)/documents/matches/$(matchId)).data.teamOwnerId == request.auth.uid ||
        (get(/databases/$(database)/documents/matches/$(matchId)).data.teamId != null &&
          exists(/databases/$(database)/documents/teams/$(get(/databases/$(database)/documents/matches/$(matchId)).data.teamId)) &&
          get(/databases/$(database)/documents/teams/$(get(/databases/$(database)/documents/matches/$(matchId)).data.teamId)).data.memberUids.hasAny([request.auth.uid]))
      );
      allow create: if request.auth != null && (
        get(/databases/$(database)/documents/matches/$(matchId)).data.userUid == request.auth.uid ||
        get(/databases/$(database)/documents/matches/$(matchId)).data.teamOwnerId == request.auth.uid ||
        (get(/databases/$(database)/documents/matches/$(matchId)).data.teamId != null &&
          exists(/databases/$(database)/documents/teams/$(get(/databases/$(database)/documents/matches/$(matchId)).data.teamId)) &&
          get(/databases/$(database)/documents/teams/$(get(/databases/$(database)/documents/matches/$(matchId)).data.teamId)).data.memberUids.hasAny([request.auth.uid]))
      ) && request.resource.data.from == request.auth.uid;
      allow delete: if request.auth != null && resource.data.from == request.auth.uid;
    }

    // ── Notificações pessoais ──────────────────────────────────────────────
    match /user_notifications/{userId}/notifs/{notifId} {
      allow read, update, delete: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null;
    }

    match /team_profiles/{teamId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && (
        (exists(/databases/$(database)/documents/team_profiles/$(teamId)) &&
          resource.data.ownerUid == request.auth.uid)
        ||
        (!exists(/databases/$(database)/documents/team_profiles/$(teamId)) &&
          exists(/databases/$(database)/documents/teams/$(teamId)) &&
          get(/databases/$(database)/documents/teams/$(teamId)).data.createdBy == request.auth.uid)
        ||
        (!exists(/databases/$(database)/documents/team_profiles/$(teamId)) &&
          request.resource.data.ownerUid == request.auth.uid)
      );
    }

    match /team_likes/{docId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }

    match /pm_chats/{chatId} {
      allow read, write: if request.auth != null && (
        chatId.split('_')[0] == request.auth.uid ||
        chatId.split('_')[1] == request.auth.uid
      );
    }
    match /pm_chats/{chatId}/messages/{msgId} {
      allow read: if request.auth != null && (
        chatId.split('_')[0] == request.auth.uid ||
        chatId.split('_')[1] == request.auth.uid
      );
      allow create: if request.auth != null && (
        chatId.split('_')[0] == request.auth.uid ||
        chatId.split('_')[1] == request.auth.uid
      ) && request.resource.data.from == request.auth.uid;
      allow delete: if request.auth != null && (
        chatId.split('_')[0] == request.auth.uid ||
        chatId.split('_')[1] == request.auth.uid
      );
    }

    match /pm_convs/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /pm_convs/{userId}/convs/{convId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && (
        request.auth.uid == userId ||
        request.auth.uid == convId
      );
    }

  }
}
*/

