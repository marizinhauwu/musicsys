// ══════════════════════════════════════════════════════════════════════════════
// UNIFIED PROFILE EDIT SYSTEM (UPE)
// ══════════════════════════════════════════════════════════════════════════════

// ── Skill definitions (expanded) ─────────────────────────────────────────────
window.UPE_SKILL_ROLES = [
  { id: 'r_ideal', label: 'Direção de Projetos', icon: '💡' },
  { id: 'r_vocal', label: 'Canto', icon: '🎤' },
  { id: 'r_letra', label: 'Letra', icon: '✍️' },
  { id: 'r_edit', label: 'Edição', icon: '🎬' },
  { id: 'r_mix', label: 'Mix', icon: '🎚️' },
  { id: 'r_master', label: 'Master', icon: '🎛️' },
  { id: 'r_beat', label: 'Instrumental', icon: '🎹' },
  { id: 'r_ilus', label: 'Ilustração', icon: '🖼️' },
  { id: 'r_thumb', label: 'Thumbnail', icon: '🎨' },
  { id: 'r_capa', label: 'Capas/Album Covers', icon: '💿' },
  { id: 'r_leg', label: 'Legendas Personalizadas', icon: '💬' },
];

// Also update FT_SKILL_ROLES and ROLES_CATALOG to use new list
window.FT_SKILL_ROLES = window.UPE_SKILL_ROLES;
window.FT_LEVELS = [
  { v: 'basico', l: 'Básico' },
  { v: 'intermediario', l: 'Médio' },
  { v: 'avancado', l: 'Avançado' },
  { v: 'expert', l: 'Expert' },
];
window.UPE_LEVELS = window.FT_LEVELS;

// ── State ─────────────────────────────────────────────────────────────────────
window._upeLangs = [];
window._upePhoto = null;
window._upeBanner = null;

// ── Open / Close ──────────────────────────────────────────────────────────────
window.openUnifiedProfileEdit = async function () {
  // Load fresh data
  let p = window._myTalentProfile || null;
  if (currentUser) {
    try {
      const snap = await getDoc(doc(db, 'talent_profiles', currentUser.uid));
      if (snap.exists()) { p = { id: currentUser.uid, ...snap.data() }; window._myTalentProfile = p; }
    } catch (e) { }
  }
  _upeFillForm(p);
  document.getElementById('upe-overlay').classList.add('open');
};

window.closeUnifiedProfileEdit = function () {
  document.getElementById('upe-overlay').classList.remove('open');
};

// ── Fill form from profile data ───────────────────────────────────────────────
function _upeFillForm(p) {
  const d = p || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  set('upe-name', d.name || currentUserData?.name || '');
  set('upe-handle', d.handle || (d.name ? '@' + (d.name || '').toLowerCase().replace(/\s+/g, '') : ''));
  set('upe-bio', d.bio || '');
  set('upe-story', d.story || '');
  set('upe-availability', d.availability || 'available');
  set('upe-youtube', d.links?.youtube || '');
  set('upe-spotify', d.links?.spotify || '');
  set('upe-discord', d.links?.discord || '');
  set('upe-instagram', d.links?.instagram || '');
  set('upe-tiktok', d.links?.tiktok || '');
  set('upe-portfolio', d.links?.portfolio || '');

  upeCountChars('upe-bio', 'upe-bio-count', 200);
  upeCountChars('upe-story', 'upe-story-count', 500);

  // Photo
  window._upePhoto = d.photo || null;
  window._upeBanner = d.banner || null;
  const photoImg = document.getElementById('upe-photo-img');
  const photoPh = document.getElementById('upe-photo-ph');
  if (photoImg && d.photo) { photoImg.src = d.photo; photoImg.style.display = 'block'; if (photoPh) photoPh.style.display = 'none'; }
  else if (photoImg) { photoImg.style.display = 'none'; if (photoPh) photoPh.style.display = ''; }

  const bannerImg = document.getElementById('upe-banner-img');
  const bannerHint = document.getElementById('upe-banner-hint');
  if (bannerImg && d.banner) { bannerImg.src = d.banner; bannerImg.style.display = 'block'; if (bannerHint) bannerHint.style.display = 'none'; }
  else if (bannerImg) { bannerImg.style.display = 'none'; if (bannerHint) bannerHint.style.display = ''; }

  // Preview
  const pn = document.getElementById('upe-preview-name');
  const pr = document.getElementById('upe-preview-role');
  if (pn) pn.textContent = d.name || 'Seu nome';
  if (pr) pr.textContent = d.title || 'Sua função principal';

  // Skills
  _upeRenderSkills(d.skills || {});

  // Languages
  window._upeLangs = d.languages ? [...d.languages] : [];
  _upeRenderLangs();

  // Teams visibility
  _upeRenderTeams(d.teamsVisible || {});
}

