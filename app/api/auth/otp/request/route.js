import { NextResponse } from "next/server";
import { sendOtpEmail } from "@/lib/brevo";
import {
  createOtp,
  getOtpExpiry,
  isValidEmail,
  normalizeEmail,
  OTP_RESEND_COOLDOWN_SECONDS,
  validateFullName,
} from "@/lib/customerOtp";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const intent = body?.intent === "register" ? "register" : body?.intent === "login" ? "login" : "";
    const email = normalizeEmail(body?.email);
    const fullName = intent === "register" ? validateFullName(body?.fullName) : null;

    if (!intent || !isValidEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (intent === "register" && typeof fullName !== "string") {
      return NextResponse.json({ error: fullName }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: recentChallenge, error: recentChallengeError } = await admin
      .from("email_otp_challenges")
      .select("id,created_at")
      .eq("email", email)
      .eq("purpose", intent)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentChallengeError) throw recentChallengeError;

    if (recentChallenge && Date.now() - new Date(recentChallenge.created_at).getTime() < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
      return NextResponse.json({ error: "Please wait a moment before requesting another code." }, { status: 429 });
    }

    const { error: deleteError } = await admin
      .from("email_otp_challenges")
      .delete()
      .eq("email", email)
      .eq("purpose", intent);
    if (deleteError) throw deleteError;

    const { code, codeHash } = createOtp();
    const { data: challenge, error: insertError } = await admin
      .from("email_otp_challenges")
      .insert({
        email,
        purpose: intent,
        full_name: fullName,
        code_hash: codeHash,
        expires_at: getOtpExpiry(),
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    try {
      await sendOtpEmail({ email, fullName, code, intent });
    } catch (error) {
      await admin.from("email_otp_challenges").delete().eq("id", challenge.id);
      throw error;
    }

    return NextResponse.json({ ok: true, message: "A verification code has been sent to your email." });
  } catch (error) {
    console.error("[auth/otp/request] Unable to send OTP", error);
    return NextResponse.json({ error: "We could not send the verification code. Please try again." }, { status: 500 });
  }
}
