import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dictDir = path.join(rootDir, 'dict');
const outPath = path.join(rootDir, 'public', 'wordnet-lexicon.json');

const POS_FILES = [
  ['n', 'data.noun'],
  ['v', 'data.verb'],
  ['a', 'data.adj'],
  ['r', 'data.adv'],
];

const MUST_INCLUDE = [
  'ephemeral',
  'serendipity',
  'ubiquitous',
  'quintessential',
  'happy',
  'fast',
  'ocean',
  'mountain',
  'light',
  'intelligence',
  'graph',
  'river',
  'forest',
  'neural',
  'quantum',
];

const synsets = new Map();
const wordToSynsets = new Map();

for (const [pos, fname] of POS_FILES) {
  const raw = fs.readFileSync(path.join(dictDir, fname), 'latin1');
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('  ') || !/^\d/.test(line)) continue;
    const pipeIdx = line.indexOf(' | ');
    if (pipeIdx === -1) continue;
    const head = line.slice(0, pipeIdx).trim().split(/\s+/);
    const glossFull = line.slice(pipeIdx + 3).trim();

    const offset = head[0];
    const wCnt = parseInt(head[3], 16);
    const words = [];
    let idx = 4;
    for (let i = 0; i < wCnt; i++) {
      words.push(head[idx].replace(/_/g, ' '));
      idx += 2;
    }
    const pCnt = parseInt(head[idx], 10);
    idx += 1;
    const ptrs = [];
    for (let i = 0; i < pCnt; i++) {
      const sym = head[idx];
      const targetOffset = head[idx + 1];
      const targetPos = head[idx + 2] === 's' ? 'a' : head[idx + 2];
      const srcTgt = head[idx + 3];
      idx += 4;
      if (['@', '@i', '~', '~i', '&', '!', '\\', '+'].includes(sym)) {
        ptrs.push({
          sym,
          targetId: targetPos + targetOffset,
          srcWord: parseInt(srcTgt.slice(0, 2), 16),
          tgtWord: parseInt(srcTgt.slice(2, 4), 16),
        });
      }
    }

    const sid = pos + offset;
    const quoteSplit = glossFull.split('; "');
    const cleanDef = quoteSplit[0].trim().slice(0, 150);
    let example = '';
    if (quoteSplit.length > 1) {
      const exMatch = glossFull.match(/"([^"]+)"/);
      if (exMatch) example = exMatch[1].slice(0, 110);
    }

    synsets.set(sid, { pos, words, cleanDef, example, ptrs });
    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const lower = words[wIdx].toLowerCase();
      if (!wordToSynsets.has(lower)) wordToSynsets.set(lower, []);
      wordToSynsets.get(lower).push({ sid, wIdx: wIdx + 1 });
    }
  }
}

const freqMap = new Map();
const cntRaw = fs.readFileSync(path.join(dictDir, 'cntlist'), 'latin1');
for (const line of cntRaw.split(/\r?\n/)) {
  const parts = line.trim().split(/\s+/);
  if (parts.length < 2) continue;
  const count = parseInt(parts[0], 10) || 0;
  const lemma = parts[1].split('%')[0].replace(/_/g, ' ').toLowerCase();
  freqMap.set(lemma, (freqMap.get(lemma) || 0) + count);
}

