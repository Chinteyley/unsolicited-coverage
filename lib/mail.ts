import { Resend } from "resend";

import { inboundAddress, resendEnv } from "@/lib/env";
import type { ReceivedAttachment } from "@/lib/types";

let resend: Resend | null = null;

export function resendClient(): Resend {
  if (!resend) {
    resend = new Resend(resendEnv().apiKey);
  }
  return resend;
}

export function parseFromAddress(from: string): string {
  const angled = from.match(/<([^>]+)>/);
  return (angled?.[1] ?? from).trim();
}

export function isOurOwnAddress(from: string): boolean {
  const inbound = inboundAddress().toLowerCase();
  return parseFromAddress(from).toLowerCase() === inbound;
}

export type ReceivedEmail = {
  id: string;
  from: string;
  subject: string;
  text?: string | null;
  html?: string | null;
  reply_to?: string[] | null;
  message_id?: string | null;
  attachments?: ReceivedAttachment[] | null;
};

export async function fetchReceivedEmail(emailId: string): Promise<ReceivedEmail> {
  const { data, error } = await resendClient().emails.receiving.get(emailId);
  if (error || !data) {
    throw new Error(error?.message ?? "Failed to fetch received email");
  }

  const attachments = await listAttachmentLinks(emailId, data.attachments);

  return {
    id: data.id,
    from: data.from,
    subject: data.subject ?? "",
    text: data.text,
    html: data.html,
    reply_to: data.reply_to,
    message_id: data.message_id,
    attachments,
  };
}

async function listAttachmentLinks(
  emailId: string,
  embedded?: ReceivedAttachment[] | null,
): Promise<ReceivedAttachment[]> {
  const { data, error } =
    await resendClient().emails.receiving.attachments.list({ emailId });
  if (error || !data) {
    return embedded ?? [];
  }

  const listed = data.data.map((attachment) => ({
    id: attachment.id,
    filename: attachment.filename,
    content_type: attachment.content_type,
    download_url: attachment.download_url,
  }));

  return listed.length > 0 ? listed : (embedded ?? []);
}

export async function sendDeskEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  messageId?: string;
}) {
  const { from } = resendEnv();
  const headers: Record<string, string> = {};
  if (input.messageId) {
    headers["In-Reply-To"] = input.messageId;
    headers["References"] = input.messageId;
  }

  const { error } = await resendClient().emails.send(
    {
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
      headers,
    },
    { idempotencyKey: input.idempotencyKey },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export function replyAddress(email: ReceivedEmail): string {
  const hinted = email.reply_to?.find(Boolean);
  return parseFromAddress(hinted ?? email.from);
}
