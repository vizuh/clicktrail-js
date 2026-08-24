/**
 * Brand design tokens for app-side components.
 *
 * Inlined from product-hunt/tokens.css (ClickTrail brand palette) because
 * the hand-rolled Vue bundles render plain h() elements without any CSS
 * pipeline; hex values are kept in one place so a palette bump stays a
 * single-file change.
 */
export const TOKENS = {
  canvas: '#14171d',
  canvasDeep: '#0d1015',
  panel: '#1d222a',
  panelSoft: '#252b35',
  ink: '#f7f8fa',
  muted: '#aeb6c3',
  line: '#353d49',
  accent: '#ff5358',
  accentSoft: '#ff7b68',
  radius: '12px',
} as const;
