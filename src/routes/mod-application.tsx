import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronRight, Heart, LockKeyhole, Sparkles, UserRoundPlus } from "lucide-react";
import heroIdol from "@/assets/hero-idol.png";
import { sendModeratorApplication } from "@/lib/aidoru.functions";

export const Route = createFileRoute("/mod-application")({
  head: () => ({
    meta: [
      { title: "Join the Aidoru team" },
      {
        name: "description",
        content: "Apply to help moderate the Aidoru community.",
      },
    ],
  }),
  component: ModeratorApplication,
});

type Role = "mod" | "staff";
type Knowledge = "new" | "basic" | "confident" | "expert";
type Gender = "female" | "male";

const knowledgeOptions: Array<{ value: Knowledge; label: string; note: string }> = [
  { value: "new", label: "New", note: "Still learning" },
  { value: "basic", label: "Basic", note: "I know the essentials" },
  { value: "confident", label: "Confident", note: "I can guide others" },
  { value: "expert", label: "Expert", note: "I know it inside out" },
];

const fieldClass =
  "mt-2 w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 transition focus:border-neon-cyan/70 focus:bg-black/30 focus:outline-none";
const choiceClass =
  "rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan";

function ModeratorApplication() {
  const submitApplication = useServerFn(sendModeratorApplication);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [reason, setReason] = useState("");
  const [requestedRole, setRequestedRole] = useState<Role>("mod");
  const [botKnowledge, setBotKnowledge] = useState<Knowledge>("confident");
  const [gender, setGender] = useState<Gender>("female");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await submitApplication({
        data: { name, phoneNumber, reason, requestedRole, botKnowledge, gender },
      });
      setSubmitted(true);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "We could not send your application. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-4 py-8 text-foreground sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute -left-40 top-8 h-96 w-96 rounded-full bg-neon-pink/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-[32rem] w-[32rem] rounded-full bg-neon-cyan/10 blur-3xl" />

      <div className="relative mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-neon-cyan/30 bg-neon-cyan/10 text-neon-cyan">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-lg font-bold tracking-[0.18em] text-foreground">
                AIDORU
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                Community operations
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground sm:flex">
            <LockKeyhole className="h-3.5 w-3.5 text-neon-cyan" />
            Private application portal
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
          <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-panel p-7 shadow-panel sm:p-10 lg:sticky lg:top-8">
            <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-neon-pink/15 blur-3xl" />
            <div className="relative">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-neon-pink/30 bg-neon-pink/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-neon-pink">
                <Heart className="h-3 w-3 fill-current" />
                Moderation unit
              </div>
              <h1 className="max-w-md font-display text-5xl font-bold leading-[0.95] tracking-tight sm:text-6xl">
                Help shape the next <span className="text-neon-cyan">chapter.</span>
              </h1>
              <p className="mt-6 max-w-md text-sm leading-7 text-muted-foreground">
                Aidoru is powered by people who keep the community welcoming, playful, and safe.
                Tell us how you would show up for the team.
              </p>

              <div className="mt-8 flex justify-center">
                <img
                  src={heroIdol}
                  alt="Aidoru idol mascot"
                  className="h-auto max-h-72 w-auto max-w-full object-contain drop-shadow-[0_24px_45px_rgba(0,0,0,0.35)]"
                />
              </div>

              <div className="mt-7 grid gap-3 border-t border-white/10 pt-6 text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center rounded-xl bg-neon-cyan/10 text-neon-cyan">
                    01
                  </span>
                  <span>Be kind, consistent, and present.</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="grid h-7 w-7 place-items-center rounded-xl bg-neon-pink/10 text-neon-pink">
                    02
                  </span>
                  <span>Know the bot, or be ready to learn it.</span>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-panel-strong p-6 shadow-panel sm:p-9">
            {submitted ? (
              <div className="flex min-h-[30rem] flex-col items-center justify-center py-20 text-center">
                <div className="grid h-20 w-20 place-items-center rounded-3xl bg-neon-cyan/15 text-neon-cyan shadow-[0_0_40px_oklch(0.82_0.18_195_/_20%)]">
                  <Check className="h-10 w-10" />
                </div>
                <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-neon-cyan">
                  Application received
                </p>
                <h2 className="mt-3 font-display text-4xl font-bold">You&apos;re on the list.</h2>
                <p className="mt-4 max-w-sm text-sm leading-7 text-muted-foreground">
                  Thank you for putting yourself forward. The team will review your application and
                  reach out using the phone number you provided.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-8 flex items-start justify-between gap-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-neon-pink">
                      Application form
                    </p>
                    <h2 className="mt-2 font-display text-4xl font-bold">Enter your arc.</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      A few quick details for the team.
                    </p>
                  </div>
                  <div className="hidden rounded-2xl bg-white/5 p-3 text-neon-cyan sm:block">
                    <UserRoundPlus className="h-5 w-5" />
                  </div>
                </div>

                <form className="space-y-7" onSubmit={handleSubmit}>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="text-sm font-semibold">
                      Name
                      <input
                        className={fieldClass}
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Your name"
                        autoComplete="name"
                        required
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      Phone number
                      <input
                        className={fieldClass}
                        value={phoneNumber}
                        onChange={(event) => setPhoneNumber(event.target.value)}
                        placeholder="+263 77 000 0000"
                        type="tel"
                        autoComplete="tel"
                        required
                      />
                    </label>
                  </div>

                  <label className="block text-sm font-semibold">
                    Why do you want to join the team?
                    <textarea
                      className={`${fieldClass} min-h-32 resize-y`}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Tell us what makes you a good fit..."
                      minLength={20}
                      maxLength={1200}
                      required
                    />
                    <span className="mt-2 block text-right text-[11px] font-normal text-muted-foreground">
                      {reason.length}/1200
                    </span>
                  </label>

                  <fieldset>
                    <legend className="text-sm font-semibold">Requested role</legend>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          ["mod", "Moderator", "Keep chats safe and welcoming."],
                          ["staff", "Staff", "Help run the wider community."],
                        ] as const
                      ).map(([value, label, note]) => (
                        <button
                          key={value}
                          type="button"
                          className={`${choiceClass} ${
                            requestedRole === value
                              ? "border-neon-cyan/70 bg-neon-cyan/10 text-foreground shadow-[0_0_24px_oklch(0.82_0.18_195_/_12%)]"
                              : "border-white/10 bg-black/10 text-muted-foreground"
                          }`}
                          onClick={() => setRequestedRole(value)}
                          aria-pressed={requestedRole === value}
                        >
                          <span className="flex items-center justify-between gap-3">
                            <span className="font-bold">{label}</span>
                            {requestedRole === value && (
                              <Check className="h-4 w-4 text-neon-cyan" />
                            )}
                          </span>
                          <span className="mt-1 block text-xs font-normal opacity-75">{note}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="text-sm font-semibold">How well do you know the bot?</legend>
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {knowledgeOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`${choiceClass} ${
                            botKnowledge === option.value
                              ? "border-neon-pink/70 bg-neon-pink/10 text-foreground"
                              : "border-white/10 bg-black/10 text-muted-foreground"
                          }`}
                          onClick={() => setBotKnowledge(option.value)}
                          aria-pressed={botKnowledge === option.value}
                        >
                          <span className="block font-bold">{option.label}</span>
                          <span className="mt-1 block text-[11px] font-normal leading-4 opacity-75">
                            {option.note}
                          </span>
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="text-sm font-semibold">Gender</legend>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      {(
                        [
                          ["female", "Female"],
                          ["male", "Male"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={`${choiceClass} ${
                            gender === value
                              ? "border-neon-purple/70 bg-neon-purple/10 text-foreground"
                              : "border-white/10 bg-black/10 text-muted-foreground"
                          }`}
                          onClick={() => setGender(value)}
                          aria-pressed={gender === value}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </fieldset>

                  {error && (
                    <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="group flex w-full items-center justify-center gap-3 rounded-2xl bg-neon-cyan px-5 py-4 text-sm font-bold text-background shadow-[0_12px_30px_oklch(0.82_0.18_195_/_18%)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSubmitting ? "Sending application..." : "Submit application"}
                    {!isSubmitting && (
                      <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    )}
                  </button>
                  <p className="text-center text-[11px] leading-5 text-muted-foreground">
                    By submitting, you agree that the Aidoru team may contact you about this
                    application.
                  </p>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
