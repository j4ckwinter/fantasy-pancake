import { importTeam } from "@/lib/fpl";
import { errorResponse } from "../error-response";
import { idSchema } from "../fpl-id";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const parsed = idSchema.safeParse(
    new URL(request.url).searchParams.get("id"),
  );
  if (!parsed.success)
    return Response.json(
      { error: "Enter a valid numeric FPL team ID." },
      { status: 400 },
    );
  try {
    return Response.json(await importTeam(parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
