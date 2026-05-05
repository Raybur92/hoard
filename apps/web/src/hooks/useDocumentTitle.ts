import { useEffect } from 'react';

/**
 * Sets `document.title` for the lifetime of the calling component.
 * Per WCAG 2.4.2 (Page Titled): every route should set a unique title.
 *
 * On unmount, restores the previous title — keeps tab labels coherent
 * during route transitions, since the next screen sets its own title
 * synchronously on mount.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} — hoard` : 'hoard';
    return () => {
      document.title = previous;
    };
  }, [title]);
}
