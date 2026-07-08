import { useState, useEffect, useRef } from 'react';
import { runNeighborJoining, type TreeNode, type DistanceMatrix } from './utils/nj';
import { computeRootedLayout, computeRadialLayout, type LayoutNode } from './utils/layout';
import './App.css';

const PRESETS: { [key: string]: { name: string; description: string; taxa: string[]; matrix: DistanceMatrix } } = {
  uniform: {
    name: "基本サンプル（進化速度が一定）",
    description: "4つの分類群があり、進化速度がほぼ均一なケース。UPGMAでもNJ法でも同じ正しい系統樹が構築されます。",
    taxa: ["A", "B", "C", "D"],
    matrix: {
      A: { A: 0, B: 3, C: 7, D: 8 },
      B: { A: 3, B: 0, C: 6, D: 7 },
      C: { A: 7, B: 6, C: 0, D: 3 },
      D: { A: 8, B: 7, C: 3, D: 0 },
    }
  },
  lba: {
    name: "進化速度の不均一（UPGMAとの比較）",
    description: "系統 C の進化速度が非常に速い（長枝）ケース。UPGMAでは長枝引き付けにより誤った系統樹 (((A, B), D), C) を作ってしまいますが、NJ法では補正が働き、正しいトポロジー ((A, B), (C, D)) を復元できます。",
    taxa: ["A", "B", "C", "D"],
    matrix: {
      A: { A: 0, B: 2, C: 8, D: 4 },
      B: { A: 2, B: 0, C: 8, D: 4 },
      C: { A: 8, B: 8, C: 0, D: 6 },
      D: { A: 4, B: 4, C: 6, D: 0 },
    }
  },
  fiveTaxa: {
    name: "5分類群の標準サンプル",
    description: "5つの分類群があり、計算ステップが2段階になるケース。Qマトリクスの縮小と再計算のプロセスをより詳しく学習できます。",
    taxa: ["A", "B", "C", "D", "E"],
    matrix: {
      A: { A: 0, B: 5, C: 9, D: 9, E: 8 },
      B: { A: 5, B: 0, C: 10, D: 10, E: 9 },
      C: { A: 9, B: 10, C: 0, D: 8, E: 7 },
      D: { A: 9, B: 10, C: 8, D: 0, E: 3 },
      E: { A: 8, B: 9, C: 7, D: 3, E: 0 },
    }
  }
};

const QUESTIONS = [
  {
    id: 1,
    question: "NJ法のQマトリクスの計算式 Q(i,j) = (N-2)d(i,j) - Ri - Rj において、-Ri - Rj の項が持つ役割は何ですか？",
    options: [
      "他ノードへの平均的な距離が長い（進化速度が速い）分類群について、見かけ上の距離が遠くても結合しやすくする（長枝を補正する）",
      "計算量を削減し、アルゴリズムの実行速度を高速化する",
      "系統樹のすべての枝の長さの合計を最大化する",
      "距離行列のマイナス値をすべてプラス値に変換する"
    ],
    correctAnswer: 0,
    explanation: "Ri と Rj はそれぞれノード i と j から他のすべてのノードへの距離の総和です。これを差し引くことで、「他への距離が長い（進化速度が速い＝長枝を持つ）ノード」のQ値が下がりやすくなり、見かけ上の距離（d(i,j)）が離れていても、正しく結合対象（近隣）として検出できるようになります。"
  },
  {
    id: 2,
    question: "NJ法（近隣結合法）によって構築される系統樹の、計算直後の初期状態の性質として正しいものはどれか？",
    options: [
      "時間の流れの起点（共通祖先）があらかじめ決まっている「有根系統樹」である",
      "時間の流れの起点が未定で、関係性のみを表す「無根系統樹」である",
      "すべての系統の進化速度が一定であると仮定された「超距離樹」である",
      "枝の長さがすべて 1 に固定された「分岐図（クラドグラム）」である"
    ],
    correctAnswer: 1,
    explanation: "NJ法は、ノード間の進化距離の相互関係から系統樹を構築するため、根（時間の起点）が決まっていない「無根系統樹」を構築します。有根にするには、外部群（アウトグループ）を指定するなどの後処理が必要です。"
  },
  {
    id: 3,
    question: "系統樹構築アルゴリズム UPGMA（群平均法）と比較したときの、NJ法の最大の利点は何ですか？",
    options: [
      "DNA配列データがなくても、形態データだけで直接系統樹を計算できる",
      "系統によって進化速度が大きく異なる場合でも、正しい系統関係（トポロジー）を推定できる",
      "計算量が極めて少なく、数百万の分類群でも一瞬で処理できる",
      "必ず数学的な「地球上の生物の真の歴史」と100%一致する系統樹を出力する"
    ],
    correctAnswer: 1,
    explanation: "UPGMAは「すべての系統で進化速度が一定である（分子時計の仮定）」ことを前提としていますが、現実の生物では進化速度は不均一です。NJ法はこの進化速度の不均一性を許容し、長枝引き付けなどの誤りを防ぐことができるため、より広く使われています。"
  }
];

