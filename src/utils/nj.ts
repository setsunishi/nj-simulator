export interface TreeNode {
  id: string;
  name: string;
  isLeaf: boolean;
  branchLength?: number;
  children?: TreeNode[];
}

export type DistanceMatrix = { [id: string]: { [id: string]: number } };

export interface NJStepSnapshot {
  stepIndex: number;
  remainingTaxa: string[];
  distanceMatrix: DistanceMatrix;
  rValues: { [id: string]: number };
  qMatrix: { [id: string]: { [id: string]: number } };
  minQ?: { u: string; v: string; val: number };
  newTaxon?: string;
  branchLengthU?: number;
  branchLengthV?: number;
  treeStructure?: TreeNode; // そのステップ終了時点での、現在生き残っている各ノードが表す部分木の一覧
  currentForest: { [id: string]: TreeNode }; // IDからそのノード（部分木）へのマッピング
}

/**
 * 距離行列のディープコピーを作成するヘルパー
 */
export function cloneDistanceMatrix(matrix: DistanceMatrix): DistanceMatrix {
  const clone: DistanceMatrix = {};
  for (const rowKey in matrix) {
    clone[rowKey] = { ...matrix[rowKey] };
  }
  return clone;
}

/**
 * NJ法を実行し、各ステップのスナップショットの配列を返します。
 * @param initialTaxa 分類群の初期リスト
 * @param initialMatrix 初期距離行列（対角成分は0、対称行列であること）
 */
