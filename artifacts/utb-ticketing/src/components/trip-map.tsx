import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface TripMapProps {
  latitude: number;
  longitude: number;
  className?: string;
}

// A div icon avoids Leaflet's default marker images, which bundlers don't resolve
const busIcon = L.divIcon({
  className: "",
  html: `<div style="width:36px;height:36px;border-radius:9999px;background:hsl(var(--primary));border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:18px">🚌</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
});

/** OpenStreetMap map with a single bus marker that follows the given position. */
export function TripMap({ latitude, longitude, className }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current).setView([latitude, longitude], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    markerRef.current = L.marker([latitude, longitude], { icon: busIcon }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Created once; position changes are applied by the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    markerRef.current?.setLatLng([latitude, longitude]);
    mapRef.current?.panTo([latitude, longitude]);
  }, [latitude, longitude]);

  // relative z-0: keeps Leaflet's high z-index panes below the sticky navbar
  return <div ref={containerRef} className={`relative z-0 ${className ?? ""}`} />;
}
