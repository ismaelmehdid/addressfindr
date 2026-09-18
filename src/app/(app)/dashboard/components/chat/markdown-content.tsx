'use client';

import Link from 'next/link';
import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

const COMPONENTS: Components = {
  p: ({ children, ...props }) => (
    <p {...props} className="my-1 first:mt-0 last:mb-0 leading-relaxed">
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul
      {...props}
      className="my-1 list-disc space-y-0.5 pl-5 first:mt-0 last:mb-0"
    >
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol
      {...props}
      className="my-1 list-decimal space-y-0.5 pl-5 first:mt-0 last:mb-0"
    >
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li {...props} className="leading-relaxed">
      {children}
    </li>
  ),
  strong: ({ children, ...props }) => (
    <strong {...props} className="font-semibold">
      {children}
    </strong>
  ),
  em: ({ children, ...props }) => (
    <em {...props} className="italic">
      {children}
    </em>
  ),
  a: ({ children, href, ...props }) => {
    const isInternal = typeof href === 'string' && href.startsWith('/');
    if (isInternal && href) {
      return (
        <Link
          href={href}
          className="underline underline-offset-2 hover:opacity-80"
        >
          {children}
        </Link>
      );
    }
    return (
      <a
        {...props}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:opacity-80"
      >
        {children}
      </a>
    );
  },
  code: ({ children, className: codeClassName, ...props }) => {
    const isBlock = codeClassName?.startsWith('language-');
    if (isBlock) {
      return (
        <code
          {...props}
          className={cn(
            'block overflow-x-auto rounded-md bg-black/5 p-2 text-[12px] font-mono',
            codeClassName,
          )}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        {...props}
        className="rounded bg-black/5 px-1 py-px text-[12px] font-mono"
      >
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }) => (
    <pre
      {...props}
      className="my-2 overflow-x-auto rounded-md bg-black/5 p-2 text-[12px] first:mt-0 last:mb-0"
    >
      {children}
    </pre>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      {...props}
      className="my-2 border-l-2 border-current/30 pl-3 italic first:mt-0 last:mb-0"
    >
      {children}
    </blockquote>
  ),
  h1: ({ children, ...props }) => (
    <h1
      {...props}
      className="mt-2 mb-1 text-base font-semibold first:mt-0 last:mb-0"
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2
      {...props}
      className="mt-2 mb-1 text-sm font-semibold first:mt-0 last:mb-0"
    >
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3
      {...props}
      className="mt-2 mb-1 text-sm font-semibold first:mt-0 last:mb-0"
    >
      {children}
    </h3>
  ),
  table: ({ children, ...props }) => (
    <div className="my-2 overflow-x-auto">
      <table
        {...props}
        className="w-full border-collapse text-[12px] first:mt-0 last:mb-0"
      >
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => (
    <th
      {...props}
      className="border-b border-current/20 px-2 py-1 text-left font-semibold"
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td {...props} className="border-b border-current/10 px-2 py-1">
      {children}
    </td>
  ),
  hr: () => <hr className="my-2 border-current/20" />,
};

export const MarkdownContent = memo(function MarkdownContent({
  text,
}: {
  text: string;
}) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
      {text}
    </ReactMarkdown>
  );
});
