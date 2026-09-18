import { Input as InputPrimitive } from '@base-ui/react/input';
import * as React from 'react';

import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-8 w-full min-w-0 rounded-lg border border-stone bg-paper px-2.5 py-1 text-sm tracking-[-0.08px] text-ink transition-[background-color,color,box-shadow,border-color] duration-150 ease-out outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-slate-neutral hover:border-pebble focus-visible:border-charcoal focus-visible:ring-[3px] focus-visible:ring-charcoal/15 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-mist disabled:text-slate-neutral disabled:opacity-100 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
