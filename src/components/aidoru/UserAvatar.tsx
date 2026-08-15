import { useState } from "react";
import { cn } from "@/lib/utils";

type UserAvatarProps = {
  name?: string | null;
  src?: string | null;
  className?: string;
  imageClassName?: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "A";
  const last = parts[parts.length - 1] ?? first;
  return (
    parts.length > 1 ? `${first[0] ?? "A"}${last[0] ?? "A"}` : first.slice(0, 2)
  ).toUpperCase();
}

export function UserAvatar({ name = "AIDORU", src, className, imageClassName }: UserAvatarProps) {
  const [failed, setFailed] = useState(false);
  const hasImage = Boolean(src && !failed);
  return (
    <span
      className={cn("aidoru-avatar", className)}
      aria-label={`${name ?? "User"} profile picture`}
    >
      {hasImage ? (
        <img
          src={src ?? undefined}
          alt=""
          className={cn("h-full w-full object-cover", imageClassName)}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="aidoru-avatar-fallback">{initials(name ?? "AIDORU")}</span>
      )}
    </span>
  );
}
