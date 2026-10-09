import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BrainCircuit, LoaderCircle, Sparkles, Swords, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateGuildWarPlan } from "@/lib/guild-wars.functions";
import type { GuildWarCoachFocus, GuildWarCoachPlan } from "@/lib/guild-wars";

const focusOptions: Array<{ value: GuildWarCoachFocus; label: string }> = [
  { value: "balanced", label: "Balanced" },
  { value: "aggressive", label: "Attack early" },
  { value: "defensive", label: "Play safely" },
];

export function GuildWarPlanner({
  open,
  onOpenChange,
  guildId,
  guildName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guildId: string;
  guildName: string;
}) {
  const generatePlan = useServerFn(generateGuildWarPlan);
  const [roster, setRoster] = useState("");
  const [opponent, setOpponent] = useState("");
  const [battleFormat, setBattleFormat] = useState("");
  const [focus, setFocus] = useState<GuildWarCoachFocus>("balanced");
  const [plan, setPlan] = useState<GuildWarCoachPlan | null>(null);
  const mutation = useMutation({
    mutationFn: () => generatePlan({ data: { guildId, roster, opponent, battleFormat, focus } }),
    onSuccess: setPlan,
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPlan(null);
    mutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto border-border bg-card p-0 sm:w-full">
        <header className="border-b border-border p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="war-icon">
              <BrainCircuit />
            </span>
            <div>
              <DialogTitle className="text-xl font-bold">Guild battle coach</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {guildName} · help choosing who should fight and what to do
              </p>
            </div>
          </div>
          <DialogDescription className="mt-4 text-sm leading-relaxed">
            List your fighters and Pokémon, then add anything you know about the other guild. The
            coach will suggest who should face whom and give simple battle tips. It does not change
            the official war results.
          </DialogDescription>
        </header>

        <div className="space-y-6 p-5 sm:p-6">
          <form className="space-y-5" onSubmit={submit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="war-coach-roster">Your fighters and Pokémon</Label>
                <Textarea
                  id="war-coach-roster"
                  required
                  maxLength={7000}
                  rows={8}
                  value={roster}
                  onChange={(event) => setRoster(event.target.value)}
                  placeholder={
                    "Add one fighter per line. Include their Pokémon if you know it.\nRin — Gengar, knows Shadow Ball\nKai — Snorlax"
                  }
                  className="min-h-44 resize-y text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Names are enough to start; Pokémon and moves make the advice more useful.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="war-coach-opponent">Other guild’s fighters</Label>
                <Textarea
                  id="war-coach-opponent"
                  required
                  maxLength={7000}
                  rows={8}
                  value={opponent}
                  onChange={(event) => setOpponent(event.target.value)}
                  placeholder={
                    "Add one opposing fighter per line. Use “unknown” if you have not scouted them.\nMika — Gyarados\nUnknown — not scouted"
                  }
                  className="min-h-44 resize-y text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Do your best; you can mark anything you do not know as “unknown.”
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="war-coach-format">Battle rules (optional)</Label>
                <Input
                  id="war-coach-format"
                  maxLength={1000}
                  value={battleFormat}
                  onChange={(event) => setBattleFormat(event.target.value)}
                  placeholder="Any Pokémon bans or special rules?"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="war-coach-focus">How should your team play?</Label>
                <select
                  id="war-coach-focus"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={focus}
                  onChange={(event) => setFocus(event.target.value as GuildWarCoachFocus)}
                >
                  {focusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
                Your notes are sent to the AI to create this plan. They are not saved to war records.
              </p>
              <Button
                type="submit"
                disabled={mutation.isPending || !roster.trim() || !opponent.trim()}
                className="shrink-0"
              >
                {mutation.isPending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
                {mutation.isPending ? "Making your plan…" : "Make my battle plan"}
              </Button>
            </div>
            {mutation.isError && (
              <p
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                role="alert"
              >
                {mutation.error.message}
              </p>
            )}
          </form>

          {plan && <PlanResult plan={plan} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlanResult({ plan }: { plan: GuildWarCoachPlan }) {
  return (
    <section className="space-y-5 border-t border-border pt-6" aria-live="polite">
      <div>
        <p className="war-label flex items-center gap-2">
          <Swords className="size-4" /> Recommended plan
        </p>
        <p className="mt-2 text-sm leading-relaxed">{plan.summary}</p>
      </div>

      <div>
        <h3 className="mb-3 font-semibold">Who should fight whom</h3>
        {plan.lineup.length ? (
          <ol className="space-y-2">
            {plan.lineup.map((slot) => (
              <li
                key={`${slot.position}-${slot.fighter}`}
                className="rounded-lg border border-border bg-background/60 p-3"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-primary text-xs font-bold">#{slot.position}</span>
                  <strong>{slot.fighter}</strong>
                  <span className="text-muted-foreground text-sm">vs {slot.opponent}</span>
                </div>
                <p className="mt-1 text-sm">
                  {slot.pokemon} <span className="text-primary">· {slot.role}</span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{slot.reason}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            The notes did not include enough named fighters for a lineup order.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <StrategyCard title="Opening" text={plan.strategy.opening} />
        <StrategyCard title="During the battle" text={plan.strategy.midgame} />
        <StrategyCard title="Closing" text={plan.strategy.closing} />
        <StrategyCard title="If things go wrong" text={plan.strategy.contingency} />
      </div>

      {(plan.watchouts.length > 0 || plan.assumptions.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {plan.watchouts.length > 0 && (
            <NoteList icon="watchout" title="Watch-outs" items={plan.watchouts} />
          )}
          {plan.assumptions.length > 0 && (
            <NoteList icon="assumption" title="Assumptions" items={plan.assumptions} />
          )}
        </div>
      )}
    </section>
  );
}

function StrategyCard({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-lg border border-border bg-background/60 p-4">
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
    </article>
  );
}

function NoteList({
  icon,
  title,
  items,
}: {
  icon: "watchout" | "assumption";
  title: string;
  items: string[];
}) {
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        {icon === "watchout" ? (
          <TriangleAlert className="size-4 text-amber-400" />
        ) : (
          <Sparkles className="size-4 text-primary" />
        )}
        {title}
      </h4>
      <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>• {item}</li>
        ))}
      </ul>
    </div>
  );
}
