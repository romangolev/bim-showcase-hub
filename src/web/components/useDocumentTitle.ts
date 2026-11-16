import { useEffect } from 'react';

export const PRODUCT_NAME = 'BIM Showcase Hub';

export function useDocumentTitle(title: string | null) {
  useEffect(() => {
    if (title === null) {
      return;
    }
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

export function composeTitle(...parts: (string | undefined)[]): string {
  return [parts.filter(Boolean).join(' '), PRODUCT_NAME].join(' · ');
}
