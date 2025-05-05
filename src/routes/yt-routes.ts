import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ytdl } from "../services/ytdl-service";
import { z } from "zod";

const ytRoutes = new Hono();

// ビデオ情報を取得するエンドポイント
const videoInfoSchema = z.object({
  url: z.string().url(),
});

ytRoutes.post("/info", zValidator("json", videoInfoSchema), async (c) => {
  const { url } = c.req.valid("json");

  try {
    const info = await ytdl.getVideoInfo(url);
    return c.json({ success: true, data: info });
  } catch (error) {
    console.error("ビデオ情報の取得に失敗しました:", error);
    return c.json(
      { success: false, error: "動画情報の取得に失敗しました" },
      500,
    );
  }
});

// ダウンロードオプションを指定するためのスキーマ
const downloadOptionsSchema = z.object({
  url: z.string().url(),
  format: z.string().optional(),
  quality: z.string().optional(),
  output: z.string().optional(),
  audioOnly: z.boolean().optional(),
  videoOnly: z.boolean().optional(),
  additionalOptions: z
    .record(z.string(), z.union([z.string(), z.boolean(), z.number()]))
    .optional(),
});

// ビデオをダウンロードするエンドポイント
ytRoutes.post(
  "/download",
  zValidator("json", downloadOptionsSchema),
  async (c) => {
    const options = c.req.valid("json");

    try {
      const result = await ytdl.downloadVideo(options);
      return c.json({ success: true, data: result });
    } catch (error) {
      console.error("ダウンロードに失敗しました:", error);
      return c.json(
        { success: false, error: "ダウンロードに失敗しました" },
        500,
      );
    }
  },
);

// 利用可能なフォーマットを取得するエンドポイント
ytRoutes.post("/formats", zValidator("json", videoInfoSchema), async (c) => {
  const { url } = c.req.valid("json");

  try {
    const formats = await ytdl.getAvailableFormats(url);
    return c.json({ success: true, data: formats });
  } catch (error) {
    console.error("フォーマット情報の取得に失敗しました:", error);
    return c.json(
      { success: false, error: "フォーマット情報の取得に失敗しました" },
      500,
    );
  }
});

// ダウンロード済みファイルの一覧を取得するエンドポイント
ytRoutes.get("/downloads", async (c) => {
  try {
    const downloads = await ytdl.getDownloadedFiles();
    return c.json({ success: true, data: downloads });
  } catch (error) {
    console.error("ダウンロード一覧の取得に失敗しました:", error);
    return c.json(
      { success: false, error: "ダウンロード一覧の取得に失敗しました" },
      500,
    );
  }
});

// yt-dlp の状態をチェックするエンドポイント
ytRoutes.get("/status", async (c) => {
  try {
    const status = await ytdl.checkStatus();
    return c.json({ success: true, data: status });
  } catch (error) {
    console.error("ステータスの取得に失敗しました:", error);
    return c.json(
      { success: false, error: "ステータスの取得に失敗しました" },
      500,
    );
  }
});

export { ytRoutes };
