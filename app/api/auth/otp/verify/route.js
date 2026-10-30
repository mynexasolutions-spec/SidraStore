import { NextResponse } from "next/server";
import { getSafeNextPath, isValidEmail, isValidOtp, matchesOtp, normalizeEmail, OTP_MAX_ATTEMPTS } from "@/lib/customerOtp";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function findAuthUserByEmail(admin, email) {
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user;
    if (!data.users.length || data.users.length < 1000 || (data.lastPage && page >= data.lastPage)) return null;
  }

  throw new Error("Could not finish looking up the Supabase Auth user.");
}

export async function POST(request) {
  try {
    const body = await request.json();
    const intent = body?.intent === "register" ? "register" : body?.intent === "login" ? "login" : "";
    const email = normalizeEmail(body?.email);
    const code = String(body?.code || "").trim();
    const nextPath = getSafeNextPath(body?.nextPath);

    if (!intent || !isValidEmail(email) || !isValidOtp(code)) {
      return NextResponse.json({ error: "Enter the six-digit verification code." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: challenge, error: challengeError } = await admin
      .from("email_otp_challenges")
      .select("id,email,purpose,full_name,code_hash,attempts,expires_at")
      .eq("email", email)
      .eq("purpose", intent)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (challengeError) throw challengeError;
    if (!challenge || new Date(challenge.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "That code is invalid or has expired. Request a new code." }, { status: 400 });
    }
    if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
      return NextResponse.json({ error: "Too many incorrect attempts. Request a new code." }, { status: 429 });
    }

    if (!matchesOtp(code, challenge.code_hash)) {
      const attempts = challenge.attempts + 1;
      const { error: attemptError } = await admin
        .from("email_otp_challenges")
        .update({ attempts })
        .eq("id", challenge.id)
        .is("consumed_at", null);
      if (attemptError) throw attemptError;

      return NextResponse.json({
        error: attempts >= OTP_MAX_ATTEMPTS
          ? "Too many incorrect attempts. Request a new code."
          : "That code is incorrect. Please try again.",
      }, { status: attempts >= OTP_MAX_ATTEMPTS ? 429 : 400 });
    }

    const { data: claimedChallenge, error: claimError } = await admin
      .from("email_otp_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", challenge.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimedChallenge) return NextResponse.json({ error: "That code has already been used. Request a new code." }, { status: 400 });

    let user = await findAuthUserByEmail(admin, email);
    if (intent === "register" && user) {
      return NextResponse.json({ error: "An account with this email already exists. Please log in instead." }, { status: 409 });
    }
    if (intent === "login" && !user) {
      return NextResponse.json({ error: "No account was found for this email. Please register first." }, { status: 404 });
    }

    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: challenge.full_name },
      });
      if (error) throw error;
      user = data.user;
    } else if (!user.email_confirmed_at) {
      const { data, error } = await admin.auth.admin.updateUserById(user.id, { email_confirm: true });
      if (error) throw error;
      user = data.user;
    }

    const requestUrl = new URL(request.url);
    const redirectTo = `${requestUrl.origin}/auth/confirm?next=${encodeURIComponent(nextPath)}`;
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (linkError) throw linkError;

    const tokenHash = linkData.properties?.hashed_token;
    const verificationType = linkData.properties?.verification_type || "magiclink";
    if (!tokenHash) throw new Error("Supabase did not return a magic-link token.");

    const supabase = createServerClient();
    const { error: sessionError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: verificationType,
    });
    if (sessionError) throw sessionError;

    return NextResponse.json({ ok: true, nextPath });
  } catch (error) {
    console.error("[auth/otp/verify] Unable to verify OTP", error);
    return NextResponse.json({ error: "We could not complete sign-in. Please request a new code and try again." }, { status: 500 });
  }
}
