import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Swords } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "./UserAvatar";
import { sendGuildChallenge } from "@/lib/guild-wars.functions";
import { WAR_TIMING, type GuildWar } from "@/lib/guild-wars";
import type { PublicGuild } from "@/lib/game";

type Props = {
  guilds: PublicGuild[];
  guildsLoading?: boolean;
  mine?: PublicGuild;
  wars: GuildWar[];
  onCreated: (warId: string) => void;
};

export function GuildWarChallengePanel({
  guilds,
  guildsLoading = false,
  mine,
  wars,
  onCreated,
}: Props) {
  const sendChallenge = useServerFn(sendGuildChallenge);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (guild: PublicGuild) => sendChallenge({ data: { guildId: guild.id } }),
    onSuccess: (result, guild) => {
      onCreated(result.id);
      void client.invalidateQueries({ queryKey: ["aidoru", "guild-wars"] });
      toast.success(`Challenge sent to ${guild.name}. Their leader has 24 hours to respond.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const lockedGuildIds = new Set(
    wars
      .filter(
        (war) =>
          ["challenge", "preparation", "battle"].includes(war.phase) ||
          (war.phase === "finished" &&
            war.finishedAt !== null &&
            Date.now() - war.finishedAt < WAR_TIMING.cooldown),
      )
      .flatMap((war) => [war.challenger.id, war.defender.id]),
  );
  const targets = guilds.filter(
    (guild) =>
      guild.id !== mine?.id && guild.memberCount > 0 && !lockedGuildIds.has(guild.id),
  );
  const mineIsLocked = mine ? lockedGuildIds.has(mine.id) : false;
  const leaderName = mine?.members.find((member) => member.isOwner)?.name;

  return (
    <section className="war-matchups space-y-4">
      <div>
        <p className="war-label">Start a guild war</p>
        <h2 className="mt-2 text-xl font-bold">Challenge a guild</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Choose a guild below. Its leader has 24 hours to accept or decline.
        </p>
      </div>

      {guildsLoading ? (
        <p className="text-sm text-muted-foreground">Loading your guild…</p>
      ) : !mine ? (
        <p className="text-sm text-muted-foreground">
          Join a guild first. A guild leader can send the challenge.
        </p>
      ) : !mine.isOwner ? (
        <p className="text-sm text-muted-foreground">
          Only your guild leader can send a challenge{leaderName ? ` — that’s ${leaderName}` : ""}.
        </p>
      ) : mineIsLocked ? (
        <p className="text-sm text-muted-foreground">
          Your guild is already in a war or its 48-hour recovery period.
        </p>
      ) : targets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No other guilds are available to challenge right now.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {targets.map((guild) => {
            const bannerUrl = guild.bannerUrl || guild.iconUrl;
            return (
              <li
                key={guild.id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-background/35"
              >
                <div className="relative h-36 overflow-hidden bg-gradient-to-br from-cyan-950 via-slate-900 to-fuchsia-950">
                  {bannerUrl ? (
                    <img
                      src={bannerUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent" />
                  <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono-ui text-[10px] font-bold tracking-[0.18em] text-cyan-200">
                        {guild.tag}
                      </p>
                      <p className="truncate text-lg font-bold text-white">{guild.name}</p>
                      <p className="mt-1 text-xs text-white/75">
                        Level {guild.level} · {guild.memberCount}{" "}
                        {guild.memberCount === 1 ? "member" : "members"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate(guild)}
                    >
                      <Swords className="size-4" />
                      Challenge
                    </Button>
                  </div>
                </div>
                <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
                  <div className="flex -space-x-2">
                    {guild.members.slice(0, 5).map((member) => (
                      <span key={member.id} title={member.name}>
                        <UserAvatar
                          name={member.name}
                          src={member.avatarUrl}
                          videoSrc={member.avatarVideoUrl}
                          className="size-8 border-2 border-background"
                        />
                      </span>
                    ))}
                  </div>
                  <p className="text-right text-[10px] text-muted-foreground">
                    {guild.members.length
                      ? `${guild.members.length} ${guild.members.length === 1 ? "member" : "members"}`
                      : "No profile photos yet"}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
