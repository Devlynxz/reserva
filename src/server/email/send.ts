import "server-only";
import { render } from "@react-email/components";
import type { ReactElement } from "react";
import { Resend } from "resend";
import { env } from "../env";

export type SendResult = { status: "sent"; id: string } | { status: "skipped" } | { status: "failed"; error: string };

let client: Resend | null = null;

/**
 * Send one email via Resend. Without RESEND_API_KEY it's a logged no-op, so local dev and
 * clients without email set up keep working. Never throws: callers are booking flows and
 * webhooks, which must not fail because an email didn't go out.
 */
export async function sendEmail(message: { to: string; subject: string; react: ReactElement; replyTo?: string }): Promise<SendResult> {
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    console.info(`[email skipped: RESEND_API_KEY not set] "${message.subject}"`);
    return { status: "skipped" };
  }
  try {
    client ??= new Resend(RESEND_API_KEY);
    const { data, error } = await client.emails.send({
      from: EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      react: message.react,
      // A plain-text part helps deliverability and accessibility.
      text: await render(message.react, { plainText: true }),
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });
    if (error || !data) return { status: "failed", error: error?.message ?? "No response from Resend" };
    return { status: "sent", id: data.id };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}
