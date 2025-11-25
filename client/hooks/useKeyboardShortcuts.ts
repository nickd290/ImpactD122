import { useEffect } from 'react';

type View = 'DASHBOARD' | 'JOBS' | 'CUSTOMERS' | 'VENDORS' | 'PARTNER_STATS';

interface KeyboardShortcutsConfig {
  onShowSearch: () => void;
  onViewChange: (view: View) => void;
  onCreateJob: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onShowSearch,
  onViewChange,
  onCreateJob,
  enabled = true,
}: KeyboardShortcutsConfig) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Command/Ctrl + K for search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onShowSearch();
        return;
      }

      // Single key shortcuts (only when not in an input)
      switch (e.key.toLowerCase()) {
        case 'd':
          e.preventDefault();
          onViewChange('DASHBOARD');
          break;
        case 'j':
          e.preventDefault();
          onViewChange('JOBS');
          break;
        case 'c':
          e.preventDefault();
          onViewChange('CUSTOMERS');
          break;
        case 'v':
          e.preventDefault();
          onViewChange('VENDORS');
          break;
        case 'n':
          // Only when Ctrl/Cmd is pressed for new job
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            onCreateJob();
          }
          break;
        case '/':
          e.preventDefault();
          onShowSearch();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onShowSearch, onViewChange, onCreateJob]);
}
