import { useState } from 'react';

export interface SearchablePickerItem {
  id: string;
  name: string;
  phone?: string;
  barcode?: string;
  category?: string;
  sublabel?: string;
  inactive?: boolean;
}

export interface SearchablePickerProps {
  label?: string;
  items: SearchablePickerItem[];
  selectedIds?: string[];
  onSelect: (id: string) => void;
  onRemove?: (id: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  multi?: boolean;
  singleRow?: boolean;
  defaultLimit?: number;
}

export function SearchablePicker({
  label,
  items,
  selectedIds = [],
  onSelect,
  onRemove,
  placeholder = 'Search…',
  emptyMessage = 'No items found.',
  disabled = false,
  multi = false,
  singleRow = false,
  defaultLimit = 8,
}: SearchablePickerProps) {
  const [query, setQuery] = useState('');

  const filteredItems = items.filter(item => {
    const searchValue = query.toLowerCase();
    if (!searchValue) return true;
    return [item.name, item.phone, item.barcode, item.category, item.sublabel]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(searchValue);
  });

  const visibleItems = filteredItems.slice(0, defaultLimit);
  const selectedSet = new Set(selectedIds);

  return (
    <div className="space-y-2">
      {label && <label className="text-sm font-medium">{label}</label>}
      <input
        type="text"
        value={query}
        onChange={event => setQuery(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none focus:border-primary"
      />

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items
            .filter(item => selectedSet.has(item.id))
            .map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => onRemove?.(item.id)}
                className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary"
              >
                {item.name}
                {multi ? ' ×' : ''}
              </button>
            ))}
        </div>
      )}

      <div className={`grid gap-2 ${singleRow ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        {visibleItems.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          visibleItems.map(item => {
            const isSelected = selectedSet.has(item.id);
            const disabledItem = item.inactive;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (disabledItem) return;
                  onSelect(item.id);
                }}
                disabled={disabled || disabledItem}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${isSelected ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/40'} ${disabledItem ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{item.name}</div>
                    {(item.sublabel || item.phone || item.category) && (
                      <div className="text-xs text-muted-foreground">
                        {item.sublabel ?? item.phone ?? item.category}
                      </div>
                    )}
                  </div>
                  {isSelected && <span className="text-xs font-semibold text-primary">Selected</span>}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
