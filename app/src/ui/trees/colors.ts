// Paint of the tree drawings (leaves, wood, the patch of ground under a tree), by day
// and by night. Like the sky and the meadow, these are colors of the world, not of
// the interface, so they live next to the drawings and not in ds/tokens.ts.

export interface TreePaint {
  ground: string;
  groundShade: string;
  leafLight: string;
  leaf: string;
  leafDark: string;
  trunk: string;
  trunkDark: string;
  deadWood: string;
}

export const treeDay: TreePaint = {
  ground: '#F2C98F',
  groundShade: '#E3B274',
  leafLight: '#B9DE6C',
  leaf: '#8BC34A',
  leafDark: '#5E9A2C',
  trunk: '#8A6A3B',
  trunkDark: '#6B5030',
  deadWood: '#6E5440',
};

export const treeNight: TreePaint = {
  ground: '#6B4A33',
  groundShade: '#553925',
  leafLight: '#7FAF3A',
  leaf: '#5E8F25',
  leafDark: '#3F6A17',
  trunk: '#6E5232',
  trunkDark: '#523B22',
  deadWood: '#5A4434',
};
