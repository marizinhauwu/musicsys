// Variáveis de ambiente do Firebase — injetadas em tempo de build/deploy.
// Em produção (Vercel), os placeholders {{...}} são substituídos automaticamente.
// Em desenvolvimento local, substitua manualmente ou use um .env.local.
window.__env = {
    FIREBASE_API_KEY: '{{FIREBASE_API_KEY}}',
    FIREBASE_AUTH_DOMAIN: '{{FIREBASE_AUTH_DOMAIN}}',
    FIREBASE_PROJECT_ID: '{{FIREBASE_PROJECT_ID}}',
    FIREBASE_STORAGE_BUCKET: '{{FIREBASE_STORAGE_BUCKET}}',
    FIREBASE_MESSAGING_SENDER_ID: '{{FIREBASE_MESSAGING_SENDER_ID}}',
    FIREBASE_APP_ID: '{{FIREBASE_APP_ID}}'
};
