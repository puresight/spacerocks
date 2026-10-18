import { useEffect, useRef, useState } from 'react';
import { GameEngine } from './game/engine';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches || (window.navigator as { standalone?: boolean }).standalone === true
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async (): Promise<void> => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    const engine = new GameEngine();
    engineRef.current = engine;

    engine
      .mount(container)
      .then(() => {
        if (disposed) return;
        setReady(true);
      })
      .catch((err) => {
        if (disposed) return;
        console.error(err);
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      disposed = true;
      engine.unmount();
      engineRef.current = null;
    };
  }, []);

  return (
    <div className="game-shell">
      <div ref={containerRef} className="game-canvas-host" />
      {error && (
        <div className="game-error">
          <p>Failed to start the game: {error}</p>
        </div>
      )}
      {!ready && !error && (
        <div className="game-loading">
          <p>Loading engine...</p>
        </div>
      )}
      {ready && !installed && installPrompt && (
        <button className="install-button" onClick={() => void handleInstall()}>
          INSTALL APP
        </button>
      )}
    </div>
  );
}
