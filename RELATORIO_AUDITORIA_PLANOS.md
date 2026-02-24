# Relatório de Auditoria de Implementação: Sistema de Planos FREQsys

Este documento detalha o estado atual do sistema de controle de planos e assinaturas do projeto FREQsys, mapeando componentes existentes, lógica de limites e propondo uma integração sustentável dos planos FREE, PRO e ADVANCED.

## 1. Inventário do que já existe

### 1.1. Lógica Central (Data Cloud & Engine)
A infraestrutura de planos está centralizada no arquivo [firebase-init.js](file:///c:/Users/Mariana/Downloads/testar%20o%20Antigravity/js/firebase-init.js).

*   **Configuração Central (`PLAN_CONFIG`):** Objeto congelado que define todos os parâmetros técnicos de cada plano.
*   **Normalização (`resolveUserPlan`):** Garante que o plano do usuário seja sempre 'free', 'pro' ou 'advanced'.
*   **Logic Gates (`getLimit`, `hasFeature`):** Funções utilitárias usadas em todo o projeto para ler configurações sem acessar o objeto global diretamente.
*   **Sistema de Boost:** Implementação completa de créditos mensais (`boostCredits`) e duração de ativação sincronizada com o Firestore.

### 1.2. Interface (UI/UX)
*   **Estilização Premium:** Bloco `PREMIUM OVERRIDES` no [main.css](file:///c:/Users/Mariana/Downloads/testar%20o%20Antigravity/css/main.css) (linha 1561+), que refina componentes visuais quando em contextos de plano pago.
*   **Modais:** O `#modal-plans` no `index.html` contém a grade de preços e seleção de planos.
*   **Badges Dinâmicos:** Funções `renderPlanInlineChip` e `renderPlanPill` geram feedback visual nos componentes de Match e Perfil.

---

## 2. Mapa por Funcionalidade (Matriz de Planos)

Abaixo, a matriz consolidada baseada na constante `PLAN_CONFIG`:

| Categoria | Feature / Limite | FREE | PRO | ADVANCED | Localização no Código |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Limites** | Equipes Máximas | 2 | 10 | Ilimitado | `createTeam` (firebase-init.js) |
| | Projetos Ativos | 3 | Ilimitado | Ilimitado | `_checkProjectLimit` (firebase-init.js) |
| | Colaboradores/Proj | 2 | 8 | Ilimitado | `saveCollab` (firebase-init.js) |
| | Conexões (Amigos) | 5 | 25 | Ilimitado | `_checkFriendLimit` (firebase-init.js) |
| **Features** | Boost Mensal | Não / 0 | Sim / 1 | Sim / Ilimitado | `activateBoost` (firebase-init.js) |
| | YouTube Analytics | Não | Sim | Sim | (firebase-init.js:7203) |
| | Adv. Analytics | Não | Não | Sim | (PLAN_CONFIG) |
| | Selo PRO/ADV | Sim (Básico) | Sim (Destaque) | Sim (Premium) | `renderPlanInlineChip` |

---

## 3. Riscos e Conflitos Identificados

1.  **Dependências do DOM:** Diversas verificações de limite disparam `openPlansModal()` diretamente. Caso o ID do modal seja renomeado no HTML, a lógica de bloqueio falhará silenciosamente.
2.  **Lógica Cliente-Side:** Os limites são aplicados via JavaScript. Embora eficaz para UX, usuários avançados podem burlar as travas se as `firestore.rules` não espelharem essas restrições (ex: `effectivePriority`).
3.  **Complexidade no Import:** A lógica de importação de backups ([firebase-init.js:4946](file:///c:/Users/Mariana/Downloads/testar%20o%20Antigravity/js/firebase-init.js#L4946)) é crítica e sensível a mudanças nos nomes das chaves de limite.
4.  **Sobrescrita de CSS:** O bloco `PREMIUM OVERRIDES` depende da ordem de carregamento. Se novos estilos forem adicionados após esse bloco, as melhorias visuais premium podem ser perdidas.

---

## 4. Proposta de Arquitetura Minimalista

Para integrar novos planos sem quebrar o sistema atual, propõe-se:

### 4.1. Camada de Middleware de UI
Em vez de cada função chamar `toast()` e `openPlansModal()`, criar um wrapper:
```javascript
function enforceLimit(key, action) {
  if (canProceed(key)) return action();
  showUpgradeNudge(key);
}
```

### 4.2. Centralização de Destaques (Effective Priority)
Manter a lógica de `effectivePriority` automática baseada no peso do plano (`PLAN_CONFIG[plan].weight`), garantindo que usuários ADVANCED sempre apareçam no topo do Spotlight e Match System.

### 4.3. Preservação Total
*   Não renomear `PLAN_CONFIG` nem as chaves de limite.
*   Novas features (ex: "Invisible Mode") devem ser adicionadas apenas como novas chaves no objeto de features do `PLAN_CONFIG`.

---

> [!IMPORTANT]
> O sistema atual está **muito bem estruturado** e centralizado. A integração do plano ADVANCED requer apenas a manutenção dos campos de "feature flagging" já existentes no JS, sem necessidade de refatoração estrutural.