const candidates = [];
for (const [lemma, entries] of wordToSynsets.entries()) {
  if (!/^[a-z][a-z'-]{1,28}$/.test(lemma)) continue;
  candidates.push(lemma);
}

const mustSet = new Set(MUST_INCLUDE);
candidates.sort((a, b) => {
  const ma = mustSet.has(a) ? 1 : 0;
  const mb = mustSet.has(b) ? 1 : 0;
  if (ma !== mb) return mb - ma;
  const fa = freqMap.get(a) || 0;
  const fb = freqMap.get(b) || 0;
  if (fa !== fb) return fb - fa;
  const sa = wordToSynsets.get(a).length;
  const sb = wordToSynsets.get(b).length;
  if (sa !== sb) return sb - sa;
  return a.length - b.length;
});

const LIMIT = 24000;
const selected = candidates.slice(0, LIMIT);
const lexicon = {};

for (const word of selected) {
  const hits = wordToSynsets.get(word).slice(0, 3);
  const defs = [];
  const syns = [];
  const hyps = [];
  const hypos = [];
  const ants = [];
  let example = '';

  const pushUnique = (arr, val, cap) => {
    const clean = String(val || '').toLowerCase().trim();
    if (!clean || clean === word || arr.includes(clean) || arr.length >= cap) return;
    if (!/^[a-z][a-z' -]{0,30}$/.test(clean)) return;
    arr.push(clean);
  };

  for (const { sid, wIdx } of hits) {
    const ss = synsets.get(sid);
    if (!ss) continue;
    const defText = `(${ss.pos}) ${ss.cleanDef}`;
    if (!defs.includes(defText) && defs.length < 2) defs.push(defText);
    if (!example && ss.example) example = ss.example;

    for (const w of ss.words) pushUnique(syns, w, 8);

    for (const p of ss.ptrs) {
      const tgt = synsets.get(p.targetId);
      if (!tgt) continue;
      if (p.sym === '!') {
        if (p.srcWord === 0 || p.srcWord === wIdx) {
          const antWord = p.tgtWord > 0 ? tgt.words[p.tgtWord - 1] : tgt.words[0];
          pushUnique(ants, antWord, 5);
        }
      } else if (p.sym === '@' || p.sym === '@i' || p.sym === '&') {
        pushUnique(hyps, tgt.words[0], 5);
        if (p.sym === '&') pushUnique(syns, tgt.words[0], 8);
      } else if (p.sym === '~' || p.sym === '~i') {
        pushUnique(hypos, tgt.words[0], 5);
      } else if (p.sym === '\\' || p.sym === '+') {
        if (p.srcWord === 0 || p.srcWord === wIdx) {
          const relWord = p.tgtWord > 0 ? tgt.words[p.tgtWord - 1] : tgt.words[0];
          pushUnique(hyps, relWord, 5);
        }
      }
    }
  }

  // If word is the sole lemma in its synset(s), pull close sister/derived lemmas via pointers
  if (syns.length === 0) {
    for (const { sid, wIdx } of hits) {
      const ss = synsets.get(sid);
      if (!ss) continue;
      for (const p of ss.ptrs) {
        const parent = synsets.get(p.targetId);
        if (!parent) continue;
        if (p.sym === '\\' || p.sym === '+') {
          if (p.srcWord === 0 || p.srcWord === wIdx) {
            const relWord = p.tgtWord > 0 ? parent.words[p.tgtWord - 1] : parent.words[0];
            pushUnique(syns, relWord, 6);
            for (const pw of parent.words) pushUnique(syns, pw, 6);
          }
          continue;
        }
        if (p.sym !== '@' && p.sym !== '@i') continue;
        for (const pw of parent.words) pushUnique(syns, pw, 6);
        for (const cp of parent.ptrs) {
          if (cp.sym !== '~' && cp.sym !== '~i') continue;
          const sis = synsets.get(cp.targetId);
          if (sis && sis.words[0]) pushUnique(syns, sis.words[0], 6);
        }
      }
    }
  }

  const record = { d: defs, s: syns, h: hyps, y: hypos, a: ants };
  if (example) record.e = example;
  lexicon[word] = record;
}

const payload = JSON.stringify({
  source: 'Princeton WordNet 3.1',
  count: Object.keys(lexicon).length,
  entries: lexicon,
});

fs.writeFileSync(outPath, payload, 'utf8');
const sizeMb = (Buffer.byteLength(payload, 'utf8') / (1024 * 1024)).toFixed(2);
console.log(`Built ${outPath}: ${Object.keys(lexicon).length} entries (${sizeMb} MB)`);

for (const check of ['ephemeral', 'serendipity', 'ubiquitous', 'quintessential', 'happy']) {
  console.log(`Check [${check}]:`, JSON.stringify(lexicon[check]));
  if (!lexicon[check] || !lexicon[check].d.length || (!lexicon[check].s.length && !lexicon[check].h.length)) {
    throw new Error(`Missing definitions or relations for "${check}"`);
  }
}
