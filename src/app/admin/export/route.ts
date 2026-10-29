import { getCurrentUser } from "@/lib/auth";
import { isPlatformAdmin, loadSignups, toCsv } from "@/lib/admin-data";

/** CSV downloads for the admin panel. Founding team only. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!isPlatformAdmin(user)) return new Response("Not found", { status: 404 });
  const list = new URL(req.url).searchParams.get("list");
  const { reviewers, waitlist, users } = await loadSignups();
  let csv: string;
  switch (list) {
    case "reviewers":
      csv = toCsv(["name", "email", "field", "institution", "career_stage", "orcid", "reviews_per_month", "applied_at"],
        reviewers.map((r) => [r.name, r.email, r.field, r.institution, r.careerStage, r.orcidId, r.reviewsPerMonth, r.createdAt]));
      break;
    case "partners":
      csv = toCsv(["email", "organization", "type", "requested_at"],
        waitlist.filter((w) => w.interest === "institutional").map((w) => [w.email, w.organization, w.partnerType, w.createdAt]));
      break;
    case "waitlist":
      csv = toCsv(["email", "joined_at"], waitlist.filter((w) => w.interest === "individual").map((w) => [w.email, w.createdAt]));
      break;
    case "accounts":
      csv = toCsv(["name", "handle", "email", "field", "joined_at"], users.map((u) => [u.displayName, u.handle, u.email, u.field, u.createdAt]));
      break;
    default:
      return new Response("Unknown list", { status: 400 });
  }
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lyncei-${list}-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
