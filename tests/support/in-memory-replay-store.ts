import type { PreviewTokenReplayStore } from "../../src/lib/server/question-bank/import/preview-token-server.ts";

export class InMemoryPreviewTokenReplayStore implements PreviewTokenReplayStore {
  private usedJtis = new Map<string, number>();

  async consumeOnce(jti: string, expiresAt: number): Promise<boolean> {
    const now = Date.now();
    for (const [k, exp] of this.usedJtis.entries()) {
      if (exp < now) {
        this.usedJtis.delete(k);
      }
    }
    if (this.usedJtis.has(jti)) {
      return false;
    }
    this.usedJtis.set(jti, expiresAt);
    return true;
  }
}
