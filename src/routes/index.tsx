import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, ChevronDown, Eye, EyeOff, LockKeyhole, Menu, ShieldCheck, Sparkles, Swords, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { ConnectionNotice } from "@/components/aidoru/ConnectionNotice";
import { sessionKey, useSession } from "@/components/aidoru/session";
import { login, requestPasswordReset, resetPassword, verifyPhone } from "@/lib/aidoru.functions";
import type { PublicUser } from "@/lib/game";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AIDORU — Trainer access" },
      { name: "description", content: "Secure access to your AIDORU trainer profile." },
      { property: "og:title", content: "AIDORU — Trainer access" },
    ],
    links: [{ rel: "preload", href: "/aidoru-login-anime.webp", as: "image", type: "image/webp" }],
  }),
  component: Portal,
});

type Country = { code: string; name: string; flag: string };
type AuthMode = "login" | "reset";
type Verification = { kind: "verify" | "reset"; maskedPhone: string; expiresAt: string };
type PhoneStartResult =
  | { status: "verified"; user: PublicUser }
  | { status: "verification_required"; phoneNumber: string; maskedPhone: string; expiresAt: string }
  | { phoneNumber: string; maskedPhone: string; expiresAt: string };

const COUNTRIES: Country[] = [
  { code: "+27", name: "South Africa", flag: "🇿🇦" },
  { code: "+263", name: "Zimbabwe", flag: "🇿🇼" },
  { code: "+234", name: "Nigeria", flag: "🇳🇬" },
  { code: "+254", name: "Kenya", flag: "🇰🇪" },
  { code: "+255", name: "Tanzania", flag: "🇹🇿" },
  { code: "+256", name: "Uganda", flag: "🇺🇬" },
  { code: "+233", name: "Ghana", flag: "🇬🇭" },
  { code: "+20", name: "Egypt", flag: "🇪🇬" },
  { code: "+212", name: "Morocco", flag: "🇲🇦" },
  { code: "+213", name: "Algeria", flag: "🇩🇿" },
  { code: "+44", name: "United Kingdom", flag: "🇬🇧" },
  { code: "+353", name: "Ireland", flag: "🇮🇪" },
  { code: "+33", name: "France", flag: "🇫🇷" },
  { code: "+49", name: "Germany", flag: "🇩🇪" },
  { code: "+39", name: "Italy", flag: "🇮🇹" },
  { code: "+34", name: "Spain", flag: "🇪🇸" },
  { code: "+31", name: "Netherlands", flag: "🇳🇱" },
  { code: "+351", name: "Portugal", flag: "🇵🇹" },
  { code: "+7", name: "Russia", flag: "🇷🇺" },
  { code: "+90", name: "Türkiye", flag: "🇹🇷" },
  { code: "+91", name: "India", flag: "🇮🇳" },
  { code: "+92", name: "Pakistan", flag: "🇵🇰" },
  { code: "+880", name: "Bangladesh", flag: "🇧🇩" },
  { code: "+81", name: "Japan", flag: "🇯🇵" },
  { code: "+82", name: "South Korea", flag: "🇰🇷" },
  { code: "+86", name: "China", flag: "🇨🇳" },
  { code: "+61", name: "Australia", flag: "🇦🇺" },
  { code: "+64", name: "New Zealand", flag: "🇳🇿" },
  { code: "+1", name: "United States", flag: "🇺🇸" },
  { code: "+1", name: "Canada", flag: "🇨🇦" },
  { code: "+52", name: "Mexico", flag: "🇲🇽" },
  { code: "+55", name: "Brazil", flag: "🇧🇷" },
  { code: "+54", name: "Argentina", flag: "🇦🇷" },
];

