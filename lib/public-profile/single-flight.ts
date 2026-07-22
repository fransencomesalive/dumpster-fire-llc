export type SingleFlightState = {
  active: boolean;
};

export async function runSingleFlight<T>(
  state: SingleFlightState,
  operation: () => Promise<T>,
): Promise<{ started: boolean; value?: T }> {
  if (state.active) return { started: false };
  state.active = true;
  try {
    return { started: true, value: await operation() };
  } finally {
    state.active = false;
  }
}
