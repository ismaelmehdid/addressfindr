import 'server-only';

import { createTool } from '@mastra/core/tools';
import * as v from 'valibot';
import {
  HELP_ELEMENT_DESCRIPTIONS,
  HELP_ELEMENT_IDS,
  type HelpElementId,
} from '@/core/help/element-ids';
import { toolInput } from './tool-schema';

const InputSchema = v.object({
  elementId: v.pipe(
    v.picklist(HELP_ELEMENT_IDS),
    v.description(
      `The exact id of the UI element to highlight. Must be one of the known ids. Available:\n${HELP_ELEMENT_IDS.map(
        (id) => `- ${id}: ${HELP_ELEMENT_DESCRIPTIONS[id as HelpElementId]}`,
      ).join('\n')}`,
    ),
  ),
});

export const highlightUiElementTool = createTool({
  id: 'highlightUiElement',
  description:
    "Visually pulse a specific UI element in the app (~3s) and scroll it into view, to point the user to it. Use ONLY when the user asks how to do something and the action maps to a known elementId. Do NOT highlight just to repeat where a page is — link to it instead. Don't highlight more than one element per response.",
  inputSchema: toolInput(InputSchema),
  execute: async (input) => {
    return { highlighted: true, elementId: input.elementId };
  },
});
