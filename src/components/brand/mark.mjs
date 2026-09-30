// Single source of truth for the China-in-Ghana "Star home" mark (40 × 40 grid).
// A house for home appliances with a gold star — both Ghana's and China's flags carry stars.
// Used by the React logo, the app icons (scripts/icons.mjs) and the browser-tab icon.

export const BRAND = { navy: "#16306E", navyDark: "#0B1B3F", orange: "#FF6B1A", sun: "#FFC83D", white: "#FFFFFF" };

export const HOUSE_PATH = "M8.1 19.4 20 9.4l11.9 10V30a1.9 1.9 0 0 1-1.9 1.9H10A1.9 1.9 0 0 1 8.1 30z";

export const STAR_POINTS =
  "20.00,19.40 21.44,23.22 25.52,23.41 22.33,25.96 23.41,29.89 20.00,27.65 16.59,29.89 17.67,25.96 14.48,23.41 18.56,23.22";

/** Full-colour mark as an SVG string. `pad` extends the tile (maskable icons), `radius` rounds it. */
export function markSvg({ pad = 0, radius = 11, tile = BRAND.navy, house = BRAND.white, star = BRAND.sun } = {}) {
  const size = 40 + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${size} ${size}">
  <rect x="${-pad}" y="${-pad}" width="${size}" height="${size}" rx="${radius}" fill="${tile}"/>
  <path d="${HOUSE_PATH}" fill="${house}"/>
  <polygon points="${STAR_POINTS}" fill="${star}"/>
</svg>`;
}

/** Monochrome silhouette for Android notification badges: white house with the star cut out. */
export function badgeSvg() {
  const star = STAR_POINTS.split(" ")
    .map((p, i) => `${i ? "L" : "M"}${p.replace(",", " ")}`)
    .join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <path fill-rule="evenodd" d="${HOUSE_PATH} ${star}Z" fill="#fff"/>
</svg>`;
}
