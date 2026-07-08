"use client";

import { useEffect, useRef, useState } from "react";
import { initTourMap } from "@/lib/tourmap-runtime";
import type { Artist, Show, TourbookDetail } from "@/lib/types";
import UnlockModal from "./UnlockModal";

export default function TourApp({
  artist,
  shows,
  details,
}: {
  artist: Artist;
  shows: Show[];
  details: Record<number, TourbookDetail> | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    if (!rootRef.current) return;
    const cleanup = initTourMap(rootRef.current, {
      shows,
      details,
      onUnlock: () => setShowLogin(true),
    });
    return cleanup;
  }, [shows, details]);

  return (
    <div className="app show-map" id="app" ref={rootRef}>
      <header>
        <div className="brand">
          {artist.logo_url && !logoError ? (
            <img
              className="logo-img"
              src={artist.logo_url}
              alt={artist.name}
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="wordmark">{artist.name}</div>
          )}
          <div className="tag">NUDA · Live 2026</div>
        </div>
        <div className="stats" id="stats"></div>
      </header>

      <div className="viewtoggle" id="viewtoggle">
        <button data-view="map" className="is-on">
          Mappa
        </button>
        <button data-view="list">Scaletta</button>
      </div>

      <div className="shell">
        <aside>
          <div className="filters">
            <div className="filters__label">Filtra per mese</div>
            <div className="chips" id="chips"></div>
          </div>
          <div className="manifest" id="manifest"></div>
        </aside>

        <div className="mapwrap" id="mapwrap">
          <svg id="map" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
            <g id="landG"></g>
            <polyline id="route" className="route" points=""></polyline>
          </svg>
          <div className="overlay" id="overlay"></div>

          <div className="tl">
            <button className="bx-chip bx-chip--next" id="nextChip">
              <span className="bx-dot bx-dot--next" id="nextDot"></span>
              <span className="bx-txt">
                <span className="bx-city" id="nextCity">
                  —
                </span>
                <span className="bx-sub" id="nextSub">
                  prossima tappa
                </span>
              </span>
            </button>
            <div className="panel">
              <div className="legend">
                <div className="legend__row">
                  <span className="legend__dot legend__dot--confirmed"></span>Confermato
                </div>
                <div className="legend__row">
                  <span className="legend__dot legend__dot--interest"></span>Interesse
                </div>
                <div className="legend__row">
                  <span className="legend__dot legend__dot--tbd"></span>Da definire
                </div>
                <div className="legend__row">
                  <span className="legend__dot legend__dot--book"></span>Scheda tecnica
                </div>
              </div>
              <button className="route-toggle" id="routeToggle">
                <span className="switch"></span>Percorso completo
              </button>
              <button className="route-toggle" id="nextToggle">
                <span className="switch"></span>Percorso → prossima data
              </button>
            </div>
          </div>

          <div className="zoom">
            <button id="zin" aria-label="Zoom avanti">
              +
            </button>
            <button id="zout" aria-label="Zoom indietro">
              −
            </button>
            <button className="reset" id="zreset" aria-label="Reimposta vista">
              FIT
            </button>
          </div>

          <div className="card" id="card"></div>
        </div>
      </div>

      <UnlockModal open={showLogin} onClose={() => setShowLogin(false)} />
    </div>
  );
}
