import type { MapData } from './mapData';
import { World3D } from './world3d';

// The 3D world is built once (it is heavy) and shared by the title screen and the map.
let world: World3D | null = null;

export function getWorld(map: MapData): World3D {
  if (!world) world = new World3D(document.getElementById('world3d') as HTMLCanvasElement, map);
  return world;
}
