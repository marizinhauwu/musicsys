const fs = require('fs');
const path = require('path');

console.log('--- Iniciando injeção de Vercel Environment Variables no env.js ---');

const envPath = path.join(__dirname, 'js', 'env.js');
if (fs.existsSync(envPath)) {
    let content = fs.readFileSync(envPath, 'utf8');

    const vars = [
        'FIREBASE_API_KEY',
        'FIREBASE_AUTH_DOMAIN',
        'FIREBASE_PROJECT_ID',
        'FIREBASE_STORAGE_BUCKET',
        'FIREBASE_MESSAGING_SENDER_ID',
        'FIREBASE_APP_ID'
    ];

    let replacedCount = 0;
    vars.forEach(v => {
        if (process.env[v]) {
            // Regex global para pegar todas as ocorrências {{VAR}}
            const regex = new RegExp(`\\{\\{${v}\\}\\}`, 'g');
            content = content.replace(regex, process.env[v]);
            replacedCount++;
        }
    });

    fs.writeFileSync(envPath, content);
    console.log(`✅ Injetadas ${replacedCount} variáveis de ambiente com sucesso.`);
} else {
    console.warn('⚠️ js/env.js não encontrado.');
}
