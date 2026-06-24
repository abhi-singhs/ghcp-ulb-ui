import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeProvider } from '@primer/react';
import { ColorModeContext, type ColorMode } from './colorMode';

const STORAGE_KEY = 'ulb.colorMode';

function readStored(): ColorMode {
  if (typeof window === 'undefined') return 'auto';
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
}

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(readStored);

  // Keep the document attribute in sync so the @primer/primitives CSS
  // variables (which our own stylesheet also reads) switch with the toggle.
  useEffect(() => {
    document.documentElement.setAttribute('data-color-mode', mode);
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const value = useMemo(
    () => ({ mode, setMode: setModeState }),
    [mode],
  );

  return (
    <ColorModeContext.Provider value={value}>
      <ThemeProvider colorMode={mode}>{children}</ThemeProvider>
    </ColorModeContext.Provider>
  );
}
