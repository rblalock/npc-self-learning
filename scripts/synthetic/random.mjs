/** Counter-based randomness: other branches cannot consume or shift these draws. */
export function seedFor(...parts) {
  let hash = 2166136261;
  for (const char of parts.join("/"))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return hash || 1;
}
export function randomAt(seed, stream, index = 0) {
  let x = seedFor(seed, stream, index);
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
}
