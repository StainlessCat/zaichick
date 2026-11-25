import React, { useEffect, useId, useState } from 'react';
import { extractPersonSurname } from '../../utils/executiveDocsLogic';

export interface ExecutiveDocsSurnameCellProps {
  value: string;
  placeholder: string;
  suggestions: string[];
  disabled: boolean;
  onCommit: (nextValue: string | null) => void;
}

export const ExecutiveDocsSurnameCell: React.FC<ExecutiveDocsSurnameCellProps> = ({
  value,
  placeholder,
  suggestions,
  disabled,
  onCommit,
}) => {
  const [draft, setDraft] = useState(value);
  const listId = useId();

  useEffect(() => {
    setDraft(value);
  }, [value]);

  if (disabled) {
    return (
      <span className="block truncate text-xs text-slate-800">
        {value || <span className="text-slate-400">—</span>}
      </span>
    );
  }

  const commitIfChanged = (raw: string) => {
    const normalized = extractPersonSurname(raw);
    const cleanNext = normalized || raw.trim();
    if (cleanNext !== value.trim()) {
      setDraft(cleanNext);
      onCommit(cleanNext || null);
    } else if (draft !== value) {
      setDraft(value);
    }
  };

  return (
    <div className="w-full">
      <input
        type="text"
        list={suggestions.length > 0 ? listId : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitIfChanged(draft)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitIfChanged(draft);
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setDraft(value);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        className="w-full h-7 px-2 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#1e3799] focus:outline-none rounded text-xs text-slate-900 placeholder:text-slate-400 transition-colors"
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      )}
    </div>
  );
};
