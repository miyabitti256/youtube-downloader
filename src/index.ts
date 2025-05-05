import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";

import { ytRoutes } from "./routes/yt-routes";

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
const PORT = Number.parseInt(process.env.PORT || "3000");

console.log(`サーバーが起動しました。http://localhost:${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
};
