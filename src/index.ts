import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";

import { exec } from "node:child_process";
import { ytRoutes } from "./routes/yt-routes";
import { ytdlpBinaryService } from "./services/ytdlp-binary-service";

// yt-dlpバイナリの初期化・更新
await ytdlpBinaryService.setup();

const app = new Hono();

// ミドルウェア
app.use("*", logger());
app.use("*", prettyJSON());
app.use("*", cors());

// 静的ファイルの提供
app.use("/", serveStatic({ root: "./static/front" }));
app.use("/static", serveStatic({ root: "./static" }));

// API ルート
app.route("/api", ytRoutes);

// デフォルトポート
const PORT = Number.parseInt(process.env.PORT || "4649");

// サーバー起動時にブラウザを自動で開く
function openBrowser(url: string) {
  const platform = process.platform;
  if (platform === "win32") {
    exec(`start ${url}`);
  } else if (platform === "darwin") {
    exec(`open ${url}`);
  } else {
    exec(`xdg-open ${url}`);
  }
}

openBrowser(`http://localhost:${PORT}`);

console.log(`サーバーが起動しました。http://localhost:${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