export default function App() {
  const [presetKey, setPresetKey] = useState<string>("uniform");
  const [taxa, setTaxa] = useState<string[]>(PRESETS.uniform.taxa);
  const [matrix, setMatrix] = useState<DistanceMatrix>(PRESETS.uniform.matrix);
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [subStepIndex, setSubStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1800);
  const [treeType, setTreeType] = useState<'radial' | 'rooted'>('radial');
  const [useBranchLength, setUseBranchLength] = useState<boolean>(true);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'simulator' | 'explanation' | 'quiz'>('simulator');
  const [quizAnswers, setQuizAnswers] = useState<{ [key: number]: number }>({});
  const [quizSubmitted, setQuizSubmitted] = useState<{ [key: number]: boolean }>({});
  
  const timerRef = useRef<number | null>(null);

  // NJ法スナップショットの計算
  const snapshots = runNeighborJoining(taxa, matrix);
  const currentSnapshot = snapshots[stepIndex] || snapshots[snapshots.length - 1];

  // 各ステップの最大サブステップ数を取得するヘルパー
  const getMaxSubSteps = (step: number): number => {
    if (step === 0) return 1; // 初期状態は1サブステップのみ
    if (step === snapshots.length - 1) return 3; // 最終ステップは3つ（0:準備, 1:距離計算, 2:完成）
    return 6; // 通常の結合ステップは6つ（0:準備, 1:R計算, 2:Q計算, 3:最小Q選択, 4:枝長計算, 5:行列更新）
  };

  // プリセット変更時の処理
  const handlePresetChange = (key: string) => {
    setPresetKey(key);
    setTaxa(PRESETS[key].taxa);
    setMatrix(PRESETS[key].matrix);
    setStepIndex(0);
    setSubStepIndex(0);
    setIsPlaying(false);
  };

  // カスタム距離の更新
  const handleDistanceChange = (u: string, v: string, val: string) => {
    const numVal = parseFloat(val);
    if (isNaN(numVal) || numVal < 0) return;
    
    setMatrix(prev => {
      const next = { ...prev };
      if (!next[u]) next[u] = {};
      if (!next[v]) next[v] = {};
      next[u][v] = numVal;
      next[v][u] = numVal;
      return next;
    });
    setStepIndex(0);
    setSubStepIndex(0);
    setIsPlaying(false);
  };

  // 分類群の追加
  const handleAddTaxon = () => {
    if (taxa.length >= 8) {
      alert("教材の視認性のため、分類群は最大8個までに制限しています。");
      return;
    }
    const newChar = String.fromCharCode(65 + taxa.length);
    const newTaxon = taxa.includes(newChar) ? `Taxon${taxa.length + 1}` : newChar;
    
    const nextTaxa = [...taxa, newTaxon];
    const nextMatrix = { ...matrix };
    
    nextMatrix[newTaxon] = { [newTaxon]: 0 };
    for (const t of taxa) {
      nextMatrix[t][newTaxon] = 2;
      nextMatrix[newTaxon][t] = 2;
    }
    
    setTaxa(nextTaxa);
    setMatrix(nextMatrix);
    setStepIndex(0);
    setSubStepIndex(0);
    setIsPlaying(false);
  };

  // 分類群の削除
  const handleRemoveTaxon = (taxon: string) => {
    if (taxa.length <= 3) {
      alert("NJ法の計算には最低3つの分類群が必要です。");
      return;
    }
    const nextTaxa = taxa.filter(t => t !== taxon);
    const nextMatrix = { ...matrix };
    delete nextMatrix[taxon];
    for (const t of nextTaxa) {
      delete nextMatrix[t][taxon];
    }
    
    setTaxa(nextTaxa);
    setMatrix(nextMatrix);
    setStepIndex(0);
    setSubStepIndex(0);
    setIsPlaying(false);
  };

  // 進む・戻る処理のサブステップ対応
  const handleNext = () => {
    const maxSub = getMaxSubSteps(stepIndex);
    if (subStepIndex < maxSub - 1) {
      changeSubStepIndex(subStepIndex + 1, stepIndex);
    } else if (stepIndex < snapshots.length - 1) {
      changeSubStepIndex(0, stepIndex + 1);
    }
  };

  const handlePrev = () => {
    if (subStepIndex > 0) {
      changeSubStepIndex(subStepIndex - 1, stepIndex);
    } else if (stepIndex > 0) {
      const prevStep = stepIndex - 1;
      const prevMaxSub = getMaxSubSteps(prevStep);
      changeSubStepIndex(prevMaxSub - 1, prevStep);
    }
  };

  const changeSubStepIndex = (newSubIdx: number, newStepIdx: number) => {
    if (!document.startViewTransition) {
      setStepIndex(newStepIdx);
      setSubStepIndex(newSubIdx);
      return;
    }
    const direction = newStepIdx > stepIndex || (newStepIdx === stepIndex && newSubIdx > subStepIndex) ? 'forward' : 'backward';
    document.startViewTransition({
      update: () => {
        setStepIndex(newStepIdx);
        setSubStepIndex(newSubIdx);
      },
      types: [direction]
    });
  };

  // 自動再生ロジック
  const advancePlayback = () => {
    setStepIndex(step => {
      let nextStep = step;
      setSubStepIndex(subStep => {
        const maxSub = getMaxSubSteps(step);
        if (subStep < maxSub - 1) {
          return subStep + 1;
        } else if (step < snapshots.length - 1) {
          nextStep = step + 1;
          return 0;
        } else {
          setIsPlaying(false);
          return subStep;
        }
      });
      return nextStep;
    });
  };

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = window.setInterval(advancePlayback, playbackSpeed);
    } else {
      if (timerRef.current) window.clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isPlaying, playbackSpeed, snapshots.length]);

  // 表示用データ（ForestとMatrix）の決定
  let displayForest = currentSnapshot.currentForest;
  let displayMatrix = currentSnapshot.distanceMatrix;
  let displayRemainingTaxa = currentSnapshot.remainingTaxa;

  if (stepIndex > 0 && stepIndex < snapshots.length - 1) {
    const prevSnapshot = snapshots[stepIndex - 1];
    if (subStepIndex <= 3) {
      // 結合前の状態で表示
      displayForest = prevSnapshot.currentForest;
      displayMatrix = prevSnapshot.distanceMatrix;
      displayRemainingTaxa = prevSnapshot.remainingTaxa;
    } else {
      // 結合後の状態で表示
      displayForest = currentSnapshot.currentForest;
      displayMatrix = subStepIndex === 5 ? currentSnapshot.distanceMatrix : prevSnapshot.distanceMatrix;
      displayRemainingTaxa = subStepIndex === 5 ? currentSnapshot.remainingTaxa : prevSnapshot.remainingTaxa;
    }
  } else if (stepIndex === snapshots.length - 1) {
    const prevSnapshot = snapshots[stepIndex - 1];
    if (subStepIndex === 0) {
      displayForest = prevSnapshot.currentForest;
      displayMatrix = prevSnapshot.distanceMatrix;
      displayRemainingTaxa = prevSnapshot.remainingTaxa;
    } else {
      displayForest = currentSnapshot.currentForest;
      displayMatrix = prevSnapshot.distanceMatrix;
      displayRemainingTaxa = prevSnapshot.remainingTaxa;
    }
  }

  // 表示用ツリーの構築
  const getDisplayTree = (forest: { [id: string]: TreeNode }): TreeNode => {
    const keys = Object.keys(forest);
    if (keys.length === 1) {
      return forest[keys[0]];
    }
    
    return {
      id: "Center",
      name: "未解決の中心 (仮想)",
      isLeaf: false,
      children: keys.map(key => ({
        ...forest[key],
        branchLength: forest[key].branchLength ?? 1
      }))
    };
  };

  const displayTree = getDisplayTree(displayForest);

  // SVG用のレイアウト算出
  const layout = treeType === 'radial'
    ? computeRadialLayout(displayTree, useBranchLength, 600, 500, 60)
    : computeRootedLayout(displayTree, useBranchLength, 650, 450, 50);

  // SVG描画用のエッジ（枝）リストを取得
  const getEdges = (node: LayoutNode, parentX?: number, parentY?: number): Array<{
    id: string;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    branchLength?: number;
    isNew: boolean;
    isPending: boolean;
  }> => {
    let edges: any[] = [];
    if (parentX !== undefined && parentY !== undefined) {
      // 結合が完了している状態で、新しく追加された枝かどうか
      const isNew = subStepIndex >= 4 && (
        currentSnapshot.newTaxon === node.id || 
        (currentSnapshot.newTaxon === 'Center' && node.id === 'Center') ||
        (node.branchLength !== undefined && currentSnapshot.newTaxon && node.id.includes(currentSnapshot.newTaxon)) ||
        (currentSnapshot.minQ && (node.id === currentSnapshot.minQ.u || node.id === currentSnapshot.minQ.v) && node.branchLength !== undefined)
      );

      // 結合予定の破線ハイライト用 (subStepIndex === 3)
      const isPending = subStepIndex === 3 && currentSnapshot.minQ && (
        node.id === currentSnapshot.minQ.u || node.id === currentSnapshot.minQ.v
      );

      edges.push({
        id: `${node.id}-parent`,
        fromX: parentX,
        fromY: parentY,
        toX: node.x,
        toY: node.y,
        branchLength: node.branchLength,
        isNew: !!isNew,
        isPending: !!isPending
      });
    }
    if (node.children) {
      node.children.forEach(child => {
        edges = edges.concat(getEdges(child, node.x, node.y));
      });
    }
    return edges;
  };

  const edges = getEdges(layout);

  // ノードの平坦化リストを取得
  const getNodes = (node: LayoutNode): LayoutNode[] => {
    let nodes = [node];
    if (node.children) {
      node.children.forEach(child => {
        nodes = nodes.concat(getNodes(child));
      });
    }
    return nodes;
  };
  const nodes = getNodes(layout);

  // クイズ回答処理
  const handleQuizAnswer = (qId: number, optionIdx: number) => {
    if (quizSubmitted[qId]) return;
    setQuizAnswers(prev => ({ ...prev, [qId]: optionIdx }));
  };

  const submitQuiz = (qId: number) => {
    setQuizSubmitted(prev => ({ ...prev, [qId]: true }));
  };

  const resetQuiz = (qId: number) => {
    setQuizAnswers(prev => {
      const next = { ...prev };
      delete next[qId];
      return next;
    });
    setQuizSubmitted(prev => {
      const next = { ...prev };
      delete next[qId];
      return next;
    });
  };

  // サブステップのタイトルテキスト
  const getSubStepTitle = () => {
    if (stepIndex === 0) return "初期状態";
    if (stepIndex === snapshots.length - 1) {
      if (subStepIndex === 0) return "最終結合: 準備";
      if (subStepIndex === 1) return "最終結合: 枝長計算";
      return "系統樹の完成";
    }
    switch (subStepIndex) {
      case 0: return "計算の準備";
      case 1: return "R値 (距離の総和) の計算";
      case 2: return "Qマトリクスの算出";
      case 3: return "最小Q値の検出とペア決定";
      case 4: return "新ノードへの枝長計算";
      case 5: return "距離行列の更新";
      default: return "";
    }
  };

  return (
    <div className="app-container">
      {/* ヘッダー */}
      <header className="app-header">
        <div className="header-content">
          <div className="logo-section">
            <span className="badge">Bioinformatics Interactive</span>
            <h1>NJ法（近隣結合法）学習シミュレータ</h1>
            <p>Neighbor-Joining Method Tutorial</p>
          </div>
          <nav className="tab-navigation">
            <button 
              className={activeTab === 'simulator' ? 'active' : ''} 
              onClick={() => setActiveTab('simulator')}
            >
              📊 シミュレータ
            </button>
            <button 
              className={activeTab === 'explanation' ? 'active' : ''} 
              onClick={() => setActiveTab('explanation')}
            >
              📖 アルゴリズム解説
            </button>
            <button 
              className={activeTab === 'quiz' ? 'active' : ''} 
              onClick={() => setActiveTab('quiz')}
            >
              ❓ 理解度テスト
            </button>
          </nav>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="app-main">
        {activeTab === 'simulator' && (
          <div className="simulator-grid">
            
            {/* 左側：設定・入力パネル */}
            <section className="panel input-panel">
              <div className="panel-header">
                <h2>1. パラメータ入力 & シナリオ選択</h2>
              </div>
              <div className="panel-body">
                <div className="preset-selector">
                  <label htmlFor="preset-select">プリセットシナリオ</label>
                  <select 
                    id="preset-select" 
                    value={presetKey} 
                    onChange={(e) => handlePresetChange(e.target.value)}
                  >
                    {Object.entries(PRESETS).map(([key, data]) => (
                      <option key={key} value={key}>{data.name}</option>
                    ))}
                  </select>
                  <p className="preset-desc">{PRESETS[presetKey].description}</p>
                </div>

                <hr className="divider" />

                <div className="matrix-editor">
                  <div className="matrix-header-row">
                    <h3>距離行列のカスタマイズ</h3>
                    <button className="btn btn-sm btn-outline" onClick={handleAddTaxon}>
                      ➕ 分類群を追加
                    </button>
                  </div>
                  
                  <div className="table-responsive">
                    <table className="distance-table">
                      <thead>
                        <tr>
                          <th></th>
                          {taxa.map(t => (
                            <th key={t}>
                              <div className="th-container">
                                <span>{t}</span>
                                <button className="btn-delete" onClick={() => handleRemoveTaxon(t)} title="削除">×</button>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {taxa.map(u => (
                          <tr key={u}>
                            <th>{u}</th>
                            {taxa.map(v => {
                              const isDiagonal = u === v;
                              return (
                                <td key={v} className={isDiagonal ? 'cell-disabled' : ''}>
                                  {isDiagonal ? (
                                    0
                                  ) : (
                                    <input 
                                      type="number"
                                      step="0.5"
                                      min="0"
                                      max="99"
                                      value={matrix[u]?.[v] ?? 2}
                                      onChange={(e) => handleDistanceChange(u, v, e.target.value)}
                                    />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </section>

            {/* 中央：系統樹ビューア */}
            <section className="panel tree-panel">
              <div className="panel-header">
                <div className="title-area">
                  <h2>2. 系統樹ビジュアル</h2>
                  <span className="step-badge">
                    Step {stepIndex} / {snapshots.length - 1} ({getSubStepTitle()})
                  </span>
                </div>
                <div className="tree-options">
                  <button 
                    className={`btn-toggle ${treeType === 'radial' ? 'active' : ''}`}
                    onClick={() => setTreeType('radial')}
                  >
                    🕸️ 無根
                  </button>
                  <button 
                    className={`btn-toggle ${treeType === 'rooted' ? 'active' : ''}`}
                    onClick={() => setTreeType('rooted')}
                  >
                    🎋 有根
                  </button>
                  <label className="checkbox-label">
                    <input 
                      type="checkbox" 
                      checked={useBranchLength}
                      onChange={(e) => setUseBranchLength(e.target.checked)}
                    />
                    実距離
                  </label>
                </div>
              </div>
              <div className="panel-body canvas-body">
                {/* プログレスバー (サブステップの可視化) */}
                {stepIndex > 0 && stepIndex < snapshots.length - 1 && (
                  <div className="substep-progress">
                    {[0, 1, 2, 3, 4, 5].map((idx) => (
                      <div 
                        key={idx} 
                        className={`progress-dot ${idx <= subStepIndex ? 'active' : ''} ${idx === subStepIndex ? 'current' : ''}`}
                        title={idx === 0 ? "準備" : idx === 1 ? "R計算" : idx === 2 ? "Q計算" : idx === 3 ? "最小Q選択" : idx === 4 ? "枝長計算" : "行列更新"}
                        onClick={() => changeSubStepIndex(idx, stepIndex)}
                      />
                    ))}
                  </div>
                )}
                {stepIndex === snapshots.length - 1 && (
                  <div className="substep-progress">
                    {[0, 1, 2].map((idx) => (
                      <div 
                        key={idx} 
                        className={`progress-dot ${idx <= subStepIndex ? 'active' : ''} ${idx === subStepIndex ? 'current' : ''}`}
                        title={idx === 0 ? "準備" : idx === 1 ? "枝長計算" : "完成"}
                        onClick={() => changeSubStepIndex(idx, stepIndex)}
                      />
                    ))}
                  </div>
                )}

                {/* SVG 系統樹 */}
                <div className="svg-container">
                  <svg width="100%" height="100%" viewBox="0 0 650 500" preserveAspectRatio="xMidYMid meet">
                    {/* 背景グリッド (有根ツリー時の目安) */}
                    {treeType === 'rooted' && useBranchLength && (
                      <g className="grid-lines" opacity="0.15">
                        <line x1="50" y1="40" x2="600" y2="40" stroke="var(--text-color)" strokeWidth="1" />
                        <line x1="50" y1="40" x2="50" y2="450" stroke="var(--text-color)" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="187.5" y1="40" x2="187.5" y2="450" stroke="var(--text-color)" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="325" y1="40" x2="325" y2="450" stroke="var(--text-color)" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="462.5" y1="40" x2="462.5" y2="450" stroke="var(--text-color)" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="600" y1="40" x2="600" y2="450" stroke="var(--text-color)" strokeWidth="1" strokeDasharray="4 4" />
                      </g>
                    )}

                    {/* 枝 (エッジ) の描画 */}
                    {edges.map((edge) => {
                      if (treeType === 'rooted') {
                        const pathData = `M ${edge.fromX} ${edge.fromY} V ${edge.toY} H ${edge.toX}`;
                        return (
                          <g key={edge.id} className={`edge-group ${edge.isNew ? 'edge-new' : ''} ${edge.isPending ? 'edge-pending' : ''}`}>
                            <path d={pathData} className="edge-bg" />
                            <path d={pathData} className={`edge ${edge.isNew ? 'pulse' : ''} ${edge.isPending ? 'pending-blink' : ''}`} />
                            {edge.branchLength !== undefined && !edge.isPending && (
                              <g transform={`translate(${(edge.fromX + edge.toX) / 2}, ${edge.toY - 6})`}>
                                <rect x="-16" y="-10" width="32" height="14" rx="3" className="tooltip-bg" />
                                <text className="edge-label" textAnchor="middle">{edge.branchLength}</text>
                              </g>
                            )}
                          </g>
                        );
                      } else {
                        return (
                          <g key={edge.id} className={`edge-group ${edge.isNew ? 'edge-new' : ''} ${edge.isPending ? 'edge-pending' : ''}`}>
                            <line x1={edge.fromX} y1={edge.fromY} x2={edge.toX} y2={edge.toY} className="edge-bg" />
                            <line x1={edge.fromX} y1={edge.fromY} x2={edge.toX} y2={edge.toY} className={`edge ${edge.isNew ? 'pulse' : ''} ${edge.isPending ? 'pending-blink' : ''}`} />
                            {edge.branchLength !== undefined && !edge.isPending && (
                              <g transform={`translate(${(edge.fromX * 4 + edge.toX * 6) / 10}, ${(edge.fromY * 4 + edge.toY * 6) / 10 + 4})`}>
                                <rect x="-14" y="-8" width="28" height="12" rx="3" className="tooltip-bg" />
                                <text className="edge-label" textAnchor="middle">{edge.branchLength}</text>
                              </g>
                            )}
                          </g>
                        );
                      }
                    })}

                    {/* ノードの描画 */}
                    {nodes.map((node) => {
                      const isNew = subStepIndex >= 4 && (currentSnapshot.newTaxon === node.id || (node.id === 'Center' && stepIndex === snapshots.length - 1));
                      const isLeaf = node.isLeaf;
                      
                      let textAnchor: "start" | "end" | "middle" | "inherit" = "start";
                      let textOffsetX = 12;
                      let textOffsetY = 4;
                      
                      if (treeType === 'radial') {
                        const centerX = 325;
                        if (node.x < centerX - 10) {
                          textAnchor = "end";
                          textOffsetX = -12;
                        }
                      }

                      // 結合予定の脈動強調
                      const isPendingNode = subStepIndex === 3 && currentSnapshot.minQ && (node.id === currentSnapshot.minQ.u || node.id === currentSnapshot.minQ.v);

                      return (
                        <g 
                          key={node.id} 
                          className={`node-group ${isLeaf ? 'node-leaf' : 'node-internal'} ${isNew ? 'node-new-highlight' : ''} ${isPendingNode ? 'node-pending-highlight' : ''}`}
                          onMouseEnter={() => setHoveredNode(node.id)}
                          onMouseLeave={() => setHoveredNode(null)}
                        >
                          <circle cx={node.x} cy={node.y} r={isLeaf ? 6 : node.id === 'Center' ? 8 : 5} className="node-point" />
                          <text x={node.x + textOffsetX} y={node.y + textOffsetY} textAnchor={textAnchor} className="node-text">
                            {node.name}
                          </text>
                          {hoveredNode === node.id && (
                            <g transform={`translate(${node.x}, ${node.y - 18})`}>
                              <rect x="-40" y="-12" width="80" height="18" rx="4" className="node-tooltip-bg" />
                              <text className="node-tooltip" textAnchor="middle">
                                {isLeaf ? `葉: ${node.name}` : `内部節: ${node.name}`}
                              </text>
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* プレーヤーコントロール */}
                <div className="player-controls">
                  <div className="btn-group">
                    <button className="btn" onClick={() => changeSubStepIndex(0, 0)} disabled={stepIndex === 0}>
                      ⏮️ 最初
                    </button>
                    <button className="btn" onClick={handlePrev} disabled={stepIndex === 0 && subStepIndex === 0}>
                      ◀️ 戻る
                    </button>
                    <button className={`btn ${isPlaying ? 'btn-active' : ''}`} onClick={() => setIsPlaying(!isPlaying)}>
                      {isPlaying ? '⏸️ 一時停止' : '▶️ 自動再生'}
                    </button>
                    <button className="btn" onClick={handleNext} disabled={stepIndex === snapshots.length - 1 && subStepIndex === getMaxSubSteps(stepIndex) - 1}>
                      進む ▶️
                    </button>
                    <button className="btn" onClick={() => changeSubStepIndex(getMaxSubSteps(snapshots.length - 1) - 1, snapshots.length - 1)} disabled={stepIndex === snapshots.length - 1 && subStepIndex === getMaxSubSteps(stepIndex) - 1}>
                      最後 ⏭️
                    </button>
                  </div>
                  
                  <div className="speed-control">
                    <label htmlFor="speed-select">再生速度</label>
                    <select 
                      id="speed-select"
                      value={playbackSpeed}
                      onChange={(e) => setPlaybackSpeed(parseInt(e.target.value))}
                    >
                      <option value="2500">遅い (2.5秒)</option>
                      <option value="1800">標準 (1.8秒)</option>
                      <option value="1000">速い (1.0秒)</option>
                    </select>
                  </div>
                </div>
              </div>
            </section>

            {/* 右側：計算プロセスの詳細解説 */}
            <section className="panel process-panel">
              <div className="panel-header">
                <h2>3. アルゴリズム計算プロセス</h2>
              </div>
              <div className="panel-body overflow-y">
                {stepIndex === 0 ? (
                  <div className="step-intro">
                    <div className="alert alert-info">
                      <strong>計算開始前:</strong> 初期状態の星型系統樹が表示されています。すべてのノード（分類群）は未解決の中心ノードに接続されています。「進む」を押して、計算ステップを刻んで進めましょう！
                    </div>
                    <h4>NJ法のステップ進行手順:</h4>
                    <ol className="flow-list">
                      <li><strong>計算準備:</strong> 現在の距離行列の確認。</li>
                      <li><strong>R値の計算:</strong> 各ノードから他ノードへの距離の総和 Ri を求める。</li>
                      <li><strong>Q値の計算:</strong> 距離を補正したQマトリクスを算出する。</li>
                      <li><strong>最小値の検出:</strong> 最小のQ値ペア（近隣）を決定。</li>
                      <li><strong>枝長の計算:</strong> 結合したノードから新ノードへの距離を決定。</li>
                      <li><strong>行列の更新:</strong> 距離行列を縮小し、次のステップへ。</li>
                    </ol>
                  </div>
                ) : stepIndex === snapshots.length - 1 ? (
                  /* 最終ステップ */
                  <div className="step-intro">
                    {subStepIndex === 0 && (
                      <div className="substep-container">
                        <div className="alert alert-info">
                          <strong>最終ステップの準備:</strong> 生き残っているノードが残り3つになりました。最後の3つを結合する処理に入ります。
                        </div>
                        <p className="desc-text">現在の生き残りノード:</p>
                        <div className="taxa-chips">
                          {displayRemainingTaxa.map(t => <span key={t} className="taxon-chip">{t}</span>)}
                        </div>
                      </div>
                    )}
                    {subStepIndex === 1 && (
                      <div className="substep-container">
                        <div className="alert alert-success">
                          <strong>中心から各ノードへの枝長計算:</strong> 仮想的な中心ノード（Center）を作成し、残りの3つのノードを結びます。
                        </div>
                        <div className="formula-box">
                          <p>中心ノードから残り3つのノード（A, B, Cとする）への各枝長：</p>
                          <code>d(A, Center) = [d(A,B) + d(A,C) - d(B,C)] / 2</code>
                          <p className="text-secondary mt-1">
                            {`計算結果:`}<br />
                            {displayRemainingTaxa.map((t, idx) => {
                              const len = idx === 0 ? currentSnapshot.branchLengthU : idx === 1 ? currentSnapshot.branchLengthV : Math.round((matrix[t]?.[displayRemainingTaxa[0]] || 0) * 100) / 100;
                              return <span key={t}>d({t}, Center) = <strong>{len}</strong><br /></span>;
                            })}
                          </p>
                        </div>
                      </div>
                    )}
                    {subStepIndex === 2 && (
                      <div className="substep-container">
                        <div className="alert alert-success">
                          <strong>系統樹の完成！</strong> すべての結合と枝長の計算が完了し、最終的な無根系統樹が構築されました。
                        </div>
                        <div className="comparison-box mt-3">
                          <h4>UPGMAとの違い：</h4>
                          <p>
                            {presetKey === 'lba' ? (
                              <span className="text-warning">
                                <strong>長枝引き付けの解消:</strong> UPGMAでは系統 C の進化速度が非常に速かったため誤った結合をしてしまいましたが、NJ法では Ri の差し引き効果により、進化速度の不均一性を完全に補正して正しいトポロジーを構築できました。
                              </span>
                            ) : (
                              <span>このサンプルでは、UPGMAとNJ法の両方で同じトポロジーが得られます。進化のスピードが大きく異なる場合におけるNJ法の補正効果を確かめるには、プリセットから「進化速度の不均一」を選択してみてください。</span>
                            )}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* 通常ステップ */
                  <div className="step-detail">
                    <div className="step-headline">
                      <span className="step-num">Step {stepIndex}</span>
                      <h3>{getSubStepTitle()}</h3>
                    </div>

                    {/* Substep 0: 計算準備 */}
                    {subStepIndex === 0 && (
                      <div className="substep-container">
                        <p className="desc-text">現在の距離行列から、新しく結合するペアを探します。まずは他ノードへの距離の総和 Ri を計算します。</p>
                        <div className="table-responsive">
                          <table className="q-table">
                            <thead>
                              <tr>
                                <th></th>
                                {displayRemainingTaxa.map(t => <th key={t}>{t}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {displayRemainingTaxa.map(u => (
                                <tr key={u}>
                                  <th>{u}</th>
                                  {displayRemainingTaxa.map(v => (
                                    <td key={v} className={u === v ? 'cell-disabled' : ''}>
                                      {u === v ? '-' : displayMatrix[u]?.[v]}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Substep 1: R値の計算 */}
                    {subStepIndex === 1 && (
                      <div className="substep-container">
                        <p className="desc-text">各ノードから他ノードへの距離の総和 R を計算します。他ノードから遠い（進化速度が速い）ノードほど R は大きくなります。</p>
                        <div className="r-values-list">
                          {Object.entries(currentSnapshot.rValues).map(([nodeId, val]) => (
                            <div key={nodeId} className="r-item">
                              <span className="node-badge">{nodeId}</span>
                              <span className="r-val">R = <strong>{val}</strong></span>
                            </div>
                          ))}
                        </div>
                        <p className="caption">
                          {`例: R_A = `}
                          {displayRemainingTaxa.filter(t => t !== displayRemainingTaxa[0]).map((t, idx) => (
                            <span key={t}>
                              {idx > 0 ? " + " : ""}d(A, {t})
                            </span>
                          ))}
                          {` = `}
                          {displayRemainingTaxa.filter(t => t !== displayRemainingTaxa[0]).map((t, idx) => (
                            <span key={t}>
                              {idx > 0 ? " + " : ""}{displayMatrix[displayRemainingTaxa[0]]?.[t]}
                            </span>
                          ))}
                          {` = `}
                          <strong>{currentSnapshot.rValues[displayRemainingTaxa[0]]}</strong>
                        </p>
                      </div>
                    )}

                    {/* Substep 2: Qマトリクスの算出 */}
                    {subStepIndex === 2 && (
                      <div className="substep-container">
                        <p className="desc-text">
                          Q(i,j) = (N - 2) × d(i,j) - Ri - Rj  (N = {displayRemainingTaxa.length})
                        </p>
                        <div className="table-responsive">
                          <table className="q-table">
                            <thead>
                              <tr>
                                <th></th>
                                {displayRemainingTaxa.map(t => <th key={t}>{t}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {displayRemainingTaxa.map(u => (
                                <tr key={u}>
                                  <th>{u}</th>
                                  {displayRemainingTaxa.map(v => (
                                    <td key={v} className={u === v ? 'cell-disabled' : ''}>
                                      {u === v ? '-' : currentSnapshot.qMatrix[u]?.[v]}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="caption">
                          {`例: Q(${displayRemainingTaxa[0]}, ${displayRemainingTaxa[1]}) = `}
                          {`(${displayRemainingTaxa.length}-2) × ${displayMatrix[displayRemainingTaxa[0]]?.[displayRemainingTaxa[1]]} - ${currentSnapshot.rValues[displayRemainingTaxa[0]]} - ${currentSnapshot.rValues[displayRemainingTaxa[1]]} = `}
                          <strong>{currentSnapshot.qMatrix[displayRemainingTaxa[0]]?.[displayRemainingTaxa[1]]}</strong>
                        </p>
                      </div>
                    )}

                    {/* Substep 3: 最小Q値の検出 */}
                    {subStepIndex === 3 && (
                      <div className="substep-container">
                        <p className="desc-text">Qマトリクスの中から最も値が小さいセルを探します。値が最も小さいペアが結合対象になります。</p>
                        <div className="table-responsive">
                          <table className="q-table">
                            <thead>
                              <tr>
                                <th></th>
                                {displayRemainingTaxa.map(t => <th key={t}>{t}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {displayRemainingTaxa.map(u => (
                                <tr key={u}>
                                  <th>{u}</th>
                                  {displayRemainingTaxa.map(v => {
                                    const isMin = currentSnapshot.minQ && 
                                      ((currentSnapshot.minQ.u === u && currentSnapshot.minQ.v === v) || 
                                       (currentSnapshot.minQ.u === v && currentSnapshot.minQ.v === u));
                                    return (
                                      <td key={v} className={`${isMin ? 'cell-highlight-min pulsate' : ''} ${u === v ? 'cell-disabled' : ''}`}>
                                        {u === v ? '-' : currentSnapshot.qMatrix[u]?.[v]}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="caption highlight-alert">
                          🎯 最小値: <strong>{currentSnapshot.minQ?.val}</strong> （ペア: <strong>{currentSnapshot.minQ?.u} - {currentSnapshot.minQ?.v}</strong>）<br />
                          <span className="text-secondary">系統樹上でも、結合予定の枝が破線でハイライトされています。</span>
                        </p>
                      </div>
                    )}

                    {/* Substep 4: 枝長の計算 */}
                    {subStepIndex === 4 && (
                      <div className="substep-container">
                        <p className="desc-text">新しく作成される内部ノード <strong>{currentSnapshot.newTaxon}</strong> から、結合した子ノードへの枝の長さを計算します。</p>
                        <div className="formula-box">
                          <code>
                            {`d(${currentSnapshot.minQ?.u}, ${currentSnapshot.newTaxon}) = 1/2 × d(${currentSnapshot.minQ?.u}, ${currentSnapshot.minQ?.v}) + 1/[2(N-2)] × (R_${currentSnapshot.minQ?.u} - R_${currentSnapshot.minQ?.v})`}
                          </code>
                          <div className="calc-result">
                            {`d(${currentSnapshot.minQ?.u}, ${currentSnapshot.newTaxon}) = `}
                            <strong>{currentSnapshot.branchLengthU}</strong>
                          </div>
                          <div className="calc-result mt-1">
                            {`d(${currentSnapshot.minQ?.v}, ${currentSnapshot.newTaxon}) = d(${currentSnapshot.minQ?.u}, ${currentSnapshot.minQ?.v}) - d(${currentSnapshot.minQ?.u}, ${currentSnapshot.newTaxon}) = `}
                            <strong>{currentSnapshot.branchLengthV}</strong>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Substep 5: 距離行列の更新 */}
                    {subStepIndex === 5 && (
                      <div className="substep-container">
                        <p className="desc-text">結合したノードを行列から削除し、新ノード <strong>{currentSnapshot.newTaxon}</strong> を追加した新しい距離行列を構築します。</p>
                        <div className="table-responsive">
                          <table className="q-table">
                            <thead>
                              <tr>
                                <th></th>
                                {currentSnapshot.remainingTaxa.filter(t => t !== currentSnapshot.minQ?.u && t !== currentSnapshot.minQ?.v).concat(currentSnapshot.newTaxon || '').map(t => <th key={t}>{t}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {currentSnapshot.remainingTaxa.filter(t => t !== currentSnapshot.minQ?.u && t !== currentSnapshot.minQ?.v).concat(currentSnapshot.newTaxon || '').map(u => (
                                <tr key={u}>
                                  <th>{u}</th>
                                  {currentSnapshot.remainingTaxa.filter(t => t !== currentSnapshot.minQ?.u && t !== currentSnapshot.minQ?.v).concat(currentSnapshot.newTaxon || '').map(v => (
                                    <td key={v} className={u === v ? 'cell-disabled' : ''}>
                                      {u === v ? '-' : currentSnapshot.distanceMatrix[u]?.[v]}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="formula-box mt-2" style={{ fontSize: '11px', padding: '8px' }}>
                          <p className="mb-1"><strong>新ノードから他ノード (k) への距離更新式:</strong></p>
                          <code>d(U, k) = [d(u, k) + d(v, k) - d(u, v)] / 2</code>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'explanation' && (
          <div className="explanation-container">
            <div className="panel doc-panel">
              <div className="panel-body markdown-body">
                <h2>系統樹作成における「NJ法（近隣結合法）」とは？</h2>
                
                <p>
                  <strong>近隣結合法（Neighbor-Joining Method, NJ法）</strong>は、1987年に斎藤成也博士と正木春洋博士によって開発された、進化生物学やバイオインフォマティクスにおいて最も広く用いられる系統樹構築手法の一つです。
                  距離行列データ（DNA配列やアミノ酸配列の相違度）を入力とし、進化の階層関係（木構造）をボトムアップで再構築します。
                </p>

                <div className="concept-grid">
                  <div className="concept-card">
                    <h4>🌟 特徴とメリット</h4>
                    <ul>
                      <li><strong>進化速度の不均一性を考慮:</strong> UPGMAと異なり、生物種（系統）によって進化するスピードが異なる場合でも、正確なツリー構造を復元できます。</li>
                      <li><strong>計算が極めて高速:</strong> 最大節約法（Maximum Parsimony）や最大尤度法（Maximum Likelihood）などの探索的アルゴリズムに比べ、数学的に一意に計算が進むため、非常に短い時間で実行可能です。</li>
                      <li><strong>無根系統樹の生成:</strong> 時間の流れの方向（根）を持たない木を構築するため、根を特定するには外部群（アウトグループ）などの追加情報が必要です。</li>
                    </ul>
                  </div>

                  <div className="concept-card">
                    <h4>⚠️ UPGMA（群平均法）との違い</h4>
                    <p>
                      UPGMAは<strong>「分子時計の仮定（すべての系統で進化の速度が一定である）」</strong>を前提としています。
                      しかし、現実の生物では進化速度が変化するため、分子時計を仮定すると、進化の早い系統（長い枝）が、見かけの距離の近さから誤って別の系統と結合してしまう<strong>「長枝引き付け（Long Branch Attraction）」</strong>という現象が起きます。
                    </p>
                    <p>
                      NJ法は、各ノードの「他すべてのノードへの平均距離」を算出し、それを個々のペアの距離から引くことで、進化速度の速いノードの影響を相殺し、この問題を解決します。
                    </p>
                  </div>
                </div>

                <h3>NJ法の詳細なアルゴリズム手順</h3>
                
                <div className="step-box">
                  <h5>Step 1. 初期化 (星型ツリーの仮定)</h5>
                  <p>すべての分類群（ノード）が1つの中心から放射状に伸びる「星型系統樹」を初期状態と仮定します。</p>
                </div>

                <div className="step-box">
                  <h5>Step 2. 距離総和 Ri の算出</h5>
                  <p>現在存在する各ノード $i$ について、他のすべてのノード $j$ への距離の総和 $R_i$ を計算します。</p>
                  <div className="equation">
                    {"\\[R_i = \\sum_{j \\neq i} d(i, j)\\]"}
                  </div>
                </div>

                <div className="step-box">
                  <h5>Step 3. Qマトリクスの算出</h5>
                  <p>すべてのノードペア $(i, j)$ について、進化速度の不均一性を補正した指標である「Q値」を計算します。$N$ は現在のノード数です。</p>
                  <div className="equation">
                    {"\\[Q(i, j) = (N - 2) d(i, j) - R_i - R_j\\]"}
                  </div>
                  <p className="note">
                    <strong>なぜこれで補正できる？:</strong> $R_i$ と $R_j$ が大きいノード（＝他のノードから大きく離れた、進化の速いノード）は、Q値が小さくなりやすくなります。これにより、見かけの距離 $d(i, j)$ が多少長くても、真に「隣り合っている（近隣である）」関係が見落とされなくなります。
                  </p>
                </div>

                <div className="step-box">
                  <h5>Step 4. 近隣の結合と枝長の決定</h5>
                  <p>Q値が最小となるペア $(f, g)$ を選んで結合し、新しい内部ノード $u$ を作成します。$f$ と $g$ から $u$ への枝の長さはそれぞれ以下のように計算されます。</p>
                  <div className="equation">
                    {"\\[d(f, u) = \\frac{1}{2} d(f, g) + \\frac{1}{2(N - 2)} (R_f - R_g)\\]"}
                    {"\\[d(g, u) = d(f, g) - d(f, u)\\]"}
                  </div>
                </div>

                <div className="step-box">
                  <h5>Step 5. 距離行列の更新</h5>
                  <p>結合した $f$ と $g$ を行列から削除し、新しい内部ノード $u$ を追加します。$u$ から他の任意のノード $k$ への距離は次のように計算されます。</p>
                  <div className="equation">
                    {"\\[d(u, k) = \\frac{1}{2} \\left( d(f, k) + d(g, k) - d(f, g) \\right)\\]"}
                  </div>
                  <p>この更新を、残りのノード数が3つになるまで繰り返します。最後の3つは共通の中心点に結合されて終了します。</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'quiz' && (
          <div className="quiz-container">
            {QUESTIONS.map((q, idx) => {
              const selectedOption = quizAnswers[q.id];
              const isSubmitted = quizSubmitted[q.id];
              const isCorrect = selectedOption === q.correctAnswer;
              
              return (
                <div key={q.id} className="panel quiz-card">
                  <div className="panel-header">
                    <span className="quiz-number">問題 {idx + 1}</span>
                  </div>
                  <div className="panel-body">
                    <p className="quiz-question">{q.question}</p>
                    
                    <div className="quiz-options">
                      {q.options.map((option, optIdx) => {
                        let optionClass = "";
                        if (isSubmitted) {
                          if (optIdx === q.correctAnswer) {
                            optionClass = "correct";
                          } else if (optIdx === selectedOption) {
                            optionClass = "incorrect";
                          } else {
                            optionClass = "disabled";
                          }
                        } else if (selectedOption === optIdx) {
                          optionClass = "selected";
                        }
                        
                        return (
                          <button 
                            key={optIdx}
                            className={`quiz-option ${optionClass}`}
                            onClick={() => handleQuizAnswer(q.id, optIdx)}
                            disabled={isSubmitted}
                          >
                            <span className="option-marker">{String.fromCharCode(65 + optIdx)}</span>
                            <span className="option-text">{option}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="quiz-actions">
                      {!isSubmitted ? (
                        <button 
                          className="btn btn-primary"
                          onClick={() => submitQuiz(q.id)}
                          disabled={selectedOption === undefined}
                        >
                          回答を送信する
                        </button>
                      ) : (
                        <button className="btn btn-outline" onClick={() => resetQuiz(q.id)}>
                          もう一度解く
                        </button>
                      )}
                    </div>

                    {isSubmitted && (
                      <div className={`quiz-feedback ${isCorrect ? 'feedback-correct' : 'feedback-incorrect'}`}>
                        <h5>{isCorrect ? "🎯 正解です！" : "❌ 不正解です。正しい答えは " + String.fromCharCode(65 + q.correctAnswer) + " です。"}</h5>
                        <p className="feedback-explanation">{q.explanation}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <footer className="app-footer">
        <p>© 2026 系統樹構築アルゴリズム（NJ法）インタラクティブ教材開発プロジェクト</p>
      </footer>
    </div>
  );
}
