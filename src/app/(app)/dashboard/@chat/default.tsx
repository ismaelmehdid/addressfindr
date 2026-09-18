import { loadInitialChat } from '@/application/conversation/load-initial-chat';
import { DashboardChatPanelColumn } from '../components/chat/dashboard-chat-panel-column';

export default async function ChatSlotDefault(): Promise<React.ReactElement> {
  const initial = await loadInitialChat();
  return (
    <DashboardChatPanelColumn
      initialConversationId={initial.conversationId}
      initialMessages={initial.messages}
      initialHasMore={initial.hasMore}
      initialOldestCursor={initial.oldestCursor}
    />
  );
}
