import { PRESETS, type Quality } from './settings';

export class FrameGate {
  private last = -Infinity;
  accept(now: number, fps: number): boolean {
    if (now - this.last + 0.5 < 1000 / fps) return false;
    this.last = now;
    return true;
  }
  reset(): void { this.last = -Infinity; }
}

export class AdaptiveQuality {
  current: Quality;
  private total = 0;
  private count = 0;
  constructor(private selected: Quality) { this.current = selected; }
  sample(cost: number): boolean {
    this.total += cost;
    if (++this.count < PRESETS[this.current].fps * 5) return false;
    const overloaded = this.total / this.count > 8;
    this.total = 0; this.count = 0;
    return overloaded && this.downgrade();
  }
  downgrade(): boolean {
    const next: Quality = this.current === 'fine' ? 'balanced' : 'economy';
    if (next === this.current) return false;
    this.current = next;
    return true;
  }
  reset(selected = this.selected): void {
    this.selected = selected; this.current = selected; this.total = 0; this.count = 0;
  }
}
