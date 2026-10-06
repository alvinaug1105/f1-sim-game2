/**
 * Team colour handling for presentation (UIX-A REDO). Persisted team colours are content data: only a plain hex
 * colour is ever injected into a CSS custom property, and text on a team-colour surface uses the ink with the higher
 * WCAG contrast ratio (so a white, yellow or near-black livery stays readable).
 */
const HEX = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
export const NEUTRAL_TEAM_COLOR = "#5b7cfa";
export function safeTeamColor(color: string | null | undefined): string {
  return color && HEX.test(color) ? color.toLowerCase() : NEUTRAL_TEAM_COLOR;
}
function channels(hex: string) {
  const h = safeTeamColor(hex).slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
}
export function relativeLuminance(hex: string) {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const DARK_INK = "#0b1118";
export const LIGHT_INK = "#ffffff";
/** The readable text colour on `color`: whichever of near-black / white has the higher contrast ratio. */
export function readableInk(color: string | null | undefined): string {
  const l = relativeLuminance(safeTeamColor(color));
  const onLight = (l + 0.05) / (relativeLuminance(DARK_INK) + 0.05);
  const onDark = 1.05 / (l + 0.05);
  return onLight >= onDark ? DARK_INK : LIGHT_INK;
}
/** CSS custom properties for a team identity scope. */
export function teamStyle(color: string | null | undefined): Record<string, string> {
  const team = safeTeamColor(color);
  return { "--team": team, "--team-ink": readableInk(team) };
}
