// Apenas helpers da landing page que precisam funcionar imediatamente
function landingScroll(id) {
  var el=document.getElementById(id); if(!el)return;
  var sc=document.getElementById('auth-screen');
  if(sc) sc.scrollTo({top:el.offsetTop-70,behavior:'smooth'});
  else el.scrollIntoView({behavior:'smooth'});
}
function showAuthPanel(tab) {
  var p=document.getElementById('auth-panel'),o=document.getElementById('auth-panel-overlay');
  if(!p)return;
  p.style.display='block'; if(o)o.style.display='block';
  setTimeout(function(){p.style.transform='translateX(0)';},10);
  var t=document.getElementById('auth-panel-title'),s=document.getElementById('auth-panel-sub');
  if(t)t.textContent=tab==='register'?'Criar conta':'Entrar';
  if(s)s.textContent=tab==='register'?'É grátis para sempre!':'Bem-vindo de volta!';
  // Switch the tab form - retry until module has loaded switchAuthTab
  var attempts=0;
  var retry=setInterval(function(){
    attempts++;
    if(typeof window.switchAuthTab==='function'){
      clearInterval(retry);
      window.switchAuthTab(tab||'login');
    } else if(attempts>60) clearInterval(retry);
  },50);
}
function hideAuthPanel() {
  var p=document.getElementById('auth-panel'),o=document.getElementById('auth-panel-overlay');
  if(!p)return; p.style.transform='translateX(100%)';
  setTimeout(function(){p.style.display='none';if(o)o.style.display='none';},300);
}
