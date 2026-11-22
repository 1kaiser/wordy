// Exact Fixed Dimensional Encoding (FDE) algorithm following:
// Jayaram, R., Dhulipala, L., Hadian, M., Lee, J., & Mirrokni, V. (2024).
// "MUVERA: Making Multi-Vector Retrieval as Fast as Single-Vector Search" (arXiv:2405.19504)

export enum EncodingType {
  DEFAULT_SUM = 0, // Queries: SUM vectors in each shared partition
  AVERAGE = 1      // Documents: AVERAGE vectors in each shared partition (+ empty partition fill)
}

export interface FixedDimensionalEncodingConfig {
  dimension: number;
  numRepetitions: number;
  numSimhashProjections: number;
  seed: number;
  fillEmptyPartitions: boolean;
}

export interface PartitionBreakdown {
  partitionId: number;
  grayCode: number;
  count: number;
  filledByNearest: boolean;
  tokens: string[];
  norm: number;
}

export interface FDEResult {
  fdeVector: number[];
  repetitions: number[][];
  rep0Partitions: PartitionBreakdown[];
  tokenPartitionRep0: number[];
  numPartitions: number;
}

export const DEFAULT_FDE_CONFIG: FixedDimensionalEncodingConfig = {
  dimension: 64,
  numRepetitions: 8,
  numSimhashProjections: 3, // 2^3 = 8 shared partitions
  seed: 42,
  fillEmptyPartitions: true
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussianRandom(rng: () => number): number {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Gray-code mapping: neighboring halfspaces differ by 1 bit and small Gray distance
export function appendToGrayCode(grayCode: number, bit: boolean): number {
  return (grayCode << 1) + (Number(bit) ^ (grayCode & 1));
}

function popcount(x: number): number {
  let c = 0;
  let v = x;
  while (v) {
    v &= v - 1;
    c++;
  }
  return c;
}

function simHashMatrixFromSeed(dimension: number, kSim: number, repSeed: number): number[][] {
  const rng = mulberry32(repSeed * 7919 + dimension * 31 + kSim * 17);
  const matrix: number[][] = [];
  for (let d = 0; d < dimension; d++) {
    const row = new Array(kSim);
    for (let k = 0; k < kSim; k++) {
      row[k] = gaussianRandom(rng);
    }
    matrix.push(row);
  }
  return matrix;
}

function partitionIndexFromSimHash(matrix: number[][], vec: number[]): { partitionId: number; sketch: number[] } {
  const kSim = matrix[0]?.length || 0;
  const sketch = new Array(kSim).fill(0);
  for (let d = 0; d < vec.length; d++) {
    const val = vec[d];
    const row = matrix[d];
    for (let k = 0; k < kSim; k++) {
      sketch[k] += row[k] * val;
    }
  }
  let gray = 0;
  for (let k = 0; k < kSim; k++) {
    gray = appendToGrayCode(gray, sketch[k] >= 0);
  }
  return { partitionId: gray, sketch };
}

export function l2Normalize(vec: number[]): number[] {
  let s = 0;
  for (let i = 0; i < vec.length; i++) s += vec[i] * vec[i];
  const n = Math.sqrt(s);
  if (n < 1e-12) return vec.map((_, idx) => (idx === 0 ? 1 : 0));
  return vec.map(v => v / n);
}

// Compute SHARED-partition FDE for either a query (SUM) or a document (AVERAGE + optional fill)
export function computeFDE(
  pointCloud: number[][],
  tokens: string[],
  config: FixedDimensionalEncodingConfig,
  encodingType: EncodingType
): FDEResult {
  const dim = config.dimension;
  const kSim = config.numSimhashProjections;
  const R = config.numRepetitions;
  const P = 1 << kSim;

  const normCloud = pointCloud.map(v => {
    const sliced = v.slice(0, dim);
    return l2Normalize(sliced);
  });

  const fdeVector: number[] = [];
  const repetitions: number[][] = [];
  let rep0Partitions: PartitionBreakdown[] = [];
  let tokenPartitionRep0: number[] = [];

  for (let rep = 0; rep < R; rep++) {
    const repSeed = config.seed + rep * 101;
    // CRITICAL: Identical matrix G^(r) shared between queries and documents
    const G = simHashMatrixFromSeed(dim, kSim, repSeed);

    const sums: (number[] | null)[] = new Array(P).fill(null);
    const counts = new Array(P).fill(0);
    const bucketTokens: string[][] = Array.from({ length: P }, () => []);
    const assignedIds: number[] = [];

    for (let tIdx = 0; tIdx < normCloud.length; tIdx++) {
      const vec = normCloud[tIdx];
      const { partitionId } = partitionIndexFromSimHash(G, vec);
      assignedIds.push(partitionId);
      if (!sums[partitionId]) {
        sums[partitionId] = new Array(dim).fill(0);
      }
      const sVec = sums[partitionId]!;
      for (let d = 0; d < dim; d++) sVec[d] += vec[d];
      counts[partitionId] += 1;
      bucketTokens[partitionId].push(tokens[tIdx] || `t${tIdx}`);
    }

    const repMeans: number[][] = Array.from({ length: P }, () => new Array(dim).fill(0));
    const populated: number[] = [];
    for (let p = 0; p < P; p++) {
      if (counts[p] > 0 && sums[p]) {
        populated.push(p);
        const denom = encodingType === EncodingType.AVERAGE ? counts[p] : 1;
        for (let d = 0; d < dim; d++) {
          repMeans[p][d] = sums[p]![d] / denom;
        }
      }
    }

    const filledByNearest = new Array(P).fill(false);
    if (encodingType === EncodingType.AVERAGE && config.fillEmptyPartitions && populated.length > 0) {
      for (let p = 0; p < P; p++) {
        if (counts[p] === 0) {
          let bestP = populated[0];
          let bestDist = Infinity;
          for (const cand of populated) {
            const dist = popcount(p ^ cand);
            if (dist < bestDist) {
              bestDist = dist;
              bestP = cand;
            }
          }
          repMeans[p] = repMeans[bestP].slice();
          filledByNearest[p] = true;
        }
      }
    }

    const repFlat: number[] = [];
    for (let p = 0; p < P; p++) {
      for (let d = 0; d < dim; d++) {
        repFlat.push(repMeans[p][d]);
        fdeVector.push(repMeans[p][d]);
      }
    }
    repetitions.push(repFlat);

    if (rep === 0) {
      tokenPartitionRep0 = assignedIds;
      rep0Partitions = Array.from({ length: P }, (_, p) => {
        let norm = 0;
        for (let d = 0; d < dim; d++) norm += repMeans[p][d] * repMeans[p][d];
        return {
          partitionId: p,
          grayCode: p,
          count: counts[p],
          filledByNearest: filledByNearest[p],
          tokens: bucketTokens[p],
          norm: Math.sqrt(norm)
        };
      });
    }
  }

  return {
    fdeVector,
    repetitions,
    rep0Partitions,
    tokenPartitionRep0,
    numPartitions: P
  };
}

// Exact Chamfer (ColBERT MaxSim) similarity:
// chamferSum = Sum_{q in Q} max_{p in P} <q, p>
// chamferMean = chamferSum / |Q|
export function computeChamferSimilarity(
  queryCloud: number[][],
  docCloud: number[][],
  dimension: number
): { chamferSum: number; chamferMean: number; perTokenMatches: { qIdx: number; bestDocIdx: number; score: number }[] } {
  if (!queryCloud.length || !docCloud.length) {
    return { chamferSum: 0, chamferMean: 0, perTokenMatches: [] };
  }
  const qNorm = queryCloud.map(v => l2Normalize(v.slice(0, dimension)));
  const dNorm = docCloud.map(v => l2Normalize(v.slice(0, dimension)));

  let chamferSum = 0;
  const perTokenMatches: { qIdx: number; bestDocIdx: number; score: number }[] = [];

  for (let qi = 0; qi < qNorm.length; qi++) {
    let bestScore = -Infinity;
    let bestDocIdx = 0;
    for (let di = 0; di < dNorm.length; di++) {
      let dot = 0;
      for (let d = 0; d < dimension; d++) dot += qNorm[qi][d] * dNorm[di][d];
      if (dot > bestScore) {
        bestScore = dot;
        bestDocIdx = di;
      }
    }
    chamferSum += bestScore;
    perTokenMatches.push({ qIdx: qi, bestDocIdx, score: bestScore });
  }

  return {
    chamferSum,
    chamferMean: chamferSum / qNorm.length,
    perTokenMatches
  };
}

// Averaged FDE inner product: (1 / R) * <F_q, F_d> approximates chamferSum(Q, P)
export function computeFDEEstimate(
  queryFDE: number[],
  docFDE: number[],
  numRepetitions: number,
  numQueryTokens: number
): { fdeSumApprox: number; fdeMeanApprox: number; fdeCosine: number } {
  if (queryFDE.length !== docFDE.length || !queryFDE.length) {
    return { fdeSumApprox: 0, fdeMeanApprox: 0, fdeCosine: 0 };
  }
  let dot = 0, nq = 0, nd = 0;
  for (let i = 0; i < queryFDE.length; i++) {
    dot += queryFDE[i] * docFDE[i];
    nq += queryFDE[i] * queryFDE[i];
    nd += docFDE[i] * docFDE[i];
  }
  const fdeSumApprox = dot / Math.max(1, numRepetitions);
  const fdeMeanApprox = numQueryTokens > 0 ? fdeSumApprox / numQueryTokens : 0;
  const denom = Math.sqrt(nq) * Math.sqrt(nd);
  const fdeCosine = denom > 1e-12 ? dot / denom : 0;
  return { fdeSumApprox, fdeMeanApprox, fdeCosine };
}

export function cosineSim(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 1e-12 ? dot / denom : 0;
}

// Compute joint 2D PCA projection of query + document token clouds for visualization
export function projectJointPCA2D(
  queryCloud: number[][],
  docCloud: number[][],
  dimension: number
): { queryCoords: [number, number][]; docCoords: [number, number][]; basis: [number[], number[]] } {
  const all = [...queryCloud, ...docCloud].map(v => l2Normalize(v.slice(0, dimension)));
  const nQ = queryCloud.length;
  if (!all.length) {
    return { queryCoords: [], docCoords: [], basis: [[], []] };
  }

  const mean = new Array(dimension).fill(0);
  for (const v of all) {
    for (let d = 0; d < dimension; d++) mean[d] += v[d] / all.length;
  }
  const centered = all.map(v => v.map((x, d) => x - mean[d]));

  const powerIter = (deflateVec?: number[]): number[] => {
    let vec = new Array(dimension).fill(0).map((_, d) => Math.sin((d + 1) * (deflateVec ? 1.7 : 0.9)));
    vec = l2Normalize(vec);
    for (let iter = 0; iter < 14; iter++) {
      const next = new Array(dimension).fill(0);
      for (const x of centered) {
        let proj = 0;
        for (let d = 0; d < dimension; d++) proj += x[d] * vec[d];
        for (let d = 0; d < dimension; d++) next[d] += proj * x[d];
      }
      if (deflateVec) {
        let overlap = 0;
        for (let d = 0; d < dimension; d++) overlap += next[d] * deflateVec[d];
        for (let d = 0; d < dimension; d++) next[d] -= overlap * deflateVec[d];
      }
      vec = l2Normalize(next);
    }
    return vec;
  };

  const pc1 = powerIter();
  const pc2 = powerIter(pc1);

  const projectOne = (x: number[]): [number, number] => {
    let p1 = 0, p2 = 0;
    for (let d = 0; d < dimension; d++) {
      p1 += x[d] * pc1[d];
      p2 += x[d] * pc2[d];
    }
    return [p1, p2];
  };

  const rawCoords = centered.map(projectOne);
  let maxAbs = 1e-3;
  for (const [x, y] of rawCoords) {
    maxAbs = Math.max(maxAbs, Math.abs(x), Math.abs(y));
  }
  const scaled = rawCoords.map(([x, y]): [number, number] => [x / maxAbs, y / maxAbs]);

  return {
    queryCoords: scaled.slice(0, nQ),
    docCoords: scaled.slice(nQ),
    basis: [pc1, pc2]
  };
}
