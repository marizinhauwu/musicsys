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
