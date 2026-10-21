import React, { useState, useEffect } from 'react';
import { Shield } from 'lucide-react';

interface ExamCountdownProps {
  onComplete: () => void;
}

export const ExamCountdown: React.FC<ExamCountdownProps> = ({ onComplete }) => {
  const [count, setCount] = useState(5);

  useEffect(() => {
    if (count === 0) {
      onComplete();
      return;
    }

    const timer = setTimeout(() => {
      setCount((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [count, onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary">
      <div className="text-center text-primary-foreground">
        <Shield className="w-16 h-16 mx-auto mb-6 animate-pulse" />
        <h2 className="text-2xl font-bold mb-2">Preparing Secure Exam Environment</h2>
        <p className="text-primary-foreground/80 mb-8">
          Please ensure your webcam and microphone are ready
        </p>
        <div className="relative">
          <div className="w-32 h-32 mx-auto rounded-full border-4 border-primary-foreground/30 flex items-center justify-center">
            <span className="text-6xl font-bold animate-scale-in" key={count}>
              {count}
            </span>
          </div>
        </div>
        <p className="mt-8 text-sm text-primary-foreground/60">
          • Fullscreen mode will be enabled<br />
          • Tab switching is not allowed<br />
          • All activities are being monitored
        </p>
      </div>
    </div>
  );
};
