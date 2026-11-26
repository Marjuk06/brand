import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { haptics } from '../../lib/haptics.ts';

export interface GlassNavItem<T extends string> {
  id: T;
  label: string;
  badge?: number;
  icon: (active: boolean) => ReactNode;
}

interface LiquidGlassNavProps<T extends string> {
  items: GlassNavItem<T>[];
  activeId: T;
  onSelect: (id: T) => void;
}

interface PillGeometry {
  left: number;
  width: number;
}

function applyRubberBand(value: number, min: number, max: number): number {
  if (value < min) return min - Math.min(8, (min - value) * 0.25);
  if (value > max) return max + Math.min(8, (value - max) * 0.25);
  return value;
}

export function LiquidGlassNav<T extends string>({
  items,
  activeId,
  onSelect,
}: LiquidGlassNavProps<T>) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Map<T, HTMLButtonElement>>(new Map());

  const [pillRect, setPillRect] = useState<PillGeometry>({ left: 4, width: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragLeft, setDragLeft] = useState<number | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const dragMetaRef = useRef<{
    pointerId: number;
    startX: number;
    startLeft: number;
    moved: boolean;
    lastIndex: number;
    pillWidth: number;
    maxLeft: number;
  } | null>(null);

  const measureActivePill = useCallback((): void => {
    const btn = buttonRefs.current.get(activeId);
    const track = trackRef.current;
    if (!btn || !track) return;

    setPillRect({
      left: btn.offsetLeft,
      width: btn.offsetWidth,
    });
  }, [activeId]);

  useLayoutEffect(() => {
    measureActivePill();
  }, [measureActivePill, items]);

  useEffect(() => {
    const handleResize = (): void => measureActivePill();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [measureActivePill]);

  const computeClosestIndex = useCallback(
    (candidateLeft: number, pillWidth: number): number => {
      const center = candidateLeft + pillWidth / 2;
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;

      items.forEach((item, idx) => {
        const btn = buttonRefs.current.get(item.id);
        if (!btn) return;
        const btnCenter = btn.offsetLeft + btn.offsetWidth / 2;
        const dist = Math.abs(center - btnCenter);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });

      return bestIdx;
    },
    [items],
  );

  const handleTrackPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const track = trackRef.current;
    if (!track) return;

    const activeIdx = Math.max(
      0,
      items.findIndex((i) => i.id === activeId),
    );
    const maxLeft = Math.max(4, track.clientWidth - pillRect.width - 4);

    dragMetaRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startLeft: pillRect.left,
      moved: false,
      lastIndex: activeIdx,
      pillWidth: pillRect.width,
      maxLeft,
    };
  };

  const handleTrackPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const meta = dragMetaRef.current;
    const track = trackRef.current;
    if (!meta || !track || meta.pointerId !== e.pointerId) return;

    const deltaX = e.clientX - meta.startX;
    if (!meta.moved && Math.abs(deltaX) > 6) {
      meta.moved = true;
      setIsDragging(true);
      window.getSelection()?.removeAllRanges();
      try {
        track.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture failures
      }
      haptics.trigger('tap');
    }

    if (!meta.moved) return;

    const clamped = applyRubberBand(meta.startLeft + deltaX, 4, meta.maxLeft);
    setDragLeft(clamped);

    const closestIdx = computeClosestIndex(clamped, meta.pillWidth);
    if (closestIdx !== meta.lastIndex) {
      meta.lastIndex = closestIdx;
      setHoveredIndex(closestIdx);
      haptics.trigger('tick');
    }
  };

  const finishDrag = (e: PointerEvent<HTMLDivElement>): void => {
    const meta = dragMetaRef.current;
    const track = trackRef.current;
    if (!meta || meta.pointerId !== e.pointerId) return;

    dragMetaRef.current = null;
    if (track?.hasPointerCapture(e.pointerId)) {
      try {
        track.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release errors
      }
    }

    if (meta.moved) {
      const targetItem = items[meta.lastIndex];
      setIsDragging(false);
      setDragLeft(null);
      setHoveredIndex(null);

      if (targetItem && targetItem.id !== activeId) {
        haptics.trigger('tabSnap');
        onSelect(targetItem.id);
      } else {
        haptics.trigger('tap');
      }
    }
  };

  const currentPillLeft = dragLeft ?? pillRect.left;

  return (
    <nav aria-label="Primary navigation" className="liquid-nav-shell">
      <div
        ref={trackRef}
        role="tablist"
        aria-label="Workspaces"
        className={
          isDragging
            ? 'liquid-nav-track liquid-nav-track--dragging'
            : 'liquid-nav-track'
        }
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handleTrackPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onMouseDown={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          aria-hidden="true"
          className={
            isDragging
              ? 'liquid-glass-pill liquid-glass-pill--dragging'
              : 'liquid-glass-pill'
          }
          style={{
            width: `${pillRect.width}px`,
            transform: isDragging
              ? `translate3d(${currentPillLeft}px, 0, 0) scale(1.04, 1.06)`
              : `translate3d(${currentPillLeft}px, 0, 0)`,
          }}
        />

        {items.map((item, idx) => {
          const isSelected = item.id === activeId;
          const isHighlighted =
            hoveredIndex !== null ? hoveredIndex === idx : isSelected;

          return (
            <button
              key={item.id}
              ref={(node) => {
                if (node) {
                  buttonRefs.current.set(item.id, node);
                } else {
                  buttonRefs.current.delete(item.id);
                }
              }}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={isSelected}
              className={
                isHighlighted
                  ? 'liquid-nav-btn liquid-nav-btn--active'
                  : 'liquid-nav-btn'
              }
              onClick={() => {
                if (item.id !== activeId) {
                  haptics.trigger('tabSnap');
                  onSelect(item.id);
                } else {
                  haptics.trigger('tap');
                }
              }}
            >
              <span className="liquid-nav-icon">
                {item.icon(isHighlighted)}
              </span>
              <span className="liquid-nav-label">{item.label}</span>
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span className="liquid-nav-count mono">{item.badge}</span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
