import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fingerprint, KeyRound, Menu, Sparkles, Swords, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { ConnectionNotice } from "@/components/aidoru/ConnectionNotice";
import { sessionKey, useSession } from "@/components/aidoru/session";
import { legacyLogin } from "@/lib/aidoru.functions";
import type { PublicUser } from "@/lib/game";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "aidoru community" },
      {
        name: "description",
        content: "aidoru community is the anime-inspired portal for your bot trainer account.",
      },
      { property: "og:title", content: "aidoru community" },
    ],
    links: [{ rel: "preload", href: "/aidoru-community/community-11.webp", as: "image", type: "image/webp" }],
  }),
  component: Portal,
});

function Portal() {
  const [websiteId, setWebsiteId] = useState("");
  const [password, setPassword] = useState("");
  const [scrollY, setScrollY] = useState(0);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, error: sessionError } = useSession();
  const doLogin = useServerFn(legacyLogin);
  const submit = useMutation({
    mutationFn: async (): Promise<PublicUser> => {
      const id = websiteId.trim();
      if (id.length < 8) throw new Error("Enter the AIDORU ID from .id.");
      if (password.length < 8) throw new Error("Enter the website password from .wpw.");
      return doLogin({ data: { websiteId: id, password } });
    },
    onSuccess: (user) => {
      queryClient.setQueryData(sessionKey, user);
      toast.success(`Welcome back, ${user.name}`);
      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      const destination = normalizeBattleDestination(returnTo);
      if (destination) window.location.assign(destination);
      else void navigate({ to: "/dashboard" });
    },
    onError: (error: Error) => toast.error(error.message || "Unable to open your trainer world."),
  });

  useEffect(() => {
    if (!session) return;
    const returnTo = new URLSearchParams(window.location.search).get("returnTo");
    const destination = normalizeBattleDestination(returnTo);
    if (destination) window.location.replace(destination);
    else void navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (sessionError) return <ConnectionNotice error={sessionError} onRetry={() => window.location.reload()} />;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#04131b] text-white">
      <div className="landing-bg-bloom pointer-events-none absolute inset-0" style={{ transform: `translate3d(0, ${Math.min(scrollY * 0.12, 70)}px, 0) scale(1.03)` }} />
      <div className="landing-character-scene pointer-events-none absolute inset-x-0 bottom-0 h-[66vh]" style={{ transform: `translate3d(0, ${Math.min(scrollY * 0.2, 110)}px, 0)` }} />
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
            <div className="mb-7">
              <p className="landing-kicker">AIDORU TRAINER PORTAL</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">
                Open your world
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                Use the same trainer identity you created with the WhatsApp bot. Nothing new to
                register.
              </p>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submit.mutate();
              }}
              className="space-y-4"
            >
              <Field
                icon={Fingerprint}
                label="AIDORU ID"
                value={websiteId}
                onChange={setWebsiteId}
                placeholder="AID-XXXXXXXXXX"
              />
              <Field
                icon={KeyRound}
                label="WEBSITE PASSWORD"
                value={password}
                onChange={setPassword}
                placeholder="Your .wpw password"
                type="password"
              />
              <button
                type="submit"
                disabled={submit.isPending}
                className="landing-button mt-3 w-full"
              >
                {submit.isPending ? "OPENING WORLD…" : "OPEN TRAINER WORLD"}
              </button>
            </form>
            <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-400">
              Run <span className="text-cyan-300">.id</span> and{" "}
              <span className="text-cyan-300">.wpw your-password</span> in the bot. Your password
              message is scheduled for deletion after one second.
            </p>
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

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  icon: typeof Fingerprint;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="landing-kicker mb-2 block">{label}</span>
      <span className="landing-input flex items-center gap-3 rounded-full border border-white/15 px-4 py-3.5 transition focus-within:border-cyan-300/70">
        <Icon className="size-4 shrink-0 text-slate-400" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={type}
          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
        />
      </span>
    </label>
  );
}
