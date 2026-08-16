import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fingerprint, KeyRound, Sparkles, ShieldCheck, Gamepad2, Users } from "lucide-react";
import { toast } from "sonner";
import { AuroraField } from "@/components/aidoru/AuroraField";
import { ConnectionNotice } from "@/components/aidoru/ConnectionNotice";
import { sessionKey, useSession } from "@/components/aidoru/session";
import { login } from "@/lib/aidoru.functions";
import type { PublicUser } from "@/lib/game";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AIDORU — Sign in to your trainer portal" },
      {
        name: "description",
        content:
          "Sign in with your AIDORU ID and website password to open your live coin balance, starter partners, Mart, guilds and arcade games.",
      },
      { property: "og:title", content: "AIDORU — Anime Trainer Portal" },
      {
        property: "og:description",
        content: "Sign in with your AIDORU ID to open the AIDORU portal for AIDORU trainers.",
      },
    ],
  }),
  component: Portal,
});

const FEATURES = [
  { icon: Sparkles, title: "Start your journey", copy: "Pick a starter partner and grow it." },
  { icon: Gamepad2, title: "Arcade & odds", copy: "Slots and coin flip with live payouts." },
  { icon: Users, title: "Guild network", copy: "Join a crew or charter your own." },
  { icon: ShieldCheck, title: "Bot-synced", copy: "Same account as your AIDORU chat bot." },
];

function Portal() {
  const [websiteId, setWebsiteId] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, error: sessionError } = useSession();
  const doLogin = useServerFn(login);
  const submit = useMutation({
    mutationFn: async (): Promise<PublicUser> => {
      const id = websiteId.trim();
      if (id.length < 8) throw new Error("Enter the AIDORU ID from .id.");
      if (password.length < 8) throw new Error("Enter the password you set with .wpw.");
      return doLogin({ data: { websiteId: id, password } });
    },
    onSuccess: (user) => {
      queryClient.setQueryData(sessionKey, user);
      toast.success(`Welcome back, ${user.name}`);
      const destination = normalizeBattleDestination(new URLSearchParams(window.location.search).get("returnTo"));
      if (destination) window.location.assign(destination);
      else void navigate({ to: "/dashboard" });
    },
    onError: (error: Error) => toast.error(error.message || "Something went wrong."),
  });

  useEffect(() => {
    if (!session) return;
    const destination = normalizeBattleDestination(new URLSearchParams(window.location.search).get("returnTo"));
    if (destination) {
      window.location.replace(destination);
      return;
    }
    void navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  if (sessionError) return <ConnectionNotice onRetry={() => window.location.reload()} />;

  return (
    <div className="relative min-h-screen">
      <AuroraField />

      <div className="mx-auto grid min-h-screen max-w-7xl items-center gap-10 px-4 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        {/* Left: pitch */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="font-display mt-6 text-5xl leading-[0.95] font-extrabold tracking-tight md:text-7xl">
            <span className="text-gradient-brand">AIDORU</span>
          </h1>

          <p className="text-muted-foreground mt-5 max-w-lg text-base leading-relaxed">
            One glowing dashboard for everything your bot account already holds — coins, partners,
            inventory, guild standing and arcade luck. Sign in with the AIDORU ID and password you
            set through the bot.
          </p>

          <div className="mt-9 grid gap-3 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.15 + i * 0.08 }}
                className="glass glass-hover flex items-start gap-3 rounded-2xl p-4"
              >
                <span className="bg-gradient-brand grid size-9 shrink-0 place-items-center rounded-full">
                  <f.icon className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">{f.copy}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Right: hero + auth */}
        <motion.section
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative"
        >
          <div className="glass-strong relative overflow-hidden rounded-4xl p-7 md:p-9">
            <div className="from-neon-pink/10 pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent" />

            <div className="relative">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
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
                  inputMode="text"
                />
                <Field
                  icon={KeyRound}
                  label="Website password"
                  value={password}
                  onChange={setPassword}
                  placeholder="Your website password"
                  type="password"
                  inputMode="text"
                />

                <button
                  type="submit"
                  disabled={submit.isPending}
                  className="bg-gradient-brand text-foreground glow-pink font-display relative mt-2 w-full overflow-hidden rounded-full py-3.5 text-sm font-bold tracking-[0.2em] uppercase transition-transform duration-300 hover:scale-[1.02] disabled:opacity-60"
                >
                  <span className="animate-sheen absolute inset-y-0 -left-1/2 w-1/2 bg-white/20 blur-md" />
                  {submit.isPending ? "Verifying link…" : "Open dashboard"}
                </button>
              </form>

              <p className="text-muted-foreground mt-5 text-center text-[11px] leading-relaxed">
                Run <span className="font-mono-ui text-primary">.id</span> and <span className="font-mono-ui text-primary">.wpw</span> in a private bot
                chat to get your login details. AIDORU never creates a second account.
              </p>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
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

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: {
  icon: typeof Fingerprint;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "tel" | "text";
}) {
  return (
    <label className="block">
      <span className="font-mono-ui text-muted-foreground mb-1.5 block text-[10px] tracking-[0.22em] uppercase">
        {label}
      </span>
      <span className="glass focus-within:border-neon-cyan/50 flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors">
        <Icon className="text-muted-foreground size-4 shrink-0" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type={type}
          inputMode={inputMode}
          className="placeholder:text-muted-foreground/60 w-full bg-transparent text-sm outline-none"
        />
      </span>
    </label>
  );
}
