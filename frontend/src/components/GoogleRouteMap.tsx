import { useEffect, useRef, useState } from 'react';
import { MapPin, Route as RouteIcon } from 'lucide-react';
import { createGoogleMap, drawDrivingRoute } from '../lib/googleMaps';
import './googleRouteMap.css';

type MapStatus = 'loading' | 'ready' | 'missing-key' | 'error';
type MapHandle = Awaited<ReturnType<typeof createGoogleMap>>;
type RouteHandle = Awaited<ReturnType<typeof drawDrivingRoute>>;
const hasMapsApiKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim());

function formatRoute(distanceMeters?: number, durationMillis?: number) {
  const parts: string[] = [];
  if (distanceMeters !== undefined) parts.push(`${(distanceMeters / 1000).toFixed(1)} km`);
  if (durationMillis !== undefined) parts.push(`${Math.max(1, Math.round(durationMillis / 60000))} min`);
  return parts.join(' · ');
}

export default function GoogleRouteMap({ origin, destination, requestId, onRouteCalculated }: {
  origin: string;
  destination: string;
  requestId: number;
  onRouteCalculated?: (route: { distanceKm: number | null; durationMinutes: number | null } | null) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapHandleRef = useRef<MapHandle | null>(null);
  const routeHandleRef = useRef<RouteHandle | null>(null);
  const [status, setStatus] = useState<MapStatus>(hasMapsApiKey ? 'loading' : 'missing-key');
  const [routeBusy, setRouteBusy] = useState(false);
  const [message, setMessage] = useState('Add your Google Maps key to show the interactive map.');
  const [routeSummary, setRouteSummary] = useState('');
  const routeCalculatedRef = useRef(onRouteCalculated);

  useEffect(() => { routeCalculatedRef.current = onRouteCalculated; }, [onRouteCalculated]);

  useEffect(() => {
    if (!canvasRef.current || !hasMapsApiKey) return;
    let cancelled = false;
    void createGoogleMap(canvasRef.current).then(handle => {
      if (cancelled) return;
      mapHandleRef.current = handle;
      setStatus('ready');
      setMessage('Enter a pickup and destination above, then choose Find rides to draw the route.');
    }).catch(() => {
      if (cancelled) return;
      setStatus('error');
      setMessage('Google Maps could not load. Check your API key and enabled APIs.');
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!requestId || status !== 'ready' || !mapHandleRef.current) return;
    const start = origin.trim();
    const end = destination.trim();
    if (!start || !end) {
      setMessage('Enter both a pickup and destination to draw a route.');
      return;
    }

    let cancelled = false;
    const mapHandle = mapHandleRef.current;
    routeHandleRef.current?.polylines.forEach(line => line.setMap(null));
    routeHandleRef.current?.markers.forEach(marker => marker.setMap(null));
    routeHandleRef.current = null;
    setRouteBusy(true);
    setMessage('Finding a driving route…');
    setRouteSummary('');
    routeCalculatedRef.current?.(null);

    void drawDrivingRoute(mapHandle.google, mapHandle.map, mapHandle.library, start, end).then(route => {
      if (cancelled) {
        route.polylines.forEach(line => line.setMap(null));
        route.markers.forEach(marker => marker.setMap(null));
        return;
      }
      routeHandleRef.current = route;
      setRouteSummary(formatRoute(route.distanceMeters, route.durationMillis));
      setMessage('Driving route from pickup to destination.');
      routeCalculatedRef.current?.({
        distanceKm: route.distanceMeters === undefined ? null : route.distanceMeters / 1000,
        durationMinutes: route.durationMillis === undefined ? null : Math.max(1, Math.round(route.durationMillis / 60000)),
      });
    }).catch(() => {
      if (!cancelled) {
        routeCalculatedRef.current?.(null);
        setMessage('Could not find that route. Check Routes API is enabled, then try a clearer address.');
      }
    }).finally(() => {
      if (!cancelled) setRouteBusy(false);
    });

    return () => { cancelled = true; };
  }, [requestId, origin, destination, status]);

  useEffect(() => () => {
    routeHandleRef.current?.polylines.forEach(line => line.setMap(null));
    routeHandleRef.current?.markers.forEach(marker => marker.setMap(null));
  }, []);

  return <section className="google-map-card" aria-label="Google Maps route preview">
    <div className="google-map-heading">
      <div><span className="google-map-kicker"><MapPin size={13}/> ROUTE PREVIEW</span><h2>See your route</h2></div>
      {routeSummary&&<span className="google-route-summary"><RouteIcon size={14}/>{routeSummary}</span>}
    </div>
    <div className={`google-map-frame ${status==='ready'?'map-ready':''}`}>
      <div ref={canvasRef} className="google-map-canvas" />
      {status!=='ready'&&<div className="google-map-message">
        <div className="google-map-message-icon"><MapPin size={19}/></div>
        <b>{status==='loading'?'Loading Google Maps…':status==='missing-key'?'Add a Google Maps API key':'Map setup needed'}</b>
        <span>{status==='missing-key'?'Add VITE_GOOGLE_MAPS_API_KEY to your local .env file. Enable Maps JavaScript API and Routes API in Google Cloud.':message}</span>
      </div>}
      {status==='ready'&&<div className="google-map-status" role="status">{routeBusy?'Finding route…':message}</div>}
    </div>
    <div className="google-map-footnote">Route distance and travel time are estimates from Google Maps. Confirm the route before you travel.</div>
  </section>;
}
