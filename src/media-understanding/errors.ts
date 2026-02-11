import { OpenClawError, OpenClawErrorCodes } from "../infra/errors/index.js";

export type MediaUnderstandingSkipReason = "maxBytes" | "timeout" | "unsupported" | "empty";

export class MediaUnderstandingSkipError extends OpenClawError {
  readonly reason: MediaUnderstandingSkipReason;

  constructor(reason: MediaUnderstandingSkipReason, message: string, cause?: unknown) {
    super(message, {
      code: OpenClawErrorCodes.TOOL_EXECUTION_FAILED,
      cause,
      context: { errorType: "media-understanding-skip", reason },
    });
    this.reason = reason;
    this.name = "MediaUnderstandingSkipError";
  }
}

export function isMediaUnderstandingSkipError(err: unknown): err is MediaUnderstandingSkipError {
  return err instanceof MediaUnderstandingSkipError;
}
