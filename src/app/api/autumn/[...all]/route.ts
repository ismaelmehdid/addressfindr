import { autumnHandler } from 'autumn-js/next';
import { getCurrentUser } from '@/application/me/get-current-user';

// Endpoints the Autumn React hooks (useCustomer, PricingTable) call. The
// customer is the signed-in user — billing is per-user, not per-organization.
// Early access is required, same as every other /api/* identity path — see
// src/shared/api-route.ts — otherwise an unredeemed user could create an
// Autumn customer and start Stripe checkout before ever getting into the app.
export const { GET, POST } = autumnHandler({
  identify: async () => {
    const user = await getCurrentUser();
    if (user.isErr() || !user.value.hasRedeemedAccess) {
      return { customerId: undefined };
    }
    const fullName = `${user.value.firstName} ${user.value.lastName}`.trim();
    return {
      customerId: user.value.id,
      customerData: {
        name: fullName.length > 0 ? fullName : user.value.email,
        email: user.value.email,
      },
    };
  },
});
