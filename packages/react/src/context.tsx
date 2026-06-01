import { createContext, useContext, type ReactNode } from "react";
import type { UnimapClient } from "@unimap/client";

const MapsContext = createContext<UnimapClient | null>(null);

export interface MapsProviderProps {
  client: UnimapClient;
  children: ReactNode;
}

/** Provides a UnimapClient (proxy-backed) to the hooks below. */
export function MapsProvider({ client, children }: MapsProviderProps): JSX.Element {
  return <MapsContext.Provider value={client}>{children}</MapsContext.Provider>;
}

export function useMapsClient(): UnimapClient {
  const client = useContext(MapsContext);
  if (!client) throw new Error("useMapsClient must be used within a <MapsProvider>");
  return client;
}
