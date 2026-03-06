// Apenas helpers da landing page que precisam funcionar imediatamente
function landingScroll(id) {
  var el = document.getElementById(id); if (!el) return;
  var sc = document.getElementById('auth-screen');
  if (sc) sc.scrollTo({ top: el.offsetTop - 70, behavior: 'smooth' });
  else el.scrollIntoView({ behavior: 'smooth' });
}
function showAuthPanel(tab) {
  var p = document.getElementById('auth-panel'), o = document.getElementById('auth-panel-overlay');
  if (!p) return;
  p.style.display = 'block'; if (o) o.style.display = 'block';
  setTimeout(function () { p.style.transform = 'translateX(0)'; }, 10);
  var t = document.getElementById('auth-panel-title'), s = document.getElementById('auth-panel-sub');
  if (t) t.textContent = tab === 'register' ? 'Criar conta' : 'Entrar';
  if (s) s.textContent = tab === 'register' ? 'É grátis para sempre!' : 'Bem-vindo de volta!';

  // P1-3: Proteção contra múltiplos cliques / loops paralelos
  if (window._authRetryInterval) clearInterval(window._authRetryInterval);
  window._authRetryAttempts = 0;

  var formsContainer = document.getElementById('auth-forms-container');
  var fallbackId = 'auth-fallback-state';

  // Ocultar forms originais e injetar Loader nativo
  if (formsContainer && typeof window.switchAuthTab !== 'function') {
    formsContainer.style.display = 'none';
    var fallbackBox = document.getElementById(fallbackId);
    if (!fallbackBox) {
      fallbackBox = document.createElement('div');
      fallbackBox.id = fallbackId;
      formsContainer.parentNode.insertBefore(fallbackBox, formsContainer);
    }
    fallbackBox.style.display = 'block';
    fallbackBox.innerHTML = `
        <div style="text-align:center;padding:40px 10px;font-family:var(--font-mono);color:var(--text2)">
            <div style="font-size:32px;margin-bottom:16px;animation:freqSplashFade 1.5s infinite">⏳</div>
            <div style="font-size:12px;letter-spacing:1px;font-weight:700">CONECTANDO...</div>
            <div style="font-size:10px;margin-top:8px;opacity:0.7">Sincronizando Firebase</div>
        </div>
      `;
  }

  // Switch the tab form - retry until module has loaded
  window._authRetryInterval = setInterval(function () {
    window._authRetryAttempts++;

    // Debug Mode Log
    if (window._DEBUG_AUTH) {
      console.info(`[AuthRetry] Aguardando core Firebase... (Tentativa ${window._authRetryAttempts}/300)`);
    }

    if (typeof window.switchAuthTab === 'function') {
      // Sucesso! Limpar timer
      clearInterval(window._authRetryInterval);
      window._authRetryInterval = null;

      // Restaurar UI e chamar func real
      if (formsContainer) formsContainer.style.display = 'block';
      var fBox = document.getElementById(fallbackId);
      if (fBox) fBox.style.display = 'none';

      window.switchAuthTab(tab || 'login');
    } else if (window._authRetryAttempts > 300 || !navigator.onLine) {
      // Falha ao carregar após ~15s (300*50ms) ou offline
      clearInterval(window._authRetryInterval);
      window._authRetryInterval = null;

      var fBox = document.getElementById(fallbackId);
      if (fBox) {
        fBox.innerHTML = `
             <div style="text-align:center;padding:40px 10px;background:var(--card);border:1px solid rgba(239,68,68,0.3);border-radius:12px">
                <div style="font-size:32px;margin-bottom:12px">🦖</div>
                <div style="font-family:var(--font-body);font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">Falha de Conexão</div>
                <div style="font-family:var(--font-mono);font-size:10px;color:var(--text3);line-height:1.5;margin-bottom:20px">Não foi possível carregar os módulos seguros. Verifique sua rede e tente novamente.</div>
                <button class="btn btn-ghost btn-sm" onclick="showAuthPanel('${tab}')" style="width:100%;border-color:var(--border2)">↻ Tentar Novamente</button>
             </div>
           `;
      }
    }
  }, 50);
}
function hideAuthPanel() {
  var p = document.getElementById('auth-panel'), o = document.getElementById('auth-panel-overlay');
  if (!p) return; p.style.transform = 'translateX(100%)';
  setTimeout(function () { p.style.display = 'none'; if (o) o.style.display = 'none'; }, 300);
}
