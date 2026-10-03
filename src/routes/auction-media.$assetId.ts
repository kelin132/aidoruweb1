import { createFileRoute } from "@tanstack/react-router";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/db.server";

export const Route = createFileRoute("/auction-media/$assetId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (!ObjectId.isValid(params.assetId)) return new Response("Not found", { status: 404 });
        const asset = await (
          await getDb()
        )
          .collection("mn_web_auction_assets")
          .findOne({ _id: new ObjectId(params.assetId) });
        if (!asset || typeof asset["imageBase64"] !== "string") {
          return new Response("Not found", { status: 404 });
        }

        const contentType = ["image/jpeg", "image/png", "image/webp"].includes(
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