// ── Skills grid ───────────────────────────────────────────────────────────────
function _upeRenderSkills(savedSkills) {
  const grid = document.getElementById('upe-skill-grid');
  if (!grid) return;
  grid.innerHTML = UPE_SKILL_ROLES.map(r => {
    const checked = !!savedSkills[r.id];
    const level = savedSkills[r.id] || 'basico';
    return `<div class="upe-skill-item${checked ? ' active' : ''}" id="upe-sw-${r.id}">
      <label class="upe-skill-label">
        <input type="checkbox" data-upe-skill="${r.id}" ${checked ? 'checked' : ''}
          onchange="upeToggleSkill('${r.id}',this.checked)">
        <span style="font-size:14px">${r.icon}</span>
        <span class="upe-skill-name">${r.label}</span>
      </label>
      <select id="upe-level-${r.id}" class="upe-skill-level" style="display:${checked ? 'block' : 'none'}">
        ${UPE_LEVELS.map(lv => `<option value="${lv.v}" ${level === lv.v ? 'selected' : ''}>${lv.l}</option>`).join('')}
      </select>
    </div>`;
  }).join('');
}

window.upeToggleSkill = function (id, checked) {
  const wrap = document.getElementById('upe-sw-' + id);
  const level = document.getElementById('upe-level-' + id);
  if (wrap) wrap.classList.toggle('active', checked);
  if (level) level.style.display = checked ? 'block' : 'none';
};

// ── Teams visibility ──────────────────────────────────────────────────────────
function _upeRenderTeams(teamsVisible) {
  const list = document.getElementById('upe-teams-list');
  if (!list) return;
  const teams = window._myTeams || [];
  if (!teams.length) {
    list.innerHTML = '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);text-align:center;padding:16px">Você não faz parte de nenhuma equipe atualmente.</div>';
    return;
  }
  list.innerHTML = teams.map(t => {
    const vis = teamsVisible[t.id] !== false; // default visible
    const avHtml = t.photo ? `<img src="${escHtml(t.photo)}" style="width:100%;height:100%;object-fit:cover">` : (t.name || '?')[0].toUpperCase();
    return `<div class="upe-team-vis-item">
      <div class="upe-team-vis-av" style="overflow:hidden">${avHtml}</div>
      <div style="flex:1;font-family:var(--font-body);font-size:13px;font-weight:600">${escHtml(t.name || 'Equipe')}</div>
      <label style="display:flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:10px;color:var(--text2);cursor:pointer">
        <input type="checkbox" id="upe-team-vis-${t.id}" ${vis ? 'checked' : ''} style="accent-color:var(--a3)">
        Visível no perfil
      </label>
    </div>`;
  }).join('');
}

// ── Languages ─────────────────────────────────────────────────────────────────
function _upeRenderLangs() {
  const list = document.getElementById('upe-langs-list');
  if (!list) return;
  if (!window._upeLangs.length) { list.innerHTML = ''; return; }
  const levelLabels = { nativo: 'Nativo', avancado: 'Avançado', intermediario: 'Intermediário', basico: 'Básico' };
  list.innerHTML = window._upeLangs.map((l, i) => `
    <div class="upe-lang-row">
      <span style="font-family:var(--font-body);font-size:13px;flex:1">${escHtml(l.lang)}</span>
      <span style="font-family:var(--font-mono);font-size:10px;color:var(--text3)">${levelLabels[l.level] || l.level}</span>
      <span onclick="upeRemoveLang(${i})" style="color:var(--text3);cursor:pointer;font-size:14px;padding:0 4px" title="Remover">✕</span>
    </div>`).join('');
}

window.upeAddLang = function () {
  const inp = document.getElementById('upe-lang-input');
  const sel = document.getElementById('upe-lang-level');
  const val = inp?.value.trim();
  if (!val) return;
  window._upeLangs.push({ lang: val, level: sel?.value || 'nativo' });
  inp.value = '';
  _upeRenderLangs();
};

window.upeRemoveLang = function (i) {
  window._upeLangs.splice(i, 1);
  _upeRenderLangs();
};

