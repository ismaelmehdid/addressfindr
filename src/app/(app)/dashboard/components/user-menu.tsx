'use client';

import { LogOut, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authClient } from '@/shared/auth-client';
import { EditProfileDialog } from './edit-profile-dialog';

type Props = {
  firstName: string;
  lastName: string;
  email: string;
  image: string | null;
};

function getInitials(
  firstName: string,
  lastName: string,
  email: string,
): string {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

export function UserMenu({ firstName, lastName, email, image }: Props) {
  const t = useTranslations('Nav');
  const router = useRouter();
  const [isEditOpen, setIsEditOpen] = useState(false);

  const initials = getInitials(firstName, lastName, email);
  const displayName =
    firstName && lastName ? `${firstName} ${lastName}` : email;

  const handleSignOut = async (): Promise<void> => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = '/';
        },
      },
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label={displayName} />
          }
        >
          <Avatar className="size-6">
            {image ? <AvatarImage src={image} alt={displayName} /> : null}
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="w-60">
          <DropdownMenuItem
            onClick={() => setIsEditOpen(true)}
            className="flex items-center gap-2.5"
          >
            <Avatar className="size-7">
              {image ? <AvatarImage src={image} alt={displayName} /> : null}
              <AvatarFallback className="text-[10px]">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium">
                {displayName}
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {email}
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
            <Settings className="size-3.5" />
            {t('settings')}
            <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="size-3.5" />
            {t('signOut')}
            <DropdownMenuShortcut>⌘⇧Q</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditProfileDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        firstName={firstName}
        lastName={lastName}
        email={email}
        image={image}
      />
    </>
  );
}
