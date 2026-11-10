import { Trash } from "@phosphor-icons/react/dist/ssr";
import { Button, Chips, Emoji, Field, Input } from "@/components/ui";
import { EmojiPicker } from "@/components/emoji-picker";
import { VISIBILITY_OPTIONS } from "../calendar/options";
import { addCategory, removeCategory, updateCategory } from "./actions";
import type { MealBasics, MealCategory } from "./data";

/** Adding or changing a kind of meal (Tacos, Meat & veggies): its name, picture and meal times. */
export function CategoryForm({ basics, category, returnTo }: { basics: MealBasics; category?: MealCategory; returnTo: string }) {
  return (
    <div className="flex flex-col gap-5">
      <form action={category ? updateCategory : addCategory} className="flex flex-col gap-5">
        <input type="hidden" name="returnTo" value={returnTo} />
        {category ? <input type="hidden" name="id" value={category.id} /> : null}
        <div className="flex items-end gap-4">
          <EmojiPicker initial={category?.icon ?? ""} nameField="name" />
          <Field label="Name">
            <Input name="name" defaultValue={category?.name} placeholder="Tacos" maxLength={40} required className="w-[28rem]" />
          </Field>
        </div>
        <Chips
          name="mealTimeIds"
          label="Which meal times? (none ticked means any)"
          multiple
          defaultValue={category?.meal_time_ids ?? []}
          options={basics.mealTimes.map((t) => ({ value: t.id, label: t.name, leading: <Emoji emoji={t.icon} className="size-7" /> }))}
        />
        <Chips name="visibility" label="Who can see it" defaultValue={category?.visibility ?? "everyone"} options={VISIBILITY_OPTIONS} />
        <Button className="self-start">{category ? "Save" : "Make category"}</Button>
      </form>
      {category ? (
        <form action={removeCategory} className="border-t border-frame pt-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="id" value={category.id} />
          <input type="hidden" name="name" value={category.name} />
          <Button variant="danger">
            <Trash size="1.375rem" aria-hidden />
            Remove {category.name} (keeps its meals)
          </Button>
        </form>
      ) : null}
    </div>
  );
}

