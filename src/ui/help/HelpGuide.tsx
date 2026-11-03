import { useState, type ReactNode } from 'react';
import gettingConnected from '../../help/getting-connected.md?raw';
import howTheChannelsInteract from '../../help/how-the-channels-interact.md?raw';
import { parseHelp, type HelpBlock, type Inline } from '../../help/markdown';
import { VIRTUAL_PEDAL_PORT } from '../../midi/transport/virtual';
import { useEditorStore } from '../../store/editorStore';
import { MidiChannelWizard } from '../panels/GlobalSettingsPanel';

export type Guide = { title: string; blocks: HelpBlock[] };

/** A guide file opens with a ## heading, which is its title. */
function guide(markdown: string): Guide {
  const blocks = parseHelp(markdown);
  const first = blocks[0];
  if (first?.type !== 'heading') throw new Error('A help guide must open with a ## heading');
  return { title: first.text.map((t) => t.text).join(''), blocks };
}

/** The guides the Help tab offers, in order. */
export const GUIDES: Guide[] = [guide(gettingConnected), guide(howTheChannelsInteract)];

function InlineText({ text }: { text: Inline[] }) {
  return text.map((t, i) => (t.type === 'strong' ? <strong key={i}>{t.text}</strong> : t.type === 'code' ? <code key={i}>{t.text}</code> : t.text));
}

/** The in-app buttons a guide's {{action}} placeholders stand for. */
function GuideAction({ id }: { id: string }) {
  const onVirtualPedal = useEditorStore((s) => s.isOutputVirtual());
  const setOutput = useEditorStore((s) => s.setOutput);
  const [wizardOpen, setWizardOpen] = useState(false);

  if (id === 'midi-channel-wizard') {
    return (
      <p className="help-action">
        <button type="button" className="bar-button" onClick={() => setWizardOpen(true)}>
          Set pedal’s MIDI channel…
        </button>
        {wizardOpen && <MidiChannelWizard onClose={() => setWizardOpen(false)} />}
      </p>
    );
  }
  if (id === 'use-virtual-pedal') {
    return (
      <p className="help-action">
        <button type="button" className="bar-button" disabled={onVirtualPedal} onClick={() => setOutput(VIRTUAL_PEDAL_PORT.id)}>
          {onVirtualPedal ? 'Virtual Pedal selected' : 'Use the Virtual Pedal'}
        </button>
      </p>
    );
  }
  return null;
}

function Block({ block }: { block: HelpBlock }): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Heading = block.level === 2 ? 'h3' : 'h4';
      return (
        <Heading className={`help-heading help-heading-${block.level}`}>
          <InlineText text={block.text} />
        </Heading>
      );
    }
    case 'paragraph':
      return (
        <p>
          <InlineText text={block.text} />
        </p>
      );
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul';
      return (
        <List>
          {block.items.map((item, i) => (
            <li key={i}>
              <InlineText text={item} />
            </li>
          ))}
        </List>
      );
    }
    case 'action':
      return <GuideAction id={block.id} />;
  }
}

/** A guide (SPEC.md §5.10) from one of the src/help/*.md files. */
export function HelpGuide({ guide }: { guide: Guide }) {
  return (
    <section className="help-guide" aria-label={guide.title}>
      {guide.blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </section>
  );
}
