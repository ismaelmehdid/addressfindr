import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium tracking-[-0.08px] whitespace-nowrap transition-[background-color,color,box-shadow,border-color,transform] duration-150 ease-out outline-none select-none focus-visible:ring-[3px] focus-visible:ring-charcoal/15 focus-visible:border-charcoal active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-charcoal text-primary-foreground shadow-raised hover:bg-charcoal-deep active:shadow-raised-active [a]:hover:bg-charcoal-deep',
        outline:
          'border-stone bg-paper text-ink shadow-sm hover:bg-mist hover:border-pebble active:shadow-xs aria-expanded:bg-mist aria-expanded:text-foreground',
        secondary:
          'bg-mist text-ink shadow-raised hover:bg-stone/60 active:shadow-raised-active aria-expanded:bg-mist aria-expanded:text-secondary-foreground',
        ghost:
          'text-graphite hover:bg-mist hover:text-ink aria-expanded:bg-mist aria-expanded:text-foreground',
        destructive:
          'bg-paper text-destructive border-destructive/30 shadow-sm hover:bg-destructive/10 active:shadow-xs',
        link: 'text-charcoal underline-offset-4 hover:underline hover:text-charcoal-deep',
      },
      size: {
        default:
          'h-7 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-7',
        'icon-xs':
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  loading = false,
  disabled,
  children,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & { loading?: boolean }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-loading={loading || undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="animate-spin" />}
      {loading && size?.startsWith('icon') ? null : children}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
