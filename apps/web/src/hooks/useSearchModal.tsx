import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { SearchOverlay } from '../components/screens/SearchOverlay';

interface SearchModalCtx {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const Ctx = createContext<SearchModalCtx | null>(null);

export function SearchModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((o) => !o);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <Ctx.Provider value={{ open: () => setIsOpen(true), close: () => setIsOpen(false), isOpen }}>
      {children}
      {isOpen && <SearchOverlay onClose={() => setIsOpen(false)} />}
    </Ctx.Provider>
  );
}

export function useSearchModal(): SearchModalCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSearchModal must be used inside <SearchModalProvider>');
  return v;
}
