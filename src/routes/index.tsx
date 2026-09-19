import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Fingerprint,
  KeyRound,
  Menu,
  MessageCircle,
  Sparkles,
  Swords,
  WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { ConnectionNotice } from "@/components/aidoru/ConnectionNotice";
import { sessionKey, useSession } from "@/components/aidoru/session";
import {
  phoneLogin,
  createAccount,
  requestOtpCode,
  verifyOtp,
  resetPasswordWithCode,
  verifyPhone,
  websiteIdLogin,
  finishDiscordCallback,
  linkDiscordWebsiteAccount,
  startDiscordWebsiteLogin,
} from "@/lib/aidoru.functions";
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
    links: [
      {
        rel: "preload",
        href: "/page-previews/welcome.jpg",
        as: "image",
        type: "image/jpeg",
      },
    ],
  }),
  component: Portal,
});

type AuthMode = "login" | "create" | "forgot" | "verify" | "reset" | "discord-link";
type LoginMethod = "aidoru" | "phone";
type ResetMethod = "aidoru" | "phone";

function Portal() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("aidoru");
  const [countryCode, setCountryCode] = useState("263");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [aidoruId, setAidoruId] = useState("");
  const [trainerName, setTrainerName] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [resetMethod, setResetMethod] = useState<ResetMethod>("aidoru");
  const [resetWebsiteId, setResetWebsiteId] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [verificationKind, setVerificationKind] = useState<"login" | "reset">("login");
  const [discordAidoruId, setDiscordAidoruId] = useState("");
  const [discordPassword, setDiscordPassword] = useState("");
  const [discordName, setDiscordName] = useState("");
  const [notice, setNotice] = useState("");
  const [scrollY, setScrollY] = useState(0);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, error: sessionError } = useSession();
  const doLogin = useServerFn(phoneLogin);
  const doAidoruLogin = useServerFn(websiteIdLogin);
  const doCreateAccount = useServerFn(createAccount);
  const doRequestOtp = useServerFn(requestOtpCode);
  const doVerifyOtp = useServerFn(verifyOtp);
  const doResetPasswordWithCode = useServerFn(resetPasswordWithCode);
  const doVerifyPhone = useServerFn(verifyPhone);
  const startDiscordLogin = useServerFn(startDiscordWebsiteLogin);
  const finishDiscordCallbackRequest = useServerFn(finishDiscordCallback);
  const linkDiscordAccount = useServerFn(linkDiscordWebsiteAccount);

  const finishAuth = useCallback(
    (user: PublicUser) => {
      queryClient.setQueryData(sessionKey, user);
      toast.success(`Welcome back, ${user.name}`);
      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      const destination = normalizeBattleDestination(returnTo);
      if (destination) window.location.assign(destination);
      else void navigate({ to: "/dashboard" });
    },
    [navigate, queryClient],
  );

  const submit = useMutation({
    mutationFn: async () => {
      if (loginMethod === "aidoru") {
        if (!aidoruId.trim()) throw new Error("Enter your AIDORU ID.");
        if (password.length < 8) throw new Error("Enter your website password.");
        return {
          status: "verified" as const,
          user: await doAidoruLogin({ data: { websiteId: aidoruId, password } }),
        };
      }
      if (!phoneNumber.trim()) throw new Error("Enter the phone number registered with the bot.");
      if (password.length < 8) throw new Error("Enter your website password.");
      return doLogin({ data: { countryCode, phoneNumber, password } });
    },
    onSuccess: (result) => {
      if (result.status === "verified") {
        finishAuth(result.user);
        return;
      }
      setVerificationKind("login");
      setNotice(
        "Open a private chat with the WhatsApp bot and send *.otp*. Then enter the six-digit code here. The code expires shortly.",
      );
      setMode("verify");
    },
    onError: (error: Error) => toast.error(error.message || "Unable to open your trainer world."),
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!trainerName.trim()) throw new Error("Choose a trainer name.");
      if (!phoneNumber.trim()) throw new Error("Enter your WhatsApp phone number.");
      if (password.length < 8) throw new Error("Your password must be at least 8 characters.");
      if (password !== confirmPassword) throw new Error("Your passwords do not match.");
      return doCreateAccount({
        data: { countryCode, phoneNumber, name: trainerName, password },
      });
    },
    onSuccess: (user) => {
      queryClient.setQueryData(sessionKey, user);
      toast.success("Your account is ready. Link Discord from your profile.");
      void navigate({ to: "/profile", replace: true });
    },
    onError: (error: Error) => toast.error(error.message || "Could not create your account."),
  });

  const requestReset = useMutation({
    mutationFn: async () => {
      if (resetMethod === "aidoru" && !aidoruId.trim()) throw new Error("Enter your AIDORU ID.");
      if (resetMethod === "phone" && !phoneNumber.trim())
        throw new Error("Enter the phone number registered with the bot.");
      if (newPassword.length < 8) throw new Error("Your new password must be at least 8 characters.");
      if (newPassword !== confirmPassword) throw new Error("Your passwords do not match.");
      return resetMethod === "aidoru"
        ? doRequestOtp({ data: { websiteId: aidoruId.trim() } })
        : doRequestOtp({ data: { countryCode, phoneNumber } });
    },
    onSuccess: ({ websiteId }) => {
      setResetWebsiteId(websiteId);
      setNotice(
        "Open a private chat with the WhatsApp bot and send *.otp*. The code will be sent for this reset request and expires shortly.",
      );
      setVerificationKind("reset");
      setMode("verify");
    },
    onError: (error: Error) => toast.error(error.message || "Could not start password recovery."),
  });

  const verify = useMutation<
    PublicUser | { resetToken: string; expiresAt: string },
    Error,
    void
  >({
    mutationFn: async () => {
      if (verificationKind === "login") {
        return doVerifyPhone({ data: { countryCode, phoneNumber, code: otp } });
      }
      return doVerifyOtp({ data: { websiteId: resetWebsiteId, otp } });
    },
    onSuccess: (result) => {
      if ("resetToken" in result) {
        setResetToken(result.resetToken);
        setNotice("Code accepted. Choose a new password for your AIDORU account.");
        setMode("reset");
      } else {
        finishAuth(result);
      }
    },
    onError: (error: Error) => toast.error(error.message || "That code could not be verified."),
  });

  const resetPassword = useMutation({
    mutationFn: async (): Promise<PublicUser> => {
      if (newPassword.length < 8) throw new Error("Your new password must be at least 8 characters.");
      if (newPassword !== confirmPassword) throw new Error("Your passwords do not match.");
      return doResetPasswordWithCode({
        data: { websiteId: resetWebsiteId, resetToken, newPassword },
      });
    },
    onSuccess: finishAuth,
    onError: (error: Error) => toast.error(error.message || "Could not reset your password."),
  });

  const discordLogin = useMutation({
    mutationFn: async () => {
      const { authorizationUrl } = await startDiscordLogin({});
      window.location.assign(authorizationUrl);
    },
    onError: (error: Error) => toast.error(error.message || "Could not start Discord sign-in."),
  });

  const discordLinkExisting = useMutation({
    mutationFn: () =>
      linkDiscordAccount({
        data: { websiteId: discordAidoruId, password: discordPassword },
      }),
    onSuccess: (user) => {
      queryClient.setQueryData(sessionKey, user);
      toast.success("Your account has been linked to Discord.");
      void navigate({ to: "/profile", replace: true });
    },
    onError: (error: Error) =>
      toast.error(error.message || "Could not link this Discord account."),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const intent = params.get("discord");
    const isDiscordCallback =
      Boolean(code && state) && (intent === "login" || intent === "callback" || !intent);
    const hasDiscordError = intent === "login" || intent === "callback";
    if (!isDiscordCallback && !(hasDiscordError && params.get("error"))) return;

    if (!code || !state) {
      const error = params.get("error");
      window.history.replaceState({}, "", window.location.pathname);
      if (error) toast.error("Discord sign-in was cancelled.");
      return;
    }

    void finishDiscordCallbackRequest({ data: { code, state } })
      .then((result) => {
        window.history.replaceState({}, "", window.location.pathname);
        if (result.kind === "login") {
          finishAuth(result.user);
          return;
        }
        if (result.kind === "login_link_required") {
          setDiscordName(result.discordUsername);
          setNotice(
            `Discord is authorized as ${result.discordUsername}. Enter your AIDORU ID and website password to link your existing trainer account.`,
          );
          setMode("discord-link");
          return;
        }
        toast.success("Discord account linked. You can now continue with Discord.");
      })
      .catch((error: Error) => {
        window.history.replaceState({}, "", window.location.pathname);
        toast.error(error.message || "Discord sign-in failed.");
      });
  }, [finishAuth, finishDiscordCallbackRequest]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const intent = params.get("discord");
    if (intent === "link") {
      setDiscordName(params.get("name") || "your Discord account");
      setNotice(
        `Discord is authorized as ${params.get("name") || "your Discord account"}. Enter your AIDORU ID and website password to link your existing trainer account.`,
      );
      setMode("discord-link");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    if (intent === "register") {
      setMode("create");
      setNotice("Create your AIDORU account, then connect it to Discord from your profile.");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    if (intent !== "login") return;
    void startDiscordLogin({})
      .then(({ authorizationUrl }) => window.location.assign(authorizationUrl))
      .catch((error: Error) => toast.error(error.message || "Could not start Discord sign-in."));
    window.history.replaceState({}, "", window.location.pathname);
  }, [startDiscordLogin]);

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

  if (sessionError)
    return <ConnectionNotice error={sessionError} onRetry={() => window.location.reload()} />;

  const isBusy =
    submit.isPending ||
    create.isPending ||
    requestReset.isPending ||
    verify.isPending ||
    resetPassword.isPending ||
    discordLogin.isPending ||
    discordLinkExisting.isPending;
  const isLogin = mode === "login";
  const isCreate = mode === "create";
  const isForgot = mode === "forgot";
  const isVerify = mode === "verify";
  const isReset = mode === "reset";
  const isDiscordLink = mode === "discord-link";

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
            <div className="mb-7">
              <p className="landing-kicker">AIDORU TRAINER PORTAL</p>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">
                {isLogin
                  ? "Open your world"
                  : isCreate
                    ? "Create your trainer"
                    : isForgot
                      ? "Recover your world"
                    : isReset
                      ? "Choose a new password"
                    : isDiscordLink
                      ? "Link your Discord"
                      : "Check your signal"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                {isLogin
                  ? loginMethod === "aidoru"
                    ? "Old WhatsApp trainers can sign in with their AIDORU ID and website password."
                    : "Use the phone number already linked to your WhatsApp trainer."
                  : isCreate
                    ? "Create your account here with your WhatsApp number. You do not need to run .register first."
                    : isForgot
                      ? "Enter your AIDORU ID or phone number, then request a one-time code from your private bot chat."
                    : isReset
                      ? "Your code was accepted. Set a fresh password for your trainer account."
                    : isDiscordLink
                      ? `Connect ${discordName || "your Discord account"} to your existing AIDORU trainer.`
                      : "Your code is tied to the phone number you entered. It can only be used once."}
              </p>
            </div>

            {notice && (
              <div className="mb-4 flex gap-3 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-xs leading-relaxed text-cyan-50">
                <MessageCircle className="mt-0.5 size-4 shrink-0 text-cyan-300" />
                <span>{notice}</span>
              </div>
            )}

            {isLogin && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submit.mutate();
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/20 p-1">
                  <button
                    type="button"
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      loginMethod === "aidoru" ? "bg-cyan-300 text-[#04202b]" : "text-slate-300 hover:bg-white/10"
                    }`}
                    onClick={() => setLoginMethod("aidoru")}
                  >
                    AIDORU ID
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      loginMethod === "phone" ? "bg-cyan-300 text-[#04202b]" : "text-slate-300 hover:bg-white/10"
                    }`}
                    onClick={() => setLoginMethod("phone")}
                  >
                    PHONE NUMBER
                  </button>
                </div>
                {loginMethod === "aidoru" ? (
                  <Field
                    icon={Fingerprint}
                    label="AIDORU ID"
                    value={aidoruId}
                    onChange={setAidoruId}
                    placeholder="AID-XXXXXXXXXX"
                    autoComplete="username"
                  />
                ) : (
                  <div className="grid grid-cols-[7rem_1fr] gap-3">
                    <Field
                      icon={MessageCircle}
                      label="COUNTRY CODE"
                      value={countryCode}
                      onChange={(value) => setCountryCode(value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="263"
                      prefix="+"
                      inputMode="numeric"
                      autoComplete="tel-country-code"
                    />
                    <Field
                      icon={Fingerprint}
                      label="PHONE NUMBER"
                      value={phoneNumber}
                      onChange={(value) => setPhoneNumber(value.replace(/\D/g, "").slice(0, 14))}
                      placeholder="771234567"
                      inputMode="numeric"
                      autoComplete="tel-national"
                    />
                  </div>
                )}
                <Field
                  icon={KeyRound}
                  label="WEBSITE PASSWORD"
                  value={password}
                  onChange={setPassword}
                  placeholder="Your website password"
                  type="password"
                  autoComplete="current-password"
                />
                <button type="submit" disabled={isBusy} className="landing-button mt-3 w-full">
                  {submit.isPending ? "OPENING WORLD…" : "OPEN TRAINER WORLD"}
                </button>
              </form>
            )}

            {isDiscordLink && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  discordLinkExisting.mutate();
                }}
                className="space-y-4"
              >
                <Field
                  icon={Fingerprint}
                  label="AIDORU ID"
                  value={discordAidoruId}
                  onChange={setDiscordAidoruId}
                  placeholder="AID-XXXXXXXXXX"
                  autoComplete="username"
                />
                <Field
                  icon={KeyRound}
                  label="WEBSITE PASSWORD"
                  value={discordPassword}
                  onChange={setDiscordPassword}
                  placeholder="Your website password"
                  type="password"
                  autoComplete="current-password"
                />
                <button type="submit" disabled={isBusy} className="landing-button mt-3 w-full">
                  {discordLinkExisting.isPending ? "LINKING ACCOUNT…" : "LINK DISCORD ACCOUNT"}
                </button>
                <p className="text-center text-[11px] leading-relaxed text-slate-400">
                  Already have an AIDORU account? Use its AID ID here. No Discord `.reg` command is needed.
                </p>
              </form>
            )}

            {isLogin && (
              <>
                <div className="my-5 flex items-center gap-3 text-[10px] font-bold tracking-[0.22em] text-slate-500">
                  <span className="h-px flex-1 bg-white/10" />
                  <span>OR</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>
                <button
                  type="button"
                  disabled={isBusy}
                  className="landing-discord-button w-full"
                  onClick={() => discordLogin.mutate()}
                >
                  <DiscordMark />
                  {discordLogin.isPending ? "OPENING DISCORD…" : "CONTINUE WITH DISCORD"}
                </button>
                <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
                  Continue to your Discord-connected profile. Your WhatsApp Pokémon and economy remain shared.
                </p>
                <div className="mt-5 border-t border-white/10 pt-5 text-center">
                  <p className="text-[11px] font-bold tracking-[0.16em] text-slate-300">
                    NEW TO AIDORU?
                  </p>
                  <button
                    type="button"
                    className="mt-2 text-sm font-semibold text-cyan-300 transition hover:text-white"
                    onClick={() => {
                      setNotice("");
                      setMode("create");
                    }}
                  >
                    CREATE AN ACCOUNT
                  </button>
                </div>
              </>
            )}

            {isCreate && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  create.mutate();
                }}
                className="space-y-4"
              >
                <Field
                  icon={Fingerprint}
                  label="TRAINER NAME"
                  value={trainerName}
                  onChange={setTrainerName}
                  placeholder="Your trainer name"
                  autoComplete="nickname"
                />
                <div className="grid grid-cols-[7rem_1fr] gap-3">
                  <Field
                    icon={MessageCircle}
                    label="COUNTRY CODE"
                    value={countryCode}
                    onChange={(value) => setCountryCode(value.replace(/\D/g, "").slice(0, 4))}
                    placeholder="263"
                    prefix="+"
                    inputMode="numeric"
                    autoComplete="tel-country-code"
                  />
                  <Field
                    icon={Fingerprint}
                    label="WHATSAPP NUMBER"
                    value={phoneNumber}
                    onChange={(value) => setPhoneNumber(value.replace(/\D/g, "").slice(0, 14))}
                    placeholder="771234567"
                    inputMode="numeric"
                    autoComplete="tel-national"
                  />
                </div>
                <Field
                  icon={KeyRound}
                  label="PASSWORD"
                  value={password}
                  onChange={setPassword}
                  placeholder="At least 8 characters"
                  type="password"
                  autoComplete="new-password"
                />
                <Field
                  icon={KeyRound}
                  label="CONFIRM PASSWORD"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Repeat your password"
                  type="password"
                  autoComplete="new-password"
                />
                <button type="submit" disabled={isBusy} className="landing-button mt-3 w-full">
                  {create.isPending ? "CREATING ACCOUNT…" : "CREATE ACCOUNT"}
                </button>
              </form>
            )}

            {isForgot && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  requestReset.mutate();
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/20 p-1">
                  <button
                    type="button"
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      resetMethod === "aidoru"
                        ? "bg-cyan-300 text-[#04202b]"
                        : "text-slate-300 hover:bg-white/10"
                    }`}
                    onClick={() => setResetMethod("aidoru")}
                  >
                    AIDORU ID
                  </button>
                  <button
                    type="button"
                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                      resetMethod === "phone"
                        ? "bg-cyan-300 text-[#04202b]"
                        : "text-slate-300 hover:bg-white/10"
                    }`}
                    onClick={() => setResetMethod("phone")}
                  >
                    PHONE NUMBER
                  </button>
                </div>
                {resetMethod === "aidoru" ? (
                  <Field
                    icon={Fingerprint}
                    label="AIDORU ID"
                    value={aidoruId}
                    onChange={setAidoruId}
                    placeholder="AID-XXXXXXXXXX"
                    autoComplete="username"
                  />
                ) : (
                  <div className="grid grid-cols-[7rem_1fr] gap-3">
                    <Field
                      icon={MessageCircle}
                      label="COUNTRY CODE"
                      value={countryCode}
                      onChange={(value) => setCountryCode(value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="263"
                      prefix="+"
                      inputMode="numeric"
                      autoComplete="tel-country-code"
                    />
                    <Field
                      icon={Fingerprint}
                      label="PHONE NUMBER"
                      value={phoneNumber}
                      onChange={(value) => setPhoneNumber(value.replace(/\D/g, "").slice(0, 14))}
                      placeholder="771234567"
                      inputMode="numeric"
                      autoComplete="tel-national"
                    />
                  </div>
                )}
                <Field
                  icon={KeyRound}
                  label="NEW WEBSITE PASSWORD"
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="At least 8 characters"
                  type="password"
                  autoComplete="new-password"
                />
                <Field
                  icon={KeyRound}
                  label="CONFIRM PASSWORD"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Repeat your password"
                  type="password"
                  autoComplete="new-password"
                />
                <button type="submit" disabled={isBusy} className="landing-button mt-3 w-full">
                  {requestReset.isPending ? "PREPARING RECOVERY…" : "CONTINUE TO WHATSAPP"}
                </button>
              </form>
            )}

            {isReset && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  resetPassword.mutate();
                }}
                className="space-y-4"
              >
                <Field
                  icon={KeyRound}
                  label="NEW WEBSITE PASSWORD"
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="At least 8 characters"
                  type="password"
                  autoComplete="new-password"
                />
                <Field
                  icon={KeyRound}
                  label="CONFIRM PASSWORD"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Repeat your password"
                  type="password"
                  autoComplete="new-password"
                />
                <button type="submit" disabled={isBusy} className="landing-button mt-3 w-full">
                  {resetPassword.isPending ? "UPDATING PASSWORD…" : "SAVE NEW PASSWORD"}
                </button>
              </form>
            )}

            {isVerify && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  verify.mutate();
                }}
                className="space-y-4"
              >
                <Field
                  icon={MessageCircle}
                  label="SIX-DIGIT OTP"
                  value={otp}
                  onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
                <button type="submit" disabled={isBusy} className="landing-button mt-3 w-full">
                  {verify.isPending ? "VERIFYING CODE…" : "VERIFY OTP"}
                </button>
              </form>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-[11px] text-slate-400">
              {isLogin && (
                <button
                  type="button"
                  className="text-cyan-300 transition hover:text-white"
                  onClick={() => {
                    setNotice("");
                    setMode("forgot");
                  }}
                >
                  Forgot password?
                </button>
              )}
              {!isLogin && !isCreate && !isDiscordLink && (
                <button
                  type="button"
                  className="text-cyan-300 transition hover:text-white"
                  onClick={() => {
                    setNotice("");
                    setMode("login");
                  }}
                >
                  Back to sign in
                </button>
              )}
            </div>
            {isCreate && (
              <div className="mt-5 text-center text-[11px] text-slate-400">
                Already have an account?{" "}
                <button
                  type="button"
                  className="text-cyan-300 transition hover:text-white"
                  onClick={() => {
                    setNotice("");
                    setMode("login");
                  }}
                >
                  Sign in
                </button>
              </div>
            )}
            {isDiscordLink && (
              <div className="mt-5 text-center text-[11px] text-slate-400">
                Need a new account?{" "}
                <button
                  type="button"
                  className="text-cyan-300 transition hover:text-white"
                  onClick={() => {
                    setNotice("");
                    setMode("create");
                  }}
                >
                  Create one first
                </button>
              </div>
            )}
            {isLogin && (
              <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
                {loginMethod === "aidoru" ? (
                  <>
                    Use the AIDORU ID from your trainer profile and your website password. Discord users can also
                    sign in with their phone number or continue with Discord.
                  </>
                ) : (
                  <>
                    Use the same phone number you use with the WhatsApp bot. The{" "}
                    <span className="text-cyan-300">+</span> country code and number identify the WhatsApp trainer
                    whose progress AIDORU displays. New accounts and password recovery are verified with{" "}
                    <span className="text-cyan-300">.otp</span> in a private bot chat.
                  </>
                )}
              </p>
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

function DiscordMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-current">
      <path d="M19.54 5.01A16.1 16.1 0 0 0 15.56 3.8l-.49 1a14.7 14.7 0 0 0-6.14 0l-.49-1c-1.4.24-2.73.65-3.98 1.21C1.94 8.8 1.26 12.5 1.6 16.14a16.2 16.2 0 0 0 4.9 2.46l1.19-1.63c-.65-.24-1.27-.54-1.86-.9l.45-.35c3.58 1.68 7.46 1.68 11 0l.46.35c-.6.36-1.22.67-1.87.9l1.19 1.63a16.2 16.2 0 0 0 4.9-2.46c.4-4.3-.69-7.96-2.42-11.13ZM8.93 14.1c-1.06 0-1.93-.98-1.93-2.18s.85-2.18 1.93-2.18 1.94.98 1.93 2.18c0 1.2-.85 2.18-1.93 2.18Zm6.14 0c-1.06 0-1.93-.98-1.93-2.18s.85-2.18 1.93-2.18 1.94.98 1.93 2.18c0 1.2-.85 2.18-1.93 2.18Z" />
    </svg>
  );
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
  prefix,
  type = "text",
  autoComplete,
  inputMode,
}: {
  icon: typeof Fingerprint;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  prefix?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <label className="block">
      <span className="landing-kicker mb-2 block">{label}</span>
      <span className="landing-input flex items-center gap-3 rounded-full border border-white/15 px-4 py-3.5 transition focus-within:border-cyan-300/70">
        <Icon className="size-4 shrink-0 text-slate-400" />
        {prefix && <span className="text-sm font-semibold text-cyan-300">{prefix}</span>}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          type={type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
        />
      </span>
    </label>
  );
}
