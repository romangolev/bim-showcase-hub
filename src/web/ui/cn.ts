import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['8', '12', '13', '14', '16', '18', '24', '32', '42', '52', '64'],
      'font-weight': ['light', 'body', 'ui', 'label', 'strong'],
      tracking: ['body', 'tight', 'display'],
      radius: [
        'badge',
        'tile',
        'button',
        'card',
        'container',
        'pill',
        'control',
        'surface',
      ],
      shadow: ['control', 'float'],
      spacing: ['hit'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