function Portal() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [scrollY, setScrollY] = useState(0);
  const [countryKey, setCountryKey] = useState("South Africa|+27");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [verification, setVerification] = useState<Verification | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, error: sessionError } = useSession();
  const doLogin = useServerFn(login);
  const doVerify = useServerFn(verifyPhone);
  const doResetRequest = useServerFn(requestPasswordReset);
  const doReset = useServerFn(resetPassword);
  const selectedCountry = useMemo(() => COUNTRIES.find((country) => `${country.name}|${country.code}` === countryKey) ?? COUNTRIES[0]!, [countryKey]);
  const countryCode = selectedCountry.code;

  const finishLogin = (user: PublicUser) => {
    queryClient.setQueryData(sessionKey, user);
    toast.success(`Welcome, ${user.name}`);
    const returnTo = new URLSearchParams(window.location.search).get("returnTo");
    const destination = normalizeBattleDestination(returnTo);
    if (destination) window.location.assign(destination);
    else void navigate({ to: "/dashboard" });
  };

  const submit = useMutation<PhoneStartResult>({
    mutationFn: () => {
      const digits = phoneNumber.replace(/\D/g, "");
      if (digits.length < 5) throw new Error("Enter a valid WhatsApp number.");
      if (password.length < 1) throw new Error("Enter a password.");
      return mode === "reset"
        ? doResetRequest({ data: { countryCode, phoneNumber: digits, password } })
        : doLogin({ data: { countryCode, phoneNumber: digits, password } });
    },
    onSuccess: (result) => {
      if (mode === "reset") {
        const resetResult = result as { maskedPhone: string; expiresAt: string };
        setVerification({ kind: "reset", maskedPhone: resetResult.maskedPhone, expiresAt: resetResult.expiresAt });
        setCode("");
        toast.success("Reset code requested. Send .code to the bot.");
      } else if ("status" in result && result.status === "verification_required") {
        setVerification({ kind: "verify", maskedPhone: result.maskedPhone, expiresAt: result.expiresAt });
        setCode("");
        toast.success("Verification code requested. Send .code to the bot.");
      } else if ("status" in result && result.status === "verified") {
        finishLogin(result.user);
      } else {
        throw new Error("The login response was incomplete. Please try again.");
      }
    },
    onError: (error: Error) => toast.error(error.message || "Unable to continue."),
  });

  const verify = useMutation({
    mutationFn: () => {
      if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit code from WhatsApp.");
      const data = { countryCode, phoneNumber, code };
      return verification?.kind === "reset" ? doReset({ data }) : doVerify({ data });
    },
    onSuccess: (user) => finishLogin(user),
    onError: (error: Error) => toast.error(error.message || "The code could not be accepted."),
  });

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!session) return;
    const returnTo = new URLSearchParams(window.location.search).get("returnTo");
    const destination = normalizeBattleDestination(returnTo);
    if (destination) {
      // Keep a shared battle invite intact when the trainer was already
      // signed in in another tab or the session query resolves before the
      // login form is submitted.
      window.location.replace(destination);
      return;
    }
    void navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  if (sessionError) return <ConnectionNotice onRetry={() => window.location.reload()} />;

  const verificationMinutes = verification
    ? Math.max(0, Math.ceil((new Date(verification.expiresAt).getTime() - Date.now()) / 60_000))
    : 0;
  const isBusy = submit.isPending || verify.isPending;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#04131b] text-white">
      <div
        className="landing-bg-bloom pointer-events-none absolute inset-0"
        style={{ transform: `translate3d(0, ${Math.min(scrollY * 0.12, 70)}px, 0) scale(1.03)` }}
      />
      <div
        className="landing-character-scene pointer-events-none absolute inset-x-0 bottom-0 h-[66vh]"
        style={{ transform: `translate3d(0, ${Math.min(scrollY * 0.2, 110)}px, 0)` }}
      />
      <div className="landing-bg-shade pointer-events-none absolute inset-0" />
      <div className="landing-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="landing-orb landing-orb-cyan pointer-events-none absolute -left-20 top-24 size-80 rounded-full blur-3xl" />
      <div className="landing-orb landing-orb-rose pointer-events-none absolute right-[-10rem] top-[-6rem] size-[28rem] rounded-full blur-3xl" />
      <div className="landing-leaves pointer-events-none absolute inset-0" aria-hidden="true">
        {Array.from({ length: 16 }, (_, index) => (
          <span key={index} className={`landing-leaf landing-leaf-${index + 1}`} />
        ))}
      </div>
      <button
        type="button"
        aria-label="Open menu"
        className="landing-menu absolute left-6 top-6 z-20 grid size-14 place-items-center rounded-full border border-white/20 bg-black/35 backdrop-blur-xl sm:left-10 sm:top-10"
      >
        <Menu className="size-7" />
      </button>

      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-6 pb-10 pt-24 sm:px-10 lg:grid-cols-[1fr_0.92fr] lg:gap-16 lg:px-14 lg:py-14">
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65 }}
          className="relative z-10 text-center lg:text-left"
        >
          <h1 className="landing-title mt-0">
            WELCOME TO
            <br />
            <span className="text-cyan-300">AIDORU</span>
          </h1>
          <p className="landing-copy mx-auto mt-6 max-w-xl lg:mx-0">
            The anime-powered home for your bot life. Raise your Pokémon, build your party, spend
            your coins, and meet your community in one glowing trainer world.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
            <Feature icon={Sparkles} label="Your Journey" copy="Live party and Pokémon progress" />
            <Feature icon={WalletCards} label="Your Economy" copy="Shop, wallet and rewards" />
            <Feature icon={Swords} label="Your Arcade" copy="Virtual-coin games and bets" />
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.65, delay: 0.08 }}
          className="relative z-10 lg:justify-self-end lg:w-full lg:max-w-[32rem]"
        >
          <div className="landing-login-card rounded-[2rem] border border-white/15 p-6 shadow-2xl sm:p-9">
            {!verification ? (
              <>
                <div className="mb-7">
                  <p className="landing-kicker">AIDORU TRAINER PORTAL</p>
                  <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">
                    {mode === "reset" ? "Set a new password." : "Open your world"}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    {mode === "reset"
                      ? "Choose a new password, then confirm it with a code from WhatsApp."
                      : "Use the same trainer identity you created with the WhatsApp bot. Nothing new to register."}
                  </p>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit.mutate();
                  }}
                  className="space-y-4"
                >
                  <PhoneField country={selectedCountry} countryCode={countryKey} onCountryChange={setCountryKey} value={phoneNumber} onChange={setPhoneNumber} />
                  <PasswordField value={password} onChange={setPassword} show={showPassword} onToggle={() => setShowPassword((value) => !value)} label={mode === "reset" ? "NEW PASSWORD" : "PASSWORD"} autoComplete={mode === "reset" ? "new-password" : "current-password"} />
                  <p className="-mt-1 text-xs leading-relaxed text-slate-400">Any password is accepted, up to 128 characters.</p>
                  <button type="submit" disabled={isBusy} className="landing-button mt-3 flex w-full items-center justify-center gap-2">
                    {submit.isPending ? "PREPARING…" : mode === "reset" ? "SEND RESET CODE" : "OPEN TRAINER WORLD"}
                    <ArrowUpRight className="size-4" />
                  </button>
                </form>
                <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-5 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setMode(mode === "reset" ? "login" : "reset");
                      setPassword("");
                    }}
                    className="text-cyan-200 transition hover:text-white"
                  >
                    {mode === "reset" ? "Back to login" : "Forgot password?"}
                  </button>
                  <span className="text-slate-500">WhatsApp verified</span>
                </div>
              </>
            ) : (
              <>
                <div className="mb-7">
                  <p className="landing-kicker">{verification.kind === "reset" ? "PASSWORD RECOVERY" : "FINAL STEP"}</p>
                  <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">Check WhatsApp.</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    Send <span className="font-mono text-cyan-200">.code</span> to the AIDORU bot. Enter the six digits it sends for {verification.maskedPhone}.
                  </p>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    verify.mutate();
                  }}
                  className="space-y-4"
                >
                  <label className="block">
                    <span className="landing-kicker mb-2 block">6-DIGIT CODE</span>
                    <span className="landing-input flex items-center gap-3 rounded-full border border-white/15 px-4 py-4 transition focus-within:border-cyan-300/70">
                      <ShieldCheck className="size-5 shrink-0 text-cyan-200" />
                      <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" className="w-full bg-transparent font-mono text-xl tracking-[0.45em] text-white outline-none placeholder:text-slate-500" />
                    </span>
                  </label>
                  <button type="submit" disabled={isBusy} className="landing-button mt-3 flex w-full items-center justify-center gap-2">
                    {verify.isPending ? "CHECKING CODE…" : verification.kind === "reset" ? "SAVE NEW PASSWORD" : "VERIFY & ENTER"}
                    <ArrowUpRight className="size-4" />
                  </button>
                </form>
                <div className="mt-6 flex items-center justify-between text-xs text-slate-400">
                  <span>{verificationMinutes > 0 ? `Expires in about ${verificationMinutes} min.` : "Code may have expired."}</span>
                  <button type="button" onClick={() => { setVerification(null); setCode(""); }} className="text-cyan-200 hover:text-white">Start again</button>
                </div>
              </>
            )}
          </div>
        </motion.section>
      </div>
    </main>
  );
}
function normalizeBattleDestination(value: string | null): string | null {
  if (!value || !value.startsWith("/battle")) return null;
  const [path = "", query = ""] = value.split("?", 2);
  if (path.startsWith("/battle/")) return path;
  if (path !== "/battle") return null;
  const params = new URLSearchParams(query);
  const reference = params.get("room") || params.get("code");
  return reference ? `/battle/${encodeURIComponent(reference)}` : "/battle";
}

