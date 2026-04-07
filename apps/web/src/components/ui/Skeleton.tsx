import React from "react";
import { Card } from "./Card";

export function Skeleton({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse rounded-2xl bg-[var(--bg-subtle)] ${className}`} style={style} />;
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="grid gap-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{ width: `${100 - i * 15}%` }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <Card>
      <div className="p-2">
        <Skeleton className="mb-4 h-6 w-1/3" />
        <SkeletonText />
      </div>
    </Card>
  );
}
