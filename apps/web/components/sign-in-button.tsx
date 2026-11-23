"use client";

import { authClient } from "@/lib/auth-client";

export const SignInButton = () => (
  <button
    type="button"
    className="button"
    onClick={() => {
      void authClient.signIn.social({ provider: "discord", callbackURL: "/room" });
    }}
  >
    Se connecter avec Discord
  </button>
);
