"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearPublicProfileAccessToken, readPublicProfileAccessToken } from "@/lib/public-profile/browser-session";
import { requestPublicProfileApi } from "@/lib/public-profile/client";

type BootstrapResponse = {
  profileStatus: "incomplete" | "complete";
};

export default function HomeAuthRouter() {
  const router = useRouter();

  useEffect(() => {
    const accessToken = readPublicProfileAccessToken();
    if (!accessToken) return;

    requestPublicProfileApi<BootstrapResponse>("/api/public-profile/bootstrap", {
      method: "POST",
      accessToken,
    })
      .then((response) => {
        router.replace(response.profileStatus === "complete" ? "/dashboard" : "/onboarding");
      })
      .catch(() => {
        clearPublicProfileAccessToken();
      });
  }, [router]);

  return null;
}
