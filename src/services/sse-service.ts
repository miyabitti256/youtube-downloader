// SSEクライアント関連のユーティリティを提供するサービス

// SSEクライアント型の定義
export interface SSEClient {
  send: (event: { event: string; data: string }) => void;
}

// 進捗情報の型定義
export interface ProgressData {
  percent?: number | string | null;
  totalSize?: string;
  currentSpeed?: string;
  eta?: string;
  timestamp: number;
  completed?: boolean;
  error?: string;
  cancelled?: boolean;
  [key: string]: unknown; // その他のプロパティも許可
}

// SSEクライアント一覧を保持するMap（キーはダウンロードID、値はSSEクライアント配列）
const sseClients: Map<string, SSEClient[]> = new Map();

/**
 * ダウンロードIDを生成する関数
 */
export function generateDownloadId(): string {
  return `dl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * クライアントをSSEクライアントリストに追加
 */
export function addSSEClient(downloadId: string, client: SSEClient): void {
  if (!sseClients.has(downloadId)) {
    sseClients.set(downloadId, []);
  }
  sseClients.get(downloadId)?.push(client);
}

/**
 * クライアントをSSEクライアントリストから削除
 */
export function removeSSEClient(downloadId: string, client: SSEClient): void {
  const clients = sseClients.get(downloadId) || [];
  const index = clients.indexOf(client);
  if (index !== -1) {
    clients.splice(index, 1);
  }
  // クライアントがいなくなったら削除
  if (clients.length === 0) {
    sseClients.delete(downloadId);
  }
}

/**
 * 特定のダウンロードに対して進捗を送信
 */
export function sendProgressToClients(
  downloadId: string,
  progress: ProgressData,
): void {
  const clients = sseClients.get(downloadId) || [];
  for (const client of clients) {
    client.send({ event: "progress", data: JSON.stringify(progress) });
  }
}
