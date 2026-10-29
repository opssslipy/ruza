// 1 metre of the real map = S pixels. Characters are drawn oversized on purpose so they stay readable on a phone.
export const S = 3;

export interface Line { w: number; p: number[] }
export interface Building { p: number[]; k: number; l: number; n?: string }
export interface Shop { name: string; kind: string; pos: [number, number] }
export interface Street { n: string; x: number; y: number; a: number; r: number; big: number }
export interface Landmark { id: string; name: string; pos: [number, number]; kind?: string }

export interface MapData {
  width: number; height: number; cell: number; gridW: number; gridH: number; blocked: string;
  buildings: Building[]; streets: Street[]; roads: Line[]; /** footbridges added over rivers: centre, direction across the river, length, width */ stadium?: { x: number; y: number; a: number; l: number; w: number }; bridges?: { x: number; y: number; a: number; l: number; w: number }[]; rivers: Line[]; waters: number[][]; greens: number[][]; pitches: number[][];
  landmarks: Landmark[];
  shops: Shop[];
}
