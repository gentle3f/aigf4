export interface HistoryCompressionResult {
    version: number;
    encoded: string;
    jsonChars: number;
    compressedChars: number;
    jsonSerializeMs: number;
    compressionMs: number;
}

export interface HistoryCompressionRunner<T> {
    compress(version: number, value: T): Promise<HistoryCompressionResult>;
}

export const hasUndurableHistorySnapshot = (durableVersion: number, currentVersion: number) => (
    durableVersion < currentVersion
);

/** Runs at most one compression at a time and only persists the newest snapshot. */
export class LatestHistoryPersistence<T> {
    private pending: { version: number; value: T } | null = null;
    private running = false;

    constructor(
        private readonly runner: HistoryCompressionRunner<T>,
        private readonly persist: (result: HistoryCompressionResult) => void | Promise<void>,
        private readonly onFailure: (error: unknown) => void | Promise<void>,
    ) {}

    schedule(version: number, value: T) {
        this.pending = { version, value };
        void this.run();
    }

    private async run() {
        if (this.running || !this.pending) return;
        this.running = true;
        const task = this.pending;
        this.pending = null;
        try {
            const result = await this.runner.compress(task.version, task.value);
            // A newer in-memory snapshot exists, so this result must never win.
            if (!this.pending || this.pending.version <= result.version) {
                await this.persist(result);
            }
        } catch (error) {
            await this.onFailure(error);
        } finally {
            this.running = false;
            if (this.pending) void this.run();
        }
    }
}
