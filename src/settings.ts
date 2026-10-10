export type Theme = 'system' | 'dark' | 'light';
export type Quality = 'economy' | 'balanced' | 'fine';
export type Projection = 'straight' | 'diagonal';
export interface Settings {
  version: 2;
  enabled: boolean;
  transparency: number;
  spread: number;
  softness: number;
  projection: Projection;
  theme: Theme;
  quality: Quality;
}
export const SETTINGS_KEY = 'biliLiquidGlass.settings';
export const DEFAULTS: Readonly<Settings> = Object.freeze({
  version: 2, enabled: true, transparency: 65,
  spread: 35, softness: 65, projection: 'diagonal',
  theme: 'system', quality: 'balanced',
});
export const PRESETS = {
  economy: { width: 128, fps: 12, label: '省电' },
  balanced: { width: 256, fps: 24, label: '均衡' },
  fine: { width: 384, fps: 30, label: '细腻' },
} as const;

export function normalizeSettings(value: unknown): Settings {
  const result = { ...DEFAULTS };
  if (!value || typeof value !== 'object') return result;
  const raw = value as Record<string, unknown>;
  // Read v1 once using the old glass opacity as the migration reference.
  // Unknown future schemas are preserved in storage and not interpreted.
  if (raw.version !== undefined && raw.version !== 1 && raw.version !== 2) return result;
  if (typeof raw.enabled==='boolean') result.enabled=raw.enabled;
  const clamp=(number:number,max=100)=>Math.round(Math.max(0,Math.min(max,number)));
  if (raw.version===1 || (raw.version===undefined && raw.transparency===undefined)) {
    if (raw.ambient===false && raw.glass===false) result.enabled=false;
    if (typeof raw.glassOpacity==='number' && Number.isFinite(raw.glassOpacity)) result.transparency=100-clamp(raw.glassOpacity);
    else if (typeof raw.brightness==='number' && Number.isFinite(raw.brightness)) result.transparency=clamp(raw.brightness);
  }
  for (const key of ['transparency', 'spread', 'softness'] as const) {
    if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) {
      result[key] = clamp(raw[key],key==='spread'?200:100);
    }
  }
  if (typeof raw.theme==='string' && ['system', 'light', 'dark'].includes(raw.theme)) result.theme = raw.theme as Theme;
  if (typeof raw.quality==='string' && ['economy', 'balanced', 'fine'].includes(raw.quality)) result.quality = raw.quality as Quality;
  if (typeof raw.projection==='string' && ['straight', 'diagonal'].includes(raw.projection)) result.projection = raw.projection as Projection;
  return result;
}

export interface StorageBackend {
  read(): Promise<unknown>;
  write(settings: Settings): Promise<void>;
  listen(listener: (settings: unknown) => void): () => void;
}
export function extensionStorage(): StorageBackend {
  return {
    read: async () => (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY],
    write: async settings => { await chrome.storage.local.set({ [SETTINGS_KEY]: settings }); },
    listen: listener => {
      const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === 'local' && SETTINGS_KEY in changes) listener(changes[SETTINGS_KEY].newValue);
      };
      const event=chrome.storage.onChanged;
      event.addListener(onChange);
      return () => {
        try { event.removeListener(onChange); } catch { /* The extension may have been reloaded. */ }
      };
    },
  };
}

export class SettingsStore {
  value: Settings = { ...DEFAULTS };
  private listeners = new Set<(settings: Settings) => void>();
  private unlisten: (() => void) | undefined;
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private revision = 0;
  private deferredSettings: Settings | null = null;
  private disposed = false;
  constructor(private backend: StorageBackend = extensionStorage()) {}
  async init(): Promise<void> {
    if (this.disposed) return;
    this.unlisten = this.backend.listen(raw => {
      this.revision++;
      if (this.pending === 0) this.publish(normalizeSettings(raw));
      else this.deferredSettings = normalizeSettings(raw);
    });
    const revision = this.revision;
    const raw = await this.backend.read();
    if (!this.disposed && revision === this.revision) {
      this.publish(normalizeSettings(raw));
      if (raw && typeof raw==='object' && (raw as {version?:number}).version===1) {
        // Migration failures do not prevent using the normalized in-memory state.
        await this.update({}).catch(()=>{});
      }
    }
  }
  subscribe(listener: (settings: Settings) => void): () => void {
    this.listeners.add(listener);
    listener(this.value);
    return () => this.listeners.delete(listener);
  }
  update(patch: Partial<Settings>): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Settings store disposed'));
    this.revision++;
    const next = normalizeSettings({ ...this.value, ...patch, version: 2 });
    this.publish(next);
    this.pending++;
    const write = this.queue.catch(() => {}).then(() => this.backend.write(next));
    this.queue = write;
    return write.finally(() => { this.pending--; return this.reconcileChanges(); });
  }
  reset(): Promise<void> { return this.update({ ...DEFAULTS }); }
  dispose(): void {
    this.disposed=true; this.deferredSettings=null;
    this.unlisten?.(); this.unlisten=undefined; this.listeners.clear();
  }
  private async reconcileChanges(): Promise<void> {
    if (this.pending || this.disposed || !this.deferredSettings) return;
    const deferred=this.deferredSettings; this.deferredSettings=null;
    if ((Object.keys(DEFAULTS) as (keyof Settings)[]).every(key=>deferred[key]===this.value[key])) return;
    // A second context can commit while our write promise is still pending.
    // Read the final storage value: a buffered event may precede our own commit.
    const revision=this.revision;
    try {
      const raw=await this.backend.read();
      if (!this.disposed && !this.pending && revision===this.revision) this.publish(normalizeSettings(raw));
    } catch { /* Reconciliation failure must not replace the original write result. */ }
  }
  private publish(value: Settings): void {
    if (this.disposed) return;
    this.value = value;
    for (const listener of this.listeners) listener(value);
  }
}
