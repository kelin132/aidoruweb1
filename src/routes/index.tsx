import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Phone, Lock, User, Sparkles, ShieldCheck, Gamepad2, Users } from "lucide-react";
import { toast } from "sonner";
import { AuroraField } from "@/components/aidoru/AuroraField";
import { sessionKey, useSession } from "@/components/aidoru/session";
import { login, register } from "@/lib/aidoru.functions";
import type { PublicUser } from "@/lib/game";
import hero from "@/assets/hero-idol.png";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AIDORU — Sign in to your trainer portal" },
      {
        name: "description",
        content:
          "Sign in with your phone number to open the AIDORU portal: live coin balance, starter partners, Mart, guilds and arcade games synced live.",
      },
      { property: "og:title", content: "AIDORU — Anime Trainer Portal" },
      {
        property: "og:description",
        content:
          "Sign in with your phone number to open the AIDORU portal for AIDORU trainers.",
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
  const [mode, setMode] = useState<"login" | "register">("login");
  const [phoneNumber, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const doLogin = useServerFn(login);
  const doRegister = useServerFn(register);

  useEffect(() => {
    if (session) void navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  const submit = useMutation({
    mutationFn: async (): Promise<PublicUser> => {
      const phone = phoneNumber.trim();
      if (phone.length < 6) throw new Error("Enter your phone number with country code.");
      if (mode === "register") {
        if (name.trim().length < 2) throw new Error("Trainer name must be at least 2 characters.");
        if (password.length < 6) throw new Error("Password must be at least 6 characters.");
      } else if (password.length < 1) {
        throw new Error("Enter your password.");
      }
      return mode === "login"
        ? doLogin({ data: { phoneNumber: phone, password } })
        : doRegister({ data: { phoneNumber: phone, password, name: name.trim() } });
    },
    onSuccess: (user) => {
      queryClient.setQueryData(sessionKey, user);
      toast.success(mode === "login" ? `Welcome back, ${user.name}` : `Account created`);
      void navigate({ to: "/dashboard" });
    },
    onError: (error: Error) => toast.error(error.message || "Something went wrong."),
  });

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
          <span className="glass font-mono-ui text-muted-foreground inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] tracking-[0.28em] uppercase">
            <span className="bg-neon-cyan size-1.5 animate-pulse rounded-full" />
            AIDORU network online
          </span>

          <h1 className="font-display mt-6 text-5xl leading-[0.95] font-extrabold tracking-tight md:text-7xl">
            <span className="text-gradient-brand">AIDORU</span>
          </h1>

          <p className="text-muted-foreground mt-5 max-w-lg text-base leading-relaxed">
            One glowing dashboard for everything your bot account already holds — coins, partners,
            inventory, guild standing and arcade luck. Sign in with the phone number you use in
            chat.
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
          <img
            src={hero}
            alt="AIDORU anime idol mascot"
            className="animate-float-soft pointer-events-none absolute -top-28 -right-4 hidden w-64 opacity-90 xl:block"
          />

          <div className="glass-strong relative overflow-hidden rounded-4xl p-7 md:p-9">
            <div className="from-neon-pink/10 pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-transparent" />

            <div className="relative">
              <div className="glass mb-7 grid grid-cols-2 gap-1 rounded-full p-1">
                {(["login", "register"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`font-display rounded-full py-2 text-xs tracking-[0.18em] uppercase transition-all duration-300 ${
                      mode === m
                        ? "bg-gradient-brand text-foreground glow-pink"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m === "login" ? "Sign in" : "Create"}
                  </button>
                ))}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit.mutate();
                }}
                className="space-y-4"
              >
                {mode === "register" && (
                  <Field
                    icon={User}
                    label="Name"
                    value={name}
                    onChange={setName}
                    placeholder="Aidoru"
                  />
                )}
                <Field
                  icon={Phone}
                  label="Phone number"
                  value={phoneNumber}
                  onChange={setPhone}
                  placeholder="+254 700 000 000"
                  inputMode="tel"
                />
                <Field
                  icon={Lock}
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  placeholder="••••••••"
                  type="password"
                />

                <button
                  type="submit"
                  disabled={submit.isPending}
                  className="bg-gradient-brand text-foreground glow-pink font-display relative mt-2 w-full overflow-hidden rounded-full py-3.5 text-sm font-bold tracking-[0.2em] uppercase transition-transform duration-300 hover:scale-[1.02] disabled:opacity-60"
                >
                  <span className="animate-sheen absolute inset-y-0 -left-1/2 w-1/2 bg-white/20 blur-md" />
                  {submit.isPending
                    ? "Connecting…"
                    : mode === "login"
                      ? "Enter portal"
                      : "Create account"}
                </button>
              </form>

              <p className="text-muted-foreground mt-5 text-center text-[11px] leading-relaxed">
                Your credentials are the same ones stored in the AIDORU database. Passwords are
                hashed and sessions are signed.
              </p>
            </div>
          </div>
        </motion.section>
      </div>
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
  inputMode,
}: {
  icon: typeof Phone;
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