// ── File handlers ─────────────────────────────────────────────────────────────
window.upeHandleBanner = function (input) {
  const file = input.files[0]; if (!file) return;
  // Gate: GIF banner requer plano ADVANCED
  if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) {
    if (typeof hasFeature === 'function' && !hasFeature(currentUserData, 'canUseGifBanner')) {
      toast('Banner GIF é exclusivo para o plano ADVANCED ✨', 'error');
      if (typeof openPlansModal === 'function') openPlansModal();
      input.value = '';
      return;
    }
  }
  const reader = new FileReader();
  reader.onload = e => {
    window._upeBanner = e.target.result;
    const img = document.getElementById('upe-banner-img');
    const hint = document.getElementById('upe-banner-hint');
    if (img) { img.src = e.target.result; img.style.display = 'block'; }
    if (hint) hint.style.display = 'none';
  };
  reader.readAsDataURL(file);
};

window.upeHandlePhoto = function (input) {
  const file = input.files[0]; if (!file) return;
  // Gate: GIF avatar requer plano PRO ou ADVANCED
  if (file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')) {
    if (typeof hasFeature === 'function' && !hasFeature(currentUserData, 'canUseGifAvatar')) {
      toast('Avatar GIF é exclusivo para planos PRO e ADVANCED 💎', 'error');
      if (typeof openPlansModal === 'function') openPlansModal();
      input.value = '';
      return;
    }
  }
  const reader = new FileReader();
  reader.onload = e => {
    window._upePhoto = e.target.result;
    const img = document.getElementById('upe-photo-img');
    const ph = document.getElementById('upe-photo-ph');
    if (img) { img.src = e.target.result; img.style.display = 'block'; }
    if (ph) ph.style.display = 'none';
  };
  reader.readAsDataURL(file);
};

// ── Char counter ──────────────────────────────────────────────────────────────
window.upeCountChars = function (inputId, countId, max) {
  const el = document.getElementById(inputId);
  const cnt = document.getElementById(countId);
  if (!el || !cnt) return;
  const len = (el.value || '').length;
  cnt.textContent = len;
  cnt.style.color = len > max * 0.85 ? 'var(--yellow)' : 'var(--text3)';
  if (len >= max) cnt.style.color = 'var(--red)';
};

// ── Preview name as user types ────────────────────────────────────────────────
window.upePreviewName = function () {
  const val = document.getElementById('upe-name')?.value || '';
  const el = document.getElementById('upe-preview-name');
  if (el) el.textContent = val || 'Seu nome';
};

window.upeFormatHandle = function () {
  const el = document.getElementById('upe-handle');
  if (!el) return;
  let v = el.value.replace(/[^a-zA-Z0-9_@]/g, '');
  if (v && !v.startsWith('@')) v = '@' + v;
  el.value = v;
};

