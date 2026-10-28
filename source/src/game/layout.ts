import Phaser from 'phaser';

export const COL_W = 480;
export const COL_H = 854;

/** For screens drawn in a 480x854 column: scales and centres that column in any window (phone portrait or desktop landscape). */
export function fitColumn(scene: Phaser.Scene, bg = '#14110f'): void {
  const apply = (): void => {
    const w = scene.scale.width, h = scene.scale.height;
    const cam = scene.cameras.main;
    cam.setBackgroundColor(bg);
    cam.setZoom(Math.min(w / COL_W, h / COL_H));
    cam.centerOn(COL_W / 2, COL_H / 2);
  };
  apply();
  scene.scale.on('resize', apply);
  scene.events.once('shutdown', () => scene.scale.off('resize', apply));
}
