import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

/** One entry in a vertical tab list. */
export interface SideTab<T extends string> {
  /** Stable identity passed back to ``onSelect``. */
  id: T;
  /** Visible tab text, which is also its accessible name. */
  label: string;
}

/** Props for a vertical tab list beside its panel. */
export interface SideTabsProps<T extends string> {
  /** Tabs from top to bottom. */
  tabs: readonly SideTab<T>[];
  /** The tab whose panel is shown. */
  selected: T;
  /** Called with the tab the user chose by click or arrow key. */
  onSelect: (id: T) => void;
  /** Accessible name for the tab list. */
  label: string;
  /** Content of the selected tab. Only this panel is mounted. */
  children: ReactNode;
}

/**
 * Tabs stacked on the left edge with the selected panel to their right.
 * Use it where a narrow area must show one of several views close to the content above it.
 * Follows the ARIA tabs pattern: only the selected tab is in the tab order, and ArrowUp and
 * ArrowDown move the selection and focus, wrapping at either end. Other keys pass through.
 */
export function SideTabs<T extends string>({
  tabs,
  selected,
  onSelect,
  label,
  children,
}: SideTabsProps<T>) {
  const baseId = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const panelId = `${baseId}-panel`;
  const tabId = (id: T) => `${baseId}-tab-${id}`;
  /** Move the selection one tab up or down, and focus the tab that receives it. */
  const moveSelection = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    const current = tabs.findIndex((tab) => tab.id === selected);
    if (step === 0 || current < 0) {
      return;
    }
    event.preventDefault();
    const next = (current + step + tabs.length) % tabs.length;
    const tab = tabs[next];
    if (tab === undefined) {
      return;
    }
    onSelect(tab.id);
    buttons.current[next]?.focus();
  };
  return (
    <div className="dv-sidetabs">
      <div
        role="tablist"
        aria-orientation="vertical"
        aria-label={label}
        className="dv-sidetabs-list"
        onKeyDown={moveSelection}
      >
        {tabs.map((tab, position) => (
          <button
            key={tab.id}
            ref={(node) => {
              buttons.current[position] = node;
            }}
            type="button"
            role="tab"
            id={tabId(tab.id)}
            className="btn dv-sidetab"
            aria-selected={tab.id === selected}
            aria-controls={panelId}
            tabIndex={tab.id === selected ? 0 : -1}
            onClick={() => onSelect(tab.id)}
          >
            <span className="dv-sidetab-label">{tab.label}</span>
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(selected)}
        className="dv-sidetabs-panel"
      >
        {children}
      </div>
    </div>
  );
}
