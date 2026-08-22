import { redirect } from "next/navigation";

export default function CardCreatePage() {
  redirect("/app/card/edit?mode=create&new=1");
}
