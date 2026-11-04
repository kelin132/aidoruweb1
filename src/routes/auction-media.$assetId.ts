import { createFileRoute } from "@tanstack/react-router";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db.server";

export const Route = createFileRoute("/auction-media/$assetId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        if (!ObjectId.isValid(params.assetId)) return new Response("Not found", { status: 404 });
        const db = await getDb();
        const id = new ObjectId(params.assetId);
        const asset = await db.collection("mn_web_auction_assets").findOne({ _id: id });
        if (!asset || typeof asset["imageBase64"] !== "string") {
          const videoAsset = await db.collection("mn_web_profile_video_assets").findOne({ _id: id });
          if (!videoAsset || typeof videoAsset["videoBase64"] !== "string") {
            return new Response("Not found", { status: 404 });
          }
          const videoType = String(videoAsset["contentType"]) === "video/mp4"
            ? String(videoAsset["contentType"])
            : null;
          if (!videoType) return new Response("Not found", { status: 404 });
          const video = Buffer.from(videoAsset["videoBase64"], "base64");
          const range = request.headers.get("range");
          if (range) {
            const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
            if (!match || (!match[1] && !match[2])) {
              return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${video.length}` } });
            }
            const suffixLength = match[1] ? null : Number(match[2]);
            const start = match[1] ? Number(match[1]) : Math.max(0, video.length - (suffixLength || 0));
            const end = match[2] && match[1]
              ? Math.min(Number(match[2]), video.length - 1)
              : video.length - 1;
            if (
              !Number.isSafeInteger(start) ||
              !Number.isSafeInteger(end) ||
              start < 0 ||
              start >= video.length ||
              end < start
            ) {
              return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${video.length}` } });
            }
            const chunk = video.subarray(start, end + 1);
            return new Response(new Uint8Array(chunk), {
              status: 206,
              headers: {
                "Content-Type": videoType,
                "Content-Length": String(chunk.byteLength),
                "Content-Range": `bytes ${start}-${end}/${video.length}`,
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=31536000, immutable",
                "X-Content-Type-Options": "nosniff",
              },
            });
          }
          return new Response(new Uint8Array(video), {
            headers: {
              "Content-Type": videoType,
              "Content-Length": String(video.byteLength),
              "Cache-Control": "public, max-age=31536000, immutable",
              "Accept-Ranges": "bytes",
              "X-Content-Type-Options": "nosniff",
            },
          });
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
