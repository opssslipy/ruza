import Phaser from 'phaser';
import { MenuScene } from './scenes/MenuScene';
import { TitleScene } from './scenes/TitleScene';
import { MapScene } from './scenes/MapScene';
import { VenueScene } from './scenes/VenueScene';
import { InteriorScene } from './scenes/InteriorScene';
import { CallScene } from './scenes/CallScene';
import { EndScene } from './scenes/EndScene';

function startGame(): void {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    transparent: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [TitleScene, MapScene, MenuScene, VenueScene, InteriorScene, CallScene, EndScene],
  });
}

startGame();
