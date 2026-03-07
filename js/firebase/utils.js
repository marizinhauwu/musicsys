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
};

window.hideLoading = function () {
    const loader = document.getElementById('global-loader');
    if (loader) loader.remove();
};
