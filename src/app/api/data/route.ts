import { getData, errorResponse } from "@/lib/fpl";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await getData());
  } catch (error) {
    return errorResponse(error);
  }
}
