import { IconButton } from '@primer/react';
import { DeviceDesktopIcon, MoonIcon, SunIcon } from '@primer/octicons-react';
import { useColorMode, type ColorMode } from '../context/colorMode';

const NEXT: Record<ColorMode, ColorMode> = { auto: 'light', light: 'dark', dark: 'auto' };
const ICON = { auto: DeviceDesktopIcon, light: SunIcon, dark: MoonIcon };
const LABEL = { auto: 'System theme', light: 'Light theme', dark: 'Dark theme' };

export function ThemeToggle() {
  const { mode, setMode } = useColorMode();

  return (
    <IconButton
      icon={ICON[mode]}
      aria-label={`${LABEL[mode]} (click to switch)`}
      variant="invisible"
      onClick={() => setMode(NEXT[mode])}
    />
  );
}
