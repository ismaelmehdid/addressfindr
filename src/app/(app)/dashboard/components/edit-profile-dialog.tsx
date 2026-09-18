'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import posthog from 'posthog-js';
import { useState, useTransition } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/shared/auth-client';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function EditProfileDialog({
  open,
  onOpenChange,
  firstName,
  lastName,
  email,
  image,
}: Props) {
  const t = useTranslations('EditProfile');
  const router = useRouter();
  const [firstNameValue, setFirstNameValue] = useState(firstName);
  const [lastNameValue, setLastNameValue] = useState(lastName);
  const [isPending, startTransition] = useTransition();

  const initials = getInitials(firstName, lastName, email);
  const displayName =
    firstName && lastName ? `${firstName} ${lastName}` : email;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const trimmedFirst = firstNameValue.trim();
    const trimmedLast = lastNameValue.trim();
    if (trimmedFirst === firstName && trimmedLast === lastName) {
      onOpenChange(false);
      return;
    }
    startTransition(async () => {
      await authClient.updateUser({
        firstName: trimmedFirst,
        lastName: trimmedLast,
      });
      posthog.capture('profile_updated');
      router.refresh();
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-2">
            <Avatar className="size-16">
              {image ? <AvatarImage src={image} alt={displayName} /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <p className="text-xs text-muted-foreground">{t('avatarHint')}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="firstName">{t('firstName')}</Label>
            <Input
              id="firstName"
              name="firstName"
              value={firstNameValue}
              onChange={(e) => setFirstNameValue(e.target.value)}
              autoComplete="given-name"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="lastName">{t('lastName')}</Label>
            <Input
              id="lastName"
              name="lastName"
              value={lastNameValue}
              onChange={(e) => setLastNameValue(e.target.value)}
              autoComplete="family-name"
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" loading={isPending}>
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
