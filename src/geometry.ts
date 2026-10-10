export interface Rect { x: number; y: number; width: number; height: number }
export interface Layout { outer: Rect; video: Rect; clipped: boolean }

export function fittedVideoRect(box: Rect, width: number, height: number, fit = 'contain', position = '50% 50%'): Rect {
  if (!width || !height || fit === 'fill' || fit === 'cover') return { ...box };
  let scale = Math.min(box.width / width, box.height / height);
  if (fit === 'none') scale = 1;
  if (fit === 'scale-down') scale = Math.min(1, scale);
  const w = Math.min(box.width, width * scale), h = Math.min(box.height, height * scale);
  const tokens = position.split(/\s+/);
  const fraction = (text: string | undefined) => {
    if (text === 'left' || text === 'top') return 0;
    if (text === 'right' || text === 'bottom') return 1;
    return text?.endsWith('%') ? Math.max(0, Math.min(1, parseFloat(text) / 100)) : 0.5;
  };
  return { x: box.x + (box.width - w) * fraction(tokens[0]), y: box.y + (box.height - h) * fraction(tokens[1]), width: w, height: h };
}

export function effectLayout(video: Rect, viewport: Rect, spread: number, fullscreen: boolean): Layout {
  const padding = Math.min(video.width, video.height) * (0.08 + spread / 100 * 0.75);
  const left=Math.max(0,video.x-viewport.x),right=Math.max(0,viewport.x+viewport.width-video.x-video.width);
  // Distribute the same horizontal budget across the available side gaps, so
  // the nearer screen edge is not reached much earlier than the farther one.
  // Vertical scrolling never changes this domain or the buffer dimensions.
  const leftPadding=left+right>1?padding*2*left/(left+right):padding;
  const desired = { x: video.x - leftPadding, y: video.y - padding, width: video.width + padding * 2, height: video.height + padding * 2 };
  const clip = fullscreen ? viewport : desired;
  return { outer: clip, video, clipped: fullscreen };
}

export function effectVisibility(outer: Rect, viewport: Rect): number {
  const width=Math.max(0,Math.min(outer.x+outer.width,viewport.x+viewport.width)-Math.max(outer.x,viewport.x));
  const height=Math.max(0,Math.min(outer.y+outer.height,viewport.y+viewport.height)-Math.max(outer.y,viewport.y));
  return Math.min(1,width/Math.max(1,Math.min(outer.width,160)),height/Math.max(1,Math.min(outer.height,160)));
}

export function exclusionPolygon(layout: Layout): string {
  const { outer: o, video: v } = layout;
  const left = Math.max(0, Math.min(o.width, v.x - o.x));
  const top = Math.max(0, Math.min(o.height, v.y - o.y));
  const right = Math.max(0, Math.min(o.width, v.x + v.width - o.x));
  const bottom = Math.max(0, Math.min(o.height, v.y + v.height - o.y));
  return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px, ${left}px ${top}px)`;
}

export function boundedSize(width: number, height: number, longest: number): [number, number] {
  const scale = longest / Math.max(1, width, height);
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}
