import type { ReactNode } from "react";

/** Column definition for the shared manage resource table. */
export interface ResourceColumn<T> {
  /** Header label. */
  header: string;
  /** Cell renderer for one row. */
  cell: (row: T) => ReactNode;
}

/** Props for the reusable manage list table. */
export interface ResourceTableProps<T> {
  /** Accessible table caption. */
  caption: string;
  columns: ResourceColumn<T>[];
  rows: T[];
  /** Stable row id for React keys. */
  rowKey: (row: T) => string;
  /** Optional empty-state message when ``rows`` is empty. */
  emptyMessage?: string;
}

/**
 * Simple resource table shared by translation and versification manage pages.
 * Keeps list chrome consistent without a component-library dependency.
 */
export function ResourceTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  emptyMessage = "No items",
}: ResourceTableProps<T>) {
  if (rows.length === 0) {
    return <p className="muted">{emptyMessage}</p>;
  }
  return (
    <table className="resource-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.header} scope="col">
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((col) => (
              <td key={col.header}>{col.cell(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
