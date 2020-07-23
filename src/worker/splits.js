import { whitespace, breakable } from "./text-utils.js";

export function splitLines(glyphs, spacing, maxWidth) {
  // glyphs is an Array of Objects with properties { code, metrics, rect }
  // spacing and maxWidth should already be scaled to the same units as
  //   glyph.metrics.advance
  const widths = glyphs.map(g => { 
    return { code: g.code, width: g.metrics.advance }
  });

  const totalWidth = widths.reduce((w, g) => (w += g.width + spacing, w), 0);
  const lineCount = Math.max(1, Math.ceil(totalWidth / maxWidth));
  const targetWidth = totalWidth / lineCount;

  const breakPoints = getBreakPoints(widths, spacing, targetWidth);

  return breakLines(glyphs, breakPoints);
}

function breakLines(glyphs, breakPoints) {
  let start = 0;
  const lines = [];

  breakPoints.forEach(lineBreak => {
    let line = glyphs.slice(start, lineBreak);

    // Trim whitespace from both ends
    while (line.length && whitespace[line[0]]) line.shift();
    while (line.length && whitespace[line[line.length]]) line.pop();

    lines.push(line);
    start = lineBreak;
  });

  return lines;
}

function getBreakPoints(widths, spacing, targetWidth) {
  const potentialLineBreaks = [];
  const last = widths.length - 1;
  let cursor = 0;

  widths.forEach((g, i) => {
    let { code, width } = g;
    if (!whitespace[code]) cursor += width + spacing;

    if (i == last) return;
    if (!breakable[code] 
      //&& !charAllowsIdeographicBreaking(code)
    ) return;

    let breakInfo = evaluateBreak(
      i + 1,
      cursor,
      targetWidth,
      potentialLineBreaks,
      calculatePenalty(code, widths[i + 1].code),
      false
    );
    potentialLineBreaks.push(breakInfo);
  });

  const lastBreak = evaluateBreak(
    widths.length,
    cursor,
    targetWidth,
    potentialLineBreaks,
    0,
    true
  );

  return leastBadBreaks(lastBreak);
}

function leastBadBreaks(lastBreak) {
  if (!lastBreak) return [];
  return leastBadBreaks(lastBreak.priorBreak).concat(lastBreak.index);
}

function evaluateBreak(index, x, targetWidth, breaks, penalty, isLastBreak) {
  // Start by assuming the supplied (index, x) is the first break
  const init = {
    index, x,
    priorBreak: null,
    badness: calculateBadness(x)
  };

  // Now consider all previous possible break points, and
  // return the pair corresponding to the best combination of breaks
  return breaks.reduce((best, prev) => {
    const badness = calculateBadness(x - prev.x) + prev.badness;
    if (badness < best.badness) {
      best.priorBreak = prev;
      best.badness = badness;
    }
    return best;
  }, init);

  function calculateBadness(width) {
    const raggedness = (width - targetWidth) ** 2;

    if (!isLastBreak) return raggedness + Math.abs(penalty) * penalty;

    // Last line: prefer shorter than average
    return (width < targetWidth)
      ? raggedness / 2
      : raggedness * 2;
  }
}

function calculatePenalty(code, nextCode) {
  let penalty = 0;
  // Force break on newline
  if (code === 0x0a) penalty -= 10000;
  // Penalize open parenthesis at end of line
  if (code === 0x28 || code === 0xff08) penalty += 50;
  // Penalize close parenthesis at beginning of line
  if (nextCode === 0x29 || nextCode === 0xff09) penalty += 50;

  return penalty;
}
