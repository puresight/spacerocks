import { useEffect, useRef, useState } from 'react';
import { GameEngine } from './game/engine';
export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    </div>
  );
}
