import { env } from "../config/env.js";
import { transporter } from "../lib/email/transporter.js";

export async function sendVerificationOTP(params: {
  email: string;
  otp: string;
  type: "sign-in" | "email-verification" | "forget-password";
}): Promise<void> {
  const { email, otp, type } = params;

  const subjectMap = {
    "sign-in": "Your sign-in code",
    "email-verification": "Verify your email address",
    "forget-password": "Reset your password",
  } as const;

  const textMap = {
    "sign-in": `Your sign-in code is: ${otp}. This code expires in 5 minutes.`,
    "email-verification": `Your verification code is: ${otp}. Enter this code to verify your email. This code expires in 5 minutes.`,
    "forget-password": `Your password reset code is: ${otp}. Enter this code to reset your password. This code expires in 5 minutes.`,
  } as const;

  const subject = subjectMap[type];
  const text = textMap[type];

  if (!env.SMTP_USER && !env.SMTP_PASS && env.NODE_ENV === "development") {
    console.log(`[Dev] OTP for ${email} (${type}): ${otp}`);
    return;
  }

  void transporter.sendMail({
    from: env.EMAIL_FROM,
    to: email,
    subject,
    text,
  });
}
