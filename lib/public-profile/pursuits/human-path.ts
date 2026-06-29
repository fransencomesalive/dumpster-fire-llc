import type { HumanPathProvider } from "./types";

export const unavailableHumanPathProvider: HumanPathProvider = async () => ({
  status: "provider_unavailable",
  reason: "Human Path contact discovery provider has not been selected.",
});
