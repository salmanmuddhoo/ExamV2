import { useState } from 'react';

interface ModalState {
  show: boolean;
  title: string;
  message: string;
  type: 'alert' | 'confirm' | 'success' | 'error' | 'warning';
  onConfirm?: () => void;
}

export function useModal() {
  const [modalState, setModalState] = useState<ModalState>({
    show: false,
    title: '',
    message: '',
    type: 'alert',
  });

  const showAlert = (message: string, title: string = 'Alert', type: 'alert' | 'success' | 'error' | 'warning' = 'alert') => {
    setModalState({
      show: true,
      title,
      message,
      type,
    });
  };

  const showConfirm = (message: string, onConfirm: () => void, title: string = 'Confirm') => {
    setModalState({
      show: true,
      title,
      message,
      type: 'confirm',
      onConfirm,
    });
  };

  const closeModal = () => {
    setModalState({
      show: false,
      title: '',
      message: '',
      type: 'alert',
    });
  };

  return {
    modalState,
    showAlert,
    showConfirm,
    closeModal,
  };
}
