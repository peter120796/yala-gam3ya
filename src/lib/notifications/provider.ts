import "server-only";

/**
 * Channel abstraction. Email ships now; SMS / WhatsApp providers implement the
 * same interface later without touching the reminder logic.
 */
export interface OutboundMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface NotificationProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<{ ok: boolean; error?: string }>;
}

/** Development / default: logs only. Nothing leaves the server. */
class ConsoleProvider implements NotificationProvider {
  readonly name = "console";
  async send(m: OutboundMessage) {
    console.info(`[notifications:console] to=${m.to.replace(/(^.).*(@.*$)/, "$1***$2")} subject="${m.subject}"`);
    return { ok: true };
  }
}

class ResendProvider implements NotificationProvider {
  readonly name = "resend";
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  async send(m: OutboundMessage) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
    });
    return res.ok ? { ok: true } : { ok: false, error: `resend ${res.status}` };
  }
}

/**
 * Real email is sent ONLY when explicitly enabled (NOTIFICATIONS_EMAIL_ENABLED=true)
 * and configured — never by accident in development.
 */
export function getEmailProvider(): NotificationProvider {
  const enabled = process.env.NOTIFICATIONS_EMAIL_ENABLED === "true";
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (enabled && key && from) return new ResendProvider(key, from);
  return new ConsoleProvider();
}
