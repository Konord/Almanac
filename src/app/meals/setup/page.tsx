import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppFrame, LoadingOutline } from "@/components/ui";
import { requireHousehold } from "@/lib/household";

/**
 * Meal times used to be set here. They're meal blocks in the Routine
 * Manager now (Connor, 2026-11-11), so old links go there.
 */
export default function MealsSetupPage() {
  return (
    <AppFrame section="routines">
      <Suspense fallback={<LoadingOutline />}>
        <Forward />
      </Suspense>
    </AppFrame>
  );
}

async function Forward(): Promise<never> {
  await requireHousehold();
  redirect("/routines");
}
