import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, KeyRound, Menu, Moon, ShieldCheck, Sparkles, Swords, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { ConnectionNotice } from "@/components/aidoru/ConnectionNotice";
import { sessionKey, useSession } from "@/components/aidoru/session";
import { login, verifyPhone } from "@/lib/aidoru.functions";
import type { PublicUser } from "@/lib/game";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AIDORU — Welcome to your trainer world" },
      {
        name: "description",
        content: "A dark anime-inspired portal for your AIDORU bot trainer account.",
      },
      { property: "og:title", content: "AIDORU — Welcome, trainer" },
    ],
    links: [{ rel: "preload", href: "/aidoru-login-anime.webp", as: "image", type: "image/webp" }],
  }),
  component: Portal,
});

const COUNTRIES = [
  { code: "+27", name: "South Africa", flag: "🇿🇦" },
  { code: "+234", name: "Nigeria", flag: "🇳🇬" },
  { code: "+254", name: "Kenya", flag: "🇰🇪" },
  { code: "+263", name: "Zimbabwe", flag: "🇿🇼" },
  { code: "+44", name: "United Kingdom", flag: "🇬🇧" },
  { code: "+1", name: "United States", flag: "🇺🇸" },
];

function Portal() {
  const [countryCode, setCountryCode] = useState("+27");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verification, setVerification] = useState<{ maskedPhone: string; expiresAt: string } | null>(null);
  const [scrollY, setScrollY] = useState(0);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, error: sessionError } = useSession();
  const doLogin = useServerFn(login);
  const doVerify = useServerFn(verifyPhone);

  const finishLogin = (user: PublicUser) => {
    queryClient.setQueryData(sessionKey, user);
    toast.success(`Welcome back, ${user.name}`);
    const returnTo = new URLSearchParams(window.location.search).get("returnTo");
    const destination = returnTo?.startsWith("/battle/") ? returnTo : null;
    if (destination) window.location.assign(destination);
    else void navigate({ to: "/dashboard" });
  };

  const submit = useMutation({
    mutationFn: () => {
      if (phoneNumber.replace(/\D/g, "").length < 5) throw new Error("Enter your WhatsApp number.");
      if (password.length < 8) throw new Error("Use a password with at least 8 characters.");
      return doLogin({ data: { countryCode, phoneNumber, password } });
    },
    onSuccess: (result) => {
      if (result.status === "verification_required") {
        setVerification({ maskedPhone: result.maskedPhone, expiresAt: result.expiresAt });
        setCode("");
        toast.success("Your verification code is ready in WhatsApp.");
      } else {
        finishLogin(result.user);
      }
    },
    onError: (error: Error) => toast.error(error.message || "Unable to open your trainer world."),
  });

  const verify = useMutation({
    mutationFn: () => {
      if (!/^\d{6}$/.test(code)) throw new Error("Enter the six-digit code from WhatsApp.");
      return doVerify({ data: { countryCode, phoneNumber, code } });
    },
    onSuccess: (user) => finishLogin(user),
    onError: (error: Error) => toast.error(error.message || "The verification code could not be accepted."),
  });

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

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (sessionError) return <ConnectionNotice onRetry={() => window.location.reload()} />;

  const selectedCountry = COUNTRIES.find((country) => country.code === countryCode) ?? { code: "+27", name: "South Africa", flag: "🇿🇦" };
  const verificationMinutes = verification
    ? Math.max(0, Math.ceil((new Date(verification.expiresAt).getTime() - Date.now()) / 60_000))
    : 0;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#061425] text-white">
      <div className="landing-bg-bloom pointer-events-none absolute inset-0" style={{ transform: `translate3d(0, ${Math.min(scrollY * 0.12, 70)}px, 0) scale(1.03)` }} />
      <div className="landing-character-scene pointer-events-none absolute inset-x-0 bottom-0 h-[66vh]" style={{ transform: `translate3d(0, ${Math.min(scrollY * 0.2, 110)}px, 0)` }} />
      <div className="landing-bg-shade pointer-events-none absolute inset-0" />
      <div className="landing-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="landing-orb landing-orb-cyan pointer-events-none absolute -left-20 top-24 size-80 rounded-full blur-3xl" />
      <div className="landing-orb landing-orb-rose pointer-events-none absolute right-[-10rem] top-[-6rem] size-[28rem] rounded-full blur-3xl" />
      <div className="landing-leaves pointer-events-none absolute inset-0" aria-hidden="true">
        {Array.from({ length: 16 }, (_, index) => <span key={index} className={`landing-leaf landing-leaf-${index + 1}`} />)}
      </div>
      <button type="button" aria-label="Open menu" className="landing-menu absolute left-6 top-6 z-20 grid size-14 place-items-center rounded-full border border-white/20 bg-black/35 backdrop-blur-xl sm:left-10 sm:top-10">
        <Menu className="size-7" />
      </button>

      <div className="relative mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-6 pb-10 pt-24 sm:px-10 lg:grid-cols-[1fr_0.92fr] lg:gap-16 lg:px-14 lg:py-14">
        <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65 }} className="relative z-10 text-center lg:text-left">
          <div className="mx-auto mb-7 grid size-16 place-items-center rounded-2xl border border-cyan-200/30 bg-cyan-200/10 text-cyan-100 shadow-[0_0_50px_rgba(55,211,236,0.18)] lg:mx-0">
            <Moon className="size-8" />
          </div>
          <p className="landing-kicker">THE COMMUNITY REALM</p>
          <h1 className="landing-title mt-2">MOONLIGHT <span className="text-cyan-300">AIDORU</span></h1>
          <p className="landing-copy mx-auto mt-6 max-w-xl lg:mx-0">The anime-powered home for your bot life. Raise your Pokémon, build your party, spend your coins, and meet your community in one glowing trainer world.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
            <Feature icon={Sparkles} label="Your Journey" copy="Live party and Pokémon progress" />
            <Feature icon={WalletCards} label="Your Economy" copy="Shop, wallet and rewards" />
            <Feature icon={Swords} label="Your Arcade" copy="Virtual-coin games and battles" />
          </div>
        </motion.section>

        <motion.section initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.65, delay: 0.08 }} className="relative z-10 lg:justify-self-end lg:w-full lg:max-w-[32rem]">
          <div className="landing-login-card rounded-[2rem] border border-white/15 p-6 shadow-2xl sm:p-9">
            {!verification ? (
              <>
                <div className="mb-7">
                  <p className="landing-kicker">RETURN TO THE HAVEN</p>
                  <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">Welcome back.</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">Use the same WhatsApp identity you use with the AIDORU bot.</p>
                </div>
                <form onSubmit={(event) => { event.preventDefault(); submit.mutate(); }} className="space-y-5">
                  <PhoneField country={selectedCountry} countryCode={countryCode} onCountryChange={setCountryCode} value={phoneNumber} onChange={setPhoneNumber} />
                  <Field icon={KeyRound} label="PASSWORD" value={password} onChange={setPassword} placeholder="Enter your password" type="password" />
                  <button type="submit" disabled={submit.isPending} className="landing-button mt-3 w-full">{submit.isPending ? "CHECKING WHATSAPP…" : "ENTER AIDORU"}</button>
                </form>
                <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-400">Verification happens through the AIDORU WhatsApp bot. Your number is matched to the trainer profile already stored there.</p>
              </>
            ) : (
              <>
                <div className="mb-7">
                  <p className="landing-kicker">VERIFY YOUR TRAINER</p>
                  <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">Check WhatsApp.</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">Send <span className="font-mono text-cyan-200">.code</span> to the AIDORU bot. Enter the six digits it returns for {verification.maskedPhone}.</p>
                </div>
                <form onSubmit={(event) => { event.preventDefault(); verify.mutate(); }} className="space-y-5">
                  <label className="block">
                    <span className="landing-kicker mb-2 block">6-DIGIT CODE</span>
                    <span className="landing-input flex items-center gap-3 rounded-full border border-white/15 px-4 py-3.5 transition focus-within:border-cyan-300/70">
                      <ShieldCheck className="size-4 shrink-0 text-cyan-200" />
                      <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" className="w-full bg-transparent font-mono text-lg tracking-[0.4em] text-white outline-none placeholder:text-slate-500" />
                    </span>
                  </label>
                  <button type="submit" disabled={verify.isPending} className="landing-button mt-3 w-full">{verify.isPending ? "VERIFYING…" : "VERIFY & ENTER AIDORU"}</button>
                </form>
                <div className="mt-5 flex items-center justify-between text-xs text-slate-400"><span>{verificationMinutes > 0 ? `Code expires in about ${verificationMinutes} min.` : "Code may have expired."}</span><button type="button" onClick={() => setVerification(null)} className="text-cyan-200 hover:text-white">Use another number</button></div>
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

function PhoneField({ country, countryCode, onCountryChange, value, onChange }: { country: { code: string; name: string; flag: string }; countryCode: string; onCountryChange: (value: string) => void; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-2 block text-sm font-medium text-slate-200">WhatsApp number</span><span className="flex overflow-hidden rounded-2xl border border-white/15 bg-black/20 transition focus-within:border-cyan-300/70"><span className="relative flex min-w-[8.9rem] items-center gap-2 border-r border-white/10 px-3 py-3.5 text-sm"><span>{country.flag}</span><select aria-label="Country code" value={countryCode} onChange={(event) => onCountryChange(event.target.value)} className="absolute inset-0 w-full cursor-pointer appearance-none bg-transparent pl-9 pr-7 text-transparent outline-none"><option value="+27">South Africa +27</option><option value="+234">Nigeria +234</option><option value="+254">Kenya +254</option><option value="+263">Zimbabwe +263</option><option value="+44">United Kingdom +44</option><option value="+1">United States +1</option></select><span className="truncate text-slate-100">{country.name}</span><ChevronDown className="ml-auto size-4 text-slate-400" /></span><input type="tel" inputMode="tel" autoComplete="tel-national" value={value} onChange={(event) => onChange(event.target.value)} placeholder="67 585 9928" className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-base text-white outline-none placeholder:text-slate-500" /></span><span className="mt-2 block text-xs leading-relaxed text-slate-400">Choose your country, then enter the local number. AIDORU stores the full international WhatsApp number.</span></label>;
}

function Field({ icon: Icon, label, value, onChange, placeholder, type = "text" }: { icon: typeof KeyRound; label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <label className="block"><span className="landing-kicker mb-2 block">{label}</span><span className="landing-input flex items-center gap-3 rounded-full border border-white/15 px-4 py-3.5 transition focus-within:border-cyan-300/70"><Icon className="size-4 shrink-0 text-slate-400" /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} autoComplete={type === "password" ? "current-password" : undefined} className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500" /></span></label>;
}
