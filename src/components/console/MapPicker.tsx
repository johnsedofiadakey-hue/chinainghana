"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { GHANA_CENTER, type LatLng } from "@/lib/geo";

// A plain CSS pin avoids Leaflet's default marker images, which break under bundlers.
const pin = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#ff6b1a;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgb(11 27 63 / .35)"></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

function ClickToSet({ onChange }: { onChange: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) });
    },
  });
  return null;
}

/** Re-centres the map when the value changes from outside (GPS, pasted link). */
function FollowValue({ value }: { value: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (value) map.setView([value.lat, value.lng], Math.max(map.getZoom(), 15), { animate: true });
  }, [value, map]);
  return null;
}

export default function MapPicker({ value, onChange }: { value: LatLng | null; onChange: (p: LatLng) => void }) {
  const center = value ?? GHANA_CENTER;
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={value ? 15 : 6}
      scrollWheelZoom={false}
      className="w-full rounded-2xl ring-1 ring-inset ring-line"
      // Inline: leaflet.css is unlayered and would override Tailwind's height utility.
      style={{ height: 256, zIndex: 0 }}
    >
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickToSet onChange={onChange} />
      <FollowValue value={value} />
      {value && (
        <Marker
          position={[value.lat, value.lng]}
          icon={pin}
          draggable
          eventHandlers={{
            dragend(e) {
              const ll = (e.target as L.Marker).getLatLng();
              onChange({ lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) });
            },
          }}
        />
      )}
    </MapContainer>
  );
}
