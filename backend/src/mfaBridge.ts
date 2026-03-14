import { randomUUID } from 'crypto';

interface MfaBridgeSession {
  id: string;
  verifyUrl: string;
  requestToken: string;
  expiresAt: number;
}

const SESSION_TTL_MS = 10 * 60 * 1000;
const sessions = new Map<string, MfaBridgeSession>();

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(id);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createMfaBridgeSession(verifyUrl: string, requestToken: string): MfaBridgeSession {
  cleanupExpiredSessions();

  const session: MfaBridgeSession = {
    id: randomUUID(),
    verifyUrl,
    requestToken,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  sessions.set(session.id, session);
  return session;
}

export function getMfaBridgeSession(sessionId: string): MfaBridgeSession | null {
  cleanupExpiredSessions();
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

export function renderMfaBridgeHtml(session: MfaBridgeSession): string {
  const escapedVerifyUrl = escapeHtml(session.verifyUrl);
  const escapedRequestToken = escapeHtml(session.requestToken);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MuleOps Verification</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: #091428;
        --card: #13213a;
        --text: #f5f7fb;
        --muted: #b8c4d9;
        --accent: #00a1e0;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(180deg, #091428 0%, #0e1d34 100%);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: 24px;
      }

      .card {
        width: min(100%, 460px);
        background: rgba(19, 33, 58, 0.94);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        padding: 28px;
        box-sizing: border-box;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.35);
      }

      h1 {
        margin: 0 0 12px;
        font-size: 24px;
        line-height: 1.2;
      }

      p {
        margin: 0 0 12px;
        color: var(--muted);
        line-height: 1.6;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        margin-top: 20px;
        background: var(--accent);
        color: #08111f;
        border: none;
        border-radius: 14px;
        font-size: 16px;
        font-weight: 600;
        padding: 14px 18px;
        cursor: pointer;
      }

      .hint {
        margin-top: 14px;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <form id="verify-form" action="${escapedVerifyUrl}" method="post">
      <input type="hidden" name="request" value="${escapedRequestToken}" />
      <div class="card">
        <h1>Continue verification in your browser</h1>
        <p>MuleOps is handing off this security check to your device browser so built-in authenticators like Face ID, Touch ID, and passkeys can work correctly.</p>
        <p>If the verification page does not start automatically, tap the button below.</p>
        <button class="button" type="submit">Open verification</button>
        <p class="hint">After you approve the request, return to MuleOps to finish signing in.</p>
      </div>
    </form>
    <script>
      window.setTimeout(function () {
        var form = document.getElementById('verify-form');
        if (form) {
          form.submit();
        }
      }, 100);
    </script>
  </body>
</html>`;
}
