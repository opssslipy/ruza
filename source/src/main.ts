import Phaser from 'phaser';
import { MenuScene } from './scenes/MenuScene';
import { TitleScene } from './scenes/TitleScene';
import { MapScene } from './scenes/MapScene';
import { VenueScene } from './scenes/VenueScene';
import { InteriorScene } from './scenes/InteriorScene';
import { CallScene } from './scenes/CallScene';
import { EndScene } from './scenes/EndScene';

import { unlock } from './game/audio';

function startGame(): void {
  for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, () => unlock(), { once: false, passive: true });
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    transparent: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [TitleScene, MapScene, MenuScene, VenueScene, InteriorScene, CallScene, EndScene],
  });
}

startGame();
