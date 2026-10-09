import ScanHarvestMode from "@/components/ScanHarvestMode";

// Camera page. The single scan list lives in Cosecha (server data).
export default function RegistrarCosecha() {
  return (
    <div data-testid="registrar-cosecha-page">
      <ScanHarvestMode />
    </div>
  );
}
