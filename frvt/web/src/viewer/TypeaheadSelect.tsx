import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

/** One selectable row in a typeahead list. */
export interface TypeaheadOption {
  /** Stable value written on selection (never includes display-only suffixes). */
  value: string;
  /** Visible option text. */
  label: string;
}

/** Props for a filterable single-select combobox. */
export interface TypeaheadSelectProps {
  /** Currently selected option value. */
  value: string;
  /** Options in display order; filtering does not reorder matches. */
  options: TypeaheadOption[];
  /** Called with the bare option value when the user commits a choice. */
  onChange: (value: string) => void;
  /** Accessible name for the combobox input. */
  "aria-label": string;
  /** Optional description id (e.g. book jump legend). */
  "aria-describedby"?: string;
  /** When true, input is non-interactive and the list stays closed. */
  disabled?: boolean;
  /** Text shown when ``value`` is empty or unmatched. */
  placeholder?: string;
}

/**
 * Dependency-free searchable combobox for short option lists (BCV selectors).
 * Matches the query against both ``value`` and ``label`` (case-insensitive substring).
 */
export function TypeaheadSelect({
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  disabled = false,
  placeholder = "",
}: TypeaheadSelectProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Ignores the post-select click/focus that would otherwise reopen the list. */
  const suppressOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((option) => option.value === value) ?? null;
  const displayWhenClosed = selected?.label ?? placeholder;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return options;
    }
    return options.filter(
      (option) =>
        option.value.toLowerCase().includes(needle) ||
        option.label.toLowerCase().includes(needle),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
        setActiveIndex(0);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setActiveIndex((index) =>
      filtered.length === 0 ? 0 : Math.min(index, filtered.length - 1),
    );
  }, [filtered, open]);

  /** Close the list and restore the input to the committed selection label. */
  function closeAndReset() {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }

  /** Open the list and highlight the committed value for arrow-key continuation. */
  function openList() {
    if (disabled || suppressOpenRef.current) {
      return;
    }
    setQuery("");
    setActiveIndex(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    );
    setOpen(true);
  }

  /** Commit an option, notify the parent, and close without an immediate reopen. */
  function selectOption(option: TypeaheadOption) {
    suppressOpenRef.current = true;
    onChange(option.value);
    closeAndReset();
    inputRef.current?.blur();
    // Clear after the originating pointer/click cycle finishes.
    window.setTimeout(() => {
      suppressOpenRef.current = false;
    }, 0);
  }

  /** Keyboard navigation for the combobox and listbox. */
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (disabled) {
      return;
    }
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      event.preventDefault();
      openList();
      return;
    }
    if (!open) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        filtered.length === 0 ? 0 : (index + 1) % filtered.length,
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        filtered.length === 0 ? 0 : (index - 1 + filtered.length) % filtered.length,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[activeIndex];
      if (option) {
        selectOption(option);
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndReset();
    }
  }

  const activeOption = filtered[activeIndex];
  const activeId = activeOption ? `${listboxId}-opt-${activeIndex}` : undefined;

  useEffect(() => {
    if (!open || !activeId) {
      return;
    }
    document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [open, activeId]);

  return (
    <div className="typeahead-select" ref={rootRef}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={open ? activeId : undefined}
        data-value={value}
        disabled={disabled}
        placeholder={placeholder}
        value={open ? query : displayWhenClosed}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!open) {
            setOpen(true);
          }
          setActiveIndex(0);
        }}
        onFocus={() => openList()}
        onClick={() => {
          if (!open) {
            openList();
          }
        }}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <ul
          id={listboxId}
          className="typeahead-select-list"
          role="listbox"
          aria-label={ariaLabel}
        >
          {filtered.length === 0 ? (
            <li className="typeahead-select-empty" role="presentation">
              No matches
            </li>
          ) : (
            filtered.map((option, index) => {
              const selectedOption = option.value === value;
              const active = index === activeIndex;
              return (
                <li
                  key={`${option.value}\0${option.label}`}
                  id={`${listboxId}-opt-${index}`}
                  role="option"
                  data-value={option.value}
                  aria-selected={selectedOption}
                  className={
                    active
                      ? "typeahead-select-option is-active"
                      : "typeahead-select-option"
                  }
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => {
                    // Commit on mousedown so the list closes before click can hit the input.
                    event.preventDefault();
                    selectOption(option);
                  }}
                >
                  {option.label}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
