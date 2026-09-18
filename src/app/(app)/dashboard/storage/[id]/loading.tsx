import { Loader2 } from 'lucide-react';

export default function Loading(): React.ReactElement {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-stone px-4 py-2">
        <div className="size-7 animate-pulse rounded bg-mist" />
        <div className="h-5 w-56 animate-pulse rounded bg-mist" />
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
