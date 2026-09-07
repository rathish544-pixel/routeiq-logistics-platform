import React from "react";
import { TacticalButton } from "./TacticalButton";

export const LoadingState: React.FC<{ message?: string }> = ({ message = "STREAMING FLEET TELEMETRY..." }) => (
  <div className="flex flex-col items-center justify-center p-12 text-center">
    <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin mb-3"></div>
    <span className="font-mono-micro text-xs text-primary tracking-wider uppercase font-semibold">{message}</span>
  </div>
);

export const EmptyState: React.FC<{
  icon?: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({ icon = "inbox", title, description, actionLabel, onAction }) => (
  <div className="flex flex-col items-center justify-center p-12 text-center bg-surface-container-lowest/50 rounded-lg border border-outline-variant/20">
    <span className="material-symbols-outlined text-4xl text-outline mb-2">{icon}</span>
    <h4 className="font-headline-sm text-sm font-bold text-on-surface">{title}</h4>
    <p className="font-body-default text-xs text-outline max-w-sm mt-1 mb-4">{description}</p>
    {actionLabel && onAction && (
      <TacticalButton variant="primary" size="sm" onClick={onAction}>
        {actionLabel}
      </TacticalButton>
    )}
  </div>
);

export const ErrorState: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
}> = ({ title = "TELEMETRY COMMUNICATION FAILURE", message, onRetry }) => (
  <div className="p-space-1-5 rounded bg-error/10 border border-error/30 flex items-start justify-between gap-compact-sm">
    <div className="flex items-start gap-2">
      <span className="material-symbols-outlined text-error text-lg mt-0.5">error</span>
      <div>
        <h5 className="font-mono-micro text-xs text-error font-bold tracking-wider uppercase">{title}</h5>
        <p className="font-body-dense text-xs text-on-surface-variant mt-0.5">{message}</p>
      </div>
    </div>
    {onRetry && (
      <TacticalButton variant="danger" size="sm" icon="refresh" onClick={onRetry}>
        Retry
      </TacticalButton>
    )}
  </div>
);
