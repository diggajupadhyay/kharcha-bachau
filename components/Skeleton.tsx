import React from 'react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-md bg-slate-200/80 ${className}`} aria-hidden="true" />
);

export const TransactionListSkeleton: React.FC = () => (
  <div className="space-y-1.5" aria-label="Loading transactions">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="bg-white p-3 md:p-4 rounded-xl border border-slate-200 flex items-center gap-3">
        <Skeleton className="w-10 h-10 md:w-12 md:h-12 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-4 w-16" />
      </div>
    ))}
  </div>
);

export default Skeleton;
