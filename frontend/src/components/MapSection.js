import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { Link } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

const hospitalIcon = new L.Icon({
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const MapSection = ({ position, hospitals, locationLabel }) => {
  return (
    <div className="h-[420px] w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <MapContainer
        center={[position.lat, position.lon]}
        zoom={13}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <Marker position={[position.lat, position.lon]}>
          <Popup>{locationLabel || "Search location"}</Popup>
        </Marker>
        {hospitals.map((hospital) => {
          const [sourceType, sourceRecordId] =
            hospital.source?.name === "OpenStreetMap"
              ? (hospital.source.recordId || "").split("/")
              : [];
          const hospitalPath =
            sourceType && sourceRecordId
              ? `/hospitals/osm/${sourceType}/${sourceRecordId}`
              : `/hospitals/${hospital._id || hospital.hospitalId}`;
          return (
            <Marker
              key={hospital.hospitalId || hospital._id}
              position={[hospital.latitude, hospital.longitude]}
              icon={hospitalIcon}
            >
              <Popup>
                <strong>{hospital.hospitalName}</strong>
                <p>{hospital.address}</p>
                <Link to={hospitalPath} state={{ hospital }}>
                  View hospital listing
                </Link>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};

export default MapSection;
