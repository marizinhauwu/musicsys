// ══════════════════════════════════════════════════════════════════════════════
// FREQsys Cloud Functions — Proxy seguro para o Bot Discord
// ══════════════════════════════════════════════════════════════════════════════
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();
const db = admin.firestore();

// ─── Secrets (configurados via Firebase CLI ou Console) ───────────────────────
// firebase functions:secrets:set BOT_WEBHOOK_URL
// firebase functions:secrets:set BOT_WEBHOOK_SECRET
const BOT_WEBHOOK_URL = defineSecret("BOT_WEBHOOK_URL");
const BOT_WEBHOOK_SECRET = defineSecret("BOT_WEBHOOK_SECRET");

// ─── Helper: assinatura HMAC-SHA256 ──────────────────────────────────────────
function signPayload(body, secret) {
    return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

// ─── Helper: POST assinado para o Bot ─────────────────────────────────────────
async function signedPost(url, payload, secret) {
    const body = JSON.stringify(payload);
    const signature = signPayload(body, secret);

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-MusicSys-Signature": signature,
        },
        body,
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new HttpsError("internal", `Bot respondeu ${res.status}: ${text}`);
    }

    return res.json();
}

// ══════════════════════════════════════════════════════════════════════════════
// linkDiscordAccount
// Recebe { code } do frontend autenticado.
// Envia para o bot /link-account com HMAC. Se ok, salva discordId no Firestore
// e dispara evento ACCOUNT_LINKED.
// ══════════════════════════════════════════════════════════════════════════════
exports.linkDiscordAccount = onCall(
    { secrets: [BOT_WEBHOOK_URL, BOT_WEBHOOK_SECRET] },
    async (request) => {
        // Auth guard
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Login necessário.");
        }

        const { code } = request.data || {};
        if (!code || typeof code !== "string" || code.length < 4 || code.length > 12) {
            throw new HttpsError("invalid-argument", "Código inválido. Use o código de 8 caracteres gerado pelo /link no Discord.");
        }

        const uid = request.auth.uid;
        const secret = BOT_WEBHOOK_SECRET.value();
        const baseUrl = BOT_WEBHOOK_URL.value(); // ex: http://localhost:3000/events

        // 1. Chamar /link-account no bot
        const linkUrl = baseUrl.replace(/\/events\/?$/, "/link-account");
        const result = await signedPost(linkUrl, { code: code.trim().toUpperCase() }, secret);

        if (!result.ok || !result.discordId) {
            throw new HttpsError("invalid-argument", result.error || "Código inválido ou expirado.");
        }

        const discordId = String(result.discordId);

        // 2. Salvar discordId no Firestore (Admin SDK bypassa rules)
        await db.collection("users").doc(uid).update({ discordId });

        // 3. Buscar plano atual para enviar no ACCOUNT_LINKED
        const userSnap = await db.collection("users").doc(uid).get();
        const userData = userSnap.data() || {};
        const plan = userData.plan || "free";

        // 4. Disparar ACCOUNT_LINKED para o bot (fire-and-forget)
        try {
            await signedPost(baseUrl, {
                type: "ACCOUNT_LINKED",
                data: { discordId, plan, badges: [] },
            }, secret);
        } catch (e) {
            // Não falha a operação por causa disso
            console.warn("[linkDiscordAccount] ACCOUNT_LINKED webhook falhou:", e.message);
        }

        return { ok: true, discordId };
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// unlinkDiscordAccount
// Remove o discordId do Firestore.
// ══════════════════════════════════════════════════════════════════════════════
exports.unlinkDiscordAccount = onCall(
    { secrets: [BOT_WEBHOOK_URL, BOT_WEBHOOK_SECRET] },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Login necessário.");
        }

        const uid = request.auth.uid;

        // Buscar discordId atual antes de remover
        const userSnap = await db.collection("users").doc(uid).get();
        const discordId = userSnap.data()?.discordId;

        // Remover do Firestore
        await db.collection("users").doc(uid).update({
            discordId: admin.firestore.FieldValue.delete(),
        });

        // Notificar bot (fire-and-forget)
        if (discordId) {
            try {
                const secret = BOT_WEBHOOK_SECRET.value();
                const baseUrl = BOT_WEBHOOK_URL.value();
                await signedPost(baseUrl, {
                    type: "ACCOUNT_UNLINKED",
                    data: { discordId },
                }, secret);
            } catch (e) {
                console.warn("[unlinkDiscordAccount] webhook falhou:", e.message);
            }
        }

        return { ok: true };
    }
);

// ══════════════════════════════════════════════════════════════════════════════
// notifyDiscordBot
// Proxy genérico: recebe { type, payload } e envia para /events com HMAC.
// Usado para PROJECT_CREATED, PLAN_CHANGED, BADGE_EARNED, etc.
// ══════════════════════════════════════════════════════════════════════════════
exports.notifyDiscordBot = onCall(
    { secrets: [BOT_WEBHOOK_URL, BOT_WEBHOOK_SECRET] },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "Login necessário.");
        }

        const { type, payload } = request.data || {};
        if (!type || typeof type !== "string") {
            throw new HttpsError("invalid-argument", "Campo 'type' obrigatório.");
        }

        const secret = BOT_WEBHOOK_SECRET.value();
        const baseUrl = BOT_WEBHOOK_URL.value();

        const result = await signedPost(baseUrl, {
            type,
            data: payload || {},
        }, secret);

        return result;
    }
);
