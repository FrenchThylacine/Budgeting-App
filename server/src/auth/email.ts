/**
 * Transactional email through Resend's HTTP API.
 *
 * Called with `fetch` rather than the `resend` SDK: the API is one POST, and
 * @vercel/node traces and transpiles the module graph in place, so every
 * dependency added is another thing that can fail to resolve at runtime. Node
 * 18+ has `fetch` built in.
 */

export interface SendResult {
  /** Whether the provider accepted the message. */
  delivered: boolean;
  /** Why it was not sent — for logs only, never for the HTTP response. */
  reason?: string;
}

function fromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? "Budget App <onboarding@resend.dev>";
}

/**
 * Send a password-reset link.
 *
 * When `RESEND_API_KEY` is absent this does not throw and does not fail the
 * request. The caller answers identically whether or not mail was sent, so a
 * missing key must not become an observable difference — that would turn the
 * reset endpoint into an account-existence oracle. In development the link is
 * logged instead, which is the only way to complete a reset without a provider.
 */
export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[auth] RESEND_API_KEY not set. Password reset link for ${to}: ${resetUrl}`);
    } else {
      console.warn("[auth] RESEND_API_KEY not set; password reset email was not sent.");
    }
    return { delivered: false, reason: "RESEND_API_KEY not configured" };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [to],
        subject: "Reset your Budget App password",
        text: resetText(resetUrl),
        html: resetHtml(resetUrl),
      }),
    });

    if (!response.ok) {
      // The body can name the account; keep it out of the log.
      return { delivered: false, reason: `Resend responded ${response.status}` };
    }
    return { delivered: true };
  } catch (error) {
    // A provider outage must not surface as a 500: the user would learn nothing
    // useful and the endpoint's response would start varying by account.
    return { delivered: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function resetText(resetUrl: string): string {
  return [
    "Someone asked to reset the password for your Budget App account.",
    "",
    "Open this link to choose a new one:",
    resetUrl,
    "",
    "The link works once and expires in 30 minutes.",
    "If this wasn't you, ignore this email — your password has not changed.",
  ].join("\n");
}

function resetHtml(resetUrl: string): string {
  // Inline styles and a plain table: email clients strip <style> blocks and
  // support little CSS. The URL is also shown as text, because some clients
  // will not make a button clickable.
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#F4F6F9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0B1F3A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#FFFFFF;border-radius:12px;padding:32px">
    <tr><td>
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:600">Reset your password</h1>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6">
        Someone asked to reset the password for your Budget App account.
      </p>
      <p style="margin:0 0 24px">
        <a href="${escapeAttribute(resetUrl)}"
           style="display:inline-block;background:#0B1F3A;color:#FFFFFF;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600">
          Choose a new password
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#54617A">
        Or paste this link into your browser:
      </p>
      <p style="margin:0 0 24px;font-size:13px;word-break:break-all;color:#54617A">
        ${escapeText(resetUrl)}
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#54617A">
        The link works once and expires in 30 minutes.
        If this wasn't you, ignore this email — your password has not changed.
      </p>
    </td></tr>
  </table>
</body></html>`;
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, "&quot;");
}
