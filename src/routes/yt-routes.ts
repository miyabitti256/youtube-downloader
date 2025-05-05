import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  addSSEClient,
  generateDownloadId,
  removeSSEClient,
} from "../services/sse-service";
import type { SSEClient } from "../services/sse-service";
import { ytdl } from "../services/ytdl-service";

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
    .record(z.union([z.string(), z.boolean(), z.number()]))
    .optional(),
});

// ビデオをダウンロードするエンドポイント
ytRoutes.post(
  "/download",
  zValidator("json", downloadOptionsSchema),
  async (c) => {
    const options = c.req.valid("json");

    try {
      // ダウンロードIDを生成
      const downloadId = generateDownloadId();

      // ダウンロードを開始（非同期で実行し、ダウンロードIDを返す）
      ytdl.downloadVideo(options, downloadId);

      return c.json({
        success: true,
        data: {
          downloadId: downloadId,
        },
      });
    } catch (error) {
      console.error("ダウンロードに失敗しました:", error);
      return c.json(
        { success: false, error: "ダウンロードに失敗しました" },
        500,
      );
    }
  },
);

// ダウンロード進捗をストリーミングするSSEエンドポイント
ytRoutes.get("/download/:id/progress", async (c) => {
  const downloadId = c.req.param("id");

  // SSEストリームを設定（Responseを直接返す）
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const textEncoder = new TextEncoder();

  // ストリームラッパーの作成（SSEClient型に準拠）
  const stream: SSEClient = {
    send: (event: { event: string; data: string }) => {
      const formattedData = `event: ${event.event}\ndata: ${event.data}\n\n`;
      writer.write(textEncoder.encode(formattedData));
    },
  };

  // ストリームヘッダー設定
  stream.send({ event: "connected", data: "Connected to progress stream" });

  // クライアントをダウンロードIDに関連付ける
  addSSEClient(downloadId, stream);

  // クライアント接続が閉じたときの処理
  c.req.raw.signal.addEventListener("abort", () => {
    removeSSEClient(downloadId, stream);
    writer.close().catch(console.error);
  });

  // 接続維持のためのping
  const pingInterval = setInterval(() => {
    stream.send({ event: "ping", data: "ping" });
  }, 30000);

  // クリーンアップ
  c.req.raw.signal.addEventListener("abort", () => {
    clearInterval(pingInterval);
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

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
