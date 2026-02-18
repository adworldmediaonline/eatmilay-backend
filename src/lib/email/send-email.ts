import { env } from "../../config/env.js";
import { transporter } from "./transporter.js";

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const { to, subject, html, text } = params;

  if (!env.SMTP_USER && !env.SMTP_PASS && env.NODE_ENV === "development") {
    console.log(`[Dev] Email to ${to}: ${subject}`);
    return;
  }

  void transporter.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    html,
    text: text ?? undefined,
  });
}
