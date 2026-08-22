import { redirect } from "next/navigation";

export default function CardsCreatePage() {
  redirect("/app/card/edit?mode=create&new=1");
}
