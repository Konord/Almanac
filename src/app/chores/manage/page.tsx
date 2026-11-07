import { redirect } from "next/navigation";

/** The chore list now lives on the Chores screen itself. */
export default function ManageChoresPage() {
  redirect("/chores");
}
