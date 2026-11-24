import { useCallback, useEffect } from 'react';

export interface UseModalDismissOptions {
  isOpen?: boolean;
  isDirty?: boolean;
  onClose: () => void;
  confirmMessage?: string;
  enableEsc?: boolean;
}

/**
 * Хук для стандартизированного управления закрытием модальных окон:
 * 1. Закрытие по нажатию клавиши Esc.
 * 2. Предупреждение о несохранённых изменениях (dirty check) перед закрытием.
 */
export function useModalDismiss({
  isOpen = true,
  isDirty = false,
  onClose,
  confirmMessage = 'В форме есть несохранённые изменения. Закрыть без сохранения?',
  enableEsc = true,
}: UseModalDismissOptions) {
  const handleRequestClose = useCallback(() => {
    if (isDirty) {
      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) return;
    }
    onClose();
  }, [isDirty, onClose, confirmMessage]);

  useEffect(() => {
    if (!isOpen || !enableEsc) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleRequestClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, enableEsc, handleRequestClose]);

  return { handleRequestClose };
}
