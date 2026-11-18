import type { Command, CommandProvider } from './types.js';

interface Source {
  name: string;
  provider: CommandProvider;
  priority: number;
}

export class CommandRegistry {
  private sources: Source[] = [];

  register(name: string, provider: CommandProvider, priority = 0): () => void {
    const source: Source = { name, provider, priority };
    this.sources = [...this.sources.filter((s) => s.name !== name), source];
    return () => {
      if (this.sources.includes(source)) {
        this.sources = this.sources.filter((s) => s !== source);
      }
    };
  }

  list(): Command[] {
    const byId = new Map<string, { command: Command; priority: number }>();
    for (const source of this.sources) {
      for (const command of source.provider()) {
        const known = byId.get(command.id);
        if (!known || source.priority >= known.priority) {
          byId.set(command.id, { command, priority: source.priority });
        }
      }
    }
    return [...byId.values()].map((entry) => entry.command);
  }
}

export const COMMANDS = new CommandRegistry();
