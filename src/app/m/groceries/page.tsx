import { Suspense } from "react";
import { requireHousehold } from "@/lib/household";
import { loadGroceries } from "../../groceries/data";
import { PhoneLoading } from "../page";
import { PhoneGroceries } from "./view";

/** The grocery list on the phone, to take to the store. */
export default function PhoneGroceriesPage() {
  return (
    <Suspense fallback={<PhoneLoading />}>
      <Groceries />
    </Suspense>
  );
}

async function Groceries() {
  const household = await requireHousehold();
  // Reading the list also adds repeats that have come due (milk every week).
  const lines = await loadGroceries(household);
  return <PhoneGroceries initial={lines} />;
}
