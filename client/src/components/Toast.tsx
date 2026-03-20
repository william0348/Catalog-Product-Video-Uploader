
import React from 'react';
import type { ToastMessage } from '@/types';

const Toast = ({ message, type, onDismiss }: { message: string, type: string, onDismiss: () => void }) => (
    <div className={`toast ${type}`}>
        <p>{message}</p>
        <button onClick={onDismiss} className="toast-dismiss-button">&times;</button>
    </div>
);

export const ToastContainer = ({ toasts, onDismiss }: { toasts: ToastMessage[], onDismiss: (id: number) => void }) => (
    <div className="toast-container">
        {toasts.map(toast => (
            <Toast key={toast.id} message={toast.message} type={toast.type} onDismiss={() => onDismiss(toast.id)} />
        ))}
    </div>
);
