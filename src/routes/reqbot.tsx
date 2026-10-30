import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Check, LoaderCircle, ShieldCheck, Users } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { sendReqbotRequest } from "@/lib/aidoru.functions";
import { useSession } from "@/components/aidoru/session";

export const Route = createFileRoute("/reqbot")({
  head: () => ({
    meta: [
      { title: "Request a bot — AIDORU" },
      { name: "description", content: "Request an AIDORU bot for your WhatsApp group." },
    ],
  }),
  component: RequestBotPage,
});

function RequestBotPage() {
  const { data: user, isLoading: checkingSession } = useSession();
  const sendRequest = useServerFn(sendReqbotRequest);
  const [groupLink, setGroupLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = await sendRequest({ data: { groupLink } });
      setNotice({
        kind: "success",
        text: result.alreadyQueued
          ? "Your request is already in the review queue."
          : "Your group invite is in the review.",
      });
      if (!result.alreadyQueued) setGroupLink("");
    } catch (error) {
      const message = error instanceof Error && /invite link/i.test(error.message)
        ? error.message
        : "We couldn't queue that request right now. Check the invite link and try again shortly.";
      setNotice({ kind: "error", text: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="reqbot-page">
      <div className="reqbot-backdrop" aria-hidden="true" />
      <header className="reqbot-header">
        <a className="reqbot-brand" href="/" aria-label="AIDORU home">
          <span className="reqbot-brand-mark">A</span>
          <span>AIDORU</span>
        </a>
        <a className="reqbot-account-link" href={user ? "/profile" : "/login?returnTo=%2Freqbot"}>
          {user ? user.name || "My profile" : "Sign in"}
          <ArrowUpRight size={15} />
        </a>
      </header>

      <section className="reqbot-content">
        <div className="reqbot-copy">
          <div className="reqbot-eyebrow"><span /> COMMUNITY ACCESS · 01</div>
          <h1>Bring AIDORU<br /><em>to your group.</em></h1>
          <p className="reqbot-intro">
            Share your WhatsApp invite and our team can review your group for a bot.
            You can follow the request right here without sending invite links in chat.
          </p>
          <div className="reqbot-points">
            <div><ShieldCheck size={18} /><span><strong>Private review</strong><small>Your link goes to the existing staff request queue.</small></span></div>
            <div><Users size={18} /><span><strong>Admin-checked forwarding</strong><small>A connected bot forwards requests only when it is an admin in the review group.</small></span></div>
          </div>
          <a className="reqbot-home-link" href="/"><ArrowLeft size={15} /> Back to AIDORU</a>
        </div>

        <form className="reqbot-form-card" onSubmit={submit}>
          <div className="reqbot-form-top">
            <span>GROUP REQUEST</span>
            <span className="reqbot-form-index">A—01</span>
          </div>
          <h2>Where should we join?</h2>
          <p>Paste the invite link for the WhatsApp group you manage.</p>

          <div className="reqbot-link-visual">
            <img src="/reqbot-helper.gif" alt="Animated AIDORU helper" />
          </div>

          <label htmlFor="reqbot-group-link">WhatsApp group invite</label>
          <div className="reqbot-input-wrap">
            <span>↗</span>
            <input
              id="reqbot-group-link"
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://chat.whatsapp.com/…"
              pattern="https://chat[.]whatsapp[.]com/[A-Za-z0-9_-]+/?([?].*)?"
              maxLength={500}
              required
              value={groupLink}
              onChange={(event) => setGroupLink(event.target.value)}
            />
          </div>

          {user ? (
            <div className="reqbot-signed-in"><Check size={15} /> Signed in as {user.name || "AIDORU member"}</div>
          ) : checkingSession ? (
            <div className="reqbot-signed-in reqbot-session-check"><LoaderCircle size={15} /> Checking your account…</div>
          ) : (
            <div className="reqbot-signin-note">
              <span>Sign in to submit a group request.</span>
              <a href="/login?returnTo=%2Freqbot">Sign in <ArrowUpRight size={13} /></a>
            </div>
          )}

          <button className="reqbot-submit" type="submit" disabled={!user || busy}>
            {busy ? <><LoaderCircle className="reqbot-spinner" size={17} /> Sending request…</> : <>Submit for review <ArrowUpRight size={17} /> </>}
          </button>

          {notice && (
            <div className={`reqbot-notice reqbot-notice-${notice.kind}`} role="status">
              {notice.kind === "success" && <Check size={16} />}
              <span>{notice.text}</span>
            </div>
          )}
          <small className="reqbot-footnote">Submitting a request does not automatically add the bot or guarantee approval.</small>
        </form>
      </section>
    </main>
  );
}
