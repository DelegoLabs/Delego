"use client";

import { useEffect, useState } from "react";

export interface ExpiryCountdownProps {
  expiresAt?: string | Date | number | null;
}

export function ExpiryCountdown({ expiresAt }: ExpiryCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isExpired, setIsExpired] = useState<boolean>(false);

  useEffect(() => {
    if (!expiresAt) {
      return;
    }

    const target = new Date(expiresAt).getTime();

    const updateCountdown = () => {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        setIsExpired(true);
        setTimeLeft(0);
      } else {
        setIsExpired(false);
        setTimeLeft(diff);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  if (!expiresAt) {
    return null;
  }

  if (isExpired) {
    return (
      <span
        className="badge badge-expired text-red-500 font-bold"
        data-testid="expired-badge"
      >
        Expired
      </span>
    );
  }

  const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((timeLeft / 1000 / 60) % 60);
  const seconds = Math.floor((timeLeft / 1000) % 60);

  let colorClass = "text-green-500";
  // Warning colors
  if (days === 0 && hours < 24) {
    colorClass = "text-yellow-500";
  }
  if (days === 0 && hours === 0 && minutes < 60) {
    colorClass = "text-orange-500";
  }
  if (days === 0 && hours === 0 && minutes < 5) {
    colorClass = "text-red-500";
  }

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return (
    <span className={`countdown ${colorClass}`} data-testid="countdown-timer">
      {parts.join(" ")} remaining
    </span>
  );
}
