import type { GameStateMessage } from "@keyglow/protocol";
import type { Backend } from "./backends/backend.js";
import { colorsForKeys, type Palette } from "./palette.js";

export interface ControllerOptions {
  palette: Palette;
  /** Restore the keyboard if the extension goes quiet for this long (tab crashed, browser closed). */
  idleTimeoutMs: number;
  log: (line: string) => void;
}

/**
 * Owns the backend. Applies game states one at a time, reconnects if the keyboard was
 * unplugged, and restores the user's lighting when the game closes or the extension goes quiet.
 */
export class Controller {
  private queue: Promise<void> = Promise.resolve();
  private idleTimer: NodeJS.Timeout | undefined;
  private connected = false;
  private showing = false;
  private lastFrame = "";
  lastError: string | undefined;

  constructor(
    readonly backend: Backend,
    private readonly options: ControllerOptions,
  ) {}

  get isConnected(): boolean {
    return this.connected;
  }

  /** Tries to reach the keyboard. Failure is recorded, not thrown, so the server can report it. */
  connect(): Promise<void> {
    return this.enqueue(() => this.ensureConnected());
  }

  apply(message: GameStateMessage): Promise<void> {
    return this.enqueue(async () => {
      clearTimeout(this.idleTimer);
      if (message.status === "closed") {
        await this.restoreNow();
        return;
      }
      this.idleTimer = setTimeout(() => {
        this.options.log("extension went quiet, restoring keyboard lighting");
        void this.restore();
      }, this.options.idleTimeoutMs);
      this.idleTimer.unref();

      const frame = JSON.stringify(message.keys);
      if (this.showing && frame === this.lastFrame) return;
      await this.ensureConnected();
      if (!this.connected) throw new Error(this.lastError ?? "keyboard not connected");
      try {
        await this.backend.setLetters(colorsForKeys(message.keys, this.options.palette));
      } catch (err) {
        await this.dropConnection(err);
        throw err;
      }
      this.showing = true;
      this.lastFrame = frame;
    });
  }

  restore(): Promise<void> {
    return this.enqueue(() => this.restoreNow());
  }

  async shutdown(): Promise<void> {
    clearTimeout(this.idleTimer);
    await this.restore().catch(() => {});
    await this.backend.close().catch(() => {});
  }

  private async restoreNow(): Promise<void> {
    if (!this.showing || !this.connected) return;
    try {
      await this.backend.restore();
      this.showing = false;
      this.lastFrame = "";
    } catch (err) {
      await this.dropConnection(err);
      throw err;
    }
  }

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;
    try {
      await this.backend.connect();
      this.connected = true;
      this.lastError = undefined;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
    }
  }

  private async dropConnection(err: unknown): Promise<void> {
    this.lastError = err instanceof Error ? err.message : String(err);
    this.connected = false;
    this.showing = false;
    this.lastFrame = "";
    await this.backend.close().catch(() => {});
  }

  /** Runs tasks strictly one after another; a failed task does not block later ones. */
  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => {});
    return run;
  }
}
