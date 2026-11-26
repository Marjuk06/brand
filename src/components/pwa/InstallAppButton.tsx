import { useEffect, useRef, useState } from 'react';
import { haptics } from '../../lib/haptics.ts';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Navigator {
    install?: () => Promise<void>;
  }
}

export function InstallAppButton() {
  const supportsWebInstall =
    typeof Navigator !== 'undefined' &&
    typeof Navigator.prototype.install === 'function';

  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState<boolean>(supportsWebInstall);
  const [isInstalling, setIsInstalling] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) {
      setCanInstall(false);
      return;
    }

    const handleBeforeInstallPrompt = (event: Event): void => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      if (!supportsWebInstall) {
        setCanInstall(true);
      }
    };

    const handleAppInstalled = (): void => {
      deferredPromptRef.current = null;
      setCanInstall(false);
      setStatusMessage('App installed.');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [supportsWebInstall]);

  const handleInstallClick = async (): Promise<void> => {
    if (isInstalling) return;
    haptics.trigger('tap');
    setIsInstalling(true);

    try {
      if (supportsWebInstall && navigator.install) {
        await navigator.install();
        setStatusMessage('App installed or opened.');
        setCanInstall(false);
      } else if (deferredPromptRef.current) {
        const promptEvent = deferredPromptRef.current;
        deferredPromptRef.current = null;
        await promptEvent.prompt();
        const { outcome } = await promptEvent.userChoice;
        setStatusMessage(
          outcome === 'accepted' ? 'App installed.' : 'Installation canceled.',
        );
        if (!deferredPromptRef.current) {
          setCanInstall(false);
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatusMessage('Installation was canceled.');
      } else {
        setStatusMessage('Installation could not start.');
      }
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="pwa-install-wrap">
      <button
        type="button"
        className="btn-secondary pwa-install-btn"
        hidden={!canInstall}
        aria-disabled={isInstalling ? 'true' : undefined}
        onClick={handleInstallClick}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        </svg>
        <span>Install App</span>
      </button>
      <span className="visually-hidden" role="status">
        {statusMessage}
      </span>
    </div>
  );
}