window.upeSave = async function () {
  const name = FormValidator.val('upe-name');
  if (!FormValidator.require(name, 'Nome')) return;

  const bio = FormValidator.val('upe-bio');

  // Validar e auto-corrigir Handle P1-5
  let handleRaw = FormValidator.val('upe-handle');
  if (!handleRaw) {
    handleRaw = name.toLowerCase().replace(/\s+/g, '');
  }
  const cleanHandle = FormValidator.isHandle(handleRaw, true);
  if (!cleanHandle) return; // Erro já despachado pelo FormValidator

  // Validar URLs de Social P1-5
  const links = {
    youtube: FormValidator.isUrl(FormValidator.val('upe-youtube')),
    spotify: FormValidator.isUrl(FormValidator.val('upe-spotify')),
    discord: FormValidator.val('upe-discord'), // Discord costuma ser username/tag, não URL. Deixando string pura.
    instagram: FormValidator.isUrl(FormValidator.val('upe-instagram')),
    tiktok: FormValidator.isUrl(FormValidator.val('upe-tiktok')),
    portfolio: FormValidator.isUrl(FormValidator.val('upe-portfolio')),
  };

  // Se alguma URL retornou null na normalização, travamos o save
  if (links.youtube === null || links.spotify === null || links.instagram === null || links.tiktok === null || links.portfolio === null) {
    return;
  }

  // Collect skills
  const skills = {};
  UPE_SKILL_ROLES.forEach(r => {
    const chk = document.querySelector(`[data-upe-skill="${r.id}"]`);
    if (chk && chk.checked) {
      const sel = document.getElementById('upe-level-' + r.id);
      skills[r.id] = sel ? sel.value : 'basico';
    }
  });

  // Collect teams visibility
  const teamsVisible = {};
  (window._myTeams || []).forEach(t => {
    const chk = document.getElementById('upe-team-vis-' + t.id);
    teamsVisible[t.id] = chk ? chk.checked : true;
  });

  const profileData = {
    uid: currentUser.uid,
    name,
    handle: cleanHandle,
    title: _getFirstSkillLabel(skills),
    bio: bio || '',
    story: FormValidator.val('upe-story'),
    availability: document.getElementById('upe-availability')?.value || 'available',
    links: links,
    skills,
    languages: window._upeLangs || [],
    teamsVisible,
    photo: window._upePhoto || (window._myTalentProfile?.photo || ''),
    banner: window._upeBanner || (window._myTalentProfile?.banner || ''),
    // preserve existing fields
    tools: window._myTalentProfile?.tools || [],
    categories: window._myTalentProfile?.categories || [],
    portfolio: window._myTalentProfile?.portfolio || [],
    experience: window._myTalentProfile?.experience || [],
    contact: window._myTalentProfile?.contact || '',
    location: window._myTalentProfile?.location || '',
    isPublic: true,
    updatedAt: new Date().toISOString(),
  };

  if (typeof showLoading === 'function') showLoading('Salvando...');
  try {
    await setDoc(doc(db, 'talent_profiles', currentUser.uid), profileData, { merge: true });

    // Sync all caches
    window._myTalentProfile = { id: currentUser.uid, ...profileData };
    window._adbCurrentProfile = window._myTalentProfile;

    // Also sync users/{uid} basic fields (photo, name, banner)
    try {
      await setDoc(doc(db, 'users', currentUser.uid), {
        name: profileData.name,
        photoURL: profileData.photo,
        bannerURL: profileData.banner || '',
        handle: profileData.handle,
        updatedAt: profileData.updatedAt,
      }, { merge: true });
    } catch (e) { }

    // ETAPA 4.1: sync plan + effectivePriority → talent_profiles (usa valor persistido, não recalcula)
    try {
      const _epCurrent = currentUserData || window._appCurrentUserData;
      const _ep = typeof _epCurrent?.effectivePriority === 'number'
        ? _epCurrent.effectivePriority : 1;
      await updateDoc(doc(db, 'talent_profiles', currentUser.uid), {
        plan: typeof window.resolveUserPlan === 'function' ? window.resolveUserPlan(_epCurrent) : (_epCurrent?.plan || 'free'),
        effectivePriority: _ep
      });
    } catch (e) { }

    // Refletir as normalizações na UI
    const elH = document.getElementById('upe-handle');
    if (elH) elH.value = '@' + profileData.handle;
    if (document.getElementById('upe-youtube') && profileData.links.youtube) document.getElementById('upe-youtube').value = profileData.links.youtube;
    if (document.getElementById('upe-instagram') && profileData.links.instagram) document.getElementById('upe-instagram').value = profileData.links.instagram;
    if (document.getElementById('upe-portfolio') && profileData.links.portfolio) document.getElementById('upe-portfolio').value = profileData.links.portfolio;

    if (typeof hideLoading === 'function') hideLoading();
    closeUnifiedProfileEdit();
    if (typeof toast === 'function') toast('✅ Perfil atualizado!');

    // Refresh all UIs
    if (typeof adbRefreshHeader === 'function') adbRefreshHeader();
    if (typeof renderTeamsScreenExtras === 'function') renderTeamsScreenExtras();
    if (typeof _tsUpdateUserBar === 'function') _tsUpdateUserBar();
    // Refresh team sidebar if it's currently shown
    if (typeof applyPermissions === 'function' && document.getElementById('sidebar-user-section')?.style.display !== 'none') {
      applyPermissions();
    }

    // Update pp-card if it's showing own profile
    if (document.getElementById('pp-overlay')?.classList.contains('open')) {
      ppClose();
    }
  } catch (e) {
    if (typeof hideLoading === 'function') hideLoading();
    if (typeof toast === 'function') toast('Erro: ' + e.message, 'error');
  }
};

function _getFirstSkillLabel(skills) {
  const firstId = Object.keys(skills)[0];
  if (!firstId) return '';
  return (UPE_SKILL_ROLES.find(r => r.id === firstId)?.label) || '';
}

