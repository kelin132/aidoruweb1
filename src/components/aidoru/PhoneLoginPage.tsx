import { useCallback, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, KeyRound, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { sessionKey, useSession } from "./session";
import { createAccount, phoneLogin, requestPasswordReset, resetPassword, verifyPhone } from "@/lib/aidoru.functions";
import type { PublicUser } from "@/lib/game";

type Screen = "login" | "create" | "forgot" | "verify";
type VerificationFlow = "login" | "signup" | "reset";

export function PhoneLoginPage() {
  const [screen, setScreen] = useState<Screen>("login");
  const [flow, setFlow] = useState<VerificationFlow>("login");
  const [countryCode, setCountryCode] = useState("263");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [trainerName, setTrainerName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState("");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const loginFn = useServerFn(phoneLogin);
  const createFn = useServerFn(createAccount);
  const verifyFn = useServerFn(verifyPhone);
  const requestResetFn = useServerFn(requestPasswordReset);
  const resetFn = useServerFn(resetPassword);

  const finishAuth = useCallback((user: PublicUser) => {
    queryClient.setQueryData(sessionKey, user);
    toast.success(`Welcome, ${user.name}`);
    const destination = safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"));
    if (destination) window.location.assign(destination);
    else void navigate({ to: "/dashboard", replace: true });
  }, [navigate, queryClient]);

  useEffect(() => {
    if (!session) return;
    const destination = safeReturnTo(new URLSearchParams(window.location.search).get("returnTo"));
    if (destination) window.location.replace(destination);
    else void navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "create" || params.get("discord") === "register") {
      setScreen("create");
      setNotice("");
    }
    if (params.get("discord") === "link") {
      setNotice("Sign in with your WhatsApp number, then connect Discord from your profile.");
    }
  }, []);

  const login = useMutation({
    mutationFn: async () => {
      requirePhone(phoneNumber);
      requirePassword(password);
      return loginFn({ data: { countryCode, phoneNumber, password } });
    },
    onSuccess: (result) => {
      if (result.status === "verified") {
        finishAuth(result.user);
        return;
      }
      setFlow("login");
      setNotice(`Enter the code sent to ${result.maskedPhone}. If needed, use .otp in a bot group to receive it there.`);
      setScreen("verify");
    },
    onError: (error: Error) => toast.error(error.message || "Could not sign in."),
  });

  const create = useMutation({
    mutationFn: async () => {
      requirePhone(phoneNumber);
      requirePassword(password);
      if (trainerName.trim().length < 2) throw new Error("Enter a trainer name.");
      if (password !== confirmPassword) throw new Error("Passwords do not match.");
      return createFn({ data: { countryCode, phoneNumber, name: trainerName.trim(), password } });
    },
    onSuccess: (result) => {
      if (result.status === "verified") {
        finishAuth(result.user);
        return;
      }
      setFlow("signup");
      setNotice(`Enter the code sent to ${result.maskedPhone}. If needed, use .otp in a bot group to receive it there.`);
      setScreen("verify");
    },
    onError: (error: Error) => toast.error(error.message || "Could not create the account."),
  });

  const requestReset = useMutation({
    mutationFn: async () => {
      requirePhone(phoneNumber);
      requirePassword(password);
      if (password !== confirmPassword) throw new Error("Passwords do not match.");
      return requestResetFn({ data: { countryCode, phoneNumber, password } });
    },
    onSuccess: (result) => {
      setFlow("reset");
      setNotice(`Enter the reset code sent to ${result.maskedPhone}. If needed, use .otp in a bot group to receive it there.`);
      setScreen("verify");
    },
    onError: (error: Error) => toast.error(error.message || "Could not start password recovery."),
  });

  const verify = useMutation({
    mutationFn: async () => {
      if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit code.");
      if (flow === "reset") {
        return resetFn({ data: { countryCode, phoneNumber, code } });
      }
      return verifyFn({ data: { countryCode, phoneNumber, code } });
    },
    onSuccess: finishAuth,
    onError: (error: Error) => toast.error(error.message || "That code could not be verified."),
  });

  const busy = login.isPending || create.isPending || requestReset.isPending || verify.isPending;
  const title = screen === "login"
    ? "Sign in"
    : screen === "create"
      ? "Create account"
      : screen === "forgot"
        ? "Reset password"
        : "Verify number";

  return (
    <main className="phone-auth">
      <div className="phone-auth-glow" aria-hidden="true" />
      <header className="phone-auth-header">
        <a href="/" className="phone-auth-brand">AIDORU</a>
        <a href="/" className="phone-auth-home"><ArrowLeft className="size-4" /> Home</a>
      </header>
      <section className="phone-auth-card">
        <p className="phone-auth-label">TRAINER ACCOUNT</p>
        <h1>{title}</h1>
        <p className="phone-auth-hint">
          {screen === "verify" ? notice : "Use your WhatsApp phone number."}
        </p>

        {screen === "login" && (
          <form onSubmit={(event) => { event.preventDefault(); login.mutate(); }}>
            <PhoneField
              countryCode={countryCode}
              setCountryCode={setCountryCode}
              phoneNumber={phoneNumber}
              setPhoneNumber={setPhoneNumber}
            />
            <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
            <button className="phone-auth-submit" disabled={busy}>
              {login.isPending ? "Signing in…" : "Sign in"}
            </button>
            <div className="phone-auth-links">
              <button type="button" onClick={() => { setNotice(""); setScreen("forgot"); }}>
                Forgot password?
              </button>
              <button type="button" onClick={() => { setNotice(""); setScreen("create"); }}>
                Create account <ArrowUpRight className="size-3" />
              </button>
            </div>
          </form>
        )}

        {screen === "create" && (
          <form onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
            <TextField label="Trainer name" value={trainerName} onChange={setTrainerName} placeholder="Name" autoComplete="nickname" />
            <PhoneField
              countryCode={countryCode}
              setCountryCode={setCountryCode}
              phoneNumber={phoneNumber}
              setPhoneNumber={setPhoneNumber}
            />
            <PasswordField label="Password" value={password} onChange={setPassword} autoComplete="new-password" />
            <PasswordField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
            <button className="phone-auth-submit" disabled={busy}>
              {create.isPending ? "Creating…" : "Create account"}
            </button>
            <div className="phone-auth-links">
              <button type="button" onClick={() => { setNotice(""); setScreen("login"); }}>Back to sign in</button>
            </div>
          </form>
        )}

        {screen === "forgot" && (
          <form onSubmit={(event) => { event.preventDefault(); requestReset.mutate(); }}>
            <PhoneField
              countryCode={countryCode}
              setCountryCode={setCountryCode}
              phoneNumber={phoneNumber}
              setPhoneNumber={setPhoneNumber}
            />
            <PasswordField label="New password" value={password} onChange={setPassword} autoComplete="new-password" />
            <PasswordField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />
            <button className="phone-auth-submit" disabled={busy}>
              {requestReset.isPending ? "Sending code…" : "Send reset code"}
            </button>
            <div className="phone-auth-links">
              <button type="button" onClick={() => { setNotice(""); setScreen("login"); }}>Back to sign in</button>
            </div>
          </form>
        )}

        {screen === "verify" && (
          <form onSubmit={(event) => { event.preventDefault(); verify.mutate(); }}>
            <label className="phone-auth-field">
              <span>Six-digit code</span>
              <span className="phone-auth-input-wrap">
                <MessageCircle className="size-4" />
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </span>
            </label>
            <button className="phone-auth-submit" disabled={busy}>
              {verify.isPending ? "Verifying…" : "Verify"}
            </button>
            <div className="phone-auth-links">
              <button type="button" onClick={() => { setNotice(""); setScreen(flow === "signup" ? "create" : "login"); }}>
                Back
              </button>
            </div>
          </form>
        )}
        {screen !== "verify" && notice && <p className="phone-auth-notice">{notice}</p>}
      </section>
    </main>
  );
}

function PhoneField({
  countryCode,
  setCountryCode,
  phoneNumber,
  setPhoneNumber,
}: {
  countryCode: string;
  setCountryCode: (value: string) => void;
  phoneNumber: string;
  setPhoneNumber: (value: string) => void;
}) {
  return (
    <label className="phone-auth-field">
      <span>WhatsApp number</span>
      <span className="phone-auth-phone">
        <span className="phone-auth-country">
          <b>+</b>
          <input
            aria-label="Country code"
            value={countryCode}
            onChange={(event) => setCountryCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            autoComplete="tel-country-code"
          />
        </span>
        <input
          aria-label="Phone number"
          value={phoneNumber}
          onChange={(event) => setPhoneNumber(event.target.value.replace(/\D/g, "").slice(0, 15))}
          placeholder="Phone number"
          inputMode="tel"
          autoComplete="tel-national"
        />
      </span>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
}) {
  return (
    <label className="phone-auth-field">
      <span>{label}</span>
      <span className="phone-auth-input-wrap">
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} autoComplete={autoComplete} />
      </span>
    </label>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
}) {
  return (
    <label className="phone-auth-field">
      <span>{label}</span>
      <span className="phone-auth-input-wrap">
        <KeyRound className="size-4" />
        <input type="password" value={value} onChange={(event) => onChange(event.target.value)} placeholder="••••••••" autoComplete={autoComplete} />
      </span>
    </label>
  );
}

function requirePhone(phoneNumber: string) {
  if (!phoneNumber.trim()) throw new Error("Enter your WhatsApp phone number.");
}

function requirePassword(password: string) {
  if (password.length < 8) throw new Error("Password must be at least 8 characters.");
}

function safeReturnTo(value: string | null): string | null {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  try {
    const origin = "https://aidoru.invalid";
    const target = new URL(value, origin);
    if (target.origin !== origin || target.pathname === "/login" || target.pathname.startsWith("/login/")) return null;
    if (target.pathname === "/battle" || target.pathname.startsWith("/battle/")) {
      const path = target.pathname.startsWith("/battle/") ? target.pathname : "/battle";
      const room = target.searchParams.get("room") || target.searchParams.get("code");
      return path === "/battle" && room ? `/battle/${encodeURIComponent(room)}` : path;
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}
