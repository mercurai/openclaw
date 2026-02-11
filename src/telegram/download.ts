import { ChannelError, OpenClawErrorCodes } from "../infra/errors/index.js";
import { detectMime } from "../media/mime.js";
import { type SavedMedia, saveMediaBuffer } from "../media/store.js";

export type TelegramFileInfo = {
  file_id: string;
  file_unique_id?: string;
  file_size?: number;
  file_path?: string;
};

export async function getTelegramFile(
  token: string,
  fileId: string,
  timeoutMs = 30_000,
): Promise<TelegramFileInfo> {
  const res = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
    { signal: AbortSignal.timeout(timeoutMs) },
  );
  if (!res.ok) {
    throw new ChannelError(
      `getFile failed: ${res.status} ${res.statusText}`,
      OpenClawErrorCodes.CHANNEL_SEND_FAILED,
      {
        context: { channel: "telegram", operation: "getFile", status: res.status, fileId },
      },
    );
  }
  const json = (await res.json()) as { ok: boolean; result?: TelegramFileInfo };
  if (!json.ok || !json.result?.file_path) {
    throw new ChannelError(
      "getFile returned no file_path",
      OpenClawErrorCodes.CHANNEL_SEND_FAILED,
      {
        context: { channel: "telegram", operation: "getFile", fileId },
      },
    );
  }
  return json.result;
}

export async function downloadTelegramFile(
  token: string,
  info: TelegramFileInfo,
  maxBytes?: number,
  timeoutMs = 60_000,
): Promise<SavedMedia> {
  if (!info.file_path) {
    throw new ChannelError("file_path missing", OpenClawErrorCodes.CHANNEL_SEND_FAILED, {
      context: { channel: "telegram", operation: "downloadFile", fileId: info.file_id },
    });
  }
  const url = `https://api.telegram.org/file/bot${token}/${info.file_path}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok || !res.body) {
    throw new ChannelError(
      `Failed to download telegram file: HTTP ${res.status}`,
      OpenClawErrorCodes.CHANNEL_SEND_FAILED,
      {
        context: {
          channel: "telegram",
          operation: "downloadFile",
          filePath: info.file_path,
          status: res.status,
        },
      },
    );
  }
  const array = Buffer.from(await res.arrayBuffer());
  const mime = await detectMime({
    buffer: array,
    headerMime: res.headers.get("content-type"),
    filePath: info.file_path,
  });
  // save with inbound subdir
  const saved = await saveMediaBuffer(array, mime, "inbound", maxBytes, info.file_path);
  // Ensure extension matches mime if possible
  if (!saved.contentType && mime) {
    saved.contentType = mime;
  }
  return saved;
}
