import QuickHarvest from "@/components/QuickHarvest";

// Cosechar: scan one employee QR, set quantity, SAVE; Records shows today's saved records
export default function RegistrarCosecha() {
  return (
    <div data-testid="registrar-cosecha-page">
      <QuickHarvest />
    </div>
  );
}
