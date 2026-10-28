import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, PASSWORD_SHA256 } from './config';
import { MenuScene } from './scenes/MenuScene';
import { DialogueScene } from './scenes/DialogueScene';
import { MapScene } from './scenes/MapScene';

const GATE_KEY = 'ruza-unlocked';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function startGame(): void {
  document.getElementById('gate')?.remove();
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#14110f',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: GAME_WIDTH, height: GAME_HEIGHT },
    scene: [MapScene, MenuScene, DialogueScene],
  });
}

function remembered(): boolean {
  try {
    return localStorage.getItem(GATE_KEY) === PASSWORD_SHA256;
  } catch {
    return false;
  }
}

if (remembered()) {
  startGame();
} else {
  const input = document.getElementById('pass') as HTMLInputElement;
  const err = document.getElementById('err') as HTMLElement;
  const submit = async (): Promise<void> => {
    if ((await sha256(input.value)) === PASSWORD_SHA256) {
      try {
        localStorage.setItem(GATE_KEY, PASSWORD_SHA256);
      } catch {
        // gate just asks again next visit
      }
      startGame();
    } else {
      err.textContent = 'Неверный пароль';
    }
  };
  document.getElementById('enter')?.addEventListener('click', () => void submit());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void submit();
  });
}
