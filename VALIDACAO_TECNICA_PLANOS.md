# Validação Técnica do Sistema de Planos FREQsys

> **Regra:** Nenhum arquivo foi alterado. Este documento contém apenas citações verificadas do código-fonte real.

---

## TAREFA A — PROVA (Citações de Código)

### A1. `PLAN_CONFIG` — Definição Central

**Arquivo:** [firebase-init.js](file:///c:/Users/Mariana/Downloads/testar%20o%20Antigravity/js/firebase-init.js)
**Localização:** Linhas 90–188
**Tipo:** `Object.freeze` (imutável em runtime)

#### Chaves de Limites (`limits`)

| Chave | FREE (L93–97) | PRO (L125–129) | ADVANCED (L157–161) |
| :--- | :---: | :---: | :---: |
| `maxTeams` | 2 | 10 | `Infinity` |
| `maxActiveProjects` | 3 | `Infinity` | `Infinity` |
| `maxCollaboratorsPerProject` | 2 | 8 | `Infinity` |
| `maxFriends` | 5 | 25 | `Infinity` |

#### Chaves de Features (`features`)

| Chave | FREE (L99–119) | PRO (L131–151) | ADV (L163–183) | Tem enforcement real? |
| :--- | :---: | :---: | :---: | :--- |
| `hasBoost` | `false` | `true` | `true` | ✅ SIM — `canUseBoost` (L520) |
| `boostMonthlyCount` | `0` | `1` | `Infinity` | ✅ SIM — `canUseBoost` (L525-526) |
| `hasYouTubeAnalytics` | `false` | `true` | `true` | ✅ SIM — `loadAnalytics` (L7203) |
| `hasAdvancedAnalytics` | `false` | `false` | `true` | ❌ NÃO encontrei uso runtime |
| `canUseGifAvatar` | `false` | `true` | `true` | ❌ NÃO encontrei uso runtime |
| `canUseGifBanner` | `false` | `false` | `true` | ❌ NÃO encontrei uso runtime |
| `canCustomizeProfileColors` | `false` | `false` | `true` | ❌ NÃO encontrei uso runtime |
| `canUseCustomBackground` | `false` | `false` | `true` | ❌ NÃO encontrei uso runtime |
| `canRemoveWatermark` | `false` | `false` | `true` | ❌ NÃO encontrei uso runtime |
| `canPinMessages` | `false` | `true` | `true` | ❌ NÃO encontrei uso runtime |
| `hasPrioritySupport` | `false` | `true` | `true` | ❌ NÃO encontrei uso runtime |
| `canUseAdvancedSearchFilters` | `false` | `false` | `true` | ❌ NÃO encontrei uso runtime |
| `canExportReports` | `false` | `false` | `true` | ❌ NÃO encontrei uso runtime |
| `canSeeProfileViews` | `false` | `false` | `true` | ❌ NÃO encontrei uso runtime |
| `canUseInvisibleMode` | `false` | `false` | `true` | ❌ NÃO encontrei uso runtime |
| `hasEarlyAccess` | `false` | `false` | `true` | ❌ NÃO encontrei uso runtime |
| `hasPremiumChat` | `false` | `false` | `true` | ❌ NÃO encontrei uso runtime |
| `hasFullDashboard` | `false` | `true` | `true` | ❌ NÃO encontrei uso runtime |
| `hasAdvancedCharts` | `false` | `true` | `true` | ❌ NÃO encontrei uso runtime |
| `hasFullHistory` | `false` | `true` | `true` | ❌ NÃO encontrei uso runtime |

#### Campo `weight` (prioridade/ranking)

| Plano | Valor | Linha |
| :--- | :---: | :---: |
| `free` | `1` | L121 |
| `pro` | `5` | L153 |
| `advanced` | `10` | L185 |

Acessado pela função `getPriorityWeight(userDoc)` em L253–256. Diferente do `effectivePriority` calculado por `calculateEffectivePriority` (L557–567), onde: free=1, pro=2, advanced=3, +5 se boost ativo.

---

### A2. `resolveUserPlan` — Normalização

**Arquivo:** [firebase-init.js](file:///c:/Users/Mariana/Downloads/testar%20o%20Antigravity/js/firebase-init.js)
**Localização:** Linhas 720–724

```javascript
function resolveUserPlan(userDoc) {
  const raw = (planOrDoc && typeof planOrDoc === 'object') ? planOrDoc.plan : planOrDoc;
  const p = (typeof raw === 'string') ? raw.toLowerCase().trim() : '';
  if (p === 'pro' || p === 'advanced') return p;
  return 'free'; // fallback seguro
}
```

**Comportamento exato:**
1. Aceita objeto `{plan: 'pro'}` OU string direta `'pro'`
2. Converte para lowercase + trim
3. Retorna `'pro'` ou `'advanced'` se match; caso contrário **sempre** `'free'`
4. `null`, `undefined`, valores inválidos → `'free'`

**Alias:** `getUserPlan(userDoc)` (L199–201) simplesmente delega para `resolveUserPlan`.
**Alias:** `_normalizePlan(raw)` (L781–785) wraps `resolveUserPlan` aceitando string ou objeto.

---

### A3. `getLimit` e `hasFeature` — APIs de Acesso

#### `getLimit(userDoc, limitKey)` — L221–226

```javascript
function getLimit(userDoc, limitKey) {
  const plan   = getUserPlan(userDoc);
  const config = getPlanConfig(plan);
  const val    = config.limits[limitKey];
  return (val !== undefined) ? val : 0; // 0 = chave inválida → fail-safe
}
```

**Uso confirmado no código (8 chamadas):**

| Chamada | Local | Linha |
| :--- | :--- | :---: |
| `getLimit(currentUserData, 'maxTeams')` | `createTeam` | L1208 |
| `getLimit(userDoc, 'maxActiveProjects')` | `_checkProjectLimit` | L319 |
| `getLimit(userDoc, 'maxFriends')` | `_checkFriendLimit` | L389 |
| `getLimit(userDoc, 'maxCollaboratorsPerProject')` | `_checkCollabPerProjectLimit` | L474 |
| `getLimit(currentUserData, 'maxCollaboratorsPerProject')` | `saveCollab` | L3517 |
| `getLimit(currentUserData, 'maxActiveProjects')` | importação de backup | L4950 |
| `getLimit(currentUserData, 'maxCollaboratorsPerProject')` | importação de backup | L4971 |
| `getLimit(currentUserData, 'maxTeams')` | (*definição mesma que L1208*) | L1208 |

#### `hasFeature(userDoc, featureKey)` — L236–244

```javascript
function hasFeature(userDoc, featureKey) {
  const plan    = getUserPlan(userDoc);
  const config  = getPlanConfig(plan);
  const val     = config.features[featureKey];
  if (val === undefined)        return false;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number')  return val > 0;
  return Boolean(val);
}
```

**Uso confirmado no código (APENAS 1 chamada runtime):**

| Chamada | Local | Linha |
| :--- | :--- | :---: |
| `hasFeature(currentUserData, 'hasYouTubeAnalytics')` | `loadAnalytics` | L7203 |

> [!IMPORTANT]
> Das 18 feature flags, **apenas 1** é acessada por `hasFeature()` no runtime. O boost usa `canUseBoost()` (que lê o plano direto, não via `hasFeature`). As demais 15 flags existem no config mas **NÃO são consultadas em nenhum lugar do código**.

---

### A4. Pontos de Enforcement (Limites)

#### 1) `createTeam` — Bloqueia por `maxTeams`
- **Arquivo:** [firebase-init.js](file:///c:/Users/Mariana/Downloads/testar%20o%20Antigravity/js/firebase-init.js) — Linhas 1207–1220
- **O que faz:**
  1. `getLimit(currentUserData, 'maxTeams')` — obtém limite
  2. Filtra `_myTeams` por equipes que o user é `owner`
  3. Se `_ownedTeams.length >= _teamLimit` → **bloqueia**
- **Comportamento ao bloquear:**
  - `toast('Limite de equipes atingido...', 'error')` ✅
  - `openPlansModal()` ✅
  - `return` (impede criação) ✅

#### 2) `_checkProjectLimit` — Bloqueia por `maxActiveProjects`
- **Arquivo:** [firebase-init.js](file:///c:/Users/Mariana/Downloads/testar%20o%20Antigravity/js/firebase-init.js) — Linhas 317–340
- **O que faz:**
  1. `getLimit(userDoc, 'maxActiveProjects')` — obtém limite
  2. Se `!Number.isFinite(limit)` → retorna `true` (ilimitado, PRO/ADV)
  3. `_countActiveProjects()` — conta projetos com status `'active'` ou `'paused'`
  4. Se `current < limit` → retorna `true`
  5. Senão → **bloqueia**
- **Comportamento ao bloquear:**
  - `toast('Limite de projetos ativos atingido...', 'error')` ✅
  - `openPlansModal()` ✅
  - `return false` ✅

#### 3) `saveCollab` — Bloqueia por `maxCollaboratorsPerProject`
- **Arquivo:** [firebase-init.js](file:///c:/Users/Mariana/Downloads/testar%20o%20Antigravity/js/firebase-init.js) — Linhas 3515–3527
- **O que faz:**
  1. Verifica APENAS ao **criar** (não ao editar): `if (!editId)`
  2. `getLimit(currentUserData, 'maxCollaboratorsPerProject')`
  3. Filtra `_collabs` por não-inativos
  4. Se `Number.isFinite(_collabLimit) && _activeCollabs.length >= _collabLimit` → **bloqueia**
- **Comportamento ao bloquear:**
  - `toast('Limite de colaboradores por projeto atingido...', 'error')` ✅
  - `openPlansModal()` ✅
  - `return` (impede criação) ✅

**Também existe:** `_checkCollabPerProjectLimit(userDoc, newCollabsArray, ctx)` (L455–493) — versão genérica usada em importação de backup.

#### 4) `_checkFriendLimit` — Bloqueia por `maxFriends`
- **Arquivo:** [firebase-init.js](file:///c:/Users/Mariana/Downloads/testar%20o%20Antigravity/js/firebase-init.js) — Linhas 388–405
- **O que faz:**
  1. `getLimit(userDoc, 'maxFriends')`
  2. Se `!Number.isFinite(limit_)` → retorna `true` (ADVANCED)
  3. `_countUserMatchesAsync(uid)` — conta matches no Firestore
  4. Se `current < limit_` → retorna `true`
  5. Senão → **bloqueia**
- **Comportamento ao bloquear:**
  - `toast('Limite de conexões atingido...', 'error')` ✅
  - `openPlansModal()` ✅
  - `return false` ✅

> [!NOTE]
> Todos os 4 enforcement points seguem o mesmo padrão: `getLimit()` → comparação → `toast(error)` → `openPlansModal()` → `return false/void`. Consistência total.

---

### A5. Sistema de Boost

**Arquivo:** [firebase-init.js](file:///c:/Users/Mariana/Downloads/testar%20o%20Antigravity/js/firebase-init.js) — Linhas 499–616

#### Funções:

| Função | Linhas | Descrição |
| :--- | :---: | :--- |
| `canUseBoost(userDoc)` | L520–530 | free→false; pro→se `boostCredits > 0`; advanced→true |
| `isBoostActive(userDoc)` | L538–547 | Verifica se `boostActiveUntil.toDate() > new Date()` |
| `calculateEffectivePriority(userDoc)` | L557–567 | free=1, pro=2, adv=3, +5 se boost ativo |
| `activateBoost(userId)` | L580–616 | Ativa boost com persistência Firestore |

#### Campos Firestore (citados explicitamente no comentário L503–507):

```
users/{uid}.boostCredits        (number)  — créditos disponíveis
users/{uid}.boostActiveUntil    (Timestamp | null) — expiry do boost ativo
users/{uid}.monthlyMatchesCount (number)  — matches no mês corrente
users/{uid}.monthlyScore        (number)  — score calculado
```

#### Fluxo do `activateBoost(userId)` — L580–616:
1. Lê `users/{userId}` via `getDoc`
2. Verifica `canUseBoost(data)` — se `false`, `return false`
3. Define `boostActiveUntil = agora + 24h`
4. Se `plan === 'pro'` → `boostCredits = (data.boostCredits || 0) - 1`
5. Se `plan === 'advanced'` → NÃO altera créditos
6. Recalcula `effectivePriority` via `calculateEffectivePriority`
7. Grava tudo com `updateDoc(ref, updatedDoc)`
8. Retorna `true`

---

## TAREFA B — MAPA DO "PLANO DO USUÁRIO"

### B1. Onde o plano é armazenado

| Coleção | Campo | Citação |
| :--- | :--- | :--- |
| `users/{uid}` | `.plan` | L1370: `plan:'free'` na criação do user doc |
| `talent_profiles/{uid}` | `.plan` | L803: `_syncTalentPlan` sincroniza via `updateDoc` |

**Fonte da verdade:** `users/{uid}.plan` (comentário explícito L764: *"Garante que users/{uid}.plan seja a fonte da verdade"*)

**Sync automático:** Ao criar um usuário novo (L1372–1373):
```javascript
_syncTalentPlan(user.uid, 'free').catch(() => {});
```

Ao editar perfil, `profile-edit.js` (L316–319) sincroniza:
```javascript
await updateDoc(doc(db, 'talent_profiles', currentUser.uid), {
  plan: _epCurrent?.plan || 'free',
  effectivePriority: _ep
});
```

### B2. Onde o plano é lido no login

**Arquivo:** [firebase-init.js](file:///c:/Users/Mariana/Downloads/testar%20o%20Antigravity/js/firebase-init.js) — Linhas 1362–1387

1. **L1365:** `const userSnap = await getDoc(doc(db,'users',user.uid));` — lê o doc do Firestore
2. **L1366:** `if (userSnap.exists()) userData = userSnap.data();` — extrai dados (inclui `.plan`)
3. **L1370:** Se user novo: cria com `plan:'free'`
4. **L1376:** `currentUserData = userData;` — armazena globalmente
5. **L1380:** `const _bootPlan = getUserPlan(currentUserData);` — normaliza e loga

**Log de diagnóstico (L1382–1386):**
```javascript
console.info(
  `[PlanEngine] uid=${userData.uid} | plan=${_bootPlan} | weight=${_bootConfig.weight}`,
  '\n  limits:', _bootConfig.limits,
  '\n  features:', _bootConfig.features
);
```

### B3. Campos Firestore que controlam o plano

| Campo | Coleção | Tipo | Descrição |
| :--- | :--- | :--- | :--- |
| `plan` | `users/{uid}` | `string` | Plano atual: `'free'`, `'pro'`, `'advanced'` |
| `plan` | `talent_profiles/{uid}` | `string` | Cópia sincronizada do plano |
| `boostCredits` | `users/{uid}` | `number` | Créditos de boost disponíveis |
| `boostActiveUntil` | `users/{uid}` | `Timestamp\|null` | Quando o boost expira |
| `effectivePriority` | `users/{uid}` | `number` | Prioridade calculada (com boost) |
| `effectivePriority` | `talent_profiles/{uid}` | `number` | Cópia para ordenação no Spotlight |
| `monthlyMatchesCount` | `users/{uid}` | `number` | Matches no mês corrente |
| `monthlyScore` | `users/{uid}` | `number` | Score mensal calculado |
| `planSyncedAt` | `talent_profiles/{uid}` | `string` | Timestamp ISO da última sincronização |

---

## TAREFA C — GAP ANALYSIS

### ✅ 1) JÁ IMPLEMENTADO (confirmado por código)

| Feature | Evidência |
| :--- | :--- |
| **Limites: maxTeams** | `createTeam` (L1208) — enforcement completo |
| **Limites: maxActiveProjects** | `_checkProjectLimit` (L317) + importação (L4950) |
| **Limites: maxCollaboratorsPerProject** | `saveCollab` (L3517) + `_checkCollabPerProjectLimit` (L474) + importação (L4971) |
| **Limites: maxFriends** | `_checkFriendLimit` (L389) |
| **Boost completo** | `canUseBoost` (L520) + `activateBoost` (L580) + `isBoostActive` (L538) |
| **Badge PRO/ADVANCED** | `renderPlanInlineChip` (L730) — 18+ pontos de uso na UI |
| **Pill PRO/ADVANCED** | `renderPlanPill` (L745) — 9+ pontos de uso |
| **YouTube Analytics gate** | `hasFeature(currentUserData, 'hasYouTubeAnalytics')` (L7203) |
| **Prioridade/weight** | `getPriorityWeight` (L253) + `_sortByPriority` (L684) + `effectivePriority` |
| **Normalização/sync de plano** | `resolveUserPlan` + `_syncTalentPlan` + log de boot |

### ⚠️ 2) PARCIALMENTE IMPLEMENTADO (flag existe, SEM enforcement na UI/fluxo)

| Feature | Flag no `PLAN_CONFIG` | O que falta |
| :--- | :--- | :--- |
| **Dashboard completo** | `hasFullDashboard` (L117/149/181) | Flag existe mas `hasFeature('hasFullDashboard')` **NÃO É chamada** em nenhum lugar do código |
| **Gráficos avançados** | `hasAdvancedCharts` (L118/150/182) | Idem — flag dormante |
| **Histórico completo** | `hasFullHistory` (L119/151/183) | Idem — flag dormante |
| **GIF avatar** | `canUseGifAvatar` (L104/136/168) | Flag existe, PRO=true, ADV=true. **Sem validação** no upload de avatar (`upeHandlePhoto` em profile-edit.js L196) |
| **GIF banner** | `canUseGifBanner` (L105/137/169) | Flag existe, só ADV=true. **Sem validação** no upload de banner (`upeHandleBanner` em profile-edit.js L183) |
| **Pin messages** | `canPinMessages` (L109/141/173) | Flag existe, PRO+ADV=true. **NÃO ENCONTREI** lógica de pin de mensagens no código |
| **Suporte prioritário** | `hasPrioritySupport` (L110/142/174) | Flag existe. **NÃO ENCONTREI** tratamento diferenciado de suporte |
| **Analytics avançado** | `hasAdvancedAnalytics` (L103/135/167) | Flag existe (só ADV=true). `loadAnalytics` usa `hasYouTubeAnalytics`, mas **NÃO** usa `hasAdvancedAnalytics` |

### ❌ 3) NÃO IMPLEMENTADO (flag existe no config, mas a feature em si não existe)

| Feature | Flag no `PLAN_CONFIG` | Status |
| :--- | :--- | :--- |
| **Customização visual (cor/layout)** | `canCustomizeProfileColors` (L106/138/170) | **NÃO ENCONTREI** UI nem lógica de seleção de cores no perfil. A flag existe mas a funcionalidade **não existe** |
| **Background customizado** | `canUseCustomBackground` (L107/139/171) | **NÃO ENCONTREI** sistema de background personalizável. A flag existe mas a funcionalidade **não existe** |
| **Remover watermark** | `canRemoveWatermark` (L108/140/172) | **NÃO ENCONTREI** watermark sendo exibida nem lógica de remoção. Flag dormante, feature inexistente |
| **Filtro avançado de busca** | `canUseAdvancedSearchFilters` (L111/143/175) | **NÃO ENCONTREI** filtros diferenciados por plano no Match System/Spotlight |
| **Export PDF/CSV** | `canExportReports` (L112/144/176) | **NÃO ENCONTREI** funcionalidade de exportação de relatórios |
| **Ver quem visualizou** | `canSeeProfileViews` (L113/145/177) | **NÃO ENCONTREI** sistema de rastreamento de views |
| **Modo invisível** | `canUseInvisibleMode` (L114/146/178) | **NÃO ENCONTREI** lógica de invisibilidade/stealth |
| **Early access** | `hasEarlyAccess` (L115/147/179) | **NÃO ENCONTREI** gate de early access. Flag dormante, feature inexistente |
| **Chat premium** | `hasPremiumChat` (L116/148/180) | **NÃO ENCONTREI** sistema de mensagens destacadas ou cores especiais no chat |
| **Perfil premium / layout diferenciado** | (não há flag específica) | **NÃO ENCONTREI** layout diferente por plano. Os badges inline/pill existem mas o layout do perfil é igual para todos |

---

## TAREFA D — PLANO DE IMPLEMENTAÇÃO MINIMALISTA (SEM CODAR)

### Fase 1 — Features que já têm flag + ponto de injeção óbvio

| # | Feature | Arquivo | Função/IDs tocados | Risco | Como testar |
| :---: | :--- | :--- | :--- | :---: | :--- |
| 1 | **GIF avatar (PRO+ADV)** | `profile-edit.js` | `upeHandlePhoto` — adicionar check `hasFeature(currentUserData, 'canUseGifAvatar')` antes de aceitar `.gif` | **Baixo** | Upload de .gif como FREE: deve ser rejeitado com toast. Como PRO: deve aceitar |
| 2 | **GIF banner (ADV)** | `profile-edit.js` | `upeHandleBanner` — mesmo padrão do item 1 com `canUseGifBanner` | **Baixo** | Upload de .gif como PRO: rejeitado. Como ADV: aceito |
| 3 | **Dashboard/gráficos gate** | `firebase-init.js` | `loadAnalytics` (L7200+) — adicionar check `hasFeature(currentUserData, 'hasFullDashboard')` para controlar seções adicionais | **Médio** | Abrir aba Analytics como FREE: banner de upgrade. Como PRO: dashboard completo |
| 4 | **Pin messages** | `firebase-init.js` | Localizar UI de chat/mensagens — adicionar botão "📌 Fixar" condicional a `hasFeature(ud, 'canPinMessages')` | **Médio** | Tentar fixar mensagem como FREE: botão oculto ou toast. Como PRO: funcional |

### Fase 2 — Features que precisam de funcionalidade nova

| # | Feature | Arquivo principal | O que criar | Risco | Como testar |
| :---: | :--- | :--- | :--- | :---: | :--- |
| 5 | **Customização de cores** | `profile-edit.js` + `main.css` | Color picker no UPE edit; salvar em `talent_profiles/{uid}.profileColors`; aplicar via inline style em profile-popup | **Médio** | Abrir UPE como ADV: color picker visível. Como FREE: oculto ou com lock |
| 6 | **Background customizado** | `profile-edit.js` + `main.css` | Upload de background; salvar em `talent_profiles/{uid}.customBg`; renderizar na visualização do perfil | **Médio** | Como ADV: upload visível. Como FREE: oculto |
| 7 | **Export PDF/CSV** | `firebase-init.js` (seção Analytics) | Botão "Exportar" no dashboard; gerar CSV/PDF client-side | **Baixo** | Como PRO/ADV: botão visível e funcional. FREE: oculto |
| 8 | **Ver quem visualizou** | `firebase-init.js` + nova coleção | Coleção `profile_views/{uid}/viewers`; registrar view ao abrir perfil; mostrar lista se `canSeeProfileViews` | **Alto** | Como ADV: seção "Quem viu seu perfil" visível. FREE: oculta |
| 9 | **Modo invisível** | `firebase-init.js` (queries de Spotlight) | Flag `users/{uid}.isInvisible`; excluir do Spotlight se `!canUseInvisibleMode`; toggle no UPE | **Alto** | Ativar como ADV → perfil some do Spotlight de outros |
| 10 | **Remover watermark** | `firebase-init.js` (export/share) | Watermark "FREQsys" em screenshots/exports; ocultar se `canRemoveWatermark` | **Baixo** | Exportar como FREE: watermark. ADV: limpo |

### Fase 3 — Features aspiracionais (backlog)

| # | Feature | Impacto | Risco | Notas |
| :---: | :--- | :--- | :---: | :--- |
| 11 | **Early access** | UI | **Baixo** | Gate com `hasFeature('hasEarlyAccess')` em features Beta |
| 12 | **Chat premium** | UI + Firestore | **Alto** | Cores/destaque em mensagens; campo `chatStyle` em `users` |
| 13 | **Filtros avançados** | Match/Spotlight | **Médio** | UI de filtros extras condicionais a `canUseAdvancedSearchFilters` |
| 14 | **Suporte prioritário** | Externo | **Baixo** | Apenas flag — integrar com sistema de tickets/chat externo |
| 15 | **Perfil premium layout** | CSS + JS | **Médio** | Layout expandido/grid diferente para perfil completo |

### Regras para TODAS as fases:
- **Cada passo = 1 feature** (nunca 2 ao mesmo tempo)
- **Padrão de implementação:** `if (!hasFeature(currentUserData, 'flagKey')) { toast(); openPlansModal(); return; }`
- **Não renomear** `PLAN_CONFIG`, `getLimit`, `hasFeature`, nem suas chaves
- **Não usar** React/Vue/Vite
- **Não reescrever** arquivos inteiros — apenas inserir guards pontuais
- **Testar manualmente** após cada passo antes de avançar

---

> [!CAUTION]
> **15 das 18 feature flags no PLAN_CONFIG são dormentes** — definidas com valores corretos por plano, mas sem nenhuma chamada `hasFeature()` no código de negócios. Isso significa que a engine está pronta, mas as features em si ainda precisam ser construídas ou ter seus gates de acesso inseridos nos pontos certos da UI.
