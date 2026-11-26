import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, ChevronDownIcon } from './Icons.tsx';
import { haptics } from '../../lib/haptics.ts';

export interface GlassSelectOption {
  value: string;
  label: string;
  hint?: string;
}

interface GlassSelectProps {
  id: string;
  label: string;
  value: string;
  options: GlassSelectOption[];
  disabled?: boolean;
  onChange: (nextValue: string) => void;
}

export function GlassSelect({
  id,
  label,
  value,
  options,
  disabled = false,
  onChange,
}: GlassSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const [openAbove, setOpenAbove] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((o) => o.value === value)),
  );

  const selectedOption =
    options.find((opt) => opt.value === value) ?? options[0];

  const closeMenu = useCallback((returnFocus = false): void => {
    setIsOpen(false);
    if (returnFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  const updatePosition = useCallback((): void => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 10;
    const spaceAbove = rect.top - 10;
    const showAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(260, Math.max(120, showAbove ? spaceAbove : spaceBelow));
    const width = Math.min(320, Math.max(rect.width, 168));
    const left = Math.min(rect.left, window.innerWidth - width - 12);

    setOpenAbove(showAbove);
    setMenuStyle(
      showAbove
        ? {
            position: 'fixed',
            left: `${Math.max(12, left)}px`,
            bottom: `${window.innerHeight - rect.top + 6}px`,
            width: `${width}px`,
            maxHeight: `${maxHeight}px`,
          }
        : {
            position: 'fixed',
            left: `${Math.max(12, left)}px`,
            top: `${rect.bottom + 6}px`,
            width: `${width}px`,
            maxHeight: `${maxHeight}px`,
          },
    );
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsidePointer = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      closeMenu(false);
    };

    const handleEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeMenu(true);
      }
    };

    const handleReposition = (): void => updatePosition();

    document.addEventListener('pointerdown', handleOutsidePointer);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, closeMenu, updatePosition]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const activeEl = menuRef.current?.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, updatePosition]);

  const toggleOpen = (): void => {
    if (disabled) return;
    haptics.trigger('tap');
    setActiveIndex(
      Math.max(0, options.findIndex((o) => o.value === value)),
    );
    setIsOpen((prev) => !prev);
  };

  const commitOption = (nextVal: string): void => {
    if (nextVal !== value) {
      haptics.trigger('select');
      onChange(nextVal);
    } else {
      haptics.trigger('tap');
    }
    closeMenu(true);
  };

  const handleTriggerKeyDown = (
    e: KeyboardEvent<HTMLButtonElement>,
  ): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === ' ') {
      e.preventDefault();
      if (!isOpen) {
        toggleOpen();
      } else {
        const step = e.key === 'ArrowUp' ? -1 : 1;
        setActiveIndex((prev) => {
          const next = (prev + step + options.length) % options.length;
          haptics.trigger('tick');
          return next;
        });
      }
      return;
    }

    if (e.key === 'Enter' && isOpen) {
      e.preventDefault();
      const target = options[activeIndex];
      if (target) commitOption(target.value);
    }
  };

  const handleMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => {
        haptics.trigger('tick');
        return (prev + 1) % options.length;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => {
        haptics.trigger('tick');
        return (prev - 1 + options.length) % options.length;
      });
    } else if (e.key === 'Home') {
      e.preventDefault();
      haptics.trigger('tick');
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      haptics.trigger('tick');
      setActiveIndex(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const target = options[activeIndex];
      if (target) commitOption(target.value);
    }
  };

  return (
    <div
      ref={rootRef}
      className="glass-select"
      data-open={isOpen ? 'true' : 'false'}
    >
      <span id={`${id}-label`} className="field-label">
        {label}
      </span>

      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        className="glass-select-trigger"
        aria-labelledby={`${id}-label ${id}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        onClick={toggleOpen}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="glass-select-value">
          {selectedOption?.label ?? value}
        </span>
        <span className="glass-select-chevron">
          <ChevronDownIcon size={15} />
        </span>
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            style={menuStyle}
            aria-labelledby={`${id}-label`}
            aria-activedescendant={`${id}-opt-${activeIndex}`}
            className={
              openAbove
                ? 'glass-select-menu glass-select-menu--above'
                : 'glass-select-menu'
            }
            onKeyDown={handleMenuKeyDown}
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isActive = idx === activeIndex;

              return (
                <button
                  key={opt.value}
                  id={`${id}-opt-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-active={isActive ? 'true' : 'false'}
                  className="glass-select-option"
                  onMouseEnter={() => {
                    if (activeIndex !== idx) {
                      setActiveIndex(idx);
                      haptics.trigger('tick');
                    }
                  }}
                  onClick={() => commitOption(opt.value)}
                >
                  <span className="glass-select-option-text">
                    <span>{opt.label}</span>
                    {opt.hint && (
                      <span className="glass-select-option-hint">
                        {opt.hint}
                      </span>
                    )}
                  </span>

                  {isSelected && (
                    <span className="glass-select-check">
                      <CheckIcon size={14} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
