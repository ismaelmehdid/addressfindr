import { autumnHandler } from 'autumn-js/next';
import { getCurrentUser } from '@/application/me/get-current-user';

// Endpoints the Autumn React hooks (useCustomer, PricingTable) call. The customer
// is the user's active ORGANIZATION — billing is per-workspace, not per-user.
export const { GET, POST } = autumnHandler({
  identify: async () => {
    const user = await getCurrentUser();
    if (user.isErr() || !user.value.organizationId) {
      return { customerId: undefined };
    }
    const fullName = `${user.value.firstName} ${user.value.lastName}`.trim();
    return {
      customerId: user.value.organizationId,
      customerData: {
        name: fullName.length > 0 ? fullName : user.value.email,
        email: user.value.email,
      },
    };
  },
});
