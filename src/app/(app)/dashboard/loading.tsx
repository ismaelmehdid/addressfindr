import { Loader2Icon } from 'lucide-react';

export default function DashboardLoading(): React.ReactElement {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