// ══════════════════════════════════════════════════════════════════════════════
// PP-CARD HOOKS — edit button + clickable photo/name
// ══════════════════════════════════════════════════════════════════════════════

// Show/hide edit button based on whether viewing own profile
const _origOpenProfilePopup = window.openProfilePopup;
window.openProfilePopup = function (data, context, event) {
  if (typeof _origOpenProfilePopup === 'function') _origOpenProfilePopup(data, context, event);
  // Show edit btn only for own profile
  const editBtn = document.getElementById('pp-edit-own-btn');
  if (editBtn) editBtn.style.display = (data.uid && currentUser && data.uid === currentUser.uid) ? 'inline-flex' : 'none';
};

window.ppHandleNameClick = function () {
  // If own profile: open edit. If other's: open full profile
  if (window._ppCurrentData?.uid === currentUser?.uid) {
    ppClose();
    openUnifiedProfileEdit();
  } else {
    const expandBtn = document.getElementById('pp-expand-btn');
    if (expandBtn) expandBtn.click();
  }
};

window.ppHandleAvatarClick = function () {
  window.ppHandleNameClick();
};

// ══════════════════════════════════════════════════════════════════════════════
// SYNC: Ensure all profile views use same data from talent_profiles
// ══════════════════════════════════════════════════════════════════════════════

// Unified profile data loader — ensures consistent data across views
window.upeGetProfileForDisplay = function (p) {
  if (!p) return {};
  const roleMap = {
    r_vocal: '🎤 Canto', r_beat: '🎹 Instrumental', r_mix: '🎚️ Mix',
    r_master: '🎛️ Master', r_letra: '✍️ Letra', r_edit: '🎬 Edição',
    r_ilus: '🖼️ Ilustração', r_thumb: '🎨 Thumbnail', r_ideal: '💡 Direção',
    r_capa: '💿 Capas', r_leg: '💬 Legendas',
  };
  const levelWidth = { basico: 25, basic: 25, iniciante: 25, intermediario: 55, inter: 55, intermediate: 55, avancado: 80, advanced: 80, expert: 100 };
  const levelLabel = { basico: 'Básico', basic: 'Básico', intermediario: 'Médio', inter: 'Médio', intermediate: 'Médio', avancado: 'Avançado', advanced: 'Avançado', expert: 'Expert' };
  const skills = p.skills || {};
  const roles = Object.keys(skills);
  return {
    name: p.name || '',
    handle: p.handle || (p.name ? '@' + (p.name || '').toLowerCase().replace(/\s+/g, '') : ''),
    photo: p.photo || '',
    bannerURL: p.banner || '',
    bio: p.bio || '',
    roles,
    availability: p.availability || 'available',
    uid: p.uid || p.id,
    stats: [
      { v: roles.length, l: 'Habilidades' },
      { v: (p.availability === 'available' || p.availability === 'open') ? '✅' : (p.availability === 'part_time' ? '🟡' : '🔶'), l: 'Status' },
    ],
    skillBars: roles.map(r => {
      const sv = _getSkillStr(skills[r]).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return {
        n: (roleMap[r] || r).replace(/^[^\s]+ /, ''),
        w: levelWidth[sv] ?? 55,
        l: levelLabel[sv] || _getSkillStr(skills[r]) || 'Médio',
      };
    }),
    activity: p.activity || [],
    badges: p.badges || { earned: [], locked: [] },
    links: p.links || p.social || {},
    languages: p.languages || [],
  };
};

// Override _openMyTalentPopup to use unified data
window._openMyTalentPopup = async function (event) {
  let p = null;
  if (currentUser) {
    try {
      const snap = await getDoc(doc(db, 'talent_profiles', currentUser.uid));
      if (snap.exists()) { p = { id: currentUser.uid, ...snap.data() }; window._myTalentProfile = p; }
    } catch (e) { p = window._myTalentProfile; }
  }
  if (!p) { openUnifiedProfileEdit(); return; }
  const data = upeGetProfileForDisplay(p);
  if (typeof openProfilePopup === 'function') openProfilePopup(data, 'match', event);
};

// Override _adbOpenMyProfile to use unified data
window._adbOpenMyProfile = async function (event) {
  window._openMyTalentPopup(event);
};

// ESC closes UPE overlay
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeUnifiedProfileEdit();
});

// Close UPE when clicking backdrop
document.getElementById('upe-overlay')?.addEventListener('click', function (e) {
  if (e.target === this) closeUnifiedProfileEdit();
});

