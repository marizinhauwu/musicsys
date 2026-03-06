// ════════════════════════════════════════════════════════════════════════════
// BLOCO PRINCIPAL — Firebase + Auth + App Logic + Pages
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Contém: Firebase config, Auth (login/register/Google), Teams screen,
//         showPage(), loadDashboard(), projects, collaborators, modals,
//         pomodoro, analytics (YouTube), tickets, team-settings, admin.
// ════════════════════════════════════════════════════════════════════════════

// ── GLOBAL IMAGE FALLBACK ─────────────────────────────────────────────────
// Silencia 404/CORS de imagens externas (wikia, CDNs mortas) com um placeholder
// inline SVG. Evita retry loops e spam de erros no console.
document.addEventListener('error', function (e) {
  if (e.target.tagName === 'IMG' && !e.target.dataset.fallback) {
    e.target.dataset.fallback = '1';
    e.target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'%3E%3Crect width='80' height='80' rx='12' fill='%23181820'/%3E%3Ctext x='40' y='46' text-anchor='middle' font-size='28' fill='%23333'%3E🎵%3C/text%3E%3C/svg%3E";
    e.target.alt = 'Imagem indisponível';
  }
}, true);

// ── DEBOUNCE UTILITY ────────────────────────────────────────────────────────
const _debounceTimers = {};
function _db(key, fn, delay = 280) {
  clearTimeout(_debounceTimers[key]);
  _debounceTimers[key] = setTimeout(fn, delay);
}
// Wrappers para inputs de busca (evita re-render a cada tecla)
window._dbRenderFindTeams = () => _db('findTeams', renderFindTeams);
window._dbRenderProjects = () => _db('projects', renderAllProjects);
window._dbFilterTalents = () => _db('talents', filterTalents);
window._dbRenderHubSearch = () => _db('hubSearch', renderHubSearch);
window._dbSaveDailyGoal = () => _db('dailyGoal', saveDailyGoal, 800);
window._dbMbPreviewImg = (v) => _db('mbImg', () => mbPreviewNodeImg(v), 400);
window._dbPreviewYT = (a, b) => _db('yt_' + a, () => previewYT(a, b), 500);
// ────────────────────────────────────────────────────────────────────────────

// ── FORM VALIDATOR (P1-5) ───────────────────────────────────────────────────
window.FormValidator = {
  // Extrai valor com trim() integrado
  val: function (id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  },
  // Valida obrigatoriedade
  require: function (val, fieldName) {
    if (!val) { if (typeof toast === 'function') toast(`Preencha o campo obrigatório: ${fieldName}`, 'error'); return false; }
    return true;
  },
  // Valida e normaliza Handle (ex: @user -> user)
  isHandle: function (val, autoFix = true) {
    if (!val) return val;
    let clean = val;
    if (autoFix && clean.startsWith('@')) {
      clean = clean.substring(1);
      // Opcional log debug
      if (window._DEBUG_FORMS) console.info(`[FormValidator] Handle normalizado: ${val} -> ${clean}`);
    }
    const regex = /^[a-zA-Z0-9_]{3,30}$/;
    if (!regex.test(clean)) {
      if (typeof toast === 'function') toast('Handle inválido. Use de 3 a 30 caracteres (apenas letras, números e underscores, sem espaços).', 'error');
      return null;
    }
    return clean;
  },
  // Valida e normaliza URL (ex: meudominio.com -> https://meudominio.com)
  isUrl: function (val, autoFix = true) {
    if (!val) return ''; // Se apagaram o campo, salvar como string vazia padronizada
    let clean = val.trim();

    // Tratamento de protocolo data: URI (exclusivo p/ imagens convertidas base64 no app)
    if (clean.toLowerCase().startsWith('data:')) {
      // Whitelist estrita para formatos rasterizados, barrando vetores maliciosos (svg+xml) ou HTML.
      const isSafeImage = /^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(clean);
      if (!isSafeImage) {
        if (typeof toast === 'function') toast('Upload bloqueado: formato inválido ou inseguro.', 'error');
        return null;
      }
      // Limitação simples de tamanho (2.8M chars = ~2MB base64 overhead ~33%)
      if (clean.length > 2800000) {
        if (typeof toast === 'function') toast('Upload bloqueado: arquivo excede o tamanho permitido.', 'error');
        return null;
      }
      return clean; // Retorna com sucesso a imagem safe
    }

    if (clean.toLowerCase().startsWith('javascript:')) {
      if (typeof toast === 'function') toast('URL insegura bloqueada.', 'error');
      return null;
    }

    // Auto-correção para esquemas HTTP padrão em URLs convencionais
    if (autoFix && !clean.match(/^https?:\/\//i)) {
      clean = 'https://' + clean;
      if (window._DEBUG_FORMS) console.info(`[FormValidator] URL normalizada: ${val} -> ${clean}`);
    }
    try {
      new URL(clean);
      return clean;
    } catch (e) {
      if (typeof toast === 'function') toast(`A URL inserida é inválida: ${val}`, 'error');
      return null;
    }
  },
  // Retorna validador de Email simples
  isEmail: function (val) {
    if (!val) return val;
    const regex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!regex.test(val)) {
      if (typeof toast === 'function') toast('O endereço de e-mail é inválido.', 'error');
      return null;
    }
    return val;
  },
  // Valida e sanitiza nome (Equipe, Projeto, etc)
  isName: function (val, min = 3, max = 40) {
    if (!val) return '';
    let clean = val.replace(/\s+/g, ' ').trim();
    if (clean.length < min || clean.length > max) {
      if (typeof toast === 'function') toast(`O nome deve ter entre ${min} e ${max} caracteres.`, 'error');
      return null;
    }
    // Permite letras, números, espaços e hifens (suporte a acentos via unicode)
    // Try/catch fallback caso o browser (ex: mobile antigo) não suporte \p{L}
    let isValid = false;
    try {
      const regex = /^[\p{L}\p{N} \-]+$/u;
      isValid = regex.test(clean);
    } catch (e) {
      // Fallback básico
      const fallbackRegex = /^[a-zA-Z0-9À-ÿ \-]+$/;
      isValid = fallbackRegex.test(clean);
    }
    if (!isValid) {
      if (typeof toast === 'function') toast('O nome contém caracteres inválidos. Use apenas letras, números e hifens.', 'error');
      return null;
    }
    return clean;
  },
  // Normaliza lista de tags separadas por vírgula (ex: gêneros)
  isTags: function (val, maxTags = 10, maxLen = 20) {
    if (!val) return [];
    let tagsRaw = val.split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    // Remove duplicatas case-insensitive mas preserva o case inserido da primeira aparição
    const tags = [];
    const seen = new Set();
    for (const t of tagsRaw) {
      const lower = t.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        tags.push(t);
      }
    }

    if (tags.length > maxTags) {
      if (typeof toast === 'function') toast(`Você pode adicionar no máximo ${maxTags} itens.`, 'error');
      return null;
    }

    for (const t of tags) {
      if (t.length > maxLen) {
        if (typeof toast === 'function') toast(`O item "${t}" excede o limite de ${maxLen} caracteres.`, 'error');
        return null;
      }
    }
    return tags;
  },
  // Valida títulos de projeto/track permitindo símbolos comuns e emojis (Bloqueia XSS apenas)
  isTitle: function (val, min = 2, max = 60) {
    if (!val) return '';
    let clean = val.replace(/\s+/g, ' ').trim();
    if (clean.length < min || clean.length > max) {
      if (typeof toast === 'function') toast(`O título deve ter entre ${min} e ${max} caracteres.`, 'error');
      return null;
    }
    // Remove tags HTML pesadas para evitar XSS, mas permite acentos, pontuações e emojis
    if (/[<>]/.test(clean)) {
      if (typeof toast === 'function') toast('O título não pode conter caracteres HTML (< ou >).', 'error');
      return null;
    }
    return clean;
  },
  // Validação flexível e higienização de contato
  isContact: function (val) {
    if (!val) return '';
    let clean = val.trim();
    if (clean.length > 100) return clean.substring(0, 100);

    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return clean.toLowerCase(); // É email
    if (clean.startsWith('http')) {
      const u = this.isUrl(clean);
      if (u === null) return null;
      return u;
    }
    if (/[<>]/.test(clean)) {
      if (typeof toast === 'function') toast('O contato contém caracteres inválidos.', 'error');
      return null; // bloq XSS hard se digitado livre
    }
    return clean;
  }
};
// ────────────────────────────────────────────────────────────────────────────

// ─── PLAN UTILITIES ───────────────────────────────────────────────────────────
// Funções centralizadas para resolução de plano.
// Nunca assuma que o campo `plan` existe no documento — use sempre estas funções.
// Qualquer novo código que precise verificar plano DEVE usar estas funções.

let _planExpTimer = null;
function _schedulePlanRefresh(uid, expDate) {
  if (typeof currentUserData === 'undefined' || !currentUserData || uid !== currentUserData.uid) return;
  if (_planExpTimer) clearTimeout(_planExpTimer);
  const ms = expDate.getTime() - Date.now();
  if (ms > 0 && ms < 86400000) {
    _planExpTimer = setTimeout(() => {
      if (typeof refreshPlanUI === 'function') refreshPlanUI();
    }, ms + 500); // 500ms safety buffer
  }
}

function getEffectivePlanForUser(userOrUid) {
  let docData = userOrUid;
  // If UID string provided, look up in global cache
  if (typeof userOrUid === 'string') {
    docData = (_users && _users.find(u => u.uid === userOrUid)) || null;
  }

  if (!docData || typeof docData !== 'object') {
    return { plan: 'free', source: 'base' };
  }

  // Cross-reference: se docData não tem planOverride mas é o usuário logado,
  // usar currentUserData (fonte de verdade com planOverride do onSnapshot).
  // Isso corrige o bug onde dados de talent_profiles (sem planOverride)
  // faziam o badge ADVANCED desaparecer no perfil do próprio usuário.
  if (!docData.planOverride && typeof currentUserData !== 'undefined' && currentUserData &&
    docData.uid && docData.uid === currentUserData.uid && currentUserData.planOverride) {
    docData = currentUserData;
  }

  // Check Override
  if (docData.planOverride) {
    try {
      const expDate = docData.planOverride.expiresAt?.toDate
        ? docData.planOverride.expiresAt.toDate()
        : new Date(docData.planOverride.expiresAt);

      if (expDate > new Date()) {
        const op = docData.planOverride.plan;
        if (op === 'pro' || op === 'advanced' || op === 'free') {
          _schedulePlanRefresh(docData.uid, expDate);
          return { plan: op, source: 'override', expiresAt: expDate };
        }
      }
    } catch (e) {
      console.warn('[PlanEngine] Falha ao ler expiração do planOverride:', e);
    }
  }

  // Check Base Plan
  const raw = docData.plan;
  if (raw === 'pro' || raw === 'advanced') {
    return { plan: raw, source: 'base' };
  }

  return { plan: 'free', source: 'base' };
}
window.getEffectivePlanForUser = getEffectivePlanForUser;

/**
 * Retorna o plano do usuário apenas (string), agindo como wrapper amigável 
 * retrocompatível para permissões, usando getEffectivePlanForUser como source of truth.
 * @param {object|null|undefined} userDoc - documento do usuário (Firestore data)
 * @returns {"free"|"pro"|"advanced"} plano normalizado
 */
function resolveUserPlan(userDoc) {
  return getEffectivePlanForUser(userDoc).plan;
}

/**
 * Retorna o plano da equipe. Fallback seguro para "free" se ausente ou undefined.
 * @param {object|null|undefined} teamDoc - documento da equipe (Firestore data)
 * @returns {"free"|"pro"|"advanced"} plano normalizado
 */
function resolveTeamPlan(teamDoc) {
  const raw = teamDoc?.plan;
  if (raw === 'pro' || raw === 'advanced') return raw;
  return 'free'; // fallback seguro — campo ausente OU valor inesperado
}

/**
 * Retorna a prioridade de busca numérica para um plano.
 * Usado para ordenação em listagens (advanced = maior prioridade).
 * @param {string|null|undefined} plan - string do plano já resolvida
 * @returns {3|2|1} prioridade numérica
 */
function getSearchPriority(plan) {
  if (plan === 'advanced') return 3;
  if (plan === 'pro') return 2;
  return 1; // free — default seguro, nunca assume que o campo existe
}

// Expõe globalmente para uso fora do module scope (ex: scripts inline, Match system)
window.resolveUserPlan = resolveUserPlan;
window.resolveTeamPlan = resolveTeamPlan;
window.getSearchPriority = getSearchPriority;
// ────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// FASE 1 — PLAN ENGINE (engine central de planos)
// Fonte única de configuração de limites, features e pesos de prioridade.
//
// Regras de uso:
//   • Não duplicar lógica de normalização — delegar para resolveUserPlan.
//   • Qualquer verificação de plano no resto do arquivo DEVE usar getLimit /
//     hasFeature / getPriorityWeight em vez de comparar plan === 'pro' inline.
//   • Infinity representa "sem limite" — use Number.isFinite() para checar.
//   • Todos os campos são somente-leitura — não modificar PLAN_CONFIG em runtime.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Configuração central de planos.
 * Cada chave é um plano canônico ('free' | 'pro' | 'advanced').
 * Subchave `limits`  → números (Infinity = ilimitado).
 * Subchave `features`→ booleans + números para contagens.
 * Subchave `weight`  → número inteiro para ranking futuro (não implementado ainda).
 */
const PLAN_CONFIG = Object.freeze({

  free: Object.freeze({
    limits: Object.freeze({
      maxTeams: 2,
      maxActiveProjects: 3,
      maxCollaboratorsPerProject: 2,
      maxFriends: 5,
    }),
    features: Object.freeze({
      hasBoost: false,
      boostMonthlyCount: 0,
      hasYouTubeAnalytics: false,
      hasAdvancedAnalytics: false,
      canUseGifAvatar: false,
      canUseGifBanner: false,
      canCustomizeProfileColors: false,
      canUseCustomBackground: false,
      canRemoveWatermark: false,
      canPinMessages: false,
      hasPrioritySupport: false,
      canUseAdvancedSearchFilters: false,
      canExportReports: false,
      canSeeProfileViews: false,
      canUseInvisibleMode: false,
      hasEarlyAccess: false,
      hasPremiumChat: false,
      hasFullDashboard: false,
      hasAdvancedCharts: false,
      hasFullHistory: false,
    }),
    weight: 1,
  }),

  pro: Object.freeze({
    limits: Object.freeze({
      maxTeams: 10,
      maxActiveProjects: Infinity,
      maxCollaboratorsPerProject: 8,
      maxFriends: 25,
    }),
    features: Object.freeze({
      hasBoost: true,
      boostMonthlyCount: 1,
      hasYouTubeAnalytics: true,
      hasAdvancedAnalytics: false,
      canUseGifAvatar: true,
      canUseGifBanner: false,
      canCustomizeProfileColors: false,
      canUseCustomBackground: false,
      canRemoveWatermark: false,
      canPinMessages: true,
      hasPrioritySupport: true,
      canUseAdvancedSearchFilters: false,
      canExportReports: false,
      canSeeProfileViews: false,
      canUseInvisibleMode: false,
      hasEarlyAccess: false,
      hasPremiumChat: false,
      hasFullDashboard: true,
      hasAdvancedCharts: true,
      hasFullHistory: true,
    }),
    weight: 5,
  }),

  advanced: Object.freeze({
    limits: Object.freeze({
      maxTeams: Infinity,
      maxActiveProjects: Infinity,
      maxCollaboratorsPerProject: Infinity,
      maxFriends: Infinity,
    }),
    features: Object.freeze({
      hasBoost: true,
      boostMonthlyCount: Infinity,
      hasYouTubeAnalytics: true,
      hasAdvancedAnalytics: true,
      canUseGifAvatar: true,
      canUseGifBanner: true,
      canCustomizeProfileColors: true,
      canUseCustomBackground: true,
      canRemoveWatermark: true,
      canPinMessages: true,
      hasPrioritySupport: true,
      canUseAdvancedSearchFilters: true,
      canExportReports: true,
      canSeeProfileViews: true,
      canUseInvisibleMode: true,
      hasEarlyAccess: true,
      hasPremiumChat: true,
      hasFullDashboard: true,
      hasAdvancedCharts: true,
      hasFullHistory: true,
    }),
    weight: 10,
  }),

});

// ── Funções públicas da engine ─────────────────────────────────────────────────

/**
 * Retorna o plano canônico do userDoc/profileDoc.
 * Delega para resolveUserPlan — sem lógica duplicada.
 * Aceita null/undefined → retorna 'free'.
 * @param {object|null|undefined} userDocOrProfileDoc
 * @returns {'free'|'pro'|'advanced'}
 */
function getUserPlan(userDocOrProfileDoc) {
  return resolveUserPlan(userDocOrProfileDoc);
}

/**
 * Retorna o bloco de configuração completo para um plano.
 * Plano inválido → retorna config de 'free'.
 * @param {'free'|'pro'|'advanced'} plan
 * @returns {object} config com limits, features, weight
 */
function getPlanConfig(plan) {
  return PLAN_CONFIG[plan] || PLAN_CONFIG.free;
}

/**
 * Retorna o valor do limite para o userDoc dado.
 * Retorna Infinity quando o plano não tem limite.
 * Retorna 0 se a chave não existir (fail-safe).
 * @param {object|null|undefined} userDoc
 * @param {'maxTeams'|'maxActiveProjects'|'maxCollaboratorsPerProject'|'maxFriends'} limitKey
 * @returns {number} — pode ser Infinity
 */
function getLimit(userDoc, limitKey) {
  const plan = getUserPlan(userDoc);
  const config = getPlanConfig(plan);
  const val = config.limits[limitKey];
  return (val !== undefined) ? val : 0; // 0 = chave inválida → fail-safe
}

/**
 * Verifica se o userDoc possui a feature indicada.
 * Aceita boolean features e numéricas (> 0 ou Infinity = true).
 * Retorna false para userDoc nulo ou feature inexistente.
 * @param {object|null|undefined} userDoc
 * @param {string} featureKey
 * @returns {boolean}
 */
function hasFeature(userDoc, featureKey) {
  const plan = getUserPlan(userDoc);
  const config = getPlanConfig(plan);
  const val = config.features[featureKey];
  if (val === undefined) return false; // chave inválida
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val > 0; // 0 = false, >0 ou Infinity = true
  return Boolean(val);
}

/**
 * Retorna o peso de prioridade (ranking) para o userDoc.
 * Usado para ordenação de perfis e listagens futuras.
 * Free=1, Pro=5, Advanced=10.
 * @param {object|null|undefined} userDoc
 * @returns {number}
 */
function getPriorityWeight(userDoc) {
  const plan = getUserPlan(userDoc);
  return getPlanConfig(plan).weight;
}

// Expõe globalmente
window.PLAN_CONFIG = PLAN_CONFIG;
window.getUserPlan = getUserPlan;
window.getPlanConfig = getPlanConfig;
window.getLimit = getLimit;
window.hasFeature = hasFeature;
window.getPriorityWeight = getPriorityWeight;
// ────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// FASE 2A — LIMITE DE PROJETOS ATIVOS
// Definição única de "projeto ativo" e helpers de verificação de limite.
// Todo check de maxActiveProjects no arquivo deve usar estas funções.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Decide se um projeto ocupa uma slot de "ativo" para fins de limite de plano.
 *
 * Regra adotada (baseada nos campos reais do modelo):
 *   CONTA como ativo: status === 'active'  (em andamento)
 *                     status === 'paused'  (pausado mas ainda em andamento — slot ocupada)
 *   NÃO conta:        status === 'completed' (lançado — estado terminal)
 *                     status === 'cancelled' (cancelado — estado terminal)
 *                     qualquer outro valor   (fallback seguro → não conta)
 *
 * Justificativa: 'paused' é um projeto em andamento temporariamente suspenso.
 * O usuário pode retomá-lo a qualquer momento; não libera a slot. Apenas
 * 'completed' e 'cancelled' são estados terminais que liberam a contagem.
 *
 * @param {object|null|undefined} projectDoc — documento de projeto do Firestore
 * @returns {boolean}
 */
function isProjectActive(projectDoc) {
  if (!projectDoc) return false;
  const s = projectDoc.status;
  return s === 'active' || s === 'paused';
}

/**
 * Conta quantos projetos no array fornecido contam como "ativos".
 * Usa isProjectActive como definição única — sem lógica duplicada.
 * @param {Array} projectsArray — array de docs de projeto (default: _projects)
 * @returns {number}
 */
function _countActiveProjects(projectsArray) {
  const arr = Array.isArray(projectsArray) ? projectsArray : (_projects || []);
  return arr.filter(isProjectActive).length;
}

/**
 * Verifica se o usuário pode criar/reativar mais um projeto ativo.
 * Se o limite for atingido: dispara toast + abre modal de planos.
 *
 * @param {object|null|undefined} userDoc — currentUserData (ou equivalente)
 * @param {object}  [opts]
 * @param {Array}   [opts.projectsArray] — array de projetos (default: _projects)
 * @param {string}  [opts.actionLabel]   — verbo para o toast (default: 'criar')
 * @returns {boolean} true = pode prosseguir | false = bloqueado
 */
function _checkProjectLimit(userDoc, opts) {
  const { projectsArray, actionLabel = 'criar' } = opts || {};
  const limit = getLimit(userDoc, 'maxActiveProjects'); // Infinity para PRO/ADVANCED
  if (!Number.isFinite(limit)) return true;               // ilimitado → sempre libera

  const current = _countActiveProjects(projectsArray);
  if (current < limit) return true;                       // dentro do limite → libera

  // Limite atingido — bloquear com feedback claro
  const planName = getUserPlan(userDoc).toUpperCase();
  toast(
    `Limite de projetos ativos atingido (${limit} no plano ${planName}). ` +
    `Arquive ou conclua um projeto, ou faça upgrade para PRO.`,
    'error'
  );
  if (typeof openPlansModal === 'function') openPlansModal();
  return false;
}

window.isProjectActive = isProjectActive;
window._countActiveProjects = _countActiveProjects;
window._checkProjectLimit = _checkProjectLimit;
// ────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// FASE 2B — LIMITE DE CONEXÕES (maxFriends)
//
// MODELO DE DADOS:
//   O sistema FREQsys não tem uma coleção "friends" separada.
//   "Conexões" = documentos confirmados na coleção 'matches'.
//   Cada match tem: { userUid, teamId, status:'matched', ... }
//   A contagem pessoal do usuário = matches onde userUid === uid.
//
// ESTADOS RELEVANTES:
//   interests: pending | accepted | matched (→ cria match)
//   matches:   status:'matched' (conexão confirmada)
//
// LIMITE:
//   FREE=5 | PRO=25 | ADVANCED=Infinity
//   Bloqueia no momento em que uma nova match seria criada.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Conta as conexões (matches) confirmadas de um usuário consultando o Firestore.
 * Retorna o número de docs em 'matches' onde userUid === uid.
 * Operação assíncrona — deve ser aguardada antes de qualquer escrita.
 *
 * @param {string} uid — UID do usuário cujas conexões serão contadas
 * @returns {Promise<number>}
 */
async function _countUserMatchesAsync(uid) {
  if (!uid) return 0;
  try {
    const q = query(collection(db, 'matches'), where('userUid', '==', uid), limit(500));
    const snap = await getDocs(q);
    return snap.size;
  } catch (e) {
    console.warn('[FriendLimit] Erro ao contar matches para uid=%s: %o', uid, e);
    return 0; // fail-open: se não conseguir contar, não bloqueia
  }
}

/**
 * Verifica se o usuário pode criar mais uma conexão (match).
 * Se o limite for atingido: dispara toast + abre modal de planos.
 * Retorna false se bloqueado — o chamador NÃO deve prosseguir com a escrita.
 *
 * @param {object|null|undefined} userDoc — documento do usuário (currentUserData)
 * @param {string}                uid     — UID de quem terá a conexão adicionada
 * @returns {Promise<boolean>} true = pode prosseguir | false = bloqueado
 */
async function _checkFriendLimit(userDoc, uid) {
  const limit_ = getLimit(userDoc, 'maxFriends');
  if (!Number.isFinite(limit_)) return true;           // ilimitado (ADVANCED) → libera sempre

  const current = await _countUserMatchesAsync(uid);
  if (current < limit_) return true;                   // dentro do limite → libera

  const planName = getUserPlan(userDoc).toUpperCase();
  const nextPlan = planName === 'FREE' ? 'PRO ou ADVANCED' : 'ADVANCED';
  toast(
    `Limite de conexões atingido (${limit_} no plano ${planName}). ` +
    `Faça upgrade para ${nextPlan} para aumentar seu limite.`,
    'error'
  );
  if (typeof openPlansModal === 'function') openPlansModal();
  return false;
}

window._countUserMatchesAsync = _countUserMatchesAsync;
window._checkFriendLimit = _checkFriendLimit;
// ────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// FASE 2C — LIMITE DE COLABORADORES POR PROJETO (maxCollaboratorsPerProject)
//
// MODELO DE DADOS REAL:
//   project.collaborators  — array de {collabId:string, roles:string[]} embutido
//                            no próprio doc do projeto (não é subcoleção).
//   teams/{id}/collaborators — POOL de membros da equipe: {id, name, roles,
//                              contact, inactive:bool}. Gerenciado em separado.
//
// O QUE CONTA COMO "COLABORADOR ATIVO" PARA FINS DE LIMITE:
//   Toda entrada {collabId} presente no array project.collaborators — inclusive
//   membros marcados como inactive no pool. Se estão no array, ocupam slot.
//   JUSTIFICATIVA: getCollabAssignments() coleta o que está marcado no formulário;
//   o usuário decidiu explicitamente incluí-los. O array é a fonte de verdade.
//   count = project.collaborators.length (cada collabId aparece exatamente 1×).
//
// REATIVAÇÃO (inactive → active):
//   Reativar um membro do pool NÃO altera project.collaborators diretamente.
//   O check dispara na próxima vez que o usuário salvar o projeto com esse
//   membro re-atribuído — coberto pelo check em saveProject().
//
// ESTRATÉGIA — FAIL-CLOSED:
//   saveProject(): contagem síncrona (array em memória) — impossível falhar por rede.
//   importToFirestore(): contagem síncrona do JSON — impossível falhar por rede.
//   Ambos bloqueiam por padrão se não conseguirem validar.
//
// PLANOS: FREE=2 | PRO=8 | ADVANCED=Infinity
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Conta quantos colaboradores distintos existem num array de assignments.
 * Cada entrada {collabId} conta 1 slot — independente de quantos roles tem.
 * Síncrono, sem acesso ao Firestore.
 *
 * @param {Array} collaboratorsArray — project.collaborators ou getCollabAssignments()
 * @returns {number}
 */
function _countAssignedCollabs(collaboratorsArray) {
  if (!Array.isArray(collaboratorsArray)) return 0;
  return collaboratorsArray.length; // cada collabId já é único no array
}

/**
 * Verifica se a nova lista de colaboradores está dentro do limite do plano.
 * Se exceder: dispara toast descritivo + abre modal de planos.
 * Retorna false se bloqueado — o chamador NÃO deve prosseguir com a escrita.
 *
 * FAIL-CLOSED: qualquer dúvida → retorna false (bloqueia).
 *
 * @param {object|null|undefined} userDoc          — currentUserData
 * @param {Array}                 newCollabsArray  — array {collabId,roles[]} a ser salvo
 * @param {string}               [ctx]             — contexto para o toast ('criar'|'editar'|'importar')
 * @returns {boolean} true = pode prosseguir | false = bloqueado
 */
function _checkCollabPerProjectLimit(userDoc, newCollabsArray, ctx) {
  // Contagem defensiva — se algo inesperado ocorrer, fail-closed
  let count;
  try {
    count = _countAssignedCollabs(newCollabsArray);
  } catch (e) {
    toast('Não foi possível validar o limite de colaboradores. Tente novamente.', 'error');
    return false;
  }

  const limit_ = getLimit(userDoc, 'maxCollaboratorsPerProject');
  if (!Number.isFinite(limit_)) return true;  // ADVANCED (Infinity) — libera sempre

  if (count <= limit_) return true;            // dentro do limite — libera

  // Bloqueado
  const planName = getUserPlan(userDoc).toUpperCase();
  const nextPlan = planName === 'FREE' ? 'PRO' : 'ADVANCED';
  const verb = ctx === 'importar' ? 'importar este projeto'
    : ctx === 'editar' ? 'salvar o projeto'
      : 'criar o projeto';
  toast(
    `Limite de colaboradores por projeto atingido ao ${verb} ` +
    `(${count} atribuídos, máximo ${limit_} no plano ${planName}). ` +
    `Faça upgrade para ${nextPlan} para adicionar mais colaboradores.`,
    'error'
  );
  if (typeof openPlansModal === 'function') openPlansModal();
  return false;
}

window._countAssignedCollabs = _countAssignedCollabs;
window._checkCollabPerProjectLimit = _checkCollabPerProjectLimit;
// ────────────────────────────────────────────────────────────────────────────

// ─── BOOST SYSTEM ─────────────────────────────────────────────────────────────
// Infraestrutura interna do sistema de Boost.
// Sem UI. Sem botões. Apenas funções utilitárias seguras.
//
// Campos Firestore usados (todos opcionais — fallback seguro se ausentes):
//   users.boostCredits       (number)   — créditos disponíveis
//   users.boostActiveUntil   (Timestamp | null) — expiry do boost ativo
//   users.monthlyMatchesCount (number)  — matches no mês corrente
//   users.monthlyScore        (number)  — score calculado (gravado via updateMonthlyScore)
//
// Regras por plano:
//   free     → nunca pode usar boost
//   pro      → pode usar se boostCredits > 0; consome 1 crédito por ativação
//   advanced → pode usar sempre; não consome créditos

/**
 * Verifica se o usuário pode ativar o Boost.
 * Free → nunca. Pro → só se tiver créditos. Advanced → sempre.
 * @param {object|null|undefined} userDoc
 * @returns {boolean}
 */
function canUseBoost(userDoc) {
  const plan = resolveUserPlan(userDoc);

  if (plan === 'advanced') return true;

  if (plan === 'pro') {
    return (userDoc?.boostCredits || 0) > 0;
  }

  return false; // free ou campo ausente
}

/**
 * Verifica se o Boost está ativo agora (boostActiveUntil > Date.now()).
 * Aceita Firestore Timestamp (com .toDate()) ou fallback seguro.
 * @param {object|null|undefined} userDoc
 * @returns {boolean}
 */
function isBoostActive(userDoc) {
  if (!userDoc?.boostActiveUntil) return false;

  try {
    return userDoc.boostActiveUntil.toDate() > new Date();
  } catch (e) {
    // boostActiveUntil existe mas não é um Firestore Timestamp válido
    return false;
  }
}

/**
 * Calcula a prioridade efetiva do usuário.
 * Base por plano: free→1, pro→2, advanced→3.
 * Se boost ativo: +5 sobre a base.
 * Não escreve no Firestore — use refreshEffectivePriority para persistir.
 * @param {object|null|undefined} userDoc
 * @returns {number}
 */
function calculateEffectivePriority(userDoc) {
  const plan = resolveUserPlan(userDoc);

  let base = 1;
  if (plan === 'pro') base = 2;
  if (plan === 'advanced') base = 3;

  if (isBoostActive(userDoc)) base += 5;

  return base;
}

/**
 * Ativa o Boost para um userId no Firestore.
 * - Busca o documento do usuário
 * - Verifica canUseBoost
 * - Grava boostActiveUntil = agora + 24h
 * - Recalcula e persiste effectivePriority
 * - Se Pro: decrementa boostCredits em 1
 * - Se Advanced: não altera créditos
 * @param {string} userId — UID do Firebase Auth
 * @returns {Promise<boolean>} true se ativado, false se não pôde ativar
 */
async function activateBoost(userId) {
  const ref = doc(db, 'users', userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return false;

  const data = snap.data();

  if (!canUseBoost(data)) return false;

  const plan = resolveUserPlan(data);

  const updates = {
    boostActiveUntil: Timestamp.fromDate(
      new Date(Date.now() + 24 * 60 * 60 * 1000) // agora + 24h
    )
  };

  if (plan === 'pro') {
    updates.boostCredits = (data.boostCredits || 0) - 1;
  }
  // advanced: não altera boostCredits

  // Recalcula effectivePriority com os valores pós-boost (merge local de data + updates)
  const updatedData = {
    ...data,
    ...updates
  };
  const updatedDoc = {
    ...updates,
    effectivePriority: calculateEffectivePriority(updatedData)
  };

  await updateDoc(ref, updatedDoc);

  return true;
}

/**
 * Calcula o monthlyScore baseado em monthlyMatchesCount.
 * Fórmula atual: score = matches * 3.
 * Não escreve no Firestore — use updateMonthlyScore para persistir.
 * @param {object|null|undefined} userDoc
 * @returns {number}
 */
function calculateMonthlyScore(userDoc) {
  const matches = userDoc?.monthlyMatchesCount || 0;
  return matches * 3;
}

/**
 * Calcula e persiste o monthlyScore no Firestore para um userId.
 * @param {string} userId — UID do Firebase Auth
 * @returns {Promise<boolean>} true se atualizado, false se documento não existe
 */
async function updateMonthlyScore(userId) {
  const ref = doc(db, 'users', userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return false;

  const data = snap.data();
  const score = calculateMonthlyScore(data);

  await updateDoc(ref, { monthlyScore: score });

  return true;
}

/**
 * Busca o documento do usuário, recalcula effectivePriority com base no estado
 * atual (plano + boost) e persiste o resultado no Firestore.
 * Útil para corrigir prioridades desatualizadas (ex: boost expirado).
 * @param {string} userId — UID do Firebase Auth
 * @returns {Promise<boolean>} true se atualizado, false se documento não existe
 */
async function refreshEffectivePriority(userId) {
  const ref = doc(db, 'users', userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return false;

  const data = snap.data();
  const priority = calculateEffectivePriority(data);

  await updateDoc(ref, { effectivePriority: priority });

  return true;
}

/**
 * Ordena in-memory um array de documentos de perfil por prioridade efetiva.
 * ETAPA 4.1: usa exclusivamente effectivePriority de talent_profiles (sem fallback calculado).
 * Critério 1: effectivePriority desc — default 1 se campo ausente.
 * Critério 2: updatedAt desc (desempate; suporta Firestore Timestamp e ISO string).
 *
 * Uso: array.sort(_sortByPriority)
 * Não muta o array original — use [...array].sort(_sortByPriority) se precisar preservá-lo.
 *
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
function _sortByPriority(a, b) {
  // ETAPA 4.1: usa exclusivamente effectivePriority persistido em talent_profiles
  // Se não for number → default 1 (free). NÃO recalcula via calculateEffectivePriority.
  const pA = typeof a.effectivePriority === 'number' ? a.effectivePriority : 1;
  const pB = typeof b.effectivePriority === 'number' ? b.effectivePriority : 1;

  if (pB !== pA) return pB - pA; // prioridade maior primeiro

  // Desempate: updatedAt desc (suporta Firestore Timestamp e ISO string)
  const toMs = v => v?.toMillis?.() ?? (v ? new Date(v).getTime() : 0);
  const uA = toMs(a.updatedAt) || toMs(a.createdAt);
  const uB = toMs(b.updatedAt) || toMs(b.createdAt);
  return uB - uA;
}

// Expõe globalmente (acessível por scripts inline e outros módulos)
window.canUseBoost = canUseBoost;
window.isBoostActive = isBoostActive;
window.activateBoost = activateBoost;
window.calculateMonthlyScore = calculateMonthlyScore;
window.updateMonthlyScore = updateMonthlyScore;
window.calculateEffectivePriority = calculateEffectivePriority;
window.refreshEffectivePriority = refreshEffectivePriority;
window._sortByPriority = _sortByPriority;
// ────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// ETAPA 5 — PLAN BADGE HELPERS
// Funções globais para renderizar badges de plano em qualquer template HTML.
// Fonte: t.plan (talent_profiles). Fallback: "free" para qualquer valor inválido.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Renderiza o chip unificado de plano ('inline' ou 'pill').
 * Extrai o plano efetivo do objeto/string. 
 * 'free' retorna string vazia para não poluir UI.
 */
function renderPlanChip(planInfoOrString, style = 'inline') {
  let p = 'free';
  if (planInfoOrString && typeof planInfoOrString === 'object' && planInfoOrString.plan) {
    p = planInfoOrString.plan;
  } else if (typeof planInfoOrString === 'string') {
    p = planInfoOrString.toLowerCase().trim();
  }

  if (p !== 'pro' && p !== 'advanced') return '';

  if (style === 'pill') {
    if (p === 'pro') {
      return `<span class="plan-pill pro"><span class="pp-dot"></span>PRO CREATOR</span>`;
    }
    if (p === 'advanced') {
      return `<span class="plan-pill advanced"><span class="pp-icon">⬡</span><span class="pp-text">ADVANCED MEMBER ✨</span></span>`;
    }
  } else {
    // inline
    if (p === 'pro') {
      return `<span class="plan-chip pro"><span class="pc-dot"></span>PRO</span>`;
    }
    if (p === 'advanced') {
      return `<span class="plan-chip advanced"><span class="pc-icon">⬡</span><span class="pc-text">ADVANCED ✨</span></span>`;
    }
  }

  return '';
}
window.renderPlanChip = renderPlanChip;

/**
 * Renderiza o chip de cargo/role da equipe (Admin, Staff, Moderator, Support).
 */
function renderRoleChip(roleStr) {
  const r = (roleStr || '').toLowerCase().trim();
  if (r === 'admin') {
    return `<span class="role-chip admin"><span class="rc-icon">⭐</span> ADMIN</span>`;
  }
  if (r === 'staff') {
    return `<span class="role-chip staff"><span class="rc-icon">🛡️</span> STAFF</span>`;
  }
  if (r === 'moderator') {
    return `<span class="role-chip moderator"><span class="rc-icon">🔨</span> MODERADOR</span>`;
  }
  if (r === 'support') {
    return `<span class="role-chip support"><span class="rc-icon">🎧</span> SUPORTE</span>`;
  }
  return '';
}
window.renderRoleChip = renderRoleChip;

// Retrocompat wrappers mapping to unified logic
function getPlanLabel(planOrDoc) {
  const p = typeof planOrDoc === 'object' ? getEffectivePlanForUser(planOrDoc).plan : (planOrDoc || 'free').toLowerCase();
  return (p === 'pro' || p === 'advanced') ? p : 'free';
}
window.getPlanLabel = getPlanLabel;
window.renderPlanInlineChip = (p) => renderPlanChip(p, 'inline');
window.renderPlanPill = (p) => renderPlanChip(p, 'pill');

/**
 * Atualiza todas as UIs de plano (Sidebar, Popup, Profile View) instantaneamente.
 * Deve ser chamado quando o documento base do usuário muda via onSnapshot 
 * ou via Override Panel actions (master).
 */
window.refreshPlanUI = function () {
  if (!currentUserData || !currentUserData.uid) return;

  // 1. Sidebar Role Badge
  if (typeof applyPermissions === 'function' && window._ready) {
    const headerRoleEl = document.getElementById('header-role');
    if (headerRoleEl) {
      const effectivePlanInfo = getEffectivePlanForUser(currentUserData);

      // Usa a nova função de badges para os cargos, com fallback textual para roles da equipe (admin, editor, viewer)
      let roleHtml = renderRoleChip(currentUserData?.staffRole);
      if (!roleHtml) {
        const roleText = ({ admin: '⭐ Admin (Equipe)', editor: '✏️ Editor', viewer: '👁️ Viewer' })[currentUserData?.role] || '';
        roleHtml = roleText ? `<span>${window.escHtml ? window.escHtml(roleText) : roleText}</span>` : '';
      }

      const planChipHtml = renderPlanChip(effectivePlanInfo, 'inline');

      // Adiciona o badge de role e depois o planChip
      const combinedHtml = (roleHtml ? roleHtml : '') + (planChipHtml ? (roleHtml ? ' ' : '') + planChipHtml : '');
      headerRoleEl.innerHTML = combinedHtml;
      if (combinedHtml) {
        headerRoleEl.style.display = 'flex';
        headerRoleEl.style.alignItems = 'center';
        headerRoleEl.style.gap = '4px';
      } else {
        headerRoleEl.style.display = 'none';
      }
    }
  }

  // 2. Profile Popup (if matches current user UID)
  if (typeof window._ppCurrentData !== 'undefined' && window._ppCurrentData && window._ppCurrentData.uid === currentUserData.uid) {
    const ppNameEl = document.getElementById('pp-name');
    if (ppNameEl) {
      const effectivePlanInfo = getEffectivePlanForUser(currentUserData);
      const nameRaw = window._ppCurrentData.name || window._ppCurrentData.displayName || 'Sem nome';
      const nameSafe = nameRaw.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const chipHtml = renderPlanChip(effectivePlanInfo, 'inline');
      ppNameEl.innerHTML = nameSafe + (chipHtml ? ' ' + chipHtml : '');
    }
  }

  // 3. Full Profile Popup (if matches current user UID)
  const fpNameEl = document.getElementById('fp-name-new');
  if (fpNameEl && typeof window._ppCurrentData !== 'undefined' && window._ppCurrentData && window._ppCurrentData.uid === currentUserData.uid) {
    const effectivePlanInfo = getEffectivePlanForUser(currentUserData);

    // Inline Chip Target
    const nameRaw = window._ppCurrentData.name || window._ppCurrentData.displayName || 'Sem nome';
    fpNameEl.textContent = nameRaw || '—';
    fpNameEl.querySelectorAll('.plan-chip').forEach(el => el.remove());
    const chipHtml = renderPlanChip(effectivePlanInfo, 'inline');
    if (chipHtml) fpNameEl.insertAdjacentHTML('beforeend', ' ' + chipHtml);

    // Pill Target
    const fpPillEl = document.getElementById('fp-plan-pill-new');
    if (fpPillEl) {
      fpPillEl.innerHTML = renderPlanChip(effectivePlanInfo, 'pill');
    }
  }
};
// ──────────────────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// PATCH Plan Sync — utilitárias de normalização e sincronização de plano
// Garante que users/{uid}.plan seja a fonte da verdade e que
// talent_profiles/{uid}.plan seja mantido em sincronia automaticamente.
//
// SECURITY REVIEW (aplicada):
//   • _normalizePlan delega para resolveUserPlan — única fonte de verdade de normalização.
//   • _syncTalentPlan usa updateDoc (não setDoc) → escreve APENAS plan; não toca outros campos.
//     Se o doc talent_profiles não existir, cai para setDoc({merge:true}) como fallback seguro.
//   • Retorna {ok, error} para que o chamador decida como tratar a falha.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Normaliza um valor de plano para os valores canônicos do projeto.
 * Delega para resolveUserPlan (fonte única de verdade) — sem lógica duplicada.
 * Aceita string direta ou objeto {plan: ...}.
 * @param {string|object|null|undefined} raw
 * @returns {'free'|'pro'|'advanced'}
 */
function _normalizePlan(raw) {
  // Aceita objeto ({plan:'pro'}) ou string direta
  const asDoc = (raw && typeof raw === 'object') ? raw : { plan: raw };
  return resolveUserPlan(asDoc); // 'free' | 'pro' | 'advanced' — mesma lógica do resto do sistema
}

/**
 * Sincroniza talent_profiles/{uid}.plan com o valor fornecido.
 * Estratégia de escrita segura (sem sobrescrever outros campos):
 *   1. Tenta updateDoc — escreve APENAS o campo plan (doc deve existir).
 *   2. Se doc não existir (NOT_FOUND), cai para setDoc com merge:true — cria só com plan.
 *   3. Qualquer outro erro é capturado e retornado — o chamador decide como reagir.
 * @param {string} uid
 * @param {string} plan — valor já normalizado
 * @returns {Promise<{ok: boolean, error: Error|null}>}
 */
async function _syncTalentPlan(uid, plan) {
  if (!uid) return { ok: false, error: new Error('uid ausente') };
  const normalizedPlan = _normalizePlan(plan);
  const planPayload = { plan: normalizedPlan, planSyncedAt: new Date().toISOString() };
  try {
    // Preferência: updateDoc — toca APENAS os campos do payload, preserva tudo mais
    await updateDoc(doc(db, 'talent_profiles', uid), planPayload);
    return { ok: true, error: null };
  } catch (e) {
    if (e?.code === 'not-found') {
      // Documento ainda não existe — cria com merge (seguro: não apaga campos futuros)
      try {
        await setDoc(doc(db, 'talent_profiles', uid), planPayload, { merge: true });
        return { ok: true, error: null };
      } catch (e2) {
        console.warn('[PlanSync] Falha ao criar talent_profiles/%s: %o', uid, e2);
        return { ok: false, error: e2 };
      }
    }
    console.warn('[PlanSync] Falha ao sincronizar talent_profiles/%s: %o', uid, e);
    return { ok: false, error: e };
  }
}

window._normalizePlan = _normalizePlan;
window._syncTalentPlan = _syncTalentPlan;
// ──────────────────────────────────────────────────────────────────────────────


// ⚠️  SUBSTITUA pelo seu próprio projeto Firebase para o SaaS!
// Crie em: https://console.firebase.google.com
// Ative: Authentication (Email/Senha + Google) e Firestore Database
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getFirestore, doc, getDoc, collection, getDocs, getCountFromServer, setDoc, deleteDoc, updateDoc, onSnapshot, writeBatch, query, orderBy, limit, addDoc, serverTimestamp, where, deleteField, Timestamp, runTransaction }
  from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, linkWithPopup, updateProfile, updatePassword
}
  from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCNlX0Q0ZItzNxRL7GP_-3VQHhR9RqyvvA",
  authDomain: "wimusys.firebaseapp.com",
  projectId: "wimusys",
  storageBucket: "wimusys.firebasestorage.app",
  messagingSenderId: "196026743376",
  appId: "1:196026743376:web:b181b8bed49bd9c6bf2f55"
};

const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
const auth = getAuth(fbApp);
const gProvider = new GoogleAuthProvider();

// ─── INTEGRAÇÃO DISCORD DIRETA (Bot API) ──────────────────────────────────────
const BOT_API_URL = 'http://localhost:3000'; // Em produção: https://sua-url-do-bot.onrender.com

// Helpers para comunicação cliente->bot
async function _botApiCall(endpoint, payload = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('unauthenticated');

  const token = await currentUser.getIdToken();
  const res = await fetch(`${BOT_API_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ data: payload })
  });

  const responseData = await res.json();
  if (!res.ok) throw new Error(responseData.error || 'Erro na comunicação com o Bot');

  return { data: responseData };
}

window._callLinkDiscord = (payload) => _botApiCall('/link-account', payload);
window._callUnlinkDiscord = () => _botApiCall('/unlink-account', {});
window._callNotifyBot = (payload) => _botApiCall('/events', payload);

// Expose Firebase functions to non-module scripts
window.db = db;
window.getDocs = getDocs;
window.getCountFromServer = getCountFromServer;
window.getDoc = getDoc;
window.collection = collection;
window.doc = doc;
window.setDoc = setDoc;
window.updateDoc = updateDoc;
window.addDoc = addDoc;
window.deleteDoc = deleteDoc;
window.onSnapshot = onSnapshot;
window.query = query;
window.where = where;
window.orderBy = orderBy;
window.limit = limit;
window.writeBatch = writeBatch;
window.serverTimestamp = serverTimestamp;
window.Timestamp = Timestamp;

// ─── AUTH STATE ───────────────────────────────────────────────────────────────
let currentUser = null;  // Firebase user object
let currentUserData = null;  // Firestore user doc { role, name, status }
window._appCurrentUser = null;
window._appCurrentUserData = null;

// Export para debug no console
Object.defineProperty(window, 'currentUser', {
  get() { return currentUser; },
  configurable: true
});
Object.defineProperty(window, 'currentUserData', {
  get() { return currentUserData; },
  configurable: true
});

// ─── CACHE LOCAL ──────────────────────────────────────────────────────────────
let _projects = [];
let _collabs = [];
let _users = [];
let _ready = false;
let _unsubProjects = null;
let _unsubCollabs = null;
let _unsubUsers = null;

// ─── LOADING INDICATORS ────────────────────────────────────────────────────────
window.showLoading = function (message = 'Carregando...') {
  window.hideLoading();
  const loader = document.createElement('div');
  loader.id = 'global-loader';
  loader.innerHTML = `
    <div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(8,8,14,0.92);
                display:flex;align-items:center;justify-content:center;z-index:99999;backdrop-filter:blur(8px)">
      <style>
        @keyframes freqSplashReveal{0%{opacity:0;transform:translateY(16px) scale(0.9);letter-spacing:24px}100%{opacity:1;transform:translateY(0) scale(1);letter-spacing:4px}}
        @keyframes freqSplashFade{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:translateY(0)}}
        @keyframes freqLoadBar{0%{width:0%}40%{width:55%}80%{width:82%}100%{width:100%}}
        @keyframes freqCircle{0%{opacity:0.35;transform:translate(-50%,-50%) scale(0.7)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.4)}}
        @keyframes freqFwBar{0%,100%{transform:scaleY(1);opacity:1}50%{transform:scaleY(0.25);opacity:0.4}}
        .freq-splash-logo{animation:freqSplashReveal 1s cubic-bezier(.16,1,.3,1) forwards;opacity:0}
        .freq-splash-sub{animation:freqSplashFade 1s 0.5s ease-out forwards;opacity:0}
        .freq-splash-bar-wrap{animation:freqSplashFade 0.8s 0.8s ease-out forwards;opacity:0}
        .freq-splash-loadbar{animation:freqLoadBar 2.8s 1s ease-in-out forwards;width:0%}
        .freq-circle-1{animation:freqCircle 3.5s 0.2s ease-out infinite}
        .freq-circle-2{animation:freqCircle 3.5s 1s ease-out infinite}
        .freq-circle-3{animation:freqCircle 3.5s 1.8s ease-out infinite}
        .freq-fw-s1{animation:freqFwBar 1.2s 0s ease-in-out infinite}
        .freq-fw-s2{animation:freqFwBar 1.2s 0.15s ease-in-out infinite}
        .freq-fw-s3{animation:freqFwBar 1.2s 0.3s ease-in-out infinite}
        .freq-fw-s4{animation:freqFwBar 1.2s 0.45s ease-in-out infinite}
        .freq-fw-s5{animation:freqFwBar 1.2s 0.6s ease-in-out infinite}
      </style>
      <!-- circles -->
      <div style="position:absolute;top:50%;left:50%;pointer-events:none">
        <div class="freq-circle-1" style="position:absolute;width:220px;height:220px;border-radius:50%;border:1px solid rgba(255,60,180,0.1);transform:translate(-50%,-50%)"></div>
        <div class="freq-circle-2" style="position:absolute;width:380px;height:380px;border-radius:50%;border:1px solid rgba(255,107,61,0.07);transform:translate(-50%,-50%)"></div>
        <div class="freq-circle-3" style="position:absolute;width:540px;height:540px;border-radius:50%;border:1px solid rgba(255,200,60,0.05);transform:translate(-50%,-50%)"></div>
      </div>
      <div style="position:relative;text-align:center;z-index:1">
        <!-- waveform icon -->
        <div style="display:flex;align-items:center;justify-content:center;gap:4px;height:44px;margin-bottom:20px">
          <div class="freq-fw-s1" style="width:5px;height:14px;border-radius:3px;background:linear-gradient(180deg,#ff3cb4,#ffc83c)"></div>
          <div class="freq-fw-s2" style="width:5px;height:28px;border-radius:3px;background:linear-gradient(180deg,#ff3cb4,#ffc83c);opacity:.85"></div>
          <div class="freq-fw-s3" style="width:5px;height:44px;border-radius:3px;background:linear-gradient(180deg,#ff3cb4,#ffc83c)"></div>
          <div class="freq-fw-s4" style="width:5px;height:32px;border-radius:3px;background:linear-gradient(180deg,#ff3cb4,#ffc83c);opacity:.9"></div>
          <div class="freq-fw-s5" style="width:5px;height:18px;border-radius:3px;background:linear-gradient(180deg,#ff3cb4,#ffc83c);opacity:.7"></div>
        </div>
        <!-- logo text -->
        <div class="freq-splash-logo" style="font-family:'Bebas Neue',sans-serif;font-size:72px;letter-spacing:4px;background:linear-gradient(135deg,#ff3cb4 0%,#ff6b3d 50%,#ffc83c 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1">
          FREQ<span style="font-family:'IBM Plex Mono',monospace;font-size:32px;font-weight:600;color:rgba(255,255,255,0.35);-webkit-text-fill-color:rgba(255,255,255,0.35);letter-spacing:2px;vertical-align:middle">sys</span>
        </div>
        <div class="freq-splash-sub" style="font-family:'IBM Plex Mono',monospace;font-size:10px;letter-spacing:5px;color:rgba(255,255,255,0.2);text-transform:uppercase;margin-top:8px">${message}</div>
        <!-- loader bar -->
        <div class="freq-splash-bar-wrap" style="display:flex;justify-content:center;margin-top:40px">
          <div style="width:200px;height:2px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden">
            <div class="freq-splash-loadbar" style="height:100%;background:linear-gradient(90deg,#ff3cb4,#ffc83c);border-radius:2px"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(loader);
  // console.info('[Loading] Overlay montado.', message); // desligado prod
};

window.hideLoading = function () {
  const loader = document.getElementById('global-loader');
  if (loader) {
    loader.remove();
    // console.info('[Loading] Overlay removido.'); // desligado prod
  }
};

// Aliases globais para escopo dos modulos
const showLoading = window.showLoading;
const hideLoading = window.hideLoading;

// ─── AUTH SCREENS ─────────────────────────────────────────────────────────────
window.switchAuthTab = function (tab) {
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');

  // P1-3: Guard — se algum elemento vital não existir, logar e abortar sem crash
  if (!formLogin || !formRegister || !tabLogin || !tabRegister) {
    console.error('[switchAuthTab] Elemento(s) do painel de auth não encontrado(s) no DOM.',
      { formLogin: !!formLogin, formRegister: !!formRegister, tabLogin: !!tabLogin, tabRegister: !!tabRegister });
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
function showAuthSuccess(msg) {
  const el = document.getElementById('auth-success');
  const err = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.classList.add('show'); }
  if (err) err.classList.remove('show');
}
function clearAuthMessages() {
  const err = document.getElementById('auth-error');
  const suc = document.getElementById('auth-success');
  if (err) err.classList.remove('show');
  if (suc) suc.classList.remove('show');
}

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

window.doLogin = async function () {
  const emailRaw = FormValidator.val('login-email');
  const email = emailRaw ? FormValidator.isEmail(emailRaw) : '';
  const pass = document.getElementById('login-password').value;

  // Impede campos ocos ou senhas q são só espaço
  if (!emailRaw || !pass.trim()) { showAuthError('Preencha email e senha'); return; }
  // Se digitou email mas o isEmail falhou (retornando null), pára a execução.
  if (emailRaw && !email) return;

  // Feedback pro usuário do e-mail normalizado limpo
  document.getElementById('login-email').value = email;

  const btn = document.getElementById('login-btn');
  if (btn.disabled) return; // evita duplo clique
  btn.disabled = true; btn.textContent = 'Entrando...';

  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    showAuthError(AUTH_ERRORS[e.code] || e.message);
  } finally {
    // Agora é infallable: sempre destrava a UI no final, seja sucesso ou catch ou disconect.
    btn.disabled = false; btn.textContent = 'Entrar';
  }
};

window.doRegister = async function () {
  const nameRaw = FormValidator.val('reg-name');
  // Usamos isTitle pq Nome Dinâmico pode ter pontuações, emoticons etc, mas barra payloads XSS.
  const name = nameRaw ? FormValidator.isTitle(nameRaw, 2, 40) : '';
  const emailRaw = FormValidator.val('reg-email');
  const email = emailRaw ? FormValidator.isEmail(emailRaw) : '';
  const pass = document.getElementById('reg-password').value;

  if (!nameRaw || !emailRaw || !pass.trim()) { showAuthError('Preencha todos os campos obrigatórios.'); return; }
  if (nameRaw && !name) return;
  if (emailRaw && !email) return;

  if (pass.length < 6) { showAuthError('A senha é muito curta. O mínimo é 6 caracteres.'); return; }

  // Exibe normalização
  document.getElementById('reg-name').value = name;
  document.getElementById('reg-email').value = email;

  const btn = document.getElementById('register-btn');
  if (btn.disabled) return;
  btn.disabled = true; btn.textContent = 'Criando Conta...';

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, 'users', cred.user.uid), { uid: cred.user.uid, name, email, role: 'member', plan: 'free', status: 'approved', discordId: null, createdAt: new Date().toISOString() });
    _syncTalentPlan(cred.user.uid, 'free').catch(() => { });
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
    const cred = await signInWithPopup(auth, gProvider);
    const u = cred.user;
    const existing = _users.find(x => x.uid === u.uid);
    if (!existing) {
      // isTitle garante q displayNames injetados por SSO q tenham lixo não causem quebra e fiquem no máx 40
      const safeName = FormValidator.isTitle(u.displayName || u.email, 2, 40) || 'Novo Colaborador';
      await setDoc(doc(db, 'users', u.uid), { uid: u.uid, name: safeName, email: u.email, role: 'member', plan: 'free', status: 'approved', discordId: null, createdAt: new Date().toISOString() });
      _syncTalentPlan(u.uid, 'free').catch(() => { });
    }
  } catch (e) {
    showAuthError(AUTH_ERRORS[e.code] || e.message);
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.doLogout = async function () {
  stopListeners();
  await signOut(auth);
  _projects = []; _collabs = []; _users = []; _ready = false;
  _currentTeamId = null; _myTeams = []; localStorage.removeItem('last_team_id');
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
  // Reset botão de login para não ficar travado em "Entrando..."
  const _lb = document.getElementById('login-btn');
  if (_lb) { _lb.disabled = false; _lb.textContent = 'Entrar'; }
  const _rb = document.getElementById('register-btn');
  if (_rb) { _rb.disabled = false; _rb.textContent = 'Criar Conta'; }
};

// ─── APPLY PERMISSIONS ────────────────────────────────────────────────────────
// applyPermissions and renderAdminPanel defined later with full feature set

// ─── ADMIN PANEL (legacy stubs — real versions defined below) ─────────────────

window.approveUser = async function (uid) {
  await updateDoc(doc(db, 'users', uid), { status: 'approved' });
  toast('Usuário aprovado!');
};
window.changeUserRole = async function (uid, role) {
  // P2-B: viewer é role válida — persiste em users/{uid} e atualiza team.members
  const VALID_ROLES = ['viewer', 'editor', 'admin'];
  if (!VALID_ROLES.includes(role)) { toast('Role inválida', 'error'); return; }
  const u = _users.find(x => x.uid === uid); if (!u) return;
  // Atualiza users/{uid}
  await updateDoc(doc(db, 'users', uid), { role });
  // Atualiza role no array members da equipe (para enterTeam roleMap)
  if (_currentTeamId) {
    const team = _myTeams?.find(t => t.id === _currentTeamId);
    if (team?.members) {
      const updatedMembers = team.members.map(m => m.uid === uid ? { ...m, role } : m);
      await updateDoc(doc(db, 'teams', _currentTeamId), { members: updatedMembers });
    }
  }
  toast(`Permissão alterada para ${role}`);
};
window.removeUser = async function (uid) {
  if (!confirm('Remover acesso deste usuário?')) return;
  await deleteDoc(doc(db, 'users', uid));
  toast('Usuário removido');
};

// ─── LISTENERS ────────────────────────────────────────────────────────────────
function stopListeners() {
  _unsubProjects?.(); _unsubCollabs?.(); _unsubUsers?.();
  _unsubProjects = _unsubCollabs = _unsubUsers = null;
  pmStop();
}

function startListeners() {
  // Guard: startListeners() só deve rodar em contexto 'team' com equipe válida.
  // Qualquer chamada fora desse contexto é um bug de navegação — abortar silenciosamente.
  if (!_currentTeamId) {
    console.warn('[Nav] startListeners() chamado sem _currentTeamId — abortando. appContext:', window.appContext);
    hideLoading();
    return;
  }
  if (window.appContext !== 'team') {
    console.warn('[Nav] startListeners() chamado fora de contexto team (atual:', window.appContext, ') — abortando');
    hideLoading();
    return;
  }

  showLoading('Carregando dados...');
  stopListeners();
  let projLoaded = false, collabLoaded = false, usersLoaded = false;
  const uid = currentUser.uid;
  // Sempre usa escopo da equipe — o fallback para users/{uid} foi removido
  // pois users/{uid}/projects não existe no schema e gerava listeners fantasma.
  const dataPath = ['teams', _currentTeamId];

  function tryInit() {
    if (!projLoaded || !collabLoaded || !usersLoaded) return;
    hideLoading();
    if (!_ready) { _ready = true; loadDashboard(); applyPermissions(); }
    else refreshCurrentPage();
  }

  // SaaS: ouve apenas o documento do próprio usuário (evita permission-denied)
  _unsubUsers = onSnapshot(doc(db, 'users', uid), docSnap => {
    const freshData = docSnap.exists() ? docSnap.data() : null;
    _users = freshData ? [freshData] : [];
    if (currentUser) {
      const preserved = freshData || currentUserData;
      // Preserve photoURL: keep the one from Firestore if present, otherwise keep current (avoids photo disappearing on re-login)
      const photoURL = preserved?.photoURL || currentUserData?.photoURL || '';
      currentUserData = { ...preserved, photoURL, ...(_currentTeamId ? { teamId: _currentTeamId } : {}) };
      window._appCurrentUserData = currentUserData;
    }
    usersLoaded = true; tryInit();
    if (_ready) { applyPermissions(); }

    // Auto-refresh Plan UI immediately on data change (especially for Overrides)
    if (typeof refreshPlanUI === 'function') refreshPlanUI();

    // Atualiza nav staff/admin imediatamente, sem depender de _currentTeamId
    if (typeof refreshStaffNav === 'function') refreshStaffNav();
  }, () => { usersLoaded = true; tryInit(); });

  _unsubProjects = onSnapshot(collection(db, ...dataPath, 'projects'), snap => {
    _projects = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    projLoaded = true; tryInit();
    if (_ready) refreshCurrentPage();
  }, err => {
    console.error(`[startListeners] Erro em projects (teamId: ${_currentTeamId}):`, err.code, err.message);
    _projects = []; // fallback: lista vazia, não trava
    projLoaded = true; tryInit();
    if (err.code === 'permission-denied' || (err.message && err.message.includes('permissions'))) {
      toast('⚠️ Não é possível carregar projetos: suas permissões nesta equipe podem estar desatualizadas. Peça ao dono para reabrir a equipe.', 'error');
    } else {
      toast('Erro ao carregar projetos: ' + (err.message || 'erro desconhecido'), 'error');
    }
  });

  _unsubCollabs = onSnapshot(collection(db, ...dataPath, 'collaborators'), snap => {
    _collabs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    collabLoaded = true; tryInit();
    if (_ready) refreshCurrentPage();
  }, err => {
    console.error(`[startListeners] Erro em collaborators (teamId: ${_currentTeamId}):`, err.code, err.message);
    _collabs = []; // fallback: lista vazia, não trava
    collabLoaded = true; tryInit();
    if (err.code === 'permission-denied' || (err.message && err.message.includes('permissions'))) {
      toast('⚠️ Não é possível carregar colaboradores: permissões desatualizadas. Peça ao dono para reabrir a equipe.', 'error');
    } else {
      toast('Erro ao carregar colaboradores: ' + (err.message || 'erro desconhecido'), 'error');
    }
  });
}

// ─── TEAMS SYSTEM ─────────────────────────────────────────────────────────────
let _currentTeamId = null;
window._currentTeamId = null;

// appContext — contexto de navegação explícito.
// 'global' → teams-screen, sem equipe ativa
// 'team'   → workspace de equipe (startListeners ativo)
// 'staff'  → painel staff/admin, sem workspace
window.appContext = 'global';
let _myTeams = [];
window._myTeams = _myTeams;
let _teamYoutubeChannel = null;
let _pendingInviteTeamId = null;
let _pendingInviteCode = null; // P1-C: código do ?code= na URL

// ─── NOTIFICAÇÕES E NOVAS FEATURES ────────────────────────────────────────────
let _notifications = [];
let _unsubNotifications = null;
let _comments = [];
let _unsubComments = null;
let _projectFiles = [];
let _uploadingFiles = new Map();

// ─── LOAD MY TEAMS ────────────────────────────────────────────────────────────
// Estratégia robusta em 2 fases:
// 1. Tenta query rápida por memberUids (funciona para equipes novas v5.20.1+)
// 2. SEMPRE faz fallback: busca todas as equipes e verifica client-side se
//    o UID do usuário está no array members (objetos). Isso garante que equipes
//    antigas (sem memberUids) também apareçam.
async function loadMyTeams() {
  const uid = currentUser?.uid; if (!uid) return;
  const teamsById = {};

  // Fase 1: query rápida por memberUids (pode falhar para equipes antigas)
  try {
    const snap = await getDocs(query(collection(db, 'teams'), where('memberUids', 'array-contains', uid)));
    snap.docs.forEach(d => { teamsById[d.id] = { id: d.id, ...d.data() }; });
  } catch (e) {
    console.warn('[loadMyTeams] memberUids query failed (esperado se não há equipes novas):', e.message);
  }

  // Fase 2: SEMPRE busca todas as equipes e filtra client-side pelo array members
  // Isso garante que equipes antigas (sem campo memberUids) apareçam
  try {
    const allSnap = await getDocs(collection(db, 'teams'));
    allSnap.docs.forEach(d => {
      if (teamsById[d.id]) return; // já encontrada na Fase 1
      const data = d.data();
      const isMember = data.members && Array.isArray(data.members) &&
        data.members.some(m => m.uid === uid);
      if (isMember) {
        teamsById[d.id] = { id: d.id, ...data };
        // Auto-repair: se equipe antiga não tem memberUids, popula silenciosamente
        // GUARD: Só o criador (createdBy) tem permissão garantida de update nas rules
        if (!data.memberUids || !Array.isArray(data.memberUids)) {
          if (data.createdBy === uid) {
            const repairedUids = data.members.map(m => m.uid).filter(Boolean);
            console.info(`[loadMyTeams] Repair: populando memberUids para equipe ${d.id} (${repairedUids.length} membros)`);
            setDoc(doc(db, 'teams', d.id), { memberUids: repairedUids }, { merge: true }).catch(e =>
              console.warn(`[loadMyTeams] Repair falhou para ${d.id}:`, e.message)
            );
          } else {
            console.info(`[loadMyTeams] Equipe ${d.id} precisa de repair de memberUids, mas só o dono pode executar.`);
          }
        }
      }
    });
  } catch (e) {
    console.warn('[loadMyTeams] Full scan error:', e.message);
  }

  _myTeams = Object.values(teamsById);
  window._myTeams = _myTeams;
  renderTeamsList();
  // Always refresh profile extras whenever teams reload
  renderTeamsScreenExtras();
}

async function renderTeamsList() {
  const cont = document.getElementById('teams-my-list'); if (!cont) return;
  const sidebar = document.getElementById('ts-sidebar-list');
  const countEl = document.getElementById('ts-teams-count');
  if (!_myTeams.length) {
    cont.innerHTML = `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);text-align:center;padding:20px">Você ainda não faz parte de nenhuma equipe</div>`;
    if (sidebar) sidebar.innerHTML = `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);padding:8px 10px">Nenhuma equipe</div>`;
    if (countEl) countEl.textContent = '0';
    return;
  }
  if (countEl) countEl.textContent = _myTeams.length + (_myTeams.length === 1 ? ' equipe' : ' equipes');
  const gradients = [
    'linear-gradient(135deg,var(--a1),var(--a2))',
    'linear-gradient(135deg,var(--a3),var(--a2))',
    'linear-gradient(135deg,var(--a2),var(--a1))'
  ];

  // Load team_profiles to sync photos/names
  let tpMap = {};
  try {
    const tpSnap = await getDocs(collection(db, 'team_profiles'));
    tpSnap.docs.forEach(d => { tpMap[d.id] = d.data(); });
  } catch (e) { /* sem perfis públicos ainda */ }

  cont.innerHTML = _myTeams.map((t, i) => {
    const myRole = t.members.find(m => m.uid === currentUser?.uid)?.role || 'member';
    const tp = tpMap[t.id] || {};
    const photo = tp.photo || tp.logo || t.photo || '';
    const displayName = tp.name || t.name || 'Equipe';
    const description = tp.tagline || t.description || '';
    const initial = displayName[0].toUpperCase();
    const grad = tp.color || gradients[i % gradients.length];
    const avHtml = photo
      ? `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:8px">`
      : `<span style="font-weight:800;font-size:15px;color:#fff">${initial}</span>`;
    return `<div class="ts-team-row" onclick="enterTeam('${t.id}')">
      <div class="ts-row-av" style="background:${grad};overflow:hidden;display:flex;align-items:center;justify-content:center">${avHtml}</div>
      <div class="ts-row-info">
        <div class="ts-row-name">${escHtml(displayName)}</div>
        <div class="ts-row-meta">${t.members?.length || 0} membro${t.members?.length !== 1 ? 's' : ''} · ${myRole === 'owner' ? '👑 Dono' : myRole === 'admin' ? '⭐ Admin' : '👥 Membro'}${description ? ' · ' + escHtml(description.substring(0, 30)) : ''}</div>
      </div>
      ${myRole !== 'owner' ? `<button title="Sair da equipe" onclick="event.stopPropagation();teamScreenLeave('${t.id}','${escHtml(displayName)}')" style="background:none;border:1px solid rgba(239,68,68,0.3);color:var(--red);border-radius:7px;padding:5px 10px;font-size:10px;font-family:var(--font-mono);cursor:pointer;letter-spacing:1px;flex-shrink:0" title="Sair da equipe">🚪 SAIR</button>` : ''}
      <div class="ts-row-enter">Entrar ›</div>
    </div>`;
  }).join('');
  if (sidebar) {
    sidebar.innerHTML = _myTeams.map((t, i) => {
      const myRole = t.members.find(m => m.uid === currentUser?.uid)?.role || 'member';
      const tp = tpMap[t.id] || {};
      const photo = tp.photo || tp.logo || t.photo || '';
      const displayName = tp.name || t.name || 'Equipe';
      const initial = displayName[0].toUpperCase();
      const grad = tp.color || gradients[i % gradients.length];
      const avHtml = photo
        ? `<img src="${photo}" class="u-avatar-img">`
        : initial;
      return `<div class="ts-mini" onclick="enterTeam('${t.id}')">
        <div class="ts-mini-av" style="background:${grad};overflow:hidden;display:flex;align-items:center;justify-content:center">${avHtml}</div>
        <div style="flex:1;min-width:0">
          <div class="ts-mini-name">${escHtml(displayName)}</div>
          <div class="ts-mini-role">${myRole === 'owner' ? '👑 Dono' : myRole === 'admin' ? '⭐ Admin' : '👥'} · ${t.members?.length || 0} mbr</div>
        </div>
        <div class="ts-mini-arr">›</div>
      </div>`;
    }).join('');
  }
}

window.createTeam = async function (injectedData) {
  const nameRaw = FormValidator.val('new-team-name');
  if (!nameRaw) { toast('Nome obrigatório!', 'error'); return; }

  const name = FormValidator.isName(nameRaw, 3, 40);
  if (name === null) return;

  const descRaw = FormValidator.val('new-team-desc');
  const desc = descRaw.substring(0, 500); // hard limit 500 chars

  // FASE 1 — Plan Engine: verifica limite de equipes antes de criar
  const _teamLimit = getLimit(currentUserData, 'maxTeams');
  const _ownedTeams = (_myTeams || []).filter(t =>
    t.members?.some(m => m.uid === currentUser?.uid && m.role === 'owner')
  );
  if (_ownedTeams.length >= _teamLimit) {
    const planName = getUserPlan(currentUserData).toUpperCase();
    toast(
      `Limite de equipes atingido (${_teamLimit} no plano ${planName}). Faça upgrade para criar mais.`,
      'error'
    );
    openPlansModal();
    return;
  }
  // P2-C: lê e normaliza o campo de gêneros musicais
  const genresRaw = FormValidator.val('new-team-genres');
  const genres = FormValidator.isTags(genresRaw, 10, 20);
  if (genres === null) return;

  const uid = currentUser.uid;
  const teamId = DB.uid();
  const inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();

  // 3. Payload Guard: Objeto explícito bloqueando campos extras + console log
  if ((injectedData || arguments.length > 0) && window._DEBUG_FORMS) {
    console.warn('[Payload Guard] Tentativa de injeção de parâmetros sujos via argument na função createTeam:', arguments);
  }

  const teamPayload = {
    id: teamId,
    name: name,
    description: desc,
    genres: genres,
    inviteCode: inviteCode,
    createdAt: new Date().toISOString(),
    createdBy: uid,
    memberUids: [uid], // v5.20.1
    members: [{
      uid: uid,
      name: currentUserData?.name || currentUser?.email || 'Membro',
      email: currentUser?.email || '',
      photoURL: currentUserData?.photoURL || '',
      role: 'owner',
      joinedAt: new Date().toISOString()
    }]
  };

  await setDoc(doc(db, 'teams', teamId), teamPayload);
  toast('🎉 Equipe criada!');
  _myTeams.push(teamPayload);
  enterTeam(teamId);
};

window.joinTeamByCode = async function () {
  const code = document.getElementById('join-team-code').value.trim().toUpperCase();
  if (!code) { toast('Insira um código', 'error'); return; }
  // Query filtrada por inviteCode — respeita security rules
  const snap = await getDocs(query(collection(db, 'teams'), where('inviteCode', '==', code)));
  const team = snap.docs.map(d => ({ id: d.id, ...d.data() }))[0];
  if (!team) { toast('Código inválido', 'error'); return; }
  await joinTeam(team);
};

async function joinTeam(team) {
  const uid = currentUser.uid;
  const teamRef = doc(db, 'teams', team.id);
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(teamRef);
      if (!snap.exists()) throw new Error('Equipe não encontrada.');
      const data = snap.data();
      const currentMembers = data.members || [];
      // Proteção contra duplicata — check atômico dentro da transação
      if (currentMembers.some(m => m.uid === uid)) {
        // Membro já existe — não lança erro, fluxo continua normalmente
        return;
      }
      const newMember = {
        uid,
        name: currentUserData?.name || currentUser?.email,
        email: currentUser?.email,
        photoURL: currentUserData?.photoURL || '',
        role: 'member',
        joinedAt: new Date().toISOString()
      };
      const updatedMembers = [...currentMembers, newMember];
      const updatedMemberUids = updatedMembers.map(m => m.uid);
      transaction.update(teamRef, {
        members: updatedMembers,
        memberUids: updatedMemberUids
      });
    });
    toast('✅ Você entrou na equipe!');
    enterTeam(team.id);
  } catch (e) {
    toast('Erro ao entrar na equipe: ' + e.message, 'error');
  }
}

window.enterTeam = function (teamId) {
  _currentTeamId = teamId;
  window._currentTeamId = teamId;
  window.appContext = 'team';  // contexto explícito antes de showMainApp()
  const team = _myTeams.find(t => t.id === teamId);
  localStorage.setItem('last_team_id', teamId);
  _teamYoutubeChannel = team?.youtubeChannel || null;
  // Update member role based on team
  if (team) {
    const myMember = team.members?.find(m => m.uid === currentUser?.uid);
    if (myMember) {
      const roleMap = { owner: 'admin', admin: 'admin', member: 'editor', viewer: 'viewer' }; // P2-B
      // Preserve photoURL when updating role (prevent photo disappearing on team switch)
      const _savedPhoto = currentUserData?.photoURL || '';
      currentUserData = { ...currentUserData, role: roleMap[myMember.role] || 'editor', teamId, photoURL: _savedPhoto };
    }
  }
  showTeamsScreen(false);
  showMainApp();
};

function showTeamsScreen(show) {
  document.getElementById('teams-screen').style.display = show ? 'flex' : 'none';
  if (show) renderTeamsScreenExtras();
}
window.showTeamsScreen = showTeamsScreen;

function showMainApp() {
  // showMainApp() é exclusivo do contexto de workspace (team).
  // Apenas enterTeam() deve chamá-la — nunca rotas staff ou global.
  window.appContext = 'team';

  document.getElementById('sidebar').style.display = 'flex';
  document.querySelector('.main-content').style.display = '';
  document.querySelector('.app').style.display = '';

  // BUGFIX: Marca body como logado para CSS condicional
  document.body.classList.add('logged-in');

  // DEBUG TEMPORÁRIO: loga posições dos containers para diagnóstico
  requestAnimationFrame(() => {
    const mc = document.querySelector('.main-content');
    const app = document.querySelector('.app');
    const lay = document.querySelector('.layout');
    console.log('[LAYOUT-DEBUG] showMainApp após rAF:', JSON.stringify({
      mcRect: mc?.getBoundingClientRect(),
      appRect: app?.getBoundingClientRect(),
      layRect: lay?.getBoundingClientRect(),
      mcScroll: { scrollTop: mc?.scrollTop, scrollHeight: mc?.scrollHeight },
      layScroll: { scrollTop: lay?.scrollTop, scrollHeight: lay?.scrollHeight },
      bodyScroll: { scrollTop: document.body.scrollTop, deScrollTop: document.documentElement.scrollTop }
    }));
  });

  // Atualiza nome da equipe na logo
  const team = _myTeams.find(t => t.id === _currentTeamId);
  if (team) {
    const sub = document.querySelector('.logo-sub');
    if (sub) sub.textContent = team.name;
  }

  // startListeners() só deve rodar em contexto 'team' com equipe válida.
  // Guard explícito evita abrir listeners em users/{uid}/projects
  // (que não existem no schema) quando chamado sem _currentTeamId.
  if (_currentTeamId) {
    startListeners();
  } else {
    console.warn('[Nav] showMainApp() chamado sem _currentTeamId — startListeners ignorado');
    hideLoading();
  }

  // P2-A: initNotifications é global — sem dependência de _currentTeamId
  if (currentUser) initNotifications();

  // Revela/esconde botões baseado no papel do usuário na equipe
  refreshVisibility();

  // BUGFIX: Reset agressivo de scroll ao entrar na equipe
  const mc = document.querySelector('.main-content');
  const lay = document.querySelector('.layout');
  if (mc) mc.scrollTop = 0;
  if (lay) lay.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo(0, 0);
  requestAnimationFrame(() => {
    if (mc) mc.scrollTop = 0;
    if (lay) lay.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });

  // Popula modal de convite com o código da equipe ativa
  const _activeTeam = _myTeams.find(t => t.id === _currentTeamId);
  const _invCodeEl = document.getElementById('modal-invite-code');
  if (_invCodeEl && _activeTeam) _invCodeEl.textContent = _activeTeam.inviteCode || '——';
}

window.acceptTeamInvite = async function () {
  if (!_pendingInviteTeamId) return;
  try {
    const teamSnap = await getDoc(doc(db, 'teams', _pendingInviteTeamId));
    if (!teamSnap.exists()) { toast('Equipe não encontrada', 'error'); return; }
    const team = { id: teamSnap.id, ...teamSnap.data() };
    _myTeams = [..._myTeams.filter(t => t.id !== team.id), team];
    window._myTeams = _myTeams;
    await joinTeam(team);
    document.getElementById('teams-invite-banner').style.display = 'none';
  } catch (e) {
    toast('Erro ao aceitar convite. Tente entrar com o código.', 'error');
  }
};

window.dismissTeamInvite = function () {
  document.getElementById('teams-invite-banner').style.display = 'none';
  _pendingInviteTeamId = null;
  _pendingInviteCode = null; // P1-C
  const url = new URL(window.location.href);
  url.searchParams.delete('code');    // novo param seguro
  url.searchParams.delete('invite');  // retrocompat com links antigos
  window.history.replaceState({}, '', url);
};

// ─── AUTH STATE OBSERVER ──────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  if (!user) {
    // Not logged in — show auth screen
    document.getElementById('auth-screen').style.display = 'block';
    document.getElementById('pending-screen').style.display = 'none';
    document.getElementById('teams-screen').style.display = 'none';
    const sb = document.getElementById('sidebar'); if (sb) sb.style.display = 'none';
    const mc = document.querySelector('.main-content'); if (mc) mc.style.display = 'none';
    document.querySelector('.app').style.display = 'none';
    // FIX: Reset profile caches on logout to prevent stale data on account switch
    window._myTalentProfile = null;
    window._adbCurrentProfile = null;
    currentUserData = null;
    hideLoading();
    return;
  }

  currentUser = user;
  window._appCurrentUser = user;
  showLoading('Carregando workspace...');
  document.getElementById('auth-screen').style.display = 'none';
  hideAuthPanel();

  // Get or create user doc — use getDoc (direct) to reliably get photoURL even when stored as base64
  let userData = null;
  try {
    const userSnap = await getDoc(doc(db, 'users', user.uid));
    if (userSnap.exists()) userData = userSnap.data();
  } catch (e) { }

  if (!userData) {
    userData = { uid: user.uid, name: user.displayName || user.email, email: user.email, role: 'member', plan: 'free', status: 'approved', discordId: null, createdAt: new Date().toISOString() };
    await setDoc(doc(db, 'users', user.uid), userData);
    // PATCH Plan Sync: inicializa talent_profiles.plan junto com users.plan
    _syncTalentPlan(user.uid, 'free').catch(() => { });
  }

  currentUserData = userData;

  // FASE 1 — Plan Engine: log diagnóstico do config efetivo no boot (dev/runtime validation)
  if (typeof getPlanConfig === 'function') {
    const _bootPlan = getUserPlan(currentUserData);
    const _bootConfig = getPlanConfig(_bootPlan);
    console.info(
      `[PlanEngine] uid=${userData.uid} | plan=${_bootPlan} | weight=${_bootConfig.weight}`,
      '\n  limits:', _bootConfig.limits,
      '\n  features:', _bootConfig.features
    );
  }

  // ── ETAPA 4: auto-refresh effectivePriority se campo ausente ──────────────
  // Usuários antigos não têm o campo. Fire-and-forget: não bloqueia o login.
  if (typeof userData.effectivePriority !== 'number') {
    refreshEffectivePriority(user.uid).catch(() => { });
  }
  // ── P1-C: URL invite usa ?code=INVITECODE (não ?invite=teamId) ──────────
  // Motivo: após P1-B a coleção teams só é legível por membros.
  // Expor o teamId na URL + GET público revelava o doc completo (incl. inviteCode).
  // O inviteCode é token opaco de 8 chars que autentica o acesso sem expor teamId.
  const urlParams = new URLSearchParams(window.location.search);
  const urlInviteCode = urlParams.get('code'); // novo parâmetro seguro

  // Load teams — usa loadMyTeams() com fallback robusto para equipes antigas (sem memberUids)
  await loadMyTeams();

  hideLoading();

  // Handle invite via ?code=
  if (urlInviteCode) {
    // Limpa param da URL imediatamente
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    window.history.replaceState({}, '', url);

    // Já é membro de uma equipe com esse código? Entra direto.
    const alreadyMemberTeam = _myTeams.find(t => t.inviteCode === urlInviteCode);
    if (alreadyMemberTeam) {
      enterTeam(alreadyMemberTeam.id);
      return;
    }

    // Não é membro: pré-preenche campo de código e tenta mostrar banner
    _pendingInviteCode = urlInviteCode;
    const codeInput = document.getElementById('join-team-code');
    if (codeInput) codeInput.value = urlInviteCode;

    // Busca equipe pelo código: usa query filtrada (security rules bloqueiam list sem filtro).
    // Como não somos membros ainda, tentamos buscar pelo inviteCode diretamente.
    // Se não conseguir, joinTeamByCode() faz o fallback.
    try {
      // Tenta via getDocs com filtro — retornará vazio se não for membro,
      // mas joinTeamByCode(urlInviteCode) resolve pelo servidor.
      toast('Digite o código acima e clique em Entrar para ingressar na equipe.');
    } catch (e) {
      toast('Cole o código acima e clique em Entrar para ingressar na equipe.');
    }
  }

  // Try to restore last team
  const lastTeamId = localStorage.getItem('last_team_id');
  if (lastTeamId && _myTeams.find(t => t.id === lastTeamId) && !urlInviteCode) {
    enterTeam(lastTeamId);
    return;
  }

  // If user has teams and no invite, go to teams screen
  document.getElementById('pending-screen').style.display = 'none';
  { const _s = document.getElementById('sidebar'); if (_s) _s.style.display = 'none'; }
  { const _m = document.querySelector('.main-content'); if (_m) _m.style.display = 'none'; }
  { const _a = document.querySelector('.app'); if (_a) _a.style.display = 'none'; }
  document.getElementById('teams-screen').style.display = 'flex';
  renderTeamsList();
  renderTeamsScreenExtras();
  // P2-A: initNotifications é global — inicia imediatamente após auth, sem precisar de teamId
  initNotifications();
  // Initialize PM and interest systems on teams screen
  pmInit();
  if (typeof intStartUserNotifListener === 'function') intStartUserNotifListener();
  setTimeout(() => {
    renderTeamsScreenExtras();
    if (typeof intUpdateBadges === 'function') intUpdateBadges();
  }, 1500);
});

function refreshCurrentPage() {
  if (currentPage === 'dashboard') loadDashboard();
  else if (currentPage === 'projects') renderAllProjects();
  else if (currentPage === 'analytics') loadAnalytics();
  else if (currentPage === 'collaborators') loadCollaborators();
  else if (currentPage === 'talents') loadTalentsPage();
  else if (currentPage === 'detail') { const id = document.getElementById('detail-content')?.dataset?.projectId; if (id) renderDetail(id); }
}

// ─── ROLES CATALOG ────────────────────────────────────────────────────────────
const ROLES_CATALOG = [
  { id: 'r_ideal', label: 'Idealização', icon: '💡' },
  { id: 'r_vocal', label: 'Vocais', icon: '🎤' },
  { id: 'r_letra', label: 'Letra', icon: '✍️' },
  { id: 'r_edit', label: 'Edição', icon: '🎬' },
  { id: 'r_mix', label: 'Mix & Master', icon: '🎚️' },
  { id: 'r_beat', label: 'Beat', icon: '🥁' },
  { id: 'r_ilus', label: 'Ilustração', icon: '🖼️' },
  { id: 'r_thumb', label: 'Thumb', icon: '🖼️' },
  { id: 'r_capa', label: 'Capa das Plataformas', icon: '💿' },
  { id: 'r_leg', label: 'Legendas do YouTube', icon: '💬' },
];

// ─── DB helpers ───────────────────────────────────────────────────────────────
const DB = {
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
  dataPath() {
    if (!_currentTeamId) {
      console.warn('[DB] dataPath() bloqueado: Nenhuma equipe ativa no contexto.');
      throw new Error('NO_ACTIVE_TEAM');
    }
    // Retorna explicitamente e apenas namespace da equipe. Fallback users banido.
    return ['teams', _currentTeamId];
  },
};

// ─── DEBUG HELPER: Detecta funções não definidas ─────────────────────────────
window.addEventListener('error', (e) => {
  if (e.message && e.message.includes('is not defined')) {
    console.error('⚠️ FUNÇÃO NÃO DEFINIDA:', e.message);
    console.error(`   Linha: ${e.lineno}, Coluna: ${e.colno}`);
    console.error('   Arquivo:', e.filename);
    // Mostra toast para o usuário
    if (typeof toast === 'function') {
      const funcName = e.message.match(/(\w+) is not defined/)?.[1];
      if (funcName) toast(`❌ Erro: função ${funcName} não encontrada`, 'error');
    }
  }
});

const DEFAULT_STAGES = [
  { id: 's1', label: 'Composição', icon: '🎼', status: 'pending', notes: '', completedAt: null, audioUrl: '', letra: '' },
  { id: 's2', label: 'Letra / Roteiro', icon: '✍️', status: 'pending', notes: '', completedAt: null, audioUrl: '', letra: '' },
  { id: 's3', label: 'Gravação Vocal', icon: '🎤', status: 'pending', notes: '', completedAt: null, audioUrl: '', letra: '' },
  { id: 's4', label: 'Beat / Instr.', icon: '🥁', status: 'pending', notes: '', completedAt: null, audioUrl: '', letra: '' },
  { id: 's5', label: 'Mix & Master', icon: '🎚️', status: 'pending', notes: '', completedAt: null, audioUrl: '', letra: '' },
  { id: 's6', label: 'Ilustração', icon: '🖼️', status: 'pending', notes: '', completedAt: null, audioUrl: '', letra: '' },
  { id: 's7', label: 'Thumb', icon: '🎨', status: 'pending', notes: '', completedAt: null, audioUrl: '', letra: '' },
  { id: 's8', label: 'Capa Plataformas', icon: '💿', status: 'pending', notes: '', completedAt: null, audioUrl: '', letra: '' },
  { id: 's9', label: 'Edição de Vídeo', icon: '🎬', status: 'pending', notes: '', completedAt: null, audioUrl: '', letra: '' },
  { id: 's10', label: 'Legendas / Sub', icon: '💬', status: 'pending', notes: '', completedAt: null, audioUrl: '', letra: '' },
  { id: 's11', label: 'Upload / Pub.', icon: '🚀', status: 'pending', notes: '', completedAt: null, audioUrl: '', letra: '' },
];

// ─── PROJECTS CRUD ───────────────────────────────────────────────────────────
function getProjects() { return _projects; }
function getProject(id) { return _projects.find(p => p.id === id); }

// Helper para tratar operações protegidas
function handleDbError(err, action) {
  if (err.message === 'NO_ACTIVE_TEAM') {
    if (typeof toast === 'function') toast(`Você precisa entrar em uma equipe para ${action}.`, 'error');
    console.warn(`[dataPath] BLOCK write (${action}): no active team`);
    return true; // was handled
  }
  throw err; // rethrow unknown
}

async function createProject(data) {
  try {
    const dp = DB.dataPath();
    // console.info(`[dataPath] teamId=${_currentTeamId}`); // desligado prod
    const id = DB.uid();
    const p = {
      id, title: data.title, theme: data.theme || '', description: data.description || '',
      link: data.link || '', imageUrl: data.imageUrl || '', status: data.status || 'active',
      targetDate: data.targetDate || null, collaborators: data.collaborators || [],
      bpm: data.bpm || '', key: data.key || '', mood: data.mood || '',
      starred: false, changelog: [{ msg: 'Projeto criado', ts: new Date().toISOString(), type: 'create' }],
      stages: JSON.parse(JSON.stringify(DEFAULT_STAGES)), createdAt: new Date().toISOString(), progress: 0
    };
    await setDoc(doc(db, ...dp, 'projects', id), p);

    // Criar notificação e log de atividade
    await createNotification('project', 'Novo projeto criado', `${currentUserData?.name || currentUser?.email} criou "${data.title}"`, { projectId: id });
    await logActivity('project-created', `criou "${data.title}"`, { projectId: id });

    // Webhook: notificar bot Discord sobre novo projeto (fire-and-forget)
    if (currentUserData?.discordId && typeof window._callNotifyBot === 'function') {
      window._callNotifyBot({
        type: 'PROJECT_CREATED',
        payload: { discordId: currentUserData.discordId, projectId: p.id, name: p.title }
      }).catch(e => console.warn('[Webhook] PROJECT_CREATED falhou:', e.message));
    }

    return p;
  } catch (err) { if (handleDbError(err, 'criar projetos')) return null; }
}

async function updateProject(id, data) {
  try {
    const dp = DB.dataPath();
    const p = getProject(id); if (!p) return null;

    // Sanitização rigorosa (Whitelist): Apenas campos primitivos do modal de edição são permitidos.
    const allowedKeys = ['title', 'theme', 'description', 'link', 'imageUrl', 'status', 'targetDate', 'bpm', 'key', 'mood'];
    const safeData = {};
    const droppedKeys = [];

    for (const [k, v] of Object.entries(data)) {
      if (!allowedKeys.includes(k) || v === undefined) {
        droppedKeys.push(k);
      } else {
        safeData[k] = v; // Firestore aceita null (se explícito) mas drop undefined. Arrays/Objetos banidos aqui.
      }
    }

    if (droppedKeys.length > 0) {
      console.warn(`[updateProject] Sanitization blocks: Ignoradas as keys [${droppedKeys.join(', ')}] enviadas no payload.`);
    }

    if (Object.keys(safeData).length > 0) {
      await updateDoc(doc(db, ...dp, 'projects', id), safeData);
    }

    // Retorna combinando localmente (Otimista para UI imediata não piscar).
    // O onSnapshot real garantirá update perfeito logo no próximo tic do servidor.
    return { ...p, ...safeData };
  } catch (err) { if (handleDbError(err, 'editar projetos')) return null; }
}

async function deleteProjectById(id) {
  try {
    const dp = DB.dataPath();
    await deleteDoc(doc(db, ...dp, 'projects', id));
  } catch (err) { handleDbError(err, 'deletar projetos'); }
}

async function updateStageStatus(projectId, stageId, status) {
  try {
    const dp = DB.dataPath();
    const docRef = doc(db, ...dp, 'projects', projectId);

    if (typeof showLoading === 'function') showLoading('Sincronizando status...');

    await runTransaction(db, async (transaction) => {
      const sfDoc = await transaction.get(docRef);
      if (!sfDoc.exists()) {
        throw new Error('Projeto não encontrado (foi excluído?).');
      }

      const pData = sfDoc.data();
      const stages = pData.stages || [];
      const stageIndex = stages.findIndex(x => x.id === stageId);

      if (stageIndex === -1) {
        throw new Error(`Estágio ${stageId} não encontrado no banco de dados.`);
      }

      const s = stages[stageIndex];
      const oldStatus = s.status;

      if (oldStatus === status) {
        return; // Nada a fazer (evita log fantasma)
      }

      // 1. Atualizar o estágio localmente na array pura da nuvem
      s.status = status;
      s.completedAt = status === 'done' ? new Date().toISOString() : null;

      // 2. Recalcular Progresso matematicamente
      const countable = stages.filter(x => x.status !== 'skipped');
      const progress = countable.length ? Math.round(countable.filter(x => x.status === 'done').length / countable.length * 100) : 0;
      // 3. Status Derivado
      const newStatus = progress === 100 ? 'completed' : (pData.status === 'completed' && progress < 100 ? 'active' : pData.status);

      // 4. Log com Unshift mantendo tamanho < 40 e LWW para a Aba B em concorrência
      const changelog = [...(pData.changelog || [])];
      const statusNames = { pending: 'Pendente', in_progress: 'Em Andamento', done: 'Concluído', skipped: 'Pulado' };
      const type = status === 'done' ? 'green' : status === 'in_progress' ? 'blue' : 'purple';

      changelog.unshift({
        msg: `${s.label}: ${statusNames[oldStatus] || oldStatus} → ${statusNames[status] || status}`,
        ts: new Date().toISOString(),
        type
      });
      if (changelog.length > 40) changelog.length = 40;

      // 5. O Firebase cuida da mescla ou Re-run automático caso a Letra Giga esteja salvando ao mesmo tempo
      transaction.update(docRef, {
        stages: stages,
        progress: progress,
        status: newStatus,
        changelog: changelog
      });
    });

    if (typeof hideLoading === 'function') hideLoading();
  } catch (err) {
    if (typeof hideLoading === 'function') hideLoading();
    // Tratamento nativo do dataPath ou Erros Específicos da Transação
    if (err.message === 'NO_ACTIVE_TEAM' || !err.message.includes('não encontrado')) {
      handleDbError(err, 'atualizar status');
    } else {
      console.warn(`[updateStageStatus] Transaction aborted: ${err.message}`);
      if (typeof toast === 'function') toast(`Não foi possível salvar: ${err.message}`, 'error');
    }
  }
}

async function updateStageAudio(projectId, stageId, audioUrl) {
  try {
    const dp = DB.dataPath();
    const p = getProject(projectId); if (!p) return;

    const stageIndex = (p.stages || []).findIndex(x => x.id === stageId);
    if (stageIndex === -1) {
      console.warn(`[updateStageAudio] BLOCK: Estágio ${stageId} não achado na memória doc id=${projectId}.`);
      if (typeof toast === 'function') toast('Erro interno: Estágio não localizado no projeto atual.', 'error');
      return;
    }

    const updatePayload = {
      [`stages.${stageIndex}.audioUrl`]: audioUrl || ''
    };

    await updateDoc(doc(db, ...dp, 'projects', projectId), updatePayload);
  } catch (err) { handleDbError(err, 'editar o projeto'); }
}

async function updateStageLetra(projectId, stageId, letra) {
  try {
    const dp = DB.dataPath();
    const p = getProject(projectId); if (!p) return;

    // 1) Guard Rail: Localiza index com destreza
    const stageIndex = (p.stages || []).findIndex(x => x.id === stageId);
    if (stageIndex === -1) {
      console.warn(`[updateStageLetra] BLOCK: Estágio ${stageId} não achado na memória doc id=${projectId}.`);
      if (typeof toast === 'function') toast('Erro interno: Estágio não localizado no projeto.', 'error');
      return;
    }

    // 2) Criação do Log sem corromper a array local de outra Aba
    const s = p.stages[stageIndex];
    const changelog = [...(p.changelog || [])];
    changelog.unshift({ msg: `${s?.label || 'Fase'}: letra/texto atualizado`, ts: new Date().toISOString(), type: 'blue' });
    if (changelog.length > 40) changelog.length = 40;

    // 3) Dot-Notation para Texto Longo (LWW na chave exata da array) + Array Sobrescrita para Logs Globais.
    const updatePayload = {
      [`stages.${stageIndex}.letra`]: letra || '',
      changelog: changelog // Como Logs precisam ser "unshifted", enviamos o log fresco mesclado por cima. O texto da letra só atira na chave própria.
    };

    await updateDoc(doc(db, ...dp, 'projects', projectId), updatePayload);
  } catch (err) { handleDbError(err, 'editar o projeto'); }
}

async function updateStageNote(projectId, stageId, notes) {
  try {
    const dp = DB.dataPath();
    const p = getProject(projectId); if (!p) return;

    // 1) Encontra o índice real do estágio na Array do banco
    const stageIndex = (p.stages || []).findIndex(x => x.id === stageId);
    if (stageIndex === -1) {
      console.warn(`[updateStageNote] Estágio ${stageId} não encontrado no projeto ${projectId}.`);
      return;
    }

    // 2) Dot-notation estrito: Atualiza SÓ o campo "notes" do índice X, sem tocar no array inteiro
    const updatePayload = {
      [`stages.${stageIndex}.notes`]: notes
    };

    await updateDoc(doc(db, ...dp, 'projects', projectId), updatePayload);
  } catch (err) { handleDbError(err, 'editar o projeto'); }
}

async function toggleStarProject(id) {
  try {
    const dp = DB.dataPath();
    const p = getProject(id); if (!p) return false;
    const starred = !p.starred;

    // Transação Puramente Parcial de 1 campo (Firestore não apaga nada ao redor)
    await updateDoc(doc(db, ...dp, 'projects', id), { starred });

    // Atualização otimista apenas na interface local
    p.starred = starred;
    return starred;
  } catch (err) { return handleDbError(err, 'favoritar projetos') ? false : false; }
}

// ─── COLLABORATORS CRUD ──────────────────────────────────────────────────────
function getCollabs() { return _collabs; }
function getCollab(id) { return _collabs.find(c => c.id === id); }

async function createCollab(data) {
  try {
    const dp = DB.dataPath();
    const id = DB.uid();
    const c = { id, name: data.name, roles: data.roles || [], contact: data.contact || '', inactive: data.inactive || false };
    await setDoc(doc(db, ...dp, 'collaborators', id), c);
    return c;
  } catch (err) { if (handleDbError(err, 'adicionar colaboradores')) return null; }
}

async function updateCollabById(id, data) {
  try {
    const dp = DB.dataPath();
    const c = getCollab(id); if (!c) return;

    // Sanitização vigorosa (Whitelist restrict)
    const allowedKeys = ['name', 'roles', 'contact', 'inactive'];
    const safeData = {};
    const droppedKeys = [];

    for (const [k, v] of Object.entries(data)) {
      if (!allowedKeys.includes(k) || v === undefined) {
        droppedKeys.push(k);
      } else {
        safeData[k] = v; // roles (Array) repassa limpo, pois a UI do form domina o state.
      }
    }

    if (droppedKeys.length > 0) {
      console.warn(`[updateCollab] Sanitization blocks: Ignoradas as keys [${droppedKeys.join(', ')}].`);
    }

    if (Object.keys(safeData).length > 0) {
      await updateDoc(doc(db, ...dp, 'collaborators', id), safeData);
    }

    // UI Otimista + Spread Local
    return { ...c, ...safeData };
  } catch (err) { handleDbError(err, 'editar colaboradores'); }
}

async function deleteCollabById(id) {
  try {
    const dp = DB.dataPath();
    await deleteDoc(doc(db, ...dp, 'collaborators', id));
    // Remove from all projects
    const batch = writeBatch(db);
    _projects.forEach(p => {
      if (p.collaborators?.some(ca => ca.collabId === id)) {
        const updated = { ...p, collaborators: p.collaborators.filter(ca => ca.collabId !== id) };
        batch.set(doc(db, ...dp, 'projects', p.id), updated);
      }
    });
    await batch.commit();
  } catch (err) { handleDbError(err, 'deletar colaboradores'); }
}

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentPage = 'dashboard', prevPage = 'dashboard', currentFilter = 'all', currentView = 'grid';

// Clock
setInterval(() => { const el = document.getElementById('sys-time'); if (el) el.textContent = new Date().toLocaleTimeString('pt-BR'); }, 1000);
{ const _el = document.getElementById('sys-time'); if (_el) _el.textContent = new Date().toLocaleTimeString('pt-BR'); }

// Restore sidebar state — Split B default: icon-only (collapsed)
(function () {
  const saved = localStorage.getItem('sidebar_collapsed');
  const isCollapsed = saved === null ? true : saved === '1';
  const sb = document.getElementById('sidebar');
  const mc = document.querySelector('.main-content');
  const btn = document.getElementById('sidebar-toggle-btn');
  if (isCollapsed) {
    if (sb) sb.classList.add('collapsed');
    if (mc) mc.style.marginLeft = '64px';
    if (btn) btn.innerHTML = '▶';
  } else {
    if (sb) sb.classList.remove('collapsed');
    if (mc) mc.style.marginLeft = '220px';
    if (btn) btn.innerHTML = '◀';
  }
})();

// Toast
function toast(msg, type = 'success') {
  const el = document.createElement('div'); el.className = `toast ${type}`; el.textContent = msg;
  document.getElementById('toasts').appendChild(el); setTimeout(() => el.remove(), 3400);
}
window.toast = toast;


// Helper: normaliza skills[r] que pode ser string ou {level:...}
function _getSkillStr(val) {
  if (!val) return '';
  if (typeof val === 'object') return val.level || '';
  return String(val);
}

// Nav
// ══════════════════════════════════════════════════════════════════════════════
// PAINEL MASTER — DRAWER LATERAL DIREITO
// Nunca altera _currentTeamId. Nunca chama showMainApp() nem startListeners().
// Nunca oculta teams-screen. Apenas desliza o drawer sobre a interface.
// ══════════════════════════════════════════════════════════════════════════════

let isMasterDrawerOpen = false;
let _masterTicketsUnsub = null;   // singleton listener
let _masterTicketFilter = 'all';
let _masterActiveTab = 'dashboard';

// toggleMasterDrawer() — abre/fecha o drawer como toggle.
// Aceita aba inicial opcional. Nunca altera contexto de equipe.
window.toggleMasterDrawer = function (tab) {
  if (!isStaff()) { toast('Acesso restrito a staff.', 'error'); return; }
  if (isMasterDrawerOpen) {
    _mdrClose();
  } else {
    _mdrOpen(tab);
  }
};

// Retrocompatibilidade: toggleMasterPanel agora redireciona para o drawer
window.toggleMasterPanel = function (tab) { window.toggleMasterDrawer(tab); };

function _mdrOpen(tab) {
  isMasterDrawerOpen = true;
  const dr = document.getElementById('master-drawer');
  const ov = document.getElementById('master-drawer-overlay');
  if (dr) dr.classList.add('mdr-open');
  if (ov) ov.classList.add('mdr-open');
  // Fechar ao pressionar Escape
  document.addEventListener('keydown', _mdrEscHandler);
  // Ativar aba (default: dashboard)
  mdrSwitchTab(tab || _masterActiveTab || 'dashboard');
  // Highlight no nav
  const navBtn = document.getElementById('ts-nav-admin-master');
  if (navBtn) navBtn.classList.add('ts-active');
}

function _mdrClose() {
  isMasterDrawerOpen = false;
  const dr = document.getElementById('master-drawer');
  const ov = document.getElementById('master-drawer-overlay');
  if (dr) dr.classList.remove('mdr-open');
  if (ov) ov.classList.remove('mdr-open');
  document.removeEventListener('keydown', _mdrEscHandler);
  // Destruir listener de tickets ao fechar
  _mdrStopTicketsListener();
  // Remover highlight no nav
  const navBtn = document.getElementById('ts-nav-admin-master');
  if (navBtn) navBtn.classList.remove('ts-active');
}

function _mdrEscHandler(e) {
  if (e.key === 'Escape' && isMasterDrawerOpen) _mdrClose();
}

// mdrSwitchTab(name) — troca aba interna do drawer
window.mdrSwitchTab = function (name) {
  _masterActiveTab = name;
  ['dashboard', 'tickets', 'overrides', 'workspace'].forEach(t => {
    const btn = document.getElementById('mdr-tab-' + t);
    const pan = document.getElementById('mdr-panel-' + t);
    if (btn) btn.classList.toggle('mdr-tab-active', t === name);
    if (pan) pan.classList.toggle('mdr-panel-visible', t === name);
  });
  if (name === 'dashboard') _mdrLoadDashboard();
  if (name === 'tickets') _mdrLoadTickets();
  if (name === 'overrides') masterLoadOverrides();
  // workspace: sem carregamento automático — botões disparam funções existentes
};

// mpSwitchTab — alias retrocompat para código que ainda chama mpSwitchTab
window.mpSwitchTab = function (name) { window.mdrSwitchTab(name); };

// ── Dashboard ─────────────────────────────────────────────────────────────────
function _mdrLoadDashboard() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('mdr-stat-users', '…'); set('mdr-stat-teams', '…'); set('mdr-stat-tickets', '…');

  getDocs(collection(db, 'users'))
    .then(s => set('mdr-stat-users', s.size))
    .catch(e => { console.warn('[MDR/users]', e.code); set('mdr-stat-users', 'ERR'); });
  getCountFromServer(collection(db, 'teams'))
    .then(s => set('mdr-stat-teams', s.data().count))
    .catch(e => { console.warn('[MDR/teams]', e.code); set('mdr-stat-teams', 'ERR'); });
  getDocs(query(collection(db, 'tickets'), where('status', '==', 'open')))
    .then(s => set('mdr-stat-tickets', s.size))
    .catch(e => { console.warn('[MDR/tickets]', e.code); set('mdr-stat-tickets', 'ERR'); });

  getDocs(query(collection(db, 'users'), where('staffRole', '!=', '')))
    .then(snap => {
      const el = document.getElementById('mdr-staff-list');
      if (!el) return;
      if (snap.empty) { el.textContent = 'Nenhum staff cadastrado.'; return; }
      el.innerHTML = snap.docs.map(d => {
        const u = d.data();
        return `<div style="padding:5px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between">
          <span style="font-family:var(--font-mono);font-size:11px">${escHtml(u.name || u.email || d.id)}</span>
          <span style="font-family:var(--font-mono);font-size:11px;color:var(--a1)">${escHtml(u.staffRole)}</span>
        </div>`;
      }).join('');
    })
    .catch(() => { const el = document.getElementById('mdr-staff-list'); if (el) el.textContent = 'Erro ao carregar staff.'; });

  const log = document.getElementById('mdr-activity-log');
  if (log) log.textContent = `Staff: ${currentUser?.email} · role: ${getStaffRole()} · ${new Date().toLocaleString('pt-BR')}`;
}

// Aplicar role de staff via drawer
window.mdrSetStaffRole = async function () {
  const inputVal = (document.getElementById('mdr-staff-uid')?.value || '').trim();
  const role = document.getElementById('mdr-staff-role')?.value || '';
  if (!inputVal) { toast('Informe o UID ou @username do usuário.', 'error'); return; }

  let actualUid = inputVal;

  if (inputVal.startsWith('@')) {
    const handleTag = inputVal.substring(1).toLowerCase();
    try {
      if (typeof showLoading === 'function') showLoading('Buscando usuário...');
      const q = query(collection(db, 'users'), where('handle', '==', handleTag));
      const snap = await getDocs(q);
      if (typeof hideLoading === 'function') hideLoading();

      if (snap.empty) {
        toast(`Usuário ${inputVal} não foi encontrado no banco.`, 'error');
        return;
      }
      actualUid = snap.docs[0].id;
    } catch (e) {
      if (typeof hideLoading === 'function') hideLoading();
      toast('Erro ao buscar usuário: ' + e.message, 'error');
      return;
    }
  }

  // Delega para função existente se disponível, senão faz diretamente
  if (typeof masterSetStaffRole === 'function') {
    // Copia valores para os inputs antigos se existirem, então chama
    const oldUid = document.getElementById('master-staff-uid');
    const oldRole = document.getElementById('master-staff-role');
    if (oldUid) oldUid.value = actualUid;
    if (oldRole) oldRole.value = role;
    masterSetStaffRole();
  } else {
    // Fallback direto
    const userRef = doc(db, 'users', actualUid);
    updateDoc(userRef, { staffRole: role })
      .then(() => { toast(role ? `Role "${role}" aplicada.` : 'Role removida.', 'success'); _mdrLoadDashboard(); })
      .catch(e => toast('Erro: ' + e.message, 'error'));
  }
};

// ── Tickets — listener singleton ───────────────────────────────────────────────
function _mdrLoadTickets() {
  const cont = document.getElementById('mdr-tickets-list');
  if (!cont) return;
  // Já tem listener ativo → só re-renderiza
  if (_masterTicketsUnsub) { _mdrRenderTickets(window._masterAllTickets || []); return; }

  cont.innerHTML = '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text3);padding:20px;text-align:center">Conectando...</div>';
  try {
    _masterTicketsUnsub = onSnapshot(
      query(collection(db, 'tickets'), orderBy('createdAt', 'desc')),
      snap => {
        window._masterAllTickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        _mdrRenderTickets(window._masterAllTickets);
        // Atualiza contador no dashboard se carregado
        const openCount = window._masterAllTickets.filter(t => t.status === 'open').length;
        const statEl = document.getElementById('mdr-stat-tickets');
        if (statEl) statEl.textContent = openCount;
      },
      err => {
        console.warn('[MDR/tickets listener]', err.code, err.message);
        if (cont) cont.innerHTML = `<div style="color:var(--red);font-family:var(--font-mono);font-size:11px;padding:10px">Erro: ${err.message}</div>`;
        _masterTicketsUnsub = null;
      }
    );
  } catch (e) {
    cont.innerHTML = `<div style="color:var(--red);font-family:var(--font-mono);font-size:11px;padding:10px">Erro ao conectar: ${e.message}</div>`;
  }
}

function _mdrRenderTickets(all) {
  _mdrApplyFilters(all);
}

// ── BUG 1 FIX: Normaliza campos de um ticket independente da origem ────────────
// Tickets criados via submitTicket:   { subject, body, userName, userEmail, userPlan, createdAt (ISO string) }
// Tickets criados via nsSubmitTicket: { title, description, name, email, createdAt (Firestore Timestamp) }
// Tickets legados variados podem ter subconjuntos de ambos.
function _tNormalize(t) {
  // Campos de texto: subject/body com fallbacks para variações de nomenclatura
  const subject = t.subject || t.title || '(sem assunto)';
  const body = t.body || t.description || t.desc || '';

  // Campos de usuário: userName/userEmail com fallbacks para name/email/authorName
  const userName = t.userName || t.name || t.authorName || t.userDisplayName || '';
  const userEmail = t.userEmail || t.email || t.authorEmail || '';
  const userPlan = t.userPlan || resolveUserPlan(t); // fallback: userPlan canônico → t.plan → 'free'

  // createdAt: pode ser ISO string, Firestore Timestamp { toDate() }, milissegundos (number), ou Date
  let createdAt = t.createdAt;
  if (createdAt && typeof createdAt === 'object' && typeof createdAt.toDate === 'function') {
    // Firestore Timestamp → ISO string
    createdAt = createdAt.toDate().toISOString();
  } else if (typeof createdAt === 'number') {
    // milissegundos → ISO string
    createdAt = new Date(createdAt).toISOString();
  } else if (createdAt instanceof Date) {
    createdAt = createdAt.toISOString();
  }
  // Se ainda for inválido (null, undefined, string vazia), usa data atual como fallback
  if (!createdAt || isNaN(new Date(createdAt))) {
    createdAt = new Date().toISOString();
  }

  return { ...t, subject, body, userName, userEmail, userPlan, createdAt };
}

// ── BUG 1 FIX: _tAgo robusto — nunca retorna NaN ─────────────────────────────
function _tAgoSafe(val) {
  try {
    // Aceita ISO string, Timestamp Firestore, number ou Date
    let d;
    if (val && typeof val === 'object' && typeof val.toDate === 'function') d = val.toDate();
    else if (typeof val === 'number') d = new Date(val);
    else d = new Date(val);
    const ms = Date.now() - d.getTime();
    if (isNaN(ms) || ms < 0) return 'agora';
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return m + 'm';
    if (m < 1440) return Math.floor(m / 60) + 'h';
    return Math.floor(m / 1440) + 'd';
  } catch { return '—'; }
}

// Aplica todos os filtros ativos (status + prioridade + categoria)
window._mdrApplyFilters = function (allOverride) {
  const cont = document.getElementById('mdr-tickets-list'); if (!cont) return;
  const all = allOverride || window._masterAllTickets || [];
  const fSt = _masterTicketFilter;
  const fPri = document.getElementById('mdr-fpri')?.value || '';
  const fCat = document.getElementById('mdr-fcat')?.value || '';

  // BUG 1 FIX: normaliza campos antes de filtrar e renderizar
  let tickets = all.map(_tNormalize);

  if (fSt && fSt !== 'all') tickets = tickets.filter(t => (t.status || 'open') === fSt);
  if (fPri) tickets = tickets.filter(t => { const p = t.priority; const np = (!p || p === 'normal') ? (p === 'urgent' ? 'urgent' : 'medium') : p; return np === fPri || p === fPri; });
  if (fCat) tickets = tickets.filter(t => t.category === fCat);

  if (!tickets.length) {
    cont.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-title">Nenhum ticket</div></div>';
    return;
  }

  const ic = { bug: '🐛', sugestao: '💡', financeiro: '💳', conta: '👤', duvida: '❓', pagamento: '💳', feature: '✨', outro: '📋' };
  const sTl = { open: 'Aberto', inprogress: 'Em andamento', waiting: 'Aguardando', resolved: 'Resolvido', closed: 'Fechado' };
  const sCl = { open: 'tbadge-open', inprogress: 'tbadge-inprogress', waiting: 'tbadge-waiting', resolved: 'tbadge-resolved', closed: 'tbadge-closed' };
  const pLl = { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente', normal: 'Média' };
  const pCl = { low: 'tpri-low', medium: 'tpri-medium', high: 'tpri-high', urgent: 'tpri-urgent', normal: 'tpri-medium' };

  cont.innerHTML = tickets.map(t => {
    const s = t.status || 'open';
    const p = _tNormPri(t.priority);
    const ago = _tAgoSafe(t.createdAt); // BUG 1 FIX: usa _tAgoSafe em vez de ago() inline
    const meta = [
      t.userName ? escHtml(t.userName) : '<span style="color:var(--text3)">(sem nome)</span>',
      t.userEmail ? escHtml(t.userEmail) : '<span style="color:var(--text3)">(sem email)</span>',
      (t.userPlan || 'free').toUpperCase(),
      '#' + t.id.slice(-6).toUpperCase(),
      ago + ' atrás',
    ].join(' · ');
    const preview = t.body ? escHtml(t.body) : '<span style="color:var(--text3)">(sem mensagem)</span>';
    return `
    <div class="ticket-item ${s === 'closed' || s === 'resolved' ? 'closed-ticket' : 'open-ticket'}"
         style="border-left:3px solid ${s === 'closed' ? 'rgba(255,255,255,.12)' : s === 'resolved' ? 'var(--green)' : s === 'inprogress' ? 'rgba(255,200,60,.6)' : s === 'waiting' ? 'rgba(180,138,255,.6)' : 'rgba(61,139,255,.5)'};border-radius:8px"
         onclick="openTicketDetail('${t.id}')">
      <div class="ticket-header-row">
        <span style="font-size:13px">${ic[t.category] || '📋'}</span>
        <span class="ticket-subject">${escHtml(t.subject)}</span>
        <span class="tbadge ${sCl[s] || 'tbadge-open'}">${sTl[s] || s}</span>
        <span class="tpri ${pCl[p] || 'tpri-medium'}">${pLl[p] || p}</span>
      </div>
      <div class="ticket-meta">${meta}</div>
      <div class="ticket-preview">${preview}</div>
    </div>`;
  }).join('');
};

window.mdrFilterTickets = function (filter, btn) {
  _masterTicketFilter = filter;
  document.querySelectorAll('[id^="mdrtf-"]').forEach(b => { b.style.borderColor = ''; b.style.color = ''; });
  if (btn) { btn.style.borderColor = 'var(--a1)'; btn.style.color = 'var(--a1)'; }
  _mdrApplyFilters();
};

// Alias retrocompat para código antigo que chama mpFilterTickets
window.mpFilterTickets = function (filter, btn) { window.mdrFilterTickets(filter, btn); };

function _mdrStopTicketsListener() {
  if (_masterTicketsUnsub) { _masterTicketsUnsub(); _masterTicketsUnsub = null; }
  window._masterAllTickets = [];
}

// Alias retrocompat
function _masterStopTicketsListener() { _mdrStopTicketsListener(); }

// ── Workspace — sem lógica interna ────────────────────────────────────────────
// masterExportWorkspace e masterImportWorkspace continuam existindo (chamados pelos botões)
// Não há _masterLoadWorkspace aqui pois não há carregamento necessário.

// masterExportWorkspace — usa equipe ativa se disponível, senão avisa.
// Não altera _currentTeamId. Lê apenas para exportar.
window.masterExportWorkspace = async function () {
  if (!currentUser) return;
  if (!_currentTeamId) { toast('Entre em uma equipe antes de exportar.', 'error'); return; }
  window.exportFirestoreData(); // delega para a função existente
};

// masterImportWorkspace — usa equipe ativa se disponível, senão avisa.
window.masterImportWorkspace = function (input) {
  if (!currentUser) return;
  if (!_currentTeamId) { toast('Entre em uma equipe antes de importar.', 'error'); input.value = ''; return; }
  window.importToFirestore(input); // delega para a função existente
};

// ── PLAN OVERRIDES ────────────────────────────────────────────────────────────

window.masterSetOverride = async function () {
  const rawId = (document.getElementById('mdr-override-uid')?.value || '').trim();
  const plan = document.getElementById('mdr-override-plan')?.value || 'pro';
  const daysStr = document.getElementById('mdr-override-days')?.value || '1';
  const note = (document.getElementById('mdr-override-note')?.value || '').trim();

  if (!rawId) { toast('Informe UID ou @handle.', 'error'); return; }

  try {
    const { collection, getDocs, query, where, limit, doc, updateDoc, Timestamp } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
    let targetUid = rawId;

    if (rawId.startsWith('@')) {
      const hStr = rawId.substring(1).toLowerCase();
      const q = query(collection(db, 'users'), where('handle', '==', hStr), limit(1));
      const snap = await getDocs(q);
      if (snap.empty) { throw new Error('Handle não encontrado.'); }
      targetUid = snap.docs[0].id;
    }

    const start = new Date();
    const end = new Date(start.getTime() + (parseInt(daysStr, 10) * 24 * 60 * 60 * 1000));

    const po = {
      plan,
      startsAt: Timestamp.fromDate(start),
      expiresAt: Timestamp.fromDate(end),
      grantedBy: currentUser?.uid || 'admin',
      note
    };

    console.log('[Override] Aplicando em:', targetUid);
    console.log('[Override] Path:', `users/${targetUid}`);
    console.log('[Override] Payload:', po);

    await updateDoc(doc(db, 'users', targetUid), { planOverride: po });

    // Sync em talent_profiles para a UI de buscas mostrar direto:
    if (typeof _syncTalentPlan === 'function') {
      await _syncTalentPlan(targetUid, plan);
    }

    // Webhook: notificar bot Discord sobre mudança de plano (fire-and-forget)
    try {
      const targetSnap = await getDoc(doc(db, 'users', targetUid));
      const targetDiscordId = targetSnap.data()?.discordId;
      if (targetDiscordId && typeof window._callNotifyBot === 'function') {
        window._callNotifyBot({
          type: 'PLAN_CHANGED',
          payload: { discordId: targetDiscordId, newPlan: plan }
        }).catch(e => console.warn('[Webhook] PLAN_CHANGED falhou:', e.message));
      }
    } catch (e) { console.warn('[Webhook] Erro ao buscar discordId:', e.message); }

    // Dispara refresh local caso tenha aplicado em si mesmo (ou aberto popup)
    if (typeof refreshPlanUI === 'function') setTimeout(refreshPlanUI, 50);

    toast(`Override ${plan.toUpperCase()} ativado até ${end.toLocaleDateString('pt-BR')}!`, 'success');

    const uidEl = document.getElementById('mdr-override-uid');
    const noteEl = document.getElementById('mdr-override-note');
    if (uidEl) uidEl.value = '';
    if (noteEl) noteEl.value = '';

    masterLoadOverrides();
  } catch (err) {
    toast('Erro: ' + err.message, 'error');
  }
};

window.masterLoadOverrides = async function () {
  const el = document.getElementById('mdr-overrides-list');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:10px;font-size:12px;color:var(--text3)">Buscando...</div>';

  try {
    const { collection, getDocs, query, orderBy } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");

    // Na ausência de índice composto, users com planOverride devem ser uma fração mínima.
    const snap = await getDocs(query(collection(db, 'users'), orderBy('planOverride.expiresAt', 'desc')));

    if (snap.empty) {
      el.innerHTML = '<div style="text-align:center;padding:10px;font-size:12px;color:var(--text3)">Nenhum override encontrado.</div>';
      return;
    }

    const now = new Date();
    el.innerHTML = snap.docs.map(d => {
      const u = d.data();
      if (!u.planOverride) return '';
      // Firestore Timestamp → Date object
      const expDate = u.planOverride.expiresAt?.toDate ? u.planOverride.expiresAt.toDate() : new Date(u.planOverride.expiresAt);
      const isExpired = expDate < now;
      const op = u.planOverride.plan;
      const noteHtml = u.planOverride.note ? `<div style="font-size:10px;color:var(--text3);margin-top:2px">📝 ${window.escHtml(u.planOverride.note)}</div>` : '';

      return `
        <div style="background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:10px;margin-bottom:8px;opacity:${isExpired ? '0.6' : '1'}">
           <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <div style="font-family:var(--font-body);font-size:13px;font-weight:600">
                ${window.escHtml(u.name || d.id)}
                <span style="font-size:10px;color:var(--text3);margin-left:4px">@${u.handle || '?'}</span>
              </div>
              <span class="tbadge ${isExpired ? 'tbadge-closed' : 'tbadge-open'}">${isExpired ? 'EXPIRADO' : 'ATIVO'}</span>
           </div>
           
           <div style="font-family:var(--font-mono);font-size:11px;color:var(--text2);margin-bottom:8px">
              <b>Plano:</b> ${(window.renderPlanInlineChip ? window.renderPlanInlineChip(op) : op.toUpperCase())}<br>
              <b>Expira:</b> ${expDate.toLocaleString('pt-BR')}<br>
              <b>Base:</b> ${u.plan || 'free'}
           </div>
           ${noteHtml}
           <div style="display:flex;gap:6px;margin-top:10px">
              ${!isExpired ? `<button class="btn btn-ghost btn-sm" onclick="masterSetOverrideValue('${u.handle ? '@' + u.handle : d.id}', '${op}', prompt('Estender por quantos dias?', '7') || '0', '${u.planOverride.note || ''}')" style="font-size:10px;padding:3px 8px">⏰ Estender</button>` : ''}
              <button class="btn btn-ghost btn-sm" onclick="masterRemoveOverride('${d.id}', '${u.plan || 'free'}')" style="color:var(--red);border-color:var(--red);font-size:10px;padding:3px 8px">🗑 Remover</button>
           </div>
        </div>
      `;
    }).join('');

    if (el.innerHTML.trim() === '') {
      el.innerHTML = '<div style="text-align:center;padding:10px;font-size:12px;color:var(--text3)">Nenhum override ativo encontrado.</div>';
    }
  } catch (e) {
    if (e.message.includes("requires an index")) {
      el.innerHTML = `<div style="padding:10px;font-size:12px;color:var(--yellow)">⚠️ Requer índice Firestore: \n${e.message}</div>`;
      console.error("Index necessário para overrides:", e.message);
    } else {
      el.innerHTML = `<div style="text-align:center;padding:10px;font-size:12px;color:var(--red)">Erro: ${e.message}</div>`;
    }
  }
};

window.masterRemoveOverride = async function (uid, basePlan) {
  if (!confirm('Tem certeza que deseja remover o override e voltar o usuário ao plano base?')) return;
  try {
    const { doc, updateDoc, deleteField } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
    await updateDoc(doc(db, 'users', uid), { 'planOverride': deleteField() });

    if (typeof _syncTalentPlan === 'function') {
      await _syncTalentPlan(uid, basePlan);
    }

    // Dispara refresh local caso tenha removido de si mesmo
    if (typeof refreshPlanUI === 'function') setTimeout(refreshPlanUI, 50);

    toast('Override removido com sucesso!', 'success');
    masterLoadOverrides();
  } catch (e) {
    toast('Erro: ' + e.message, 'error');
  }
};

window.masterSetOverrideValue = function (idStr, plan, days, note) {
  const d = parseInt(days, 10);
  if (isNaN(d) || d <= 0) return; // User cancelado

  const elUid = document.getElementById('mdr-override-uid');
  const elPlan = document.getElementById('mdr-override-plan');
  const elNote = document.getElementById('mdr-override-note');
  const elDays = document.getElementById('mdr-override-days');

  if (![1, 7, 30, 90, 365].includes(d)) {
    const opt = document.createElement('option');
    opt.value = d;
    opt.text = d + ' Dias';
    elDays.add(opt);
  }

  if (elUid) elUid.value = idStr;
  if (elPlan) elPlan.value = plan;
  if (elDays) elDays.value = d;
  if (elNote) elNote.value = note || '';

  document.getElementById('mdr-panel-overrides')?.scrollTo({ top: 0, behavior: 'smooth' });
};

function showPage(name) {
  prevPage = currentPage; currentPage = name;

  // Dynamic pages (notifications, activities) replace .main-content innerHTML directly.
  // When leaving them, we need to restore the .app container visibility.
  const dynamicPages = ['notifications', 'activities'];
  const wasOnDynamicPage = dynamicPages.includes(prevPage);
  const goingToDynamicPage = dynamicPages.includes(name);

  if (wasOnDynamicPage && !goingToDynamicPage) {
    // Restore the .app div — it was hidden by dynamic page render
    const appEl = document.querySelector('.app');
    if (appEl) appEl.style.display = '';
    // Hide the overlay
    const overlay = document.getElementById('dynamic-page-overlay');
    if (overlay) overlay.style.display = 'none';
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');
  // Update sidebar nav active state
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const nb = document.getElementById('nav-' + name);
  if (nb) nb.classList.add('active');
  if (name === 'dashboard') loadDashboard();
  if (name === 'projects') loadAllProjects();
  if (name === 'analytics') loadAnalytics();
  if (name === 'collaborators') loadCollaborators();
  if (name === 'support') loadMyTickets();
  // admin-tickets e admin-master são agora abas internas do Painel Master.
  // Não disparam loaders aqui — toggleMasterPanel() + mpSwitchTab() gerenciam tudo.
  if (name === 'productivity') initProductivityPage();
  if (name === 'talents') loadTalentsPage();
  if (name === 'notifications') loadNotificationsPage();
  if (name === 'activities') loadActivitiesPage();
  if (name === 'team-settings') loadTeamSettingsPage();
  // Close mobile sidebar
  document.getElementById('sidebar')?.classList.remove('open');

  // Re-aplica visibilidade dos botões baseada em permissões
  refreshVisibility();

  // BUGFIX: Reseta scroll de TODOS os containers para forçar conteúdo ao topo.
  // O offset de ~100vh era causado por scroll residual herdado do landing page
  // que persistia em containers intermediários (layout/body/html) mesmo com overflow:hidden.
  const mc = document.querySelector('.main-content');
  const lay = document.querySelector('.layout');
  if (mc) mc.scrollTop = 0;
  if (lay) lay.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo(0, 0);
  // Garante reset após reflow (caso styles sejam aplic. async)
  requestAnimationFrame(() => {
    if (mc) mc.scrollTop = 0;
    if (lay) lay.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
}

/**
 * Atualiza a visibilidade de todos os elementos protegidos (admin-only, etc)
 * com base nas permissões atuais do usuário na equipe ativa.
 */
function refreshVisibility() {
  const _admin = canAdmin();
  const _create = hasPerm('perm_create_project');

  // 1. Botão "Novo Projeto" (pode ser admin ou editor)
  const btnNew = document.getElementById('btn-new-project');
  if (btnNew) btnNew.style.display = _create ? '' : 'none';

  // 2. Todos os outros elementos 'admin-only' genéricos
  document.querySelectorAll('.admin-only').forEach(el => {
    // Se for o botão de novo projeto que já tratamos por ID, pula
    if (el.id === 'btn-new-project') return;

    // Outros botões específicos podem ser adicionados aqui
    const isInviteBtn = el.textContent?.includes('Convidar');
    el.style.display = (isInviteBtn ? _admin : _admin) ? '' : 'none';
  });

  // console.info('[Visibility]', currentUserData?.role, _admin, _create); // desligado prod
}

function showPageChecked(name, requiredPlan) {
  if (canAdmin()) { showPage(name); return; }
  if (currentUserData?.role === 'viewer') { toast('Acesso restrito — role Viewer não tem permissão para esta página.', 'error'); return; } // P2-B
  const planOrder = { free: 0, pro: 1, advanced: 2 };
  const userPlan = resolveUserPlan(currentUserData);
  if (planOrder[userPlan] < planOrder[requiredPlan]) {
    openPlansModal();
    return;
  }
  showPage(name);
}

function goBack() {
  showPage(['dashboard', 'projects', 'analytics', 'collaborators'].includes(prevPage) ? prevPage : 'dashboard');
}

// Utils
const statusLabel = s => ({ active: 'Ativo', completed: 'Lançado', paused: 'Pausado', cancelled: 'Cancelado' }[s] || s);
function formatDate(d) { if (!d) return ''; return new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR'); }
function daysUntil(d) { if (!d) return null; return Math.ceil((new Date(d + 'T00:00:00') - new Date()) / 86400000); }
function deadlineClass(d) { const n = daysUntil(d); if (n === null) return ''; return (n < 0 || n <= 7) ? 'deadline-urgent' : n <= 14 ? 'deadline-soon' : ''; }
function escHtml(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function roleName(id) { return ROLES_CATALOG.find(r => r.id === id)?.label || id; }
function roleIcon(id) { return ROLES_CATALOG.find(r => r.id === id)?.icon || ''; }

// Image lazy load
function lazyLoadImages() {
  document.querySelectorAll('[data-bg-src]').forEach(el => {
    const src = el.dataset.bgSrc; if (!src) return; delete el.dataset.bgSrc;
    const img = new Image();
    img.onload = () => { el.style.backgroundImage = `url('${src}')`; requestAnimationFrame(() => el.classList.add('loaded')); };
    img.onerror = () => { el.style.display = 'none'; };
    img.src = src;
  });
}

// ─── PROJECT CARD ─────────────────────────────────────────────────────────────
function projectCardHTML(p) {
  const collabs = getCollabs();
  const stageDots = (p.stages || []).map(s => `<div class="stage-dot ${s.status}" title="${escHtml(s.label)}"></div>`).join('');
  const collabChips = (p.collaborators || []).map(ca => {
    const c = collabs.find(x => x.id === ca.collabId); if (!c) return '';
    const rl = (ca.roles || []).map(r => roleName(r)).join(', ');
    return `<span class="collab-chip">${escHtml(c.name)}${rl ? ' · ' + escHtml(rl) : ''}</span>`;
  }).filter(Boolean).join('');
  const dClass = p.targetDate ? deadlineClass(p.targetDate) : '';
  const dDays = p.targetDate ? daysUntil(p.targetDate) : null;
  const dLabel = dDays !== null ? (dDays < 0 ? `⚠ Atrasado ${Math.abs(dDays)}d` : dDays === 0 ? '⚡ Hoje!' : `${dDays}d restantes`) : '';
  const imgBg = p.imageUrl ? `<div class="project-card-img" data-bg-src="${escHtml(p.imageUrl)}"></div>` : '';
  const listStyle = currentView === 'list' ? 'display:flex;align-items:center;gap:18px;padding:14px 18px;' : '';
  const daysActive = p.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(p.createdAt)) / 86400000)) : 0;
  const techTagsHTML = [
    p.bpm ? `<span class="tech-tag bpm">♩ ${escHtml(p.bpm)} BPM</span>` : '',
    p.key ? `<span class="tech-tag key">🎵 ${escHtml(p.key)}</span>` : '',
    p.mood ? `<span class="tech-tag mood" style="border-color:${(p.moodColor || "#c261ff")}44;color:${p.moodColor || "#c261ff"};background:${p.moodColor || "#c261ff"}11">✦ ${escHtml(p.mood)}</span>` : '',
  ].filter(Boolean).join('');
  return `
  <div class="card project-card" onclick="openProjectDetail('${p.id}')" style="${listStyle}">
    ${imgBg}
    <div class="project-card-header" style="${currentView === 'list' ? 'margin:0;flex:1' : ''}">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px">
          <div class="project-title" class="u-flex1">${escHtml(p.title)}</div>
          <button class="star-btn${p.starred ? ' starred' : ''}" onclick="event.stopPropagation();handleStarCard('${p.id}',this)" title="${p.starred ? 'Remover favorito' : 'Favoritar'}">★</button>
        </div>
        ${p.theme ? `<div class="project-theme">// ${escHtml(p.theme)}</div>` : ''}
        ${p.targetDate ? `<div class="target-date ${dClass}">🗓 ${formatDate(p.targetDate)}${dLabel ? ' · ' + dLabel : ''}</div>` : ''}
      </div>
      <span class="status-badge status-${p.status}" style="margin-left:8px">${statusLabel(p.status)}</span>
    </div>
    ${currentView !== 'list' ? `
    ${techTagsHTML ? `<div class="tech-tags">${techTagsHTML}</div>` : ''}
    <div class="progress-wrap">
      <div class="progress-label"><span>Progresso</span><span>${p.progress || 0}%</span></div>
      <div class="progress-bar-bg"><div class="progress-bar-fill" style="width:${p.progress || 0}%"></div></div>
    </div>
    <div class="stages-mini">${stageDots}</div>
    ${collabChips ? `<div class="collab-chips" style="margin-top:10px">${collabChips}</div>` : ''}
    <div style="margin-top:8px"><span class="days-badge">⏱ ${daysActive}d em produção</span></div>
    `: `<div style="display:flex;align-items:center;gap:8px;margin-left:auto"><span class="days-badge">⏱${daysActive}d</span><span style="font-family:var(--font-mono);font-size:12px;color:var(--a2)">${p.progress || 0}%</span></div>`}
  </div>`;
}

function handleStarCard(id, btn) {
  toggleStarProject(id).then(starred => btn.classList.toggle('starred', starred));
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function loadDashboard() {
  const ps = getProjects(); const cs = getCollabs();

  // Stats
  document.getElementById('stat-total').textContent = ps.length;
  document.getElementById('stat-active').textContent = ps.filter(p => p.status === 'active').length;
  document.getElementById('stat-completed').textContent = ps.filter(p => p.status === 'completed').length;
  document.getElementById('stat-collabs').textContent = cs.filter(c => !c.inactive).length;
  renderAdminPanel();

  // Header greeting
  const team = _myTeams.find(t => t.id === _currentTeamId);
  const uname = currentUserData?.name || currentUser?.displayName || '';
  const greetEl = document.getElementById('dash-greeting');
  const eyebrowEl = document.getElementById('dash-eyebrow');
  const dateEl = document.getElementById('dash-date');
  if (greetEl && uname) {
    const first = uname.split(' ')[0];
    greetEl.innerHTML = `Olá, <em style="font-style:italic;color:var(--a3)">${escHtml(first)}.</em>`;
  }
  if (eyebrowEl && team) eyebrowEl.textContent = `// ${team.name.toUpperCase()} · DASHBOARD`;
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Numbered project list (Split B style)
  // P3-C: Mostra projetos favoritos (starred) em destaque. Se não há starred, exibe os 8 mais recentes.
  const listCont = document.getElementById('dashboard-projects-list');
  if (listCont) {
    const statusColors = { active: 'var(--green)', completed: 'var(--a2)', paused: 'var(--yellow)', cancelled: 'var(--red)' };
    const statusLabels = { active: 'Ativo', completed: 'Lançado', paused: 'Pausado', cancelled: 'Cancelado' };
    const starredPs = ps.filter(p => p.starred === true);
    const recentPs = starredPs.length ? starredPs.slice(0, 8) : ps.slice(0, 8);
    const listLabel = document.getElementById('dashboard-projects-label');
    if (listLabel) listLabel.textContent = starredPs.length ? '⭐ Projetos em Destaque' : '🎵 Projetos Recentes';
    if (!recentPs.length) {
      listCont.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎵</div><div class="empty-state-title">Nenhum projeto ainda</div><div class="empty-state-text">Crie seu primeiro projeto!</div></div>';
    } else {
      listCont.innerHTML = recentPs.map((p, i) => {
        const pct = p.progress || 0;
        const color = statusColors[p.status] || 'var(--text2)';
        const tags = [p.theme, p.status && statusLabels[p.status]].filter(Boolean);
        return `<div style="display:grid;grid-template-columns:44px 1fr 14px 60px;align-items:center;gap:14px;
          padding:14px 8px;border-bottom:1px solid var(--border);cursor:pointer;
          transition:padding-left 0.15s,background 0.15s;border-radius:6px"
          onclick="openProjectDetail('${p.id}')"
          onmouseover="this.style.paddingLeft='16px';this.style.background='rgba(255,60,180,0.03)'"
          onmouseout="this.style.paddingLeft='8px';this.style.background=''">
          <div style="font-family:var(--font-display);font-size:18px;color:var(--text3);font-style:italic;text-align:right">
            ${String(i + 1).padStart(2, '0')}
          </div>
          <div>
            <div style="font-family:var(--font-body);font-size:14px;font-weight:600;color:var(--text)">${escHtml(p.title)}</div>
            <div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap">
              ${tags.map(t => `<span style="font-family:var(--font-mono);font-size:9px;letter-spacing:1px;padding:2px 7px;border:1px solid var(--border2);color:var(--text2);text-transform:uppercase;border-radius:4px">${escHtml(t)}</span>`).join('')}
            </div>
          </div>
          <div style="width:8px;height:8px;border-radius:50%;background:${color};box-shadow:0 0 5px ${color}"></div>
          <div style="text-align:right">
            <div style="font-family:var(--font-display);font-size:22px;font-weight:700;color:${color}">${pct}%</div>
            <div style="font-family:var(--font-mono);font-size:8px;color:var(--text2)">concluído</div>
          </div>
        </div>`;
      }).join('');
    }
  }

  // Right panel: team members
  const membersEl = document.getElementById('dash-team-members');
  if (membersEl && team) {
    const roleLabel = { owner: '👑 Dono', admin: '⭐ Admin', member: '👤 Membro', viewer: '👁 Viewer', editor: '✏️ Editor' }; // P2-B
    const roleColor = { owner: 'var(--yellow)', admin: 'var(--a2)', member: 'var(--text2)' };
    membersEl.innerHTML = (team.members || []).map(m => {
      const isMe = m.uid === currentUser?.uid;
      const photo = isMe ? (currentUserData?.photoURL || m.photoURL || '') : (m.photoURL || '');
      const name = isMe ? (currentUserData?.name || m.name || m.email || '?') : (m.name || m.email || '?');
      const role = m.role || 'member';
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border);cursor:pointer"
        onclick="openMemberProfile('${m.uid}', event)">
        <div class="user-avatar" style="width:32px;height:32px;font-size:12px;flex-shrink:0;${photo ? 'background:none;' : ''}">
          ${photo ? `<img src="${escHtml(photo)}" class="u-avatar-img">` : (name[0] || '?').toUpperCase()}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--font-body);font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(name)}</div>
          <div style="font-family:var(--font-mono);font-size:9px;color:${roleColor[role]};margin-top:1px">${roleLabel[role] || role}</div>
        </div>
      </div>`;
    }).join('');
    const myMember = (team.members || []).find(m => m.uid === currentUser?.uid);
    const myRole = myMember?.role || 'member';
    const isOwner = myRole === 'owner';
    const isAdminPlus = ['owner', 'admin'].includes(myRole);
    const invCard = document.getElementById('dash-invite-card');
    const invBtn = document.getElementById('dash-invite-btn');
    const invBtn2 = document.getElementById('dash-invite-btn2');
    if (invCard) invCard.style.display = isOwner ? 'block' : 'none';
    if (invBtn) invBtn.style.display = isAdminPlus ? 'inline-flex' : 'none';
    if (invBtn2) invBtn2.style.display = isAdminPlus ? 'flex' : 'none';
    const codeEl = document.getElementById('dash-invite-code');
    if (codeEl && isOwner) codeEl.textContent = team.inviteCode || '——';
  }

  // Deadlines
  const soon = ps.filter(p => p.targetDate && p.status === 'active' && daysUntil(p.targetDate) !== null && daysUntil(p.targetDate) <= 14)
    .sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));
  const sec = document.getElementById('deadline-section');
  if (soon.length) {
    sec.style.display = 'block';
    document.getElementById('deadline-list').innerHTML = soon.map(p => {
      const d = daysUntil(p.targetDate); const cls = (d < 0 || d <= 7) ? 'deadline-urgent' : 'deadline-soon';
      const lbl = d < 0 ? `Atrasado ${Math.abs(d)}d` : d === 0 ? 'Hoje!' : `${d} dias`;
      return `<div class="card" style="padding:12px 16px;margin-bottom:8px;cursor:pointer;display:flex;align-items:center;gap:16px" onclick="openProjectDetail('${p.id}')">
        <span style="flex:1;font-family:var(--font-body);font-size:13px;font-weight:600">${escHtml(p.title)}</span>
        <span style="font-family:var(--font-mono);font-size:9px;color:var(--text2)">${formatDate(p.targetDate)}</span>
        <span class="${cls}" style="font-family:var(--font-mono);font-size:10px">⏱ ${lbl}</span>
      </div>`;
    }).join('');
  } else sec.style.display = 'none';

  // ─── INSIGHTS CHARTS ─────────────────────────────
  renderDashboardCharts(ps);
}

// ─── DASHBOARD CHARTS ─────────────────────────────────────────────────────────
let _dashCharts = {};
function renderDashboardCharts(ps) {
  if (!ps || !ps.length) {
    document.getElementById('dashboard-insights').style.display = 'none';
    return;
  }
  document.getElementById('dashboard-insights').style.display = '';

  const labels = ps.map(p => p.title.length > 14 ? p.title.slice(0, 12) + '…' : p.title);
  const chartBase = {
    responsive: true, maintainAspectRatio: true,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#7a70a8', font: { size: 9, family: 'Fira Code' }, maxRotation: 30 }, grid: { color: 'rgba(42,32,80,0.3)' } },
      y: { ticks: { color: '#7a70a8', font: { size: 9, family: 'Fira Code' } }, grid: { color: 'rgba(42,32,80,0.3)' } },
    },
  };

  // Chart: Progress per project (disponível para todos os planos)
  const progressData = ps.map(p => p.progress || 0);
  const progressColors = progressData.map(v => v >= 100 ? 'rgba(57,255,143,0.7)' : v >= 50 ? 'rgba(255,107,61,0.7)' : 'rgba(255,60,180,0.7)');
  ['dash-chart-progress', 'dash-chart-days', 'dash-chart-status', 'dash-chart-stages'].forEach(id => {
    _dashCharts[id]?.destroy();
  });
  const ctxP = document.getElementById('dash-chart-progress')?.getContext('2d');
  if (ctxP) _dashCharts['dash-chart-progress'] = new Chart(ctxP, {
    type: 'bar',
    data: { labels, datasets: [{ data: progressData, backgroundColor: progressColors, borderColor: 'rgba(61,139,255,0.9)', borderWidth: 1, borderRadius: 4 }] },
    options: {
      ...chartBase, plugins: { ...chartBase.plugins, tooltip: { callbacks: { label: ctx => `${ctx.raw}% concluído` } } },
      scales: { ...chartBase.scales, y: { ...chartBase.scales.y, min: 0, max: 100 } }
    }
  });

  // ── PLAN GATE: Charts avançados requerem hasFullDashboard + hasAdvancedCharts ──
  const _canFullDash = hasFeature(currentUserData, 'hasFullDashboard');
  const _canAdvCharts = hasFeature(currentUserData, 'hasAdvancedCharts');

  // Elementos dos charts avançados
  const advancedChartIds = ['dash-chart-days', 'dash-chart-status', 'dash-chart-stages'];
  const advChartsParent = document.getElementById('dashboard-insights');

  // Remove banner anterior, se existir
  advChartsParent?.querySelector('.plan-upgrade-insight-banner')?.remove();

  if (!_canFullDash || !_canAdvCharts) {
    // Esconde canvas dos charts avançados
    advancedChartIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.closest('.card, [style]')?.style && (el.style.display = 'none');
    });
    // Mostra banner de upgrade elegante
    if (advChartsParent) {
      const banner = document.createElement('div');
      banner.className = 'plan-upgrade-insight-banner';
      banner.innerHTML = `
        <div style="background:linear-gradient(135deg,rgba(124,58,237,0.12),rgba(61,139,255,0.08));
                    border:1px solid rgba(139,92,246,0.3);border-radius:14px;padding:24px 20px;margin-top:16px;
                    text-align:center;cursor:pointer;transition:border-color 0.2s"
             onclick="openPlansModal()"
             onmouseover="this.style.borderColor='rgba(139,92,246,0.6)'"
             onmouseout="this.style.borderColor='rgba(139,92,246,0.3)'">
          <div style="font-size:22px;margin-bottom:8px">📊</div>
          <div style="font-family:var(--font-body);font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px">
            Dashboard Completo · Gráficos Avançados
          </div>
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--text2);line-height:1.6;margin-bottom:12px">
            Dias em produção · Status por projeto · Etapas concluídas<br>
            Disponível nos planos <strong style="color:var(--a2)">PRO</strong> e <strong style="color:var(--a3)">ADVANCED</strong>
          </div>
          <span style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;padding:6px 16px;
                       border-radius:8px;background:linear-gradient(135deg,var(--a1),var(--a2));color:white">
            💎 VER PLANOS
          </span>
        </div>`;
      advChartsParent.appendChild(banner);
    }
    return; // Não renderiza charts avançados
  }

  // ── Charts avançados (PRO+ / ADVANCED) ──────────────────────
  advancedChartIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });

  // Chart: Days in production
  const daysData = ps.map(p => p.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(p.createdAt)) / 86400000)) : 0);
  const ctxD = document.getElementById('dash-chart-days')?.getContext('2d');
  if (ctxD) _dashCharts['dash-chart-days'] = new Chart(ctxD, {
    type: 'bar',
    data: { labels, datasets: [{ data: daysData, backgroundColor: 'rgba(194,97,255,0.6)', borderColor: 'var(--a3)', borderWidth: 1, borderRadius: 4 }] },
    options: { ...chartBase, plugins: { ...chartBase.plugins, tooltip: { callbacks: { label: ctx => `${ctx.raw} dias` } } } }
  });

  // Chart: Status donut
  const statusCounts = { active: 0, completed: 0, paused: 0, cancelled: 0 };
  ps.forEach(p => { if (statusCounts[p.status] !== undefined) statusCounts[p.status]++; });
  const ctxS = document.getElementById('dash-chart-status')?.getContext('2d');
  if (ctxS) _dashCharts['dash-chart-status'] = new Chart(ctxS, {
    type: 'doughnut',
    data: {
      labels: ['Ativo', 'Lançado', 'Pausado', 'Cancelado'],
      datasets: [{
        data: [statusCounts.active, statusCounts.completed, statusCounts.paused, statusCounts.cancelled],
        backgroundColor: ['rgba(61,139,255,0.8)', 'rgba(57,255,143,0.8)', 'rgba(255,233,77,0.8)', 'rgba(255,61,107,0.8)'],
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)'
      }]
    },
    options: { responsive: true, plugins: { legend: { display: true, position: 'bottom', labels: { color: '#7a70a8', font: { size: 9, family: 'Fira Code' }, padding: 8 } } } }
  });

  // Chart: Stages completed per project
  const stagesData = ps.map(p => (p.stages || []).filter(s => s.status === 'done').length);
  const totalStages = ps.map(p => (p.stages || []).filter(s => s.status !== 'skipped').length);
  const ctxSt = document.getElementById('dash-chart-stages')?.getContext('2d');
  if (ctxSt) _dashCharts['dash-chart-stages'] = new Chart(ctxSt, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Concluídas', data: stagesData, backgroundColor: 'rgba(57,255,143,0.7)', borderColor: 'var(--green)', borderWidth: 1, borderRadius: 4 },
        { label: 'Total', data: totalStages, backgroundColor: 'rgba(42,32,80,0.4)', borderColor: 'rgba(42,32,80,0.7)', borderWidth: 1, borderRadius: 4 },
      ]
    },
    options: { ...chartBase, plugins: { legend: { display: true, labels: { color: '#7a70a8', font: { size: 9, family: 'Fira Code' } } } } }
  });
}

// ─── ALL PROJECTS ─────────────────────────────────────────────────────────────
function setFilter(f, btn) {
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderAllProjects();
}
function setView(v) {
  currentView = v; document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('vbtn-' + v).classList.add('active');
  const g = document.getElementById('all-projects');
  if (v === 'list') { g.style.gridTemplateColumns = '1fr'; g.style.gap = '6px'; } else { g.style.gridTemplateColumns = ''; g.style.gap = ''; }
  renderAllProjects();
}
function renderAllProjects() {
  const ps = getProjects(); const q = (document.getElementById('search-input')?.value || '').toLowerCase();
  const sort = document.getElementById('sort-select')?.value || 'date_new';
  let f = currentFilter === 'all' ? ps : ps.filter(p => p.status === currentFilter);
  if (q) f = f.filter(p => p.title.toLowerCase().includes(q) || (p.theme || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
  // Sort
  f = [...f];
  if (sort === 'date_new') f.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  else if (sort === 'date_old') f.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  else if (sort === 'progress_high') f.sort((a, b) => (b.progress || 0) - (a.progress || 0));
  else if (sort === 'progress_low') f.sort((a, b) => (a.progress || 0) - (b.progress || 0));
  else if (sort === 'title_az') f.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === 'deadline') f.sort((a, b) => { const da = a.targetDate ? new Date(a.targetDate) : new Date('9999'); const db = b.targetDate ? new Date(b.targetDate) : new Date('9999'); return da - db; });
  else if (sort === 'starred') f.sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0));
  const cont = document.getElementById('all-projects');
  cont.innerHTML = f.length ? f.map(projectCardHTML).join('')
    : `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🔮</div><div class="empty-state-title">Nenhum projeto</div><div class="empty-state-text">Tente outro filtro</div></div>`;
  if (f.length) setTimeout(lazyLoadImages, 50);
}
function loadAllProjects() {
  // Sync filter button active state with currentFilter
  document.querySelectorAll('.filter-btn').forEach(b => {
    const f = b.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
    b.classList.toggle('active', f === currentFilter);
  });
  renderAllProjects();
}

// ─── KANBAN ───────────────────────────────────────────────────────────────────
// ─── FICHA TÉCNICA ────────────────────────────────────────────────────────────
// Agrupa por função seguindo o padrão das fichas reais:
// - linhas agrupadas por cargo (quem fez o quê)
// - funções relacionadas podem ser fundidas numa linha
// - ordem canônica igual às fichas de referência
// - nomes separados por " & ", handles com @

// Ordem canônica de exibição na ficha (igual ao padrão das músicas)
const FICHA_ORDER = [
  { key: 'r_ideal', label: 'Idealização' },
  { key: 'r_vocal', label: 'Voz' },
  { key: 'r_letra', label: 'Letra' },
  { key: 'r_edit', label: 'Edição' },
  { key: 'r_mix', label: 'Mix & Master' },
  { key: 'r_beat', label: 'Beat' },
  { key: 'r_ilus', label: 'Ilustração' },
  { key: 'r_thumb', label: 'Thumb' },
  { key: 'r_capa', label: 'Capa das Plataformas' },
  { key: 'r_leg', label: 'Legendas do Youtube' },
];

// Funções que podem ser fundidas se tiverem exatamente as mesmas pessoas
// (baseado no padrão "Voz, Letra, Edição: Remary & @Shooter_sz")
const MERGE_GROUPS = [
  ['r_vocal', 'r_letra', 'r_edit'],
  ['r_vocal', 'r_letra'],
  ['r_vocal', 'r_edit'],
  ['r_letra', 'r_edit'],
  ['r_thumb', 'r_capa', 'r_mix'],
  ['r_thumb', 'r_capa'],
];

function buildFichaTecnica(project) {
  const collabs = getCollabs();
  // Build map: roleId -> [collab names/handles]
  const roleMap = {};
  (project.collaborators || []).forEach(ca => {
    const c = collabs.find(x => x.id === ca.collabId);
    if (!c) return;
    (ca.roles || []).forEach(roleId => {
      if (!roleMap[roleId]) roleMap[roleId] = [];
      // Use contact as handle if it starts with @, otherwise use name
      const displayName = c.contact && c.contact.trim().startsWith('@')
        ? c.contact.trim()
        : c.name;
      roleMap[roleId].push(displayName);
    });
  });

  // Only roles that have at least 1 person
  const activeRoles = new Set(Object.keys(roleMap));
  if (!activeRoles.size) return null;

  // Try to merge groups where all roles have identical people arrays
  const mergedLines = []; // [{labels:string, people:string[]}]
  const usedRoles = new Set();

  function sameArrays(a, b) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }

  // Try largest merge groups first
  for (const group of MERGE_GROUPS) {
    if (group.every(r => activeRoles.has(r) && !usedRoles.has(r))) {
      const peopleSets = group.map(r => roleMap[r]);
      if (peopleSets.every(ps => sameArrays(ps, peopleSets[0]))) {
        const labels = group.map(r => FICHA_ORDER.find(o => o.key === r)?.label || r);
        mergedLines.push({ roleKeys: group, labels, people: peopleSets[0] });
        group.forEach(r => usedRoles.add(r));
      }
    }
  }

  // Remaining roles in canonical order
  const lines = [];
  for (const { key, label } of FICHA_ORDER) {
    if (!activeRoles.has(key)) continue;
    if (usedRoles.has(key)) {
      // Find which merged line this belongs to
      const ml = mergedLines.find(m => m.roleKeys.includes(key));
      if (ml && !lines.find(l => l === ml)) lines.push(ml);
    } else {
      lines.push({ roleKeys: [key], labels: [label], people: roleMap[key] });
    }
  }

  return lines;
}

function formatPeopleList(people) {
  // If multiple names, join with " & "
  return people.join(' & ');
}

function fichaTecnicaPlainText(project) {
  const lines = buildFichaTecnica(project);
  if (!lines) return '';
  const rows = lines.map(l => `✦ ${l.labels.join(', ')}: ${formatPeopleList(l.people)}`);
  return `FICHA TECNICA:\n${rows.join('\n')}`;
}

function fichaTecnicaHTML(project) {
  const lines = buildFichaTecnica(project);
  if (!lines || !lines.length) return '';

  const linesHTML = lines.map(l => {
    const label = l.labels.join(', ');
    // People: handles (starting with @) get accent color
    const peopleHTML = l.people.map(p =>
      p.startsWith('@')
        ? `<span class="ficha-name-handle">${escHtml(p)}</span>`
        : `<span>${escHtml(p)}</span>`
    ).reduce((acc, el, i) => i === 0 ? el : acc + ' <span style="color:var(--text3)">&</span> ' + el, '');

    return `<div class="ficha-line">
      <span class="ficha-bullet">✦</span>
      <span class="ficha-role-label">${escHtml(label)}</span>
      <span class="ficha-names">${peopleHTML}</span>
    </div>`;
  }).join('');

  const pid = project.id;
  return `
  <div class="ficha-wrapper" id="ficha-${pid}">
    <div class="ficha-header">
      <div class="ficha-header-left">
        <span class="ficha-glyph">◈</span>
        <span class="ficha-title-label">Ficha Técnica</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="ficha-copy-btn" id="ficha-copy-btn-${pid}" onclick="toggleFichaPlain('${pid}')">
          <span>👁</span> Ver Texto
        </button>
        <button class="ficha-copy-btn" onclick="copyFicha('${pid}')">
          <span>📋</span> Copiar
        </button>
      </div>
    </div>
    <div class="ficha-body">${linesHTML}</div>
    <div class="ficha-plain-box" id="ficha-plain-${pid}">${escHtml(fichaTecnicaPlainText(project))}</div>
  </div>`;
}

function toggleFichaPlain(pid) {
  const box = document.getElementById(`ficha-plain-${pid}`);
  const btn = document.getElementById(`ficha-copy-btn-${pid}`);
  if (!box) return;
  const isOpen = box.style.display === 'block';
  box.style.display = isOpen ? 'none' : 'block';
  btn.innerHTML = isOpen ? '<span>👁</span> Ver Texto' : '<span>🙈</span> Esconder';
}

function copyFicha(pid) {
  const p = getProject(pid);
  if (!p) return;
  const text = fichaTecnicaPlainText(p);
  navigator.clipboard.writeText(text).then(() => {
    toast('✦ Ficha copiada!');
    // Flash the button
    document.querySelectorAll(`#ficha-${pid} .ficha-copy-btn`).forEach(b => {
      if (b.textContent.includes('Copiar')) {
        b.classList.add('copied');
        b.innerHTML = '<span>✅</span> Copiado!';
        setTimeout(() => { b.classList.remove('copied'); b.innerHTML = '<span>📋</span> Copiar'; }, 2200);
      }
    });
  }).catch(() => {
    // Fallback for browsers without clipboard API
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    toast('✦ Ficha copiada!');
  });
}

// ─── DETAIL ───────────────────────────────────────────────────────────────────
function openProjectDetail(id) { prevPage = currentPage; renderDetail(id); showPage('detail'); }

function renderDetail(id) {
  const p = getProject(id); if (!p) { toast('Projeto não encontrado', 'error'); return; }
  document.getElementById('detail-content').dataset.projectId = id;

  const stagesHTML = p.stages.map(s => {
    const hasAudio = !!(s.audioUrl);
    const hasLetra = !!(s.letra);
    const canLetra = ['s1', 's2', 's3'].includes(s.id); // Composição, Letra, Vocal
    const canAudio = ['s3', 's4', 's5', 's9'].includes(s.id) || true; // all can have audio
    const audioBlock = s.audioUrl ? `
      <div class="stage-audio-wrap">
        <div class="stage-audio-label">▶ ${escHtml(s.label)}</div>
        <audio controls style="width:100%;height:32px;margin-top:4px" src="${escHtml(s.audioUrl)}"></audio>
      </div>` : '';
    return `
    <div class="stage-row ${s.status}-row" style="flex-wrap:wrap">
      <div class="stage-status-dot ${s.status}"></div>
      <div class="stage-icon">${s.icon || '🎵'}</div>
      <div class="stage-info" style="flex:1;min-width:180px">
        <div class="stage-name">${escHtml(s.label)}</div>
        ${s.notes ? `<div class="stage-notes">📝 ${escHtml(s.notes)}</div>` : ''}
        ${audioBlock}
      </div>
      ${s.completedAt ? `<div class="stage-date">✅ ${formatDate(s.completedAt)}</div>` : ''}
      <div class="stage-actions" style="flex-wrap:wrap;gap:4px">
        ${canEdit() ? `<button class="btn-attach${hasAudio ? ' has-attach' : ''}" onclick="openAudioModal('${p.id}','${s.id}')" title="Áudio">🎵 ${hasAudio ? 'Áudio' : '+ Áudio'}</button>` : `${hasAudio ? `<button class="btn-attach has-attach" onclick="openAudioModal('${p.id}','${s.id}')">🎵 Áudio</button>` : ''}`}
        ${canEdit() || hasLetra ? `<button class="btn-attach${hasLetra ? ' has-attach' : ''}" onclick="openLetraModal('${p.id}','${s.id}')" title="Texto/Letra">📄 ${hasLetra ? 'Ver Texto' : canEdit() ? '+ Texto' : ''}</button>` : ''}
        ${canEdit() ? `<button class="btn btn-ghost btn-sm" onclick="openStageNote('${p.id}','${s.id}','${escHtml(s.notes || '').replace(/'/g, '&#39;')}')" title="Nota">📝</button>` : ''}
        ${canEdit() ? `<select class="stage-status-select" onchange="handleStageUpdate('${p.id}','${s.id}',this.value)">
          <option value="pending"     ${s.status === 'pending' ? 'selected' : ''}>⏳ Pendente</option>
          <option value="in_progress" ${s.status === 'in_progress' ? 'selected' : ''}>🔧 Em Andamento</option>
          <option value="done"        ${s.status === 'done' ? 'selected' : ''}>✅ Concluído</option>
          <option value="skipped"     ${s.status === 'skipped' ? 'selected' : ''}>⏭ Pular</option>
        </select>`: ''}
      </div>
    </div>`;
  }).join('');

  const bannerImg = p.imageUrl ? `<div class="project-detail-banner-img" data-bg-src="${escHtml(p.imageUrl)}"></div>` : '';
  const fichaHTML = fichaTecnicaHTML(p);
  const daysActive = p.createdAt ? Math.max(0, Math.floor((Date.now() - new Date(p.createdAt)) / 86400000)) : 0;

  const techTagsHTML = [
    p.bpm ? `<span class="tech-tag bpm">♩ ${escHtml(p.bpm)} BPM</span>` : '',
    p.key ? `<span class="tech-tag key">🎵 ${escHtml(p.key)}</span>` : '',
    p.mood ? `<span class="tech-tag mood" style="border-color:${(p.moodColor || "#c261ff")}44;color:${p.moodColor || "#c261ff"};background:${p.moodColor || "#c261ff"}11">✦ ${escHtml(p.mood)}</span>` : '',
    `<span class="days-badge">⏱ ${daysActive}d em produção</span>`,
  ].filter(Boolean).join('');

  // Changelog
  const changelogEntries = (p.changelog || []).slice(0, 20).map(e => `
    <div class="changelog-entry">
      <div class="changelog-dot ${e.type === 'green' ? 'green' : e.type === 'blue' ? 'blue' : ''}"></div>
      <div>
        <div class="changelog-msg">${escHtml(e.msg)}</div>
        <div class="changelog-ts">${new Date(e.ts).toLocaleString('pt-BR')}</div>
      </div>
    </div>`).join('');
  const changelogHTML = changelogEntries ? `
    <div class="changelog-wrap">
      <div class="changelog-header" onclick="this.nextElementSibling.classList.toggle('open')">
        <span class="changelog-title">📋 Histórico de Alterações</span>
        <span class="u-mono-label2">${(p.changelog || []).length} registros ▾</span>
      </div>
      <div class="changelog-body">${changelogEntries}</div>
    </div>` : '';

  document.getElementById('detail-content').innerHTML = `
    <div class="project-detail-banner">
      ${bannerImg}
      <div class="project-detail-banner-content">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div class="project-detail-title" class="u-flex1">${escHtml(p.title)}</div>
          <button class="star-btn${p.starred ? ' starred' : ''}" onclick="handleStarDetail('${p.id}',this)" style="font-size:24px;margin-top:4px" title="${p.starred ? 'Remover favorito' : 'Favoritar'}">★</button>
        </div>
        ${p.theme ? `<div class="project-detail-theme">// ${escHtml(p.theme)}</div>` : ''}
        ${p.description ? `<div class="project-detail-desc">${escHtml(p.description)}</div>` : ''}
        ${p.link ? `<a href="${escHtml(p.link)}" target="_blank" style="display:block;margin-top:8px;color:var(--a2);font-family:var(--font-mono);font-size:11px;text-decoration:none">🔗 ${escHtml(p.link)}</a>` : ''}
        <div class="project-meta">
          <span class="status-badge status-${p.status}">${statusLabel(p.status)}</span>
          ${p.targetDate ? `<span class="tag ${deadlineClass(p.targetDate)}">🗓 ${formatDate(p.targetDate)}</span>` : ''}
          <span class="tag">📊 ${p.progress}%</span>
        </div>
        ${techTagsHTML ? `<div class="tech-tags" style="margin-top:12px">${techTagsHTML}</div>` : ''}
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:28px">
      <button class="btn btn-secondary btn-sm admin-only" onclick="editProject('${p.id}')" style="${canAdmin() ? '' : 'display:none'}">✏️ Editar</button>
      <button class="btn btn-danger btn-sm admin-only" onclick="handleDeleteProject('${p.id}')" style="${canAdmin() ? '' : 'display:none'}">🗑 Deletar</button>
    </div>

    ${fichaHTML || ''}

    <div class="progress-wrap" style="margin-bottom:28px">
      <div class="progress-label">
        <span style="font-family:var(--font-body);font-size:12px;letter-spacing:2px">PROGRESSO TOTAL</span>
        <span style="font-family:var(--font-body);font-size:24px;font-weight:800;color:var(--a2)">${p.progress}%</span>
      </div>
      <div class="progress-bar-bg" style="height:8px"><div class="progress-bar-fill" style="width:${p.progress}%"></div></div>
    </div>

    <div class="section-header" style="margin-bottom:14px"><h3 class="section-title" style="font-size:16px">Pipeline de Produção</h3></div>
    <div class="stages-list">${stagesHTML}</div>

    ${changelogHTML}

    <div class="moodboard-section">
      <div class="section-header" style="margin-bottom:12px">
        <h3 class="section-title" style="font-size:16px">✦ Mapa Mental / Mood Board</h3>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${canEdit() ? `
            <button class="mb-tool-btn active-tool" onclick="mbAddTyped('${p.id}','image')"  title="Adicionar imagem">🖼 Imagem</button>
            <button class="mb-tool-btn" onclick="mbAddTyped('${p.id}','text')"   title="Adicionar texto">📝 Texto</button>
            <button class="mb-tool-btn" onclick="mbAddTyped('${p.id}','label')"  title="Adicionar label">🏷 Label</button>
            <button class="mb-tool-btn" onclick="mbAddTyped('${p.id}','color')"  title="Bloco de cor">🎨 Cor</button>
            <button class="mb-tool-btn" onclick="mbAddTyped('${p.id}','shape')"  title="Shape geométrico">◆ Shape</button>
            <button class="mb-tool-btn" onclick="mbClearAll('${p.id}')" style="margin-left:8px;border-color:rgba(255,61,107,0.3);color:rgba(255,61,107,0.6)">🗑</button>
          `: ''}
        </div>
      </div>
      <div class="moodboard-toolbar" id="mb-toolbar-${p.id}">
        <span class="moodboard-toolbar-label">Paleta de linhas:</span>
        <div class="mb-palette" id="mb-palette-${p.id}">
          ${['#ffffff', '#ff3cb4', '#3d8bff', '#c261ff', '#00d4ff', '#39ff8f', '#ffe94d', '#ff3d6b', '#ff8c42', '#ff6eb4'].map((c, i) => `<div class="mb-palette-swatch${i === 0 ? ' selected' : ''}" data-color="${c}" style="background:${c}" onclick="mbPickPaletteColor('${p.id}',this,'${c}')" title="${c}"></div>`).join('')}
        </div>
        <span style="font-family:var(--font-mono);font-size:9px;color:rgba(255,255,255,0.2);margin-left:auto;letter-spacing:1px">duplo clique = novo nó · arrasta porta = conectar · scroll = zoom</span>
      </div>
      <div class="moodboard-canvas-wrap" id="mb-canvas-${p.id}" data-project-id="${p.id}">
        <svg id="mb-svg-layer-${p.id}" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:1">
          <defs>
            <marker id="mb-arrow-${p.id}" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="rgba(255,255,255,0.5)"/>
            </marker>
          </defs>
          <g id="mb-edges-${p.id}"></g>
          <path id="mb-preview-path-${p.id}" class="mb-preview-line" d="" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-dasharray="6,4" display="none"/>
        </svg>
        <div id="mb-nodes-layer-${p.id}" style="position:absolute;inset:0;transform-origin:0 0;pointer-events:none"></div>
        <div class="mb-empty" id="mb-empty-${p.id}">
          <div class="mb-empty-icon">◈</div>
          <div class="mb-empty-txt">Duplo clique pra criar um nó<br>+ Nó no botão acima<br>Arraste as portas brancas para conectar</div>
        </div>
        <div class="mb-zoom-controls">
          <button class="mb-zoom-btn" onclick="mbZoom('${p.id}',0.12)">+</button>
          <button class="mb-zoom-btn" onclick="mbZoom('${p.id}',-0.12)">−</button>
          <button class="mb-zoom-btn" onclick="mbFitView('${p.id}')" style="font-size:9px">⊞</button>
        </div>
      </div>
    </div>
    
    <!-- Seção de Comentários -->
    <div class="card" style="margin-top:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h3 style="font-size:16px;font-weight:700;color:var(--text)">
          💬 Comentários
        </h3>
      </div>
      
      <!-- Lista de comentários -->
      <div id="comments-container" style="margin-bottom:20px"></div>
      
      <!-- Input de novo comentário -->
      <div style="display:flex;gap:12px;align-items:start">
        ${getAvatarHTML(currentUserData?.photoURL, currentUserData?.name || currentUser?.email, 36)}
        <div class="u-flex1">
          <textarea 
            id="comment-input"
            placeholder="Escreva um comentário..."
            style="width:100%;min-height:80px;background:var(--input-bg);
                   border:1px solid var(--border);border-radius:10px;
                   padding:12px;color:var(--text);font-family:var(--font-body);
                   font-size:13px;resize:vertical"
          ></textarea>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button onclick="addComment('${p.id}', document.getElementById('comment-input').value)"
                    class="btn btn-primary" 
                    style="padding:8px 16px;font-size:12px">
              Enviar Comentário
            </button>
          </div>
        </div>
      </div>
    </div>`;

  if (p.imageUrl) setTimeout(lazyLoadImages, 50);
  setTimeout(() => initMoodBoard(p.id), 80);

  // Inicializar comentários
  initComments(p.id);
}

function handleStarDetail(id, btn) {
  toggleStarProject(id).then(starred => btn.classList.toggle('starred', starred));
}

function handleStageUpdate(pid, sid, status) {
  updateStageStatus(pid, sid, status).then(() => {
    const p = getProject(pid);
    if (p?.status === 'completed') toast('🎉 Projeto concluído! Pronto para lançar!');
    renderDetail(pid);
  });
}

function openStageNote(pid, sid, cur) { document.getElementById('snote-project-id').value = pid; document.getElementById('snote-stage-id').value = sid; document.getElementById('snote-text').value = cur || ''; openModal('modal-stage-note'); }
function saveStageNote() { const pid = document.getElementById('snote-project-id').value; const sid = document.getElementById('snote-stage-id').value; updateStageNote(pid, sid, document.getElementById('snote-text').value.trim()).then(() => { closeModal('modal-stage-note'); toast('Nota salva!'); renderDetail(pid); }); }

// ─── AUDIO MODAL ─────────────────────────────────────────────────────────────
function openAudioModal(pid, sid) {
  const p = getProject(pid); if (!p) return;
  const s = p.stages.find(x => x.id === sid); if (!s) return;
  document.getElementById('saudio-project-id').value = pid;
  document.getElementById('saudio-stage-id').value = sid;
  document.getElementById('saudio-url').value = s.audioUrl || '';
  document.getElementById('modal-audio-title').textContent = `🎵 Áudio — ${s.label}`;
  const prev = document.getElementById('saudio-preview');
  if (s.audioUrl) { document.getElementById('saudio-player').src = s.audioUrl; prev.style.display = 'block'; }
  else { prev.style.display = 'none'; }
  openModal('modal-audio');
}
function testAudioUrl() {
  const url = document.getElementById('saudio-url').value.trim(); if (!url) return;
  const pl = document.getElementById('saudio-player');
  pl.src = url; document.getElementById('saudio-preview').style.display = 'block'; pl.play().catch(() => { });
}
function saveAudio() {
  const pid = document.getElementById('saudio-project-id').value;
  const sid = document.getElementById('saudio-stage-id').value;
  const url = document.getElementById('saudio-url').value.trim();
  updateStageAudio(pid, sid, url).then(() => { closeModal('modal-audio'); toast('Áudio salvo!'); renderDetail(pid); });
}
function removeAudio() {
  const pid = document.getElementById('saudio-project-id').value;
  const sid = document.getElementById('saudio-stage-id').value;
  updateStageAudio(pid, sid, '').then(() => { closeModal('modal-audio'); toast('Áudio removido'); renderDetail(pid); });
}

// ─── LETRA MODAL ─────────────────────────────────────────────────────────────
function openLetraModal(pid, sid) {
  const p = getProject(pid); if (!p) return;
  const s = p.stages.find(x => x.id === sid); if (!s) return;
  document.getElementById('sletra-project-id').value = pid;
  document.getElementById('sletra-stage-id').value = sid;
  document.getElementById('modal-letra-title').textContent = `📄 ${s.label}`;
  document.getElementById('sletra-text').value = s.letra || '';
  if (s.letra) {
    document.getElementById('letra-display-text').textContent = s.letra;
    document.getElementById('modal-letra-view').style.display = 'block';
    document.getElementById('modal-letra-edit').style.display = 'none';
  } else {
    document.getElementById('modal-letra-view').style.display = 'none';
    document.getElementById('modal-letra-edit').style.display = 'block';
  }
  openModal('modal-letra');
}
function switchLetraMode(mode) {
  document.getElementById('modal-letra-view').style.display = mode === 'view' ? 'block' : 'none';
  document.getElementById('modal-letra-edit').style.display = mode === 'edit' ? 'block' : 'none';
}
function saveLetra() {
  const pid = document.getElementById('sletra-project-id').value;
  const sid = document.getElementById('sletra-stage-id').value;
  const text = document.getElementById('sletra-text').value;
  updateStageLetra(pid, sid, text).then(() => {
    document.getElementById('letra-display-text').textContent = text;
    if (text) { switchLetraMode('view'); }
    toast('Texto salvo!'); renderDetail(pid);
  });
}
function copyLetra() {
  const text = document.getElementById('letra-display-text').textContent;
  navigator.clipboard.writeText(text).then(() => toast('Texto copiado!')).catch(() => {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast('Texto copiado!');
  });
}

// ─── PROJECT FORMS ────────────────────────────────────────────────────────────
// ── COMPRESSOR DE IMAGEM ──────────────────────────────────────────
// GIFs são preservados como estão (o Canvas destrói a animação).
// Imagens estáticas grandes são redimensionadas/comprimidas para
// caber no limite do Firestore (~750KB).
function compressImage(file, { maxW = 800, maxH = 600, quality = 0.82, maxBytes = 750000 } = {}) {
  return new Promise((resolve, reject) => {
    const isGif = file.type === 'image/gif';

    // GIF: retorna base64 puro sem tocar — animação preservada
    // Só rejeita se for absurdamente grande (> maxBytes)
    if (isGif) {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = e => {
        const dataUrl = e.target.result;
        const approxBytes = dataUrl.length * 0.75;
        if (approxBytes > maxBytes) {
          // GIF muito grande — avisa mas ainda retorna para não bloquear
          console.warn('GIF grande:', Math.round(approxBytes / 1024) + 'KB');
        }
        resolve(dataUrl);
      };
      reader.readAsDataURL(file);
      return;
    }

    // Imagens estáticas (PNG, JPG, WEBP...): comprimir via Canvas
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxW || h > maxH) {
          const ratio = Math.min(maxW / w, maxH / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);

        // Reduz qualidade progressivamente até caber
        const tryCompress = (q) => {
          const out = canvas.toDataURL('image/jpeg', q);
          if (out.length * 0.75 <= maxBytes || q <= 0.25) {
            resolve(out);
          } else {
            tryCompress(Math.max(0.25, q - 0.1));
          }
        };
        tryCompress(quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Alias para compatibilidade
function imgToDataURL(file) {
  return compressImage(file);
}

async function handleImgFile(input, hiddenId, previewId, imgId) {
  const file = input.files[0]; if (!file) return;
  const url = await imgToDataURL(file);
  document.getElementById(hiddenId).value = url;
  const prev = document.getElementById(previewId);
  const img = document.getElementById(imgId);
  if (prev) prev.style.display = '';
  if (img) { img.src = url; }
  if (hiddenId === 'mb-node-img') mbPreviewNodeImg(url);
  input.value = '';
}
window.handleImgFile = handleImgFile;

function handleImgDrop(event, hiddenId, previewId, imgId) {
  event.preventDefault();
  const zone = event.currentTarget; zone.classList.remove('drag-over');
  const file = event.dataTransfer.files[0]; if (!file || !file.type.startsWith('image/')) return;
  compressImage(file).then(url => {
    document.getElementById(hiddenId).value = url;
    const prev = document.getElementById(previewId); if (prev) prev.style.display = '';
    const img = document.getElementById(imgId); if (img) img.src = url;
    if (hiddenId === 'mb-node-img') mbPreviewNodeImg(url);
  });
}
window.handleImgDrop = handleImgDrop;

async function handleAvatarFile(input) {
  const file = input.files[0]; if (!file) return;
  // Avatares não precisam de resolução alta — 400x400 é mais que suficiente
  const url = await compressImage(file, { maxW: 400, maxH: 400, quality: 0.85, maxBytes: 400000 });
  document.getElementById('settings-avatar-url').value = url;
  previewSettingsAvatar(url);
  input.value = '';
}
window.handleAvatarFile = handleAvatarFile;

// ── PREVIEW HELPERS ────────────────────────────────────────────────────────
function previewSettingsAvatar(url) {
  const el = document.getElementById('settings-avatar-preview');
  if (!el) return;
  if (url && url.trim()) {
    el.style.backgroundImage = `url('${url.trim()}')`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.textContent = '?';
  }
}
window.previewSettingsAvatar = previewSettingsAvatar;

function previewSettingsBanner(url) {
  const el = document.getElementById('settings-banner-preview');
  if (!el) return;
  if (url && url.trim()) {
    el.style.backgroundImage = `url('${url.trim()}')`;
    el.style.backgroundSize = 'cover';
    el.style.backgroundPosition = 'center';
    el.style.color = 'transparent';
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.style.color = '';
    el.textContent = '📷 CLIQUE PARA TROCAR O BANNER';
  }
}
window.previewSettingsBanner = previewSettingsBanner;

async function handleBannerFile(input) {
  const file = input.files[0]; if (!file) return;
  const url = await compressImage(file, { maxW: 1200, maxH: 400, quality: 0.85, maxBytes: 600000 });
  document.getElementById('settings-banner-url').value = url;
  previewSettingsBanner(url);
  input.value = '';
}
window.handleBannerFile = handleBannerFile;

function handleBannerDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  const file = event.dataTransfer.files[0]; if (!file || !file.type.startsWith('image/')) return;
  compressImage(file, { maxW: 1200, maxH: 400, quality: 0.85 }).then(url => {
    document.getElementById('settings-banner-url').value = url;
    previewSettingsBanner(url);
  });
}
window.handleBannerDrop = handleBannerDrop;
// ──────────────────────────────────────────────────────────────────────────

function handleAvatarDrop(event) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  const file = event.dataTransfer.files[0]; if (!file || !file.type.startsWith('image/')) return;
  compressImage(file, { maxW: 400, maxH: 400, quality: 0.85 }).then(url => {
    document.getElementById('settings-avatar-url').value = url;
    previewSettingsAvatar(url);
  });
}
window.handleAvatarDrop = handleAvatarDrop;

function clearProjImg() {
  document.getElementById('proj-image').value = '';
  document.getElementById('proj-img-preview').style.display = 'none';
  document.getElementById('proj-img-previewimg').src = '';
}
window.clearProjImg = clearProjImg;

// Global paste handler for images
document.addEventListener('paste', async e => {
  const items = e.clipboardData?.items; if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile(); if (!file) continue;
      // Determine context first to pick right compression settings
      const inProject = document.getElementById('modal-project')?.classList.contains('open');
      const inSettings = document.getElementById('modal-settings')?.classList.contains('open');
      const inMb = document.getElementById('modal-mb-node')?.classList.contains('open');
      const opts = inSettings
        ? { maxW: 400, maxH: 400, quality: 0.85, maxBytes: 400000 }
        : { maxW: 800, maxH: 600, quality: 0.82, maxBytes: 750000 };
      const url = await compressImage(file, opts);
      if (inProject) {
        document.getElementById('proj-image').value = url;
        document.getElementById('proj-img-preview').style.display = '';
        document.getElementById('proj-img-previewimg').src = url;
      } else if (inSettings) {
        document.getElementById('settings-avatar-url').value = url;
        previewSettingsAvatar(url);
      } else if (inMb) {
        document.getElementById('mb-node-img').value = url;
        mbPreviewNodeImg(url);
      }
      break;
    }
  }
});

function previewProjectImage(url) {
  const pr = document.getElementById('proj-img-preview'); const th = document.getElementById('proj-img-previewimg');
  if (!pr || !th) return;
  if (!url.trim()) { pr.style.display = 'none'; return; } th.src = url.trim(); pr.style.display = 'block'; th.onerror = () => { pr.style.display = 'none'; };
}

function renderCollabAssign(existing) {
  const collabs = getCollabs().filter(c => !c.inactive || (existing && existing.some(a => a.collabId === c.id)));
  const cont = document.getElementById('proj-collab-assign');
  if (!collabs.length) {
    cont.innerHTML = `<div style="color:var(--text3);font-family:var(--font-mono);font-size:12px;padding:8px">Nenhum colaborador cadastrado</div>`;
    return;
  }

  // Build a map: roleId -> [collabIds assigned]
  const roleAssignMap = {};
  ROLES_CATALOG.forEach(r => roleAssignMap[r.id] = []);
  (existing || []).forEach(ca => {
    (ca.roles || []).forEach(roleId => {
      if (roleAssignMap[roleId]) roleAssignMap[roleId].push(ca.collabId);
    });
  });

  cont.innerHTML = ROLES_CATALOG.map(role => {
    const assigned = roleAssignMap[role.id] || [];
    const memberBtns = collabs.map(c => {
      const isActive = assigned.includes(c.id);
      return `<button type="button"
        class="assign-member-btn${isActive ? ' active' : ''}"
        data-role="${role.id}"
        data-collab="${c.id}"
        onclick="toggleRoleMember(this)"
        style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;font-family:var(--font-mono);font-size:11px;border:1px solid ${isActive ? 'var(--a2)' : 'var(--border2)'};background:${isActive ? 'rgba(61,139,255,0.15)' : 'transparent'};color:${isActive ? 'var(--a2)' : 'var(--text3)'};cursor:pointer;transition:all 0.15s;border-radius:0;margin:2px">
        ${c.inactive ? '⏸ ' : ''}${escHtml(c.name)}
      </button>`;
    }).join('');

    return `<div style="border:1px solid var(--border);padding:12px 14px;margin-bottom:8px;background:var(--bg3)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:16px">${role.icon}</span>
        <span style="font-family:var(--font-body);font-size:13px;font-weight:700;letter-spacing:1px;color:var(--text)">${role.label}</span>
        <span id="role-count-${role.id}" style="font-family:var(--font-mono);font-size:10px;color:${assigned.length ? 'var(--a2)' : 'var(--text3)'}">
          ${assigned.length ? `${assigned.length} pessoa${assigned.length > 1 ? 's' : ''}` : 'ninguém'}
        </span>
      </div>
      <div id="role-members-${role.id}" style="display:flex;flex-wrap:wrap;gap:0">${memberBtns}</div>
    </div>`;
  }).join('');
}

function toggleRoleMember(btn) {
  const isActive = btn.classList.toggle('active');
  btn.style.borderColor = isActive ? 'var(--a2)' : 'var(--border2)';
  btn.style.background = isActive ? 'rgba(61,139,255,0.15)' : 'transparent';
  btn.style.color = isActive ? 'var(--a2)' : 'var(--text3)';
  // Update counter
  const roleId = btn.dataset.role;
  const cont = document.getElementById(`role-members-${roleId}`);
  const countEl = document.getElementById(`role-count-${roleId}`);
  if (cont && countEl) {
    const n = cont.querySelectorAll('.assign-member-btn.active').length;
    countEl.textContent = n ? `${n} pessoa${n > 1 ? 's' : ''}` : 'ninguém';
    countEl.style.color = n ? 'var(--a2)' : 'var(--text3)';
  }
}

function getCollabAssignments() {
  // Build from role-first UI: for each role, collect active members
  const roleMap = {}; // collabId -> [roleIds]
  ROLES_CATALOG.forEach(role => {
    const cont = document.getElementById(`role-members-${role.id}`);
    if (!cont) return;
    cont.querySelectorAll('.assign-member-btn.active').forEach(btn => {
      const cid = btn.dataset.collab;
      if (!roleMap[cid]) roleMap[cid] = [];
      roleMap[cid].push(role.id);
    });
  });
  return Object.entries(roleMap).map(([collabId, roles]) => ({ collabId, roles }));
}

function selectMoodColor(btn) {
  document.querySelectorAll('.mood-color-btn').forEach(b => {
    b.style.border = '2px solid transparent';
    b.style.transform = 'scale(1)';
  });
  btn.style.border = '2px solid white';
  btn.style.transform = 'scale(1.25)';
  document.getElementById('proj-mood-color').value = btn.dataset.color;
}

function openNewProject() {
  // FASE 2A — check antecipado: evita que o usuário preencha o form para depois ser bloqueado
  if (!_checkProjectLimit(currentUserData, { actionLabel: 'criar' })) return;

  ['proj-title', 'proj-theme', 'proj-desc', 'proj-link', 'proj-image', 'proj-editing-id', 'proj-bpm', 'proj-key', 'proj-mood'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('proj-date').value = ''; document.getElementById('proj-status').value = 'active';
  document.getElementById('modal-project-title').textContent = 'Novo Projeto';
  document.getElementById('proj-img-preview').style.display = 'none';
  document.getElementById('proj-mood-color').value = '#ff3cb4';
  // Reset color picker
  document.querySelectorAll('.mood-color-btn').forEach((b, i) => { b.style.border = i === 0 ? '2px solid white' : '2px solid transparent'; b.style.transform = i === 0 ? 'scale(1.25)' : 'scale(1)'; });
  renderCollabAssign(null); openModal('modal-project');
}

function editProject(id) {
  const p = getProject(id); if (!p) return;
  document.getElementById('proj-title').value = p.title;
  document.getElementById('proj-theme').value = p.theme || '';
  document.getElementById('proj-desc').value = p.description || '';
  document.getElementById('proj-link').value = p.link || '';
  document.getElementById('proj-image').value = p.imageUrl || '';
  document.getElementById('proj-date').value = p.targetDate || '';
  document.getElementById('proj-status').value = p.status;
  document.getElementById('proj-bpm').value = p.bpm || '';
  document.getElementById('proj-key').value = p.key || '';
  document.getElementById('proj-mood').value = p.mood || '';
  document.getElementById('proj-editing-id').value = p.id;
  document.getElementById('modal-project-title').textContent = 'Editar Projeto';
  // Restore color picker
  const savedColor = p.moodColor || '#ff3cb4';
  document.getElementById('proj-mood-color').value = savedColor;
  document.querySelectorAll('.mood-color-btn').forEach(b => {
    const match = b.dataset.color === savedColor;
    b.style.border = match ? '2px solid white' : '2px solid transparent';
    b.style.transform = match ? 'scale(1.25)' : 'scale(1)';
  });
  const pr = document.getElementById('proj-img-preview');
  if (p.imageUrl) { document.getElementById('proj-img-previewimg').src = p.imageUrl; pr.style.display = 'block'; } else pr.style.display = 'none';
  renderCollabAssign(p.collaborators || []); openModal('modal-project');
}

function saveProject() {
  const titleRaw = FormValidator.val('proj-title');
  const title = FormValidator.isTitle(titleRaw, 2, 60); // Permite até 60 em projetos, tolera pontuações
  if (title === null) return;
  if (!FormValidator.require(title, 'Título')) return;

  // Validação de datas (Local Timezone safe)
  const targetDate = document.getElementById('proj-date').value;
  if (targetDate) {
    const [y, m, d] = targetDate.split('-');
    const picked = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (picked < today) {
      toast('❌ Data de conclusão não pode ser no passado!', 'error');
      return;
    }
  }

  const imageUrlRaw = FormValidator.val('proj-image');
  const imageUrl = imageUrlRaw ? FormValidator.isUrl(imageUrlRaw) : '';
  if (imageUrlRaw && imageUrl === null) return; // Error handled by isUrl

  const linkRaw = FormValidator.val('proj-link');
  const link = linkRaw ? FormValidator.isUrl(linkRaw) : '';
  if (linkRaw && link === null) return; // Error handled by isUrl

  // Sanitização base das tags do modal (tema, mood, bpm, etc)
  const descRaw = FormValidator.val('proj-desc');
  const desc = descRaw.substring(0, 500); // 500 chars limit (descrição modal n deve ser enorme)

  const themeRaw = FormValidator.val('proj-theme');
  const theme = themeRaw.substring(0, 30); // Theme

  const bpmRaw = FormValidator.val('proj-bpm');
  const bpm = bpmRaw.substring(0, 10);

  const keyRaw = FormValidator.val('proj-key');
  const key = keyRaw.substring(0, 10);

  const moodRaw = FormValidator.val('proj-mood');
  const mood = moodRaw.substring(0, 30);

  // Set the values back to the DOM elements just to be transparent and visible
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal('proj-title', title);
  setVal('proj-image', imageUrl);
  setVal('proj-link', link);
  setVal('proj-desc', desc);
  setVal('proj-theme', theme);
  setVal('proj-bpm', bpm);
  setVal('proj-key', key);
  setVal('proj-mood', mood);

  const data = {
    title, theme, description: desc, link, imageUrl,
    targetDate: targetDate || null, status: document.getElementById('proj-status').value,
    bpm, key, mood,
    moodColor: document.getElementById('proj-mood-color').value || '#ff3cb4',
    collaborators: getCollabAssignments()
  };

  // FASE 2C — check de colaboradores por projeto (cobre CRIAÇÃO e EDIÇÃO)
  // Posicionado AQUI: após getCollabAssignments() mas antes de qualquer lógica de escrita.
  // Síncrono — usa o array já construído, sem query Firestore; fail-closed por design.
  {
    const _editId2c = document.getElementById('proj-editing-id').value;
    const _ctx2c = _editId2c ? 'editar' : 'criar';
    if (!_checkCollabPerProjectLimit(currentUserData, data.collaborators, _ctx2c)) return;
  }

  const editId = document.getElementById('proj-editing-id').value;
  if (editId) {
    // FASE 2A — Reativação via edição: se o projeto estava em estado terminal (completed/cancelled)
    // e o novo status é ativo (active/paused), precisa verificar o limite.
    const existingProject = getProject(editId);
    const wasTerminal = existingProject && !isProjectActive(existingProject);
    const willBeActive = isProjectActive({ status: data.status });
    if (wasTerminal && willBeActive) {
      // Conta excluindo o projeto atual (ele não está no "ativo" ainda)
      const othersActive = (_projects || []).filter(p => p.id !== editId && isProjectActive(p));
      if (!_checkProjectLimit(currentUserData, {
        projectsArray: othersActive,
        actionLabel: 'reativar',
      })) return;
    }
    updateProject(editId, data)
      .then(() => { toast('Projeto atualizado!'); closeModal('modal-project'); renderDetail(editId); })
      .catch(e => { console.error(e); toast('Erro ao atualizar: ' + e.message, 'error'); });
  } else {
    // FASE 2A — Criação: check de limite antes de qualquer escrita no Firestore
    if (!_checkProjectLimit(currentUserData, { actionLabel: 'criar' })) return;
    createProject(data)
      .then(() => { toast('Projeto criado!'); closeModal('modal-project'); loadDashboard(); })
      .catch(e => { console.error(e); toast('Erro ao criar: ' + e.message, 'error'); });
  }
}

function handleDeleteProject(id) { if (!confirm('Deletar este projeto?')) return; deleteProjectById(id).then(() => { toast('Projeto removido'); goBack(); }); }

// ─── PRODUCTIVITY TOOLS ──────────────────────────────────────────────────────
let _pomoTimer = null, _pomoSecs = 25 * 60, _pomoRunning = false, _pomoMode = 'focus';
const POMO_TIPS = [
  '🎵 Trabalhe em uma fase por vez — multitask mata a criatividade.',
  '🎧 Use a mesma playlist de foco em todas as sessões para criar contexto mental.',
  '✍️ Escreva a letra antes de gravar. A voz encontra o texto, não o contrário.',
  '⏸ Dê um break de 5 min a cada 25 min. O cérebro consolida melhor em repouso.',
  '🥁 Grave o beat primeiro, mesmo que seja provisório. A estrutura liberta.',
  '📋 Defina uma meta única antes de cada sessão. Foco singular = resultado.',
  '🎚 Mix e master são etapas separadas. Não tente fazer os dois ao mesmo tempo.',
  '💡 Capture ideias imediatamente — o banco de ideias existe pra isso.',
  '🌙 Madrugada tem silêncio externo mas barulho interno. Saiba quando parar.',
  '🔁 Ouça a música de outros artistas antes de gravar para calibrar o ouvido.',
];
let _pomoTipIdx = 0;
let _prodTasks = [];
let _prodIdeas = [];

function initProductivityPage() {
  // Load daily goal
  const goal = localStorage.getItem('prod_daily_goal') || '';
  const goalEl = document.getElementById('prod-daily-goal');
  if (goalEl) goalEl.value = goal;
  // Load tasks
  try { _prodTasks = JSON.parse(localStorage.getItem('prod_tasks') || '[]'); } catch { _prodTasks = []; }
  try { _prodIdeas = JSON.parse(localStorage.getItem('prod_ideas') || '[]'); } catch { _prodIdeas = []; }
  renderProdTasks();
  renderProdIdeas();
  prodNextTip();
}

window.pomoStart = function () {
  if (_pomoRunning) {
    clearInterval(_pomoTimer); _pomoRunning = false;
    document.getElementById('pomo-start').innerHTML = '▶ Iniciar';
  } else {
    _pomoRunning = true;
    document.getElementById('pomo-start').innerHTML = '⏸ Pausar';
    _pomoTimer = setInterval(() => {
      _pomoSecs--;
      if (_pomoSecs <= 0) {
        clearInterval(_pomoTimer); _pomoRunning = false;
        document.getElementById('pomo-start').innerHTML = '▶ Iniciar';
        toast(_pomoMode === 'focus' ? '🎉 Sessão de foco concluída! Descanse.' : '⚡ Break finalizado! Hora de focar.', 'success');
        _pomoSecs = 0;
      }
      updatePomoDisplay();
    }, 1000);
  }
};
window.pomoReset = function () { clearInterval(_pomoTimer); _pomoRunning = false; _pomoSecs = ({ focus: 25, short: 5, long: 15 }[_pomoMode] || 25) * 60; document.getElementById('pomo-start').innerHTML = '▶ Iniciar'; updatePomoDisplay(); };
window.pomoSetMode = function (mode, mins) { _pomoMode = mode; clearInterval(_pomoTimer); _pomoRunning = false; _pomoSecs = mins * 60; document.getElementById('pomo-start').innerHTML = '▶ Iniciar'; document.getElementById('pomo-label').textContent = mode === 'focus' ? 'FOCO' : mode === 'short' ? 'BREAK CURTO' : 'BREAK LONGO'; updatePomoDisplay(); };
function updatePomoDisplay() {
  const m = Math.floor(_pomoSecs / 60).toString().padStart(2, '0');
  const s = (_pomoSecs % 60).toString().padStart(2, '0');
  const el = document.getElementById('pomo-display');
  if (el) el.textContent = `${m}:${s}`;
}

window.prodAddTask = function () {
  const input = document.getElementById('prod-task-input');
  const text = input.value.trim(); if (!text) return;
  _prodTasks.push({ text, done: false, id: Date.now() });
  input.value = '';
  saveProdTasks(); renderProdTasks();
};
function renderProdTasks() {
  const cont = document.getElementById('prod-task-list'); if (!cont) return;
  if (!_prodTasks.length) { cont.innerHTML = '<div style="font-family:Fira Code,monospace;font-size:10px;color:var(--text3);text-align:center;padding:12px">Nenhuma tarefa</div>'; return; }
  cont.innerHTML = _prodTasks.map((t, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg3);border:1px solid var(--border);${t.done ? 'opacity:0.5' : ''}">
      <input type="checkbox" ${t.done ? 'checked' : ''} onchange="prodToggleTask(${i})" style="cursor:pointer;accent-color:var(--a2)">
      <span style="flex:1;font-family:'IBM Plex Mono', monospace;font-size:12px;${t.done ? 'text-decoration:line-through;color:var(--text3)' : 'color:var(--text)'}">${escHtml(t.text)}</span>
      <button onclick="prodDeleteTask(${i})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:12px;padding:0">✕</button>
    </div>`).join('');
}
window.prodToggleTask = function (i) { _prodTasks[i].done = !_prodTasks[i].done; saveProdTasks(); renderProdTasks(); };
window.prodDeleteTask = function (i) { _prodTasks.splice(i, 1); saveProdTasks(); renderProdTasks(); };
function saveProdTasks() { localStorage.setItem('prod_tasks', JSON.stringify(_prodTasks)); }

window.prodAddIdea = function () {
  const input = document.getElementById('prod-idea-input');
  const text = input.value.trim(); if (!text) return;
  _prodIdeas.unshift({ text, ts: new Date().toISOString() });
  input.value = '';
  saveProdIdeas(); renderProdIdeas();
};
function renderProdIdeas() {
  const cont = document.getElementById('prod-idea-list'); if (!cont) return;
  if (!_prodIdeas.length) { cont.innerHTML = '<div style="font-family:Fira Code,monospace;font-size:10px;color:var(--text3);text-align:center;padding:12px">Nenhuma ideia ainda</div>'; return; }
  cont.innerHTML = _prodIdeas.map((idea, i) => `
    <div style="padding:8px 10px;background:var(--bg3);border:1px solid var(--border);border-left:2px solid var(--yellow)">
      <div style="font-family:'IBM Plex Mono', monospace;font-size:11px;color:var(--text);line-height:1.6;white-space:pre-wrap">${escHtml(idea.text)}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:4px">
        <span style="font-family:Fira Code,monospace;font-size:9px;color:var(--text3)">${new Date(idea.ts).toLocaleDateString('pt-BR')}</span>
        <button onclick="prodDeleteIdea(${i})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:11px">🗑</button>
      </div>
    </div>`).join('');
}
window.prodDeleteIdea = function (i) { _prodIdeas.splice(i, 1); saveProdIdeas(); renderProdIdeas(); };
function saveProdIdeas() { localStorage.setItem('prod_ideas', JSON.stringify(_prodIdeas)); }

window.saveDailyGoal = function () {
  const text = document.getElementById('prod-daily-goal')?.value || '';
  localStorage.setItem('prod_daily_goal', text);
};

window.prodNextTip = function () {
  _pomoTipIdx = (_pomoTipIdx + 1) % POMO_TIPS.length;
  const el = document.getElementById('prod-tip-display');
  if (el) el.textContent = POMO_TIPS[_pomoTipIdx];
};

// ─── PRODUCTIVITY ─────────────────────────────────────────────────────────────
function loadCollaborators() {
  const cs = getCollabs(); const ps = getProjects(); const cont = document.getElementById('collabs-grid');
  // Show invite section for team admins
  const inviteHTML = window.loadTeamInviteSection ? window.loadTeamInviteSection() : '';
  if (inviteHTML) {
    let inviteEl = document.getElementById('team-invite-section');
    if (!inviteEl) {
      inviteEl = document.createElement('div');
      inviteEl.id = 'team-invite-section';
      inviteEl.style.gridColumn = '1/-1';
      cont.parentElement.insertBefore(inviteEl, cont);
    }
    inviteEl.innerHTML = inviteHTML;
  }
  if (!cs.length) { cont.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">👥</div><div class="empty-state-title">Nenhum membro ainda</div><div class="empty-state-text">Adicione quem trabalha com você!</div></div>`; return; }
  // Also show team members (who joined via code) merged with collabs
  const team = _myTeams.find(t => t.id === _currentTeamId);
  const teamMembers = team?.members || [];
  const sorted = [...cs].sort((a, b) => (a.inactive ? 1 : 0) - (b.inactive ? 1 : 0));
  cont.innerHTML = sorted.map(c => {
    const projCount = ps.filter(p => p.collaborators.some(ca => ca.collabId === c.id)).length;
    const rolesHtml = (c.roles || []).map(r => `<span class="role-badge">${roleIcon(r)} ${escHtml(roleName(r))}</span>`).join('');
    // Find team member linked to this collab (linkedCollabId stored in member object)
    const linkedMember = teamMembers.find(m => m.linkedCollabId === c.id);
    // Photo: from linked member's account (photoURL synced from their profile settings)
    const photo = c.photo || linkedMember?.photoURL || (linkedMember?.uid === currentUser?.uid ? currentUserData?.photoURL : '') || '';
    const initials = (c.name || '?')[0].toUpperCase();
    const avatarHtml = photo
      ? `<img src="${escHtml(photo)}" class="u-avatar-img">`
      : initials;
    const avatarBg = photo ? 'background:none' : '';
    return `<div class="card collab-card${c.inactive ? ' inactive-card' : ''}" style="cursor:pointer;transition:all 0.2s;padding:0;overflow:hidden" onclick="openCollabProfile('${c.id}', event)"
      onmouseover="this.style.transform='translateY(-3px)';this.style.borderColor='var(--border2)'"
      onmouseout="this.style.transform='';this.style.borderColor=''">
      <!-- Cover banner -->
      <div style="height:60px;background:linear-gradient(135deg,var(--a1),var(--a2),var(--a3));opacity:${c.inactive ? 0.4 : 0.7}"></div>
      <!-- Avatar -->
      <div style="padding:0 16px;margin-top:-22px;margin-bottom:12px;display:flex;align-items:flex-end;justify-content:space-between;position:relative;z-index:1">
        <div class="user-avatar" style="width:44px;height:44px;font-size:18px;border:3px solid var(--bg2);${avatarBg}">${avatarHtml}</div>
        ${c.inactive ? `<span style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--yellow);background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);padding:3px 8px;border-radius:20px">⏸ INATIVO</span>` : ''}
      </div>
      <!-- Info -->
      <div style="padding:0 16px 16px">
        <div style="font-family:var(--font-body);font-size:14px;font-weight:800;color:var(--text);margin-bottom:2px">${escHtml(c.name)}</div>
        ${c.contact ? `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);margin-bottom:8px">📱 ${escHtml(c.contact)}</div>` : `<div style="margin-bottom:8px"></div>`}
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">${rolesHtml || `<span style="color:var(--text3);font-size:10px;font-family:var(--font-mono)">Sem cargos</span>`}</div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span class="u-mono-label2">🎵 ${projCount} proj.</span>
          ${canAdmin() ? `<div style="display:flex;gap:6px" onclick="event.stopPropagation()">
            <button class="btn btn-edit btn-sm" style="padding:4px 8px;font-size:10px" onclick="editCollab('${c.id}')">✏️</button>
            <button class="btn btn-danger btn-sm" style="padding:4px 8px;font-size:10px" onclick="handleDeleteCollab('${c.id}')">🗑</button>
          </div>`: ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Open collab profile modal ──────────────────────────────────────────────────
window.openCollabProfile = function (id, event) {
  const c = getCollab(id);
  if (!c) return;
  const ps = getProjects();
  const projCount = ps.filter(p => p.collaborators && p.collaborators.some(ca => ca.collabId === c.id)).length;
  const team = _myTeams.find(t => t.id === _currentTeamId);
  const linkedMember = (team?.members || []).find(m => m.linkedCollabId === c.id);
  const photo = c.photo || linkedMember?.photoURL || '';
  const data = {
    name: c.name || 'Membro',
    photo: photo,
    roles: c.roles || [],
    bio: c.bio || '',
    collabId: c.id,
    stats: projCount > 0 ? [{ v: projCount, l: 'Projeto' + (projCount !== 1 ? 's' : '') }] : [],
    activity: [],
    badges: { earned: [], locked: [] },
    projects: ps.filter(p => p.collaborators && p.collaborators.some(ca => ca.collabId === c.id)).slice(0, 5)
      .map(p => ({
        e: '🎵', bg: 'rgba(255,60,180,0.08)', b: 'rgba(255,60,180,0.2)', n: p.title, r: 'Colaborador',
        s: p.status === 'active' ? 'EM ANDAMENTO' : 'CONCLUÍDO',
        sBg: 'rgba(114,239,221,0.08)', sB: 'rgba(114,239,221,0.2)', sC: 'var(--green)'
      })),
  };
  if (typeof openProfilePopup === 'function') openProfilePopup(data, 'team', event);
};

// ── Open team member profile modal ────────────────────────────────────────────
window.openMemberProfile = async function (uid, event) {
  const team = _myTeams.find(t => t.id === _currentTeamId);
  const m = (team?.members || []).find(mb => mb.uid === uid);
  if (!m) return;

  const isMe = uid === currentUser?.uid;

  // Busca dados atualizados do Firestore para outros usuários (bannerURL, bio, foto)
  let remoteData = {};
  if (!isMe) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) remoteData = snap.data();
    } catch (e) { /* usa dados do membro como fallback */ }
  }

  const photo = isMe ? (currentUserData?.photoURL || m.photoURL || '') : (remoteData.photoURL || m.photoURL || '');
  const name = isMe ? (currentUserData?.name || m.name || m.email || 'Membro') : (remoteData.name || m.name || m.email || 'Membro');
  const bio = isMe ? (currentUserData?.bio || '') : (remoteData.bio || '');
  const linkedCollab = _collabs.find(c => c.id === (m.linkedCollabId || (isMe ? currentUserData?.linkedCollabId : '')));
  const roles = linkedCollab?.roles || [];

  const data = {
    name: name,
    photo: photo,
    email: m.email,
    uid: uid,
    roles: roles,
    bio: bio,
    bannerURL: isMe ? (currentUserData?.bannerURL || '') : (remoteData.bannerURL || ''),
    teamRole: m.role,
    joinedAt: m.joinedAt,
    linkedCollab: linkedCollab?.name || '',
    collabId: linkedCollab?.id,
    activity: [],
    badges: { earned: [], locked: [] },
    stats: [
      { v: roles.length || '—', l: 'Cargos' },
      { v: (() => { const rl = { owner: 'Dono', admin: 'Admin', member: 'Membro' }; return rl[m.role] || m.role; })(), l: 'Nível' },
    ],
  };
  if (typeof openProfilePopup === 'function') openProfilePopup(data, 'team', event);
};

function renderRolesGrid(selected) {
  document.getElementById('collab-roles-grid').innerHTML = ROLES_CATALOG.map(r => {
    const sel = selected.includes(r.id);
    return `<label class="role-chip${sel ? ' selected' : ''}" id="rc-${r.id}" onclick="toggleRoleChip('${r.id}',this)">
      <input type="checkbox" value="${r.id}" ${sel ? 'checked' : ''} style="display:none">
      <span class="role-icon">${r.icon}</span>
      <span class="u-fs12">${escHtml(r.label)}</span>
    </label>`;
  }).join('');
}

function toggleRoleChip(roleId, label) {
  const cb = label.querySelector('input'); cb.checked = !cb.checked; label.classList.toggle('selected', cb.checked);
}

function openNewCollab() {
  document.getElementById('collab-name').value = ''; document.getElementById('collab-contact').value = '';
  document.getElementById('collab-editing-id').value = '';
  document.getElementById('collab-inactive').checked = false;
  document.getElementById('inactive-toggle-label').classList.remove('is-inactive');
  document.getElementById('modal-collab-title').textContent = 'Novo Membro da Equipe';
  renderRolesGrid([]); openModal('modal-collab');
}

function editCollab(id) {
  const c = getCollab(id); if (!c) return;
  document.getElementById('collab-name').value = c.name;
  document.getElementById('collab-contact').value = c.contact || '';
  document.getElementById('collab-editing-id').value = c.id;
  const inactiveCheck = document.getElementById('collab-inactive');
  inactiveCheck.checked = !!c.inactive;
  document.getElementById('inactive-toggle-label').classList.toggle('is-inactive', !!c.inactive);
  document.getElementById('modal-collab-title').textContent = 'Editar Membro';
  renderRolesGrid(c.roles || []); openModal('modal-collab');
}

function saveCollab() {
  const nameRaw = FormValidator.val('collab-name');
  const name = FormValidator.isName(nameRaw, 2, 40);
  if (name === null) return;
  if (!FormValidator.require(name, 'Nome')) return;

  const contactRaw = FormValidator.val('collab-contact');
  const contact = contactRaw ? FormValidator.isContact(contactRaw) : '';
  if (contactRaw && contact === null) return;

  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
  setVal('collab-name', name);
  setVal('collab-contact', contact);

  const roles = [...document.querySelectorAll('#collab-roles-grid input:checked')].map(i => i.value);
  const inactive = document.getElementById('collab-inactive').checked;

  // Array hardcoded explicit blockando payloads sujos
  const data = { name, roles, contact, inactive };
  const editId = document.getElementById('collab-editing-id').value;

  // FASE 1 — Plan Engine: verifica limite de colaboradores antes de criar (não ao editar)
  if (!editId) {
    const _collabLimit = getLimit(currentUserData, 'maxCollaboratorsPerProject');
    const _activeCollabs = (_collabs || []).filter(c => !c.inactive);
    if (Number.isFinite(_collabLimit) && _activeCollabs.length >= _collabLimit) {
      const planName = getUserPlan(currentUserData).toUpperCase();
      toast(
        `Limite de colaboradores por projeto atingido (${_collabLimit} no plano ${planName}). Faça upgrade para adicionar mais.`,
        'error'
      );
      openPlansModal();
      return;
    }
  }

  if (editId) { updateCollabById(editId, data).then(() => { toast('Membro atualizado!'); closeModal('modal-collab'); loadCollaborators(); }); }
  else { createCollab(data).then(() => { toast('Colaborador adicionado!'); closeModal('modal-collab'); loadCollaborators(); }); }
}

function handleDeleteCollab(id) { if (!confirm('Remover colaborador?')) return; deleteCollabById(id).then(() => { toast('Colaborador removido'); loadCollaborators(); }); }

// ─── MODAL ────────────────────────────────────────────────────────────────────
function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('open'); }
function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('open');
  // CORREÇÃO 1: reset z-index elevado quando modal-ticket-detail for fechado
  if (id === 'modal-ticket-detail') el.style.zIndex = '';
}
// Overlay click-to-close — with drag-scroll protection (mousedown target must also be the overlay)
document.querySelectorAll('.modal-overlay').forEach(o => {
  // Never close settings by clicking backdrop — it has too much scrollable content
  if (o.id === 'modal-settings') return;
  let _mdTarget = null;
  o.addEventListener('mousedown', e => { _mdTarget = e.target; });
  o.addEventListener('click', e => { if (e.target === o && _mdTarget === o) o.classList.remove('open'); });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open')); });

// ══════════════════════════════════════════════════════════════════════════════
// ATALHOS DE TECLADO — Sistema real de shortcuts
// ══════════════════════════════════════════════════════════════════════════════
(function () {
  // Rastreia sequência de duas teclas (ex: G → D)
  let _seqKey = null, _seqTimer = null;
  const clearSeq = () => { _seqKey = null; if (_seqTimer) { clearTimeout(_seqTimer); _seqTimer = null; } };

  document.addEventListener('keydown', function (e) {
    // Ignorar quando digitando em input/textarea/select
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    // Ignorar quando modal aberto (exceto Esc que já é tratado acima)
    const anyModal = document.querySelector('.modal-overlay.open');
    if (anyModal) return;

    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    // --- Ctrl+, → Configurações ---
    if (ctrl && k === ',') {
      e.preventDefault();
      if (typeof window.openSettingsModal === 'function') window.openSettingsModal();
      clearSeq(); return;
    }

    // --- Ctrl+K → Trocar de Equipe (abre teams screen) ---
    if (ctrl && k === 'k') {
      e.preventDefault();
      if (typeof window.showTeamsScreen === 'function') window.showTeamsScreen(true);
      else if (typeof window.showPage === 'function') window.showPage('dashboard');
      clearSeq(); return;
    }

    // --- Ctrl+/ → Busca rápida (foca primeiro input de busca visível) ---
    if (ctrl && k === '/') {
      e.preventDefault();
      const searchInput = document.querySelector('input[type="search"], input[placeholder*="Busca"], input[placeholder*="busca"], input[placeholder*="Pesquisar"], input[placeholder*="pesquisar"], #search-input, .search-input');
      if (searchInput) { searchInput.focus(); searchInput.select(); }
      clearSeq(); return;
    }

    // --- Shift+N → Marcar notificações como lidas ---
    if (shift && k === 'N') {
      e.preventDefault();
      if (typeof window.markAllNotifsRead === 'function') window.markAllNotifsRead();
      else toast('Notificações marcadas como lidas', 'success');
      clearSeq(); return;
    }

    // --- Sequências de duas teclas: G+D, G+P, G+M ---
    if (_seqKey === 'g') {
      e.preventDefault();
      if (k === 'd' || k === 'D') {
        window.showPage?.('dashboard');
        toast('Dashboard', 'success');
      } else if (k === 'p' || k === 'P') {
        window.showPage?.('projects');
        toast('Projetos', 'success');
      } else if (k === 'm' || k === 'M') {
        window.showPage?.('collaborators');
        toast('Membros', 'success');
      }
      clearSeq(); return;
    }

    // --- Teclas únicas (sem modificador) ---
    if (!ctrl && !shift && !e.altKey) {
      if (k === 'g' || k === 'G') {
        // Inicia sequência G+?
        _seqKey = 'g';
        _seqTimer = setTimeout(clearSeq, 800);
        e.preventDefault();
        return;
      }
      if (k === 'n' || k === 'N') {
        e.preventDefault();
        if (typeof window.openNewProject === 'function') window.openNewProject();
        clearSeq(); return;
      }
      if (k === 'm' || k === 'M') {
        e.preventDefault();
        if (typeof window.pmToggle === 'function') window.pmToggle();
        clearSeq(); return;
      }
      if (k === 'i' || k === 'I') {
        e.preventDefault();
        if (typeof window.openInterestPanel === 'function') window.openInterestPanel();
        clearSeq(); return;
      }
    }

    clearSeq();
  });
})();

// Enter key on auth inputs
document.getElementById('login-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') window.doLogin(); });
document.getElementById('reg-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') window.doRegister(); });

// ── Delegated event listener for mood color picker (avoids inline onclick timing issues)
document.addEventListener('click', e => {
  const btn = e.target.closest('.mood-color-btn');
  if (btn) selectMoodColor(btn);
});
const PERMS_CATALOG = [
  { id: 'perm_create_project', label: 'Criar Projeto' },
  { id: 'perm_edit_project', label: 'Editar Projeto' },
  { id: 'perm_delete_project', label: 'Deletar Projeto' },
  { id: 'perm_manage_stages', label: 'Gerenciar Stages' },
  { id: 'perm_view_team', label: 'Ver Equipe' },
  { id: 'perm_edit_team', label: 'Editar Equipe' },
  { id: 'perm_view_chat', label: 'Ver Chat' },
  { id: 'perm_send_chat', label: 'Enviar no Chat' },
  { id: 'perm_view_admin', label: 'Ver Painel Admin' },
];

// Resolve permission — admin always has everything; others use custom perms or role defaults
function hasPerm(permId) {
  // P2-B: viewer é role completa com seus próprios defaults
  if (!currentUserData) return false;
  if (currentUserData.role === 'admin') return true;
  // Custom perms override role defaults (exceto admin que é irrestrito)
  if (currentUserData.perms && permId in currentUserData.perms) return currentUserData.perms[permId];
  // Role defaults
  const editorDefaults = ['perm_create_project', 'perm_edit_project', 'perm_manage_stages',
    'perm_view_team', 'perm_view_chat', 'perm_send_chat'];
  const viewerDefaults = ['perm_view_team', 'perm_view_chat'];
  if (currentUserData.role === 'editor' || currentUserData.role === 'member') return editorDefaults.includes(permId);
  if (currentUserData.role === 'viewer') return viewerDefaults.includes(permId);
  // Fallback para roles desconhecidas: apenas view
  return viewerDefaults.includes(permId);
}

// Override canAdmin/canEdit to also check granular perms where needed
function canAdmin() { return currentUserData?.role === 'admin'; }
function canEdit() { return currentUserData?.role === 'admin' || currentUserData?.role === 'editor' || currentUserData?.role === 'member' || (currentUserData?.role !== 'viewer' && hasPerm('perm_edit_project')); } // P2-B: viewer excluído
function canView() { return !!currentUserData && currentUserData.status === 'approved'; }

// P4-A: Staff check — verifica campo staffRole em users/{uid} + fallback email hardcoded
const STAFF_FALLBACK_EMAIL = 'contatodoki@gmail.com';
function isStaff() {
  if (!currentUser) return false;
  // Fallback seguro: email hardcoded como superadmin
  if (currentUser.email === STAFF_FALLBACK_EMAIL) return true;
  // Campo staffRole em users/{uid} (staff, support, moderator)
  const staffRole = currentUserData?.staffRole;
  return !!staffRole && staffRole !== '';
}
function getStaffRole() {
  if (!currentUser) return null;
  if (currentUser.email === STAFF_FALLBACK_EMAIL) return 'superadmin';
  return currentUserData?.staffRole || null;
}

// ── refreshStaffNav() ─────────────────────────────────────────────────────────
// Atualiza visibilidade dos itens ADMIN/STAFF na teams-screen.
// Chamada ao carregar/atualizar currentUserData — sem depender de _currentTeamId.
// refreshStaffNav() — atualiza visibilidade de ts-staff-section.
// ts-admin-section foi removida (migrada para abas do Painel Master).
function refreshStaffNav() {
  _tsApplyStaffVisibility();
}
window.refreshStaffNav = refreshStaffNav;

// P4-A: Carrega Painel Master
// loadAdminMasterPage() — mantido para retrocompat (masterSetStaffRole chama no final)
// Delega para _mdrLoadDashboard() que é a implementação real.
function loadAdminMasterPage() {
  if (!isStaff()) { toast('Acesso restrito a staff.', 'error'); return; }
  _mdrLoadDashboard();
}

// openAdminMasterPanel / closeAdminMasterPanel — aliases para retrocompat
window.openAdminMasterPanel = function () { window.toggleMasterDrawer(); };
window.closeAdminMasterPanel = function () { if (isMasterDrawerOpen) _mdrClose(); };

window.masterSetStaffRole = async function () {
  if (!isStaff()) { toast('Sem permissão.', 'error'); return; }
  const uid = document.getElementById('master-staff-uid')?.value.trim();
  const role = document.getElementById('master-staff-role')?.value;
  if (!uid) { toast('Informe o UID do usuário.', 'error'); return; }
  try {
    const userRef = doc(db, 'users', uid);
    const staffIndexRef = doc(db, 'staff_index', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) { toast('Usuário não encontrado.', 'error'); return; }
    if (role) {
      // Escreve staffRole em users/{uid} E cria sentinela em staff_index/{uid}.
      // staff_index é lido por isStaff() nas Firestore Rules para evitar
      // a restrição de get() na mesma coleção durante queries LIST em users.
      await Promise.all([
        setDoc(userRef, { staffRole: role }, { merge: true }),
        setDoc(staffIndexRef, { active: true, role, updatedAt: new Date().toISOString() }),
      ]);
      toast(`✅ staffRole "${role}" aplicado ao usuário.`);
    } else {
      // Remove staffRole de users/{uid} E deleta o sentinela de staff_index/{uid}
      await Promise.all([
        setDoc(userRef, { staffRole: deleteField() }, { merge: true }),
        deleteDoc(staffIndexRef),
      ]);
      toast('✅ staffRole removido do usuário.');
    }
    loadAdminMasterPage();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// ─── ADMIN MODAL ──────────────────────────────────────────────────────────────
window.openAdminModal = function () {
  openModal('modal-admin');
  switchAdminTab('data', document.querySelector('.admin-modal-tab'));
};

window.switchAdminTab = function (tab, btn) {
  document.querySelectorAll('.admin-modal-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('admin-tab-users').style.display = tab === 'users' ? 'block' : 'none';
  document.getElementById('admin-tab-link').style.display = tab === 'link' ? 'block' : 'none';
  document.getElementById('admin-tab-data').style.display = tab === 'data' ? 'block' : 'none';
  if (tab === 'users') renderAdminUsers();
  if (tab === 'link') renderAdminLink();
};

function renderAdminUsers() {
  const cont = document.getElementById('admin-tab-users');
  const pending = _users.filter(u => u.status === 'pending');
  cont.innerHTML = `
    ${pending.length ? `<div style="font-family:var(--font-mono);font-size:10px;color:var(--red);letter-spacing:2px;margin-bottom:10px">⚠ ${pending.length} AGUARDANDO APROVAÇÃO</div>` : ''}
    ${_users.length === 0 ? `<div style="color:var(--text3);font-family:var(--font-mono);font-size:11px">Nenhum usuário ainda</div>` : ''}
    ${_users.map(u => `
      <div class="user-row">
        <div class="user-avatar" style="width:32px;height:32px;font-size:12px;flex-shrink:0;${u.photoURL ? 'background:none;' : ''}">${u.photoURL ? `<img src="${escHtml(u.photoURL)}" class="u-avatar-img">` : (u.name || u.email || '?')[0].toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div class="user-email" style="font-weight:700">${escHtml(u.name || '')} <span style="color:var(--text3);font-weight:400">${escHtml(u.email || '')}</span></div>
          ${u.linkedCollabId ? `<div class="linked-badge" style="margin-top:3px">🔗 ${escHtml(_collabs.find(c => c.id === u.linkedCollabId)?.name || 'Vinculado')}</div>` : ''}
        </div>
        <span class="user-role-badge role-${u.status === 'pending' ? 'pending' : u.role}">${u.status === 'pending' ? 'Pendente' : u.role}</span>
        <div class="user-actions">
          ${u.status === 'pending' ? `<button class="user-action-btn approve" onclick="approveUser('${u.uid}')">✓ Aprovar</button>` : ''}
          <button class="user-action-btn" onclick="openPermsModal('${u.uid}')" title="Permissões">🔐</button>
          <select class="stage-status-select" style="font-size:10px;padding:3px 6px" onchange="changeUserRole('${u.uid}',this.value)">
            <option value="viewer" ${u.role === 'viewer' ? 'selected' : ''}>Viewer</option>
            <option value="editor" ${u.role === 'editor' ? 'selected' : ''}>Editor</option>
            <option value="admin"  ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
          </select>
          ${u.uid !== currentUser?.uid ? `<button class="user-action-btn danger" onclick="removeUser('${u.uid}')">✕</button>` : ''}
        </div>
      </div>`).join('')}`;
}

function renderAdminLink() {
  const cont = document.getElementById('admin-tab-link');
  cont.innerHTML = `
    <div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);letter-spacing:1px;margin-bottom:14px;line-height:1.7">
      Vincule uma conta de usuário a um membro da equipe. O membro vinculado poderá editar informações relacionadas a ele.
    </div>
    ${_users.filter(u => u.status === 'approved').map(u => `
      <div class="user-row">
        <div class="user-avatar" style="width:28px;height:28px;font-size:10px;flex-shrink:0">${(u.name || '?')[0].toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div class="user-email">${escHtml(u.name || u.email)}</div>
          ${u.linkedCollabId ? `<div class="linked-badge" style="margin-top:3px">🔗 ${escHtml(_collabs.find(c => c.id === u.linkedCollabId)?.name || '?')}</div>` : ''}
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <select class="stage-status-select" style="font-size:10px" onchange="linkUserToCollab('${u.uid}',this.value)">
            <option value="">-- Sem vínculo --</option>
            ${_collabs.filter(c => !c.inactive).map(c => `<option value="${c.id}" ${u.linkedCollabId === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('')}
          </select>
        </div>
      </div>`).join('')}`;
}

window.linkUserToCollab = async function (uid, collabId) {
  const u = _users.find(x => x.uid === uid); if (!u) return;
  await updateDoc(doc(db, 'users', uid), { linkedCollabId: collabId || null });
  toast(collabId ? '🔗 Conta vinculada!' : 'Vínculo removido');
};

window.openPermsModal = function (uid) {
  const u = _users.find(x => x.uid === uid); if (!u) return;
  document.getElementById('perms-user-uid').value = uid;
  document.getElementById('perms-user-name').textContent = u.name || u.email;
  const grid = document.getElementById('perms-grid');
  const perms = u.perms || {};
  grid.innerHTML = PERMS_CATALOG.map(p => {
    const checked = u.role === 'admin' ? true : (p.id in perms ? perms[p.id] : hasPerm_for(u, p.id));
    const disabled = u.role === 'admin' ? 'disabled' : '';
    return `<div class="perm-row">
      <span class="perm-label">${p.label}</span>
      <label class="perm-toggle">
        <input type="checkbox" id="perm-${p.id}" ${checked ? 'checked' : ''} ${disabled}>
        <span class="perm-slider"></span>
      </label>
    </div>`;
  }).join('');
  openModal('modal-perms');
};

function hasPerm_for(u, permId) {
  // P2-B: viewer é role reconhecida
  if (u.role === 'admin') return true;
  if (u.perms && permId in u.perms) return u.perms[permId];
  const editorDefaults = ['perm_create_project', 'perm_edit_project', 'perm_manage_stages',
    'perm_view_team', 'perm_view_chat', 'perm_send_chat'];
  const viewerDefaults = ['perm_view_team', 'perm_view_chat'];
  if (u.role === 'editor') return editorDefaults.includes(permId);
  if (u.role === 'viewer') return viewerDefaults.includes(permId);
  return viewerDefaults.includes(permId);
}

window.savePermissions = async function () {
  const uid = document.getElementById('perms-user-uid').value;
  const u = _users.find(x => x.uid === uid); if (!u) return;
  const perms = {};
  PERMS_CATALOG.forEach(p => {
    const el = document.getElementById('perm-' + p.id);
    if (el && !el.disabled) perms[p.id] = el.checked;
  });
  await updateDoc(doc(db, 'users', uid), { perms });
  toast('🔐 Permissões salvas!');
  closeModal('modal-perms');
};

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════
// THEME SYSTEM — deve ficar antes do openSettingsModal
// ══════════════════════════════════════

window.setTheme = function (theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('musicsys_theme', theme);
  document.querySelectorAll('.theme-dot').forEach(d => {
    d.classList.toggle('active', d.getAttribute('data-t') === theme);
  });
  updateThemeCards();
  // Also mark new settings theme cards
  if (typeof nsMarkTheme === 'function') nsMarkTheme(theme);
};

function updateThemeCards() {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  document.querySelectorAll('.theme-preview-card').forEach(card => {
    const t = card.id.replace('tc-', '');
    card.classList.toggle('active-theme', t === theme);
  });
}
window.updateThemeCards = updateThemeCards;

// ── SETTINGS TABS ──
window.switchSettingsTab = function (tab) {
  document.querySelectorAll('.settings-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.settings-panel').forEach(p => p.classList.toggle('active', p.id === 'stab-' + tab));
};

// ── ACCESSIBILITY ──
const _accState = { font: 'sm', contrast: 'normal', anim: 'on', colorblind: 'none', spacing: 'normal' };

window.setAccessibility = function (type, value) {
  _accState[type] = value;
  localStorage.setItem('musicsys_acc', JSON.stringify(_accState));
  applyAccessibility();
  document.querySelectorAll(`[id^="acc-${type}-"]`).forEach(b => {
    b.classList.toggle('active', b.id === `acc-${type}-${value}`);
  });
};

function applyAccessibility() {
  const el = document.documentElement;
  el.setAttribute('data-font', _accState.font);
  el.setAttribute('data-contrast', _accState.contrast);
  el.setAttribute('data-anim', _accState.anim);
  el.setAttribute('data-cb', _accState.colorblind);
  el.setAttribute('data-spacing', _accState.spacing);
}

function restoreAccessibilityUI() {
  Object.entries(_accState).forEach(([type, value]) => {
    document.querySelectorAll(`[id^="acc-${type}-"]`).forEach(b => {
      b.classList.toggle('active', b.id === `acc-${type}-${value}`);
    });
  });
}
window.restoreAccessibilityUI = restoreAccessibilityUI;

// Init theme e acessibilidade ao carregar a página
(function initApp() {
  const savedTheme = localStorage.getItem('musicsys_theme') || 'dark';
  window.setTheme(savedTheme);
  try {
    const savedAcc = JSON.parse(localStorage.getItem('musicsys_acc') || '{}');
    Object.assign(_accState, savedAcc);
    applyAccessibility();
  } catch (e) { }
})();

// ══════════════════════════════════════
window.openSettingsModal = function (tabId) {
  const ud = currentUserData || { name: currentUser?.displayName || '', email: currentUser?.email || '' };
  // Populate existing IDs (these are now inside ns-panel-perfil)
  const nameEl = document.getElementById('settings-name'); if (nameEl) { nameEl.value = ud?.name || ''; document.getElementById('ns-live-name').textContent = ud?.name || 'Sem nome'; }
  const bioEl = document.getElementById('settings-bio'); if (bioEl) { bioEl.value = ud?.bio || ''; if (document.getElementById('ns-bio-count')) document.getElementById('ns-bio-count').textContent = (ud?.bio || '').length + ' / 200'; }
  const avEl = document.getElementById('settings-avatar-url'); if (avEl) avEl.value = ud?.photoURL || ud?.avatar || '';
  const npEl = document.getElementById('settings-new-pass'); if (npEl) npEl.value = '';
  const cpEl = document.getElementById('settings-confirm-pass'); if (cpEl) cpEl.value = '';
  previewSettingsAvatar(ud?.photoURL || ud?.avatar || '');
  previewSettingsBanner(ud?.bannerURL || '');

  // Handle display name
  if (document.getElementById('ns-live-name')) document.getElementById('ns-live-name').textContent = ud?.name || 'Sem nome';

  // Email display
  const emailDisplay = document.getElementById('current-user-email-display');
  if (emailDisplay) emailDisplay.textContent = currentUser?.email || '—';

  // Google link status
  const googleStatus = document.getElementById('google-link-status');
  const btnLink = document.getElementById('btn-link-google');
  if (googleStatus && btnLink) {
    const providers = currentUser?.providerData || [];
    const hasGoogle = providers.some(p => p.providerId === 'google.com');
    if (hasGoogle) {
      googleStatus.innerHTML = '<strong style="color:var(--green)">Google vinculado</strong>';
      btnLink.textContent = 'CONECTADO';
      btnLink.classList.add('ns-connected');
      btnLink.disabled = true;
    } else {
      googleStatus.innerHTML = 'Google nao vinculado';
      btnLink.textContent = 'CONECTAR';
      btnLink.classList.remove('ns-connected');
      btnLink.disabled = false;
    }
  }

  // FIX: Always fetch fresh talent profile from Firestore (never trust stale cache)
  // This prevents showing handle from a previously logged-in account
  const _nsPopulateTalentFields = (tp) => {
    if (!tp) return;
    const handleEl = document.getElementById('ns-inp-handle');
    if (handleEl) {
      handleEl.value = tp.handle || '';
      // Store the original handle to detect changes later in nsSaveAll
      handleEl.dataset.originalHandle = tp.handle || '';
      const liveHandle = document.getElementById('ns-live-handle');
      if (liveHandle) liveHandle.textContent = tp.handle || '@';
    }
    const socialMap = { youtube: 'ns-social-yt', spotify: 'ns-social-spotify', instagram: 'ns-social-ig', tiktok: 'ns-social-tt', discord: 'ns-social-dc', website: 'ns-social-web' };
    Object.entries(socialMap).forEach(([key, elId]) => {
      const el = document.getElementById(elId);
      if (el) el.value = tp.social?.[key] || tp.links?.[key] || '';
    });
    const avail = tp.availability || 'open';
    document.querySelectorAll('.ns-avail-pill').forEach(p => p.classList.remove('active-ns-avail'));
    const activePill = document.getElementById('ns-avail-' + avail);
    if (activePill) activePill.classList.add('active-ns-avail');
  };

  // Clear fields first (prevents stale data flash)
  const handleEl = document.getElementById('ns-inp-handle');
  if (handleEl) { handleEl.value = ''; handleEl.dataset.originalHandle = ''; }
  document.getElementById('ns-live-handle').textContent = '@';

  if (currentUser) {
    getDoc(doc(db, 'talent_profiles', currentUser.uid)).then(snap => {
      if (snap.exists()) {
        window._myTalentProfile = { id: currentUser.uid, ...snap.data() };
        _nsPopulateTalentFields(window._myTalentProfile);
      }
    }).catch(() => { });
  }

  // Build skill grid
  nsRenderSkillGrid();

  // Mark active theme
  nsMarkTheme(localStorage.getItem('musicsys_theme') || 'dark');

  // Mark active font/density
  nsRestoreLayoutUI();

  // Sessions info
  nsLoadSessionInfo();

  // Tickets
  nsLoadTickets();

  // Service status
  setTimeout(() => {
    const statusEl = document.getElementById('ns-service-status');
    if (statusEl) statusEl.textContent = '● Todos operacionais';
  }, 800);

  // Switch to requested tab
  if (tabId) {
    const panelId = 'ns-panel-' + tabId;
    const navItem = document.querySelector(`[data-panel="${panelId}"]`);
    if (navItem) nsTab(panelId, navItem);
    else nsTab('ns-panel-perfil', document.querySelector('[data-panel="ns-panel-perfil"]'));
  } else {
    nsTab('ns-panel-perfil', document.querySelector('[data-panel="ns-panel-perfil"]'));
  }

  openModal('modal-settings');
};
window.linkGoogleAccount = async function () {
  if (!currentUser) {
    toast('❌ Usuário não autenticado!', 'error');
    return;
  }

  try {
    const providers = currentUser.providerData || [];
    const hasGoogle = providers.some(p => p.providerId === 'google.com');

    if (hasGoogle) {
      toast('✅ Google já está vinculado!', 'success');
      return;
    }

    showLoading('Vinculando conta Google...');

    // Cria provider do Google
    const googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });

    // Vincula a conta atual com Google
    await linkWithPopup(currentUser, googleProvider);

    hideLoading();
    toast('🎉 Conta Google vinculada com sucesso!', 'success');

    // Atualiza o modal
    openSettingsModal();

  } catch (e) {
    hideLoading();

    // Trata erros específicos
    if (e.code === 'auth/credential-already-in-use') {
      toast('❌ Esta conta Google já está vinculada a outro usuário!', 'error');
    } else if (e.code === 'auth/popup-blocked') {
      toast('❌ Pop-up bloqueado! Permita pop-ups e tente novamente.', 'error');
    } else if (e.code === 'auth/popup-closed-by-user') {
      toast('ℹ️ Vinculação cancelada.', 'info');
    } else {
      console.error('Erro ao vincular Google:', e);
      toast('❌ Erro ao vincular: ' + e.message, 'error');
    }
  }
};

// ─── PRIVATE MESSAGING SYSTEM ────────────────────────────────────────────────
const PM_TTL_DAYS = 7;
let _pmOpen = false;
let _pmCurrentConvUid = null;
let _pmCurrentConvName = null;
let _pmCurrentConvPhoto = null;
let _pmUnsubConv = null;
let _pmUnsubInbox = null;
let _pmConversations = [];
let _pmConvMap = {};           // uid → conv data (photo safe lookup)
let _pmInboxCurrentUid = null;
let _pmInboxCurrentName = null;
let _pmInboxCurrentPhoto = null;
let _pmUnsubInboxChat = null;
let _pmInboxFilter = 'all';
let _pmInboxSearch = '';

// ── Helper: generate chatId ──
function pmChatId(uid1, uid2) { return [uid1, uid2].sort().join('_'); }

// ── Helper: avatar HTML — wrapper div approach to avoid onclick breakage ──
function pmAvatarHtml(name, photo, size = 38, radius = '50%', extraStyle = '') {
  const letter = (name || '?')[0].toUpperCase();
  const colors = [
    'linear-gradient(135deg,#ff3cb4,#ff6b3d)',
    'linear-gradient(135deg,#ffc83c,#ff6b3d)',
    'linear-gradient(135deg,#6b3dff,#ff3cb4)',
    'linear-gradient(135deg,#72efdd,#6b3dff)',
    'linear-gradient(135deg,#ff5c7c,#ff3cb4)',
  ];
  const bg = colors[letter.charCodeAt(0) % colors.length];
  const sz = `width:${size}px;height:${size}px;border-radius:${radius};`;
  const fallbackStyle = `${sz}background:${bg};display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.37)}px;font-weight:800;color:#fff;${extraStyle}`;
  if (photo && photo.trim()) {
    // Always try to show the photo; onerror swaps to letter avatar
    const safePhoto = photo.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `<img src="${safePhoto}" style="${sz}object-fit:cover;${extraStyle}" onerror="this.outerHTML='<div style=\\'${fallbackStyle.replace(/'/g, "\\'")}\\'>${letter}</div>'">`;
  }
  return `<div style="${fallbackStyle}">${letter}</div>`;
}

// ── Helper: set avatar into an existing element ──
function pmSetAvEl(el, name, photo, size = 38, radius = '50%') {
  if (!el) return;
  el.innerHTML = pmAvatarHtml(name, photo, size, radius);
}

// ── Helper: relative time ──
function pmRelTime(ts) {
  if (!ts) return '';
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'agora';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm';
  if (diff < 86400000) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const days = Math.floor(diff / 86400000);
  if (days === 1) return 'ontem';
  const dow = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()];
  if (days < 7) return dow;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ── TTL cutoff ──
function pmTtlCutoff() {
  const d = new Date(); d.setDate(d.getDate() - PM_TTL_DAYS); return d;
}

// ── Photo cache: uid → photoURL (populated lazily from Firestore) ──
const _pmPhotoCache = {};

// ── Get photo (sync, from cache or conv map) ──
function pmGetPhoto(uid) {
  if (_pmPhotoCache[uid] !== undefined) return _pmPhotoCache[uid]; // '' means no photo
  return _pmConvMap[uid]?.otherPhoto || '';
}

// ── Fetch and cache photo for a uid, then update any avatar elements with data-uid ──
async function pmFetchPhoto(uid) {
  if (_pmPhotoCache[uid] !== undefined) return _pmPhotoCache[uid];
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const photo = snap.exists() ? (snap.data().photoURL || '') : '';
    _pmPhotoCache[uid] = photo;
    // Update all rendered avatar elements with this uid
    document.querySelectorAll(`[data-pm-uid="${uid}"]`).forEach(el => {
      const name = el.dataset.pmName || '?';
      const size = parseInt(el.dataset.pmSize || '38');
      const radius = el.dataset.pmRadius || '50%';
      el.innerHTML = pmAvatarHtml(name, photo, size, radius);
    });
    return photo;
  } catch (e) { _pmPhotoCache[uid] = ''; return ''; }
}

// ── Render avatar slot that auto-updates when photo loads ──
function pmAvSlot(uid, name, size = 38, radius = '50%') {
  const photo = pmGetPhoto(uid);
  const dataAttrs = `data-pm-uid="${uid}" data-pm-name="${escHtml(name)}" data-pm-size="${size}" data-pm-radius="${radius}"`;
  const inner = pmAvatarHtml(name, photo, size, radius);
  // Schedule async fetch if not yet cached
  if (_pmPhotoCache[uid] === undefined) {
    setTimeout(() => pmFetchPhoto(uid), 0);
  }
  return `<div ${dataAttrs} style="width:${size}px;height:${size}px;border-radius:${radius};overflow:hidden;flex-shrink:0">${inner}</div>`;
}

// ── Init ──
function pmInit() {
  if (!currentUser) return;
  document.getElementById('pm-widget')?.classList.add('visible');
  const sideBtn = document.getElementById('pm-sidebar-btn');
  if (sideBtn) sideBtn.style.display = 'flex';
  pmListenConversations();
  setTimeout(pmCleanupExpired, 3000);
  // Atualiza user info na teams-screen bar
  _tsUpdateUserBar();
}

function _tsUpdateUserBar() {
  const ud = currentUserData;
  if (!ud && !currentUser) return;
  // Avatar
  const av = document.getElementById('ts-user-av');
  if (av) {
    if (ud?.photoURL) av.innerHTML = `<img src="${escHtml(ud.photoURL)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
    else av.textContent = (ud?.name || currentUser?.email || '?')[0].toUpperCase();
  }
  // PATCH 5.4A — nome isolado para suporte ao ellipsis, com badges movidas para o ts-plan-value
  const nameEl = document.getElementById('ts-user-name');
  if (nameEl) {
    const uname = ud?.name || currentUser?.email || '—';
    nameEl.textContent = uname;
  }

  // Utiliza o #ts-plan-value para acomodar os badges sem serem cortados por limites de texto
  const planEl = document.getElementById('ts-plan-value');
  if (planEl) {
    const p = typeof getEffectivePlanForUser === 'function' ? getEffectivePlanForUser(ud) : ud;
    const planChip = typeof renderPlanChip === 'function' ? renderPlanChip(p, 'inline') : '';
    const roleChip = typeof renderRoleChip === 'function' ? renderRoleChip(ud?.staffRole) : '';

    const combinedChips = (roleChip ? roleChip : '') + (planChip ? (roleChip ? ' ' : '') + planChip : '');
    if (combinedChips) {
      planEl.innerHTML = combinedChips;
      planEl.style.display = 'flex';
      planEl.style.alignItems = 'center';
      planEl.style.gap = '4px';
    } else {
      planEl.innerHTML = '';
      planEl.style.display = 'none';
    }
  }
  // Show PM button
  const tsPm = document.getElementById('ts-pm-btn');
  if (tsPm) tsPm.style.display = 'flex';
}

// ── Renders all "extras" on the teams screen (profile pill, dashboard btn, user bar) ──
function renderTeamsScreenExtras() {
  // 1. Update user bar (avatar, name, plan)
  _tsUpdateUserBar();
  // Atualiza visibilidade de itens staff/admin sem depender de _currentTeamId
  refreshStaffNav();

  // 2. Update profile pill and dashboard button based on talent profile
  const profile = _myTalentProfile || window._myTalentProfile || null;
  const pill = document.getElementById('ts-profile-pill');
  const dash = document.getElementById('ft-goto-dashboard');
  const navDash = document.getElementById('ts-nav-dash');

  if (profile && profile.name) {
    // Pill agora é oculto (removido do layout) — só mostramos o Dashboard btn
    if (dash) dash.style.display = 'block';
    if (navDash) navDash.style.display = 'flex';
  } else {
    // Try to load profile async and retry
    if (currentUser) {
      (async () => {
        try {
          if (!_myTalentProfile) {
            const snap = await getDocs(collection(db, 'talent_profiles'));
            const me = snap.docs.find(d => d.data().uid === currentUser.uid);
            if (me) {
              _myTalentProfile = { id: me.id, ...me.data() };
              window._myTalentProfile = _myTalentProfile;
              renderTeamsScreenExtras();
            }
          }
        } catch (e) { /* no talent profile yet */ }
      })();
    }
    if (pill) pill.style.display = 'none';
    if (dash) dash.style.display = 'none';
    if (navDash) navDash.style.display = 'none';
  }

  // 3. Ensure floating chat bubble is visible when logged in
  if (currentUser) {
    document.getElementById('pm-widget')?.classList.add('visible');
  }

  // 4. Atualiza visibilidade de ADMIN/STAFF na sidebar da teams-screen.
  // applyPermissions() controla ts-admin-section e ts-staff-section mas
  // anteriormente só era chamada por startListeners() → showMainApp() →
  // enterTeam(). Chamar aqui garante que os itens apareçam mesmo sem
  // equipe ativa (ex: primeiro login, ou acesso direto ao Painel Master).
  _tsApplyStaffVisibility();
}

// Atualiza visibilidade de ADMIN e STAFF na teams-screen sidebar.
// Separada de applyPermissions() para poder ser chamada sem depender
// de _currentTeamId ou de contexto de workspace.
// _tsApplyStaffVisibility — mostra/oculta seção STAFF na sidebar da teams-screen.
// ts-admin-section foi removida: Admin Tickets e Workspace são abas do Painel Master.
// Apenas ts-staff-section subsiste, controlada exclusivamente por isStaff().
function _tsApplyStaffVisibility() {
  if (!currentUser) return;
  const staff = isStaff();
  const tsStaffSection = document.getElementById('ts-staff-section');
  if (tsStaffSection) tsStaffSection.style.display = staff ? '' : 'none';
}

// ── Stop ──
function pmStop() {
  _pmUnsubConv?.(); _pmUnsubConv = null;
  _pmUnsubInbox?.(); _pmUnsubInbox = null;
  _pmUnsubInboxChat?.(); _pmUnsubInboxChat = null;
  _pmOpen = false; _pmCurrentConvUid = null; _pmConversations = []; _pmConvMap = {};
  document.getElementById('pm-widget')?.classList.remove('visible');
  const sb = document.getElementById('pm-sidebar-btn'); if (sb) sb.style.display = 'none';
  document.getElementById('pm-inbox-overlay')?.classList.remove('open');
}

// ── Listen conversations ──
function pmListenConversations() {
  if (!currentUser || !db) return;
  _pmUnsubInbox?.();
  try {
    _pmUnsubInbox = onSnapshot(
      query(collection(db, 'pm_convs', currentUser.uid, 'convs'), orderBy('lastTs', 'desc')),
      snap => {
        _pmConversations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        _pmConvMap = {};
        _pmConversations.forEach(c => { _pmConvMap[c.otherUid] = c; });
        pmUpdateUnreadBadges();
        pmRenderConvList();
        pmRenderInboxContacts();
      },
      err => console.warn('[PM] conv listener error:', err)
    );
  } catch (e) { console.warn('[PM] init error:', e); }
}

// ── Unread badges + pulse ──
function pmUpdateUnreadBadges() {
  const total = _pmConversations.reduce((s, c) => s + (c.unread || 0), 0);
  const bb = document.getElementById('pm-bubble-badge');
  if (bb) { bb.textContent = total || ''; bb.classList.toggle('show', total > 0); }
  const sb = document.getElementById('pm-sidebar-badge');
  if (sb) { sb.textContent = total || ''; sb.classList.toggle('show', total > 0); }
  // Teams-screen badge
  const tb = document.getElementById('ts-pm-badge');
  if (tb) { tb.textContent = total || ''; tb.classList.toggle('show', total > 0); }
  // Pulse the bubble when there are unread messages
  document.getElementById('pm-bubble-btn')?.classList.toggle('has-unread', total > 0);
}

// ── Toggle floating panel ──
window.pmToggle = function () {
  _pmOpen = !_pmOpen;
  document.getElementById('pm-panel')?.classList.toggle('open', _pmOpen);
  if (_pmOpen) pmShowList();
  else { _pmUnsubConv?.(); _pmUnsubConv = null; }
};

// ── Show list view ──
window.pmShowList = function () {
  document.getElementById('pm-list-view')?.classList.remove('hide');
  document.getElementById('pm-chat-view')?.classList.remove('show');
  document.getElementById('pm-back-area').style.display = 'none';
  document.getElementById('pm-panel-title').textContent = 'MENSAGENS';
  document.getElementById('pm-panel-title').onclick = null;
  document.getElementById('pm-panel-title').style.cursor = 'default';
  _pmUnsubConv?.(); _pmUnsubConv = null; _pmCurrentConvUid = null;
};

// ── Render conv list in bubble panel ──
function pmRenderConvList() {
  const list = document.getElementById('pm-conv-list'); if (!list) return;
  if (!_pmConversations.length) {
    list.innerHTML = '<div class="pm-empty">Nenhuma conversa ainda.<br>Clique em ➕ para começar.</div>'; return;
  }
  list.innerHTML = _pmConversations.map(c => {
    const unread = c.unread || 0;
    const preview = c.lastMsg ? escHtml(c.lastMsg).substring(0, 40) : '—';
    const time = pmRelTime(c.lastTs);
    return `<div class="pm-conv-item ${_pmCurrentConvUid === c.otherUid ? 'active' : ''}" data-conv-uid="${c.otherUid}" onclick="pmOpenConvByUid(this.dataset.convUid)">
      ${pmAvSlot(c.otherUid, c.otherName || '?', 38, '50%')}
      <div class="pm-conv-info">
        <div class="pm-conv-name">${escHtml(c.otherName || '?')}</div>
        <div class="pm-conv-preview">${preview}</div>
      </div>
      <div class="pm-conv-meta">
        <span class="pm-conv-time">${time}</span>
        ${unread > 0 ? `<span class="pm-conv-unread">${unread}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Open conv by uid (safe, no photo in attr) ──
window.pmOpenConvByUid = function (uid) {
  const c = _pmConvMap[uid]; if (!c) return;
  pmOpenConv(uid, c.otherName, pmGetPhoto(uid));
};

// ── Open a conversation in bubble panel ──
window.pmOpenConv = function (otherUid, otherName, otherPhoto) {
  _pmCurrentConvUid = otherUid; _pmCurrentConvName = otherName; _pmCurrentConvPhoto = otherPhoto;
  document.getElementById('pm-list-view')?.classList.add('hide');
  document.getElementById('pm-chat-view')?.classList.add('show');
  document.getElementById('pm-back-area').style.display = 'flex';
  // Make name clickable to open profile
  const titleEl = document.getElementById('pm-panel-title');
  titleEl.textContent = otherName || 'Chat';
  titleEl.style.cursor = 'pointer';
  titleEl.onclick = () => pmOpenProfilePanel(otherUid);
  pmMarkRead(otherUid);
  pmListenMessages(otherUid);
  setTimeout(() => document.getElementById('pm-chat-input')?.focus(), 100);
};

// ── Listen messages ──
function pmListenMessages(otherUid) {
  _pmUnsubConv?.(); _pmUnsubConv = null;
  const chatId = pmChatId(currentUser.uid, otherUid);
  const cutoff = pmTtlCutoff();
  try {
    _pmUnsubConv = onSnapshot(
      query(collection(db, 'pm_chats', chatId, 'messages'), where('createdAt', '>=', cutoff), orderBy('createdAt', 'asc'), limit(80)),
      snap => pmRenderMessages(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.warn('[PM] msg listener:', err)
    );
  } catch (e) { console.warn('[PM] listenMessages error:', e); }
}

// ── Render messages in bubble ──
function pmRenderMessages(msgs) {
  const area = document.getElementById('pm-msgs-area'); if (!area) return;
  if (!msgs.length) { area.innerHTML = '<div class="pm-empty">Nenhuma mensagem. Diga olá! 👋</div>'; return; }
  area.innerHTML = msgs.map(m => {
    const mine = m.from === currentUser?.uid;
    const ts = m.createdAt?.toDate ? m.createdAt.toDate() : new Date(m.createdAt || Date.now());
    const time = ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `<div class="pm-msg ${mine ? 'mine' : 'theirs'}">
      <div class="pm-bbl">${escHtml(m.text || '')}</div>
      <span class="pm-bbl-time">${time}${mine ? ' ✓✓' : ''}</span>
    </div>`;
  }).join('');
  setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
}

// ── Send from bubble ──
window.pmSendMessage = async function () {
  if (!currentUser || !_pmCurrentConvUid) return;
  const input = document.getElementById('pm-chat-input');
  const text = input?.value.trim(); if (!text) return;
  input.value = '';
  await pmSendTo(_pmCurrentConvUid, _pmCurrentConvName, _pmCurrentConvPhoto, text);
};

// ── Core send ──
async function pmSendTo(otherUid, otherName, otherPhoto, text) {
  if (!currentUser || !db) return;
  const chatId = pmChatId(currentUser.uid, otherUid);
  const myName = currentUserData?.name || currentUser.displayName || 'Usuário';
  // Never store base64 in conv index (Firestore 1MB limit) — use '' instead, pmFetchPhoto handles display
  const myPhotoRaw = currentUserData?.photoURL || currentUserData?.avatar || currentUser.photoURL || '';
  const myPhoto = myPhotoRaw.startsWith('data:') ? '' : myPhotoRaw;
  const otherPhotoSafe = (otherPhoto || '').startsWith('data:') ? '' : (otherPhoto || '');
  const now = serverTimestamp ? serverTimestamp() : new Date();
  const nowDate = new Date();
  // 1. Write the message (critical — show error if fails)
  try {
    await addDoc(collection(db, 'pm_chats', chatId, 'messages'), {
      from: currentUser.uid, to: otherUid, text,
      createdAt: now, fromName: myName
    });
  } catch (e) { console.error('[PM] message write error:', e); toast('Erro ao enviar mensagem', 'error'); return; }
  // 2. Update sender's own conv index
  try {
    await setDoc(doc(db, 'pm_convs', currentUser.uid, 'convs', otherUid), {
      otherUid, otherName, otherPhoto: otherPhotoSafe,
      lastMsg: text, lastTs: nowDate, unread: 0
    }, { merge: true });
  } catch (e) { console.warn('[PM] sender conv index error:', e); }
  // 3. Update recipient conv index (requires updated Firestore rules: allow write if auth.uid == convId)
  try {
    const recipSnap = await getDoc(doc(db, 'pm_convs', otherUid, 'convs', currentUser.uid));
    const recipData = recipSnap.exists() ? recipSnap.data() : {};
    await setDoc(doc(db, 'pm_convs', otherUid, 'convs', currentUser.uid), {
      otherUid: currentUser.uid, otherName: myName, otherPhoto: myPhoto,
      lastMsg: text, lastTs: nowDate, unread: (recipData.unread || 0) + 1
    }, { merge: true });
  } catch (e) { console.warn('[PM] recipient conv index error:', e.code || e.message); }
}

// ── Mark read ──
async function pmMarkRead(otherUid) {
  if (!currentUser || !db) return;
  try { await setDoc(doc(db, 'pm_convs', currentUser.uid, 'convs', otherUid), { unread: 0 }, { merge: true }); } catch (e) { }
}

// ── Start new chat ──
window.pmStartNewChat = function () { pmOpenInbox(); };

// ── Expõe funções críticas do módulo PM para scripts externos (Match System, etc.) ──
// pmSendTo e pmChatId precisam ser acessíveis fora do módulo para o chat inline do Match funcionar.
window.pmSendTo = pmSendTo;
window.pmChatId = pmChatId;

// ── Cleanup expired ──
async function pmCleanupExpired() {
  if (!currentUser || !db) return;
  try {
    const cutoff = pmTtlCutoff();
    for (const conv of _pmConversations.slice(0, 5)) {
      const chatId = pmChatId(currentUser.uid, conv.otherUid);
      const old = await getDocs(query(collection(db, 'pm_chats', chatId, 'messages'), where('createdAt', '<', cutoff), limit(20)));
      old.docs.forEach(d => deleteDoc(d.ref).catch(() => { }));
    }
  } catch (e) { }
}

// ══════════════════════════════════════════════════════════════════════════════
// INBOX MODAL
// ══════════════════════════════════════════════════════════════════════════════

window.pmOpenInbox = function (openToUid, openToName, openToPhoto) {
  if (_pmOpen) { _pmOpen = false; document.getElementById('pm-panel')?.classList.remove('open'); }
  document.getElementById('pm-inbox-overlay')?.classList.add('open');
  pmRenderInboxContacts();
  if (openToUid) pmInboxOpenConv(openToUid, openToName, openToPhoto);
  else if (_pmInboxCurrentUid) pmInboxOpenConv(_pmInboxCurrentUid, _pmInboxCurrentName, _pmInboxCurrentPhoto);
};

window.pmCloseInbox = function (e) {
  if (e && e.target !== document.getElementById('pm-inbox-overlay')) return;
  document.getElementById('pm-inbox-overlay')?.classList.remove('open');
  _pmUnsubInboxChat?.(); _pmUnsubInboxChat = null;
};

// ── Render inbox contacts ──
function pmRenderInboxContacts() {
  const list = document.getElementById('pm-inbox-contacts'); if (!list) return;
  let convs = _pmConversations;
  if (_pmInboxFilter === 'unread') convs = convs.filter(c => c.unread > 0);
  if (_pmInboxSearch) { const q = _pmInboxSearch.toLowerCase(); convs = convs.filter(c => (c.otherName || '').toLowerCase().includes(q)); }
  if (!convs.length) { list.innerHTML = `<div class="pm-empty" style="padding:24px 12px">${_pmInboxSearch ? 'Nenhum resultado.' : 'Nenhuma conversa ainda.'}</div>`; return; }
  list.innerHTML = convs.map(c => {
    const unread = c.unread || 0;
    const preview = c.lastMsg ? escHtml(c.lastMsg).substring(0, 44) : '—';
    return `<div class="pm-inbox-contact ${_pmInboxCurrentUid === c.otherUid ? 'active' : ''}" data-conv-uid="${c.otherUid}" onclick="pmInboxOpenConvByUid(this.dataset.convUid)">
      ${pmAvSlot(c.otherUid, c.otherName || '?', 40, '12px')}
      <div class="pm-inbox-contact-info">
        <div class="pm-inbox-contact-name">${escHtml(c.otherName || '?')}</div>
        <div class="pm-inbox-contact-preview">${preview}</div>
      </div>
      ${unread > 0 ? `<span class="pm-inbox-contact-unread">${unread}</span>` : ''}
    </div>`;
  }).join('');
}

window.pmInboxTab = function (tab, btn) {
  _pmInboxFilter = tab;
  document.querySelectorAll('.pm-inbox-tab').forEach(b => b.classList.remove('active'));
  btn?.classList.add('active');
  pmRenderInboxContacts();
};
window.pmFilterContacts = function (val) { _pmInboxSearch = val; pmRenderInboxContacts(); };

// Safe opener from onclick attr
window.pmInboxOpenConvByUid = function (uid) {
  const c = _pmConvMap[uid]; if (!c) return;
  pmInboxOpenConv(uid, c.otherName, pmGetPhoto(uid));
};

// ── Open conversation in inbox ──
window.pmInboxOpenConv = function (otherUid, otherName, otherPhoto) {
  _pmInboxCurrentUid = otherUid; _pmInboxCurrentName = otherName; _pmInboxCurrentPhoto = otherPhoto;
  pmRenderInboxContacts();
  document.getElementById('pm-inbox-empty-state').style.display = 'none';
  const chatArea = document.getElementById('pm-inbox-chat-area');
  if (chatArea) chatArea.style.display = 'flex';
  // Header avatar — show immediately with cached/stored photo, then update with fresh fetch
  const avEl = document.getElementById('pm-inbox-chat-av');
  if (avEl) {
    avEl.innerHTML = pmAvatarHtml(otherName, otherPhoto, 42, '12px');
    // Also set pm-uid so pmFetchPhoto auto-updates it
    avEl.setAttribute('data-pm-uid', otherUid);
    avEl.setAttribute('data-pm-name', otherName || '?');
    avEl.setAttribute('data-pm-size', '42');
    avEl.setAttribute('data-pm-radius', '12px');
    pmFetchPhoto(otherUid); // async, will update when done
  }
  // Header name — clickable to open profile
  const nameEl = document.getElementById('pm-inbox-chat-name');
  if (nameEl) {
    nameEl.textContent = otherName || '?';
    nameEl.style.cursor = 'pointer';
    nameEl.title = 'Ver perfil completo';
    nameEl.onclick = () => pmOpenProfilePanel(otherUid);
  }
  document.getElementById('pm-inbox-chat-meta').textContent = '';
  const inp = document.getElementById('pm-inbox-input');
  if (inp) { inp.placeholder = `Mensagem para ${otherName || ''}...`; inp.focus(); }
  pmMarkRead(otherUid);
  // Load right panel profile
  pmLoadRightPanel(otherUid, otherName, otherPhoto);
  // Listen messages
  _pmUnsubInboxChat?.(); _pmUnsubInboxChat = null;
  const chatId = pmChatId(currentUser.uid, otherUid);
  const cutoff = pmTtlCutoff();
  try {
    _pmUnsubInboxChat = onSnapshot(
      query(collection(db, 'pm_chats', chatId, 'messages'), where('createdAt', '>=', cutoff), orderBy('createdAt', 'asc'), limit(100)),
      snap => pmRenderInboxMessages(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      err => console.warn('[PM] inbox chat listener:', err)
    );
  } catch (e) { console.warn('[PM] inboxOpenConv error:', e); }
};

// ── RIGHT PANEL: load and render profile ──
async function pmLoadRightPanel(uid, name, photo) {
  const rp = document.getElementById('pm-inbox-right');
  const rpBody = document.getElementById('pm-rp-body');
  const rpBanner = document.getElementById('pm-rp-banner');
  if (!rp) return;
  rp.classList.remove('hidden');
  rpBody.innerHTML = '<div class="pm-rp-loading">Carregando perfil...</div>';
  // Set initial avatar immediately (no wait)
  const rpAvEl = document.getElementById('pm-rp-av');
  pmSetAvEl(rpAvEl, name, photo, 46, '50%');
  try {
    // Fetch user doc, talent_profile, and teams all in parallel
    const [userSnap, tpSnap, allTeamsSnap] = await Promise.all([
      getDoc(doc(db, 'users', uid)).catch(() => null),
      getDoc(doc(db, 'talent_profiles', uid)).catch(() => null),
      getDocs(query(collection(db, 'teams'), where('memberUids', 'array-contains', currentUser?.uid || '_'))).catch(() => ({ docs: [] })),
    ]);
    const userData = userSnap?.exists() ? userSnap.data() : {};
    const tpData = tpSnap?.exists() ? tpSnap.data() : {};
    const finalPhoto = tpData.photoURL || userData.photoURL || photo || '';
    const bannerURL = tpData.bannerURL || userData.bannerURL || '';
    const displayName = tpData.name || userData.name || name || '?';
    const handle = tpData.handle || tpData.username || userData.username || userData.email?.split('@')[0] || '';
    // Skills: stored as {roleId: level} — convert to human labels using ROLES_CATALOG
    const skillsObj = tpData.skills || {};
    const skillLabels = Object.keys(skillsObj).map(rid => {
      const cat = (typeof ROLES_CATALOG !== 'undefined' ? ROLES_CATALOG : []).find(r => r.id === rid);
      return cat ? `${cat.icon || ''} ${cat.label}` : rid;
    });
    // Teams: filter all teams where this user is a member
    const userTeams = allTeamsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(t => (t.members || []).some(m => m.uid === uid))
      .slice(0, 3);
    const isOnline = userData.lastSeen ? (Date.now() - (userData.lastSeen?.toDate?.()?.getTime() || 0)) < 300000 : false;
    const projects = tpData.projectCount || 0;
    const habilidades = skillLabels.length;

    // Update banner
    if (bannerURL) {
      rpBanner.style.background = '';
      rpBanner.innerHTML = `<img src="${bannerURL.replace(/"/g, '&quot;')}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.style.background='linear-gradient(135deg,var(--a1),var(--a2),var(--a3))'">`;
    } else {
      rpBanner.innerHTML = '';
      rpBanner.style.background = 'linear-gradient(135deg,var(--a1),var(--a2),var(--a3))';
    }
    // Re-inject avatar wrap on top of banner
    rpBanner.innerHTML += `<div class="pm-rp-av-wrap"><div class="pm-rp-av" style="background:linear-gradient(135deg,var(--a1),var(--a2))">${pmAvatarHtml(displayName, finalPhoto, 46, '50%')}</div></div>`;

    // Skills section
    const skillsHtml = skillLabels.length ? `<div>
      <div class="pm-rp-section-label">Habilidades</div>
      <div class="pm-rp-skills">${skillLabels.slice(0, 6).map(s => `<span class="pm-rp-skill">${escHtml(s)}</span>`).join('')}</div>
    </div>` : '';

    // Teams section
    const teamsHtml = userTeams.length ? `<div>
      <div class="pm-rp-section-label">Equipes</div>
      ${userTeams.map(t => {
      const mem = (t.members || []).find(m => m.uid === uid);
      const roleMap = { owner: '👑 Dono', admin: '⭐ Admin', member: '👥 Membro' };
      const roleLabel = roleMap[mem?.role] || '👥 Membro';
      const tLetter = (t.name || '?')[0].toUpperCase();
      const tColors = ['#ff3cb4', '#ffc83c', '#6b3dff', '#72efdd', '#ff6b3d'];
      const tBg = tColors[tLetter.charCodeAt(0) % tColors.length];
      return `<div class="pm-rp-team">
          <div class="pm-rp-team-av" style="background:${tBg}">${tLetter}</div>
          <div class="pm-rp-team-info">
            <div class="pm-rp-team-name">${escHtml(t.name || 'Equipe')}</div>
            <div class="pm-rp-team-role">${roleLabel} · ${t.members?.length || 0} membros</div>
          </div>
        </div>`;
    }).join('')}
    </div>` : '';

    // Stats section
    const statsHtml = `<div>
      <div class="pm-rp-section-label">Stats</div>
      <div class="pm-rp-stats">
        <div class="pm-rp-stat"><div class="pm-rp-stat-val">${projects}</div><div class="pm-rp-stat-lbl">Projetos</div></div>
        <div class="pm-rp-stat"><div class="pm-rp-stat-val">${habilidades}</div><div class="pm-rp-stat-lbl">Habilidades</div></div>
      </div>
    </div>`;

    rpBody.innerHTML = `
      <div>
        <div class="pm-rp-name">${escHtml(displayName)}</div>
        <div class="pm-rp-handle">
          ${handle ? `<span>@${escHtml(handle)}</span>` : ''}
          <span class="pm-rp-online ${isOnline ? 'on' : ''}"></span>
          <span style="font-size:9px;color:var(--text3)">${isOnline ? ' Online agora' : ' Offline'}</span>
        </div>
      </div>
      ${skillsHtml}
      ${teamsHtml}
      ${statsHtml}
      <button class="pm-rp-full-btn" onclick="pmOpenProfilePanel('${uid}')">+ VER PERFIL COMPLETO</button>
    `;
  } catch (e) {
    console.warn('[PM] loadRightPanel error:', e);
    rpBody.innerHTML = `<div class="pm-rp-loading">Perfil indisponível.</div>`;
  }
}

// ── Open profile panel (reuses existing openFullProfile) ──
window.pmOpenProfilePanel = async function (uid) {
  try {
    // Fetch both user doc and talent_profile
    const [userSnap, tpSnap] = await Promise.all([
      getDoc(doc(db, 'users', uid)).catch(() => null),
      getDoc(doc(db, 'talent_profiles', uid)).catch(() => null),
    ]);
    const userData = userSnap?.exists() ? userSnap.data() : {};
    const tpData = tpSnap?.exists() ? tpSnap.data() : {};
    const merged = { uid, ...userData, ...tpData };
    if (typeof openFullProfile === 'function') { openFullProfile(merged); return; }
  } catch (e) { console.warn('[PM] openProfilePanel error:', e); }
};

// ── Render inbox messages ──
function pmRenderInboxMessages(msgs) {
  const area = document.getElementById('pm-inbox-msgs'); if (!area) return;
  if (!msgs.length) { area.innerHTML = `<div class="pm-inbox-empty-state" style="display:flex;flex-direction:column"><div class="pm-inbox-empty-icon">👋</div><div>Nenhuma mensagem ainda.<br>Comece uma conversa!</div></div>`; return; }
  let lastDate = '';
  area.innerHTML = msgs.map(m => {
    const mine = m.from === currentUser?.uid;
    const ts = m.createdAt?.toDate ? m.createdAt.toDate() : new Date(m.createdAt || Date.now());
    const dateKey = ts.toLocaleDateString('pt-BR');
    const time = ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    let sep = '';
    if (dateKey !== lastDate) {
      lastDate = dateKey;
      const today = new Date().toLocaleDateString('pt-BR');
      const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('pt-BR');
      const label = dateKey === today ? 'HOJE' : dateKey === yesterday ? 'ONTEM' : dateKey;
      sep = `<div class="pm-inbox-date-sep">${label}</div>`;
    }
    return `${sep}<div class="pm-inbox-msg ${mine ? 'mine' : 'theirs'}">
      <div class="pm-inbox-bbl">${escHtml(m.text || '')}</div>
      <span class="pm-inbox-bbl-time">${time}${mine ? ' ✓✓' : ''}</span>
    </div>`;
  }).join('');
  setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
}

// ── Send from inbox ──
window.pmInboxSend = async function () {
  if (!currentUser || !_pmInboxCurrentUid) return;
  const input = document.getElementById('pm-inbox-input');
  const text = input?.value.trim(); if (!text) return;
  input.value = '';
  await pmSendTo(_pmInboxCurrentUid, _pmInboxCurrentName, _pmInboxCurrentPhoto || '', text);
};

// ── Open chat with a specific user ──
window.pmOpenChatWith = function (uid, name, photo) { pmOpenInbox(uid, name, photo); };

// ─── UPDATE applyPermissions to handle new features ───────────────────────────
function applyPermissions() {
  const isAdmin = canAdmin();
  const isEditor = canEdit();
  const isViewer = currentUserData?.role === 'viewer'; // P2-B
  document.querySelectorAll('.admin-only').forEach(el => el.style.display = isAdmin ? '' : 'none');
  document.querySelectorAll('.editor-only').forEach(el => el.style.display = isEditor ? '' : 'none');
  // P2-B: viewer-only — mostra se viewer, esconde se editor/admin (inverso)
  document.querySelectorAll('.viewer-hide').forEach(el => el.style.display = isViewer ? 'none' : '');
  const ud = currentUserData;

  // Sidebar user section
  document.getElementById('sidebar-user-section').style.display = 'flex';
  document.getElementById('sidebar-user-section').style.flexDirection = 'column';
  document.getElementById('header-username').textContent = ud?.name || currentUser?.email || '';
  // Avatar — prioriza foto do talent_profile, fallback para photoURL do user
  const avatarEl = document.getElementById('header-avatar');
  const talentPhoto = window._myTalentProfile?.photo || '';
  const photoSrc = talentPhoto || ud?.photoURL || '';
  const avatarName = window._myTalentProfile?.name || ud?.name || currentUser?.email || '?';
  if (photoSrc) {
    avatarEl.innerHTML = `<img src="${escHtml(photoSrc)}" class="u-avatar-img" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  } else {
    avatarEl.innerHTML = avatarName[0].toUpperCase();
  }
  // Sync username to talent profile name if available
  const usernameEl = document.getElementById('header-username');
  if (usernameEl && window._myTalentProfile?.name) usernameEl.textContent = window._myTalentProfile.name;
  // PATCH 5.3B — #header-role: role label + plan chip via sistema novo (renderPlanChip)
  // Utilizamos a função centralizada refreshPlanUI() para unificar as tags da sidebar.
  const planInfo = typeof getEffectivePlanForUser === 'function' ? getEffectivePlanForUser(ud) : ud;
  const plan = planInfo ? planInfo.plan : 'free';
  if (typeof refreshPlanUI === 'function') {
    refreshPlanUI();
  }
  // sidebar-plan-value (elemento legado removido do HTML) — operação segura caso ainda exista
  const legacyPlanEl = document.getElementById('sidebar-plan-value');
  if (legacyPlanEl) { legacyPlanEl.textContent = ''; legacyPlanEl.style.display = 'none'; }
  // Analytics badge
  const abadge = document.getElementById('analytics-plan-badge');
  if (abadge) abadge.style.display = plan === 'free' ? '' : 'none';

  // pm-widget sempre visível após login
  document.getElementById('pm-widget')?.classList.add('visible');
  // Visibilidade de ADMIN/STAFF na teams-screen sidebar.
  // Delegado para _tsApplyStaffVisibility() que pode ser chamada
  // independentemente de contexto de equipe ou workspace.
  if (typeof _tsApplyStaffVisibility === 'function') _tsApplyStaffVisibility();

  // Chat privado
  pmInit();
}

// ─── OVERRIDE renderAdminPanel to use new modal ───────────────────────────────
// SaaS: sem aprovação de usuários — admin panel mostra apenas export/import
function renderAdminPanel() {
  const cont = document.getElementById('admin-panel-container');
  cont.innerHTML = ''; // SaaS: sem painel de aprovação
}

// ─── EXPORT / IMPORT Firestore Workspace ─────────────────────────────────────
// P3-E: exportLocalStorage substituída por exportFirestoreData — exporta dados reais
// do Firestore (projetos + collabs + moodboard) do workspace atual.
// A função antiga exportava localStorage, que não contém dados do FREQsys v5+ (Firestore-native).
window.exportFirestoreData = async function () {
  if (!currentUser || !_currentTeamId) {
    toast('Entre em uma equipe para exportar dados.', 'error');
    return;
  }
  showLoading('Exportando dados...');
  try {
    const dp = DB.dataPath();
    const [projSnap, collabSnap] = await Promise.all([
      getDocs(collection(db, ...dp, 'projects')),
      getDocs(collection(db, ...dp, 'collaborators')),
    ]);
    const projects = projSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const collaborators = collabSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const team = _myTeams.find(t => t.id === _currentTeamId);
    const exportData = {
      version: 'FREQsys-v5.20',
      exportedAt: new Date().toISOString(),
      exportedBy: currentUser.uid,
      teamId: _currentTeamId,
      teamName: team?.name || '',
      projects,
      collaborators,
    };

    const filename = `freqsys-backup-${(team?.name || 'equipe').replace(/\s/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.json`;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    hideLoading();
    toast(`✅ ${projects.length} projetos e ${collaborators.length} colaboradores exportados!`);
  } catch (e) {
    hideLoading();
    toast('Erro ao exportar: ' + e.message, 'error');
  }
};
// Alias para compatibilidade com botão existente (onclick="exportLocalStorage()")
window.exportLocalStorage = window.exportFirestoreData;

window.importToFirestore = async function (input) {
  // P3-E: Importação completa com validações, suporte a formato FREQsys v5.20 e fallback legacy
  const file = input.files[0]; if (!file) return;

  // Validação de pré-condição: precisa estar em uma equipe
  if (!currentUser) { toast('Faça login antes de importar.', 'error'); input.value = ''; return; }
  if (!_currentTeamId) { toast('Entre em uma equipe antes de importar dados.', 'error'); input.value = ''; return; }
  if (!canAdmin()) { toast('Apenas Admin ou Owner pode importar dados.', 'error'); input.value = ''; return; }

  try {
    const text = await file.text();
    let raw;
    try { raw = JSON.parse(text); }
    catch { toast('Arquivo JSON inválido ou corrompido.', 'error'); input.value = ''; return; }

    let projects = [];
    let collabs = [];

    // Formato 1 (FREQsys v5.20 exportFirestoreData): { version, projects, collaborators, ... }
    if (raw.version?.startsWith('FREQsys') && Array.isArray(raw.projects)) {
      projects = raw.projects;
      collabs = raw.collaborators || [];
    }
    // Formato 2 legado: { projects: [...], collaborators: [...] }
    else if (Array.isArray(raw.projects)) {
      projects = raw.projects;
      collabs = raw.collaborators || raw.collabs || [];
    }
    // Formato 3: localStorage dump — detecta por estrutura de array com campos de projeto
    else {
      for (const key of Object.keys(raw)) {
        const val = raw[key];
        if (Array.isArray(val) && val.length && val[0]?.title && val[0]?.stages) {
          projects = val;
        }
        if (Array.isArray(val) && val.length && val[0]?.name && val[0]?.roles) {
          collabs = val;
        }
      }
    }

    if (!projects.length && !collabs.length) {
      toast('Nenhum projeto ou colaborador encontrado no arquivo!', 'error');
      input.value = '';
      return;
    }

    const teamName = _myTeams.find(t => t.id === _currentTeamId)?.name || _currentTeamId;
    const confirmMsg = `Importar ${projects.length} projeto(s) e ${collabs.length} colaborador(es) para a equipe "${teamName}"?`;
    if (!confirm(confirmMsg)) { input.value = ''; return; }

    // FASE 2A — check de limite ANTES de qualquer escrita no Firestore
    // Conta apenas os projetos do backup que seriam ativos ao importar
    const _importActiveCount = projects.filter(isProjectActive).length;
    if (_importActiveCount > 0) {
      const _limit = getLimit(currentUserData, 'maxActiveProjects');
      const _current = _countActiveProjects();
      const _afterImport = _current + _importActiveCount;
      if (Number.isFinite(_limit) && _afterImport > _limit) {
        const planName = getUserPlan(currentUserData).toUpperCase();
        toast(
          `Importação bloqueada: ${_importActiveCount} projeto(s) ativo(s) no backup + ` +
          `${_current} já existentes = ${_afterImport} total, acima do limite (${_limit} no plano ${planName}). ` +
          `Archive projetos existentes ou faça upgrade para PRO.`,
          'error'
        );
        if (typeof openPlansModal === 'function') openPlansModal();
        input.value = '';
        return;
      }
    }

    // FASE 2C — check de colaboradores por projeto ANTES de showLoading e qualquer escrita
    // Examina cada projeto do backup individualmente (fail-closed: bloqueia o import inteiro
    // se QUALQUER projeto exceder o limite, para não criar estado parcial inconsistente).
    {
      const _cLimit = getLimit(currentUserData, 'maxCollaboratorsPerProject');
      if (Number.isFinite(_cLimit)) {
        // Identifica projetos que excedem o limite
        const _overProjects = projects.filter(p =>
          _countAssignedCollabs(p.collaborators || []) > _cLimit
        );
        if (_overProjects.length > 0) {
          const _planName = getUserPlan(currentUserData).toUpperCase();
          const _nextPlan = _planName === 'FREE' ? 'PRO' : 'ADVANCED';
          // Mostra o pior caso para orientar o usuário
          const _worstCount = Math.max(..._overProjects.map(p => (p.collaborators || []).length));
          const _worstTitle = _overProjects[0].title || 'sem título';
          toast(
            `Importação bloqueada: ${_overProjects.length} projeto(s) no backup excedem o limite ` +
            `de colaboradores (máx ${_cLimit} no plano ${_planName}, ` +
            `encontrado ${_worstCount} em "${_worstTitle}"). ` +
            `Faça upgrade para ${_nextPlan} ou reduza os colaboradores no backup.`,
            'error'
          );
          if (typeof openPlansModal === 'function') openPlansModal();
          input.value = '';
          return;
        }
      }
    }

    let dp;
    try {
      dp = DB.dataPath(); // ['teams', teamId] — path do workspace atual
    } catch (err) {
      if (err.message === 'NO_ACTIVE_TEAM') {
        if (typeof toast === 'function') toast('Você precisa estar em uma equipe para importar projetos.', 'error');
        input.value = '';
        return;
      }
      throw err;
    }

    showLoading(`Importando ${projects.length} projetos...`);

    // Importa colaboradores primeiro (remapeia IDs para evitar colisões)
    const collabIdMap = {};
    for (const c of collabs) {
      const newId = DB.uid();
      collabIdMap[c.id] = newId;
      await setDoc(doc(db, ...dp, 'collaborators', newId), {
        id: newId,
        name: c.name || '',
        roles: c.roles || [],
        contact: c.contact || '',
        inactive: c.inactive || false,
      });
    }

    // Importa projetos com IDs novos (evita sobrescrever projetos existentes)
    let importCount = 0;
    for (const p of projects) {
      const newId = DB.uid(); // Sempre gera novo ID ao importar
      const mappedCollabs = (p.collaborators || []).map(ca => ({
        ...ca,
        collabId: collabIdMap[ca.collabId] || ca.collabId,
      }));
      await setDoc(doc(db, ...dp, 'projects', newId), {
        ...p,
        id: newId,
        collaborators: mappedCollabs,
        stages: p.stages || JSON.parse(JSON.stringify(DEFAULT_STAGES)),
        changelog: p.changelog || [{ msg: 'Importado via backup', ts: new Date().toISOString(), type: 'import' }],
        progress: p.progress || 0,
        createdAt: p.createdAt || new Date().toISOString(),
        importedAt: new Date().toISOString(),
        importedBy: currentUser.uid,
      });
      importCount++;
    }

    hideLoading();
    toast(`🎉 ${importCount} projetos e ${collabs.length} colaboradores importados para "${teamName}"!`);
    input.value = '';
    loadDashboard();
  } catch (e) {
    hideLoading();
    toast('Erro ao importar: ' + e.message, 'error');
    input.value = '';
  }
};
// ─── MOOD BOARD ENGINE ────────────────────────────────────────────────────────
const _mbState = {};
const MB_COLORS = ['#ffffff', '#ff3cb4', '#3d8bff', '#c261ff', '#00d4ff', '#39ff8f', '#ffe94d', '#ff3d6b', '#ff8c42', '#ff6eb4'];
const MB_ICONS = ['🎵', '🎨', '📝', '🔊', '🎬', '💡', '⚡', '🌟', '🎯', '🎤'];

function mbGetState(pid) {
  if (!_mbState[pid]) {
    _mbState[pid] = {
      nodes: [],   // {id,x,y,w,h,rot,label,sub,icon,color,imgUrl}
      edges: [],   // {id,from,fromPort,to,toPort,color}
      scale: 1, panX: 0, panY: 0,
      activeColor: '#ffffff',
      draggingEdge: null,   // {fromId,fromPort,mx,my}
    };
  }
  return _mbState[pid];
}

function mbUid() { return 'm' + Math.random().toString(36).slice(2, 9); }

// ── Firebase ───────────────────────────────────────────────────────────────
// P3-B DECISÃO ARQUITETURAL: Moodboard salvo em users/{uid}/projects/{pid}/moodboard/main
// Motivo: o moodboard é uma visão pessoal do projeto — cada membro pode ter sua própria
// organização visual. Isso está alinhado com o documento conceitual (v5.20.1, Regra 6).
// A análise do ConceptCheck mencionou DB.dataPath() como path alternativo — esse path
// aponta para teams/{teamId}/projects, que é onde o projeto fica, mas o moodboard
// é uma camada de anotação pessoal que vive no espaço do usuário, não da equipe.
// ARQUITETURA FINAL: users/{uid}/projects/{pid}/moodboard/main (individual por membro)
async function mbLoad(pid) {
  const st = mbGetState(pid);
  const uid = currentUser?.uid; if (!uid) return;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'projects', pid, 'moodboard'));
    const data = snap.docs[0]?.data();
    if (data) { st.nodes = data.nodes || []; st.edges = data.edges || []; }
  } catch (e) { console.warn('mb load', e); }
}
async function mbSave(pid) {
  const st = mbGetState(pid);
  const uid = currentUser?.uid; if (!uid) return;
  try {
    await setDoc(doc(db, 'users', uid, 'projects', pid, 'moodboard', 'main'),
      { nodes: st.nodes, edges: st.edges, updatedAt: new Date().toISOString() });
  } catch (e) { console.warn('mb save', e); }
}

// ── Init ───────────────────────────────────────────────────────────────────
async function initMoodBoard(pid) {
  await mbLoad(pid);
  mbRenderFull(pid);
  mbBindCanvas(pid);
}

// ── Port positions (relative to node box top-left) ─────────────────────────
function mbPortPos(node, port) {
  const w = node.w || 140, h = node.h || 80;
  const cx = node.x + w / 2, cy = node.y + h / 2;
  let lx, ly;
  if (port === 'left') { lx = node.x; ly = cy; }
  if (port === 'right') { lx = node.x + w; ly = cy; }
  if (port === 'top') { lx = cx; ly = node.y; }
  if (port === 'bottom') { lx = cx; ly = node.y + h; }
  // apply rotation
  const rot = (node.rot || 0) * Math.PI / 180;
  const dx = lx - cx, dy = ly - cy;
  return {
    x: cx + dx * Math.cos(rot) - dy * Math.sin(rot),
    y: cy + dx * Math.sin(rot) + dy * Math.cos(rot),
  };
}

// ── Smooth bezier — control points follow port exit/entry direction ──────
function mbBezier(x1, y1, x2, y2, p1dir, p2dir) {
  const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const t = Math.max(dist * 0.42, 55);
  let c1x = x1, c1y = y1;
  if (p1dir === 'right') { c1x = x1 + t; c1y = y1; }
  else if (p1dir === 'left') { c1x = x1 - t; c1y = y1; }
  else if (p1dir === 'bottom') { c1x = x1; c1y = y1 + t; }
  else if (p1dir === 'top') { c1x = x1; c1y = y1 - t; }
  else { c1x = x1 + t; c1y = y1; }  // fallback right
  let c2x = x2, c2y = y2;
  if (p2dir === 'left') { c2x = x2 - t; c2y = y2; }
  else if (p2dir === 'right') { c2x = x2 + t; c2y = y2; }
  else if (p2dir === 'top') { c2x = x2; c2y = y2 - t; }
  else if (p2dir === 'bottom') { c2x = x2; c2y = y2 + t; }
  else { c2x = x2 - t; c2y = y2; }  // fallback left
  return `M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`;
}

// ── Full render ────────────────────────────────────────────────────────────
function mbRenderFull(pid) {
  mbRenderNodes(pid);
  mbRenderEdges(pid);
  const st = mbGetState(pid);
  const empty = document.getElementById(`mb-empty-${pid}`);
  if (empty) empty.style.display = st.nodes.length ? 'none' : 'flex';
}

function mbNodeInnerHTML(pid, n) {
  const w = n.w || 140, h = n.h || 80;
  const type = n.type || 'label';
  const col = n.color || '#ffffff';
  const editable = canEdit();

  let boxClass = `mb-node-box type-${type}`;
  let innerContent = '';

  if (type === 'image') {
    const src = n.imgUrl ? escHtml(n.imgUrl) : '';
    innerContent = src
      ? `<img class="mb-node-img-full" src="${src}" onerror="this.style.opacity=0.15" draggable="false">`
      + (n.label ? `<div class="mb-node-caption">${escHtml(n.label)}</div>` : '')
      : `<div style="width:100%;height:${h}px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.2);font-size:11px;font-family:Fira Code,monospace;letter-spacing:2px">SEM IMAGEM</div>`;

  } else if (type === 'text') {
    const fs = n.fontSize || 14;
    innerContent = `<div class="mb-node-text-body" style="font-size:${fs}px">${escHtml(n.body || '...')}</div>`;

  } else if (type === 'color') {
    const opacity = (n.opacity || 80) / 100;
    boxClass = `mb-node-box type-color`;
    innerContent = '';
    // override style inline
    return { boxClass, innerContent, boxStyle: `background:${n.solidColor || col};opacity:${opacity};border-color:${col}66` };

  } else if (type === 'shape') {
    const shape = n.shape || 'rect';
    const sc = n.shapeColor || col;
    let shapeSvg = '';
    if (shape === 'circle') shapeSvg = `<ellipse cx="50%" cy="50%" rx="48%" ry="48%" fill="none" stroke="${sc}" stroke-width="2"/>`;
    else if (shape === 'diamond') shapeSvg = `<polygon points="50,2 98,50 50,98 2,50" fill="none" stroke="${sc}" stroke-width="2" style="transform:scale(0.96);transform-origin:50% 50%"/>`;
    else shapeSvg = `<rect x="2" y="2" width="calc(100%-4px)" height="calc(100%-4px)" fill="none" stroke="${sc}" stroke-width="2" rx="6"/>`;
    innerContent = `<svg class="mb-node-shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><${shapeSvg.slice(1)}</svg>`
      + (n.label ? `<div class="mb-node-label" style="position:relative;z-index:1;color:${sc}">${escHtml(n.label)}</div>` : '');

  } else {
    // label (default)
    innerContent = (n.icon ? `<div class="mb-node-icon">${escHtml(n.icon)}</div>` : '')
      + `<div class="mb-node-label">${escHtml(n.label || 'Nó')}</div>`
      + (n.sub ? `<div class="mb-node-sub">${escHtml(n.sub)}</div>` : '');
  }
  return { boxClass, innerContent, boxStyle: `border-color:${col}55;box-shadow:0 0 18px ${col}15;min-height:${h}px` };
}

function mbRenderNodes(pid) {
  const st = mbGetState(pid);
  const layer = document.getElementById(`mb-nodes-layer-${pid}`);
  if (!layer) return;
  layer.style.transform = `translate(${st.panX}px,${st.panY}px) scale(${st.scale})`;
  layer.style.pointerEvents = 'all';
  const editable = canEdit();

  layer.innerHTML = st.nodes.map(n => {
    const w = n.w || 140, h = n.h || 80, rot = n.rot || 0;
    const { boxClass, innerContent, boxStyle } = mbNodeInnerHTML(pid, n);
    const ports = editable ?
      `<div class="mb-port mb-port-left"  data-port="left"   onmousedown="mbPortDragStart(event,'${pid}','${n.id}','left')"></div>
       <div class="mb-port mb-port-right" data-port="right"  onmousedown="mbPortDragStart(event,'${pid}','${n.id}','right')"></div>
       <div class="mb-port mb-port-top"   data-port="top"    onmousedown="mbPortDragStart(event,'${pid}','${n.id}','top')"></div>
       <div class="mb-port mb-port-bottom"data-port="bottom" onmousedown="mbPortDragStart(event,'${pid}','${n.id}','bottom')"></div>` :
      '';
    const handles = editable ?
      `<div class="mb-handles">
         <div class="mb-handle mb-handle-tl" onmousedown="mbResizeStart(event,'${pid}','${n.id}','tl')"></div>
         <div class="mb-handle mb-handle-tr" onmousedown="mbResizeStart(event,'${pid}','${n.id}','tr')"></div>
         <div class="mb-handle mb-handle-bl" onmousedown="mbResizeStart(event,'${pid}','${n.id}','bl')"></div>
         <div class="mb-handle mb-handle-br" onmousedown="mbResizeStart(event,'${pid}','${n.id}','br')"></div>
         <div class="mb-rotate-handle" onmousedown="mbRotateStart(event,'${pid}','${n.id}')">↻</div>
       </div>`:
      '';
    const actionBtns = editable ?
      `<button class="mb-node-del-btn"  onclick="mbDeleteNode('${pid}','${n.id}',event)">✕</button>
       <button class="mb-node-edit-btn" onclick="mbOpenEditNode('${pid}','${n.id}')">✎</button>` :
      '';
    return `<div class="mb-node" id="mbn-${pid}-${n.id}" data-mbid="${n.id}"
        style="left:${n.x}px;top:${n.y}px;width:${w}px;height:${h}px;transform:rotate(${rot}deg);transform-origin:center center"
        onmousedown="mbNodeMouseDown(event,'${pid}','${n.id}')">
      <div class="${boxClass}" style="${boxStyle};width:100%;height:100%">
        ${innerContent}${ports}
      </div>
      ${handles}${actionBtns}
    </div>`;
  }).join('');
}

function mbRenderEdges(pid) {
  const st = mbGetState(pid);
  const edgesG = document.getElementById(`mb-edges-${pid}`);
  if (!edgesG) return;
  // update SVG viewBox to canvas size
  const canvas = document.getElementById(`mb-canvas-${pid}`);
  const svgEl = document.getElementById(`mb-svg-layer-${pid}`);
  if (svgEl && canvas) {
    svgEl.setAttribute('viewBox', `0 0 ${canvas.offsetWidth} ${canvas.offsetHeight}`);
  }

  edgesG.innerHTML = st.edges.map(e => {
    const fn = st.nodes.find(n => n.id === e.from);
    const tn = st.nodes.find(n => n.id === e.to);
    if (!fn || !tn) return '';
    const fp = mbPortPos(fn, e.fromPort || 'right');
    const tp = mbPortPos(tn, e.toPort || 'left');
    // transform to screen coords
    const fx = fp.x * st.scale + st.panX, fy = fp.y * st.scale + st.panY;
    const tx = tp.x * st.scale + st.panX, ty = tp.y * st.scale + st.panY;
    const col = e.color || 'rgba(255,255,255,0.6)';
    const d = mbBezier(fx, fy, tx, ty, e.fromPort || 'right', e.toPort || 'left');
    const mx = (fx + tx) / 2, my = (fy + ty) / 2 - 10;
    return `<g>
      <path d="${d}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round" opacity="0.7"/>
      <path d="${d}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" opacity="0.08"/>
      <circle cx="${mx}" cy="${my}" r="5" fill="${col}" opacity="0.15" stroke="${col}" stroke-width="1"
        style="pointer-events:all;cursor:pointer" onclick="mbShowEdgePicker('${pid}','${e.id}',${Math.round(mx)},${Math.round(my)})"/>
    </g>`;
  }).join('');
}

// ── Canvas binding ─────────────────────────────────────────────────────────
function mbBindCanvas(pid) {
  const canvas = document.getElementById(`mb-canvas-${pid}`);
  if (!canvas || canvas._mbBound) return;
  canvas._mbBound = true;
  let panning = false, psx, psy, spx, spy;

  canvas.addEventListener('mousedown', e => {
    const target = e.target;
    if (target === canvas || target.id === `mb-nodes-layer-${pid}` || target.closest('.mb-empty')) {
      panning = true; psx = e.clientX; psy = e.clientY;
      const st = mbGetState(pid); spx = st.panX; spy = st.panY;
      canvas.classList.add('panning');
    }
    if (!target.closest('.mb-edge-picker')) mbCloseEdgePicker(pid);
  });
  canvas.addEventListener('dblclick', e => {
    if (e.target === canvas || e.target.closest('.mb-empty')) mbAddNode(pid, e);
  });
  window.addEventListener('mousemove', e => {
    if (!panning) return;
    const st = mbGetState(pid);
    st.panX = spx + (e.clientX - psx); st.panY = spy + (e.clientY - psy);
    mbRenderFull(pid);
  });
  window.addEventListener('mouseup', () => {
    if (panning) { panning = false; canvas.classList.remove('panning'); }
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const st = mbGetState(pid);
    const d = e.deltaY > 0 ? -0.07 : 0.07;
    const ns = Math.max(0.2, Math.min(3, st.scale + d));
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    st.panX = mx - (mx - st.panX) * (ns / st.scale);
    st.panY = my - (my - st.panY) * (ns / st.scale);
    st.scale = ns;
    mbRenderFull(pid);
  }, { passive: false });
}

// ── Node mouse: move or deselect ───────────────────────────────────────────
function mbNodeMouseDown(e, pid, nodeId) {
  if (e.button !== 0) return;
  // don't interfere with port/handle drags
  if (e.target.classList.contains('mb-port') ||
    e.target.classList.contains('mb-handle') ||
    e.target.classList.contains('mb-rotate-handle') ||
    e.target.classList.contains('mb-node-del-btn') ||
    e.target.classList.contains('mb-node-edit-btn')) return;
  e.stopPropagation();
  const st = mbGetState(pid);
  // select
  document.querySelectorAll(`#mb-nodes-layer-${pid} .mb-node`).forEach(el => el.classList.remove('selected'));
  const el = document.getElementById(`mbn-${pid}-${nodeId}`);
  if (el) el.classList.add('selected');

  const node = st.nodes.find(n => n.id === nodeId); if (!node) return;
  const sx = e.clientX, sy = e.clientY, snx = node.x, sny = node.y;
  let moved = false;
  const onMove = ev => {
    moved = true;
    node.x = Math.max(0, snx + (ev.clientX - sx) / st.scale);
    node.y = Math.max(0, sny + (ev.clientY - sy) / st.scale);
    const el2 = document.getElementById(`mbn-${pid}-${nodeId}`);
    if (el2) { el2.style.left = node.x + 'px'; el2.style.top = node.y + 'px'; }
    mbRenderEdges(pid);
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    if (moved) mbSave(pid);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

// ── Resize ─────────────────────────────────────────────────────────────────
function mbResizeStart(e, pid, nodeId, corner) {
  e.stopPropagation(); e.preventDefault();
  const st = mbGetState(pid);
  const node = st.nodes.find(n => n.id === nodeId); if (!node) return;

  // Snapshot the exact state at drag start — read from node data (not DOM)
  const startMouseX = e.clientX;
  const startMouseY = e.clientY;
  const startW = node.w || 140;
  const startH = node.h || 80;
  const startX = node.x;
  const startY = node.y;

  // The "fixed" corner coords in node-space (opposite to the dragged corner)
  // These never change during the drag.
  const fixedRight = startX + startW;  // used when dragging bl or tl
  const fixedBottom = startY + startH;  // used when dragging tr or tl
  const fixedLeft = startX;           // used when dragging br or tr
  const fixedTop = startY;           // used when dragging br or bl

  const onMove = ev => {
    // Raw delta in screen pixels, converted to node-space
    const rawDx = (ev.clientX - startMouseX) / st.scale;
    const rawDy = (ev.clientY - startMouseY) / st.scale;

    if (corner === 'br') {
      // fixed: top-left → x,y stay; w,h grow with mouse
      node.x = fixedLeft;
      node.y = fixedTop;
      node.w = Math.max(100, startW + rawDx);
      node.h = Math.max(60, startH + rawDy);

    } else if (corner === 'bl') {
      // fixed: top-right → right edge stays at fixedRight
      node.w = Math.max(100, startW - rawDx);
      node.x = fixedRight - node.w;
      node.y = fixedTop;
      node.h = Math.max(60, startH + rawDy);

    } else if (corner === 'tr') {
      // fixed: bottom-left → left edge and bottom stay
      node.x = fixedLeft;
      node.w = Math.max(100, startW + rawDx);
      node.h = Math.max(60, startH - rawDy);
      node.y = fixedBottom - node.h;

    } else if (corner === 'tl') {
      // fixed: bottom-right → right edge and bottom stay
      node.w = Math.max(100, startW - rawDx);
      node.x = fixedRight - node.w;
      node.h = Math.max(60, startH - rawDy);
      node.y = fixedBottom - node.h;
    }

    const el = document.getElementById(`mbn-${pid}-${nodeId}`);
    if (el) {
      el.style.left = node.x + 'px';
      el.style.top = node.y + 'px';
      el.style.width = node.w + 'px';
      el.style.minHeight = node.h + 'px';
      // also update the inner box height so it stretches
      const box = el.querySelector('.mb-node-box');
      if (box) box.style.minHeight = node.h + 'px';
    }
    mbRenderEdges(pid);
  };

  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    mbSave(pid);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

// ── Rotate ─────────────────────────────────────────────────────────────────
function mbRotateStart(e, pid, nodeId) {
  e.stopPropagation(); e.preventDefault();
  const st = mbGetState(pid);
  const node = st.nodes.find(n => n.id === nodeId); if (!node) return;
  const el = document.getElementById(`mbn-${pid}-${nodeId}`); if (!el) return;
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
  const startRot = node.rot || 0;

  const onMove = ev => {
    const ang = Math.atan2(ev.clientY - cy, ev.clientX - cx) * (180 / Math.PI);
    node.rot = ((startRot + (ang - startAngle)) % 360 + 360) % 360;
    el.style.transform = `rotate(${node.rot}deg)`;
    mbRenderEdges(pid);
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    mbSave(pid);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

// ── Port drag → create edge ────────────────────────────────────────────────
function mbPortDragStart(e, pid, fromId, fromPort) {
  e.stopPropagation(); e.preventDefault();
  const st = mbGetState(pid);
  const canvas = document.getElementById(`mb-canvas-${pid}`); if (!canvas) return;
  const previewPath = document.getElementById(`mb-preview-path-${pid}`);
  const fn = st.nodes.find(n => n.id === fromId); if (!fn) return;

  const fp = mbPortPos(fn, fromPort);
  const fx = fp.x * st.scale + st.panX, fy = fp.y * st.scale + st.panY;

  if (previewPath) previewPath.setAttribute('display', 'block');

  const onMove = ev => {
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    const d = mbBezier(fx, fy, mx, my, fromPort, 'left');
    if (previewPath) { previewPath.setAttribute('d', d); previewPath.setAttribute('stroke', st.activeColor); }
    // highlight hovered ports
    canvas.querySelectorAll('.mb-port').forEach(p => p.classList.remove('active'));
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    if (under?.classList.contains('mb-port')) under.classList.add('active');
  };
  const onUp = ev => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    if (previewPath) { previewPath.setAttribute('d', ''); previewPath.setAttribute('display', 'none'); }
    canvas.querySelectorAll('.mb-port').forEach(p => p.classList.remove('active'));
    // find target port
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    if (under?.classList.contains('mb-port')) {
      const toEl = under.closest('.mb-node');
      const toId = toEl?.dataset.mbid;
      const toPort = under.dataset.port;
      if (toId && toId !== fromId) {
        const exists = st.edges.find(ed =>
          (ed.from === fromId && ed.to === toId) || (ed.from === toId && ed.to === fromId));
        if (!exists) {
          st.edges.push({ id: mbUid(), from: fromId, fromPort, to: toId, toPort: toPort || 'left', color: st.activeColor });
          mbSave(pid);
        }
      }
    }
    mbRenderEdges(pid);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

// ── Edge color picker ──────────────────────────────────────────────────────
window.mbShowEdgePicker = function (pid, eid, cx, cy) {
  mbCloseEdgePicker(pid);
  const st = mbGetState(pid);
  const edge = st.edges.find(e => e.id === eid); if (!edge) return;
  const canvas = document.getElementById(`mb-canvas-${pid}`); if (!canvas) return;
  const picker = document.createElement('div');
  picker.className = 'mb-edge-picker'; picker.dataset.edgePicker = pid;
  picker.style.left = (cx + 8) + 'px'; picker.style.top = (cy - 18) + 'px';
  picker.innerHTML = MB_COLORS.map(c =>
    `<div class="mb-edge-swatch${c === edge.color ? ' selected' : ''}" style="background:${c}"
       onclick="mbSetEdgeColor('${pid}','${eid}','${c}',this)" title="${c}"></div>`
  ).join('') + `<button class="mb-edge-del" onclick="mbDeleteEdge('${pid}','${eid}')" title="Remover">✕</button>`;
  canvas.appendChild(picker);
};
window.mbSetEdgeColor = function (pid, eid, color, el) {
  const st = mbGetState(pid);
  const edge = st.edges.find(e => e.id === eid); if (!edge) return;
  edge.color = color;
  el.closest('.mb-edge-picker')?.querySelectorAll('.mb-edge-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  mbRenderEdges(pid); mbSave(pid);
};
function mbCloseEdgePicker(pid) {
  document.getElementById(`mb-canvas-${pid}`)?.querySelectorAll('.mb-edge-picker').forEach(el => el.remove());
}
window.mbDeleteEdge = function (pid, eid) {
  const st = mbGetState(pid);
  st.edges = st.edges.filter(e => e.id !== eid);
  mbRenderEdges(pid); mbSave(pid);
};
window.mbDeleteNode = function (pid, nodeId, e) {
  e?.stopPropagation();
  const st = mbGetState(pid);
  st.nodes = st.nodes.filter(n => n.id !== nodeId);
  st.edges = st.edges.filter(ed => ed.from !== nodeId && ed.to !== nodeId);
  mbRenderFull(pid); mbSave(pid);
};

// ── Tools / palette ────────────────────────────────────────────────────────
window.mbSetTool = function (pid, tool, btn) {
  document.querySelectorAll(`#mb-toolbar-${pid} .mb-tool-btn`).forEach(b => b.classList.remove('active-tool'));
  btn.classList.add('active-tool');
};
window.mbPickPaletteColor = function (pid, el, color) {
  mbGetState(pid).activeColor = color;
  document.querySelectorAll(`#mb-palette-${pid} .mb-palette-swatch`).forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
};
window.mbZoom = function (pid, delta) {
  const st = mbGetState(pid);
  st.scale = Math.max(0.2, Math.min(3, st.scale + delta));
  mbRenderFull(pid);
};
window.mbFitView = function (pid) {
  const st = mbGetState(pid); if (!st.nodes.length) return;
  const canvas = document.getElementById(`mb-canvas-${pid}`);
  const cw = canvas?.offsetWidth || 800, ch = canvas?.offsetHeight || 600;
  const xs = st.nodes.map(n => n.x), ys = st.nodes.map(n => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs) + (st.nodes[0]?.w || 140);
  const minY = Math.min(...ys), maxY = Math.max(...ys) + (st.nodes[0]?.h || 80);
  const scaleX = cw / (maxX - minX + 100), scaleY = ch / (maxY - minY + 100);
  st.scale = Math.max(0.2, Math.min(1.5, Math.min(scaleX, scaleY) * 0.85));
  st.panX = (cw - (maxX + minX) * st.scale) / 2;
  st.panY = (ch - (maxY + minY) * st.scale) / 2;
  mbRenderFull(pid);
};

// ── Add node ───────────────────────────────────────────────────────────────
window.mbAddNode = function (pid, evt, forcedType) {
  const st = mbGetState(pid);
  const canvas = document.getElementById(`mb-canvas-${pid}`);
  let x, y;
  if (evt && evt.clientX) {
    const rect = canvas.getBoundingClientRect();
    x = (evt.clientX - rect.left - st.panX) / st.scale - 70;
    y = (evt.clientY - rect.top - st.panY) / st.scale - 40;
  } else {
    const cw = canvas?.offsetWidth || 800, ch = canvas?.offsetHeight || 600;
    x = Math.max(20, (cw / 2 - st.panX) / st.scale - 70 + (Math.random() - 0.5) * 150);
    y = Math.max(20, (ch / 2 - st.panY) / st.scale - 40 + (Math.random() - 0.5) * 100);
  }
  const type = forcedType || 'label';
  const w = type === 'text' ? 200 : type === 'image' ? 180 : type === 'color' ? 120 : 140;
  const h = type === 'text' ? 100 : type === 'image' ? 140 : type === 'color' ? 80 : 80;
  const icon = MB_ICONS[st.nodes.length % MB_ICONS.length];
  const n = {
    id: mbUid(), x, y, w, h, rot: 0, type, label: '', sub: '', icon, color: st.activeColor,
    imgUrl: '', body: '', fontSize: 14, solidColor: st.activeColor, opacity: 80, shape: 'rect', shapeColor: st.activeColor
  };
  st.nodes.push(n);
  mbRenderFull(pid); mbSave(pid);
  setTimeout(() => mbOpenEditNode(pid, n.id), 60);
};

// Quick-add typed nodes from toolbar
window.mbAddTyped = function (pid, type) {
  window.mbAddNode(pid, null, type);
};

window.mbClearAll = function (pid) {
  if (!confirm('Limpar todo o mapa mental?')) return;
  const st = mbGetState(pid); st.nodes = []; st.edges = [];
  mbRenderFull(pid); mbSave(pid);
};

// ── Edit node modal ────────────────────────────────────────────────────────
window.mbOpenEditNode = function (pid, nodeId) {
  if (!canEdit()) return;
  const st = mbGetState(pid);
  const node = st.nodes.find(n => n.id === nodeId); if (!node) return;
  const type = node.type || 'label';

  document.getElementById('mb-node-editing-id').value = pid + '::' + nodeId;

  // set type selector
  mbSetNodeType(type, document.querySelector(`[data-type="${type}"]`));

  // populate all fields
  document.getElementById('mb-node-img').value = node.imgUrl || ''
  document.getElementById('mb-node-label').value = node.label || ''
  document.getElementById('mb-node-text-body').value = node.body || ''
  document.getElementById('mb-node-label-text').value = node.label || ''
  document.getElementById('mb-node-sub').value = node.sub || ''
  document.getElementById('mb-node-icon').value = node.icon || ''
  document.getElementById('mb-node-solid-color').value = node.solidColor || node.color || '#ff3cb4'
  document.getElementById('mb-node-opacity').value = node.opacity || 80
  document.getElementById('mb-node-opacity-val').textContent = (node.opacity || 80) + '%'
  document.getElementById('mb-node-shape-color').value = node.shapeColor || node.color || '#ff3cb4'
  document.getElementById('mb-node-shape-label').value = node.label || ''
  const fsEl = document.getElementById('mb-node-fontsize');
  if (fsEl) fsEl.value = node.fontSize || 14;
  // shape selector
  document.querySelectorAll('[data-shape]').forEach(el => el.classList.toggle('active', el.dataset.shape === (node.shape || 'rect')));

  mbPreviewNodeImg(node.imgUrl || '');
  document.querySelectorAll('#mb-color-grid .mb-color-opt').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === node.color);
  });
  openModal('modal-mb-node');
};
window.mbSaveNode = function () {
  const raw = document.getElementById('mb-node-editing-id').value; if (!raw) return;
  const [pid, nodeId] = raw.split('::');
  const st = mbGetState(pid);
  const node = st.nodes.find(n => n.id === nodeId); if (!node) return;

  const type = document.querySelector('#mb-type-selector .mb-type-btn.active')?.dataset.type || 'label';
  node.type = type;

  if (type === 'image') {
    node.imgUrl = document.getElementById('mb-node-img').value.trim();
    node.label = document.getElementById('mb-node-label').value.trim();
  } else if (type === 'text') {
    node.body = document.getElementById('mb-node-text-body').value.trim();
    node.fontSize = parseInt(document.getElementById('mb-node-fontsize').value) || 14;
    node.label = '';
  } else if (type === 'label') {
    node.label = document.getElementById('mb-node-label-text').value.trim() || 'Nó';
    node.sub = document.getElementById('mb-node-sub').value.trim();
    node.icon = document.getElementById('mb-node-icon').value.trim();
  } else if (type === 'color') {
    node.solidColor = document.getElementById('mb-node-solid-color').value;
    node.opacity = parseInt(document.getElementById('mb-node-opacity').value) || 80;
    node.label = '';
  } else if (type === 'shape') {
    node.shape = document.querySelector('[data-shape].active')?.dataset.shape || 'rect';
    node.shapeColor = document.getElementById('mb-node-shape-color').value;
    node.label = document.getElementById('mb-node-shape-label').value.trim();
  }

  const selColor = document.querySelector('#mb-color-grid .mb-color-opt.selected');
  node.color = selColor ? selColor.dataset.color : '#ffffff';

  closeModal('modal-mb-node');
  mbRenderFull(pid); mbSave(pid);
  toast('✦ Nó salvo!');
};
window.mbPreviewNodeImg = function (url) {
  const prev = document.getElementById('mb-node-img-preview');
  const thumb = document.getElementById('mb-node-img-thumb');
  if (!prev || !thumb) return;
  if (url) { thumb.src = url; prev.style.display = 'block'; } else { prev.style.display = 'none'; }
};
// Modal helpers
window.mbSetNodeType = function (type, btn) {
  ['image', 'text', 'label', 'color', 'shape'].forEach(t => {
    const el = document.getElementById('mb-fields-' + t);
    if (el) el.style.display = t === type ? 'block' : 'none';
  });
  document.querySelectorAll('#mb-type-selector .mb-type-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  // also activate via data-type match if btn not passed
  if (!btn) {
    const found = document.querySelector(`#mb-type-selector [data-type="${type}"]`);
    if (found) found.classList.add('active');
  }
};
window.mbSetShape = function (shape, btn) {
  document.querySelectorAll('[data-shape]').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
};
// opacity slider live update (use event delegation)
document.addEventListener('input', function (e) {
  if (e.target.id === 'mb-node-opacity') {
    const val = document.getElementById('mb-node-opacity-val');
    if (val) val.textContent = e.target.value + '%';
  }
});

window.mbSelectColor = function (el) {
  document.querySelectorAll('#mb-color-grid .mb-color-opt').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
};

// expose drag fns
window.mbNodeMouseDown = mbNodeMouseDown;
window.mbPortDragStart = mbPortDragStart;
window.mbResizeStart = mbResizeStart;
window.mbRotateStart = mbRotateStart;

// ─── END MOOD BOARD ENGINE ────────────────────────────────────────────────────

window.showPage = showPage;
// ── Sair do Painel Master ─────────────────────────────────────────────────
// Restaura teams-screen sem alterar _currentTeamId.
// Se havia equipe ativa antes, o contexto de workspace permanece disponível;
// o usuário pode re-entrar clicando na equipe normalmente.
// showAdminMasterExit — alias de retrocompat para toggleMasterDrawer()
window.showAdminMasterExit = function () { window.toggleMasterDrawer(); };
window.mpSwitchTab = mpSwitchTab;
window.mpFilterTickets = mpFilterTickets;
window.showMainApp = showMainApp;
window.goBack = goBack;
window.isStaff = isStaff;   // P4-A
window.getStaffRole = getStaffRole; // P4-A
window.deleteField = deleteField;  // P4-A: expor para uso em outros contextos

// ── Abre "Procurar Equipe" — tela standalone sobre a teams-screen ─────────────
window.showTalentsStandalone = function () {
  const ts = document.getElementById('teams-screen');
  if (ts) ts.style.display = 'none';

  // Marca que foi aberto da teams-screen → VOLTAR volta pra teams-screen
  window._talentStandaloneFromTeamsScreen = true;
  window._talentStandaloneForceArtistMode = true;

  // Abre a tela standalone
  const screen = document.getElementById('talent-standalone-screen');
  if (screen) screen.classList.add('open');

  // Esconde o header original da page (o topbar já tem o título)
  const matchHeader = document.querySelector('#page-talents .match-header');
  if (matchHeader) matchHeader.style.display = 'none';

  // Ativa page-talents dentro do standalone
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-talents');
  if (page) page.classList.add('active');

  // Carrega o sistema de match
  if (typeof window.loadTalentsPage === 'function') {
    window.loadTalentsPage();
  }
};

window.closeTalentStandalone = function () {
  // Fecha a tela standalone
  const screen = document.getElementById('talent-standalone-screen');
  if (screen) screen.classList.remove('open');

  // Limpa flags
  const fromTeamsScreen = !!window._talentStandaloneFromTeamsScreen;
  window._talentStandaloneForceArtistMode = false;
  window._talentStandaloneFromTeamsScreen = false;

  // Restaura header da page
  const matchHeader = document.querySelector('#page-talents .match-header');
  if (matchHeader) matchHeader.style.display = '';

  // Remove active da page
  const page = document.getElementById('page-talents');
  if (page) page.classList.remove('active');

  // Roteamento do VOLTAR baseado em como foi aberto:
  // - da teams-screen (Procurar Equipe) → volta pra teams-screen
  // - de dentro de uma equipe (Encontre Membros) → volta pra página de membros
  if (fromTeamsScreen) {
    if (typeof window.showTeamsScreen === 'function') {
      window.showTeamsScreen(true);
    } else {
      const ts = document.getElementById('teams-screen');
      if (ts) ts.style.display = 'flex';
    }
  } else {
    showPage('collaborators');
  }
};
window.setFilter = setFilter;
window.setView = setView;
window.openNewProject = openNewProject;
window.editProject = editProject;
window.saveProject = saveProject;
window.handleDeleteProject = handleDeleteProject;
window.openProjectDetail = openProjectDetail;
window.handleStarCard = handleStarCard;
window.handleStarDetail = handleStarDetail;
window.handleStageUpdate = handleStageUpdate;
window.openStageNote = openStageNote;
window.saveStageNote = saveStageNote;
window.openAudioModal = openAudioModal;
window.testAudioUrl = testAudioUrl;
window.saveAudio = saveAudio;
window.removeAudio = removeAudio;
window.openLetraModal = openLetraModal;
window.switchLetraMode = switchLetraMode;
window.saveLetra = saveLetra;
window.copyLetra = copyLetra;
window.openNewCollab = openNewCollab;
window.editCollab = editCollab;
window.saveCollab = saveCollab;
window.handleDeleteCollab = handleDeleteCollab;
window.toggleRoleChip = toggleRoleChip;
window.previewProjectImage = previewProjectImage;
window.openModal = openModal;
window.closeModal = closeModal;
window.approveUser = approveUser;
window.changeUserRole = changeUserRole;
window.removeUser = removeUser;
window.toggleFichaPlain = toggleFichaPlain;
window.copyFicha = copyFicha;
window.switchAdminTab = switchAdminTab;
window.openAdminModal = openAdminModal;
window.openSettingsModal = openSettingsModal;

// ══ NEW SETTINGS (ns-*) FUNCTIONS ════════════════════════════════════════════

// Tab switcher
window.nsTab = function (panelId, navEl) {
  document.querySelectorAll('.ns-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.ns-nav-item').forEach(i => i.classList.remove('active'));
  const panel = document.getElementById(panelId);
  if (panel) panel.classList.add('active');
  if (navEl) navEl.classList.add('active');
};

// Mark active theme card in new grid
window.nsMarkTheme = function (theme) {
  const map = { dark: 'ns-tc-dark', light: 'ns-tc-light', 'cyber-green': 'ns-tc-cyber-green', pink: 'ns-tc-pink', blue: 'ns-tc-blue', ember: 'ns-tc-ember' };
  document.querySelectorAll('.ns-theme-card').forEach(c => c.classList.remove('ns-active-theme'));
  const id = map[theme];
  if (id) { const el = document.getElementById(id); if (el) el.classList.add('ns-active-theme'); }
};

// Accent color apply
window.nsApplyAccent = function (el) {
  const c1 = el.dataset.c1, c2 = el.dataset.c2;
  document.documentElement.style.setProperty('--a1', c1);
  document.documentElement.style.setProperty('--a2', c2);
  const r = (h) => { const v = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); return `${v},${g},${b}`; };
  document.documentElement.style.setProperty('--border', `rgba(${r(c1)},0.15)`);
  document.documentElement.style.setProperty('--border2', `rgba(${r(c1)},0.32)`);
  document.querySelectorAll('.ns-accent-dot').forEach(d => d.classList.remove('active'));
  el.classList.add('active');
  // Update previews
  const btn = document.getElementById('ns-acc-btn-prev'); if (btn) btn.style.background = `linear-gradient(135deg,${c1},${c2})`;
  const brd = document.getElementById('ns-acc-border-prev'); if (brd) { brd.style.color = c1; brd.style.borderColor = c1 + '66'; brd.style.background = c1 + '10'; }
  const tag = document.getElementById('ns-acc-tag-prev'); if (tag) { tag.style.color = c1; tag.style.borderColor = c1 + '55'; }
  const bar = document.getElementById('ns-acc-bar-prev'); if (bar) bar.style.background = `linear-gradient(90deg,${c1},${c2})`;
  const accbar = document.getElementById('ns-accent-bar'); if (accbar) accbar.style.background = `linear-gradient(90deg,${c1},${c2})`;
  localStorage.setItem('freqsys_accent', JSON.stringify({ c1, c2 }));
  toast('Cor de destaque aplicada!', 'success');
};

// Font size
window.nsSetFont = function (size, el) {
  document.querySelectorAll('.ns-font-btn').forEach(b => { if (b.id && b.id.startsWith('ns-font-')) b.classList.remove('active'); });
  if (el) el.classList.add('active');
  const map = { sm: '12px', md: '14px', lg: '16px' };
  document.documentElement.style.setProperty('--font-size-base', map[size] || '14px');
  document.documentElement.setAttribute('data-font', size);
  localStorage.setItem('freqsys_font', size);
  // Update demo
  const demo = document.getElementById('ns-font-demo');
  if (demo) {
    const scales = { sm: '0.88', md: '1', lg: '1.14' };
    demo.style.fontSize = (parseFloat(map[size]) * parseFloat(scales[size])) + 'px';
  }
};

// Density
window.nsSetDensity = function (density, el) {
  document.querySelectorAll('.ns-font-btn').forEach(b => { if (b.id && b.id.startsWith('ns-density-')) b.classList.remove('active'); });
  if (el) el.classList.add('active');
  document.documentElement.setAttribute('data-spacing', density === 'relaxed' ? 'wide' : 'normal');
  document.documentElement.setAttribute('data-density', density);
  localStorage.setItem('freqsys_density', density);
};

// Animation toggles
window.nsToggleAnim = function (type, el) {
  el.classList.toggle('on');
  const isOn = el.classList.contains('on');
  if (type === 'contrast') {
    document.documentElement.setAttribute('data-contrast', isOn ? 'high' : 'normal');
  } else if (type === 'transitions') {
    document.documentElement.setAttribute('data-anim', isOn ? 'on' : 'off');
  }
  localStorage.setItem('freqsys_anim_' + type, isOn ? 'on' : 'off');
};

// Restore layout UI state
window.nsRestoreLayoutUI = function () {
  const font = localStorage.getItem('freqsys_font') || 'md';
  const density = localStorage.getItem('freqsys_density') || 'compact';
  const fontBtn = document.getElementById('ns-font-' + font);
  const densBtn = document.getElementById('ns-density-' + density);
  document.querySelectorAll('.ns-font-btn').forEach(b => { if (b.id?.startsWith('ns-font-') || b.id?.startsWith('ns-density-')) b.classList.remove('active'); });
  if (fontBtn) fontBtn.classList.add('active');
  if (densBtn) densBtn.classList.add('active');
  // Accent
  try {
    const saved = JSON.parse(localStorage.getItem('freqsys_accent') || 'null');
    if (saved) {
      const dot = document.querySelector(`.ns-accent-dot[data-c1="${saved.c1}"]`);
      if (dot) { document.querySelectorAll('.ns-accent-dot').forEach(d => d.classList.remove('active')); dot.classList.add('active'); }
    }
  } catch (e) { }
};

// Skills
const NS_SKILLS = [
  { id: 'r_ideal', icon: '💡', label: 'Direção de Projetos' },
  { id: 'r_vocal', icon: '🎤', label: 'Canto / Vocal' },
  { id: 'r_letra', icon: '✍️', label: 'Composição / Letra' },
  { id: 'r_edit', icon: '🎬', label: 'Edição de Vídeo' },
  { id: 'r_mix', icon: '🎚️', label: 'Mix & Master' },
  { id: 'r_beat', icon: '🎹', label: 'Instrumental / Beat' },
  { id: 'r_ilus', icon: '🖼️', label: 'Ilustração' },
  { id: 'r_thumb', icon: '🎨', label: 'Thumbnail / Capa' },
  { id: 'r_social', icon: '📲', label: 'Social Media' },
];
const NS_LEVELS = ['Básico', 'Intermediário', 'Avançado', 'Expert'];

window.nsRenderSkillGrid = function () {
  const grid = document.getElementById('ns-skill-grid');
  if (!grid) return;
  const tp = window._myTalentProfile;
  const activeSkills = tp?.skills || {};
  grid.innerHTML = NS_SKILLS.map(s => {
    const isOn = !!activeSkills[s.id];
    // skills[r] pode ser string OU objeto {level:...} dependendo de onde foi salvo
    const rawLevel = activeSkills[s.id];
    const level = (typeof rawLevel === 'object' && rawLevel !== null)
      ? (rawLevel.level || 'Intermediário')
      : (rawLevel || 'Intermediário');
    return `<div class="ns-skill-item ${isOn ? 'ns-skill-on' : ''}" id="ns-sw-${s.id}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer;flex:1;min-width:0">
          <input type="checkbox" ${isOn ? 'checked' : ''} onchange="nsToggleSkill('${s.id}',this.checked)" style="accent-color:var(--a3);width:14px;height:14px;flex-shrink:0">
          <span style="font-size:14px;flex-shrink:0">${s.icon}</span>
          <span style="font-size:11px;font-weight:600;line-height:1.3">${s.label}</span>
        </label>
        <select class="ns-skill-sel" id="ns-sl-${s.id}" style="flex-shrink:0;width:auto;min-width:100px">
          ${NS_LEVELS.map(l => `<option ${l === level ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
    </div>`;
  }).join('');
  // Update live skills preview
  nsUpdateLiveSkills();
};

window.nsToggleSkill = function (id, on) {
  const wrap = document.getElementById('ns-sw-' + id);
  if (wrap) wrap.classList.toggle('ns-skill-on', on);
  nsUpdateLiveSkills();
};

window.nsUpdateLiveSkills = function () {
  const liveSkills = document.getElementById('ns-live-skills');
  if (!liveSkills) return;
  const checked = NS_SKILLS.filter(s => { const cb = document.querySelector(`#ns-sw-${s.id} input`); return cb?.checked; }).slice(0, 3);
  liveSkills.innerHTML = checked.map(s => `<span style="font-size:9px;padding:2px 7px;border-radius:4px;background:var(--bg3);border:1px solid var(--border);color:var(--text2);margin:2px;display:inline-block">${s.icon} ${s.label.split(' ')[0]}</span>`).join('');
};

// Availability
window.nsSetAvail = function (el, val) {
  document.querySelectorAll('.ns-avail-pill').forEach(p => p.classList.remove('active-ns-avail'));
  el.classList.add('active-ns-avail');
  window._nsCurrentAvail = val;
};

// Sessions
window.nsLoadSessionInfo = function () {
  const browser = navigator.userAgent;
  let bName = 'Navegador desconhecido';
  if (browser.includes('Chrome') && !browser.includes('Edg')) bName = 'Chrome';
  else if (browser.includes('Firefox')) bName = 'Firefox';
  else if (browser.includes('Safari')) bName = 'Safari';
  else if (browser.includes('Edg')) bName = 'Edge';
  let os = 'Sistema desconhecido';
  if (browser.includes('Windows')) os = 'Windows';
  else if (browser.includes('Mac')) os = 'macOS';
  else if (browser.includes('Linux')) os = 'Linux';
  else if (browser.includes('Android')) os = 'Android';
  else if (browser.includes('iPhone') || browser.includes('iPad')) os = 'iOS';
  const nameEl = document.getElementById('ns-sess-browser');
  const metaEl = document.getElementById('ns-sess-meta');
  if (nameEl) nameEl.textContent = bName + ' · ' + os;
  if (metaEl) metaEl.textContent = 'Sessão atual · ' + new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

window.nsSignOutAll = function () {
  if (!confirm('Encerrar todas as sessões? Você precisará fazer login novamente.')) return;
  if (typeof signOut === 'function' && typeof auth !== 'undefined') {
    signOut(auth).then(() => { toast('Todas as sessões encerradas. Faça login novamente.'); }).catch(e => toast('Erro: ' + e.message, 'error'));
  } else { toast('Sessão encerrada!'); }
};

// Tickets
window.nsLoadTickets = async function () {
  const listEl = document.getElementById('ns-tickets-list');
  if (!listEl || !currentUser) return;
  listEl.innerHTML = '<div style="text-align:center;padding:16px;font-family:var(--font-mono);font-size:11px;color:var(--text3)">Carregando...</div>';
  try {
    const q = query(collection(db, 'tickets'), where('uid', '==', currentUser.uid), limit(10));
    const snap = await getDocs(q);
    if (snap.empty) {
      listEl.innerHTML = '<div style="text-align:center;padding:16px;font-family:var(--font-mono);font-size:11px;color:var(--text3)">Nenhum ticket aberto ainda.</div>';
      return;
    }
    const statusColors = { open: 'var(--a1)', 'in-progress': 'var(--a3)', inprogress: 'var(--a3)', waiting: 'rgba(180,138,255,.9)', resolved: 'var(--green)', closed: 'var(--text3)' };
    const statusLabels = { open: 'Aberto', 'in-progress': 'Em Andamento', inprogress: 'Em Andamento', waiting: 'Aguardando', resolved: 'Resolvido', closed: 'Fechado' };
    listEl.innerHTML = snap.docs.map(d => {
      const t = { id: d.id, ...d.data() };
      const color = statusColors[t.status] || 'var(--text3)';
      const label = statusLabels[t.status] || t.status || 'Aberto';
      const date = t.createdAt?.toDate ? t.createdAt.toDate().toLocaleDateString('pt-BR') : '—';
      const hasReply = t.replyCount > 0 || t.reply;
      // CORREÇÃO 2: item clicável — abre modal de visualização de ticket para o usuário
      return `<div onclick="openUserTicketDetail('${t.id}')" style="padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;cursor:pointer;transition:border-color .18s" onmouseover="this.style.borderColor='var(--border2)'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div style="font-weight:600;font-size:13px">${t.subject || t.title || '(sem título)'}</div>
          <span style="font-family:var(--font-mono);font-size:9px;color:${color};border:1px solid ${color}44;padding:2px 7px;border-radius:4px">${label}</span>
        </div>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--text3)">${t.category || ''} · ${date}</div>
        ${hasReply ? `<div style="margin-top:8px;padding:8px;background:rgba(255,60,180,0.05);border-left:2px solid var(--a1);border-radius:0 6px 6px 0;font-size:12px;color:var(--text2)">💬 ${t.replyCount > 0 ? t.replyCount + ' resposta(s) do suporte' : 'Resposta do suporte'}</div>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    listEl.innerHTML = `<div style="text-align:center;padding:16px;font-family:var(--font-mono);font-size:11px;color:var(--text3)">Erro ao carregar tickets.</div>`;
  }
};

window.nsSubmitTicket = async function () {
  const cat = document.getElementById('ns-ticket-cat')?.value || 'outro';
  const title = document.getElementById('ns-ticket-title')?.value.trim();
  const desc = document.getElementById('ns-ticket-desc')?.value.trim();
  if (!title) { toast('Informe um título para o ticket!', 'error'); return; }
  if (!desc) { toast('Informe uma descrição!', 'error'); return; }
  if (!currentUser) { toast('Você precisa estar logado!', 'error'); return; }
  try {
    // BUG 1 FIX: salvar campos canônicos (subject/body/userName/userEmail/userPlan)
    // compatíveis com openTicketDetail e _mdrApplyFilters, além dos campos legados.
    await addDoc(collection(db, 'tickets'), {
      // ── Campos canônicos (compatíveis com o painel master) ──
      uid: currentUser.uid,
      subject: title,
      body: desc,
      userName: currentUserData?.name || currentUser.displayName || currentUser.email,
      userEmail: currentUser.email,
      userPlan: resolveUserPlan(currentUserData),
      category: cat,
      status: 'open',
      replyCount: 0,
      lastRepliedAt: null,
      createdAt: new Date().toISOString(), // ISO string — compatível com _tAgo e _tAgoSafe
      // ── Campos legados mantidos para retrocompat ──
      authorUid: currentUser.uid,
      email: currentUser.email,
      name: currentUserData?.name || currentUser.displayName || '',
      title,
      description: desc,
    });
    toast('🎫 Ticket enviado! Responderemos em breve.', 'success');
    document.getElementById('ns-ticket-title').value = '';
    document.getElementById('ns-ticket-desc').value = '';
    nsLoadTickets();
  } catch (e) {
    toast('Erro ao enviar ticket: ' + e.message, 'error');
  }
};

// Danger zone actions
window.nsLeaveAllTeams = async function () {
  if (!confirm('Sair de TODAS as equipes? Esta ação é irreversível!')) return;
  if (!currentUser) return;
  let count = 0;
  for (const team of (_myTeams || [])) {
    try {
      const newMembers = (team.members || []).filter(m => m.uid !== currentUser.uid);
      const newMemberUids = newMembers.map(m => m.uid);
      await updateDoc(doc(db, 'teams', team.id), { members: newMembers, memberUids: newMemberUids });
      count++;
    } catch (e) { }
  }
  toast(`Saiu de ${count} equipe(s).`);
};

window.nsDeleteAccount = async function () {
  if (!confirm('DELETAR CONTA? Todos seus dados serão apagados permanentemente!')) return;
  if (!confirm('Tem CERTEZA ABSOLUTA? Esta ação NÃO pode ser desfeita!')) return;
  try {
    if (currentUser) {
      try { await deleteDoc(doc(db, 'users', currentUser.uid)); } catch (e) { }
      await currentUser.delete();
      toast('Conta deletada.');
    }
  } catch (e) {
    toast('Erro: ' + e.message + '. Faça login novamente e tente de novo.', 'error');
  }
};

// Save all (new comprehensive save)
window.nsSaveAll = async function () {
  const name = FormValidator.val('settings-name');
  if (!FormValidator.require(name, 'Nome')) return;

  const photoRaw = FormValidator.val('settings-avatar-url');
  const photoURL = photoRaw ? FormValidator.isUrl(photoRaw) : '';
  if (photoRaw && photoURL === null) return; // fail na url

  const bannerRaw = FormValidator.val('settings-banner-url');
  const bannerURL = bannerRaw ? FormValidator.isUrl(bannerRaw) : '';
  if (bannerRaw && bannerURL === null) return; // fail na url

  let bio = FormValidator.val('settings-bio');
  if (bio.length > 500) {
    toast('Sua bio está muito longa! Limite de 500 caracteres.', 'error');
    return;
  }

  const newPass = document.getElementById('settings-new-pass')?.value || '';
  const confirmPass = document.getElementById('settings-confirm-pass')?.value || '';

  if (newPass && newPass.length < 6) { toast('Senha muito curta!', 'error'); return; }
  if (newPass && newPass !== confirmPass) { toast('Senhas não conferem!', 'error'); return; }
  if (photoURL && photoURL.length * 0.75 > 900000) { toast('Imagem muito grande!', 'error'); return; }

  try {
    const uid = currentUser.uid;
    await updateDoc(doc(db, 'users', uid), { name, photoURL: photoURL || '', bio, bannerURL: bannerURL || '' });
    const isBase64 = photoURL?.startsWith('data:');
    await updateProfile(currentUser, { displayName: name, photoURL: isBase64 ? (currentUser.photoURL || null) : (photoURL || null) });
    if (newPass) await updatePassword(currentUser, newPass);

    // Save talent profile extras (handle, social, skills, availability)
    const handleInputEl = document.getElementById('ns-inp-handle');
    const handle = handleInputEl?.value.trim() || '';
    const originalHandle = handleInputEl?.dataset.originalHandle || '';
    // P3-D: Validação de unicidade do @handle antes de salvar
    if (handle) {
      const handleClean = handle.startsWith('@') ? handle.slice(1).toLowerCase() : handle.toLowerCase();
      const normalizedHandle = handleClean;
      const normalizedWithAt = '@' + normalizedHandle;
      // FIX: Skip uniqueness check if handle hasn't changed from what the user already has
      const handleChanged = normalizedWithAt !== originalHandle;
      if (handleChanged) {
        // Verifica se algum outro usuário já usa esse handle
        const existingSnap = await getDocs(
          query(collection(db, 'talent_profiles'),
            where('handle', '==', normalizedWithAt),
            limit(2))
        );
        const conflict = existingSnap.docs.find(d => d.id !== currentUser.uid);
        if (conflict) {
          toast(`@${normalizedHandle} já está em uso. Escolha outro handle.`, 'error');
          return;
        }
      }
      // Normaliza o handle com @ antes de salvar
      Object.defineProperty(window, '_p3dHandle', { value: normalizedWithAt, writable: true, configurable: true });
    } else {
      Object.defineProperty(window, '_p3dHandle', { value: '', writable: true, configurable: true });
    }
    const avail = window._nsCurrentAvail || 'open';
    const skills = {};
    NS_SKILLS.forEach(s => {
      const cb = document.querySelector(`#ns-sw-${s.id} input`);
      if (cb?.checked) {
        const sel = document.getElementById('ns-sl-' + s.id);
        skills[s.id] = sel?.value || 'Intermediário';  // salva como string direta
      }
    });
    const socialRaw = {
      youtube: FormValidator.val('ns-social-yt'),
      spotify: FormValidator.val('ns-social-spotify'),
      instagram: FormValidator.val('ns-social-ig'),
      tiktok: FormValidator.val('ns-social-tt'),
      website: FormValidator.val('ns-social-web'),
    };
    const social = {
      youtube: socialRaw.youtube ? FormValidator.isUrl(socialRaw.youtube) : '',
      spotify: socialRaw.spotify ? FormValidator.isUrl(socialRaw.spotify) : '',
      instagram: socialRaw.instagram ? FormValidator.isUrl(socialRaw.instagram) : '',
      tiktok: socialRaw.tiktok ? FormValidator.isUrl(socialRaw.tiktok) : '',
      discord: FormValidator.val('ns-social-dc'),
      website: socialRaw.website ? FormValidator.isUrl(socialRaw.website) : '',
    };
    if (
      (socialRaw.youtube && social.youtube === null) ||
      (socialRaw.spotify && social.spotify === null) ||
      (socialRaw.instagram && social.instagram === null) ||
      (socialRaw.tiktok && social.tiktok === null) ||
      (socialRaw.website && social.website === null)
    ) return; // isUrl já disparou toast de erro
    // Resolve handle before try block so it's accessible in post-save sync
    const _savedHandle = window._p3dHandle !== undefined ? window._p3dHandle : handle;
    try {
      await setDoc(doc(db, 'talent_profiles', uid), {
        name, bio, handle: _savedHandle, skills, social, availability: avail,
        photo: photoURL || '', banner: bannerURL || '', uid,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      window._myTalentProfile = { ...(window._myTalentProfile || {}), name, bio, handle: _savedHandle, skills, social, links: social, availability: avail, photo: photoURL || '', banner: bannerURL || '' };
    } catch (e) { console.warn('talent_profiles save:', e); }

    currentUserData = { ...currentUserData, name, photoURL: photoURL || '', bio, bannerURL, handle: _savedHandle };
    if (typeof _tsUpdateUserBar === 'function') _tsUpdateUserBar();
    if (typeof renderTeamsScreenExtras === 'function') renderTeamsScreenExtras();
    if (typeof applyPermissions === 'function') applyPermissions();
    // FIX: Refresh all profile UIs after save (header, mini-card, open popup)
    if (typeof adbRefreshHeader === 'function') adbRefreshHeader();
    if (typeof updateMiniCard === 'function') updateMiniCard(window._myTalentProfile);
    // If profile popup is open showing own profile, refresh it with fresh data
    if (document.getElementById('pp-overlay')?.classList.contains('open') &&
      window._ppCurrentData?.uid === uid) {
      const freshData = typeof upeGetProfileForDisplay === 'function'
        ? upeGetProfileForDisplay(window._myTalentProfile)
        : window._ppCurrentData;
      if (typeof openProfilePopup === 'function') openProfilePopup(freshData, window._ppCurrentContext || 'match');
    }

    // P1-5: Refletir valores normalizados devolta nos inputs
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    setVal('settings-avatar-url', photoURL);
    setVal('settings-banner-url', bannerURL);
    setVal('settings-bio', bio);
    setVal('ns-social-yt', social.youtube);
    setVal('ns-social-spotify', social.spotify);
    setVal('ns-social-ig', social.instagram);
    setVal('ns-social-tt', social.tiktok);
    setVal('ns-social-web', social.website);
    if (handleInputEl) handleInputEl.value = _savedHandle;

    // Sync to teams
    for (const team of (_myTeams || [])) {
      const isMember = (team.members || []).some(m => m.uid === uid);
      if (!isMember) continue;
      const newMembers = (team.members || []).map(m => m.uid === uid ? { ...m, name, photoURL: photoURL || m.photoURL || '' } : m);
      try { await updateDoc(doc(db, 'teams', team.id), { members: newMembers }); team.members = newMembers; } catch (e) { }
    }
    toast('✅ Configurações salvas!', 'success');
    // Fecha após 1.5s para o usuário ver o toast antes
    setTimeout(() => closeModal('modal-settings'), 1500);
  } catch (e) {
    toast('Erro: ' + (e.message || e), 'error');
  }
};

// Legacy alias so old saveSettings still works
window.saveSettings = window.nsSaveAll;

// Restore accent on page load
(function nsRestoreAccent() {
  try {
    const saved = JSON.parse(localStorage.getItem('freqsys_accent') || 'null');
    if (saved?.c1 && saved?.c2) {
      document.documentElement.style.setProperty('--a1', saved.c1);
      document.documentElement.style.setProperty('--a2', saved.c2);
      const r = (h) => { const v = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); return `${v},${g},${b}`; };
      document.documentElement.style.setProperty('--border', `rgba(${r(saved.c1)},0.15)`);
      document.documentElement.style.setProperty('--border2', `rgba(${r(saved.c1)},0.32)`);
    }
  } catch (e) { }
})();

// ════════════════════════════════════════════════════════════════════════════
window.saveSettings = saveSettings;
window.linkGoogleAccount = linkGoogleAccount;
window.openPermsModal = openPermsModal;
window.savePermissions = savePermissions;
window.linkUserToCollab = linkUserToCollab;
window.toggleRoleMember = toggleRoleMember;
window.selectMoodColor = selectMoodColor;
window.toggleChat = function () { pmToggle(); };
window.sendChatMessage = function () { };
window.toggleCollabInProject = toggleRoleMember; // Alias for backwards compatibility
window.renderAllProjects = renderAllProjects;

// ─── SIDEBAR TOGGLE ──────────────────────────────────────────────────────────
window.toggleSidebar = function () {
  document.getElementById('sidebar').classList.toggle('open');
};

window.toggleSidebarCollapse = function () {
  const sb = document.getElementById('sidebar');
  const mc = document.querySelector('.main-content');
  const btn = document.getElementById('sidebar-toggle-btn');
  // Split B: default=collapsed(icon-only). Toggle removes collapsed = expand.
  const nowCollapsed = sb.classList.toggle('collapsed');
  if (mc) mc.style.marginLeft = nowCollapsed ? '64px' : '220px';
  if (btn) btn.innerHTML = nowCollapsed ? '▶' : '◀';
  localStorage.setItem('sidebar_collapsed', nowCollapsed ? '1' : '0');
};

// ─── PLANS SYSTEM ─────────────────────────────────────────────────────────────
window.openPlansModal = function () {
  const plan = resolveUserPlan(currentUserData);
  // Reset buttons
  ['free', 'pro', 'adv'].forEach(p => {
    const btn = document.getElementById('plan-btn-' + p);
    const card = document.getElementById('plan-card-' + (p === 'adv' ? 'adv' : p));
    if (btn) {
      const planKey = p === 'adv' ? 'advanced' : p;
      if (plan === planKey) {
        btn.textContent = '✓ Plano Atual';
        btn.className = 'plan-select-btn current-plan';
        card?.classList.add('current');
      } else {
        btn.textContent = 'Fazer Upgrade';
        btn.className = 'plan-select-btn upgrade-plan';
        card?.classList.remove('current');
      }
    }
  });
  openModal('modal-plans');
};

window.selectPlan = function (plan) {
  // Visual only — admin manages manually
  toast(`💎 Para ativar o plano ${plan.toUpperCase()}, entre em contato pelo Suporte!`, 'success');
  closeModal('modal-plans');
  setTimeout(() => showPage('support'), 600);
};

// Admin can set plan for a user (via Firestore)
// PATCH Plan Sync (Security Review):
//   • updateDoc em vez de setDoc — escreve APENAS o campo plan em users/{uid}.
//     Preserva todos os outros campos do documento (role, status, perms, flags etc.).
//   • await no sync de talent_profiles — garante consistência antes do toast de sucesso.
//   • Erros de sync são reportados ao admin via toast de aviso, sem travar o fluxo.
window.setUserPlan = async function (uid, plan) {
  const u = _users.find(x => x.uid === uid);
  if (!u) return;
  const normalizedPlan = _normalizePlan(plan);

  // 1. Escreve APENAS users/{uid}.plan — fonte da verdade
  //    updateDoc: modifica só o campo indicado; preserva todo o resto do documento no Firestore.
  await updateDoc(doc(db, 'users', uid), { plan: normalizedPlan });

  // 2. Atualiza cache local imediatamente (evita leitura desatualizada antes do onSnapshot chegar)
  u.plan = normalizedPlan;

  // 3. Sincroniza talent_profiles/{uid}.plan — aguardado para garantir consistência
  const syncResult = await _syncTalentPlan(uid, normalizedPlan);
  if (!syncResult.ok) {
    // Falha de sync: informa o admin sem esconder o problema
    console.error('[PlanSync] Sync de talent_profiles falhou para uid=%s:', uid, syncResult.error);
    toast(`Plano ${normalizedPlan} salvo em users, mas falhou ao sincronizar talent_profiles. Tente novamente ou verifique as permissões do Firestore.`, 'error');
    return;
  }

  toast(`Plano ${normalizedPlan} aplicado!`);
};

// ─── TICKETS SYSTEM ───────────────────────────────────────────────────────────
let _adminTicketFilter = 'all';
let _currentTicketId = null;

// ══ TICKET ENHANCED v2 ══════════════════════════════════════════════════════
// Constantes de mapeamento (retrocompat: status antigos open/closed suportados)
const _T = {
  statusLabel: { open: 'Aberto', inprogress: 'Em andamento', waiting: 'Aguardando usuário', resolved: 'Resolvido', closed: 'Fechado' },
  statusClass: { open: 'tbadge-open', inprogress: 'tbadge-inprogress', waiting: 'tbadge-waiting', resolved: 'tbadge-resolved', closed: 'tbadge-closed' },
  priLabel: { low: 'Baixa', medium: 'Média', high: 'Alta', urgent: 'Urgente', normal: 'Média' },
  priClass: { low: 'tpri-low', medium: 'tpri-medium', high: 'tpri-high', urgent: 'tpri-urgent', normal: 'tpri-medium' },
  catIcon: { bug: '🐛', sugestao: '💡', financeiro: '💳', conta: '👤', duvida: '❓', outro: '📋' },
};

// Normaliza prioridade legada (normal → medium, urgent → urgent)
function _tNormPri(p) { return (!p || p === 'normal') ? (p === 'urgent' ? 'urgent' : 'medium') : p; }

// Formata tempo relativo
function _tAgo(val) {
  // BUG 1 FIX: aceita ISO string, Firestore Timestamp, number (ms) ou Date
  try {
    let d;
    if (val && typeof val === 'object' && typeof val.toDate === 'function') d = val.toDate();
    else if (typeof val === 'number') d = new Date(val);
    else d = new Date(val);
    const ms = Date.now() - d.getTime();
    if (isNaN(ms) || ms < 0) return 'agora';
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return m + 'm atrás';
    if (m < 1440) return Math.floor(m / 60) + 'h atrás';
    return Math.floor(m / 1440) + 'd atrás';
  } catch { return '—'; }
}

// ── LocalStorage: log de alterações ──────────────────────────────────────────
function _tLogKey(id) { return 'tlog_' + id; }
function _tLogGet(id) { try { return JSON.parse(localStorage.getItem(_tLogKey(id)) || '[]'); } catch { return []; } }
function _tLogAdd(id, text) {
  const log = _tLogGet(id);
  log.push({ ts: new Date().toISOString(), text, by: currentUserData?.name || currentUser?.email || '?' });
  try { localStorage.setItem(_tLogKey(id), JSON.stringify(log.slice(-60))); } catch { }
}
function _tLogRender(id) {
  const el = document.getElementById('td-log-list'); if (!el) return;
  const log = _tLogGet(id);
  if (!log.length) { el.innerHTML = '<div class="ticket-log-entry"><span class="ticket-log-text" style="color:var(--text3)">Nenhuma alteração registrada.</span></div>'; return; }
  el.innerHTML = [...log].reverse().map(e =>
    `<div class="ticket-log-entry">
      <span class="ticket-log-time">${new Date(e.ts).toLocaleString('pt-BR')}</span>
      <span class="ticket-log-text">${escHtml(e.text)}</span>
    </div>`
  ).join('');
}

// ── LocalStorage: nota interna ────────────────────────────────────────────────
function _tNoteKey(id) { return 'tnote_' + id; }
function _tNoteGet(id) { return localStorage.getItem(_tNoteKey(id)) || ''; }
function _tNoteSave(id, text) { try { localStorage.setItem(_tNoteKey(id), text); } catch { } }

// ── Preview no modal novo ticket ───────────────────────────────────────────────
window.ticketPreviewUpdate = function () {
  if (!document.getElementById('ticket-preview-box')?.classList.contains('show')) return;
  _tBuildPreview();
};
function _tBuildPreview() {
  const subject = document.getElementById('ticket-subject')?.value || '';
  const body = document.getElementById('ticket-body')?.value || '';
  const cat = document.getElementById('ticket-category')?.value || 'outro';
  const pri = document.getElementById('ticket-priority')?.value || 'medium';
  const att = document.getElementById('ticket-attachment')?.value || '';
  const cont = document.getElementById('ticket-preview-content'); if (!cont) return;
  cont.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
      <span style="font-size:14px">${_T.catIcon[cat] || '📋'}</span>
      <strong style="font-size:13px;color:var(--text)">${escHtml(subject || '(sem assunto)')}</strong>
      <span class="tpri ${_T.priClass[pri] || 'tpri-medium'}">${_T.priLabel[pri] || pri}</span>
    </div>
    <div style="font-size:12px;color:var(--text2);line-height:1.6;white-space:pre-wrap">${escHtml(body || '(sem descrição)')}</div>
    ${att ? `<div style="margin-top:6px;font-family:var(--font-mono);font-size:9px;color:var(--text3)">📎 ${escHtml(att)}</div>` : ''}`;
}
window.ticketTogglePreview = function () {
  const box = document.getElementById('ticket-preview-box');
  const btn = document.getElementById('ticket-preview-btn');
  if (!box) return;
  const open = box.classList.toggle('show');
  if (btn) btn.textContent = open ? '🙈 Fechar' : '👁 Preview';
  if (open) _tBuildPreview();
};

// ── openNewTicketModal ────────────────────────────────────────────────────────
window.openNewTicketModal = function () {
  document.getElementById('ticket-subject').value = '';
  document.getElementById('ticket-body').value = '';
  document.getElementById('ticket-category').value = 'bug';
  document.getElementById('ticket-priority').value = 'medium';
  const att = document.getElementById('ticket-attachment'); if (att) att.value = '';
  const box = document.getElementById('ticket-preview-box'); if (box) box.classList.remove('show');
  const btn = document.getElementById('ticket-preview-btn'); if (btn) btn.textContent = '👁 Preview';
  openModal('modal-new-ticket');
};

// ── submitTicket ──────────────────────────────────────────────────────────────
window.submitTicket = async function () {
  const subject = document.getElementById('ticket-subject').value.trim();
  const body = document.getElementById('ticket-body').value.trim();
  const category = document.getElementById('ticket-category').value;
  const priority = document.getElementById('ticket-priority')?.value || 'medium';
  const attachment = document.getElementById('ticket-attachment')?.value.trim() || null;
  if (!subject || !body) { toast('Preencha todos os campos!', 'error'); return; }

  const uid = currentUser.uid;
  const id = DB.uid();
  const ud = currentUserData;
  const ticket = {
    id, uid, subject, body, category, priority,
    attachment: attachment || null,
    userName: ud?.name || currentUser.email,
    userEmail: currentUser.email,
    userPlan: resolveUserPlan(ud),
    status: 'open',
    createdAt: new Date().toISOString(),
    replyCount: 0,
    lastRepliedAt: null,
  };

  await setDoc(doc(db, 'tickets', id), ticket);
  _tLogAdd(id, `Ticket criado — cat: ${category}, pri: ${priority}`);

  try { await sendTicketEmail(ticket); } catch (e) { console.warn('Email:', e); }

  toast('🎫 Ticket #' + id.slice(-6).toUpperCase() + ' enviado!');
  closeModal('modal-new-ticket');
  loadMyTickets();
};

async function sendTicketEmail(ticket) {
  const payload = {
    service_id: 'service_musicsys', template_id: 'template_ticket',
    user_id: 'YOUR_EMAILJS_PUBLIC_KEY',
    template_params: {
      to_email: 'contatodoki@gmail.com', from_name: ticket.userName,
      from_email: ticket.userEmail,
      subject: `[${(ticket.category || '').toUpperCase()}][${(ticket.priority || '').toUpperCase()}] ${ticket.subject}`,
      message: ticket.body, plan: ticket.userPlan, ticket_id: ticket.id,
    }
  };
  if (payload.user_id !== 'YOUR_EMAILJS_PUBLIC_KEY') {
    await fetch('https://api.emailjs.com/api/v1.0/email/send',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  }
}

// ── loadMyTickets (view do usuário) ───────────────────────────────────────────
async function loadMyTickets() {
  const uid = currentUser?.uid; if (!uid) return;
  const cont = document.getElementById('my-tickets-list'); if (!cont) return;
  try {
    const snap = await getDocs(collection(db, 'tickets'));
    const tickets = snap.docs.map(d => ({ ...d.data() }))
      .filter(t => t.uid === uid)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (!tickets.length) {
      cont.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🎫</div><div class="empty-state-title">Nenhum ticket ainda</div><div class="empty-state-text">Clique em "+ Novo Ticket" para abrir um chamado</div></div>`;
      return;
    }

    cont.innerHTML = tickets.map(t => {
      const s = t.status || 'open';
      const p = _tNormPri(t.priority);
      const ago = _tAgo(t.createdAt);
      const sid = t.id.slice(-6).toUpperCase();
      // CORREÇÃO 2: item clicável — abre modal de visualização de ticket para o usuário
      return `
      <div class="my-ticket-item tst-${s}" onclick="openUserTicketDetail('${t.id}')" style="cursor:pointer">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
          <span style="font-size:15px">${_T.catIcon[t.category] || '📋'}</span>
          <span style="font-family:var(--font-body);font-size:13px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)">${escHtml(t.subject)}</span>
          <span class="tbadge ${_T.statusClass[s] || 'tbadge-open'}">${_T.statusLabel[s] || s}</span>
          <span class="tpri ${_T.priClass[p] || 'tpri-medium'}">${_T.priLabel[p] || p}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span class="ticket-id-badge">#${sid}</span>
          <span class="ticket-timeago">${new Date(t.createdAt).toLocaleDateString('pt-BR')} · ${ago}</span>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(t.body)}</div>
        ${t.attachment ? `<div style="margin-top:5px;font-family:var(--font-mono);font-size:9px;color:var(--text3)">📎 ${escHtml(t.attachment)}</div>` : ''}
        ${(t.replyCount > 0 || t.reply) ? `<div style="margin-top:8px;border-left:2px solid var(--a2);padding-left:10px;font-size:12px;color:var(--a2)">💬 ${t.replyCount > 0 ? t.replyCount + ' resposta(s)' : 'Resposta recebida'}</div>` : ''}
      </div>`;
    }).join('');
  } catch (e) {
    cont.innerHTML = `<div style="color:var(--red);font-family:var(--font-mono);font-size:11px">Erro: ${e.message}</div>`;
  }
}

// loadAdminTickets() — alias retrocompat
function loadAdminTickets() {
  _mdrRenderTickets(window._masterAllTickets || []);
}
window.filterAdminTickets = function (filter, btn) { mpFilterTickets(filter, btn); };

// ── openTicketDetail (admin) ──────────────────────────────────────────────────
window.openTicketDetail = async function (id) {
  const snap = await getDocs(collection(db, 'tickets'));
  const raw = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(t => t.id === id);
  if (!raw) return;
  // BUG 1 FIX: normaliza campos antes de exibir (cobre tickets antigos e novos)
  const ticket = _tNormalize(raw);
  _currentTicketId = id;

  // Título e meta
  document.getElementById('ticket-detail-title').textContent = `🎫 ${ticket.subject}`;
  document.getElementById('ticket-detail-meta').textContent =
    `De: ${ticket.userName} <${ticket.userEmail}> · Plano: ${(ticket.userPlan || 'free').toUpperCase()} · ${new Date(ticket.createdAt).toLocaleDateString('pt-BR')} · ${_tAgo(ticket.createdAt)} · #${id.slice(-6).toUpperCase()}`;
  document.getElementById('ticket-detail-msg').textContent = ticket.body;

  // Chips de status/prioridade/categoria
  _tSetBadges(ticket);

  // Status select
  const sel = document.getElementById('td-status-select');
  if (sel) sel.value = ticket.status || 'open';

  // Anexo
  const attRow = document.getElementById('td-attachment-row');
  const attVal = document.getElementById('td-attachment-val');
  if (ticket.attachment) { if (attRow) attRow.style.display = 'block'; if (attVal) attVal.textContent = ticket.attachment; }
  else { if (attRow) attRow.style.display = 'none'; }

  // Nota interna
  const noteArea = document.getElementById('td-internal-note');
  if (noteArea) noteArea.value = _tNoteGet(id);

  document.getElementById('ticket-reply-text').value = '';

  // ── CORREÇÃO 1: Elevar z-index do modal acima do Master Drawer (z-index:1100)
  // quando o Painel Master está aberto, para que o ticket apareça sobre ele.
  const modalEl = document.getElementById('modal-ticket-detail');
  const masterDrawerOpen = document.getElementById('master-drawer')?.classList.contains('mdr-open');
  if (modalEl && masterDrawerOpen) {
    modalEl.style.zIndex = '1200';  // acima do master-drawer (1100) e seu overlay (1099)
  } else if (modalEl) {
    modalEl.style.zIndex = '';      // reset para valor padrão do CSS (400)
  }

  openModal('modal-ticket-detail');
  _renderTicketThread(id);
  _tLogRender(id);
};

// Atualiza chips no modal
function _tSetBadges(t) {
  const s = t.status || 'open';
  const p = _tNormPri(t.priority);
  const sb = document.getElementById('td-status-badge');
  const pb = document.getElementById('td-priority-badge');
  const cb = document.getElementById('td-category-badge');
  if (sb) { sb.textContent = _T.statusLabel[s] || s; sb.className = 'tbadge ' + (_T.statusClass[s] || 'tbadge-open'); }
  if (pb) { pb.textContent = _T.priLabel[p] || p; pb.className = 'tpri ' + (_T.priClass[p] || 'tpri-medium'); }
  if (cb) cb.textContent = (_T.catIcon[t.category] || '📋') + ' ' + (t.category || 'outro');
}

// ── Mudar status (sem fechar modal) ──────────────────────────────────────────
window.ticketChangeStatus = async function (newStatus) {
  if (!_currentTicketId) return;
  try {
    await updateDoc(doc(db, 'tickets', _currentTicketId), { status: newStatus });
    _tLogAdd(_currentTicketId, `Status → ${_T.statusLabel[newStatus] || newStatus}`);
    // Atualiza chip visual
    const sb = document.getElementById('td-status-badge');
    if (sb) { sb.textContent = _T.statusLabel[newStatus] || newStatus; sb.className = 'tbadge ' + (_T.statusClass[newStatus] || 'tbadge-open'); }
    _tLogRender(_currentTicketId);
    toast(_T.statusLabel[newStatus] || newStatus);
    loadAdminTickets();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// closeTicket — mantido para retrocompat; usa ticketChangeStatus internamente
window.closeTicket = async function () {
  if (!_currentTicketId) return;
  await window.ticketChangeStatus('closed');
  closeModal('modal-ticket-detail');
};

// ── Deletar ticket ────────────────────────────────────────────────────────────
window.deleteTicket = async function () {
  if (!_currentTicketId) return;
  if (!confirm('Deletar este ticket permanentemente?')) return;
  try {
    localStorage.removeItem(_tLogKey(_currentTicketId));
    localStorage.removeItem(_tNoteKey(_currentTicketId));
    await deleteDoc(doc(db, 'tickets', _currentTicketId));
    toast('Ticket deletado');
    closeModal('modal-ticket-detail');
    loadAdminTickets();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// ── Salvar nota interna ───────────────────────────────────────────────────────
window.ticketSaveNote = function () {
  if (!_currentTicketId) return;
  const text = document.getElementById('td-internal-note')?.value || '';
  _tNoteSave(_currentTicketId, text);
  _tLogAdd(_currentTicketId, 'Nota interna salva');
  _tLogRender(_currentTicketId);
  toast('🔒 Nota salva');
};

// ── Responder ao ticket (admin) ───────────────────────────────────────────────
window.replyToTicket = async function () {
  if (!_currentTicketId) return;
  const replyText = document.getElementById('ticket-reply-text').value.trim();
  if (!replyText) { toast('Escreva uma resposta!', 'error'); return; }
  try {
    // Salva na subcoleção replies (thread)
    await addDoc(collection(db, 'tickets', _currentTicketId, 'replies'), {
      body: replyText,
      authorUid: currentUser.uid,
      authorName: currentUserData?.name || currentUser.email,
      isAdmin: true,
      createdAt: serverTimestamp(),
    });
    // Atualiza doc raiz
    const ticketRef = doc(db, 'tickets', _currentTicketId);
    const ticketSnap = await getDoc(ticketRef);
    if (ticketSnap.exists()) {
      const curr = ticketSnap.data();
      await updateDoc(ticketRef, {
        status: 'inprogress',
        lastRepliedAt: serverTimestamp(),
        replyCount: (curr.replyCount || 0) + 1,
        reply: replyText, // retrocompat
      });
    }
    _tLogAdd(_currentTicketId, `Resposta enviada por ${currentUserData?.name || currentUser.email}`);
    toast('💬 Resposta enviada!');
    document.getElementById('ticket-reply-text').value = '';
    // Atualiza status badge no modal
    const sb = document.getElementById('td-status-badge');
    const sel = document.getElementById('td-status-select');
    if (sb) { sb.textContent = 'Em andamento'; sb.className = 'tbadge tbadge-inprogress'; }
    if (sel) sel.value = 'inprogress';
    await _renderTicketThread(_currentTicketId);
    _tLogRender(_currentTicketId);
    loadAdminTickets();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

// ── Thread de respostas (chat bubbles) ────────────────────────────────────────
async function _renderTicketThread(ticketId) {
  const threadEl = document.getElementById('ticket-thread');
  if (!threadEl) return;
  try {
    const snap = await getDocs(
      query(collection(db, 'tickets', ticketId, 'replies'), orderBy('createdAt', 'asc'))
    );
    if (snap.empty) {
      threadEl.innerHTML = '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);padding:8px 0">Nenhuma resposta ainda.</div>';
      return;
    }
    threadEl.innerHTML = snap.docs.map(d => {
      const r = d.data();
      const date = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('pt-BR') : '—';
      const type = r.isAdmin ? 'admin' : 'user';
      const lbl = r.isAdmin ? '⭐ Suporte' : '👤 Usuário';
      return `
      <div class="thread-msg ${type}">
        <div class="thread-msg-hdr">
          <span class="thread-msg-author">${lbl} — ${escHtml(r.authorName || '')}</span>
          <span class="thread-msg-time">${date}</span>
        </div>
        <div style="white-space:pre-wrap">${escHtml(r.body)}</div>
      </div>`;
    }).join('');
    threadEl.scrollTop = threadEl.scrollHeight;
  } catch (e) {
    threadEl.innerHTML = `<div style="color:var(--red);font-family:var(--font-mono);font-size:10px">Erro: ${e.message}</div>`;
  }
}
window._renderTicketThread = _renderTicketThread;

// ══════════════════════════════════════════════════════════════════════════════
// CORREÇÃO 2 — openUserTicketDetail
// Abre o ticket pelo lado do usuário: exibe thread, permite responder e fechar.
// Usa o modal #modal-user-ticket-detail (criado abaixo no HTML via JS).
// Não duplica sistema — usa mesma subcoleção `replies` e estrutura existente.
// ══════════════════════════════════════════════════════════════════════════════
window.openUserTicketDetail = async function (id) {
  if (!currentUser) return;

  // Buscar o ticket
  let ticket;
  try {
    const snap = await getDocs(collection(db, 'tickets'));
    ticket = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(t => t.id === id);
  } catch (e) { toast('Erro ao carregar ticket: ' + e.message, 'error'); return; }
  if (!ticket) { toast('Ticket não encontrado.', 'error'); return; }

  // Normaliza campos (tickets criados via nsSubmitTicket usam title/description)
  const subject = ticket.subject || ticket.title || '(sem título)';
  const body = ticket.body || ticket.description || '';
  const status = ticket.status || 'open';
  const sid = id.slice(-6).toUpperCase();
  const date = ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString('pt-BR') : '—';

  const statusLabel = _T?.statusLabel?.[status] || status;
  const statusClass = _T?.statusClass?.[status] || 'tbadge-open';
  const isClosed = status === 'closed' || status === 'resolved';

  // Cria ou reutiliza o modal
  let modalEl = document.getElementById('modal-user-ticket-detail');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.className = 'modal-overlay';
    modalEl.id = 'modal-user-ticket-detail';
    document.body.appendChild(modalEl);
  }

  // Monta conteúdo do modal
  modalEl.innerHTML = `
    <div class="modal" style="max-width:600px;max-height:92vh;overflow-y:auto">
      <div class="modal-title">🎫 ${escHtml(subject)}</div>
      <button class="close-btn" onclick="closeModal('modal-user-ticket-detail')">×</button>

      <!-- Meta -->
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);letter-spacing:1px;margin-bottom:10px">
        #${sid} · ${date}
      </div>

      <!-- Status badge -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">
        <span id="utd-status-badge" class="tbadge ${statusClass}">${statusLabel}</span>
        ${isClosed ? '<span style="font-family:var(--font-mono);font-size:9px;color:var(--text3)">Ticket encerrado</span>' : ''}
      </div>

      <!-- Mensagem original -->
      <div style="margin-bottom:14px">
        <div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text2);margin-bottom:6px;text-transform:uppercase">Sua mensagem</div>
        <div class="ticket-detail-msg" style="white-space:pre-wrap">${escHtml(body)}</div>
      </div>

      <!-- Anexo (se houver) -->
      ${ticket.attachment ? `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);margin-bottom:12px;padding:6px 10px;background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:6px">📎 ${escHtml(ticket.attachment)}</div>` : ''}

      <!-- Thread de respostas -->
      <div style="margin-bottom:14px">
        <div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text2);margin-bottom:8px;text-transform:uppercase">Conversa</div>
        <div id="utd-thread" style="max-height:280px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;border:1px solid var(--border);border-radius:6px;padding:10px">
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);padding:4px 0">Carregando...</div>
        </div>
      </div>

      <!-- Campo de resposta (oculto se fechado) -->
      ${!isClosed ? `
      <label style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text2);text-transform:uppercase">Sua resposta</label>
      <textarea class="ticket-reply-area" id="utd-reply-text" placeholder="Escreva sua resposta ao suporte..." style="margin-bottom:10px"></textarea>
      ` : '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);padding:10px 0;text-align:center">Ticket encerrado — novas respostas não são permitidas.</div>'}

      <div class="modal-actions" style="margin-top:16px">
        <button class="btn btn-ghost" onclick="closeModal('modal-user-ticket-detail')">Fechar</button>
        ${!isClosed ? `<button class="btn btn-ghost" onclick="userCloseTicket('${id}')" style="border-color:var(--text3);color:var(--text3)">Encerrar ticket</button>` : ''}
        ${!isClosed ? `<button class="btn btn-primary" onclick="userReplyTicket('${id}')">Enviar Resposta</button>` : ''}
      </div>
    </div>`;

  // Exibe o modal
  openModal('modal-user-ticket-detail');

  // Renderiza thread de respostas
  const threadEl = document.getElementById('utd-thread');
  try {
    const replSnap = await getDocs(
      query(collection(db, 'tickets', id, 'replies'), orderBy('createdAt', 'asc'))
    );
    if (replSnap.empty) {
      threadEl.innerHTML = '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);padding:8px 0">Nenhuma resposta ainda.</div>';
    } else {
      threadEl.innerHTML = replSnap.docs.map(d => {
        const r = d.data();
        const dt = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('pt-BR') : '—';
        const type = r.isAdmin ? 'admin' : 'user';
        const lbl = r.isAdmin ? '⭐ Suporte' : '👤 Você';
        return `<div class="thread-msg ${type}">
          <div class="thread-msg-hdr">
            <span class="thread-msg-author">${lbl} — ${escHtml(r.authorName || '')}</span>
            <span class="thread-msg-time">${dt}</span>
          </div>
          <div style="white-space:pre-wrap">${escHtml(r.body)}</div>
        </div>`;
      }).join('');
      threadEl.scrollTop = threadEl.scrollHeight;
    }
  } catch (e) {
    if (threadEl) threadEl.innerHTML = `<div style="color:var(--red);font-family:var(--font-mono);font-size:10px">Erro: ${e.message}</div>`;
  }
};

// ── Usuário responde ao próprio ticket ─────────────────────────────────────────
window.userReplyTicket = async function (ticketId) {
  const replyText = document.getElementById('utd-reply-text')?.value.trim();
  if (!replyText) { toast('Escreva uma resposta antes de enviar!', 'error'); return; }
  try {
    await addDoc(collection(db, 'tickets', ticketId, 'replies'), {
      body: replyText,
      authorUid: currentUser.uid,
      authorName: currentUserData?.name || currentUser.email,
      isAdmin: false,
      createdAt: serverTimestamp(),
    });
    const ticketRef = doc(db, 'tickets', ticketId);
    const ticketSnap = await getDoc(ticketRef);
    if (ticketSnap.exists()) {
      const curr = ticketSnap.data();
      await updateDoc(ticketRef, {
        status: curr.status === 'closed' ? 'closed' : 'waiting',
        lastRepliedAt: serverTimestamp(),
        replyCount: (curr.replyCount || 0) + 1,
      });
    }
    toast('💬 Resposta enviada!');
    document.getElementById('utd-reply-text').value = '';
    // Recarrega thread no modal aberto
    await window.openUserTicketDetail(ticketId);
  } catch (e) { toast('Erro ao enviar resposta: ' + e.message, 'error'); }
};

// ── Usuário encerra o próprio ticket ─────────────────────────────────────────
window.userCloseTicket = async function (ticketId) {
  if (!confirm('Encerrar este ticket? O suporte não poderá mais responder.')) return;
  try {
    await updateDoc(doc(db, 'tickets', ticketId), { status: 'closed' });
    toast('✅ Ticket encerrado.');
    closeModal('modal-user-ticket-detail');
    // Recarrega listas
    if (typeof loadMyTickets === 'function') loadMyTickets();
    if (typeof window.nsLoadTickets === 'function') window.nsLoadTickets();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

window.switchTeam = function () {
  _ready = false;

  // Limpa o contexto e os IDs da equipe globalmente
  _currentTeamId = null;
  window._currentTeamId = null;
  window.appContext = 'global';

  stopListeners();
  localStorage.removeItem('last_team_id');
  { const _s = document.getElementById('sidebar'); if (_s) _s.style.display = 'none'; }
  { const _m = document.querySelector('.main-content'); if (_m) _m.style.display = 'none'; }
  { const _a = document.querySelector('.app'); if (_a) _a.style.display = 'none'; }
  loadMyTeams().then(() => {
    document.getElementById('teams-screen').style.display = 'flex';
    renderTeamsScreenExtras();
    // Garante que widgets flutuantes ficam visíveis
    if (currentUser) {
      document.getElementById('pm-widget')?.classList.add('visible');
      _tsUpdateUserBar();
      if (typeof intStartUserNotifListener === 'function') intStartUserNotifListener();
      setTimeout(() => { if (typeof intUpdateBadges === 'function') intUpdateBadges(); }, 800);
    }
  });
};

window.copyTeamInviteLink = function () { copyTeamInviteCode(); };
window.copyTeamInviteCode = function () {
  const team = _myTeams.find(t => t.id === _currentTeamId);
  if (!team) { toast('Nenhuma equipe ativa', 'error'); return; }
  const code = team.inviteCode || '';
  if (!code) { toast('Equipe sem código de convite', 'error'); return; }
  navigator.clipboard.writeText(code)
    .then(() => toast('✅ Código copiado: ' + code))
    .catch(() => { toast(code); });
};
// Alias para o botão do modal de convite (index.html usa este nome)
window.copyModalInviteCode = function () { copyTeamInviteCode(); };

// Expose invite link button in teams page — also add it in the main app equipe page
window.loadTeamInviteSection = function () {
  // Convite via link removido da aba Membros — usar o modal de convite por código
  return '';
};
window.selectPlan = selectPlan;
window.openNewTicketModal = openNewTicketModal;
window.submitTicket = submitTicket;
window.filterAdminTickets = filterAdminTickets;
window.openTicketDetail = openTicketDetail;
window.closeTicket = closeTicket;
window.deleteTicket = deleteTicket;
window.replyToTicket = replyToTicket;
window.showPageChecked = showPageChecked;

// ══════════════════════════════════════════════════════════════════════════════
// ANALYTICS MODULE
// ══════════════════════════════════════════════════════════════════════════════

const YT_API_KEY = 'AIzaSyBwW4wjdBDrj3LaLDthVnQ_HBiJroZg8Bs';
const YT_CLIENT_ID = '461300812268-1nh108lp5e5j7eed1t3hb2iktojo8k3n.apps.googleusercontent.com';
const YT_SCOPES = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly';
let _ytToken = null;  // access token OAuth
let _ytTokenExpiry = 0;
let _ytChartViews = null;
let _ytChartSubs = null;
let _currentPeriod = 30;
let _ytApiBlocked = false; // BUGFIX: Flag anti-spam quando a API retorna 403

// ── Helpers ───────────────────────────────────────────────────────────────────
function canAccessPro() {
  return ['pro', 'advanced'].includes(resolveUserPlan(currentUserData)) || canAdmin();
}
function isOwner() {
  const team = _myTeams.find(t => t.id === _currentTeamId);
  return team?.members?.find(m => m.uid === currentUser?.uid)?.role === 'owner';
}
function extractHandle(url) {
  if (!url) return null;
  const m = url.match(/@([^/?]+)/);
  return m ? m[1] : null;
}
function fmtN(n) {
  n = parseInt(n) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString('pt-BR');
}
function fmtDelta(n) {
  n = parseInt(n) || 0;
  return (n >= 0 ? '+' : '') + fmtN(Math.abs(n));
}
function ytHasToken() {
  return _ytToken && Date.now() < _ytTokenExpiry;
}

// ── OAuth2 via Google Identity Services ───────────────────────────────────────
window.connectYouTubeOAuth = function () {
  if (!window.google?.accounts?.oauth2) {
    toast('Biblioteca do Google ainda carregando, tente em instantes', 'error');
    return;
  }
  const client = google.accounts.oauth2.initTokenClient({
    client_id: YT_CLIENT_ID,
    scope: YT_SCOPES,
    callback: async (resp) => {
      if (resp.error) { toast('Erro ao conectar: ' + resp.error, 'error'); return; }
      _ytToken = resp.access_token;
      _ytTokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
      // Salva token no Firestore para persistência na sessão
      try {
        await updateDoc(doc(db, 'teams', _currentTeamId), {
          ytAccessToken: _ytToken,
          ytTokenExpiry: _ytTokenExpiry
        });
      } catch (e) { console.warn('Não foi possível salvar token:', e); }
      toast('✅ YouTube conectado!');
      updateConnectUI(true);
      loadYTAnalyticsData(_currentPeriod);
    }
  });
  client.requestAccessToken();
};

window.disconnectYouTube = async function () {
  if (_ytToken) {
    try { google.accounts.oauth2.revoke(_ytToken); } catch (e) { }
  }
  _ytToken = null;
  _ytTokenExpiry = 0;
  try {
    await updateDoc(doc(db, 'teams', _currentTeamId), {
      ytAccessToken: null, ytTokenExpiry: 0
    });
  } catch (e) { }
  updateConnectUI(false);
  // Volta para dados públicos
  const handle = extractHandle(_teamYoutubeChannel);
  if (handle) {
    try { const ch = await fetchYTChannel(handle); renderChannelStats(ch); } catch (e) { }
  }
  toast('YouTube desconectado');
};

function updateConnectUI(connected) {
  const connectBtn = document.getElementById('btn-yt-connect');
  const disconnectBtn = document.getElementById('btn-yt-disconnect');
  const statusEl = document.getElementById('yt-connect-status');
  if (!connectBtn) return;
  if (connected) {
    connectBtn.style.display = 'none';
    disconnectBtn.style.display = 'inline-flex';
    statusEl.style.display = 'inline';
  } else {
    connectBtn.style.display = 'inline-flex';
    disconnectBtn.style.display = 'none';
    statusEl.style.display = 'none';
    // Esconde gráficos
    ['views-chart', 'subscribers-chart'].forEach(id => {
      const c = document.getElementById(id);
      if (c) c.style.display = 'none';
    });
    document.getElementById('views-chart-placeholder').style.display = 'flex';
    document.getElementById('subs-chart-placeholder').style.display = 'flex';
  }
}

// ── Fetch público (sem auth) ──────────────────────────────────────────────────
async function fetchYTChannel(handle) {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,brandingSettings&forHandle=${handle}&key=${YT_API_KEY}`;
  let resp;
  try { resp = await fetch(url, { referrerPolicy: 'no-referrer' }); } catch (e) { throw new Error('Sem acesso à API do YouTube. Verifique sua conexão e domínio autorizado.'); }
  if (resp.status === 403) throw new Error('API do YouTube bloqueou a requisição (403). Acesse o Google Cloud Console e adicione seu domínio (ou localhost) às origens autorizadas da API key.');
  if (!resp.ok) throw new Error('Erro na API do YouTube: ' + resp.status);
  const data = await resp.json();
  if (!data.items?.length) throw new Error('Canal não encontrado. Verifique a URL.');
  return data.items[0];
}

// ── Fetch Analytics (com OAuth token) ────────────────────────────────────────
async function fetchYTAnalytics(channelId, days) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - days);
  const fmt = d => d.toISOString().split('T')[0];

  const url = `https://youtubeanalytics.googleapis.com/v2/reports?` +
    `ids=channel==${channelId}` +
    `&startDate=${fmt(startDate)}&endDate=${fmt(endDate)}` +
    `&metrics=views,estimatedMinutesWatched,subscribersGained,subscribersLost` +
    `&dimensions=day&sort=day&key=${YT_API_KEY}`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${_ytToken}` }
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || 'Erro Analytics API');
  }
  return resp.json();
}

// ── Render channel header (banner + avatar) ───────────────────────────────────
function renderChannelHeader(ch) {
  const snippet = ch.snippet || {};
  const branding = ch.brandingSettings?.image || {};

  const avatarEl = document.getElementById('channel-avatar');
  const thumb = snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url;
  if (avatarEl && thumb) avatarEl.innerHTML = `<img src="${thumb}" class="u-cover-img">`;

  const bannerEl = document.getElementById('channel-banner-img');
  const banner = branding.bannerExternalUrl;
  if (bannerEl && banner) {
    bannerEl.style.backgroundImage = `url(${banner}=w1280-fcrop64=1,32b75a57cd48a5a8-k-c0xffffffff-no-nd-rj)`;
  }

  const nameEl = document.getElementById('display-channel-name');
  const urlEl = document.getElementById('display-channel-url');
  const descEl = document.getElementById('display-channel-desc');
  if (nameEl) nameEl.textContent = snippet.title || '@' + extractHandle(_teamYoutubeChannel);
  if (urlEl) urlEl.textContent = _teamYoutubeChannel;
  if (descEl) {
    const d = snippet.description || '';
    descEl.textContent = d.length > 120 ? d.slice(0, 120) + '…' : d;
  }
  const editBtn = document.getElementById('btn-edit-channel');
  if (editBtn) editBtn.style.display = isOwner() ? 'block' : 'none';
}

// ── Render stats públicos ─────────────────────────────────────────────────────
function renderChannelStats(ch) {
  const stats = ch.statistics || {};
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('stat-views', fmtN(stats.viewCount));
  set('stat-subscribers', fmtN(stats.subscriberCount));
  set('stat-videos', fmtN(stats.videoCount));
  set('stat-watch-time', '—');
  set('stat-subs-change', 'Total acumulado');
  set('stat-views-period', 'Total acumulado');
  set('stat-time-change', 'Conecte o YouTube');

  // Armazena channelId para usar no analytics
  ch._id = ch.id;
}

// ── Render analytics reais (OAuth) ────────────────────────────────────────────
async function loadYTAnalyticsData(days) {
  if (!ytHasToken()) return;
  const handle = extractHandle(_teamYoutubeChannel);
  if (!handle) return;

  try {
    // Pega o channelId primeiro
    const ch = await fetchYTChannel(handle);
    const chId = ch.id;
    const data = await fetchYTAnalytics(chId, days);
    const rows = data.rows || [];

    if (!rows.length) { toast('Sem dados para o período selecionado', 'error'); return; }

    const labels = rows.map(r => r[0].slice(5)); // MM-DD
    const viewsArr = rows.map(r => r[1]);
    const watchArr = rows.map(r => Math.round(r[2] / 60)); // min → h
    const subsGained = rows.map(r => r[3]);
    const subsLost = rows.map(r => r[4]);
    const subsDelta = subsGained.map((g, i) => g - subsLost[i]);

    const totalViews = viewsArr.reduce((a, b) => a + b, 0);
    const totalWatch = watchArr.reduce((a, b) => a + b, 0);
    const totalSubsNet = subsDelta.reduce((a, b) => a + b, 0);

    // Atualiza cards
    document.getElementById('stat-views').textContent = fmtN(totalViews);
    document.getElementById('stat-watch-time').textContent = fmtN(totalWatch) + 'h';
    document.getElementById('stat-subs-change').textContent = fmtDelta(totalSubsNet);
    document.getElementById('stat-views-period').textContent = `Últimos ${days} dias`;
    document.getElementById('stat-time-change').textContent = `Últimos ${days} dias`;

    const subsWrap = document.getElementById('stat-subs-wrap');
    if (subsWrap) {
      subsWrap.className = 'stat-change ' + (totalSubsNet >= 0 ? 'positive' : 'negative');
      document.getElementById('stat-subs-arrow').textContent = totalSubsNet >= 0 ? '▲' : '▼';
    }

    // Esconde placeholders
    document.getElementById('views-chart').style.display = 'block';
    document.getElementById('subscribers-chart').style.display = 'block';
    document.getElementById('views-chart-placeholder').style.display = 'none';
    document.getElementById('subs-chart-placeholder').style.display = 'none';

    const chartOpts = {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#7a70a8', font: { size: 9, family: 'Fira Code' }, maxTicksLimit: 10 }, grid: { color: 'rgba(100,80,180,0.1)' } },
        y: { ticks: { color: '#7a70a8', font: { size: 9, family: 'Fira Code' } }, grid: { color: 'rgba(100,80,180,0.1)' } }
      }
    };

    _ytChartViews?.destroy();
    _ytChartSubs?.destroy();

    const ctxV = document.getElementById('views-chart')?.getContext('2d');
    if (ctxV) {
      _ytChartViews = new Chart(ctxV, {
        type: 'bar',
        data: {
          labels,
          datasets: [{ data: viewsArr, backgroundColor: 'rgba(139,92,246,0.5)', borderColor: 'var(--a2)', borderWidth: 1, borderRadius: 3 }]
        },
        options: { ...chartOpts }
      });
    }

    const ctxS = document.getElementById('subscribers-chart')?.getContext('2d');
    if (ctxS) {
      _ytChartSubs = new Chart(ctxS, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data: subsDelta,
            borderColor: '#ff3cb4',
            backgroundColor: 'rgba(255,60,180,0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: 2
          }]
        },
        options: { ...chartOpts }
      });
    }

  } catch (e) {
    toast('Erro ao carregar analytics: ' + e.message, 'error');
    console.error(e);
  }
}

// ── Botões de período ─────────────────────────────────────────────────────────
window.changeChartPeriod = function (days) {
  _currentPeriod = days;
  [7, 30, 90].forEach(d => {
    const btn = document.getElementById('period-' + d);
    if (!btn) return;
    btn.style.borderColor = d === days ? 'var(--a2)' : '';
    btn.style.color = d === days ? 'var(--a2)' : '';
  });
  document.querySelector('#views-chart + div ~ div .chart-title span:first-child')?.
    setAttribute('data-label', `Últimos ${days} dias`);
  loadYTAnalyticsData(days);
};

// ── Função principal ──────────────────────────────────────────────────────────
window.loadAnalytics = async function () {
  // FASE 1 — Plan Engine: verifica feature específica em vez de canAccessPro() genérico
  const hasPro = hasFeature(currentUserData, 'hasYouTubeAnalytics') || canAdmin();
  const hasChannel = _teamYoutubeChannel && _teamYoutubeChannel.trim() !== '';
  const owner = isOwner();

  ['channel-config-section', 'channel-info-display', 'analytics-stats-section',
    'analytics-upgrade-banner', 'analytics-no-channel-banner', 'yt-api-key-warning'].forEach(id => {
      document.getElementById(id)?.classList.add('hidden');
    });

  if (!hasPro) {
    document.getElementById('analytics-upgrade-banner')?.classList.remove('hidden');
    return;
  }

  if (!hasChannel) {
    if (owner) {
      document.getElementById('channel-config-section')?.classList.remove('hidden');
      const inp = document.getElementById('channel-url-input');
      if (inp) inp.value = '';
    } else {
      document.getElementById('analytics-no-channel-banner')?.classList.remove('hidden');
    }
    return;
  }

  if (owner) {
    document.getElementById('channel-config-section')?.classList.remove('hidden');
    const inp = document.getElementById('channel-url-input');
    if (inp) inp.value = _teamYoutubeChannel;
  }
  document.getElementById('channel-info-display')?.classList.remove('hidden');
  document.getElementById('analytics-stats-section')?.classList.remove('hidden');

  // Esconde canvas até ter token
  ['views-chart', 'subscribers-chart'].forEach(id => {
    const c = document.getElementById(id);
    if (c) c.style.display = 'none';
  });

  const handle = extractHandle(_teamYoutubeChannel);
  if (!handle) return;

  // Tenta recuperar token salvo no Firestore
  try {
    const team = _myTeams.find(t => t.id === _currentTeamId);
    const savedToken = team?.ytAccessToken;
    const savedExpiry = team?.ytTokenExpiry || 0;
    if (savedToken && Date.now() < savedExpiry) {
      _ytToken = savedToken;
      _ytTokenExpiry = savedExpiry;
      updateConnectUI(true);
    } else {
      updateConnectUI(false);
    }
  } catch (e) { updateConnectUI(false); }

  // Carrega dados públicos do canal (avatar, banner, stats básicos)
  // BUGFIX: Se a API já retornou 403, não tenta de novo — mostra aviso e para.
  if (_ytApiBlocked) {
    document.getElementById('yt-api-key-warning')?.classList.remove('hidden');
    const nameEl = document.getElementById('display-channel-name');
    if (nameEl) nameEl.textContent = 'Integração YouTube indisponível (sem credenciais)';
    return;
  }
  try {
    const ch = await fetchYTChannel(handle);
    renderChannelHeader(ch);
    renderChannelStats(ch);
    // Se tem token válido, carrega analytics detalhados
    if (ytHasToken()) loadYTAnalyticsData(_currentPeriod);
  } catch (e) {
    if (e.message.includes('403')) {
      _ytApiBlocked = true; // para de tentar até próximo reload
      document.getElementById('yt-api-key-warning')?.classList.remove('hidden');
    } else {
      toast('⚠️ ' + e.message, 'error');
    }
    const nameEl = document.getElementById('display-channel-name');
    if (nameEl) nameEl.textContent = _ytApiBlocked ? 'Integração indisponível (sem credenciais)' : '@' + handle;
  }
};

window.saveChannelUrl = async function () {
  if (!isOwner()) { toast('Apenas o dono da equipe pode configurar o canal', 'error'); return; }
  const input = document.getElementById('channel-url-input');
  const url = input?.value.trim() || '';
  if (!url) { toast('Digite a URL do canal', 'error'); return; }
  if (!url.includes('youtube.com/')) {
    toast('URL inválida. Use: https://www.youtube.com/@seucanal', 'error');
    return;
  }
  try {
    await updateDoc(doc(db, 'teams', _currentTeamId), { youtubeChannel: url });
    _teamYoutubeChannel = url;
    const team = _myTeams.find(t => t.id === _currentTeamId);
    if (team) team.youtubeChannel = url;
    toast('✅ Canal configurado com sucesso!');
    window.loadAnalytics();
  } catch (e) {
    toast('❌ Erro ao salvar: ' + e.message, 'error');
  }
};

window.canAccessPro = canAccessPro;
window.isOwner = isOwner;

// ══════════════════════════════════════════════════════════════════════════════
// FIM DO ANALYTICS MODULE
// ══════════════════════════════════════════════════════════════════════════════



// ══════════════════════════════════════════════════════════════════════════════
// TALENTS MODULE — Procure sua Equipe
// ══════════════════════════════════════════════════════════════════════════════

const TALENT_ROLES = [
  { id: 'r_vocal', label: 'Vocais', icon: '🎤' },
  { id: 'r_beat', label: 'Beat', icon: '🥁' },
  { id: 'r_mix', label: 'Mix & Master', icon: '🎚️' },
  { id: 'r_letra', label: 'Letra', icon: '✍️' },
  { id: 'r_edit', label: 'Edição de Vídeo', icon: '🎬' },
  { id: 'r_ilus', label: 'Ilustração', icon: '🖼️' },
  { id: 'r_thumb', label: 'Thumbnail', icon: '🎨' },
  { id: 'r_roteiro', label: 'Roteiro', icon: '📋' },
  { id: 'r_direcao', label: 'Direção Criativa', icon: '🎭' },
  { id: 'r_ideal', label: 'Idealização', icon: '💡' },
];
const SKILL_LEVELS = [
  { id: 'beginner', label: 'Iniciante', color: '#60a5fa' },
  { id: 'basic', label: 'Iniciante', color: '#60a5fa' },
  { id: 'intermediate', label: 'Intermediário', color: '#a78bfa' },
  { id: 'inter', label: 'Intermediário', color: '#a78bfa' },
  { id: 'advanced', label: 'Avançado', color: '#34d399' },
  { id: 'expert', label: 'Expert', color: '#fbbf24' },
];

let _allTalents = [];
let _filteredTalents = [];
let _talentsView = 'list';
let _swipeIndex = 0;
let _currentMsgTarget = null;
let _myTalentProfile = null;
let _talentPhotoBase64 = null;
let _currentTalentStep = 1;

// ── Helpers ───────────────────────────────────────────────────────────────────
function hasTeam() { return !!_currentTeamId; }

function calcAge(birthdate) {
  if (!birthdate) return null;
  const bd = new Date(birthdate);
  const today = new Date();
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}

function extractYTId(url) {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

window.previewYT = function (inputId, previewId) {
  const url = document.getElementById(inputId)?.value.trim();
  const preview = document.getElementById(previewId);
  if (!preview) return;
  const vid = extractYTId(url);
  if (vid) {
    preview.style.display = 'block';
    preview.innerHTML = `<iframe width="100%" height="180" src="https://www.youtube.com/embed/${vid}" frameborder="0" allowfullscreen style="border-radius:8px"></iframe>`;
  } else {
    preview.style.display = 'none';
    preview.innerHTML = '';
  }
};

window.handleTalentPhoto = function (input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    _talentPhotoBase64 = e.target.result;
    const img = document.getElementById('tp-photo-img');
    const icon = document.getElementById('tp-photo-icon');
    if (img) { img.src = _talentPhotoBase64; img.style.display = 'block'; }
    if (icon) icon.style.display = 'none';
  };
  reader.readAsDataURL(file);
};

// ── Step navigation ───────────────────────────────────────────────────────────
window.goTalentStep = function (step) {
  _currentTalentStep = step;
  [1, 2, 3].forEach(s => {
    const el = document.getElementById(`tp-step-${s}`);
    const tab = document.getElementById(`tp-step-${s}-tab`);
    if (el) el.style.display = s === step ? 'block' : 'none';
    if (tab) {
      tab.style.background = s === step ? 'var(--a1)' : 'var(--card)';
      tab.style.color = s === step ? 'white' : 'var(--text3)';
    }
  });
  if (step === 2) renderSkillsList();
};

function renderSkillsList() {
  const container = document.getElementById('tp-skills-list');
  if (!container) return;
  const existing = _myTalentProfile?.skills || {};
  container.innerHTML = TALENT_ROLES.map(r => {
    const sel = existing[r.id];
    return `
    <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="width:32px;text-align:center;font-size:20px">${r.icon}</div>
      <div style="flex:1;min-width:120px">
        <div style="font-weight:600;font-size:13px">${r.label}</div>
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        <button onclick="toggleSkill('${r.id}',null,this)" data-role="${r.id}" data-level=""
          style="padding:5px 11px;border-radius:6px;font-size:10px;font-family:var(--font-mono);letter-spacing:1px;cursor:pointer;
          border:1px solid var(--border2);background:${!sel ? 'var(--border2)' : 'transparent'};color:${!sel ? 'var(--text)' : 'var(--text3)'};transition:all 0.15s">
          NENHUM
        </button>
        ${SKILL_LEVELS.map(lv => `
        <button onclick="toggleSkill('${r.id}','${lv.id}',this)" data-role="${r.id}" data-level="${lv.id}"
          style="padding:5px 11px;border-radius:6px;font-size:10px;font-family:var(--font-mono);letter-spacing:1px;cursor:pointer;
          border:1px solid ${lv.color}40;
          background:${sel === lv.id ? lv.color + '22' : 'transparent'};
          color:${sel === lv.id ? lv.color : 'var(--text3)'};
          font-weight:${sel === lv.id ? '700' : '400'};
          transition:all 0.15s">
          ${lv.label.toUpperCase()}
        </button>`).join('')}
      </div>
    </div>`;
  }).join('');
}

window.toggleSkill = function (roleId, level, btn) {
  if (!_myTalentProfile) _myTalentProfile = {};
  if (!_myTalentProfile.skills) _myTalentProfile.skills = {};
  if (level === null) {
    delete _myTalentProfile.skills[roleId];
  } else {
    _myTalentProfile.skills[roleId] = level;
  }
  // Re-render just the buttons for this role
  const row = btn.closest('[data-role]')?.parentElement || btn.parentElement;
  row.querySelectorAll('button').forEach(b => {
    const bl = b.dataset.level;
    const lv = SKILL_LEVELS.find(x => x.id === bl);
    if (bl === '') {
      const sel = !_myTalentProfile.skills[roleId];
      b.style.background = sel ? 'var(--border2)' : 'transparent';
      b.style.color = sel ? 'var(--text)' : 'var(--text3)';
    } else if (lv) {
      const sel = _myTalentProfile.skills[roleId] === bl;
      b.style.background = sel ? lv.color + '22' : 'transparent';
      b.style.color = sel ? lv.color : 'var(--text3)';
      b.style.fontWeight = sel ? '700' : '400';
    }
  });
};

// ── Load page (v1 legacy — sobrescrito pelo v5 do match system script) ───────
// NOTA: Esta função v1 usa o sistema de spotlight antigo. O sistema v5 está
// definido no script do Match System e sobrescreve window.loadTalentsPage.
// Mantida aqui como fallback seguro para o caso do v5 não carregar.
window._loadTalentsPageV1 = async function () {
  const noteam = document.getElementById('talents-noteam-banner');
  const prompt = document.getElementById('talents-create-profile-prompt');
  const filters = document.getElementById('talents-filters');
  const listView = document.getElementById('talents-list-view');
  const swipeView = document.getElementById('talents-swipe-view');

  [noteam, prompt, filters, listView, swipeView].forEach(el => el?.classList.add('hidden'));

  // Fix: check _currentTeamId directly (hasTeam() might be stale on first load)
  const inTeam = !!_currentTeamId;
  if (!inTeam) { noteam?.classList.remove('hidden'); return; }

  // Check if user has profile
  try {
    const snap = await getDocs(collection(db, 'talent_profiles'));
    const me = snap.docs.find(d => d.data().uid === currentUser?.uid);
    if (me) {
      _myTalentProfile = { id: me.id, ...me.data() };
      updateMiniCard(_myTalentProfile);
    } else {
      _myTalentProfile = null;
    }

    // Fix 2: Always show create-profile prompt if no profile yet
    if (!_myTalentProfile) {
      prompt?.classList.remove('hidden');
      return;
    }

    _allTalents = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(t => t.availability !== 'hidden' && t.uid !== currentUser?.uid)
      .sort(_sortByPriority); // ETAPA 4: effectivePriority desc, updatedAt desc

    // ETAPA 4.1: backfill controlado — preenche effectivePriority=1 em até 10 docs sem o campo
    let _backfillCount = 0;
    for (const t of snap.docs) {
      if (_backfillCount >= 10) break;
      if (typeof t.data().effectivePriority !== 'number') {
        updateDoc(doc(db, 'talent_profiles', t.id), { effectivePriority: 1, plan: t.data().plan || 'free' }).catch(() => { });
        _backfillCount++;
      }
    }

    filters?.classList.remove('hidden');
    filterTalents();
    setTalentsView(_talentsView);
  } catch (e) {
    toast('Erro ao carregar: ' + e.message, 'error');
  }
};
// Fallback: usa v1 apenas se v5 não foi definido ainda (improvável pois scripts inline
// rodam antes do módulo, mas garante que nunca fique sem loadTalentsPage)
if (!window.loadTalentsPage) window.loadTalentsPage = window._loadTalentsPageV1;

// ── Abrir popup de visualização do meu perfil de talento ─────────────────────
window._openMyTalentPopup = async function (event) {
  // Always fetch fresh data from Firestore (never trust stale cache)
  let p = null;
  if (currentUser) {
    try {
      const snap = await getDoc(doc(db, 'talent_profiles', currentUser.uid));
      if (snap.exists()) {
        p = { id: currentUser.uid, ...snap.data() };
        window._myTalentProfile = p; // update cache
      }
    } catch (e) {
      // fallback to cache if network fails
      p = window._myTalentProfile || null;
    }
  }
  if (!p) { openMyTalentProfile(); return; } // Sem perfil → abre edição
  const roles = Object.keys(p.skills || {});
  const roleMap = {
    r_vocal: '🎤 Vocal', r_beat: '🥁 Beat', r_mix: '🎚️ Mix & Master',
    r_letra: '✍️ Letra', r_edit: '🎬 Edição', r_ilus: '🖼️ Ilustração',
    r_thumb: '🎨 Thumbnail', r_ideal: '💡 Idealização', r_social: '📲 Social Media', r_photo: '📸 Fotografia',
  };
  const levelWidth = { beginner: 25, basic: 25, basico: 25, iniciante: 25, intermediate: 55, inter: 55, intermediario: 55, 'intermediário': 55, advanced: 80, avancado: 80, 'avançado': 80, expert: 100 };
  const avail = p.availability || 'open';
  const data = {
    name: p.name || currentUserData?.name || 'Meu Perfil',
    photo: p.photo || currentUserData?.photoURL || '',
    bio: p.bio || '',
    roles: roles,
    availability: avail,
    uid: currentUser?.uid,
    bannerURL: p.banner || currentUserData?.bannerURL || '',
    location: p.location || '',
    stats: [
      { v: roles.length, l: 'Habilidades' },
      { v: (avail === 'available' || avail === 'open') ? '✅' : (avail === 'part_time' ? '🟡' : (avail === 'busy' ? '🔶' : '🔒')), l: 'Status' },
    ],
    skillBars: roles.map(r => {
      const sv = _getSkillStr(p.skills[r]).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return {
        n: (roleMap[r] || r).replace(/^[^\s]+ /, ''),
        w: levelWidth[sv] ?? 55,
        l: ({
          beginner: 'Iniciante', basic: 'Iniciante', intermediate: 'Intermediário', inter: 'Intermediário',
          intermediario: 'Intermediário', advanced: 'Avançado', avancado: 'Avançado', expert: 'Expert',
          basico: 'Básico'
        }[sv] || _getSkillStr(p.skills[r]) || 'Intermediário'),
      };
    }),
    activity: [],
    badges: { earned: [], locked: [] },
  };
  if (typeof openProfilePopup === 'function') openProfilePopup(data, 'match', event);
};

// ── Mini card top-right ───────────────────────────────────────────────────────
function updateMiniCard(profile) {
  if (!profile) return;
  const card = document.getElementById('talent-mini-card');
  if (!card) return;

  const avatarEl = document.getElementById('tmc-avatar');
  const nameEl = document.getElementById('tmc-name');
  const rolesEl = document.getElementById('tmc-roles');
  const availEl = document.getElementById('tmc-avail');

  if (profile.photo) {
    avatarEl.innerHTML = `<img src="${profile.photo}" class="u-avatar-img">`;
  } else {
    avatarEl.textContent = (profile.name || '?')[0].toUpperCase();
  }

  if (nameEl) nameEl.textContent = profile.name || '';

  const skills = profile.skills || {};
  const roleLabels = Object.keys(skills).slice(0, 3).map(rid => {
    const r = TALENT_ROLES.find(x => x.id === rid);
    return r ? r.icon : '';
  }).join(' ');
  if (rolesEl) rolesEl.textContent = roleLabels || 'Sem habilidades';

  const availMap = { open: '✅ Disponível', busy: '🔶 Ocupado', hidden: '🔒 Oculto' };
  const availColor = { open: 'var(--green)', busy: 'var(--yellow)', hidden: 'var(--text3)' };
  if (availEl) {
    availEl.textContent = availMap[profile.availability || 'open'] || '';
    availEl.style.color = availColor[profile.availability || 'open'] || '';
  }

  card.style.display = 'flex';
  card.style.alignItems = 'center';
}

// ── Filter ────────────────────────────────────────────────────────────────────
window.filterTalents = function () {
  const search = document.getElementById('talents-search')?.value.toLowerCase() || '';
  const role = document.getElementById('talents-role-filter')?.value || '';
  const avail = document.getElementById('talents-avail-filter')?.value || '';

  _filteredTalents = _allTalents.filter(t => {
    const matchSearch = !search || (t.name || '').toLowerCase().includes(search) || (t.bio || '').toLowerCase().includes(search);
    const matchRole = !role || (t.skills && t.skills[role]);
    const matchAvail = !avail || t.availability === avail;
    return matchSearch && matchRole && matchAvail;
  }).sort(_sortByPriority); // ETAPA 4: mantém effectivePriority desc após filtros

  const countEl = document.getElementById('talents-count');
  if (countEl) countEl.textContent = `${_filteredTalents.length} talento(s)`;

  if (_talentsView === 'list') renderTalentsList();
  else { _swipeIndex = 0; renderSwipeCard(); }
};

// ── Set view ──────────────────────────────────────────────────────────────────
window.setTalentsView = function (view) {
  _talentsView = view;
  const listView = document.getElementById('talents-list-view');
  const swipeView = document.getElementById('talents-swipe-view');
  const btnList = document.getElementById('talents-view-list');
  const btnSwipe = document.getElementById('talents-view-swipe');

  if (view === 'list') {
    listView?.classList.remove('hidden');
    swipeView?.classList.add('hidden');
    if (btnList) { btnList.style.borderColor = 'var(--a2)'; btnList.style.color = 'var(--a2)'; }
    if (btnSwipe) { btnSwipe.style.borderColor = ''; btnSwipe.style.color = ''; }
    renderTalentsList();
  } else {
    listView?.classList.add('hidden');
    swipeView?.classList.remove('hidden');
    if (btnSwipe) { btnSwipe.style.borderColor = 'var(--a2)'; btnSwipe.style.color = 'var(--a2)'; }
    if (btnList) { btnList.style.borderColor = ''; btnList.style.color = ''; }
    _swipeIndex = 0;
    renderSwipeCard();
  }
};

// ── Render list ───────────────────────────────────────────────────────────────
function renderTalentsList() {
  const grid = document.getElementById('talents-grid');
  const empty = document.getElementById('talents-empty');
  if (!grid) return;
  if (!_filteredTalents.length) { grid.innerHTML = ''; empty?.classList.remove('hidden'); return; }
  empty?.classList.add('hidden');

  grid.innerHTML = _filteredTalents.map(t => {
    const age = calcAge(t.birthdate);
    const skills = t.skills || {};
    const skillKeys = Object.keys(skills);
    const avColor = { open: 'var(--green)', busy: 'var(--yellow)', hidden: 'var(--text3)' };
    const avLabel = { open: '✅ Disponível', busy: '🔶 Ocupado', hidden: '🔒 Oculto' };

    const avatarHtml = t.photo
      ? `<img src="${t.photo}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid var(--border2)">`
      : `<div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--a1),var(--a2));display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;color:white;flex-shrink:0">${(t.name || '?')[0].toUpperCase()}</div>`;

    const skillBadges = skillKeys.slice(0, 4).map(rid => {
      const role = TALENT_ROLES.find(x => x.id === rid);
      const lv = SKILL_LEVELS.find(x => x.id === skills[rid]);
      if (!role || !lv) return '';
      return `<span style="font-size:9px;font-family:var(--font-mono);letter-spacing:0.5px;padding:3px 8px;border-radius:4px;
        background:${lv.color}18;border:1px solid ${lv.color}40;color:${lv.color}">${role.icon} ${role.label}</span>`;
    }).join('');

    const effPlanInfo = typeof getEffectivePlanForUser === 'function' ? getEffectivePlanForUser(t) : { plan: t.plan || 'free' };
    const inlineChip = typeof renderPlanChip === 'function' ? renderPlanChip(effPlanInfo, 'inline') : '';
    const pillChip = typeof renderPlanChip === 'function' ? renderPlanChip(effPlanInfo, 'pill') : '';

    return `
    <div class="card" onclick="viewTalent('${t.id}')"
      style="padding:20px;cursor:pointer;transition:all 0.2s;border:1px solid var(--border)"
      onmouseover="this.style.borderColor='var(--border2)';this.style.transform='translateY(-2px)'"
      onmouseout="this.style.borderColor='var(--border)';this.style.transform=''">
      <div style="display:flex;align-items:center;gap:13px;margin-bottom:14px">
        ${avatarHtml}
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--font-body);font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px">${t.name || 'Sem nome'}${inlineChip}</div>
          <div style="font-size:11px;color:var(--text3)">${age !== null ? `${age} anos` : ''}</div>
          <div style="font-size:11px;margin-top:2px;color:${avColor[t.availability || 'open']}">${avLabel[t.availability || 'open']}${t.price ? ` · ${t.price}` : ''}</div>
          ${pillChip ? `<div style="margin-top:5px">${pillChip}</div>` : ''}
        </div>
      </div>
      ${t.bio ? `<div style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${t.bio}</div>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:5px">
        ${skillBadges}
        ${skillKeys.length > 4 ? `<span style="font-size:9px;font-family:var(--font-mono);color:var(--text3);padding:3px 6px">+${skillKeys.length - 4}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Swipe ─────────────────────────────────────────────────────────────────────
function renderSwipeCard() {
  const container = document.getElementById('swipe-card-container');
  const actions = document.getElementById('swipe-actions');
  const empty = document.getElementById('swipe-empty');
  if (!container) return;
  container.querySelectorAll('.swipe-card').forEach(c => c.remove());

  if (_swipeIndex >= _filteredTalents.length) {
    empty?.classList.remove('hidden'); actions?.classList.add('hidden'); return;
  }
  empty?.classList.add('hidden'); actions?.classList.remove('hidden');
  if (_swipeIndex + 1 < _filteredTalents.length)
    container.appendChild(buildSwipeCard(_filteredTalents[_swipeIndex + 1], false));
  container.appendChild(buildSwipeCard(_filteredTalents[_swipeIndex], true));
}

function buildSwipeCard(t, active) {
  const card = document.createElement('div');
  card.className = 'swipe-card';
  card.style.cssText = `position:absolute;inset:0;border-radius:18px;background:var(--card);border:1px solid var(--border2);padding:26px 22px;transition:transform 0.35s cubic-bezier(.25,.46,.45,.94),opacity 0.3s;${active ? 'z-index:2;cursor:grab' : 'z-index:1;transform:scale(0.96) translateY(8px);opacity:0.6'}`;

  const age = calcAge(t.birthdate);
  const skills = t.skills || {};
  const avColor = { open: 'var(--green)', busy: 'var(--yellow)' };
  const avLabel = { open: '✅ Disponível', busy: '🔶 Ocupado' };

  const avatarHtml = t.photo
    ? `<img src="${t.photo}" style="width:60px;height:60px;border-radius:50%;object-fit:cover;border:3px solid var(--border2);flex-shrink:0">`
    : `<div style="width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,var(--a1),var(--a2));display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px;color:white;flex-shrink:0;box-shadow:var(--glow2)">${(t.name || '?')[0].toUpperCase()}</div>`;

  const skillBadges = Object.keys(skills).map(rid => {
    const role = TALENT_ROLES.find(x => x.id === rid);
    const lv = SKILL_LEVELS.find(x => x.id === skills[rid]);
    if (!role || !lv) return '';
    return `<span style="font-size:10px;font-family:var(--font-mono);letter-spacing:0.5px;padding:4px 9px;border-radius:5px;background:${lv.color}18;border:1px solid ${lv.color}40;color:${lv.color}">${role.icon} ${role.label}</span>`;
  }).join('');

  const effPlanInfo = typeof getEffectivePlanForUser === 'function' ? getEffectivePlanForUser(t) : { plan: t.plan || 'free' };
  const inlineChip = typeof renderPlanChip === 'function' ? renderPlanChip(effPlanInfo, 'inline') : '';
  const pillChip = typeof renderPlanChip === 'function' ? renderPlanChip(effPlanInfo, 'pill') : '';

  card.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
      ${avatarHtml}
      <div>
        <div style="font-family:var(--font-body);font-weight:800;font-size:19px;display:flex;align-items:center;gap:7px">${t.name || 'Sem nome'}${inlineChip}</div>
        <div class="u-fs12-muted">${age !== null ? `${age} anos` : ''}</div>
        <div style="font-size:12px;color:${avColor[t.availability || 'open'] || 'var(--text3)'}">${avLabel[t.availability || 'open'] || ''}</div>
        ${pillChip ? `<div style="margin-top:6px">${pillChip}</div>` : ''}
      </div>
    </div>
    ${t.bio ? `<div style="font-size:12px;color:var(--text2);line-height:1.6;margin-bottom:14px">${t.bio}</div>` : ''}
    <div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text3);margin-bottom:8px">HABILIDADES</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">${skillBadges}</div>
    ${t.price ? `<div style="font-size:12px;color:var(--text2);margin-bottom:8px">💰 ${t.price}</div>` : ''}
    <button onclick="openMessageModal('${t.id}','${(t.name || '').replace(/'/g, "\\'")}'); event.stopPropagation()"
      style="position:absolute;bottom:18px;right:18px;padding:7px 14px;background:var(--a1);border:none;border-radius:8px;color:white;font-family:var(--font-mono);font-size:10px;letter-spacing:1px;cursor:pointer">
      ✉ CONTATO
    </button>
  `;

  if (active) {
    let startX = 0, isDragging = false;
    card.addEventListener('mousedown', e => { startX = e.clientX; isDragging = true; card.style.cursor = 'grabbing'; });
    document.addEventListener('mousemove', e => { if (!isDragging) return; const dx = e.clientX - startX; card.style.transform = `translateX(${dx}px) rotate(${dx * 0.04}deg)`; card.style.opacity = 1 - Math.abs(dx) / 400; });
    document.addEventListener('mouseup', e => { if (!isDragging) return; isDragging = false; card.style.cursor = 'grab'; const dx = e.clientX - startX; if (Math.abs(dx) > 100) animateSwipe(card, dx > 0 ? 'right' : 'left'); else { card.style.transform = ''; card.style.opacity = ''; } });
    card.addEventListener('touchstart', e => { startX = e.touches[0].clientX; isDragging = true; });
    card.addEventListener('touchmove', e => { if (!isDragging) return; const dx = e.touches[0].clientX - startX; card.style.transform = `translateX(${dx}px) rotate(${dx * 0.04}deg)`; card.style.opacity = 1 - Math.abs(dx) / 400; });
    card.addEventListener('touchend', e => { if (!isDragging) return; isDragging = false; const dx = e.changedTouches[0].clientX - startX; if (Math.abs(dx) > 100) animateSwipe(card, dx > 0 ? 'right' : 'left'); else { card.style.transform = ''; card.style.opacity = ''; } });
  }
  return card;
}

function animateSwipe(card, dir) {
  card.style.transition = 'transform 0.4s ease,opacity 0.4s ease';
  card.style.transform = `translateX(${dir === 'right' ? 600 : -600}px) rotate(${dir === 'right' ? 20 : -20}deg)`;
  card.style.opacity = '0';
  if (dir === 'right') { const t = _filteredTalents[_swipeIndex]; toast(`💌 Interesse em ${t.name}! Envie uma mensagem.`, 'success'); }
  _swipeIndex++;
  setTimeout(() => renderSwipeCard(), 380);
}

window.swipeAction = function (action) {
  const container = document.getElementById('swipe-card-container');
  const card = container?.querySelector('.swipe-card:last-child');
  if (!card) return;
  animateSwipe(card, action === 'like' ? 'right' : 'left');
};

// ── View full profile ─────────────────────────────────────────────────────────
window.viewTalent = function (id) {
  const t = _allTalents.find(x => x.id === id);
  if (!t) return;
  const content = document.getElementById('talent-view-content');
  if (!content) return;

  const age = calcAge(t.birthdate);
  const skills = t.skills || {};
  const avColor = { open: 'var(--green)', busy: 'var(--yellow)', hidden: 'var(--text3)' };
  const avLabel = { open: '✅ Disponível', busy: '🔶 Ocupado', hidden: '🔒 Oculto' };

  const avatarHtml = t.photo
    ? `<img src="${t.photo}" style="width:68px;height:68px;border-radius:50%;object-fit:cover;border:3px solid var(--border2)">`
    : `<div style="width:68px;height:68px;border-radius:50%;background:linear-gradient(135deg,var(--a1),var(--a2));display:flex;align-items:center;justify-content:center;font-weight:800;font-size:26px;color:white;box-shadow:var(--glow2)">${(t.name || '?')[0].toUpperCase()}</div>`;

  const skillRows = SKILL_LEVELS.map(lv => {
    const mySkills = Object.keys(skills).filter(r => skills[r] === lv.id);
    if (!mySkills.length) return '';
    return `
      <div style="margin-bottom:10px">
        <div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:${lv.color};margin-bottom:6px">${lv.label.toUpperCase()}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${mySkills.map(rid => { const r = TALENT_ROLES.find(x => x.id === rid); return r ? `<span style="font-size:11px;font-family:var(--font-mono);padding:4px 10px;border-radius:5px;background:${lv.color}18;border:1px solid ${lv.color}40;color:${lv.color}">${r.icon} ${r.label}</span>` : '' }).join('')}
        </div>
      </div>`;
  }).join('');

  const ytEmbeds = [t.yt1, t.yt2, t.yt3].filter(Boolean).map(url => {
    const vid = extractYTId(url);
    return vid ? `<div style="border-radius:8px;overflow:hidden;margin-bottom:10px"><iframe width="100%" height="180" src="https://www.youtube.com/embed/${vid}" frameborder="0" allowfullscreen></iframe></div>` : '';
  }).join('');

  const effPlanInfo = typeof getEffectivePlanForUser === 'function' ? getEffectivePlanForUser(t) : { plan: t.plan || 'free' };
  const inlineChip = typeof renderPlanChip === 'function' ? renderPlanChip(effPlanInfo, 'inline') : '';
  const pillChip = typeof renderPlanChip === 'function' ? renderPlanChip(effPlanInfo, 'pill') : '';

  content.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
      ${avatarHtml}
      <div>
        <div style="font-family:var(--font-body);font-weight:800;font-size:21px;display:flex;align-items:center;gap:8px">${t.name || 'Sem nome'}${inlineChip}</div>
        <div class="u-fs12-muted">${age !== null ? `${age} anos` : ''}</div>
        <div style="font-size:12px;color:${avColor[t.availability || 'open']};margin-top:2px">${avLabel[t.availability || 'open'] || ''}${t.price ? ` · 💰 ${t.price}` : ''}</div>
        ${pillChip ? `<div style="margin-top:7px">${pillChip}</div>` : ''}
      </div>
    </div>
    ${t.bio ? `<div style="margin-bottom:18px"><div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text3);margin-bottom:8px">SOBRE</div><div style="font-size:13px;color:var(--text2);line-height:1.7">${t.bio}</div></div>` : ''}
    ${skillRows ? `<div style="margin-bottom:18px"><div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text3);margin-bottom:10px">HABILIDADES</div>${skillRows}</div>` : ''}
    ${ytEmbeds ? `<div style="margin-bottom:18px"><div style="font-family:var(--font-mono);font-size:9px;letter-spacing:2px;color:var(--text3);margin-bottom:10px">PORTFÓLIO</div>${ytEmbeds}</div>` : ''}
    <button onclick="openMessageModal('${t.id}','${(t.name || '').replace(/'/g, "\\'")}'); closeModal('modal-talent-view')"
      class="btn btn-primary" style="width:100%;margin-top:8px">✉ Enviar Mensagem</button>
  `;
  openModal('modal-talent-view');
};

// ── Message ───────────────────────────────────────────────────────────────────
window.openMessageModal = function (targetUid, targetName, targetPhoto) {
  // Use new private messaging system
  pmOpenChatWith(targetUid, targetName, targetPhoto || '');
};

window.sendTalentMessage = async function () {
  if (!_currentMsgTarget) return;
  const body = document.getElementById('talent-msg-body')?.value.trim();
  if (!body) { toast('Escreva uma mensagem!', 'error'); return; }
  try {
    await setDoc(doc(db, 'talent_messages', Date.now().toString()), {
      from: currentUser.uid,
      fromName: currentUserData?.name || currentUser.displayName || 'Usuário',
      to: _currentMsgTarget.uid,
      toName: _currentMsgTarget.name,
      body,
      createdAt: new Date().toISOString(),
      read: false,
    });
    toast(`✅ Mensagem enviada para ${_currentMsgTarget.name}!`);
    closeModal('modal-talent-message');
  } catch (e) { toast('Erro ao enviar: ' + e.message, 'error'); }
};

// ── My profile ────────────────────────────────────────────────────────────────
window.openMyTalentProfile = async function () {
  _talentPhotoBase64 = null;
  _currentTalentStep = 1;

  // Load existing
  if (!_myTalentProfile) {
    try {
      const snap = await getDocs(collection(db, 'talent_profiles'));
      const me = snap.docs.find(d => d.data().uid === currentUser?.uid);
      if (me) _myTalentProfile = { id: me.id, ...me.data() };
    } catch (e) { }
  }

  const p = _myTalentProfile || {};

  // Fill step 1
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  setVal('tp-name', p.name);
  setVal('tp-birthdate', p.birthdate);
  setVal('tp-contact', p.contact);
  setVal('tp-price', p.price);
  setVal('tp-bio', p.bio);
  setVal('tp-yt1', p.yt1);
  setVal('tp-yt2', p.yt2);
  setVal('tp-yt3', p.yt3);

  const avail = document.querySelector(`input[name="tp-avail"][value="${p.availability || 'open'}"]`);
  if (avail) avail.checked = true;

  // Photo
  if (p.photo) {
    _talentPhotoBase64 = p.photo;
    const img = document.getElementById('tp-photo-img');
    const icon = document.getElementById('tp-photo-icon');
    if (img) { img.src = p.photo; img.style.display = 'block'; }
    if (icon) icon.style.display = 'none';
  }

  // Previews
  ['tp-yt1', 'tp-yt2', 'tp-yt3'].forEach((id, i) => previewYT(id, `${id}-preview`));

  goTalentStep(1);
  openModal('modal-talent-profile');
};

window.saveTalentProfile = async function () {
  const name = document.getElementById('tp-name')?.value.trim();
  const birthdate = document.getElementById('tp-birthdate')?.value;
  const bio = document.getElementById('tp-bio')?.value.trim();
  const contact = document.getElementById('tp-contact')?.value.trim();
  const price = document.getElementById('tp-price')?.value.trim();
  const yt1 = document.getElementById('tp-yt1')?.value.trim();
  const yt2 = document.getElementById('tp-yt2')?.value.trim();
  const yt3 = document.getElementById('tp-yt3')?.value.trim();
  const avail = document.querySelector('input[name="tp-avail"]:checked')?.value || 'open';
  const skills = _myTalentProfile?.skills || {};

  if (!name) { goTalentStep(1); toast('Digite seu nome artístico!', 'error'); return; }
  if (!birthdate) { goTalentStep(1); toast('Insira sua data de nascimento!', 'error'); return; }
  if (!Object.keys(skills).length) { goTalentStep(2); toast('Selecione ao menos uma habilidade!', 'error'); return; }

  try {
    const profileData = {
      uid: currentUser.uid,
      name, birthdate, bio, contact, price,
      yt1, yt2, yt3,
      availability: avail,
      skills,
      photo: _talentPhotoBase64 || (_myTalentProfile?.photo || null),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'talent_profiles', currentUser.uid), profileData);
    _myTalentProfile = { id: currentUser.uid, ...profileData };
    // ETAPA 4.1: sync plan + effectivePriority → talent_profiles (usa valor persistido, não recalcula)
    if (currentUserData) {
      const ep = typeof currentUserData.effectivePriority === 'number'
        ? currentUserData.effectivePriority : 1;
      updateDoc(doc(db, 'talent_profiles', currentUser.uid), {
        plan: typeof window.resolveUserPlan === 'function' ? window.resolveUserPlan(currentUserData) : (currentUserData.plan || 'free'),
        effectivePriority: ep
      }).catch(() => { });
    }
    updateMiniCard(_myTalentProfile);
    toast('✅ Perfil salvo!');
    closeModal('modal-talent-profile');
    if (currentPage === 'talents') loadTalentsPage();
  } catch (e) { toast('Erro ao salvar: ' + e.message, 'error'); }
};

// ══════════════════════════════════════════════════════════════════════════════
// FIM DO TALENTS MODULE
// ══════════════════════════════════════════════════════════════════════════════




// ══════════════════════════════════════════════════════════════════════════════
// TEAM SETTINGS PAGE
// ══════════════════════════════════════════════════════════════════════════════

let _banTargetUid = null;

function loadTeamSettingsPage() {
  const team = _myTeams.find(t => t.id === _currentTeamId);
  const cont = document.getElementById('team-settings-content');
  if (!team || !cont) return;

  const myMember = team.members?.find(m => m.uid === currentUser?.uid);
  const myTeamRole = myMember?.role || 'member';
  const isOwner = myTeamRole === 'owner';
  const isAdminOrOwner = ['owner', 'admin'].includes(myTeamRole);

  const roleLabel = { owner: '👑 Dono', admin: '⭐ Admin', member: '👤 Membro' };
  const roleBadgeColor = { owner: 'var(--yellow)', admin: 'var(--a2)', member: 'var(--text3)' };

  const membersHTML = (team.members || []).map(m => {
    const isMe = m.uid === currentUser?.uid;
    const mRole = m.role || 'member';
    const canRemove = isOwner && !isMe;
    const canChangeRole = isOwner && !isMe;
    // Para o usuário logado, usa a foto do currentUserData (sempre atualizada)
    // Para os outros, usa o photoURL que está no objeto membro do time
    const memberPhoto = isMe ? (currentUserData?.photoURL || m.photoURL || '') : (m.photoURL || '');
    const memberName = isMe ? (currentUserData?.name || m.name || m.email || '?') : (m.name || m.email || '?');
    // Vínculo com collab (para exibir na linha, só dono vê)
    const accLinked = isMe ? (currentUserData || {}) : {};
    const linkedCollab = isOwner ? _collabs.find(c => c.id === (m.linkedCollabId || accLinked.linkedCollabId)) : null;
    return `
    <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;transition:all 0.15s;cursor:pointer"
      onclick="openMemberProfile('${m.uid}', event)"
      onmouseover="this.style.borderColor='var(--border2)';this.style.background='var(--card)'"
      onmouseout="this.style.borderColor='var(--border)';this.style.background='var(--bg3)'">
      <div class="user-avatar" style="width:38px;height:38px;font-size:15px;flex-shrink:0;${memberPhoto ? 'background:none;' : ''}">
        ${memberPhoto ? `<img src="${memberPhoto}" class="u-avatar-img">` : memberName[0].toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--font-body);font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
          ${m.name || m.email || 'Membro'} ${isMe ? '<span style="font-size:10px;color:var(--text3);font-weight:400">(você)</span>' : ''}
        </div>
        <div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);margin-top:2px">${m.email || ''}</div>
        ${isOwner ? `<div style="font-family:var(--font-mono);font-size:10px;margin-top:3px;${linkedCollab ? 'color:var(--a3)' : 'color:var(--text3)'}">
          ${linkedCollab ? `🔗 ${linkedCollab.name}` : 'Sem vínculo'}
        </div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0" onclick="event.stopPropagation()">
        ${canChangeRole ? `
        <select onchange="changeTeamMemberRole('${m.uid}', this.value)"
          style="background:var(--bg2);border:1px solid var(--border2);color:var(--text);font-family:var(--font-mono);font-size:10px;padding:4px 8px;border-radius:6px;cursor:pointer">
          <option value="owner" ${mRole === 'owner' ? 'selected' : ''}>👑 Dono</option>
          <option value="admin" ${mRole === 'admin' ? 'selected' : ''}>⭐ Admin</option>
          <option value="member" ${mRole === 'member' ? 'selected' : ''}>👤 Membro</option>
        </select>` : `
        <span style="font-family:var(--font-mono);font-size:10px;letter-spacing:1px;padding:4px 10px;border-radius:6px;border:1px solid ${roleBadgeColor[mRole]};color:${roleBadgeColor[mRole]}">${roleLabel[mRole] || mRole}</span>`}
        ${isOwner ? `<button onclick="openLinkMemberModal('${m.uid}')" class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 10px;color:var(--a3);border-color:rgba(139,92,246,0.3)">${linkedCollab ? '✏️' : '🔗'}</button>` : ''}
        ${canRemove ? `<button onclick="openBanMember('${m.uid}','${(m.name || m.email || 'Membro').replace(/'/g, "\'")}')" class="btn btn-ghost btn-sm" style="color:var(--red);border-color:rgba(239,68,68,0.3);padding:4px 10px;font-size:11px">🚫</button>` : ''}
      </div>
    </div>`;
  }).join('');

  const inviteCode = team.inviteCode || '—';

  cont.innerHTML = `
    <!-- Info da equipe + Perfil Público (merged) -->
    <div class="card" style="padding:22px;margin-bottom:20px;border-color:rgba(255,60,180,0.15)">
      <!-- Top row: avatar + name + edit buttons -->
      <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:14px">
        <div id="ts-team-av-preview" style="width:52px;height:52px;border-radius:12px;background:linear-gradient(135deg,var(--a1),var(--a2));display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0;overflow:hidden">🎵</div>
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--font-body);font-size:18px;font-weight:800;color:var(--text);line-height:1.1">${team.name || 'Equipe'}</div>
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);margin-top:3px">${team.description || 'Sem descrição'}</div>
          <div id="ts-team-genres-preview" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px"></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
          ${isAdminOrOwner ? `<button class="btn btn-ghost btn-sm" onclick="openEditTeamModal()" style="font-size:10px">✏️ Nome</button>` : ''}
          ${isAdminOrOwner ? `<button class="btn btn-primary btn-sm" onclick="openTeamProfileModal()" style="font-size:10px">🌐 Perfil Público</button>` : ''}
        </div>
      </div>
      <!-- Stats row -->
      <div style="display:flex;gap:16px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border);margin-bottom:12px">
        <div class="u-text-center">
          <div style="font-family:var(--font-body);font-size:20px;font-weight:800;color:var(--a2)">${team.members?.length || 0}</div>
          <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3);letter-spacing:2px">MEMBROS</div>
        </div>
        <div class="u-text-center">
          <div style="font-family:var(--font-body);font-size:20px;font-weight:800;color:var(--a3)">${roleLabel[myTeamRole] || myTeamRole}</div>
          <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3);letter-spacing:2px">SEU CARGO</div>
        </div>
        <div id="ts-profile-status-badge" style="display:none;text-align:center">
          <div style="font-family:var(--font-mono);font-size:10px;padding:2px 8px;border-radius:4px;background:rgba(114,239,221,0.1);border:1px solid rgba(114,239,221,0.25);color:var(--green)">✅ Publicado</div>
          <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3);letter-spacing:2px;margin-top:4px">STATUS</div>
        </div>
      </div>
      <!-- Profile summary -->
      <div id="ts-team-profile-summary" style="font-family:var(--font-mono);font-size:11px;color:var(--text3)">Carregando perfil público...</div>
    </div>

    <!-- Código de convite (admin/owner) -->
    ${isAdminOrOwner ? `
    <div class="card" style="padding:18px 22px;margin-bottom:20px;border-color:rgba(61,139,255,0.3)">
      <div style="font-family:var(--font-body);font-size:12px;font-weight:800;letter-spacing:2px;color:var(--a2);margin-bottom:10px">🔗 CÓDIGO DE CONVITE</div>
      <div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);margin-bottom:12px">Compartilhe este código com quem deseja convidar</div>
      <div style="display:flex;gap:8px;align-items:center">
        <div style="flex:1;background:var(--input-bg);border:1px solid var(--border2);border-radius:4px;padding:10px 16px;font-family:var(--font-body);font-size:22px;font-weight:800;letter-spacing:6px;color:var(--a3);text-align:center">${inviteCode}</div>
        <button class="btn btn-secondary btn-sm" onclick="copyTeamInviteCode()">📋 Copiar</button>
      </div>
    </div>` : ''}

    <!-- Lista de membros -->
    <div class="card" style="padding:18px 22px;margin-bottom:20px">
      <div style="font-family:var(--font-body);font-size:12px;font-weight:800;letter-spacing:2px;color:var(--text2);margin-bottom:14px">👥 MEMBROS DA EQUIPE</div>
      ${membersHTML}
    </div>



    <!-- Atividades da equipe -->
    <div class="card" style="padding:18px 22px;margin-bottom:20px">
      <div style="font-family:var(--font-body);font-size:12px;font-weight:800;letter-spacing:2px;color:var(--text2);margin-bottom:14px">📋 HISTÓRICO DE ATIVIDADES</div>
      <div id="activities-timeline-settings"></div>
    </div>

    <!-- Permissões explicadas -->
    <div class="card" style="padding:18px 22px;margin-bottom:20px;border-color:rgba(139,92,246,0.2)">
      <div style="font-family:var(--font-body);font-size:12px;font-weight:800;letter-spacing:2px;color:var(--text2);margin-bottom:14px">📋 NÍVEIS DE PERMISSÃO</div>
      <div style="display:grid;gap:10px">
        <div style="display:flex;gap:12px;align-items:start;padding:10px;background:var(--bg3);border-radius:8px">
          <span style="font-size:18px">👑</span>
          <div><div style="font-family:var(--font-body);font-size:12px;font-weight:700;color:var(--yellow)">Dono</div><div style="font-size:11px;color:var(--text3);margin-top:3px">Acesso total. Pode gerenciar membros, cargos, editar a equipe e deletar projetos.</div></div>
        </div>
        <div style="display:flex;gap:12px;align-items:start;padding:10px;background:var(--bg3);border-radius:8px">
          <span style="font-size:18px">⭐</span>
          <div><div style="font-family:var(--font-body);font-size:12px;font-weight:700;color:var(--a2)">Admin</div><div style="font-size:11px;color:var(--text3);margin-top:3px">Pode criar/editar projetos, gerenciar convites e acessar analytics.</div></div>
        </div>
        <div style="display:flex;gap:12px;align-items:start;padding:10px;background:var(--bg3);border-radius:8px">
          <span style="font-size:18px">👤</span>
          <div><div style="font-family:var(--font-body);font-size:12px;font-weight:700;color:var(--text3)">Membro</div><div style="font-size:11px;color:var(--text3);margin-top:3px">Pode visualizar e editar projetos, mas não gerencia a equipe.</div></div>
        </div>
      </div>
    </div>

    <!-- Zona de perigo -->
    <div class="card" style="padding:18px 22px;border-color:rgba(239,68,68,0.25)">
      <div style="font-family:var(--font-body);font-size:12px;font-weight:800;letter-spacing:2px;color:var(--red);margin-bottom:14px">⚠️ ZONA DE PERIGO</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${!isOwner ? `<button class="btn btn-ghost btn-sm" style="color:var(--red);border-color:rgba(239,68,68,0.3)" onclick="openLeaveTeamModal()">🚪 Sair da Equipe</button>` : ''}
        ${isOwner ? `<button class="btn btn-ghost btn-sm" style="color:var(--red);border-color:rgba(239,68,68,0.3)" onclick="openDeleteTeamModal()">🗑️ Excluir Equipe</button>` : ''}
      </div>
      ${isOwner ? `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);margin-top:10px">Como dono, você não pode sair — apenas excluir a equipe.</div>` : ''}
    </div>
  `;
  // Render activities inside Gerenciamento
  renderActivitiesTimeline('activities-timeline-settings');

  // Load team profile data for merged card
  if (_currentTeamId && window.getDoc && window.doc && window.db) {
    window.getDoc(window.doc(window.db, 'team_profiles', _currentTeamId)).then(snap => {
      if (snap && snap.exists()) {
        const d = snap.data();
        // Update avatar
        const avEl = document.getElementById('ts-team-av-preview');
        if (avEl && d.photo) {
          avEl.innerHTML = `<img src="${d.photo}" class="u-cover-img">`;
        }
        // Update genres chips
        const genresEl = document.getElementById('ts-team-genres-preview');
        if (genresEl) {
          const gs = Array.isArray(d.genres) ? d.genres : (d.categories || []);
          const COLS = ['rgba(255,60,180,0.15)', 'rgba(255,107,61,0.15)', 'rgba(255,200,60,0.15)'];
          const TCOLS = ['var(--a1)', 'var(--a2)', 'var(--a3)'];
          genresEl.innerHTML = gs.slice(0, 4).map((g, i) => `<span style="font-family:var(--font-mono);font-size:9px;padding:2px 7px;border-radius:10px;background:${COLS[i % 3]};color:${TCOLS[i % 3]};border:1px solid currentColor">${escHtml(g)}</span>`).join('');
        }
        // Show published badge
        const badge = document.getElementById('ts-profile-status-badge');
        if (badge) badge.style.display = 'block';
        // Summary: vagas + location + tagline
        const el = document.getElementById('ts-team-profile-summary');
        if (el) {
          const vacs = Object.entries(d.vacancies || {}).filter(([, v]) => v > 0);
          const vacStr = vacs.length ? vacs.map(([k]) => { const r = TEAM_ROLES_VACANCIES.find(x => x.id === k); return r ? r.icon + ' ' + r.label : k; }).slice(0, 3).join(', ') : '';
          const parts = [];
          if (d.tagline) parts.push(`<span style="color:var(--text2)">"${escHtml(d.tagline)}"</span>`);
          if (vacStr) parts.push(`<span style="color:var(--a3)">🔓 ${vacStr}${vacs.length > 3 ? ' +mais' : ''}</span>`);
          if (d.location) parts.push(`<span style="color:var(--text3)">📍 ${escHtml(d.location)}</span>`);
          el.innerHTML = parts.length ? parts.join('<span style="color:var(--border2)"> · </span>') : '<span style="color:var(--text3)">— Perfil publicado sem tagline</span>';
        }
      } else {
        const el = document.getElementById('ts-team-profile-summary');
        if (el && isAdminOrOwner) el.innerHTML = `<span style="color:var(--text3)">⚠️ Perfil público não criado ainda. Clique em <strong style="color:var(--a1);cursor:pointer" onclick="openTeamProfileModal()">Perfil Público</strong> para aparecer nas buscas.</span>`;
      }
    }).catch(() => { });
  }
}

window.openBanMember = function (uid, name) {
  _banTargetUid = uid;
  document.getElementById('ban-member-name').textContent = name;
  openModal('modal-ban-member');
};

window.confirmBanMember = async function () {
  if (!_banTargetUid || !_currentTeamId) return;
  const team = _myTeams.find(t => t.id === _currentTeamId);
  if (!team) return;
  const newMembers = (team.members || []).filter(m => m.uid !== _banTargetUid);
  const newMemberUids = newMembers.map(m => m.uid);
  try {
    await updateDoc(doc(db, 'teams', _currentTeamId), { members: newMembers, memberUids: newMemberUids });
    team.members = newMembers; team.memberUids = newMemberUids;
    toast('✅ Membro removido!');
    closeModal('modal-ban-member');
    loadTeamSettingsPage();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
  _banTargetUid = null;
};

window.changeTeamMemberRole = async function (uid, newRole) {
  const team = _myTeams.find(t => t.id === _currentTeamId);
  if (!team) return;
  const newMembers = (team.members || []).map(m => m.uid === uid ? { ...m, role: newRole } : m);
  try {
    await updateDoc(doc(db, 'teams', _currentTeamId), { members: newMembers });
    team.members = newMembers;
    toast('✅ Cargo atualizado!');
    loadTeamSettingsPage();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

window.openLeaveTeamModal = function () {
  document.getElementById('leave-confirm-check').checked = false;
  openModal('modal-leave-team');
};

// Called from the teams-screen leave button (before entering the team)
window.teamScreenLeave = function (teamId, teamName) {
  if (!currentUser) return;
  const team = _myTeams.find(t => t.id === teamId);
  if (!team) return;
  const myRole = team.members?.find(m => m.uid === currentUser.uid)?.role;
  if (myRole === 'owner') { toast('Donos não podem sair — apenas excluir a equipe.', 'error'); return; }
  // Show confirmation popup
  if (!confirm(`Tem certeza que deseja sair da equipe "${teamName}"?\n\nVocê perderá o acesso e precisará de um novo convite para entrar novamente.`)) return;
  _leaveTeamTarget = teamId;
  confirmLeaveTeamById(teamId);
};

window.confirmLeaveTeamById = async function (teamId) {
  const team = _myTeams.find(t => t.id === teamId);
  if (!team) return;
  const newMembers = (team.members || []).filter(m => m.uid !== currentUser.uid);
  const newMemberUids = newMembers.map(m => m.uid);
  try {
    await updateDoc(doc(db, 'teams', teamId), { members: newMembers, memberUids: newMemberUids });
    _myTeams = _myTeams.filter(t => t.id !== teamId);
    if (_currentTeamId === teamId) {
      _currentTeamId = null; window._currentTeamId = null;
      localStorage.removeItem('last_team_id');
    }
    toast('Você saiu da equipe!');
    renderTeamsList();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

window.confirmLeaveTeam = async function () {
  if (!document.getElementById('leave-confirm-check').checked) {
    toast('Marque a caixinha para confirmar!', 'error');
    return;
  }
  const team = _myTeams.find(t => t.id === _currentTeamId);
  if (!team) return;
  const newMembers = (team.members || []).filter(m => m.uid !== currentUser.uid);
  const newMemberUids = newMembers.map(m => m.uid);
  try {
    await updateDoc(doc(db, 'teams', _currentTeamId), { members: newMembers, memberUids: newMemberUids });
    _myTeams = _myTeams.filter(t => t.id !== _currentTeamId);
    _currentTeamId = null; window._currentTeamId = null;
    localStorage.removeItem('last_team_id');
    toast('Você saiu da equipe!');
    closeModal('modal-leave-team');
    // Volta para tela de equipes
    stopListeners();
    _ready = false;
    document.getElementById('sidebar').style.display = 'none';
    document.querySelector('.main-content').style.display = 'none';
    document.querySelector('.app').style.display = 'none';
    document.getElementById('teams-screen').style.display = 'flex';
    loadMyTeams();
    renderTeamsScreenExtras();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};

window.openDeleteTeamModal = function () {
  if (!confirm('⚠️ ATENÇÃO: Excluir a equipe apagará todos os projetos e dados permanentemente. Esta ação não pode ser desfeita. Digite "EXCLUIR" para confirmar.')) return;
  const input = prompt('Digite EXCLUIR para confirmar:');
  if (input !== 'EXCLUIR') { toast('Confirmação incorreta. Equipe não foi excluída.', 'error'); return; }
  deleteCurrentTeam();
};

async function deleteCurrentTeam() {
  const team = _myTeams.find(t => t.id === _currentTeamId);
  if (!team) return;
  try {
    await deleteDoc(doc(db, 'teams', _currentTeamId));
    _myTeams = _myTeams.filter(t => t.id !== _currentTeamId);
    _currentTeamId = null;
    localStorage.removeItem('last_team_id');
    toast('Equipe excluída.');
    stopListeners();
    _ready = false;
    document.getElementById('sidebar').style.display = 'none';
    document.querySelector('.main-content').style.display = 'none';
    document.querySelector('.app').style.display = 'none';
    document.getElementById('teams-screen').style.display = 'flex';
    loadMyTeams();
    renderTeamsScreenExtras();
  } catch (e) { toast('Erro ao excluir: ' + e.message, 'error'); }
}

window.openEditTeamModal = function () {
  const team = _myTeams.find(t => t.id === _currentTeamId);
  if (!team) return;
  document.getElementById('edit-team-name').value = team.name || '';
  document.getElementById('edit-team-desc').value = team.description || '';
  openModal('modal-edit-team');
};

window.saveTeamEdits = async function () {
  const name = document.getElementById('edit-team-name').value.trim();
  const desc = document.getElementById('edit-team-desc').value.trim();
  if (!name) { toast('Nome não pode ser vazio!', 'error'); return; }
  const team = _myTeams.find(t => t.id === _currentTeamId);
  if (!team) return;
  try {
    await updateDoc(doc(db, 'teams', _currentTeamId), { name, description: desc });
    team.name = name; team.description = desc;
    // Update sidebar team name
    const sub = document.querySelector('.logo-sub');
    if (sub) sub.textContent = name;
    toast('✅ Equipe atualizada!');
    closeModal('modal-edit-team');
    loadTeamSettingsPage();
  } catch (e) { toast('Erro: ' + e.message, 'error'); }
};


// ══════════════════════════════════════════════════════════════════════════════
// LINK MEMBER ↔ COLLAB
// ══════════════════════════════════════════════════════════════════════════════
let _linkTargetUid = null;

window.openLinkMemberModal = async function (uid) {
  const team = _myTeams.find(t => t.id === _currentTeamId);
  const m = (team?.members || []).find(mb => mb.uid === uid);
  if (!m) return;
  _linkTargetUid = uid;

  // Busca dados da conta direto do Firestore (funciona para qualquer membro, não só o logado)
  let accountData = uid === currentUser?.uid ? (currentUserData || {}) : {};
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) accountData = snap.data();
  } catch (e) { console.warn('Erro ao buscar dados do membro:', e); }

  const photo = accountData.photoURL || m.photoURL || '';
  const name = accountData.name || m.name || m.email || 'Membro';

  // Fill member side
  const av = document.getElementById('lm-member-avatar');
  if (photo) { av.innerHTML = `<img src="${escHtml(photo)}" class="u-avatar-img">`; av.style.background = 'none'; }
  else { av.innerHTML = name[0].toUpperCase(); av.style.background = ''; }
  document.getElementById('lm-member-name').textContent = name;
  document.getElementById('lm-member-email').textContent = m.email || '';

  // Fill collab select
  const sel = document.getElementById('lm-collab-select');
  const currentLinked = accountData.linkedCollabId || m.linkedCollabId || '';
  sel.innerHTML = '<option value="">-- Nenhum (remover vínculo) --</option>' +
    _collabs.filter(c => !c.inactive).map(c =>
      `<option value="${c.id}" ${currentLinked === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`
    ).join('');

  openModal('modal-link-member');
};

window.confirmLinkMember = async function () {
  if (!_linkTargetUid) return;
  const collabId = document.getElementById('lm-collab-select').value;
  const isMe = _linkTargetUid === currentUser?.uid;

  try {
    let uData = {};

    if (isMe) {
      // Proprio usuario logado: tem permissao de escrever no seu doc
      uData = currentUserData || {};
      await updateDoc(doc(db, 'users', _linkTargetUid), { linkedCollabId: collabId || null });
      currentUserData = { ...currentUserData, linkedCollabId: collabId || null };
    } else {
      // Outro membro: SEM permissao de escrever no doc dele (regra Firestore)
      // Apenas lê os dados dele (leitura é bloqueada tbm, então usa o que está no membro)
      try {
        const snap = await getDoc(doc(db, 'users', _linkTargetUid));
        if (snap.exists()) uData = snap.data();
      } catch (e) { /* sem acesso ao doc, usa dados do membro */ }
    }

    // Salva linkedCollabId no objeto membro DENTRO DO TIME (dono sempre pode escrever no time)
    const team = _myTeams.find(t => t.id === _currentTeamId);
    if (team) {
      const curMember = (team.members || []).find(m => m.uid === _linkTargetUid) || {};
      const newMembers = (team.members || []).map(m =>
        m.uid === _linkTargetUid
          ? {
            ...m, linkedCollabId: collabId || null,
            photoURL: uData.photoURL || curMember.photoURL || '',
            name: uData.name || curMember.name
          }
          : m
      );
      await updateDoc(doc(db, 'teams', _currentTeamId), { members: newMembers });
      team.members = newMembers;
    }

    toast(collabId ? 'Membro vinculado com sucesso!' : 'Vinculo removido');
    closeModal('modal-link-member');
    loadTeamSettingsPage();
    if (currentPage === 'collaborators') loadCollaborators();
  } catch (e) { toast('Erro ao vincular: ' + e.message, 'error'); }
  _linkTargetUid = null;
};
// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// FIM TEAM SETTINGS
// ══════════════════════════════════════════════════════════════════════════════


// ── Landing page helpers ──────────────────────────────────────────────────────
window.landingScroll = function (id) {
  const el = document.getElementById(id);
  if (!el) return;
  // scroll inside the auth-screen fixed container
  const screen = document.getElementById('auth-screen');
  if (screen) {
    const top = el.offsetTop - 70;
    screen.scrollTo({ top, behavior: 'smooth' });
  } else {
    el.scrollIntoView({ behavior: 'smooth' });
  }
};

let _planPeriod = 'monthly';
window.togglePlanPeriod = function () {
  setPlanPeriod(_planPeriod === 'monthly' ? 'annual' : 'monthly');
};
window.setPlanPeriod = function (period) {
  _planPeriod = period;
  const thumb = document.getElementById('plan-toggle-thumb');
  const labelM = document.getElementById('plan-toggle-label-m');
  const labelA = document.getElementById('plan-toggle-label-a');
  const pricePro = document.getElementById('price-pro');
  const priceProSub = document.getElementById('price-pro-sub');
  const priceAdv = document.getElementById('price-adv');
  const priceAdvSub = document.getElementById('price-adv-sub');

  if (period === 'annual') {
    if (thumb) thumb.style.left = '23px';
    if (labelM) { labelM.style.color = 'var(--text3)'; }
    if (labelA) { labelA.style.color = 'var(--a2)'; }
    if (pricePro) pricePro.textContent = 'R$23';
    if (priceProSub) priceProSub.textContent = 'Cobrado anualmente (R$276/ano)';
    if (priceAdv) priceAdv.textContent = 'R$47';
    if (priceAdvSub) priceAdvSub.textContent = 'Cobrado anualmente (R$564/ano)';
  } else {
    if (thumb) thumb.style.left = '3px';
    if (labelM) { labelM.style.color = 'var(--a2)'; }
    if (labelA) { labelA.style.color = 'var(--text3)'; }
    if (pricePro) pricePro.textContent = 'R$29';
    if (priceProSub) priceProSub.textContent = 'Cobrado mensalmente';
    if (priceAdv) priceAdv.textContent = 'R$59';
    if (priceAdvSub) priceAdvSub.textContent = 'Cobrado mensalmente';
  }
};

// Update nav active state on scroll
(function () {
  function updateNavScroll() {
    const screen = document.getElementById('auth-screen');
    if (!screen || screen.style.display === 'none') return;
    const sections = ['landing-hero', 'landing-features', 'landing-plans', 'landing-contact', 'landing-security'];
    const scrollTop = screen.scrollTop + 80;
    let current = 'landing-hero';
    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.offsetTop <= scrollTop) current = id;
    });
    document.querySelectorAll('.landing-nav-link').forEach((btn, i) => {
      const ids = ['landing-hero', 'landing-features', 'landing-plans', 'landing-contact', 'landing-security'];
      btn.style.color = ids[i] === current ? 'var(--a3)' : 'var(--text2)';
    });
  }
  // Attach after DOM ready
  window.addEventListener('load', () => {
    const screen = document.getElementById('auth-screen');
    if (screen) screen.addEventListener('scroll', updateNavScroll);
  });
})();
// ── End landing page helpers ──────────────────────────────────────────────────

// ── Landing V2 — Freq cursor + visual effects ─────────────────────────────────
(function () {
  function initLandingFX() {
    const authScreen = document.getElementById('auth-screen');
    if (!authScreen) return;

    // ── Freq bars in hero ──
    const barsContainer = document.getElementById('lp-freq-bars-hero');
    if (barsContainer && barsContainer.children.length === 0) {
      for (let i = 0; i < 88; i++) {
        const b = document.createElement('div');
        b.className = 'lp-freq-bar';
        b.style.height = (8 + Math.random() * 88) + 'px';
        b.style.animationDuration = (1.1 + Math.random() * 2.4) + 's';
        b.style.animationDelay = (Math.random() * 2) + 's';
        b.style.opacity = 0.25 + Math.random() * 0.45;
        barsContainer.appendChild(b);
      }
    }

    // ── Cursor (desktop only) ──
    if (window.matchMedia('(pointer: fine)').matches) {
      const dot = document.getElementById('lp-cursor-dot');
      const scope = document.getElementById('lp-cursor-scope');
      if (!dot || !scope) return;

      dot.classList.add('lp-visible');
      scope.classList.add('lp-visible');
      authScreen.classList.add('lp-cursor-active');

      let mx = 0, my = 0, rx = 0, ry = 0;

      document.addEventListener('mousemove', e => {
        mx = e.clientX; my = e.clientY;
        dot.style.left = mx + 'px';
        dot.style.top = my + 'px';
      });

      // Ring lags behind with lerp
      (function animRing() {
        rx += (mx - rx) * 0.12;
        ry += (my - ry) * 0.12;
        scope.style.left = rx + 'px';
        scope.style.top = ry + 'px';
        requestAnimationFrame(animRing);
      })();

      // Hover state
      authScreen.addEventListener('mouseover', e => {
        if (e.target.closest('button, a, [onclick]')) {
          dot.classList.add('lp-big');
          scope.classList.add('lp-active');
        }
      });
      authScreen.addEventListener('mouseout', e => {
        if (e.target.closest('button, a, [onclick]')) {
          dot.classList.remove('lp-big');
          scope.classList.remove('lp-active');
        }
      });
    }

    // ── Scroll reveal ──
    const revealObs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('lp-visible'); });
    }, { threshold: 0.08, root: authScreen });

    authScreen.querySelectorAll('.lp-reveal').forEach(el => revealObs.observe(el));
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLandingFX);
  } else {
    initLandingFX();
  }
  // Also retry after module load (firebase may delay render)
  window.addEventListener('load', initLandingFX);
})();
// ── End Landing V2 FX ────────────────────────────────────────────────────────

// ── Landing page auth panel ───────────────────────────────────────────────────
window.showAuthPanel = function (tab) {
  const panel = document.getElementById('auth-panel');
  const overlay = document.getElementById('auth-panel-overlay');
  if (!panel) return;
  panel.style.display = 'block';
  overlay.style.display = 'block';
  setTimeout(() => { panel.style.transform = 'translateX(0)'; }, 10);
  switchAuthTab(tab || 'login');
  const titleEl = document.getElementById('auth-panel-title');
  const subEl = document.getElementById('auth-panel-sub');
  if (titleEl) titleEl.textContent = tab === 'register' ? 'Criar conta' : 'Entrar';
  if (subEl) subEl.textContent = tab === 'register' ? 'É grátis para sempre!' : 'Bem-vindo de volta!';
};
window.hideAuthPanel = function () {
  const panel = document.getElementById('auth-panel');
  const overlay = document.getElementById('auth-panel-overlay');
  if (!panel) return;
  panel.style.transform = 'translateX(100%)';
  setTimeout(() => {
    panel.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
  }, 300);
};


// ═══════════════════════════════════════════════════════════════════════════════
// NOVAS FUNCIONALIDADES - FREQsys MELHORADO
// ═══════════════════════════════════════════════════════════════════════════════

// A implementação do loading global foi unificada e movida para o topo (Linha 897)

// ── currentUser exposed via getter for Match System v2 ──────────────────────
Object.defineProperty(window, '_matchGetUser', {
  get: function () { return typeof currentUser !== 'undefined' ? currentUser : null; },
  configurable: true
});

// ─── AVATAR COM FALLBACK ───────────────────────────────────────────────────────
window.getAvatarHTML = function (photoURL, name, size = 40) {
  const initial = name ? name[0].toUpperCase() : '?';
  const bgColors = ['#ff3cb4', '#72efdd', '#f5c842', '#ff6b8a', '#00c96d', '#f05ab0'];
  const colorIndex = name ? name.charCodeAt(0) % bgColors.length : 0;
  const bg = bgColors[colorIndex];

  if (photoURL) {
    return `
      <div style="position:relative;width:${size}px;height:${size}px">
        <img src="${escHtml(photoURL)}" 
             style="width:100%;height:100%;border-radius:50%;object-fit:cover"
             onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div style="display:none;width:100%;height:100%;border-radius:50%;
                    background:${bg};color:white;font-weight:700;font-size:${size * 0.4}px;
                    align-items:center;justify-content:center;position:absolute;top:0;left:0">
          ${initial}
        </div>
      </div>
    `;
  }
  return `
    <div style="width:${size}px;height:${size}px;border-radius:50%;
                background:${bg};color:white;font-weight:700;font-size:${size * 0.4}px;
                display:flex;align-items:center;justify-content:center">
      ${initial}
    </div>
  `;
};

// ─── HELPER: TEMPO RELATIVO ────────────────────────────────────────────────────
function formatRelativeTime(date) {
  if (!date) return '';
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'agora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d atrás`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA DE NOTIFICAÇÕES EM TEMPO REAL
// ═══════════════════════════════════════════════════════════════════════════════

async function initNotifications() {
  // P2-A: Migrado de teams/{teamId}/notifications para user_notifications/{uid}/notifs
  // Listener global — não depende de _currentTeamId. Iniciado no onAuthStateChanged.
  if (!currentUser) return;

  if (_unsubNotifications) _unsubNotifications();

  const notifRef = collection(db, 'user_notifications', currentUser.uid, 'notifs');
  const q = query(notifRef, orderBy('createdAt', 'desc'), limit(50));

  _unsubNotifications = onSnapshot(q, (snapshot) => {
    _notifications = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    updateNotificationBadge();
    if (currentPage === 'notifications') renderNotifications();
  }, err => {
    // Suprime erros de permissão silenciosamente (ex: logout em andamento)
    if (err.code !== 'permission-denied') console.warn('initNotifications:', err.code);
  });
}

function updateNotificationBadge() {
  // P2-A: user_notifications/{uid} contém apenas notifs do próprio usuário — sem filtro por userId
  const unreadCount = _notifications.filter(n => !n.read).length;

  const badge = document.getElementById('notif-badge');
  if (badge) {
    badge.textContent = unreadCount > 0 ? unreadCount : '';
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';
  }
}

async function createNotification(type, title, message, metadata = {}) {
  // P2-A: Escreve em user_notifications/{uid}/notifs para cada membro da equipe,
  // exceto o próprio autor (quem criou a ação não precisa ser notificado).
  // Isso cumpre a Regra 10: notificações globais por conta, não por equipe.
  if (!currentUser) return;

  const notif = {
    type,
    title,
    message,
    metadata: { ...metadata, teamId: _currentTeamId || null },
    senderUid: currentUser.uid,
    senderName: currentUserData?.name || currentUser.email,
    senderPhoto: currentUserData?.photoURL || '',
    createdAt: serverTimestamp(),
    read: false,
  };

  try {
    // Notifica todos os membros da equipe atual, exceto o autor
    const team = _myTeams?.find(t => t.id === _currentTeamId);
    const recipients = (team?.memberUids || []).filter(uid => uid !== currentUser.uid);

    if (recipients.length === 0) return; // Equipe com 1 membro — sem notificação necessária

    // Firestore não tem batch para addDoc — usa Promise.all com limite suave
    await Promise.all(recipients.map(uid =>
      addDoc(collection(db, 'user_notifications', uid, 'notifs'), notif).catch(() => { })
    ));
  } catch (e) {
    console.warn('createNotification error:', e.message);
  }
}

async function markNotificationAsRead(notifId) {
  // P2-A: path migrado para user_notifications/{uid}/notifs
  try {
    await updateDoc(
      doc(db, 'user_notifications', currentUser.uid, 'notifs', notifId),
      { read: true }
    );
  } catch (e) {
    console.warn('markNotificationAsRead:', e.message);
  }
}

async function markAllNotificationsAsRead() {
  showLoading('Marcando notificações...');

  try {
    // P2-A: user_notifications/{uid} contém apenas notifs do próprio usuário
    const unread = _notifications.filter(n => !n.read);
    const batch = writeBatch(db);

    // P2-A: path migrado para user_notifications/{uid}/notifs
    unread.forEach(n => {
      const docRef = doc(db, 'user_notifications', currentUser.uid, 'notifs', n.id);
      batch.update(docRef, { read: true });
    });

    await batch.commit();
    hideLoading();
    toast('✅ Todas as notificações marcadas como lidas');
  } catch (e) {
    hideLoading();
    toast('Erro: ' + e.message, 'error');
  }
}

function handleNotificationClick(notifId, metadata) {
  markNotificationAsRead(notifId);

  if (metadata.projectId) {
    renderDetail(metadata.projectId);
  }
}

function renderNotifications() {
  const container = document.getElementById('notifications-list');
  if (!container) return;

  if (_notifications.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:60px 20px;color:var(--text3)">
        <div style="font-size:64px;margin-bottom:16px;animation:float 3s ease-in-out infinite">🔔</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px;color:var(--text)">
          Nenhuma notificação ainda
        </div>
        <div class="u-fs12-muted">
          Você será notificado sobre atividades da equipe
        </div>
      </div>
      <style>
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
      </style>
    `;
    return;
  }

  const unreadCount = _notifications.filter(n => !n.read).length; // P2-A

  container.innerHTML = `
    <div style="padding:16px;border-bottom:1px solid var(--border);display:flex;
                justify-content:space-between;align-items:center;background:var(--bg2)">
      <div style="font-size:15px;font-weight:700;color:var(--text)">
        Notificações ${unreadCount > 0 ? `<span style="color:var(--a2)">(${unreadCount} novas)</span>` : ''}
      </div>
      ${unreadCount > 0 ? `
        <button onclick="markAllNotificationsAsRead()" 
                style="background:transparent;border:1px solid var(--border2);
                       color:var(--a2);padding:6px 12px;border-radius:6px;
                       font-size:11px;cursor:pointer;font-weight:600;
                       transition:all 0.2s"
                onmouseover="this.style.background='var(--a1)';this.style.color='white'"
                onmouseout="this.style.background='transparent';this.style.color='var(--a2)'">
          MARCAR TODAS COMO LIDAS
        </button>
      ` : ''}
    </div>
    <div style="max-height:calc(100vh - 200px);overflow-y:auto">
      ${_notifications.map(n => renderNotificationItem(n)).join('')}
    </div>
  `;
}

function renderNotificationItem(n) {
  const isUnread = !n.read; // P2-A: user_notifications são sempre do próprio usuário
  const icons = {
    comment: '💬',
    task: '✅',
    project: '🎵',
    member: '👤',
    file: '📎',
    activity: '📋'
  };

  const metadataStr = JSON.stringify(n.metadata || {}).replace(/'/g, "\\'").replace(/"/g, '&quot;');

  return `
    <div class="notif-item ${isUnread ? 'unread' : ''}" 
         onclick='handleNotificationClick("${n.id}", JSON.parse("${metadataStr}"))'
         style="padding:14px 16px;border-bottom:1px solid var(--border);cursor:pointer;
                background:${isUnread ? 'rgba(157,127,255,0.05)' : 'transparent'};
                transition:all 0.2s"
         onmouseover="this.style.background='rgba(157,127,255,0.1)'"
         onmouseout="this.style.background='${isUnread ? 'rgba(157,127,255,0.05)' : 'transparent'}'">
      <div style="display:flex;gap:12px;align-items:start">
        <div style="font-size:24px;flex-shrink:0">${icons[n.type] || '📢'}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:var(--text);margin-bottom:4px;
                      font-size:13px">${escHtml(n.title)}</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:6px">
            ${escHtml(n.message)}
          </div>
          <div style="font-size:11px;color:var(--text3);display:flex;
                      align-items:center;gap:6px">
            <span>${escHtml(n.userName)}</span>
            <span>•</span>
            <span>${formatRelativeTime(n.createdAt?.toDate())}</span>
          </div>
        </div>
        ${isUnread ? `
          <div style="width:8px;height:8px;border-radius:50%;
                      background:var(--a2);flex-shrink:0;margin-top:6px;
                      box-shadow:0 0 8px var(--a2)"></div>
        ` : ''}
      </div>
    </div>
  `;
}

window.loadNotificationsPage = function () {
  currentPage = 'notifications';
  // Hide the .app and show a dynamic page overlay inside .main-content
  document.querySelector('.app').style.display = 'none';
  let overlay = document.getElementById('dynamic-page-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'dynamic-page-overlay';
    overlay.style.cssText = 'padding:32px 40px;min-height:100vh';
    document.querySelector('.main-content').appendChild(overlay);
  }
  overlay.style.display = 'block';
  overlay.innerHTML = `
    <div class="page-container">
      <div id="notifications-list"></div>
    </div>
  `;
  renderNotifications();
};

// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA DE COMENTÁRIOS
// ═══════════════════════════════════════════════════════════════════════════════

let _currentProjectIdForComments = null;

async function initComments(projectId) {
  _currentProjectIdForComments = projectId;

  if (_unsubComments) _unsubComments();

  const commentsRef = collection(db, 'teams', _currentTeamId, 'projects', projectId, 'comments');
  const q = query(commentsRef, orderBy('createdAt', 'asc'));

  _unsubComments = onSnapshot(q, (snapshot) => {
    _comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderComments();
  }, err => { console.warn('Comments listener:', err.code); });
}
window.initComments = initComments;

async function addComment(projectId, text) {
  if (!text.trim()) {
    toast('Comentário não pode ser vazio', 'error');
    return;
  }

  try {
    const comment = {
      text: text.trim(),
      userId: currentUser.uid,
      userName: currentUserData?.name || currentUser.email,
      userPhoto: currentUserData?.photoURL || '',
      createdAt: serverTimestamp(),
      edited: false
    };

    await addDoc(
      collection(db, 'teams', _currentTeamId, 'projects', projectId, 'comments'),
      comment
    );

    const project = getProject(projectId);
    await createNotification(
      'comment',
      'Novo comentário',
      `Comentário em "${project?.title}"`,
      { projectId }
    );

    await logActivity(
      'comment-added',
      `comentou em "${project?.title}"`,
      { projectId }
    );

    const input = document.getElementById('comment-input');
    if (input) input.value = '';

    toast('✅ Comentário enviado!');

  } catch (e) {
    toast('Erro ao enviar: ' + e.message, 'error');
  }
}
window.addComment = addComment;

async function deleteComment(commentId) {
  if (!confirm('Deletar este comentário?')) return;

  try {
    await deleteDoc(
      doc(db, 'teams', _currentTeamId, 'projects',
        _currentProjectIdForComments, 'comments', commentId)
    );
    toast('Comentário removido');
  } catch (e) {
    toast('Erro ao deletar: ' + e.message, 'error');
  }
}
window.deleteComment = deleteComment;

function renderComments() {
  const container = document.getElementById('comments-container');
  if (!container) return;

  if (_comments.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:30px 20px;color:var(--text3)">
        <div style="font-size:48px;margin-bottom:12px">💬</div>
        <div style="font-size:14px">Nenhum comentário ainda</div>
        <div style="font-size:12px;margin-top:6px">
          Seja o primeiro a comentar!
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = _comments.map(c => {
    const isOwner = c.userId === currentUser.uid;

    return `
      <div class="comment-item" style="display:flex;gap:12px;margin-bottom:16px;
                                       padding-bottom:16px;border-bottom:1px solid var(--border)">
        ${getAvatarHTML(c.userPhoto, c.userName, 36)}
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;
                      flex-wrap:wrap">
            <span style="font-weight:600;font-size:13px;color:var(--text)">
              ${escHtml(c.userName)}
            </span>
            <span style="font-size:11px;color:var(--text3)">
              ${formatRelativeTime(c.createdAt?.toDate())}
            </span>
            ${c.edited ? `
              <span style="font-size:10px;color:var(--text3);font-style:italic">
                (editado)
              </span>
            ` : ''}
            ${isOwner ? `
              <button onclick="deleteComment('${c.id}')"
                      style="margin-left:auto;background:transparent;
                             border:none;color:var(--red);cursor:pointer;
                             font-size:18px;padding:0;line-height:1">
                🗑️
              </button>
            ` : ''}
          </div>
          <div style="background:var(--card);border:1px solid var(--border);
                      border-radius:10px;padding:10px 14px;color:var(--text);
                      font-size:13px;line-height:1.6;white-space:pre-wrap">
            ${escHtml(c.text)}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// HISTÓRICO DE ATIVIDADES
// ═══════════════════════════════════════════════════════════════════════════════

async function logActivity(type, description, metadata = {}) {
  if (!_currentTeamId) return;

  try {
    const activity = {
      type,
      description,
      metadata,
      userId: currentUser.uid,
      userName: currentUserData?.name || currentUser.email,
      userPhoto: currentUserData?.photoURL || '',
      timestamp: serverTimestamp()
    };

    await addDoc(collection(db, 'teams', _currentTeamId, 'activities'), activity);
  } catch (e) {
    console.error('Erro ao logar atividade:', e);
  }
}

async function loadActivities(maxItems = 50) {
  const activitiesRef = collection(db, 'teams', _currentTeamId, 'activities');
  const q = query(activitiesRef, orderBy('timestamp', 'desc'), limit(maxItems));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

function renderActivitiesTimeline(containerId = 'activities-timeline') {
  loadActivities().then(activities => {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (activities.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:var(--text3)">
          <div style="font-size:48px;margin-bottom:12px">📋</div>
          <div>Nenhuma atividade ainda</div>
        </div>
      `;
      return;
    }

    const icons = {
      'project-created': '🎵',
      'project-completed': '✅',
      'task-completed': '✅',
      'member-added': '👤',
      'member-removed': '👤',
      'file-uploaded': '📎',
      'comment-added': '💬',
      'phase-changed': '🔄'
    };

    container.innerHTML = activities.map(a => `
      <div style="display:flex;gap:14px;padding:14px 0;border-bottom:1px solid var(--border)">
        <div style="font-size:24px;flex-shrink:0">${icons[a.type] || '📌'}</div>
        <div style="flex:1;min-width:0">
          <div style="color:var(--text);font-size:13px;margin-bottom:6px">
            <span style="font-weight:600">${escHtml(a.userName)}</span>
            <span style="color:var(--text2)"> ${escHtml(a.description)}</span>
          </div>
          <div style="font-size:11px;color:var(--text3)">
            ${formatRelativeTime(a.timestamp?.toDate())}
          </div>
        </div>
      </div>
    `).join('');
  });
}

window.loadActivitiesPage = function () {
  currentPage = 'activities';
  document.querySelector('.app').style.display = 'none';
  let overlay = document.getElementById('dynamic-page-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'dynamic-page-overlay';
    overlay.style.cssText = 'padding:32px 40px;min-height:100vh';
    document.querySelector('.main-content').appendChild(overlay);
  }
  overlay.style.display = 'block';
  overlay.innerHTML = `
    <div class="page-container">
      <div class="page-header" style="margin-bottom:24px">
        <h1 style="font-size:28px;font-weight:700;color:var(--text)">
          📋 Histórico de Atividades
        </h1>
        <p style="color:var(--text2);font-size:14px;margin-top:6px">
          Todas as ações da equipe em ordem cronológica
        </p>
      </div>
      <div id="activities-timeline"></div>
    </div>
  `;
  renderActivitiesTimeline();
};


// ═══════════════════════════════════════════════════════════════════════════════
// SISTEMA DE PERFIL DE EQUIPE + MATCH HUB
// ═══════════════════════════════════════════════════════════════════════════════

const TEAM_ROLES_VACANCIES = [
  { id: 'r_vocal', label: 'Vocais', icon: '🎤' },
  { id: 'r_beat', label: 'Beat', icon: '🥁' },
  { id: 'r_mix', label: 'Mix & Master', icon: '🎚️' },
  { id: 'r_letra', label: 'Letra', icon: '✍️' },
  { id: 'r_edit', label: 'Edição', icon: '🎬' },
  { id: 'r_ilus', label: 'Ilustração', icon: '🖼️' },
  { id: 'r_thumb', label: 'Thumbnail', icon: '🎨' },
  { id: 'r_ideal', label: 'Idealização', icon: '💡' },
  { id: 'r_capa', label: 'Capa/Arte', icon: '💿' },
  { id: 'r_leg', label: 'Legendas', icon: '💬' },
];

// ┌───────────────────────────────────────────────────────────────────
// ┌───────────────────────────────────────────────────────────────────
// │  MOCK DATA - DELETE THIS BLOCK when real users exist       │
// │  To disable without deleting: set window.USE_MOCK_DATA = false │
// └───────────────────────────────────────────────────────────────────
// NOTE: uses window.* so the spotlight script (non-module) can access them
window.USE_MOCK_DATA = true; // <-- SET TO false TO USE ONLY REAL DATA

window.MOCK_TALENT_PROFILES = [
  { id: 'mock_t1', uid: 'mock_t1', name: 'Ana Voz', title: 'Vocalista & Compositora', bio: 'Voz potente com influ\u00eancias de soul, R&B e MPB. Participei de 12 \u00e1lbuns independentes. Dispon\u00edvel para grava\u00e7\u00f5es, shows e colabora\u00e7\u00f5es remotas.', location: 'S\u00e3o Paulo, SP', availability: 'open', photo: '', skills: { r_vocal: 'advanced', r_letra: 'inter' }, links: { instagram: '@anavoz', spotify: 'anavoz' }, categories: ['M\u00fasica', 'R&B'], tools: ['Pro Tools', 'Ableton'], portfolio: [{ url: 'https://youtube.com', title: 'EP - Noite Funda' }], stats: { projects: '14', views: '320K', followers: '8.2K' }, isPublic: true },
  { id: 'mock_t2', uid: 'mock_t2', name: 'Rodrigo Beats', title: 'Produtor Musical & Beatmaker', bio: 'Produtor trap, phonk e drill com mais de 200 beats vendidos. Equipamento profissional, mixagem inclu\u00edda. Entrega em at\u00e9 48h.', location: 'Recife, PE', availability: 'open', photo: '', skills: { r_beat: 'advanced', r_mix: 'inter' }, links: { instagram: '@rodbeats', youtube: 'RodBeats' }, categories: ['Trap', 'Phonk'], tools: ['FL Studio', 'Serum'], portfolio: [{ url: 'https://youtube.com', title: 'Type Beat Pack Vol.3' }], stats: { projects: '200', views: '1.1M', followers: '22K' }, isPublic: true },
  { id: 'mock_t3', uid: 'mock_t3', name: 'Karina Edit', title: 'Editora de V\u00eddeo & Motion', bio: 'Especialista em edi\u00e7\u00e3o r\u00edtmica para clipes, reels e YouTube. Corre\u00e7\u00e3o de cor, motion graphics e corte din\u00e2mico. Portfolio com v\u00eddeos acima de 1M de views.', location: 'Belo Horizonte, MG', availability: 'open', photo: '', skills: { r_edit: 'advanced', r_thumb: 'advanced' }, links: { instagram: '@karinaedit', youtube: 'KarinaEdit' }, categories: ['YouTube', 'Reels'], tools: ['Premiere', 'After Effects'], portfolio: [{ url: 'https://youtube.com', title: 'Clipe Neon City 2.3M views' }], stats: { projects: '67', views: '18M', followers: '14K' }, isPublic: true },
  { id: 'mock_t4', uid: 'mock_t4', name: 'Pedro Letra', title: 'Letrista & Roteirista', bio: 'Escrevo letras em portugu\u00eas e ingl\u00eas para todos os g\u00eaneros. Rima interna, m\u00e9trica, conceito art\u00edstico e storytelling. Mais de 40 m\u00fasicas lan\u00e7adas.', location: 'Rio de Janeiro, RJ', availability: 'open', photo: '', skills: { r_letra: 'advanced', r_ideal: 'inter' }, links: { instagram: '@pedroletra' }, categories: ['Pop', 'Funk'], tools: ['Google Docs'], portfolio: [], stats: { projects: '40', views: '5.4M', followers: '3.1K' }, isPublic: true },
  { id: 'mock_t5', uid: 'mock_t5', name: 'Tha\u00eds Mix', title: 'Mix & Master Engineer', bio: 'Mixagem e masteriza\u00e7\u00e3o profissional. Trabalho com artistas indie e selos independentes.', location: 'Curitiba, PR', availability: 'busy', photo: '', skills: { r_mix: 'advanced' }, links: { instagram: '@thaismix' }, categories: ['Todos os g\u00eaneros'], tools: ['Logic Pro', 'Waves'], portfolio: [], stats: { projects: '89', views: '-', followers: '5.7K' }, isPublic: true },
  { id: 'mock_t6', uid: 'mock_t6', name: 'Felipe Arte', title: 'Ilustrador & Designer Gr\u00e1fico', bio: 'Cria\u00e7\u00e3o de capas, artes para redes sociais e identidade visual de artistas. Estilo cyberpunk e retrofuturista.', location: 'Fortaleza, CE', availability: 'open', photo: '', skills: { r_ilus: 'advanced', r_thumb: 'advanced' }, links: { instagram: '@felipearte' }, categories: ['Design'], tools: ['Illustrator', 'Procreate'], portfolio: [], stats: { projects: '130', views: '-', followers: '19K' }, isPublic: true },
  { id: 'mock_t7', uid: 'mock_t7', name: 'Lucas Social', title: 'Gestor de Social Media', bio: 'Estrat\u00e9gia e gest\u00e3o de perfis no Instagram, TikTok e YouTube. Crescimento org\u00e2nico alinhado ao artista.', location: 'Salvador, BA', availability: 'open', photo: '', skills: { r_ideal: 'inter', r_thumb: 'basic' }, links: { instagram: '@lucassocial' }, categories: ['Marketing'], tools: ['Canva', 'CapCut'], portfolio: [], stats: { projects: '28', views: '-', followers: '2.3K' }, isPublic: true },
  { id: 'mock_t8', uid: 'mock_t8', name: 'Bruna Vocal', title: 'Backing Vocal & Coral', bio: 'Coro, backing vocal e arranjos vocais para grava\u00e7\u00f5es em est\u00fadio e ao vivo. Experi\u00eancia gospel e pop.', location: 'S\u00e3o Paulo, SP', availability: 'open', photo: '', skills: { r_vocal: 'inter', r_letra: 'basic' }, links: { instagram: '@brunavocal' }, categories: ['Gospel', 'Pop'], tools: ['Pro Tools'], portfolio: [], stats: { projects: '31', views: '-', followers: '1.8K' }, isPublic: true },
];

window.MOCK_TEAM_PROFILES = [
  { id: 'mock_team1', name: 'FreqBand', tagline: 'Pop eletr\u00f4nico com alma brasileira', bio: 'Grupo de criadores independentes fazendo pop eletr\u00f4nico com refer\u00eancias do funk, R&B e MPB. J\u00e1 lan\u00e7amos 3 EPs com mais de 5M de streams.', location: 'S\u00e3o Paulo, SP', stage: 'growing', photo: '', banner: '', categories: ['Pop', 'Eletr\u00f4nico'], tools: ['Ableton', 'Premiere'], links: { youtube: 'FreqBand', instagram: '@freqband', spotify: 'freqband' }, stats: { projects: '3 EPs', views: '5M+', followers: '12K' }, vacancies: { r_edit: 2, r_thumb: 1, r_vocal: 1 }, portfolio: [], isPublic: true, isNew: false, remote: true },
  { id: 'mock_team2', name: 'Nebula Crew', tagline: 'Trap & drill experimental', bio: 'Coletivo de produtores e MCs do underground brasileiro. Som pesado, letras densas, visual dist\u00f3pico.', location: 'Rio de Janeiro, RJ', stage: 'active', photo: '', banner: '', categories: ['Trap', 'Drill'], tools: ['FL Studio'], links: { instagram: '@nebulacrew', youtube: 'NebulaCrew' }, stats: { projects: '7 mixtapes', views: '2.8M', followers: '34K' }, vacancies: { r_mix: 1, r_letra: 2, r_ilus: 1 }, portfolio: [], isPublic: true, isNew: false, remote: true },
  { id: 'mock_team3', name: 'Vibe Est\u00fadio', tagline: 'Cria\u00e7\u00e3o audiovisual para artistas', bio: 'Ag\u00eancia criativa especializada em produ\u00e7\u00e3o visual para m\u00fasicos. Clipes, lyric videos, capas e identidade visual.', location: 'Belo Horizonte, MG', stage: 'growing', photo: '', banner: '', categories: ['YouTube', 'Videoclipe'], tools: ['Premiere', 'After Effects'], links: { instagram: '@vibeestudio', youtube: 'VibeEstudio' }, stats: { projects: '45 v\u00eddeos', views: '12M', followers: '8.7K' }, vacancies: { r_edit: 1, r_ilus: 2, r_thumb: 2 }, portfolio: [], isPublic: true, isNew: false, remote: false },
  { id: 'mock_team4', name: 'SomNovo', tagline: 'MPB contempor\u00e2nea com produ\u00e7\u00e3o autoral', bio: 'Trio musical buscando fechar lineup para turn\u00ea e novo \u00e1lbum. Influ\u00eancias de Djavan, Milton e Radiohead.', location: 'Porto Alegre, RS', stage: 'established', photo: '', banner: '', categories: ['MPB', 'Indie'], tools: ['Pro Tools', 'Ableton'], links: { spotify: 'somnovo', instagram: '@somnovo' }, stats: { projects: '2 \u00e1lbuns', views: '1.1M', followers: '6.3K' }, vacancies: { r_vocal: 1, r_beat: 1 }, portfolio: [], isPublic: true, isNew: false, remote: false },
  { id: 'mock_team5', name: 'Hypercore', tagline: 'EDM e hyperpop futurista', bio: 'Produtores de EDM buscando vocalistas e letristas para novo projeto. Som inspirado em hyperpop europeu. Remoto.', location: 'Curitiba, PR', stage: 'starting', photo: '', banner: '', categories: ['EDM', 'Hyperpop'], tools: ['Ableton', 'Serum'], links: { instagram: '@hypercoremusic' }, stats: { projects: '1 EP', views: '450K', followers: '4.1K' }, vacancies: { r_vocal: 2, r_letra: 1, r_thumb: 1 }, portfolio: [], isPublic: true, isNew: true, remote: true },
  { id: 'mock_team6', name: 'RawCut Films', tagline: 'Videoclipes criativos e documentais musicais', bio: 'Produtora audiovisual para artistas musicais. Est\u00e9tica cinematogr\u00e1fica. Buscamos editores s\u00eanior.', location: 'S\u00e3o Paulo, SP', stage: 'active', photo: '', banner: '', categories: ['Videoclipe'], tools: ['DaVinci Resolve', 'Premiere'], links: { instagram: '@rawcutfilms', youtube: 'RawCutFilms' }, stats: { projects: '60 projetos', views: '22M', followers: '18K' }, vacancies: { r_edit: 2, r_mix: 1 }, portfolio: [], isPublic: true, isNew: false, remote: false },
];
// END MOCK DATA BLOCK


let _teamProfile = null;
window._teamProfile = null; // exposed for non-module scripts
let _hubAllTalents = [];
let _hubFiltered = [];
let _hubSwipeIndex = 0;
let _hubTeamLikes = {}; // {talentUid: true}
let _currentHubTab = 'search';
let _teamProfilePhotoBase64 = '';

// ── Renderiza o grid de vagas no modal de perfil de equipe ─────────────────────
function renderVacanciesGrid() {
  const grid = document.getElementById('tp-team-vacancies-grid');
  if (!grid) return;
  grid.innerHTML = TEAM_ROLES_VACANCIES.map(r => `
    <div style="display:flex;align-items:center;gap:8px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:8px 10px">
      <span style="font-size:16px">${r.icon}</span>
      <span style="flex:1;font-size:12px;font-family:var(--font-body);font-weight:600">${r.label}</span>
      <input type="number" id="vac-${r.id}" min="0" max="10" value="0"
        style="width:48px;background:var(--input-bg);border:1px solid var(--border2);color:var(--text);
               padding:4px 8px;border-radius:6px;font-family:var(--font-mono);font-size:12px;text-align:center">
    </div>
  `).join('');
}

// ── Foto ─────────────────────────────────────────────────────────────────────
window.handleTeamProfilePhoto = function (input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    _teamProfilePhotoBase64 = e.target.result;
    document.getElementById('tp-team-photo-icon').style.display = 'none';
    const img = document.getElementById('tp-team-photo-img');
    img.src = e.target.result; img.style.display = 'block';
  };
  reader.readAsDataURL(file);
};

// ── Abrir hub (verifica se equipe tem perfil) ─────────────────────────────────
window.openTeamProfileHub = async function () {
  if (!_currentTeamId) { toast('Entre em uma equipe primeiro', 'error'); return; }

  // Abre a tela standalone de talentos no MODO EQUIPE (equipe busca artistas)
  window._talentStandaloneForceArtistMode = false; // garante modo equipe
  window._talentStandaloneFromTeamsScreen = false; // VOLTAR vai pra página de membros

  const ts = document.getElementById('teams-screen');
  if (ts) ts.style.display = 'none';

  const screen = document.getElementById('talent-standalone-screen');
  if (screen) screen.classList.add('open');

  const matchHeader = document.querySelector('#page-talents .match-header');
  if (matchHeader) matchHeader.style.display = 'none';

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-talents');
  if (page) page.classList.add('active');

  if (typeof window.loadTalentsPage === 'function') {
    window.loadTalentsPage();
  }
};

// ── Abrir modal de criar/editar perfil ─────────────────────────────────────────
// Sempre busca dados frescos do Firestore antes de popular o form,
// independente do estado de _teamProfile em memória.
window.openTeamProfileModal = async function () {
  if (!_currentTeamId) { toast('Entre em uma equipe primeiro', 'error'); return; }

  // Busca dados frescos do Firestore
  showLoading('Carregando perfil...');
  try {
    const snap = await getDoc(doc(db, 'team_profiles', _currentTeamId));
    _teamProfile = snap.exists() ? snap.data() : null;
    window._teamProfile = _teamProfile;
  } catch (e) {
    console.warn('[openTeamProfileModal] Erro ao buscar perfil:', e.message);
    // Mantém _teamProfile em memória se já existir
  }
  hideLoading();

  renderVacanciesGrid();
  // reset tp state
  window._tpCategories = [];
  window._tpTools = [];
  window._tpPortfolio = [];
  window._tpBannerBase64 = '';
  _teamProfilePhotoBase64 = '';

  // Reset visual do form
  const photoIcon = document.getElementById('tp-team-photo-icon');
  const photoImg = document.getElementById('tp-team-photo-img');
  const bannerImg = document.getElementById('tp-banner-img');
  if (photoIcon) photoIcon.style.display = '';
  if (photoImg) { photoImg.src = ''; photoImg.style.display = 'none'; }
  if (bannerImg) { bannerImg.src = ''; bannerImg.style.display = 'none'; }

  if (_teamProfile) {
    const d = _teamProfile;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('tp-team-name', d.name);
    set('tp-team-tagline', d.tagline);
    set('tp-team-bio', d.bio);
    set('tp-team-story', d.story);
    set('tp-team-location', d.location);
    set('tp-team-stage', d.stage);
    set('tp-team-youtube', d.links?.youtube);
    set('tp-team-spotify', d.links?.spotify);
    set('tp-team-instagram', d.links?.instagram);
    set('tp-team-tiktok', d.links?.tiktok);
    set('tp-team-discord', d.links?.discord);
    set('tp-team-site', d.links?.site);
    set('tp-stat-projects', d.stats?.projects);
    set('tp-stat-views', d.stats?.views);
    set('tp-stat-followers', d.stats?.followers);
    set('tp-team-genres', Array.isArray(d.genres) ? d.genres.join(', ') : (d.genres || ''));
    set('tp-team-year', d.foundedYear || d.year || '');
    set('tp-team-owner-name', d.ownerName || '');
    const newChk = document.getElementById('tp-team-new'); if (newChk) newChk.checked = d.isNew || false;
    const remChk = document.getElementById('tp-team-remote'); if (remChk) remChk.checked = d.remote || false;
    if (d.photo) {
      if (photoIcon) photoIcon.style.display = 'none';
      if (photoImg) { photoImg.src = d.photo; photoImg.style.display = 'block'; }
      _teamProfilePhotoBase64 = d.photo;
    }
    if (d.banner) {
      if (bannerImg) { bannerImg.src = d.banner; bannerImg.style.display = 'block'; }
      window._tpBannerBase64 = d.banner;
    }
    window._tpCategories = d.categories ? [...d.categories] : [];
    window._tpTools = d.tools ? [...d.tools] : [];
    window._tpPortfolio = d.portfolio ? [...d.portfolio] : [];
    // Vagas
    setTimeout(() => {
      (TEAM_ROLES_VACANCIES || []).forEach(r => {
        const el = document.getElementById('vac-' + r.id);
        if (el) el.value = (d.vacancies || {})[r.id] || 0;
      });
    }, 50);
  }
  setTimeout(() => {
    tpRenderCategories();
    tpRenderTools();
    tpRenderPortfolio();
  }, 60);
  openModal('modal-team-profile');
};

// ── Banner handler ────────────────────────────────────────────────────────────
window.handleTeamBanner = function (input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('tp-banner-img');
    if (img) { img.src = e.target.result; img.style.display = 'block'; }
    window._tpBannerBase64 = e.target.result;
  };
  reader.readAsDataURL(file);
};

// ── Categories ────────────────────────────────────────────────────────────────
if (!window._tpCategories) window._tpCategories = [];
function tpRenderCategories() {
  const sel = document.getElementById('tp-categories-selected');
  if (!sel) return;
  if (!(window._tpCategories || []).length) {
    sel.innerHTML = `<div class="u-mono-label2">Nenhuma selecionada</div>`;
  } else {
    sel.innerHTML = window._tpCategories.map((c, i) => `
      <span style="display:inline-flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:9px;background:rgba(255,107,61,0.1);border:1px solid rgba(255,107,61,0.3);color:var(--a2);padding:3px 8px;border-radius:4px">
        ${escHtml(c)}<span onclick="tpRemoveCategory(${i})" style="cursor:pointer;color:var(--text3)">✕</span>
      </span>`).join('');
  }
  const TP_CATS = ['Música', 'Entretenimento', 'Games', 'Animação', 'Educação', 'Arte & Design', 'Tecnologia', 'Podcast', 'Comédia', 'Vlogs'];
  TP_CATS.forEach(c => {
    const id = 'tp-cat-' + c.replace(/[^a-zA-Z0-9]/g, '_');
    const btn = document.getElementById(id);
    if (!btn) return;
    const active = (window._tpCategories || []).includes(c);
    btn.style.background = active ? 'rgba(255,107,61,0.15)' : 'var(--bg3)';
    btn.style.borderColor = active ? 'rgba(255,107,61,0.4)' : 'var(--border)';
    btn.style.color = active ? 'var(--a2)' : 'var(--text2)';
  });
}
window.tpToggleCategory = function (cat) {
  if (!window._tpCategories) window._tpCategories = [];
  const idx = window._tpCategories.indexOf(cat);
  if (idx >= 0) window._tpCategories.splice(idx, 1); else window._tpCategories.push(cat);
  tpRenderCategories();
};
window.tpRemoveCategory = function (i) { window._tpCategories.splice(i, 1); tpRenderCategories(); };

// ── Tools ─────────────────────────────────────────────────────────────────────
if (!window._tpTools) window._tpTools = [];
function tpRenderTools() {
  const el = document.getElementById('tp-tools-tags'); if (!el) return;
  el.innerHTML = (window._tpTools || []).map((t, i) => `
    <span style="display:inline-flex;align-items:center;gap:5px;font-family:var(--font-mono);font-size:10px;background:var(--bg3);border:1px solid var(--border);color:var(--text);padding:3px 10px;border-radius:4px">
      ${escHtml(t)}<span onclick="tpRemoveTool(${i})" style="cursor:pointer;color:var(--text3)">✕</span>
    </span>`).join('');
}
window.tpAddTool = function () {
  const inp = document.getElementById('tp-tool-input'); const v = inp?.value.trim(); if (!v) return;
  if (!window._tpTools) window._tpTools = [];
  window._tpTools.push(v); inp.value = ''; tpRenderTools();
};
window.tpRemoveTool = function (i) { window._tpTools.splice(i, 1); tpRenderTools(); };

// ── Portfolio ─────────────────────────────────────────────────────────────────
if (!window._tpPortfolio) window._tpPortfolio = [];
function tpRenderPortfolio() {
  const el = document.getElementById('tp-portfolio-list'); if (!el) return;
  if (!(window._tpPortfolio || []).length) {
    el.innerHTML = `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);text-align:center;padding:12px">Adicione links de vídeos, músicas ou projetos publicados.</div>`;
    return;
  }
  el.innerHTML = window._tpPortfolio.map((p, i) => `
    <div style="display:flex;align-items:center;gap:10px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px">
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--font-body);font-size:12px;font-weight:600;color:var(--text)">${escHtml(p.title || p.url)}</div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(p.url)}</div>
      </div>
      <span onclick="tpRemovePortfolio(${i})" style="color:var(--text3);cursor:pointer;font-size:12px;flex-shrink:0">✕</span>
    </div>`).join('');
}
window.tpAddPortfolio = function () {
  const url = prompt('URL do trabalho (vídeo, música, projeto):'); if (!url?.trim()) return;
  const title = prompt('Título (opcional):') || '';
  if (!window._tpPortfolio) window._tpPortfolio = [];
  window._tpPortfolio.push({ url: url.trim(), title: title.trim() });
  tpRenderPortfolio();
};
window.tpRemovePortfolio = function (i) { window._tpPortfolio.splice(i, 1); tpRenderPortfolio(); };

// ── Salvar perfil ──────────────────────────────────────────────────────────────
window.saveTeamProfile = async function () {
  const name = document.getElementById('tp-team-name').value.trim();
  const bio = document.getElementById('tp-team-bio').value.trim();
  if (!name || !bio) { toast('Preencha nome e descrição', 'error'); return; }

  const vacancies = {};
  TEAM_ROLES_VACANCIES.forEach(r => {
    const val = parseInt(document.getElementById('vac-' + r.id)?.value || '0');
    if (val > 0) vacancies[r.id] = val;
  });

  const profileData = {
    teamId: _currentTeamId,
    name,
    tagline: document.getElementById('tp-team-tagline')?.value.trim() || '',
    bio,
    story: document.getElementById('tp-team-story')?.value.trim() || '',
    location: document.getElementById('tp-team-location')?.value.trim() || '',
    stage: document.getElementById('tp-team-stage')?.value || 'starting',
    isNew: document.getElementById('tp-team-new')?.checked || false,
    remote: document.getElementById('tp-team-remote')?.checked || false,
    photo: _teamProfilePhotoBase64 || (_teamProfile?.photo || ''),
    banner: window._tpBannerBase64 || (_teamProfile?.banner || ''),
    links: {
      youtube: document.getElementById('tp-team-youtube')?.value.trim() || '',
      spotify: document.getElementById('tp-team-spotify')?.value.trim() || '',
      instagram: document.getElementById('tp-team-instagram')?.value.trim() || '',
      tiktok: document.getElementById('tp-team-tiktok')?.value.trim() || '',
      discord: document.getElementById('tp-team-discord')?.value.trim() || '',
      site: document.getElementById('tp-team-site')?.value.trim() || '',
    },
    stats: {
      projects: document.getElementById('tp-stat-projects')?.value.trim() || '',
      views: document.getElementById('tp-stat-views')?.value.trim() || '',
      followers: document.getElementById('tp-stat-followers')?.value.trim() || '',
    },
    genres: (document.getElementById('tp-team-genres')?.value.trim() || '').split(',').map(s => s.trim()).filter(Boolean),
    foundedYear: document.getElementById('tp-team-year')?.value.trim() || '',
    ownerName: document.getElementById('tp-team-owner-name')?.value.trim() || '',
    categories: window._tpCategories || [],
    tools: window._tpTools || [],
    portfolio: window._tpPortfolio || [],
    vacancies,
    isPublic: true,
    updatedAt: new Date().toISOString(),
    ownerUid: currentUser.uid,
  };

  showLoading('Salvando...');
  try {
    await setDoc(doc(db, 'team_profiles', _currentTeamId), profileData, { merge: true });
    _teamProfile = profileData;
    window._teamProfile = _teamProfile;
    hideLoading();
    toast('✅ Perfil da equipe salvo!');
    closeModal('modal-team-profile');
    openMatchHub();
  } catch (e) {
    hideLoading();
    const isPerms = e.message && (e.message.includes('permission') || e.message.includes('permissions'));
    if (isPerms) {
      toast('❌ Permissão negada — atualize as regras do Firestore no console do Firebase (veja o comentário no topo do HTML)', 'error');
    } else {
      toast('Erro: ' + e.message, 'error');
    }
  }
};

// ── Abrir Match Hub ────────────────────────────────────────────────────────────
async function openMatchHub() {
  showLoading('Carregando talentos...');
  try {
    // Carrega talent_profiles
    const snap = await getDocs(collection(db, 'talent_profiles'));
    _hubAllTalents = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(t => t.availability !== 'hidden')
      .sort(_sortByPriority); // ETAPA 4: effectivePriority desc, updatedAt desc

    // ETAPA 4.1: backfill controlado — preenche effectivePriority=1 em até 10 docs sem o campo
    let _hubBackfillCount = 0;
    for (const t of snap.docs) {
      if (_hubBackfillCount >= 10) break;
      if (typeof t.data().effectivePriority !== 'number') {
        updateDoc(doc(db, 'talent_profiles', t.id), { effectivePriority: 1, plan: t.data().plan || 'free' }).catch(() => { });
        _hubBackfillCount++;
      }
    }

    // Carrega likes da equipe
    try {
      const likesSnap = await getDoc(doc(db, 'team_likes', _currentTeamId));
      _hubTeamLikes = likesSnap.exists() ? (likesSnap.data().likes || {}) : {};
    } catch (e) { _hubTeamLikes = {}; }

    hideLoading();
    openModal('modal-match-hub');
    setMatchHubTab('match');
  } catch (e) { hideLoading(); toast('Erro: ' + e.message, 'error'); }
}

// ── Tabs ───────────────────────────────────────────────────────────────────────
window.setMatchHubTab = function (tab) {
  _currentHubTab = tab;
  ['search', 'match', 'matches'].forEach(t => {
    const tabEl = document.getElementById('hub-tab-' + t);
    const btn = document.getElementById('hub-btn-' + t);
    if (tabEl) tabEl.style.display = t === tab ? (t === 'match' ? 'flex' : 'block') : 'none';
    if (btn) {
      btn.className = t === tab ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm';
    }
  });
  if (tab === 'search') renderHubSearch();
  if (tab === 'match') { _hubSwipeIndex = 0; if (window.renderHubSpotlight) { window._hubSpotIndex = 0; renderHubSpotlight(); } else { renderHubSwipeCard(); } }
  if (tab === 'matches') renderHubMatches();
};

// ── Search tab ─────────────────────────────────────────────────────────────────
window.renderHubSearch = function () {
  const search = document.getElementById('hub-search-input')?.value.toLowerCase() || '';
  const role = document.getElementById('hub-role-filter')?.value || '';
  const vacancies = _teamProfile?.vacancies || {};

  _hubFiltered = _hubAllTalents.filter(t => {
    const matchSearch = !search || (t.name || '').toLowerCase().includes(search) || (t.bio || '').toLowerCase().includes(search);
    const matchRole = !role ? true : (t.skills && t.skills[role]);
    return matchSearch && matchRole;
  }).sort(_sortByPriority); // ETAPA 4: mantém effectivePriority desc após filtros

  const grid = document.getElementById('hub-search-grid');
  if (!grid) return;
  if (!_hubFiltered.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text3);font-family:var(--font-mono);letter-spacing:2px">NENHUM TALENTO ENCONTRADO</div>`;
    return;
  }

  grid.innerHTML = _hubFiltered.map(t => {
    const avColor = { open: 'var(--green)', busy: 'var(--yellow)' };
    const avLabel = { open: '✅ Disponível', busy: '🔶 Ocupado' };
    const avatarHtml = t.photo
      ? `<img src="${t.photo}" style="width:46px;height:46px;border-radius:50%;object-fit:cover;border:2px solid var(--border2)">`
      : `<div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,var(--a1),var(--a2));display:flex;align-items:center;justify-content:center;font-weight:800;font-size:17px;color:white">${(t.name || '?')[0].toUpperCase()}</div>`;

    const skillKeys = Object.keys(t.skills || {});
    const badges = skillKeys.slice(0, 3).map(rid => {
      const r = TALENT_ROLES.find(x => x.id === rid);
      return r ? `<span style="font-size:9px;padding:2px 7px;border-radius:4px;background:var(--bg3);border:1px solid var(--border2);color:var(--text2)">${r.icon} ${r.label}</span>` : '';
    }).join('');

    const alreadyLiked = _hubTeamLikes[t.uid || t.id];

    const effPlanInfo = typeof getEffectivePlanForUser === 'function' ? getEffectivePlanForUser(t) : { plan: t.plan || 'free' };
    const inlineChip = typeof renderPlanChip === 'function' ? renderPlanChip(effPlanInfo, 'inline') : '';
    const pillChip = typeof renderPlanChip === 'function' ? renderPlanChip(effPlanInfo, 'pill') : '';

    const tIdx = _hubFiltered.indexOf(t);
    return `
    <div class="card" style="padding:16px;transition:all 0.2s;border:1px solid var(--border);cursor:pointer"
      onclick="_ppOpenHubCard(${tIdx}, event)"
      onmouseover="this.style.borderColor='var(--border2)';this.style.transform='translateY(-2px)'"
      onmouseout="this.style.borderColor='var(--border)';this.style.transform=''">
      <div style="display:flex;gap:12px;margin-bottom:10px;align-items:center">
        ${avatarHtml}
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:6px">${t.name || '?'}${inlineChip}</div>
          <div style="font-size:11px;margin-top:2px;color:${avColor[t.availability || 'open']}">${avLabel[t.availability || 'open'] || ''}</div>
          ${pillChip ? `<div style="margin-top:5px">${pillChip}</div>` : ''}
        </div>
      </div>
      ${t.bio ? `<div style="font-size:11px;color:var(--text2);line-height:1.5;margin-bottom:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${t.bio}</div>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px">${badges}</div>
      <button onclick="event.stopPropagation();hubToggleInterest('${t.uid || t.id}','${(t.name || '').replace(/'/g, "\\'")}','${t.id}')"
        style="width:100%;padding:8px;border-radius:8px;font-family:var(--font-mono);font-size:10px;letter-spacing:1px;cursor:pointer;
        ${alreadyLiked ? 'background:rgba(114,239,221,0.15);border:1px solid var(--green);color:var(--green)' : 'background:var(--a1);border:none;color:white'}">
        ${alreadyLiked ? '✅ INTERESSE ENVIADO' : '💌 DEMONSTRAR INTERESSE'}
      </button>
    </div>`;
  }).join('');
};

// v5.20.4 — Artist Dashboard removido. Funcionalidade integrada em:
// "Procurar Equipe" (showTalentsStandalone) e "Encontrar Membros" (Match Hub).
window.openArtistDashboard = function () { if (typeof showTalentsStandalone === 'function') showTalentsStandalone(); else if (typeof loadTalentsPage === 'function') loadTalentsPage(); };
window.closeArtistDashboard = function () { };


// ── Garante que a versão v5 do loadTalentsPage prevalece sobre a v1 ──────────
// (módulos são deferidos e executam por último, sobrescrevendo scripts síncronos)
if (window._loadTalentsPageV5) {
  window.loadTalentsPage = window._loadTalentsPageV5;
}

