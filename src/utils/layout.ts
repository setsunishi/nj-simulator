import type { TreeNode } from './nj';

export interface LayoutNode {
  id: string;
  name: string;
  x: number;
  y: number;
  isLeaf: boolean;
  branchLength?: number;
  children: LayoutNode[];
}

/**
 * ツリー配下の葉ノードの総数をカウントします
 */
function countLeaves(node: TreeNode): number {
  if (node.isLeaf) return 1;
  if (!node.children) return 0;
  return node.children.reduce((sum, child) => sum + countLeaves(child), 0);
}

/**
 * 1. 有根系統樹 (Rooted Tree) のレイアウトを計算します。
 * 左（根）から右（葉）へ伸びる木を描画するための座標を算出します。
 */
export function computeRootedLayout(
  tree: TreeNode,
  useBranchLength: boolean,
  width: number = 800,
  height: number = 500,
  padding: number = 50
): LayoutNode {
  // 1. 葉ノードを順序付けてY座標を決定する
  const leafOrder: string[] = [];
  function collectLeaves(node: TreeNode) {
    if (node.isLeaf) {
      leafOrder.push(node.id);
    } else if (node.children) {
      node.children.forEach(collectLeaves);
    }
  }
  collectLeaves(tree);

  const numLeaves = leafOrder.length;
  const ySpacing = (height - 2 * padding) / Math.max(1, numLeaves - 1);

  // 各ノードのX座標（深さ）を計算するためのパス長を求める
  // まず、根から各ノードへの最大パス長（最大進化距離）を求めてスケーリングに使用する
  let maxDepth = 0;
  function calculateDepths(node: TreeNode, currentDepth: number): number {
    const len = useBranchLength ? (node.branchLength || 0) : 1;
    const depth = currentDepth + (node.id === tree.id ? 0 : len); // 根自体の枝長は加算しない
    let max = depth;
    if (node.children) {
      for (const child of node.children) {
        const childMax = calculateDepths(child, depth);
        if (childMax > max) max = childMax;
      }
    }
    return max;
  }
  maxDepth = calculateDepths(tree, 0) || 1;

  const xScale = (width - 2 * padding) / maxDepth;

  // 2. 再帰的に座標を計算する
  function layoutNode(node: TreeNode, currentX: number): LayoutNode {
    const len = useBranchLength ? (node.branchLength || 0) : 1;
    const x = node.id === tree.id ? padding : currentX + len * xScale;

    let y = 0;
    let layoutChildren: LayoutNode[] = [];

    if (node.isLeaf) {
      const index = leafOrder.indexOf(node.id);
      y = padding + index * ySpacing;
    } else if (node.children) {
      layoutChildren = node.children.map((child) => layoutNode(child, node.id === tree.id ? padding : currentX + len * xScale));
      // 内部ノードのY座標は子ノードの平均
      const sumY = layoutChildren.reduce((sum, child) => sum + child.y, 0);
      y = sumY / layoutChildren.length;
    }

    return {
      id: node.id,
      name: node.name,
      x,
      y,
      isLeaf: node.isLeaf,
      branchLength: node.branchLength,
      children: layoutChildren,
    };
  }

  return layoutNode(tree, padding);
}

/**
 * 2. 無根系統樹 (Unrooted Tree) の放射状 (Radial) レイアウトを計算します。
 * 中心から全方向に均等に枝が広がるように座標を算出します。
 */
export function computeRadialLayout(
  tree: TreeNode,
  useBranchLength: boolean,
  width: number = 600,
  height: number = 600,
  padding: number = 50
): LayoutNode {
  const centerX = width / 2;
  const centerY = height / 2;

  // 描画可能範囲の半径
  const maxRadius = Math.min(width, height) / 2 - padding;

  // 根（Center）から葉までの最大距離（スケーリング用）
  function getMaxDistance(node: TreeNode): number {
    if (node.isLeaf || !node.children) return 0;
    return Math.max(
      ...node.children.map((child) => {
        const len = useBranchLength ? (child.branchLength || 0) : 1;
        return len + getMaxDistance(child);
      })
    );
  }
  const maxDistance = getMaxDistance(tree) || 1;
  const radiusScale = maxRadius / maxDistance;

  // 放射状に配置する再帰関数
  // parentAngle: 親からこのノードに侵入した角度 (ラジアン)
  // angleWidth: このノード配下の枝に割り当てられた角度の幅 (ラジアン)
  function layoutRadialNode(
    node: TreeNode,
    px: number,
    py: number,
    parentAngle: number,
    angleWidth: number
  ): LayoutNode {
    const len = useBranchLength ? (node.branchLength || 0) : 1;
    const r = len * radiusScale;

    // このノード自体の座標
    // 根（Center）の場合は (centerX, centerY) 固定
    let x = px;
    let y = py;
    if (node.id !== tree.id) {
      x = px + r * Math.cos(parentAngle);
      y = py + r * Math.sin(parentAngle);
    }

    let layoutChildren: LayoutNode[] = [];

    if (!node.isLeaf && node.children && node.children.length > 0) {

      
      // 子ノード配下の葉の総数
      const totalLeaves = countLeaves(node);

      if (node.id === tree.id) {
        // 根（Center）の場合は周囲360度（2π）をすべての子ノードに葉の数比率で分配する
        let currentAngleStart = 0;
        layoutChildren = node.children.map((child) => {
          const childLeaves = countLeaves(child);
          const childAngleWidth = (childLeaves / totalLeaves) * 2 * Math.PI;
          const childAngle = currentAngleStart + childAngleWidth / 2;
          
          const result = layoutRadialNode(
            child,
            x,
            y,
            childAngle,
            childAngleWidth
          );
          currentAngleStart += childAngleWidth;
          return result;
        });
      } else {
        // 内部ノードの場合は、侵入角（parentAngle）の反対側を中心に、割り当てられた angleWidth を分配する
        // 親の方向（parentAngle + PI）への逆戻りを避けるため、angleWidth の範囲内で扇形に広げる
        const startAngle = parentAngle - angleWidth / 2;
        let currentAngleStart = startAngle;

        layoutChildren = node.children.map((child) => {
          const childLeaves = countLeaves(child);
          const childAngleWidth = (childLeaves / totalLeaves) * angleWidth;
          const childAngle = currentAngleStart + childAngleWidth / 2;

          const result = layoutRadialNode(
            child,
            x,
            y,
            childAngle,
            childAngleWidth
          );
          currentAngleStart += childAngleWidth;
          return result;
        });
      }
    }

    return {
      id: node.id,
      name: node.name,
      x,
      y,
      isLeaf: node.isLeaf,
      branchLength: node.branchLength,
      children: layoutChildren,
    };
  }

  // 根ノードから開始。根は (centerX, centerY) で、親角度は0、角度幅は 2π
  return layoutRadialNode(tree, centerX, centerY, 0, 2 * Math.PI);
}
