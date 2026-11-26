import { Icon } from '../components/icons.js';
import { IconButton } from '../ui/IconButton.js';
import { useTheme } from './ThemeContext.js';

export function ThemeToggle() {
  const { scheme, toggleTheme } = useTheme();
  const label =
    scheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  return (
    <IconButton
      className="theme-toggle"
      label={label}
      tooltip
      onClick={toggleTheme}
    >
      {scheme === 'dark' ? (
        <Icon name="sun" size={18} />
      ) : (
        <Icon name="moon" size={18} />
      )}
    </IconButton>
  );
}
