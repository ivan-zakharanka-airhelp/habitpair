import { useEffect } from 'react';

interface ToastProps {
  message: string;
  duration?: number;
  onDone?: () => void;
}

export function Toast({ message, duration = 2600, onDone }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(timer);
  }, [duration, onDone]);

  return (
    <div className="toast" role="status">
      <span>{message}</span>
    </div>
  );
}
