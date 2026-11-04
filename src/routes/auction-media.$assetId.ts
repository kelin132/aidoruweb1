import { createFileRoute } from "@tanstack/react-router";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db.server";

type ProfileMediaType = "video/mp4" | "image/gif";
type CachedProfileMedia = {
  contentType: ProfileMediaType;
  bytes: Buffer;
  expiresAt: number;
};

const PROFILE_MEDIA_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_PROFILE_MEDIA_CACHE_ENTRIES = 3;
const profileMediaCache = new Map<string, CachedProfileMedia>();

function getCachedProfileMedia(id: string): CachedProfileMedia | null {
  const cached = profileMediaCache.get(id);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    profileMediaCache.delete(id);
    return null;
  }
  profileMediaCache.delete(id);
  profileMediaCache.set(id, cached);
  return cached;
}

function cacheProfileMedia(id: string, contentType: ProfileMediaType, bytes: Buffer): void {
  profileMediaCache.delete(id);
  profileMediaCache.set(id, {
    contentType,
    bytes,
    expiresAt: Date.now() + PROFILE_MEDIA_CACHE_TTL_MS,
  });
  while (profileMediaCache.size > MAX_PROFILE_MEDIA_CACHE_ENTRIES) {
    profileMediaCache.delete(profileMediaCache.keys().next().value!);
  }
}

function profileMediaResponse(
  media: Buffer,
  mediaType: ProfileMediaType,
  request: Request,
): Response {
  const baseHeaders = {
    "Content-Type": mediaType,
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
  };
  const range = mediaType === "video/mp4" ? request.headers.get("range") : null;
  if (!range) {
    return new Response(new Uint8Array(media), {
      headers: {
        ...baseHeaders,
        "Content-Length": String(media.byteLength),
        ...(mediaType === "video/mp4" ? { "Accept-Ranges": "bytes" } : {}),
      },
    });
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (!match[1] && !match[2])) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${media.length}` } });
  }
  const suffixLength = match[1] ? null : Number(match[2]);
  const start = match[1] ? Number(match[1]) : Math.max(0, media.length - (suffixLength || 0));
  const end = match[2] && match[1] ? Math.min(Number(match[2]), media.length - 1) : media.length - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= media.length ||
    end < start
  ) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${media.length}` } });
  }

  const chunk = media.subarray(start, end + 1);
  return new Response(new Uint8Array(chunk), {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Length": String(chunk.byteLength),
      "Content-Range": `bytes ${start}-${end}/${media.length}`,
      "Accept-Ranges": "bytes",
    },
  });
}

export const Route = createFileRoute("/auction-media/$assetId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (!ObjectId.isValid(params.assetId)) return new Response("Not found", { status: 404 });
        const id = new ObjectId(params.assetId);
        const assetId = id.toHexString();

        if (new URL(request.url).searchParams.get("profile") === "1") {
          const cached = getCachedProfileMedia(assetId);
          if (cached) return profileMediaResponse(cached.bytes, cached.contentType, request);

          const db = await getDb();
          const videoAsset = await db.collection("mn_web_profile_video_assets").findOne({ _id: id });
          if (!videoAsset || typeof videoAsset["videoBase64"] !== "string") {
            return new Response("Not found", { status: 404 });
          }
          const mediaType = ["video/mp4", "image/gif"].includes(String(videoAsset["contentType"]))
            ? String(videoAsset["contentType"]) as ProfileMediaType
            : null;
          if (!mediaType) return new Response("Not found", { status: 404 });
          const media = Buffer.from(videoAsset["videoBase64"], "base64");
          if (!media.length || media.length > 10 * 1024 * 1024) {
            return new Response("Not found", { status: 404 });
          }
          cacheProfileMedia(assetId, mediaType, media);
          return profileMediaResponse(media, mediaType, request);
        }

        const db = await getDb();
        const asset = await db.collection("mn_web_auction_assets").findOne({ _id: id });
        if (!asset || typeof asset["imageBase64"] !== "string") {
          const cached = getCachedProfileMedia(assetId);
          if (cached) return profileMediaResponse(cached.bytes, cached.contentType, request);

          const videoAsset = await db.collection("mn_web_profile_video_assets").findOne({ _id: id });
          if (!videoAsset || typeof videoAsset["videoBase64"] !== "string") {
            return new Response("Not found", { status: 404 });
          }
          const mediaType = ["video/mp4", "image/gif"].includes(String(videoAsset["contentType"]))
            ? String(videoAsset["contentType"]) as ProfileMediaType
            : null;
          if (!mediaType) return new Response("Not found", { status: 404 });
          const media = Buffer.from(videoAsset["videoBase64"], "base64");
          if (!media.length || media.length > 10 * 1024 * 1024) {
            return new Response("Not found", { status: 404 });
          }
          cacheProfileMedia(assetId, mediaType, media);
          return profileMediaResponse(media, mediaType, request);
        }

        const contentType = ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
          String(asset["contentType"]),
        )
          ? String(asset["contentType"])
          : "application/octet-stream";
        const image = Buffer.from(asset["imageBase64"], "base64");
        return new Response(new Uint8Array(image), {
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(image.byteLength),
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
