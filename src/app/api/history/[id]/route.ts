import { getHistory, errorResponse, idSchema } from "@/lib/fpl";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const parsed = idSchema.safeParse((await params).id);
  if (!parsed.success)
    return Response.json({ error: "Invalid player ID." }, { status: 400 });
  try {
    return Response.json(await getHistory(parsed.data));
  } catch (error) {
    return errorResponse(error);
  }
}
