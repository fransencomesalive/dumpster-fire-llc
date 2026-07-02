"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearPublicProfileAccessToken, readPublicProfileAccessToken } from "@/lib/public-profile/browser-session";
import { requestPublicProfileApi } from "@/lib/public-profile/client";
import { syncPublicProfileSession } from "@/lib/public-auth/supabase-browser";

type BootstrapResponse = {
  profileStatus: "incomplete" | "complete";
};

export default function HomeAuthRouter() {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const accessToken = (await syncPublicProfileSession()) || readPublicProfileAccessToken();
      if (!accessToken) return;

      try {
        const response = await requestPublicProfileApi<BootstrapResponse>("/api/public-profile/bootstrap", {
          method: "POST",
          accessToken,
        });
        router.replace(response.profileStatus === "complete" ? "/dashboard" : "/onboarding");
      } catch {
        clearPublicProfileAccessToken();
      }
    })();
  }, [router]);

  return null;
}
