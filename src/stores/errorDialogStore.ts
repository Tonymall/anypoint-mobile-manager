import { create } from 'zustand';

export interface ErrorDialogPayload {
  title?: string;
  message: string;
  details?: string;
}

interface ErrorDialogState {
  visible: boolean;
  title: string;
  message: string;
  details?: string;
  showError: (payload: ErrorDialogPayload) => void;
  hideError: () => void;
}

export const useErrorDialogStore = create<ErrorDialogState>((set) => ({
  visible: false,
  title: 'Something went wrong',
  message: '',
  details: undefined,
  showError: ({ title, message, details }) =>
    set({
      visible: true,
      title: title || 'Something went wrong',
      message,
      details,
    }),
  hideError: () =>
    set({
      visible: false,
      title: 'Something went wrong',
      message: '',
      details: undefined,
    }),
}));
