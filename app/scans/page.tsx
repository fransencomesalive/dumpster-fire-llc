import { cookies } from "next/headers";
import DashboardClient from "./DashboardClient";
import LoginPanel from "./LoginPanel";
import { getJobSearchAuthState } from "./auth";
import { getActiveMatchingConfig, getDashboardState } from "./store";

export default async function JobSearchPage() {
  const authState = getJobSearchAuthState(await cookies());

  if (!authState.authenticated) {
    return <LoginPanel />;
  }

  const [dashboardState, activeMatching] = await Promise.all([
    getDashboardState(),
    getActiveMatchingConfig(),
  ]);

  return (
    <DashboardClient
      initialState={dashboardState}
      activeMatching={{
        source: activeMatching.source,
        rulesVersion: activeMatching.matchingConfig.rulesVersion,
      }}
    />
  );
}
