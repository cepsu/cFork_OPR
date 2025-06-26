// --- utils.js ---
// General utility functions for dice rolls, string manipulation, and array operations.

function rollDie(sides = 6) {
  return 1 + Math.floor(Math.random() * sides);
}

function rollD3() {
  return 1 + Math.floor(Math.random() * 3);
}

function splitTopLevel(str, sep) {
  const out = [];
  let level = 0,
    buf = "";
  for (let ch of str) {
    if (ch === "(") level++;
    else if (ch === ")") level = Math.max(0, level - 1);

    if (ch === sep && level === 0) {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf) out.push(buf);
  return out;
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