function Feature({
  icon: Icon,
  label,
  copy,
}: {
  icon: typeof Sparkles;
  label: string;
  copy: string;
}) {
  return (
    <div className="landing-feature flex min-w-[13rem] flex-1 items-center gap-3 rounded-2xl border border-white/15 bg-black/25 px-4 py-3 text-left backdrop-blur-xl">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cyan-300 text-[#04202b]">
        <Icon className="size-4" />
      </span>
      <span>
        <strong className="block text-sm text-white">{label}</strong>
        <small className="mt-0.5 block text-xs text-slate-400">{copy}</small>
      </span>
    </div>
  );
}

function PhoneField({ country, countryCode, onCountryChange, value, onChange }: { country: Country; countryCode: string; onCountryChange: (value: string) => void; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-2 block text-sm font-medium text-slate-200">WhatsApp number</span><span className="flex overflow-hidden rounded-2xl border border-white/15 bg-black/20 transition focus-within:border-cyan-300/70"><span className="relative flex min-w-[9rem] items-center gap-2 border-r border-white/10 px-3 py-3.5 text-sm"><span>{country.flag}</span><select aria-label="Country code" value={countryCode} onChange={(event) => onCountryChange(event.target.value)} className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent pl-9 pr-7 text-transparent outline-none">{COUNTRIES.map((option) => <option key={`${option.code}-${option.name}`} value={`${option.name}|${option.code}`}>{option.flag} {option.name} {option.code}</option>)}</select><span className="truncate text-slate-100">{country.name}</span><ChevronDown className="ml-auto size-4 text-slate-400" /></span><input type="tel" inputMode="tel" autoComplete="tel-national" value={value} onChange={(event) => onChange(event.target.value)} placeholder="67 585 9928" className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-base text-white outline-none placeholder:text-slate-500" /></span><span className="mt-2 block text-xs leading-relaxed text-slate-400">Select your country, then enter the local number without the leading zero.</span></label>;
}

function PasswordField({ value, onChange, show, onToggle, label, autoComplete }: { value: string; onChange: (value: string) => void; show: boolean; onToggle: () => void; label: string; autoComplete: string }) {
  return <label className="block"><span className="landing-kicker mb-2 block">{label}</span><span className="landing-input flex items-center gap-3 rounded-2xl border border-white/15 px-4 py-3.5 transition focus-within:border-cyan-300/70"><LockKeyhole className="size-4 shrink-0 text-slate-400" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Create or enter your password" type={show ? "text" : "password"} autoComplete={autoComplete} className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500" /><button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={onToggle} className="shrink-0 text-slate-400 hover:text-cyan-200">{show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></span></label>;
}
