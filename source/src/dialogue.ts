import { Compiler } from 'inkjs/compiler/Compiler';
import type { Story } from 'inkjs/engine/Story';

export interface DialogueLine {
  text: string;
  choices: string[];
  ended: boolean;
}

// Ink source is compiled in the browser, so writers edit plain .ink text without a separate build tool.
export class Dialogue {
  private story: Story;

  constructor(inkSource: string) {
    this.story = new Compiler(inkSource).Compile();
  }

  /** Advance until the next choice or the end, collecting all text on the way. */
  next(choiceIndex?: number): DialogueLine {
    if (choiceIndex !== undefined) this.story.ChooseChoiceIndex(choiceIndex);
    let text = '';
    while (this.story.canContinue) {
      text += this.story.Continue() ?? '';
    }
    const choices = this.story.currentChoices.map((c) => c.text);
    return { text: text.trim(), choices, ended: choices.length === 0 };
  }

  getFlag(name: string): boolean {
    return this.story.variablesState.$(name) === true;
  }
}
