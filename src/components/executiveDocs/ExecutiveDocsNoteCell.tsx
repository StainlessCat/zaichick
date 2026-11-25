import React, { useEffect, useRef, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { formatExecutiveNoteDate } from '../../utils/executiveDocsLogic';

export interface ExecutiveDocsNoteCellProps {
  noteText: string;
  noteUpdatedAt: string | null;
  disabled: boolean;
  onSave: (nextNote: string | null) => void;
}

export const ExecutiveDocsNoteCell: React.FC<ExecutiveDocsNoteCellProps> = ({
  noteText,
  noteUpdatedAt,
  disabled,
  onSave,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(noteText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setDraft(noteText);
    }
  }, [isEditing, noteText]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      const len = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(len, len);
    }
  }, [isEditing]);

  const formattedDate = formatExecutiveNoteDate(noteUpdatedAt);

  const handleConfirm = () => {
    const cleanNext = draft.trim();
    const cleanPrev = noteText.trim();
    setIsEditing(false);
    if (cleanNext !== cleanPrev) {
      onSave(cleanNext || null);
    }
  };

  const handleCancel = () => {
    setDraft(noteText);
    setIsEditing(false);
  };

  if (isEditing && !disabled) {
    return (
      <div className="space-y-1.5 py-0.5">
        <textarea
          ref={textareaRef}
          rows={2}
          maxLength={4000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              handleCancel();
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              handleConfirm();
            }
          }}
          placeholder="Введите примечание..."
          className="w-full px-2 py-1.5 bg-white border border-[#1e3799] focus:outline-none rounded text-xs text-slate-900 resize-y min-h-[54px]"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-400">
            Дата сохранится автоматически
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCancel}
              title="Отмена"
              className="h-6 px-2 inline-flex items-center gap-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-medium text-slate-600 cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Отмена</span>
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              title="Сохранить примечание"
              className="h-6 px-2 inline-flex items-center gap-1 rounded bg-[#1e3799] hover:bg-[#15276e] text-[11px] font-semibold text-white cursor-pointer"
            >
              <Check className="w-3 h-3" />
              <span>Сохранить</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (disabled) {
    return (
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span
          className="text-xs text-slate-700 whitespace-pre-wrap break-words min-w-0"
          title={noteText || undefined}
        >
          {noteText || <span className="text-slate-400">—</span>}
        </span>
        {noteText && formattedDate && (
          <span className="font-mono tabular-nums text-[10px] text-slate-400 shrink-0">
            {formattedDate}
          </span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsEditing(true)}
      title={
        noteText
          ? formattedDate
            ? `${noteText}\nОбновлено: ${formattedDate}`
            : noteText
          : 'Добавить примечание'
      }
      className="group w-full text-left px-1.5 py-1 -mx-1.5 rounded hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors cursor-pointer flex items-start justify-between gap-2 min-w-0"
    >
      <div className="min-w-0 flex-1">
        {noteText ? (
          <div className="text-xs text-slate-800 line-clamp-2 whitespace-pre-wrap break-words">
            {noteText}
          </div>
        ) : (
          <span className="text-xs text-slate-400 group-hover:text-slate-600">
            Добавить примечание
          </span>
        )}
        {noteText && formattedDate && (
          <div className="font-mono tabular-nums text-[10px] text-slate-400 mt-0.5">
            {formattedDate}
          </div>
        )}
      </div>
      <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 transition-opacity" />
    </button>
  );
};
