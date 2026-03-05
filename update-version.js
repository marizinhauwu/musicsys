const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'index.html');
if (!fs.existsSync(indexPath)) {
    console.error('[Error] index.html não encontrado no diretório raiz.');
    process.exit(1);
}

let content = fs.readFileSync(indexPath, 'utf8');

// Gera um Hash único e curto baseado no momento exato (timestamp alfanumérico)
const autoHash = Date.now().toString(36);

// Expressão regular que encontra qualquer href ou src apontando para css/ ou js/
// e captura tudo para injetar ou substituir a query string ?v=...
// Ex: src="js/landing.js" -> src="js/landing.js?v=hash"
// Ex: src="js/landing.js?v=5.20.5" -> src="js/landing.js?v=hash"
const regex = /(href|src)="((?:css|js)\/[^"?]+)(?:\?v=[a-zA-Z0-9.-]+)?"/g;

let updatedContent = content.replace(regex, `$1="$2?v=${autoHash}"`);

if (content !== updatedContent) {
    fs.writeFileSync(indexPath, updatedContent, 'utf8');
    console.log(`[Cache Busting Automático] Versão atualizada para ?v=${autoHash} nos assets do index.html!`);
} else {
    console.log('[Cache Busting Automático] Nenhuma tag js/ ou css/ local encontrada no index.html para atualizar.');
}
