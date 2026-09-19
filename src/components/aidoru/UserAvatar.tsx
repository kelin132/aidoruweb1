import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { normalizeProfileFrame, profileFrameAsset } from "@/lib/profileFrames";
import "@/styles/profileFrames.css";

type UserAvatarProps = {
  name?: string | null;
  src?: string | null;
  videoSrc?: string | null;
  frame?: string | null;
  className?: string;
  imageClassName?: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "A";
  const last = parts[parts.length - 1] ?? first;
  return (parts.length > 1 ? `${first[0] ?? "A"}${last[0] ?? "A"}` : first.slice(0, 2)).toUpperCase();
}

export function UserAvatar({ name = "AIDORU", src, videoSrc, frame, className, imageClassName }: UserAvatarProps) {
  const [failed, setFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    setVideoFailed(false);
  }, [src, videoSrc]);
  const hasVideo = Boolean(videoSrc && !videoFailed);
  const hasImage = Boolean(src && !failed);
  const frameId = normalizeProfileFrame(frame);
  const frameAsset = profileFrameAsset(frameId);
  return (
    <span className={cn("aidoru-avatar", className)} data-frame={frameId} aria-label={`${name ?? "User"} profile picture`}>
      <span className="aidoru-avatar-picture">
        {hasVideo ? (
          <video src={videoSrc ?? undefined} className={cn("h-full w-full object-cover", imageClassName)} autoPlay loop muted playsInline preload="metadata" aria-label="Animated profile picture" onError={() => setVideoFailed(true)} />
        ) : hasImage ? (
          <img src={src ?? undefined} alt="" className={cn("h-full w-full object-cover", imageClassName)} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        ) : (
          <span className="aidoru-avatar-fallback">{initials(name ?? "AIDORU")}</span>
        )}
      </span>
      {frameAsset && (
        <svg className="aidoru-avatar-frame" viewBox="0 0 100 100" aria-hidden="true">
          <use href={`/profile-frames/frames.svg#${frameAsset}`} />
        </svg>
      )}
    </span>
  );
}
