import { createAuthClient } from "better-auth/react";

// Same origin as the auth server, so no base URL is needed:
export const authClient = createAuthClient();
