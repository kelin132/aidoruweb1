import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { AppShell } from "@/components/aidoru/AppShell";
import { sendModeratorApplication } from "@/lib/aidoru.functions";

export const Route = createFileRoute("/mod-application")({
  head: () => ({
    meta: [
      { title: "Join the Aidoru team" },
      { name: "description", content: "Apply to help moderate the Aidoru community." },
    ],
  }),
  component: ModeratorApplication,
});

type Role = "mod" | "staff";
type Knowledge = "new" | "basic" | "confident" | "expert";
type Gender = "female" | "male";

const stepLabels = ["Your name", "Phone number", "Why join?", "Requested role", "Bot experience", "Gender"];
const knowledgeOptions: Array<{ value: Knowledge; label: string; note: string }> = [
  { value: "new", label: "New", note: "Still learning" },
  { value: "basic", label: "Basic", note: "I know the essentials" },
  { value: "confident", label: "Confident", note: "I can guide others" },
  { value: "expert", label: "Expert", note: "I know it inside out" },
];
const fieldClass = "mod-application-field";
const choiceClass = "mod-application-choice";

function ModeratorApplication() {
  const submitApplication = useServerFn(sendModeratorApplication);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [reason, setReason] = useState("");
  const [requestedRole, setRequestedRole] = useState<Role>("mod");
  const [botKnowledge, setBotKnowledge] = useState<Knowledge>("confident");
  const [gender, setGender] = useState<Gender>("female");
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showLoader, setShowLoader] = useState(true);
  const isLastStep = step === stepLabels.length - 1;
  const progress = ((step + 1) / stepLabels.length) * 100;
  const currentStepLabel = stepLabels[step] ?? "Your name";

  useEffect(() => {
    const timer = window.setTimeout(() => setShowLoader(false), 1900);
    return () => window.clearTimeout(timer);
  }, []);

  function validateStep() {
    if (step === 0 && (name.trim().length < 2 || name.trim().length > 60)) {
      setError("Enter a name between 2 and 60 characters.");
      return false;
    }
    if (step === 1 && (phoneNumber.trim().length < 5 || phoneNumber.trim().length > 32)) {
      setError("Enter a valid phone number.");
      return false;
    }
    if (step === 2 && (reason.trim().length < 20 || reason.trim().length > 1200)) {
      setError("Please write 20–1,200 characters.");
      return false;
    }
    return true;
  }

  async function handleStepSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setError("");
    if (!validateStep()) return;

    if (!isLastStep) {
      setStep((current) => Math.min(stepLabels.length - 1, current + 1));
      return;
    }

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
    <AppShell title="Mod application" hidePageHeading>
      <div className="storefront-page mod-application-page pb-8">
        {showLoader && (
          <div className="mod-application-loader" role="status" aria-label="Loading application">
            <img src="/mod-application-loader.gif" alt="" />
            <span>Loading application</span>
          </div>
        )}

        <div
          className={showLoader ? "mod-application-content is-loading" : "mod-application-content"}
          aria-hidden={showLoader}
        >
          <header className="storefront-header storefront-hero mod-application-hero">
            <div className="mod-application-hero-copy">
              <p className="hof-kicker">AIDORU COMMUNITY</p>
              <h1 className="storefront-title">Mod application</h1>
              <p className="mod-application-description">Apply to join the Aidoru team.</p>
            </div>
            <div className="mod-application-art">
              <img
                src="/mod-application-mascot.gif"
                alt="Aidoru anime mascot"
                className="mod-application-mascot"
                loading="eager"
              />
            </div>
          </header>

          <section className="hof-shop-card mod-application-card" aria-labelledby="application-step-title">
            {submitted ? (
              <div className="mod-application-success" role="status">
                <span className="mod-application-success-icon"><Check className="size-7" /></span>
                <p className="hof-kicker">Application received</p>
                <h2 className="mod-application-step-title">You’re on the list.</h2>
                <p className="mod-application-description">
                  The team will review your application and contact you.
                </p>
              </div>
            ) : (
              <>
                <div className="mod-application-form-heading">
                  <div>
                    <p className="hof-kicker">APPLICATION</p>
                    <h2 id="application-step-title" className="mod-application-step-title">
                      {currentStepLabel}
                    </h2>
                  </div>
                  <span className="mod-application-step-count">{step + 1} / {stepLabels.length}</span>
                </div>
                <div
                  className="mod-application-progress"
                  role="progressbar"
                  aria-label="Application progress"
                  aria-valuemin={1}
                  aria-valuemax={stepLabels.length}
                  aria-valuenow={step + 1}
                >
                  <span style={{ width: progress + "%" }} />
                </div>

                <form onSubmit={handleStepSubmit}>
                  <div className="mod-application-step" key={step} aria-live="polite">
                    {step === 0 && (
                      <label className="mod-application-label">
                        What should we call you?
                        <input
                          className={fieldClass}
                          value={name}
                          onChange={(event) => { setName(event.target.value); setError(""); }}
                          placeholder="Your name"
                          autoComplete="name"
                          minLength={2}
                          maxLength={60}
                          required
                        />
                      </label>
                    )}
                    {step === 1 && (
                      <label className="mod-application-label">
                        Phone number
                        <input
                          className={fieldClass}
                          value={phoneNumber}
                          onChange={(event) => { setPhoneNumber(event.target.value); setError(""); }}
                          placeholder="+263 77 000 0000"
                          type="tel"
                          autoComplete="tel"
                          minLength={5}
                          maxLength={32}
                          required
                        />
                      </label>
                    )}
                    {step === 2 && (
                      <label className="mod-application-label">
                        Why do you want to join the team?
                        <textarea
                          className={fieldClass + " mod-application-textarea"}
                          value={reason}
                          onChange={(event) => { setReason(event.target.value); setError(""); }}
                          placeholder="Tell us briefly why you’re a good fit."
                          minLength={20}
                          maxLength={1200}
                          required
                        />
                        <span className="mod-application-character-count">{reason.length} / 1,200</span>
                      </label>
                    )}
                    {step === 3 && (
                      <fieldset className="mod-application-fieldset">
                        <legend className="mod-application-label">Which role are you applying for?</legend>
                        <div className="mod-application-choices">
                          {([
                            ["mod", "Moderator", "Keep chats safe and welcoming."],
                            ["staff", "Staff", "Help run the wider community."],
                          ] as const).map(([value, label, note]) => (
                            <button
                              key={value}
                              type="button"
                              className={choiceClass + (requestedRole === value ? " is-selected" : "")}
                              onClick={() => setRequestedRole(value)}
                              aria-pressed={requestedRole === value}
                            >
                              <span className="mod-application-choice-heading">
                                <strong>{label}</strong>
                                {requestedRole === value && <Check className="size-4" aria-hidden="true" />}
                              </span>
                              <span className="mod-application-choice-note">{note}</span>
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    )}
                    {step === 4 && (
                      <fieldset className="mod-application-fieldset">
                        <legend className="mod-application-label">How well do you know the bot?</legend>
                        <div className="mod-application-choices mod-application-choices-knowledge">
                          {knowledgeOptions.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              className={choiceClass + (botKnowledge === option.value ? " is-selected" : "")}
                              onClick={() => setBotKnowledge(option.value)}
                              aria-pressed={botKnowledge === option.value}
                            >
                              <strong>{option.label}</strong>
                              <span className="mod-application-choice-note">{option.note}</span>
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    )}
                    {step === 5 && (
                      <fieldset className="mod-application-fieldset">
                        <legend className="mod-application-label">Gender</legend>
                        <div className="mod-application-choices">
                          {([
                            ["female", "Female"],
                            ["male", "Male"],
                          ] as const).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              className={choiceClass + (gender === value ? " is-selected" : "")}
                              onClick={() => setGender(value)}
                              aria-pressed={gender === value}
                            >
                              <strong>{label}</strong>
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    )}
                  </div>

                  {error && <p className="mod-application-error" role="alert">{error}</p>}

                  <div className="mod-application-actions">
                    {step > 0 ? (
                      <button
                        type="button"
                        className="mod-application-back"
                        onClick={() => { setError(""); setStep((current) => Math.max(0, current - 1)); }}
                      >
                        <ChevronLeft className="size-4" /> Back
                      </button>
                    ) : <span />}
                    <button type="submit" className="mod-application-next" disabled={isSubmitting}>
                      {isSubmitting ? (
                        <><LoaderCircle className="size-4 animate-spin" /> Sending…</>
                      ) : (
                        <>{isLastStep ? "Submit application" : "Continue"}<ChevronRight className="size-4" /></>
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
