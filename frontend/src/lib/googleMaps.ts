type LatLng = { lat: () => number; lng: () => number };
type Bounds = { extend: (point: LatLng) => void };
type Polyline = {
  setMap: (map: MapInstance | null) => void;
  setOptions: (options: { strokeColor: string; strokeOpacity: number; strokeWeight: number }) => void;
  getPath: () => { getArray: () => LatLng[] };
};
type Marker = { setMap: (map: MapInstance | null) => void };
type Route = {
  distanceMeters?: number;
  durationMillis?: number;
  viewport?: Bounds;
  createPolylines: () => Polyline[];
};
type MapInstance = {
  fitBounds: (bounds: Bounds, padding?: number) => void;
};
type MapsNamespace = {
  maps: {
    importLibrary: (name: string) => Promise<unknown>;
  };
};
type MapsLibrary = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Marker: new (options: { map: MapInstance; position: LatLng; title: string }) => Marker;
  LatLngBounds: new () => Bounds;
};
type RoutesLibrary = {
  Route: {
    computeRoutes: (request: {
      origin: string;
      destination: string;
      travelMode: 'DRIVING';
      fields: string[];
    }) => Promise<{ routes?: Route[] }>;
  };
};

declare global {
  interface Window {
    google?: MapsNamespace;
    __vybeGoogleMapsReady?: () => void;
  }
}

let mapsPromise: Promise<MapsNamespace> | undefined;

export async function loadGoogleMaps(): Promise<MapsNamespace> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  if (!key) throw new Error('missing-key');
  if (window.google?.maps?.importLibrary) return window.google;
  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise<MapsNamespace>((resolve, reject) => {
    const script = document.createElement('script');
    const callbackName = '__vybeGoogleMapsReady';
    window[callbackName] = () => {
      if (window.google) resolve(window.google);
      else reject(new Error('Google Maps loaded without its API namespace.'));
      delete window[callbackName];
    };
    script.async = true;
    script.defer = true;
    script.dataset.vybeGoogleMaps = 'true';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=${callbackName}`;
    script.onerror = () => {
      delete window[callbackName];
      mapsPromise = undefined;
      reject(new Error('Google Maps could not load. Check the key and network connection.'));
    };
    document.head.appendChild(script);
  });

  return mapsPromise;
}

export async function createGoogleMap(element: HTMLElement): Promise<{ google: MapsNamespace; map: MapInstance; library: MapsLibrary }> {
  const google = await loadGoogleMaps();
  const library = await google.maps.importLibrary('maps') as MapsLibrary;
  const map = new library.Map(element, {
    center: { lat: 12.9716, lng: 77.5946 },
    zoom: 11,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    clickableIcons: false,
  });
  return { google, map, library };
}

export async function drawDrivingRoute(
  google: MapsNamespace,
  map: MapInstance,
  library: MapsLibrary,
  origin: string,
  destination: string,
): Promise<{ polylines: Polyline[]; markers: Marker[]; distanceMeters?: number; durationMillis?: number }> {
  const routesLibrary = await google.maps.importLibrary('routes') as RoutesLibrary;
  const result = await routesLibrary.Route.computeRoutes({
    origin,
    destination,
    travelMode: 'DRIVING',
    fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
  });
  const route = result.routes?.[0];
  if (!route) throw new Error('No driving route was found for those locations.');

  const polylines = route.createPolylines();
  const path = polylines[0]?.getPath().getArray() ?? [];
  for (const line of polylines) {
    line.setOptions({ strokeColor: '#246d52', strokeOpacity: 0.9, strokeWeight: 5 });
    line.setMap(map);
  }

  const markers: Marker[] = [];
  if (path.length) {
    markers.push(new library.Marker({ map, position: path[0], title: 'Pickup' }));
    markers.push(new library.Marker({ map, position: path[path.length - 1], title: 'Drop-off' }));
  }
  if (route.viewport) map.fitBounds(route.viewport, 48);
  else if (path.length) {
    const bounds = new library.LatLngBounds();
    path.forEach(point => bounds.extend(point));
    map.fitBounds(bounds, 48);
  }

  return { polylines, markers, distanceMeters: route.distanceMeters, durationMillis: route.durationMillis };
}