export function runNeighborJoining(
  initialTaxa: string[],
  initialMatrix: DistanceMatrix
): NJStepSnapshot[] {
  const snapshots: NJStepSnapshot[] = [];
  
  // 状態の初期化
  let currentTaxa = [...initialTaxa];
  let matrix = cloneDistanceMatrix(initialMatrix);
  let stepIndex = 0;
  
  // 初期フォレスト（各分類群は葉ノード）
  let forest: { [id: string]: TreeNode } = {};
  for (const taxon of initialTaxa) {
    forest[taxon] = {
      id: taxon,
      name: taxon,
      isLeaf: true,
      children: [],
    };
  }

  // 最初のスナップショット（計算前の状態）
  snapshots.push({
    stepIndex,
    remainingTaxa: [...currentTaxa],
    distanceMatrix: cloneDistanceMatrix(matrix),
    rValues: {},
    qMatrix: {},
    currentForest: { ...forest },
  });

  let internalNodeCount = 1;

  while (currentTaxa.length > 3) {
    stepIndex++;
    const N = currentTaxa.length;
    
    // 1. R_i 値の計算 (各ノードから他の全ノードへの距離の和)
    const rValues: { [id: string]: number } = {};
    for (const u of currentTaxa) {
      let sum = 0;
      for (const v of currentTaxa) {
        if (u !== v) {
          sum += matrix[u][v] || 0;
        }
      }
      rValues[u] = sum;
    }

    // 2. Qマトリクスの計算
    const qMatrix: { [id: string]: { [id: string]: number } } = {};
    for (const u of currentTaxa) {
      qMatrix[u] = {};
      for (const v of currentTaxa) {
        if (u === v) {
          qMatrix[u][v] = 0;
        } else {
          // Q(i,j) = (N - 2) * D(i,j) - R_i - R_j
          qMatrix[u][v] = (N - 2) * (matrix[u][v] || 0) - rValues[u] - rValues[v];
        }
      }
    }

    // 3. 最小Q値を与えるペア (u, v) の探索
    let minU = "";
    let minV = "";
    let minVal = Infinity;

    // 対称行列なので上三角部分だけで最小値を探す
    for (let i = 0; i < currentTaxa.length; i++) {
      for (let j = i + 1; j < currentTaxa.length; j++) {
        const u = currentTaxa[i];
        const v = currentTaxa[j];
        const qVal = qMatrix[u][v];
        if (qVal < minVal) {
          minVal = qVal;
          minU = u;
          minV = v;
        }
      }
    }

    // 新しい内部ノードのIDを作成
    const newTaxon = `U${internalNodeCount++}`;

    // 4. 新しいノードから結合相手への枝長の計算
    // d(u, new) = 1/2 * d(u,v) + 1/(2*(N-2)) * (R_u - R_v)
    const distUV = matrix[minU][minV] || 0;
    let branchLengthU = 0.5 * distUV + (rValues[minU] - rValues[minV]) / (2 * (N - 2));
    let branchLengthV = distUV - branchLengthU;

    // 枝長の丸め処理（小数第4位まで）
    branchLengthU = Math.round(branchLengthU * 10000) / 10000;
    branchLengthV = Math.round(branchLengthV * 10000) / 10000;

    // 5. 距離行列の更新
    const nextMatrix: DistanceMatrix = {};
    const nextTaxa = currentTaxa.filter((t) => t !== minU && t !== minV);
    nextTaxa.push(newTaxon);

    // 新しい行列の初期化
    for (const t of nextTaxa) {
      nextMatrix[t] = {};
    }

    // 既存ノード間の距離をコピー
    for (const t1 of nextTaxa) {
      for (const t2 of nextTaxa) {
        if (t1 !== newTaxon && t2 !== newTaxon) {
          nextMatrix[t1][t2] = matrix[t1][t2];
        }
      }
    }

    // 新ノード (newTaxon) から他の各ノードへの距離の計算
    // d(new, k) = 1/2 * (d(u,k) + d(v,k) - d(u,v))
    for (const k of nextTaxa) {
      if (k !== newTaxon) {
        const distUK = matrix[minU][k] || 0;
        const distVK = matrix[minV][k] || 0;
        const distNewK = 0.5 * (distUK + distVK - distUV);
        const roundedDist = Math.round(distNewK * 10000) / 10000;
        nextMatrix[newTaxon][k] = roundedDist;
        nextMatrix[k][newTaxon] = roundedDist;
      } else {
        nextMatrix[newTaxon][newTaxon] = 0;
      }
    }

    // 6. フォレストの更新（ツリーの結合）
    const childU = { ...forest[minU], branchLength: branchLengthU };
    const childV = { ...forest[minV], branchLength: branchLengthV };
    
    const newTreeNode: TreeNode = {
      id: newTaxon,
      name: newTaxon,
      isLeaf: false,
      children: [childU, childV],
    };

    const nextForest = { ...forest };
    delete nextForest[minU];
    delete nextForest[minV];
    nextForest[newTaxon] = newTreeNode;

    // スナップショットの記録
    snapshots.push({
      stepIndex,
      remainingTaxa: [...currentTaxa],
      distanceMatrix: cloneDistanceMatrix(matrix),
      rValues: { ...rValues },
      qMatrix: cloneDistanceMatrix(qMatrix),
      minQ: { u: minU, v: minV, val: minVal },
      newTaxon,
      branchLengthU,
      branchLengthV,
      currentForest: { ...nextForest },
    });

    // 状態を更新して次のループへ
    matrix = nextMatrix;
    currentTaxa = nextTaxa;
    forest = nextForest;
  }

  // 7. 最後のステップ (残りが3つのノードになった時、中心ノードで結ぶ)
  if (currentTaxa.length === 3) {
    stepIndex++;
    const [a, b, c] = currentTaxa;
    const distAB = matrix[a][b] || 0;
    const distAC = matrix[a][c] || 0;
    const distBC = matrix[b][c] || 0;

    // 中心ノードの作成
    const centerNodeId = "Center";
    
    // 中心からの距離の計算
    // d(a, center) = (d(a,b) + d(a,c) - d(b,c)) / 2
    let distToA = 0.5 * (distAB + distAC - distBC);
    let distToB = 0.5 * (distAB + distBC - distAC);
    let distToC = 0.5 * (distAC + distBC - distAB);

    distToA = Math.round(distToA * 10000) / 10000;
    distToB = Math.round(distToB * 10000) / 10000;
    distToC = Math.round(distToC * 10000) / 10000;

    const childA = { ...forest[a], branchLength: distToA };
    const childB = { ...forest[b], branchLength: distToB };
    const childC = { ...forest[c], branchLength: distToC };

    const finalTree: TreeNode = {
      id: centerNodeId,
      name: "Root / Center",
      isLeaf: false,
      children: [childA, childB, childC],
    };

    const finalForest = {
      [centerNodeId]: finalTree
    };

    snapshots.push({
      stepIndex,
      remainingTaxa: [...currentTaxa],
      distanceMatrix: cloneDistanceMatrix(matrix),
      rValues: {},
      qMatrix: {},
      newTaxon: centerNodeId,
      branchLengthU: distToA,
      branchLengthV: distToB,
      treeStructure: finalTree,
      currentForest: finalForest,
    });
  } else if (currentTaxa.length === 2) {
    // もしノード数が2つの場合（極めて稀だが、初期ノード数が2つのとき）
    stepIndex++;
    const [a, b] = currentTaxa;
    const distAB = matrix[a][b] || 0;
    
    const centerNodeId = "Center";
    const distToA = distAB / 2;
    const distToB = distAB / 2;

    const childA = { ...forest[a], branchLength: distToA };
    const childB = { ...forest[b], branchLength: distToB };

    const finalTree: TreeNode = {
      id: centerNodeId,
      name: "Root / Center",
      isLeaf: false,
      children: [childA, childB],
    };

    snapshots.push({
      stepIndex,
      remainingTaxa: [...currentTaxa],
      distanceMatrix: cloneDistanceMatrix(matrix),
      rValues: {},
      qMatrix: {},
      newTaxon: centerNodeId,
      branchLengthU: distToA,
      branchLengthV: distToB,
      treeStructure: finalTree,
      currentForest: { [centerNodeId]: finalTree },
    });
  }

  return snapshots;
}
