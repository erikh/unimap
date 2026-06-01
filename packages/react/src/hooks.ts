import { useEffect, useState } from "react";
import type {
  AutocompleteRequest,
  GeocodeQuery,
  GeocodeResult,
  Place,
  PlaceSearchRequest,
  RouteRequest,
  RouteResult,
  Suggestion,
} from "@unimap/core";
import { useMapsClient } from "./context";

export interface AsyncState<T> {
  data?: T;
  error?: Error;
  loading: boolean;
}

/** Generic "run when the request changes" hook. Pass `null` to stay idle. */
function useRequest<Req, Res>(
  request: Req | null,
  run: (request: Req) => Promise<Res>,
): AsyncState<Res> {
  const [state, setState] = useState<AsyncState<Res>>({ loading: false });
  const key = request ? JSON.stringify(request) : null;

  useEffect(() => {
    if (request == null) {
      setState({ loading: false });
      return;
    }
    let cancelled = false;
    setState({ loading: true });
    run(request).then(
      (data) => {
        if (!cancelled) setState({ data, loading: false });
      },
      (error: Error) => {
        if (!cancelled) setState({ error, loading: false });
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

export function useGeocode(query: GeocodeQuery | null): AsyncState<GeocodeResult[]> {
  const client = useMapsClient();
  return useRequest(query, (q) => client.geocode(q));
}

export function useRoute(request: RouteRequest | null): AsyncState<RouteResult> {
  const client = useMapsClient();
  return useRequest(request, (r) => client.route(r));
}

export function usePlacesSearch(request: PlaceSearchRequest | null): AsyncState<Place[]> {
  const client = useMapsClient();
  return useRequest(request, (r) => client.search(r));
}

export function useAutocomplete(request: AutocompleteRequest | null): AsyncState<Suggestion[]> {
  const client = useMapsClient();
  return useRequest(request, (r) => client.autocomplete(r));
}
