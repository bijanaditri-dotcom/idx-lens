import { clamp } from './indicators';
// Financial subjects such as "profit/laba" and "debt" carry no direction alone.
const positive = new Set(['growth','surge','rally','upgrade','dividend','record','bullish','gain','strong','expansion','rise','rises','rebound','improved','recovery','naik','tumbuh','bertumbuh','pertumbuhan','positif','dividen','menguat','ekspansi','rekor','melonjak','melaju','membaik','pulih','pemulihan','meningkat']);
const negative = new Set(['loss','fall','falls','decline','declines','fraud','downgrade','bearish','weak','risk','drop','breach','leak','leaked','bankruptcy','default','rugi','kerugian','turun','negatif','melemah','anjlok','gagal','korupsi','merosot','susut','menyusut','penurunan','bocor','kebocoran','peretasan','bangkrut','pailit','wanprestasi']);
const negators = new Set(['not','no','never','without','tidak','belum','bukan','tak']);
/** Small bilingual lexicon baseline; score is polarity, never a calibrated model probability. */
export function textSentiment(text: string): number {
  const tokens = text.toLowerCase().replace(/<[^>]+>/g, ' ').match(/[\p{L}]+/gu) ?? [];
  let value = 0, matches = 0;
  tokens.forEach((token, i) => {
    let sign = positive.has(token) ? 1 : negative.has(token) ? -1 : 0;
    if (sign && tokens.slice(Math.max(0, i - 3), i).some(t => negators.has(t))) sign *= -1;
    if (sign) { value += sign; matches++; }
  });
  return matches ? clamp(value / Math.sqrt(matches), -1, 1) : 0;
}
