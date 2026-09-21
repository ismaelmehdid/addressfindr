import { autumnHandler } from 'autumn-js/next';
import { getCurrentUser } from '@/application/me/get-current-user';

// Endpoints the Autumn React hooks (useCustomer, PricingTable) call. The
// customer is the signed-in user — billing is per-user, not per-organization.
export const { GET, POST } = autumnHandler({
  identify: async () => {
    const user = await getCurrentUser();
    if (user.isErr()) {
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
