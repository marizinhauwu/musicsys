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