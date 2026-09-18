import { FilesGridSkeleton } from './components/files-grid-skeleton';

export default function FilesLoading(): React.ReactElement {
  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
      <FilesGridSkeleton />
    </div>
  );
}
